from django.conf import settings
from django.db import models


class NumberSeriesConfig(models.Model):
    """
    تنظیم یک سری شماره در یک شرکت (ص۳ طرح ۲.۸). ردیف نبود = پیش‌فرض اعلام ماژول.
    تغییر قالب فقط روی شماره‌های بعدی اثر دارد؛ شمارهٔ صادرشده «یخ» زده است.
    """
    company = models.ForeignKey('companies.Company', on_delete=models.PROTECT, related_name='+', verbose_name='شرکت')
    series_key = models.CharField(max_length=80, verbose_name='سری شماره')
    template = models.CharField(max_length=100, blank=True, default='', verbose_name='قالب')
    prefix = models.CharField(max_length=20, blank=True, default='', verbose_name='پیشوند')
    seq_padding = models.PositiveSmallIntegerField(default=0, verbose_name='طول کمینهٔ شماره')
    start_number = models.PositiveIntegerField(default=1, verbose_name='شمارهٔ شروع')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='زمان تغییر')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='+', verbose_name='تغییردهنده')

    class Meta:
        verbose_name = 'تنظیم سری شماره'
        verbose_name_plural = 'تنظیم‌های سری شماره'
        constraints = [
            models.UniqueConstraint(fields=['company', 'series_key'], name='numbering_config_unique'),
        ]

    def __str__(self):
        return f'{self.company_id}:{self.series_key}'


class NumberCounter(models.Model):
    """شمارندهٔ یک سری در یک دوره (ص۳). همین ردیف هنگام صدور قفل می‌شود و هرگز کم نمی‌شود."""
    company = models.ForeignKey('companies.Company', on_delete=models.PROTECT, related_name='+', verbose_name='شرکت')
    series_key = models.CharField(max_length=80, verbose_name='سری شماره')
    period_key = models.CharField(max_length=20, verbose_name='کلید دوره')
    last_seq = models.PositiveIntegerField(default=0, verbose_name='آخرین شماره')

    class Meta:
        verbose_name = 'شمارندهٔ سری'
        verbose_name_plural = 'شمارنده‌های سری'
        constraints = [
            models.UniqueConstraint(fields=['company', 'series_key', 'period_key'], name='numbering_counter_unique'),
        ]

    def __str__(self):
        return f'{self.company_id}:{self.series_key}:{self.period_key}={self.last_seq}'


class IssuedNumber(models.Model):
    """
    شمارهٔ صادرشده برای یک سند (ص۳). سند با (entity_kind, entity_id) نشانی می‌شود و هسته نام ماژول را نمی‌داند.
    ردیف هرگز پاک نمی‌شود؛ ابطال فقط وضعیت را void می‌کند و seq دوباره داده نمی‌شود.
    """
    STATUS_ACTIVE = 'active'
    STATUS_VOID = 'void'
    STATUS_CHOICES = ((STATUS_ACTIVE, 'فعال'), (STATUS_VOID, 'باطل‌شده'))

    company = models.ForeignKey('companies.Company', on_delete=models.PROTECT, related_name='+', verbose_name='شرکت')
    series_key = models.CharField(max_length=80, verbose_name='سری شماره')
    period_key = models.CharField(max_length=20, verbose_name='کلید دوره')
    seq = models.PositiveIntegerField(verbose_name='شماره')
    display = models.CharField(max_length=150, verbose_name='شمارهٔ سند')
    entity_kind = models.CharField(max_length=50, verbose_name='نوع سند')
    entity_id = models.CharField(max_length=64, verbose_name='شناسهٔ سند')
    issued_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان صدور')
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                  related_name='+', verbose_name='صادرکننده')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE, verbose_name='وضعیت')
    void_reason = models.CharField(max_length=500, blank=True, default='', verbose_name='دلیل ابطال')
    voided_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان ابطال')
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                  related_name='+', verbose_name='باطل‌کننده')

    class Meta:
        verbose_name = 'شمارهٔ صادرشده'
        verbose_name_plural = 'شماره‌های صادرشده'
        ordering = ('-issued_at', '-id')
        constraints = [
            models.UniqueConstraint(fields=['company', 'series_key', 'period_key', 'seq'], name='numbering_issued_seq_unique'),
            models.UniqueConstraint(fields=['company', 'series_key', 'display'], name='numbering_issued_display_unique'),
            models.UniqueConstraint(fields=['company', 'series_key', 'entity_kind', 'entity_id'], condition=models.Q(status='active'),
                                    name='numbering_issued_active_entity_unique'),
        ]
        indexes = [models.Index(fields=['entity_kind', 'entity_id'], name='numbering_issued_entity_idx')]

    def __str__(self):
        return f'{self.series_key} {self.display}'
