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
)

# Memory cache for Google Drive folder IDs to minimize API calls
# Structure: {(company_id, parent_id, folder_name): folder_id}
_FOLDER_CACHE: Dict[Tuple[int, str, str], str] = {}



def create_oauth_flow(company_id: int) -> Flow:
    """Create Google OAuth 2.0 Flow with company state signature"""
    client_id = getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '')
    client_secret = getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', '')
    redirect_uri = getattr(settings, 'GOOGLE_OAUTH_REDIRECT_URI', '')

    if not client_id or not client_secret:
        raise ValueError("شناسه و کلید برنامه گوگل (GOOGLE_OAUTH_CLIENT_ID / SECRET) در تنظیمات سرور ثبت نشده است.")

    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    # Confidential Web applications with client_secret do not require PKCE.
    # Disabling autogenerate_code_verifier ensures no code_challenge is sent in auth URL.
    flow.autogenerate_code_verifier = False
    flow.code_verifier = None

    proxy_url = getattr(settings, 'OUTBOUND_HTTP_PROXY', '') or os.getenv('OUTBOUND_HTTP_PROXY', '')
    if proxy_url and hasattr(flow, 'session') and flow.session:
        flow.session.proxies = {
            'http': proxy_url,
            'https': proxy_url,
        }

    return flow


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


