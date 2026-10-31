"""
حوزهٔ مخاطبان چت و دسترسی هر کاربر به پیام‌رسان
(طرح «دسترسی به چت و حوزهٔ مخاطبان»، ت۱ تا ت۹).

- نبودن ردیف ChatUserPolicy یعنی دسترسی باز و «پیروی از شرکت»؛ نبودن ChatCompanyPolicy یعنی `company`.
- عضو شرکت C: انتساب فعال در C (سطح شرکت، پروژه یا بخش) یا ردیف UserCompanyAccess در C؛ فقط شرکت فعال.
- بخش‌های پوشش‌داده: انتساب بخش ← همان بخش؛ پروژه ← همهٔ بخش‌های پروژه؛ شرکت ← همهٔ بخش‌های C.
- پروژه‌های پوشش‌داده: پروژهٔ بخش‌های پوشش‌داده، به‌اضافهٔ خودِ پروژهٔ انتساب سطح پروژه (حتی بی‌بخش)
  و همهٔ پروژه‌های C برای انتساب سطح شرکت.
- فعال یا غیرفعال بودن پروژه و بخش اینجا سنجیده نمی‌شود؛ فقط فعال بودن انتساب و شرکت.
- مدیر کل همه را می‌بیند و همیشه دیده می‌شود؛ کاربر بسته‌شده در فهرست هیچ‌کس نیست؛ حوزه یک‌طرفه است.
همهٔ محاسبه‌ها با تعداد ثابتی کوئری انجام می‌شود (نه یک کوئری برای هر کاربر).
"""
from collections import defaultdict

from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import ChatCompanyPolicy, ChatContactScope, ChatUserPolicy

User = get_user_model()

SCOPE_SECTION = ChatContactScope.SECTION.value
SCOPE_PROJECT = ChatContactScope.PROJECT.value
SCOPE_COMPANY = ChatContactScope.COMPANY.value
SCOPE_ALL = ChatContactScope.ALL.value
SCOPE_CHOICES = (SCOPE_SECTION, SCOPE_PROJECT, SCOPE_COMPANY, SCOPE_ALL)
# ترتیب گستردگی حوزه‌ها (برای نمایش یک حوزهٔ مؤثر در capabilities)
SCOPE_RANK = {SCOPE_SECTION: 0, SCOPE_PROJECT: 1, SCOPE_COMPANY: 2, SCOPE_ALL: 3}
DEFAULT_COMPANY_SCOPE = SCOPE_COMPANY

BLOCKED_MESSAGE = 'دسترسی شما به پیام‌رسان بسته شده است'
OUT_OF_SCOPE_MESSAGE = 'این کاربر در حوزهٔ مخاطبان شما نیست'
MEMBERS_OUT_OF_SCOPE_MESSAGE = 'برخی کاربران در حوزهٔ مخاطبان شما نیستند؛ هیچ عضوی اضافه نشد'


def _is_authenticated(user):
    return bool(user is not None and getattr(user, 'is_authenticated', False))


def _user_policy(user):
    """(chat_allowed, contact_scope) کاربر؛ نبودن ردیف = (True, '')"""
    row = ChatUserPolicy.objects.filter(user_id=user.pk).values_list('chat_allowed', 'contact_scope').first()
    if row is None:
        return True, ''
    return bool(row[0]), row[1] or ''


def chat_allowed(user):
    """آیا کاربر به پیام‌رسان دسترسی دارد؟ مدیر کل همیشه (ت۱)؛ نبودن ردیف = باز."""
    if not _is_authenticated(user):
        return False
    if user.is_superuser:
        return True
    return _user_policy(user)[0]


def blocked_user_ids(user_ids=None):
    """شناسهٔ کاربران بسته‌شده (غیر مدیر کل)؛ اگر user_ids داده شود فقط از میان همان‌ها. یک کوئری."""
    qs = ChatUserPolicy.objects.filter(chat_allowed=False, user__is_superuser=False)
    if user_ids is not None:
        ids = list(user_ids)
        if not ids:
            return set()
        qs = qs.filter(user_id__in=ids)
    return set(qs.values_list('user_id', flat=True))


