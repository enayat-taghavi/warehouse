"""
موجودیت انبارها برای موتور گزارش‌ساز پلتفرم — طرح راه میانهٔ ماژولار (گام ۳-ب).
"""
from django.apps import apps
from platform_core.query_engine import (
    EntityConfig,
    FieldDef,
    register_entity,
)


def build_warehouse_entities():
    """ساخت تعریف موجودیت انبارها."""
    from warehouses.models import Warehouse

    def fk_text(key, label, groupable=True):
        return FieldDef(key=key, source=key, label=label, type='text', groupable=groupable)

    return [
        EntityConfig(
            key='warehouses', label='انبارها', model=Warehouse,
            permissions=('view_sys_projects',),
            scope_path='id',
            scope_kind='warehouse',
            related={
                'manager__username': fk_text('manager__username', 'نام کاربری مدیر'),
                'parent_warehouse__name': fk_text('parent_warehouse__name', 'انبار والد'),
            },
            select_related=('manager', 'parent_warehouse'),
            module_code='warehouse',
        )
    ]


def register_warehouse_report_entities():
    """ثبت موجودیت‌های انبار (و در صورت نصب، کالا) در رجیستری گزارش‌ساز."""
    for ent in build_warehouse_entities():
        register_entity(ent, module_code='warehouse')

    if apps.is_installed('inventory'):
        try:
            from inventory.report_entities import register_inventory_report_entities
            register_inventory_report_entities()
        except ImportError:
            pass
