"""
محاسبهٔ دوبارهٔ دریافت‌کنندگان کارهای باز (ت۴ و ت۷ طرح ۲.۳) با شمار پرس‌وجوی ثابت (ق۱۸).

قاعده همان مسیر تک‌کار موتور است (recipients.compute_recipients_batch). پس از هر تغییر انتساب، بستهٔ نقش،
تفاوت مجوز کاربر، جانشین یا غیرفعال شدن کاربر، ردیف‌های کارهای باز اثرپذیرفته با مجموعهٔ تازه یکی می‌شوند و:
- به کسی که تازه ردیف معتبر امروز گرفت «رسید» و به کسی که ردیف معتبرش رفت «برداشته شد» می‌رسد (فقط از راه
  سیگنال task_event)؛ ردیف جانشینِ بازهٔ آینده رویدادی نمی‌گیرد (زمان‌بند ۲.۳-ب هنگام شروع بازه می‌فرستد)؛
- کار «تأیید» که دریافت‌کنندهٔ اصلی‌اش را از دست داد با قاعدهٔ ۳ ت۶ رد می‌شود و گردش پیش می‌رود (ردیف auto)؛
- کار «بررسی» و «اجرا» بی‌دریافت‌کننده منتظر می‌ماند و فقط هنگام گذار یک «هشدار مدیر کل» صادر می‌شود؛
- کار منتظری که دریافت‌کننده پیدا کرد has_recipients=True و «رسید» می‌گیرد.

کار «تأیید» که از پیش بی‌دریافت‌کننده باز شده (اجباری، ت۱۵) خودکار رد نمی‌شود تا گردش هرگز خودکار پایان نیابد.
قفل‌ها به ترتیب موتور: نخست نمونه‌ها (به ترتیب شناسه) و سپس کارها.
"""
import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.permission_events import companies_of_users
from accounts.scoped_permissions import effective_bundles

from . import events
from .errors import WorkflowError
from .models import WorkflowInstance, WorkflowTask, WorkflowTaskRecipient
from .recipients import compute_recipients_batch, desired_rows, diff_rows, write_row_changes
from .registry import APPROVE, workflow_specs

logger = logging.getLogger(__name__)


def _affected_instance_ids(company_ids, user_ids, all_tasks) -> list:
    qs = WorkflowTask.objects.filter(is_open=True)
    if not all_tasks:
        users = {int(u) for u in (user_ids or ()) if u}
        companies = {int(c) for c in (company_ids or ()) if c}
        conds = []
        if users:
            companies |= companies_of_users(users)
            conds.append(Q(id__in=WorkflowTaskRecipient.objects.filter(
                Q(user_id__in=list(users)) | Q(on_behalf_of_id__in=list(users))).values('task_id')))
        if companies:
            conds.append(Q(instance__company_id__in=list(companies)))
        if not conds:
            return []
        cond = conds[0]
        for extra in conds[1:]:
            cond |= extra
        qs = qs.filter(cond)
    return list(qs.order_by().values_list('instance_id', flat=True).distinct())


def _version_sync(instance, stats) -> None:
    """نمونهٔ با نسخهٔ قدیم از مسیر تک‌نمونهٔ ت۱۵ (که خودش دریافت‌کنندگان را تازه می‌کند)؛ نادر."""
    from .engine import _ctx_for, _ensure_current_version
    try:
        if _ensure_current_version(instance, _ctx_for(instance)):
            stats['version_synced'] += 1
    except WorkflowError:
        logger.warning('[workflow] version sync skipped for instance %s', instance.pk)


def _skip_lost(spec, instance, task, holders, bundles, now, stats) -> bool:
    """قاعدهٔ ۳ ت۶ روی کار «تأیید» بی‌دریافت‌کننده. False اگر سند پیدا نشد (کار منتظر می‌ماند)."""
    from .engine import _Ctx, _resolve, skip_lost_task
    try:
        obj = _resolve(spec, instance.entity_id, None)
    except WorkflowError:
        logger.warning('[workflow] entity missing, task %s left waiting', task.pk)
        return False
    ctx = _Ctx(spec, obj, instance.section)
    ctx._bundles = bundles
    skip_lost_task(ctx, instance, task, holders, now)
    stats['skipped'] += 1
    return True


