"""
اعلان داخل برنامهٔ رویداد کار (ص۱ تا ص۶ طرح ۲.۴، ق۵).

گیرندهٔ وب‌سوکت (realtime.on_task_event) پیش از فرستادن، با create_for_event برای هر گیرندهٔ رویداد یک ردیف
Notification می‌سازد (یک bulk_create) و FCM را پس از commit زمان‌بندی می‌کند. رویدادهای «برداشته شد»، «انجام
شد» خود اقدام‌کننده و لغو به دست ثبت‌کننده ردیف نمی‌سازند (فقط کارتابل را تازه می‌کنند). هشدار مدیر کل و
«خبر به بالاتر» بی‌دارندهٔ رتبهٔ بالاتر برای هر مدیر کل فعال ردیف می‌سازند.

شمار پرس‌وجو به شمار گیرندگان وابسته نیست: کاربران فعال، ردیف‌های جانشین، نام اصلی‌ها و دلیل عودت یا رد هر
کدام حداکثر یک پرس‌وجو.
"""
from django.contrib.auth import get_user_model
from django.db import transaction

from . import events

NOTIFICATION_TYPE = 'workflow_task'
TARGET_MODEL = 'WorkflowInstance'
MY_TASKS_URL = '/app/my-tasks'

TITLES_FA = {
    events.RECEIVED: 'کار تازه در کارتابل شما',
    events.REMINDER: 'یادآوری: کاری منتظر اقدام شماست',
    events.ESCALATION: 'کاری بیش از مدت مجاز منتظر مانده است',
    events.SUPERUSER_ALERT: 'کاری بی‌دریافت‌کننده مانده است',
    events.RETURNED: 'سند شما برای اصلاح عودت شد',
    events.REJECTED: 'سند شما رد شد',
}
COMPLETED_TITLE_FA = 'گردش سند شما پایان یافت'

# رویدادهایی که به دارندهٔ کار باز می‌رسند (آدرس «کارهای من» و متن «به جانشینی از …»)
TASK_HOLDER_KINDS = (events.RECEIVED, events.REMINDER)
CREATOR_KINDS = (events.RETURNED, events.REJECTED)


def title_for(event) -> str:
    """عنوان اعلان رویداد، یا '' اگر این رویداد ردیف اعلان نمی‌سازد (ص۲)."""
    kind = event.get('kind')
    if kind == events.DONE:
        # فقط پایان گردش (بی کار) برای ثبت‌کننده؛ «انجام شد» خود اقدام‌کننده نه
        return COMPLETED_TITLE_FA if event.get('task_id') is None else ''
    return TITLES_FA.get(kind, '')


def _spec(event):
    from .registry import workflow_specs
    try:
        return workflow_specs().get(event.get('workflow_key'))
    except Exception:
        return None


def _url(event, spec) -> str:
    kind = event.get('kind')
    if kind in CREATOR_KINDS or kind == events.DONE:
        if spec is not None and event.get('entity_id') is not None:
            return spec.route.replace('{id}', str(event['entity_id']))
        return ''
    return MY_TASKS_URL


def _body(event, spec, instance_title) -> str:
    wf_title = spec.title_fa if spec is not None else ''
    doc = f'«{instance_title}»' if instance_title else ''
    text = ': '.join(p for p in (wf_title, doc) if p) or 'سند'
    step = spec.step(event.get('step_key')) if spec is not None else None
    if step is not None and event.get('kind') not in CREATOR_KINDS and event.get('kind') != events.DONE:
        text = f'{text} — مرحلهٔ «{step.title_fa}»'
    return text


def _recipients(event) -> list:
    """شناسهٔ کاربران فعال گیرندهٔ ردیف اعلان، مرتب و یکتا."""
    User = get_user_model()
    if events.goes_to_superusers(event):
        qs = User.objects.filter(is_active=True, is_superuser=True)
    else:
        ids = {int(u) for u in event.get('user_ids') or () if u}
        if not ids:
            return []
        qs = User.objects.filter(is_active=True, pk__in=ids)
    return sorted(qs.values_list('pk', flat=True))


def _behalf_names(event, user_ids) -> dict:
    """{user_id: 'نام اصلی، …'} برای کسانی که کار را فقط از راه ردیف جانشین دارند (ص۳)."""
    if event.get('kind') not in TASK_HOLDER_KINDS or not event.get('task_id') or not user_ids:
        return {}
    from .models import WorkflowTaskRecipient
    from .substitutes import person
    rows = list(WorkflowTaskRecipient.objects.filter(task_id=event['task_id'], user_id__in=user_ids)
                .select_related('on_behalf_of').only('user_id', 'on_behalf_of'))
    principals = {r.user_id for r in rows if r.on_behalf_of_id is None}
    names = {}
    for r in rows:
        if r.on_behalf_of_id is None or r.user_id in principals:
            continue
        names.setdefault(r.user_id, set()).add(person(r.on_behalf_of)['name'])
    return {uid: '، '.join(sorted(n)) for uid, n in names.items()}


def _reason(event) -> str:
    """دلیل آخرین عودت یا رد همین نمونه (ق۷: دلیل اجباری است)."""
    from .models import WorkflowStep
    action = WorkflowStep.RETURN if event.get('kind') == events.RETURNED else WorkflowStep.REJECT
    row = (WorkflowStep.objects.filter(instance_id=event.get('instance_id'), action=action)
           .order_by('-at', '-id').values_list('reason', flat=True).first())
    return (row or '').strip()


def _instance_title(event) -> str:
    from .models import WorkflowInstance
    summary = (WorkflowInstance.objects.filter(pk=event.get('instance_id'))
               .values_list('summary', flat=True).first()) or {}
    title = summary.get('title') if isinstance(summary, dict) else None
    return str(title).strip() if title else ''


def create_for_event(event) -> dict:
    """
    ساخت ردیف‌های اعلان یک رویداد کار و زمان‌بندی FCM. خروجی {user_id: Notification}؛ رویدادی که اعلان ندارد {}.
    فراخواننده خطا را می‌گیرد؛ این تابع هرگز داخل تراکنش موتور اجرا نمی‌شود (پس از commit).
    """
    title = title_for(event)
    if not title:
        return {}
    user_ids = _recipients(event)
    if not user_ids:
        return {}
    spec = _spec(event)
    body = _body(event, spec, _instance_title(event))
    if event.get('kind') in CREATOR_KINDS:
        reason = _reason(event)
        if reason:
            body = f'{body} — دلیل: {reason}'
    behalf = _behalf_names(event, user_ids)
    url = _url(event, spec)

    from notifications.models import Notification
    from notifications.push import schedule_push_for_notifications
    rows = [
        Notification(
            recipient_id=uid,
            title=title,
            message=f'{body} (به جانشینی از {behalf[uid]})' if uid in behalf else body,
            notification_type=NOTIFICATION_TYPE,
            target_model=TARGET_MODEL,
            target_id=str(event.get('instance_id') or ''),
            url=url,
        )
        for uid in user_ids
    ]
    # savepoint: خطای پایگاه داده اینجا تراکنش بیرونی احتمالی را خراب نکند
    with transaction.atomic():
        created = Notification.objects.bulk_create(rows)
    schedule_push_for_notifications(created)
    return {n.recipient_id: n for n in created}
