"""
رویداد کار گردش کار (ت۱۶ طرح ۲.۳): فقط سیگنال هسته؛ ارسال وب‌سوکت (کانال شخصی کاربران و برای هشدار
مدیر کل کانال superuser_notifications) کار گیرندهٔ سیگنال در زیرگام‌های بعدی است و هرگز کانال شرکت یا عمومی.

رویدادها هنگام تراکنش جمع می‌شوند و فقط پس از commit با `transaction.on_commit` فرستاده می‌شوند؛ تراکنش
برگشت‌خورده رویدادی نمی‌فرستد.

payload (کلید `event` در send):
    {'kind', 'task_id', 'instance_id', 'workflow_key', 'entity_kind', 'entity_id', 'step_key', 'track',
     'user_ids': [...], 'actor_id', 'company_id', 'section_id'}
"""
from django.db import transaction
from django.dispatch import Signal

# task_event.send(sender=WorkflowTask, event=payload)
task_event = Signal()

RECEIVED = 'received'
DONE = 'done'
REMOVED = 'removed'
RETURNED = 'returned'
REJECTED = 'rejected'
CANCELLED = 'cancelled'
REMINDER = 'reminder'
ESCALATION = 'escalation'
SUPERUSER_ALERT = 'superuser_alert'

EVENT_KINDS = (RECEIVED, DONE, REMOVED, RETURNED, REJECTED, CANCELLED, REMINDER, ESCALATION, SUPERUSER_ALERT)


def build_payload(kind, instance, task, user_ids, actor_id=None, step_key=None) -> dict:
    """payload یک رویداد؛ step_key پیش‌فرض مرحلهٔ کار است."""
    return {
        'kind': kind,
        'task_id': getattr(task, 'pk', None),
        'instance_id': instance.pk,
        'workflow_key': instance.workflow_key,
        'entity_kind': instance.entity_kind,
        'entity_id': instance.entity_id,
        'step_key': step_key if step_key is not None else getattr(task, 'step_key', ''),
        'track': getattr(task, 'track', '') or '',
        'user_ids': sorted({int(u) for u in user_ids if u}),
        'actor_id': actor_id,
        'company_id': instance.company_id,
        'section_id': instance.section_id,
    }


def goes_to_superusers(payload) -> bool:
    """رویدادی که گیرنده‌اش کانال مدیران کل است: هشدار مدیر کل، یا خبر به بالاتر بی‌دارندهٔ رتبهٔ بالاتر."""
    return payload.get('kind') == SUPERUSER_ALERT or bool(payload.get('to_superusers'))


def emit(kind, instance, task, user_ids, actor_id=None, step_key=None, *, to_superusers=False) -> None:
    """
    ثبت رویداد برای ارسال پس از commit. رویداد بی‌گیرنده فرستاده نمی‌شود، به‌جز هشدار مدیر کل و «خبر به بالاتر»
    با to_superusers=True (وقتی در بخش کسی با رتبهٔ بالاتر نیست، ت۱۲) که گیرنده‌شان کانال مدیران کل است
    (user_ids خالی؛ کلید to_superusers فقط در همین حالت در payload می‌آید).
    """
    payload = build_payload(kind, instance, task, [] if to_superusers else user_ids, actor_id=actor_id,
                            step_key=step_key)
    if to_superusers:
        if kind != ESCALATION:
            raise ValueError('to_superusers only for escalation')
        payload['to_superusers'] = True
    if not payload['user_ids'] and not goes_to_superusers(payload):
        return
    from .models import WorkflowTask
    transaction.on_commit(lambda: task_event.send(sender=WorkflowTask, event=payload))
