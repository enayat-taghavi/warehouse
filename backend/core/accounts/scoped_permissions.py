"""
موتور مجوزهای ریز (طرح ۲.۲، ت۱ تا ت۴ و ت۷): «چه کاری» از مجوز، «کجا» از انتساب (ق۶).

- هر مجوز دامنه دارد: «بخشی» یا «سامانه‌ای» (اعلام ماژول در `modules/<m>/module.py`؛ قالب قدیم و
  مجوزهای خود هسته سامانه‌ای‌اند). مجوز سامانه‌ای از نقش سامانه‌ای (CustomRole)، تیک مستقیم کاربر
  (user_permissions) و تفاوت سامانه‌ای کاربر می‌آید. مجوز بخشی فقط از بستهٔ نقش‌های انتساب فعال کاربر
  می‌آید؛ مجوز بخشی که از CustomRole یا تیک مستقیم برسد نادیده گرفته می‌شود (ت۲).
- بستهٔ مؤثر نقش R = اجتماع سهم پیش‌فرض ماژول‌های نصب‌شده برای R + افزوده‌های RoleBundleOverride −
  برداشته‌های آن (ت۳). مجوزهای حساس (SENSITIVE_PERMISSION_CODENAMES) هرگز در بسته نیستند (ت۱۰ قاعدهٔ ۴).
- مجوزهای کاربر در یک بخش = اجتماع بستهٔ نقش‌های انتساب‌های فعالی که آن بخش را می‌پوشانند (خود بخش،
  پروژه‌اش یا شرکتش؛ همان معنای `companies.org_roles.assignments_covering_section`)، سپس تفاوت‌های کاربر
  برای شرکت همان بخش: افزوده فقط وقتی که کاربر انتسابی پوشانندهٔ آن بخش دارد، برداشته همیشه (ت۴).
- نتیجه در طول درخواست روی خود شیء کاربر کش می‌شود (`user._scoped_perm_cache`) و تعداد پرس‌وجوها به تعداد
  بخش‌ها و انتساب‌ها بستگی ندارد (ق۱۸).
"""
from django.contrib.auth.backends import ModelBackend
from django.core.exceptions import ValidationError
from django.db.models import Q

SECTION = 'section'
SYSTEM = 'system'
# مجوزهای ماژول‌ها روی accounts.CustomUser ساخته می‌شوند (accounts/module_permissions.py)
PERMISSION_APP_LABEL = 'accounts'

_CACHE_ATTR = '_scoped_perm_cache'


# ─── اعلام‌ها و بسته‌ها ───────────────────────────────────────────────────────────

def _sensitive_codes():
    from .models import SENSITIVE_PERMISSION_CODENAMES
    return SENSITIVE_PERMISSION_CODENAMES


def permission_specs() -> dict:
    """
    {codename: spec} همهٔ مجوزهای شناخته: مجوزهای هسته (CustomUser.Meta، همه سامانه‌ای و بی‌دسته) و
    مجوزهای ماژول‌های نصب‌شده. spec = {'code', 'label_fa', 'category', 'scope', 'defaults', 'module'}؛
    module برای مجوز هسته None است.
    """
    from platform_core.module_catalog import installed_permission_specs
    from .models import CustomUser
    out = {
        code: {'code': code, 'label_fa': label, 'category': None, 'scope': SYSTEM, 'defaults': (), 'module': None}
        for code, label in CustomUser._meta.permissions
    }
    for code, spec in installed_permission_specs().items():
        out.setdefault(code, spec)
    return out


def section_permission_codes() -> frozenset:
    """کد مجوزهای بخشی ماژول‌های نصب‌شده (بی مجوزهای حساس)."""
    from platform_core.module_catalog import installed_permission_specs
    sensitive = _sensitive_codes()
    return frozenset(
        code for code, spec in installed_permission_specs().items()
        if spec['scope'] == SECTION and code not in sensitive
    )


def _split_code(code):
    """('app_label' یا None، codename) از کد ساده یا 'app_label.codename'."""
    code = str(code)
    if '.' in code:
        app_label, codename = code.split('.', 1)
        return app_label, codename
    return None, code


def permission_scope(code) -> str:
    """'section' یا 'system' برای کد ساده یا 'app_label.codename'؛ کد ناشناخته سامانه‌ای است."""
    app_label, codename = _split_code(code)
    if app_label not in (None, PERMISSION_APP_LABEL):
        return SYSTEM
    return SECTION if codename in section_permission_codes() else SYSTEM


