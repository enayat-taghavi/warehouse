from django.apps import AppConfig


# کلیدهای پیش‌فرضِ متعلق به ماژول انبار (فاز ۱ §۱.۷).
# در نصب حسابداری‌تنها این‌ها هرگز ثبت نمی‌شوند و `DEFAULT_SETTINGS` هسته فقط
# کلیدهای پلتفرمی را دارد.
WAREHOUSE_DEFAULT_SETTINGS = {
    'require_supervisor_approval': True,
    'require_doc_supervisor_approval': True,
    'blind_counting': 'blind',
    'default_conflict_strategy': 'ignore',
    'field_permissions_counter': {},
    'field_permissions_doc': {},
    'scanner_row_delimiter': ';',
    'scanner_col_delimiter': '|',
    'counter_can_view_history': True,
    'counter_can_view_previous_notes': True,
    'financial_can_view_history': True,
    'financial_can_view_previous_notes': True,
    'scanner_camera_preset': 'adaptive',
    'scanner_custom_resolution': '1080p',
    'scanner_custom_interval_ms': 60,
    'scanner_custom_roi_size': 850,
    'scanner_custom_try_harder': True,
}

WAREHOUSE_BOOLEAN_KEYS = {
    'require_supervisor_approval',
    'require_doc_supervisor_approval',
    'counter_can_view_history',
    'counter_can_view_previous_notes',
    'financial_can_view_history',
    'financial_can_view_previous_notes',
    'scanner_custom_try_harder',
}


class WarehousesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'warehouses'

    def ready(self):
        # ثبت کلیدهای پیش‌فرض انباری در هستهٔ تنظیمات تا رفتار امروز عیناً حفظ شود.
        from settings_core.services import register_settings_defaults
        register_settings_defaults(WAREHOUSE_DEFAULT_SETTINGS, WAREHOUSE_BOOLEAN_KEYS)

        # فاز ۱ §۱.۳ — بازسازی رفتار CASCADE (به `warehouses/signals` مراجعه کنید).
        import warehouses.signals  # noqa: F401

        # فاز ۳ §۳.۱ — ثبت ماژول انبار در رجیستری قابلیت‌ها. این خودِ رجیستری،
        # ماژول‌های ممیزیِ انباری (audit_modules) را هم در هسته ثبت می‌کند.
        from platform_core.registry import register_module, contribute
        from platform_core.module_catalog import MODULE_CATALOG
        if 'warehouse' in MODULE_CATALOG:
            register_module(MODULE_CATALOG['warehouse'])

        # ثبت تابع حل شرکتِ این انبار در رجیستری هسته (گام ۳ طرح راه میانهٔ ماژولار)
        def _warehouse_company_resolver(wh_id):
            from warehouses.models import Warehouse
            return Warehouse.objects.filter(id=wh_id).values_list('company_id', flat=True).first()

        contribute('company_of:warehouse', _warehouse_company_resolver)

        # حل موجودیت‌های انبار و فیلدهای اختصاصی برای هسته (بدون وابستگی معکوس هسته به انبار)
        from warehouses.models import Warehouse
        contribute('entity_resolver:warehouse', lambda wid: Warehouse.objects.filter(id=wid).first())
        contribute('entity_map_resolver:warehouse', lambda wids: dict(Warehouse.objects.filter(id__in=wids).values_list('id', 'name')))
        contribute('user_admin_fields', 'assigned_warehouses')

        from warehouses.report_entities import get_user_report_extra_fields
        contribute('user_report_extra_fields', get_user_report_extra_fields())

        # ثبت اکستنشن انبار برای کاربران پلتفرم (گام ۳-ب)
        from warehouses.user_extension import register_user_extension
        register_user_extension()

        # مسدودکننده حذف شرکت ماژول انبار (گام ۴)
        contribute('company_delete_blockers', (20, 'warehouses', "این شرکت دارای انبارهای ثبت‌شده در سامانه است و نمی‌توان آن را حذف کرد."))

        # ثبت مدل‌های قابل بازگردانی انبار (گام ۳-ب)
        from warehouses.models import Warehouse
        contribute('rollback_models', {'Warehouse': Warehouse})

        # ثبت اعتبارسنجی انبار برای گزارش‌ساز (گام ۳-ب)
        contribute('validate_warehouse', lambda wid: Warehouse.objects.filter(pk=wid).exists())

        # ثبت موجودیت‌های گزارش انبار در رجیستری پلتفرم (گام ۳-ب)
        from warehouses.report_entities import register_warehouse_report_entities
        register_warehouse_report_entities()
        contribute('report_registrars', register_warehouse_report_entities)

        # قوانین تفکیک وظایف (SoD) ماژول انبار
        from warehouses.sod_rules import SOD_RULES, SOD_ROUTE_RULES
        for rule in SOD_RULES:
            contribute('sod_rules', rule)
        for rule in SOD_ROUTE_RULES:
            contribute('sod_route_rules', rule)

        # حل‌کننده نقش‌های ماژول انبار برای میان‌افزار احراز هویت
        from warehouses.role_resolver import resolve_warehouse_roles
        contribute('role_resolver', ('warehouse', resolve_warehouse_roles))


