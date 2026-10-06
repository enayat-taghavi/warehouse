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
        from django.apps import apps
        if apps.is_installed('warehouses'):
            Warehouse = apps.get_model('warehouses', 'Warehouse')
            return Warehouse.objects.filter(id=self.warehouse_id).first()
        return None

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
