"""
تنظیم «نبودن نفر در مرحله» در سطح شرکت و گردش (طرح نبودن نفر، ۱۲ آبان ۱۴۰۵، بند ۴-۴).

- company_policy: پیش‌فرض شرکت و هر گردش نصب‌شده با مقدار مؤثر و منبع (own/company/default) و قفل‌ها.
- simulate: پیش‌نمایش بی‌نوشتن و بی‌رویداد با همان تابع تصمیم موتور (EffectivePolicy.missing_action و
  compute_recipients_batch با همان ورودی recompute_open_tasks)؛ خروجی شمارها، تا ۲۰ نمونه و token.
- apply: زیر قفل ردیف شرکت پیش‌نمایش دوباره حساب می‌شود؛ token ناهمخوان ← 409 preview_stale با شمارهای تازه؛
  سپس ذخیره (یا حذف = برگشت به پیش‌فرض شرکت)، AuditLog قبل و بعد و recompute_open_tasks فقط همان شرکت و همان
  گردش(ها)، همه در یک تراکنش.
دسترسی (can_edit_company_settings) در لایهٔ نما سنجیده می‌شود؛ هر پرس‌وجو این‌جا به company_id محدود است.
"""
import hashlib
import json

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts.audit_utils import log_audit_event

from .errors import WorkflowError
from .models import WorkflowInstance, WorkflowPolicy, WorkflowTask
from .policy import CREATOR_MAY_APPROVE_OWN, NOTIFY_MODE, EffectivePolicy, _row_values, role_defaults
from .recipients import company_member_pairs, compute_recipients_batch, scope_triplet
from .recompute import recompute_open_tasks
from .registry import MISSING_ACTIONS, SKIP, workflow_specs
from .substitutes import AUDIT_MODULE

SAMPLE_LIMIT = 20
ADVANCE = 'advance'
RECIPIENTS_CHANGED = 'recipients_changed'
WAITING = 'waiting'
EFFECTS = (ADVANCE, RECIPIENTS_CHANGED, WAITING)
LOCKED = 'locked'


class PreviewStale(WorkflowError):
    """وضع تنظیم‌ها یا کارهای باز پس از پیش‌نمایش عوض شده است؛ بدنه پیش‌نمایش تازه را هم دارد."""
    default_code = 'preview_stale'
    default_message = 'وضع سندها پس از پیش‌نمایش عوض شده است؛ شمارهای تازه را ببینید و دوباره تأیید کنید'
    default_status = 409

    def __init__(self, preview):
        super().__init__()
        self.preview = preview

    def as_dict(self) -> dict:
        return {**super().as_dict(), 'preview': self.preview}


def _bad(code, message_fa):
    return WorkflowError(code, message_fa, 400)


def step_workflows() -> dict:
    """گردش‌های مرحله‌دار نصب‌شده (گردش فقط ارجاع تنظیم ندارد)."""
    return {k: s for k, s in workflow_specs().items() if s.steps}


def workflow_roles(specs) -> list:
    """نقش‌های مرحله‌ها به ترتیب اولین آمدن: [(نقش، نوع اولین مرحله)]."""
    seen = {}
    for key in sorted(specs):
        for step in specs[key].steps:
            seen.setdefault(step.role, step.kind)
    return list(seen.items())


def resolve_workflow_key(workflow_key) -> str:
    key = str(workflow_key or '')
    if key and key not in step_workflows():
        raise _bad('unknown_workflow', 'گردش کار تعریف نشده است')
    return key


