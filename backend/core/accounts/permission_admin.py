"""
مدیریت مجوزها: فهرست کامل، بسته‌های نقش انتساب، تفاوت‌های کاربر و قواعد ت۱۰ (طرح ۲.۲، الف۲).

قواعد ت۱۰ که اینجا پیاده شده‌اند و همهٔ مسیرهای اعطای مجوز (این API، CustomRoleViewSet، ساخت و ویرایش کاربر،
اکسل نقش‌ها و اکسل کاربران) از همین توابع می‌گذرند:
1. ویرایش بستهٔ نقش انتساب فقط برای مدیر کل سامانه (ensure_bundle_editor).
2. نقش سامانه‌ای و تفاوت کاربر فقط برای مدیر کل سامانه یا دارندهٔ perm_usr_role، و فقط روی کاربران
   get_visible_users_for_user ویرایش‌کننده (ensure_can_edit_user):
   - تفاوت بخشی فقط برای شرکتی که ویرایش‌کننده عضو آن است (get_user_allowed_companies)؛
   - نقش سامانه‌ای و تفاوت سامانه‌ای فقط اگر ویرایش‌کننده عضو همهٔ شرکت‌های کاربر باشد
     (شرکت‌های کاربر = get_user_allowed_companies(کاربر)، یعنی همان معنای «عضو»).
3. کسی که مدیر کل سامانه نیست فقط کدی را می‌دهد یا برمی‌دارد که خودش دارد (ensure_grantable):
   - مجوز سامانه‌ای: در مجوزهای سامانه‌ای خودش (all_permission_names، پس از تفاوت‌های سامانه‌ای خودش)؛
   - مجوز بخشی در شرکت C: دست‌کم در یک بخشِ C دارد (scoped_permissions.codes_in_company).
   افزودن و برداشتن یک قاعده دارند. مجوزها، نقش‌ها و تفاوت‌های خودش را هم نمی‌تواند تغییر دهد.
4. مجوز حساس (SENSITIVE_PERMISSION_CODENAMES) فقط به دست مدیر کل سامانه داده یا برداشته می‌شود و هرگز در
   بسته نیست (ورودی بسته با کد حساس ۴۰۰ می‌گیرد).
"""
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from . import scoped_permissions as sp

MANAGE_ROLES_PERMISSION = 'accounts.perm_usr_role'

SECTION_CODE_IN_ROLE_MESSAGE = (
    'مجوز «{code}» بخشی است و فقط از بستهٔ نقش انتساب یا تفاوت کاربرِ یک شرکت داده می‌شود؛ '
    'نقش سامانه‌ای و تیک مستقیم کاربر فقط مجوز سامانه‌ای می‌پذیرند.'
)
MSG_SENSITIVE = 'تنها مدیر کل سامانه مجاز به اعطا یا برداشتن مجوزهای حساس است: {codes}'
MSG_NOT_HELD = 'فقط مجوزی را می‌توانید بدهید یا بردارید که خودتان دارید: {codes}'
MSG_NOT_HELD_COMPANY = 'فقط مجوزی را می‌توانید در این شرکت بدهید یا بردارید که خودتان در همین شرکت دارید: {codes}'
MSG_SELF = 'مجوزها، نقش‌ها و تفاوت‌های مجوز خودتان را نمی‌توانید تغییر دهید.'
MSG_NO_MANAGE = 'ویرایش نقش‌های سامانه‌ای و مجوزهای کاربران به مجوز «تغییر ساختار سازمانی و نقش‌ها» نیاز دارد.'
MSG_NOT_VISIBLE = 'این کاربر در قلمرو شما نیست.'
MSG_COMPANY = 'تفاوت مجوز بخشی فقط برای شرکت‌هایی ثبت می‌شود که خودتان عضو آن هستید.'
MSG_SYSTEM_SCOPE = (
    'نقش سامانه‌ای و مجوز سامانه‌ای کاربر همه‌جا اعمال می‌شود؛ فقط وقتی می‌توانید آن را تغییر دهید '
    'که عضو همهٔ شرکت‌های این کاربر باشید.'
)
MSG_BUNDLE = 'ویرایش بستهٔ مجوز نقش‌های انتساب فقط برای مدیر کل سامانه است.'
MSG_UNKNOWN_ROLE = 'نقش انتساب «{role}» تعریف نشده است.'
MSG_UNKNOWN_CODES = 'این کدهای مجوز شناخته نیستند: {codes}'
MSG_NOT_SECTION = 'بستهٔ نقش انتساب فقط مجوز بخشیِ غیرحساس می‌پذیرد: {codes}'
MSG_OVERRIDE_SECTION_NEEDS_COMPANY = 'مجوز بخشی باید برای یک شرکت ثبت شود (company_id لازم است): {codes}'
MSG_OVERRIDE_SYSTEM_NO_COMPANY = 'برای شرکت فقط مجوز بخشی ثبت می‌شود؛ مجوز سامانه‌ای را با company_id خالی بفرستید: {codes}'
MSG_ADD_REMOVE_OVERLAP = 'یک کد نمی‌تواند هم افزوده و هم برداشته باشد: {codes}'
MSG_BAD_LIST = 'فیلد «{field}» باید فهرستی از کد مجوزها باشد.'
MSG_COMPANY_NOT_FOUND = 'شرکت یافت نشد.'

