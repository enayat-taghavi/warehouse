from django.apps import AppConfig
from django.core import checks


def check_workflow_specs(app_configs, **kwargs):
    """workflow.E001: اعلام‌های گردش کار ماژول‌ها معتبر باشند (پس از ready همهٔ اپ‌ها اجرا می‌شود)."""
    from django.core.exceptions import ImproperlyConfigured
    from .registry import validate_specs
    try:
        validate_specs()
    except ImproperlyConfigured as exc:
        return [checks.Error(str(exc), id='workflow.E001')]
    return []


class WorkflowConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'workflow'
    label = 'workflow'
    verbose_name = 'موتور گردش کار'

    def ready(self):
        checks.register(check_workflow_specs)
        from .hooks import connect
        connect()
