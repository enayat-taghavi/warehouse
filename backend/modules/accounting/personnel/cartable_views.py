# -*- coding: utf-8 -*-
"""
Enterprise 5-Tier Cartable Views Module (Phase 3).
Provides role-specific aggregated cartable endpoints for:
1. Supervisor Cartable (/api/personnel/cartable/supervisor/)
2. Accountant / Finance Cartable (/api/personnel/cartable/accountant/)
3. General Manager Cartable (/api/personnel/cartable/manager/)
4. Treasury & Banking Cartable (/api/personnel/cartable/treasury/)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.http import HttpResponse
from django.db.models import Q
from django.utils import timezone

from personnel.permissions import (
    CanApprovePersonnelSupervisor,
    CanApproveFleetSupervisor,
    CanApprovePersonnelFinance,
    CanApproveFleetFinance,
    CanAuthorizePaymentManager,
    CanDisburseTreasury,
    CanViewTreasury
)

from .models import (
    PersonnelProfile,
    VehicleDriverProfile,
    PersonnelChangeRequest,
    VehicleChangeRequest,
    MonthlyWorkPeriod,
    MonthlyPayrollRecord,
    VehicleTripLog,
    ExpenseInvoice,
    PettyCashTransaction,
    DailyAttendance,
    AttendanceAuditLog,
    ProjectSection,
    Project,
)
from .serializers import (
    PersonnelProfileSerializer,
    VehicleDriverProfileSerializer,
    PersonnelChangeRequestSerializer,
    VehicleChangeRequestSerializer,
    MonthlyWorkPeriodSerializer,
    MonthlyPayrollRecordSerializer,
    ExpenseInvoiceSerializer,
    PettyCashTransactionSerializer
)
from .workflow_engine import (
    WorkflowStatuses,
    WorkflowTiers,
    determine_user_tier,
    advance_workflow_step,
    request_workflow_revision,
    reject_workflow,
    execute_treasury_disbursement
)
from .treasury_engine import (
    TreasuryDisbursementService,
    generate_paya_diskette_csv,
    generate_satna_diskette_csv
)
from .views import (
    get_user_allowed_companies,
    get_request_company_id,
    validate_user_company_access
)
from accounts.scoped_permissions import can, section_q
from .workflow_engine import sections_with_tier
from .views_domains.scope_helpers import scope_personnel_for_user
from .views_domains.treasury_views import (
    INVOICE_PERM,
    PETTY_CASH_MANAGE_PERM,
    _ensure_petty_cash_manager,
)



def _invoice_engine_action(user, invoice, action_type, reason):
    """
    اقدام کارتابل روی فاکتور از راه موتور گردش کار (ت۱۷ طرح ۲.۳): تأیید = act، بازنگری = عودت، ابطال = رد قطعی.
    اجازه را موتور می‌سنجد (دریافت‌کنندهٔ کار باز، بی‌تأیید خود)؛ اقدام دوم 409 task_already_done می‌گیرد.
    """
    from workflow import engine as wf_engine
    from workflow.errors import WorkflowError
    from .workflows import INVOICE_WORKFLOW
    if action_type not in ('approve', 'revision', 'reject'):
        raise ValidationError(f"اقدام «{action_type}» نامعتبر است.")
    if action_type != 'approve' and not reason:
        raise ValidationError("ثبت دلیل الزامی است.")
    task = wf_engine.open_task(INVOICE_WORKFLOW, invoice.pk)
    if task is None:
        return Response({'code': 'task_already_done', 'error': 'این کار را نفر دیگری انجام داده است'},
                        status=status.HTTP_409_CONFLICT)
    try:
        if action_type == 'approve':
            wf_engine.act(user, task, obj=invoice)
        elif action_type == 'revision':
            wf_engine.return_for_fix(user, task, reason, obj=invoice)
        else:
            wf_engine.reject(user, task, reason, obj=invoice)
    except WorkflowError as exc:
        return Response({'code': exc.code, 'error': exc.message_fa, 'detail': exc.message_fa}, status=exc.status)
    if action_type != 'approve':
        invoice.rejection_reason = reason
        invoice.save(update_fields=['rejection_reason', 'updated_at'])
    return Response({'message': 'اقدام روی فاکتور ثبت شد.', 'status': invoice.status})


def _invoice_task_rows(user, step_key):
    """
    فاکتورهای کارتابل از کارهای باز همین کاربر در موتور گردش کار (ت۱۷ طرح ۲.۳)، نه از وضعیت و سطح نقش:
    کار برداشته‌شده از کارتابل بقیه هم می‌رود، و جانشین در بازه‌اش فاکتورهای کار صاحب کار را می‌بیند.
    """
    from workflow.queries import tasks_for_user
    from .workflows import INVOICE_WORKFLOW
    ids = tasks_for_user(user).filter(instance__workflow_key=INVOICE_WORKFLOW, step_key=step_key).values(
        'instance__entity_id')
    return (ExpenseInvoice.objects.filter(pk__in=ids).select_related('section', 'counterparty__party')
            .prefetch_related('lines__expense_head__parent', 'payments__company_bank_account',
                              'payments__party_bank_account__party', 'payments__created_by', 'payments__voided_by'))

def _get_effective_company_ids(request, user):
    """
    استخراج شناسه‌های شرکت مجاز و فعال برای درخواست کارتابل
    اگر کاربر سوپریوزر باشد و هدر شرکت ارسال نشده باشد، None بازمی‌گرداند (دسترسی به همه شرکت‌ها).
    در غیر این صورت، دسترسی اعتبارسنجی شده و لیست شناسه‌های مجاز بازگردانده می‌شود.
    """
    cid = get_request_company_id(request)
    if cid:
        valid_cid = validate_user_company_access(user, cid)
        return [valid_cid] if valid_cid else []

    if user.is_superuser:
        return None

    allowed_qs = get_user_allowed_companies(user)
    return list(allowed_qs.values_list('id', flat=True))


def _filter_by_company(queryset, model_name: str, company_ids):
    """
    فیلتر کردن کوئری‌ست مدل‌های کارتابل بر مبنای لیست شناسه‌های شرکت مجاز
    اگر company_ids مقدار None باشد، کوئری‌ست بدون فیلتر باقی می‌ماند (سوپریوزر بدون انتخاب شرکت).
    اگر company_ids خالی باشد ([])، یک کوئری‌ست خالی (.none()) بازگردانده می‌شود.
    """
    if company_ids is None:
        return queryset
    if not company_ids:
        return queryset.none()

    m = model_name.lower()
    if m in ['personnel', 'personnel_profile']:
        return queryset.filter(
            Q(company_id__in=company_ids) |
            Q(section__project__company_id__in=company_ids)
        )
    elif m in ['vehicle', 'vehicle_driver']:
        return queryset.filter(
            Q(company_id__in=company_ids) |
            Q(section__project__company_id__in=company_ids)
        )
    elif m in ['personnel_change', 'personnel_change_request']:
        return queryset.filter(
            Q(personnel__company_id__in=company_ids) |
            Q(personnel__section__project__company_id__in=company_ids)
        )
    elif m in ['vehicle_change', 'vehicle_change_request']:
        return queryset.filter(
            Q(vehicle__company_id__in=company_ids) |
            Q(vehicle__section__project__company_id__in=company_ids)
        )
    elif m in ['period', 'work_period']:
        return queryset.filter(company_id__in=company_ids)
    elif m in ['invoice', 'expense_invoice']:
        return queryset.filter(section__project__company_id__in=company_ids)
    elif m in ['petty_cash', 'petty_cash_transaction']:
        return queryset.filter(section__project__company_id__in=company_ids)
    elif m in ['payroll', 'payroll_record']:
        return queryset.filter(
            Q(period__company_id__in=company_ids) |
            Q(personnel__company_id__in=company_ids)
        )
    elif m in ['trip', 'trip_log']:
        return queryset.filter(
            Q(vehicle__company_id__in=company_ids) |
            Q(project__company_id__in=company_ids) |
            Q(section__project__company_id__in=company_ids)
        )
    elif m in ['attendance', 'daily_attendance']:
        return queryset.filter(
            Q(personnel__company_id__in=company_ids) |
            Q(personnel__section__project__company_id__in=company_ids) |
            Q(section__project__company_id__in=company_ids)
        )
    return queryset


def _get_instance_company_id(instance, model_name: str):
    """
    استخراج شناسه شرکت متناظر با یک نمونه رکورد جهت اعتبارسنجی مالکیت و جلوگیری از BOLA
    """
    m = model_name.lower()
    if m in ['personnel', 'personnel_profile', 'vehicle', 'vehicle_driver']:
        if getattr(instance, 'company_id', None):
            return instance.company_id
        if getattr(instance, 'section', None) and instance.section.project:
            return instance.section.project.company_id
        return None

    if m in ['personnel_change', 'personnel_change_request']:
        target = getattr(instance, 'personnel', None)
        if target:
            if target.company_id:
                return target.company_id
            if target.section and target.section.project:
                return target.section.project.company_id
        return None

    if m in ['vehicle_change', 'vehicle_change_request']:
        target = getattr(instance, 'vehicle', None)
        if target:
            if target.company_id:
                return target.company_id
            if target.section and target.section.project:
                return target.section.project.company_id
        return None

    if m in ['period', 'work_period']:
        return getattr(instance, 'company_id', None)

    if m in ['invoice', 'expense_invoice', 'petty_cash', 'petty_cash_transaction']:
        if getattr(instance, 'section', None) and instance.section.project:
            return instance.section.project.company_id
        return None

    if m in ['payroll', 'payroll_record']:
        if getattr(instance, 'period', None) and instance.period.company_id:
            return instance.period.company_id
        if getattr(instance, 'personnel', None) and instance.personnel.company_id:
            return instance.personnel.company_id
        return None

    if m in ['trip', 'trip_log']:
        if getattr(instance, 'vehicle', None) and instance.vehicle.company_id:
            return instance.vehicle.company_id
        if getattr(instance, 'project', None) and instance.project.company_id:
            return instance.project.company_id
        if getattr(instance, 'section', None) and instance.section.project:
            return instance.section.project.company_id
        return None

    if m in ['attendance', 'daily_attendance']:
        if getattr(instance, 'personnel', None) and instance.personnel.company_id:
            return instance.personnel.company_id
        if getattr(instance, 'section', None) and instance.section.project:
            return instance.section.project.company_id
        if getattr(instance, 'personnel', None) and instance.personnel.section and instance.personnel.section.project:
            return instance.personnel.section.project.company_id
        return None

    return None


def _validate_instance_company_access(instance, model_name: str, user):
    """
    اعتبارسنجی دسترسی کاربر جاری به شرکت رکورد هدف (دفاع در برابر BOLA / IDOR)
    """
    if user.is_superuser:
        return
    inst_company_id = _get_instance_company_id(instance, model_name)
    if inst_company_id:
        validate_user_company_access(user, inst_company_id)
    else:
        allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
        if not allowed_ids:
            raise PermissionDenied("شما به اطلاعات و کارتابل این شرکت دسترسی ندارید.")


def _reject_personnel_profile_action(instance):
    """
    تسک ۳.۳: گردش کار پروندهٔ پرسنل فقط از اکشن‌های PersonnelProfileViewSet انجام می‌شود تا گیت تکمیل،
    جدول گذار، Purge با عکس کامل، لاگ و اعلان دور زده نشوند (موتور عمومی این قواعد را ندارد).
    پس از بررسی دسترسی شرکت صدا زده می‌شود تا پروندهٔ شرکت دیگر همچنان ۴۰۳ بگیرد.
    """
    if isinstance(instance, PersonnelProfile):
        raise ValidationError(
            "اقدام روی پروندهٔ پرسنل از کارتابل عمومی پشتیبانی نمی‌شود؛ از اکشن‌های /api/personnel/profiles/{id}/ "
            "(approve-supervisor، approve-finance، approve-manager، request-revision، reject) استفاده کنید."
        )


def _scope_section_rows(qs, user, perm_code, min_tier):
    """
    قلمرو بخشی کارتابل برای فاکتور و تنخواه (اصلاح ۲.۲): فقط ردیف‌های بخش‌هایی که کاربر هم مجوز کار
    (perm_code) و هم سطح لازم همان کارتابل را «در همان بخش» دارد (سطح گردش این دو مدل بخشی است؛
    workflow_section). مدیر کل سامانه بی‌محدودیت.
    """
    if user.is_superuser:
        return qs
    return qs.filter(section_q(user, perm_code)).filter(
        section_id__in=sections_with_tier(user, min_tier).values('id')
    )


def _scope_personnel_rows(qs, user, min_tier):
    """
    همان قلمرو پروندهٔ پرسنل scope_personnel_queryset (بخش‌های مجوز پرونده + ثبت خود + بی‌بخشِ سطح شرکت)،
    و برای پروندهٔ بخش‌دار فقط بخش‌هایی که کاربر سطح لازم کارتابل را در همان بخش دارد.
    """
    qs = scope_personnel_for_user(user, qs)
    if user.is_superuser:
        return qs
    return qs.filter(Q(section__isnull=True) | Q(section_id__in=sections_with_tier(user, min_tier).values('id')))


def _ensure_cartable_section_permission(instance, user):
    """
    سد بخشی اقدام کارتابل (اصلاح ۲.۲): تنخواه ← مدیریت تنخواه همان بخش، فاکتور ← ثبت و دیدن فاکتور
    همان بخش، پروندهٔ پرسنل ← قلمرو پرونده. سطح در همان بخش را موتور گردش کار می‌سنجد.
    """
    if isinstance(instance, PettyCashTransaction) and \
            instance.status not in ('pending_supervisor', 'pending_accountant'):
        raise PermissionDenied("این سند تنخواه از راه گردش کار تازه (کارهای من) پیش می‌رود.")
    if user.is_superuser:
        return
    if isinstance(instance, PettyCashTransaction):
        # ص۱۰ طرح ۳.۶: کارتابل قدیمی فقط سند قدیمی در انتظار سرپرست یا حسابدار را می‌بندد
        if instance.status not in ('pending_supervisor', 'pending_accountant'):
            raise PermissionDenied("این سند تنخواه از راه گردش کار تازه (کارهای من) پیش می‌رود.")
        if instance.section_id is None:
            raise PermissionDenied("شما مجوز مدیریت تنخواه این بخش را ندارید.")
        _ensure_petty_cash_manager(user, instance.section_id)
    elif isinstance(instance, ExpenseInvoice):
        if instance.section_id is None or not can(user, INVOICE_PERM, instance.section_id):
            raise PermissionDenied("شما مجوز ثبت و دیدن فاکتور این بخش را ندارید.")
    elif isinstance(instance, PersonnelProfile):
        if not scope_personnel_for_user(user, PersonnelProfile.objects.filter(pk=instance.pk)).exists():
            raise PermissionDenied("شما به پروندهٔ پرسنلی این بخش دسترسی ندارید.")


def _get_target_instance(model_name: str, instance_id: int, request_data: dict = None):
    """یافتن نمونه مدل بر اساس نام و شناسه (با پشتیبانی هوشمند از بازیابی/ایجاد خودکار دوره ماهانه بر مبنای year_month)"""
    models_map = {
        'personnel': PersonnelProfile,
        'personnel_profile': PersonnelProfile,
        'vehicle': VehicleDriverProfile,
        'vehicle_driver': VehicleDriverProfile,
        'personnel_change': PersonnelChangeRequest,
        'personnel_change_request': PersonnelChangeRequest,
        'vehicle_change': VehicleChangeRequest,
        'vehicle_change_request': VehicleChangeRequest,
        'period': MonthlyWorkPeriod,
        'work_period': MonthlyWorkPeriod,
        'payroll': MonthlyPayrollRecord,
        'payroll_record': MonthlyPayrollRecord,
        'trip': VehicleTripLog,
        'invoice': ExpenseInvoice,
        'expense_invoice': ExpenseInvoice,
        'petty_cash': PettyCashTransaction,
        'petty_cash_transaction': PettyCashTransaction,
        'attendance': DailyAttendance,
        'daily_attendance': DailyAttendance,
    }
    model_cls = models_map.get(model_name.lower())
    if not model_cls:
        raise ValidationError(f"مدل «{model_name}» نامعتبر است.")

    if model_name.lower() in ['period', 'work_period']:
        if instance_id and int(instance_id) > 0:
            try:
                return MonthlyWorkPeriod.objects.get(pk=instance_id)
            except MonthlyWorkPeriod.DoesNotExist:
                pass
        # در صورت نبود شناسه اما ارسال year_month، دوره به صورت خودکار ایجاد/بازیابی می‌شود
        if request_data and request_data.get('year_month'):
            ym = request_data.get('year_month')
            wh_id = request_data.get('warehouse_id')
            sec_id = request_data.get('section_id') or request_data.get('section')
            proj_id = request_data.get('project_id') or request_data.get('project')
            cid = request_data.get('company_id') or request_data.get('company')
            defaults = {'status': 'OPEN'}
            if cid:
                try:
                    defaults['company_id'] = int(cid)
                except (ValueError, TypeError):
                    pass
            if sec_id:
                try:
                    defaults['section_id'] = int(sec_id)
                except (ValueError, TypeError):
                    pass
            if proj_id:
                try:
                    defaults['project_id'] = int(proj_id)
                except (ValueError, TypeError):
                    pass

            lookup = {'year_month': ym}
            if sec_id:
                lookup['section_id'] = int(sec_id)
            elif proj_id:
                lookup['project_id'] = int(proj_id)
            elif wh_id:
                lookup['warehouse_id'] = int(wh_id)

            period, _ = MonthlyWorkPeriod.objects.get_or_create(
                **lookup,
                defaults=defaults
            )
            return period
        raise ValidationError("شناسه دوره کارکرد یا سال و ماه (year_month) الزامی است.")

    try:
        return model_cls.objects.get(pk=instance_id)
    except model_cls.DoesNotExist:
        raise ValidationError(f"رکورد موردنظر در مدل «{model_name}» یافت نشد.")


class SupervisorCartableAPIView(APIView):
    """
    کارتابل یکپارچه سرپرست انبار (سطح ۲)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        tier = determine_user_tier(user)
        if tier < WorkflowTiers.TIER_2_SUPERVISOR:
            raise PermissionDenied("دسترسی به کارتابل سرپرست مجاز نمی‌باشد.")

        company_ids = _get_effective_company_ids(request, user)

        # رکوردهای پرسنل نیازمند بررسی سرپرست: فقط ارسال‌شده‌ها؛ پیش‌نویس و عودت‌شده نزد کارمند است (تسک ۳.۳ و ۸.۲)
        personnel_qs = _filter_by_company(
            PersonnelProfile.objects.filter(
                approval_status=WorkflowStatuses.PENDING_SUPERVISOR
            ).select_related('user'),
            'personnel', company_ids
        )
        personnel_qs = _scope_personnel_rows(personnel_qs, user, WorkflowTiers.TIER_2_SUPERVISOR)

        # رکوردهای ناوگان نیازمند بررسی سرپرست
        vehicles_qs = _filter_by_company(
            VehicleDriverProfile.objects.filter(
                approval_status__in=[WorkflowStatuses.DRAFT, WorkflowStatuses.PENDING_SUPERVISOR, WorkflowStatuses.REVISION_REQUIRED]
            ).select_related('user'),
            'vehicle', company_ids
        )

        # درخواست‌های تغییرات پرسنل
        p_changes = _filter_by_company(
            PersonnelChangeRequest.objects.filter(
                status__in=[WorkflowStatuses.PENDING_SUPERVISOR, WorkflowStatuses.REVISION_REQUIRED]
            ).select_related('personnel', 'requested_by'),
            'personnel_change', company_ids
        )

        # درخواست‌های تغییرات ناوگان
        v_changes = _filter_by_company(
            VehicleChangeRequest.objects.filter(
                status__in=[WorkflowStatuses.PENDING_SUPERVISOR, WorkflowStatuses.REVISION_REQUIRED]
            ).select_related('vehicle', 'requested_by'),
            'vehicle_change', company_ids
        )

        # دوره‌های کارکرد نیازمند بررسی اولیه
        periods = _filter_by_company(
            MonthlyWorkPeriod.objects.filter(
                status__in=[WorkflowStatuses.PERIOD_OPEN, WorkflowStatuses.PERIOD_REVISION_REQUIRED]
            ),
            'period', company_ids
        )

        # فاکتورهای هزینه نیازمند بررسی سرپرست
        invoices_qs = _filter_by_company(_invoice_task_rows(user, 'supervisor_ok'), 'invoice', company_ids)

        # اسناد تنخواه‌گردان نیازمند بررسی سرپرست
        petty_cash_qs = _filter_by_company(
            PettyCashTransaction.objects.filter(
                # ص۱۰ طرح ۳.۶: فقط سند قدیمی در انتظار سرپرست؛ پیش‌نویس‌های تازه به گردش موتور (شارژ/صورت‌حساب) می‌روند
                status__in=[WorkflowStatuses.PENDING_SUPERVISOR, 'pending_supervisor']
            ).select_related('section', 'custodian'),
            'petty_cash', company_ids
        )
        petty_cash_qs = _scope_section_rows(petty_cash_qs, user, PETTY_CASH_MANAGE_PERM, WorkflowTiers.TIER_2_SUPERVISOR)

        # کارکردهای نیازمند بررسی سرپرست
        att_qs = _filter_by_company(
            DailyAttendance.objects.filter(
                approval_status__in=['PENDING_SUPERVISOR', 'REVISION_REQUIRED'],
                is_deleted=False
            ),
            'attendance', company_ids
        )

        return Response({
            'tier': 'SUPERVISOR',
            'counts': {
                'personnel': personnel_qs.count(),
                'vehicles': vehicles_qs.count(),
                'personnel_changes': p_changes.count(),
                'vehicle_changes': v_changes.count(),
                'periods': periods.count(),
                'attendances': att_qs.count(),
                'invoices': invoices_qs.count(),
                'petty_cash': petty_cash_qs.count(),
                'total_pending': (
                    personnel_qs.count() + vehicles_qs.count() + p_changes.count() +
                    v_changes.count() + periods.count() + att_qs.count() +
                    invoices_qs.count() + petty_cash_qs.count()
                )
            },
            # context درخواست لازم است تا دستمزد از نقش غیرمالی پنهان بماند (DEF-21)
            'personnel': PersonnelProfileSerializer(personnel_qs[:50], many=True, context={'request': request}).data,
            'vehicles': VehicleDriverProfileSerializer(vehicles_qs[:50], many=True).data,
            'personnel_changes': PersonnelChangeRequestSerializer(p_changes[:50], many=True).data,
            'vehicle_changes': VehicleChangeRequestSerializer(v_changes[:50], many=True).data,
            'periods': MonthlyWorkPeriodSerializer(periods, many=True).data,
            'invoices': ExpenseInvoiceSerializer(invoices_qs[:50], many=True).data,
            'petty_cash': PettyCashTransactionSerializer(petty_cash_qs[:50], many=True).data
        })

    def post(self, request):
        """ثبت اقدام (تایید، ارجاع به بازنگری یا رد) توسط سرپرست با محافظت BOLA"""
        user = request.user
        action_type = request.data.get('action') # 'approve', 'revision', 'reject'
        model_name = request.data.get('model')
        item_id = request.data.get('id')
        item_ids = request.data.get('ids', [])
        reason = request.data.get('reason', '')

        if not action_type or not model_name or (not item_id and not item_ids and not (model_name in ['period', 'work_period'] and request.data.get('year_month'))):
            raise ValidationError("پارامترهای action، model و id (یا year_month برای دوره) الزامی هستند.")

        # --- ۱. هندلینگ اختصاصی کارکرد روزانه پرسنل (DailyAttendance) ---
        if model_name.lower() in ['attendance', 'daily_attendance']:
            target_ids = item_ids if item_ids else ([item_id] if item_id else [])
            if not target_ids:
                raise ValidationError("شناسه کارکرد جهت ثبت اقدام الزامی است.")

            records = DailyAttendance.objects.filter(id__in=target_ids, is_deleted=False)
            if not records.exists():
                raise ValidationError("هیچ رکورد کارکرد معتبری یافت نشد.")

            for rec in records:
                _validate_instance_company_access(rec, 'attendance', user)

            now = timezone.now()
            if action_type == 'approve':
                for rec in records:
                    old_st = rec.approval_status
                    rec.approval_status = 'APPROVED'
                    rec.supervisor_approved_by = user
                    rec.supervisor_approved_at = now
                    rec.save(update_fields=['approval_status', 'supervisor_approved_by', 'supervisor_approved_at', 'updated_at'])

                    AttendanceAuditLog.objects.create(
                        attendance=rec,
                        personnel_name=rec.personnel.full_name,
                        date_shamsi=rec.date_shamsi,
                        changed_by=user,
                        field_name='approval_status',
                        old_value=old_st,
                        new_value='APPROVED',
                        reason='تایید نهایی کارکرد توسط سرپرست'
                    )
                return Response({'message': f'تعداد {records.count()} رکورد کارکرد با موفقیت توسط سرپرست تایید شد.'})

            elif action_type == 'revision':
                if not reason:
                    raise ValidationError("ثبت علت عودت و بازنگری الزامی است.")
                for rec in records:
                    old_st = rec.approval_status
                    rec.approval_status = 'REVISION_REQUIRED'
                    rec.revision_reason = reason
                    rec.revision_requested_by = user
                    rec.revision_requested_at = now
                    rec.save(update_fields=['approval_status', 'revision_reason', 'revision_requested_by', 'revision_requested_at', 'updated_at'])

                    AttendanceAuditLog.objects.create(
                        attendance=rec,
                        personnel_name=rec.personnel.full_name,
                        date_shamsi=rec.date_shamsi,
                        changed_by=user,
                        field_name='approval_status',
                        old_value=old_st,
                        new_value='REVISION_REQUIRED',
                        reason=f'عودت به کارشناس: {reason}'
                    )
                return Response({'message': f'تعداد {records.count()} رکورد کارکرد جهت بازنگری عودت داده شد.'})

            elif action_type == 'reject':
                if not reason:
                    raise ValidationError("ثبت دلیل ابطال الزامی است.")
                for rec in records:
                    old_st = rec.approval_status
                    rec.approval_status = 'REVISION_REQUIRED'
                    rec.revision_reason = f'ابطال: {reason}'
                    rec.revision_requested_by = user
                    rec.revision_requested_at = now
                    rec.save(update_fields=['approval_status', 'revision_reason', 'revision_requested_by', 'revision_requested_at', 'updated_at'])

                    AttendanceAuditLog.objects.create(
                        attendance=rec,
                        personnel_name=rec.personnel.full_name,
                        date_shamsi=rec.date_shamsi,
                        changed_by=user,
                        field_name='approval_status',
                        old_value=old_st,
                        new_value='REVISION_REQUIRED',
                        reason=f'ابطال توسط سرپرست: {reason}'
                    )
                return Response({'message': f'تعداد {records.count()} رکورد کارکرد ابطال و جهت اصلاح ارجاع شد.'})
            else:
                raise ValidationError(f"اقدام «{action_type}» برای کارکرد نامعتبر است.")

        # --- ۲. سایر مدل‌ها و دوره کارکرد ماهانه ---
        instance = _get_target_instance(model_name, item_id, request.data)
        _validate_instance_company_access(instance, model_name, user)
        if isinstance(instance, ExpenseInvoice):
            return _invoice_engine_action(user, instance, action_type, reason)
        _ensure_cartable_section_permission(instance, user)
        _reject_personnel_profile_action(instance)
        is_financial = model_name in ['period', 'work_period', 'payroll', 'payroll_record', 'invoice', 'expense_invoice', 'petty_cash', 'petty_cash_transaction']

        if action_type == 'approve':
            # سد سروری قفل دوره: اعتبارسنجی تایید ۱۰۰٪ کارکردهای روزانه پیش از ارسال به حسابداری
            if model_name.lower() in ['period', 'work_period']:
                ym = instance.year_month
                norm_ym = ym.replace('-', '/')
                att_filter = Q(is_deleted=False) & (Q(period=instance) | Q(date_shamsi__startswith=norm_ym))
                if instance.section_id:
                    att_filter &= (Q(section_id=instance.section_id) | (Q(section_id__isnull=True) & Q(personnel__section_id=instance.section_id)))
                elif instance.project_id:
                    att_filter &= (Q(project_id=instance.project_id) | (Q(project_id__isnull=True) & Q(personnel__project_id=instance.project_id)))
                elif instance.warehouse_id:
                    att_filter &= Q(warehouse_id=instance.warehouse_id)

                unapproved_count = DailyAttendance.objects.filter(att_filter).exclude(approval_status='APPROVED').count()
                if unapproved_count > 0:
                    raise ValidationError(
                        f"امکان قفل و ارسال دوره به حسابداری وجود ندارد. هنوز تعداد {unapproved_count} رکورد کارکرد در وضعیت در انتظار یا نیازمند بازنگری وجود دارد."
                    )

            updated = advance_workflow_step(instance, user, is_financial=is_financial)
            return Response({'message': 'تایید سرپرست با موفقیت ثبت گردید و پرونده به مرحله بعد ارسال شد.'})
        elif action_type == 'revision':
            if not reason:
                raise ValidationError("ثبت علت بازنگری الزامی است.")
            updated = request_workflow_revision(instance, user, reason=reason)
            return Response({'message': 'پرونده جهت بازنگری و اصلاح به مرحله قبل ارجاع گردید.'})
        elif action_type == 'reject':
            if not reason:
                raise ValidationError("ثبت دلیل ابطال پرونده الزامی است.")
            updated = reject_workflow(instance, user, reason=reason)
            return Response({'message': 'پرونده با موفقیت ابطال و بایگانی شد.'})
        else:
            raise ValidationError(f"اقدام «{action_type}» نامعتبر است.")


