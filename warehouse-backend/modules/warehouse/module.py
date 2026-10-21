"""
مشخصات ماژول انبارداری و انبارگردانی (warehouse) — طرح راه میانهٔ ماژولار (گام ۳).
"""
from platform_core.registry import ModuleSpec

WAREHOUSE_SPEC = ModuleSpec(
    code='warehouse',
    title_fa='سامانه انبارداری و انبارگردانی',
    django_apps=('warehouses.apps.WarehousesConfig', 'inventory.apps.InventoryConfig'),
    api_prefixes=('api/warehouses/', 'api/inventory/'),
    permission_markers=(
        'accounts.view_sys_counter',
        'accounts.view_sys_supervisor',
        'accounts.can_act_as_wh_supervisor',
        'accounts.view_sys_manager_review',
        'accounts.can_act_as_wh_manager',
        'accounts.view_sys_recounts',
        'accounts.view_wh_dispatch',
        'accounts.view_wh_docs',
        'accounts.view_wh_doc_approvals',
        'accounts.perm_inventory_finalize',
        'accounts.perm_doc_approve_action',
        'inventory.view_item',
        'warehouses.view_warehouse',
        'inventory.add_item',
        'inventory.change_item',
    ),
    roles=('counter', 'warehouse_supervisor', 'docs_specialist', 'manager_review', 'superuser'),
    url_includes=(
        ('api/warehouses/', 'warehouses.urls'),
        ('api/inventory/', 'inventory.urls'),
    ),
    audit_modules=(
        ('docs', 'مدیریت کالا (انبار)'),
        ('dispatch', 'تخصیص کالا (انبار)'),
        ('customs', 'فیلدهای مالی/گمرکی (انبار)'),
        ('feeding', 'تغذیه سامانه‌های MT (انبار)'),
        ('labels', 'لیبلینگ و بارکد (انبار)'),
        ('counter', 'میزکار شمارش کور'),
        ('supervisor', 'کارتابل سرپرست شمارش'),
        ('manager', 'بررسی نهایی مدیر'),
    ),
    audit_scope_keys=('docs', 'dispatch', 'customs', 'feeding', 'labels', 'counter', 'supervisor', 'manager', 'warehouses'),
    sod_app_module='warehouse',
    aliases=(),
    allowed_app_code='warehouse',
    scope_codes=('warehouse',),
    default_priority=20,
    active_priority=10,
    public_read_prefixes=('/api/warehouses/',),
    reports_fallback=True,
)

MODULE_SPEC = WAREHOUSE_SPEC
SPEC = WAREHOUSE_SPEC

WAREHOUSE_PERMISSION_CODENAMES = (
    'view_wh_dashboard', 'view_wh_docs', 'view_wh_dispatch', 'view_sys_counter',
    'view_wh_customs', 'view_sys_supervisor', 'view_sys_manager_review', 'view_sys_recounts',
    'view_wh_attendance', 'view_wh_doc_approvals', 'view_wh_feeding', 'view_wh_feed_approvals',
    'view_wh_labels', 'view_wh_label_designer', 'view_wh_audit', 'view_wh_settings',
    'view_wh_stocktaking', 'view_warehouse', 'add_warehouse', 'change_warehouse', 'delete_warehouse',
    'view_record', 'add_record', 'change_record', 'delete_record',
    'can_act_as_counter', 'can_act_as_supervisor', 'can_act_as_manager',
    'can_act_as_doc_worker', 'can_act_as_doc_supervisor',
    'perm_doc_approve_action', 'perm_feed_approve_action', 'perm_inventory_finalize',
    'perm_rec_dispatch', 'perm_rec_recount', 'perm_rec_label', 'perm_rec_import',
    'perm_wh_create', 'perm_wh_edit', 'perm_wh_freeze',
    'can_act_as_wh_supervisor', 'can_act_as_wh_manager',
)

PERMISSION_CODENAMES = WAREHOUSE_PERMISSION_CODENAMES

# مجوزهای سفارشی این ماژول روی accounts.CustomUser (کد، نام فارسی).
# هسته ردیف‌های Permission ماژول نصب‌شده را در post_migrate می‌سازد (فقط ایجاد، هرگز حذف).
# نام‌ها همان نام فعلی ردیف‌ها در دیتابیس‌اند (seed_permissions آن‌ها را هم‌گام نگه می‌دارد).
WAREHOUSE_PERMISSIONS = (
    ('view_sys_counter', 'میزکار شمارش کور'),
    ('view_sys_supervisor', 'کارتابل سرپرست شمارش'),
    ('view_sys_manager_review', 'بررسی نهایی مدیر'),
    ('view_sys_recounts', 'بررسی مغایرت و بازشماری'),
    ('view_wh_dashboard', 'داشبورد انبار'),
    ('view_wh_docs', 'مدیریت کالا (انبار)'),
    ('view_wh_dispatch', 'تخصیص کالا (انبار)'),
    ('view_wh_attendance', 'ثبت کارکرد و سرویس ناوگان (انبار)'),
    ('view_wh_customs', 'فیلدهای مالی و گمرکی (انبار)'),
    ('view_wh_doc_approvals', 'تاییدات سرپرست اسناد (انبار)'),
    ('view_wh_feeding', 'مدیریت و تغذیه MT (انبار)'),
    ('view_wh_feed_approvals', 'تاییدات سرپرست تغذیه (انبار)'),
    ('view_wh_labels', 'چاپ مجدد و اسکن لیبل (انبار)'),
    ('view_wh_label_designer', 'طراحی و کانفیگ لیبل (انبار)'),
    ('view_wh_audit', 'رهگیری تغییرات و ممیزی (انبار)'),
    ('view_wh_settings', 'تنظیمات انبار'),
    ('view_wh_stocktaking', 'انبارگردانی و پیگیری شمارش (انبار)'),
    ('perm_wh_create', 'تعریف کارگاه/انبار جدید'),
    ('perm_wh_edit', 'ویرایش مشخصات انبارها'),
    ('perm_wh_freeze', 'فریز کردن و توقف عملیات انبار'),
    ('perm_rec_import', 'تزریق و آپلود فایل پایه (Excel)'),
    ('perm_rec_dispatch', 'تخصیص رکورد به شمارشگر میدانی'),
    ('perm_rec_label', 'صدور دستور چاپ لیبل و QR Code'),
    ('perm_rec_recount', 'صدور دستور بازشماری (مغایرت)'),
    ('can_act_as_counter', 'شمارنده و انبارگردانی میدانی'),
    ('can_act_as_supervisor', 'سرپرست شمارش (تایید مغایرت‌ها)'),
    ('can_act_as_wh_supervisor', 'سرپرست شمارش انبار (تایید مغایرت‌ها)'),
    ('can_act_as_manager', 'مدیر انبار (تایید نهایی)'),
    ('can_act_as_wh_manager', 'مدیر انبار و شمارش (تایید نهایی انبار)'),
    ('can_act_as_doc_worker', 'کارشناس اسناد مالی'),
    ('can_act_as_doc_supervisor', 'سرپرست اسناد'),
    ('perm_doc_approve_action', 'تایید، رد و ثبت امضای اسناد'),
    ('perm_feed_approve_action', 'تایید و اعمال فیدهای تغذیه/گمرکی'),
    ('perm_inventory_finalize', 'تایید نهایی و بستن دوره‌های انبارگردانی'),
)

PERMISSIONS = WAREHOUSE_PERMISSIONS
