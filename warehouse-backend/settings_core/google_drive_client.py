import os
import json
import base64
import hashlib
import secrets
import logging
from typing import Optional, Tuple, Dict, Any, Callable
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

# Scopes needed for managing files created by this application
SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
]

# In-memory cache for folder hierarchies
# Structure: {(target_key, parent_id, folder_name): folder_id}
_FOLDER_CACHE: Dict[Tuple[Any, str, str], str] = {}

# Registry for target handlers (e.g. 'company' registered by personnel app)
# Structure: {target_name: {'exchange_handler': callable, 'access_checker': callable, 'redirect_builder': callable}}
_TARGET_HANDLERS: Dict[str, Dict[str, Callable]] = {}


def register_gdrive_target_handler(
    target: str,
    exchange_handler: Callable,
    access_checker: Optional[Callable] = None,
    redirect_builder: Optional[Callable] = None,
    batch_runner: Optional[Callable] = None
):
    """
    Register a module-specific handler for Google Drive OAuth callback, token storage, and batch processing.
    E.g. personnel app registers handler for target='company'.
    """
    _TARGET_HANDLERS[target] = {
        'exchange_handler': exchange_handler,
        'access_checker': access_checker,
        'redirect_builder': redirect_builder,
        'batch_runner': batch_runner,
    }
    logger.info(f"[GDrive Client] Registered target handler for '{target}'")


def get_gdrive_target_handler(target: str) -> Optional[Dict[str, Callable]]:
    return _TARGET_HANDLERS.get(target)


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

    # Invalidate other pending states for this target
    target = payload.get('t', 'company')
    company_id = payload.get('c')
    if target == 'company' and company_id:
        GoogleOAuthState.objects.filter(
            target='company',
            company_id=company_id,
            used_at__isnull=True
        ).exclude(nonce=nonce).update(used_at=now)
    elif target == 'system':
        GoogleOAuthState.objects.filter(
            target='system',
            used_at__isnull=True
        ).exclude(nonce=nonce).update(used_at=now)

    return payload



def get_encryption_key() -> bytes:
    """Generate a stable 32-byte Fernet key from Django SECRET_KEY"""
    raw_key = getattr(settings, 'SECRET_KEY', 'default-gdrive-secret-key-32-bytes!')
    digest = hashlib.sha256(raw_key.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_secret(plain_text: Optional[str]) -> Optional[str]:
    """Encrypt sensitive tokens before saving in database"""
    if not plain_text:
        return None
    try:
        f = Fernet(get_encryption_key())
        return f.encrypt(plain_text.encode('utf-8')).decode('utf-8')
    except Exception as exc:
        logger.error(f"[GDrive Client] Error encrypting secret: {exc}")
        raise ValueError(f"رمزنگاری کلید با خطا مواجه شد: {exc}")


def decrypt_secret(cipher_text: Optional[str]) -> Optional[str]:
    """Decrypt sensitive tokens retrieved from database. Returns None on failure."""
    if not cipher_text:
        return None
    try:
        f = Fernet(get_encryption_key())
        return f.decrypt(cipher_text.encode('utf-8')).decode('utf-8')
    except Exception as exc:
        logger.warning(f"[GDrive Client] Error decrypting secret token: {exc}")
        return None


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
            logger.warning(f"[GDrive Client] Could not configure proxy '{proxy_url}': {exc}. Using direct connection.")
    return httplib2.Http(timeout=60)


def create_base_oauth_flow(redirect_uri: Optional[str] = None) -> Flow:
    """Create Google OAuth 2.0 Flow with standard client credentials"""
    client_id = getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '')
    client_secret = getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', '')
    effective_redirect_uri = redirect_uri or getattr(settings, 'GOOGLE_OAUTH_REDIRECT_URI', '')

    if not client_id or not client_secret:
        raise ValueError("شناسه و کلید برنامه گوگل (GOOGLE_OAUTH_CLIENT_ID / SECRET) در تنظیمات سرور ثبت نشده است.")

    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [effective_redirect_uri],
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=effective_redirect_uri
    )
    flow.autogenerate_code_verifier = False
    flow.code_verifier = None

    proxy_url = getattr(settings, 'OUTBOUND_HTTP_PROXY', '') or os.getenv('OUTBOUND_HTTP_PROXY', '')
    if proxy_url and hasattr(flow, 'session') and flow.session:
        flow.session.proxies = {
            'http': proxy_url,
            'https': proxy_url,
        }

    return flow


