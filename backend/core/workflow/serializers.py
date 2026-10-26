"""
ساخت پاسخ‌های API گردش کار (۲.۳-ب) از ردیف‌های پیش‌بارشده؛ هیچ تابعی اینجا پرس‌وجو نمی‌زند (بی N+1).
اعلام گردش‌ها از رجیستری کش‌شده خوانده می‌شود؛ گردشی که ماژولش نصب نیست با کلید خام نمایش داده می‌شود.
"""
from django.utils import timezone

from common.date_utils import format_to_shamsi_str

from .models import WorkflowStep
from .registry import COMPLETED, CANCELLED, INFORM, REFER, REJECTED, RETURNED, workflow_specs
from .substitutes import person

REFERRAL_KIND_TITLES = {REFER: 'ارجاع', INFORM: 'برای اطلاع'}

TERMINAL_TITLES = {
    COMPLETED: 'پایان گردش',
    RETURNED: 'عودت برای اصلاح',
    REJECTED: 'رد قطعی',
    CANCELLED: 'لغو',
}

SKIP_REASON_TITLES = {
    'threshold': 'مبلغ در سقف مرحله',
    'creator_level': 'سطح ثبت‌کننده',
    'no_recipient': 'بی‌نفر',
    'no_second_approval': 'بدون تأیید دوم',
    'version_removed': 'حذف مرحله در تعریف تازه',
}


def _dt(value):
    return value.isoformat() if value else None


def _shamsi_dt(value):
    return format_to_shamsi_str(timezone.localtime(value), include_time=True) if value else ''


def _day(value):
    return value.isoformat() if value else None


def _ref(obj):
    return {'id': obj.pk, 'name': obj.name} if obj is not None else None


def step_title(spec, key):
    if key in TERMINAL_TITLES:
        return TERMINAL_TITLES[key]
    step = spec.step(key) if spec is not None and key else None
    return step.title_fa if step is not None else (key or '')


