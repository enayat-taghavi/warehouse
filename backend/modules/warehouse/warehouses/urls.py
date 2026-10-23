from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WarehouseViewSet, WarehouseSettingsViewSet
from .label_views import LabelTemplateViewSet

router = DefaultRouter()
router.register(r'label-templates', LabelTemplateViewSet, basename='label-template')
router.register(r'', WarehouseViewSet)

urlpatterns = [
    path('<int:warehouse_id>/settings/', WarehouseSettingsViewSet.as_view({'get': 'warehouse_settings', 'post': 'warehouse_settings', 'delete': 'warehouse_settings'})),
    path('', include(router.urls)),
]

