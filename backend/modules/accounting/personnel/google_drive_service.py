import os
import json
import base64
import hashlib
import secrets
import logging
from typing import Optional, Tuple, Dict, Any, List
from datetime import datetime, timedelta

from django.conf import settings
from django.core import signing
from django.utils import timezone
from cryptography.fernet import Fernet

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
import httplib2
import google_auth_httplib2

logger = logging.getLogger(__name__)


from settings_core.google_drive_client import (
    SCOPES,
    encrypt_secret,
    decrypt_secret,
    get_http_client,
    create_base_oauth_flow,
    check_folder_exists as _check_folder_exists,
    find_or_create_folder as _find_or_create_folder,
    escape_gdrive_query_string as _escape_gdrive_query_string,
    verify_and_consume_oauth_state,
    classify_gdrive_error,
    revoke_google_token,
    transient_backoff_seconds,
)

# Memory cache for Google Drive folder IDs to minimize API calls
# Structure: {(company_id, parent_id, folder_name): folder_id}
_FOLDER_CACHE: Dict[Tuple[int, str, str], str] = {}
# Cache for root and archive folder IDs per company: {company_id: (root_id, archive_id, timestamp)}
_ROOT_ARCHIVE_CACHE: Dict[int, Tuple[str, str, float]] = {}


def invalidate_folder_cache(company_id: Optional[int] = None):
    """
    ابطال کش پوشه‌ها در صورت بروز خطای 404 یا حذف پوشه در درایو (GD-15)
    """
    global _FOLDER_CACHE, _ROOT_ARCHIVE_CACHE
    if company_id is None:
        _FOLDER_CACHE.clear()
        _ROOT_ARCHIVE_CACHE.clear()
        logger.info("[GDrive Service] Global folder cache cleared.")
    else:
        keys_to_remove = [k for k in _FOLDER_CACHE if k[0] == company_id]
        for k in keys_to_remove:
            _FOLDER_CACHE.pop(k, None)
        _ROOT_ARCHIVE_CACHE.pop(company_id, None)
        logger.info(f"[GDrive Service] Folder cache cleared for company #{company_id}.")



def create_oauth_flow(company_id: int) -> Flow:
    """Google OAuth 2.0 Flow (ساخت عمومی در هسته؛ PKCE خاموش و پراکسی خروجی)"""
    return create_base_oauth_flow()


def generate_company_auth_url(company_id: int, user=None, mode: str = 'popup') -> Tuple[str, str]:
    """
    Generate Google OAuth 2.0 authorization URL for a specific company (Phase 1 / GD-02).
    State is cryptographically signed and backed by an atomic single-use database nonce.
    """
    if mode not in ('popup', 'redirect'):
        mode = 'popup'

    nonce = secrets.token_urlsafe(32)
    now = timezone.now()
    expires_at = now + timedelta(seconds=600)

    from settings_core.models import GoogleOAuthState
    GoogleOAuthState.objects.create(
        nonce=nonce,
        user=user if (user and getattr(user, 'is_authenticated', False)) else None,
        target='company',
        company_id=company_id,
        mode=mode,
        expires_at=expires_at
    )

    payload = {
        'c': company_id,
        'u': getattr(user, 'id', None) if user else None,
        'n': nonce,
        'm': mode,
        't': 'company'
    }
    state = signing.dumps(payload, salt='gdrive-oauth')

    flow = create_oauth_flow(company_id)
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=state
    )
    return auth_url, state


def verify_oauth_state(state: str) -> Optional[int]:
    """Compatibility helper returning company_id if valid"""
    res = verify_and_consume_oauth_state(state)
    return res.get('c') if res else None


