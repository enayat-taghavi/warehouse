from django.apps import AppConfig


class ReportsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'reports'
    verbose_name = "گزارش‌ساز"

    def ready(self):
        try:
            from .registry import register_warehouse_reports
            register_warehouse_reports()
        except Exception:
            pass
