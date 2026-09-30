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
    def get_pending_treasury_batches(cls, company_ids: Optional[List[int]] = None) -> Dict[str, Any]:
        """
        دریافت کلیه اسناد مالی آماده پرداخت (Ready to Pay) به تفکیک حقوق و ناوگان
        با پشتیبانی از فیلتر چندشرکتی (Multi-tenant Company Scoping)
        """
        # دوره‌های حقوق تایید شده توسط مدیر
        ready_periods = MonthlyWorkPeriod.objects.filter(
            status__in=[WorkflowStatuses.PERIOD_READY_TO_PAY, 'READY_TO_PAY']
        ).order_by('-year_month')

        # لیست حقوق‌های منفرد آماده پرداخت
        ready_payrolls = MonthlyPayrollRecord.objects.filter(
            payment_status__in=[WorkflowStatuses.PAYROLL_READY_TO_PAY, 'READY_TO_PAY']
        ).select_related('personnel', 'period')

        # تسویه‌های ناوگان آماده پرداخت
        ready_trips = VehicleTripLog.objects.filter(
            is_settled=False,
            vehicle__approval_status__in=[WorkflowStatuses.APPROVED, 'approved']
        ).select_related('vehicle')

        if company_ids is not None:
            if len(company_ids) == 0:
                ready_periods = ready_periods.none()
                ready_payrolls = ready_payrolls.none()
                ready_trips = ready_trips.none()
            else:
                ready_periods = ready_periods.filter(company_id__in=company_ids)
                ready_payrolls = ready_payrolls.filter(
                    Q(period__company_id__in=company_ids) | Q(personnel__company_id__in=company_ids)
                )
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
    @transaction.atomic
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
        تسویه گروهی و اتمیک کل دوره حقوق ماهانه توسط خزانه‌داری
        """
        cls._verify_treasury_access(treasury_user)

        if not tracking_code or not str(tracking_code).strip():
            raise ValidationError("ثبت کد رهگیری بانکی برای تایید پرداخت الزامی است.")

        # قفل سطری دوره
        locked_period = MonthlyWorkPeriod.objects.select_for_update().get(pk=period.pk)
        if locked_period.status not in [WorkflowStatuses.PERIOD_READY_TO_PAY, 'READY_TO_PAY']:
            raise ValidationError(f"دوره مالی در وضعیت مجاز جهت پرداخت خزانه‌داری نیست (وضعیت جاری: {locked_period.status}).")

        # قفل سطری رکوردهای حقوق دوره
        records = MonthlyPayrollRecord.objects.select_for_update().filter(
            period=locked_period,
            include_in_bank=True
        ).select_related('personnel')

        paid_count = 0
        failed_count = 0
        total_paid_amount = 0

        now = timezone.now()

        for rec in records:
            sheba = getattr(rec.personnel, 'sheba_number', None)
            is_valid_sheba = False
            if sheba:
                is_valid_sheba, _, _ = validate_sheba(sheba)

            if not is_valid_sheba and (rec.payable_amount or 0) > 0:
                # جداسازی خطای شبا بدون متوقف کردن کل دسته (Isolated Failure)
                record_isolated_sheba_failure(
                    rec,
                    treasury_user,
                    failure_reason="شماره شبا نامعتبر یا ثبت‌نشده است."
                )
                failed_count += 1
            else:
                rec.payment_status = WorkflowStatuses.PAYROLL_PAID
                rec.paid_at = now
                rec.paid_by = treasury_user
                rec.payment_tracking_code = tracking_code
                rec.payment_batch_id = batch_id
                rec.save(update_fields=[
                    'payment_status', 'paid_at', 'paid_by',
                    'payment_tracking_code', 'payment_batch_id', 'updated_at'
                ])
                try:
                    from .models import emit_accounting_event
                    emit_accounting_event(
                        source_instance=rec,
                        event_type='PAYROLL_PAID',
                        occurred_at=now,
                        payload={'tracking_code': tracking_code, 'batch_id': batch_id, 'treasury_user': treasury_user.username}
                    )
                except Exception as ex:
                    logger.warning(f"[TreasuryOutbox] Error emitting event for record {rec.pk}: {ex}")
                paid_count += 1
                total_paid_amount += int(round(rec.payable_amount or 0))

        # به‌روزرسانی نهایی دوره
        locked_period.status = WorkflowStatuses.PERIOD_PAID
        locked_period.treasury_paid_at = now
        locked_period.treasury_paid_by = treasury_user
        locked_period.payment_tracking_code = tracking_code
        locked_period.payment_batch_id = batch_id
        locked_period.save(update_fields=[
            'status', 'treasury_paid_at', 'treasury_paid_by',
            'payment_tracking_code', 'payment_batch_id', 'updated_at'
        ])
        try:
            from .models import emit_accounting_event
            emit_accounting_event(
                source_instance=locked_period,
                event_type='PERIOD_PAYROLL_FINALIZED',
                occurred_at=now,
                payload={'tracking_code': tracking_code, 'batch_id': batch_id, 'total_paid_amount': total_paid_amount, 'paid_count': paid_count}
            )
        except Exception as ex:
            logger.warning(f"[TreasuryOutbox] Error emitting period event for {locked_period.pk}: {ex}")

        logger.info(
            f"[TREASURY] Period {locked_period.year_month} disbursed by {treasury_user.username}. "
            f"Paid: {paid_count}, Failed Sheba: {failed_count}, Total: {total_paid_amount} Rials."
        )

        return {
            'period_id': period.id,
            'year_month': period.year_month,
            'paid_count': paid_count,
            'failed_count': failed_count,
            'total_paid_amount': total_paid_amount,
            'batch_id': batch_id,
            'tracking_code': tracking_code,
        }

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
        تسویه منفرد یک رکورد حقوق (مثلاً پس از اصلاح شماره شبا)
        """
        cls._verify_treasury_access(treasury_user)

        if not tracking_code or not str(tracking_code).strip():
            raise ValidationError("کد رهگیری بانکی الزامی است.")

        locked_rec = MonthlyPayrollRecord.objects.select_for_update().select_related('personnel').get(pk=record.pk)

        sheba = getattr(locked_rec.personnel, 'sheba_number', None)
        if sheba:
            is_valid, err_msg, _ = validate_sheba(sheba)
            if not is_valid:
                raise ValidationError(f"شماره شبا نامعتبر است: {err_msg}")

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
