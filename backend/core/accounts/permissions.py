from rest_framework import permissions

class OrPermission(permissions.BasePermission):
    """
    Helper class to allow bitwise OR operations on permission instances.
    """
    def __init__(self, op1, op2):
        self.op1 = op1
        self.op2 = op2

    def __or__(self, other):
        return OrPermission(self, other)

    def has_permission(self, request, view):
        return self.op1.has_permission(request, view) or self.op2.has_permission(request, view)
        
    def has_object_permission(self, request, view, obj):
        return self.op1.has_object_permission(request, view, obj) or self.op2.has_object_permission(request, view, obj)


class HasMenuAccess(permissions.BasePermission):
    """
    Allows access only to authenticated users who have the specified menu permission.
    The required permission must be passed in the viewset/view.
    """
    def __init__(self, required_permission):
        self.required_permission = required_permission

    def __or__(self, other):
        return OrPermission(self, other)

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Django stores custom permissions as 'app_label.codename'
        # Since our custom permissions are on CustomUser in the 'accounts' app:
        full_perm = f"accounts.{self.required_permission}"
        return request.user.has_perm(full_perm)

def any_menu_access(*codenames):
    """OR چند مجوز منو؛ مثلاً مجوز پلتفرم به‌اضافهٔ مجوزهایی که ماژول‌های نصب‌شده با contribute اعلام کرده‌اند."""
    perms = [HasMenuAccess(c) for c in dict.fromkeys(codenames) if c]
    result = perms[0]
    for perm in perms[1:]:
        result = result | perm
    return result


def require_menu_access(permission_codename):
    """Factory to create a permission class for a specific menu access"""
    class _RequireMenuAccess(HasMenuAccess):
        def __init__(self):
            super().__init__(permission_codename)
    return _RequireMenuAccess


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allows read-only access for authenticated users, but requires superuser
    or specific 'perm_sys_settings' for write actions.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
            
        if request.method in permissions.SAFE_METHODS:
            return True
            
        return request.user.is_superuser or request.user.has_perm('accounts.perm_sys_settings')

class IsSuperUser(permissions.BasePermission):
    """
    Allows access only to superusers.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class CanManageDatabaseBackup(permissions.BasePermission):
    """
    Allows access to users who can manage, create, list, and verify backups.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_sys_backup_manage') or
            request.user.has_perm('accounts.perm_sys_backup_restore')
        )


class CanRestoreDatabase(permissions.BasePermission):
    """
    Allows access ONLY to users who have critical restore permission.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_sys_backup_restore')
        )


class CanExportAuditLogs(permissions.BasePermission):
    """
    Allows exporting/archiving audit logs.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_sys_audit_export') or
            request.user.has_perm('accounts.perm_sys_purge_logs') or
            request.user.has_perm('accounts.perm_sys_logs')
        )


class CanPurgeAuditLogs(permissions.BasePermission):
    """
    Allows critical permanent purging of audit logs.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_sys_purge_logs')
        )


class CanRollbackSingle(permissions.BasePermission):
    """
    Allows reverting single records/fields.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_rollback_single') or
            request.user.has_perm('accounts.perm_rollback_bulk') or
            request.user.has_perm('accounts.perm_rollback_data')
        )


class CanRollbackBulk(permissions.BasePermission):
    """
    Allows critical batch rollback of transactions across time ranges.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_rollback_bulk') or
            request.user.has_perm('accounts.perm_rollback_data')
        )


class CanRestoreDeleted(permissions.BasePermission):
    """
    Allows restoring soft-deleted records.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_restore_deleted') or
            request.user.has_perm('accounts.perm_rollback_single') or
            request.user.has_perm('accounts.perm_rollback_bulk') or
            request.user.has_perm('accounts.perm_rollback_data')
        )


def check_sod_prohibition(request, page_route: str, action_code: str, app_module: str = None):
    """
    بررسی صریح خطوط قرمز تفکیک وظایف (SoD Barrier Check).
    در صورت ممنوعیت، استثنای PermissionDenied با پیام ممیزی پرتاب می‌شود.
    """
    from rest_framework.exceptions import PermissionDenied
    from accounts.sod_cache_service import SoDCacheService
    from accounts.middleware import get_current_active_role, get_current_active_app

    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated or user.is_superuser:
        return

    role = getattr(request, 'active_role', None) or get_current_active_role() or 'operator'
    # فاز ۳ §۳.۵ — `active_app` اکنون کدِ ماژول است؛ برای جستجو در ماتریس SoD به
    # کدِ سازگار (sod_app_module، مثلاً 'personnel') نرمال می‌شود.
    from platform_core.registry import app_code_for_sod
    app = app_code_for_sod(app_module or getattr(request, 'active_app', None) or get_current_active_app())

    is_prohibited, reason = SoDCacheService.is_action_prohibited(app, role, page_route, action_code)
    if is_prohibited:
        raise PermissionDenied(detail={
            'error': reason,
            'code': 'sod_prohibited',
            'action_code': action_code,
            'role_code': role,
            'page_route': page_route
        })


def resolve_sod_context(request, view) -> tuple[str, str]:
    """
    استخراج مسیر صفحه (page_route) و کد عملیات (action_code) از ویو یا مسیر درخواست
    جهت ارزیابی در ماتریس تفکیک وظایف (SoD).
    """
    from platform_core.registry import contributions

    page_route = getattr(view, 'sod_page_route', None)
    action_code = getattr(view, 'sod_action_code', None)

    if not page_route:
        path = request.path.lower()
        rules = sorted(contributions('sod_route_rules'), key=lambda r: r[0])
        for priority, keywords, route in rules:
            if any(kw in path for kw in keywords):
                page_route = route
                break
        if not page_route:
            page_route = '/attendance'

    if not action_code:
        action_name = getattr(view, 'action', None)
        method = request.method.upper()

        resolved = None
        for resolver in contributions('sod_action_resolvers'):
            res = resolver(request, view, action_name, method, page_route)
            if res is not None:
                resolved = res
                break

        action_code = resolved if resolved is not None else (action_name or method.lower())

    return page_route, action_code


class SoDPolicyPermission(permissions.BasePermission):
    """
    گارد امنیتی تفکیک وظایف (SoD Policy Guard) در لایه DRF
    به صورت خودکار یا با استفاده از اتریبیوت‌های ویو، خطوط قرمز نقش فعال جاری را بررسی و در صورت تخلف مسدود می‌کند.
    """
    message = "این عملیات طبق ماتریس تفکیک وظایف (SoD) برای نقش فعال شما مسدود شده است."

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated or user.is_superuser:
            return True

        from accounts.sod_cache_service import SoDCacheService
        from accounts.middleware import get_current_active_role, get_current_active_app

        role = getattr(request, 'active_role', None) or get_current_active_role() or 'operator'
        # فاز ۳ §۳.۵ — `active_app` کدِ ماژول است؛ برای SoD به کدِ سازگار نرمال می‌شود.
        from platform_core.registry import app_code_for_sod
        app = app_code_for_sod(getattr(request, 'active_app', None) or get_current_active_app())

        # استخراج مسیر صفحه و کد عملیات از ویو یا مسیر درخواست
        page_route, action_code = resolve_sod_context(request, view)

        is_prohibited, reason = SoDCacheService.is_action_prohibited(app, role, page_route, action_code)
        if is_prohibited:
            self.message = reason
            return False

        return True


from .scope import get_visible_users_for_user  # noqa: E402, F401

