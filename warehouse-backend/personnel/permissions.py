from rest_framework import permissions


def has_structure_write_permission(user):
    """
    مجوز نوشتن ساختار سازمانی (قواعد IsOrgStructureManagerOrReadOnly):
    superuser یا staff، نقش admin، یا یکی از مجوزهای admin_all، view_sys_projects، perm_sys_settings،
    perm_approve_personnel_manager و can_act_as_manager.
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

    # بررسی پرمیشن‌های ادمین/حسابداری
    for perm in ['accounts.admin_all', 'accounts.view_sys_projects', 'accounts.perm_sys_settings', 'accounts.perm_approve_personnel_manager', 'accounts.can_act_as_manager']:
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
    - perm_approve_personnel_manager / can_act_as_manager
    - perm_sys_settings
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        return has_structure_write_permission(request.user)


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

