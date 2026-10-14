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


def enqueue_file_upload(instance, field_name: str, file_obj):
    """
    ثبت امن تسک آپلود فایل در صف پس از Commit موفق تراکنش اصلی (فاز ۴ - GD-12، GD-13 تفکیک فیلد و حساب)
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

            current_account = config.account_email or ''

            # جلوگیری از ثبت تسک‌های تکراری هنگام تغییر وضعیت‌های متوالی در کارتابل
            existing = GoogleDriveSyncQueue.objects.filter(
                company=company,
                model_name=model_name,
                object_id=instance.id,
                field_name=field_name,
                drive_account=current_account,
                source_file_path=file_obj.name,
            ).order_by('-created_at').first()

            if existing:
                if existing.status in ('pending', 'processing', 'completed'):
                    # فایل بدون تغییر است و تسک در جریان یا با موفقیت ارسال شده است
                    return
                elif existing.status == 'failed':
                    existing.status = 'pending'
                    existing.priority = 10
                    existing.retry_count = 0
                    existing.next_retry_at = None
                    existing.error_message = None
                    existing.save(update_fields=['status', 'priority', 'retry_count', 'next_retry_at', 'error_message', 'updated_at'])
                    logger.info(f"[GDrive Queue] Reset failed task for {model_name}#{instance.id} (field={field_name}) -> pending")
                    return

            # بررسی اینکه آیا قبلاً فایلی برای این رکورد و فیلد همگام‌سازی شده و اکنون با فایل جدید جایگزین شده است (GD-13)
            prev_completed = GoogleDriveSyncQueue.objects.filter(
                company=company,
                model_name=model_name,
                object_id=instance.id,
                field_name=field_name,
                drive_account=current_account,
                status='completed',
                gdrive_file_id__isnull=False
            ).exclude(source_file_path=file_obj.name).order_by('-created_at').first()

            if prev_completed and prev_completed.gdrive_file_id:
                # انتقال نسخه قبلی به پوشه بایگانی اسناد حذف‌شده/جایگزین‌شده
                already_archived = GoogleDriveSyncQueue.objects.filter(
                    company=company,
                    gdrive_file_id=prev_completed.gdrive_file_id,
                    action='archive_delete',
                    status__in=['pending', 'processing', 'completed']
                ).exists()
                if not already_archived:
                    GoogleDriveSyncQueue.objects.create(
                        company=company,
                        model_name=model_name,
                        object_id=instance.id,
                        field_name=field_name,
                        drive_account=current_account,
                        source_file_path=prev_completed.source_file_path,
                        target_folder_path=f"بایگانی و اسناد حذف‌شده/{get_current_shamsi_year_str()}",
                        target_filename=prev_completed.target_filename,
                        gdrive_file_id=prev_completed.gdrive_file_id,
                        action='archive_delete',
                        status='pending',
                        priority=10
                    )
                    logger.info(f"[GDrive Queue] Enqueued archive_delete for replaced file of {model_name}#{instance.id} (field={field_name})")

            # ثبت تسک در صف با اولویت معمولی
            task = GoogleDriveSyncQueue.objects.create(
                company=company,
                model_name=model_name,
                object_id=instance.id,
                field_name=field_name,
                drive_account=current_account,
                source_file_path=file_obj.name,
                target_folder_path=target_folder,
                target_filename=target_filename,
                action='upload',
                status='pending',
                priority=10
            )
            logger.info(f"[GDrive Queue] Enqueued upload task #{task.id} for {model_name}#{instance.id} (field={field_name}) -> {target_filename}")
        except Exception as exc:
            logger.error(f"[GDrive Queue] Error enqueuing {instance.__class__.__name__}#{getattr(instance, 'id', None)}: {exc}")

    transaction.on_commit(_enqueue)


def enqueue_file_archive_delete(instance, field_name: str, file_obj):
    """
    ثبت تسک انتقال به بایگانی پس از حذف رکورد در سامانه (تفکیک دقیق بر اساس field_name - GD-13)
    """
    if not file_obj or not hasattr(file_obj, 'name') or not file_obj.name:
        return

    def _enqueue_archive():
        try:
            model_name = instance.__class__.__name__

            already_archiving = GoogleDriveSyncQueue.objects.filter(
                model_name=model_name,
                object_id=instance.id,
                field_name=field_name,
                action='archive_delete',
                status__in=['pending', 'processing', 'completed']
            ).exists()
            if already_archiving:
                return

            # پیدا کردن آخرین تسک موفق همگام‌سازی این رکورد و فیلد برای بدست آوردن gdrive_file_id
            last_task = GoogleDriveSyncQueue.objects.filter(
                model_name=model_name,
                object_id=instance.id,
                field_name=field_name,
                action='upload',
                status='completed',
                gdrive_file_id__isnull=False
            ).order_by('-created_at').first()

            if not last_task or not last_task.gdrive_file_id:
                return

            company = last_task.company
            config = getattr(company, 'gdrive_config', None)
            if not config or not config.is_enabled:
                return

            # فایل حساب قبلی با توکن حساب فعلی دیده نمی‌شود (404 و completed بی‌صدا، GD-31)
            if last_task.drive_account and last_task.drive_account != (config.account_email or ''):
                logger.info(f"[GDrive Queue] Skip archive of {model_name}#{instance.id}: file belongs to a previous Google account.")
                return

            archive_task = GoogleDriveSyncQueue.objects.create(
                company=company,
                model_name=model_name,
                object_id=instance.id,
                field_name=field_name,
                drive_account=last_task.drive_account or (config.account_email or ''),
                source_file_path=last_task.source_file_path,
                target_folder_path=f"بایگانی و اسناد حذف‌شده/{get_current_shamsi_year_str()}",
                target_filename=last_task.target_filename,
                gdrive_file_id=last_task.gdrive_file_id,
                action='archive_delete',
                status='pending',
                priority=10
            )
            logger.info(f"[GDrive Queue] Enqueued archive_delete task #{archive_task.id} for {model_name}#{instance.id} (field={field_name})")
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
from django.apps import apps

if apps.is_installed('inventory'):
    ItemPhoto = apps.get_model('inventory', 'ItemPhoto')

    @receiver(post_save, sender=ItemPhoto)
    def on_item_photo_saved(sender, instance, created, **kwargs):
        if instance.image:
            enqueue_file_upload(instance, 'image', instance.image)

    @receiver(post_delete, sender=ItemPhoto)
    def on_item_photo_deleted(sender, instance, **kwargs):
        if instance.image:
            enqueue_file_archive_delete(instance, 'image', instance.image)


# ==============================================================================
# اتصال به سیگنال ساخت نسخه پشتیبان دیتابیس (هسته -> گوگل‌درایو)
# ==============================================================================
try:
    from accounts.signals import backup_created

    @receiver(backup_created)
    def on_backup_created(sender, dest_path, filename, meta=None, **kwargs):
        """ثبت خودکار نسخه پشتیبان دیتابیس در صف گوگل‌درایو شرکت‌های متصل"""
        try:
            from personnel.models import CompanyGoogleDriveConfig, GoogleDriveSyncQueue
            from personnel.google_drive_path_resolver import get_current_shamsi_year_str
            shamsi_year = get_current_shamsi_year_str()

            configs = CompanyGoogleDriveConfig.objects.filter(
                is_enabled=True,
                sync_backups=True
            ).select_related('company')

            for g_cfg in configs:
                if g_cfg.refresh_token:
                    task = GoogleDriveSyncQueue.objects.create(
                        company=g_cfg.company,
                        model_name='DatabaseBackup',
                        object_id=None,
                        field_name='backup',
                        drive_account=g_cfg.account_email or '',
                        source_file_path=dest_path,
                        target_folder_path=f"پشتیبان‌های پایگاه داده/{shamsi_year}",
                        target_filename=filename,
                        action='upload',
                        status='pending',
                        priority=1  # اولویت حداکثری برای فایل‌های پشتیبان
                    )
                    logger.info(f"[GDrive Sync] Backup {filename} enqueued for company {g_cfg.company.code} (priority=1)")
        except Exception as gdrive_err:
            logger.warning(f"Could not enqueue backup to Google Drive: {gdrive_err}")
except ImportError:
    pass
