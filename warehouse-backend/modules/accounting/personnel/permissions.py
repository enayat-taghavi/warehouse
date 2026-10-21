from rest_framework import permissions
from platform_core.registry import has_permission_alias

# قواعد پایهٔ نوشتن ساختار سازمانی در هستهٔ companies هستند و این‌جا دوباره صادر می‌شوند.
from companies.permissions import (  # noqa: F401
    has_structure_write_permission,
    requires_company_scope,
    IsOrgStructureManagerOrReadOnly,
)


class IsProjectStructureManagerOrReadOnly(IsOrgStructureManagerOrReadOnly):
    """
    ساختار پروژه‌ها، بخش‌ها و انتساب کاربران به بخش‌ها:
    قواعد IsOrgStructureManagerOrReadOnly به‌علاوه راهبر تشکیلات (perm_manage_projects_sections).
    عمداً روی UserCompanyAccess اعمال نمی‌شود تا راهبر نتواند دسترسی شرکت اعطا کند.
    محدودسازی شرکت (requires_company_scope) در خود ویوست‌ها اعمال می‌شود.
    """
    def has_permission(self, request, view):
        if super().has_permission(request, view):
            return True
        u = request.user
        return bool(u and u.is_authenticated and u.has_perm('accounts.perm_manage_projects_sections'))


class IsCounterpartyManagerOrReadOnly(IsOrgStructureManagerOrReadOnly):
    """
    طرف‌حساب‌های مالی: قواعد IsOrgStructureManagerOrReadOnly به‌علاوه حسابدار
    (can_act_as_accountant یا perm_approve_personnel_finance).
    محدودسازی شرکت (requires_company_scope) در CounterpartyViewSet اعمال می‌شود.
    """
    def has_permission(self, request, view):
        if super().has_permission(request, view):
            return True
        u = request.user
        if not u or not u.is_authenticated:
            return False
        return u.has_perm('accounts.can_act_as_accountant') or u.has_perm('accounts.perm_approve_personnel_finance')


class IsPayrollSettingsManagerOrReadOnly(permissions.BasePermission):
    """
    اجازه خواندن و مشاهده تنظیمات پایه به کلیه کاربران احراز هویت شده،
    اما هرگونه تغییر، ذخیره، ایجاد سال مالی یا نسخه جدید منحصراً برای:
    - superuser / is_staff
    - accounts.admin_all
    - accounts.perm_sys_settings
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        u = request.user
        if u.is_superuser or u.is_staff:
            return True

        user_roles = getattr(u, 'roles', []) or []
        user_dept = getattr(u, 'department', '') or ''
        if 'admin' in user_roles or 'superuser' in user_roles or user_dept in ('admin', 'management'):
            return True

        for perm in ['accounts.admin_all', 'accounts.perm_sys_settings']:
            if u.has_perm(perm):
                return True

        return False


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
            has_permission_alias(request.user, 'manager_approver')
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
            has_permission_alias(request.user, 'manager_approver')
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
            has_permission_alias(request.user, 'manager_approver')
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
            has_permission_alias(request.user, 'manager_approver')
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
            has_permission_alias(request.user, 'manager_approver')
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