def build_drive_service_from_token(encrypted_refresh_token: str):
    """
    Construct an authorized Google Drive API v3 resource from an encrypted refresh token.
    """
    decrypted_token = decrypt_secret(encrypted_refresh_token)
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


def escape_gdrive_query_string(val: str) -> str:
    """Escape single quotes and backslashes for Google Drive API query strings"""
    return val.replace('\\', '\\\\').replace("'", r"\'")


def check_folder_exists(drive_service, folder_id: str) -> bool:
    """Verify if a folder exists and is not trashed"""
    try:
        res = drive_service.files().get(fileId=folder_id, fields='id, trashed').execute()
        return not res.get('trashed', False)
    except Exception:
        return False


def find_or_create_folder(drive_service, parent_id: str, folder_name: str) -> str:
    """Find existing folder or create new one in Google Drive"""
    safe_name = escape_gdrive_query_string(folder_name)
    query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe_name}' and trashed = false"
    if parent_id and parent_id != 'root':
        query += f" and '{parent_id}' in parents"
    elif parent_id == 'root':
        query += " and 'root' in parents"

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
        logger.warning(f"[GDrive Client] Error searching folder '{folder_name}': {exc}")

    # Create new folder
    folder_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
    }
    if parent_id and parent_id != 'root':
        folder_metadata['parents'] = [parent_id]

    created = drive_service.files().create(body=folder_metadata, fields='id').execute()
    return created['id']


def resolve_folder_hierarchy(cache_key: Any, drive_service, root_folder_id: str, relative_path: str) -> str:
    """
    Ensures all intermediate folders exist in Google Drive and returns the destination folder ID.
    Uses memory cache to avoid redundant API queries.
    """
    segments = [s.strip() for s in relative_path.replace('\\', '/').split('/') if s.strip()]
    if not segments:
        return root_folder_id

    current_parent_id = root_folder_id
    for segment in segments:
        cache_id = (cache_key, current_parent_id, segment)
        if cache_id in _FOLDER_CACHE:
            cached_val = _FOLDER_CACHE[cache_id]
            if check_folder_exists(drive_service, cached_val):
                current_parent_id = cached_val
                continue
            else:
                _FOLDER_CACHE.pop(cache_id, None)

        folder_id = find_or_create_folder(drive_service, parent_id=current_parent_id, folder_name=segment)
        _FOLDER_CACHE[cache_id] = folder_id
        current_parent_id = folder_id

    return current_parent_id


def upload_file_resumable(drive_service, local_path: str, parent_folder_id: str, filename: str, mime_type: str = 'application/octet-stream') -> Dict[str, Any]:
    """
    Robust resumable chunked upload to Google Drive (Phase 2 & 3).
    """
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"فایل محلی یافت نشد: {local_path}")

    file_size = os.path.getsize(local_path)
    file_metadata = {
        'name': filename,
        'parents': [parent_folder_id]
    }

    # Use 1MB chunks for resilience
    chunk_size = 1024 * 1024
    media = MediaFileUpload(
        local_path,
        mimetype=mime_type,
        chunksize=chunk_size,
        resumable=True
    )

    request = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, name, md5Checksum, size'
    )

    response = None
    while response is None:
        status, response = request.next_chunk(num_retries=3)
        if status:
            logger.debug(f"[GDrive Client] Uploading '{filename}': {int(status.progress() * 100)}%")

    return response