def exchange_code_and_store_credentials(code: str, company_id: int) -> Dict[str, Any]:
    """
    Exchange auth code for tokens and store in CompanyGoogleDriveConfig
    """
    from .models import Company, CompanyGoogleDriveConfig

    company = Company.objects.get(id=company_id)
    flow = create_oauth_flow(company_id)
    
    # Configure custom http client with proxy support for the exchange
    flow.fetch_token(code=code)
    credentials = flow.credentials

    refresh_token = credentials.refresh_token
    if not refresh_token:
        # If user had already authorized without revoking, refresh_token might be empty unless prompt='consent'
        logger.warning(f"No refresh_token returned for company {company.name}. Existing credentials might be active.")

    # Fetch user email using oauth2 userinfo
    account_email = None
    try:
        http_auth = google_auth_httplib2.AuthorizedHttp(credentials, http=get_http_client())
        userinfo_service = build('oauth2', 'v2', http=http_auth)
        user_info = userinfo_service.userinfo().get().execute()
        account_email = user_info.get('email')
    except Exception as exc:
        logger.warning(f"Could not retrieve Google account email: {exc}")

    config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)
    config.is_enabled = True
    config.auth_status = 'ok'
    if refresh_token:
        config.refresh_token = encrypt_secret(refresh_token)
    if account_email:
        config.account_email = account_email
    config.last_error = None
    config.save()

    # Automatically initialize root and archive folders in Google Drive
    try:
        drive_service = get_google_drive_service(company_id)
        if drive_service:
            ensure_company_drive_folders(company, drive_service)
    except Exception as exc:
        logger.error(f"Error ensuring drive folders for {company.name}: {exc}")
        config.last_error = f"اتصال برقرار شد اما ساخت پوشه ریشه با خطا مواجه شد: {str(exc)}"
        config.save(update_fields=['last_error'])

    return {
        "success": True,
        "company_id": company.id,
        "company_name": company.name,
        "account_email": config.account_email,
        "root_folder_name": config.root_folder_name,
    }


def get_google_drive_service(company_id: int):
    """
    Construct an authorized Google Drive API v3 service resource for a company
    """
    from .models import CompanyGoogleDriveConfig

    try:
        config = CompanyGoogleDriveConfig.objects.get(company_id=company_id)
    except CompanyGoogleDriveConfig.DoesNotExist:
        return None

    decrypted_token = decrypt_secret(config.refresh_token)
    if not decrypted_token:
        if config.refresh_token:
            config.auth_status = 'needs_reauth'
            config.last_error = "خطا در رمزگشایی کلید دسترسی گوگل؛ نیازمند اتصال مجدد است."
            config.save(update_fields=['auth_status', 'last_error', 'updated_at'])
        return None

    client_id = getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '')
    client_secret = getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', '')

    creds = Credentials(
        token=None,
        refresh_token=decrypted_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES
    )

    http_client = get_http_client()
    authorized_http = google_auth_httplib2.AuthorizedHttp(creds, http=http_client)
    service = build('drive', 'v3', http=authorized_http, cache_discovery=False)
    return service


def ensure_company_drive_folders(company, drive_service) -> Tuple[str, str]:
    """
    Ensure the company root folder and archive folder exist in Google Drive
    Returns (root_folder_id, archive_folder_id) with memory caching to avoid redundant queries (GD-15)
    """
    import time
    now_ts = time.time()
    cached = _ROOT_ARCHIVE_CACHE.get(company.id)
    if cached and (now_ts - cached[2]) < 300:
        return cached[0], cached[1]

    from .models import CompanyGoogleDriveConfig
    config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)
    root_folder_name = f"سامانه ابری شرکت {company.name}"
    
    # Check or create root folder
    root_id = config.root_folder_id
    if not root_id or not _check_folder_exists(drive_service, root_id):
        root_id = _find_or_create_folder(drive_service, parent_id='root', folder_name=root_folder_name)
        config.root_folder_id = root_id
        config.root_folder_name = root_folder_name

    # Check or create archive folder inside root
    archive_id = config.archive_folder_id
    archive_name = "بایگانی و اسناد حذف‌شده"
    if not archive_id or not _check_folder_exists(drive_service, archive_id):
        archive_id = _find_or_create_folder(drive_service, parent_id=root_id, folder_name=archive_name)
        config.archive_folder_id = archive_id

    config.save(update_fields=['root_folder_id', 'root_folder_name', 'archive_folder_id'])
    _ROOT_ARCHIVE_CACHE[company.id] = (root_id, archive_id, now_ts)
    return root_id, archive_id


