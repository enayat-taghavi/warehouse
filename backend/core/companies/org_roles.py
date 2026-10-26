"""
تنها پاسخ‌دهندهٔ «چه کسی در این بخش نقش X را دارد» (طرح ۲.۱، ت۴).

انتساب در سه سطح است (ت۳): شرکت (برای همهٔ بخش‌های آن)، پروژه (برای همهٔ بخش‌های آن) یا یک بخش.
فقط انتساب‌های فعال حساب می‌شوند. هسته هیچ کد نقشی نمی‌شناسد؛ نقش را ماژول‌ها می‌دهند (section_role_choices).
ماژول‌ها و موتور گردش کار به‌جای فیلتر مستقیم `SectionAssignment.objects.filter(section=...)` از همین توابع
استفاده می‌کنند. هر تابع یک کوئری است (زیرکوئری به‌جای حلقه؛ ق۱۸).
"""
from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import ProjectSection, SectionAssignment


def assignments_in_companies_q(company_ids, prefix=''):
    """
    شرط انتساب‌هایی که در یکی از شرکت‌های داده‌شده معتبرند (هر سه سطح).
    prefix برای فیلتر از مدل دیگر، مثلاً 'section_assignments__' روی کاربر.
    """
    ids = list(company_ids)
    return (
        Q(**{f'{prefix}company_id__in': ids})
        | Q(**{f'{prefix}project__company_id__in': ids})
        | Q(**{f'{prefix}section__project__company_id__in': ids})
    )


def _section_chain(section):
    """(section_id, project_id, company_id) برای نمونهٔ بخش یا شناسهٔ آن؛ بی‌کوئری اگر پروژه از قبل بار شده باشد."""
    if isinstance(section, ProjectSection):
        if ProjectSection._meta.get_field('project').is_cached(section):
            return section.pk, section.project_id, section.project.company_id
        section = section.pk
    row = ProjectSection.objects.filter(pk=section).values_list('id', 'project_id', 'project__company_id').first()
    return row or (None, None, None)


def covering_section_q(section):
    """
    شرط انتساب‌هایی (فعال یا غیرفعال) که برای این بخش معتبرند: مستقیم بخش، پروژهٔ آن یا شرکت آن.
    بخشِ ناموجود شرطی می‌دهد که هیچ ردیفی را نمی‌گیرد.
    """
    section_id, project_id, company_id = _section_chain(section)
    if section_id is None:
        return Q(pk__in=[])
    return Q(section_id=section_id) | Q(project_id=project_id) | Q(company_id=company_id)


def assignments_covering_section(section):
    """
    انتساب‌های فعالی که برای این بخش معتبرند: انتساب مستقیم بخش، انتساب پروژهٔ آن و انتساب شرکت آن.
    section: نمونهٔ ProjectSection یا شناسهٔ آن.
    """
    return SectionAssignment.objects.filter(covering_section_q(section), is_active=True)


def company_level_key(company_id):
    """
    کلید «سند سطح شرکت» (ص۷ طرح ۳.۶) در section_chains به‌جای شناسهٔ بخش، با مقدار (None, company_id): فقط
    انتساب‌های سطح همان شرکت آن را می‌پوشانند (CoveringIndex.covering(None, None, company_id)).
    """
    return ('company', company_id)


def covering_assignment_rows(section_chains, *, exclude_superusers=True):
    """
    نسخهٔ دسته‌ای assignments_covering_section برای چند بخش با یک کوئری (ق۱۸).
    section_chains: {section_id یا company_level_key(company_id): (project_id, company_id)}. خروجی ردیف‌های انتساب فعالِ کاربران فعال که دست‌کم
    یکی از این بخش‌ها را می‌پوشانند: [(user_id, role, section_id, project_id, company_id)] (فقط یکی از سه سطح پر است).
    exclude_superusers: مدیر کل کنار گذاشته شود (دریافت‌کنندهٔ گردش کار نیست).
    """
    if not section_chains:
        return []
    section_ids = [s for s in section_chains if not isinstance(s, tuple)]
    project_ids = {p for p, _c in section_chains.values() if p}
    company_ids = {c for _p, c in section_chains.values() if c}
    qs = SectionAssignment.objects.filter(
        Q(section_id__in=section_ids) | Q(project_id__in=list(project_ids)) | Q(company_id__in=list(company_ids)),
        is_active=True, user__is_active=True,
    )
    if exclude_superusers:
        qs = qs.filter(user__is_superuser=False)
    return list(qs.values_list('user_id', 'role', 'section_id', 'project_id', 'company_id'))


