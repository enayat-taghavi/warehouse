"""
زمان‌بند حلقه‌ای گردش کار (ت۱۲ طرح ۲.۳)، به الگوی run_gdrive_sync_worker: یادآوری، خبر به بالاتر، شروع و پایان
بازهٔ جانشینی و هم‌سان‌سازی دوره‌ای. خطای هر دور ثبت می‌شود و حلقه هرگز با خطا بیرون نمی‌رود.
"""
import logging
import signal
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections, connection

from workflow.scheduler import DEFAULT_RECONCILE_MINUTES, run_tick

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'زمان‌بند گردش کار: یادآوری، خبر به بالاتر، رویدادهای بازهٔ جانشینی و هم‌سان‌سازی کارهای باز'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.keep_running = True

    def add_arguments(self, parser):
        parser.add_argument('--interval', type=int, default=300,
                            help='فاصلهٔ دو دور به ثانیه (پیش‌فرض ۳۰۰)')
        parser.add_argument('--once', action='store_true',
                            help='فقط یک دور اجرا و خروج (برای تست یا cron)')
        parser.add_argument('--reconcile-minutes', type=int, default=DEFAULT_RECONCILE_MINUTES,
                            help='کمترین فاصلهٔ دو هم‌سان‌سازی همهٔ کارهای باز به دقیقه (پیش‌فرض ۶۰)')

    def _log(self, msg):
        try:
            self.stdout.write(msg)
        except Exception:
            try:
                self.stdout.write(msg.encode('ascii', errors='replace').decode('ascii'))
            except Exception:
                pass

    def handle(self, *args, **options):
        once = options['once']
        interval = max(int(options['interval']), 1)
        reconcile_minutes = max(int(options['reconcile_minutes']), 0)

        def _stop(signum, frame):
            self._log('Shutdown signal received. Exiting gracefully...')
            self.keep_running = False

        try:
            signal.signal(signal.SIGINT, _stop)
            signal.signal(signal.SIGTERM, _stop)
        except ValueError:
            # خارج از نخ اصلی (مثلاً call_command در تست) سیگنال ثبت نمی‌شود
            pass

        self._log(f'=== Workflow scheduler (once={once}, interval={interval}s, '
                  f'reconcile={reconcile_minutes}min) ===')
        last_reconciled_at = None
        while self.keep_running:
            try:
                if not connection.in_atomic_block:
                    close_old_connections()
            except Exception:
                pass
            try:
                stats = run_tick(last_reconciled_at=last_reconciled_at, reconcile_minutes=reconcile_minutes)
                last_reconciled_at = stats.get('reconciled_at')
                self._log(
                    f"[workflow scheduler] reminders={stats['reminders']} escalations={stats['escalations']} "
                    f"(superusers={stats['escalations_to_superusers']}) "
                    f"substitutes started={stats['substitutes_started']} ended={stats['substitutes_ended']} "
                    f"reconciled={'yes' if stats['reconciled'] is not None else 'no'} errors={stats['errors']}")
            except Exception as exc:
                logger.error('[workflow scheduler] tick failed: %s', exc, exc_info=True)
            if once:
                break
            slept = 0
            while self.keep_running and slept < interval:
                time.sleep(1)
                slept += 1
