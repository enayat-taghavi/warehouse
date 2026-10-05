import os
import json
import base64
import hashlib
import logging
from typing import Optional, Tuple, Dict, Any, List
from datetime import datetime

from django.conf import settings
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

# Scopes needed for managing files created by this application
SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
]

# Memory cache for Google Drive folder IDs to minimize API calls
# Structure: {(company_id, parent_id, folder_name): folder_id}
_FOLDER_CACHE: Dict[Tuple[int, str, str], str] = {}


def _get_encryption_key() -> bytes:
    """Generate a stable 32-byte Fernet key from Django SECRET_KEY"""
    raw_key = getattr(settings, 'SECRET_KEY', 'default-gdrive-secret-key-32-bytes!')
    digest = hashlib.sha256(raw_key.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_secret(plain_text: Optional[str]) -> Optional[str]:
    """Encrypt sensitive tokens before saving in database"""
    if not plain_text:
        return None
    try:
        f = Fernet(_get_encryption_key())
        return f.encrypt(plain_text.encode('utf-8')).decode('utf-8')
    except Exception as exc:
        logger.error(f"Error encrypting secret: {exc}")
        return plain_text


def decrypt_secret(cipher_text: Optional[str]) -> Optional[str]:
    """Decrypt sensitive tokens retrieved from database"""
    if not cipher_text:
        return None
    try:
        f = Fernet(_get_encryption_key())
        return f.decrypt(cipher_text.encode('utf-8')).decode('utf-8')
    except Exception:
        # Fallback in case token was saved unencrypted
        return cipher_text


def get_http_client() -> httplib2.Http:
    """
    Construct httplib2.Http instance with optional outbound proxy support
    (supports HTTP, HTTPS, and SOCKS5 proxies)
    """
    proxy_url = getattr(settings, 'OUTBOUND_HTTP_PROXY', '') or os.getenv('OUTBOUND_HTTP_PROXY', '')
    if proxy_url:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(proxy_url)
            proxy_type = httplib2.socks.PROXY_TYPE_HTTP
            if 'socks5' in (parsed.scheme or ''):
                proxy_type = httplib2.socks.PROXY_TYPE_SOCKS5
            elif 'socks4' in (parsed.scheme or ''):
                proxy_type = httplib2.socks.PROXY_TYPE_SOCKS4

            proxy_info = httplib2.ProxyInfo(
                proxy_type=proxy_type,
                proxy_host=parsed.hostname,
                proxy_port=parsed.port or (1080 if 'socks' in (parsed.scheme or '') else 8080),
                proxy_user=parsed.username,
                proxy_pass=parsed.password
            )
            return httplib2.Http(proxy_info=proxy_info, timeout=60)
        except Exception as exc:
            logger.warning(f"Could not configure proxy '{proxy_url}': {exc}. Using direct connection.")
    return httplib2.Http(timeout=60)


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

    proxy_url = getattr(settings, 'OUTBOUND_HTTP_PROXY', '') or os.getenv('OUTBOUND_HTTP_PROXY', '')
    if proxy_url and hasattr(flow, 'session') and flow.session:
        flow.session.proxies = {
            'http': proxy_url,
            'https': proxy_url,
        }

    return flow


def generate_company_auth_url(company_id: int) -> Tuple[str, str]:
    """
    Generate Google OAuth 2.0 authorization URL for a specific company
    Returns (authorization_url, state)
    """
    flow = create_oauth_flow(company_id)
    # State format: company_id:signature
    h = hashlib.sha256(f"{company_id}:{settings.SECRET_KEY}".encode('utf-8')).hexdigest()[:16]
    state = f"{company_id}:{h}"

    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=state
    )
    return auth_url, state


def verify_oauth_state(state: str) -> Optional[int]:
    """Verify state token and return company_id if valid"""
    try:
        parts = state.split(':')
        if len(parts) != 2:
            return None
        company_id = int(parts[0])
        expected_sig = hashlib.sha256(f"{company_id}:{settings.SECRET_KEY}".encode('utf-8')).hexdigest()[:16]
        if parts[1] == expected_sig:
            return company_id
    except Exception as exc:
        logger.error(f"Invalid OAuth state: {exc}")
    return None


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


def sync_single_queue_item(task_id: int) -> bool:
    """
    Processes a single GoogleDriveSyncQueue task (upload or archive)
    """
    from .models import GoogleDriveSyncQueue

    try:
        task = GoogleDriveSyncQueue.objects.select_related('company', 'company__gdrive_config').get(id=task_id)
    except GoogleDriveSyncQueue.DoesNotExist:
        return False

    company = task.company
    config = getattr(company, 'gdrive_config', None)
    if not config or not config.is_enabled or not config.refresh_token:
        task.status = 'failed'
        task.error_message = "سرویس گوگل‌درایو برای این شرکت فعال یا متصل نیست."
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    drive_service = get_google_drive_service(company.id)
    if not drive_service:
        task.status = 'failed'
        task.error_message = "امکان برقراری ارتباط با گوگل‌درایو (احراز هویت یا پروکسی) وجود ندارد."
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    task.status = 'processing'
    task.save(update_fields=['status', 'updated_at'])

    try:
        root_id, archive_id = ensure_company_drive_folders(company, drive_service)

        if task.action == 'archive_delete':
            # Handle archiving of a deleted file
            if task.gdrive_file_id:
                try:
                    # Move to year-based archive subfolder e.g. "بایگانی و اسناد حذف‌شده/۱۴۰۵"
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
                    task.save()
                    return True
                except HttpError as he:
                    if he.resp.status == 404:
                        task.status = 'completed'
                        task.completed_at = timezone.now()
                        task.save()
                        return True
                    raise
            else:
                task.status = 'completed'
                task.completed_at = timezone.now()
                task.error_message = "فایل در گوگل‌درایو بارگذاری نشده بود (فاقد شناسه فایل)."
                task.save()
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

            # Calculate SHA-256
            hasher = hashlib.sha256()
            with open(abs_local_path, 'rb') as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            task.file_sha256 = hasher.hexdigest()

            # Resolve target folder in Google Drive
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
                chunksize=1024 * 1024 * 5  # 5MB chunk
            )

            # Check if file with same name already exists in target folder to update rather than duplicate
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
                _, uploaded = req.next_chunk()

            task.gdrive_file_id = uploaded.get('id')
            task.status = 'completed'
            task.completed_at = timezone.now()
            task.error_message = None
            task.save()

            config.last_sync_at = timezone.now()
            config.last_error = None
            config.save(update_fields=['last_sync_at', 'last_error'])
            return True

    except Exception as exc:
        logger.error(f"Error processing GDrive task #{task_id}: {exc}", exc_info=True)
        task.retry_count += 1
        task.status = 'failed'
        task.error_message = str(exc)
        task.save(update_fields=['retry_count', 'status', 'error_message', 'updated_at'])

        config.last_error = f"خطا در همگام‌سازی فایل {task.target_filename}: {str(exc)}"
        config.save(update_fields=['last_error'])
        return False

    return False
