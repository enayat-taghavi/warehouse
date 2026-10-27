# -*- coding: utf-8 -*-
"""
Barrel module for personnel serializers.
Re-exports all serializers, functions, and constants from serializers_domains subpackages by explicit name.
"""

from companies.serializers import (  # noqa: F401
    UserCompanyAccessSerializer,
)
from common.serializer_fields import (  # noqa: F401
    validate_uploaded_document,
)

from .serializers_domains.helpers import (
    ROAD_VEHICLE_TYPES,
    FLEET_RATE_FIELDS,
    normalize_iranian_phone,
    normalize_plate,
    user_can_view_fleet_rates,
)
from .serializers_domains.organization import (
    CompanySerializer,
    CompanyDocumentSerializer,
    CompanyBoardMemberSerializer,
    CompanyBankAccountSerializer,
    ExpenseHeadSerializer,
    CompanyFiscalPeriodSerializer,
    CompanyPayrollProfileSerializer,
)
from .serializers_domains.hr import (
    PersonnelBankAccountSerializer,
    PersonnelDocumentSerializer,
    PersonnelProfileSerializer,
    PersonnelChangeRequestSerializer,
)
from .serializers_domains.fleet import (
    VehicleBankAccountSerializer,
    VehicleDocumentSerializer,
    VehicleDriverProfileSerializer,
    VehicleChangeRequestSerializer,
)
from .serializers_domains.attendance import (
    VehicleTripAuditLogSerializer,
    AttendanceAuditLogSerializer,
    DailyAttendanceSerializer,
    AttendanceItemInputSerializer,
    BulkAttendanceMatrixSerializer,
    MonthlyGridItemInputSerializer,
    BulkMonthlyAttendanceGridSerializer,
    VehicleTripLogSerializer,
    VehicleTripItemInputSerializer,
    BulkVehicleTripMatrixSerializer,
    VehicleDayTripUpdateSerializer,
    VehicleMonthlyGridItemInputSerializer,
    BulkVehicleMonthlyGridSerializer,
    MonthlyWorkPeriodSerializer,
)
from .serializers_domains.payroll import (
    JobGradeTierSerializer,
    WorkshopInsuranceSettingsSerializer,
    TaxRuleSettingsSerializer,
    BankExportSettingsSerializer,
    PayrollYearlySettingsSerializer,
    MonthlyPayrollRecordSerializer,
)
from .serializers_domains.treasury_audit import (
    CounterpartySerializer,
    PartyBankAccountSerializer,
    ExpenseInvoiceSerializer,
    InvoicePaymentSerializer,
    PettyCashAccountSerializer,
    PettyCashStatementSerializer,
    PettyCashDebtSettlementSerializer,
    PettyCashTransactionSerializer,
    WorkflowAuditLogSerializer,
)

__all__ = [
    'UserCompanyAccessSerializer',
    'validate_uploaded_document',
    'ROAD_VEHICLE_TYPES',
    'FLEET_RATE_FIELDS',
    'normalize_iranian_phone',
    'normalize_plate',
    'user_can_view_fleet_rates',
    'CompanySerializer',
    'CompanyDocumentSerializer',
    'CompanyBoardMemberSerializer',
    'CompanyBankAccountSerializer',
    'ExpenseHeadSerializer',
    'CompanyFiscalPeriodSerializer',
    'CompanyPayrollProfileSerializer',
    'PersonnelBankAccountSerializer',
    'PersonnelDocumentSerializer',
    'PersonnelProfileSerializer',
    'PersonnelChangeRequestSerializer',
    'VehicleBankAccountSerializer',
    'VehicleDocumentSerializer',
    'VehicleDriverProfileSerializer',
    'VehicleChangeRequestSerializer',
    'VehicleTripAuditLogSerializer',
    'AttendanceAuditLogSerializer',
    'DailyAttendanceSerializer',
    'AttendanceItemInputSerializer',
    'BulkAttendanceMatrixSerializer',
    'MonthlyGridItemInputSerializer',
    'BulkMonthlyAttendanceGridSerializer',
    'VehicleTripLogSerializer',
    'VehicleTripItemInputSerializer',
    'BulkVehicleTripMatrixSerializer',
    'VehicleDayTripUpdateSerializer',
    'VehicleMonthlyGridItemInputSerializer',
    'BulkVehicleMonthlyGridSerializer',
    'MonthlyWorkPeriodSerializer',
    'JobGradeTierSerializer',
    'WorkshopInsuranceSettingsSerializer',
    'TaxRuleSettingsSerializer',
    'BankExportSettingsSerializer',
    'PayrollYearlySettingsSerializer',
    'MonthlyPayrollRecordSerializer',
    'CounterpartySerializer',
    'PartyBankAccountSerializer',
    'ExpenseInvoiceSerializer',
    'InvoicePaymentSerializer',
    'PettyCashAccountSerializer',
    'PettyCashStatementSerializer',
    'PettyCashDebtSettlementSerializer',
    'PettyCashTransactionSerializer',
    'WorkflowAuditLogSerializer',
]
