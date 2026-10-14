from django.urls import path
from django.http import JsonResponse


def ping_view(request):
    """بررسی سلامت و دسترسی اندپوینت‌های ماژول __MODULE_TITLE_FA__"""
    return JsonResponse({'status': 'ok', 'module': '__MODULE_CODE__', 'title': '__MODULE_TITLE_FA__'})


urlpatterns = [
    path('ping/', ping_view, name='__MODULE_CODE___ping'),
]
