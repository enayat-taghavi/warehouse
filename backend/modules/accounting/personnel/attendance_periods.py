# -*- coding: utf-8 -*-
"""
دورهٔ کارکرد ماهانه (طرح ۴.۴، د۱، د۲، د۴، د۵):
- دوره برای «بخش + ماه» است؛ شرکت همیشه از بخش خوانده می‌شود، نه از درخواست (get_or_create_period).
- قفل یکسان دوره: از ارسال به بعد (is_period_locked)؛ همهٔ مسیرهای نوشتن کارکرد (ب۲) با همین می‌سنجند.
- گردش دوره روی موتور ۲.۳ (ATTENDANCE_PERIOD_WORKFLOW در workflows.py)؛ اکشن‌های قدیمی پوستهٔ نازک همین توابع‌اند.
"""
from django.db import IntegrityError, transaction
from django.db.models import Q

# د۴: از ارسال به بعد کارکرد دوره قفل است
PERIOD_LOCKED_STATUSES = (
    'SUBMITTED', 'SUBMITTED_SUPERVISOR', 'SUBMITTED_ACCOUNTANT', 'READY_TO_PAY', 'PAID', 'LOCKED', 'FINALIZED',
)
# در گردش موتور (کار باز دارد یا باید داشته باشد)
PERIOD_IN_FLIGHT_STATUSES = ('SUBMITTED', 'SUBMITTED_SUPERVISOR', 'SUBMITTED_ACCOUNTANT')
# بسته‌شده پس از پایان گردش یا مسیر قدیمی؛ فقط با بازگشایی د۴ باز می‌شود
PERIOD_CLOSED_STATUSES = ('READY_TO_PAY', 'PAID', 'LOCKED', 'FINALIZED')
PERIOD_LOCKED_CODE = 'attendance_period_locked'
PERIOD_LOCKED_MESSAGE = 'دورهٔ کارکرد این ماه ارسال یا قفل شده است و کارکرد آن تغییر نمی‌کند؛ با مسئول دوره هماهنگ کنید.'
LOCK_PERM = 'perm_lock_work_period'
ATTENDANCE_VIEW_PERM = 'view_sys_personnel_attendance'
APPROVE_SUPERVISOR_PERM = 'perm_approve_attendance_supervisor'
APPROVE_FINANCE_PERM = 'perm_approve_attendance_finance'
APPROVE_MANAGER_PERM = 'perm_approve_attendance_manager'
PERIOD_PERMS = (ATTENDANCE_VIEW_PERM, APPROVE_SUPERVISOR_PERM, APPROVE_FINANCE_PERM, APPROVE_MANAGER_PERM, LOCK_PERM)
# اکشن قدیمی approve-X / مرحلهٔ کارتابل ← کلید مرحلهٔ موتور
PERIOD_STAGE_STEP = {'supervisor': 'supervisor_ok', 'finance': 'accountant_review', 'manager': 'manager_ok'}
# د۶: وضعیت قدیمیِ در جریان ← مرحله‌ای که کار آن باز می‌شود
PERIOD_LEGACY_STATUS_STEP = {
    'SUBMITTED': 'supervisor_ok',
    'SUBMITTED_SUPERVISOR': 'accountant_review',
    'SUBMITTED_ACCOUNTANT': 'manager_ok',
}


def normalize_year_month(year_month):
    from common.date_utils import normalize_digits
    return normalize_digits(str(year_month or '')).strip()


def is_period_locked(period) -> bool:
    """د۴: دورهٔ ارسال‌شده یا بسته (None = دوره‌ای نیست = باز)."""
    return period is not None and period.status in PERIOD_LOCKED_STATUSES


def section_company_id(section_id):
    from .models import ProjectSection
    return ProjectSection.objects.filter(pk=section_id).values_list('project__company_id', flat=True).first()


