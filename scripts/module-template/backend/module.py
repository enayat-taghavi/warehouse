"""
مشخصات ماژول __MODULE_TITLE_FA__ (__MODULE_CODE__) — مانیفست رسمی ماژول بک‌اند
"""
from platform_core.registry import ModuleSpec

__MODULE_UPPER___SPEC = ModuleSpec(
    code='__MODULE_CODE__',
    title_fa='__MODULE_TITLE_FA__',
    django_apps=('__MODULE_CODE__.apps.__MODULE_PASCAL__Config',),
    api_prefixes=('api/__MODULE_CODE__/',),
    permission_markers=(
        'accounts.view_sys___MODULE_CODE__',
    ),
    roles=('operator', 'supervisor', 'manager'),
    url_includes=(
        ('api/__MODULE_CODE__/', '__MODULE_CODE__.urls'),
    ),
    audit_modules=(
        ('__MODULE_CODE__', '__MODULE_TITLE_FA__'),
    ),
    sod_app_module='__MODULE_CODE__',
)

MODULE_SPEC = __MODULE_UPPER___SPEC
SPEC = __MODULE_UPPER___SPEC

# مجوزهای سفارشی این ماژول روی accounts.CustomUser در قالب اعلام طرح ۲.۲ (ت۱، ت۲، ت۳، ت۶).
# هسته ردیف‌های Permission ماژول نصب‌شده را در post_migrate می‌سازد (فقط ایجاد، هرگز حذف) و فهرست کامل،
# دسته‌ها و بسته‌های پیش‌فرض نقش‌ها را از همین اعلام به فرانت می‌دهد؛ فرانت ماژول قالب جدید
# permissionGroup، shortPermissionNames و rolePresets ندارد (نگهبان ۵۷ / module_coupling_scan می‌سنجد).

# دسته‌ها (اختیاری): menu کلید مبهمی است که فرانت به آیتم منوی همین ماژول نگاشت می‌کند، یا None.
__MODULE_UPPER___PERMISSION_CATEGORIES = (
    {'key': 'main', 'label_fa': '__MODULE_TITLE_FA__', 'order': 10, 'menu': None},
)

PERMISSION_CATEGORIES = __MODULE_UPPER___PERMISSION_CATEGORIES

# هر مجوز:
#   scope='section': «کجا» فقط از انتساب کاربر به شرکت/پروژه/بخش می‌آید (ق۶)؛ بررسی با
#     accounts.scoped_permissions.can(user, code, section) / sections_where() / section_q()، نه has_perm سراسری (نگهبان ۵۸).
#     defaults: کلید نقش‌های انتساب (section_roles) که این مجوز در بستهٔ پیش‌فرض آن‌هاست.
#   scope='system' (پیش‌فرض): مجوز سامانه‌ای، فقط از نقش سامانه‌ای یا تیک مستقیم؛ defaults ندارد.
#   قالب قدیم ('code', 'نام') همچنان پذیرفته است و سامانه‌ای حساب می‌شود.
__MODULE_UPPER___PERMISSIONS = (
    {'code': 'view_sys___MODULE_CODE__', 'label_fa': '__MODULE_TITLE_FA__', 'category': 'main',
     'scope': 'section', 'defaults': ('__MODULE_CODE___member',)},
    {'code': 'manage___MODULE_CODE___settings', 'label_fa': 'تنظیمات __MODULE_TITLE_FA__', 'category': 'main',
     'scope': 'system'},
)

PERMISSIONS = __MODULE_UPPER___PERMISSIONS
