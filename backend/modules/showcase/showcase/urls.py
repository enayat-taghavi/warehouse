from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import require_menu_access


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ping_view(request):
    """بررسی سلامت و دسترسی اندپوینت‌های ماژول نمایشی (فقط کاربر واردشده)"""
    return Response({'status': 'ok', 'module': 'showcase', 'title': 'ماژول نمایشی'})


@api_view(['GET'])
@permission_classes([require_menu_access('view_showcase_hub')])
def hub_view(request):
    """پیشخوان ماژول نمایشی: فقط اطلاعات پلتفرم (بی دادهٔ شرکت یا کاربر دیگر)، با مجوز خود ماژول"""
    from platform_core.registry import installed_modules
    return Response({'module': 'showcase', 'installed_modules': list(installed_modules())})


urlpatterns = [
    path('ping/', ping_view, name='showcase_ping'),
    path('hub/', hub_view, name='showcase_hub'),
]
