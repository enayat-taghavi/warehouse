"""
محاسبه و حل نقش‌های معتبر کاربر در ماژول حسابداری و پرسنلی (accounting/personnel).
این تابع در AppConfig.ready() از طریق contribute('role_resolver', ('accounting', resolve_personnel_roles)) ثبت می‌شود.
"""


def resolve_personnel_roles(user, spec=None) -> list[str]:
    roles = []
    # راهبر تشکیلات: نشانگر آن مجوز مدیریت پروژه‌ها و بخش‌هاست
    is_org_admin = user.has_perm('accounts.perm_manage_projects_sections')
    # اپراتور/کارمند: فقط اگر صراحتاً نقش کارمند داشته باشد
    if user.has_perm('accounts.can_act_as_operator'):
        roles.append('operator')
    if user.has_perm('accounts.can_act_as_workshop_supervisor') or user.has_perm('accounts.perm_approve_personnel_supervisor') or user.has_perm('accounts.perm_approve_fleet_supervisor'):
        roles.append('supervisor')
    if user.has_perm('accounts.can_act_as_accountant') or user.has_perm('accounts.perm_approve_personnel_finance') or user.has_perm('accounts.perm_approve_fleet_finance'):
        roles.append('accountant')
    if user.has_perm('accounts.can_act_as_company_manager') or user.has_perm('accounts.perm_manager_payment_authorize') or user.has_perm('accounts.perm_approve_personnel_manager'):
        roles.append('manager')
    if user.has_perm('accounts.perm_treasury_disburse_action') or user.has_perm('accounts.view_sys_treasury'):
        roles.append('treasury')
    if not roles and not is_org_admin and (user.has_perm('accounts.view_sys_personnel_attendance') or user.has_perm('accounts.view_sys_personnel')):
        roles.append('operator')
    # در ابتدای فهرست تا «آخرین نقش معتبر» (پیش‌فرض resolve_effective_role) برای کاربر چندنقشه عوض نشود
    if is_org_admin:
        roles.insert(0, 'org_admin')
    return roles