def company_default_scope(company_id):
    row = ChatCompanyPolicy.objects.filter(company_id=company_id).values_list('contact_scope', flat=True).first()
    return row or DEFAULT_COMPANY_SCOPE


def effective_scope(user, company_id):
    """حوزهٔ کاربر در شرکت company_id: حوزهٔ خود کاربر، یا اگر خالی باشد پیش‌فرض شرکت (ت۴)."""
    if _is_authenticated(user) and user.is_superuser:
        return SCOPE_ALL
    own = _user_policy(user)[1] if _is_authenticated(user) else ''
    return own or company_default_scope(company_id)


def member_company_ids(user):
    """شرکت‌های فعالی که کاربر عضو آن‌هاست (انتساب فعال یا ردیف UserCompanyAccess). دو کوئری."""
    from companies.models import SectionAssignment, UserCompanyAccess
    ids = set()
    rows = SectionAssignment.objects.filter(user_id=user.pk, is_active=True).values_list(
        'company_id', 'company__is_active',
        'project__company_id', 'project__company__is_active',
        'section__project__company_id', 'section__project__company__is_active',
    )
    for c1, a1, c2, a2, c3, a3 in rows:
        for cid, active in ((c1, a1), (c2, a2), (c3, a3)):
            if cid is not None and active:
                ids.add(cid)
    ids |= set(UserCompanyAccess.objects.filter(user_id=user.pk, company__is_active=True)
               .values_list('company_id', flat=True))
    return ids


def _company_maps(company_ids):
    """
    برای مجموعهٔ شرکت‌ها، در چهار کوئری:
    members[cid] = اعضا؛ coverage[cid][uid] = {'sections': set, 'projects': set}
    """
    from companies.models import Project, ProjectSection, SectionAssignment, UserCompanyAccess
    cids = set(company_ids)
    members = defaultdict(set)
    coverage = defaultdict(lambda: defaultdict(lambda: {'sections': set(), 'projects': set()}))
    if not cids:
        return members, coverage

    sections_by_company = defaultdict(set)
    sections_by_project = defaultdict(set)
    projects_by_company = defaultdict(set)
    for pid, cid in Project.objects.filter(company_id__in=cids).values_list('id', 'company_id'):
        projects_by_company[cid].add(pid)
    for sid, pid, cid in ProjectSection.objects.filter(project__company_id__in=cids).values_list(
            'id', 'project_id', 'project__company_id'):
        sections_by_project[pid].add(sid)
        sections_by_company[cid].add(sid)

    rows = SectionAssignment.objects.filter(is_active=True).filter(
        Q(company_id__in=cids) | Q(project__company_id__in=cids) | Q(section__project__company_id__in=cids)
    ).values_list('user_id', 'company_id', 'project_id', 'project__company_id',
                  'section_id', 'section__project_id', 'section__project__company_id')
    for uid, a_cid, a_pid, p_cid, a_sid, s_pid, s_cid in rows:
        if a_cid is not None:
            cov = coverage[a_cid][uid]
            cov['sections'] |= sections_by_company[a_cid]
            cov['projects'] |= projects_by_company[a_cid]
            members[a_cid].add(uid)
        elif a_pid is not None:
            cov = coverage[p_cid][uid]
            cov['sections'] |= sections_by_project[a_pid]
            cov['projects'].add(a_pid)
            members[p_cid].add(uid)
        elif a_sid is not None:
            cov = coverage[s_cid][uid]
            cov['sections'].add(a_sid)
            cov['projects'].add(s_pid)
            members[s_cid].add(uid)

    for uid, cid in UserCompanyAccess.objects.filter(company_id__in=cids).values_list('user_id', 'company_id'):
        members[cid].add(uid)
    return members, coverage


def _superuser_ids():
    return set(User.objects.filter(is_superuser=True, is_active=True).values_list('id', flat=True))


