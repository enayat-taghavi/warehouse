from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NotificationViewSet, DeviceTokenView, WebPushKeyView, WebPushSubscriptionView

router = DefaultRouter()
router.register(r'', NotificationViewSet, basename='notification')

urlpatterns = [
    path('devices/', DeviceTokenView.as_view(), name='device-tokens'),
    path('devices/<str:token>/', DeviceTokenView.as_view(), name='device-token-detail'),
    path('webpush/key/', WebPushKeyView.as_view(), name='webpush-key'),
    path('webpush/subscriptions/', WebPushSubscriptionView.as_view(), name='webpush-subscriptions'),
    path('', include(router.urls)),
]
