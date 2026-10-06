import time
import signal
import logging
from datetime import time as dt_time, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction, close_old_connections, models, connection
from django.utils import timezone

from personnel.models import GoogleDriveSyncQueue, CompanyGoogleDriveConfig
from personnel.google_drive_service import sync_single_queue_item

logger = logging.getLogger(__name__)


def is_time_in_range(start_time: dt_time, end_time: dt_time, current_time: dt_time) -> bool:
    """
    بررسی قرار داشتن ساعت جاری سرور در بازه مجاز با پشتیبانی کامل از عبور از نیمه‌شب
    مثال: ۲۳:۰۰ تا ۰۶:۰۰ بامداد
    """
    if start_time <= end_time:
        return start_time <= current_time <= end_time
    else:
        # بازه عبورکننده از نیمه‌شب (overnight span)
        return current_time >= start_time or current_time <= end_time


def _ensure_time(val, default_time: dt_time) -> dt_time:
    """اطمینان از تبدیل مقدار ساعت به شیء dt_time چه به صورت رشته و چه شیء زمان"""
    if isinstance(val, dt_time):
        return val
    if isinstance(val, str):
        try:
            parts = [int(p) for p in val.split(':')]
            if len(parts) >= 2:
                return dt_time(parts[0], parts[1], parts[2] if len(parts) > 2 else 0)
        except Exception:
            pass
    return default_time


def is_company_eligible_for_sync(config: CompanyGoogleDriveConfig, ignore_schedule: bool = False) -> tuple[bool, str]:
    """
    بررسی صلاحیت شرکت برای اجرای همگام‌سازی در لحظه جاری بر اساس سیاست زمان‌بندی
    """
    if not config or not config.is_enabled or not config.refresh_token:
        return False, "سرویس گوگل‌درایو شرکت غیرفعال یا فاقد توکن اتصال است"

    if ignore_schedule:
        return True, "ارسال اجباری / دستور مستقیم مدیر (Ignore Schedule)"

    if config.force_sync_until and config.force_sync_until > timezone.now():
        return True, "همگام‌سازی اجباری موقت فعال است (Force Sync Window)"

    if config.sync_mode == 'immediate':
        return True, "حالت همگام‌سازی آنی (Immediate)"

    if config.sync_mode == 'manual':
        return False, "حالت فقط دستی (Manual) - نیازمند تایید مستقیم کاربر در پنل"

    if config.sync_mode == 'scheduled':
        now_time = timezone.localtime().time()
        start = _ensure_time(config.scheduled_start_time, dt_time(23, 0))
        end = _ensure_time(config.scheduled_end_time, dt_time(6, 0))
        if is_time_in_range(start, end, now_time):
            return True, f"در بازه مجاز ساعات خلوتی شبکه ({start.strftime('%H:%M')} تا {end.strftime('%H:%M')})"
        else:
            return False, f"خارج از بازه ساعات خلوتی شبکه ({start.strftime('%H:%M')} تا {end.strftime('%H:%M')})"

    return True, "حالت پیش‌فرض"


