from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ItemViewSet, CountTaskViewSet, DocTaskViewSet, ItemFieldDefinitionViewSet
from .views_photos import ItemPhotoViewSet
from .sync_views import SyncPullView

router = DefaultRouter()
router.register(r'count-tasks', CountTaskViewSet, basename='counttask')
router.register(r'doc-tasks', DocTaskViewSet, basename='doctask')
router.register(r'items', ItemViewSet, basename='item')
router.register(r'dynamic-fields', ItemFieldDefinitionViewSet, basename='dynamic-field')
router.register(r'item-photos', ItemPhotoViewSet, basename='itemphoto')

urlpatterns = [
    path('sync/pull/', SyncPullView.as_view(), name='sync-pull'),
    path('', include(router.urls)),
]
