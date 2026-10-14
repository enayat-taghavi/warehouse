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


class CanApproveDocuments(permissions.BasePermission):
    """
    Allows approving, rejecting, and signing financial/shipping documents.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_doc_approve_action') or
            request.user.has_perm('accounts.can_act_as_doc_supervisor') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanApproveFeeds(permissions.BasePermission):
    """
    Allows approving and applying feeding/customs records.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_feed_approve_action') or
            request.user.has_perm('accounts.can_act_as_supervisor') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanFinalizeInventory(permissions.BasePermission):
    """
    Allows final approval and closing of inventory counts/discrepancies.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_inventory_finalize') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanManageItemPhotos(permissions.BasePermission):
    """
    اجازه ثبت/ویرایش/حذف عکس کالا.

    پیش از این، نوشتنِ عکس فقط IsAuthenticated بود؛ یعنی کاربری با تنها
    دسترسی «گزارش‌ساز» هم می‌توانست برای هر کالایی عکس آپلود یا عکس دیگران را
    حذف کند. اینجا دقیقاً همان نقش‌هایی مجاز می‌شوند که در UI دکمه دوربین را
    می‌بینند (کارتابل‌های شمارش، مدیریت کالا، تخصیص، گمرک).

    فهرست عمداً سخاوتمندانه است: هدف بستن دسترسی نقش‌های نامرتبط است، نه
    محدودکردن نقش‌هایی که امروز از این قابلیت استفاده می‌کنند. *خواندن* عکس
    محدود نمی‌شود (فقط IsAuthenticated + اسکوپ انبار).
    """

    ALLOWED_PERMISSIONS = (
        'accounts.view_sys_counter',
        'accounts.view_sys_supervisor',
        'accounts.view_sys_manager_review',
        'accounts.view_sys_recounts',
        'accounts.view_wh_docs',
        'accounts.view_wh_dispatch',
        'accounts.view_wh_customs',
        'accounts.perm_inventory_finalize',
        'accounts.can_act_as_manager',
        'accounts.can_act_as_supervisor',
        'accounts.can_act_as_counter',
    )

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        return any(request.user.has_perm(p) for p in self.ALLOWED_PERMISSIONS)


class CanApprovePersonnelManager(permissions.BasePermission):
    """
    دسترسی تایید مرحله اول (عملیاتی) پرسنل
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_approve_personnel_manager') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanApprovePersonnelFinance(permissions.BasePermission):
    """
    دسترسی تایید مرحله دوم (مالی) پرسنل
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_approve_personnel_finance')
        )


class CanApproveFleetManager(permissions.BasePermission):
    """
    دسترسی تایید مرحله اول (عملیاتی) ناوگان و رانندگان
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_approve_fleet_manager') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanApproveFleetFinance(permissions.BasePermission):
    """
    دسترسی تایید مرحله دوم (مالی) ناوگان و رانندگان
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_approve_fleet_finance')
        )


class CanApprovePersonnelSupervisor(permissions.BasePermission):
    """
    دسترسی تایید مرحله سرپرست انبار برای پرسنل
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_approve_personnel_supervisor') or
            request.user.has_perm('accounts.perm_approve_personnel_manager') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanApproveFleetSupervisor(permissions.BasePermission):
    """
    دسترسی تایید مرحله سرپرست انبار برای ناوگان و رانندگان
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_approve_fleet_supervisor') or
            request.user.has_perm('accounts.perm_approve_fleet_manager') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanAuthorizePaymentManager(permissions.BasePermission):
    """
    دسترسی صدور مجوز پرداخت نهایی مدیر شرکت
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_manager_payment_authorize') or
            request.user.has_perm('accounts.can_act_as_manager')
        )


class CanDisburseTreasury(permissions.BasePermission):
    """
    دسترسی ثبت واریز و تسویه نهایی خزانه‌داری
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.perm_treasury_disburse_action')
        )


class CanViewTreasury(permissions.BasePermission):
    """
    دسترسی مشاهده کارتابل خزانه‌داری
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.is_superuser or
            request.user.has_perm('accounts.view_sys_treasury') or
            request.user.has_perm('accounts.perm_treasury_disburse_action')
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
    app = app_code_for_sod(app_module or getattr(request, 'active_app', None) or get_current_active_app() or 'accounting')

    is_prohibited, reason = SoDCacheService.is_action_prohibited(app, role, page_route, action_code)
    if is_prohibited:
        raise PermissionDenied(detail={
            'error': reason,
            'code': 'sod_prohibited',
            'action_code': action_code,
            'role_code': role,
            'page_route': page_route
        })


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
        app = app_code_for_sod(getattr(request, 'active_app', None) or get_current_active_app() or 'accounting')

        # استخراج مسیر صفحه و کد عملیات از ویو یا مسیر درخواست
        page_route = getattr(view, 'sod_page_route', None)
        action_code = getattr(view, 'sod_action_code', None)

        if not page_route:
            path = request.path.lower()
            if 'attendance' in path:
                page_route = '/attendance'
            elif 'profiles' in path:
                page_route = '/profiles'
            elif 'finance' in path or 'monthly-payroll' in path:
                page_route = '/finance-cartable'
            elif 'treasury' in path:
                page_route = '/treasury-cartable'
            elif 'manager' in path:
                page_route = '/manager-approvals'
            elif 'customs' in path:
                page_route = '/customs'
            else:
                page_route = '/attendance'

        if not action_code:
            action_name = getattr(view, 'action', None)
            method = request.method.upper()

            if action_name in ['approve_manager', 'approve_finance', 'approve_supervisor']:
                action_code = f"approve_{action_name.split('_')[-1]}"
            elif action_name in ['disburse_period', 'disburse_single_payroll', 'disburse_fleet']:
                action_code = 'disburse_treasury_payment'
            elif action_name == 'create' and page_route == '/attendance':
                action_code = 'create_daily_attendance_entry'
            elif action_name in ['lock_period', 'approve_period'] and page_route == '/attendance':
                action_code = 'approve_attendance_period'
            elif method in ['POST', 'PUT', 'PATCH'] and 'wage' in str(request.data):
                action_code = 'edit_base_wage_and_bonuses'
            else:
                action_code = action_name or method.lower()

        is_prohibited, reason = SoDCacheService.is_action_prohibited(app, role, page_route, action_code)
        if is_prohibited:
            self.message = reason
            return False

        return True

