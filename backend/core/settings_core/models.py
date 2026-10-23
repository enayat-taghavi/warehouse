from django.db import models
from django.conf import settings


class SystemSetting(models.Model):
    """
    تنظیمات سلسله‌مراتبی سیستم (هستهٔ پلتفرم).

    اگر `warehouse_id` تهی باشد، تنظیم سراسری است؛ اگر مقدار داشته باشد،
    override همان انبار است. برای خنثی‌بودن هسته نسبت به ماژول انبار، به‌جای
    FK به `Warehouse` یک ستون عددی ساده نگه می‌داریم (همان جدول و همان ستونِ
    قبلی، فقط بدون وابستگی سطح مایگریشن به اپ انبار).

    قوانین پروژه (صفر مهاجرت داده): این مدل با `SeparateDatabaseAndState`
    از اپ `warehouses` به اینجا منتقل شده و `db_table='warehouses_systemsetting'`
    عیناً ثابت مانده است. هیچ داده‌ای جابجا نشده و نمی‌شود.
    """
    key = models.CharField(max_length=100)
    value = models.JSONField()
    warehouse_id = models.IntegerField(
        null=True, blank=True, db_index=True, db_column='warehouse_id',
        verbose_name="شناسهٔ انبار",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'warehouses_systemsetting'
        unique_together = ('key', 'warehouse_id')

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        from .services import clear_setting_cache
        clear_setting_cache(self.key, self.warehouse_id)

    def delete(self, *args, **kwargs):
        key = self.key
        wh_id = self.warehouse_id
        super().delete(*args, **kwargs)
        from .services import clear_setting_cache
        clear_setting_cache(key, wh_id)

    def __init__(self, *args, **kwargs):
        if 'warehouse' in kwargs:
            wh = kwargs.pop('warehouse')
            if 'warehouse_id' not in kwargs and wh is not None:
                kwargs['warehouse_id'] = getattr(wh, 'id', wh)
        super().__init__(*args, **kwargs)

    @property
    def warehouse(self):
        """سازگاری رو به عقب برای کدهایی که obj.warehouse را می‌خوانند."""
        if not self.warehouse_id:
            return None
        from platform_core.registry import resolve_entity
        return resolve_entity('warehouse', self.warehouse_id)

    def __str__(self):
        if self.warehouse_id:
            return f"{self.key} - WH#{self.warehouse_id}"
        return f"{self.key} - Global"


class GoogleOAuthState(models.Model):
    """
    نگهداری nonce و وضعیت یک‌بارمصرف احراز هویت OAuth 2.0 گوگل (فاز ۱ - GD-02)
    """
    TARGET_CHOICES = (
        ('company', 'شرکت'),
        ('system', 'سامانه'),
    )
    MODE_CHOICES = (
        ('popup', 'پنجره پاپ‌آپ'),
        ('redirect', 'ریدایرکت در همان تب'),
    )

    nonce = models.CharField(max_length=64, unique=True, db_index=True, verbose_name="شناسه یکتا Nonce")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='gdrive_oauth_states',
        verbose_name="کاربر درخواست‌کننده"
    )
    target = models.CharField(max_length=20, choices=TARGET_CHOICES, default='company', verbose_name="نوع مقصد")
    company_id = models.IntegerField(null=True, blank=True, db_index=True, verbose_name="شناسه شرکت")
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='popup', verbose_name="حالت باز شدن")
    expires_at = models.DateTimeField(verbose_name="زمان انقضا")
    used_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان مصرف")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ایجاد")

    class Meta:
        db_table = 'settings_google_oauth_state'
        ordering = ['-created_at']

    def __str__(self):
        return f"OAuthState({self.target}:{self.company_id or 'system'}, mode={self.mode}, used={bool(self.used_at)})"


