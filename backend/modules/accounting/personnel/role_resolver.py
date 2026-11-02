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
    can_record = user.has_perm('accounts.view_sys_personnel_attendance') or user.has_perm('accounts.view_sys_personnel')
    # انتساب صریح «کارمند» نقش کارمند را کنار نقش‌های دیگر هم نشان می‌دهد (تصمیم کاربر، ۱۱ آبان ۱۴۰۵)
    from accounts.scoped_permissions import active_assignment_roles
    has_employee_assignment = 'employee' in active_assignment_roles(user)
    add_operator = can_record and (has_employee_assignment or (not roles and not is_org_admin))
    # در ابتدای فهرست تا «آخرین نقش معتبر» (پیش‌فرض resolve_effective_role) برای کاربر چندنقشه عوض نشود
    if is_org_admin:
        roles.insert(0, 'org_admin')
    # کارمند همیشه اول: نقش پیش‌فرض (آخرین) همان می‌ماند که بی انتساب کارمند بود
    if add_operator:
        roles.insert(0, 'operator')
    return roles
