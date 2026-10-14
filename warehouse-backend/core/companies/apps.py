from django.apps import AppConfig


class CompaniesConfig(AppConfig):
    """
    لایهٔ شرکت و دسترسی شرکت (چندمستأجری) در هستهٔ پلتفرم، تا هر ماژول جدا از دیگری نصب‌شدنی باشد.
    نام جدول‌ها همان نام قبلی personnel است.
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'companies'
    verbose_name = 'شرکت‌ها و دسترسی شرکت'
