from django.apps import AppConfig

# نقش‌های انتساب به بخش که این ماژول به هسته اعلام می‌کند (contribute('section_roles', ...)): (کلید، برچسب، رتبه).
# رتبه بالاترین نقش کاربر در یک بخش را تعیین می‌کند. کلیدی که ماژول دیگری هم اعلام کرده باید همان برچسب و رتبه را
# داشته باشد (وگرنه ValueError)؛ کلید نقش حداکثر ۳۰ نویسه است. defaults مجوزهای بخشی module.py به این کلیدها اشاره می‌کند.
SECTION_ROLES = (
    ('__MODULE_CODE___member', 'عضو __MODULE_TITLE_FA__', 10),
)


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
        from platform_core.registry import contribute
        contribute('section_roles', SECTION_ROLES)