class SystemGoogleDriveConfig(models.Model):
    """
    تنظیمات تک‌رکوردی اتصال گوگل‌درایو سرور/سامانه جهت پشتیبان‌های سراسری پایگاه‌داده (فاز ۲ - D1)
    """
    AUTH_STATUS_CHOICES = (
        ('unlinked', 'قطع ارتباط'),
        ('authenticated', 'متصل و معتبر'),
        ('needs_reauth', 'نیازمند احراز مجدد'),
    )

    is_enabled = models.BooleanField(default=True, verbose_name="فعال بودن ارسال ابری سامانه")
    account_email = models.CharField(max_length=255, blank=True, null=True, verbose_name="ایمیل حساب گوگل")
    refresh_token = models.TextField(blank=True, null=True, verbose_name="توکن نوسازی رمزشده")
    root_folder_id = models.CharField(max_length=128, blank=True, null=True, verbose_name="شناسه پوشه ریشه سامانه")
    root_folder_name = models.CharField(max_length=255, default="سامانه ابری پشتیبان پایگاه داده", verbose_name="نام پوشه ریشه")
    last_sync_at = models.DateTimeField(null=True, blank=True, verbose_name="آخرین زمان ارسال موفق")
    last_error = models.TextField(blank=True, null=True, verbose_name="آخرین خطای ارتباط")
    auth_status = models.CharField(max_length=30, choices=AUTH_STATUS_CHOICES, default='unlinked', verbose_name="وضعیت احراز هویت")
    worker_heartbeat_at = models.DateTimeField(null=True, blank=True, verbose_name="آخرین ضربان ورکر همگام‌سازی")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ایجاد")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")

    class Meta:
        db_table = 'settings_system_gdrive_config'
        verbose_name = "تنظیمات گوگل‌درایو سامانه"
        verbose_name_plural = "تنظیمات گوگل‌درایو سامانه"

    def __str__(self):
        return f"System Google Drive ({self.auth_status} - {self.account_email or 'بدون حساب'})"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class SystemDriveUploadTask(models.Model):
    """
    صف وظایف ارسال پشتیبان‌های سراسری سرور به درایو سامانه (فاز ۲ - D1)
    """
    TASK_TYPE_CHOICES = (
        ('backup', 'پشتیبان پایگاه داده'),
        ('scan_all', 'پیمایش مجدد'),
    )
    STATUS_CHOICES = (
        ('pending', 'در انتظار ارسال'),
        ('processing', 'در حال پردازش / ارسال'),
        ('completed', 'همگام‌سازی موفق'),
        ('failed', 'خطا در ارسال'),
    )

    task_type = models.CharField(max_length=50, choices=TASK_TYPE_CHOICES, default='backup', verbose_name="نوع وظیفه")
    source_file_path = models.CharField(max_length=1000, verbose_name="مسیر فایل محلی در سرور")
    target_folder_path = models.CharField(max_length=1000, verbose_name="مسیر پوشه در گوگل‌درایو")
    target_filename = models.CharField(max_length=500, verbose_name="نام فایل در گوگل‌درایو")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True, verbose_name="وضعیت")
    priority = models.IntegerField(default=10, db_index=True, verbose_name="اولویت ارسال")
    retry_count = models.IntegerField(default=0, verbose_name="تعداد دفعات تلاش مجدد")
    next_retry_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تلاش بعدی")
    gdrive_file_id = models.CharField(max_length=120, blank=True, null=True, verbose_name="شناسه فایل در گوگل‌درایو")
    file_sha256 = models.CharField(max_length=64, blank=True, null=True, verbose_name="هش امنیتی SHA-256")
    error_message = models.TextField(blank=True, null=True, verbose_name="شرح خطا")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="زمان ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="زمان آخرین تغییر")
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تکمیل")

    class Meta:
        db_table = 'settings_system_gdrive_task'
        verbose_name = "وظیفه ارسال درایو سامانه"
        verbose_name_plural = "وظایف ارسال درایو سامانه"
        indexes = [
            models.Index(fields=['status', 'priority', 'created_at']),
        ]

    def __str__(self):
        return f"SystemTask({self.task_type} - {self.target_filename} - {self.status})"