def task_card(task, now=None) -> dict:
    """کارت یک کار باز از کار، نمونه، شرکت، بخش و my_rows پیش‌بارشده."""
    now = now or timezone.now()
    inst = task.instance
    spec = workflow_specs().get(inst.workflow_key)
    step = spec.step(task.step_key) if spec is not None else None
    rows = getattr(task, 'my_rows', None) or []
    behalf_row = None
    if rows and all(r.on_behalf_of_id is not None for r in rows):
        behalf_row = rows[0]
    referral = task.track == task.TRACK_REFERRAL
    if referral:
        actions = [WorkflowStep.DONE if task.step_kind == REFER else WorkflowStep.SEEN]
        step_title_fa = REFERRAL_KIND_TITLES.get(task.step_kind, task.step_kind)
    else:
        actions = list(step.actions) if step is not None else []
        step_title_fa = step.title_fa if step is not None else task.step_key
    read_at = max((r.read_at for r in rows if r.read_at), default=None)
    return {
        'task_id': task.pk,
        'instance_id': inst.pk,
        'revision': task.revision,
        'workflow_key': inst.workflow_key,
        'workflow_title_fa': spec.title_fa if spec is not None else inst.workflow_key,
        'entity_kind': inst.entity_kind,
        'entity_id': inst.entity_id,
        'step_key': task.step_key,
        'step_title_fa': step_title_fa,
        'step_kind': task.step_kind,
        'actions': actions,
        'track': task.track,
        'kind': task.step_kind,
        'instruction': task.instruction,
        'due_at': _dt(task.due_at),
        'due_at_shamsi': _shamsi_dt(task.due_at),
        'referred_by': person(task.referred_by) if referral and task.referred_by_id else None,
        'parent_task_id': task.parent_task_id,
        'read_at': _dt(read_at),
        'summary': inst.summary or {},
        'route': spec.route.replace('{id}', str(inst.entity_id)) if spec is not None else None,
        'company': _ref(inst.company),
        'section': _ref(inst.section),
        'amount': str(inst.amount) if inst.amount is not None else None,
        'opened_at': _dt(task.opened_at),
        'opened_at_shamsi': _shamsi_dt(task.opened_at),
        'waiting_hours': max(0, int((now - task.opened_at).total_seconds() // 3600)),
        'has_recipients': task.has_recipients,
        'on_behalf_of': person(behalf_row.on_behalf_of) if behalf_row else None,
        'valid_from': _day(behalf_row.valid_from) if behalf_row else None,
        'valid_to': _day(behalf_row.valid_to) if behalf_row else None,
        'valid_from_shamsi': format_to_shamsi_str(behalf_row.valid_from) if behalf_row else '',
        'valid_to_shamsi': format_to_shamsi_str(behalf_row.valid_to) if behalf_row else '',
        'can_cancel': False,
    }


def referral_node(task, with_text=True) -> dict:
    """
    یک گره درخت ارجاع (فهرست تخت با شناسهٔ والد)؛ target_user، referred_by و closed_by بارشده.
    with_text=False: دستور و پاسخ خالی (بیننده طرف این شاخه نیست).
    """
    return {
        'task_id': task.pk,
        'parent_task_id': task.parent_task_id,
        'kind': task.step_kind,
        'kind_fa': REFERRAL_KIND_TITLES.get(task.step_kind, task.step_kind),
        'target_user': person(task.target_user) if task.target_user_id else None,
        'referred_by': person(task.referred_by) if task.referred_by_id else None,
        'instruction': task.instruction if with_text else '',
        'reply': task.reply if with_text else '',
        'due_at': _dt(task.due_at),
        'due_at_shamsi': _shamsi_dt(task.due_at),
        'is_open': task.is_open,
        'outcome': task.outcome,
        'outcome_fa': task.get_outcome_display() if task.outcome else '',
        'opened_at': _dt(task.opened_at),
        'opened_at_shamsi': _shamsi_dt(task.opened_at),
        'closed_at': _dt(task.closed_at),
        'closed_at_shamsi': _shamsi_dt(task.closed_at),
        'closed_by': person(task.closed_by) if task.closed_by_id else None,
    }


def _skipped(spec, items):
    out = []
    for item in items or []:
        key = item.get('step') if isinstance(item, dict) else item
        reason = item.get('reason') if isinstance(item, dict) else ''
        out.append({'step': key, 'step_title_fa': step_title(spec, key), 'reason': reason,
                    'reason_fa': SKIP_REASON_TITLES.get(reason, reason or '')})
    return out


def history_step(spec, row) -> dict:
    return {
        'id': row.pk,
        'action': row.action,
        'action_fa': row.get_action_display(),
        'actor': person(row.actor) if row.actor_id else None,
        'actor_name': (person(row.actor)['name'] if row.actor_id else 'سامانه'),
        'on_behalf_of': person(row.on_behalf_of) if row.on_behalf_of_id else None,
        'as_superuser': row.as_superuser,
        'from_step': row.from_step,
        'from_step_title_fa': step_title(spec, row.from_step),
        'to_step': row.to_step,
        'to_step_title_fa': step_title(spec, row.to_step),
        'reason': row.reason,
        'skipped': _skipped(spec, row.skipped),
        'at': _dt(row.at),
        'at_shamsi': _shamsi_dt(row.at),
    }


def history_instance(inst, user) -> dict:
    spec = workflow_specs().get(inst.workflow_key)
    return {
        'instance_id': inst.pk,
        'workflow_key': inst.workflow_key,
        'workflow_title_fa': spec.title_fa if spec is not None else inst.workflow_key,
        'version': inst.version,
        'status': inst.status,
        'status_fa': inst.get_status_display(),
        'current_step': inst.current_step,
        'current_step_title_fa': step_title(spec, inst.current_step),
        'revision': inst.revision,
        'created_by': person(inst.created_by) if inst.created_by_id else None,
        'company': _ref(inst.company),
        'section': _ref(inst.section),
        'amount': str(inst.amount) if inst.amount is not None else None,
        'submitted_at': _dt(inst.submitted_at),
        'submitted_at_shamsi': _shamsi_dt(inst.submitted_at),
        'closed_at': _dt(inst.closed_at),
        'closed_at_shamsi': _shamsi_dt(inst.closed_at),
        'can_cancel': (inst.created_by_id == user.pk and inst.status == inst.IN_PROGRESS and not inst.others_acted),
        'steps': [history_step(spec, s) for s in inst.steps.all()],
    }


def instance_state(inst) -> dict:
    spec = workflow_specs().get(inst.workflow_key)
    return {
        'instance_id': inst.pk,
        'status': inst.status,
        'status_fa': inst.get_status_display(),
        'current_step': inst.current_step,
        'current_step_title_fa': step_title(spec, inst.current_step),
        'revision': inst.revision,
    }


def definition(spec) -> dict:
    return {
        'key': spec.key,
        'version': spec.version,
        'entity_kind': spec.entity_kind,
        'title_fa': spec.title_fa,
        'has_amount': spec.amount_field is not None,
        'steps': [{'key': s.key, 'title_fa': s.title_fa, 'kind': s.kind, 'role': s.role, 'actions': list(s.actions)}
                  for s in spec.steps],
    }


def threshold_row(row) -> dict:
    spec = workflow_specs().get(row.workflow_key)
    return {
        'id': row.pk,
        'workflow_key': row.workflow_key,
        'workflow_title_fa': spec.title_fa if spec is not None else row.workflow_key,
        'step_key': row.step_key,
        'step_title_fa': step_title(spec, row.step_key),
        'company_id': row.company_id,
        'section': _ref(row.section) if row.section_id else None,
        'amount': str(row.amount),
        'updated_by': person(row.updated_by) if row.updated_by_id else None,
        'updated_at': _dt(row.updated_at),
        'updated_at_shamsi': _shamsi_dt(row.updated_at),
    }
