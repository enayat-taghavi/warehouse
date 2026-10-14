"""
کاتالوگ استاتیک ماژول‌های نصب‌شدنی — فاز ۳.

این فایل در زمان بارگذاری settings ایمپورت می‌شود (پیش از آماده‌شدن Django apps)
تا `INSTALLED_APPS` بتواند از آن ساخته شود (تسک ۳۵). همین مشخصات در `ready()`
هر ماژول به رجیستریِ زمان اجرا (`platform_core.registry.register_module`) نیز
ثبت می‌شود تا `module_for_path`/`installed_modules` کار کنند.

منبع permission_markers و roles: `accounts/middleware.py` (get_user_allowed_apps و
get_user_valid_roles_for_app) — عیناً، تا رفتار امروز حفظ شود.
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
    sod_app_module='warehouse',
)


ACCOUNTING_SPEC = ModuleSpec(
    code='accounting',
    title_fa='سامانه کارکرد، مالی و خزانه‌داری',
    django_apps=('personnel.apps.PersonnelConfig',),
    api_prefixes=('api/personnel/',),
    permission_markers=(
        'accounts.view_sys_personnel',
        'accounts.view_sys_personnel_attendance',
        'accounts.view_sys_payroll',
        'accounts.view_sys_treasury',
        'accounts.view_sys_fleet_attendance',
        'accounts.view_sys_fleet_settlement',
        'accounts.can_act_as_operator',
        'accounts.can_act_as_workshop_supervisor',
        'accounts.can_act_as_accountant',
        'accounts.can_act_as_company_manager',
        'accounts.perm_approve_personnel_supervisor',
        'accounts.perm_approve_fleet_supervisor',
        'accounts.perm_approve_personnel_finance',
        'accounts.perm_approve_fleet_finance',
        'accounts.perm_approve_personnel_manager',
        'accounts.perm_approve_fleet_manager',
        'accounts.perm_manager_payment_authorize',
        'accounts.perm_treasury_disburse_action',
        'accounts.perm_manage_projects_sections',
        'accounts.perm_lock_work_period',
    ),
    roles=('operator', 'supervisor', 'accountant', 'manager', 'treasury', 'org_admin', 'superuser'),
    url_includes=(
        ('api/personnel/', 'personnel.urls'),
    ),
    audit_modules=(
        ('attendance', 'کارکرد پرسنل'),
        ('fleet', 'کارکرد ناوگان و ماشین‌آلات'),
        ('payroll', 'محاسبات حقوق و دستمزد پرسنل'),
        ('treasury', 'کارتابل خزانه‌داری و پرداخت'),
        ('projects', 'پروژه‌ها و بخش‌ها'),
        ('invoices', 'فاکتورهای هزینه'),
    ),
    sod_app_module='personnel',
)


MODULE_CATALOG = {
    'warehouse': WAREHOUSE_SPEC,
    'accounting': ACCOUNTING_SPEC,
}


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
)

ACCOUNTING_PERMISSION_CODENAMES = (
    'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
    'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
    'can_act_as_operator', 'can_act_as_accountant',
    'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor',
    'perm_approve_personnel_manager', 'perm_approve_fleet_manager',
    'perm_approve_personnel_finance', 'perm_approve_fleet_finance',
    'perm_lock_work_period', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
    'perm_manage_projects_sections',
)


def get_disallowed_permission_codenames() -> set[str]:
    """
    برگرداندن کدهای دسترسی ماژول‌هایی که در حال حاضر نصب یا فعال نیستند.
    جهت اعمال کنترل دفاع در عمق (Defense in Depth) در لایه API و اعتبارسنجی نقش‌ها.
    """
    from platform_core.registry import installed_modules
    installed = set(installed_modules())
    disallowed = set()
    if 'warehouse' not in installed:
        disallowed.update(WAREHOUSE_PERMISSION_CODENAMES)
    if 'accounting' not in installed:
        disallowed.update(ACCOUNTING_PERMISSION_CODENAMES)
    return disallowed

