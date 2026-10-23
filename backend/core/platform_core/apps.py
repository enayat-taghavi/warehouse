from django.apps import AppConfig


class PlatformCoreConfig(AppConfig):
    """
    اپ پلتفرم‌محور؛ میزبان رجیستری قابلیت‌های ماژول (`platform_core.registry`).
    خودِ این اپ هیچ مدلی ندارد و صرفاً هستهٔ مشترک است.
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'platform_core'
    verbose_name = 'هستهٔ پلتفرم'

    def ready(self):
        from .registry import discover_entry_point_modules
        discover_entry_point_modules()
