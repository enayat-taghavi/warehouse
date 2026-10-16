from rest_framework import permissions

from platform_core.registry import contributions


def has_structure_write_permission(user):
    """
    مجوز نوشتن ساختار سازمانی (قواعد IsOrgStructureManagerOrReadOnly):
    superuser یا staff، نقش admin، یا یکی از مجوزهای هسته (admin_all، view_sys_projects، perm_sys_settings،
    can_act_as_manager) یا مشارکت‌های ماژول‌ها در org_structure_write_perms.
    محدودهٔ شرکتِ این نوشتن را requires_company_scope و ویوست‌ها تعیین می‌کنند.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True

    user_roles = getattr(user, 'roles', []) or []
    user_dept = getattr(user, 'department', '') or ''
    if 'admin' in user_roles or 'superuser' in user_roles or user_dept == 'admin':
        return True

    # بررسی پرمیشن‌های ادمین/ماژول‌ها
    core_perms = ['accounts.admin_all', 'accounts.view_sys_projects', 'accounts.perm_sys_settings', 'accounts.can_act_as_manager']
    for perm in (*core_perms, *contributions('org_structure_write_perms')):
        if user.has_perm(perm):
            return True
    return False


def requires_company_scope(user):
    """
    هر نویسندهٔ غیرسوپریوزرِ ساختار سازمانی، دسترسی شرکت و طرف‌حساب فقط درون شرکت‌های مجاز خودش می‌نویسد:
    رکورد سراسری (بدون شرکت) برایش فقط خواندنی است، انتساب فقط برای اعضای همان شرکت است
    و درون‌ریزی اکسل فقط در شرکت فعالِ مجاز انجام می‌شود (تصمیم کاربر، ۹ مهر ۱۴۰۵). ویوست‌ها این را اعمال می‌کنند.
    """
    return bool(user and user.is_authenticated and not user.is_superuser)


class IsOrgStructureManagerOrReadOnly(permissions.BasePermission):
    """
    اجازه خواندن به تمام کاربران احراز هویت شده،
    اما عملیات ایجاد، ویرایش و حذف فقط برای superuser یا دارندگان دسترسی‌های مدیریتی/مالی:
    - view_sys_projects / admin_all
    - can_act_as_manager یا دسترسی‌های ساختار سازمانی ماژول‌ها (org_structure_write_perms)
    - perm_sys_settings
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        return has_structure_write_permission(request.user)

