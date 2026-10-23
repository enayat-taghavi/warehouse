"""
زیرساخت مشترک همگام‌سازی Local-First

مدل‌هایی که باید با کلاینت آفلاین (Dexie) سینک شوند این میکسین را می‌گیرند:
- sync_id: شناسه پایدار و جهانی رکورد. کلید upsert سمت کلاینت و کلید idempotency
  در ایجاد (اگر پاسخ سرور در تونل گم شود، ارسال دوباره رکورد تکراری نمی‌سازد).
- is_deleted: حذف نرم (tombstone). حذف واقعی ردیف، کلاینت‌های آفلاین را
  بی‌خبر می‌گذارد؛ tombstone از طریق Pull به آن‌ها می‌رسد.

قاعده مهم:
- کوئری‌های عادی برنامه از `objects` (فقط رکوردهای زنده) استفاده می‌کنند.
- فقط endpoint سینک (Pull) از `all_objects` می‌خواند تا tombstoneها را هم بفرستد.
"""
import uuid

from django.db import models
from django.utils import timezone


class ActiveManager(models.Manager):
    """مدیر پیش‌فرض — رکوردهای حذف‌شده (نرم) را پنهان می‌کند."""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class SyncModelMixin(models.Model):
    # وضعیت نهایی پس از مهاجرت سه‌مرحله‌ای (0016 افزودن nullable → 0017 backfill →
    # 0018 یکتا). unique خودش ایندکس می‌سازد.
    sync_id = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        null=True,
        blank=True,
        unique=True,
        verbose_name="شناسه همگام‌سازی",
    )
    is_deleted = models.BooleanField(default=False, db_index=True, verbose_name="حذف‌شده (نرم)")

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True
        # نکته: چون مدل‌های فرزند Meta خودشان را دارند (بدون ارث‌بری از این Meta)،
        # base_manager_name باید در Meta هر مدل فرزند صریح ست شود:
        #   base_manager_name = 'all_objects'
        # وگرنه دسترسی به روابط (مثل task.item وقتی item حذف نرم شده)
        # DoesNotExist پرتاب می‌کند و تاریخچه/بازگردانی می‌شکند.

    def soft_delete(self, save: bool = True):
        """حذف نرم — updated_at را هم صریح جلو می‌برد تا در دلتای Pull بیاید."""
        self.is_deleted = True
        if save:
            update_fields = ['is_deleted']
            # همه مدل‌های مشمول updated_at دارند؛ auto_now با save فعال می‌شود
            if any(f.name == 'updated_at' for f in self._meta.fields):
                update_fields.append('updated_at')
            self.save(update_fields=update_fields)


def soft_delete_queryset(queryset):
    """
    حذف نرم گروهی — جایگزین queryset.delete().
    چون queryset.update() سیگنال auto_now را رد می‌کند، updated_at صریح ست می‌شود.
    خروجی: تعداد ردیف‌های علامت‌خورده.
    """
    return queryset.update(is_deleted=True, updated_at=timezone.now())
