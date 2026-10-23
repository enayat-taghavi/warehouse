# -*- coding: utf-8 -*-
"""
Barrel module for accounts views.
Re-exports all ViewSets, views, and helpers explicitly by name.
"""

from .views_domains.auth_views import (
    OptionalPageNumberPagination,
    CustomTokenObtainPairView,
    LogoutView,
    SwitchAppScopeView,
)

from .views_domains.user_views import (
    UserViewSet,
    UserTableViewStateViewSet,
)

from .views_domains.role_views import (
    CustomRoleViewSet,
    PermissionViewSet,
)

from .views_domains.audit_views import (
    _parse_query_date,
    StandardLogPagination,
    get_db_total_storage_info,
    get_table_storage_info,
    format_bytes_to_human,
    build_log_storage_payload,
    format_shamsi_datetime,
    UserLoginLogViewSet,
    AuditLogViewSet,
)

from .views_domains.backup_views import (
    DatabaseBackupViewSet,
    SystemHealthView,
    ConcurrencyStressTestView,
)

from .views_domains.session_views import (
    DeviceHeartbeatView,
    FleetSessionsListView,
    RevokeDeviceSessionView,
)

__all__ = [
    'OptionalPageNumberPagination',
    'CustomTokenObtainPairView',
    'LogoutView',
    'SwitchAppScopeView',
    'UserViewSet',
    'UserTableViewStateViewSet',
    'CustomRoleViewSet',
    'PermissionViewSet',
    '_parse_query_date',
    'StandardLogPagination',
    'get_db_total_storage_info',
    'get_table_storage_info',
    'format_bytes_to_human',
    'build_log_storage_payload',
    'format_shamsi_datetime',
    'UserLoginLogViewSet',
    'AuditLogViewSet',
    'DatabaseBackupViewSet',
    'SystemHealthView',
    'ConcurrencyStressTestView',
    'DeviceHeartbeatView',
    'FleetSessionsListView',
    'RevokeDeviceSessionView',
]
