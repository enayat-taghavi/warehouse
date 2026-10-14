import os
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from communications.models import MessageAttachment


class Command(BaseCommand):
    help = "پاکسازی خودکار فایل‌ها و پیوست‌های پیام‌رسان قدیمی‌تر از تعداد روز مشخص و حفظ Tombstone برای همگام‌سازی آفلاین"

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=180,
            help='تعداد روزهای نگهداری فایل‌ها (پیش‌فرض: ۱۸۰ روز)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='بررسی بدون حذف فیزیکی'
        )
        parser.add_argument(
            '--hard-delete',
            action='store_true',
            help='حذف قطعی ردیف از دیتابیس (هشدار: کلاینت‌های آفلاین از حذف بی‌خبر می‌مانند)'
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        hard_delete = options.get('hard_delete', False)
        cutoff_date = timezone.now() - timedelta(days=days)

        self.stdout.write(self.style.NOTICE(
            f"[INFO] Checking attachments older than {days} days (before {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')})..."
        ))

        # استفاده از all_objects برای شناسایی تمام پیوست‌ها شامل حذف‌نرم‌شده‌ها
        old_attachments = MessageAttachment.all_objects.filter(created_at__lt=cutoff_date)
        total_count = old_attachments.count()

        if total_count == 0:
            self.stdout.write(self.style.SUCCESS("[SUCCESS] No expired attachments found."))
            return

        total_freed_bytes = 0
        deleted_count = 0

        for att in old_attachments:
            file_size = att.file_size or 0
            if att.file and hasattr(att.file, 'path') and os.path.exists(att.file.path):
                try:
                    file_size = os.path.getsize(att.file.path)
                except OSError:
                    pass

            if dry_run:
                self.stdout.write(f"[Dry-run] Ready for deletion: {att.file_name} ({file_size} bytes)")
            else:
                try:
                    if att.file:
                        att.file.delete(save=False)
                    if att.thumbnail:
                        att.thumbnail.delete(save=False)

                    if hard_delete:
                        att.delete()
                    else:
                        # حذف نرم و پاکسازی فیلدهای رسانه جهت حفظ Tombstone برای کلاینت‌های آفلاین
                        att.is_deleted = True
                        att.file = None
                        att.thumbnail = None
                        att.save(update_fields=['is_deleted', 'updated_at', 'file', 'thumbnail'])

                    deleted_count += 1
                    total_freed_bytes += file_size
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"[ERROR] Failed to delete {att.id}: {e}"))

        if dry_run:
            self.stdout.write(self.style.SUCCESS(
                f"[Dry-run] Total {total_count} files identified."
            ))
        else:
            freed_mb = round(total_freed_bytes / (1024 * 1024), 2)
            action_desc = "hard deleted" if hard_delete else "soft-deleted & media purged"
            self.stdout.write(self.style.SUCCESS(
                f"[SUCCESS] Cleanup finished: {deleted_count} files {action_desc}, {freed_mb} MB disk space freed."
            ))
