import uuid

from django.db import models
from warehouses.models import Warehouse
from django.conf import settings
from django.utils import timezone

from django.contrib.postgres.indexes import GinIndex

from common.sync_models import SyncModelMixin, ActiveManager


class ItemFieldDefinition(SyncModelMixin):
    FIELD_TYPE_CHOICES = [
        ('text', 'متن (Text)'),
        ('number', 'عدد (Number)'),
        ('boolean', 'بله/خیر (Boolean)'),
        ('date', 'تاریخ (Date)'),
    ]

    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='item_field_definitions',
        verbose_name="شرکت متبوع"
    )
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='field_definitions', verbose_name="انبار", null=True, blank=True)
    name = models.CharField(max_length=100, verbose_name="نام سیستمی (انگلیسی)")
    label = models.CharField(max_length=200, verbose_name="عنوان نمایشی (فارسی)")
    field_type = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES, default='text', verbose_name="نوع داده")
    default_value = models.CharField(max_length=255, null=True, blank=True, verbose_name="مقدار پیش‌فرض")
    is_required = models.BooleanField(default=False, verbose_name="اجباری است؟")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    
    # Auditing
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_field_defs')

    class Meta:
        ordering = ['created_at']
        verbose_name = "تعریف فیلد پویا"
        verbose_name_plural = "تعاریف فیلدهای پویا"
        base_manager_name = 'all_objects'  # روابط FK حتی به رکوردهای حذف‌نرم دسترسی داشته باشند
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'warehouse', 'name'],
                condition=models.Q(company__isnull=False, warehouse__isnull=False),
                name='unique_company_warehouse_field_def'
            ),
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(company__isnull=False, warehouse__isnull=True),
                name='unique_company_field_def'
            ),
            models.UniqueConstraint(
                fields=['warehouse', 'name'],
                condition=models.Q(company__isnull=True),
                name='unique_warehouse_field_def'
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.company_id and self.warehouse and self.warehouse.company_id:
            self.company_id = self.warehouse.company_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.label} ({self.name})"