def default_bundles() -> dict:
    """{role_key: frozenset(codename)} سهم پیش‌فرض ماژول‌های نصب‌شده در بستهٔ هر نقش انتساب."""
    from platform_core.module_catalog import installed_permission_specs
    sensitive = _sensitive_codes()
    out: dict = {}
    for code, spec in installed_permission_specs().items():
        if spec['scope'] != SECTION or code in sensitive:
            continue
        for role in spec['defaults']:
            out.setdefault(role, set()).add(code)
    return {role: frozenset(codes) for role, codes in out.items()}


def _bundle_override_rows():
    """[(role_key, codename, mode)] تفاوت‌های بسته؛ یک پرس‌وجو."""
    from .models import RoleBundleOverride
    return list(
        RoleBundleOverride.objects.filter(permission__content_type__app_label=PERMISSION_APP_LABEL)
        .values_list('role_key', 'permission__codename', 'mode')
    )


def role_bundle_details(rows=None) -> dict:
    """
    {role_key: {'defaults', 'added', 'removed', 'effective'}} (هر کدام frozenset از codename) برای همهٔ
    نقش‌های انتساب اعلام‌شده و هر نقشی که سهم پیش‌فرض یا تفاوت دارد. یک پرس‌وجو (اگر rows داده نشود).
    added/removed فقط تفاوت‌های مؤثرند: مجوز غیربخشی یا حساس نادیده گرفته می‌شود.
    """
    from companies.models import section_role_choices
    section_codes = section_permission_codes()
    defaults = default_bundles()
    if rows is None:
        rows = _bundle_override_rows()
    added: dict = {}
    removed: dict = {}
    for role, codename, mode in rows:
        if codename not in section_codes:
            continue
        (added if mode == 'add' else removed).setdefault(role, set()).add(codename)
    roles = list(dict.fromkeys([r for r, _ in section_role_choices()] + list(defaults) + list(added) + list(removed)))
    out = {}
    for role in roles:
        base = defaults.get(role, frozenset())
        plus = frozenset(added.get(role, ()))
        minus = frozenset(removed.get(role, ()))
        out[role] = {
            'defaults': base,
            'added': plus,
            'removed': minus,
            'effective': frozenset((base | plus) - minus),
        }
    return out


def effective_bundles(rows=None) -> dict:
    """{role_key: frozenset(codename)} بستهٔ مؤثر هر نقش انتساب."""
    return {role: d['effective'] for role, d in role_bundle_details(rows).items()}


def validate_user_override(permission, company_id):
    """
    تفاوت مجوز کاربر: مجوز بخشی باید شرکت داشته باشد و مجوز سامانه‌ای نباید (ت۴). ValidationError می‌دهد.
    permission: نمونهٔ auth.Permission.
    """
    code = f'{permission.content_type.app_label}.{permission.codename}'
    if permission_scope(code) == SECTION:
        if not company_id:
            raise ValidationError({'company': 'تفاوت مجوز بخشی باید برای یک شرکت ثبت شود.'})
    elif company_id:
        raise ValidationError({'company': 'تفاوت مجوز سامانه‌ای شرکت ندارد و همه‌جا اعمال می‌شود.'})


# ─── وضعیت مجوز یک کاربر (یک بار در هر درخواست) ─────────────────────────────────────

class _State:
    __slots__ = ('base', 'system', 'system_codenames', 'company', 'project', 'section',
                 'project_company', 'section_chain', 'any_section', 'chains', 'all_names')

    def __init__(self):
        self.base = None                # همان شیء user._perm_cache جنگو؛ برای تشخیص کهنه شدن
        self.system = set()             # 'app_label.codename' مجوزهای سامانه‌ای پس از تفاوت‌ها
        self.system_codenames = set()   # همان، فقط codename
        self.company = {}               # {company_id: set(codename)} پس از تفاوت‌های همان شرکت
        self.project = {}               # {project_id: set(codename)}
        self.section = {}               # {section_id: set(codename)}
        self.project_company = {}       # {project_id: company_id} پروژه‌های انتساب‌ها
        self.section_chain = {}         # {section_id: (project_id, company_id)} بخش‌های انتساب‌ها
        self.any_section = set()        # مجوزهای بخشی که دست‌کم در یک بخش دارد
        self.chains = {}                # کش (project_id, company_id) بخش‌های پرسیده‌شده
        self.all_names = None           # کش خروجی all_permission_names


