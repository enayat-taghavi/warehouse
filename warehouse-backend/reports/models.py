"""
مدل‌های گزارش‌ساز پویا

- ReportTemplate: قالب گزارش ذخیره‌شده (spec به‌صورت JSON). شخصی است و با
  is_public قابل اشتراک‌گذاری می‌شود. spec در هر اجرا دوباره علیه رجیستری
  اعتبارسنجی می‌شود (فیلدها ممکن است از زمان ذخیره تغییر کرده باشند).
- ReportExportJob: کار پس‌زمینه خروجی Excel برای نتایج بزرگ (بدون سقف ردیف).
  فایل روی دیسک (report_exports/ کنار BASE_DIR) ساخته می‌شود تا درخواست HTTP
  طولانی نداشته باشیم (تایم‌اوت ~۱۰۰ ثانیه‌ای Cloudflare Tunnel).
"""
from pathlib import Path

from django.conf import settings
from django.db import models


class ReportTemplate(models.Model):
    name = models.CharField(max_length=200, verbose_name="نام گزارش")
    description = models.TextField(null=True, blank=True, verbose_name="توضیحات")
    entity = models.CharField(max_length=50, verbose_name="موجودیت (کلید رجیستری)")
    spec = models.JSONField(default=dict, verbose_name="تعریف گزارش")
    is_public = models.BooleanField(default=False, verbose_name="اشتراک‌گذاری عمومی")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='report_templates', verbose_name="سازنده",
    )
    # شناسهٔ عددی انبار (نه FK) تا گزارش‌ساز بدون ماژول انبار هم نصب‌شدنی باشد؛ با حذف انبار،
    # سیگنال post_delete در warehouses/signals.py آن را تهی می‌کند.
    warehouse_id = models.IntegerField(
        null=True, blank=True, db_index=True,
        verbose_name="انبار (برای فیلدهای پویا)",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = "قالب گزارش"
        verbose_name_plural = "قالب‌های گزارش"

    def __str__(self):
        return f"{self.name} ({self.entity})"


class ReportExportJob(models.Model):
    STATUS_CHOICES = [
        ('pending', 'در صف'),
        ('running', 'در حال تولید'),
        ('done', 'آماده دانلود'),
        ('failed', 'ناموفق'),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='report_export_jobs', verbose_name="کاربر",
    )
    report_name = models.CharField(max_length=200, default='report', verbose_name="نام گزارش")
    spec = models.JSONField(default=dict, verbose_name="تعریف گزارش")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', verbose_name="وضعیت")
    progress = models.PositiveSmallIntegerField(default=0, verbose_name="درصد پیشرفت")
    attempts = models.PositiveSmallIntegerField(default=0, verbose_name="تعداد تلاش")
    # نبض job در حین پردازش — .update() مدل auto_now را trigger نمی‌کند، پس صریحاً touch می‌شود
    heartbeat_at = models.DateTimeField(null=True, blank=True, verbose_name="آخرین نبض پردازش")
    total_rows = models.PositiveIntegerField(default=0, verbose_name="تعداد کل ردیف‌ها")
    file_path = models.CharField(max_length=500, null=True, blank=True, verbose_name="مسیر فایل (نسبی)")
    error_message = models.TextField(null=True, blank=True, verbose_name="متن خطا")
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "کار خروجی گزارش"
        verbose_name_plural = "کارهای خروجی گزارش"

    def __str__(self):
        return f"ExportJob #{self.pk} - {self.status}"

    @staticmethod
    def exports_dir() -> Path:
        custom_dir = getattr(settings, 'WAREHOUSE_REPORT_EXPORT_DIR', None)
        if custom_dir:
            d = Path(custom_dir)
        else:
            d = Path(settings.BASE_DIR) / 'report_exports'
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def absolute_file_path(self):
        if not self.file_path:
            return None
        custom_dir = getattr(settings, 'WAREHOUSE_REPORT_EXPORT_DIR', None)
        if custom_dir:
            return Path(custom_dir) / Path(self.file_path).name
        return Path(settings.BASE_DIR) / self.file_path


class ExportWorkerStatus(models.Model):
    """
    نبض worker خروجی‌ها — یک ردیف (pk=1) که هر چرخه poll به‌روز می‌شود.
    وب‌سرور با آن تشخیص می‌دهد worker زنده است یا باید fallback به Thread کند.
    در DB است (نه فایل لوکال) تا با چند سرور هم کار کند.
    """
    alive_at = models.DateTimeField(verbose_name="آخرین نبض")

    class Meta:
        verbose_name = "وضعیت worker خروجی"
        verbose_name_plural = "وضعیت worker خروجی"

    def __str__(self):
        return f"ExportWorker alive_at={self.alive_at}"