def recompute_open_tasks(*, company_ids=None, user_ids=None, all_tasks=False, today=None, now=None) -> dict:
    """
    محاسبهٔ دوبارهٔ ردیف‌های کارهای باز.
    مجموعهٔ اثرپذیرفته: کارهای باز نمونه‌های company_ids ∪ کارهای بازی که یکی از user_ids در آن‌ها ردیف دارد
    (خودش یا به جانشینی از او) ∪ کارهای باز شرکت‌های فعلی user_ids؛ all_tasks=True یعنی همهٔ کارهای باز.
    شمار پرس‌وجو مستقل از شمار کارها و بخش‌هاست، به‌جز رد شدن‌های قاعدهٔ ۳ (برای هر کدام مسیر موتور).
    خروجی آمار: tasks، received، removed، skipped، alerts، gained، version_synced.
    """
    stats = {'tasks': 0, 'received': 0, 'removed': 0, 'skipped': 0, 'alerts': 0, 'gained': 0, 'version_synced': 0}
    today = today or timezone.localdate()
    now = now or timezone.now()
    with transaction.atomic():
        instance_ids = _affected_instance_ids(company_ids, user_ids, all_tasks)
        if not instance_ids:
            return stats
        # کار ارجاع باز روی نمونهٔ پایان‌یافته یا عودت‌شده هم می‌ماند (ر۵ و ر۹ طرح ۲.۳-و)
        open_referrals = WorkflowTask.objects.filter(is_open=True, track=WorkflowTask.TRACK_REFERRAL).values('instance_id')
        instances = {
            inst.pk: inst for inst in WorkflowInstance.objects.select_for_update(of=('self',))
            .select_related('section__project')
            .filter(Q(status=WorkflowInstance.IN_PROGRESS) | Q(pk__in=open_referrals), pk__in=instance_ids)
            .order_by('pk')
        }
        specs = workflow_specs()
        stale_version = [
            inst for inst in instances.values()
            if inst.status == WorkflowInstance.IN_PROGRESS and inst.workflow_key in specs
            and specs[inst.workflow_key].version != inst.version
        ]
        synced = set()
        for inst in stale_version:
            # مسیر ت۱۵ فقط کار مرحله را تازه می‌کند؛ کارهای ارجاع همین نمونه پایین‌تر حساب می‌شوند
            _version_sync(inst, stats)
            synced.add(inst.pk)
        if not instances:
            return stats
        tasks = [
            t for t in WorkflowTask.objects.select_for_update().filter(
                instance_id__in=list(instances), is_open=True).order_by('pk')
            if t.track == WorkflowTask.TRACK_REFERRAL
            or (t.instance_id not in synced and instances[t.instance_id].status == WorkflowInstance.IN_PROGRESS)
        ]
        if not tasks:
            return stats
        stats['tasks'] = len(tasks)
        bundles = effective_bundles()
        items = []
        for task in tasks:
            inst = instances[task.instance_id]
            sec = inst.section
            target = task.target_user_id if task.track == WorkflowTask.TRACK_REFERRAL else None
            items.append((task.pk, (sec.pk, sec.project_id, sec.project.company_id), task.role, task.permission,
                          inst.created_by_id, target, inst.allow_substitute))
        computed = compute_recipients_batch(items, bundles=bundles, today=today)

        existing = {}
        for pk, task_id, uid, behalf, start, end, announced in WorkflowTaskRecipient.objects.filter(
                task_id__in=[t.pk for t in tasks]).values_list(
                'id', 'task_id', 'user_id', 'on_behalf_of_id', 'valid_from', 'valid_to', 'announced'):
            existing.setdefault(task_id, {})[(uid, behalf)] = (pk, start, end, announced)

        all_stale, all_new, all_changed = [], [], []
        gained, alerted, lost = [], [], []
        for task in tasks:
            inst = instances[task.instance_id]
            principals, subs, holders = computed[task.pk]
            if (not principals and task.track == WorkflowTask.TRACK_STEP and task.step_kind == APPROVE
                    and task.has_recipients and inst.workflow_key in specs):
                lost.append((task, holders))
                continue
            stale, new, changed, received, removed = diff_rows(
                task.pk, existing.get(task.pk, {}), desired_rows(principals, subs), today)
            all_stale += stale
            all_new += new
            all_changed += changed
            events.emit(events.RECEIVED, inst, task, received)
            events.emit(events.REMOVED, inst, task, removed)
            stats['received'] += len(received)
            stats['removed'] += len(removed)
            if principals and not task.has_recipients:
                gained.append(task.pk)
            elif not principals and task.has_recipients:
                alerted.append(task.pk)
                events.emit(events.SUPERUSER_ALERT, inst, task, [])
        write_row_changes(all_stale, all_new, all_changed)
        if gained:
            WorkflowTask.objects.filter(pk__in=gained).update(has_recipients=True)
        if alerted:
            WorkflowTask.objects.filter(pk__in=alerted).update(has_recipients=False, superuser_alerted_at=now)
        stats['gained'], stats['alerts'] = len(gained), len(alerted)

        for task, holders in lost:
            inst = instances[task.instance_id]
            try:
                # هر رد شدن در savepoint خودش: خطای یک سند (مثلاً on_state_change ماژول) نوشته‌های دیگر را برنمی‌گرداند
                with transaction.atomic():
                    skipped = _skip_lost(specs[inst.workflow_key], inst, task, holders, bundles, now, stats)
            except Exception:
                logger.exception('[workflow] skipping lost task %s failed; task left waiting', task.pk)
                # تغییرهای حافظه‌ای رد شدن ناتمام برگشت‌خورده‌اند؛ نسخهٔ پایگاه داده معتبر است
                inst.refresh_from_db()
                task.refresh_from_db()
                skipped = False
            if not skipped:
                # سند پیدا نشد یا رد شدن شکست خورد: مثل کار منتظر (ردیف‌ها برداشته و یک هشدار)
                from .recipients import sync_task_recipients
                _received, removed = sync_task_recipients(task, set(), [], today=today)
                events.emit(events.REMOVED, inst, task, removed)
                WorkflowTask.objects.filter(pk=task.pk).update(has_recipients=False, superuser_alerted_at=now)
                events.emit(events.SUPERUSER_ALERT, inst, task, [])
                stats['alerts'] += 1
    return stats


def safe_recompute(**kwargs):
    """
    اجرای recompute_open_tasks درون savepoint برای قلاب‌ها: خطای محاسبهٔ دوباره هرگز تغییر مجوز، انتساب یا
    جانشین فراخوان را برنمی‌گرداند یا متوقف نمی‌کند (فقط ثبت می‌شود).
    """
    try:
        with transaction.atomic():
            return recompute_open_tasks(**kwargs)
    except Exception:
        logger.exception('[workflow] recompute_open_tasks failed (%s)', kwargs)
        return None
