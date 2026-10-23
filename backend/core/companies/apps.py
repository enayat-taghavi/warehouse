from django.apps import AppConfig


class CompaniesConfig(AppConfig):
    """
    لایهٔ شرکت و دسترسی شرکت (چندمستأجری) در هستهٔ پلتفرم، تا هر ماژول جدا از دیگری نصب‌شدنی باشد.
    نام جدول‌ها همان نام قبلی personnel است.
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'companies'
    verbose_name = 'شرکت‌ها و دسترسی شرکت'

    def ready(self):
        # پروژه و بخش در هسته‌اند (طرح Project_Section_To_Core، ت۱): انتساب فعال به بخش عضویت شرکت می‌دهد،
        # در هر نصبی، حتی بدون ماژولی که نقش بخش اعلام کند
        from platform_core.registry import contribute
        from .access import register_derived_company_source
        from .org_membership import build_section_member_q, section_derived_company_source, section_member_sources
        register_derived_company_source(section_derived_company_source)
        contribute('company_member_sources', section_member_sources)
        contribute('company_member_q_builders', build_section_member_q)
        contribute('company_delete_blockers', (10, 'projects', "این شرکت دارای پروژه‌های ثبت‌شده است و نمی‌توان آن را حذف کرد."))