class Item(SyncModelMixin):
    # Tracking & IDs
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='items', verbose_name="انبار")
    fa_unic_code = models.CharField(max_length=100, verbose_name="کد یکتا")
    pl = models.CharField(max_length=100, null=True, blank=True, verbose_name="پکینگ لیست")
    po = models.CharField(max_length=100, null=True, blank=True, verbose_name="سفارش خرید")
    pk_number = models.CharField(max_length=100, null=True, blank=True, verbose_name="شماره پکیج")
    request_number_of_table = models.CharField(max_length=255, null=True, blank=True, verbose_name="شماره درخواست جدول")
    tag = models.CharField(max_length=100, null=True, blank=True, verbose_name="شماره تگ کالا")
    size = models.CharField(max_length=100, null=True, blank=True, verbose_name="سایز اصلی")

    # Specs
    description = models.TextField(null=True, blank=True, verbose_name="شرح کالا")
    unit = models.CharField(max_length=50, null=True, blank=True, verbose_name="واحد سنجش")
    scope_discipline = models.CharField(max_length=100, null=True, blank=True, verbose_name="دیسیپلین کاری")
    
    # Quantities
    inventory = models.DecimalField(max_digits=15, decimal_places=3, default=0.0, verbose_name="موجودی فیزیکی")
    bal4miv = models.DecimalField(max_digits=15, decimal_places=3, default=0.0, verbose_name="موجودی مجاز")
    
    # Locations
    new_location = models.CharField(max_length=255, null=True, blank=True, verbose_name="لوکیشن جدید")
    
    # Procurement / Delivery Statuses
    hov_no = models.CharField(max_length=100, null=True, blank=True, verbose_name="شماره HOV")
    hov_date = models.DateField(null=True, blank=True, verbose_name="تاریخ HOV")
    msr_status = models.CharField(max_length=100, null=True, blank=True, verbose_name="وضعیت MSR")
    vendor = models.CharField(max_length=255, null=True, blank=True, verbose_name="سازنده")
    supplier = models.CharField(max_length=255, null=True, blank=True, verbose_name="تامین کننده")
    irn_no = models.CharField(max_length=100, null=True, blank=True, verbose_name="شماره IRN")
    indent = models.CharField(max_length=100, null=True, blank=True, verbose_name="تقاضای خرید")
    remark = models.TextField(null=True, blank=True, verbose_name="ملاحظات")

    # Pricing & Documents (پیمانکار-مدارک)
    price_amount = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, verbose_name="قیمت واحد")
    similar_unit_price = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, verbose_name="قیمت کالای مشابه")
    total_value = models.DecimalField(max_digits=25, decimal_places=2, null=True, blank=True, verbose_name="ارزش کل")
    currency = models.CharField(max_length=50, null=True, blank=True, verbose_name="ارز")
    invoice_type = models.CharField(max_length=100, null=True, blank=True, verbose_name="نوع فاکتور")
    invoice_date = models.CharField(max_length=20, null=True, blank=True, verbose_name="تاریخ فاکتور")
    inv_rti_number = models.CharField(max_length=255, null=True, blank=True, verbose_name="شماره RTI فاکتور")
    added_rti_no = models.CharField(max_length=255, null=True, blank=True, verbose_name="شماره RTI افزوده‌شده")
    page_row = models.CharField(max_length=100, null=True, blank=True, verbose_name="ردیف در فاکتور")
    invoice_page = models.CharField(max_length=100, null=True, blank=True, verbose_name="صفحه فاکتور")
    doc_supplier = models.CharField(max_length=255, null=True, blank=True, verbose_name="تامین‌کننده فاکتور")
    folder_address = models.CharField(max_length=500, null=True, blank=True, verbose_name="مسیر پوشه اسناد")
    hyperlink = models.CharField(max_length=500, null=True, blank=True, verbose_name="هایپرلینک اسناد")
    
    # Old Record statuses for workflow
    tag_status = models.CharField(max_length=50, default='چاپ نشده', verbose_name="وضعیت لیبل")
    field_status = models.CharField(max_length=50, default='waiting', verbose_name="وضعیت میدانی")
    doc_status = models.CharField(max_length=50, default='waiting', verbose_name="وضعیت مستندات")
    
    # Standard System Reference (سامانه یکنواخت)
    desc_from_standard_system = models.TextField(null=True, blank=True, verbose_name="شرح کالا در سامانه یکنواخت")
    unit_from_standard_system = models.CharField(max_length=100, null=True, blank=True, verbose_name="واحد کالا در سامانه یکنواخت")

    # Document Physical Status
    stamp = models.CharField(max_length=20, null=True, blank=True, verbose_name="وضعیت مهر اسناد")
    signature = models.CharField(max_length=20, null=True, blank=True, verbose_name="وضعیت امضای اسناد")

    # Quality / Checks
    has_conflict = models.BooleanField(default=False, verbose_name="مغایرت دارد")
    
    # Custom Tags
    my_tag = models.CharField(max_length=500, null=True, blank=True, verbose_name="تگ‌ها")
    
    # Dynamic Data
    dynamic_data = models.JSONField(default=dict, blank=True, verbose_name="اطلاعات متغیر")
    
    field_assignee = models.CharField(max_length=255, blank=True, null=True, verbose_name="محول شده به میدانی")
    doc_assignee = models.CharField(max_length=255, blank=True, null=True, verbose_name="محول شده به مدارک و قیمت")
    
    # Auditing
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ایجاد")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ ویرایش")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_items', verbose_name="ایجادکننده")
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='modified_items', verbose_name="ویرایش‌کننده")

    class Meta:
        unique_together = ('warehouse', 'fa_unic_code')
        base_manager_name = 'all_objects'  # روابط FK حتی به رکوردهای حذف‌نرم دسترسی داشته باشند
        indexes = [
            GinIndex(
                name='item_desc_gin_idx',
                fields=['description'],
                opclasses=['gin_trgm_ops']
            ),
            GinIndex(
                name='item_code_gin_idx',
                fields=['fa_unic_code'],
                opclasses=['gin_trgm_ops']
            )
        ]

    def __str__(self):
        return f"{self.fa_unic_code} - {self.description[:30]}"

