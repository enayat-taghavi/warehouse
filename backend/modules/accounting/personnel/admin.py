from django.contrib import admin
from .models import (
    Counterparty,
    PartyBankAccount,
    ExpenseInvoice,
    PettyCashAccount,
    PettyCashTransaction,
    PersonnelProfile,
    VehicleDriverProfile,
    PersonnelChangeRequest,
    VehicleChangeRequest,
    MonthlyWorkPeriod,
    DailyAttendance,
    AttendanceAuditLog,
    VehicleTripLog,
    InsuranceJobTitle,
    PersonnelBankAccount,
    PersonnelDocument
)


@admin.register(Counterparty)
class CounterpartyAdmin(admin.ModelAdmin):
    list_display = ('name', 'counterparty_type', 'account_code', 'is_active')
    search_fields = ('party__name', 'party__national_id', 'party__phone', 'account_code')
    list_filter = ('counterparty_type', 'is_active')
    list_select_related = ('party',)
    raw_id_fields = ('party', 'created_by')


@admin.register(PartyBankAccount)
class PartyBankAccountAdmin(admin.ModelAdmin):
    list_display = ('party', 'bank_name', 'is_primary', 'is_active')
    search_fields = ('party__name', 'bank_name')
    list_filter = ('is_primary', 'is_active')
    list_select_related = ('party',)
    raw_id_fields = ('party',)


@admin.register(ExpenseInvoice)
class ExpenseInvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'section', 'counterparty', 'amount', 'invoice_date_shamsi', 'status', 'created_by')
    search_fields = ('invoice_number', 'counterparty__party__name', 'description')
    list_filter = ('status', 'section__project', 'section')


@admin.register(PettyCashAccount)
class PettyCashAccountAdmin(admin.ModelAdmin):
    list_display = ('section', 'custodian', 'ceiling_amount', 'is_active', 'created_at')
    search_fields = ('custodian__username', 'custodian__first_name', 'custodian__last_name', 'section__name')
    list_filter = ('is_active', 'section__project', 'section')


@admin.register(PettyCashTransaction)
class PettyCashTransactionAdmin(admin.ModelAdmin):
    list_display = ('title', 'transaction_type', 'section', 'custodian', 'amount', 'transaction_date_shamsi', 'status')
    search_fields = ('title', 'receipt_number', 'custodian__username', 'description')
    list_filter = ('transaction_type', 'status', 'section__project', 'section')


@admin.register(PersonnelProfile)
class PersonnelProfileAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'national_code', 'job_title', 'contract_type', 'daily_base_wage', 'assigned_warehouse_id', 'is_active')
    search_fields = ('first_name', 'last_name', 'national_code', 'job_title')
    list_filter = ('assigned_warehouse_id', 'contract_type', 'is_active', 'marital_status')


@admin.register(VehicleDriverProfile)
class VehicleDriverProfileAdmin(admin.ModelAdmin):
    list_display = ('driver_name', 'plate_number', 'vehicle_type', 'approval_status', 'default_service_rate', 'assigned_warehouse_id', 'is_active')
    search_fields = ('driver_name', 'plate_number', 'driver_national_code')
    list_filter = ('assigned_warehouse_id', 'approval_status', 'vehicle_type', 'is_active')


@admin.register(PersonnelChangeRequest)
class PersonnelChangeRequestAdmin(admin.ModelAdmin):
    list_display = ('personnel', 'requested_by', 'status', 'created_at', 'manager_reviewed_by', 'accountant_reviewed_by')
    list_filter = ('status', 'created_at')
    search_fields = ('personnel__first_name', 'personnel__last_name', 'personnel__national_code')


@admin.register(VehicleChangeRequest)
class VehicleChangeRequestAdmin(admin.ModelAdmin):
    list_display = ('vehicle', 'requested_by', 'status', 'created_at', 'manager_reviewed_by', 'accountant_reviewed_by')
    list_filter = ('status', 'created_at')
    search_fields = ('vehicle__driver_name', 'vehicle__plate_number')


@admin.register(MonthlyWorkPeriod)
class MonthlyWorkPeriodAdmin(admin.ModelAdmin):
    list_display = ('warehouse_id', 'year_month', 'status', 'locked_at', 'locked_by')
    list_filter = ('warehouse_id', 'status')


@admin.register(DailyAttendance)
class DailyAttendanceAdmin(admin.ModelAdmin):
    list_display = ('personnel', 'date_shamsi', 'warehouse_id', 'status', 'effective_hours', 'overtime_hours', 'is_friday_work', 'is_mission')
    list_filter = ('warehouse_id', 'status', 'is_friday_work', 'is_mission')
    search_fields = ('personnel__first_name', 'personnel__last_name', 'personnel__national_code', 'date_shamsi')


@admin.register(AttendanceAuditLog)
class AttendanceAuditLogAdmin(admin.ModelAdmin):
    list_display = ('personnel_name', 'date_shamsi', 'field_name', 'old_value', 'new_value', 'changed_by', 'changed_at')
    search_fields = ('personnel_name', 'date_shamsi', 'field_name')
    list_filter = ('field_name', 'changed_at')


@admin.register(VehicleTripLog)
class VehicleTripLogAdmin(admin.ModelAdmin):
    list_display = ('vehicle', 'date_shamsi', 'warehouse_id', 'trip_count', 'unit_rate', 'total_amount', 'dispatch_reference')
    list_filter = ('warehouse_id', 'date_shamsi')
    search_fields = ('vehicle__driver_name', 'vehicle__plate_number', 'dispatch_reference')


@admin.register(InsuranceJobTitle)
class InsuranceJobTitleAdmin(admin.ModelAdmin):
    list_display = ('title', 'job_code', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('title', 'job_code')


@admin.register(PersonnelBankAccount)
class PersonnelBankAccountAdmin(admin.ModelAdmin):
    list_display = ('personnel', 'bank_name', 'account_number', 'sheba_number', 'is_primary', 'is_active')
    list_filter = ('is_primary', 'is_active', 'bank_name')
    search_fields = ('personnel__first_name', 'personnel__last_name', 'personnel__national_code', 'sheba_number', 'account_number')


@admin.register(PersonnelDocument)
class PersonnelDocumentAdmin(admin.ModelAdmin):
    list_display = ('personnel', 'doc_type', 'uploaded_by', 'created_at')
    list_filter = ('doc_type', 'created_at')
    search_fields = ('personnel__first_name', 'personnel__last_name', 'personnel__national_code')