def _base_permissions(user):
    """مجوزهای جنگو (تیک مستقیم + نقش‌های سامانه‌ای با ارث درخت فعلی)، کش‌شده در user._perm_cache."""
    from .backends import RoleInheritanceBackend
    return ModelBackend.get_all_permissions(RoleInheritanceBackend(), user)


def _build_state(user, base):
    from companies.models import SectionAssignment
    from .models import UserPermissionOverride

    state = _State()
    state.base = base
    section_codes = section_permission_codes()
    section_full = {f'{PERMISSION_APP_LABEL}.{c}' for c in section_codes}

    # مجوزهای بخشی از نقش سامانه‌ای یا تیک مستقیم حساب نمی‌شوند (ت۲)
    system = {p for p in base if p not in section_full}

    adds: dict = {}
    removes: dict = {}
    for app_label, codename, company_id, mode in UserPermissionOverride.objects.filter(user_id=user.pk).values_list(
            'permission__content_type__app_label', 'permission__codename', 'company_id', 'mode'):
        is_section = app_label == PERMISSION_APP_LABEL and codename in section_codes
        if is_section:
            if company_id is None:
                continue
            (adds if mode == 'add' else removes).setdefault(company_id, set()).add(codename)
        elif company_id is None:
            full = f'{app_label}.{codename}'
            if mode == 'add':
                system.add(full)
            else:
                system.discard(full)
    state.system = system
    state.system_codenames = {p.split('.', 1)[1] for p in system if '.' in p}

    rows = list(SectionAssignment.objects.filter(user_id=user.pk, is_active=True).values_list(
        'role', 'company_id', 'project_id', 'project__company_id',
        'section_id', 'section__project_id', 'section__project__company_id'))
    if not rows:
        return state
    bundles = effective_bundles()
    empty = frozenset()
    for role, c_id, p_id, p_cid, s_id, s_pid, s_cid in rows:
        codes = bundles.get(role, empty)
        if s_id is not None:
            state.section.setdefault(s_id, set()).update(codes)
            state.section_chain[s_id] = (s_pid, s_cid)
            state.project_company.setdefault(s_pid, s_cid)
        elif p_id is not None:
            state.project.setdefault(p_id, set()).update(codes)
            state.project_company[p_id] = p_cid
        elif c_id is not None:
            state.company.setdefault(c_id, set()).update(codes)

    # تفاوت‌های هر شرکت به هر سطحِ همان شرکت می‌رود، تا پاسخ هر بخش اجتماع سادهٔ سه سطح بماند
    def apply(codes, company_id):
        codes |= adds.get(company_id, set())
        codes -= removes.get(company_id, set())

    for cid, codes in state.company.items():
        apply(codes, cid)
    for pid, codes in state.project.items():
        apply(codes, state.project_company.get(pid))
    for sid, codes in state.section.items():
        apply(codes, state.section_chain[sid][1])

    for level in (state.company, state.project, state.section):
        for codes in level.values():
            state.any_section |= codes
    return state


def _state(user):
    base = _base_permissions(user)
    state = getattr(user, _CACHE_ATTR, None)
    if state is None or state.base is not base:
        state = _build_state(user, base)
        setattr(user, _CACHE_ATTR, state)
    return state


def clear_scoped_permission_cache(user):
    """پاک کردن کش مجوزهای کاربر (پس از تغییر انتساب، بسته یا تفاوت در همان درخواست یا تست)."""
    for attr in (_CACHE_ATTR, '_perm_cache', '_user_perm_cache', '_group_perm_cache'):
        if hasattr(user, attr):
            delattr(user, attr)


def _is_live(user):
    return bool(user) and getattr(user, 'is_authenticated', False) and getattr(user, 'is_active', False)


