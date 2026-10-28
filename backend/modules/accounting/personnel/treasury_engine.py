# -*- coding: utf-8 -*-
"""
Enterprise Treasury Engine Module (Phase 2).
Provides high-performance, atomic financial disbursement services for:
1. Monthly Payroll Records (Batch & Single)
2. Vehicle Trip & Fleet Settlements
3. Iranian Banking System Payment Diskettes (Paya, Satna, Bank Meli/Mellat)
4. Isolated Sheba Failure Governance & Hard Freezing
"""
import io
import csv
import logging
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.exceptions import PermissionDenied, ValidationError

from .models import (
    MonthlyWorkPeriod,
    MonthlyPayrollRecord,
    VehicleDriverProfile,
    VehicleTripLog,
    BankExportSettings,
    PersonnelProfile
)
from .workflow_engine import (
    WorkflowStatuses,
    WorkflowTiers,
    determine_user_tier,
    execute_treasury_disbursement,
    notify_document_changed,
    record_isolated_sheba_failure
)
from .sheba_utils import validate_sheba, clean_sheba

logger = logging.getLogger(__name__)


class TreasuryEngineError(Exception):
    """Base exception for Treasury Engine operations."""
    pass


class TreasuryDisbursementService:
    """
    سرویس متمرکز مدیریت پرداخت‌ها و خزانه‌داری سازمانی
    """

    @staticmethod
    def _verify_treasury_access(user):
        """اعتبارسنجی سطح دسترسی کاربر خزانه‌داری"""
        tier = determine_user_tier(user)
        if tier < WorkflowTiers.TIER_5_TREASURY:
            raise PermissionDenied("کاربر جاری فاقد مجوز خزانه‌داری و صدور دستور پرداخت است.")

    @classmethod
    def payroll_pay_period_ids(cls, user=None, company_ids: Optional[List[int]] = None) -> List[int]:
        """
        د۶ طرح ۴.۵: دوره‌های آمادهٔ پرداخت = کارهای باز treasury_pay گردش حقوق. با user: فقط کارهایی که کاربر
        دریافت‌کننده (یا جانشین) آن است (دامنهٔ بخش از موتور)؛ مدیر کل همهٔ کارهای باز. company_ids فیلتر شرکت.
        """
        from workflow.models import WorkflowTask
        from workflow.queries import tasks_for_user
        from .workflows import PAYROLL_PERIOD_ENTITY, PAYROLL_PERIOD_WORKFLOW
        if user is not None and not user.is_superuser:
            tasks = tasks_for_user(user)
        else:
            tasks = WorkflowTask.objects.filter(is_open=True, track=WorkflowTask.TRACK_STEP)
        tasks = tasks.filter(instance__workflow_key=PAYROLL_PERIOD_WORKFLOW,
                             instance__entity_kind=PAYROLL_PERIOD_ENTITY, step_key='treasury_pay')
        if company_ids is not None:
            tasks = tasks.filter(instance__company_id__in=list(company_ids))
        ids = set()
        for entity_id in tasks.values_list('instance__entity_id', flat=True):
            if str(entity_id).isdigit():
                ids.add(int(entity_id))
        return sorted(ids)

    @classmethod
    def get_pending_treasury_batches(cls, company_ids: Optional[List[int]] = None, user=None) -> Dict[str, Any]:
        """
        دریافت کلیه اسناد مالی آماده پرداخت (Ready to Pay) به تفکیک حقوق و ناوگان
        با پشتیبانی از فیلتر چندشرکتی (Multi-tenant Company Scoping).
        د۶ طرح ۴.۵: دوره‌ها و ردیف‌های حقوق فقط از کارهای باز treasury_pay گردش حقوق (در دامنهٔ user).
        """
        period_ids = cls.payroll_pay_period_ids(user=user, company_ids=company_ids)
        ready_periods = MonthlyWorkPeriod.objects.filter(id__in=period_ids).order_by('-year_month')

        # ردیف‌های آمادهٔ پرداخت همان دوره‌ها (بی تعلیق‌ها که PENDING می‌مانند)
        ready_payrolls = MonthlyPayrollRecord.objects.filter(
            period_id__in=period_ids,
            payment_status__in=[WorkflowStatuses.PAYROLL_READY_TO_PAY, 'READY_TO_PAY']
        ).select_related('personnel', 'period')

        # تسویه‌های ناوگان آماده پرداخت
        ready_trips = VehicleTripLog.objects.filter(
            is_settled=False,
            vehicle__approval_status__in=[WorkflowStatuses.APPROVED, 'approved']
        ).select_related('vehicle')

        if company_ids is not None:
            if len(company_ids) == 0:
                ready_trips = ready_trips.none()
            else:
                ready_trips = ready_trips.filter(
                    Q(vehicle__company_id__in=company_ids) |
                    Q(project__company_id__in=company_ids) |
                    Q(section__project__company_id__in=company_ids)
                )

        total_payroll_payable = sum(r.payable_amount or 0 for r in ready_payrolls)
        total_fleet_payable = sum(t.total_amount or 0 for t in ready_trips)

        return {
            'ready_periods_count': ready_periods.count(),
            'ready_payrolls_count': ready_payrolls.count(),
            'ready_trips_count': ready_trips.count(),
            'total_payroll_amount': total_payroll_payable,
            'total_fleet_amount': total_fleet_payable,
            'total_disbursement_queue': total_payroll_payable + total_fleet_payable,
            'periods': list(ready_periods.values('id', 'year_month', 'status', 'manager_approved_at')),
        }

    @classmethod
    def disburse_payroll_period(
        cls,
        period: MonthlyWorkPeriod,
        treasury_user,
        tracking_code: str,
        batch_id: str,
        payment_method: str = 'PAYA',
        notes: str = ''
    ) -> Dict[str, Any]:
        """
        د۶ طرح ۴.۵: پوستهٔ نازک روی اقدام «پرداخت» موتور در مرحلهٔ treasury_pay گردش حقوق. مجوز (دریافت‌کننده،
        جانشین، خوداقدامی) را موتور می‌سنجد؛ پرداخت در قلاب پایان گردش (execute_period_payment) و در همان تراکنش.
        خطا: WorkflowError (کد ثابت).
        """
        from workflow import engine as wf_engine
        from workflow.errors import WorkflowError
        from .workflows import payroll_open_task

        if not tracking_code or not str(tracking_code).strip():
            raise WorkflowError('tracking_code_required', 'ثبت کد رهگیری بانکی برای تایید پرداخت الزامی است.', 400)
        task = payroll_open_task(period.pk)
        if task is None or task.step_key != 'treasury_pay':
            raise WorkflowError('not_ready_to_pay',
                                'حقوق این دوره در مرحلهٔ پرداخت خزانه نیست (هنوز تأیید مدیر نگرفته یا پرداخت شده است).',
                                400)
        period._wf_payment = {'tracking_code': str(tracking_code).strip(), 'batch_id': batch_id or '',
                              'user': treasury_user}
        period._wf_reason = notes or ''
        wf_engine.act(treasury_user, task, reason=notes or '', obj=period)
        return getattr(period, '_wf_payment_result', None) or {}

    @classmethod
    @transaction.atomic
    def disburse_single_payroll_record(
        cls,
        record: MonthlyPayrollRecord,
        treasury_user,
        tracking_code: str,
        batch_id: str = '',
        payment_method: str = 'PAYA'
    ) -> MonthlyPayrollRecord:
        """
        تسویه منفرد یک رکورد حقوق پس از اصلاح شماره شبا. د۶ طرح ۴.۵: فقط ردیف FAILED_SHEBA یک دورهٔ PAID، با
        perm_treasury_disburse_action در بخش (یا شرکت) دورهٔ ردیف؛ وضعیت زیر قفل دوباره سنجیده می‌شود.
        """
        from .lifecycle_services import user_has_any_perm
        from .workflows import PAYROLL_TREASURY_PERM
        from workflow.errors import WorkflowError

        if not tracking_code or not str(tracking_code).strip():
            raise ValidationError("کد رهگیری بانکی الزامی است.")

        locked_rec = MonthlyPayrollRecord.objects.select_for_update().select_related('personnel', 'period').get(
            pk=record.pk)
        if not user_has_any_perm(treasury_user, (PAYROLL_TREASURY_PERM,), locked_rec.period):
            raise WorkflowError('not_allowed',
                                'پرداخت دوبارهٔ حقوق فقط با مجوز پرداخت خزانه در بخش همین دوره مجاز است.', 403)
        # ردیف خطای شبا، یا ردیف معلقی که پس از پرداخت دوره آزاد شده (PENDING بی تعلیق)
        repayable = (locked_rec.payment_status == WorkflowStatuses.PAYROLL_FAILED_SHEBA
                     or (locked_rec.payment_status == 'PENDING' and not locked_rec.payment_hold))
        if not repayable or locked_rec.period.status != 'PAID':
            raise WorkflowError('not_failed_sheba',
                                'پرداخت تکی فقط برای ردیف «خطای شبا» یا ردیف آزادشده از تعلیق در دورهٔ پرداخت‌شده '
                                'ممکن است.', 400)

        sheba = getattr(locked_rec.personnel, 'sheba_number', None)
        is_valid, err_msg, _ = validate_sheba(sheba) if sheba else (False, 'شماره شبا ثبت نشده است.', None)
        if not is_valid:
            raise WorkflowError('invalid_sheba', f'شماره شبا نامعتبر است: {err_msg}', 400)

        now = timezone.now()
        locked_rec.payment_status = WorkflowStatuses.PAYROLL_PAID
        locked_rec.paid_at = now
        locked_rec.paid_by = treasury_user
        locked_rec.payment_tracking_code = tracking_code
        locked_rec.payment_batch_id = batch_id or f"SINGLE-{now.strftime('%Y%m%d%H%M%S')}"
        locked_rec.payment_failure_reason = None
        locked_rec.save(update_fields=[
            'payment_status', 'paid_at', 'paid_by',
            'payment_tracking_code', 'payment_batch_id',
            'payment_failure_reason', 'updated_at'
        ])
        # د۳: کسر تنخواه این ردیف فقط حالا (پرداخت واقعی) قطعی می‌شود؛ تسویهٔ باطل‌شده کل پرداخت را برمی‌گرداند
        _confirm_petty_or_fail(locked_rec, treasury_user)
        try:
            from .models import emit_accounting_event
            emit_accounting_event(
                source_instance=locked_rec,
                event_type='PAYROLL_PAID',
                occurred_at=now,
                payload={'tracking_code': tracking_code, 'batch_id': locked_rec.payment_batch_id}
            )
        except Exception as ex:
            logger.warning(f"[TreasuryOutbox] Error emitting event for record {locked_rec.pk}: {ex}")
        notify_document_changed(locked_rec)

        return locked_rec

    @classmethod
    @transaction.atomic
    def disburse_fleet_trips(
        cls,
        trip_ids: List[int],
        treasury_user,
        tracking_code: str,
        batch_id: str = ''
    ) -> Dict[str, Any]:
        """
        تسویه گروهی سفرهای ناوگان
        """
        cls._verify_treasury_access(treasury_user)

        if not tracking_code or not str(tracking_code).strip():
            raise ValidationError("کد رهگیری بانکی الزامی است.")

        locked_trips = VehicleTripLog.objects.select_for_update().filter(id__in=trip_ids)
        now = timezone.now()
        total_amount = 0
        updated_count = 0

        for trip in locked_trips:
            trip.is_settled = True
            trip.settled_at = now
            trip.settled_by = treasury_user
            trip.payment_tracking_code = tracking_code
            trip.save(update_fields=['is_settled', 'settled_at', 'settled_by', 'payment_tracking_code'])
            try:
                from .models import emit_accounting_event
                emit_accounting_event(
                    source_instance=trip,
                    event_type='FLEET_TRIP_SETTLED',
                    occurred_at=now,
                    payload={'tracking_code': tracking_code, 'batch_id': batch_id}
                )
            except Exception as ex:
                logger.warning(f"[TreasuryOutbox] Error emitting fleet trip event: {ex}")
            total_amount += int(trip.total_amount or 0)
            updated_count += 1

        return {
            'settled_trips_count': updated_count,
            'total_settled_amount': total_amount,
            'tracking_code': tracking_code
        }