def get_or_create_period(company_id, section_id, year_month, *, warehouse_id=None):
    """
    دورهٔ «بخش + ماه» (یا برای کارکرد بی‌بخش: شرکت/انبار + ماه). شرکت دورهٔ بخش‌دار همیشه شرکت بخش است؛
    شرکت ناهمخوان یا بخش ناموجود = ValueError. همزمانی امن: قیدهای یکتای 0018 + تلاش دوباره پس از IntegrityError.
    خروجی (period, created).
    """
    from .models import MonthlyWorkPeriod, ProjectSection
    ym = normalize_year_month(year_month)
    if not ym:
        raise ValueError('year_month الزامی است.')
    if section_id:
        section = ProjectSection.objects.select_related('project').filter(pk=section_id).first()
        if section is None or section.project_id is None:
            raise ValueError('بخش دوره یافت نشد.')
        sec_company = section.project.company_id
        if company_id not in (None, '') and str(company_id) != str(sec_company):
            raise ValueError('بخش انتخاب‌شده متعلق به این شرکت نیست.')
        lookup = {'company_id': sec_company, 'section_id': section.pk, 'year_month': ym}
        defaults = {'status': 'OPEN', 'project_id': section.project_id}
    else:
        if not company_id and not warehouse_id:
            raise ValueError('شرکت یا انبار دوره الزامی است.')
        lookup = {'company_id': int(company_id) if company_id else None, 'section__isnull': True,
                  'warehouse_id': int(warehouse_id) if warehouse_id else None, 'year_month': ym}
        defaults = {'status': 'OPEN'}
    try:
        with transaction.atomic():
            return MonthlyWorkPeriod.objects.get_or_create(**lookup, defaults=defaults)
    except IntegrityError:
        # ساخت همزمان دو درخواست: ردیف درخواست دیگر را برمی‌داریم
        return MonthlyWorkPeriod.objects.get(**lookup), False


def period_for_attendance(company_id, section_id, date_shamsi, *, warehouse_id=None):
    """دورهٔ ماه همان تاریخ شمسی (مثال ۱۴۰۴/۰۵/۱۲ ← ۱۴۰۴/۰۵) برای مسیرهای نوشتن کارکرد (ب۲)."""
    from common.date_utils import normalize_digits
    ym = normalize_digits(str(date_shamsi or '')).strip()[:7]
    return get_or_create_period(company_id, section_id, ym, warehouse_id=warehouse_id)[0]


def period_attendance_qs(period):
    """کارکردهای فعال دوره (همان پالایهٔ گیت قدیمی کارتابل سرپرست)."""
    from .models import DailyAttendance
    norm_ym = (period.year_month or '').replace('-', '/')
    att_filter = Q(is_deleted=False) & (Q(period=period) | Q(date_shamsi__startswith=norm_ym))
    if period.section_id:
        att_filter &= (Q(section_id=period.section_id)
                       | (Q(section_id__isnull=True) & Q(personnel__section_id=period.section_id)))
    elif period.project_id:
        att_filter &= (Q(project_id=period.project_id)
                       | (Q(project_id__isnull=True) & Q(personnel__project_id=period.project_id)))
    elif period.warehouse_id:
        att_filter &= Q(warehouse_id=period.warehouse_id)
    elif period.company_id:
        att_filter &= Q(personnel__company_id=period.company_id)
    return DailyAttendance.objects.filter(att_filter)


def revision_required_count(period) -> int:
    return period_attendance_qs(period).filter(approval_status='REVISION_REQUIRED').count()


def revision_blocked_message(count):
    return (f'تعداد {count} کارکرد این دوره برای اصلاح عودت شده است؛ پس از اصلاح آن‌ها دوره را تأیید یا ارسال کنید.')


def user_has_period_perm(user, period, codes) -> bool:
    """مجوز بخشی در بخش دوره (دورهٔ بی‌بخش: دست‌کم در یک بخش، به‌علاوهٔ دسترسی شرکت دوره)."""
    from accounts.scoped_permissions import can
    if user.is_superuser:
        return True
    if isinstance(codes, str):
        codes = (codes,)
    section = period.section_id
    return any(can(user, code, section) for code in codes)


def user_can_see_period(user, period) -> bool:
    """ق۶: شرکت دوره در شرکت‌های مجاز کاربر و یکی از مجوزهای کارکرد/تأیید/قفل در بخش دوره."""
    from companies.access import get_user_allowed_companies
    if period is None or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser:
        return True
    if period.company_id is None or not get_user_allowed_companies(user).filter(id=period.company_id).exists():
        return False
    return user_has_period_perm(user, period, PERIOD_PERMS)


