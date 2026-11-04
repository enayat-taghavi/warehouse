"""
بخشنامه (ل-ه، ن۱۸ و س۴ طرح plan_letters.md).

- مخاطب: «همهٔ شرکت» یا یک یا چند بخش همان شرکت (`CircularAudience`)؛ فقط در پیش‌نویس و به دست نویسنده یا
  هم‌نویسنده با مجوز `perm_letters_circular` تعیین می‌شود.
- دیدن: قاعدهٔ `visible_letters` (ل-ج) — بخشنامهٔ ثبت‌شده فقط برای مخاطبانش (و نویسنده‌ها و امضاکننده‌ها).
- پس از ثبت هیچ کاری ساخته نمی‌شود («کارهای من» خالی می‌ماند)؛ فقط یک اعلان یک‌باره با `notify_users`.
- «خوانده/نخوانده» و «چه کسانی خواندند» از `EntityViewLog` (باز کردن بخشنامه ثبت می‌شود).
"""
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from rest_framework.exceptions import PermissionDenied, ValidationError

from . import access
from .models import LETTER_ENTITY, CircularAudience, Letter

MAX_AUDIENCE_SECTIONS = 50
CIRCULAR_NOTIFICATION = 'letters_circular'


def _conflict(message):
    from .services.lifecycle import Conflict
    return Conflict(message)


def parse_audience(letter, raw):
    """ورودی [{'scope': 'company'}] یا [{'scope': 'section', 'section_id': N}, ...]؛ بخش فقط از شرکت نامه."""
    if not isinstance(raw, (list, tuple)) or not raw:
        raise ValidationError({'audience': 'مخاطب بخشنامه را مشخص کنید.'})
    scopes = set()
    sections = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError({'audience': 'مخاطب نامعتبر است.'})
        scope = item.get('scope')
        if scope == CircularAudience.SCOPE_COMPANY:
            scopes.add(scope)
        elif scope == CircularAudience.SCOPE_SECTION:
            sid = access._letter_pk(item.get('section_id'))
            if sid is None:
                raise ValidationError({'audience': 'بخش مخاطب نامعتبر است.'})
            if sid not in sections:
                sections.append(sid)
        else:
            raise ValidationError({'audience': 'دامنهٔ مخاطب نامعتبر است.'})
    if scopes and sections:
        raise ValidationError({'audience': '«همهٔ شرکت» با بخش جمع نمی‌شود.'})
    if len(sections) > MAX_AUDIENCE_SECTIONS:
        raise ValidationError({'audience': f'حداکثر {MAX_AUDIENCE_SECTIONS} بخش.'})
    if sections:
        from companies.models import ProjectSection
        found = set(ProjectSection.objects.filter(pk__in=sections, project__company_id=letter.company_id)
                    .values_list('pk', flat=True))
        if found != set(sections):
            raise ValidationError({'audience': 'بخش مخاطب باید از همان شرکت نامه باشد.'})
    return sections if sections else None


def set_audience(user, letter, raw):
    """مخاطب بخشنامهٔ پیش‌نویس را جایگزین می‌کند (نامه قفل‌شده). ردیف‌های مخاطب پیش‌نویس، تنظیم‌اند نه داده."""
    if letter.kind != Letter.KIND_CIRCULAR:
        raise ValidationError({'kind': 'فقط بخشنامه مخاطب دارد.'})
    if not access.is_editor(user, letter) or not access.has_company_perm(user, letter.company_id,
                                                                        access.CIRCULAR_PERM):
        raise PermissionDenied('تعیین مخاطب بخشنامه برای شما مجاز نیست.')
    if letter.status != Letter.STATUS_DRAFT:
        raise _conflict('مخاطب فقط در پیش‌نویس عوض می‌شود.')
    sections = parse_audience(letter, raw)
    with transaction.atomic():
        CircularAudience.objects.filter(letter_id=letter.pk).delete()
        if sections is None:
            CircularAudience.objects.create(letter=letter, scope=CircularAudience.SCOPE_COMPANY)
        else:
            CircularAudience.objects.bulk_create([
                CircularAudience(letter=letter, scope=CircularAudience.SCOPE_SECTION, section_id=sid)
                for sid in sections])
        letter.revision += 1
        letter.save(update_fields=['revision', 'updated_at'])
    return letter


