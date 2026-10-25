from concurrent.futures import ThreadPoolExecutor, Future
import json
import logging
import os
import threading
from typing import Any

from django.conf import settings
from django.db import transaction, close_old_connections
from django.db.models.signals import post_save
from django.dispatch import receiver
from google.auth.transport.requests import Request
from google.oauth2 import service_account
import requests

logger = logging.getLogger(__name__)

# Bounded thread pool executor for push notifications (max 2 workers)
_push_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="push_worker")


class _FutureThreadAdapter:
    """Adapter wrapping a Future to provide a .join(timeout=...) interface for deterministic tests."""

    def __init__(self, future: Future):
        self._future = future

    def join(self, timeout: float | None = None) -> Any:
        try:
            return self._future.result(timeout=timeout)
        except Exception:
            return None


# References to the most recently submitted background push task (useful for deterministic tests)
_last_push_future: Future | None = None
_last_push_thread: Any | None = None


class PushProvider:
    """Interface for push notification providers."""

    @property
    def is_enabled(self) -> bool:
        return False

    def send(self, tokens: list[str], title: str, body: str, data: dict[str, Any] | None = None) -> None:
        """Send push notification to the given device tokens."""
        raise NotImplementedError

    def send_notification(self, notification: Any, tokens: list[str] | None = None) -> None:
        """Convenience method to send a push for a Notification instance."""
        if tokens is None:
            from .models import DeviceToken
            tokens = list(
                DeviceToken.objects.filter(user_id=notification.recipient_id).values_list('token', flat=True)
            )
        if not tokens:
            return
        payload_data = {
            'notification_id': str(getattr(notification, 'id', '')),
            'target_model': str(getattr(notification, 'target_model', '') or ''),
            'target_id': str(getattr(notification, 'target_id', '') or ''),
            'url': str(getattr(notification, 'url', '') or ''),
        }
        self.send(
            tokens=tokens,
            title=str(getattr(notification, 'title', '')),
            body=str(getattr(notification, 'message', '')),
            data=payload_data,
        )


class DisabledPushProvider(PushProvider):
    """Fallback provider when push notifications are not configured or disabled."""

    @property
    def is_enabled(self) -> bool:
        return False

    def send(self, tokens: list[str], title: str, body: str, data: dict[str, Any] | None = None) -> None:
        logger.debug("Push notifications disabled; skipping dispatch to %d tokens.", len(tokens) if tokens else 0)
        return None


