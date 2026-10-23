from django.apps import AppConfig
from django.core import checks
from django.conf import settings


def check_channel_layer_configuration(app_configs, **kwargs):
    errors = []
    channel_layers = getattr(settings, 'CHANNEL_LAYERS', {})
    default_layer = channel_layers.get('default', {})
    backend = default_layer.get('BACKEND', '')

    if 'InMemoryChannelLayer' in backend:
        msg = (
            "Real-time messaging system is using InMemoryChannelLayer. "
            "WebSocket messaging only works in a single-process environment; multiple workers require Redis."
        )
        if not getattr(settings, 'DEBUG', True):
            errors.append(
                checks.Warning(
                    msg,
                    hint="Set REDIS_URL or REDIS_HOST in production server environment variables.",
                    id='communications.W001'
                )
            )
    return errors


class CommunicationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'communications'
    verbose_name = 'سیستم ارتباطات و گفتگوها'

    def ready(self):
        checks.register(check_channel_layer_configuration, checks.Tags.compatibility)
