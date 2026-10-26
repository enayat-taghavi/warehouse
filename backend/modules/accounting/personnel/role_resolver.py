"""
محاسبه و حل نقش‌های معتبر کاربر در ماژول حسابداری و پرسنلی (accounting/personnel).
این تابع در AppConfig.ready() از طریق contribute('role_resolver', ('accounting', resolve_personnel_roles)) ثبت می‌شود.
"""


def resolve_personnel_roles(user, spec=None) -> list[str]:
    roles = []
    # راهبر تشکیلات: سطح «نوشتن» بخش هستهٔ «پروژه‌ها و بخش‌ها» در دست‌کم یک شرکت
    # (جای مجوز قدیمی perm_manage_projects_sections؛ طرح Project_Section_To_Core، ت۲)
    from companies.access import companies_with_section
    is_org_admin = not user.is_superuser and companies_with_section(user, 'projects', 'write').exists()
    if user.has_perm('accounts.perm_approve_personnel_supervisor') or user.has_perm('accounts.perm_approve_fleet_supervisor'):
        roles.append('supervisor')
    if user.has_perm('accounts.perm_approve_personnel_finance') or user.has_perm('accounts.perm_approve_fleet_finance'):
        roles.append('accountant')
    if user.has_perm('accounts.perm_manager_payment_authorize') or user.has_perm('accounts.perm_approve_personnel_manager'):
        roles.append('manager')
    if user.has_perm('accounts.perm_treasury_disburse_action'):
        roles.append('treasury')
    if not roles and not is_org_admin and (user.has_perm('accounts.view_sys_personnel_attendance') or user.has_perm('accounts.view_sys_personnel')):
        roles.append('operator')
    # در ابتدای فهرست تا «آخرین نقش معتبر» (پیش‌فرض resolve_effective_role) برای کاربر چندنقشه عوض نشود
    if is_org_admin:
        roles.insert(0, 'org_admin')
    return roles
