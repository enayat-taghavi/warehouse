"""
عضویت در شرکت از راه انتساب فعال در یکی از سه سطح شرکت، پروژه یا بخش (طرح Project_Section_To_Core، ت۱؛
طرح ۲.۱، ت۳). هسته خودش این منبع را در `CompaniesConfig.ready()` ثبت می‌کند تا در نصب «فقط انبار» هم کار کند.
"""
from django.db.models import Q

from .org_roles import assignments_in_companies_q


def _assignments_with_targets(qs):
    return qs.select_related('company', 'project__company', 'section__project__company')


def assignment_source_label(sa):
    """برچسب منبع عضویت برای یک انتساب، با نام سطح آن (تب «دسترسی» و فهرست شرکت‌های کاربر)."""
    if sa.section_id:
        return f"از بخش {sa.section.name} پروژهٔ {sa.section.project.name}"
    if sa.project_id:
        return f"از پروژهٔ {sa.project.name} (همهٔ بخش‌ها)"
    return "از انتساب در سطح شرکت (همهٔ پروژه‌ها و بخش‌ها)"


def _assignment_company(sa):
    if sa.company_id:
        return sa.company
    return sa.target_project.company


def section_derived_company_source(user):
    """منبع دسترسی مشتق: شرکت‌هایی که کاربر در آن‌ها (در هر سطح) انتساب فعال دارد، با برچسب منبع."""
    from .models import SectionAssignment
    details = []
    seen = set()
    for sa in _assignments_with_targets(SectionAssignment.objects.filter(user=user, is_active=True)):
        company = _assignment_company(sa)
        if company is not None and company.id not in seen:
            seen.add(company.id)
            details.append({
                'company_id': company.id,
                'company_name': company.name,
                'company_code': company.code,
                'role_in_company': sa.get_role_display(),
                'source_label': assignment_source_label(sa),
            })
    return details


def build_section_member_q(allowed_cids):
    """شرط فیلتر کاربران عضو شرکت‌های مجاز از راه انتساب فعال در هر سطح (زیرکوئری، بی ردیف تکراری)."""
    from .models import SectionAssignment
    members = SectionAssignment.objects.filter(is_active=True).filter(
        assignments_in_companies_q(allowed_cids)
    ).values('user_id')
    return Q(id__in=members)


def section_member_sources(company_id):
    """{user_id: [برچسب منبع]} برای اعضای یک شرکت از راه انتساب فعال در هر سطح (تب «دسترسی»)."""
    from .models import SectionAssignment
    result = {}
    qs = SectionAssignment.objects.filter(is_active=True).filter(assignments_in_companies_q([company_id]))
    for sa in _assignments_with_targets(qs):
        result.setdefault(sa.user_id, []).append(assignment_source_label(sa))
    return result


def user_belongs_to_company(user_id, company_id):
    """
    آیا کاربر به شرکت پیوند دارد یا عضو آن بوده است؟ (ردیف UserCompanyAccess با هر سطح، یا هر انتساب فعال
    یا غیرفعال در شرکت، پروژه‌ها یا بخش‌های همان شرکت). انتساب خودش عضویت می‌دهد، پس هرگز نباید برای کاربرِ
    بی‌پیوند دسترسی شرکت تازه بسازد. انتساب غیرفعالِ قبلی حساب می‌شود تا فعال‌سازی دوباره درون همان شرکت رد نشود.
    """
    from .models import SectionAssignment, UserCompanyAccess
    if not user_id or not company_id:
        return False
    return (
        UserCompanyAccess.objects.filter(user_id=user_id, company_id=company_id).exists()
        or SectionAssignment.objects.filter(user_id=user_id).filter(assignments_in_companies_q([company_id])).exists()
    )