class ImportLog(models.Model):
    import_id = models.CharField(max_length=100, null=True, blank=True, unique=True, verbose_name="شناسه یکتای فرآیند")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='import_logs', null=True, blank=True)
    imported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    imported_at = models.DateTimeField(auto_now_add=True)
    file_name = models.CharField(max_length=255)
    records_created = models.IntegerField(default=0)
    records_updated = models.IntegerField(default=0)
    records_skipped = models.IntegerField(default=0)
    records_failed = models.IntegerField(default=0)
    conflict_strategy = models.CharField(max_length=50, default='ignore')
    is_reverted = models.BooleanField(default=False, verbose_name="بازگردانی شده")
    
    # Store errors as JSON
    error_details = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['-imported_at']

    def __str__(self):
        return f"Import {self.file_name} at {self.imported_at}"

class ImportHistory(models.Model):
    import_log = models.ForeignKey(ImportLog, on_delete=models.CASCADE, related_name='histories')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, null=True, blank=True)
    action = models.CharField(max_length=20) # 'create' or 'update'
    previous_state = models.JSONField(null=True, blank=True)

    def __str__(self):
        return f"{self.action} on Item {self.item_id}"

class ItemPhoto(SyncModelMixin):
    SOURCE_CHOICES = [
        ('camera', 'دوربین انبار'),
        ('gallery', 'گالری / فایل'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='photos', verbose_name="کالا")
    image = models.ImageField(upload_to='item_photos/originals/%Y/%m/', verbose_name="تصویر اصلی (WebP)")
    medium = models.ImageField(upload_to='item_photos/medium/%Y/%m/', null=True, blank=True, verbose_name="تصویر متوسط")
    thumbnail = models.ImageField(upload_to='item_photos/thumbnails/%Y/%m/', null=True, blank=True, verbose_name="بندانگشتی")
    
    caption = models.CharField(max_length=255, blank=True, null=True, verbose_name="توضیح عکس")
    is_primary = models.BooleanField(default=False, verbose_name="تصویر شاخص")
    display_order = models.PositiveIntegerField(default=0, verbose_name="ترتیب نمایش")
    file_size = models.PositiveIntegerField(default=0, verbose_name="حجم فایل (بایت)")
    width = models.PositiveIntegerField(default=0, verbose_name="عرض")
    height = models.PositiveIntegerField(default=0, verbose_name="ارتفاع")
    
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='gallery', verbose_name="منبع تصویر")
    count_task = models.ForeignKey('CountTask', on_delete=models.SET_NULL, null=True, blank=True, related_name='task_photos', verbose_name="تسک شمارش مرتبط")
    
    # Auditing
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ ویرایش")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_item_photos', verbose_name="ثبت‌کننده")
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='modified_item_photos', verbose_name="ویرایش‌کننده")

    class Meta:
        # هم‌تراز با PHOTO_ORDERING در inventory/views_photos.py. پیش از این،
        # Meta با display_order شروع می‌شد ولی ویوها با -is_primary؛ نتیجه این
        # بود که «عکس شاخص» بسته به مسیر درخواست جای متفاوتی می‌ایستاد و
        # عکس اول در UI با عکس شاخص یکی نبود.
        ordering = ['-is_primary', 'display_order', '-created_at', '-id']
        verbose_name = "عکس کالا"
        verbose_name_plural = "عکس‌های کالا"
        base_manager_name = 'all_objects'
        indexes = [
            # کوئری غالب: عکس‌های زنده یک کالا به ترتیب نمایش
            models.Index(fields=['item', 'is_deleted', '-is_primary', 'display_order'],
                         name='itemphoto_item_live_order_idx'),
        ]

    def __str__(self):
        return f"Photo for {self.item.fa_unic_code} ({'Primary' if self.is_primary else self.id})"

