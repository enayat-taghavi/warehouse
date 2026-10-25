"""
راه عمومی هسته برای ساختن اعلان (ص۷ طرح ۲.۴، ق۵).

ماژول‌ها `Notification` را مستقیم نمی‌سازند (نگهبان در `module_coupling_scan.py`)؛ از `notify_users` استفاده می‌کنند:
ردیف‌ها با یک bulk_create، پیام شخصی وب‌سوکت `user_{id}` و FCM پس از commit. شمار پرس‌وجو به شمار گیرندگان
وابسته نیست (کاربران فعال یک پرس‌وجو، ساخت ردیف‌ها یک پرس‌وجو، توکن‌های FCM یک پرس‌وجو).
"""
import logging

from django.contrib.auth import get_user_model
from django.db import transaction

logger = logging.getLogger(__name__)


def _clean_ids(user_ids) -> list:
    ids = set()
    for uid in user_ids or ():
        try:
            if uid:
                ids.add(int(uid))
        except (TypeError, ValueError):
            continue
    return sorted(ids)


def create_notifications(user_ids, *, title, message, notification_type, target_model='', target_id='',
                         url='', message_for=None, active_only=True) -> list:
    """
    ساخت ردیف‌های اعلان با یک bulk_create و زمان‌بندی FCM پس از commit. خروجی فهرست ردیف‌های ساخته‌شده.
    `message_for` اختیاری: {user_id: متن} برای متن جدا (مثلاً «به جانشینی از …»). خطا به فراخواننده می‌رسد.
    """
    from .models import Notification
    from .push import schedule_push_for_notifications

    ids = _clean_ids(user_ids)
    if ids and active_only:
        User = get_user_model()
        ids = sorted(User.objects.filter(is_active=True, pk__in=ids).values_list('pk', flat=True))
    if not ids:
        return []
    message_for = message_for or {}
    rows = [
        Notification(
            recipient_id=uid,
            title=title,
            message=message_for.get(uid, message),
            notification_type=notification_type,
            target_model=target_model,
            target_id=str(target_id or ''),
            url=url or '',
        )
        for uid in ids
    ]
    # savepoint: خطای پایگاه داده اینجا تراکنش بیرونی احتمالی را خراب نکند
    with transaction.atomic():
        created = Notification.objects.bulk_create(rows)
    schedule_push_for_notifications(created)
    return created


def notify_users(user_ids, *, title, message, notification_type, target_model='', target_id='', url='',
                 company_id=None, extra=None) -> dict:
    """
    اعلان به کاربران فعال: ردیف، پیام شخصی وب‌سوکت و FCM، پس از commit تراکنش جاری (بیرون از تراکنش، همین حالا).
    خطاها فقط ثبت می‌شوند و به فراخواننده نمی‌رسند.
    خروجی {user_id: Notification}؛ اگر اجرا به پس از commit افتاده باشد، تا آن زمان خالی است.
    """
    result = {}
    ids = _clean_ids(user_ids)
    if not ids:
        return result
    target_id = str(target_id or '')

    def _run():
        try:
            created = create_notifications(
                ids, title=title, message=message, notification_type=notification_type,
                target_model=target_model, target_id=target_id, url=url,
            )
        except Exception:
            logger.exception('[Notification] notify_users failed to create rows (type=%s)', notification_type)
            return
        result.update({n.recipient_id: n for n in created})
        if not created:
            return
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
        except Exception:
            logger.exception('[Notification] notify_users has no channel layer (type=%s)', notification_type)
            return
        if not channel_layer:
            return
        for n in created:
            try:
                payload = dict(extra or {})
                payload.update({
                    'type': 'send_notification',
                    'type_str': notification_type,
                    'notification_id': n.id,
                    'title': n.title,
                    'message': n.message,
                    'target_model': n.target_model,
                    'target_id': n.target_id,
                    'url': n.url,
                    'company_id': company_id,
                    'created_at': n.created_at.isoformat(),
                })
                async_to_sync(channel_layer.group_send)(f'user_{n.recipient_id}', payload)
            except Exception:
                logger.exception('[Notification] notify_users failed to send websocket message (user=%s, type=%s)',
                                 n.recipient_id, notification_type)

    transaction.on_commit(_run)
    return result
