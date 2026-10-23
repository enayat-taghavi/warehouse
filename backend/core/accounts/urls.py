from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, CustomTokenObtainPairView, CustomRoleViewSet, PermissionViewSet,
    UserTableViewStateViewSet, UserLoginLogViewSet, AuditLogViewSet, LogoutView,
    DatabaseBackupViewSet, SwitchAppScopeView, SystemHealthView, ConcurrencyStressTestView,
    DeviceHeartbeatView, FleetSessionsListView, RevokeDeviceSessionView
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'roles', CustomRoleViewSet, basename='role')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'table-views', UserTableViewStateViewSet, basename='table-view')
router.register(r'login-logs', UserLoginLogViewSet, basename='login-log')
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
router.register(r'backups', DatabaseBackupViewSet, basename='backup')

urlpatterns = [
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('token/switch-app/', SwitchAppScopeView.as_view(), name='token_switch_app'),
    path('health/', SystemHealthView.as_view(), name='system_health'),
    path('health/stress-test/', ConcurrencyStressTestView.as_view(), name='concurrency_stress_test'),
    path('telemetry/heartbeat/', DeviceHeartbeatView.as_view(), name='device_heartbeat'),
    path('telemetry/fleet/', FleetSessionsListView.as_view(), name='fleet_sessions'),
    path('telemetry/sessions/<int:session_id>/revoke/', RevokeDeviceSessionView.as_view(), name='revoke_device_session'),
    path('', include(router.urls)),
]
