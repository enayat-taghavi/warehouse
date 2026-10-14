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
    sod_app_module='warehouse',
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
)

PERMISSION_CODENAMES = WAREHOUSE_PERMISSION_CODENAMES
