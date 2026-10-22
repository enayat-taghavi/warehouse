"""
عضویت در شرکت از راه انتساب فعال به بخش‌های پروژه‌های آن (طرح Project_Section_To_Core، ت۱).
هسته خودش این منبع را در `CompaniesConfig.ready()` ثبت می‌کند تا در نصب «فقط انبار» هم کار کند.
"""
from django.db.models import Q


def section_derived_company_source(user):
    """منبع دسترسی مشتق: شرکت‌هایی که کاربر در بخشی از پروژه‌هایشان انتساب فعال دارد (با برچسب منبع)."""
    from .models import SectionAssignment
    sec_assignments = SectionAssignment.objects.filter(
        user=user, is_active=True, section__project__company__isnull=False
    ).select_related('section__project__company')
    details = []
    seen = set()
    for sa in sec_assignments:
        sec_comp = sa.section.project.company
        if sec_comp and sec_comp.id not in seen:
            seen.add(sec_comp.id)
            details.append({
                'company_id': sec_comp.id,
                'company_name': sec_comp.name,
                'company_code': sec_comp.code,
                'role_in_company': sa.get_role_display(),
                'source_label': f"از بخش {sa.section.name} پروژهٔ {sa.section.project.name}",
            })
    return details


def build_section_member_q(allowed_cids):
    """شرط فیلتر کاربران عضو شرکت از راه انتساب فعال در بخش‌های پروژه‌های شرکت‌های مجاز."""
    return Q(section_assignments__is_active=True, section_assignments__section__project__company_id__in=allowed_cids)


def section_member_sources(company_id):
    """{user_id: [برچسب منبع]} برای اعضای یک شرکت از راه انتساب فعال بخش‌ها (تب «دسترسی»)."""
    from .models import SectionAssignment
    result = {}
    for sa in (SectionAssignment.objects.filter(is_active=True, section__project__company_id=company_id)
               .select_related('section__project')):
        result.setdefault(sa.user_id, []).append(f"از بخش {sa.section.name} پروژهٔ {sa.section.project.name}")
    return result


def user_belongs_to_company(user_id, company_id):
    """
    آیا کاربر به شرکت پیوند دارد یا عضو آن بوده است؟ (ردیف UserCompanyAccess با هر سطح، یا هر انتساب فعال
    یا غیرفعال در بخش‌های همان شرکت). انتساب بخش خودش عضویت می‌دهد، پس هرگز نباید برای کاربرِ بی‌پیوند
    دسترسی شرکت تازه بسازد. انتساب غیرفعالِ قبلی حساب می‌شود تا فعال‌سازی دوباره درون همان شرکت رد نشود.
    """
    from .models import SectionAssignment, UserCompanyAccess
    if not user_id or not company_id:
        return False
    return (
        UserCompanyAccess.objects.filter(user_id=user_id, company_id=company_id).exists()
        or SectionAssignment.objects.filter(user_id=user_id, section__project__company_id=company_id).exists()
    )
