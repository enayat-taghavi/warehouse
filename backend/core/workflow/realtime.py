"""
گیرندهٔ وب‌سوکت رویداد کار (ت۱۶ طرح ۲.۳).

هر رویداد task_event فقط به کانال شخصی هر کاربر درگیر (`user_{id}`) می‌رود، با payload جداگانه برای هر نفر که
فهرست گیرندگان (user_ids) و شناسهٔ کاربران دیگر را ندارد (فقط انجام‌دهنده، actor_id). هشدار مدیر کل و «خبر به
بالاتر» بی‌دارندهٔ رتبهٔ بالاتر فقط به کانال `superuser_notifications` می‌روند. **هرگز کانال شرکت یا عمومی**
(درس ا۱ طرح ۲.۲): عنوان و مبلغ سند نباید به همهٔ اعضای شرکت برسد؛ برای همین خلاصهٔ سند هم فرستاده نمی‌شود و
کارتابل آن را از API می‌خواند.

پیش از فرستادن، ردیف‌های اعلان داخل برنامه با notify.create_for_event ساخته می‌شوند (طرح ۲.۴-الف، ق۵) و پیام
شخصی هر نفر شناسه، عنوان و آدرس اعلان خودش را دارد؛ پیام کانال مدیران کل فقط عنوان و آدرس (شناسه‌ها شخصی‌اند).

channels هنگام import بار نمی‌شود و خطای ساخت اعلان یا لایهٔ کانال هرگز به موتور نمی‌رسد (فقط ثبت می‌شود).
"""
import logging

from . import events, notify

logger = logging.getLogger(__name__)

# همان نام گروه NotificationConsumer (notifications/consumers.py و companies/realtime.py)
SUPERUSER_GROUP = 'superuser_notifications'
EVENT_TYPE = 'workflow_task'

# کلیدهای رویداد که به کلاینت می‌روند؛ user_ids هرگز
PUBLIC_KEYS = ('task_id', 'instance_id', 'workflow_key', 'entity_kind', 'entity_id', 'step_key', 'company_id',
               'section_id', 'actor_id')

MESSAGES_FA = {
    events.RECEIVED: 'کار تازه‌ای در کارتابل شما رسید',
    events.DONE: 'کار انجام شد',
    events.REMOVED: 'کاری از کارتابل شما برداشته شد',
    events.RETURNED: 'سند شما برای اصلاح عودت شد',
    events.REJECTED: 'سند شما رد شد',
    events.CANCELLED: 'سند لغو شد',
    events.REMINDER: 'یادآوری: کاری در کارتابل شما منتظر اقدام است',
    events.ESCALATION: 'کاری بیش از مدت مجاز منتظر اقدام مانده است',
    events.SUPERUSER_ALERT: 'کاری بی‌دریافت‌کننده مانده است',
}
COMPLETED_FA = 'گردش سند شما پایان یافت'


def _message(event, note=None, title='', url='') -> dict:
    kind = event.get('kind')
    text = COMPLETED_FA if kind == events.DONE and event.get('task_id') is None else MESSAGES_FA.get(kind, '')
    msg = {
        'type': 'send_notification',
        'type_str': EVENT_TYPE,
        'notification_type': EVENT_TYPE,
        'workflow_event': kind,
        'message': text,
    }
    for key in PUBLIC_KEYS:
        msg[key] = event.get(key)
    if events.goes_to_superusers(event):
        msg['to_superusers'] = True
    if note is not None:
        msg['notification_id'] = note.pk
        msg['created_at'] = note.created_at.isoformat() if note.created_at else None
        title, url = note.title, note.url
    if title:
        msg['title'] = title
        msg['url'] = url
    return msg


def target_messages(event, notes=None) -> list:
    """
    [(group, message)] یک رویداد؛ فقط کانال‌های شخصی یا کانال مدیران کل. notes: {user_id: Notification}
    خروجی notify.create_for_event (شناسهٔ اعلان فقط در پیام شخصی همان نفر).
    """
    notes = notes or {}
    if events.goes_to_superusers(event):
        any_note = next(iter(notes.values()), None)
        title = any_note.title if any_note is not None else ''
        url = any_note.url if any_note is not None else ''
        return [(SUPERUSER_GROUP, _message(event, title=title, url=url))]
    out = []
    for uid in sorted({int(u) for u in event.get('user_ids') or () if u}):
        out.append((f'user_{uid}', _message(event, note=notes.get(uid))))
    return out


def on_task_event(sender, event, **kwargs):
    """گیرندهٔ task_event (پس از commit)؛ خطای ساخت اعلان یا لایهٔ کانال فقط ثبت می‌شود."""
    try:
        notes = notify.create_for_event(event)
    except Exception:
        logger.exception('[workflow] creating notifications failed')
        notes = {}
    try:
        messages = target_messages(event, notes)
    except Exception:
        logger.exception('[workflow] building websocket messages failed')
        return
    if not messages:
        return
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
    except Exception as exc:
        logger.warning('[workflow] channel layer unavailable: %s', exc)
        return
    if layer is None:
        return
    send = async_to_sync(layer.group_send)
    for group, message in messages:
        try:
            send(group, message)
        except Exception as exc:
            logger.warning('[workflow] websocket send to %s failed: %s', group, exc)


def connect():
    events.task_event.connect(on_task_event, weak=False, dispatch_uid='workflow_realtime_task_event')
