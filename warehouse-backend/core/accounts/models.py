from django.db import models
from django.contrib.auth.models import AbstractUser, Group

from django.utils import timezone

class CustomUser(AbstractUser):
    # New Fields
    requires_password_change = models.BooleanField(default=True)
    password_changed_at = models.DateTimeField(default=timezone.now)
    national_code = models.CharField(max_length=10, unique=True, null=True, blank=True)
    phone_number = models.CharField(max_length=15, null=True, blank=True)
    operational_zone = models.CharField(max_length=100, null=True, blank=True)
    supervisor = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')
    company = models.CharField(max_length=150, null=True, blank=True, verbose_name="شرکت متبوع")
    address = models.TextField(null=True, blank=True, verbose_name="آدرس")
    avatar = models.ImageField(upload_to='avatars/%Y/%m/', null=True, blank=True, verbose_name="تصویر پرسنلی")
    blood_type = models.CharField(max_length=10, null=True, blank=True, verbose_name="گروه خونی")
    emergency_contact = models.CharField(max_length=50, null=True, blank=True, verbose_name="شماره تماس اضطراری")
    
    # فاز ۲ §۲.۱ — M2M به اپ انبار منتقل شد (همان جدول، همان اکسسور).
    # برای حفظ `user.assigned_warehouses` و `warehouse.assigned_users`، M2M اکنون
    # روی `Warehouse` در اپ `warehouses` اعلام می‌شود (به `warehouses/models.py` مراجعه کنید).
    ui_preferences = models.JSONField(default=dict, blank=True)
    
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='created_users')
    modified_by = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='modified_users')

    def __str__(self):
        return f"{self.username}"

    @property
    def primary_company(self):
        """
        دریافت شرکت اصلی کاربر از طریق جدول دسترسی‌های سازمانی یا انتساب مستقیم
        """
        try:
            access = self.company_accesses.filter(is_default=True).first() or self.company_accesses.first()
            if access and access.company:
                return access.company
        except Exception:
            pass
        return None

    class Meta:
        ordering = ['-id']
        permissions = [
            # System Tabs (منوی اصلی)
            ("view_sys_dashboard", "داشبورد مانیتورینگ کلی"),
            ("view_sys_users", "مدیریت کاربران و نقش‌ها"),
            ("view_sys_projects", "مدیریت انبارها و پروژه‌ها"),
            ("view_sys_id_cards", "صدور کارت پرسنلی"),
            ("view_sys_counter", "میزکار شمارش کور"),
            ("view_sys_supervisor", "کارتابل سرپرست شمارش"),
            ("view_sys_manager_review", "بررسی نهایی مدیر"),
            ("view_sys_export", "صدور فایل تغذیه"),
            ("view_sys_recounts", "بررسی مغایرت و بازشماری"),
            ("view_sys_settings", "تنظیمات سیستم"),
            ("view_sys_reports", "گزارش‌ساز"),
            ("view_sys_personnel", "مدیریت پرسنل و کارگزینی"),
            ("view_sys_personnel_attendance", "ثبت کارکرد پرسنل"),
            ("view_sys_fleet_attendance", "ثبت کارکرد ناوگان و ماشین‌آلات"),
            ("view_sys_payroll", "محاسبات حقوق و دستمزد پرسنل"),
            ("view_sys_fleet_settlement", "تسویه و محاسبات مالی ناوگان"),
            ("perm_sys_settings", "تنظیمات کلان سیستم"),
            ("perm_sys_logs", "مشاهده لاگ‌های امنیتی (Audit)"),
            ("perm_usr_add", "ثبت پرسنل جدید"),
            ("perm_usr_edit", "ویرایش پرونده پرسنلی"),
            ("perm_usr_role", "تغییر ساختار سازمانی و نقش‌ها"),
            ("perm_manage_projects_sections", "مدیریت پروژه‌ها و بخش‌ها"),
            
            # Warehouse Tabs (منوی انبار)
            ("view_wh_dashboard", "داشبورد انبار"),
            ("view_wh_docs", "مدیریت کالا (انبار)"),
            ("view_wh_dispatch", "تخصیص کالا (انبار)"),
            ("view_wh_attendance", "ثبت کارکرد و سرویس ناوگان (انبار)"),
            ("view_wh_customs", "فیلدهای مالی و گمرکی (انبار)"),
            ("view_wh_doc_approvals", "تاییدات سرپرست اسناد (انبار)"),
            ("view_wh_feeding", "مدیریت و تغذیه MT (انبار)"),
            ("view_wh_feed_approvals", "تاییدات سرپرست تغذیه (انبار)"),
            ("view_wh_labels", "چاپ مجدد و اسکن لیبل (انبار)"),
            ("view_wh_label_designer", "طراحی و کانفیگ لیبل (انبار)"),
            ("view_wh_audit", "رهگیری تغییرات و ممیزی (انبار)"),
            ("view_wh_settings", "تنظیمات انبار"),
            ("view_wh_stocktaking", "انبارگردانی و پیگیری شمارش (انبار)"),
            ("perm_wh_create", "تعریف کارگاه/انبار جدید"),
            ("perm_wh_edit", "ویرایش مشخصات انبارها"),
            ("perm_wh_freeze", "فریز کردن و توقف عملیات انبار"),

            # Records & Inventory Operations (عملیات و رکوردهای میدانی)
            ("perm_rec_import", "تزریق و آپلود فایل پایه (Excel)"),
            ("perm_rec_dispatch", "تخصیص رکورد به شمارشگر میدانی"),
            ("perm_rec_label", "صدور دستور چاپ لیبل و QR Code"),
            ("perm_rec_recount", "صدور دستور بازشماری (مغایرت)"),

            # Operational Roles & Workflow (فرآیندی، نقش‌های عملیاتی و کارتابل‌ها)
            ("can_act_as_counter", "شمارنده و انبارگردانی میدانی"),
            ("can_act_as_supervisor", "سرپرست شمارش انبار (قدیمی/سازگاری)"),
            ("can_act_as_wh_supervisor", "سرپرست شمارش انبار (تایید مغایرت‌ها)"),
            ("can_act_as_manager", "مدیر انبار (قدیمی/سازگاری)"),
            ("can_act_as_wh_manager", "مدیر انبار و شمارش (تایید نهایی انبار)"),
            ("can_act_as_doc_worker", "کارشناس اسناد مالی"),
            ("can_act_as_doc_supervisor", "سرپرست اسناد"),
            ("can_act_as_operator", "کارمند کارگاه و ثبت کارکرد"),
            ("can_act_as_workshop_supervisor", "سرپرست کارگاه (تایید اولیه کارکرد پرسنل و ناوگان)"),
            ("can_act_as_accountant", "حسابدار و کارشناس مالی"),
            ("can_act_as_company_manager", "مدیر شرکت (تایید نهایی و مجوز پرداخت)"),

            # Approvals & Actions (تاییدات و چرخه تاییدات)
            ("view_sys_treasury", "کارتابل خزانه‌داری و پرداخت"),
            ("perm_doc_approve_action", "تایید، رد و ثبت امضای اسناد"),
            ("perm_feed_approve_action", "تایید و اعمال فیدهای تغذیه/گمرکی"),
            ("perm_inventory_finalize", "تایید نهایی و بستن دوره‌های انبارگردانی"),
            ("perm_lock_work_period", "قفل و تایید نهایی کارکرد ماهانه"),
            ("perm_approve_personnel_supervisor", "تایید مرحله سرپرست انبار برای پرسنل"),
            ("perm_approve_personnel_manager", "تایید مرحله اول (عملیاتی) پرسنل"),
            ("perm_approve_personnel_finance", "تایید مرحله دوم (مالی و بانکی) پرسنل"),
            ("perm_approve_fleet_supervisor", "تایید مرحله سرپرست انبار برای ناوگان"),
            ("perm_approve_fleet_manager", "تایید مرحله اول (عملیاتی) ناوگان و خودروها"),
            ("perm_approve_fleet_finance", "تایید مرحله دوم (مالی و بانکی) ناوگان و خودروها"),
            ("perm_manager_payment_authorize", "صدور مجوز پرداخت نهایی مدیر شرکت"),
            ("perm_treasury_disburse_action", "ثبت واریز و تسویه نهایی خزانه‌داری"),
            ("perm_delete_personnel_nomovement", "حذف پرسنل فاقد سابقه کارکرد و مالی"),
            ("perm_delete_vehicle_nomovement", "حذف خودرو و ناوگان فاقد سابقه کارکرد و مالی"),

            # Sensitive & Critical Permissions (حساس و بحرانی)
            ("perm_rollback_data", "بازگردانی و احیای جامع داده‌ها"),
            ("perm_rollback_single", "بازگردانی تکی یک فیلد یا سند"),
            ("perm_rollback_bulk", "بازگردانی گروهی و زمانی تراکنش‌ها"),
            ("perm_restore_deleted", "احیای داده‌های حذف‌شده"),
            ("perm_sys_backup_manage", "ایجاد و مدیریت فایل‌های پشتیبان"),
            ("perm_sys_backup_restore", "بازیابی پایگاه داده"),
            ("perm_sys_audit_export", "خروجی گرفتن و آرشیو لاگ‌های ممیزی"),
            ("perm_sys_purge_logs", "پاکسازی و حذف قطعی لاگ‌های ممیزی"),
            ("perm_sys_hard_delete", "حذف فیزیکی و قطعی داده‌ها"),
            ("perm_sys_emergency_freeze", "فریز اضطراری و قفل سراسری انبارها"),
            ("perm_sys_factory_reset", "بازنشانی مقادیر اولیه و ریست سیستم"),
        ]

