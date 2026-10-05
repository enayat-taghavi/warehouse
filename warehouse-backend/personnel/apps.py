from django.apps import AppConfig


class PersonnelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'personnel'
    verbose_name = 'مدیریت پرسنل، کارکرد و ناوگان'

    def ready(self):
        # فاز ۳ §۳.۱ — ثبت ماژول حسابداری در رجیستری قابلیت‌ها. این خودِ رجیستری،
        # ماژول‌های ممیزیِ حسابداری (audit_modules) را هم در هسته ثبت می‌کند.
        from platform_core.registry import register_module
        from platform_core.module_catalog import ACCOUNTING_SPEC
        register_module(ACCOUNTING_SPEC)
        
        # بارگذاری سیگنال‌های خودکار همگام‌سازی شرکت و مدارک
        try:
            import personnel.signals
        except ImportError:
            pass

        # بارگذاری سیگنال‌های صف همگام‌سازی گوگل‌درایو
        try:
            import personnel.signals_gdrive
        except ImportError:
            pass