class FcmPushProvider(PushProvider):
    """FCM HTTP v1 push notification provider using service account credentials."""

    FCM_ENDPOINT_TEMPLATE = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]

    # Class-level credential cache
    _cached_credentials: Any | None = None
    _cached_project_id: str | None = None
    _cached_file_path: str | None = None

    def __init__(self, credentials_file: str | None = None):
        self.credentials_file = credentials_file or getattr(settings, 'FIREBASE_CREDENTIALS_FILE', '')
        self._credentials: Any | None = None
        self._project_id: str | None = None
        self._lock = threading.Lock()

    @property
    def is_enabled(self) -> bool:
        return bool(self.credentials_file and os.path.isfile(self.credentials_file))

    def _load_credentials(self) -> tuple[Any | None, str | None]:
        """Load service account credentials and extract project_id (cached)."""
        if not self.is_enabled:
            return None, None
        if self._credentials is not None and self._project_id is not None:
            return self._credentials, self._project_id
        if FcmPushProvider._cached_file_path == self.credentials_file and FcmPushProvider._cached_credentials is not None:
            self._credentials = FcmPushProvider._cached_credentials
            self._project_id = FcmPushProvider._cached_project_id
            return self._credentials, self._project_id
        try:
            with open(self.credentials_file, 'r', encoding='utf-8') as f:
                cred_dict = json.load(f)
            project_id = cred_dict.get('project_id')
            credentials = service_account.Credentials.from_service_account_file(
                self.credentials_file,
                scopes=self.SCOPES,
            )
            self._credentials = credentials
            self._project_id = project_id
            FcmPushProvider._cached_credentials = credentials
            FcmPushProvider._cached_project_id = project_id
            FcmPushProvider._cached_file_path = self.credentials_file
            return credentials, project_id
        except Exception as exc:
            logger.error("Failed to load Firebase credentials from %s: %s", self.credentials_file, exc)
            return None, None

    def send(self, tokens: list[str], title: str, body: str, data: dict[str, Any] | None = None) -> None:
        if not tokens or not self.is_enabled:
            return

        try:
            proxy_url = getattr(settings, 'OUTBOUND_HTTP_PROXY', '') or os.environ.get('OUTBOUND_HTTP_PROXY', '')
            session = requests.Session()
            if proxy_url:
                session.proxies = {
                    'http': proxy_url,
                    'https': proxy_url,
                }
            auth_request = Request(session=session)

            with self._lock:
                credentials, project_id = self._load_credentials()
                if not credentials or not project_id:
                    logger.warning("FCM credentials or project_id missing; cannot send push.")
                    return

                # Refresh only when expired or not yet valid
                if not getattr(credentials, 'valid', False) or getattr(credentials, 'expired', False):
                    credentials.refresh(auth_request)
                access_token = credentials.token

            url = self.FCM_ENDPOINT_TEMPLATE.format(project_id=project_id)
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; UTF-8",
            }

            clean_data: dict[str, str] = {}
            if data:
                for k, v in data.items():
                    clean_data[str(k)] = str(v) if v is not None else ""

            proxies = {'http': proxy_url, 'https': proxy_url} if proxy_url else None
            for token in tokens:
                self._send_single_message(url, headers, token, title, body, clean_data, proxies=proxies)

        except Exception as exc:
            logger.exception("Unexpected error in FcmPushProvider.send: %s", exc)

    def _send_single_message(
        self,
        url: str,
        headers: dict[str, str],
        token: str,
        title: str,
        body: str,
        data: dict[str, str],
        proxies: dict[str, str] | None = None,
    ) -> None:
        payload = {
            "message": {
                "token": token,
                "notification": {
                    "title": title,
                    "body": body,
                },
                "android": {
                    "priority": "HIGH",
                },
            }
        }
        if data:
            payload["message"]["data"] = data

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10, proxies=proxies)
            if response.status_code == 200:
                logger.info("FCM push successfully delivered to token %s...", token[:12])
            else:
                self._handle_fcm_error(token, response)
        except Exception as exc:
            logger.exception("Error executing FCM HTTP request for token %s: %s", token[:12], exc)

    def _handle_fcm_error(self, token: str, response: requests.Response) -> None:
        """Handle error responses from FCM, deleting unregistered tokens."""
        is_unregistered = False
        try:
            err_json = response.json()
            error_obj = err_json.get('error', {})
            status_str = error_obj.get('status', '')
            if status_str == 'NOT_FOUND':
                is_unregistered = True
            for detail in error_obj.get('details', []):
                if detail.get('errorCode') == 'UNREGISTERED':
                    is_unregistered = True
                    break
        except Exception:
            err_json = None

        if not is_unregistered:
            resp_text = response.text or ""
            if "UNREGISTERED" in resp_text or response.status_code in (404, 410):
                is_unregistered = True

        if is_unregistered:
            logger.warning("FCM token %s... rejected as unregistered; removing from database.", token[:12])
            try:
                from .models import DeviceToken
                DeviceToken.objects.filter(token=token).delete()
            except Exception as exc:
                logger.error("Failed to delete unregistered device token %s: %s", token[:12], exc)
        else:
            logger.warning(
                "FCM request failed with status %d for token %s...: %s",
                response.status_code, token[:12], response.text[:200]
            )


_provider_instance: PushProvider | None = None
_cached_cred_file: str | None = None


def get_push_provider() -> PushProvider:
    """Return configured PushProvider or DisabledPushProvider if unconfigured."""
    global _provider_instance, _cached_cred_file
    cred_file = getattr(settings, 'FIREBASE_CREDENTIALS_FILE', '')
    if cred_file and os.path.isfile(cred_file):
        if _provider_instance is None or not isinstance(_provider_instance, FcmPushProvider) or _cached_cred_file != cred_file:
            _provider_instance = FcmPushProvider(credentials_file=cred_file)
            _cached_cred_file = cred_file
        return _provider_instance
    if _provider_instance is None or not isinstance(_provider_instance, DisabledPushProvider) or _cached_cred_file != cred_file:
        _provider_instance = DisabledPushProvider()
        _cached_cred_file = cred_file
    return _provider_instance


