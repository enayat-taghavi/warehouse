from django.apps import AppConfig


class SettingsCoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'settings_core'

    def ready(self):
        try:
            import settings_core.signals
        except ImportError:
            pass
