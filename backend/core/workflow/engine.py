"""
موتور گردش کار هسته (طرح ۲.۳-الف): ارسال، اقدام، عودت، رد، لغو و دیدن سند از راه کار.

قاعده‌ها:
- ت۳: دریافت‌کننده = نقش مرحله در بخش ∩ مجوز مرحله در همان بخش − ثبت‌کننده؛ مدیر کل دریافت‌کننده نیست ولی
  روی هر کار جز سند خودش اقدام می‌کند (as_superuser در سابقه).
- ت۶ (فقط مرحله‌های «تأیید»؛ «بررسی» و «اجرا» همیشه اجباری‌اند): ۱. سقف، ۲. سطح ثبت‌کننده (هنگام ارسال،
  در skip_plan)، ۳. بی‌دریافت‌کننده (هنگام رسیدن به مرحله).
- ت۸: عودت و رد با دلیل؛ لغو فقط به دست ثبت‌کننده و پیش از اقدام نفر دیگر.
- ت۱۳: هر اقدام در transaction.atomic با select_for_update روی نمونه و کار (به همین ترتیب) و سنجش revision.
- ت۱۵: نمونهٔ باز با نسخهٔ قدیم پیش از هر اقدام به نسخهٔ تازه برده می‌شود.

قرارداد سابقه (WorkflowStep): هر جابه‌جایی یک ردیف دارد. مرحله‌هایی که در همان جابه‌جایی رد شدند در `skipped`
همان ردیف می‌آیند: ردیف submit رد شدن‌های قاعدهٔ ۱ و ۲ (به ترتیب مرحله) و سپس رد شدن‌های رسیدن (قاعدهٔ ۳)؛
ردیف act رد شدن‌های رسیدن پس از اقدام؛ ردیف auto رد شدن‌های تغییر نسخه. مرحله‌های skip_plan هنگام عبور بعدی
دوباره ثبت نمی‌شوند (یک بار در ردیف submit ثبت شده‌اند). to_step کلید مرحلهٔ رسیده یا وضعیت پایانی است.
"""
import json
from decimal import Decimal

from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from companies.models import ProjectSection, section_role_ranks
from platform_core.registry import is_entity_locked, resolve_entity

from . import events
from .errors import ReasonRequired, TaskAlreadyDone, WorkflowError, WorkflowPermissionDenied, WorkflowStateError
from .models import (
    WorkflowInstance, WorkflowStep, WorkflowTask, WorkflowTaskRecipient, WorkflowThreshold,
)
from .recipients import (
    clear_task_recipients, company_member_pairs, compute_recipients_batch, creator_rank as _creator_rank,
    row_valid_on, sync_task_recipients, valid_rows_q,
)
from .registry import (
    ACT, APPROVE, CANCELLED, COMPLETED, REFER, REFERRAL_KINDS, REJECT, REJECTED, RETURN, RETURNED, get_spec,
    workflow_specs,
)

# کدهای دلیل رد شدن مرحله (ت۱۴)
SKIP_THRESHOLD = 'threshold'
SKIP_CREATOR_LEVEL = 'creator_level'
SKIP_NO_RECIPIENT = 'no_recipient'
SKIP_NO_SECOND_APPROVAL = 'no_second_approval'
SKIP_VERSION_REMOVED = 'version_removed'

RESTARTABLE = (WorkflowInstance.RETURNED, WorkflowInstance.CANCELLED)


# ─── کمکی‌ها ───────────────────────────────────────────────────────────────────

class _Ctx:
    """دادهٔ مشترک یک اقدام: اعلام، سند، بخش (با پروژه) و کش رتبه‌ها و بسته‌ها."""

    def __init__(self, spec, obj, section):
        self.spec = spec
        self.obj = obj
        self.section = section
        self._ranks = None
        self._bundles = None

    @property
    def ranks(self):
        if self._ranks is None:
            self._ranks = section_role_ranks()
        return self._ranks

    @property
    def bundles(self):
        if self._bundles is None:
            from accounts.scoped_permissions import effective_bundles
            self._bundles = effective_bundles()
        return self._bundles


def _json_safe(value):
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def _summary(spec, obj) -> dict:
    data = spec.summary(obj)
    if not isinstance(data, dict):
        data = {'title': str(data)}
    data.setdefault('title', str(obj))
    return _json_safe(data)


def _amount(spec, obj):
    if not spec.amount_field:
        return None
    value = getattr(obj, spec.amount_field, None)
    if value is None or value == '':
        return None
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _load_section(section_id):
    section = ProjectSection.objects.select_related('project').filter(pk=section_id).first()
    if section is None:
        raise WorkflowError('no_section', 'بخش سند مشخص نیست', 400)
    return section


def _resolve(spec, entity_id, obj):
    if obj is None:
        obj = resolve_entity(spec.entity_kind, entity_id)
    if obj is None:
        raise WorkflowError('entity_not_found', 'سند گردش کار پیدا نشد', 404)
    if entity_id is not None and str(getattr(obj, 'pk', None)) != str(entity_id):
        # سند دادهٔ فراخوان باید همان سند نمونه باشد (هرگز مجوز یا مبلغ سند دیگری)
        raise WorkflowError('entity_mismatch', 'سند با کار هم‌خوان نیست', 400)
    return obj


def _thresholds(workflow_key, section_id, company_id) -> dict:
    """{step_key: amount} سقف‌های مؤثر؛ سقف بخش بر سقف شرکت مقدم است. یک پرس‌وجو."""
    company, section = {}, {}
    rows = WorkflowThreshold.objects.filter(workflow_key=workflow_key).filter(
        Q(section_id=section_id) | Q(company_id=company_id)
    ).values_list('step_key', 'section_id', 'amount')
    for step_key, sec_id, amount in rows:
        (section if sec_id else company)[step_key] = amount
    return {**company, **section}


