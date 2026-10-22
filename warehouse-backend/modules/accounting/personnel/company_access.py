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
    from personnel.models import SectionAssignment
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
                'role_in_company': sa.get_role_display() if hasattr(sa, 'get_role_display') else '',
                'source_label': f"از بخش {sa.section.name} پروژهٔ {sa.section.project.name}",
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


# نقش‌های انتساب به بخش که حسابداری به هسته اعلام می‌کند (contribute('section_roles', ...))
SECTION_ROLES = (
    ('employee', 'کارمند / اپراتور ثبت'),
    ('supervisor', 'سرپرست بخش'),
    ('accountant', 'حسابدار پروژه'),
    ('manager', 'مدیر پروژه'),
    ('treasury', 'خزانه‌دار کل'),
)


# ─── بخش‌های مجوز شرکت که ماژول حسابداری به رجیستری هسته می‌دهد (طرح مجوزهای بخش‌به‌بخش، §۵-۱) ───
_MANAGER = {'viewer': 'read', 'manager': 'write'}
COMPANY_PERMISSION_SECTIONS = (
    {'key': 'bank', 'label_fa': 'بانک و شبا', 'order': 110, 'kind': 'levels', 'sensitive': False,
     'studio': 'treasury', 'templates': _MANAGER},
    {'key': 'board', 'label_fa': 'هیئت‌مدیره', 'order': 120, 'kind': 'levels', 'sensitive': False,
     'studio': 'governance', 'templates': _MANAGER},
    {'key': 'fiscal', 'label_fa': 'دوره‌های مالی (ثبت، ویرایش و انجماد)', 'order': 130, 'kind': 'levels',
     'sensitive': False, 'studio': 'fiscal', 'templates': _MANAGER},
    {'key': 'docs_archive', 'label_fa': 'بایگانی مدارک', 'order': 140, 'kind': 'levels', 'sensitive': False,
     'studio': 'archive', 'templates': {'viewer': 'read', 'docs_clerk': 'write', 'manager': 'write'},
     'legacy': {'docs_read': 'read', 'docs_write': 'write'}},
    {'key': 'gdrive', 'label_fa': 'گوگل‌درایو', 'order': 150, 'kind': 'levels', 'sensitive': False,
     'studio': 'gdrive', 'templates': _MANAGER},
    {'key': 'docs_confidential', 'label_fa': 'مدارک محرمانه', 'order': 210, 'kind': 'levels', 'sensitive': True,
     'studio': 'archive'},
    {'key': 'fiscal_close', 'label_fa': 'بستن، بازگشایی و حذف دورهٔ مالی', 'order': 220, 'kind': 'action',
     'sensitive': True, 'studio': 'fiscal'},
    {'key': 'bank_sheba', 'label_fa': 'ثبت و تغییر شبا، و حساب اصلی', 'order': 230, 'kind': 'action',
     'sensitive': True, 'studio': 'treasury'},
)

# فیلدهای هیئت‌مدیرهٔ مدل Company (هسته) که در تب هیئت‌مدیرهٔ حسابداری ویرایش می‌شوند
COMPANY_FIELD_SECTIONS = {f: 'board' for f in (
    'board_chairman', 'board_vice_chairman', 'main_inspector', 'alternate_inspector',
    'authorized_signers', 'board_term_expiry',
)}


def section_member_sources(company_id):
    """{user_id: [برچسب منبع]} برای اعضای یک شرکت از راه انتساب فعال بخش‌ها (تب «دسترسی»)."""
    from personnel.models import SectionAssignment
    result = {}
    for sa in (SectionAssignment.objects.filter(is_active=True, section__project__company_id=company_id)
               .select_related('section__project')):
        result.setdefault(sa.user_id, []).append(f"از بخش {sa.section.name} پروژهٔ {sa.section.project.name}")
    return result
