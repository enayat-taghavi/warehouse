import time
import signal
import logging
from datetime import time as dt_time, datetime, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction, close_old_connections, models, connection
from django.utils import timezone

from settings_core.models import SystemGoogleDriveConfig, SystemDriveUploadTask
from settings_core.google_drive_service import sync_single_system_task
from settings_core.google_drive_client import get_gdrive_target_handler

logger = logging.getLogger(__name__)


def is_time_in_range(start_time: dt_time, end_time: dt_time, current_time: dt_time) -> bool:
    """
    بررسی قرار داشتن ساعت جاری سرور در بازه مجاز با پشتیبانی از عبور از نیمه‌شب
    """
    if start_time <= end_time:
        return start_time <= current_time <= end_time
    else:
        return current_time >= start_time or current_time <= end_time


class Command(BaseCommand):
    help = "ورکر مرکزی همگام‌سازی فایل‌ها و پشتیبان‌ها با گوگل‌درایو (System & Company GDrive Worker)"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.keep_running = True
        self.last_heartbeat_time = 0

    def add_arguments(self, parser):
        parser.add_argument(
            '--once',
            action='store_true',
            help='پردازش صف‌های موجود یک‌بار و خروج (مناسب تست یا کران‌جاب)'
        )
        parser.add_argument(
            '--interval',
            type=int,
            default=5,
            help='فاصله بررسی مجدد صف‌ها بر حسب ثانیه (پیش‌فرض: ۵ ثانیه)'
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=20,
            help='حداکثر تعداد تسک‌ها در هر دور'
        )
        parser.add_argument(
            '--ignore-schedule',
            action='store_true',
            help='نادیده‌گرفتن بازه ساعات خلوتی و ارسال فوری'
        )
        parser.add_argument(
            '--company-id',
            type=int,
            default=None,
            help='فیلتر برای پردازش فقط یک شرکت خاص'
        )

    def _log(self, msg, style_func=None):
        try:
            self.stdout.write(style_func(msg) if style_func else msg)
        except (UnicodeEncodeError, Exception):
            try:
                safe = msg.encode('ascii', errors='replace').decode('ascii')
                self.stdout.write(style_func(safe) if style_func else safe)
            except Exception:
                pass

    def handle(self, *args, **options):
        once = options['once']
        interval = options['interval']
        limit = options['limit']
        ignore_schedule = options.get('ignore_schedule', False)
        company_id = options.get('company_id')

        def _stop_signal(signum, frame):
            self._log("\nدرخواست توقف ورکر دریافت شد. در حال تکمیل و خروج...", self.style.WARNING)
            self.keep_running = False

        signal.signal(signal.SIGINT, _stop_signal)
        signal.signal(signal.SIGTERM, _stop_signal)

        self._log(
            f"=== شروع به کار ورکر مرکزی گوگل‌درایو (Once={once}, Interval={interval}s, Limit={limit}) ===",
            self.style.SUCCESS
        )

        while self.keep_running:
            try:
                if not connection.in_atomic_block:
                    close_old_connections()
            except Exception:
                pass

            self._update_heartbeat()
            total_processed = 0

            # ۱. پردازش تسک‌های درایو سراسری سامانه (پشتیبان‌های سرور)
            try:
                system_processed = self.process_system_tasks(limit=limit)
                total_processed += system_processed
            except Exception as exc:
                logger.error(f"[Worker] Error processing system tasks: {exc}", exc_info=True)

            # ۲. پردازش صف‌های شرکتی در صورت ثبت پردازشگر توسط ماژول حسابداری
            try:
                company_processed = self.process_company_tasks(
                    limit=limit,
                    ignore_schedule=ignore_schedule,
                    company_id=company_id
                )
                total_processed += company_processed
            except Exception as exc:
                logger.error(f"[Worker] Error processing company tasks: {exc}", exc_info=True)

            if once:
                self._log(f"پردازش پایان یافت. مجموع تسک‌های انجام‌شده: {total_processed}", self.style.SUCCESS)
                break

            if total_processed == 0:
                time.sleep(interval)
            else:
                time.sleep(1)

    def _update_heartbeat(self):
        """ثبت ضربان حیات ورکر حداکثر هر ۶۰ ثانیه یک‌بار بر روی مدل تنظیمات سامانه"""
        now_ts = time.time()
        if now_ts - self.last_heartbeat_time >= 60:
            try:
                updated = SystemGoogleDriveConfig.objects.filter(id=1).update(worker_heartbeat_at=timezone.now())
                if updated == 0:
                    SystemGoogleDriveConfig.get_solo()
                    SystemGoogleDriveConfig.objects.filter(id=1).update(worker_heartbeat_at=timezone.now())
                self.last_heartbeat_time = now_ts
            except Exception as exc:
                logger.debug(f"[Worker] Heartbeat update failed: {exc}")

    def process_system_tasks(self, limit: int = 10) -> int:
        """برداشتن و ارسال تسک‌های در انتظار ارسال درایو سامانه"""
        config = SystemGoogleDriveConfig.objects.filter(id=1, is_enabled=True).first()
        if not config or not config.refresh_token:
            return 0

        # بازیابی تسک‌های رها شده در وضعیت processing بیش از ۳۰ دقیقه (Zombies)
        cutoff = timezone.now() - timedelta(minutes=30)
        try:
            recovered = SystemDriveUploadTask.objects.filter(
                status='processing',
                updated_at__lt=cutoff
            ).update(status='pending', updated_at=timezone.now())
            if recovered > 0:
                logger.warning(f"[Worker] Recovered {recovered} zombie system tasks back to pending.")
        except Exception as z_exc:
            logger.debug(f"[Worker] Zombie recovery error: {z_exc}")

        candidate_ids = []
        with transaction.atomic():
            tasks = list(
                SystemDriveUploadTask.objects.select_for_update(skip_locked=True)
                .filter(status='pending', retry_count__lt=5)
                .filter(models.Q(next_retry_at__isnull=True) | models.Q(next_retry_at__lte=timezone.now()))
                .order_by('priority', 'created_at')[:limit]
            )
            for t in tasks:
                candidate_ids.append(t.id)

        if not candidate_ids:
            return 0

        self._log(f"[System GDrive] در حال ارسال {len(candidate_ids)} تسک پشتیبان سامانه...")
        success = 0
        for tid in candidate_ids:
            if not self.keep_running:
                break
            ok = sync_single_system_task(tid)
            if ok:
                success += 1
                self._log(f"  [✓] پشتیبان سامانه #{tid} با موفقیت ارسال شد.", self.style.SUCCESS)
            else:
                self._log(f"  [!] ارسال پشتیبان سامانه #{tid} ناموفق بود.", self.style.WARNING)

        return len(candidate_ids)

    def process_company_tasks(self, limit: int = 20, ignore_schedule: bool = False, company_id: int = None) -> int:
        """پردازش صف شرکت‌ها از طریق رجیستری در صورت فعال بودن ماژول حسابداری"""
        handler_info = get_gdrive_target_handler('company')
        if handler_info and handler_info.get('batch_runner'):
            try:
                return handler_info['batch_runner'](
                    limit=limit,
                    ignore_schedule=ignore_schedule,
                    company_id=company_id
                )
            except Exception as exc:
                logger.error(f"[Worker] Error in registered company batch runner: {exc}")
                return 0
        return 0