def generate_paya_diskette_csv(
    payroll_records: List[MonthlyPayrollRecord],
    source_sheba: str = '',
    payment_description: str = 'حقوق و دستمزد'
) -> str:
    """
    تولید دیسکت استاندارد پایا (PAYA) به صورت CSV با فرمت استاندارد بانکی شاپرک/بانک مرکزی:
    ردیف, شماره شبا مقصد, مبلغ (ریال), نام و نام خانوادگی, شناسه واریز, شرح واریز
    """
    output = io.StringIO()
    writer = csv.writer(output, delimiter=',', quoting=csv.QUOTE_MINIMAL)

    # Header
    writer.writerow(['ردیف', 'شماره شبا مقصد', 'مبلغ (ریال)', 'نام و نام خانوادگی', 'شناسه واریز', 'شرح واریز', 'کد ملی'])

    row_idx = 1
    for rec in payroll_records:
        payable = int(round(rec.payable_amount or 0))
        if payable <= 0:
            continue

        p = rec.personnel
        sheba = clean_sheba(p.sheba_number or '')
        writer.writerow([
            row_idx,
            sheba,
            payable,
            p.full_name,
            f"PAYROLL-{rec.period.year_month.replace('/', '')}",
            payment_description,
            p.national_code or ''
        ])
        row_idx += 1

    return "\ufeff" + output.getvalue()


