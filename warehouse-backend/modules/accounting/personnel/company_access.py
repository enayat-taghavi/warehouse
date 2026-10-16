"""
سهم حسابداری در دسترسی شرکت: عضویت فعال در بخشی از پروژه‌های یک شرکت، دسترسی کامل (workspace_full)
به آن شرکت می‌دهد. در `PersonnelConfig.ready()` در هستهٔ companies ثبت می‌شود.
طرح راه میانهٔ ماژولار (گام ۳).
"""


def section_derived_company_source(user):
    """
    سهم حسابداری در دسترسی شرکت: بازگرداندن اطلاعات دسترسی مشتق برای انتساب‌های فعال در بخش‌های پروژه‌ها.
    این تابع به عنوان منبع دسترسی مشتق در `companies.access` ثبت می‌شود.
    """
    from personnel.models import UserSectionAssignment
    sec_assignments = UserSectionAssignment.objects.filter(
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
                'access_level': 'workspace_full',
                'role_in_company': sa.get_role_display() if hasattr(sa, 'get_role_display') else '',
            })
    return details


# سازگاری رو به عقب
section_derived_company_ids = section_derived_company_source


def build_section_member_q(allowed_cids):
    """
    شرط فیلتر کاربران عضو شرکت از طریق انتساب فعال در بخش‌های پروژه‌های شرکت‌های مجاز (گام ۴).
    """
    from django.db.models import Q
    return Q(section_assignments__is_active=True, section_assignments__section__project__company_id__in=allowed_cids)