def verify_and_consume_oauth_state(state: str) -> Optional[Dict[str, Any]]:
    """
    Atomically verify and consume signed OAuth state (GD-02).
    Returns payload dictionary {'c': company_id, 'u': user_id, 'n': nonce, 'm': mode, 't': target} if valid.
    """
    if not state:
        return None

    try:
        payload = signing.loads(state, salt='gdrive-oauth', max_age=600)
    except (signing.BadSignature, signing.SignatureExpired) as exc:
        logger.warning(f"[GDrive OAuth] Invalid or expired signature: {exc}")
        return None

    if not isinstance(payload, dict):
        return None

    nonce = payload.get('n')
    if not nonce:
        return None

    from settings_core.models import GoogleOAuthState
    now = timezone.now()

    # Atomic consumption: UPDATE ... SET used_at=now WHERE nonce=? AND used_at IS NULL AND expires_at > now
    updated = GoogleOAuthState.objects.filter(
        nonce=nonce,
        used_at__isnull=True,
        expires_at__gt=now
    ).update(used_at=now)

    if updated == 0:
        logger.warning(f"[GDrive OAuth] Nonce {nonce[:8]}... was already used, expired, or not found.")
        return None

    # Invalidate other pending states for this company/target
    target = payload.get('t', 'company')
    company_id = payload.get('c')
    if target == 'company' and company_id:
        GoogleOAuthState.objects.filter(
            target='company',
            company_id=company_id,
            used_at__isnull=True
        ).exclude(nonce=nonce).update(used_at=now)

    return payload


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
    Returns (root_folder_id, archive_folder_id)
    """
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
    return root_id, archive_id


def _escape_gdrive_query_string(val: str) -> str:
    """Escape single quotes and backslashes for Google Drive API query strings"""
    return val.replace('\\', '\\\\').replace("'", r"\'")


def _check_folder_exists(drive_service, folder_id: str) -> bool:
    """Verify if a folder exists and is not trashed"""
    try:
        res = drive_service.files().get(fileId=folder_id, fields='id, trashed').execute()
        return not res.get('trashed', False)
    except Exception:
        return False


def _find_or_create_folder(drive_service, parent_id: str, folder_name: str) -> str:
    """Find existing folder or create new one in Google Drive"""
    safe_name = _escape_gdrive_query_string(folder_name)
    query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe_name}' and trashed = false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    try:
        response = drive_service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name)',
            pageSize=1
        ).execute()
        files = response.get('files', [])
        if files:
            return files[0]['id']
    except Exception as exc:
        logger.warning(f"Error searching folder '{folder_name}': {exc}")

    # Create new folder
    folder_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
    }
    if parent_id and parent_id != 'root':
        folder_metadata['parents'] = [parent_id]

    created = drive_service.files().create(body=folder_metadata, fields='id').execute()
    return created['id']


def resolve_folder_hierarchy(company_id: int, drive_service, root_folder_id: str, relative_path: str) -> str:
    """
    Given a path like 'سامانه حسابداری و اداری/پروژه مرکزی/بخش تدارکات/۱۴۰۵',
    ensures all intermediate folders exist in Google Drive and returns the destination folder ID.
    Uses memory cache to avoid redundant API queries.
    """
    segments = [s.strip() for s in relative_path.replace('\\', '/').split('/') if s.strip()]
    current_parent_id = root_folder_id

    for seg in segments:
        cache_key = (company_id, current_parent_id, seg)
        if cache_key in _FOLDER_CACHE:
            current_parent_id = _FOLDER_CACHE[cache_key]
            continue

        folder_id = _find_or_create_folder(drive_service, parent_id=current_parent_id, folder_name=seg)
        _FOLDER_CACHE[cache_key] = folder_id
        current_parent_id = folder_id

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

    def _enqueue_or_reopen(model_name: str, object_id, source_path: str, target_folder: str, target_fname: str) -> bool:
        t = GoogleDriveSyncQueue.objects.filter(
            company=company,
            model_name=model_name,
            object_id=object_id,
            source_file_path=source_path
        ).first()

        if not t:
            GoogleDriveSyncQueue.objects.create(
                company=company,
                model_name=model_name,
                object_id=object_id,
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
            t.error_message = None
            t.target_folder_path = target_folder
            t.target_filename = target_fname
            t.save(update_fields=['status', 'priority', 'retry_count', 'next_retry_at', 'error_message', 'target_folder_path', 'target_filename', 'updated_at'])
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
                    if _enqueue_or_reopen('Company', company.id, fobj.name, folder, fname):
                        enqueued_count += 1

        for doc in CompanyDocument.objects.filter(company=company, file__isnull=False).exclude(file='').iterator():
            res = GoogleDrivePathResolver.resolve(doc, field_name='file')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('CompanyDocument', doc.id, doc.file.name, folder, fname):
                    enqueued_count += 1

        for bm in CompanyBoardMember.objects.filter(company=company).iterator():
            for bfield in ('attached_id_doc', 'attached_appointment_doc'):
                bfobj = getattr(bm, bfield, None)
                if bfobj and bfobj.name:
                    res = GoogleDrivePathResolver.resolve(bm, field_name=bfield, file_obj=bfobj)
                    if res:
                        _, folder, fname = res
                        if _enqueue_or_reopen('CompanyBoardMember', bm.id, bfobj.name, folder, fname):
                            enqueued_count += 1

        for inv in ExpenseInvoice.objects.filter(section__project__company=company, attachment__isnull=False).exclude(attachment='').iterator():
            res = GoogleDrivePathResolver.resolve(inv, field_name='attachment')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('ExpenseInvoice', inv.id, inv.attachment.name, folder, fname):
                    enqueued_count += 1

        for tx in PettyCashTransaction.objects.filter(
            Q(section__project__company=company) | Q(account__section__project__company=company),
            attachment__isnull=False
        ).exclude(attachment='').distinct().iterator():
            res = GoogleDrivePathResolver.resolve(tx, field_name='attachment')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('PettyCashTransaction', tx.id, tx.attachment.name, folder, fname):
                    enqueued_count += 1

    # ۲. مدارک پرسنلی
    if config.sync_personnel_docs:
        for p in PersonnelProfile.objects.filter(company=company, attachment__isnull=False).exclude(attachment='').iterator():
            res = GoogleDrivePathResolver.resolve(p, field_name='attachment')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('PersonnelProfile', p.id, p.attachment.name, folder, fname):
                    enqueued_count += 1

        for pdoc in PersonnelDocument.objects.filter(personnel__company=company, file__isnull=False).exclude(file='').iterator():
            res = GoogleDrivePathResolver.resolve(pdoc, field_name='file')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('PersonnelDocument', pdoc.id, pdoc.file.name, folder, fname):
                    enqueued_count += 1

    # ۳. مدارک ناوگان
    if config.sync_fleet_docs:
        for vdoc in VehicleDocument.objects.filter(vehicle__company=company, file__isnull=False).exclude(file='').iterator():
            res = GoogleDrivePathResolver.resolve(vdoc, field_name='file')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('VehicleDocument', vdoc.id, vdoc.file.name, folder, fname):
                    enqueued_count += 1

    # ۴. تصاویر اقلام انبار
    if config.sync_inventory_photos and apps.is_installed('inventory'):
        ItemPhoto = apps.get_model('inventory', 'ItemPhoto')
        for iphoto in ItemPhoto.objects.filter(item__warehouse__company=company, image__isnull=False).exclude(image='').iterator():
            res = GoogleDrivePathResolver.resolve(iphoto, field_name='image')
            if res:
                _, folder, fname = res
                if _enqueue_or_reopen('ItemPhoto', iphoto.id, iphoto.image.name, folder, fname):
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
                if _enqueue_or_reopen('DatabaseBackup', None, full_backup_path, target_folder, fname):
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
        task.status = 'failed'
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
            in_db_backups = os.path.join(settings.BASE_DIR, 'backups', 'db', os.path.basename(abs_local_path))
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
                task.error_message = f"فایل مبدأ در سرور یافت نشد: {task.source_file_path}"
                task.save(update_fields=['status', 'error_message', 'updated_at'])
                return False

            # محاسبه هش امنیتی SHA-256
            hasher = hashlib.sha256()
            with open(abs_local_path, 'rb') as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            task.file_sha256 = hasher.hexdigest()

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

            media = MediaFileUpload(
                abs_local_path,
                resumable=True,
                chunksize=1024 * 1024 * 5  # قطعات ۵ مگابایتی
            )

            existing_id = None
            try:
                safe_target_name = _escape_gdrive_query_string(task.target_filename)
                check_q = f"'{dest_folder_id}' in parents and name = '{safe_target_name}' and trashed = false"
                res = drive_service.files().list(q=check_q, fields='files(id)').execute()
                if res.get('files'):
                    existing_id = res['files'][0]['id']
            except Exception:
                pass

            if existing_id:
                req = drive_service.files().update(
                    fileId=existing_id,
                    media_body=media,
                    fields='id, md5Checksum'
                )
            else:
                req = drive_service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id, md5Checksum'
                )

            uploaded = None
            while uploaded is None:
                _, uploaded = req.next_chunk(num_retries=3)

            task.gdrive_file_id = uploaded.get('id')
            task.status = 'completed'
            task.completed_at = timezone.now()
            task.error_message = None
            task.save(update_fields=['gdrive_file_id', 'status', 'completed_at', 'error_message', 'updated_at'])

            config.last_sync_at = timezone.now()
            config.last_error = None
            config.auth_status = 'ok'
            config.save(update_fields=['last_sync_at', 'last_error', 'auth_status', 'updated_at'])
            return True

    except Exception as exc:
        logger.error(f"Error processing GDrive task #{task_id}: {exc}", exc_info=True)
        err_info = classify_gdrive_error(exc)
        category = err_info['category']
        user_msg = err_info['user_message']

        if category == 'needs_reauth':
            config.auth_status = 'needs_reauth'
            config.last_error = user_msg
            config.save(update_fields=['auth_status', 'last_error', 'updated_at'])

            task.status = 'pending'
            task.error_message = user_msg
            task.save(update_fields=['status', 'error_message', 'updated_at'])
            return False

        elif category == 'transient':
            task.retry_count += 1
            if task.retry_count < 5:
                backoff_secs = min(3600, (2 ** task.retry_count) * 30)
                task.next_retry_at = timezone.now() + timedelta(seconds=backoff_secs)
                task.status = 'pending'
                task.error_message = f"{user_msg} (تلاش مجدد در {backoff_secs} ثانیه)"
                task.save(update_fields=['retry_count', 'next_retry_at', 'status', 'error_message', 'updated_at'])
            else:
                task.status = 'failed'
                task.error_message = f"پایان سقف تلاش‌های مجدد: {user_msg}"
                task.save(update_fields=['retry_count', 'status', 'error_message', 'updated_at'])

            config.last_error = f"خطای موقت در همگام‌سازی فایل {task.target_filename}: {user_msg}"
            config.save(update_fields=['last_error', 'updated_at'])
            return False

        else:  # permanent
            task.status = 'failed'
            task.retry_count += 1
            task.error_message = user_msg
            task.save(update_fields=['status', 'retry_count', 'error_message', 'updated_at'])

            config.last_error = f"خطا در همگام‌سازی فایل {task.target_filename}: {user_msg}"
            config.save(update_fields=['last_error', 'updated_at'])
            return False

    return False
