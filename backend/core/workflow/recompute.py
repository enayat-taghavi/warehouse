"""
محاسبهٔ دوبارهٔ دریافت‌کنندگان کارهای باز (ت۴ و ت۷ طرح ۲.۳) با شمار پرس‌وجوی ثابت (ق۱۸).

قاعده همان مسیر تک‌کار موتور است (recipients.compute_recipients_batch). پس از هر تغییر انتساب، بستهٔ نقش،
تفاوت مجوز کاربر، جانشین یا غیرفعال شدن کاربر، ردیف‌های کارهای باز اثرپذیرفته با مجموعهٔ تازه یکی می‌شوند و:
- به کسی که تازه ردیف معتبر امروز گرفت «رسید» و به کسی که ردیف معتبرش رفت «برداشته شد» می‌رسد (فقط از راه
  سیگنال task_event)؛ ردیف جانشینِ بازهٔ آینده رویدادی نمی‌گیرد (زمان‌بند ۲.۳-ب هنگام شروع بازه می‌فرستد)؛
- کار بی‌دریافت‌کننده با تنظیم مؤثر «رد شود» (طرح نبودن نفر بند ۴-۳) رد می‌شود و گردش پیش می‌رود (ردیف auto)،
  حتی اگر از قبل منتظر بوده؛ مرحلهٔ پرداخت با «پرداخت بیرون از سامانه» مگر قلاب can_settle_outside منع کند؛
- با «منتظر بماند» کار منتظر می‌ماند و فقط هنگام گذار یک «خبر انتظار» (رویداد waiting) صادر می‌شود؛
- کار منتظری که دریافت‌کننده پیدا کرد has_recipients=True و «رسید» می‌گیرد.

کار forced (open_at_step و آخرین مرحلهٔ نسخهٔ تازه) هرگز خودکار رد نمی‌شود تا گردش هرگز خودکار پایان نیابد.
مرحله‌های گذشته دوباره باز نمی‌شوند و نمونهٔ بسته دست نمی‌خورد.
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
from .policy import effective_policies, waiting_targets
from .recipients import compute_recipients_batch, desired_rows, diff_rows, scope_triplet, write_row_changes
from .registry import SKIP, workflow_specs

logger = logging.getLogger(__name__)


def _affected_instance_ids(company_ids, user_ids, all_tasks, workflow_keys=None) -> list:
    qs = WorkflowTask.objects.filter(is_open=True)
    if workflow_keys is not None:
        qs = qs.filter(instance__workflow_key__in=list(workflow_keys))
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


def _skip_lost(spec, instance, task, holders, bundles, now, stats, policy=None) -> bool:
    """
    تنظیم «رد شود» روی کار بی‌دریافت‌کننده. False اگر سند پیدا نشد یا قلاب can_settle_outside منع کرد (کار
    منتظر می‌ماند).
    """
    from .engine import SettleBlocked, _Ctx, _resolve, skip_lost_task
    try:
        obj = _resolve(spec, instance.entity_id, None)
    except WorkflowError:
        logger.warning('[workflow] entity missing, task %s left waiting', task.pk)
        return False
    ctx = _Ctx(spec, obj, instance.section, instance.company_id)
    ctx._bundles = bundles
    ctx._policy = policy
    try:
        skip_lost_task(ctx, instance, task, holders, now)
    except SettleBlocked:
        return False
    stats['skipped'] += 1
    return True


def recompute_open_tasks(*, company_ids=None, user_ids=None, all_tasks=False, workflow_keys=None, today=None,
                         now=None) -> dict:
    """
    محاسبهٔ دوبارهٔ ردیف‌های کارهای باز.
    مجموعهٔ اثرپذیرفته: کارهای باز نمونه‌های company_ids ∪ کارهای بازی که یکی از user_ids در آن‌ها ردیف دارد
    (خودش یا به جانشینی از او) ∪ کارهای باز شرکت‌های فعلی user_ids؛ all_tasks=True یعنی همهٔ کارهای باز.
    workflow_keys (تغییر تنظیم، بند ۴-۴): فقط نمونه‌های همین گردش‌ها.
    شمار پرس‌وجو مستقل از شمار کارها و بخش‌هاست، به‌جز رد شدن‌های قاعدهٔ ۳ (برای هر کدام مسیر موتور).
    خروجی آمار: tasks، received، removed، skipped، alerts، gained، version_synced.
    """
    from .engine import wait_reason_for
    stats = {'tasks': 0, 'received': 0, 'removed': 0, 'skipped': 0, 'alerts': 0, 'gained': 0, 'version_synced': 0}
    today = today or timezone.localdate()
    now = now or timezone.now()
    with transaction.atomic():
        instance_ids = _affected_instance_ids(company_ids, user_ids, all_tasks, workflow_keys)
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
        step_specs = {}
        # طرح نبودن نفر: تنظیم مؤثر همهٔ (شرکت، گردش)ها با یک پرس‌وجو (ق۱۸)
        policies = effective_policies({(instances[t.instance_id].company_id, instances[t.instance_id].workflow_key)
                                       for t in tasks})
        for task in tasks:
            inst = instances[task.instance_id]
            is_step = task.track == WorkflowTask.TRACK_STEP
            spec = specs.get(inst.workflow_key) if is_step else None
            step = spec.step(task.step_key) if spec is not None else None
            # ل-۰: کار مرحلهٔ assignees مثل کار ارجاع فقط گیرندهٔ انتخاب‌شدهٔ خودش را دارد (تغییر نقش آن را
            # برنمی‌دارد و به دارندهٔ دیگری نمی‌دهد)؛ کار مرحلهٔ نقش‌محور مثل پیش
            target = task.target_user_id if (not is_step or (step is not None and step.assignees is not None)) else None
            if is_step and step is not None and step.assignees is not None and target is None:
                target = 0  # کار اجباری بی نفر انتخاب‌شده: هرگز دارندگان نقش
            step_specs[task.pk] = step
            policy = policies.get((inst.company_id, inst.workflow_key))
            items.append((task.pk, scope_triplet(inst.section, inst.company_id), task.role, task.permission,
                          inst.created_by_id, target, inst.allow_substitute,
                          step is not None and (step.creator_may_act or bool(
                              policy is not None and policy.creator_may_approve_own))))
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
            step = step_specs[task.pk]
            policy = policies.get((inst.company_id, inst.workflow_key))
            # تنظیم «رد شود»: کار بی‌دریافت‌کننده رد می‌شود حتی اگر از قبل منتظر بوده (بند ۴-۳)، هرگز کار forced
            if (not principals and task.track == WorkflowTask.TRACK_STEP and not task.forced
                    and step is not None and policy is not None and policy.missing_action(step) == SKIP):
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
                alerted.append((task, wait_reason_for(inst, holders)))
        write_row_changes(all_stale, all_new, all_changed)
        if gained:
            WorkflowTask.objects.filter(pk__in=gained).update(has_recipients=True, wait_reason='')
        for task, reason in alerted:
            # گذار به «منتظر»: یک خبر انتظار (گیرندگان همهٔ شرکت‌ها با شمار پرس‌وجوی ثابت، پایین‌تر)
            WorkflowTask.objects.filter(pk=task.pk).update(has_recipients=False, superuser_alerted_at=now,
                                                           wait_reason=reason)
        waiting = [(instances[t.instance_id], t) for t, _r in alerted]
        stats['gained'], stats['alerts'] = len(gained), len(alerted)

        for task, holders in lost:
            inst = instances[task.instance_id]
            was_waiting = not task.has_recipients
            try:
                # هر رد شدن در savepoint خودش: خطای یک سند (مثلاً on_state_change ماژول) نوشته‌های دیگر را برنمی‌گرداند
                with transaction.atomic():
                    skipped = _skip_lost(specs[inst.workflow_key], inst, task, holders, bundles, now, stats,
                                         policies.get((inst.company_id, inst.workflow_key)))
            except Exception:
                logger.exception('[workflow] skipping lost task %s failed; task left waiting', task.pk)
                # تغییرهای حافظه‌ای رد شدن ناتمام برگشت‌خورده‌اند؛ نسخهٔ پایگاه داده معتبر است
                inst.refresh_from_db()
                task.refresh_from_db()
                skipped = False
            if not skipped:
                # سند پیدا نشد، قلاب can_settle_outside منع کرد یا رد شدن شکست خورد: مثل کار منتظر (ردیف‌ها
                # برداشته و فقط هنگام گذار یک خبر انتظار)
                from .recipients import sync_task_recipients
                _received, removed = sync_task_recipients(task, set(), [], today=today)
                events.emit(events.REMOVED, inst, task, removed)
                if not was_waiting:
                    WorkflowTask.objects.filter(pk=task.pk).update(
                        has_recipients=False, superuser_alerted_at=now, wait_reason=wait_reason_for(inst, holders))
                    waiting.append((inst, task))
                    stats['alerts'] += 1
        _emit_waiting_batch(waiting, policies)
    return stats


def _emit_waiting_batch(waiting, policies) -> None:
    """خبر انتظار کارهایی که به «منتظر» رسیدند؛ گیرندگان همهٔ (شرکت، گردش)ها با شمار پرس‌وجوی ثابت."""
    if not waiting:
        return
    targets = waiting_targets({(inst.company_id, inst.workflow_key) for inst, _t in waiting}, policies)
    for inst, task in waiting:
        users = targets.get((inst.company_id, inst.workflow_key)) or set()
        if users:
            events.emit(events.WAITING, inst, task, users)
        else:
            events.emit(events.WAITING, inst, task, [], to_superusers=True)


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