class CoveringIndex:
    """نمایهٔ بی‌کوئری روی خروجی covering_assignment_rows: ردیف‌های پوشانندهٔ هر بخش."""

    def __init__(self, rows):
        self.by_section, self.by_project, self.by_company = {}, {}, {}
        for row in rows:
            _uid, _role, s_id, p_id, c_id = row
            if s_id is not None:
                self.by_section.setdefault(s_id, []).append(row)
            elif p_id is not None:
                self.by_project.setdefault(p_id, []).append(row)
            elif c_id is not None:
                self.by_company.setdefault(c_id, []).append(row)

    def covering(self, section_id, project_id, company_id):
        return (self.by_section.get(section_id, []) + self.by_project.get(project_id, [])
                + self.by_company.get(company_id, []))


def section_role_holders(section, role):
    """کاربران فعالی که نقش role را برای این بخش در هر سطحی (بخش، پروژه یا شرکت) دارند."""
    holders = assignments_covering_section(section).filter(role=role).values('user_id')
    return get_user_model().objects.filter(is_active=True, id__in=holders)


def user_sections(user, role=None, company_id=None, include_inactive=False):
    """
    بخش‌های فعالِ پروژه‌های فعال که کاربر با انتساب فعال (در هر سطح) پوشش می‌دهد؛ queryset برای زیرکوئری.
    role: فقط همین نقش (None یعنی هر نقشی)؛ company_id: فقط بخش‌های همین شرکت.
    include_inactive: بخش و پروژهٔ غیرفعال هم حساب شوند؛ برای دیدن سوابق (قلمرو فهرست‌ها)، نه برای انتخاب بخش
    جهت ثبت تازه. مثل بررسی تک‌بخش (user_has_section_role) که بخش غیرفعال را هم می‌پذیرد تا کار مانده بی‌تأییدکننده نماند.
    """
    own = SectionAssignment.objects.filter(user=user, is_active=True)
    if role is not None:
        own = own.filter(role=role)
    sections = ProjectSection.objects.filter(
        Q(id__in=own.filter(section__isnull=False).values('section_id'))
        | Q(project_id__in=own.filter(project__isnull=False).values('project_id'))
        | Q(project__company_id__in=own.filter(company__isnull=False).values('company_id')),
    )
    if not include_inactive:
        sections = sections.filter(is_active=True, project__is_active=True)
    if company_id is not None:
        sections = sections.filter(project__company_id=company_id)
    return sections


def user_section_ids(user, role=None, company_id=None):
    """شناسهٔ بخش‌های فعالی که کاربر پوشش می‌دهد (با گسترش انتساب‌های سطح شرکت و پروژه)."""
    return set(user_sections(user, role=role, company_id=company_id).values_list('id', flat=True))


def user_has_section_role(user, section, role=None):
    """
    آیا کاربر با انتساب فعال در هر سطحی نقش role را برای این بخش دارد؟
    role=None یعنی هر نقشی؛ فهرست یا تاپل نقش‌ها یعنی یکی از آن‌ها.
    """
    user_id = getattr(user, 'pk', user)
    if not user_id:
        return False
    qs = assignments_covering_section(section).filter(user_id=user_id)
    if isinstance(role, (list, tuple, set, frozenset)):
        qs = qs.filter(role__in=list(role))
    elif role is not None:
        qs = qs.filter(role=role)
    return qs.exists()