def _plan_skips(spec, amount, creator_rank, thresholds, ranks) -> dict:
    """قاعدهٔ ۱ و ۲ ت۶ برای مرحله‌های تأیید: {step_key: reason} به ترتیب مرحله‌ها."""
    steps = spec.steps
    by_threshold = set()
    if amount is not None:
        for step in steps:
            limit = thresholds.get(step.key)
            if step.kind == APPROVE and limit is not None and amount <= limit:
                by_threshold.add(step.key)
    plan = {}
    for i, step in enumerate(steps):
        if step.kind != APPROVE:
            continue
        if step.key in by_threshold:
            plan[step.key] = SKIP_THRESHOLD
            continue
        rank = ranks.get(step.role) or 0
        if rank < creator_rank:
            plan[step.key] = SKIP_CREATOR_LEVEL
        elif rank == creator_rank:
            higher_later = any(
                s.kind == APPROVE and s.key not in by_threshold and (ranks.get(s.role) or 0) > rank
                for s in steps[i + 1:]
            )
            if higher_later:
                plan[step.key] = SKIP_CREATOR_LEVEL
    return plan


def _lock_instance(instance_id):
    return WorkflowInstance.objects.select_for_update().get(pk=instance_id)


def _lock_task(task_id):
    return WorkflowTask.objects.select_for_update().get(pk=task_id)


def _close_task(task, outcome, user=None, now=None) -> set:
    """بستن کار و حذف ردیف‌های دریافت‌کننده؛ خروجی کاربرانی که کار را داشتند."""
    task.is_open = False
    task.closed_at = now or timezone.now()
    task.closed_by = user
    task.outcome = outcome
    task.save(update_fields=['is_open', 'closed_at', 'closed_by', 'outcome'])
    return clear_task_recipients(task)


def _section_triplet(section):
    """(section_id, project_id, company_id) بخش با پروژهٔ بارشده، بی‌پرس‌وجو."""
    return section.pk, section.project_id, section.project.company_id


def _compute_recipients(ctx, instance, step, today=None):
    """
    (دریافت‌کنندگان اصلی، ردیف‌های جانشین، دارندگان نقش) مرحله برای این نمونه؛ همان قاعدهٔ مسیر دسته‌ای
    (compute_recipients_batch با یک کار).
    """
    item = (0, _section_triplet(ctx.section), step.role, step.permission, instance.created_by_id, None,
            getattr(instance, "allow_substitute", True))
    return compute_recipients_batch([item], bundles=ctx.bundles, today=today)[0]


def _referral_recipients(instance, target_ids, today=None) -> dict:
    """{target_id: (principals, sub_rows, holders)} کارهای ارجاع این نمونه (ر۵)؛ همان مسیر دسته‌ای."""
    items = [(t, (None, None, instance.company_id), '', '', instance.created_by_id, t, instance.allow_substitute)
             for t in target_ids]
    return compute_recipients_batch(items, today=today)


def no_recipient_reason(instance, holders):
    """دلیل رد شدن مرحلهٔ تأیید بی‌دریافت‌کننده (قاعدهٔ ۳ ت۶)."""
    creator = instance.created_by_id
    return SKIP_NO_SECOND_APPROVAL if creator and holders == {creator} else SKIP_NO_RECIPIENT


def _open_task(ctx, instance, step, principals, subs, now):
    task = WorkflowTask.objects.create(
        instance=instance, step_key=step.key, step_kind=step.kind, role=step.role, permission=step.permission,
        revision=instance.revision, is_open=True, has_recipients=bool(principals), opened_at=now,
    )
    received, _removed = sync_task_recipients(task, principals, subs)
    if principals:
        events.emit(events.RECEIVED, instance, task, received)
    else:
        events.emit(events.SUPERUSER_ALERT, instance, task, [])
    return task


def _enter_step(ctx, instance, step, now, force=False):
    """
    رسیدن به مرحله (قاعدهٔ ۳ ت۶). خروجی (task یا None، رد شدن رسیدن یا None).
    force: مرحله حتماً باز شود (ت۱۵: آخرین مرحلهٔ نسخهٔ تازه؛ هرگز پایان خودکار).
    """
    principals, subs, holders = _compute_recipients(ctx, instance, step)
    if not principals and step.kind == APPROVE and not force:
        return None, {'step': step.key, 'reason': no_recipient_reason(instance, holders)}
    instance.current_step = step.key
    task = _open_task(ctx, instance, step, principals, subs, now)
    ctx.spec.on_state_change(ctx.obj, step.key, instance)
    return task, None


def _advance(ctx, instance, start_index, now):
    """
    حرکت از مرحلهٔ start_index به بعد تا اولین مرحلهٔ باز؛ وگرنه پایان گردش.
    خروجی (کار باز یا None، to_step، رد شدن‌های رسیدن).
    """
    skipped = []
    for key in instance.step_keys[start_index:]:
        if key in instance.skip_plan:
            continue
        step = ctx.spec.step(key)
        task, skip = _enter_step(ctx, instance, step, now)
        if skip:
            skipped.append(skip)
            continue
        instance.save()
        return task, key, skipped
    instance.status = WorkflowInstance.COMPLETED
    instance.current_step = ''
    instance.closed_at = now
    instance.save()
    ctx.spec.on_state_change(ctx.obj, COMPLETED, instance)
    if instance.created_by_id:
        # پایان گردش: رویداد «انجام شد» برای ثبت‌کننده با step_key='completed'
        events.emit(events.DONE, instance, None, [instance.created_by_id], step_key=COMPLETED)
    return None, COMPLETED, skipped


