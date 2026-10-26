from django.apps import AppConfig


class ContactsConfig(AppConfig):
    """دفترچهٔ طرف‌های بیرونی در هسته (ص۱ طرح ۳.۱): هر طرف یک شرکت دارد؛ ماژول‌ها نقش خود را جدا روی آن می‌سازند."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'contacts'
    verbose_name = 'طرف‌های بیرونی'
