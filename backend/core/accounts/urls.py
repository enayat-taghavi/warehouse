from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views_domains.permission_views import (
    PermissionCatalogView, MyPermissionsView, RoleBundleView, RoleBundleResetView, UserPermissionsView,
)
from .views import (
    UserViewSet, CustomTokenObtainPairView, CustomRoleViewSet, PermissionViewSet,
    UserTableViewStateViewSet, UserLoginLogViewSet, AuditLogViewSet, LogoutView,
    DatabaseBackupViewSet, SwitchAppScopeView, SystemHealthView, ConcurrencyStressTestView,
    DeviceHeartbeatView, FleetSessionsListView, RevokeDeviceSessionView
)
from .views_domains.auth_views import PasswordAwareTokenRefreshView

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
    path('refresh/', PasswordAwareTokenRefreshView.as_view(), name='token_refresh'),
    path('token/switch-app/', SwitchAppScopeView.as_view(), name='token_switch_app'),
    path('health/', SystemHealthView.as_view(), name='system_health'),
    path('health/stress-test/', ConcurrencyStressTestView.as_view(), name='concurrency_stress_test'),
    path('telemetry/heartbeat/', DeviceHeartbeatView.as_view(), name='device_heartbeat'),
    path('telemetry/fleet/', FleetSessionsListView.as_view(), name='fleet_sessions'),
    path('telemetry/sessions/<int:session_id>/revoke/', RevokeDeviceSessionView.as_view(), name='revoke_device_session'),
    # طرح ۲.۲ (الف۲): مجوزهای ریز؛ پیش از router تا users/<id>/permissions/ به UserViewSet نرسد
    path('permission-catalog/', PermissionCatalogView.as_view(), name='permission_catalog'),
    path('my-permissions/', MyPermissionsView.as_view(), name='my_permissions'),
    path('role-bundles/<str:role_key>/', RoleBundleView.as_view(), name='role_bundle'),
    path('role-bundles/<str:role_key>/reset/', RoleBundleResetView.as_view(), name='role_bundle_reset'),
    path('users/<int:user_id>/permissions/', UserPermissionsView.as_view(), name='user_permissions'),
    path('', include(router.urls)),
]