def audience_payload(letter):
    return [{'scope': a.scope, 'section_id': a.section_id}
            for a in CircularAudience.objects.filter(letter_id=letter.pk).order_by('id')]


def audience_user_ids(letter) -> set:
    """
    اعضای فعال مخاطب (همان پوشش قاعدهٔ دیدن): «همهٔ شرکت» = هر انتساب فعال در شرکت؛ بخش = انتساب فعال همان بخش،
    پروژهٔ آن یا سطح شرکت.
    """
    from companies.models import ProjectSection, SectionAssignment
    from companies.org_roles import assignments_in_companies_q
    rows = list(CircularAudience.objects.filter(letter_id=letter.pk).values_list('scope', 'section_id'))
    if not rows:
        return set()
    qs = SectionAssignment.objects.filter(is_active=True, user__is_active=True)
    if any(scope == CircularAudience.SCOPE_COMPANY for scope, _sid in rows):
        qs = qs.filter(assignments_in_companies_q([letter.company_id]))
    else:
        sids = [sid for _scope, sid in rows if sid]
        projects = ProjectSection.objects.filter(pk__in=sids, project__company_id=letter.company_id).values(
            'project_id')
        qs = qs.filter(Q(section_id__in=sids, section__project__company_id=letter.company_id)
                       | Q(project_id__in=projects) | Q(company_id=letter.company_id))
    return set(qs.values_list('user_id', flat=True).distinct())


def notify_on_register(letter):
    """ن۱۸: اعلان یک‌بارهٔ «بخشنامهٔ تازه» (پس از commit ثبت)؛ نویسنده خودش اعلان نمی‌گیرد. کار ساخته نمی‌شود."""
    if letter.kind != Letter.KIND_CIRCULAR:
        return
    from notifications.services import notify_users
    ids = audience_user_ids(letter) - {letter.author_id}
    if not ids:
        return
    title = 'بخشنامهٔ تازه'
    message = letter.number_display or 'بخشنامه'
    if not letter.is_confidential and letter.subject:
        message = f'{message}: {letter.subject}'[:300]
    notify_users(ids, title=title, message=message, notification_type=CIRCULAR_NOTIFICATION,
                 target_model='Letter', target_id=letter.pk, url=f'/app/letters/{letter.pk}',
                 company_id=letter.company_id)


def _view_log_q(user):
    from attachments.models import EntityViewLog
    from django.db.models.functions import Cast
    from django.db.models import CharField
    return Exists(EntityViewLog.objects.filter(
        user_id=user.pk, entity_kind=LETTER_ENTITY, entity_id=Cast(OuterRef('pk'), CharField())))


def circulars_for(user, company_id=None):
    """بخشنامه‌های ثبت‌شده‌ای که کاربر می‌بیند، با is_read (یک queryset، بی‌حلقه)."""
    qs = access.visible_letters(user).filter(kind=Letter.KIND_CIRCULAR, registered_at__isnull=False).exclude(
        status=Letter.STATUS_VOID)
    if company_id:
        qs = qs.filter(company_id=company_id)
    return qs.annotate(is_read=_view_log_q(user))


def viewers(letter):
    """«چه کسی دید» (ن۹، ن۱۸): هر کاربر یک ردیف با نخستین و آخرین دیدن و شمار دیدن‌ها."""
    from attachments.models import EntityViewLog
    from django.db.models import Count, Max, Min

    from .serializers import _user_brief
    rows = (EntityViewLog.objects.filter(entity_kind=LETTER_ENTITY, entity_id=str(letter.pk))
            .values('user_id').annotate(first=Min('viewed_at'), last=Max('viewed_at'), times=Count('id'))
            .order_by('first'))
    from django.contrib.auth import get_user_model
    users = get_user_model().objects.in_bulk([r['user_id'] for r in rows])
    return [{'user': _user_brief(users.get(r['user_id'])), 'first_viewed_at': r['first'], 'last_viewed_at': r['last'],
             'times': r['times']} for r in rows]
