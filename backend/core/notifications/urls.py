from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NotificationViewSet, DeviceTokenView

router = DefaultRouter()
router.register(r'', NotificationViewSet, basename='notification')

urlpatterns = [
    path('devices/', DeviceTokenView.as_view(), name='device-tokens'),
    path('devices/<str:token>/', DeviceTokenView.as_view(), name='device-token-detail'),
    path('', include(router.urls)),
]
