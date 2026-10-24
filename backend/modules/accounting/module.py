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
    'can_act_as_workshop_supervisor', 'can_act_as_company_manager',
    'perm_delete_personnel_nomovement', 'perm_delete_vehicle_nomovement',
)

PERMISSION_CODENAMES = ACCOUNTING_PERMISSION_CODENAMES

# مجوزهای سفارشی این ماژول روی accounts.CustomUser، در قالب اعلام ۲.۲ (کد، نام فارسی، دسته، دامنه، سهم بسته‌ها).
# هسته ردیف‌های Permission ماژول نصب‌شده را در post_migrate می‌سازد (فقط ایجاد، هرگز حذف).
# دامنهٔ «section»: «کجا» فقط از انتساب می‌آید (ق۶ و ت۱)؛ مجوز بخشی از نقش سامانه‌ای یا تیک مستقیم نادیده گرفته می‌شود.
# همهٔ مجوزهای حسابداری روی کار یک بخش (کارکرد، تأیید، پرونده، حقوق، خزانه، فاکتور و تنخواه) اثر دارند، پس بخشی‌اند.
# سهم پیش‌فرض بسته‌ها از قالب‌های فعلی فرانت (role-presets.ts) آمده است:
#   کارمند کارگاه → employee، سرپرست کارگاه → supervisor، حسابدار → accountant، مدیر شرکت → manager، خزانه‌دار → treasury.
# فهرست نهایی و ریز مجوزها و حذف مجوزهای منو در مرحلهٔ ۳ است (ت۵).
_EMP, _SUP, _ACC, _MGR, _TRS = 'employee', 'supervisor', 'accountant', 'manager', 'treasury'

# دسته‌ها: menu کلید مبهمی است که فرانت به آیتم منو نگاشت می‌کند (همان شناسهٔ آیتم در nav-items.ts).
ACCOUNTING_PERMISSION_CATEGORIES = (
    {'key': 'work_roles', 'label_fa': 'نقش‌های کاری', 'order': 10, 'menu': None},
    {'key': 'attendance', 'label_fa': 'کارکرد پرسنل و ناوگان', 'order': 20, 'menu': 'employee-attendance'},
    {'key': 'personnel', 'label_fa': 'پرونده‌های پرسنل و ناوگان', 'order': 30, 'menu': 'profiles'},
    {'key': 'approvals', 'label_fa': 'تأیید کارکرد و بستن دوره', 'order': 40, 'menu': 'manager-approvals'},
    {'key': 'payroll', 'label_fa': 'حقوق و تسویهٔ ناوگان', 'order': 50, 'menu': 'accountant-payroll'},
    {'key': 'treasury', 'label_fa': 'خزانه‌داری و پرداخت', 'order': 60, 'menu': 'treasurer-disbursements'},
    {'key': 'invoices', 'label_fa': 'فاکتورهای هزینه', 'order': 70, 'menu': 'employee-invoices'},
    {'key': 'petty_cash', 'label_fa': 'تنخواه‌گردان', 'order': 80, 'menu': 'supervisor-petty-cash'},
)

PERMISSION_CATEGORIES = ACCOUNTING_PERMISSION_CATEGORIES


def _p(code, label_fa, category, defaults):
    return {'code': code, 'label_fa': label_fa, 'category': category, 'scope': 'section', 'defaults': defaults}


ACCOUNTING_PERMISSIONS = (
    # پرونده‌های پرسنل (کارگزینی) در هیچ قالب فعلی نیست؛ پیش‌فرض فقط مدیر (ت۸؛ قلمرو پرونده‌ها با sections_where)
    _p('view_sys_personnel', 'مدیریت پرسنل و کارگزینی', 'personnel', (_MGR,)),
    _p('view_sys_personnel_attendance', 'ثبت کارکرد پرسنل', 'attendance', (_EMP, _SUP)),
    _p('view_sys_fleet_attendance', 'ثبت کارکرد ناوگان و ماشین‌آلات', 'attendance', (_EMP, _SUP)),
    _p('view_sys_payroll', 'محاسبات حقوق و دستمزد پرسنل', 'payroll', (_ACC, _MGR)),
    _p('view_sys_fleet_settlement', 'تسویه و محاسبات مالی ناوگان', 'payroll', (_ACC, _MGR)),
    _p('can_act_as_operator', 'کارمند کارگاه و ثبت کارکرد', 'work_roles', (_EMP,)),
    _p('can_act_as_workshop_supervisor', 'سرپرست کارگاه (تایید اولیه کارکرد پرسنل و ناوگان)', 'work_roles', (_SUP,)),
    _p('can_act_as_accountant', 'حسابدار و کارشناس مالی', 'work_roles', (_ACC,)),
    _p('can_act_as_company_manager', 'مدیر شرکت (تایید نهایی و مجوز پرداخت)', 'work_roles', (_MGR,)),
    _p('view_sys_treasury', 'کارتابل خزانه‌داری و پرداخت', 'treasury', (_TRS,)),
    _p('perm_lock_work_period', 'قفل و تایید نهایی کارکرد ماهانه', 'approvals', (_SUP, _MGR)),
    _p('perm_approve_personnel_supervisor', 'تایید مرحله سرپرست انبار برای پرسنل', 'approvals', (_SUP,)),
    _p('perm_approve_personnel_manager', 'تایید مرحله اول (عملیاتی) پرسنل', 'approvals', (_MGR,)),
    _p('perm_approve_personnel_finance', 'تایید مرحله دوم (مالی و بانکی) پرسنل', 'approvals', (_ACC,)),
    _p('perm_approve_fleet_supervisor', 'تایید مرحله سرپرست انبار برای ناوگان', 'approvals', (_SUP,)),
    _p('perm_approve_fleet_manager', 'تایید مرحله اول (عملیاتی) ناوگان و خودروها', 'approvals', (_MGR,)),
    _p('perm_approve_fleet_finance', 'تایید مرحله دوم (مالی و بانکی) ناوگان و خودروها', 'approvals', (_ACC,)),
    _p('perm_manager_payment_authorize', 'صدور مجوز پرداخت نهایی مدیر شرکت', 'treasury', (_MGR,)),
    _p('perm_treasury_disburse_action', 'ثبت واریز و تسویه نهایی خزانه‌داری', 'treasury', (_TRS,)),
    _p('perm_delete_personnel_nomovement', 'حذف پرسنل فاقد سابقه کارکرد و مالی', 'personnel', (_MGR,)),
    _p('perm_delete_vehicle_nomovement', 'حذف خودرو و ناوگان فاقد سابقه کارکرد و مالی', 'personnel', (_MGR,)),
    # ت۱۳: نمونهٔ اثبات سازوکار؛ سهم پیش‌فرض رفتار امروز را نگه می‌دارد
    _p('perm_invoice_record', 'ثبت و دیدن فاکتور', 'invoices', (_EMP, _SUP, _ACC, _MGR, _TRS)),
    _p('perm_petty_cash_manage', 'مدیریت تنخواه', 'petty_cash', (_SUP, _ACC, _MGR, _TRS)),
)

PERMISSIONS = ACCOUNTING_PERMISSIONS
