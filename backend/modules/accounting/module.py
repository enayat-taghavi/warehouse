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
        'accounts.view_sys_fleet_attendance',
        'accounts.view_sys_fleet_settlement',
        'accounts.perm_approve_personnel_supervisor',
        'accounts.perm_approve_fleet_supervisor',
        'accounts.perm_approve_personnel_finance',
        'accounts.perm_approve_fleet_finance',
        'accounts.perm_approve_personnel_manager',
        'accounts.perm_approve_fleet_manager',
        'accounts.perm_manager_payment_authorize',
        'accounts.perm_treasury_disburse_action',
        'accounts.perm_lock_work_period',
        'accounts.perm_invoice_approve',
        'accounts.perm_invoice_review',
        'accounts.perm_counterparty_manage',
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
    'view_sys_payroll', 'view_sys_fleet_settlement',
    'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor',
    'perm_approve_personnel_manager', 'perm_approve_fleet_manager',
    'perm_approve_personnel_finance', 'perm_approve_fleet_finance',
    'perm_lock_work_period', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
    'perm_delete_personnel_nomovement', 'perm_delete_vehicle_nomovement',
    'perm_invoice_record', 'perm_invoice_approve', 'perm_invoice_review',
    'perm_petty_cash_manage', 'perm_counterparty_manage',
    'perm_approve_attendance_supervisor', 'perm_approve_attendance_finance', 'perm_approve_attendance_manager',
)

PERMISSION_CODENAMES = ACCOUNTING_PERMISSION_CODENAMES

# مجوزهای سفارشی این ماژول روی accounts.CustomUser، در قالب اعلام ۲.۲ (کد، نام فارسی، دسته، دامنه، سهم بسته‌ها).
# هسته ردیف‌های Permission ماژول نصب‌شده را در post_migrate می‌سازد (فقط ایجاد، هرگز حذف).
# دامنهٔ «section»: «کجا» فقط از انتساب می‌آید (ق۶ و ت۱)؛ مجوز بخشی از نقش سامانه‌ای یا تیک مستقیم نادیده گرفته می‌شود.
# همهٔ مجوزهای حسابداری روی کار یک بخش (کارکرد، تأیید، پرونده، حقوق، خزانه، فاکتور و تنخواه) اثر دارند، پس بخشی‌اند.
# سهم پیش‌فرض بسته‌ها از قالب‌های فعلی فرانت (role-presets.ts) آمده است:
#   کارمند کارگاه → employee، سرپرست کارگاه → supervisor، حسابدار → accountant، مدیر شرکت → manager، خزانه‌دار → treasury.
# فهرست نهایی ۲۱ مجوز و بسته‌ها: جدول ص۴ طرح ۳.۵ (هر کار اصلی یک تیک؛ مجوز منو و نشانهٔ نقش حذف شد).
_EMP, _SUP, _ACC, _MGR, _TRS = 'employee', 'supervisor', 'accountant', 'manager', 'treasury'

# دسته‌ها: menu کلید مبهمی است که فرانت به آیتم منو نگاشت می‌کند (همان شناسهٔ آیتم در nav-items.ts).
ACCOUNTING_PERMISSION_CATEGORIES = (
    {'key': 'attendance', 'label_fa': 'کارکرد پرسنل و ناوگان', 'order': 20, 'menu': 'employee-attendance'},
    {'key': 'personnel', 'label_fa': 'پرونده‌های پرسنل و ناوگان', 'order': 30, 'menu': 'profiles'},
    {'key': 'approvals', 'label_fa': 'تأیید کارکرد و بستن دوره', 'order': 40, 'menu': 'manager-approvals'},
    {'key': 'payroll', 'label_fa': 'حقوق و تسویهٔ ناوگان', 'order': 50, 'menu': 'accountant-payroll'},
    {'key': 'treasury', 'label_fa': 'خزانه‌داری و پرداخت', 'order': 60, 'menu': 'treasurer-disbursements'},
    {'key': 'invoices', 'label_fa': 'فاکتورهای هزینه', 'order': 70, 'menu': 'employee-invoices'},
    {'key': 'petty_cash', 'label_fa': 'تنخواه‌گردان', 'order': 80, 'menu': 'supervisor-petty-cash'},
    {'key': 'counterparties', 'label_fa': 'طرف‌حساب‌های مالی', 'order': 90, 'menu': 'accountant-counterparties'},
)

PERMISSION_CATEGORIES = ACCOUNTING_PERMISSION_CATEGORIES


def _p(code, label_fa, category, defaults):
    return {'code': code, 'label_fa': label_fa, 'category': category, 'scope': 'section', 'defaults': defaults}