class AccountantCartableAPIView(APIView):
    """
    کارتابل یکپارچه حسابداری و مالی (سطح ۳)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        tier = determine_user_tier(user)
        if tier < WorkflowTiers.TIER_3_ACCOUNTANT:
            raise PermissionDenied("دسترسی به کارتابل حسابداری مجاز نمی‌باشد.")

        company_ids = _get_effective_company_ids(request, user)

        personnel_qs = _filter_by_company(
            PersonnelProfile.objects.filter(
                approval_status__in=[WorkflowStatuses.PENDING_ACCOUNTANT, 'pending_accountant', WorkflowStatuses.SUPERVISOR_APPROVED, 'supervisor_approved', 'manager_approved']
            ).select_related('user'),
            'personnel', company_ids
        )
        personnel_qs = _scope_personnel_rows(personnel_qs, user, WorkflowTiers.TIER_3_ACCOUNTANT)

        vehicles_qs = _filter_by_company(
            VehicleDriverProfile.objects.filter(
                approval_status__in=[WorkflowStatuses.PENDING_ACCOUNTANT, 'pending_accountant', WorkflowStatuses.SUPERVISOR_APPROVED, 'supervisor_approved', 'manager_approved']
            ).select_related('user'),
            'vehicle', company_ids
        )

        p_changes = _filter_by_company(
            PersonnelChangeRequest.objects.filter(
                status__in=[WorkflowStatuses.PENDING_ACCOUNTANT, 'pending_accountant', WorkflowStatuses.SUPERVISOR_APPROVED, 'supervisor_approved', 'pending_finance']
            ).select_related('personnel', 'requested_by'),
            'personnel_change', company_ids
        )

        v_changes = _filter_by_company(
            VehicleChangeRequest.objects.filter(
                status__in=[WorkflowStatuses.PENDING_ACCOUNTANT, 'pending_accountant', WorkflowStatuses.SUPERVISOR_APPROVED, 'supervisor_approved', 'pending_finance']
            ).select_related('vehicle', 'requested_by'),
            'vehicle_change', company_ids
        )

        periods = _filter_by_company(
            MonthlyWorkPeriod.objects.filter(
                status__in=[WorkflowStatuses.PERIOD_SUBMITTED_SUPERVISOR, 'SUBMITTED_SUPERVISOR']
            ),
            'period', company_ids
        )

        # فاکتورهای نیازمند ممیزی حسابدار
        invoices_qs = _filter_by_company(_invoice_task_rows(user, 'accountant_review'), 'invoice', company_ids)

        # اسناد تنخواه‌گردان نیازمند ممیزی حسابدار
        petty_cash_qs = _filter_by_company(
            PettyCashTransaction.objects.filter(
                status__in=[WorkflowStatuses.PENDING_ACCOUNTANT, 'pending_accountant']
            ).select_related('section', 'custodian'),
            'petty_cash', company_ids
        )
        petty_cash_qs = _scope_section_rows(petty_cash_qs, user, PETTY_CASH_MANAGE_PERM, WorkflowTiers.TIER_3_ACCOUNTANT)

        return Response({
            'tier': 'ACCOUNTANT',
            'counts': {
                'personnel': personnel_qs.count(),
                'vehicles': vehicles_qs.count(),
                'personnel_changes': p_changes.count(),
                'vehicle_changes': v_changes.count(),
                'periods': periods.count(),
                'invoices': invoices_qs.count(),
                'petty_cash': petty_cash_qs.count(),
                'total_pending': personnel_qs.count() + vehicles_qs.count() + p_changes.count() + v_changes.count() + periods.count() + invoices_qs.count() + petty_cash_qs.count()
            },
            # context درخواست لازم است تا دستمزد از نقش غیرمالی پنهان بماند (DEF-21)
            'personnel': PersonnelProfileSerializer(personnel_qs[:50], many=True, context={'request': request}).data,
            'vehicles': VehicleDriverProfileSerializer(vehicles_qs[:50], many=True).data,
            'personnel_changes': PersonnelChangeRequestSerializer(p_changes[:50], many=True).data,
            'vehicle_changes': VehicleChangeRequestSerializer(v_changes[:50], many=True).data,
            'periods': MonthlyWorkPeriodSerializer(periods, many=True).data,
            'invoices': ExpenseInvoiceSerializer(invoices_qs[:50], many=True).data,
            'petty_cash': PettyCashTransactionSerializer(petty_cash_qs[:50], many=True).data
        })

    def post(self, request):
        user = request.user
        action_type = request.data.get('action')
        model_name = request.data.get('model')
        item_id = request.data.get('id')
        reason = request.data.get('reason', '')

        if not action_type or not model_name or (not item_id and not (model_name in ['period', 'work_period'] and request.data.get('year_month'))):
            raise ValidationError("پارامترهای action، model و id (یا year_month برای دوره) الزامی هستند.")

        instance = _get_target_instance(model_name, item_id, request.data)
        _validate_instance_company_access(instance, model_name, user)
        if isinstance(instance, ExpenseInvoice):
            return _invoice_engine_action(user, instance, action_type, reason)
        _ensure_cartable_section_permission(instance, user)
        _reject_personnel_profile_action(instance)
        is_financial = model_name in ['period', 'work_period', 'payroll', 'payroll_record', 'invoice', 'expense_invoice', 'petty_cash', 'petty_cash_transaction']

        if action_type == 'approve':
            updated = advance_workflow_step(instance, user, is_financial=is_financial)
            return Response({'message': 'تایید مالی و محاسباتی با موفقیت ثبت شد و به مدیر ارجاع گردید.'})
        elif action_type == 'revision':
            if not reason:
                raise ValidationError("ثبت علت بازنگری الزامی است.")
            updated = request_workflow_revision(instance, user, reason=reason)
            return Response({'message': 'پرونده با ثبت اشکال به سرپرست/ثبت‌کننده برگردانده شد.'})
        elif action_type == 'reject':
            if not reason:
                raise ValidationError("ثبت دلیل ابطال الزامی است.")
            updated = reject_workflow(instance, user, reason=reason)
            return Response({'message': 'پرونده ابطال و رد قطعی گردید.'})
        else:
            raise ValidationError(f"اقدام «{action_type}» نامعتبر است.")


class ManagerCartableAPIView(APIView):
    """
    کارتابل یکپارچه مدیریت شرکت (سطح ۴) - صدور مجوزهای نهایی و مجوز پرداخت
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        tier = determine_user_tier(user)
        if tier < WorkflowTiers.TIER_4_MANAGER:
            raise PermissionDenied("دسترسی به کارتابل مدیر شرکت مجاز نمی‌باشد.")

        company_ids = _get_effective_company_ids(request, user)

        personnel_qs = _filter_by_company(
            PersonnelProfile.objects.filter(
                approval_status__in=[WorkflowStatuses.PENDING_MANAGER, WorkflowStatuses.ACCOUNTANT_APPROVED]
            ).select_related('user'),
            'personnel', company_ids
        )
        personnel_qs = _scope_personnel_rows(personnel_qs, user, WorkflowTiers.TIER_4_MANAGER)

        vehicles_qs = _filter_by_company(
            VehicleDriverProfile.objects.filter(
                approval_status__in=[WorkflowStatuses.PENDING_MANAGER, WorkflowStatuses.ACCOUNTANT_APPROVED]
            ).select_related('user'),
            'vehicle', company_ids
        )

        p_changes = _filter_by_company(
            PersonnelChangeRequest.objects.filter(
                status__in=[WorkflowStatuses.PENDING_MANAGER, 'pending_manager', WorkflowStatuses.ACCOUNTANT_APPROVED, 'accountant_approved']
            ).select_related('personnel', 'requested_by'),
            'personnel_change', company_ids
        )

        v_changes = _filter_by_company(
            VehicleChangeRequest.objects.filter(
                status__in=[WorkflowStatuses.PENDING_MANAGER, 'pending_manager', WorkflowStatuses.ACCOUNTANT_APPROVED, 'accountant_approved']
            ).select_related('vehicle', 'requested_by'),
            'vehicle_change', company_ids
        )

        periods = _filter_by_company(
            MonthlyWorkPeriod.objects.filter(
                status__in=[WorkflowStatuses.PERIOD_SUBMITTED_ACCOUNTANT, 'SUBMITTED_ACCOUNTANT']
            ),
            'period', company_ids
        )

        # فاکتورهای نیازمند تایید مدیر
        invoices_qs = _filter_by_company(_invoice_task_rows(user, 'manager_ok'), 'invoice', company_ids)

        # اسناد تنخواه نیازمند تایید مدیر
        petty_cash_qs = _filter_by_company(
            PettyCashTransaction.objects.filter(
                status__in=[WorkflowStatuses.APPROVED, 'approved']
            ).select_related('section', 'custodian'),
            'petty_cash', company_ids
        )
        petty_cash_qs = _scope_section_rows(petty_cash_qs, user, PETTY_CASH_MANAGE_PERM, WorkflowTiers.TIER_4_MANAGER)

        return Response({
            'tier': 'MANAGER',
            'counts': {
                'personnel': personnel_qs.count(),
                'vehicles': vehicles_qs.count(),
                'personnel_changes': p_changes.count(),
                'vehicle_changes': v_changes.count(),
                'periods': periods.count(),
                'invoices': invoices_qs.count(),
                'petty_cash': petty_cash_qs.count(),
                'total_pending': personnel_qs.count() + vehicles_qs.count() + p_changes.count() + v_changes.count() + periods.count() + invoices_qs.count() + petty_cash_qs.count()
            },
            # context درخواست لازم است تا دستمزد از نقش غیرمالی پنهان بماند (DEF-21)
            'personnel': PersonnelProfileSerializer(personnel_qs[:50], many=True, context={'request': request}).data,
            'vehicles': VehicleDriverProfileSerializer(vehicles_qs[:50], many=True).data,
            'personnel_changes': PersonnelChangeRequestSerializer(p_changes[:50], many=True).data,
            'vehicle_changes': VehicleChangeRequestSerializer(v_changes[:50], many=True).data,
            'periods': MonthlyWorkPeriodSerializer(periods, many=True).data,
            'invoices': ExpenseInvoiceSerializer(invoices_qs[:50], many=True).data,
            'petty_cash': PettyCashTransactionSerializer(petty_cash_qs[:50], many=True).data
        })

    def post(self, request):
        user = request.user
        action_type = request.data.get('action')
        model_name = request.data.get('model')
        item_id = request.data.get('id')
        reason = request.data.get('reason', '')

        if not action_type or not model_name or (not item_id and not (model_name in ['period', 'work_period'] and request.data.get('year_month'))):
            raise ValidationError("پارامترهای action، model و id (یا year_month برای دوره) الزامی هستند.")

        instance = _get_target_instance(model_name, item_id, request.data)
        _validate_instance_company_access(instance, model_name, user)
        if isinstance(instance, ExpenseInvoice):
            return _invoice_engine_action(user, instance, action_type, reason)
        _ensure_cartable_section_permission(instance, user)
        _reject_personnel_profile_action(instance)
        is_financial = model_name in ['period', 'work_period', 'payroll', 'payroll_record', 'invoice', 'expense_invoice', 'petty_cash', 'petty_cash_transaction']

        if action_type == 'approve':
            updated = advance_workflow_step(instance, user, is_financial=is_financial)
            msg = 'مجوز پرداخت اسناد مالی با موفقیت صادر و به خزانه‌داری ارسال شد.' if is_financial else 'پرونده با موفقیت تصویب نهایی و در سیستم فعال شد.'
            return Response({'message': msg})
        elif action_type == 'revision':
            if not reason:
                raise ValidationError("ثبت علت بازنگری الزامی است.")
            updated = request_workflow_revision(instance, user, reason=reason)
            return Response({'message': 'پرونده با دستور مدیریت جهت بازنگری ارجاع گردید.'})
        elif action_type == 'reject':
            if not reason:
                raise ValidationError("ثبت علت رد الزامی است.")
            updated = reject_workflow(instance, user, reason=reason)
            return Response({'message': 'پرونده توسط مدیریت ابطال گردید.'})
        else:
            raise ValidationError(f"اقدام «{action_type}» نامعتبر است.")