class Command(BaseCommand):
    help = "اجرای ورکر پس‌زمینه همگام‌سازی فایل‌ها با گوگل‌درایو شرکت‌ها (Google Drive Sync Worker)"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.keep_running = True

    def add_arguments(self, parser):
        parser.add_argument(
            '--once',
            action='store_true',
            help='پردازش صف موجود یک‌بار و خروج (مناسب برای کران‌جاب یا تست)'
        )
        parser.add_argument(
            '--interval',
            type=int,
            default=10,
            help='فاصله زمانی بررسی مجدد صف بر حسب ثانیه در حالت دائمی (پیش‌فرض: ۱۰ ثانیه)'
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=20,
            help='حداکثر تعداد تسک‌ها در هر دور پردازش (پیش‌فرض: ۲۰)'
        )
        parser.add_argument(
            '--company-id',
            type=int,
            default=None,
            help='فیلتر بر اساس شناسه یک شرکت خاص'
        )
        parser.add_argument(
            '--ignore-schedule',
            action='store_true',
            help='نادیده‌گرفتن بازه زمانی ساعات خلوتی و ارسال فوری تسک‌ها'
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
        company_id = options.get('company_id')
        ignore_schedule = options.get('ignore_schedule', False)

        # ثبت مدیریت سیگنال‌های توقف نرم
        def _stop_signal(signum, frame):
            self._log("\nدرخواست توقف ورکر دریافت شد. در حال اتمام وظایف جاری...", self.style.WARNING)
            self.keep_running = False

        signal.signal(signal.SIGINT, _stop_signal)
        signal.signal(signal.SIGTERM, _stop_signal)

        self._log(
            f"=== شروع به کار ورکر گوگل‌درایو شرکت‌ها (Once={once}, Interval={interval}s, Limit={limit}, IgnoreSchedule={ignore_schedule}) ===",
            self.style.SUCCESS
        )

        while self.keep_running:
            try:
                if not connection.in_atomic_block:
                    close_old_connections()
            except Exception:
                pass

            processed = 0
            try:
                processed = self.process_batch(limit=limit, company_id=company_id, ignore_schedule=ignore_schedule)
            except Exception as loop_exc:
                logger.error(f"[Company GDrive Worker] Error during process_batch: {loop_exc}", exc_info=True)
                self._log(f"[Company GDrive Worker] خطا در پردازش دسته: {loop_exc}", self.style.ERROR)

            if once:
                self._log(f"پردازش صف با موفقیت پایان یافت. مجموع تسک‌های پردازش‌شده: {processed}", self.style.SUCCESS)
                break

            if processed == 0:
                time.sleep(interval)
            else:
                # اگر تسکی پردازش شد، بلافاصله دور بعدی را بررسی کن تا صف سریع تخلیه شود
                time.sleep(1)

    def process_batch(self, limit: int = 20, company_id: int = None, ignore_schedule: bool = False) -> int:
        """
        برداشتن امن تسک‌های صف با قفل ردیف و پردازش آن‌ها با رعایت سیاست‌های زمان‌بندی و تاخیر چانک
        """
        # ۰. بازیابی تسک‌های رها شده در وضعیت processing بیش از ۳۰ دقیقه (Zombies - GD-07)
        cutoff = timezone.now() - timedelta(minutes=30)
        try:
            recovered = GoogleDriveSyncQueue.objects.filter(
                status='processing',
                updated_at__lt=cutoff
            ).update(status='pending', updated_at=timezone.now())
            if recovered > 0:
                logger.warning(f"[Company GDrive Worker] Recovered {recovered} zombie tasks back to pending.")
        except Exception as z_exc:
            logger.debug(f"[Company GDrive Worker] Zombie recovery error: {z_exc}")

        # ۱. تعیین شرکت‌های واجد شرایط در این لحظه
        config_qs = CompanyGoogleDriveConfig.objects.filter(
            is_enabled=True,
            refresh_token__isnull=False
        ).exclude(refresh_token='')

        if company_id:
            config_qs = config_qs.filter(company_id=company_id)

        eligible_company_ids = []
        company_delay_map = {}

        for cfg in config_qs:
            eligible, reason = is_company_eligible_for_sync(cfg, ignore_schedule=ignore_schedule)
            if eligible:
                eligible_company_ids.append(cfg.company_id)
                company_delay_map[cfg.company_id] = cfg.chunk_delay_seconds if cfg.chunk_delay_seconds is not None else 1
            else:
                logger.debug(f"[GDDrive Worker] Company #{cfg.company_id} ({cfg.company.name}) skipped: {reason}")

        if not eligible_company_ids:
            return 0

        candidate_ids = []
        task_company_map = {}

        # ۲. انتخاب تسک‌های در انتظار ارسال با ترتیب اولویت و تاریخ
        # نکته: وضعیت به processing در خود sync_single_queue_item به طور اتمیک تغییر می‌یابد (GD-06)
        with transaction.atomic():
            qs = GoogleDriveSyncQueue.objects.select_for_update(skip_locked=True).filter(
                company_id__in=eligible_company_ids,
                status='pending',
                retry_count__lt=5
            ).filter(
                models.Q(next_retry_at__isnull=True) | models.Q(next_retry_at__lte=timezone.now())
            ).order_by('priority', 'created_at')

            candidate_tasks = list(qs[:limit])
            for t in candidate_tasks:
                candidate_ids.append(t.id)
                task_company_map[t.id] = t.company_id

        if not candidate_ids:
            return 0

        self._log(f"در حال پردازش {len(candidate_ids)} تسک همگام‌سازی...")
        success_count = 0

        for task_id in candidate_ids:
            if not self.keep_running:
                break

            try:
                ok = sync_single_queue_item(task_id)
                if ok:
                    success_count += 1
                    self._log(f"  [✓] تسک #{task_id} با موفقیت همگام شد.", self.style.SUCCESS)
                else:
                    self._log(f"  [!] تسک #{task_id} ناموفق بود.", self.style.WARNING)
            except Exception as exc:
                self._log(f"  [✗] خطا در اجرای تسک #{task_id}: {exc}", self.style.ERROR)

            # اعمال مکث تاخیر بین چانک‌ها جهت جلوگیری از اشغال ۱۰۰ درصدی پهنای باند آپلود
            cid = task_company_map.get(task_id)
            delay = company_delay_map.get(cid, 1)
            if delay > 0 and self.keep_running:
                time.sleep(delay)

        return len(candidate_ids)

