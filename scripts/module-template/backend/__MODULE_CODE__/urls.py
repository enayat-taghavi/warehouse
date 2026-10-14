from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ping_view(request):
    """بررسی سلامت و دسترسی اندپوینت‌های ماژول __MODULE_TITLE_FA__ (فقط کاربر واردشده)"""
    return Response({'status': 'ok', 'module': '__MODULE_CODE__', 'title': '__MODULE_TITLE_FA__'})


urlpatterns = [
    path('ping/', ping_view, name='__MODULE_CODE___ping'),
]
