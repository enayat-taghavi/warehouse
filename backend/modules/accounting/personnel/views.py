# -*- coding: utf-8 -*-
"""
Barrel module for personnel views.
Re-exports all ViewSets, scope helpers, and dependencies explicitly by name.
"""

from django.contrib.auth import get_user_model
from companies.views import (  # noqa: F401
    CompanyViewSet as CoreCompanyViewSet,
    UserCompanyAccessViewSet,
)
from companies.access import (  # noqa: F401
    get_user_allowed_companies,
    get_request_company_id,
    validate_user_company_access,
    ensure_scoped_write,
)
from .payroll_engine import (  # noqa: F401
    calculate_monthly_payroll_for_period,
    get_effective_payroll_settings,
)
from .dbf_generator import (  # noqa: F401
    generate_dskkar_bytes,
    generate_dskwor_bytes,
)
from .tax_bank_exporter import (  # noqa: F401
    generate_wh_tax_content,
    generate_wp_tax_content,
    generate_bank_meli_excel,
)
from .payroll_excel_exporter import (  # noqa: F401
    generate_monthly_payroll_excel,
)
from .fleet_excel_engine import (  # noqa: F401
    export_fleet_monthly_excel,
    import_fleet_monthly_excel,
)
from .fleet_settlement_engine import (  # noqa: F401
    calculate_monthly_fleet_settlement,
    generate_fleet_bank_meli_excel,
)

User = get_user_model()

from .views_domains.scope_helpers import (
    resolve_write_company,
    resolve_import_company,
    readable_company_ids,
    PERSONNEL_FILE_PERMS,
    personnel_file_sections,
    can_access_personnel_section,
    scope_personnel_queryset,
    scope_personnel_for_user,
    ensure_record_write_scope,
    ensure_personnel_write_scope,
    is_vehicle_global_auditor,
    scope_vehicle_queryset,
    scope_trips_for_user,
    broadcast_personnel_update,
    broadcast_vehicle_update,
    log_vehicle_audit,
    normalize_attendance_date,
    validate_attendance_date_window,
    is_date_shamsi_friday,
    broadcast_attendance_updated,
    safe_int,
    _copy_payroll_submodels,
    broadcast_org_structure_updated,
)

from .views_domains.org_views import (
    CompanyViewSet,
    CompanyDocumentViewSet,
    CompanyBankAccountViewSet,
    CompanyBoardMemberViewSet,
    CompanyFiscalPeriodViewSet,
)

from .views_domains.treasury_views import (
    CounterpartyViewSet,
    ExpenseInvoiceViewSet,
    PettyCashAccountViewSet,
    PettyCashTransactionViewSet,
    WorkflowAuditLogViewSet,
)

from .views_domains.payroll_views import (
    PayrollYearlySettingsViewSet,
    MonthlyPayrollViewSet,
    FleetSettlementViewSet,
)

from .views_domains.attendance_views import (
    DailyAttendanceViewSet,
    MonthlyWorkPeriodViewSet,
)

from .views_domains.trip_views import (
    VehicleTripViewSet,
)

from .views_domains.hr_views import (
    PersonnelProfileViewSet,
    PersonnelChangeRequestViewSet,
)

from .views_domains.fleet_views import (
    VehicleDriverProfileViewSet,
    VehicleChangeRequestViewSet,
)

__all__ = [
    'User',
    'UserCompanyAccessViewSet',
    'get_user_allowed_companies',
    'get_request_company_id',
    'validate_user_company_access',
    'ensure_scoped_write',
    'calculate_monthly_payroll_for_period',
    'get_effective_payroll_settings',
    'generate_dskkar_bytes',
    'generate_dskwor_bytes',
    'generate_wh_tax_content',
    'generate_wp_tax_content',
    'generate_bank_meli_excel',
    'generate_monthly_payroll_excel',
    'export_fleet_monthly_excel',
    'import_fleet_monthly_excel',
    'calculate_monthly_fleet_settlement',
    'generate_fleet_bank_meli_excel',
    # Scope helpers (21)
    'resolve_write_company',
    'resolve_import_company',
    'readable_company_ids',
    'PERSONNEL_FILE_PERMS',
    'personnel_file_sections',
    'can_access_personnel_section',
    'scope_personnel_queryset',
    'scope_personnel_for_user',
    'ensure_record_write_scope',
    'ensure_personnel_write_scope',
    'is_vehicle_global_auditor',
    'scope_vehicle_queryset',
    'scope_trips_for_user',
    'broadcast_personnel_update',
    'broadcast_vehicle_update',
    'log_vehicle_audit',
    'normalize_attendance_date',
    'validate_attendance_date_window',
    'is_date_shamsi_friday',
    'broadcast_attendance_updated',
    'safe_int',
    '_copy_payroll_submodels',
    'broadcast_org_structure_updated',
    # ViewSets (23)
    'CompanyViewSet',
    'CompanyDocumentViewSet',
    'CompanyBankAccountViewSet',
    'CompanyBoardMemberViewSet',
    'CompanyFiscalPeriodViewSet',
    'CounterpartyViewSet',
    'ExpenseInvoiceViewSet',
    'PettyCashAccountViewSet',
    'PettyCashTransactionViewSet',
    'WorkflowAuditLogViewSet',
    'PayrollYearlySettingsViewSet',
    'MonthlyPayrollViewSet',
    'FleetSettlementViewSet',
    'DailyAttendanceViewSet',
    'MonthlyWorkPeriodViewSet',
    'VehicleTripViewSet',
    'PersonnelProfileViewSet',
    'PersonnelChangeRequestViewSet',
    'VehicleDriverProfileViewSet',
    'VehicleChangeRequestViewSet',
]