# ─── پوستهٔ نازک اکشن‌های دوره روی موتور (د۵) ───────────────────────────────────────────────────────
def _wf_error(code, message, status=400):
    from workflow.errors import WorkflowError
    return WorkflowError(code, message, status)


def _open_period_task(period):
    """کار باز دوره؛ دورهٔ در جریانِ پیش از موتور همین‌جا نمونه می‌گیرد (همان دستور attendance_open_workflows)."""
    from workflow import engine as wf_engine
    from .workflows import ATTENDANCE_PERIOD_WORKFLOW, open_legacy_period_workflow
    task = wf_engine.open_task(ATTENDANCE_PERIOD_WORKFLOW, period.pk)
    if task is None:
        task = open_legacy_period_workflow(period)
    return task


def _legacy_transition(user, period, kind, reason=''):
    """
    دورهٔ قدیمی بی‌شرکت و بی‌بخش (فقط انبار) به موتور نمی‌رود (موتور شرکت می‌خواهد): همان گذار مستقیم قدیمی،
    ولی با مجوز (ارسال: مجوز کارکرد؛ تأیید/رد/عودت: تأیید مالی یا مدیر) و سابقه در WorkflowAuditLog.
    """
    from django.utils import timezone
    from .workflows import period_audit
    if kind == 'submit':
        allowed = user_has_period_perm(user, period, PERIOD_PERMS)
    else:
        allowed = user_has_period_perm(user, period, (APPROVE_FINANCE_PERM, APPROVE_MANAGER_PERM, LOCK_PERM))
    if not allowed:
        raise _wf_error('not_allowed', 'شما مجوز این اقدام روی دورهٔ کارکرد را ندارید.', 403)
    old = period.status
    if kind == 'submit':
        if is_period_locked(period):
            raise _wf_error(PERIOD_LOCKED_CODE, 'این دوره از قبل ارسال یا قفل شده است.')
        period.status, period.submitted_at, period.submitted_by = 'SUBMITTED', timezone.now(), user
        period.submission_notes, period.rejection_reason = reason or period.submission_notes, None
    elif old not in PERIOD_IN_FLIGHT_STATUSES:
        raise _wf_error('invalid_state', 'این دوره در گردش تأیید نیست و کار بازی ندارد.')
    elif kind == 'act':
        period.status, period.locked_at, period.locked_by = 'LOCKED', timezone.now(), user
    else:
        period.status = 'REJECTED' if kind == 'reject' else 'REVISION_REQUIRED'
        period.rejection_reason = reason
    period.save()
    period_audit(period, user, old, period.status, f'legacy_{kind}', 'legacy', reason)
    return period


def submit_period(user, period, notes=''):
    """ارسال دوره به گردش (یا ارسال دوباره پس از عودت/رد/بازگشایی). خطا: WorkflowError."""
    from workflow import engine as wf_engine
    from .workflows import ATTENDANCE_PERIOD_WORKFLOW
    if period.company_id is None and period.section_id:
        # دورهٔ بخش‌دار قدیمی بی شرکت: شرکت همیشه شرکت بخش است (د۱)
        period.company_id = section_company_id(period.section_id)
        if period.company_id is not None:
            try:
                with transaction.atomic():
                    period.save(update_fields=['company', 'updated_at'])
            except IntegrityError:
                raise _wf_error('duplicate_period', 'دورهٔ دیگری برای همین بخش و ماه هست؛ همان دوره را ارسال کنید.')
    if period.company_id is None:
        return _legacy_transition(user, period, 'submit', notes)
    if is_period_locked(period):
        raise _wf_error(PERIOD_LOCKED_CODE, 'این دوره از قبل ارسال یا قفل شده است.')
    if not user_has_period_perm(user, period, PERIOD_PERMS):
        raise _wf_error('not_allowed', 'شما مجوز ارسال کارکرد این بخش را ندارید.', 403)
    count = revision_required_count(period)
    if count:
        raise _wf_error('action_blocked', revision_blocked_message(count))
    with transaction.atomic():
        if notes:
            period.submission_notes = notes
            period.save(update_fields=['submission_notes', 'updated_at'])
        wf_engine.submit(ATTENDANCE_PERIOD_WORKFLOW, period, user, restart_closed=True)
    period.refresh_from_db()
    return period