def _history(instance, action, *, task=None, actor=None, on_behalf_of_id=None, as_superuser=False,
             from_step='', to_step='', reason='', skipped=(), now=None):
    return WorkflowStep.objects.create(
        instance=instance, task=task, actor=actor, on_behalf_of_id=on_behalf_of_id, as_superuser=as_superuser,
        action=action, from_step=from_step or '', to_step=to_step or '', reason=reason or '',
        skipped=list(skipped), at=now or timezone.now(),
    )


def skip_lost_task(ctx, instance, task, holders, now, from_step=None):
    """
    ت۷ (قاعدهٔ ۳ ت۶ پس از رسیدن): کار باز مرحلهٔ «تأیید» که دریافت‌کنندهٔ اصلی‌اش را از دست داد بسته می‌شود
    (نتیجهٔ skipped)، گردش با _advance پیش می‌رود و ردیف auto با دلیل رد شدن ثبت می‌شود. نمونه و کار باید
    قفل باشند (به همین ترتیب). خروجی کار باز تازه یا None.
    """
    step_key = task.step_key
    old = _close_task(task, WorkflowTask.SKIPPED, None, now)
    events.emit(events.REMOVED, instance, task, old)
    instance.revision += 1
    skipped = [{'step': step_key, 'reason': no_recipient_reason(instance, holders)}]
    keys = instance.step_keys
    index = keys.index(step_key) + 1 if step_key in keys else len(keys)
    new_task, to_step, arrival = _advance(ctx, instance, index, now)
    skipped.extend(arrival)
    _history(instance, WorkflowStep.AUTO, task=new_task, from_step=from_step or step_key, to_step=to_step,
             skipped=skipped, now=now)
    return new_task


def mark_waiting(instance, task, now) -> bool:
    """
    کار «بررسی» یا «اجرا» بی‌دریافت‌کنندهٔ اصلی منتظر می‌ماند؛ هشدار مدیر کل فقط هنگام گذار از «دارد» به
    «ندارد» (نه در هر محاسبهٔ دوباره). True اگر هشدار داد.
    """
    if not task.has_recipients:
        return False
    task.has_recipients = False
    task.superuser_alerted_at = now
    task.save(update_fields=['has_recipients', 'superuser_alerted_at'])
    events.emit(events.SUPERUSER_ALERT, instance, task, [])
    return True


def _ctx_for(instance, obj=None):
    spec = get_spec(instance.workflow_key)
    obj = _resolve(spec, instance.entity_id, obj)
    return _Ctx(spec, obj, _load_section(instance.section_id))


# ─── ت۱۵: تعریف عوض‌شده ─────────────────────────────────────────────────────────

def _ensure_current_version(instance, ctx, now=None) -> bool:
    """
    نمونهٔ در جریان با نسخهٔ قدیم را به نسخهٔ اعلام‌شده می‌برد (نمونه باید قفل باشد). True اگر تغییری داد.
    مرحلهٔ جاری اگر در نسخهٔ تازه باشد می‌ماند (فقط snapshot و دریافت‌کنندگان تازه می‌شوند)؛ وگرنه اولین کلید
    بعدی از ترتیب قدیم که در نسخهٔ تازه هست، و اگر نبود آخرین مرحلهٔ نسخهٔ تازه (اجباری باز می‌شود).
    """
    spec = ctx.spec
    if instance.status != WorkflowInstance.IN_PROGRESS or instance.version == spec.version:
        return False
    now = now or timezone.now()
    old_keys = list(instance.step_keys or [])
    new_keys = spec.step_keys
    current = instance.current_step
    instance.version = spec.version
    instance.step_keys = new_keys
    instance.skip_plan = {k: v for k, v in (instance.skip_plan or {}).items() if k in new_keys}
    task = WorkflowTask.objects.select_for_update().filter(
        instance=instance, is_open=True, track=WorkflowTask.TRACK_STEP).first()
    if current in new_keys:
        step = spec.step(current)
        if task is not None:
            task.step_kind, task.role, task.permission = step.kind, step.role, step.permission
            task.save(update_fields=['step_kind', 'role', 'permission'])
            principals, subs, holders = _compute_recipients(ctx, instance, step)
            if not principals and step.kind == APPROVE and task.has_recipients:
                # قاعدهٔ ۳ ت۶ روی مرحلهٔ نگه‌داشته (ت۷)؛ skip_lost_task نمونه را ذخیره می‌کند
                skip_lost_task(ctx, instance, task, holders, now)
                return True
            received, removed = sync_task_recipients(task, principals, subs)
            events.emit(events.RECEIVED, instance, task, received)
            events.emit(events.REMOVED, instance, task, removed)
            if principals and not task.has_recipients:
                task.has_recipients = True
                task.save(update_fields=['has_recipients'])
            elif not principals:
                mark_waiting(instance, task, now)
        instance.save()
        return True
    # مرحلهٔ جاری برداشته شده
    start = old_keys.index(current) if current in old_keys else 0
    removed_keys = []
    target = None
    for key in old_keys[start:]:
        if key in new_keys:
            target = key
            break
        removed_keys.append(key)
    skipped = [{'step': k, 'reason': SKIP_VERSION_REMOVED} for k in removed_keys or [current]]
    if task is not None:
        holders = _close_task(task, WorkflowTask.SUPERSEDED, None, now)
        events.emit(events.REMOVED, instance, task, holders)
    instance.revision += 1
    if target is not None:
        new_task, to_step, arrival = _advance(ctx, instance, new_keys.index(target), now)
        skipped.extend(arrival)
    else:
        last = spec.steps[-1]
        new_task, _skip = _enter_step(ctx, instance, last, now, force=True)
        instance.save()
        to_step = last.key
    _history(instance, WorkflowStep.AUTO, task=new_task, from_step=current, to_step=to_step, skipped=skipped, now=now)
    return True


