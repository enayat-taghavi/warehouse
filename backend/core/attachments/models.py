from django.conf import settings
from django.db import models


class Attachment(models.Model):
    """
    پیوست عمومی یک سند (ص۵ طرح ۲.۶). سند با (entity_kind, entity_id) نشانی می‌شود و هسته نام ماژول را نمی‌داند.
    حذف نرم است (archived_at)؛ فایل هرگز از دیسک پاک نمی‌شود (ق۱۶).
    """
    STORAGE_SERVER = 'server'
    STORAGE_GDRIVE = 'gdrive'
    STORAGE_CHOICES = ((STORAGE_SERVER, 'سرور'), (STORAGE_GDRIVE, 'گوگل درایو'))
    STATUS_ACCEPTED = 'accepted'
    STATUS_QUARANTINE = 'quarantine'
    STATUS_CHOICES = ((STATUS_ACCEPTED, 'پذیرفته'), (STATUS_QUARANTINE, 'قرنطینه'))

    company_id = models.IntegerField(null=True, blank=True, db_index=True, verbose_name='شرکت')
    entity_kind = models.CharField(max_length=50, verbose_name='نوع سند')
    entity_id = models.CharField(max_length=64, verbose_name='شناسهٔ سند')
    label = models.CharField(max_length=30, blank=True, default='', verbose_name='برچسب')
    order = models.PositiveIntegerField(default=0, verbose_name='ترتیب')
    description = models.TextField(blank=True, default='', verbose_name='توضیح')
    file = models.FileField(upload_to='attachments/%Y/%m/', max_length=255, verbose_name='فایل')
    original_name = models.CharField(max_length=255, blank=True, default='', verbose_name='نام اصلی')
    size = models.BigIntegerField(default=0, verbose_name='حجم')
    content_type = models.CharField(max_length=100, blank=True, default='', verbose_name='نوع محتوا')
    sha256 = models.CharField(max_length=64, blank=True, default='', verbose_name='چکیده')
    storage = models.CharField(max_length=10, choices=STORAGE_CHOICES, default=STORAGE_SERVER, verbose_name='جای نگه‌داری')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_ACCEPTED, verbose_name='وضعیت')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='+', verbose_name='بارگذارنده')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان بارگذاری')
    archived_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان بایگانی')
    replaced_by = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
                                    verbose_name='جایگزین')

    class Meta:
        verbose_name = 'پیوست'
        verbose_name_plural = 'پیوست‌ها'
        ordering = ('order', 'id')
        indexes = [models.Index(fields=['entity_kind', 'entity_id'], name='attach_entity_idx')]

    def __str__(self):
        return f'{self.entity_kind}:{self.entity_id} {self.original_name}'


class EntityViewLog(models.Model):
    """
    سابقهٔ دیدن یک سند (ص۱۰ طرح ۲.۶). سبک است: برای هر کاربر و سند حداکثر یک ردیف در هر ۱۰ دقیقه
    (record_entity_view در services.py). سند مثل Attachment با (entity_kind, entity_id) نشانی می‌شود.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+',
                             verbose_name='کاربر')
    entity_kind = models.CharField(max_length=50, verbose_name='نوع سند')
    entity_id = models.CharField(max_length=64, verbose_name='شناسهٔ سند')
    company_id = models.IntegerField(null=True, blank=True, verbose_name='شرکت')
    viewed_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان دیدن')

    class Meta:
        verbose_name = 'سابقهٔ دیدن'
        verbose_name_plural = 'سابقه‌های دیدن'
        ordering = ('-viewed_at',)
        indexes = [
            models.Index(fields=['entity_kind', 'entity_id', 'viewed_at'], name='viewlog_entity_idx'),
            models.Index(fields=['user', 'viewed_at'], name='viewlog_user_idx'),
        ]

    def __str__(self):
        return f'{self.user_id} {self.entity_kind}:{self.entity_id} {self.viewed_at}'
