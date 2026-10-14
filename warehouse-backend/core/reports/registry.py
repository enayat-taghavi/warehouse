"""
رجیستری موجودیت/فیلد گزارش‌ساز پلتفرم — طرح راه میانهٔ ماژولار (گام ۳-ب).
مرجع: Documents/Modular_Middle_Path/implementation_plan_modular_middle_path.md

موتور عام کوئری و قراردادهای ساختاری در `platform_core.query_engine` مستقر هستند.
موجودیت‌ها و JOINهای هر ماژول مستقل در `report_entities.py` همان ماژول تعریف شده
و در متد `ready()` به رجیستری مرکزی ثبت می‌شوند.
این فایل اکنون صرفاً موجودیت‌های هسته/پلتفرم (مانند کاربران) را ثبت کرده و توابع
سازگاری رو به عقب را ارائه می‌دهد.
"""
from typing import Dict
from django.db.models import Count

from platform_core.query_engine import (
    AGG_FUNCTIONS,
    COMMON_FIELD_LABELS,
    EntityConfig,
    FieldDef,
    JoinDef,
    OPERATORS_BY_TYPE,
    SENSITIVE_BYPASS_PERMS,
    _auto_fields,
    _clean_persian_label,
    _map_model_field,
    _person_name_annotation,
    get_all_entities,
    get_all_joins,
    get_entity,
    get_joins_for_entity,
    register_entity,
    register_joins,
)


class _JoinsProxy(dict):
    """پروکسی دیکشنری برای دسترسی پویا به JOINهای ثبت‌شده جهت حفظ سازگاری رو به عقب."""
    def __getitem__(self, key):
        return get_all_joins()[key]

    def get(self, key, default=None):
        return get_all_joins().get(key, default)

    def keys(self):
        return get_all_joins().keys()

    def items(self):
        return get_all_joins().items()

    def values(self):
        return get_all_joins().values()

    def __iter__(self):
        return iter(get_all_joins())

    def __len__(self):
        return len(get_all_joins())

    def __contains__(self, key):
        return key in get_all_joins()

    def __repr__(self):
        return repr(get_all_joins())


# سازگاری رو به عقب برای کدهایی که JOINS یا WAREHOUSE_JOINS را مستقیماً از این فایل می‌خوانند
JOINS = _JoinsProxy()
WAREHOUSE_JOINS = JOINS


def _register_platform_entities():
    """ثبت موجودیت‌های پلتفرمی هسته (کاربران)."""
    from django.apps import apps
    if apps.is_installed('accounts'):
        from accounts.models import CustomUser
        user_extra = {}
        # فیلد اضافه تعداد انبارهای تخصیص‌یافته در صورت فعال بودن انبار
        if apps.is_installed('warehouses'):
            user_extra['assigned_warehouses_count'] = FieldDef(
                key='assigned_warehouses_count', source='assigned_warehouses_count',
                label='تعداد انبارهای تخصیص‌یافته', type='number',
                groupable=False, aggregatable=False,
                annotation=lambda base_prefix=None: Count(
                    f'{base_prefix}__assigned_warehouses' if base_prefix else 'assigned_warehouses',
                    distinct=True,
                ),
            )
        register_entity(
            EntityConfig(
                key='users', label='کاربران', model=CustomUser,
                permissions=('view_sys_users',),
                scope_path=None,
                include=('id', 'username', 'first_name', 'last_name', 'phone_number',
                         'operational_zone', 'is_active', 'date_joined'),
                extra=user_extra,
                module_code='platform',
            ),
            module_code='platform'
        )


def register_warehouse_reports():
    """ثبت موجودیت‌ها و روابط ماژول‌های سامانه در رجیستری مرکزی پلتفرم."""
    _register_platform_entities()
    from platform_core.registry import contributions
    for registrar in contributions('report_registrars'):
        try:
            registrar()
        except Exception:
            pass


def get_registry():
    """دریافت کل دیکشنری رجیستری برای موجودیت‌ها (سازگاری کامل رو به عقب)."""
    register_warehouse_reports()
    return get_all_entities()
