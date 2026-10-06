import time
import signal
import logging
from datetime import time as dt_time, datetime
from django.core.management.base import BaseCommand
from django.db import transaction
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

    def handle(self, *args, **options):
        once = options['once']
        interval = options['interval']
        limit = options['limit']
        ignore_schedule = options.get('ignore_schedule', False)
        company_id = options.get('company_id')

        def _stop_signal(signum, frame):
            self.stdout.write(self.style.WARNING("\nدرخواست توقف ورکر دریافت شد. در حال تکمیل و خروج..."))
            self.keep_running = False

        signal.signal(signal.SIGINT, _stop_signal)
        signal.signal(signal.SIGTERM, _stop_signal)

        self.stdout.write(self.style.SUCCESS(
            f"=== شروع به کار ورکر مرکزی گوگل‌درایو (Once={once}, Interval={interval}s, Limit={limit}) ==="
        ))

        while self.keep_running:
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
                self.stdout.write(self.style.SUCCESS(f"پردازش پایان یافت. مجموع تسک‌های انجام‌شده: {total_processed}"))
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
                SystemGoogleDriveConfig.objects.filter(id=1).update(worker_heartbeat_at=timezone.now())
                self.last_heartbeat_time = now_ts
            except Exception as exc:
                logger.debug(f"[Worker] Heartbeat update failed: {exc}")

    def process_system_tasks(self, limit: int = 10) -> int:
        """برداشتن و ارسال تسک‌های در انتظار ارسال درایو سامانه"""
        config = SystemGoogleDriveConfig.objects.filter(id=1, is_enabled=True).first()
        if not config or not config.refresh_token:
            return 0

        candidate_ids = []
        with transaction.atomic():
            tasks = list(
                SystemDriveUploadTask.objects.select_for_update(skip_locked=True)
                .filter(status='pending', retry_count__lt=5)
                .order_by('priority', 'created_at')[:limit]
            )
            for t in tasks:
                candidate_ids.append(t.id)

            if candidate_ids:
                SystemDriveUploadTask.objects.filter(id__in=candidate_ids).update(
                    status='processing',
                    updated_at=timezone.now()
                )

        if not candidate_ids:
            return 0

        self.stdout.write(f"[System GDrive] در حال ارسال {len(candidate_ids)} تسک پشتیبان سامانه...")
        success = 0
        for tid in candidate_ids:
            if not self.keep_running:
                break
            ok = sync_single_system_task(tid)
            if ok:
                success += 1
                self.stdout.write(self.style.SUCCESS(f"  [✓] پشتیبان سامانه #{tid} با موفقیت ارسال شد."))
            else:
                self.stdout.write(self.style.WARNING(f"  [!] ارسال پشتیبان سامانه #{tid} ناموفق بود."))

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
