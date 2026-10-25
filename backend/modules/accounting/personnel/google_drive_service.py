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

# 2.6-c2: company drive client, folders, queue item and caches moved to core; names kept for module callers
from settings_core.company_drive_service import (  # noqa: E402,F401
    _FOLDER_CACHE,
    _ROOT_ARCHIVE_CACHE,
    invalidate_folder_cache,
    get_google_drive_service,
    ensure_company_drive_folders,
    resolve_folder_hierarchy,
    sync_single_queue_item,
)



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