SENSITIVE_PERMISSION_CODENAMES = {
    'perm_rollback_data',
    'perm_rollback_single',
    'perm_rollback_bulk',
    'perm_restore_deleted',
    'perm_sys_backup_manage',
    'perm_sys_backup_restore',
    'perm_sys_audit_export',
    'perm_sys_purge_logs',
    'perm_sys_hard_delete',
    'perm_sys_emergency_freeze',
    'perm_sys_factory_reset',
}


class CustomRole(Group):
    """
    نقش سازمانی سفارشی — توسعه مدل Group جنگو
    فیلدهای اضافه: عنوان فارسی، رنگ سازمانی، والد (سلسله‌مراتب)، نقش سیستمی
    """
    title = models.CharField(max_length=150, verbose_name="عنوان فارسی")
    color = models.CharField(max_length=7, default="#94a3b8", verbose_name="رنگ سازمانی")
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='children',
        verbose_name="نقش والد"
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True, verbose_name="زمان ایجاد")
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True, verbose_name="زمان آخرین ویرایش")
    created_by = models.ForeignKey(
        'CustomUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_roles', verbose_name="ایجادکننده"
    )
    modified_by = models.ForeignKey(
        'CustomUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='modified_roles', verbose_name="ویرایش‌کننده"
    )

    class Meta:
        verbose_name = "نقش سازمانی"
        verbose_name_plural = "نقش‌های سازمانی"

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        
        # Prevent circular dependency in parent
        current = self.parent
        while current:
            if current.id == self.id:
                raise ValidationError({"parent": "حلقه بی‌نهایت! یک نقش نمی‌تواند زیرمجموعه فرزندان خودش باشد."})
            current = current.parent

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title or self.name

    @classmethod
    def get_all_role_ids_for_user(cls, user_obj):
        """
        دریافت شناسه تمام نقش‌های کاربر به همراه کلیه نقش‌های فرزند در درخت سلسله‌مراتب (Hierarchical Role Traversal)
        """
        if not user_obj or not getattr(user_obj, 'is_active', False) or getattr(user_obj, 'is_anonymous', True):
            return set()

        all_ids = set(user_obj.groups.values_list('id', flat=True))
        current_layer_ids = list(cls.objects.filter(id__in=all_ids).values_list('id', flat=True))

        while current_layer_ids:
            children_ids = list(cls.objects.filter(
                parent_id__in=current_layer_ids
            ).exclude(id__in=all_ids).values_list('id', flat=True))
            if not children_ids:
                break
            all_ids.update(children_ids)
            current_layer_ids = children_ids

        return all_ids


