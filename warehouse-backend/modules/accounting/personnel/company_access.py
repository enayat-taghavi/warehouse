"""
سهم حسابداری در دسترسی شرکت: عضویت فعال در بخشی از پروژه‌های یک شرکت، دسترسی کامل (workspace_full)
به آن شرکت می‌دهد. در `PersonnelConfig.ready()` در هستهٔ companies ثبت می‌شود.
"""


def section_derived_company_ids(user):
    """شرکت‌هایی که کاربر با انتساب فعال در بخش‌های پروژه‌هایشان، در آن‌ها دسترسی کامل دارد."""
    from personnel.models import UserSectionAssignment
    return set(UserSectionAssignment.objects.filter(
        user=user, is_active=True, section__project__company__isnull=False
    ).values_list('section__project__company_id', flat=True))
