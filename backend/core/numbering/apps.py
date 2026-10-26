from django.apps import AppConfig


class NumberingConfig(AppConfig):
    """شماره‌گذاری اسناد در هسته (ص۱ تا ص۵ طرح ۲.۸): هر ماژول سری‌اش را با contribute('numbering_series', ...) اعلام می‌کند."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'numbering'
    verbose_name = 'شماره‌گذاری اسناد'
