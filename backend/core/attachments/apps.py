from django.apps import AppConfig


class AttachmentsConfig(AppConfig):
    """پیوست عمومی هسته (ص۵ تا ص۷ و ص۹ طرح ۲.۶): هر ماژول با قلاب‌های can_view/can_attach/is_locked نوع سندش را اعلام می‌کند."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'attachments'
    verbose_name = 'پیوست‌ها'
