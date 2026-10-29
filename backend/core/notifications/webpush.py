"""
وب‌پوش استاندارد (RFC 8030/8291، VAPID RFC 8292) برای وب و PWA — د۹ طرح ۵ (۵-د۱).
اپ بومی همان FCM (`push.py`) است. بی کلید VAPID، وب‌پوش خاموش است و زنگوله کار می‌کند.
هیچ کلید خصوصی یا endpoint کاملی در لاگ نوشته نمی‌شود.
"""
import base64
import hashlib
import json
import logging
import os
import threading
from typing import Any
from urllib.parse import urlsplit

from django.conf import settings
import requests

logger = logging.getLogger(__name__)

MAX_ENDPOINT_LENGTH = 2048
MAX_SUBSCRIPTIONS_PER_USER = 10
WEBPUSH_TTL_SECONDS = 86400
WEBPUSH_TIMEOUT_SECONDS = 10
DEFAULT_NOTIFICATION_URL = '/app/my-tasks'

# سرور به endpoint درخواست می‌فرستد؛ فقط سرویس‌های پوش شناخته‌شده مجازند (جلوی SSRF)
ALLOWED_PUSH_HOSTS = frozenset({
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
})
ALLOWED_PUSH_HOST_SUFFIXES = (
    '.push.apple.com',
    '.push.services.mozilla.com',
    '.notify.windows.com',
)

_key_lock = threading.Lock()
_cached_key_path: str | None = None
_cached_key_mtime: float | None = None
_cached_vapid: Any | None = None
_cached_public_key: str = ''


def endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode('utf-8')).hexdigest()


def short_endpoint(endpoint: str) -> str:
    """فقط ابتدای endpoint برای لاگ (بقیه شناسهٔ دستگاه است)."""
    return (endpoint or '')[:32] + '...'


def validate_endpoint(url: Any) -> bool:
    if not isinstance(url, str) or not url or len(url) > MAX_ENDPOINT_LENGTH:
        return False
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    if parts.scheme != 'https' or parts.username or parts.password:
        return False
    if port not in (None, 443):
        return False
    host = (parts.hostname or '').lower().rstrip('.')
    if not host:
        return False
    return host in ALLOWED_PUSH_HOSTS or any(host.endswith(suffix) for suffix in ALLOWED_PUSH_HOST_SUFFIXES)


def _b64url_decoded_length(value: str) -> int:
    try:
        return len(base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)))
    except (ValueError, TypeError):
        return -1


def validate_keys(p256dh: Any, auth: Any) -> bool:
    """p256dh نقطهٔ فشرده‌نشدهٔ P-256 (۶۵ بایت) و auth رمز ۱۶ بایتی است (RFC 8291)."""
    if not isinstance(p256dh, str) or not isinstance(auth, str):
        return False
    if len(p256dh) > 200 or len(auth) > 100:
        return False
    return _b64url_decoded_length(p256dh) == 65 and _b64url_decoded_length(auth) == 16


def _load_vapid() -> tuple[Any | None, str]:
    """Vapid و کلید عمومی (base64url نقطهٔ فشرده‌نشده) از فایل PEM؛ با کش بر پایهٔ مسیر و زمان تغییر فایل."""
    global _cached_key_path, _cached_key_mtime, _cached_vapid, _cached_public_key
    key_file = getattr(settings, 'WEBPUSH_VAPID_PRIVATE_KEY_FILE', '') or ''
    if not key_file or not os.path.isfile(key_file):
        return None, ''
    try:
        mtime = os.path.getmtime(key_file)
    except OSError:
        return None, ''
    with _key_lock:
        if _cached_key_path == key_file and _cached_key_mtime == mtime:
            return _cached_vapid, _cached_public_key
        vapid = None
        public_key = ''
        try:
            from cryptography.hazmat.primitives import serialization
            from py_vapid import Vapid02

            # from_pem، نه from_file: from_file بی فایل خودش کلید تازه می‌سازد
            with open(key_file, 'rb') as f:
                vapid = Vapid02.from_pem(f.read())
            raw = vapid.public_key.public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.UncompressedPoint,
            )
            public_key = base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')
        except Exception as exc:
            logger.error("Invalid VAPID key file for web push: %s", type(exc).__name__)
            vapid, public_key = None, ''
        _cached_key_path, _cached_key_mtime = key_file, mtime
        _cached_vapid, _cached_public_key = vapid, public_key
        return vapid, public_key


