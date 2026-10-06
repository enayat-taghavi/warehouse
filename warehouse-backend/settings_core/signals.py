import logging
from django.apps import apps
from .models import SystemGoogleDriveConfig, SystemDriveUploadTask

logger = logging.getLogger(__name__)


def on_system_backup_created(sender, dest_path, filename, meta=None, **kwargs):
    """
    ثبت خودکار نسخه پشتیبان دیتابیس در صف درایو سراسری سامانه (فاز ۲ - D1)
    """
    try:
        config = SystemGoogleDriveConfig.objects.filter(id=1, is_enabled=True).first()
        if not config or not config.refresh_token:
            return

        try:
            import jdatetime
            shamsi_year = str(jdatetime.datetime.now().year)
        except Exception:
            import datetime
            shamsi_year = str(datetime.datetime.now().year)

        task = SystemDriveUploadTask.objects.create(
            task_type='backup',
            source_file_path=dest_path,
            target_folder_path=f"پشتیبان‌های سراسری پایگاه داده/{shamsi_year}",
            target_filename=filename,
            status='pending',
            priority=1
        )
        logger.info(f"[System GDrive] Backup {filename} enqueued in SystemDriveUploadTask #{task.id}")
    except Exception as exc:
        logger.warning(f"[System GDrive] Could not enqueue system backup task: {exc}")


try:
    if apps.is_installed('accounts'):
        from accounts.signals import backup_created
        backup_created.connect(on_system_backup_created)
except Exception:
    pass

