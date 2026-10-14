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
try:
    from google.auth.exceptions import RefreshError
except ImportError:
    class RefreshError(Exception):
        pass
import httplib2
import google_auth_httplib2
import urllib.request
import urllib.parse
import socket

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

    return payload


def invalidate_other_oauth_states(payload: Dict[str, Any]) -> None:
    """
    پس از اتصال موفق، stateهای باز دیگر همان مقصد مصرف‌شده ثبت می‌شوند (GD-02).
    فقط بعد از موفقیت صدا زده می‌شود تا لغو یا خطای یک تب، تب‌های دیگر را باطل نکند.
    """
    from settings_core.models import GoogleOAuthState
    now = timezone.now()
    nonce = payload.get('n')
    target = payload.get('t', 'company')
    qs = GoogleOAuthState.objects.filter(target=target, used_at__isnull=True).exclude(nonce=nonce)
    if target == 'company':
        company_id = payload.get('c')
        if not company_id:
            return
        qs = qs.filter(company_id=company_id)
    elif target != 'system':
        return
    qs.update(used_at=now)



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
    """
    Verify if a folder exists and is not trashed.
    فقط 404 (یا پوشهٔ در سطل زباله) یعنی «وجود ندارد»؛ خطای شبکه بالا می‌رود تا
    پوشهٔ ریشهٔ تکراری ساخته نشود.
    """
    try:
        res = drive_service.files().get(fileId=folder_id, fields='id, trashed').execute()
        return not res.get('trashed', False)
    except HttpError as exc:
        if getattr(getattr(exc, 'resp', None), 'status', None) == 404:
            return False
        raise


def find_or_create_folder(drive_service, parent_id: str, folder_name: str) -> str:
    """Find existing folder or create new one in Google Drive"""
    safe_name = escape_gdrive_query_string(folder_name)
    query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe_name}' and trashed = false"
    if parent_id and parent_id != 'root':
        query += f" and '{parent_id}' in parents"
    elif parent_id == 'root':
        query += " and 'root' in parents"

    # خطای جست‌وجو بالا می‌رود تا تسک دوباره تلاش شود؛ اگر بلعیده شود، با یک خطای
    # گذرای شبکه پوشهٔ هم‌نام تکراری ساخته می‌شود.
    response = drive_service.files().list(
        q=query,
        spaces='drive',
        fields='files(id, name)',
        pageSize=1
    ).execute()
    files = response.get('files', [])
    if files:
        return files[0]['id']

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