def _section_chain(state, section):
    """(section_id, project_id, company_id)؛ بی‌پرس‌وجو برای بخش‌های انتساب‌ها یا نمونهٔ با پروژهٔ بارشده."""
    from companies.models import ProjectSection
    project_id = None
    if isinstance(section, ProjectSection):
        if ProjectSection._meta.get_field('project').is_cached(section):
            return section.pk, section.project_id, section.project.company_id
        section_id, project_id = section.pk, section.project_id
    else:
        try:
            section_id = int(section)
        except (TypeError, ValueError):
            return None, None, None
    if section_id in state.section_chain:
        return (section_id, *state.section_chain[section_id])
    if project_id is not None and project_id in state.project_company:
        return section_id, project_id, state.project_company[project_id]
    if section_id not in state.chains:
        row = ProjectSection.objects.filter(pk=section_id).values_list('project_id', 'project__company_id').first()
        state.chains[section_id] = row or (None, None)
    return (section_id, *state.chains[section_id])


def _codes_in_section(state, section_id, project_id, company_id):
    return (state.company.get(company_id, set()) | state.project.get(project_id, set())
            | state.section.get(section_id, set()))


# ─── رابط عمومی ──────────────────────────────────────────────────────────────────

def can(user, code, section=None) -> bool:
    """
    آیا کاربر کار `code` را (در بخش `section`) می‌تواند؟ code: codename ساده یا 'app_label.codename'.
    - مدیر کل سامانه (فعال): همیشه True. کاربر غیرفعال یا ناشناس: False.
    - مجوز سامانه‌ای: از مجوزهای سامانه‌ای کاربر؛ section نادیده گرفته می‌شود.
    - مجوز بخشی با section (نمونهٔ ProjectSection یا شناسه): بسته‌های انتساب‌های پوشانندهٔ همان بخش،
      با تفاوت‌های کاربر برای شرکت آن بخش. بخش غیرفعال هم پذیرفته می‌شود (مثل user_has_section_role).
    - مجوز بخشی بی section: «دست‌کم در یک بخش دارد».
    """
    if not _is_live(user):
        return False
    if user.is_superuser:
        return True
    state = _state(user)
    app_label, codename = _split_code(code)
    if permission_scope(code) == SYSTEM:
        if app_label is None:
            return codename in state.system_codenames
        return f'{app_label}.{codename}' in state.system
    if codename not in state.any_section:
        return False
    if section is None:
        return True
    section_id, project_id, company_id = _section_chain(state, section)
    if section_id is None:
        return False
    return codename in _codes_in_section(state, section_id, project_id, company_id)


def sections_where(user, code):
    """
    queryset بخش‌هایی (ProjectSection) که کاربر در آن‌ها کار `code` را می‌تواند؛ برای زیرپرس‌وجو
    (`section_id__in=sections_where(...)`). بخش و پروژهٔ غیرفعال هم می‌آیند (دیدن سوابق، مثل
    user_sections(include_inactive=True))؛ برای انتخاب بخش جهت ثبت تازه خودتان is_active را فیلتر کنید.
    - مدیر کل سامانه: همهٔ بخش‌ها.
    - مجوز بخشی: بخش‌هایی که انتساب‌های پوشانندهٔ آن‌ها (پس از تفاوت‌ها) این مجوز را دارند.
    - مجوز سامانه‌ای: اگر کاربر آن را دارد، بخش‌هایی که هر انتساب فعالش می‌پوشاند (کجا همیشه از انتساب
      می‌آید، ق۶)؛ وگرنه هیچ.
    ارزیابی queryset یک پرس‌وجو است و فهرست شناسه‌ها درون همان پرس‌وجو می‌نشیند.
    """
    from companies.models import ProjectSection
    if not _is_live(user):
        return ProjectSection.objects.none()
    if user.is_superuser:
        return ProjectSection.objects.all()
    state = _state(user)
    app_label, codename = _split_code(code)
    if permission_scope(code) == SYSTEM:
        has = (codename in state.system_codenames) if app_label is None else (f'{app_label}.{codename}' in state.system)
        if not has:
            return ProjectSection.objects.none()
        company_ids, project_ids, section_ids = list(state.company), list(state.project), list(state.section)
    else:
        company_ids = [cid for cid, codes in state.company.items() if codename in codes]
        project_ids = [pid for pid, codes in state.project.items() if codename in codes]
        section_ids = [sid for sid, codes in state.section.items() if codename in codes]
    if not (company_ids or project_ids or section_ids):
        return ProjectSection.objects.none()
    return ProjectSection.objects.filter(
        Q(project__company_id__in=company_ids) | Q(project_id__in=project_ids) | Q(id__in=section_ids)
    )


