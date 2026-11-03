"""
مشخصات ماژول نامه‌های شرکت (letters) — طرح Documents/Release_v1/letters_module/plan_letters.md (ن۱ و ن۹).

ماژول تا پایان ساخت opt-in است (س۸): فقط با نام صریح در WH_MODULES نصب می‌شود و پروفایل پیش‌فرض آن را ندارد.
مسیرهای API (url_includes) در ل-ج اضافه می‌شوند.
"""
from platform_core.registry import ModuleSpec

LETTERS_SPEC = ModuleSpec(
    code='letters',
    title_fa='نامه‌های شرکت',
    django_apps=('letters.apps.LettersConfig',),
    api_prefixes=('api/letters/',),
    permission_markers=(
        'accounts.view_letters_hub',
    ),
    roles=('operator', 'supervisor', 'accountant', 'manager', 'treasury', 'org_admin', 'superuser'),
    audit_modules=(
        ('letters', 'نامه‌ها'),
    ),
    audit_scope_keys=('letters',),
    allowed_app_code='letters',
    scope_codes=('letters',),
    default_priority=30,
    active_priority=30,
    opt_in=True,
)

MODULE_SPEC = LETTERS_SPEC
SPEC = LETTERS_SPEC

# حصار نوشتن مدیر کل (ق۷): مدیر کل در نامه‌ها فقط می‌بیند.
SUPERUSER_WRITE_FENCE = ('/api/letters/',)
SUPERUSER_WRITE_ALLOWLIST = ()

_EMP, _SUP, _ACC, _MGR, _TRS = 'employee', 'supervisor', 'accountant', 'manager', 'treasury'
_ALL = (_EMP, _SUP, _ACC, _MGR, _TRS)

LETTERS_PERMISSION_CATEGORIES = (
    {'key': 'letters', 'label_fa': 'نامه‌های شرکت', 'order': 110},  # منو در ل-و (فرانت)
)

PERMISSION_CATEGORIES = LETTERS_PERMISSION_CATEGORIES


def _p(code, label_fa, defaults):
    return {'code': code, 'label_fa': label_fa, 'category': 'letters', 'scope': 'section', 'defaults': defaults}


# مجوزهای ماژول روی accounts.CustomUser (ن۹)؛ هسته ردیف‌ها را در post_migrate می‌سازد (فقط ایجاد، هرگز حذف).
# هیچ‌کدام حساس نیستند. دبیرخانه بستهٔ پیش‌فرض ندارد؛ مدیر شرکت آن را می‌دهد.
LETTERS_PERMISSIONS = (
    _p('view_letters_hub', 'ورود به بخش نامه‌ها', _ALL),
    _p('perm_letters_compose', 'نوشتن نامهٔ داخلی، صادره و صورت‌جلسه', _ALL),
    _p('perm_letters_circular', 'نوشتن بخشنامه', (_MGR,)),
    _p('perm_letters_secretariat', 'کار دبیرخانه: ثبت وارده، ارسال صادره، ارجاع و ابطال', ()),
    _p('perm_letters_settings', 'تنظیمات نامه: سربرگ، مهر دبیرخانه و سری‌های شماره', (_MGR,)),
)

PERMISSIONS = LETTERS_PERMISSIONS

LETTERS_PERMISSION_CODENAMES = tuple(p['code'] for p in LETTERS_PERMISSIONS)

PERMISSION_CODENAMES = LETTERS_PERMISSION_CODENAMES
