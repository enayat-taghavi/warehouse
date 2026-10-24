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

        # نمونهٔ اعلام گردش کار روی موتور هسته (طرح ۲.۳؛ نمونهٔ کامل: personnel/workflows.py حسابداری).
        # هسته مرحله، دریافت‌کننده (نقش انتساب + مجوز بخشی مرحله)، سابقه و «کارهای من» را نگه می‌دارد؛
        # ماژول وضعیت سند خودش را در on_state_change به‌روز می‌کند.
        # from workflow.registry import APPROVE, StepSpec, WorkflowSpec
        # from .models import SampleDocument
        # contribute('workflows', WorkflowSpec(
        #     key='__MODULE_CODE___doc', version=1, entity_kind='__MODULE_CODE___doc', title_fa='سند __MODULE_TITLE_FA__',
        #     steps=(StepSpec('member_ok', 'تأیید عضو', '__MODULE_CODE___member', '<مجوز بخشی module.py>', APPROVE),),
        #     on_state_change=lambda doc, state, instance: None,
        #     summary=lambda doc: {'title': str(doc)},
        #     route='/app/__MODULE_CODE__/docs/{id}',
        # ))
        # contribute('entity_resolver:__MODULE_CODE___doc', lambda pk: SampleDocument.objects.filter(pk=pk).first())