def section_q(user, code, prefix='section') -> Q:
    """
    شرط محدود کردن مدلی که FK بخش دارد: Q(<prefix>_id__in=sections_where(user, code)).
    مدیر کل سامانه: Q() (بی‌محدودیت، از جمله ردیف‌های بی‌بخش).
    """
    if _is_live(user) and user.is_superuser:
        return Q()
    return Q(**{f'{prefix}_id__in': sections_where(user, code).values('id')})


def codes_in_company(user, company_id) -> frozenset:
    """
    مجوزهای بخشی که کاربر دست‌کم در یک بخشِ شرکت `company_id` دارد (اجتماع سطح شرکت، پروژه‌ها و بخش‌های
    انتساب‌هایش در همان شرکت، پس از تفاوت‌های همان شرکت). برای قاعدهٔ ۳ ت۱۰ (طرح ۲.۲، الف۲): کسی که مدیر کل
    سامانه نیست فقط مجوز بخشی‌ای را در یک شرکت می‌دهد که خودش در همان شرکت دارد.
    مدیر کل سامانه: همهٔ مجوزهای بخشی. بی‌پرس‌وجوی اضافه پس از ساخت وضعیت.
    """
    if not _is_live(user):
        return frozenset()
    if user.is_superuser:
        return section_permission_codes()
    state = _state(user)
    out = set(state.company.get(company_id, ()))
    for pid, codes in state.project.items():
        if state.project_company.get(pid) == company_id:
            out |= codes
    for sid, codes in state.section.items():
        if state.section_chain[sid][1] == company_id:
            out |= codes
    return frozenset(out)


def system_permissions_from_roles(user) -> set:
    """
    'app_label.codename' مجوزهای سامانه‌ای کاربر از نقش‌های سامانه‌ای و تیک مستقیم، پیش از تفاوت‌های
    سامانه‌ای (ستون «از نقش‌ها» در زبانهٔ مجوزهای کاربر). مجوز بخشی اینجا نمی‌آید (ت۲).
    """
    if not _is_live(user):
        return set()
    section_full = {f'{PERMISSION_APP_LABEL}.{c}' for c in section_permission_codes()}
    return {p for p in _base_permissions(user) if p not in section_full}


def all_permission_names(user):
    """
    'app_label.codename' همهٔ مجوزهای کاربر برای `get_all_permissions` و `has_perm`: مجوزهای سامانه‌ای
    به‌اضافهٔ مجوزهای بخشی که دست‌کم در یک بخش دارد (ت۷). مدیر کل سامانه: خروجی خود جنگو (همهٔ مجوزها).
    """
    if not _is_live(user):
        return set()
    if user.is_superuser:
        return set(_base_permissions(user))
    state = _state(user)
    if state.all_names is None:
        state.all_names = frozenset(state.system | {f'{PERMISSION_APP_LABEL}.{c}' for c in state.any_section})
    return state.all_names


def user_permission_map(user) -> dict:
    """
    نقشهٔ فشردهٔ مجوزهای کاربر برای API و فرانت (ت۷):
    {
      'is_superuser': bool,
      'system':  [codename, ...],                 # مجوزهای سامانه‌ای
      'company': {company_id: [codename, ...]},   # از انتساب‌های سطح شرکت
      'project': {project_id: [codename, ...]},   # از انتساب‌های سطح پروژه
      'section': {section_id: [codename, ...]},   # از انتساب‌های سطح بخش
      'all':     [codename, ...],                 # اجتماع همه (برای منوها)
    }
    تفاوت‌های کاربر از پیش در هر سطحِ شرکت مربوط اعمال شده‌اند، پس فرانت فقط اجتماع می‌گیرد:
    can(code, sectionId) = code ∈ system (اگر سامانه‌ای) یا code ∈ company[cid] ∪ project[pid] ∪ section[sid]
    که pid و cid از دادهٔ سازمانی خود فرانت می‌آیند. سطح‌های بی‌مجوز حذف می‌شوند. کلیدها عددی‌اند (در JSON رشته).
    مدیر کل سامانه: is_superuser=True، سطح‌ها خالی و all همهٔ کدهای شناخته؛ فرانت برایش همیشه true بدهد.
    """
    empty = {'is_superuser': False, 'system': [], 'company': {}, 'project': {}, 'section': {}, 'all': []}
    if not _is_live(user):
        return empty
    if user.is_superuser:
        codes = sorted(permission_specs())
        return {**empty, 'is_superuser': True, 'system': codes, 'all': codes}
    state = _state(user)

    def level(d):
        return {k: sorted(v) for k, v in d.items() if v}

    system = sorted(state.system_codenames)
    return {
        'is_superuser': False,
        'system': system,
        'company': level(state.company),
        'project': level(state.project),
        'section': level(state.section),
        'all': sorted(set(system) | state.any_section),
    }