def get_vapid_public_key() -> str:
    return _load_vapid()[1]


def build_payload(title: str, body: str, url: str | None, notification_id: Any) -> str:
    """محتوا در قالب سرویس‌ورکر انگولار (ngsw) تا لمس اعلان، حتی با برنامهٔ بسته، صفحه را باز کند."""
    target_url = url or DEFAULT_NOTIFICATION_URL
    return json.dumps({
        'notification': {
            'title': title or '',
            'body': body or '',
            'icon': '/icons/icon-192x192.png',
            'badge': '/icons/icon-96x96.png',
            'dir': 'rtl',
            'lang': 'fa',
            'tag': f'n-{notification_id}',
            'data': {
                'url': target_url,
                'notification_id': str(notification_id or ''),
                'onActionClick': {
                    'default': {'operation': 'navigateLastFocusedOrOpen', 'url': target_url},
                },
            },
        },
    }, ensure_ascii=False)


class WebPushProvider:
    """ارسال وب‌پوش به اشتراک‌ها؛ 404/410 یعنی اشتراک منقضی شده و ردیف سرور پاک می‌شود."""

    @property
    def is_enabled(self) -> bool:
        return bool(get_vapid_public_key())

    def send(self, subscriptions: list[dict[str, Any]], payload: str) -> int:
        """subscriptions: dict هایی با id، endpoint، p256dh، auth. شمار پذیرفته‌شده را برمی‌گرداند."""
        if not subscriptions:
            return 0
        vapid, _public_key = _load_vapid()
        if vapid is None:
            return 0
        from pywebpush import webpush, WebPushException

        subject = getattr(settings, 'WEBPUSH_VAPID_SUBJECT', '') or 'mailto:admin@farsalish.ir'
        proxy_url = getattr(settings, 'OUTBOUND_HTTP_PROXY', '') or os.environ.get('OUTBOUND_HTTP_PROXY', '')
        session = requests.Session()
        # فهرست مجاز فقط نشانی نخست را می‌سنجد؛ redirect دنبال نمی‌شود
        session.max_redirects = 0
        if proxy_url:
            session.proxies = {'http': proxy_url, 'https': proxy_url}

        accepted = 0
        expired: list[tuple[int, str]] = []
        try:
            for sub in subscriptions:
                endpoint = sub.get('endpoint') or ''
                if not validate_endpoint(endpoint):
                    continue
                try:
                    webpush(
                        subscription_info={
                            'endpoint': endpoint,
                            'keys': {'p256dh': sub.get('p256dh', ''), 'auth': sub.get('auth', '')},
                        },
                        data=payload,
                        vapid_private_key=vapid,
                        vapid_claims={'sub': subject},
                        ttl=WEBPUSH_TTL_SECONDS,
                        timeout=WEBPUSH_TIMEOUT_SECONDS,
                        requests_session=session,
                    )
                    accepted += 1
                except WebPushException as exc:
                    status_code = exc.status_code
                    if status_code in (404, 410):
                        expired.append((sub.get('id'), endpoint))
                        logger.info("Web push subscription %s expired (%s); removing.",
                                    short_endpoint(endpoint), status_code)
                    else:
                        logger.warning("Web push to %s failed with status %s.", short_endpoint(endpoint), status_code)
                except Exception as exc:
                    logger.warning("Web push to %s failed: %s", short_endpoint(endpoint), type(exc).__name__)
        finally:
            session.close()

        expired = [(i, ep) for i, ep in expired if i is not None]
        if expired:
            try:
                from .models import WebPushSubscription
                # فقط همان ردیف با همان endpoint (اگر در این میان عوض شده، دست نمی‌خورد)
                WebPushSubscription.objects.filter(
                    id__in=[i for i, _ in expired],
                    endpoint_hash__in=[endpoint_hash(ep) for _, ep in expired],
                ).delete()
            except Exception as exc:
                logger.error("Failed to delete expired web push subscriptions: %s", type(exc).__name__)
        return accepted
