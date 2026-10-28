"""
Enterprise 5-Tier Workflow & State Machine Engine
موتور جامع و اتمیک ماشین حالت، عبور هوشمند (Auto-Pass) و حاکمیت گردش کار ۵ سطحی سازمانی
منطبق بر سند master_workflow_specification.md
"""

import logging
from platform_core.registry import permission_alias, expand_permission_aliases
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import PermissionDenied, ValidationError

logger = logging.getLogger(__name__)


class WorkflowTiers:
    TIER_1_OPERATOR = 1       # کارمند انبار / ثبت‌کننده
    TIER_2_SUPERVISOR = 2     # سرپرست انبار / تایید میدانی و عملیاتی
    TIER_3_ACCOUNTANT = 3     # حسابدار / کنترل مالی، بیمه و شبا
    TIER_4_MANAGER = 4        # مدیر شرکت / تصویب نهایی و صدور مجوز پرداخت
    TIER_5_TREASURY = 5       # خزانه‌دار / واریز، پایا و تسویه نهایی
    TIER_6_SUPERUSER = 6      # مدیر ارشد سیستم (دسترسی کامل)


class WorkflowStatuses:
    # وضعیت‌های استاندارد پرونده‌ها و درخواست‌ها
    DRAFT = 'draft'
    PENDING_SUPERVISOR = 'pending_supervisor'
    SUPERVISOR_APPROVED = 'supervisor_approved'
    PENDING_ACCOUNTANT = 'pending_accountant'
    ACCOUNTANT_APPROVED = 'accountant_approved'
    PENDING_MANAGER = 'pending_manager'
    MANAGER_APPROVED = 'manager_approved'
    APPROVED = 'approved'                  # تصویب و فعال‌سازی قطعی پرونده‌ها
    READY_TO_PAY = 'ready_to_pay'          # صدور مجوز پرداخت مدیر برای اسناد مالی
    PAID = 'paid'                          # پرداخت، تسویه و فریز قطعی خزانه‌داری
    REVISION_REQUIRED = 'revision_required'# نیازمند بازنگری و اصلاح
    REJECTED = 'rejected'                  # رد قطعی و ابطال
    CANCELLED = 'cancelled'                # لغو شده توسط ثبت‌کننده

    # وضعیت‌های معادل دوره‌های ماهانه
    PERIOD_OPEN = 'OPEN'
    PERIOD_SUBMITTED_SUPERVISOR = 'SUBMITTED_SUPERVISOR'
    PERIOD_SUBMITTED_ACCOUNTANT = 'SUBMITTED_ACCOUNTANT'
    PERIOD_READY_TO_PAY = 'READY_TO_PAY'
    PERIOD_PAID = 'PAID'
    PERIOD_LOCKED = 'LOCKED'
    PERIOD_FINALIZED = 'FINALIZED'
    PERIOD_REVISION_REQUIRED = 'REVISION_REQUIRED'
    PERIOD_REJECTED = 'REJECTED'

    # وضعیت‌های پرداخت انفرادی حقوق
    PAYROLL_PENDING = 'PENDING'
    PAYROLL_READY_TO_PAY = 'READY_TO_PAY'
    PAYROLL_PAID = 'PAID'
    PAYROLL_FAILED_SHEBA = 'FAILED_SHEBA'
    PAYROLL_REJECTED = 'REJECTED'


# مدل‌هایی که سطح کاربر در گردش کارشان در بخش خود رکورد سنجیده می‌شود (ت۸ و ت۱۳ طرح ۲.۲).
# بقیهٔ گردش‌کارها (کارکرد، ناوگان، حقوق) در بازبینی مرحلهٔ ۴ به همین شکل تبدیل می‌شوند.
SECTION_TIER_MODELS = ('ExpenseInvoice', 'PettyCashTransaction')


def workflow_section(instance):
    """بخشی که سطح کاربر برای این رکورد در آن سنجیده می‌شود، یا None (سنجش «در هر بخشی»)."""
    if instance is None or instance.__class__.__name__ not in SECTION_TIER_MODELS:
        return None
    return getattr(instance, 'section_id', None)