LOCK_SENSITIVE = 'مجوز حساس؛ فقط مدیر کل سامانه.'
LOCK_NOT_HELD = 'خودتان این مجوز را ندارید.'
LOCK_NOT_HELD_COMPANY = 'خودتان این مجوز را در این شرکت ندارید.'


def _codes_label(codes):
    return '، '.join(sorted(codes))


def _is_superuser(user):
    return bool(user and getattr(user, 'is_authenticated', False) and user.is_superuser and user.is_active)


def can_manage_permissions(user):
    """مدیر کل سامانه یا دارندهٔ perm_usr_role (قاعدهٔ ۲)."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return _is_superuser(user) or user.has_perm(MANAGE_ROLES_PERMISSION)


def member_company_ids(user):
    """شرکت‌هایی که کاربر «عضو» آن است (get_user_allowed_companies، سطح عضو)."""
    if user is None or not getattr(user, 'pk', None):
        return set()
    from companies.access import get_user_allowed_companies
    return set(get_user_allowed_companies(user).values_list('id', flat=True))


def _sensitive():
    from .models import SENSITIVE_PERMISSION_CODENAMES
    return SENSITIVE_PERMISSION_CODENAMES


def _codename(code):
    return str(code).split('.', 1)[-1]


# ─── قاعده‌های ت۱۰ ───────────────────────────────────────────────────────────────

def ensure_bundle_editor(editor):
    if not _is_superuser(editor):
        raise PermissionDenied(MSG_BUNDLE)


def system_edit_block_reason(editor, target, *, visible=None):
    """None اگر editor نقش سامانه‌ای / تفاوت سامانه‌ای target را می‌تواند تغییر دهد، وگرنه متن فارسی دلیل."""
    if _is_superuser(editor):
        return None
    if not can_manage_permissions(editor):
        return MSG_NO_MANAGE
    if target is None or not getattr(target, 'pk', None):
        return None  # کاربر تازه: هنوز شرکتی ندارد
    if target.pk == editor.pk:
        return MSG_SELF
    if visible is None:
        visible = _is_visible(editor, target)
    if not visible:
        return MSG_NOT_VISIBLE
    if not member_company_ids(target) <= member_company_ids(editor):
        return MSG_SYSTEM_SCOPE
    return None


def _is_visible(editor, target):
    if _is_superuser(editor):
        return True
    if target.is_superuser:
        return False
    from .scope import get_visible_users_for_user
    return get_visible_users_for_user(editor).filter(pk=target.pk).exists()


def ensure_can_edit_user(editor, target, *, system=False, company_id=None):
    """قاعده‌های ۲ و ۳ (خود): PermissionDenied با متن فارسی."""
    if _is_superuser(editor):
        return
    if not can_manage_permissions(editor):
        raise PermissionDenied(MSG_NO_MANAGE)
    if target is not None and getattr(target, 'pk', None):
        if target.pk == editor.pk:
            raise PermissionDenied(MSG_SELF)
        if not _is_visible(editor, target):
            raise PermissionDenied(MSG_NOT_VISIBLE)
    if company_id is not None and company_id not in member_company_ids(editor):
        raise PermissionDenied(MSG_COMPANY)
    if system:
        reason = system_edit_block_reason(editor, target, visible=True)
        if reason:
            raise PermissionDenied(reason)


def editor_holds(editor, code, company_id=None):
    """قاعدهٔ ۳: آیا ویرایش‌کننده خودش این کد را دارد؟ code: 'app_label.codename' یا codename ساده."""
    if _is_superuser(editor):
        return True
    if company_id is not None and sp.permission_scope(code) == sp.SECTION:
        return _codename(code) in sp.codes_in_company(editor, company_id)
    full = code if '.' in str(code) else f'{sp.PERMISSION_APP_LABEL}.{code}'
    return full in sp.all_permission_names(editor) and sp.permission_scope(full) == sp.SYSTEM


def ensure_grantable(editor, codes, company_id=None):
    """قاعده‌های ۳ و ۴ روی کدهایی که اعطا یا برداشته می‌شوند."""
    codes = set(codes)
    if not codes or _is_superuser(editor):
        return
    sensitive = {c for c in codes if _codename(c) in _sensitive()}
    if sensitive:
        raise PermissionDenied(MSG_SENSITIVE.format(codes=_codes_label(_codename(c) for c in sensitive)))
    missing = {c for c in codes if not editor_holds(editor, c, company_id)}
    if missing:
        msg = MSG_NOT_HELD_COMPANY if company_id is not None else MSG_NOT_HELD
        raise PermissionDenied(msg.format(codes=_codes_label(_codename(c) for c in missing)))


def section_codes_among(permissions):
    """کدهای بخشی میان نمونه‌های Permission (برای ردّ مجوز بخشی در نقش سامانه‌ای و تیک مستقیم، ت۲ و ت۱۱)."""
    section = sp.section_permission_codes()
    return sorted(
        p.codename for p in permissions
        if p.codename in section and p.content_type.app_label == sp.PERMISSION_APP_LABEL
    )


def reject_section_codes(permissions):
    """ValidationError (۴۰۰) اگر مجوز بخشی میان مجوزهای نقش سامانه‌ای یا تیک مستقیم باشد."""
    codes = section_codes_among(permissions)
    if codes:
        raise ValidationError({'permissions': [SECTION_CODE_IN_ROLE_MESSAGE.format(code=_codes_label(codes))]})


def _full_codes(perm_ids):
    if not perm_ids:
        return set()
    return {
        f'{app}.{codename}' for app, codename in Permission.objects.filter(id__in=list(perm_ids))
        .values_list('content_type__app_label', 'codename')
    }


def _group_perm_codes(group_ids):
    if not group_ids:
        return set()
    return {
        f'{app}.{codename}' for app, codename in Permission.objects.filter(group__id__in=list(group_ids))
        .values_list('content_type__app_label', 'codename')
    }


def ensure_role_change(editor, *, old_perm_ids=(), new_perm_ids=(), old_user_ids=(), new_user_ids=()):
    """
    تغییر نقش سامانه‌ای (مجوزها یا اعضا، ساخت یا حذف). کدهای اثرپذیرفته باید grantable باشند و هر کاربر
    اثرپذیرفته (همهٔ اعضا اگر مجوزها عوض شوند، وگرنه اعضای افزوده یا برداشته) system-editable باشد.
    """
    if _is_superuser(editor):
        return
    if not can_manage_permissions(editor):
        raise PermissionDenied(MSG_NO_MANAGE)
    old_p, new_p = set(old_perm_ids), set(new_perm_ids)
    old_u, new_u = set(old_user_ids), set(new_user_ids)
    changed_perms = old_p ^ new_p
    added_users, removed_users = new_u - old_u, old_u - new_u
    if not changed_perms and not added_users and not removed_users:
        return
    codes = _full_codes(changed_perms)
    if added_users:
        codes |= _full_codes(new_p)
    if removed_users:
        codes |= _full_codes(old_p)
    ensure_grantable(editor, codes)
    affected = (old_u | new_u) if changed_perms else (added_users | removed_users)
    _ensure_system_editable_users(editor, affected)


def _ensure_system_editable_users(editor, user_ids):
    from .models import CustomUser
    from .scope import get_visible_users_for_user
    user_ids = set(user_ids)
    if not user_ids:
        return
    if editor.pk in user_ids:
        raise PermissionDenied(MSG_SELF)
    visible = set(get_visible_users_for_user(editor).filter(pk__in=user_ids).values_list('pk', flat=True))
    if user_ids - visible:
        raise PermissionDenied(MSG_NOT_VISIBLE)
    editor_cids = member_company_ids(editor)
    for target in CustomUser.objects.filter(pk__in=user_ids):
        if not member_company_ids(target) <= editor_cids:
            raise PermissionDenied(MSG_SYSTEM_SCOPE)


def ensure_user_grant_change(editor, target, *, old_group_ids=(), new_group_ids=None,
                             old_perm_ids=(), new_perm_ids=None):
    """
    ساخت یا ویرایش کاربر (groups / roles / user_permissions) و اکسل کاربران. new_* = None یعنی دست نخورده.
    تیک مستقیم بخشیِ تازه برای همه ۴۰۰ است (ت۲).
    """
    old_g, old_p = set(old_group_ids), set(old_perm_ids)
    new_g = old_g if new_group_ids is None else set(new_group_ids)
    new_p = old_p if new_perm_ids is None else set(new_perm_ids)
    added_perms = new_p - old_p
    if added_perms:
        reject_section_codes(Permission.objects.filter(id__in=added_perms).select_related('content_type'))
    if old_g == new_g and old_p == new_p:
        return
    if _is_superuser(editor):
        return
    ensure_can_edit_user(editor, target, system=True)
    ensure_grantable(editor, _group_perm_codes(old_g ^ new_g) | _full_codes(old_p ^ new_p))


# ─── فهرست کامل و بسته‌ها ─────────────────────────────────────────────────────────

def role_entries():
    """[{key, label_fa, rank}] نقش‌های انتساب به ترتیب اعلام؛ rank اگر ماژول اعلام کرده باشد، وگرنه None."""
    from companies.models import section_role_choices
    out = []
    for item in section_role_choices():
        key, label = item[0], item[1]
        rank = item[2] if len(item) > 2 else None
        out.append({'key': key, 'label_fa': str(label), 'rank': rank})
    return out


def _role_keys():
    return [r['key'] for r in role_entries()]


def _bundle_json(details):
    return {k: sorted(v) for k, v in details.items()}


def permission_catalog():
    from platform_core.module_catalog import installed_permission_categories
    sensitive = _sensitive()
    section_codes = sp.section_permission_codes()
    categories = [
        {'module': c['module'], 'key': c['key'], 'label_fa': c['label_fa'], 'order': c['order'], 'menu': c['menu']}
        for c in installed_permission_categories()
    ]
    permissions = [
        {
            'code': code, 'label_fa': spec['label_fa'], 'module': spec['module'], 'category': spec['category'],
            'scope': sp.SECTION if code in section_codes else sp.SYSTEM,
            'sensitive': code in sensitive,
        }
        for code, spec in sorted(sp.permission_specs().items())
    ]
    bundles = {role: _bundle_json(d) for role, d in sorted(sp.role_bundle_details().items())}
    return {'categories': categories, 'permissions': permissions, 'roles': role_entries(), 'bundles': bundles}


def _user_permission_ct():
    from .models import CustomUser
    return ContentType.objects.get_for_model(CustomUser)


def _parse_code_list(data, field, required=True):
    value = data.get(field, [] if not required else None)
    if value is None or not isinstance(value, (list, tuple)) or not all(isinstance(c, str) for c in value):
        raise ValidationError({field: [MSG_BAD_LIST.format(field=field)]})
    return {c.strip() for c in value if c.strip()}


def _resolve_permissions(codes):
    """{codename: Permission} برای کدهای فهرست کامل؛ کد ناشناخته ۴۰۰."""
    codes = set(codes)
    specs = sp.permission_specs()
    unknown = {c for c in codes if c not in specs}
    found = {p.codename: p for p in Permission.objects.filter(
        content_type=_user_permission_ct(), codename__in=codes - unknown).select_related('content_type')}
    unknown |= codes - set(found) - unknown
    if unknown:
        raise ValidationError({'codes': [MSG_UNKNOWN_CODES.format(codes=_codes_label(unknown))]})
    return found


def set_role_bundle(editor, role_key, data):
    """PUT بسته: فقط تفاوت با پیش‌فرض ماژول‌ها ذخیره می‌شود. خروجی: (جزئیات تازه، افزوده‌ها، برداشته‌ها)."""
    from .models import RoleBundleOverride
    ensure_bundle_editor(editor)
    if role_key not in _role_keys():
        raise ValidationError({'role_key': [MSG_UNKNOWN_ROLE.format(role=role_key)]})
    effective = _parse_code_list(data, 'effective')
    allowed = sp.section_permission_codes()
    bad = effective - allowed
    if bad:
        raise ValidationError({'effective': [MSG_NOT_SECTION.format(codes=_codes_label(bad))]})
    before = sp.role_bundle_details().get(role_key, {}).get('effective', frozenset())
    defaults = sp.default_bundles().get(role_key, frozenset())
    add, remove = effective - defaults, defaults - effective
    perms = _resolve_permissions(add | remove)
    with transaction.atomic():
        RoleBundleOverride.objects.filter(role_key=role_key).delete()
        RoleBundleOverride.objects.bulk_create(
            [RoleBundleOverride(role_key=role_key, permission=perms[c], mode='add', updated_by=editor) for c in sorted(add)]
            + [RoleBundleOverride(role_key=role_key, permission=perms[c], mode='remove', updated_by=editor) for c in sorted(remove)]
        )
        details = sp.role_bundle_details()[role_key]
        _audit_bundle(editor, role_key, before, details['effective'], reset=False)
        from .permission_events import notify_bundle_changed
        notify_bundle_changed(role_key)
    return details


def reset_role_bundle(editor, role_key):
    from .models import RoleBundleOverride
    ensure_bundle_editor(editor)
    if role_key not in _role_keys():
        raise ValidationError({'role_key': [MSG_UNKNOWN_ROLE.format(role=role_key)]})
    before = sp.role_bundle_details().get(role_key, {}).get('effective', frozenset())
    with transaction.atomic():
        RoleBundleOverride.objects.filter(role_key=role_key).delete()
        details = sp.role_bundle_details()[role_key]
        _audit_bundle(editor, role_key, before, details['effective'], reset=True)
        from .permission_events import notify_bundle_changed
        notify_bundle_changed(role_key)
    return details


def bundle_detail_json(role_key, details):
    return {'role_key': role_key, **_bundle_json(details)}


# ─── زبانهٔ مجوزهای کاربر ─────────────────────────────────────────────────────────

def _assignment_rows(target):
    from companies.models import SectionAssignment
    labels = {r['key']: r['label_fa'] for r in role_entries()}
    rows = []
    qs = SectionAssignment.objects.filter(user=target, is_active=True).select_related(
        'company', 'project__company', 'section__project__company').order_by('id')
    for a in qs:
        if a.section_id:
            level, project, company = 'section', a.section.project, a.section.project.company
        elif a.project_id:
            level, project, company = 'project', a.project, a.project.company
        else:
            level, project, company = 'company', None, a.company
        rows.append({
            'id': a.id, 'level': level, 'role': a.role, 'role_label_fa': labels.get(a.role, a.role),
            'company_id': company.id if company else None, 'company_name': company.name if company else None,
            'project_id': project.id if project else None, 'project_name': project.name if project else None,
            'section_id': a.section_id, 'section_name': a.section.name if a.section_id else None,
        })
    return rows


def _override_rows(target):
    from .models import UserPermissionOverride
    return list(UserPermissionOverride.objects.filter(user=target).values_list(
        'permission__content_type__app_label', 'permission__codename', 'company_id', 'mode'))


def user_permissions_detail(editor, target):
    """پاسخ GET /api/accounts/users/<id>/permissions/ (قرارداد در handoff الف۲)."""
    from companies.models import Company
    specs = sp.permission_specs()
    section_codes = sp.section_permission_codes()
    superuser_editor = _is_superuser(editor)
    editor_cids = None if superuser_editor else member_company_ids(editor)

    assignments = _assignment_rows(target)
    if editor_cids is not None:
        assignments = [a for a in assignments if a['company_id'] in editor_cids]

    overrides = _override_rows(target)
    sys_added, sys_removed, comp_added, comp_removed = set(), set(), {}, {}
    for app, codename, company_id, mode in overrides:
        if app != sp.PERMISSION_APP_LABEL or codename not in specs:
            continue
        if codename in section_codes:
            if company_id is None:
                continue
            (comp_added if mode == 'add' else comp_removed).setdefault(company_id, set()).add(codename)
        elif company_id is None:
            (sys_added if mode == 'add' else sys_removed).add(codename)

    from_roles_sys = {
        p.split('.', 1)[1] for p in sp.system_permissions_from_roles(target)
        if p.startswith(f'{sp.PERMISSION_APP_LABEL}.') and p.split('.', 1)[1] in specs
    }
    system = {
        'from_roles': sorted(from_roles_sys), 'added': sorted(sys_added), 'removed': sorted(sys_removed),
        'effective': sorted((from_roles_sys | sys_added) - sys_removed),
    }

    bundles = sp.effective_bundles()
    from_roles_comp = {}
    for a in _assignment_rows(target):
        if a['company_id'] is not None:
            from_roles_comp.setdefault(a['company_id'], set()).update(bundles.get(a['role'], ()))
    company_ids = set(from_roles_comp) | set(comp_added) | set(comp_removed)
    if editor_cids is not None:
        company_ids &= editor_cids
    names = dict(Company.objects.filter(id__in=company_ids).values_list('id', 'name'))
    companies = {}
    for cid in sorted(company_ids):
        base = from_roles_comp.get(cid, set())
        plus, minus = comp_added.get(cid, set()), comp_removed.get(cid, set())
        companies[cid] = {
            'name': names.get(cid), 'has_assignment': cid in from_roles_comp,
            'from_roles': sorted(base), 'added': sorted(plus), 'removed': sorted(minus),
            'effective': sorted((base | plus) - minus),
        }

    return {
        'user_id': target.pk, 'is_superuser': target.is_superuser,
        'assignments': assignments, 'system': system, 'companies': companies,
        'editable': _editable(editor, target, companies),
    }


def _editable(editor, target, companies):
    if _is_superuser(editor):
        return {'system': True, 'system_reason_fa': None, 'companies': sorted(companies),
                'locked_codes': {}, 'company_locked_codes': {}}
    reason = system_edit_block_reason(editor, target)
    editable_cids = []
    if can_manage_permissions(editor) and target.pk != editor.pk and _is_visible(editor, target):
        editor_cids = member_company_ids(editor)
        editable_cids = [cid for cid in sorted(companies) if cid in editor_cids]
    sensitive = _sensitive()
    section_codes = sp.section_permission_codes()
    locked = {}
    held = sp.all_permission_names(editor)
    for code in sp.permission_specs():
        if code in section_codes:
            continue
        if code in sensitive:
            locked[code] = LOCK_SENSITIVE
        elif f'{sp.PERMISSION_APP_LABEL}.{code}' not in held:
            locked[code] = LOCK_NOT_HELD
    company_locked = {
        cid: {code: LOCK_NOT_HELD_COMPANY for code in sorted(section_codes - sp.codes_in_company(editor, cid))}
        for cid in editable_cids
    }
    return {'system': reason is None, 'system_reason_fa': reason, 'companies': editable_cids,
            'locked_codes': locked, 'company_locked_codes': company_locked}


def set_user_overrides(editor, target, data):
    """
    PUT /api/accounts/users/<id>/permissions/ بدنهٔ {"company_id": int|null, "add": [...], "remove": [...]}:
    ردیف‌های تفاوت همان دامنه (شرکت یا سامانه) جایگزین می‌شوند. تفاوت بی‌اثر (افزودن کدی که از نقش‌ها
    دارد، برداشتن کدی که ندارد) ذخیره نمی‌شود. خروجی: (افزوده‌های تازه، برداشته‌های تازه، کدهای تغییرکرده).
    """
    from companies.models import Company
    from .models import UserPermissionOverride
    raw_cid = data.get('company_id')
    company_id = None
    if raw_cid not in (None, ''):
        try:
            company_id = int(raw_cid)
        except (TypeError, ValueError):
            raise ValidationError({'company_id': ['شناسهٔ شرکت باید عددی باشد.']})
        if not Company.objects.filter(id=company_id).exists():
            raise ValidationError({'company_id': [MSG_COMPANY_NOT_FOUND]})
    add = _parse_code_list(data, 'add', required=False)
    remove = _parse_code_list(data, 'remove', required=False)
    overlap = add & remove
    if overlap:
        raise ValidationError({'add': [MSG_ADD_REMOVE_OVERLAP.format(codes=_codes_label(overlap))]})
    perms = _resolve_permissions(add | remove)
    section_codes = sp.section_permission_codes()
    if company_id is None:
        bad = {c for c in add | remove if c in section_codes}
        if bad:
            raise ValidationError({'company_id': [MSG_OVERRIDE_SECTION_NEEDS_COMPANY.format(codes=_codes_label(bad))]})
    else:
        bad = {c for c in add | remove if c not in section_codes}
        if bad:
            raise ValidationError({'company_id': [MSG_OVERRIDE_SYSTEM_NO_COMPANY.format(codes=_codes_label(bad))]})

    ensure_can_edit_user(editor, target, system=company_id is None, company_id=company_id)

    # تفاوت بی‌اثر ذخیره نمی‌شود
    if company_id is None:
        base = {p.split('.', 1)[1] for p in sp.system_permissions_from_roles(target)
                if p.startswith(f'{sp.PERMISSION_APP_LABEL}.')}
    else:
        from companies.models import SectionAssignment
        bundles = sp.effective_bundles()
        base = set()
        for role, *chain in SectionAssignment.objects.filter(user=target, is_active=True).values_list(
                'role', 'company_id', 'project__company_id', 'section__project__company_id'):
            if (chain[0] or chain[1] or chain[2]) == company_id:
                base |= bundles.get(role, frozenset())
    existing = UserPermissionOverride.objects.filter(user=target, company_id=company_id)
    old = {(codename, mode) for codename, mode in existing.values_list('permission__codename', 'mode')}
    # «برداشته»ای که از قبل ثبت شده و فرانت دوباره فرستاده می‌ماند، حتی اگر کد الان در پایه نباشد؛ وگرنه با
    # برگشتن کد به بسته، مجوزی که مدیر عمداً برداشته بود دوباره به کاربر می‌رسید (ق۱۷)
    kept_removes = {c for c, m in old if m == 'remove'}
    add -= base
    remove &= base | kept_removes
    new = {(c, 'add') for c in add} | {(c, 'remove') for c in remove}
    changed_codes = {c for c, _ in old ^ new}
    ensure_grantable(editor, {f'{sp.PERMISSION_APP_LABEL}.{c}' for c in changed_codes}, company_id)

    if not changed_codes:
        return sorted(add), sorted(remove), []
    with transaction.atomic():
        existing.delete()
        rows = [UserPermissionOverride(user=target, permission=perms[c], company_id=company_id, mode=m,
                                       created_by=editor) for c, m in sorted(new)]
        for row in rows:
            row.full_clean(validate_unique=False, validate_constraints=False)
        UserPermissionOverride.objects.bulk_create(rows)
        _audit_override(editor, target, company_id, old, new)
        from .permission_events import notify_override_changed
        notify_override_changed(target.pk, company_id)
    sp.clear_scoped_permission_cache(target)
    return sorted(add), sorted(remove), sorted(changed_codes)


# ─── سابقه (ق۸) ─────────────────────────────────────────────────────────────────

def _audit(editor, **kwargs):
    from .audit_utils import log_audit_event
    log_audit_event(user=editor, module='users', severity='critical', **kwargs)


def _audit_bundle(editor, role_key, before, after, reset):
    added, removed = sorted(set(after) - set(before)), sorted(set(before) - set(after))
    _audit(editor, action='UPDATE', target_model='RoleBundle', target_object_id=role_key,
           target_repr=f'بستهٔ مجوز نقش انتساب «{role_key}»' + (' (بازگشت به پیش‌فرض)' if reset else ''),
           details={'role_key': role_key, 'reset': reset, 'added': added, 'removed': removed})


def _audit_override(editor, target, company_id, old, new):
    def split(rows):
        return sorted(c for c, m in rows if m == 'add'), sorted(c for c, m in rows if m == 'remove')
    old_add, old_remove = split(old)
    new_add, new_remove = split(new)
    _audit(editor, action='UPDATE', target_model='UserPermissionOverride', target_object_id=str(target.pk),
           target_repr=f'تفاوت مجوز کاربر {target.username}' + (f' در شرکت {company_id}' if company_id else ' (سامانه‌ای)'),
           company_id=company_id,
           before_state={'added': old_add, 'removed': old_remove},
           after_state={'added': new_add, 'removed': new_remove},
           details={'user_id': target.pk, 'company_id': company_id,
                    'granted': sorted(set(new_add) - set(old_add)) + sorted(set(old_remove) - set(new_remove)),
                    'revoked': sorted(set(new_remove) - set(old_remove)) + sorted(set(old_add) - set(new_add))})


def audit_role_permissions(editor, role, old_perm_ids, new_perm_ids, old_user_ids, new_user_ids):
    """جزئیات تغییر مجوزها و اعضای نقش سامانه‌ای برای سابقه (ق۸)."""
    old_codes, new_codes = _full_codes(old_perm_ids), _full_codes(new_perm_ids)
    return {
        'permissions_added': sorted(new_codes - old_codes), 'permissions_removed': sorted(old_codes - new_codes),
        'users_added': sorted(set(new_user_ids) - set(old_user_ids)),
        'users_removed': sorted(set(old_user_ids) - set(new_user_ids)),
    }