def resolve_folder_hierarchy(company_id: int, drive_service, root_folder_id: str, relative_path: str) -> str:
    """
    Given a path like 'سامانه حسابداری و اداری/پروژه مرکزی/بخش تدارکات/۱۴۰۵',
    ensures all intermediate folders exist in Google Drive and returns the destination folder ID.
    Uses memory cache to avoid redundant API queries with 404 recovery (GD-15).
    """
    segments = [s.strip() for s in relative_path.replace('\\', '/').split('/') if s.strip()]
    current_parent_id = root_folder_id

    for seg in segments:
        cache_key = (company_id, current_parent_id, seg)
        if cache_key in _FOLDER_CACHE:
            current_parent_id = _FOLDER_CACHE[cache_key]
            continue

        try:
            folder_id = _find_or_create_folder(drive_service, parent_id=current_parent_id, folder_name=seg)
            _FOLDER_CACHE[cache_key] = folder_id
            current_parent_id = folder_id
        except HttpError as he:
            if getattr(getattr(he, 'resp', None), 'status', None) == 404:
                invalidate_folder_cache(company_id)
                folder_id = _find_or_create_folder(drive_service, parent_id=root_folder_id, folder_name=seg)
                _FOLDER_CACHE[(company_id, root_folder_id, seg)] = folder_id
                current_parent_id = folder_id
            else:
                raise

    return current_parent_id