def _document_event_fields(instance):
    """(doc_type، شرکت، بخش، وضعیت) سندهای حسابداری که رویداد «سند تغییر کرد» دارند (ص۶ طرح ۲.۵)، یا None."""
    name = instance.__class__.__name__
    if name in ('ExpenseInvoice', 'PettyCashTransaction'):
        section = getattr(instance, 'section', None)
        project = getattr(section, 'project', None) if section is not None else None
        doc_type = 'expense_invoice' if name == 'ExpenseInvoice' else 'petty_cash'
        company_id = getattr(project, 'company_id', None)
        if company_id is None and name == 'PettyCashTransaction':
            # ردیف تنخواه سطح شرکت (بی‌بخش، ص۱ طرح ۳.۶): شرکت از حساب
            company_id = instance.wf_company_id
        return doc_type, company_id, instance.section_id, instance.status
    if name == 'PettyCashStatement':
        return 'petty_cash_statement', instance.company_id, None, instance.status
    if name == 'MonthlyPayrollRecord':
        personnel = getattr(instance, 'personnel', None)
        return ('payroll_record', getattr(personnel, 'company_id', None), getattr(personnel, 'section_id', None),
                instance.payment_status)
    if name == 'MonthlyWorkPeriod':
        return 'payroll_period', instance.company_id, None, instance.status
    return None


def notify_document_changed(instance, action='status_changed'):
    """
    پخش «سند تغییر کرد» برای فاکتور، تنخواه، فیش و دورهٔ حقوق از راه تابع هسته (فقط کانال شرکت، پس از commit).
    مدل‌های دیگر (پرسنل، خودرو و درخواست‌های تغییرشان) رویداد خودشان را دارند و این‌جا نادیده گرفته می‌شوند.
    """
    fields = _document_event_fields(instance) if instance is not None else None
    if fields is None:
        return
    doc_type, company_id, section_id, status = fields
    from companies.realtime import broadcast_document_changed
    broadcast_document_changed(doc_type, instance.pk, company_id=company_id, section_id=section_id,
                               status=status, action=action)


def determine_user_tier(user, section=None) -> int:
    """
    تشخیص بالاترین سطح سازمانی کاربر در ماتریس ۵ سطحی.
    section: اگر داده شود، سطح با مجوزهای کاربر در همان بخش سنجیده می‌شود (can؛ ق۶)، وگرنه «در هر بخشی».
    مجوز بخشی فقط از بستهٔ نقش انتساب می‌آید؛ تیک مستقیم یا نقش سامانه‌ای آن را نمی‌دهد (ت۲).
    """
    if not user or not user.is_authenticated:
        return 0
    if user.is_superuser:
        return WorkflowTiers.TIER_6_SUPERUSER

    tier = WorkflowTiers.TIER_1_OPERATOR

    from accounts.scoped_permissions import can

    def check_p(codenames):
        codenames = expand_permission_aliases(codenames)
        if section is not None:
            return any(can(user, f'accounts.{c}', section) for c in codenames)
        return any(user.has_perm(f'accounts.{c}') for c in codenames)

    for level, codenames in _tier_codes():
        if check_p(codenames):
            tier = max(tier, level)

    return tier


def _tier_codes():
    """(سطح، کدهای مجوز) ماتریس سطوح؛ کد مستعار هنگام فراخوانی از رجیستری خوانده می‌شود."""
    return (
        # خزانه‌داری (سطح ۵)
        (WorkflowTiers.TIER_5_TREASURY, ['perm_treasury_disburse_action']),
        # مدیر شرکت (سطح ۴)
        (WorkflowTiers.TIER_4_MANAGER, ['perm_manager_payment_authorize', 'perm_approve_personnel_manager',
                                        'perm_approve_fleet_manager', permission_alias('manager_approver')]),
        # حسابداری (سطح ۳)
        (WorkflowTiers.TIER_3_ACCOUNTANT, ['perm_approve_personnel_finance', 'perm_approve_fleet_finance',
                                           'view_sys_payroll', 'view_sys_fleet_settlement']),
        # سرپرست (سطح ۲)
        (WorkflowTiers.TIER_2_SUPERVISOR, ['perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor',
                                           permission_alias('supervisor_approver')]),
    )


