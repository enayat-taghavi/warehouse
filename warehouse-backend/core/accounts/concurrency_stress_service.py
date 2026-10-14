"""
سرویس سنجش همروندی، تست استرس و تاب‌آوری در برابر بن‌بست دیتابیس
(High-Concurrency Stress & Deadlock Resistance Service)

اهداف و استانداردها:
۱. شبیه‌سازی دقیق رقابت همزمان ده‌ها/صدها تراکنش موازی روی رکوردهای مشترک
۲. ارزیابی مکانیزم select_for_update() و transaction.atomic()
۳. اثبات عدم بروز بن‌بست (Zero Deadlock Guarantee)
۴. جلوگیری قطعی از خطای Double-Spend / Double-Claim در کارتابل‌ها و کسر موجودی انبار
۵. ایزولاسیون کامل و پاکسازی ۱۰۰٪ رکوردهای پروب تستی پس از پایان عملیات
"""

import time
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from django.db import transaction, connection
from django.utils import timezone
try:
    import jdatetime
except ImportError:
    jdatetime = None
from accounts.models import CustomUser, SoDPolicyRule, AuditLog
from accounts.audit_utils import log_audit_event

logger = logging.getLogger(__name__)


class ConcurrencyStressService:
    """
    موتور شبیه‌سازی تست فشار و همروندی تراکنش‌ها
    """

    @classmethod
    def run_stress_test(cls, user=None, concurrency_level=30, scenario='combined'):
        """
        اجرای تست فشار موازی با سطح همروندی مشخص (پیش‌فرض ۳۰، قابل تنظیم ۵۰ یا ۱۰۰)
        """
        concurrency_level = int(concurrency_level)
        if concurrency_level not in [20, 30, 50, 100]:
            concurrency_level = 30

        scenario = scenario if scenario in ['combined', 'treasury', 'warehouse'] else 'combined'
        test_session_id = f"stress_{uuid.uuid4().hex[:8]}"
        start_time_total = time.time()

        # رکوردهای پروب آزمایشی
        probe_treasury_rule = None
        probe_warehouse_rule = None

        try:
            # ۱. ایجاد رکوردهای آزمایشی پروب در محیط ایزوله
            probe_treasury_rule = SoDPolicyRule.objects.create(
                app_module='personnel',
                role_code=f"probe_treasury_{test_session_id}",
                role_title_fa='پروب آزمایشی تسویه خزانه‌داری',
                page_route=f"/probe/treasury/{test_session_id}",
                action_code='DISBURSE_PAYMENT',
                action_title_fa='تایید و تسویه واریز حقوق',
                is_prohibited=False,
                prohibition_reason_fa='READY_TO_PAY'  # وضعیت اولیه: آماده پرداخت
            )

            probe_warehouse_rule = SoDPolicyRule.objects.create(
                app_module='warehouse',
                role_code=f"probe_warehouse_{test_session_id}",
                role_title_fa='پروب آزمایشی موجودی انبار',
                page_route=f"/probe/warehouse/{test_session_id}",
                action_code='DECREMENT_STOCK',
                action_title_fa='کسر موجودی حواله انبار',
                is_prohibited=False,
                prohibition_reason_fa='100'  # مقدار اولیه موجودی پروب: ۱۰۰ واحد
            )

            latencies = []
            treasury_paid_count = 0
            treasury_blocked_count = 0
            deadlock_errors = 0
            other_errors = 0
            success_count = 0

            # ۲. تابع کارگر تستی خزانه‌داری (Treasury Single-Winner Claim Simulation)
            def worker_treasury_task(worker_id):
                nonlocal treasury_paid_count, treasury_blocked_count, deadlock_errors, other_errors
                t0 = time.time()
                try:
                    # اتصال اختصاصی ترد به دیتابیس
                    with transaction.atomic():
                        # قفل بدبینانه روی رکورد
                        row = SoDPolicyRule.objects.select_for_update().get(id=probe_treasury_rule.id)
                        # تاخیر میلی‌ثانیه‌ای واقعی جهت شبیه‌سازی محاسبات و همروندی بالا
                        time.sleep(0.005)
                        if row.prohibition_reason_fa == 'READY_TO_PAY':
                            row.prohibition_reason_fa = f'PAID_BY_WORKER_{worker_id}'
                            row.save(update_fields=['prohibition_reason_fa'])
                            claimed = True
                        else:
                            claimed = False

                    latency = round((time.time() - t0) * 1000, 2)
                    return {'worker_id': worker_id, 'type': 'treasury', 'claimed': claimed, 'latency_ms': latency, 'error': None}
                except Exception as ex:
                    latency = round((time.time() - t0) * 1000, 2)
                    is_deadlock = 'deadlock' in str(ex).lower() or 'lock' in str(ex).lower()
                    return {'worker_id': worker_id, 'type': 'treasury', 'claimed': False, 'latency_ms': latency, 'error': str(ex), 'is_deadlock': is_deadlock}
                finally:
                    connection.close()

            # ۳. تابع کارگر تستی انبارداری (Warehouse Atomic Stock Decrement Simulation)
            def worker_warehouse_task(worker_id):
                t0 = time.time()
                try:
                    with transaction.atomic():
                        row = SoDPolicyRule.objects.select_for_update().get(id=probe_warehouse_rule.id)
                        current_val = int(row.prohibition_reason_fa or '0')
                        time.sleep(0.003)
                        row.prohibition_reason_fa = str(current_val - 1)
                        row.save(update_fields=['prohibition_reason_fa'])

                    latency = round((time.time() - t0) * 1000, 2)
                    return {'worker_id': worker_id, 'type': 'warehouse', 'success': True, 'latency_ms': latency, 'error': None}
                except Exception as ex:
                    latency = round((time.time() - t0) * 1000, 2)
                    is_deadlock = 'deadlock' in str(ex).lower() or 'lock' in str(ex).lower()
                    return {'worker_id': worker_id, 'type': 'warehouse', 'success': False, 'latency_ms': latency, 'error': str(ex), 'is_deadlock': is_deadlock}
                finally:
                    connection.close()

            # ۴. اجرای استرس‌تست در ThreadPoolExecutor با همروندی بالا
            treasury_workers = concurrency_level if scenario in ['combined', 'treasury'] else 0
            warehouse_workers = concurrency_level if scenario in ['combined', 'warehouse'] else 0
            total_planned = treasury_workers + warehouse_workers

            tasks = []
            with ThreadPoolExecutor(max_workers=min(64, total_planned)) as executor:
                for i in range(treasury_workers):
                    tasks.append(executor.submit(worker_treasury_task, i + 1))
                for j in range(warehouse_workers):
                    tasks.append(executor.submit(worker_warehouse_task, j + 1))

                for future in as_completed(tasks):
                    res = future.result()
                    latencies.append(res['latency_ms'])
                    if res.get('error'):
                        if res.get('is_deadlock'):
                            deadlock_errors += 1
                        else:
                            other_errors += 1
                    else:
                        success_count += 1
                        if res.get('type') == 'treasury':
                            if res.get('claimed'):
                                treasury_paid_count += 1
                            else:
                                treasury_blocked_count += 1

            # ۵. اعتبارسنجی یکپارچگی داده‌ها (Data Integrity Verification)
            # وضعیت خزانه‌داری: دقیقاً یک پرداخت موفق و بقیه بلاک شده بدون خطا
            double_spend_prevented = (treasury_paid_count == 1) if treasury_workers > 0 else True

            # وضعیت انبارداری: دقیقاً به تعداد کارگرها کسر شده بدون از دست رفتن ترنزکشن
            probe_warehouse_rule.refresh_from_db()
            final_stock = int(probe_warehouse_rule.prohibition_reason_fa or '0')
            expected_stock = 100 - warehouse_workers
            inventory_integrity_verified = (final_stock == expected_stock) if warehouse_workers > 0 else True

            duration_total = round(time.time() - start_time_total, 3)
            avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0
            min_latency = min(latencies) if latencies else 0
            max_latency = max(latencies) if latencies else 0
            sorted_lat = sorted(latencies)
            p95_index = int(len(sorted_lat) * 0.95)
            p95_latency = sorted_lat[p95_index] if sorted_lat else 0

            deadlock_free = (deadlock_errors == 0)
            overall_success = deadlock_free and double_spend_prevented and inventory_integrity_verified

            report = {
                'status': 'passed' if overall_success else 'failed',
                'test_session_id': test_session_id,
                'scenario': scenario,
                'concurrency_level': concurrency_level,
                'total_transactions': total_planned,
                'successful_transactions': success_count,
                'failed_transactions': other_errors + deadlock_errors,
                'deadlock_count': deadlock_errors,
                'deadlock_free': deadlock_free,
                'double_spend_prevented': double_spend_prevented,
                'inventory_integrity_verified': inventory_integrity_verified,
                'treasury_winner_count': treasury_paid_count,
                'treasury_serialized_count': treasury_blocked_count,
                'initial_stock': 100,
                'final_stock': final_stock,
                'expected_stock': expected_stock,
                'latency': {
                    'min_ms': min_latency,
                    'avg_ms': avg_latency,
                    'max_ms': max_latency,
                    'p95_ms': p95_latency,
                },
                'duration_seconds': duration_total,
                'timestamp': timezone.now().isoformat(),
                'server_time': (
                    jdatetime.datetime.fromgregorian(datetime=timezone.localtime(timezone.now())).strftime('%Y/%m/%d %H:%M:%S')
                    if jdatetime is not None
                    else timezone.localtime(timezone.now()).strftime('%Y/%m/%d %H:%M:%S')
                ),
            }

            # ۶. ثبت رویداد در لاگ ممیزی امنیتی سیستم
            if user and hasattr(user, 'is_authenticated') and user.is_authenticated:
                log_audit_event(
                    user=user,
                    module='security',
                    action='EXECUTE',
                    severity='info',
                    target_repr='سوئیت تست فشار همروندی و بن‌بست دیتابیس',
                    details={
                        'description': f"اجرای تست همروندی {total_planned} تراکنش موازی (سناریو: {scenario}) - Zero Deadlock: {deadlock_free}",
                        'report': report
                    }
                )

            return report

        finally:
            # ۷. پاکسازی ۱۰۰٪ ایزوله رکوردهای پروب تستی
            try:
                if probe_treasury_rule and probe_treasury_rule.id:
                    SoDPolicyRule.objects.filter(id=probe_treasury_rule.id).delete()
                if probe_warehouse_rule and probe_warehouse_rule.id:
                    SoDPolicyRule.objects.filter(id=probe_warehouse_rule.id).delete()
            except Exception as clean_err:
                logger.warning(f"[StressTest] Cleanup probe error: {clean_err}")
