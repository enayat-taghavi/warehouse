import os
import logging
from django.db import transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import (
    Company,
    CompanyDocument,
    CompanyBoardMember,
    ExpenseInvoice,
    PettyCashTransaction,
    PersonnelProfile,
    PersonnelDocument,
    VehicleDocument,
    GoogleDriveSyncQueue
)
from .google_drive_path_resolver import GoogleDrivePathResolver, get_current_shamsi_year_str

logger = logging.getLogger(__name__)


def _trigger_async_sync(task_id: int, config=None):
    """
    اجرای فوری و کاملاً ناهمگام وظیفه صف توسط Daemon Thread مجزا
    جهت همگام‌سازی بلادرنگ فایل‌ها در گوگل‌درایو بدون مسدودسازی پاسخ به کاربر.
    منحصراً در صورت همگام‌سازی آنی (sync_mode == 'immediate') نخ پس‌زمینه اجرا می‌شود.
    """
    try:
        if config is None:
            task = GoogleDriveSyncQueue.objects.filter(id=task_id).select_related('company__gdrive_config').first()
            if task and hasattr(task.company, 'gdrive_config'):
                config = task.company.gdrive_config

        if config and getattr(config, 'sync_mode', 'immediate') != 'immediate':
            logger.info(f"[GDrive Queue] Task #{task_id} in mode '{config.sync_mode}' - skipping immediate thread execution.")
            return

        import threading
        from .google_drive_service import sync_single_queue_item
        th = threading.Thread(target=sync_single_queue_item, args=(task_id,), daemon=True)
        th.start()
    except Exception as exc:
        logger.warning(f"[GDrive Async Trigger] Could not start daemon thread for task #{task_id}: {exc}")


def enqueue_file_upload(instance, field_name: str, file_obj):
    """
    ثبت امن تسک آپلود فایل در صف پس از Commit موفق تراکنش اصلی
    """
    if not file_obj or not hasattr(file_obj, 'name') or not file_obj.name:
        return

    def _enqueue():
        try:
            resolved = GoogleDrivePathResolver.resolve(instance, field_name=field_name, file_obj=file_obj)
            if not resolved:
                return

            company, target_folder, target_filename = resolved
            config = getattr(company, 'gdrive_config', None)
            if not config or not config.is_enabled or not config.refresh_token:
                # اگر درایو شرکت فعال نیست، صف شلوغ نشود
                return

            model_name = instance.__class__.__name__

            # بررسی تنظیمات تفکیکی فعال بودن هر دسته
            if model_name in ('CompanyDocument', 'Company', 'CompanyBoardMember', 'ExpenseInvoice', 'PettyCashTransaction') and not config.sync_accounting_docs:
                return
            if model_name in ('PersonnelProfile', 'PersonnelDocument') and not config.sync_personnel_docs:
                return
            if model_name == 'VehicleDocument' and not config.sync_fleet_docs:
                return
            if model_name == 'ItemPhoto' and not config.sync_inventory_photos:
                return

            # جلوگیری از ثبت تسک‌های تکراری هنگام تغییر وضعیت‌های متوالی در کارتابل
            existing = GoogleDriveSyncQueue.objects.filter(
                company=company,
                model_name=model_name,
                object_id=instance.id,
                source_file_path=file_obj.name,
            ).order_by('-created_at').first()

            if existing:
                if existing.status in ('pending', 'processing', 'completed'):
                    # فایل بدون تغییر است و تسک در جریان یا با موفقیت ارسال شده است
                    return
                elif existing.status == 'failed' and existing.retry_count < 5:
                    existing.status = 'pending'
                    existing.error_message = None
                    existing.save(update_fields=['status', 'error_message', 'updated_at'])
                    logger.info(f"[GDrive Queue] Reset failed task for {model_name}#{instance.id} -> pending")
                    if config.sync_mode == 'immediate':
                        _trigger_async_sync(existing.id, config=config)
                    return

            # ثبت تسک در صف
            task = GoogleDriveSyncQueue.objects.create(
                company=company,
                model_name=model_name,
                object_id=instance.id,
                source_file_path=file_obj.name,
                target_folder_path=target_folder,
                target_filename=target_filename,
                action='upload',
                status='pending'
            )
            logger.info(f"[GDrive Queue] Enqueued upload task for {model_name}#{instance.id} -> {target_filename} (mode={config.sync_mode})")
            if config.sync_mode == 'immediate':
                _trigger_async_sync(task.id, config=config)
            else:
                logger.info(f"[GDrive Queue] Skipping async thread for task #{task.id} due to sync_mode='{config.sync_mode}'")
        except Exception as exc:
            logger.error(f"[GDrive Queue] Error enqueuing {instance.__class__.__name__}#{getattr(instance, 'id', None)}: {exc}")

    transaction.on_commit(_enqueue)