def clean_values(data, company_id, workflow_key) -> dict:
    """اعتبارسنجی تغییر پیشنهادی یک ردیف؛ خروجی هم‌شکل policy._row_values (مقدار خالی = ارث)."""
    if not isinstance(data, dict):
        raise _bad('invalid_payload', 'بدنهٔ درخواست نامعتبر است')
    specs = step_workflows()
    roles = {r for r, _k in workflow_roles({workflow_key: specs[workflow_key]} if workflow_key else specs)}
    actions = data.get('role_actions') or {}
    if not isinstance(actions, dict):
        raise _bad('invalid_role_actions', 'فهرست نقش‌ها نامعتبر است')
    out_actions = {}
    for role, action in actions.items():
        if role not in roles:
            raise _bad('unknown_role', f'نقش «{role}» در این گردش نیست')
        if action in (None, ''):
            continue
        if action not in MISSING_ACTIONS:
            raise _bad('invalid_action', 'مقدار هر نقش فقط «رد شود» یا «منتظر بماند» است')
        out_actions[role] = action
    creator = data.get(CREATOR_MAY_APPROVE_OWN)
    if creator is not None and not isinstance(creator, bool):
        raise _bad('invalid_creator_may_approve_own', 'مقدار «ایجادکننده سند خودش را تأیید کند» نامعتبر است')
    mode = data.get(NOTIFY_MODE) or None
    if mode is not None and mode not in (WorkflowPolicy.NOTIFY_ROLE_ASSIGNERS, WorkflowPolicy.NOTIFY_USERS):
        raise _bad('invalid_notify_mode', 'گیرندهٔ خبر انتظار نامعتبر است')
    ids = []
    if mode == WorkflowPolicy.NOTIFY_USERS:
        raw = data.get('notify_user_ids')
        if not isinstance(raw, list) or not raw or any(isinstance(i, bool) for i in raw):
            raise _bad('notify_users_required', 'دست‌کم یک کاربر برای خبر انتظار انتخاب کنید')
        try:
            ids = sorted({int(i) for i in raw})
        except (TypeError, ValueError):
            raise _bad('notify_users_required', 'دست‌کم یک کاربر برای خبر انتظار انتخاب کنید')
        active = set(get_user_model().objects.filter(
            pk__in=ids, is_active=True, is_superuser=False).values_list('pk', flat=True))
        members = company_member_pairs(active, {company_id}) if active else set()
        if any(i not in active or (i, company_id) not in members for i in ids):
            raise _bad('notify_user_not_member', 'گیرندهٔ خبر انتظار باید کاربر فعال و عضو همین شرکت باشد')
    return {'role_actions': out_actions, CREATOR_MAY_APPROVE_OWN: creator, NOTIFY_MODE: mode,
            'notify_user_ids': ids}


def _rows(company_id) -> dict:
    return {r.workflow_key: r for r in WorkflowPolicy.objects.filter(company_id=company_id)
            .select_related('updated_by')}


def _policy(company_id, key, values_by_key, defaults) -> EffectivePolicy:
    return EffectivePolicy(company_id=company_id, workflow_key=key,
                           workflow_row=values_by_key.get(key) if key else None,
                           company_row=values_by_key.get(''), defaults=defaults)


# ─── خواندن ──────────────────────────────────────────────────────────────────

def _block(policy, row, roles, titles) -> dict:
    own = _row_values(row) or {}
    return {
        'has_own_row': row is not None,
        'roles': [{'role': role, 'role_title_fa': titles.get(role, role),
                   'value': (own.get('role_actions') or {}).get(role),
                   'effective': policy.role_action(role, kind), 'source': policy.source(role)}
                  for role, kind in roles],
        CREATOR_MAY_APPROVE_OWN: {'value': own.get(CREATOR_MAY_APPROVE_OWN),
                                  'effective': policy.creator_may_approve_own,
                                  'source': policy.source(CREATOR_MAY_APPROVE_OWN)},
        'notify': {'mode': own.get(NOTIFY_MODE), 'user_ids': own.get('notify_user_ids') or [],
                   'effective_mode': policy.notify_mode, 'effective_user_ids': policy.notify_user_ids,
                   'source': policy.source(NOTIFY_MODE)},
        'updated_by': (row.updated_by.get_full_name() or row.updated_by.username) if row and row.updated_by_id else None,
        'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
    }