def sections_with_tier(user, min_tier):
    """
    queryset بخش‌هایی که determine_user_tier(user, section=آن بخش) >= min_tier است (زیرپرس‌وجوی کارتابل).
    سطح، بیشینهٔ سطح کدهای داشته است؛ پس «سطح >= N» یعنی دست‌کم یک کد از سطح‌های >= N در همان بخش.
    """
    from accounts.scoped_permissions import sections_where
    from companies.models import ProjectSection
    if not user or not user.is_authenticated:
        return ProjectSection.objects.none()
    if user.is_superuser:
        return ProjectSection.objects.all()
    out = None
    for level, codenames in _tier_codes():
        if level < min_tier:
            continue
        for c in expand_permission_aliases(codenames):
            part = sections_where(user, f'accounts.{c}')
            out = part if out is None else (out | part)
    return out if out is not None else ProjectSection.objects.none()


def can_user_approve_stage(user, current_stage: str, is_financial: bool = False, section=None) -> bool:
    """
    بررسی مجاز بودن کاربر جهت تایید مرحله جاری
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    tier = determine_user_tier(user, section=section)

    stage_lower = current_stage.lower()

    if stage_lower in ['draft', 'pending_supervisor', 'open', 'revision_required']:
        # نیاز به سرپرست (سطح ۲ یا بالاتر)
        return tier >= WorkflowTiers.TIER_2_SUPERVISOR

    elif stage_lower in ['supervisor_approved', 'pending_accountant', 'submitted_supervisor']:
        # نیاز به حسابدار (سطح ۳ یا بالاتر)
        return tier >= WorkflowTiers.TIER_3_ACCOUNTANT

    elif stage_lower in ['accountant_approved', 'pending_manager', 'manager_approved', 'submitted_accountant']:
        # نیاز به مدیر شرکت (سطح ۴ یا بالاتر)
        return tier >= WorkflowTiers.TIER_4_MANAGER

    elif stage_lower in ['ready_to_pay']:
        # نیاز به خزانه‌دار (سطح ۵ یا بالاتر)
        return tier >= WorkflowTiers.TIER_5_TREASURY

    return False




def _record_audit_log(instance, user, from_status, to_status, action, reason=None, metadata=None):
    """ثبت پایدار و تراکنشی لاگ ممیزی گردش کار سازمانی"""
    try:
        from .models import WorkflowAuditLog
        content_type = instance.__class__.__name__.lower()
        object_id = instance.pk
        metadata = dict(metadata or {})
        # DEF-19: نگاشت یکدست حوزهٔ پرسنل. لاگ پرونده و درخواست تغییراتش هر دو روی تایملاین همان پرونده
        # (content_type='personnel') ثبت می‌شوند؛ درخواست تغییرات با change_request_id در metadata.
        if content_type == 'personnelprofile':
            content_type = 'personnel'
            metadata.setdefault('company_id', getattr(instance, 'company_id', None))
        elif content_type == 'personnelchangerequest':
            personnel = getattr(instance, 'personnel', None)
            content_type = 'personnel'
            object_id = getattr(instance, 'personnel_id', None)
            metadata.setdefault('change_request_id', instance.pk)
            metadata.setdefault('company_id', getattr(personnel, 'company_id', None))
            action = f'change_request_{action}'
        actor_user = user if getattr(user, 'is_authenticated', False) else None
        WorkflowAuditLog.objects.create(
            content_type=content_type,
            object_id=object_id,
            actor=actor_user,
            from_status=from_status or '',
            to_status=to_status or '',
            action=action,
            reason=reason or '',
            metadata=metadata
        )
    except Exception as e:
        logger.warning(f"[WorkflowEngine] Failed to write WorkflowAuditLog for {instance}: {e}")


@transaction.atomic
def process_creation_with_auto_pass(instance, creator_user, is_financial: bool = False):
    """
    اصل عبور هوشمند از بالا به پایین (Dynamic Auto-Pass Principle) در زمان ایجاد رکورد.
    اگر نقشی با سطح بالاتر رکوردی را ثبت کند، مراحل پیشین به صورت خودکار تایید شده
    و پرونده بدون کاغذبازی به مرحله متناظر همان کاربر یا مرحله بعد هدایت می‌شود.
    """
    now = timezone.now()
    user_tier = determine_user_tier(creator_user, section=workflow_section(instance))

    # ثبت کاربر ایجادکننده
    if hasattr(instance, 'created_by') and not instance.created_by:
        instance.created_by = creator_user

    # ۱. کاربر عادی / کارمند انبار (سطح ۱)
    if user_tier <= WorkflowTiers.TIER_1_OPERATOR:
        if hasattr(instance, 'approval_status'):
            instance.approval_status = WorkflowStatuses.PENDING_SUPERVISOR
        elif hasattr(instance, 'status'):
            instance.status = WorkflowStatuses.PERIOD_OPEN if hasattr(instance, 'year_month') else WorkflowStatuses.PENDING_SUPERVISOR
        return instance

    # ۲. سرپرست انبار (سطح ۲)
    if user_tier == WorkflowTiers.TIER_2_SUPERVISOR:
        if hasattr(instance, 'supervisor_approved_by'):
            instance.supervisor_approved_by = creator_user
            instance.supervisor_approved_at = now
        if hasattr(instance, 'supervisor_reviewed_by'):
            instance.supervisor_reviewed_by = creator_user
            instance.supervisor_reviewed_at = now
        
        instance.is_auto_passed = True
        instance.auto_passed_by = creator_user
        instance.auto_passed_at = now

        if hasattr(instance, 'approval_status'):
            instance.approval_status = WorkflowStatuses.PENDING_ACCOUNTANT
        elif hasattr(instance, 'status'):
            instance.status = WorkflowStatuses.PERIOD_SUBMITTED_SUPERVISOR if hasattr(instance, 'year_month') else WorkflowStatuses.PENDING_ACCOUNTANT
        return instance

    # ۳. حسابدار (سطح ۳)
    if user_tier == WorkflowTiers.TIER_3_ACCOUNTANT:
        if hasattr(instance, 'supervisor_approved_by'):
            instance.supervisor_approved_by = creator_user
            instance.supervisor_approved_at = now
        if hasattr(instance, 'accountant_approved_by'):
            instance.accountant_approved_by = creator_user
            instance.accountant_approved_at = now
        if hasattr(instance, 'supervisor_reviewed_by'):
            instance.supervisor_reviewed_by = creator_user
            instance.supervisor_reviewed_at = now
        if hasattr(instance, 'accountant_reviewed_by'):
            instance.accountant_reviewed_by = creator_user
            instance.accountant_reviewed_at = now

        instance.is_auto_passed = True
        instance.auto_passed_by = creator_user
        instance.auto_passed_at = now

        if hasattr(instance, 'approval_status'):
            instance.approval_status = WorkflowStatuses.PENDING_MANAGER
        elif hasattr(instance, 'status'):
            instance.status = WorkflowStatuses.PERIOD_SUBMITTED_ACCOUNTANT if hasattr(instance, 'year_month') else WorkflowStatuses.PENDING_MANAGER
        return instance

    # ۴. مدیر شرکت (سطح ۴) یا سوپریوزر (سطح ۶)
    if user_tier >= WorkflowTiers.TIER_4_MANAGER:
        if hasattr(instance, 'supervisor_approved_by'):
            instance.supervisor_approved_by = creator_user
            instance.supervisor_approved_at = now
        if hasattr(instance, 'accountant_approved_by'):
            instance.accountant_approved_by = creator_user
            instance.accountant_approved_at = now
        if hasattr(instance, 'manager_approved_by'):
            instance.manager_approved_by = creator_user
            instance.manager_approved_at = now
        if hasattr(instance, 'supervisor_reviewed_by'):
            instance.supervisor_reviewed_by = creator_user
            instance.supervisor_reviewed_at = now
        if hasattr(instance, 'accountant_reviewed_by'):
            instance.accountant_reviewed_by = creator_user
            instance.accountant_reviewed_at = now
        if hasattr(instance, 'manager_reviewed_by'):
            instance.manager_reviewed_by = creator_user
            instance.manager_reviewed_at = now

        instance.is_auto_passed = True
        instance.auto_passed_by = creator_user
        instance.auto_passed_at = now

        # تفکیک مسیر هویتی/قراردادی از اسناد مالی
        if is_financial:
            if hasattr(instance, 'approval_status'):
                instance.approval_status = WorkflowStatuses.READY_TO_PAY
            elif hasattr(instance, 'status'):
                instance.status = WorkflowStatuses.PERIOD_READY_TO_PAY if hasattr(instance, 'year_month') else WorkflowStatuses.READY_TO_PAY
        else:
            if hasattr(instance, 'approval_status'):
                instance.approval_status = WorkflowStatuses.APPROVED
            elif hasattr(instance, 'status'):
                instance.status = WorkflowStatuses.APPROVED

        return instance

    return instance


def _reject_vehicle_entity(instance):
    """
    د۲ و د۳ طرح ۴.۶: پروندهٔ خودرو و درخواست تغییر خودرو فقط روی موتور ۲.۳ (workflows.VEHICLE_*) گردش می‌کنند؛
    موتور قدیمی (کارتابل عمومی) آن‌ها را جابه‌جا نمی‌کند تا گیت حسابدار و مجوز بخشی دور زده نشود.
    """
    from rest_framework.exceptions import ValidationError
    from .models import VehicleChangeRequest, VehicleDriverProfile
    if isinstance(instance, (VehicleDriverProfile, VehicleChangeRequest)):
        raise ValidationError(
            "اقدام روی پروندهٔ خودرو و درخواست تغییر آن از کارتابل عمومی پشتیبانی نمی‌شود؛ از «کارهای من» یا "
            "اکشن‌های /api/personnel/vehicles/ و /api/personnel/vehicle-change-requests/ استفاده کنید."
        )


@transaction.atomic
def advance_workflow_step(instance, user, target_status: str = None, notes: str = None, is_financial: bool = False):
    """
    پیش‌روی امن، اتمیک و مرحله‌به‌مرحله ماشین حالت ۵ سطحی با استفاده از select_for_update()
    """
    _reject_vehicle_entity(instance)
    # قفل ردیف دیتابیس جهت جلوگیری از همزمانی (Race Condition)
    model_cls = instance.__class__
    locked_instance = model_cls.objects.select_for_update().get(pk=instance.pk)

    now = timezone.now()
    current_status = getattr(locked_instance, 'approval_status', getattr(locked_instance, 'status', None))
    
    if not current_status:
        raise ValidationError("وضعیت جاری موجودیت معتبر نیست.")

    # بررسی دسترسی کاربر
    if not can_user_approve_stage(user, current_status, is_financial, section=workflow_section(locked_instance)):
        raise PermissionDenied("شما دسترسی لازم برای تایید این مرحله از گردش کار را ندارید.")

    user_tier = determine_user_tier(user, section=workflow_section(instance))
    curr_lower = current_status.lower()

    # انتقال از سطح ۱ (پیش‌نویس) ⬅️ سطح ۲ (سرپرست انبار)
    if curr_lower in ['draft', 'pending_supervisor', 'open', 'revision_required']:
        if hasattr(locked_instance, 'supervisor_approved_by'):
            locked_instance.supervisor_approved_by = user
            locked_instance.supervisor_approved_at = now
        if hasattr(locked_instance, 'supervisor_reviewed_by'):
            locked_instance.supervisor_reviewed_by = user
            locked_instance.supervisor_reviewed_at = now

        next_status = target_status or WorkflowStatuses.PENDING_ACCOUNTANT
        if hasattr(locked_instance, 'approval_status'):
            locked_instance.approval_status = next_status
        elif hasattr(locked_instance, 'status'):
            locked_instance.status = WorkflowStatuses.PERIOD_SUBMITTED_SUPERVISOR if hasattr(locked_instance, 'year_month') else next_status

    # انتقال از سطح ۲ ⬅️ سطح ۳ (حسابدار)
    elif curr_lower in ['supervisor_approved', 'pending_accountant', 'submitted_supervisor']:
        if hasattr(locked_instance, 'accountant_approved_by'):
            locked_instance.accountant_approved_by = user
            locked_instance.accountant_approved_at = now
        if hasattr(locked_instance, 'accountant_reviewed_by'):
            locked_instance.accountant_reviewed_by = user
            locked_instance.accountant_reviewed_at = now

        next_status = target_status or WorkflowStatuses.PENDING_MANAGER
        if hasattr(locked_instance, 'approval_status'):
            locked_instance.approval_status = next_status
        elif hasattr(locked_instance, 'status'):
            locked_instance.status = WorkflowStatuses.PERIOD_SUBMITTED_ACCOUNTANT if hasattr(locked_instance, 'year_month') else next_status

        if is_financial or hasattr(locked_instance, 'to_journal_lines'):
            try:
                from .models import emit_accounting_event
                emit_accounting_event(
                    source_instance=locked_instance,
                    event_type='INVOICE_BOOKED',
                    occurred_at=now,
                    payload={'approved_by': user.pk, 'stage': 'accountant_approved', 'notes': notes}
                )
            except Exception as e:
                logger.warning(f"[WorkflowEngine] Failed to emit INVOICE_BOOKED event for {locked_instance}: {e}")

    # انتقال از سطح ۳ ⬅️ سطح ۴ (مدیر شرکت)
    elif curr_lower in ['accountant_approved', 'pending_manager', 'manager_approved', 'submitted_accountant']:
        if hasattr(locked_instance, 'manager_approved_by'):
            locked_instance.manager_approved_by = user
            locked_instance.manager_approved_at = now
        if hasattr(locked_instance, 'manager_reviewed_by'):
            locked_instance.manager_reviewed_by = user
            locked_instance.manager_reviewed_at = now

        if is_financial:
            next_status = target_status or WorkflowStatuses.READY_TO_PAY
            if hasattr(locked_instance, 'approval_status'):
                locked_instance.approval_status = next_status
            elif hasattr(locked_instance, 'status'):
                locked_instance.status = WorkflowStatuses.PERIOD_READY_TO_PAY if hasattr(locked_instance, 'year_month') else next_status
        else:
            next_status = target_status or WorkflowStatuses.APPROVED
            if hasattr(locked_instance, 'approval_status'):
                locked_instance.approval_status = next_status
            elif hasattr(locked_instance, 'status'):
                locked_instance.status = next_status

            # اگر درخواست تغییرات است، اعمال مقادیر جدید به پرونده اصلی به صورت اتمیک
            if hasattr(locked_instance, 'proposed_changes') and hasattr(locked_instance, 'personnel'):
                _apply_personnel_changes(locked_instance)

    # انتقال از سطح ۴ ⬅️ سطح ۵ (خزانه‌دار / تسویه نهایی)
    elif curr_lower in ['ready_to_pay']:
        if hasattr(locked_instance, 'treasury_paid_by'):
            locked_instance.treasury_paid_by = user
            locked_instance.treasury_paid_at = now

        next_status = target_status or WorkflowStatuses.PAID
        if hasattr(locked_instance, 'approval_status'):
            locked_instance.approval_status = next_status
        elif hasattr(locked_instance, 'status'):
            locked_instance.status = WorkflowStatuses.PERIOD_PAID if hasattr(locked_instance, 'year_month') else next_status

    # پاکسازی دلیل بازنگری در صورت تایید موفق
    if hasattr(locked_instance, 'rejection_reason'):
        locked_instance.rejection_reason = None

    locked_instance.save()
    _record_audit_log(locked_instance, user, current_status, getattr(locked_instance, 'approval_status', getattr(locked_instance, 'status', '')), 'approve', reason=notes)
    notify_document_changed(locked_instance)
    logger.info(f"[WorkflowEngine] Instance {model_cls.__name__}#{locked_instance.pk} advanced to {getattr(locked_instance, 'approval_status', getattr(locked_instance, 'status', ''))} by user {user.username}")
    return locked_instance


@transaction.atomic
def request_workflow_revision(instance, user, reason: str, target_status: str = None):
    """
    بازگرداندن هوشمند پرونده جهت بازنگری و اصلاح (Revision Required) بدون ابطال کامل داده‌ها
    """
    _reject_vehicle_entity(instance)
    if not reason or not reason.strip():
        raise ValidationError("درج توضیحات و علت درخواست بازنگری الزامی است.")

    model_cls = instance.__class__
    locked_instance = model_cls.objects.select_for_update().get(pk=instance.pk)

    user_tier = determine_user_tier(user, section=workflow_section(instance))
    if user_tier < WorkflowTiers.TIER_2_SUPERVISOR and not user.is_superuser:
        raise PermissionDenied("شما دسترسی لازم برای ارجاع بازنگری پرونده را ندارید.")

    now = timezone.now()
    current_status = getattr(locked_instance, 'approval_status', getattr(locked_instance, 'status', ''))
    next_status = target_status or WorkflowStatuses.REVISION_REQUIRED

    if hasattr(locked_instance, 'approval_status'):
        locked_instance.approval_status = next_status
    elif hasattr(locked_instance, 'status'):
        locked_instance.status = WorkflowStatuses.PERIOD_REVISION_REQUIRED if hasattr(locked_instance, 'year_month') else next_status

    if hasattr(locked_instance, 'rejection_reason'):
        locked_instance.rejection_reason = reason.strip()
    if hasattr(locked_instance, 'revision_requested_by'):
        locked_instance.revision_requested_by = user
        locked_instance.revision_requested_at = now

    locked_instance.save()
    if hasattr(locked_instance, 'personnel') and locked_instance.personnel:
        locked_instance.personnel.has_pending_changes = False
        locked_instance.personnel.save(update_fields=['has_pending_changes'])
    _record_audit_log(locked_instance, user, current_status, next_status, 'revision', reason=reason)
    notify_document_changed(locked_instance)
    logger.info(f"[WorkflowEngine] Instance {model_cls.__name__}#{locked_instance.pk} marked REVISION_REQUIRED by {user.username}. Reason: {reason}")
    return locked_instance


@transaction.atomic
def reject_workflow(instance, user, reason: str):
    """
    رد قطعی و ابطال پرونده در هر یک از مراحل
    """
    _reject_vehicle_entity(instance)
    if not reason or not reason.strip():
        raise ValidationError("درج دلیل رد قطعی الزامی است.")

    model_cls = instance.__class__
    locked_instance = model_cls.objects.select_for_update().get(pk=instance.pk)

    user_tier = determine_user_tier(user, section=workflow_section(instance))
    if user_tier < WorkflowTiers.TIER_2_SUPERVISOR and not user.is_superuser:
        raise PermissionDenied("شما دسترسی لازم برای رد این پرونده را ندارید.")

    current_status = getattr(locked_instance, 'approval_status', getattr(locked_instance, 'status', ''))

    if hasattr(locked_instance, 'approval_status'):
        locked_instance.approval_status = WorkflowStatuses.REJECTED
    elif hasattr(locked_instance, 'status'):
        locked_instance.status = WorkflowStatuses.PERIOD_REJECTED if hasattr(locked_instance, 'year_month') else WorkflowStatuses.REJECTED

    if hasattr(locked_instance, 'rejection_reason'):
        locked_instance.rejection_reason = reason.strip()

    locked_instance.save()
    if hasattr(locked_instance, 'personnel') and locked_instance.personnel:
        locked_instance.personnel.has_pending_changes = False
        locked_instance.personnel.save(update_fields=['has_pending_changes'])
    target_st = getattr(locked_instance, 'approval_status', getattr(locked_instance, 'status', 'rejected'))
    _record_audit_log(locked_instance, user, current_status, target_st, 'reject', reason=reason)
    notify_document_changed(locked_instance)
    logger.info(f"[WorkflowEngine] Instance {model_cls.__name__}#{locked_instance.pk} REJECTED by {user.username}. Reason: {reason}")
    return locked_instance


@transaction.atomic
def execute_treasury_disbursement(instance, user, tracking_code: str, batch_id: str = None, payment_method: str = 'PAYA', notes: str = None):
    """
    ثبت پرداخت واریز بانکی و تسویه نهایی خزانه‌داری با ثبت کد رهگیری
    """
    model_cls = instance.__class__
    locked_instance = model_cls.objects.select_for_update().get(pk=instance.pk)

    user_tier = determine_user_tier(user, section=workflow_section(instance))
    if user_tier < WorkflowTiers.TIER_5_TREASURY and not user.is_superuser:
        raise PermissionDenied("فقط خزانه‌دار یا مدیر ارشد مجاز به ثبت تیک واریز و تسویه نهایی هستند.")

    now = timezone.now()

    if hasattr(locked_instance, 'approval_status'):
        locked_instance.approval_status = WorkflowStatuses.PAID
    elif hasattr(locked_instance, 'status'):
        locked_instance.status = WorkflowStatuses.PERIOD_PAID if hasattr(locked_instance, 'year_month') else WorkflowStatuses.PAID

    if hasattr(locked_instance, 'payment_status'):
        locked_instance.payment_status = WorkflowStatuses.PAYROLL_PAID

    if hasattr(locked_instance, 'treasury_paid_by'):
        locked_instance.treasury_paid_by = user
        locked_instance.treasury_paid_at = now
    if hasattr(locked_instance, 'paid_by'):
        locked_instance.paid_by = user
        locked_instance.paid_at = now

    if hasattr(locked_instance, 'payment_tracking_code'):
        locked_instance.payment_tracking_code = tracking_code
    if hasattr(locked_instance, 'payment_batch_id') and batch_id:
        locked_instance.payment_batch_id = batch_id
    if hasattr(locked_instance, 'payment_method'):
        locked_instance.payment_method = payment_method

    if hasattr(locked_instance, 'is_settled'):
        locked_instance.is_settled = True
        locked_instance.settled_at = now
        locked_instance.settled_by = user
    if hasattr(locked_instance, 'payment_ref'):
        locked_instance.payment_ref = tracking_code

    locked_instance.save()
    try:
        from .models import emit_accounting_event
        emit_accounting_event(
            source_instance=locked_instance,
            event_type='WORKFLOW_SETTLED_PAID',
            occurred_at=now,
            payload={'tracking_code': tracking_code, 'batch_id': batch_id, 'payment_method': payment_method, 'user_id': user.pk}
        )
    except Exception as e:
        logger.warning(f"[WorkflowEngine] Failed to emit accounting event for {locked_instance}: {e}")
    _record_audit_log(locked_instance, user, 'ready_to_pay', 'paid', 'disburse', reason=notes, metadata={'tracking_code': tracking_code, 'batch_id': batch_id})
    notify_document_changed(locked_instance)
    logger.info(f"[WorkflowEngine] Instance {model_cls.__name__}#{locked_instance.pk} PAID & SETTLED by {user.username}. Tracking: {tracking_code}")
    return locked_instance


@transaction.atomic
def record_isolated_sheba_failure(payroll_record, user, failure_reason: str):
    """
    اعلام خطای شماره شبا / مسدودی حساب برای یک فرد خاص بدون توقف تسویه سایرین
    """
    user_tier = determine_user_tier(user)
    if user_tier < WorkflowTiers.TIER_5_TREASURY and not user.is_superuser:
        raise PermissionDenied("فقط متصدی خزانه‌داری مجاز به اعلام خطای شبا می‌باشد.")

    payroll_record.payment_status = WorkflowStatuses.PAYROLL_FAILED_SHEBA
    payroll_record.payment_failure_reason = failure_reason
    payroll_record.save()
    logger.warning(f"[WorkflowEngine] Payroll #{payroll_record.pk} marked FAILED_SHEBA: {failure_reason}")
    return payroll_record


def _apply_personnel_changes(change_request):
    """
    اعمال اتمیک فیلدهای ویرایش‌شده در درخواست تغییرات به پرونده پرسنل با اعتبارسنجی سریالایزر.
    DEF-06: منبع واحد lifecycle_services.apply_personnel_change_request است. اگر داده نامعتبر باشد
    هیچ setattr خامی انجام نمی‌شود؛ خطای 400 برمی‌گردد و تراکنش (و وضعیت درخواست) برمی‌گردد.
    """
    from rest_framework.exceptions import ValidationError as DRFValidationError
    from .lifecycle_services import PersonnelWorkflowError, apply_personnel_change_request, refresh_has_pending_changes

    try:
        personnel = apply_personnel_change_request(change_request)
    except PersonnelWorkflowError as e:
        raise DRFValidationError(e.to_response_data())
    refresh_has_pending_changes(personnel, exclude_cr_id=change_request.pk)
    logger.info(f"[WorkflowEngine] Applied ChangeRequest #{change_request.pk} to Personnel #{personnel.pk}")


