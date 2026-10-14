"""
Worker سبک خروجی‌های بزرگ گزارش‌ساز — جایگزین پایدار threading.Thread

اجرا در پنجره جدا (مثلاً یک خط در start.bat):
    python manage.py run_export_worker

- هر چرخه نبض خود را در ExportWorkerStatus (DB) ثبت می‌کند؛ وب‌سرور با همان
  نبض تشخیص می‌دهد job را در صف بگذارد یا fallback به Thread کند.
- jobهای «running» با نبض قدیمی‌تر از ORPHAN_MINUTES دقیقه یتیم فرض شده و به
  pending برمی‌گردند (ملاک نبض است نه زمان شروع — خروجی‌های بزرگِ زنده هر
  CHUNK_SIZE ردیف نبض می‌زنند و دوباره پردازش نمی‌شوند).
- برداشتن job با select_for_update(skip_locked=True) — امن برای چند worker.
"""
import time

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from reports.excel import _run_export_job, cleanup_old_jobs
from reports.models import ExportWorkerStatus, ReportExportJob

POLL_SECONDS = 3
ORPHAN_MINUTES = 2
CLEANUP_EVERY_SECONDS = 3600


class Command(BaseCommand):
    help = 'Worker پردازش jobهای خروجی Excel گزارش‌ساز (poll از DB)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(
            f'export worker شروع شد — poll هر {POLL_SECONDS} ثانیه (Ctrl+C برای توقف)'
        ))
        last_cleanup = 0.0
        try:
            while True:
                self._beat()
                self._recover_orphans()

                if time.monotonic() - last_cleanup > CLEANUP_EVERY_SECONDS:
                    cleanup_old_jobs()
                    last_cleanup = time.monotonic()

                job = self._claim()
                if job is None:
                    time.sleep(POLL_SECONDS)
                    continue

                self.stdout.write(f'پردازش job #{job.pk} ({job.report_name}) …')
                # _run_export_job خودش status/heartbeat/خطا را مدیریت می‌کند
                _run_export_job(job.pk, job.owner_id)
                job.refresh_from_db()
                style = self.style.SUCCESS if job.status == 'done' else self.style.ERROR
                self.stdout.write(style(f'job #{job.pk} → {job.status}'))
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING('توقف با Ctrl+C — خداحافظ.'))
        finally:
            connection.close()

    def _beat(self):
        ExportWorkerStatus.objects.update_or_create(
            pk=1, defaults={'alive_at': timezone.now()},
        )

    def _recover_orphans(self):
        cutoff = timezone.now() - timezone.timedelta(minutes=ORPHAN_MINUTES)
        orphans = list(ReportExportJob.objects.filter(
            status='running', heartbeat_at__lt=cutoff,
        ))
        for job in orphans:
            job.attempts += 1
            if job.attempts >= 3:
                job.status = 'failed'
                job.error_message = 'پردازش بیش از حد مجاز متوقف شد (تسک مسموم).'
                job.finished_at = timezone.now()
                job.save(update_fields=['attempts', 'status', 'error_message', 'finished_at'])
                self.stdout.write(self.style.ERROR(f'job #{job.pk} به دلیل رسیدن به سقف تلاش ({job.attempts}) متوقف شد.'))
            else:
                job.status = 'pending'
                job.progress = 0
                job.heartbeat_at = None
                job.save(update_fields=['attempts', 'status', 'progress', 'heartbeat_at'])
                self.stdout.write(self.style.WARNING(f'job #{job.pk} یتیم (تلاش {job.attempts}/3) به صف برگشت.'))

    def _claim(self):
        with transaction.atomic():
            job = (
                ReportExportJob.objects.select_for_update(skip_locked=True)
                .filter(status='pending')
                .order_by('created_at')
                .first()
            )
            if job is None:
                return None
            job.status = 'running'
            job.heartbeat_at = timezone.now()
            job.save(update_fields=['status', 'heartbeat_at'])
            return job
