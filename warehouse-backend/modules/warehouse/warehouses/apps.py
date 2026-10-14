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
        from platform_core.registry import register_module
        from platform_core.module_catalog import WAREHOUSE_SPEC
        register_module(WAREHOUSE_SPEC)
