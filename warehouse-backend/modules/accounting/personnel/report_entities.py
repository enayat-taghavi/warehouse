"""
موجودیت‌های ماژول حسابداری و پرسنلی برای موتور گزارش‌ساز پلتفرم.
طرح راه میانهٔ ماژولار (گام ۳-ب).
"""
from platform_core.query_engine import (
    EntityConfig,
    register_entity,
)


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
            include=('id', 'trip_date', 'total_amount', 'is_settled', 'settled_at'),
            module_code='accounting',
        ),
    ]


def register_accounting_report_entities():
    """ثبت موجودیت‌های حسابداری و پرسنلی در رجیستری گزارش‌ساز پلتفرم."""
    for ent in build_accounting_entities():
        register_entity(ent, module_code='accounting')
