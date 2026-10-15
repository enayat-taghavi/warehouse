"""
موجودیت‌های ماژول حسابداری و پرسنلی برای موتور گزارش‌ساز پلتفرم.
طرح راه میانهٔ ماژولار (گام ۳-ب).
"""
from django.db.models import Q
from platform_core.query_engine import (
    EntityConfig,
    register_entity,
)


def resolve_personnel_profiles_scope(qs, user):
    """
    قلمرو پرسنل: دقیقاً همان قاعدهٔ scope_personnel_queryset صفحهٔ پرسنل، روی همهٔ شرکت‌های مجاز کاربر
    (بخش‌های منتسب فعال برای کاربر غیرممیز، و پیش‌نویس بی‌شرکت فقط برای ثبت‌کننده‌اش).
    """
    from personnel.views import scope_personnel_for_user
    return scope_personnel_for_user(user, qs)


def resolve_monthly_payrolls_scope(qs, user):
    """
    قلمرو شرکت برای محاسبات حقوق ماهانه از طریق پرسنل:
    - سوپریوزر: همه رکوردها
    - کاربر عادی: محاسبات پرسنل شرکت‌های مجاز
    - کاربر بدون شرکت: خالی (یا پیش‌نویس بدون شرکت کاربر)
    """
    if not user or not user.is_authenticated:
        return qs.none()
    if user.is_superuser:
        return qs
    try:
        from companies.access import get_user_allowed_companies
        allowed_ids = list(get_user_allowed_companies(user).values_list('id', flat=True))
    except Exception:
        allowed_ids = []

    if not allowed_ids:
        return qs.filter(personnel__company__isnull=True, personnel__section__isnull=True, personnel__created_by=user)
    return qs.filter(
        Q(personnel__company_id__in=allowed_ids)
        | Q(personnel__section__project__company_id__in=allowed_ids)
        | Q(personnel__company__isnull=True, personnel__section__isnull=True, personnel__created_by=user)
    ).distinct()


def resolve_fleet_trips_scope(qs, user):
    """
    قلمرو شرکت برای سفرهای ناوگان:
    - سوپریوزر: همه رکوردها
    - کاربر عادی: سفرهایی که بخش، پروژه، خودرو یا بخشِ خودرو متعلق به شرکت‌های مجاز کاربر باشد یا خودروی یتیم سازنده
    - کاربر بدون شرکت: خالی (مگر خودروی یتیم خودش)
    """
    from personnel.views import scope_trips_for_user
    return scope_trips_for_user(user, qs)


def build_accounting_entities():
    """ساخت تعاریف موجودیت‌های ماژول حسابداری و پرسنلی در موتور گزارش‌ساز."""
    from personnel.models import PersonnelProfile, MonthlyPayrollRecord, VehicleTripLog
    return [
        EntityConfig(
            key='personnel_profiles',
            label='پرسنل و کارمندان',
            model=PersonnelProfile,
            permissions=('view_sys_personnel',),
            scope_path=None,
            scope_resolver=resolve_personnel_profiles_scope,
            include=('id', 'personnel_code', 'national_code', 'first_name', 'last_name',
                     'contract_type', 'employment_status', 'created_at'),
            module_code='accounting',
        ),
        EntityConfig(
            key='monthly_payrolls',
            label='محاسبات ماهانه حقوق',
            model=MonthlyPayrollRecord,
            permissions=('view_sys_payroll',),
            scope_path=None,
            scope_resolver=resolve_monthly_payrolls_scope,
            include=('id', 'national_code', 'full_name', 'gross_salary', 'net_salary',
                     'payable_amount', 'income_tax', 'worker_insurance', 'payment_status'),
            module_code='accounting',
        ),
        EntityConfig(
            key='fleet_trips',
            label='کارکرد و سفرهای ناوگان',
            model=VehicleTripLog,
            permissions=('view_sys_fleet_settlement',),
            scope_path=None,
            scope_resolver=resolve_fleet_trips_scope,
            include=('id', 'trip_date', 'total_amount', 'is_settled', 'settled_at'),
            module_code='accounting',
        ),
    ]


def register_accounting_report_entities():
    """ثبت موجودیت‌های حسابداری و پرسنلی در رجیستری گزارش‌ساز پلتفرم."""
    for ent in build_accounting_entities():
        register_entity(ent, module_code='accounting')
