"""
مشخصات ماژول نمایشی (showcase) — اثبات زندهٔ آمادگی N-ماژولی (گام ۷ ماژولارسازی).

ماژول opt-in است: فقط با نام صریح در WH_MODULES (و در فرانت با --modules) نصب می‌شود، پس پروفایل
پیش‌فرض app و soft آن را ندارد. مدل و migration ندارد؛ هیچ جدولی نمی‌سازد.
"""
from platform_core.registry import ModuleSpec

SHOWCASE_SPEC = ModuleSpec(
    code='showcase',
    title_fa='ماژول نمایشی',
    django_apps=('showcase.apps.ShowcaseConfig',),
    api_prefixes=('api/showcase/',),
    permission_markers=(
        'accounts.view_showcase_hub',
    ),
    roles=('operator', 'supervisor', 'manager'),
    url_includes=(
        ('api/showcase/', 'showcase.urls'),
    ),
    audit_modules=(
        ('showcase', 'ماژول نمایشی'),
    ),
    audit_scope_keys=('showcase',),
    allowed_app_code='showcase',
    scope_codes=('showcase',),
    default_priority=90,
    active_priority=90,
    opt_in=True,
)

MODULE_SPEC = SHOWCASE_SPEC
SPEC = SHOWCASE_SPEC

SHOWCASE_PERMISSION_CODENAMES = (
    'view_showcase_hub',
)

PERMISSION_CODENAMES = SHOWCASE_PERMISSION_CODENAMES

# مجوزهای سفارشی این ماژول روی accounts.CustomUser (کد، نام فارسی).
# هسته ردیف‌های Permission ماژول نصب‌شده را در post_migrate می‌سازد (فقط ایجاد، هرگز حذف).
SHOWCASE_PERMISSIONS = (
    ('view_showcase_hub', 'ماژول نمایشی: مشاهدهٔ پیشخوان'),
)

PERMISSIONS = SHOWCASE_PERMISSIONS