def execute_company_scan_all(scan_task) -> bool:
    """
    اجرای ناهمگام پیمایش اسناد و مدارک پیشین شرکت با اولویت پایین و بدون مسدودسازی (GD-10)
    """
    from django.db.models import Q
    from django.apps import apps
    from .models import (
        GoogleDriveSyncQueue,
        CompanyDocument,
        CompanyBoardMember,
        ExpenseInvoice,
        PettyCashTransaction,
        PersonnelProfile,
        PersonnelDocument,
        VehicleDocument,
    )
    from .google_drive_path_resolver import GoogleDrivePathResolver, get_current_shamsi_year_str

    company = scan_task.company
    config = getattr(company, 'gdrive_config', None)
    if not config or not config.is_enabled or not config.refresh_token:
        scan_task.status = 'failed'
        scan_task.error_message = "سرویس گوگل‌درایو برای این شرکت فعال یا متصل نیست."
        scan_task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    enqueued_count = 0
    current_account = config.account_email or ''

    def _enqueue_or_reopen(model_name: str, object_id, field_name: str, source_path: str, target_folder: str, target_fname: str) -> bool:
        qs = GoogleDriveSyncQueue.objects.filter(
            company=company,
            model_name=model_name,
            object_id=object_id,
        ).filter(
            Q(field_name=field_name) | Q(field_name='')
        )
        if current_account:
            t = qs.filter(Q(drive_account=current_account) | Q(drive_account__isnull=True) | Q(drive_account='')).first()
        else:
            t = qs.filter(Q(drive_account__isnull=True) | Q(drive_account='')).first()

        if not t:
            GoogleDriveSyncQueue.objects.create(
                company=company,
                model_name=model_name,
                object_id=object_id,
                field_name=field_name,
                drive_account=current_account,
                source_file_path=source_path,
                target_folder_path=target_folder,
                target_filename=target_fname,
                status='pending',
                action='upload',
                priority=50  # اولویت پایین برای فایل‌های سوابق تاریخی (GD-10)
            )
            return True
        elif t.status == 'failed':
            t.status = 'pending'
            t.priority = 50
            t.retry_count = 0
            t.next_retry_at = None
            t.error_code = None
            t.error_message = None
            t.field_name = field_name
            t.drive_account = current_account
            t.source_file_path = source_path
            t.target_folder_path = target_folder
            t.target_filename = target_fname
            t.save(update_fields=['status', 'priority', 'retry_count', 'next_retry_at', 'error_code', 'error_message', 'field_name', 'drive_account', 'source_file_path', 'target_folder_path', 'target_filename', 'updated_at'])
            return True
        return False

    # ۱. اسناد رسمی و مرکزی شرکت و اسناد مالی
    if config.sync_accounting_docs:
        for ffield in ('articles_of_association', 'latest_gazette', 'logo'):
            fobj = getattr(company, ffield, None)
            if fobj and fobj.name:
                res = GoogleDrivePathResolver.resolve(company, field_name=ffield, file_obj=fobj)
                if res:
                    _, folder, fname = res
                    if _enqueue_or_reopen('Company', company.id, ffield, fobj.name, folder, fname):
                        enqueued_count += 1

        for doc in CompanyDocument.objects.filter(company=company, file__isnull=False).exclude(file='').iterator():
            res = GoogleDrivePathResolver.resolve(doc, field_name='file')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('CompanyDocument', doc.id, 'file', doc.file.name, folder, fname):
                    enqueued_count += 1

        for bm in CompanyBoardMember.objects.filter(company=company).iterator():
            for bfield in ('attached_id_doc', 'attached_appointment_doc'):
                bfobj = getattr(bm, bfield, None)
                if bfobj and bfobj.name:
                    res = GoogleDrivePathResolver.resolve(bm, field_name=bfield, file_obj=bfobj)
                    if res:
                        _, folder, fname = res
                        if _enqueue_or_reopen('CompanyBoardMember', bm.id, bfield, bfobj.name, folder, fname):
                            enqueued_count += 1

        for inv in ExpenseInvoice.objects.filter(section__project__company=company, attachment__isnull=False).exclude(attachment='').iterator():
            res = GoogleDrivePathResolver.resolve(inv, field_name='attachment')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('ExpenseInvoice', inv.id, 'attachment', inv.attachment.name, folder, fname):
                    enqueued_count += 1

        for tx in PettyCashTransaction.objects.filter(
            Q(section__project__company=company) | Q(account__section__project__company=company),
            attachment__isnull=False
        ).exclude(attachment='').distinct().iterator():
            res = GoogleDrivePathResolver.resolve(tx, field_name='attachment')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('PettyCashTransaction', tx.id, 'attachment', tx.attachment.name, folder, fname):
                    enqueued_count += 1

    # ۲. مدارک پرسنلی
    if config.sync_personnel_docs:
        for p in PersonnelProfile.objects.filter(company=company, attachment__isnull=False).exclude(attachment='').iterator():
            res = GoogleDrivePathResolver.resolve(p, field_name='attachment')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('PersonnelProfile', p.id, 'attachment', p.attachment.name, folder, fname):
                    enqueued_count += 1

        for pdoc in PersonnelDocument.objects.filter(personnel__company=company, file__isnull=False).exclude(file='').iterator():
            res = GoogleDrivePathResolver.resolve(pdoc, field_name='file')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('PersonnelDocument', pdoc.id, 'file', pdoc.file.name, folder, fname):
                    enqueued_count += 1

    # ۳. مدارک ناوگان
    if config.sync_fleet_docs:
        for vdoc in VehicleDocument.objects.filter(vehicle__company=company, file__isnull=False).exclude(file='').iterator():
            res = GoogleDrivePathResolver.resolve(vdoc, field_name='file')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('VehicleDocument', vdoc.id, 'file', vdoc.file.name, folder, fname):
                    enqueued_count += 1

    # ۴. فایل‌های ماژول‌های دیگر (مثل تصاویر کالا) از منبع‌های ثبت‌شده در رجیستری پلتفرم
    from platform_core.registry import contributions
    for source in contributions('file_sync_sources'):
        if not getattr(config, source.get('config_flag', ''), False):
            continue
        for inst, f_name, f_obj in source['iter_company_files'](company):
            res = GoogleDrivePathResolver.resolve(inst, field_name=f_name)
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen(source['model_name'], inst.id, f_name, f_obj.name, folder, fname):
                    enqueued_count += 1

    # ۵. نسخه‌های پشتیبان دیتابیس
    if config.sync_backups:
        try:
            import os
            from accounts.backup_service import get_backup_list, BACKUP_DIR
            shamsi_year = get_current_shamsi_year_str()
            existing_backups = get_backup_list()
            for b in existing_backups[:10]:
                fname = b.get('filename')
                if not fname:
                    continue
                full_backup_path = os.path.join(BACKUP_DIR, fname)
                if not os.path.exists(full_backup_path):
                    continue
                target_folder = f"پشتیبان‌های پایگاه داده/{shamsi_year}"
                if _enqueue_or_reopen('DatabaseBackup', None, 'backup', full_backup_path, target_folder, fname):
                    enqueued_count += 1
        except Exception as b_exc:
            logger.warning(f"Error scanning existing database backups for scan_all: {b_exc}")

    scan_task.status = 'completed'
    scan_task.completed_at = timezone.now()
    scan_task.error_message = f"پیمایش با موفقیت انجام شد ({enqueued_count} فایل در صف قرار گرفت یا به‌روز شد)."
    scan_task.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])
    return True