def company_policy(company_id) -> dict:
    from companies.models import _section_role_specs
    titles = {code: label for code, label, _rank in _section_role_specs()}
    specs = step_workflows()
    rows = _rows(company_id)
    values = {k: _row_values(r) for k, r in rows.items()}
    defaults = role_defaults()
    workflows = []
    for key in sorted(specs):
        spec = specs[key]
        policy = _policy(company_id, key, values, defaults)
        block = _block(policy, rows.get(key), workflow_roles({key: spec}), titles)
        block.update({
            'key': key, 'title_fa': spec.title_fa,
            'steps': [{'key': s.key, 'title_fa': s.title_fa, 'kind': s.kind, 'role': s.role,
                       'role_title_fa': titles.get(s.role, s.role), 'payment': s.payment,
                       'locked': s.fixed_missing_action, 'effective': policy.missing_action(s),
                       'source': LOCKED if s.fixed_missing_action else policy.source(s.role)}
                      for s in spec.steps],
        })
        workflows.append(block)
    return {
        'company_id': company_id,
        'role_defaults': defaults,
        'company_default': _block(_policy(company_id, '', values, defaults), rows.get(''),
                                  workflow_roles(specs), titles),
        'workflows': workflows,
        'notify_candidates': notify_candidates(company_id),
    }


def notify_candidates(company_id) -> list:
    """گزینه‌های «کاربران انتخاب‌شده» برای خبر انتظار؛ همان شرط clean_values: فعال، غیر مدیر کل و عضو فعال
    همین شرکت. فقط [{id, name}] (دو پرس‌وجو)."""
    from django.db.models import Q
    from companies.models import SectionAssignment
    ids = set(SectionAssignment.objects.filter(
        Q(company_id=company_id) | Q(project__company_id=company_id) | Q(section__project__company_id=company_id),
        is_active=True, user__is_active=True, user__is_superuser=False,
    ).values_list('user_id', flat=True))
    users = get_user_model().objects.filter(pk__in=ids).order_by('first_name', 'last_name', 'username')
    return [{'id': u.pk, 'name': (u.get_full_name() or '').strip() or u.username} for u in users]


# ─── پیش‌نمایش ────────────────────────────────────────────────────────────────

def _settle_blocked(spec, instance) -> bool:
    """همان قلاب can_settle_outside موتور (رسید با قسط و…): مرحلهٔ پرداختِ منع‌شده جلو نمی‌رود و منتظر می‌ماند."""
    from types import SimpleNamespace
    from .engine import settle_block
    from platform_core.registry import resolve_entity
    obj = resolve_entity(spec.entity_kind, instance.entity_id)
    return settle_block(SimpleNamespace(obj=obj), instance) is not None


def simulate(company_id, workflow_key, proposed, today=None) -> dict:
    """
    اثر تغییر یک ردیف (proposed=None یعنی حذف ردیف گردش) روی کارهای مرحلهٔ باز همان شرکت و همان گردش(ها)، با
    همان قاعدهٔ recompute_open_tasks و بی هیچ نوشتن یا رویداد:
    - advance: بی‌دریافت‌کنندهٔ اصلی با «رد شود» و نه forced (سند جلو می‌رود)؛
    - waiting: بی‌دریافت‌کنندهٔ اصلی با «منتظر بماند» که امروز دریافت‌کننده دارد (گذار به منتظر)؛
    - recipients_changed: دریافت‌کنندگان اصلی با تنظیم تازه فرق می‌کند (یا کار منتظر نفر پیدا می‌کند).
    کار نمونهٔ با نسخهٔ قدیم شمرده نمی‌شود (recompute آن را از مسیر نسخهٔ ت۱۵ می‌برد).
    """
    specs = step_workflows()
    keys = sorted(specs) if not workflow_key else [workflow_key]
    current = {k: _row_values(r) for k, r in _rows(company_id).items()}
    proposed_rows = dict(current)
    if proposed is None:
        proposed_rows.pop(workflow_key, None)
    else:
        proposed_rows[workflow_key] = proposed
    defaults = role_defaults()
    cur_pol = {k: _policy(company_id, k, current, defaults) for k in keys}
    new_pol = {k: _policy(company_id, k, proposed_rows, defaults) for k in keys}
    tasks = list(WorkflowTask.objects.filter(
        is_open=True, track=WorkflowTask.TRACK_STEP, instance__company_id=company_id,
        instance__status=WorkflowInstance.IN_PROGRESS, instance__workflow_key__in=keys)
        .select_related('instance__section__project').order_by('pk'))
    items, steps = [], {}
    for task in tasks:
        inst = task.instance
        spec = specs[inst.workflow_key]
        step = spec.step(task.step_key)
        if step is None or spec.version != inst.version:
            continue
        steps[task.pk] = step
        base = (scope_triplet(inst.section, inst.company_id), task.role, task.permission, inst.created_by_id, None,
                inst.allow_substitute)
        for tag, pols in (('cur', cur_pol), ('new', new_pol)):
            items.append(((tag, task.pk), *base,
                          step.creator_may_act or pols[inst.workflow_key].creator_may_approve_own))
    computed = compute_recipients_batch(items, today=today or timezone.localdate()) if items else {}
    result = {e: [] for e in EFFECTS}
    per_workflow, samples = {}, []
    for task in tasks:
        step = steps.get(task.pk)
        if step is None:
            continue
        inst = task.instance
        new_principals = computed[('new', task.pk)][0]
        effect = None
        if not new_principals:
            if (not task.forced and new_pol[inst.workflow_key].missing_action(step) == SKIP
                    and not (step.payment and _settle_blocked(spec, inst))):
                effect = ADVANCE
            elif task.has_recipients:
                effect = WAITING
        elif new_principals != computed[('cur', task.pk)][0] or not task.has_recipients:
            effect = RECIPIENTS_CHANGED
        if effect is None:
            continue
        result[effect].append(task.pk)
        counts = per_workflow.setdefault(inst.workflow_key, {e: 0 for e in EFFECTS})
        counts[effect] += 1
        if len(samples) < SAMPLE_LIMIT:
            summary = inst.summary if isinstance(inst.summary, dict) else {}
            samples.append({'instance_id': inst.pk, 'workflow_key': inst.workflow_key,
                            'title': str(summary.get('title') or ''), 'step_key': task.step_key, 'effect': effect})
    fingerprint = json.dumps({'company': company_id, 'key': workflow_key, 'proposed': proposed,
                              'rows': current, 'result': result}, sort_keys=True, default=str)
    return {
        'workflow_key': workflow_key,
        'counts': {e: len(result[e]) for e in EFFECTS},
        'per_workflow': per_workflow,
        'samples': samples,
        'token': hashlib.sha256(fingerprint.encode('utf-8')).hexdigest(),
    }


