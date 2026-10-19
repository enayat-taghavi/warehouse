"""
مشخصات ماژول مالی و پرسنلی (accounting) — طرح راه میانهٔ ماژولار (گام ۳).
"""
from platform_core.registry import ModuleSpec

ACCOUNTING_SPEC = ModuleSpec(
    code='accounting',
    title_fa='سامانه کارکرد، مالی و خزانه‌داری',
    django_apps=('personnel.apps.PersonnelConfig',),
    api_prefixes=('api/personnel/',),
    permission_markers=(
        'accounts.view_sys_personnel',
        'accounts.view_sys_personnel_attendance',
        'accounts.view_sys_payroll',
        'accounts.view_sys_treasury',
        'accounts.view_sys_fleet_attendance',
        'accounts.view_sys_fleet_settlement',
        'accounts.can_act_as_operator',
        'accounts.can_act_as_workshop_supervisor',
        'accounts.can_act_as_accountant',
        'accounts.can_act_as_company_manager',
        'accounts.perm_approve_personnel_supervisor',
        'accounts.perm_approve_fleet_supervisor',
        'accounts.perm_approve_personnel_finance',
        'accounts.perm_approve_fleet_finance',
        'accounts.perm_approve_personnel_manager',
        'accounts.perm_approve_fleet_manager',
        'accounts.perm_manager_payment_authorize',
        'accounts.perm_treasury_disburse_action',
        'accounts.perm_manage_projects_sections',
        'accounts.perm_lock_work_period',
    ),
    roles=('operator', 'supervisor', 'accountant', 'manager', 'treasury', 'org_admin', 'superuser'),
    url_includes=(
        ('api/personnel/', 'personnel.urls'),
    ),
    audit_modules=(
        ('attendance', 'کارکرد پرسنل'),
        ('fleet', 'کارکرد ناوگان و ماشین‌آلات'),
        ('payroll', 'محاسبات حقوق و دستمزد پرسنل'),
        ('treasury', 'کارتابل خزانه‌داری و پرداخت'),
        ('projects', 'پروژه‌ها و بخش‌ها'),
        ('invoices', 'فاکتورهای هزینه'),
    ),
    audit_scope_keys=('personnel', 'payroll', 'attendance', 'fleet', 'treasury', 'finance'),
    sod_app_module='personnel',
    aliases=('finance', 'personnel'),
    allowed_app_code='finance',
    scope_codes=('finance', 'personnel'),
    default_priority=10,
    active_priority=20,
)

MODULE_SPEC = ACCOUNTING_SPEC
SPEC = ACCOUNTING_SPEC

ACCOUNTING_PERMISSION_CODENAMES = (
    'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
    'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
    'can_act_as_operator', 'can_act_as_accountant',
    'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor',
    'perm_approve_personnel_manager', 'perm_approve_fleet_manager',
    'perm_approve_personnel_finance', 'perm_approve_fleet_finance',
    'perm_lock_work_period', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
    'perm_manage_projects_sections',
)

PERMISSION_CODENAMES = ACCOUNTING_PERMISSION_CODENAMES
