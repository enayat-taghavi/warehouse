"""
زمان‌بند گردش کار (ت۱۰ و ت۱۲ طرح ۲.۳)؛ دستور `run_workflow_scheduler` هر چند دقیقه run_tick را اجرا می‌کند.

هر گام در تراکنش خودش و با ثبت خطا اجرا می‌شود تا شکست یکی بقیه را متوقف نکند:
۱. یادآوری: کار باز با دریافت‌کنندهٔ اصلی که مدت یادآوری شرکتش گذشته، یک بار به ردیف‌های معتبر امروز.
۲. خبر به بالاتر: پس از مدت دوم، یک بار به دارندگان بالاترین رتبهٔ حاضر در زنجیرهٔ همان بخش (بخش، پروژه،
   شرکت) که از رتبهٔ نقش مرحله بالاتر است؛ اگر کسی نبود (یا مرحله خودش بالاترین رتبه را دارد) به کانال
   مدیران کل.
۳. بازهٔ جانشینی: ردیف جانشینِ اعلام‌نشده که بازه‌اش امروز را دارد «رسید» می‌گیرد و اعلام‌شده می‌شود؛ ردیف
   تمام‌شده (دادهٔ مشتق) حذف می‌شود و اگر اعلام شده بود «برداشته شد» می‌گیرد.
۴. هم‌سان‌سازی: recompute.safe_recompute(all_tasks=True) حداکثر هر reconcile_minutes دقیقه (کاربر دوباره
   فعال‌شده هم اینجا ردیفش را می‌گیرد).

«فقط یک بار» حتی با دو زمان‌بند همزمان: ردیف‌ها با select_for_update(skip_locked=True) برداشته و در همان
تراکنش علامت می‌خورند. شمار پرس‌وجو به شمار کارها و کاربران وابسته نیست؛ ارسال رویداد پس از commit است.
"""
import datetime
import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from companies.models import section_role_ranks
from companies.org_roles import CoveringIndex, covering_assignment_rows

from . import events
from .models import WorkflowCompanySettings, WorkflowTask, WorkflowTaskRecipient
from .recipients import valid_rows_q

logger = logging.getLogger(__name__)

DEFAULT_RECONCILE_MINUTES = 60
TOLD_Q = Q(on_behalf_of__isnull=True) | Q(announced=True)


def _due_q(now, field, default_hours) -> Q:
    """شرط «مدت گذشته» با مدت هر شرکت (یک پرس‌وجو روی جدول تنظیمات)؛ شرکت بی‌ردیف پیش‌فرض."""
    custom = list(WorkflowCompanySettings.objects.values_list('company_id', field))
    cond = Q(opened_at__lte=now - datetime.timedelta(hours=default_hours))
    if custom:
        cond &= ~Q(instance__company_id__in=[cid for cid, _h in custom])
    for cid, hours in custom:
        cond |= Q(instance__company_id=cid, opened_at__lte=now - datetime.timedelta(hours=hours))
    return cond


def _claim_due(now, stamp_field, hours_field, default_hours, *related):
    """کارهای باز سررسیده و علامت‌نخورده؛ قفل با skip_locked و علامت در همین تراکنش (فقط یک بار)."""
    tasks = list(
        WorkflowTask.objects.select_for_update(skip_locked=True, of=('self',))
        .select_related(*related)
        .filter(is_open=True, has_recipients=True, **{f'{stamp_field}__isnull': True})
        .filter(_due_q(now, hours_field, default_hours))
        .order_by('pk')
    )
    if tasks:
        WorkflowTask.objects.filter(pk__in=[t.pk for t in tasks], **{f'{stamp_field}__isnull': True}).update(
            **{stamp_field: now})
    return tasks


def send_reminders(now, today) -> int:
    """گام ۱ (ت۱۲): یادآوری یک‌باره به ردیف‌های معتبر امروز."""
    with transaction.atomic():
        tasks = _claim_due(now, 'reminder_sent_at', 'reminder_hours',
                           WorkflowCompanySettings.DEFAULT_REMINDER_HOURS, 'instance')
        if not tasks:
            return 0
        users = {}
        for task_id, uid in WorkflowTaskRecipient.objects.filter(
                task_id__in=[t.pk for t in tasks]).filter(valid_rows_q(today)).values_list('task_id', 'user_id'):
            users.setdefault(task_id, set()).add(uid)
        for task in tasks:
            events.emit(events.REMINDER, task.instance, task, users.get(task.pk, ()))
        return len(tasks)


def escalation_targets(tasks, ranks=None) -> dict:
    """
    {task_id: set} دارندگان فعال و غیر مدیر کل بالاترین رتبهٔ حاضر در زنجیرهٔ بخش نمونه که از رتبهٔ نقش مرحله
    بالاتر است؛ مجموعهٔ خالی یعنی مدیران کل. یک پرس‌وجو برای همهٔ کارها (task.instance.section.project بارشده).
    """
    ranks = section_role_ranks() if ranks is None else ranks
    chains = {}
    for task in tasks:
        sec = task.instance.section
        chains[sec.pk] = (sec.project_id, sec.project.company_id)
    index = CoveringIndex(covering_assignment_rows(chains)) if chains else CoveringIndex([])
    out = {}
    for task in tasks:
        sec = task.instance.section
        step_rank = ranks.get(task.role) or 0
        higher = [(uid, ranks.get(role) or 0) for uid, role, *_ in index.covering(sec.pk, sec.project_id,
                                                                                    sec.project.company_id)]
        higher = [(uid, r) for uid, r in higher if r > step_rank]
        top = max((r for _u, r in higher), default=None)
        out[task.pk] = {uid for uid, r in higher if r == top} if top is not None else set()
    return out