def migrate_open_instances(workflow_key=None) -> int:
    """
    نمونه‌های در جریانی که نسخه‌شان با اعلام فعلی فرق دارد را به نسخهٔ تازه می‌برد (برای الف۲ و زمان‌بند).
    هر نمونه در تراکنش خودش. خروجی شمار نمونه‌های تغییرکرده.
    """
    specs = workflow_specs()
    keys = [workflow_key] if workflow_key else list(specs)
    changed = 0
    for key in keys:
        spec = specs.get(key)
        if spec is None:
            continue
        ids = list(
            WorkflowInstance.objects.filter(workflow_key=key, status=WorkflowInstance.IN_PROGRESS)
            .exclude(version=spec.version).values_list('id', flat=True)
        )
        for instance_id in ids:
            with transaction.atomic():
                instance = _lock_instance(instance_id)
                if _ensure_current_version(instance, _ctx_for(instance)):
                    changed += 1
    return changed


# ─── رابط عمومی ──────────────────────────────────────────────────────────────────

def _ensure_not_locked(kind, entity_id):
    """سندی که قلاب قفل ماژول (is_locked:<kind>) آن را قفل می‌داند در گردش جابه‌جا نمی‌شود (409)."""
    if is_entity_locked(kind, entity_id):
        raise WorkflowStateError('entity_locked', 'این سند قفل است و کنش گردش روی آن انجام نمی‌شود.', 409)


def submit(workflow_key, obj, user):
    """
    ارسال (یا ارسال دوباره پس از عودت یا لغو) سند به گردش؛ ثبت‌کننده = کاربر ارسال‌کننده.
    مجوز ارسال را ماژول می‌سنجد. نمونهٔ در جریان یا بسته (پایان‌یافته/ردشده) 409 already_in_progress می‌دهد.
    """
    spec = get_spec(workflow_key)
    if spec.referral_only:
        raise WorkflowError('referral_only', 'این سند گردش تأیید ندارد و فقط ارجاع می‌گیرد', 400)
    entity_id = obj.pk
    section = _load_section(getattr(obj, f'{spec.section_field}_id', None))
    ctx = _Ctx(spec, obj, section)
    now = timezone.now()
    _ensure_not_locked(spec.entity_kind, entity_id)
    with transaction.atomic():
        instance = WorkflowInstance.objects.select_for_update().filter(
            workflow_key=workflow_key, entity_kind=spec.entity_kind, entity_id=entity_id).first()
        if instance is not None and instance.status not in RESTARTABLE:
            raise WorkflowStateError('already_in_progress', 'این سند از قبل در گردش کار است', 409)
        if instance is None:
            instance = WorkflowInstance(workflow_key=workflow_key, entity_kind=spec.entity_kind, entity_id=entity_id)
        else:
            # کار مرحلهٔ بازِ جامانده (نباید باشد) کنار گذاشته می‌شود؛ ارجاع‌های باز (پس از عودت) می‌مانند (ر۹)
            for stale in WorkflowTask.objects.select_for_update().filter(
                    instance=instance, is_open=True, track=WorkflowTask.TRACK_STEP):
                _close_task(stale, WorkflowTask.SUPERSEDED, None, now)
        instance.version = spec.version
        instance.company_id = section.project.company_id
        instance.section = section
        instance.created_by = user
        instance.creator_rank = _creator_rank(user.pk, section, ctx.ranks)
        instance.status = WorkflowInstance.IN_PROGRESS
        instance.current_step = ''
        instance.step_keys = spec.step_keys
        instance.amount = _amount(spec, obj)
        instance.summary = _summary(spec, obj)
        instance.others_acted = False
        instance.submitted_at = now
        instance.closed_at = None
        instance.revision += 1
        instance.skip_plan = _plan_skips(
            spec, instance.amount, instance.creator_rank,
            _thresholds(workflow_key, section.pk, instance.company_id), ctx.ranks,
        )
        try:
            with transaction.atomic():
                instance.save()
        except IntegrityError:
            raise WorkflowStateError('already_in_progress', 'این سند از قبل در گردش کار است', 409)
        planned = [{'step': k, 'reason': instance.skip_plan[k]} for k in instance.step_keys if k in instance.skip_plan]
        task, to_step, arrival = _advance(ctx, instance, 0, now)
        _history(instance, WorkflowStep.SUBMIT, task=task, actor=user, to_step=to_step,
                 skipped=planned + arrival, now=now)
    return instance


def _task_id(task):
    return task.pk if isinstance(task, WorkflowTask) else int(task)


def _authorize(user, instance, task, ctx, today):
    """
    مجوز اقدام، تازه در لحظهٔ اقدام (نه از ردیف‌های ذخیره‌شده). خروجی (as_superuser، on_behalf_of_id).
    """
    if not getattr(user, 'is_active', False) or not user.pk:
        raise WorkflowPermissionDenied()
    if instance.created_by_id and user.pk == instance.created_by_id:
        raise WorkflowPermissionDenied('self_approval', 'ثبت‌کنندهٔ سند نمی‌تواند روی سند خودش اقدام کند', 403)
    if user.is_superuser:
        return True, None
    step = ctx.spec.step(task.step_key)
    principals, subs, _holders = _compute_recipients(ctx, instance, step, today=today)
    if user.pk in principals:
        return False, None
    # جانشین: همان قاعدهٔ ردیف‌ها (لغونشده، شرکت نمونه یا همه، عضو شرکت نمونه) و بازهٔ امروز
    behalf = min((p for s, p, start, end in subs if s == user.pk and row_valid_on(p, start, end, today)),
                 default=None)
    if behalf is None:
        raise WorkflowPermissionDenied()
    return False, behalf