def revoke_google_token(token: str) -> bool:
    """
    Revoke a token with Google OAuth server (GD-11):
    POST https://oauth2.googleapis.com/revoke?token={token}
    """
    if not token:
        return True
    try:
        data = urllib.parse.urlencode({'token': token}).encode('utf-8')
        req = urllib.request.Request(
            'https://oauth2.googleapis.com/revoke',
            data=data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as exc:
        logger.warning(f"[GDrive Client] Token revocation request failed: {exc}")
        return False


def transient_backoff_seconds(retry_count: int) -> int:
    """تأخیر نمایی تلاش دوباره برای خطای گذرا، با سقف یک ساعت (بدون سقف تعداد تلاش)."""
    return min(3600, (2 ** min(max(retry_count, 1), 7)) * 30)


def classify_gdrive_error(exc: Exception) -> Dict[str, Any]:
    """
    Categorize errors based on HTTP status code and reason in HttpError body (GD-07, GD-08, GD-11).
    Returns dict:
      {
        'category': 'transient' | 'needs_reauth' | 'permanent',
        'reason': str,
        'user_message': str,
        'status_code': Optional[int]
      }
    """
    # 1. Check for token refresh failure / invalid grant
    str_exc = str(exc)
    str_lower = str_exc.lower()

    if isinstance(exc, RefreshError) or 'invalid_grant' in str_lower:
        return {
            'category': 'needs_reauth',
            'reason': 'invalid_grant',
            'user_message': 'حساب گوگل متصل نیازمند ورود و احراز مجدد است (توکن نامعتبر یا منقضی شده).',
            'status_code': 401
        }

    # 2. Check for HttpError from googleapiclient
    if isinstance(exc, HttpError):
        status_code = getattr(getattr(exc, 'resp', None), 'status', None)
        reasons = []
        if hasattr(exc, 'content') and exc.content:
            try:
                data = json.loads(exc.content.decode('utf-8'))
                errors = data.get('error', {}).get('errors', [])
                for err in errors:
                    if 'reason' in err:
                        reasons.append(err['reason'])
            except Exception:
                pass

        if status_code == 401 or 'invalid_grant' in reasons:
            return {
                'category': 'needs_reauth',
                'reason': 'invalid_grant',
                'user_message': 'حساب گوگل متصل نیازمند ورود و احراز مجدد است (کد ۴۰۱).',
                'status_code': 401
            }

        # 403 checks: rate limit vs storage quota vs permissions
        if status_code == 403:
            if any(r in ('rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded') for r in reasons) or 'ratelimit' in str_lower:
                return {
                    'category': 'transient',
                    'reason': 'rateLimitExceeded',
                    'user_message': 'محدودیت موقت نرخ درخواست‌های گوگل (Rate Limit)؛ ارسال مجدد با تاخیر افزایشی انجام می‌شود.',
                    'status_code': 403
                }
            if any(r in ('storageQuotaExceeded', 'quotaExceeded') for r in reasons) or 'storagequota' in str_lower:
                return {
                    'category': 'permanent',
                    'reason': 'storageQuotaExceeded',
                    'user_message': 'فضای ابری درایو پر شده است (عدم کفایت سهمیه دیسک حساب گوگل).',
                    'status_code': 403
                }
            if any(r in ('insufficientPermissions', 'insufficientFilePermissions') for r in reasons) or 'insufficient' in str_lower:
                return {
                    'category': 'permanent',
                    'reason': 'insufficientPermissions',
                    'user_message': 'عدم دسترسی کافی برای ایجاد یا ویرایش فایل در درایو مقصد.',
                    'status_code': 403
                }
            # Generic 403
            return {
                'category': 'permanent',
                'reason': reasons[0] if reasons else 'forbidden_403',
                'user_message': 'دسترسی غیرمجاز یا محدود شده به گوگل‌درایو.',
                'status_code': 403
            }

        # Transient HTTP status codes
        if status_code in (408, 429, 500, 502, 503, 504):
            return {
                'category': 'transient',
                'reason': f'http_{status_code}',
                'user_message': f'خطای موقت سرور گوگل (کد {status_code})؛ ارسال مجدد زمان‌بندی شد.',
                'status_code': status_code
            }

        # Resumable session 404
        if status_code == 404:
            return {
                'category': 'transient',
                'reason': 'session_404',
                'user_message': 'نشست ارسال تکه‌ای منقضی گردید؛ ارسال از ابتدا آغاز می‌شود.',
                'status_code': 404
            }

        # Other 4xx permanent errors
        if status_code and 400 <= status_code < 500:
            return {
                'category': 'permanent',
                'reason': f'http_{status_code}',
                'user_message': f'درخواست به گوگل‌درایو پذیرفته نشد (کد {status_code}).',
                'status_code': status_code
            }

    # 3. File not found
    if isinstance(exc, FileNotFoundError) or 'فایل مبدأ' in str_exc or 'not found' in str_lower:
        return {
            'category': 'permanent',
            'reason': 'file_not_found',
            'user_message': 'فایل مبدأ در سرور یافت نشد.',
            'status_code': None
        }

    # 4. Network and socket exceptions
    if isinstance(exc, (socket.error, ConnectionError, TimeoutError, httplib2.ServerNotFoundError)) or \
       any(k in str_lower for k in ('connection', 'timeout', 'timed out', 'network', 'reset by peer')):
        return {
            'category': 'transient',
            'reason': 'network_error',
            'user_message': 'خطای موقت در ارتباط شبکه با گوگل؛ ارسال دوباره زمان‌بندی شد.',
            'status_code': None
        }

    # 5. Fallback for other errors
    return {
        'category': 'permanent',
        'reason': 'unknown_error',
        'user_message': 'خطای پیش‌بینی‌نشده در پردازش فایل؛ جزئیات در لاگ سرور ثبت شد.',
        'status_code': None
    }