def send_escalations(now, today) -> tuple:
    """گام ۲ (ت۱۲): خبر به بالاتر یک‌باره. خروجی (شمار کارها، شمار رفته به مدیران کل)."""
    with transaction.atomic():
        tasks = _claim_due(now, 'escalated_at', 'escalation_hours',
                           WorkflowCompanySettings.DEFAULT_ESCALATION_HOURS, 'instance__section__project')
        if not tasks:
            return 0, 0
        targets = escalation_targets(tasks)
        to_su = 0
        for task in tasks:
            users = targets.get(task.pk) or set()
            if users:
                events.emit(events.ESCALATION, task.instance, task, users)
            else:
                events.emit(events.ESCALATION, task.instance, task, [], to_superusers=True)
                to_su += 1
        return len(tasks), to_su


def _still_told(task_ids, user_ids, exclude_pks, today) -> set:
    """{(task_id, user_id)} که جز ردیف‌های exclude_pks ردیف معتبر و اعلام‌شدهٔ دیگری در همان کار دارند."""
    if not task_ids:
        return set()
    return set(
        WorkflowTaskRecipient.objects.filter(task_id__in=list(task_ids), user_id__in=list(user_ids))
        .exclude(pk__in=list(exclude_pks)).filter(TOLD_Q).filter(valid_rows_q(today))
        .values_list('task_id', 'user_id')
    )


def _locked_substitute_rows(**filters):
    return list(
        WorkflowTaskRecipient.objects.select_for_update(skip_locked=True, of=('self', 'task'))
        .select_related('task__instance').filter(on_behalf_of__isnull=False, **filters).order_by('pk')
    )


def _emit_grouped(kind, rows, skip_pairs):
    by_task = {}
    for row in rows:
        if (row.task_id, row.user_id) not in skip_pairs:
            by_task.setdefault(row.task_id, (row.task, set()))[1].add(row.user_id)
    for task, users in by_task.values():
        events.emit(kind, task.instance, task, users)
    return sum(len(u) for _t, u in by_task.values())


def substitute_window_starts(today) -> int:
    """گام ۳-الف (ت۱۰): «رسید» به جانشینی که بازه‌اش امروز شروع شده (ردیف اعلام‌نشدهٔ معتبر امروز)."""
    with transaction.atomic():
        rows = _locked_substitute_rows(task__is_open=True, announced=False, valid_from__lte=today,
                                       valid_to__gte=today)
        if not rows:
            return 0
        pks = [r.pk for r in rows]
        WorkflowTaskRecipient.objects.filter(pk__in=pks).update(announced=True)
        told = _still_told({r.task_id for r in rows}, {r.user_id for r in rows}, pks, today)
        return _emit_grouped(events.RECEIVED, rows, told)


def substitute_window_ends(today) -> int:
    """
    گام ۳-ب (ت۱۰): حذف ردیف جانشینِ تمام‌شده (دادهٔ مشتق؛ سابقه در WorkflowStep است) و «برداشته شد» به
    دارندهٔ ردیف اعلام‌شده‌ای که ردیف معتبر دیگری در همان کار ندارد.
    """
    with transaction.atomic():
        rows = _locked_substitute_rows(valid_to__lt=today)
        if not rows:
            return 0
        pks = [r.pk for r in rows]
        WorkflowTaskRecipient.objects.filter(pk__in=pks).delete()
        announced = [r for r in rows if r.announced and r.task.is_open]
        told = _still_told({r.task_id for r in announced}, {r.user_id for r in announced}, pks, today)
        return _emit_grouped(events.REMOVED, announced, told)


def _run_step(name, fn, stats):
    try:
        return fn()
    except Exception:
        logger.exception('[workflow scheduler] step %s failed', name)
        stats['errors'].append(name)
        return None


def run_tick(now=None, *, last_reconciled_at=None, reconcile_minutes=DEFAULT_RECONCILE_MINUTES) -> dict:
    """
    یک دور زمان‌بند. هم‌سان‌سازی فقط اگر last_reconciled_at خالی باشد یا reconcile_minutes گذشته باشد.
    خروجی: reminders، escalations، escalations_to_superusers، substitutes_started، substitutes_ended،
    reconciled (آمار recompute یا None)، reconciled_at (زمان آخرین هم‌سان‌سازی برای دور بعد)، errors.
    """
    now = now or timezone.now()
    today = timezone.localdate(now)
    stats = {'reminders': 0, 'escalations': 0, 'escalations_to_superusers': 0, 'substitutes_started': 0,
             'substitutes_ended': 0, 'reconciled': None, 'reconciled_at': last_reconciled_at, 'errors': []}

    stats['substitutes_started'] = _run_step('substitute_starts', lambda: substitute_window_starts(today), stats) or 0
    stats['substitutes_ended'] = _run_step('substitute_ends', lambda: substitute_window_ends(today), stats) or 0
    stats['reminders'] = _run_step('reminders', lambda: send_reminders(now, today), stats) or 0
    escalated = _run_step('escalations', lambda: send_escalations(now, today), stats)
    if escalated:
        stats['escalations'], stats['escalations_to_superusers'] = escalated

    due = (last_reconciled_at is None
           or now - last_reconciled_at >= datetime.timedelta(minutes=max(int(reconcile_minutes), 0)))
    if due:
        from .recompute import safe_recompute
        result = _run_step('reconcile', lambda: safe_recompute(all_tasks=True, today=today, now=now), stats)
        stats['reconciled'] = result
        if result is None and 'reconcile' not in stats['errors']:
            stats['errors'].append('reconcile')
        stats['reconciled_at'] = now
    return stats