ACCOUNTING_PERMISSIONS = (
    # قلمرو پرونده‌ها با sections_where (ت۸ طرح ۲.۲)
    _p('view_sys_personnel_attendance', 'ثبت کارکرد و تعریف پرسنل', 'attendance', (_EMP, _SUP)),
    _p('view_sys_fleet_attendance', 'ثبت تردد ناوگان و تعریف خودرو', 'attendance', (_EMP, _SUP)),
    _p('view_sys_personnel', 'مدیریت پرونده‌های پرسنل و ناوگان', 'personnel', (_MGR,)),
    _p('perm_delete_personnel_nomovement', 'حذف پرسنل بی سابقهٔ کارکرد و مالی', 'personnel', (_MGR,)),
    _p('perm_delete_vehicle_nomovement', 'حذف خودروی بی سابقهٔ کارکرد و مالی', 'personnel', (_MGR,)),
    _p('perm_approve_personnel_supervisor', 'تأیید سرپرست برای کارکرد و پروندهٔ پرسنل', 'approvals', (_SUP,)),
    _p('perm_approve_fleet_supervisor', 'تأیید سرپرست برای تردد و پروندهٔ ناوگان', 'approvals', (_SUP,)),
    _p('perm_approve_personnel_finance', 'تأیید مالی پرسنل', 'approvals', (_ACC,)),
    _p('perm_approve_fleet_finance', 'تأیید مالی ناوگان', 'approvals', (_ACC,)),
    _p('perm_approve_personnel_manager', 'تأیید مدیر برای پرسنل', 'approvals', (_MGR,)),
    _p('perm_approve_fleet_manager', 'تأیید مدیر برای ناوگان', 'approvals', (_MGR,)),
    _p('perm_lock_work_period', 'بستن دورهٔ کارکرد ماهانه', 'approvals', (_SUP, _MGR)),
    # گردش کارکرد ماهانه روی موتور ۲.۳ (د۲ طرح ۴.۴)
    _p('perm_approve_attendance_supervisor', 'تأیید سرپرست برای کارکرد ماهانه', 'approvals', (_SUP,)),
    _p('perm_approve_attendance_finance', 'بررسی حسابدار برای کارکرد ماهانه', 'approvals', (_ACC,)),
    _p('perm_approve_attendance_manager', 'تأیید مدیر برای کارکرد ماهانه', 'approvals', (_MGR,)),
    _p('view_sys_payroll', 'محاسبهٔ حقوق، دیسکت بیمه و مالیات و تنظیمات پایهٔ حقوق', 'payroll', (_ACC, _MGR)),
    _p('view_sys_fleet_settlement', 'تسویهٔ مالی ناوگان', 'payroll', (_ACC, _MGR)),
    _p('perm_manager_payment_authorize', 'صدور مجوز پرداخت (مدیر)', 'treasury', (_MGR,)),
    _p('perm_treasury_disburse_action', 'پرداخت و تسویهٔ خزانه‌داری', 'treasury', (_TRS,)),
    _p('perm_invoice_record', 'ثبت و دیدن فاکتور', 'invoices', (_EMP, _SUP, _ACC, _MGR, _TRS)),
    _p('perm_invoice_approve', 'تأیید سرپرست برای فاکتور و تنخواه', 'invoices', (_SUP,)),
    _p('perm_invoice_review', 'بررسی حسابدار برای فاکتور و تنخواه', 'invoices', (_ACC,)),
    _p('perm_petty_cash_manage', 'مدیریت تنخواه', 'petty_cash', (_SUP, _ACC, _MGR, _TRS)),
    _p('perm_counterparty_manage', 'مدیریت و دیدن کامل طرف‌حساب‌ها', 'counterparties', (_ACC, _TRS)),
)

PERMISSIONS = ACCOUNTING_PERMISSIONS

# مجوزهای منو و نشانهٔ نقش حذف‌شده در ۳.۵ (ص۲ و ص۵ طرح ۳.۵) با جانشین‌هایشان. ردیف Permission آن‌ها در پایگاه داده
# می‌ماند (فقط‌ساختن) ولی در فهرست، بسته‌ها و منوها نیست؛ migration personnel/0013 تفاوت‌ها را به جانشین‌ها می‌برد.
# کد ماژول نباید این کدها را بخواند (personnel/test_permissions_35.py).
REMOVED_PERMISSION_CODENAMES = {
    'can_act_as_operator': ('view_sys_personnel_attendance', 'view_sys_fleet_attendance'),
    'can_act_as_workshop_supervisor': (
        'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor', 'perm_invoice_approve',
    ),
    'can_act_as_accountant': (
        'perm_approve_personnel_finance', 'perm_approve_fleet_finance', 'perm_invoice_review',
        'perm_counterparty_manage',
    ),
    'can_act_as_company_manager': (
        'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'perm_manager_payment_authorize',
    ),
    'view_sys_treasury': ('perm_treasury_disburse_action',),
}
