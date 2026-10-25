"""
API موتور گردش کار (۲.۳-ب)، زیر api/workflow/. همهٔ نماها IsAuthenticated و همهٔ پرس‌وجوها محدود به کاربر.

قاعدهٔ لو نرفتن وجود (چک‌لیست دامنهٔ شرکت):
- اقدام روی کار: کار ناموجود، یا کار باز که کاربر ردیفی رویش ندارد (و ثبت‌کننده و مدیر کل نیست) = 404.
  کار بسته فقط برای عضو فعال شرکت همان نمونه (یا ثبت‌کننده و مدیر کل) به موتور می‌رسد تا 409 task_already_done
  بی‌تغییر برگردد (ت۱۳: اقدام دوم نفر دیگر)؛ برای بقیه 404. خطای 403 موتور (not_recipient و self_approval) فقط
  برای کسی می‌آید که کار را می‌بیند.
- سابقه و لغو: نمونه‌ای که کاربر دسترسی دیدنش را ندارد = 404.
- سقف و تنظیمات: بی‌مجوز 403 یکسان برای شرکت ناموجود و ناعضو؛ حذف سقفِ نادیدنی 404.
هیچ نمایی رویداد وب‌سوکت شرکت یا عمومی نمی‌فرستد؛ رویدادهای کار فقط از موتور (events.py) می‌آیند.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit_utils import log_audit_event
from accounts.permission_admin import member_company_ids
from accounts.scoped_permissions import can
from companies.models import Company, ProjectSection
from platform_core.registry import entity_view_decision

from . import engine
from . import serializers as ser
from .errors import TaskAlreadyDone, WorkflowError
from .models import (WorkflowCompanySettings, WorkflowInstance, WorkflowStep, WorkflowTask, WorkflowTaskRecipient,
                     WorkflowThreshold)
from .queries import count_tasks_for_user, tasks_for_user, unassigned_open_tasks
from .recipients import company_member_pairs
from .registry import APPROVE, workflow_specs
from .substitutes import (AUDIT_MODULE, create_substitute, is_live_superuser, list_substitutes, revoke_substitute,
                          serialize_substitute, substitute_candidates)

THRESHOLD_PERMISSION = 'accounts.perm_workflow_thresholds'
MAX_HOURS = 720
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def error_response(exc: WorkflowError) -> Response:
    """یک نگاشت برای همهٔ خطاهای موتور: بدنه as_dict() و وضعیت exc.status."""
    return Response(exc.as_dict(), status=exc.status)


def _bad(code, message_fa):
    return WorkflowError(code, message_fa, 400)


def _not_found(message_fa='یافت نشد'):
    return WorkflowError('not_found', message_fa, 404)


def _forbidden():
    return WorkflowError('not_allowed', 'اجازهٔ این کار را ندارید', 403)


def _int(value, name, required=False):
    if value in (None, ''):
        if required:
            raise _bad('invalid_param', f'پارامتر «{name}» الزامی است')
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise _bad('invalid_param', f'پارامتر «{name}» نامعتبر است')


def _page_params(request):
    def num(name, default):
        try:
            return int(request.query_params.get(name, default))
        except (TypeError, ValueError):
            return default
    page = max(1, num('page', 1))
    size = min(MAX_PAGE_SIZE, max(1, num('page_size', DEFAULT_PAGE_SIZE)))
    return page, size


def _paged(request, qs, count):
    page, size = _page_params(request)
    start = (page - 1) * size
    now = timezone.now()
    results = [ser.task_card(t, now) for t in qs[start:start + size]]
    return Response({'count': count, 'results': results, 'page': page, 'page_size': size})


class WorkflowAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        if isinstance(exc, WorkflowError):
            return error_response(exc)
        return super().handle_exception(exc)


# ─── کارهای من ───────────────────────────────────────────────────────────────

class MyTasksView(WorkflowAPIView):
    def get(self, request):
        company = _int(request.query_params.get('company'), 'company')
        workflow = request.query_params.get('workflow') or None
        qs = tasks_for_user(request.user)
        if company is None and workflow is None:
            count = count_tasks_for_user(request.user)
        else:
            if company is not None:
                qs = qs.filter(instance__company_id=company)
            if workflow is not None:
                qs = qs.filter(instance__workflow_key=workflow)
            count = qs.count()
        return _paged(request, qs, count)


class MyTasksCountView(WorkflowAPIView):
    def get(self, request):
        return Response({'count': count_tasks_for_user(request.user)})


class UnassignedTasksView(WorkflowAPIView):
    def get(self, request):
        if not is_live_superuser(request.user):
            raise WorkflowError('superuser_only', 'این فهرست فقط برای مدیر کل سامانه است', 403)
        company = _int(request.query_params.get('company'), 'company')
        qs = unassigned_open_tasks(request.user, company_id=company)
        return _paged(request, qs, qs.count())


def _task_visible(user, task) -> bool:
    if is_live_superuser(user):
        return True
    inst = task.instance
    if inst.created_by_id == user.pk:
        return True
    if task.is_open:
        return WorkflowTaskRecipient.objects.filter(task_id=task.pk, user_id=user.pk).exists()
    return (user.pk, inst.company_id) in company_member_pairs([user.pk], [inst.company_id])


class TaskActionView(WorkflowAPIView):
    ACTIONS = ('act', 'return', 'reject')

    def post(self, request, task_id):
        action = request.data.get('action')
        if action not in self.ACTIONS:
            raise _bad('invalid_action', 'اقدام باید یکی از act، return یا reject باشد')
        revision = _int(request.data.get('revision'), 'revision')
        reason = str(request.data.get('reason') or '').strip()
        task = WorkflowTask.objects.select_related('instance').filter(pk=task_id).first()
        if task is None or not getattr(request.user, 'is_active', False) or not _task_visible(request.user, task):
            raise _not_found('کار یافت نشد')
        if not task.is_open and not is_live_superuser(request.user):
            # کار بسته: همان 409 موتور، بی‌اجرای موتور (هم‌سان‌سازی نسخه فقط برای کسی که اجازهٔ اقدام دارد)
            raise TaskAlreadyDone()
        if action == 'act':
            inst = engine.act(request.user, task, reason=reason, revision=revision)
        elif action == 'return':
            inst = engine.return_for_fix(request.user, task, reason, revision=revision)
        else:
            inst = engine.reject(request.user, task, reason, revision=revision)
        return Response(ser.instance_state(inst))


# ─── سابقه و لغو ─────────────────────────────────────────────────────────────

def visible_instances(user, instances, kind, entity_id) -> list:
    """
    نمونه‌هایی از یک سند که کاربر می‌تواند سابقه‌شان را ببیند: مدیر کل فعال، کار باز روی سند (task_grants_view)،
    ثبت‌کننده، انجام‌دهنده یا «به جانشینی از» در قدم‌ها، یا view_permission اعلام‌شدهٔ گردش در بخش نمونه.
    """
    if not instances or not getattr(user, 'is_active', False):
        return []
    # قلاب دیدن ماژول (ص۲ طرح ۲.۶): منع = هیچ سابقه‌ای، اجازه = همه، بی‌نظر = قاعدهٔ زیر
    decision = entity_view_decision(user, kind, entity_id)
    if decision is False:
        return []
    if decision is True or is_live_superuser(user) or engine.task_grants_view(user, kind, entity_id):
        return list(instances)
    specs = workflow_specs()
    out = []
    for inst in instances:
        if inst.created_by_id == user.pk or any(user.pk in (s.actor_id, s.on_behalf_of_id) for s in inst.steps.all()):
            out.append(inst)
            continue
        spec = specs.get(inst.workflow_key)
        if spec is not None and spec.view_permission and can(user, spec.view_permission, inst.section):
            out.append(inst)
    return out


def _instances_of(kind, entity_id, pk=None):
    qs = WorkflowInstance.objects.select_related('created_by', 'company', 'section').prefetch_related(
        Prefetch('steps', queryset=WorkflowStep.objects.select_related('actor', 'on_behalf_of').order_by('at', 'id')))
    if pk is not None:
        return list(qs.filter(pk=pk))
    return list(qs.filter(entity_kind=kind, entity_id=entity_id).order_by('id'))


class HistoryView(WorkflowAPIView):
    def get(self, request):
        kind = (request.query_params.get('kind') or '').strip()
        entity_id = _int(request.query_params.get('id'), 'id', required=True)
        if not kind:
            raise _bad('invalid_param', 'پارامتر «kind» الزامی است')
        visible = visible_instances(request.user, _instances_of(kind, entity_id), kind, entity_id)
        if not visible:
            raise _not_found('سابقه‌ای یافت نشد')
        return Response({'entity_kind': kind, 'entity_id': entity_id,
                         'instances': [ser.history_instance(i, request.user) for i in visible]})


class InstanceCancelView(WorkflowAPIView):
    def post(self, request, instance_id):
        found = _instances_of(None, None, pk=instance_id)
        if not found or not visible_instances(request.user, found, found[0].entity_kind, found[0].entity_id):
            raise _not_found('گردش یافت نشد')
        reason = str(request.data.get('reason') or '').strip()
        inst = engine.cancel(request.user, found[0].pk, reason=reason)
        return Response(ser.instance_state(inst))


class DefinitionsView(WorkflowAPIView):
    def get(self, request):
        specs = workflow_specs()
        return Response([ser.definition(specs[k]) for k in sorted(specs)])


# ─── سقف مبلغ (ت۹) و تنظیمات شرکت (ت۱۲) ─────────────────────────────────────

def can_edit_company_settings(user, company_id) -> bool:
    """مدیر کل فعال، یا perm_workflow_thresholds و عضو همان شرکت (قاعدهٔ ۲ ت۱۰ طرح ۲.۲)."""
    if not company_id or not getattr(user, 'is_active', False):
        return False
    if is_live_superuser(user):
        return True
    return user.has_perm(THRESHOLD_PERMISSION) and company_id in member_company_ids(user)


def _require_editor(user, company_id):
    if not can_edit_company_settings(user, company_id):
        raise _forbidden()


def _audit(user, action, target_model, target_id, company_id, before=None, after=None, details=None):
    log_audit_event(AUDIT_MODULE, action, target_model=target_model, target_object_id=target_id,
                    target_repr=f'{target_model} #{target_id}', severity='warning', user=user,
                    before_state=before, after_state=after, company_id=company_id, details=details or {})


def _threshold_state(row):
    return {'workflow_key': row.workflow_key, 'step_key': row.step_key, 'company_id': row.company_id,
            'section_id': row.section_id, 'amount': str(row.amount)}


def _threshold_company_id(row):
    return row.company_id or (row.section.project.company_id if row.section_id else None)


class ThresholdListView(WorkflowAPIView):
    def get(self, request):
        company_id = _int(request.query_params.get('company'), 'company', required=True)
        _require_editor(request.user, company_id)
        rows = (WorkflowThreshold.objects.filter(Q(company_id=company_id) | Q(section__project__company_id=company_id))
                .select_related('section', 'updated_by').order_by('workflow_key', 'step_key', 'id'))
        return Response([ser.threshold_row(r) for r in rows])

    def post(self, request):
        data = request.data
        company_id = _int(data.get('company'), 'company', required=True)
        _require_editor(request.user, company_id)
        section_id = _int(data.get('section'), 'section')
        workflow_key = str(data.get('workflow_key') or '')
        step_key = str(data.get('step_key') or '')
        spec = workflow_specs().get(workflow_key)
        if spec is None:
            raise _bad('unknown_workflow', 'گردش کار تعریف نشده است')
        step = spec.step(step_key)
        if step is None:
            raise _bad('unknown_step', 'مرحله در این گردش تعریف نشده است')
        if step.kind != APPROVE:
            raise _bad('not_approve_step', 'سقف مبلغ فقط برای مرحله‌های «تأیید» است')
        try:
            amount = Decimal(str(data.get('amount')))
        except (InvalidOperation, TypeError, ValueError):
            raise _bad('invalid_amount', 'سقف مبلغ نامعتبر است')
        if not amount.is_finite() or amount < 0 or amount >= Decimal('1e22'):
            raise _bad('invalid_amount', 'سقف مبلغ باید عددی صفر یا مثبت باشد')
        amount = amount.quantize(Decimal('0.01'))
        if not Company.objects.filter(pk=company_id).exists():
            raise _not_found('شرکت یافت نشد')
        if section_id is not None and not ProjectSection.objects.filter(
                pk=section_id, project__company_id=company_id).exists():
            raise _bad('section_not_in_company', 'این بخش در شرکت داده‌شده نیست')
        target = {'section_id': section_id} if section_id is not None else {'company_id': company_id}
        with transaction.atomic():
            row = WorkflowThreshold.objects.select_for_update().filter(
                workflow_key=workflow_key, step_key=step_key, **target).first()
            before = _threshold_state(row) if row else None
            if row is None:
                row = WorkflowThreshold(workflow_key=workflow_key, step_key=step_key, **target)
            row.amount = amount
            row.updated_by = request.user
            row.save()
            _audit(request.user, 'UPDATE' if before else 'CREATE', 'WorkflowThreshold', row.pk, company_id,
                   before=before, after=_threshold_state(row))
        row = WorkflowThreshold.objects.select_related('section', 'updated_by').get(pk=row.pk)
        return Response(ser.threshold_row(row), status=200 if before else 201)


class ThresholdDetailView(WorkflowAPIView):
    def delete(self, request, threshold_id):
        row = WorkflowThreshold.objects.select_related('section__project').filter(pk=threshold_id).first()
        company_id = _threshold_company_id(row) if row else None
        if row is None or not can_edit_company_settings(request.user, company_id):
            raise _not_found('سقف یافت نشد')
        before = _threshold_state(row)
        with transaction.atomic():
            row.delete()
            _audit(request.user, 'DELETE', 'WorkflowThreshold', threshold_id, company_id, before=before)
        return Response(status=204)


def _settings_payload(row):
    return {'company_id': row.company_id, 'reminder_hours': row.reminder_hours,
            'escalation_hours': row.escalation_hours, 'is_default': row.pk is None,
            'updated_at': row.updated_at.isoformat() if row.updated_at else None}


class CompanySettingsView(WorkflowAPIView):
    def get(self, request, company_id):
        _require_editor(request.user, company_id)
        return Response(_settings_payload(WorkflowCompanySettings.for_company(company_id)))

    def put(self, request, company_id):
        _require_editor(request.user, company_id)
        if not Company.objects.filter(pk=company_id).exists():
            raise _not_found('شرکت یافت نشد')
        with transaction.atomic():
            row = (WorkflowCompanySettings.objects.select_for_update().filter(company_id=company_id).first()
                   or WorkflowCompanySettings(company_id=company_id))
            before = None if row.pk is None else {'reminder_hours': row.reminder_hours,
                                                  'escalation_hours': row.escalation_hours}
            reminder = _int(request.data.get('reminder_hours', row.reminder_hours), 'reminder_hours', required=True)
            escalation = _int(request.data.get('escalation_hours', row.escalation_hours), 'escalation_hours',
                              required=True)
            if not (1 <= reminder < escalation <= MAX_HOURS):
                raise _bad('invalid_hours',
                           f'مدت یادآوری باید دست‌کم ۱ ساعت و کمتر از مدت خبر به بالاتر باشد و آن حداکثر {MAX_HOURS} ساعت')
            row.reminder_hours = reminder
            row.escalation_hours = escalation
            row.updated_by = request.user
            row.save()
            _audit(request.user, 'UPDATE' if before else 'CREATE', 'WorkflowCompanySettings', row.pk, company_id,
                   before=before, after={'reminder_hours': reminder, 'escalation_hours': escalation})
        return Response(_settings_payload(row))


# ─── جانشین موقت (ت۱۰) ───────────────────────────────────────────────────────

class SubstituteListView(WorkflowAPIView):
    def get(self, request):
        qs, manager_mode = list_substitutes(request.user, request.query_params.get('principal'))
        today = timezone.localdate()
        return Response([serialize_substitute(r, request.user, manager_mode, today) for r in qs])

    def post(self, request):
        d = request.data
        row = create_substitute(request.user, substitute_id=d.get('substitute_id'), start_date=d.get('start_date'),
                                end_date=d.get('end_date'), principal_id=d.get('principal_id'),
                                company_id=d.get('company_id'))
        row = (type(row).objects.select_related('principal', 'substitute', 'company', 'created_by', 'revoked_by')
               .get(pk=row.pk))
        return Response(serialize_substitute(row, request.user, row.principal_id != request.user.pk), status=201)


class SubstituteCandidatesView(WorkflowAPIView):
    def get(self, request):
        p = request.query_params
        return Response(substitute_candidates(request.user, p.get('principal'), p.get('company')))


class SubstituteDetailView(WorkflowAPIView):
    def delete(self, request, substitute_id):
        row = revoke_substitute(request.user, substitute_id)
        row = (type(row).objects.select_related('principal', 'substitute', 'company', 'created_by', 'revoked_by')
               .get(pk=row.pk))
        return Response(serialize_substitute(row, request.user))
