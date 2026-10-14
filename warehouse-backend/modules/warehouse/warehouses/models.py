from django.db import models
from django.conf import settings

class Warehouse(models.Model):
    # Auto-number but user can change it: we use a string field 'code' which is unique.
    # The actual primary key 'id' will be a standard AutoField.
    code = models.CharField(max_length=50, unique=True, blank=True, null=True)
    name = models.CharField(max_length=255)
    project_name = models.CharField(max_length=255, blank=True, null=True)
    
    type = models.CharField(max_length=100, blank=True, null=True)
    location = models.TextField(blank=True, null=True)
    gps_coordinates = models.CharField(max_length=100, blank=True, null=True)
    phone_number = models.CharField(max_length=50, blank=True, null=True)
    
    manager = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_warehouses')
    is_active = models.BooleanField(default=True)
    capacity = models.IntegerField(blank=True, null=True)
    parent_warehouse = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='sub_warehouses')
    
    description = models.TextField(blank=True, null=True)
    operator_company = models.CharField(max_length=255, blank=True, null=True)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        db_column='company_id',
        related_name='warehouses',
        verbose_name="شرکت مالک انبار"
    )
    company_name = models.CharField(
        max_length=200,
        blank=True,
        null=True,
        verbose_name="نام شرکت مالک"
    )
    color = models.CharField(max_length=20, default='#6366f1')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_warehouses')
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='modified_warehouses')

    # فاز ۲ §۲.۱ — جابه‌جایی مالکیت M2M از هسته به اپ انبار.
    # پیش‌تر این M2M روی `CustomUser` در اپ `accounts` بود (وابستگی سطح مایگریشن
    # هسته → انبار). حالا روی `Warehouse` اعلام می‌شود با همان جدول
    # `accounts_customuser_assigned_warehouses` (expand-contract، صفر مهاجرت داده)،
    # تا `user.assigned_warehouses` و `warehouse.assigned_users` عیناً حفظ شوند.
    assigned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='assigned_warehouses',
        blank=True,
        db_table='accounts_customuser_assigned_warehouses',
        verbose_name="کاربران تخصیص‌یافته",
    )

    def save(self, *args, **kwargs):
        # ۰. همگام‌سازی خودکار نام شرکت از روی کلید خارجی جهت رفع تداخل داده‌های کهنه
        if self.company:
            self.company_name = self.company.name

        # ۱. نرمال‌سازی کد: تبدیل رشته خالی یا فاصله‌ای به None جهت ثبت NULL در پایگاه داده
        if self.code is not None:
            self.code = str(self.code).strip()
            if not self.code:
                self.code = None

        # ۲. در صورتی که کد خالی باشد، شناسه عددی انبار به عنوان کد پیش‌فرض تنظیم می‌شود
        if not self.code:
            # ذخیره اولیه با کد None (در SQL مقادیر NULL قید یکتایی را نقض نمی‌کنند)
            super().save(*args, **kwargs)
            self.code = str(self.id)
            # به‌روزرسانی مستقیم رکورد در دیتابیس بدون فراخوانی مجدد save و دور زدن لوپ بازگشتی
            Warehouse.objects.filter(id=self.id).update(code=self.code)
        else:
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"

class LabelTemplate(models.Model):
    """
    Stores label layout design.
    If warehouse is null → Global default template.
    If warehouse is set → Override for that specific warehouse.
    """
    PAPER_CHOICES = [
        ('A4', 'کاغذ A4'),
        ('A3', 'کاغذ A3'),
        ('roll', 'رول حرارتی'),
    ]

    warehouse = models.ForeignKey(
        Warehouse, on_delete=models.CASCADE, null=True, blank=True,
        related_name='label_templates', verbose_name="انبار"
    )
    name = models.CharField(max_length=100, default="پیش‌فرض", verbose_name="نام تمپلیت")

    # Label physical dimensions (mm)
    width_mm = models.IntegerField(default=70, verbose_name="عرض لیبل (mm)")
    height_mm = models.IntegerField(default=40, verbose_name="ارتفاع لیبل (mm)")

    # QR Code source field (which Item field to encode)
    qr_source_field = models.CharField(
        max_length=100, default='fa_unic_code',
        verbose_name="فیلد منبع QR Code"
    )

    # Canvas elements: JSON array of positioned elements
    # Each element: { field, x, y, width, height, fontSize, fontWeight, textAlign, type }
    # type: 'text' | 'qrcode' | 'special'
    # field: Item model field name, or special: '__print_date__', '__warehouse_name__', '__project_name__'
    elements = models.JSONField(default=list, blank=True, verbose_name="المان‌های بوم")

    # Print grid settings
    paper_type = models.CharField(
        max_length=10, choices=PAPER_CHOICES, default='A4',
        verbose_name="نوع کاغذ"
    )
    grid_rows = models.IntegerField(default=7, verbose_name="تعداد سطر")
    grid_cols = models.IntegerField(default=3, verbose_name="تعداد ستون")
    margin_mm = models.IntegerField(default=5, verbose_name="حاشیه (mm)")

    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "قالب لیبل"
        verbose_name_plural = "قالب‌های لیبل"
        ordering = ['-updated_at']

    def __str__(self):
        scope = 'Global' if not self.warehouse else self.warehouse.name
        return f"{self.name} ({scope})"