# ─── ذخیره ───────────────────────────────────────────────────────────────────

def apply(user, company_id, workflow_key, proposed, token) -> dict:
    """ذخیره یا حذف ردیف با تأیید پیش‌نمایش؛ خروجی {preview، stats}."""
    from companies.models import Company
    if not isinstance(token, str) or not token:
        raise _bad('confirm_token_required', 'پیش از ذخیره، پیش‌نمایش اثر تغییر را ببینید و تأیید کنید')
    with transaction.atomic():
        # یک تغییر تنظیم در هر شرکت در هر لحظه (پیش‌نمایش دوباره و ذخیره زیر همین قفل)
        if not Company.objects.select_for_update().filter(pk=company_id).exists():
            raise WorkflowError('not_found', 'شرکت یافت نشد', 404)
        preview = simulate(company_id, workflow_key, proposed)
        if preview['token'] != token:
            raise PreviewStale(preview)
        row = WorkflowPolicy.objects.select_for_update().filter(
            company_id=company_id, workflow_key=workflow_key).first()
        before = _row_values(row)
        if proposed is None:
            if row is None:
                return {'preview': preview, 'stats': None}
            row_id = row.pk
            row.delete()
            action, after = 'DELETE', None
        else:
            action = 'UPDATE' if row is not None else 'CREATE'
            row = row or WorkflowPolicy(company_id=company_id, workflow_key=workflow_key)
            row.role_actions = proposed['role_actions']
            row.creator_may_approve_own = proposed[CREATOR_MAY_APPROVE_OWN]
            row.notify_mode = proposed[NOTIFY_MODE]
            row.notify_user_ids = proposed['notify_user_ids']
            row.updated_by = user
            row.save()
            row_id, after = row.pk, _row_values(row)
        log_audit_event(AUDIT_MODULE, action, target_model='WorkflowPolicy', target_object_id=row_id,
                        target_repr=f'WorkflowPolicy #{row_id}', severity='warning', user=user,
                        before_state=before, after_state=after, company_id=company_id,
                        details={'workflow_key': workflow_key, 'preview_counts': preview['counts']})
        keys = [workflow_key] if workflow_key else sorted(step_workflows())
        stats = recompute_open_tasks(company_ids=[company_id], workflow_keys=keys)
    return {'preview': preview, 'stats': stats}


