"""
رجیستری بخش‌های مجوز شرکت (طرح مجوزهای بخش‌به‌بخش شرکت، §۵-۱).

هر کاربر در هر شرکت برای هر بخش یکی از سطح‌های `none`، `read` یا `write` را دارد
(در `UserCompanyAccess.section_levels`). هسته بخش‌های خودش را اعلام می‌کند و ماژول‌ها
بخش‌های خود را با `contribute('company_permission_sections', {...})` می‌افزایند؛ هسته نام
هیچ بخش ماژولی را نمی‌برد.

مشخصات هر بخش:
    key, label_fa, order, kind ('levels' | 'action'), sensitive (bool),
    templates: {template_key: level}   (سطح بخش در هر قالب؛ نبود = none)
    legacy:    {old access_level: level} (نگاشت مهاجرت از سطح‌های قدیمی؛ نبود = سطح قالب مدیر برای workspace_full)
    studio:    شناسهٔ تب یا بخش استودیو (برای فرانت)
"""
from platform_core.registry import contributions

LEVELS = ('none', 'read', 'write')
LEVEL_RANK = {'none': 0, 'read': 1, 'write': 2}

TEMPLATES = (
    {'key': 'viewer', 'label_fa': 'فقط مشاهده'},
    {'key': 'docs_clerk', 'label_fa': 'کارشناس مدارک'},
    {'key': 'manager', 'label_fa': 'مدیر شرکت'},
)

CORE_SECTIONS = (
    {'key': 'identity', 'label_fa': 'هویتی (نام، شناسه‌ها، نشانی، لوگو)', 'order': 10, 'kind': 'levels',
     'sensitive': False, 'studio': 'identity',
     'templates': {'viewer': 'read', 'docs_clerk': 'read', 'manager': 'write'}},
    {'key': 'insurance_tax', 'label_fa': 'بیمه و مالیات', 'order': 20, 'kind': 'levels',
     'sensitive': False, 'studio': 'fiscal_insurance',
     'templates': {'viewer': 'read', 'manager': 'write'}},
    {'key': 'founding_docs', 'label_fa': 'اسناد مادر (اساسنامه و روزنامهٔ رسمی)', 'order': 30, 'kind': 'levels',
     'sensitive': False, 'studio': 'documents',
     'templates': {'viewer': 'read', 'docs_clerk': 'write', 'manager': 'write'}},
    {'key': 'user_access', 'label_fa': 'دسترسی کاربران', 'order': 40, 'kind': 'levels',
     'sensitive': False, 'studio': 'access',
     'templates': {'manager': 'write'}},
)

# فیلدهای مدل Company در هسته ← بخش. فیلد بی‌نگاشت فقط برای superuser است (بسته به‌طور پیش‌فرض).
CORE_FIELD_SECTIONS = {
    **{f: 'identity' for f in (
        'code', 'name', 'company_type', 'national_id', 'economic_code', 'registration_number',
        'registration_date', 'phone', 'address', 'postal_code', 'ceo_name', 'logo',
        'registered_capital', 'shares_count', 'share_nominal_value', 'fiscal_year_start_month',
    )},
    **{f: 'insurance_tax' for f in (
        'workshop_code', 'social_security_branch_code', 'social_security_branch_name', 'contract_row',
        'employer_name', 'tax_memory_id', 'tax_economic_code',
    )},
    **{f: 'founding_docs' for f in ('articles_of_association', 'latest_gazette')},
}


def installed_sections():
    """بخش‌های هسته و ماژول‌های نصب‌شده، مرتب بر اساس order."""
    items = list(CORE_SECTIONS)
    for item in contributions('company_permission_sections'):
        items.extend(item if isinstance(item, (list, tuple)) else [item])
    seen, result = set(), []
    for s in sorted(items, key=lambda x: x.get('order', 1000)):
        if s['key'] not in seen:
            seen.add(s['key'])
            result.append(s)
    return result


def section_map():
    return {s['key']: s for s in installed_sections()}


def field_sections():
    mapping = dict(CORE_FIELD_SECTIONS)
    for item in contributions('company_field_sections'):
        mapping.update(item)
    return mapping


def template_levels(template_key):
    """سطح هر بخش نصب‌شده در یک قالب. کارهای حساس در هیچ قالبی نیستند."""
    return {
        s['key']: ('none' if s.get('sensitive') else s.get('templates', {}).get(template_key, 'none'))
        for s in installed_sections()
    }


def legacy_levels(access_level):
    """نگاشت سطح قدیمی access_level به section_levels (ق۶)."""
    if access_level == 'workspace_full':
        return template_levels('manager')
    levels = {}
    for s in installed_sections():
        lvl = s.get('legacy', {}).get(access_level)
        if lvl:
            levels[s['key']] = lvl
    return levels


def normalize_levels(raw):
    """فقط کلید بخش‌های نصب‌شده و سطح معتبر؛ کار حساس نوع action فقط none یا write."""
    sections = section_map()
    clean = {}
    for key, level in (raw or {}).items():
        spec = sections.get(key)
        if spec is None or level not in LEVELS:
            continue
        if spec.get('kind') == 'action' and level == 'read':
            level = 'write'
        clean[key] = level
    return clean


def public_spec():
    """خروجی API برای فرانت."""
    return {
        'levels': list(LEVELS),
        'templates': [{**t, 'levels': template_levels(t['key'])} for t in TEMPLATES],
        'sections': [
            {k: s.get(k) for k in ('key', 'label_fa', 'order', 'kind', 'sensitive', 'studio')}
            for s in installed_sections()
        ],
        # فیلد مدل شرکت ← بخش؛ فرانت در حالت محدود فقط فیلدهای بخش‌های «نوشتن» را می‌فرستد
        'fields': field_sections(),
    }