class UserTableViewState(models.Model):
    """
    ذخیره‌سازی وضعیت ستون‌های جداول (نمای سفارشی کاربر)
    """
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='table_views')
    table_name = models.CharField(max_length=100)
    view_name = models.CharField(max_length=100)
    columns_state = models.JSONField(default=list)
    is_last_selected = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "نمای جدول"
        verbose_name_plural = "نماهای جدول"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.table_name} - {self.view_name}"


class UserLoginLog(models.Model):
    """
    ثبت تاریخچه ورود و نشست‌های امنیتی کاربران (User Login & Security History)
    """
    STATUS_CHOICES = [
        ('SUCCESS', 'ورود موفق'),
        ('DAILY_ACTIVE', 'حضور روزانه'),
        ('FAILED_CREDENTIALS', 'کلمه عبور نادرست'),
        ('FAILED_LOCKED', 'مسدود شده توسط سیستم ضدنفوذ'),
        ('FAILED_INACTIVE', 'حساب کاربری غیرفعال'),
        ('LOGOUT', 'خروج امن'),
    ]

    user = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='login_logs', verbose_name="کاربر"
    )
    username_attempted = models.CharField(max_length=150, verbose_name="نام کاربری ورودی", db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="آدرس آی‌پی", db_index=True)
    user_agent = models.TextField(null=True, blank=True, verbose_name="مشخصات مرورگر/دستگاه")
    device_model = models.CharField(max_length=150, null=True, blank=True, verbose_name="مدل دستگاه/سخت‌افزار", db_index=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='SUCCESS', verbose_name="وضعیت ورود", db_index=True)
    failure_reason = models.CharField(max_length=255, null=True, blank=True, verbose_name="علت شکست")
    metadata = models.JSONField(default=dict, blank=True, verbose_name="متادیتای تکمیلی")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="زمان رویداد")

    class Meta:
        verbose_name = "لاگ ورود کاربر"
        verbose_name_plural = "لاگ‌های ورود کاربران"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['ip_address', 'created_at']),
            models.Index(fields=['device_model', 'created_at']),
        ]

    def __str__(self):
        return f"{self.username_attempted} - {self.get_status_display()} ({self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else ''})"


