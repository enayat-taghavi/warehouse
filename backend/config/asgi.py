"""
ASGI config for config project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/howto/deployment/asgi/
"""

import os
from django.core.asgi import get_asgi_application

# ابتدا متغیر محیطی تنظیمات را ست کرده و اپلیکیشن جنگو را لود می‌کنیم تا اپ‌ها آماده شوند
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django_asgi_app = get_asgi_application()

# ایمپورت چنلز و روتینگ‌ها باید پس از مقداردهی اولیه جنگو صورت گیرد
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import notifications.routing
import communications.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            notifications.routing.websocket_urlpatterns +
            communications.routing.websocket_urlpatterns
        )
    ),
})