def _sync_version_first(instance_id, obj=None) -> None:
    """
    ت۱۵ پیش از تراکنش اقدام و در تراکنش جدای خودش: اگر کار با تغییر نسخه جایگزین شود، خطای 409 اقدام نباید
    انتقال نسخه را هم برگرداند (وگرنه نمونه با هر تلاش در نسخهٔ قدیم می‌ماند). اگر فراخواننده تراکنش بیرونی
    داشته باشد، همان تراکنش تعیین‌کننده است.
    """
    if instance_id is None:
        return
    row = WorkflowInstance.objects.filter(pk=instance_id).values_list('workflow_key', 'version', 'status').first()
    if row is None or row[2] != WorkflowInstance.IN_PROGRESS:
        return
    spec = workflow_specs().get(row[0])
    if spec is None or spec.version == row[1]:
        return
    with transaction.atomic():
        instance = _lock_instance(instance_id)
        _ensure_current_version(instance, _ctx_for(instance, obj))


def _instance_id_of_task(task):
    if isinstance(task, WorkflowTask) and task.instance_id:
        return task.instance_id
    return WorkflowTask.objects.filter(pk=_task_id(task)).values_list('instance_id', flat=True).first()


def _begin_action(user, task, revision, obj, action, reason, require_reason):
    """
    به این ترتیب: قفل نمونه و کار، کار بسته (409 برای صف آفلاین، ت۱۳)، تغییر نسخه، مجوز، revision و سپس اقدام
    مجاز و دلیل. خروجی (instance, task, ctx, auth).
    """
    task_id = _task_id(task)
    instance_id = _instance_id_of_task(task)
    if instance_id is None:
        raise TaskAlreadyDone()
    instance = _lock_instance(instance_id)
    locked = _lock_task(task_id)
    if locked.track != WorkflowTask.TRACK_STEP:
        # کار ارجاع فقط با «انجام شد» یا «رؤیت شد» بسته می‌شود (complete_referral)
        raise WorkflowPermissionDenied('action_not_allowed', 'این اقدام در این مرحله مجاز نیست', 403)
    if not locked.is_open or instance.status != WorkflowInstance.IN_PROGRESS:
        raise TaskAlreadyDone()
    _ensure_not_locked(instance.entity_kind, instance.entity_id)
    ctx = _ctx_for(instance, obj)
    if _ensure_current_version(instance, ctx):
        locked = _lock_task(task_id)
        if not locked.is_open:
            raise TaskAlreadyDone()
    # مجوز پیش از revision: کسی که دریافت‌کننده نیست 403 می‌گیرد و از revision کار چیزی نمی‌فهمد
    auth = _authorize(user, instance, locked, ctx, timezone.localdate())
    if revision is not None and int(revision) != locked.revision:
        raise TaskAlreadyDone()
    step = ctx.spec.step(locked.step_key)
    if action not in step.actions:
        raise WorkflowPermissionDenied('action_not_allowed', 'این اقدام در این مرحله مجاز نیست', 403)
    if require_reason and not (reason or '').strip():
        raise ReasonRequired()
    return instance, locked, ctx, auth


def _finish_task(instance, task, user, outcome, now):
    """بستن کار با اقدام کاربر و رویدادهای «انجام شد» و «برداشته شد»."""
    holders = _close_task(task, outcome, user, now)
    events.emit(events.DONE, instance, task, [user.pk], actor_id=user.pk)
    events.emit(events.REMOVED, instance, task, holders - {user.pk})
    instance.others_acted = True
    instance.revision += 1


def act(user, task, *, reason='', revision=None, obj=None):
    """تأیید/بررسی/اجرای مرحلهٔ جاری و رفتن به مرحلهٔ بعدیِ ردنشده یا پایان گردش."""
    _sync_version_first(_instance_id_of_task(task), obj)
    now = timezone.now()
    with transaction.atomic():
        instance, task, ctx, (as_su, behalf) = _begin_action(user, task, revision, obj, ACT, reason, False)
        from_step = task.step_key
        _finish_task(instance, task, user, WorkflowTask.ACTED, now)
        index = instance.step_keys.index(from_step) + 1
        _new_task, to_step, arrival = _advance(ctx, instance, index, now)
        _history(instance, WorkflowStep.ACT, task=task, actor=user, on_behalf_of_id=behalf, as_superuser=as_su,
                 from_step=from_step, to_step=to_step, reason=reason, skipped=arrival, now=now)
    return instance


def _close_referrals(instance, user, now) -> None:
    """ر۹: رد قطعی و لغو نمونه کارهای ارجاع باز آن را با cancelled می‌بندند (نمونه باید قفل باشد)."""
    for task in WorkflowTask.objects.select_for_update().filter(
            instance=instance, is_open=True, track=WorkflowTask.TRACK_REFERRAL).order_by('pk'):
        holders = _close_task(task, WorkflowTask.CANCELLED, user, now)
        events.emit(events.REMOVED, instance, task, holders, actor_id=getattr(user, 'pk', None))


def _close_instance(user, task, reason, revision, obj, action, outcome, status, state, kind, history_action,
                    close_referrals=False):
    _sync_version_first(_instance_id_of_task(task), obj)
    now = timezone.now()
    with transaction.atomic():
        instance, task, ctx, (as_su, behalf) = _begin_action(user, task, revision, obj, action, reason, True)
        from_step = task.step_key
        _finish_task(instance, task, user, outcome, now)
        if close_referrals:
            _close_referrals(instance, user, now)
        instance.status = status
        instance.current_step = ''
        instance.closed_at = now
        instance.save()
        ctx.spec.on_state_change(ctx.obj, state, instance)
        events.emit(kind, instance, task, [instance.created_by_id], actor_id=user.pk)
        _history(instance, history_action, task=task, actor=user, on_behalf_of_id=behalf, as_superuser=as_su,
                 from_step=from_step, to_step=state, reason=reason, now=now)
    return instance