def sync_single_queue_item(task_id: int) -> bool:
    """
    پردازش تک وظیفه صف گوگل‌درایو با تصاحب اتمیک، دسته‌بندی پیشرفته خطا و تکرار مقاوم (GD-06 تا GD-11)
    """
    from datetime import timedelta
    from .models import GoogleDriveSyncQueue

    # ۱. تصاحب اتمیک تسک (GD-06)
    acquired = GoogleDriveSyncQueue.objects.filter(
        id=task_id,
        status='pending'
    ).update(status='processing', updated_at=timezone.now())

    if acquired == 0:
        logger.debug(f"[GDrive Queue] Task #{task_id} could not be acquired (already processing or not pending).")
        return False

    task = GoogleDriveSyncQueue.objects.select_related('company', 'company__gdrive_config').filter(id=task_id).first()
    if not task:
        return False

    company = task.company
    config = getattr(company, 'gdrive_config', None)
    if not config or not config.is_enabled or not config.refresh_token:
        # تسک آزاد می‌شود و در صف می‌ماند تا پس از اتصال یا فعال‌سازی دوباره ارسال شود.
        task.status = 'pending'
        task.error_message = "سرویس گوگل‌درایو برای این شرکت فعال یا متصل نیست."
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    # ۲. بررسی تسک از نوع پیمایش سراسری (GD-10)
    if task.action == 'scan_all':
        return execute_company_scan_all(task)

    drive_service = get_google_drive_service(company.id)
    if not drive_service:
        config.auth_status = 'needs_reauth'
        config.last_error = "امکان ساخت کلاینت گوگل‌درایو برای این شرکت وجود ندارد؛ نیازمند اتصال مجدد است."
        config.save(update_fields=['auth_status', 'last_error', 'updated_at'])

        task.status = 'pending'
        task.error_message = config.last_error
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    try:
        root_id, archive_id = ensure_company_drive_folders(company, drive_service)

        if task.action == 'archive_delete':
            # انتقال فایل حذف‌شده به پوشه بایگانی سالانه
            if task.gdrive_file_id:
                try:
                    from .google_drive_path_resolver import get_current_shamsi_year_str
                    shamsi_year = get_current_shamsi_year_str()
                    dest_archive_folder_id = resolve_folder_hierarchy(
                        company_id=company.id,
                        drive_service=drive_service,
                        root_folder_id=archive_id,
                        relative_path=shamsi_year
                    )

                    file_info = drive_service.files().get(fileId=task.gdrive_file_id, fields='parents').execute()
                    previous_parents = ",".join(file_info.get('parents', []))
                    drive_service.files().update(
                        fileId=task.gdrive_file_id,
                        addParents=dest_archive_folder_id,
                        removeParents=previous_parents,
                        fields='id, parents'
                    ).execute()
                    task.status = 'completed'
                    task.completed_at = timezone.now()
                    task.error_message = None
                    task.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])
                    return True
                except HttpError as he:
                    if getattr(getattr(he, 'resp', None), 'status', None) == 404:
                        task.status = 'completed'
                        task.completed_at = timezone.now()
                        task.error_message = "فایل در درایو یافت نشد (احتمالاً قبلاً حذف شده)."
                        task.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])
                        return True
                    raise
            else:
                task.status = 'completed'
                task.completed_at = timezone.now()
                task.error_message = "فایل در گوگل‌درایو بارگذاری نشده بود (فاقد شناسه فایل)."
                task.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])
                return True

        elif task.action == 'upload':
            abs_local_path = task.source_file_path
            clean_rel = abs_local_path.lstrip('/\\')
            if clean_rel.lower().startswith('media/') or clean_rel.lower().startswith('media\\'):
                clean_rel = clean_rel[6:]

            in_media = os.path.join(settings.MEDIA_ROOT, clean_rel)
            in_media_raw = os.path.join(settings.MEDIA_ROOT, abs_local_path)
            in_base = os.path.join(settings.BASE_DIR, clean_rel)
            from accounts.backup_service import get_backup_dir
            in_db_backups = os.path.join(get_backup_dir(), os.path.basename(abs_local_path))
            in_backups = os.path.join(settings.BASE_DIR, 'accounts', 'backups', os.path.basename(abs_local_path))

            if os.path.exists(abs_local_path) and os.path.isfile(abs_local_path):
                pass
            elif os.path.exists(in_media) and os.path.isfile(in_media):
                abs_local_path = in_media
            elif os.path.exists(in_media_raw) and os.path.isfile(in_media_raw):
                abs_local_path = in_media_raw
            elif os.path.exists(in_base) and os.path.isfile(in_base):
                abs_local_path = in_base
            elif os.path.exists(in_db_backups) and os.path.isfile(in_db_backups):
                abs_local_path = in_db_backups
            elif os.path.exists(in_backups) and os.path.isfile(in_backups):
                abs_local_path = in_backups

            if not os.path.exists(abs_local_path):
                task.status = 'failed'
                task.error_code = 'file_not_found'
                task.error_message = f"فایل مبدأ در سرور یافت نشد: {task.source_file_path}"
                task.save(update_fields=['status', 'error_code', 'error_message', 'updated_at'])
                return False

            # محاسبه هش امنیتی SHA-256 و MD5 همزمان در همان حلقه تکه‌ای ۶۴ کیلوبایتی (GD-14)
            hasher_sha256 = hashlib.sha256()
            hasher_md5 = hashlib.md5()
            with open(abs_local_path, 'rb') as f:
                while chunk := f.read(65536):
                    hasher_sha256.update(chunk)
                    hasher_md5.update(chunk)
            task.file_sha256 = hasher_sha256.hexdigest()
            local_md5 = hasher_md5.hexdigest()

            # مسیر پوشه مقصد در گوگل‌درایو
            dest_folder_id = resolve_folder_hierarchy(
                company_id=company.id,
                drive_service=drive_service,
                root_folder_id=root_id,
                relative_path=task.target_folder_path
            )

            file_metadata = {
                'name': task.target_filename,
                'parents': [dest_folder_id]
            }

            def _new_media():
                return MediaFileUpload(
                    abs_local_path,
                    resumable=True,
                    chunksize=1024 * 1024 * 5  # قطعات ۵ مگابایتی
                )

            def _run_upload(req):
                result = None
                while result is None:
                    _, result = req.next_chunk(num_retries=3)
                return result

            # به‌روزرسانی فقط با شناسه گوگل‌درایو از رکورد قبلی همان کلید انجام می‌شود (حذف جستجوی هم‌نام GD-12)
            existing_id = task.gdrive_file_id
            if not existing_id and task.object_id and task.field_name:
                prev_completed = GoogleDriveSyncQueue.objects.filter(
                    company=company,
                    model_name=task.model_name,
                    object_id=task.object_id,
                    field_name=task.field_name,
                    drive_account=task.drive_account,
                    source_file_path=task.source_file_path,
                    status='completed',
                    gdrive_file_id__isnull=False
                ).exclude(id=task.id).order_by('-completed_at').first()
                if prev_completed and prev_completed.gdrive_file_id:
                    existing_id = prev_completed.gdrive_file_id

            uploaded = None
            if existing_id:
                try:
                    uploaded = _run_upload(drive_service.files().update(
                        fileId=existing_id,
                        media_body=_new_media(),
                        fields='id, md5Checksum'
                    ))
                except HttpError as he:
                    # خطای 404 فقط هنگام ارسال (next_chunk) بالا می‌آید: فایل در درایو حذف شده،
                    # پس فایل تازه ساخته می‌شود به‌جای تکرار بی‌پایان به‌روزرسانی.
                    if getattr(getattr(he, 'resp', None), 'status', None) != 404:
                        raise
                    logger.warning(f"[GDrive Sync] File {existing_id} for task #{task.id} not found in Drive; uploading as new file.")
                    task.gdrive_file_id = None
            if uploaded is None:
                uploaded = _run_upload(drive_service.files().create(
                    body=file_metadata,
                    media_body=_new_media(),
                    fields='id, md5Checksum'
                ))

            # مقایسه md5Checksum گوگل با MD5 محلی (GD-14)
            gdrive_md5 = uploaded.get('md5Checksum')
            if gdrive_md5 and local_md5 and gdrive_md5.lower() != local_md5.lower():
                logger.error(f"[GDrive Sync] MD5 mismatch for task #{task.id}! Local: {local_md5}, Drive: {gdrive_md5}")
                task.status = 'failed'
                task.error_code = 'CHECKSUM_MISMATCH'
                task.error_message = f"عدم تطابق هش فایل با گوگل درایو (محلی: {local_md5}، درایو: {gdrive_md5})"
                task.save(update_fields=['status', 'error_code', 'error_message', 'updated_at'])
                return False

            task.gdrive_file_id = uploaded.get('id')
            task.status = 'completed'
            task.completed_at = timezone.now()
            task.error_code = None
            task.error_message = None
            task.save(update_fields=['gdrive_file_id', 'status', 'completed_at', 'error_code', 'error_message', 'updated_at'])

            config.last_sync_at = timezone.now()
            config.auth_status = 'ok'
            config.save(update_fields=['last_sync_at', 'auth_status', 'updated_at'])
            return True

    except Exception as exc:
        logger.error(f"Error processing GDrive task #{task_id}: {exc}", exc_info=True)
        err_info = classify_gdrive_error(exc)
        category = err_info['category']
        user_msg = err_info['user_message']
        reason_code = err_info.get('reason') or 'unknown_error'

        # اگر خطای 404 در ارتباط با پوشه‌ها رخ داده، کش پوشه این شرکت باطل شود (GD-15)
        if isinstance(exc, HttpError) and getattr(getattr(exc, 'resp', None), 'status', None) == 404:
            invalidate_folder_cache(company.id)

        task.error_code = reason_code

        if category == 'needs_reauth':
            config.auth_status = 'needs_reauth'
            config.last_error = user_msg
            config.save(update_fields=['auth_status', 'last_error', 'updated_at'])

            task.status = 'pending'
            task.error_message = user_msg
            task.save(update_fields=['status', 'error_code', 'error_message', 'updated_at'])
            return False

        elif category == 'transient':
            # خطای گذرا هیچ‌وقت تسک را failed نمی‌کند؛ با تأخیر نمایی (سقف یک ساعت) دوباره تلاش می‌شود.
            task.retry_count += 1
            backoff_secs = transient_backoff_seconds(task.retry_count)
            task.next_retry_at = timezone.now() + timedelta(seconds=backoff_secs)
            task.status = 'pending'
            task.error_message = f"{user_msg} (تلاش مجدد در {backoff_secs} ثانیه)"
            task.save(update_fields=['retry_count', 'next_retry_at', 'status', 'error_code', 'error_message', 'updated_at'])

            # ثبت خطای سطح ارتباط فقط در صورت خطای کلی شبکه یا سرور (GD-20)
            if 'network' in reason_code or 'http_5' in reason_code:
                config.last_error = f"خطای موقت در ارتباط با سرور گوگل: {user_msg}"
                config.save(update_fields=['last_error', 'updated_at'])
            return False

        else:  # permanent
            task.status = 'failed'
            task.retry_count += 1
            task.error_message = user_msg
            task.save(update_fields=['status', 'retry_count', 'error_code', 'error_message', 'updated_at'])

            # ثبت خطای سیستمی فقط برای خطاهای سطح فضای دیسک یا عدم دسترسی کلی درایو (GD-20)
            if reason_code in ('storageQuotaExceeded', 'insufficientPermissions'):
                config.last_error = f"خطای دسترسی یا سهمیه گوگل‌درایو: {user_msg}"
                config.save(update_fields=['last_error', 'updated_at'])
            return False

    return False