def set_company_creator_flag(user, company_id, value) -> bool:
    """
    سازگاری CompanySettingsView (ق۱۷): «تأیید سند خود» پیش‌فرض شرکت روی ردیف پیش‌فرض WorkflowPolicy، بی
    پیش‌نمایش. خروجی True اگر مقدار مؤثر عوض شد (فراخوان محاسبهٔ دوباره را پس از commit اجرا می‌کند).
    """
    row = WorkflowPolicy.objects.select_for_update().filter(company_id=company_id, workflow_key='').first()
    before = _row_values(row)
    old = bool(row.creator_may_approve_own) if row is not None else False
    if row is not None and row.creator_may_approve_own is value:
        return False
    row = row or WorkflowPolicy(company_id=company_id, workflow_key='')
    row.creator_may_approve_own = value
    row.updated_by = user
    row.save()
    log_audit_event(AUDIT_MODULE, 'UPDATE' if before else 'CREATE', target_model='WorkflowPolicy',
                    target_object_id=row.pk, target_repr=f'WorkflowPolicy #{row.pk}', severity='warning', user=user,
                    before_state=before, after_state=_row_values(row), company_id=company_id,
                    details={'workflow_key': '', 'via': 'company_settings'})
    return old != value


# ─── گزارش پیش از انتشار (طرح نبودن نفر بند ۷ و ۸) ──────────────────────────────

def policy_report(company_ids=None, workflow_keys=None, today=None) -> list:
    """
    گزارش فقط‌خواندنی هر شرکت فعال با کار مرحلهٔ باز: اثر تنظیم مؤثر فعلی روی سندهای باز (همان simulate با
    ردیف فعلی، پس بی‌تغییر) و شمار سندهای باز ساختهٔ مدیر کل و کارهایی که تنها دارندهٔ آن‌ها مدیر کل است.
    همه چیز درون تراکنشی که برگردانده می‌شود اجرا می‌شود تا هیچ نوشتنی نماند.
    """
    from django.db.models import Exists, OuterRef
    from companies.models import Company
    from .models import WorkflowTaskRecipient
    specs = step_workflows()
    keys = [k for k in (workflow_keys or sorted(specs)) if k in specs]
    out = []
    with transaction.atomic():
        open_tasks = WorkflowTask.objects.filter(
            is_open=True, track=WorkflowTask.TRACK_STEP, instance__status=WorkflowInstance.IN_PROGRESS,
            instance__workflow_key__in=keys)
        companies = Company.objects.filter(
            is_active=True, pk__in=open_tasks.values('instance__company_id')).order_by('pk')
        if company_ids:
            companies = companies.filter(pk__in=list(company_ids))
        for company in companies:
            current = {k: _row_values(r) for k, r in _rows(company.pk).items()}
            per_workflow = {}
            for key in keys:
                preview = simulate(company.pk, key, current.get(key), today=today)
                counts = dict(preview['counts'])
                counts['waiting_now'] = open_tasks.filter(
                    instance__company_id=company.pk, instance__workflow_key=key, has_recipients=False).count()
                if any(counts.values()):
                    per_workflow[key] = counts
            company_tasks = open_tasks.filter(instance__company_id=company.pk)
            superuser_only = company_tasks.filter(
                Exists(WorkflowTaskRecipient.objects.filter(task_id=OuterRef('pk'))),
            ).exclude(
                Exists(WorkflowTaskRecipient.objects.filter(task_id=OuterRef('pk'), user__is_superuser=False)),
            ).count()
            out.append({
                'company_id': company.pk, 'company': str(company),
                'workflows': per_workflow,
                'superuser_created_open': WorkflowInstance.objects.filter(
                    company_id=company.pk, status=WorkflowInstance.IN_PROGRESS, workflow_key__in=keys,
                    created_by__is_superuser=True).count(),
                'superuser_only_tasks': superuser_only,
            })
        transaction.set_rollback(True)
    return out


def company_creator_flag(company_id) -> bool:
    row = WorkflowPolicy.objects.filter(company_id=company_id, workflow_key='').only('creator_may_approve_own').first()
    return bool(row and row.creator_may_approve_own)