def return_for_fix(user, task, reason, obj=None, *, revision=None):
    """عودت برای اصلاح به ثبت‌کننده (دلیل اجباری)؛ ارسال دوباره گردش را از نو شروع می‌کند."""
    return _close_instance(user, task, reason, revision, obj, RETURN, WorkflowTask.RETURNED,
                           WorkflowInstance.RETURNED, RETURNED, events.RETURNED, WorkflowStep.RETURN)


def reject(user, task, reason, obj=None, *, revision=None):
    """رد قطعی سند (دلیل اجباری)؛ پایانی است."""
    return _close_instance(user, task, reason, revision, obj, REJECT, WorkflowTask.REJECTED,
                           WorkflowInstance.REJECTED, REJECTED, events.REJECTED, WorkflowStep.REJECT,
                           close_referrals=True)


def cancel(user, instance_or_task, *, reason='', obj=None):
    """
    لغو به دست ثبت‌کننده، فقط در جریان و پیش از اقدام نفر دیگر (رد شدن خودکار اقدام نیست)؛ مدیر کل استثنا ندارد.
    """
    if isinstance(instance_or_task, WorkflowTask):
        instance_id = instance_or_task.instance_id
    elif isinstance(instance_or_task, WorkflowInstance):
        instance_id = instance_or_task.pk
    else:
        instance_id = int(instance_or_task)
    _sync_version_first(instance_id, obj)
    now = timezone.now()
    with transaction.atomic():
        instance = _lock_instance(instance_id)
        if not user.pk or user.pk != instance.created_by_id:
            raise WorkflowPermissionDenied('cancel_not_allowed', 'فقط ثبت‌کنندهٔ سند می‌تواند آن را لغو کند', 403)
        if instance.status != WorkflowInstance.IN_PROGRESS or instance.others_acted:
            raise WorkflowStateError('cancel_not_allowed', 'پس از اقدام نفر دیگر، لغو ممکن نیست', 409)
        _ensure_not_locked(instance.entity_kind, instance.entity_id)
        ctx = _ctx_for(instance, obj)
        _ensure_current_version(instance, ctx, now)
        task = WorkflowTask.objects.select_for_update().filter(
            instance=instance, is_open=True, track=WorkflowTask.TRACK_STEP).first()
        from_step = instance.current_step
        if task is not None:
            holders = _close_task(task, WorkflowTask.CANCELLED, user, now)
            events.emit(events.REMOVED, instance, task, holders)
        _close_referrals(instance, user, now)
        instance.status = WorkflowInstance.CANCELLED
        instance.current_step = ''
        instance.closed_at = now
        instance.revision += 1
        instance.save()
        ctx.spec.on_state_change(ctx.obj, CANCELLED, instance)
        events.emit(events.CANCELLED, instance, task, [user.pk], actor_id=user.pk, step_key=from_step)
        _history(instance, WorkflowStep.CANCEL, task=task, actor=user, from_step=from_step, to_step=CANCELLED,
                 reason=reason, now=now)
    return instance


def instance_of(workflow_key, entity_id):
    """نمونهٔ گردش این سند یا None."""
    spec = get_spec(workflow_key)
    return WorkflowInstance.objects.filter(
        workflow_key=workflow_key, entity_kind=spec.entity_kind, entity_id=entity_id).first()


def open_task(workflow_key, entity_id):
    """کار باز این سند یا None."""
    spec = get_spec(workflow_key)
    return WorkflowTask.objects.filter(
        instance__workflow_key=workflow_key, instance__entity_kind=spec.entity_kind,
        instance__entity_id=entity_id, is_open=True, track=WorkflowTask.TRACK_STEP,
    ).select_related('instance').first()


def task_grants_view(user, kind, entity_id) -> bool:
    """
    ت۱۱: کاربر روی این سند کار باز دارد (دریافت‌کنندهٔ اصلی، یا جانشین در بازهٔ امروز). یک پرس‌وجو.
    ماژول فقط برای نمایش جزئیات (خواندن) از این استفاده می‌کند.
    """
    if not getattr(user, 'is_active', False) or not getattr(user, 'pk', None) or not entity_id:
        return False
    today = timezone.localdate()
    return WorkflowTaskRecipient.objects.filter(
        user_id=user.pk, task__is_open=True, task__instance__entity_kind=kind, task__instance__entity_id=entity_id,
    ).filter(
        Q(on_behalf_of__isnull=True) | Q(valid_from__lte=today, valid_to__gte=today)
    ).exists()


# ─── ارجاع (طرح ۲.۳-و) ───────────────────────────────────────────────────────────

MAX_REFERRAL_TARGETS = 20
MAX_TEXT_LENGTH = 4000
REFERRAL_CLOSED_STATUSES = (WorkflowInstance.CANCELLED, WorkflowInstance.REJECTED)


def _instance_id_of(instance_or_id):
    if isinstance(instance_or_id, WorkflowInstance):
        return instance_or_id.pk
    if isinstance(instance_or_id, WorkflowTask):
        return instance_or_id.instance_id
    return int(instance_or_id)


def _hook_allows_refer(user, instance) -> bool:
    """قلاب ماژول can_refer:<entity_kind> (ارجاع ریشه، مثل دبیرخانه)؛ خطای قلاب یعنی منع."""
    from platform_core.registry import contributions
    for fn in contributions(f'can_refer:{instance.entity_kind}'):
        try:
            if fn(user, instance.entity_id) is True:
                return True
        except Exception:
            continue
    return False