class CountTask(SyncModelMixin):
    STATUS_CHOICES = [
        ('PENDING_COUNT', 'در انتظار شمارش'),
        ('INITIAL_COUNT', 'شمارش اولیه (ثبت موقت)'),
        ('COUNTED', 'شمارش شده (نزد سرپرست)'),
        ('SUPERVISOR_REJECTED', 'رد شده توسط سرپرست'),
        ('MANAGER_REVIEW', 'در انتظار تایید مدیر'),
        ('MANAGER_REJECTED', 'درخواست بازشماری (رد مدیر)'),
        ('FINAL_APPROVED', 'تایید نهایی'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='count_tasks', verbose_name="کالا")
    counter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='counter_tasks', verbose_name="شمارشگر", null=True, blank=True)
    supervisor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='supervisor_tasks', verbose_name="سرپرست", null=True, blank=True)
    assigned_manager = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='assigned_manager_tasks', verbose_name="مدیر اختصاصی", null=True, blank=True)
    
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='PENDING_COUNT', verbose_name="وضعیت")
    
    counted_balance = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True, verbose_name="مقدار شمرده شده")
    
    counter_note = models.TextField(null=True, blank=True, verbose_name="توضیحات شمارشگر")
    supervisor_note = models.TextField(null=True, blank=True, verbose_name="توضیحات سرپرست")
    manager_note = models.TextField(null=True, blank=True, verbose_name="توضیحات مدیر")
    skip_supervisor = models.BooleanField(default=False, verbose_name="بدون نیاز به سرپرست")
    
    # Auditing
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_count_tasks')
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='modified_count_tasks')

    class Meta:
        ordering = ['-created_at']
        base_manager_name = 'all_objects'  # روابط FK حتی به رکوردهای حذف‌نرم دسترسی داشته باشند

    def __str__(self):
        return f"Count Task for {self.item.fa_unic_code} - {self.get_status_display()}"

class CountTaskHistory(SyncModelMixin):
    task = models.ForeignKey(CountTask, on_delete=models.CASCADE, related_name='history', verbose_name="تسک شمارش")
    action_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='action_histories', verbose_name="اقدام کننده")
    action_type = models.CharField(max_length=50, verbose_name="نوع اقدام")
    counted_balance = models.DecimalField(max_digits=15, decimal_places=3, null=True, blank=True, verbose_name="مقدار شمرده شده")
    note = models.TextField(null=True, blank=True, verbose_name="توضیحات در لحظه ثبت")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ثبت")
    # برای cursor سینک (Pull) لازم است؛ رکورد تاریخچه immutable است پس عملاً برابر created_at می‌ماند
    updated_at = models.DateTimeField(auto_now=True, verbose_name="زمان به‌روزرسانی")

    class Meta:
        ordering = ['created_at']
        base_manager_name = 'all_objects'  # روابط FK حتی به رکوردهای حذف‌نرم دسترسی داشته باشند

    def __str__(self):
        return f"{self.action_type} on {self.task_id} by {self.action_by_id}"