def enqueue_file_archive_delete(instance, field_name: str, file_obj):
    """
    ثبت تسک انتقال به بایگانی پس از حذف رکورد در سامانه
    """
    if not file_obj or not hasattr(file_obj, 'name') or not file_obj.name:
        return

    def _enqueue_archive():
        try:
            model_name = instance.__class__.__name__

            already_archiving = GoogleDriveSyncQueue.objects.filter(
                model_name=model_name,
                object_id=instance.id,
                action='archive_delete',
                status__in=['pending', 'processing', 'completed']
            ).exists()
            if already_archiving:
                return

            # پیدا کردن آخرین تسک موفق همگام‌سازی این رکورد برای بدست آوردن gdrive_file_id
            last_task = GoogleDriveSyncQueue.objects.filter(
                model_name=model_name,
                object_id=instance.id,
                status='completed',
                gdrive_file_id__isnull=False
            ).order_by('-created_at').first()

            if not last_task or not last_task.gdrive_file_id:
                return

            company = last_task.company
            config = getattr(company, 'gdrive_config', None)
            if not config or not config.is_enabled:
                return

            archive_task = GoogleDriveSyncQueue.objects.create(
                company=company,
                model_name=model_name,
                object_id=instance.id,
                source_file_path=last_task.source_file_path,
                target_folder_path=f"بایگانی و اسناد حذف‌شده/{get_current_shamsi_year_str()}",
                target_filename=last_task.target_filename,
                gdrive_file_id=last_task.gdrive_file_id,
                action='archive_delete',
                status='pending'
            )
            logger.info(f"[GDrive Queue] Enqueued archive_delete task for {model_name}#{instance.id} (mode={getattr(config, 'sync_mode', 'immediate')})")
            if getattr(config, 'sync_mode', 'immediate') == 'immediate':
                _trigger_async_sync(archive_task.id, config=config)
            else:
                logger.info(f"[GDrive Queue] Skipping async thread for archive task #{archive_task.id} due to sync_mode='{getattr(config, 'sync_mode', 'immediate')}'")
        except Exception as exc:
            logger.error(f"[GDrive Queue] Error enqueuing archive_delete: {exc}")

    transaction.on_commit(_enqueue_archive)


# ==============================================================================
# اتصال به رویدادهای مدل‌های اسناد شرکت
# ==============================================================================

@receiver(post_save, sender=CompanyDocument)
def on_company_document_saved(sender, instance, created, **kwargs):
    if instance.file:
        enqueue_file_upload(instance, 'file', instance.file)

@receiver(post_delete, sender=CompanyDocument)
def on_company_document_deleted(sender, instance, **kwargs):
    if instance.file:
        enqueue_file_archive_delete(instance, 'file', instance.file)


@receiver(post_save, sender=ExpenseInvoice)
def on_expense_invoice_saved(sender, instance, created, **kwargs):
    if instance.attachment:
        enqueue_file_upload(instance, 'attachment', instance.attachment)

@receiver(post_delete, sender=ExpenseInvoice)
def on_expense_invoice_deleted(sender, instance, **kwargs):
    if instance.attachment:
        enqueue_file_archive_delete(instance, 'attachment', instance.attachment)


@receiver(post_save, sender=PettyCashTransaction)
def on_petty_cash_saved(sender, instance, created, **kwargs):
    if instance.attachment:
        enqueue_file_upload(instance, 'attachment', instance.attachment)

@receiver(post_delete, sender=PettyCashTransaction)
def on_petty_cash_deleted(sender, instance, **kwargs):
    if instance.attachment:
        enqueue_file_archive_delete(instance, 'attachment', instance.attachment)


@receiver(post_save, sender=PersonnelProfile)
def on_personnel_profile_saved(sender, instance, created, **kwargs):
    if instance.attachment:
        enqueue_file_upload(instance, 'attachment', instance.attachment)

@receiver(post_delete, sender=PersonnelProfile)
def on_personnel_profile_deleted(sender, instance, **kwargs):
    if instance.attachment:
        enqueue_file_archive_delete(instance, 'attachment', instance.attachment)


@receiver(post_save, sender=PersonnelDocument)
def on_personnel_document_saved(sender, instance, created, **kwargs):
    if instance.file:
        enqueue_file_upload(instance, 'file', instance.file)

@receiver(post_delete, sender=PersonnelDocument)
def on_personnel_document_deleted(sender, instance, **kwargs):
    if instance.file:
        enqueue_file_archive_delete(instance, 'file', instance.file)


@receiver(post_save, sender=VehicleDocument)
def on_vehicle_document_saved(sender, instance, created, **kwargs):
    if instance.file:
        enqueue_file_upload(instance, 'file', instance.file)

@receiver(post_delete, sender=VehicleDocument)
def on_vehicle_document_deleted(sender, instance, **kwargs):
    if instance.file:
        enqueue_file_archive_delete(instance, 'file', instance.file)


@receiver(post_save, sender=Company)
def on_company_saved(sender, instance, created, **kwargs):
    if instance.articles_of_association:
        enqueue_file_upload(instance, 'articles_of_association', instance.articles_of_association)
    if instance.latest_gazette:
        enqueue_file_upload(instance, 'latest_gazette', instance.latest_gazette)
    if instance.logo:
        enqueue_file_upload(instance, 'logo', instance.logo)


@receiver(post_save, sender=CompanyBoardMember)
def on_company_board_member_saved(sender, instance, created, **kwargs):
    if instance.attached_id_doc:
        enqueue_file_upload(instance, 'attached_id_doc', instance.attached_id_doc)
    if instance.attached_appointment_doc:
        enqueue_file_upload(instance, 'attached_appointment_doc', instance.attached_appointment_doc)

@receiver(post_delete, sender=CompanyBoardMember)
def on_company_board_member_deleted(sender, instance, **kwargs):
    if instance.attached_id_doc:
        enqueue_file_archive_delete(instance, 'attached_id_doc', instance.attached_id_doc)
    if instance.attached_appointment_doc:
        enqueue_file_archive_delete(instance, 'attached_appointment_doc', instance.attached_appointment_doc)


# ==============================================================================
# اتصال به تصاویر کالاهای انبارگردانی
# ==============================================================================
try:
    from inventory.models import ItemPhoto

    @receiver(post_save, sender=ItemPhoto)
    def on_item_photo_saved(sender, instance, created, **kwargs):
        if instance.image:
            enqueue_file_upload(instance, 'image', instance.image)

    @receiver(post_delete, sender=ItemPhoto)
    def on_item_photo_deleted(sender, instance, **kwargs):
        if instance.image:
            enqueue_file_archive_delete(instance, 'image', instance.image)
except ImportError:
    pass