def _clean_targets(user, targets) -> list:
    out = []
    try:
        for t in targets or ():
            t = int(t)
            if t not in out:
                out.append(t)
    except (TypeError, ValueError):
        raise WorkflowError('invalid_targets', 'گیرندگان ارجاع نامعتبرند', 400)
    if not out or len(out) > MAX_REFERRAL_TARGETS:
        raise WorkflowError('invalid_targets', f'ارجاع باید ۱ تا {MAX_REFERRAL_TARGETS} گیرنده داشته باشد', 400)
    if user.pk in out:
        raise WorkflowError('self_target', 'ارجاع به خود ممکن نیست', 400)
    return out


def _refer_not_allowed():
    return WorkflowPermissionDenied('refer_not_allowed', 'شما اجازهٔ ارجاع این سند را ندارید', 403)


def refer(user, instance_or_id, targets, *, kind, instruction='', due_at=None, parent_task=None) -> list:
    """
    ر۶: ارجاع سند به ۱ تا ۲۰ کاربر فعال و عضو شرکت نمونه؛ برای هر گیرنده یک شاخهٔ موازی (کار مسیر referral).
    ارجاع‌دهنده: دریافت‌کنندهٔ معتبر امروز یک کار باز همین نمونه (والد همان کار)، یا کسی که قلاب
    can_refer:<entity_kind> اجازه دهد، یا مدیر کل فعال. ارجاع کار والد را نمی‌بندد. خروجی کارهای ساخته‌شده.
    """
    if kind not in REFERRAL_KINDS:
        raise WorkflowError('invalid_kind', 'نوع ارجاع باید «ارجاع» یا «برای اطلاع» باشد', 400)
    if not getattr(user, 'is_active', False) or not user.pk:
        raise WorkflowPermissionDenied()
    target_ids = _clean_targets(user, targets)
    instruction = (instruction or '').strip()
    if len(instruction) > MAX_TEXT_LENGTH:
        raise WorkflowError('instruction_too_long', 'دستور ارجاع بیش از اندازه بلند است', 400)
    now = timezone.now()
    if due_at is not None and due_at <= now:
        raise WorkflowError('invalid_due_at', 'مهلت باید در آینده باشد', 400)
    today = timezone.localdate()
    with transaction.atomic():
        instance = _lock_instance(_instance_id_of(instance_or_id))
        if instance.status in REFERRAL_CLOSED_STATUSES:
            raise WorkflowStateError('instance_closed', 'این سند بسته شده و ارجاع نمی‌پذیرد', 409)
        my_rows = WorkflowTaskRecipient.objects.filter(
            user_id=user.pk, task__instance=instance, task__is_open=True).filter(valid_rows_q(today))
        parent = None
        if parent_task is not None:
            parent = WorkflowTask.objects.select_for_update().filter(pk=_task_id(parent_task)).first()
            if parent is None or parent.instance_id != instance.pk:
                raise WorkflowError('invalid_parent', 'کار والد از این سند نیست', 400)
            if not parent.is_open:
                raise TaskAlreadyDone()
            my_rows = my_rows.filter(task_id=parent.pk)
        row = my_rows.order_by('task_id', 'on_behalf_of_id').first()
        as_su = False
        if row is not None:
            # دریافت‌کنندهٔ کار باز: والد همان کار (اگر داده نشده، اولین کار باز او در این سند)
            if parent is None:
                parent = _lock_task(row.task_id)
        elif user.is_superuser:
            as_su = True
        elif parent is not None or not _hook_allows_refer(user, instance):
            raise _refer_not_allowed()
        if not as_su and (user.pk, instance.company_id) not in company_member_pairs([user.pk], [instance.company_id]):
            raise _refer_not_allowed()
        computed = _referral_recipients(instance, target_ids, today=today)
        if any(not computed[t][0] for t in target_ids):
            raise WorkflowError('target_not_member', 'گیرندهٔ ارجاع باید کاربر فعال همین شرکت باشد', 400)
        created = []
        for target in target_ids:
            principals, subs, _holders = computed[target]
            task = WorkflowTask.objects.create(
                instance=instance, step_key=kind, step_kind=kind, role='', permission='',
                revision=instance.revision, is_open=True, has_recipients=True, opened_at=now,
                track=WorkflowTask.TRACK_REFERRAL, target_user_id=target, parent_task=parent, referred_by=user,
                instruction=instruction, due_at=due_at,
            )
            received, _removed = sync_task_recipients(task, principals, subs, today=today)
            events.emit(events.RECEIVED, instance, task, received, actor_id=user.pk)
            _history(instance, WorkflowStep.REFER, task=task, actor=user,
                     on_behalf_of_id=row.on_behalf_of_id if row is not None else None, as_superuser=as_su,
                     from_step=parent.step_key if parent is not None else '', to_step=kind, now=now)
            created.append(task)
    return created


def _authorize_referral(user, instance, task, today):
    """
    ر۷: فقط گیرندهٔ کار یا جانشین معتبرش (اگر نمونه جانشین بپذیرد)، تازه در لحظهٔ اقدام؛ مدیر کل استثنا ندارد و
    قاعدهٔ ثبت‌کننده نیست. خروجی on_behalf_of_id.
    """
    if not getattr(user, 'is_active', False) or not user.pk:
        raise WorkflowPermissionDenied()
    target = task.target_user_id
    principals, subs, _holders = _referral_recipients(instance, [target], today=today)[target]
    if user.pk in principals:
        return None
    behalf = min((p for s, p, start, end in subs if s == user.pk and row_valid_on(p, start, end, today)),
                 default=None)
    if behalf is None:
        raise WorkflowPermissionDenied()
    return behalf