def generate_satna_diskette_csv(
    payroll_records: List[MonthlyPayrollRecord],
    source_sheba: str = '',
    payment_description: str = 'انتقال ساتنا حقوق و دستمزد'
) -> str:
    """
    تولید دیسکت استاندارد ساتنا (SATNA) برای مبالغ کلان و تسویه‌های فوری
    """
    output = io.StringIO()
    writer = csv.writer(output, delimiter=',', quoting=csv.QUOTE_MINIMAL)

    writer.writerow(['ردیف', 'شماره شبا مقصد', 'مبلغ (ریال)', 'نام ذینفع', 'شرح تراکنش ساتنا', 'کد ملی ذینفع'])

    row_idx = 1
    for rec in payroll_records:
        payable = int(round(rec.payable_amount or 0))
        if payable <= 0:
            continue

        p = rec.personnel
        sheba = clean_sheba(p.sheba_number or '')
        writer.writerow([
            row_idx,
            sheba,
            payable,
            p.full_name,
            payment_description,
            p.national_code or ''
        ])
        row_idx += 1

    return "\ufeff" + output.getvalue()


PETTY_CHANGED_CODE = 'petty_settlement_changed'


def _confirm_petty_or_fail(record, user):
    """
    د۳/د۴ طرح ۴.۵: قطعی کردن کسر تنخواه یک ردیف PAID. تسویه‌ای که پس از محاسبه باطل یا عوض شده (SettlementError)
    پرداخت را با 400 روشن متوقف می‌کند (هرگز پرداخت بی‌صدا)؛ فراخواننده در تراکنش است و همه‌چیز برمی‌گردد.
    """
    from workflow.errors import WorkflowError
    from .payroll_engine import confirm_record_petty_deductions
    from .petty_settlements import SettlementError
    try:
        confirm_record_petty_deductions(record, user=user)
    except SettlementError as exc:
        name = getattr(record, 'full_name', '') or getattr(getattr(record, 'personnel', None), 'full_name', '')
        raise WorkflowError(
            PETTY_CHANGED_CODE,
            f'کسر تنخواه فیش «{name}» پس از محاسبه تغییر کرده یا باطل شده است ({exc.message_fa})؛ '
            'حقوق این دوره را عودت دهید تا دوباره محاسبه شود.', 400)


