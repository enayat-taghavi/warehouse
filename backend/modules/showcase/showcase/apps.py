from django.apps import AppConfig


class ShowcaseConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'showcase'
    verbose_name = 'ماژول نمایشی'

    def ready(self):
        # ثبت خودکار ماژول در رجیستری قابلیت‌های پلتفرم هسته (platform_core)
        from platform_core.registry import register_module
        from platform_core.module_catalog import MODULE_CATALOG
        if 'showcase' in MODULE_CATALOG:
            register_module(MODULE_CATALOG['showcase'])