def complete_referral(user, task, *, action, reply='', revision=None):
    """
    ر۷: بستن کار ارجاع؛ «ارجاع» با done (پاسخ اختیاری) و «برای اطلاع» با seen. همان قفل نمونه و کار و 409
    task_already_done (ت۱۳). شاخه‌های فرزند باز می‌مانند. خروجی کار بسته‌شده.
    """
    now = timezone.now()
    reply = (reply or '').strip()
    if len(reply) > MAX_TEXT_LENGTH:
        raise WorkflowError('reply_too_long', 'پاسخ بیش از اندازه بلند است', 400)
    with transaction.atomic():
        instance_id = _instance_id_of_task(task)
        if instance_id is None:
            raise TaskAlreadyDone()
        instance = _lock_instance(instance_id)
        locked = _lock_task(_task_id(task))
        if locked.track != WorkflowTask.TRACK_REFERRAL:
            raise WorkflowPermissionDenied('action_not_allowed', 'این اقدام در این مرحله مجاز نیست', 403)
        if not locked.is_open:
            raise TaskAlreadyDone()
        behalf = _authorize_referral(user, instance, locked, timezone.localdate())
        if revision is not None and int(revision) != locked.revision:
            raise TaskAlreadyDone()
        expected = WorkflowStep.DONE if locked.step_kind == REFER else WorkflowStep.SEEN
        if action != expected:
            raise WorkflowPermissionDenied('action_not_allowed', 'این اقدام در این مرحله مجاز نیست', 403)
        if reply:
            locked.reply = reply
            locked.save(update_fields=['reply'])
        holders = _close_task(locked, WorkflowTask.ACTED, user, now)
        events.emit(events.DONE, instance, locked, {user.pk, locked.referred_by_id}, actor_id=user.pk)
        events.emit(events.REMOVED, instance, locked, holders - {user.pk}, actor_id=user.pk)
        _history(instance, action, task=locked, actor=user, on_behalf_of_id=behalf, from_step=locked.step_key,
                 reason=reply, now=now)
    return locked


def mark_read(user, task) -> bool:
    """ر۸: زمان خواندن ردیف‌های معتبر امروز همین کاربر روی کار باز، فقط بار اول. True اگر چیزی نوشت."""
    if not getattr(user, 'is_active', False) or not getattr(user, 'pk', None):
        return False
    return bool(
        WorkflowTaskRecipient.objects.filter(
            task_id=_task_id(task), task__is_open=True, user_id=user.pk, read_at__isnull=True,
        ).filter(valid_rows_q(timezone.localdate())).update(read_at=timezone.now())
    )


def open_for_referral(workflow_key, obj, user):
    """
    ر۱۵: نمونهٔ گردش «فقط ارجاع» سند (وضعیت completed، بی‌کار مرحله) را می‌سازد یا نمونهٔ موجود را برمی‌گرداند.
    مجوز ساختن را ماژول می‌سنجد.
    """
    spec = get_spec(workflow_key)
    if not spec.referral_only:
        raise WorkflowError('not_referral_only', 'این گردش فقط ارجاع نیست', 400)
    existing = instance_of(workflow_key, obj.pk)
    if existing is not None:
        return existing
    section = _load_section(getattr(obj, f'{spec.section_field}_id', None))
    now = timezone.now()
    instance = WorkflowInstance(
        workflow_key=workflow_key, version=spec.version, entity_kind=spec.entity_kind, entity_id=obj.pk,
        company_id=section.project.company_id, section=section, created_by=user,
        status=WorkflowInstance.COMPLETED, step_keys=[], amount=_amount(spec, obj), summary=_summary(spec, obj),
        submitted_at=now, closed_at=now,
    )
    try:
        with transaction.atomic():
            instance.save()
    except IntegrityError:
        return instance_of(workflow_key, obj.pk)
    return instance


def referral_grants_view(user, kind, entity_id) -> bool:
    """
    ر۱۱: کاربر گیرندهٔ یک کار ارجاع این سند است (باز یا بسته)، یا به جانشینی روی کار ارجاع آن اقدام کرده است.
    ماژول (قلاب can_view) و سابقه از این برای دیدن سند پس از بستن کار استفاده می‌کنند. یک پرس‌وجو.
    """
    if not getattr(user, 'is_active', False) or not getattr(user, 'pk', None) or not entity_id:
        return False
    acted_for = WorkflowStep.objects.filter(task_id=OuterRef('pk'), actor_id=user.pk, on_behalf_of__isnull=False)
    company_ids = set(WorkflowTask.objects.filter(
        track=WorkflowTask.TRACK_REFERRAL, instance__entity_kind=kind, instance__entity_id=entity_id,
    ).filter(Q(target_user_id=user.pk) | Exists(acted_for)).values_list('instance__company_id', flat=True))
    # فقط با عضویت فعال امروز در شرکت نمونه (کسی که از شرکت رفته سابقه را نمی‌بیند)
    return bool(company_ids) and bool(company_member_pairs([user.pk], list(company_ids)))


def set_allow_substitute(instance, value) -> WorkflowInstance:
    """ر۴: پرچم جانشین نمونه؛ ردیف‌های جانشین کارهای باز بی‌درنگ با محاسبهٔ دوباره تازه می‌شوند."""
    from .recompute import recompute_open_tasks
    value = bool(value)
    with transaction.atomic():
        locked = _lock_instance(_instance_id_of(instance))
        if locked.allow_substitute != value:
            locked.allow_substitute = value
            locked.save(update_fields=['allow_substitute', 'updated_at'])
            recompute_open_tasks(company_ids=[locked.company_id])
    return locked
