# -*- coding: utf-8 -*-
"""
Barrel module for personnel models.
Re-exports all models and helpers from models_domains subpackages by explicit name.
"""

from companies.models import Company, UserCompanyAccess, Project, ProjectSection, SectionAssignment  # noqa: F401

from .models_domains.base import (
    _WarehouseCompatQuerySet,
    _WarehouseCompatManager,
    _WarehouseCompatMixin,
)
from .models_domains.organization import (
    CompanyDocument,
    CompanyBankAccount,
    CompanyBankOpeningBalanceChange,
    CompanyBoardMember,
    CompanyFiscalPeriod,
    CompanyPayrollProfile,
    primary_bank_account,
)
from .models_domains.hr import (
    InsuranceJobTitle,
    PersonnelProfile,
    PersonnelBankAccount,
    PersonnelDocument,
    PersonnelSectionAssignment,
    PersonnelChangeRequest,
)
from .models_domains.fleet import (
    VehicleDriverProfile,
    VehicleBankAccount,
    VehicleDocument,
    VehicleChangeRequest,
)
from .models_domains.attendance import (
    MonthlyWorkPeriod,
    DailyAttendance,
    AttendanceAuditLog,
    VehicleTripLog,
    VehicleTripAuditLog,
)
from .models_domains.payroll import (
    PayrollYearlySettings,
    JobGradeTier,
    WorkshopInsuranceSettings,
    TaxRuleSettings,
    BankExportSettings,
    MonthlyPayrollRecord,
)
from .models_domains.treasury_audit import (
    Counterparty,
    PartyBankAccount,
    primary_party_bank_account,
    ExpenseInvoice,
    PettyCashAccount,
    PettyCashTransaction,
    AccountingEvent,
    emit_accounting_event,
    WorkflowAuditLog,
)
from settings_core.models import CompanyGoogleDriveConfig, GoogleDriveSyncQueue

__all__ = [
    'Company',
    'UserCompanyAccess',
    '_WarehouseCompatQuerySet',
    '_WarehouseCompatManager',
    '_WarehouseCompatMixin',
    'CompanyDocument',
    'CompanyBankAccount',
    'CompanyBankOpeningBalanceChange',
    'CompanyBoardMember',
    'CompanyFiscalPeriod',
    'CompanyPayrollProfile',
    'primary_bank_account',
    'Project',
    'ProjectSection',
    'SectionAssignment',
    'InsuranceJobTitle',
    'PersonnelProfile',
    'PersonnelBankAccount',
    'PersonnelDocument',
    'PersonnelSectionAssignment',
    'PersonnelChangeRequest',
    'VehicleDriverProfile',
    'VehicleBankAccount',
    'VehicleDocument',
    'VehicleChangeRequest',
    'MonthlyWorkPeriod',
    'DailyAttendance',
    'AttendanceAuditLog',
    'VehicleTripLog',
    'VehicleTripAuditLog',
    'PayrollYearlySettings',
    'JobGradeTier',
    'WorkshopInsuranceSettings',
    'TaxRuleSettings',
    'BankExportSettings',
    'MonthlyPayrollRecord',
    'Counterparty',
    'PartyBankAccount',
    'primary_party_bank_account',
    'ExpenseInvoice',
    'PettyCashAccount',
    'PettyCashTransaction',
    'AccountingEvent',
    'emit_accounting_event',
    'WorkflowAuditLog',
    'CompanyGoogleDriveConfig',
    'GoogleDriveSyncQueue',
]