class DocTask(models.Model):
    STATUS_CHOICES = [
        ('PENDING_DOC', 'در انتظار اسناد'),
        ('DOC_PROCESSED', 'بررسی شده (توسط بررسی‌کننده)'),
        ('DOC_SUPERVISOR_REJECTED', 'رد شده توسط سرپرست اسناد'),
        ('DOC_MANAGER_REVIEW', 'در انتظار تایید مدیر'),
        ('DOC_MANAGER_REJECTED', 'مغایرت تاییدشده (رد مدیر)'),
        ('DOC_FINAL_APPROVED', 'تایید نهایی'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='doc_tasks', verbose_name="کالا")
    doc_worker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='doc_worker_tasks', verbose_name="بررسی‌کننده", null=True, blank=True)
    doc_supervisor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='doc_supervisor_tasks', verbose_name="سرپرست اسناد", null=True, blank=True)
    assigned_manager = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='doc_assigned_manager_tasks', verbose_name="مدیر ارجاع‌دهنده", null=True, blank=True)
    
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='PENDING_DOC', verbose_name="وضعیت")
    skip_supervisor = models.BooleanField(default=False, verbose_name="بدون نیاز به سرپرست اسناد")
    
    worker_note = models.TextField(null=True, blank=True, verbose_name="توضیحات بررسی‌کننده")
    supervisor_note = models.TextField(null=True, blank=True, verbose_name="توضیحات سرپرست اسناد")
    manager_note = models.TextField(null=True, blank=True, verbose_name="توضیحات مدیر")
    
    # ─── فیلدهای مالی ───
    INVOICE_TYPE_CHOICES = [
        ('formal',      'رسمی/مالیاتی'),
        ('domestic',    'خریدهای داخلی'),
        ('foreign',     'خریدهای خارجی'),
        ('consignment', 'امانی'),
    ]
    CURRENCY_CHOICES = [
        ('IRR',   'ریال'),
        ('USD',   'دلار'),
        ('EUR',   'یورو'),
        ('OTHER', 'سایر'),
    ]

    added_rti_no       = models.CharField(max_length=100, null=True, blank=True, verbose_name="شماره RTI اضافه‌شده")
    inv_rti_number     = models.CharField(max_length=100, null=True, blank=True, verbose_name="شماره RTI فاکتور")
    invoice_type       = models.CharField(max_length=20, choices=INVOICE_TYPE_CHOICES, null=True, blank=True, verbose_name="نوع فاکتور")
    invoice_date       = models.DateField(null=True, blank=True, verbose_name="تاریخ فاکتور")
    invoice_page       = models.PositiveIntegerField(null=True, blank=True, verbose_name="صفحه فاکتور")
    page_row           = models.PositiveIntegerField(null=True, blank=True, verbose_name="ردیف صفحه")
    doc_supplier       = models.CharField(max_length=255, null=True, blank=True, verbose_name="تأمین‌کننده")
    total_value        = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, verbose_name="ارزش کل")
    price_amount       = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, verbose_name="مبلغ")
    similar_unit_price = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True, verbose_name="قیمت مشابه")
    currency           = models.CharField(max_length=10, choices=CURRENCY_CHOICES, null=True, blank=True, verbose_name="ارز")
    folder_address     = models.CharField(max_length=500, null=True, blank=True, verbose_name="آدرس پوشه")
    stamp              = models.BooleanField(default=False, verbose_name="مهر")
    signature          = models.BooleanField(default=False, verbose_name="امضا")

    # ─── Local-First sync ───
    sync_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, verbose_name="شناسه سینک")
    is_deleted = models.BooleanField(default=False, db_index=True, verbose_name="حذف‌شده (نرم)")

    # Auditing
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_doc_tasks')
    modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='modified_doc_tasks')

    objects = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        base_manager_name = 'all_objects'

    def soft_delete(self, save: bool = True):
        self.is_deleted = True
        if save:
            self.save(update_fields=['is_deleted', 'updated_at'])

    def __str__(self):
        return f"DocTask {self.id} for Item {self.item_id}"


class DocTaskHistory(models.Model):
    task = models.ForeignKey(DocTask, on_delete=models.CASCADE, related_name='history', verbose_name="تسک اسناد")
    action_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='doc_action_histories', verbose_name="انجام‌دهنده")
    action_type = models.CharField(max_length=50, verbose_name="نوع عملیات")
    data_snapshot = models.JSONField(null=True, blank=True, verbose_name="اسنپ‌شات اطلاعات در لحظه عملیات")
    note = models.TextField(null=True, blank=True, verbose_name="یادداشت در زمان ثبت")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ثبت")

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.action_type} on {self.task_id} by {self.action_by_id}"

