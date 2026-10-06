import logging
import secrets
from typing import Tuple, Dict, Any, Optional
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.utils import timezone
import google_auth_httplib2
from googleapiclient.discovery import build

from .models import SystemGoogleDriveConfig, GoogleOAuthState
from .google_drive_client import (
    create_base_oauth_flow,
    get_http_client,
    encrypt_secret,
    decrypt_secret,
    build_drive_service_from_token,
    check_folder_exists,
    find_or_create_folder,
    resolve_folder_hierarchy,
    upload_file_resumable,
    verify_and_consume_oauth_state,
)

logger = logging.getLogger(__name__)


def generate_system_auth_url(user=None, mode: str = 'popup') -> Tuple[str, str]:
    """
    Generate Google OAuth 2.0 authorization URL for system-wide drive (Phase 2 / D1).
    Restricted to superusers.
    """
    if mode not in ('popup', 'redirect'):
        mode = 'popup'

    nonce = secrets.token_urlsafe(32)
    now = timezone.now()
    expires_at = now + timedelta(seconds=600)

    GoogleOAuthState.objects.create(
        nonce=nonce,
        user=user if (user and getattr(user, 'is_authenticated', False)) else None,
        target='system',
        company_id=None,
        mode=mode,
        expires_at=expires_at
    )

    payload = {
        't': 'system',
        'c': None,
        'u': getattr(user, 'id', None) if user else None,
        'n': nonce,
        'm': mode,
    }
    state = signing.dumps(payload, salt='gdrive-oauth')

    flow = create_base_oauth_flow()
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=state
    )
    return auth_url, state


def exchange_system_code_and_store_credentials(code: str) -> Dict[str, Any]:
    """
    Exchange auth code for tokens and store in SystemGoogleDriveConfig (singleton)
    """
    config = SystemGoogleDriveConfig.get_solo()

    flow = create_base_oauth_flow()
    flow.fetch_token(code=code)
    credentials = flow.credentials

    refresh_token = credentials.refresh_token
    account_email = None
    try:
        http_auth = google_auth_httplib2.AuthorizedHttp(credentials, http=get_http_client())
        userinfo_service = build('oauth2', 'v2', http=http_auth)
        user_info = userinfo_service.userinfo().get().execute()
        account_email = user_info.get('email')
    except Exception as exc:
        logger.warning(f"[System GDrive] Could not retrieve Google account email: {exc}")

    config.is_enabled = True
    config.auth_status = 'authenticated'
    if refresh_token:
        config.refresh_token = encrypt_secret(refresh_token)
    if account_email:
        config.account_email = account_email
    config.last_error = None
    config.save()

    # Ensure root folder exists for system backups
    try:
        drive_service = build_drive_service_from_token(config.refresh_token)
        if drive_service:
            ensure_system_drive_folders(config, drive_service)
    except Exception as exc:
        logger.error(f"[System GDrive] Error ensuring drive root folder: {exc}")
        config.last_error = f"اتصال برقرار شد اما ساخت پوشه ریشه با خطا مواجه شد: {str(exc)}"
        config.save(update_fields=['last_error'])

    return {
        "success": True,
        "target": "system",
        "account_email": config.account_email,
        "root_folder_name": config.root_folder_name,
    }


def ensure_system_drive_folders(config: SystemGoogleDriveConfig, drive_service) -> str:
    """Ensure root folder for system backups exists"""
    root_folder_name = config.root_folder_name or "سامانه ابری پشتیبان پایگاه داده"
    root_id = config.root_folder_id
    if not root_id or not check_folder_exists(drive_service, root_id):
        root_id = find_or_create_folder(drive_service, parent_id='root', folder_name=root_folder_name)
        config.root_folder_id = root_id
        config.save(update_fields=['root_folder_id'])
    return root_id


def disconnect_system_google_drive() -> bool:
    """Revoke and unlink system-wide Google Drive account"""
    config = SystemGoogleDriveConfig.get_solo()
    raw_token = decrypt_secret(config.refresh_token)
    if raw_token:
        try:
            import urllib.request
            import urllib.parse
            data = urllib.parse.urlencode({'token': raw_token}).encode('utf-8')
            req = urllib.request.Request('https://oauth2.googleapis.com/revoke', data=data)
            urllib.request.urlopen(req, timeout=10)
        except Exception as exc:
            logger.warning(f"[System GDrive] Could not revoke token with Google: {exc}")

    config.refresh_token = None
    config.account_email = None
    config.auth_status = 'unlinked'
    config.last_error = None
    config.save()
    return True


def get_system_drive_service():
    """Build authorized Google Drive API client for system config"""
    config = SystemGoogleDriveConfig.get_solo()
    if not config.is_enabled or config.auth_status == 'unlinked' or not config.refresh_token:
        return None
    return build_drive_service_from_token(config.refresh_token)


def sync_single_system_task(task_id: int) -> bool:
    """
    پردازش و ارسال تک وظیفه پشتیبان درایو سراسری سامانه به گوگل‌درایو (فاز ۲)
    """
    import os
    from .models import SystemDriveUploadTask
    from .google_drive_client import (
        resolve_folder_hierarchy,
        upload_file_resumable,
    )

    task = SystemDriveUploadTask.objects.filter(id=task_id).first()
    if not task:
        return False

    config = SystemGoogleDriveConfig.get_solo()
    if not config.is_enabled or not config.refresh_token:
        task.status = 'failed'
        task.error_message = "درایو سراسری سامانه غیرفعال است یا توکن اتصال ندارد."
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    service = build_drive_service_from_token(config.refresh_token)
    if not service:
        task.status = 'failed'
        task.error_message = "امکان ساخت کلاینت احراز هویت شده گوگل با توکن موجود وجود ندارد."
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    if not os.path.exists(task.source_file_path):
        task.status = 'failed'
        task.error_message = f"فایل محلی پشتیبان در مسیر {task.source_file_path} یافت نشد."
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    try:
        root_id = ensure_system_drive_folders(config, service)
        target_folder_id = resolve_folder_hierarchy(
            cache_key='system',
            drive_service=service,
            root_folder_id=root_id,
            relative_path=task.target_folder_path
        )

        res = upload_file_resumable(
            drive_service=service,
            local_path=task.source_file_path,
            parent_folder_id=target_folder_id,
            filename=task.target_filename,
            mime_type='application/octet-stream'
        )

        task.gdrive_file_id = res.get('id')
        task.status = 'completed'
        task.completed_at = timezone.now()
        task.error_message = None
        task.save(update_fields=['gdrive_file_id', 'status', 'completed_at', 'error_message', 'updated_at'])

        config.last_sync_at = timezone.now()
        config.last_error = None
        config.save(update_fields=['last_sync_at', 'last_error', 'updated_at'])
        return True

    except Exception as exc:
        logger.error(f"[System GDrive] Error syncing task #{task_id}: {exc}", exc_info=True)
        task.status = 'failed'
        task.retry_count += 1
        task.error_message = str(exc)
        task.save(update_fields=['status', 'retry_count', 'error_message', 'updated_at'])

        config.last_error = f"خطا در ارسال پشتیبان: {str(exc)}"
        config.save(update_fields=['last_error', 'updated_at'])
        return False