# ─────────────────────────────────────────────────────────────────────
# فاز ۲ §۲.۷ — رجیستری ماژول‌های ممیزی (Audit Modules Registry)
# ─────────────────────────────────────────────────────────────────────
# پایهٔ پلتفرم: کاربران، انبارها، تنظیمات، رویداد سیستمی. ماژول‌های انباری و
# حسابداری در `AppConfig.ready()` از طریق `register_audit_modules` ثبت می‌شوند
# تا هسته نام هیچ ماژولی را سخت‌کد نکند.
AUDIT_MODULES = {
    'users': 'کاربران و نقش‌ها',
    'warehouses': 'مدیریت انبارها',
    'settings': 'تنظیمات سیستم و انبار',
    'system': 'رویدادهای سیستمی',
}


def register_audit_modules(modules):
    """ثبت ماژول‌های ممیزیِ متعلق به یک ماژول (درجای همان دیکشنری سراسری)."""
    AUDIT_MODULES.update(dict(modules))


def get_audit_module_choices():
    """فهرست زندهٔ ماژول‌های ممیزی (برای `choices` فیلد `module`)."""
    return list(AUDIT_MODULES.items())


class AuditLog(models.Model):
    """
    ثبت ممیزی عملیات و تغییرات داده‌های سیستم (Audit Trail)
    """
    ACTION_CHOICES = [
        ('CREATE', 'ایجاد رکورد'),
        ('UPDATE', 'ویرایش رکورد'),
        ('DELETE', 'حذف رکورد'),
        ('BULK_UPDATE', 'ویرایش گروهی'),
        ('APPROVE', 'تایید سرپرست'),
        ('REJECT', 'رد درخواست'),
        ('RECOUNT', 'دستور بازشماری'),
        ('PRINT', 'چاپ لیبل / گزارش'),
        ('EXPORT', 'خروجی اکسل/CSV'),
        ('IMPORT', 'تزریق / ایمپورت داده'),
        ('ROLLBACK', 'بازگردانی اطلاعات'),
    ]

    SEVERITY_CHOICES = [
        ('info', 'عادی (اطلاع‌رسانی)'),
        ('warning', 'هشدار (تغییرات محدود/حساس)'),
        ('critical', 'بحرانی (حذف داده / تغییر دسترسی‌ها)'),
    ]

    user = models.ForeignKey(
        CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs', verbose_name="کاربر اقدام‌کننده"
    )
    actor_username = models.CharField(max_length=150, null=True, blank=True, verbose_name="نام کاربری اقدام‌کننده در زمان رویداد")
    actor_name = models.CharField(max_length=255, null=True, blank=True, verbose_name="نام و نام خانوادگی اقدام‌کننده در زمان رویداد")
    # فاز ۲ §۲.۶ — نرم‌کردن ارجاع انبار: به‌جای FK به `warehouses.Warehouse`، یک
    # ستون عددی ساده با همان `db_column` نگه می‌داریم (همان ستون، همان ایندکس،
    # صفر مهاجرت داده) تا هسته به ماژول انبار وابسته نماند.
    warehouse_id = models.IntegerField(
        null=True, blank=True, db_index=True, db_column='warehouse_id',
        verbose_name="شناسهٔ انبار مرتبط",
    )
    company_id = models.IntegerField(
        null=True, blank=True, db_index=True, db_column='company_id',
        verbose_name="شناسهٔ شرکت مرتبط",
    )
    module = models.CharField(max_length=50, choices=get_audit_module_choices, default='system', verbose_name="ماژول", db_index=True)
    action = models.CharField(max_length=50, choices=ACTION_CHOICES, default='UPDATE', verbose_name="نوع عملیات", db_index=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='info', verbose_name="سطح اهمیت", db_index=True)
    
    target_model = models.CharField(max_length=100, null=True, blank=True, verbose_name="مدل هدف", db_index=True)
    target_object_id = models.CharField(max_length=100, null=True, blank=True, verbose_name="شناسه رکورد هدف", db_index=True)
    target_repr = models.CharField(max_length=255, null=True, blank=True, verbose_name="شرح رکورد هدف")
    
    before_state = models.JSONField(null=True, blank=True, verbose_name="وضعیت قبل از تغییر")
    after_state = models.JSONField(null=True, blank=True, verbose_name="وضعیت بعد از تغییر")
    details = models.JSONField(default=dict, blank=True, verbose_name="جزئیات و توضیحات رویداد")
    
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="آدرس آی‌پی")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="زمان ثبت رویداد")

    class Meta:
        verbose_name = "لاگ ممیزی عملیات"
        verbose_name_plural = "لاگ‌های ممیزی عملیات"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['module', 'created_at']),
            models.Index(fields=['action', 'created_at']),
            models.Index(fields=['severity', 'created_at']),
            models.Index(fields=['company_id', 'created_at']),
            models.Index(fields=['warehouse_id', 'created_at']),
            models.Index(fields=['user', 'created_at']),
        ]

    def __init__(self, *args, **kwargs):
        if 'company' in kwargs:
            comp = kwargs.pop('company')
            if 'company_id' not in kwargs and comp is not None:
                kwargs['company_id'] = getattr(comp, 'id', comp)
        if 'warehouse' in kwargs:
            wh = kwargs.pop('warehouse')
            if 'warehouse_id' not in kwargs and wh is not None:
                kwargs['warehouse_id'] = getattr(wh, 'id', wh)
        super().__init__(*args, **kwargs)

    @property
    def warehouse(self):
        """
        سازگاری رو به عقب برای کدهایی که obj.warehouse را می‌خوانند.
        """
        if not self.warehouse_id:
            return None
        from django.apps import apps
        if apps.is_installed('warehouses'):
            Warehouse = apps.get_model('warehouses', 'Warehouse')
            return Warehouse.objects.filter(id=self.warehouse_id).first()
        return None

    def __str__(self):
        return f"[{self.get_module_display()}] {self.get_action_display()} - {self.target_repr or self.target_object_id} ({self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else ''})"