def section_permission_holder_ids(code, section, *, bundles=None) -> set:
    """
    شناسهٔ کاربران فعال و غیر مدیر کل که مجوز بخشی `code` را در بخش `section` دارند؛ همان قاعدهٔ can()
    (بستهٔ مؤثر نقش انتساب‌های فعالِ پوشانندهٔ بخش + تفاوت‌های کاربر برای شرکت همان بخش: افزوده فقط برای
    دارندهٔ انتساب پوشاننده، برداشته همیشه)، ولی برای همهٔ کاربران با شمار پرس‌وجوی ثابت (ق۱۸).
    مجوز سامانه‌ای یا ناشناخته مجموعهٔ خالی می‌دهد. bundles: خروجی effective_bundles() برای استفادهٔ دسته‌ای.
    section: نمونهٔ ProjectSection یا شناسهٔ آن. پیاده‌سازی تک‌بخشیِ section_permission_holders (یک قاعده).
    """
    from companies.org_roles import _section_chain as _chain

    _app_label, codename = _split_code(code)
    if permission_scope(code) != SECTION or codename in _sensitive_codes():
        return set()
    section_id, project_id, company_id = _chain(section)
    if section_id is None:
        return set()
    out = section_permission_holders({section_id: (project_id, company_id)}, [code], bundles=bundles)
    return out.get((section_id, codename), set())


def section_permission_holders(section_chains, codes, *, bundles=None, rows=None) -> dict:
    """
    نسخهٔ دسته‌ای section_permission_holder_ids برای چند بخش و چند مجوز، با شمار پرس‌وجوی ثابت (ق۱۸):
    یک پرس‌وجوی انتساب‌های پوشاننده (اگر rows داده نشود)، یک پرس‌وجوی تفاوت‌های کاربر و effective_bundles()
    (اگر bundles داده نشود).
    section_chains: {section_id: (project_id, company_id)}؛ codes: codename یا 'app_label.codename'.
    rows: خروجی companies.org_roles.covering_assignment_rows(section_chains) برای استفادهٔ دوباره.
    خروجی {(section_id, codename): set(user_id)} فقط برای مجوزهای بخشی غیرحساس (بقیه کلید ندارند).
    """
    from companies.org_roles import CoveringIndex, covering_assignment_rows
    from .models import UserPermissionOverride

    sensitive = _sensitive_codes()
    wanted = set()
    for code in codes:
        _app_label, codename = _split_code(code)
        if permission_scope(code) == SECTION and codename not in sensitive:
            wanted.add(codename)
    if not wanted or not section_chains:
        return {}
    if rows is None:
        rows = covering_assignment_rows(section_chains)
    out = {(sid, c): set() for sid in section_chains for c in wanted}
    if not rows:
        return out
    if bundles is None:
        bundles = effective_bundles()
    company_ids = {cid for _pid, cid in section_chains.values() if cid}
    added, removed = {}, {}
    for uid, cid, codename, mode in UserPermissionOverride.objects.filter(
        user_id__in=list({r[0] for r in rows}), company_id__in=list(company_ids),
        permission__content_type__app_label=PERMISSION_APP_LABEL, permission__codename__in=list(wanted),
    ).values_list('user_id', 'company_id', 'permission__codename', 'mode'):
        (added if mode == 'add' else removed).setdefault((cid, codename), set()).add(uid)
    index = CoveringIndex(rows)
    empty = frozenset()
    for sid, (pid, cid) in section_chains.items():
        covering = index.covering(sid, pid, cid)
        if not covering:
            continue
        covered = {r[0] for r in covering}
        for codename in wanted:
            have = {uid for uid, role, *_ in covering if codename in bundles.get(role, empty)}
            plus = added.get((cid, codename), set()) & covered
            out[(sid, codename)] = (have | plus) - removed.get((cid, codename), set())
    return out