def visible_contact_ids(user):
    """
    شناسهٔ کاربرانی که user می‌تواند ببیند و با آن‌ها گفتگوی تازه شروع کند.
    None یعنی «همه» (مدیر کل یا حوزهٔ `all`). مجموعه شامل مدیران کل است، بدون خود کاربر و بدون کاربران
    بسته‌شده. فعال بودن کاربران را فراخواننده می‌سنجد (contact_queryset).
    """
    if not _is_authenticated(user):
        return set()
    if user.is_superuser:
        return None
    _allowed, own_scope = _user_policy(user)
    if own_scope == SCOPE_ALL:
        return None

    cids = member_company_ids(user)
    result = set()
    if cids:
        defaults = dict(ChatCompanyPolicy.objects.filter(company_id__in=cids).values_list('company_id', 'contact_scope'))
        scopes = {cid: (own_scope or defaults.get(cid) or DEFAULT_COMPANY_SCOPE) for cid in cids}
        if any(s == SCOPE_ALL for s in scopes.values()):
            return None
        members, coverage = _company_maps(cids)
        for cid, scope in scopes.items():
            if scope == SCOPE_COMPANY:
                result |= members[cid]
                continue
            key = 'sections' if scope == SCOPE_SECTION else 'projects'
            mine = coverage[cid][user.pk][key] if user.pk in coverage[cid] else set()
            if not mine:
                continue
            for uid, cov in coverage[cid].items():
                if cov[key] & mine:
                    result.add(uid)

    result |= _superuser_ids()
    result.discard(user.pk)
    result -= blocked_user_ids(result)
    return result


def contact_queryset(user):
    """کاربران فعال قابل‌دیدن برای فهرست مخاطبان (بدون خود کاربر و بدون کاربران بسته‌شده)."""
    qs = User.objects.filter(is_active=True).exclude(id=user.pk)
    ids = visible_contact_ids(user)
    if ids is None:
        return qs.exclude(id__in=blocked_user_ids())
    return qs.filter(id__in=ids)


def can_contact(user, target):
    """آیا user می‌تواند با target گفتگوی دو‌نفرهٔ تازه شروع کند یا او را به گروه بیفزاید؟"""
    if not _is_authenticated(user) or target is None:
        return False
    if user.is_superuser:
        return True
    if target.pk == user.pk:
        return False
    return not ids_outside_scope(user, [target.pk])


def ids_outside_scope(user, user_ids):
    """از میان user_ids آن‌هایی که بیرون از حوزهٔ user هستند (مدیر کل استثناست؛ خود کاربر شمرده نمی‌شود)."""
    ids = [i for i in dict.fromkeys(user_ids) if i != getattr(user, 'pk', None)]
    if not ids or (_is_authenticated(user) and user.is_superuser):
        return []
    visible = visible_contact_ids(user)
    if visible is None:
        blocked = blocked_user_ids(ids)
        return [i for i in ids if i in blocked]
    return [i for i in ids if i not in visible]


def display_contact_scope(user):
    """
    حوزهٔ مؤثر برای نمایش در capabilities: (scope, source).
    مدیر کل ← ('all', 'superuser'). حوزهٔ خود کاربر اگر تعیین شده باشد ← (scope, 'user').
    وگرنه گسترده‌ترین پیش‌فرضِ شرکت‌های عضو ← (scope, 'company')؛ بدون شرکت ← ('company', 'company').
    """
    if not _is_authenticated(user):
        return DEFAULT_COMPANY_SCOPE, 'company'
    if user.is_superuser:
        return SCOPE_ALL, 'superuser'
    own = _user_policy(user)[1]
    if own:
        return own, 'user'
    cids = member_company_ids(user)
    if not cids:
        return DEFAULT_COMPANY_SCOPE, 'company'
    defaults = dict(ChatCompanyPolicy.objects.filter(company_id__in=cids).values_list('company_id', 'contact_scope'))
    scopes = [defaults.get(cid) or DEFAULT_COMPANY_SCOPE for cid in cids]
    return max(scopes, key=lambda s: SCOPE_RANK.get(s, 0)), 'company'