def get_app_module_choices():
    """
    فهرست پویا از رجیستری قابلیت‌ها (فاز ۳ §۳.۶). کد 'personnel' عیناً حفظ می‌شود
    و ماژول‌های رجیستری مثل 'accounting' به‌عنوان alias اضافه می‌شوند تا دادهٔ قدیمی
    SoD (با 'personnel') سازگار بماند.
    """
    from platform_core.registry import installed_modules, get_module
    base = [
        ('warehouse', 'سامانه انبارداری و انبارگردانی'),
        ('personnel', 'سامانه کارکرد، مالی و خزانه‌داری'),
    ]
    seen = {'warehouse', 'personnel'}
    for code in installed_modules():
        spec = get_module(code)
        if spec and code not in seen:
            base.append((code, spec.title_fa))
            seen.add(code)
    return base


class SoDPolicyRule(models.Model):
    """
    مدل ماتریس تفکیک وظایف و خطوط قرمز (Separation of Duties Policy Matrix)
    این جدول جهت ماندگاری و انطباق حاکمیتی در دیتابیس ذخیره شده و در زمان استارت‌آپ در کش Redis لود می‌شود.
    """
    app_module = models.CharField(max_length=50, choices=get_app_module_choices, default='personnel', db_index=True, verbose_name="ماژول کلان")
    role_code = models.CharField(max_length=60, db_index=True, verbose_name="کد نقش سازمانی")
    role_title_fa = models.CharField(max_length=150, blank=True, verbose_name="عنوان فارسی نقش")
    page_route = models.CharField(max_length=150, db_index=True, verbose_name="مسیر صفحه فرانت‌اند")
    action_code = models.CharField(max_length=100, db_index=True, verbose_name="کد عملیات / اقدام")
    action_title_fa = models.CharField(max_length=255, blank=True, verbose_name="عنوان فارسی عملیات")
    is_prohibited = models.BooleanField(default=True, verbose_name="آیا این اقدام خط قرمز و ممنوع است؟")
    prohibition_reason_fa = models.TextField(blank=True, verbose_name="علت و پیام ممیزی فارسی ممنوعیت")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ایجاد")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین بروزرسانی")

    class Meta:
        verbose_name = "قانون تفکیک وظایف (SoD Policy)"
        verbose_name_plural = "ماتریس قوانین تفکیک وظایف (SoD Policies)"
        unique_together = ('app_module', 'role_code', 'page_route', 'action_code')
        ordering = ['app_module', 'role_code', 'page_route', 'action_code']

    def __str__(self):
        status = "🚫 ممنوع" if self.is_prohibited else "✅ مجاز"
        return f"[{self.get_app_module_display()}] {self.role_title_fa or self.role_code} -> {self.action_title_fa or self.action_code} ({status})"