def _send_push_worker(
    notification_id: int,
    tokens: list[str] | None = None,
    title: str | None = None,
    message: str | None = None,
    target_model: str | None = None,
    target_id: str | None = None,
    url: str | None = None,
) -> None:
    """Worker task executed in background thread pool to dispatch push for a notification."""
    close_old_connections()
    try:
        from .models import Notification, DeviceToken

        if tokens is None or title is None or message is None:
            try:
                notification = Notification.objects.select_related('recipient').get(id=notification_id)
                title = notification.title
                message = notification.message
                target_model = notification.target_model
                target_id = notification.target_id
                url = notification.url
                tokens = list(
                    DeviceToken.objects.filter(user_id=notification.recipient_id).values_list('token', flat=True)
                )
            except Notification.DoesNotExist:
                return

        if not tokens:
            return

        provider = get_push_provider()
        payload_data = {
            'notification_id': str(notification_id or ''),
            'target_model': str(target_model or ''),
            'target_id': str(target_id or ''),
            'url': str(url or ''),
        }
        provider.send(
            tokens=tokens,
            title=title or '',
            body=message or '',
            data=payload_data,
        )
    except Exception as exc:
        logger.exception("Failed to dispatch push notification %s: %s", notification_id, exc)
    finally:
        close_old_connections()


def _schedule_push(
    notification_id: int,
    tokens: list[str] | None = None,
    title: str | None = None,
    message: str | None = None,
    target_model: str | None = None,
    target_id: str | None = None,
    url: str | None = None,
) -> Future:
    """Submit worker task to the module-level ThreadPoolExecutor."""
    global _last_push_thread, _last_push_future
    future = _push_executor.submit(
        _send_push_worker,
        notification_id,
        tokens,
        title,
        message,
        target_model,
        target_id,
        url,
    )
    _last_push_future = future
    _last_push_thread = _FutureThreadAdapter(future)
    return future


@receiver(post_save, sender='notifications.Notification', dispatch_uid='notifications_push_on_notification_created')
def on_notification_created(sender, instance, created, **kwargs):
    """Post-save signal to schedule push notifications upon creation via on_commit."""
    if not created:
        return

    try:
        notification_id = instance.id
        recipient_id = instance.recipient_id
        title = instance.title
        message = instance.message
        target_model = instance.target_model
        target_id = instance.target_id
        url = instance.url

        def _on_commit_callback():
            try:
                from .models import DeviceToken
                tokens = list(
                    DeviceToken.objects.filter(user_id=recipient_id).values_list('token', flat=True)
                )
                if not tokens:
                    return

                _schedule_push(
                    notification_id=notification_id,
                    tokens=tokens,
                    title=title,
                    message=message,
                    target_model=target_model,
                    target_id=target_id,
                    url=url,
                )
            except Exception:
                logger.exception("Failed to schedule push on commit for notification %s", notification_id)

        transaction.on_commit(_on_commit_callback)
    except Exception:
        logger.exception("Failed to register on_commit push handler for notification %s", getattr(instance, 'id', None))


def schedule_push_for_notifications(notifications):
    """
    پوشِ اعلان‌هایی که با bulk_create ساخته شده‌اند (سیگنال post_save برایشان اجرا نمی‌شود).
    بعد از commit، توکن‌های همهٔ گیرندگان با یک کوئری خوانده می‌شوند (ق۱۸)، نه یک کوئری برای هر اعلان.
    """
    items = [
        (n.id, n.recipient_id, n.title, n.message, n.target_model, n.target_id, n.url)
        for n in notifications if getattr(n, 'id', None)
    ]
    if not items:
        return

    def _on_commit_callback():
        try:
            from .models import DeviceToken
            tokens_by_user = {}
            for user_id, token in DeviceToken.objects.filter(
                user_id__in={item[1] for item in items}
            ).values_list('user_id', 'token'):
                tokens_by_user.setdefault(user_id, []).append(token)
            for notification_id, recipient_id, title, message, target_model, target_id, url in items:
                tokens = tokens_by_user.get(recipient_id)
                if tokens:
                    _schedule_push(
                        notification_id=notification_id,
                        tokens=tokens,
                        title=title,
                        message=message,
                        target_model=target_model,
                        target_id=target_id,
                        url=url,
                    )
        except Exception:
            logger.exception("Failed to schedule bulk push on commit")

    transaction.on_commit(_on_commit_callback)