def execute_period_payment(period, treasury_user, tracking_code: str, batch_id: str = '') -> Dict[str, Any]:
    """
    د۴ طرح ۴.۵: پرداخت درونی دوره، فقط از قلاب پایان گردش حقوق (مرحلهٔ treasury_pay) و در تراکنش موتور.
    قفل ردیف دوره و ردیف‌ها، وضعیت زیر قفل دوباره سنجیده می‌شود (دو پرداخت هم‌زمان = یک پرداخت)، خطای شبا جدا
    (FAILED_SHEBA، بی قطعی کردن تنخواه)، ردیف PAID با قطعی کسر تنخواه، رویداد حسابداری و دورهٔ PAID.
    فقط ردیف‌های READY_TO_PAY پرداخت می‌شوند (ردیف معلق PENDING می‌ماند).
    """
    from workflow.errors import WorkflowError
    from .models import emit_accounting_event

    locked_period = MonthlyWorkPeriod.objects.select_for_update().get(pk=period.pk)
    if locked_period.status not in [WorkflowStatuses.PERIOD_READY_TO_PAY, 'READY_TO_PAY']:
        raise WorkflowError('invalid_state', f'دوره در وضعیت قابل پرداخت نیست (وضعیت جاری: {locked_period.status}).', 409)

    records = list(MonthlyPayrollRecord.objects.select_for_update().filter(
        period=locked_period, include_in_bank=True, payment_status=WorkflowStatuses.PAYROLL_READY_TO_PAY,
    ).select_related('personnel').order_by('pk'))

    paid_count = failed_count = 0
    total_paid_amount = 0
    now = timezone.now()
    for rec in records:
        sheba = getattr(rec.personnel, 'sheba_number', None)
        is_valid_sheba = bool(sheba) and validate_sheba(sheba)[0]
        if not is_valid_sheba and (rec.payable_amount or 0) > 0:
            # جداسازی خطای شبا بی توقف کل دسته؛ کسر تنخواه این ردیف قطعی نمی‌شود
            rec.payment_status = WorkflowStatuses.PAYROLL_FAILED_SHEBA
            rec.payment_failure_reason = "شماره شبا نامعتبر یا ثبت‌نشده است."
            rec.save(update_fields=['payment_status', 'payment_failure_reason', 'updated_at'])
            failed_count += 1
            continue
        rec.payment_status = WorkflowStatuses.PAYROLL_PAID
        rec.paid_at = now
        rec.paid_by = treasury_user
        rec.payment_tracking_code = tracking_code
        rec.payment_batch_id = batch_id
        rec.save(update_fields=['payment_status', 'paid_at', 'paid_by', 'payment_tracking_code',
                                'payment_batch_id', 'updated_at'])
        _confirm_petty_or_fail(rec, treasury_user)
        try:
            emit_accounting_event(source_instance=rec, event_type='PAYROLL_PAID', occurred_at=now,
                                  payload={'tracking_code': tracking_code, 'batch_id': batch_id,
                                           'treasury_user': getattr(treasury_user, 'username', '')})
        except Exception as ex:
            logger.warning(f"[TreasuryOutbox] Error emitting event for record {rec.pk}: {ex}")
        paid_count += 1
        total_paid_amount += int(round(rec.payable_amount or 0))

    locked_period.status = WorkflowStatuses.PERIOD_PAID
    locked_period.treasury_paid_at = now
    locked_period.treasury_paid_by = treasury_user
    locked_period.payment_tracking_code = tracking_code
    locked_period.payment_batch_id = batch_id
    locked_period.save(update_fields=['status', 'treasury_paid_at', 'treasury_paid_by', 'payment_tracking_code',
                                      'payment_batch_id', 'updated_at'])
    period.status = locked_period.status
    try:
        emit_accounting_event(source_instance=locked_period, event_type='PERIOD_PAYROLL_FINALIZED', occurred_at=now,
                              payload={'tracking_code': tracking_code, 'batch_id': batch_id,
                                       'total_paid_amount': total_paid_amount, 'paid_count': paid_count})
    except Exception as ex:
        logger.warning(f"[TreasuryOutbox] Error emitting period event for {locked_period.pk}: {ex}")
    logger.info(f"[TREASURY] Period {locked_period.year_month} disbursed by {getattr(treasury_user, 'username', '')}. "
                f"Paid: {paid_count}, Failed Sheba: {failed_count}, Total: {total_paid_amount} Rials.")
    return {
        'period_id': locked_period.id,
        'year_month': locked_period.year_month,
        'paid_count': paid_count,
        'failed_count': failed_count,
        'total_paid_amount': total_paid_amount,
        'batch_id': batch_id,
        'tracking_code': tracking_code,
    }