def period_workflow_act(user, period, kind, *, stage=None, reason='', revision=None):
    """
    kind: 'act' (تأیید مرحلهٔ جاری)، 'return' (عودت برای اصلاح) یا 'reject' (رد). خطا: WorkflowError.
    stage (supervisor/finance/manager): فقط وقتی مرحلهٔ جاری همان است (مدیر حسابدار را دور نمی‌زند).
    """
    from workflow import engine as wf_engine
    from workflow.registry import get_spec
    from .workflows import ATTENDANCE_PERIOD_WORKFLOW
    if period.company_id is None and not period.section_id:
        return _legacy_transition(user, period, kind, reason)
    task = _open_period_task(period)
    if task is None:
        raise _wf_error('invalid_state', 'این دوره در گردش تأیید نیست و کار بازی ندارد.')
    step_key = PERIOD_STAGE_STEP.get(stage) if stage else None
    if step_key and task.step_key != step_key:
        current = get_spec(ATTENDANCE_PERIOD_WORKFLOW).step(task.step_key)
        raise _wf_error('wrong_step', f'این دوره اکنون در مرحلهٔ «{current.title_fa if current else task.step_key}» است و این اقدام در این مرحله ممکن نیست.')
    period._wf_reason = reason
    if kind == 'act':
        wf_engine.act(user, task, reason=reason, revision=revision, obj=period)
    elif kind == 'return':
        wf_engine.return_for_fix(user, task, reason, obj=period, revision=revision)
    else:
        wf_engine.reject(user, task, reason, obj=period, revision=revision)
    period.refresh_from_db()
    return period


def period_payroll_exists(period) -> bool:
    return period.payroll_records.exists()


def unlock_period(user, period, reason):
    """
    د۴: بازگشایی دوره (مدیر کل یا دارندهٔ perm_lock_work_period در بخش دوره، با دلیل اجباری).
    حقوق محاسبه یا پرداخت‌شده = 400. دورهٔ در گردش: لغو موتور (فقط ثبت‌کننده پیش از اقدام دیگران)؛
    دورهٔ بسته: برگشت به OPEN با سابقه؛ ارسال بعدی گردش را از نو شروع می‌کند.
    """
    from django.utils import timezone
    from workflow import engine as wf_engine
    from workflow.models import WorkflowInstance
    from .models import MonthlyWorkPeriod
    from .workflows import ATTENDANCE_PERIOD_WORKFLOW, period_audit
    reason = (reason or '').strip()
    if not user_has_period_perm(user, period, LOCK_PERM):
        raise _wf_error('not_allowed', 'فقط مدیر کل یا دارندهٔ مجوز بستن دورهٔ کارکرد در این بخش دوره را باز می‌کند.', 403)
    if not reason:
        raise _wf_error('reason_required', 'درج دلیل بازگشایی دوره الزامی است.')
    if period_payroll_exists(period) or period.status == 'PAID':
        raise _wf_error('payroll_exists', 'حقوق این دوره محاسبه یا پرداخت شده است و دوره باز نمی‌شود.')
    if period.status == 'OPEN':
        return period
    if period.status in PERIOD_IN_FLIGHT_STATUSES:
        instance = wf_engine.instance_of(ATTENDANCE_PERIOD_WORKFLOW, period.pk)
        if instance is not None and instance.status == WorkflowInstance.IN_PROGRESS:
            period._wf_reason = reason
            wf_engine.cancel(user, instance, reason=reason, obj=period)
            period.refresh_from_db()
            return period
    with transaction.atomic():
        locked = MonthlyWorkPeriod.objects.select_for_update().get(pk=period.pk)
        if period_payroll_exists(locked):
            raise _wf_error('payroll_exists', 'حقوق این دوره محاسبه یا پرداخت شده است و دوره باز نمی‌شود.')
        old = locked.status
        locked.status = 'OPEN'
        locked.locked_at = None
        locked.locked_by = None
        locked.save(update_fields=['status', 'locked_at', 'locked_by', 'updated_at'])
        period_audit(locked, user, old, 'OPEN', 'unlock', 'unlocked', reason,
                     extra={'unlocked_at': timezone.now().isoformat()})
    period.refresh_from_db()
    return period