class TreasuryCartableAPIView(APIView):
    """
    کارتابل اختصاصی خزانه‌داری و صدور دیسکت‌های بانکی (سطح ۵)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        tier = determine_user_tier(user)
        if tier < WorkflowTiers.TIER_5_TREASURY:
            raise PermissionDenied("دسترسی به کارتابل خزانه‌داری مجاز نمی‌باشد.")

        company_ids = _get_effective_company_ids(request, user)
        data = TreasuryDisbursementService.get_pending_treasury_batches(company_ids=company_ids)

        # دریافت سوابق تفکیکی حقوق آماده پرداخت
        payrolls_qs = MonthlyPayrollRecord.objects.filter(
            payment_status__in=[WorkflowStatuses.PAYROLL_READY_TO_PAY, 'READY_TO_PAY', WorkflowStatuses.PAYROLL_FAILED_SHEBA]
        ).select_related('personnel', 'period')
        payrolls = _filter_by_company(payrolls_qs, 'payroll', company_ids)[:100]

        # دریافت سرویس‌های ناوگان تسویه‌نشده
        trips_qs = VehicleTripLog.objects.filter(
            is_settled=False,
            vehicle__approval_status__in=[WorkflowStatuses.APPROVED, 'approved']
        ).select_related('vehicle')
        trips = _filter_by_company(trips_qs, 'trip', company_ids)[:100]

        # فاکتورهای تایید شده آماده پرداخت خزانه‌داری
        invoices_payable = _filter_by_company(_invoice_task_rows(user, 'treasury_pay'), 'invoice', company_ids)[:100]

        data['invoices'] = ExpenseInvoiceSerializer(invoices_payable, many=True).data
        data['payrolls'] = MonthlyPayrollRecordSerializer(payrolls, many=True).data
        data['trips'] = [
            {
                'id': t.id,
                'vehicle_id': t.vehicle_id,
                'driver_name': t.vehicle.driver_name,
                'plate_number': t.vehicle.plate_number,
                'sheba_number': t.vehicle.sheba_number,
                'bank_name': t.vehicle.bank_name,
                'date_shamsi': t.date_shamsi,
                'total_amount': int(t.total_amount or 0),
                'is_settled': t.is_settled
            }
            for t in trips
        ]

        return Response(data)

    def post(self, request):
        """اجرای تسویه خزانه‌داری (دوره یا منفرد) با محافظت BOLA"""
        user = request.user
        action = request.data.get('action') # 'disburse_period', 'disburse_single_payroll', 'disburse_fleet'
        tracking_code = request.data.get('tracking_code')
        batch_id = request.data.get('batch_id', '')

        if not action or not tracking_code:
            raise ValidationError("پارامترهای action و tracking_code الزامی هستند.")

        if action == 'disburse_period':
            period_id = request.data.get('period_id')
            period = MonthlyWorkPeriod.objects.get(pk=period_id)
            _validate_instance_company_access(period, 'period', user)
            res = TreasuryDisbursementService.disburse_payroll_period(
                period=period,
                treasury_user=user,
                tracking_code=tracking_code,
                batch_id=batch_id
            )
            return Response(res)

        elif action == 'disburse_single_payroll':
            payroll_id = request.data.get('payroll_id')
            rec = MonthlyPayrollRecord.objects.get(pk=payroll_id)
            _validate_instance_company_access(rec, 'payroll', user)
            updated_rec = TreasuryDisbursementService.disburse_single_payroll_record(
                record=rec,
                treasury_user=user,
                tracking_code=tracking_code,
                batch_id=batch_id
            )
            return Response({
                'message': 'تسویه رکورد منفرد حقوق با موفقیت انجام شد.',
                'record': MonthlyPayrollRecordSerializer(updated_rec).data
            })

        elif action == 'disburse_fleet':
            trip_ids = request.data.get('trip_ids', [])
            if not trip_ids and hasattr(request.data, 'getlist'):
                trip_ids = request.data.getlist('trip_ids')
            if isinstance(trip_ids, (int, str)):
                if isinstance(trip_ids, str) and ',' in trip_ids:
                    trip_ids = [int(x.strip()) for x in trip_ids.split(',') if x.strip()]
                else:
                    trip_ids = [int(trip_ids)]
            elif isinstance(trip_ids, list):
                trip_ids = [int(x) for x in trip_ids]

            if not trip_ids:
                raise ValidationError("شناسه سفرهای ناوگان ارسال نشده است.")

            trips = VehicleTripLog.objects.filter(id__in=trip_ids)
            if not trips.exists():
                raise ValidationError("هیچ رکوردی برای شناسه‌های ارسالی یافت نشد.")

            for t in trips:
                _validate_instance_company_access(t, 'trip', user)

            res = TreasuryDisbursementService.disburse_fleet_trips(
                trip_ids=trip_ids,
                treasury_user=user,
                tracking_code=tracking_code,
                batch_id=batch_id
            )
            return Response(res)

        elif action == 'disburse_invoice':
            invoice_id = request.data.get('invoice_id')
            if not invoice_id:
                raise ValidationError("شناسه فاکتور (invoice_id) الزامی است.")
            # پرداخت فاکتور روی موتور گردش کار (ت۱۷ طرح ۲.۳): فقط دریافت‌کنندهٔ کار باز مرحلهٔ پرداخت
            from django.db import transaction
            from django.utils import timezone
            from workflow import engine as wf_engine
            from workflow.errors import WorkflowError
            from .workflows import INVOICE_WORKFLOW
            invoice = ExpenseInvoice.objects.filter(pk=invoice_id).first()
            task = wf_engine.open_task(INVOICE_WORKFLOW, invoice_id) if invoice else None
            if invoice is None or task is None or task.step_key != 'treasury_pay':
                raise ValidationError("فاکتور در مرحلهٔ پرداخت نیست یا یافت نشد.")
            _validate_instance_company_access(invoice, 'invoice', user)
            # د۵ طرح ۴.۱: همان مسیر pay/ قدیمی = یک قسط به اندازهٔ کل مانده (خزانه‌دار، نه ثبت‌کننده)
            from .invoice_payments import add_payment
            try:
                _payment, updated_invoice = add_payment(
                    user, invoice.pk, {'tracking_code': tracking_code, 'notes': request.data.get('notes') or ''},
                    legacy=True)
            except WorkflowError as exc:
                return Response({'code': exc.code, 'error': exc.message_fa, 'detail': exc.message_fa},
                                status=exc.status)
            updated_invoice.refresh_from_db()
            return Response({
                'message': f'فاکتور شماره «{invoice.invoice_number}» با موفقیت تسویه و پرداخت شد.',
                'invoice': ExpenseInvoiceSerializer(updated_invoice).data
            })

        else:
            raise ValidationError(f"اقدام «{action}» نامعتبر است.")


class TreasuryDisketteExportAPIView(APIView):
    """
    دانلود دیسکت‌های بانکی پایا و ساتنا برای دوره‌ها با کنترل دسترسی شرکت
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        tier = determine_user_tier(user)
        if tier < WorkflowTiers.TIER_5_TREASURY:
            raise PermissionDenied("دسترسی به خروجی دیسکت خزانه‌داری مجاز نمی‌باشد.")

        period_id = request.query_params.get('period_id')
        diskette_type = request.query_params.get('type', 'paya').lower()

        if not period_id:
            raise ValidationError("پارامتر period_id الزامی است.")

        period = MonthlyWorkPeriod.objects.get(pk=period_id)
        _validate_instance_company_access(period, 'period', user)
        records = MonthlyPayrollRecord.objects.filter(
            period=period,
            include_in_bank=True
        ).select_related('personnel')

        if diskette_type == 'satna':
            content = generate_satna_diskette_csv(records, payment_description=f"حقوق {period.year_month}")
            filename = f"SATNA_{period.year_month.replace('/', '')}.csv"
        else:
            content = generate_paya_diskette_csv(records, payment_description=f"حقوق {period.year_month}")
            filename = f"PAYA_{period.year_month.replace('/', '')}.csv"

        response = HttpResponse(content.encode('utf-8-sig'), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
