from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CompanyViewSet,
    CompanyDocumentViewSet,
    CompanyBankAccountViewSet,
    ExpenseHeadViewSet,
    CompanyBoardMemberViewSet,
    CompanyFiscalPeriodViewSet,
    UserCompanyAccessViewSet,
    CounterpartyViewSet,
    PartyBankAccountViewSet,
    ExpenseInvoiceViewSet,
    WorkflowAuditLogViewSet,
    PettyCashAccountViewSet,
    PettyCashTransactionViewSet,
    PersonnelProfileViewSet,
    VehicleDriverProfileViewSet,
    PersonnelChangeRequestViewSet,
    VehicleChangeRequestViewSet,
    DailyAttendanceViewSet,
    VehicleTripViewSet,
    MonthlyWorkPeriodViewSet,
    PayrollYearlySettingsViewSet,
    MonthlyPayrollViewSet,
    FleetSettlementViewSet
)

from .cartable_views import (
    SupervisorCartableAPIView,
    AccountantCartableAPIView,
    ManagerCartableAPIView,
    TreasuryCartableAPIView,
    TreasuryDisketteExportAPIView
)
from .sync_views import PersonnelSyncPullView

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='companies')
router.register(r'company-documents', CompanyDocumentViewSet, basename='company-documents')
router.register(r'company-bank-accounts', CompanyBankAccountViewSet, basename='company-bank-accounts')
router.register(r'expense-heads', ExpenseHeadViewSet, basename='expense-heads')
router.register(r'company-board-members', CompanyBoardMemberViewSet, basename='company-board-members')
router.register(r'company-fiscal-periods', CompanyFiscalPeriodViewSet, basename='company-fiscal-periods')
router.register(r'user-company-access', UserCompanyAccessViewSet, basename='user-company-access')
router.register(r'counterparties', CounterpartyViewSet, basename='counterparties')
router.register(r'party-bank-accounts', PartyBankAccountViewSet, basename='party-bank-accounts')
router.register(r'expense-invoices', ExpenseInvoiceViewSet, basename='expense-invoices')
router.register(r'workflow-audit-logs', WorkflowAuditLogViewSet, basename='workflow-audit-logs')
router.register(r'petty-cash-accounts', PettyCashAccountViewSet, basename='petty-cash-accounts')
router.register(r'petty-cash-transactions', PettyCashTransactionViewSet, basename='petty-cash-transactions')
router.register(r'profiles', PersonnelProfileViewSet, basename='personnel-profile')
router.register(r'vehicles', VehicleDriverProfileViewSet, basename='vehicle-profile')
router.register(r'personnel-change-requests', PersonnelChangeRequestViewSet, basename='personnel-change-requests')
router.register(r'vehicle-change-requests', VehicleChangeRequestViewSet, basename='vehicle-change-requests')
router.register(r'attendance', DailyAttendanceViewSet, basename='daily-attendance')
router.register(r'trips', VehicleTripViewSet, basename='vehicle-trips')
router.register(r'periods', MonthlyWorkPeriodViewSet, basename='work-periods')
router.register(r'settings', PayrollYearlySettingsViewSet, basename='payroll-settings')
router.register(r'monthly-payroll', MonthlyPayrollViewSet, basename='monthly-payroll')
router.register(r'fleet-settlement', FleetSettlementViewSet, basename='fleet-settlement')

from .google_drive_views import (
    CompanyGoogleDriveConfigView,
    CompanyGoogleDriveAuthUrlView,
    CompanyGoogleDriveDisconnectView,
    CompanyGoogleDriveQueueView,
    CompanyGoogleDriveRetryTaskView,
    CompanyGoogleDriveSyncAllView,
    CompanyGoogleDriveTriggerSyncView,
    GoogleDriveOAuthCallbackView,
)

urlpatterns = [
    # گوگل‌درایو شرکت‌ها (Google Drive Cloud Sync)
    path('companies/<int:company_id>/gdrive/', CompanyGoogleDriveConfigView.as_view(), name='company-gdrive-config'),
    path('companies/<int:company_id>/gdrive/status/', CompanyGoogleDriveConfigView.as_view(), name='company-gdrive-status'),
    path('companies/<int:company_id>/gdrive/auth-url/', CompanyGoogleDriveAuthUrlView.as_view(), name='company-gdrive-auth-url'),
    path('companies/<int:company_id>/gdrive/disconnect/', CompanyGoogleDriveDisconnectView.as_view(), name='company-gdrive-disconnect'),
    path('companies/<int:company_id>/gdrive/queue/', CompanyGoogleDriveQueueView.as_view(), name='company-gdrive-queue'),
    path('companies/<int:company_id>/gdrive/tasks/<int:task_id>/retry/', CompanyGoogleDriveRetryTaskView.as_view(), name='company-gdrive-retry-task'),
    path('companies/<int:company_id>/gdrive/sync-all/', CompanyGoogleDriveSyncAllView.as_view(), name='company-gdrive-sync-all'),
    path('companies/<int:company_id>/gdrive/trigger-sync/', CompanyGoogleDriveTriggerSyncView.as_view(), name='company-gdrive-trigger-sync'),

    path('sync/pull/', PersonnelSyncPullView.as_view(), name='personnel-sync-pull'),
    path('cartable/supervisor/', SupervisorCartableAPIView.as_view(), name='supervisor-cartable'),
    path('cartable/accountant/', AccountantCartableAPIView.as_view(), name='accountant-cartable'),
    path('cartable/manager/', ManagerCartableAPIView.as_view(), name='manager-cartable'),
    path('cartable/treasury/', TreasuryCartableAPIView.as_view(), name='treasury-cartable'),
    path('cartable/treasury/export-diskette/', TreasuryDisketteExportAPIView.as_view(), name='treasury-export-diskette'),
    path('profiles/download-template/', PersonnelProfileViewSet.as_view({'get': 'download_template'}), name='personnel-download-template'),
    path('profiles/download-template', PersonnelProfileViewSet.as_view({'get': 'download_template'})),
    path('profiles/import-excel/', PersonnelProfileViewSet.as_view({'post': 'import_excel', 'get': 'import_excel'}), name='personnel-import-excel'),
    path('profiles/import-excel', PersonnelProfileViewSet.as_view({'post': 'import_excel', 'get': 'import_excel'})),
    path('vehicles/download-template/', VehicleDriverProfileViewSet.as_view({'get': 'download_template'}), name='vehicles-download-template'),
    path('vehicles/download-template', VehicleDriverProfileViewSet.as_view({'get': 'download_template'})),
    path('vehicles/import-excel/', VehicleDriverProfileViewSet.as_view({'post': 'import_excel', 'get': 'import_excel'}), name='vehicles-import-excel'),
    path('vehicles/import-excel', VehicleDriverProfileViewSet.as_view({'post': 'import_excel', 'get': 'import_excel'})),
    path('', include(router.urls)),
]

