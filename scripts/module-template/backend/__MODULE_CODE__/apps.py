from django.apps import AppConfig


class __MODULE_PASCAL__Config(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = '__MODULE_CODE__'
    verbose_name = '__MODULE_TITLE_FA__'

    def ready(self):
        # ثبت خودکار ماژول در رجیستری قابلیت‌های پلتفرم هسته (platform_core)
        from platform_core.registry import register_module
        from platform_core.module_catalog import MODULE_CATALOG
        if '__MODULE_CODE__' in MODULE_CATALOG:
            register_module(MODULE_CATALOG['__MODULE_CODE__'])