class UserDeviceSession(models.Model):
    """
    پایش زنده نشست‌ها، تبلت‌ها و پایانه‌های متصل به سامانه (Active Multi-Device Telemetry & Session Hub)
    """
    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name='device_sessions',
        verbose_name="کاربر متصل"
    )
    session_key = models.CharField(max_length=128, unique=True, db_index=True, verbose_name="کلید یکتای سشن")
    tab_id = models.CharField(max_length=120, db_index=True, verbose_name="شناسه تب کلاینت")
    device_model = models.CharField(max_length=200, default="ناشناخته", verbose_name="مدل دستگاه")
    os_name = models.CharField(max_length=100, default="Unknown", verbose_name="سیستم‌عامل")
    browser_name = models.CharField(max_length=100, default="Unknown", verbose_name="مرورگر")
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="آدرس آی‌پی")
    app_scope = models.CharField(max_length=50, default="warehouse", verbose_name="قلمرو فعال (انبار/مالی)")
    active_role = models.CharField(max_length=50, default="counter", verbose_name="نقش فعال")
    pending_queue_count = models.PositiveIntegerField(default=0, verbose_name="تعداد تراکنش‌های معلق صف")
    conflict_count = models.PositiveIntegerField(default=0, verbose_name="تعداد تداخل‌های حل‌نشده")
    is_revoked = models.BooleanField(default=False, db_index=True, verbose_name="آیا نشست ابطال شده است؟")
    last_heartbeat = models.DateTimeField(auto_now=True, db_index=True, verbose_name="آخرین پالس زنده")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان شروع نشست")

    class Meta:
        verbose_name = "نشست فعال دستگاه"
        verbose_name_plural = "نشست‌های فعال دستگاه‌ها و ناوگان"
        ordering = ['-last_heartbeat']
        indexes = [
            models.Index(fields=['user', 'is_revoked', 'last_heartbeat']),
            models.Index(fields=['session_key']),
            models.Index(fields=['tab_id']),
        ]

    def __str__(self):
        status = "🚫 ابطال‌شده" if self.is_revoked else "🟢 آنلاین"
        return f"{self.user.username} ({self.device_model}) - {self.tab_id} [{status}]"

