from decimal import Decimal
from rest_framework import serializers
from django.utils import timezone
from common.date_utils import normalize_digits, parse_date_smart, format_to_shamsi_str
from ..models import (
    MonthlyWorkPeriod,
    DailyAttendance,
    AttendanceAuditLog,
    VehicleTripLog,
    VehicleTripAuditLog,
)

class VehicleTripAuditLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VehicleTripAuditLog
        fields = '__all__'

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return f"{obj.changed_by.first_name} {obj.changed_by.last_name}".strip() or obj.changed_by.username
        return 'سیستم'

class AttendanceAuditLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceAuditLog
        fields = '__all__'

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return f"{obj.changed_by.first_name} {obj.changed_by.last_name}".strip() or obj.changed_by.username
        return "سیستم"

class DailyAttendanceSerializer(serializers.ModelSerializer):
    personnel_name = serializers.CharField(source='personnel.full_name', read_only=True)
    personnel_national_code = serializers.SerializerMethodField()
    personnel_job_title = serializers.CharField(source='personnel.job_title', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    approval_status_display = serializers.CharField(source='get_approval_status_display', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    project_name = serializers.CharField(source='project.title', read_only=True)
    supervisor_approved_by_name = serializers.SerializerMethodField()
    revision_requested_by_name = serializers.SerializerMethodField()
    audit_logs = AttendanceAuditLogSerializer(many=True, read_only=True)

    class Meta:
        model = DailyAttendance
        fields = '__all__'
        # ق۶ + د۳ طرح ۴.۴: دوره، تأیید و عودت فقط از سرور و کارتابل (نه از بدنهٔ ثبت؛ دورهٔ شرکت دیگر یا تأیید جعلی)
        read_only_fields = [
            'created_at', 'updated_at', 'created_by', 'modified_by', 'period', 'approval_status',
            'supervisor_approved_by', 'supervisor_approved_at', 'revision_reason', 'revision_requested_by',
            'revision_requested_at', 'is_deleted',
        ]
        # د۱۰ طرح ۴.۴: قید یکتای «پرسنل + روز + بخش» را نما با به‌روزرسانی همان ردیف حل می‌کند؛
        # اعتبارسنج خودکار DRF آن را 400 می‌کرد و رکورد صف آفلاین قدیمی (بی بخش یا تکراری) دور ریخته می‌شد
        validators = []
        extra_kwargs = {'section': {'required': False}}

    def get_personnel_national_code(self, obj):
        # D6 of plan 4.3 (Q16): masked for users without full view of that profile; no request = internal, full
        profile = obj.personnel
        value = getattr(profile, 'national_code', None)
        request = self.context.get('request')
        if not value or request is None:
            return value
        from ..lifecycle_services import can_view_personnel_sensitive, mask_sensitive_value
        cache = self.context.setdefault('_sensitive_cache', {})
        return value if can_view_personnel_sensitive(request.user, profile, cache) else mask_sensitive_value(value)

    def get_supervisor_approved_by_name(self, obj):
        if obj.supervisor_approved_by:
            return f"{obj.supervisor_approved_by.first_name} {obj.supervisor_approved_by.last_name}".strip() or obj.supervisor_approved_by.username
        return None

    def get_revision_requested_by_name(self, obj):
        if obj.revision_requested_by:
            return f"{obj.revision_requested_by.first_name} {obj.revision_requested_by.last_name}".strip() or obj.revision_requested_by.username
        return None

class AttendanceItemInputSerializer(serializers.Serializer):
    personnel_id = serializers.IntegerField()
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    project_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    status = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    effective_hours = serializers.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    overtime_hours = serializers.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    is_friday_work = serializers.BooleanField(default=False)
    is_mission = serializers.BooleanField(default=False)
    advance_payment = serializers.DecimalField(max_digits=12, decimal_places=0, default=0)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

class BulkAttendanceMatrixSerializer(serializers.Serializer):
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    project_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    date_shamsi = serializers.CharField(max_length=15)
    client_tab_id = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    items = AttendanceItemInputSerializer(many=True)

class MonthlyGridItemInputSerializer(serializers.Serializer):
    personnel_id = serializers.IntegerField()
    day = serializers.IntegerField(min_value=1, max_value=31)
    status = serializers.CharField(max_length=20, required=False, allow_blank=True, default='PRESENT_10H')
    effective_hours = serializers.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    overtime_hours = serializers.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    is_friday_work = serializers.BooleanField(default=False)
    is_mission = serializers.BooleanField(default=False)
    advance_payment = serializers.DecimalField(max_digits=12, decimal_places=0, default=0)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)

class BulkMonthlyAttendanceGridSerializer(serializers.Serializer):
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    project_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    year_month = serializers.CharField(max_length=10)
    client_tab_id = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    items = MonthlyGridItemInputSerializer(many=True)

class VehicleTripLogSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source='vehicle.driver_name', read_only=True)
    plate_number = serializers.CharField(source='vehicle.plate_number', read_only=True)
    vehicle_type_display = serializers.CharField(source='vehicle.get_vehicle_type_display', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)

    class Meta:
        model = VehicleTripLog
        fields = '__all__'
        # د۵ طرح ۴.۶: دوره و تسویه را فقط سرور (پیوند دورهٔ بخش و پرداخت خزانه) می‌نویسد
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'period', 'is_settled', 'settled_at',
                            'settled_by', 'payment_tracking_code']

class VehicleTripItemInputSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField()
    trip_count = serializers.IntegerField(default=1)
    unit_rate = serializers.DecimalField(max_digits=14, decimal_places=0, required=False)
    dispatch_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    origin_destination = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

class BulkVehicleTripMatrixSerializer(serializers.Serializer):
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    project_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    date_shamsi = serializers.CharField(max_length=15)
    client_tab_id = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    items = VehicleTripItemInputSerializer(many=True)

class VehicleDayTripUpdateSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField()
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    project_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    date_shamsi = serializers.CharField(max_length=15)
    trip_count = serializers.IntegerField(default=0)
    unit_rate = serializers.DecimalField(max_digits=14, decimal_places=0, required=False, allow_null=True)
    dispatch_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    origin_destination = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    client_tab_id = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)

class VehicleMonthlyGridItemInputSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField()
    day = serializers.IntegerField(min_value=1, max_value=31)
    trip_count = serializers.IntegerField(default=0)
    unit_rate = serializers.DecimalField(max_digits=14, decimal_places=0, required=False, allow_null=True)
    dispatch_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    origin_destination = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

class BulkVehicleMonthlyGridSerializer(serializers.Serializer):
    warehouse_id = serializers.IntegerField(required=False, allow_null=True)
    project_id = serializers.IntegerField(required=False, allow_null=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    year_month = serializers.CharField(max_length=10)
    client_tab_id = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)
    items = VehicleMonthlyGridItemInputSerializer(many=True)

class MonthlyWorkPeriodSerializer(serializers.ModelSerializer):
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    project_title = serializers.CharField(source='project.title', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    locked_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    pending_approvals_count = serializers.SerializerMethodField()
    payroll_workflow_step = serializers.SerializerMethodField()

    class Meta:
        model = MonthlyWorkPeriod
        fields = '__all__'
        # د۲ و د۵ طرح ۴.۴: وضعیت و فیلدهای گردش فقط از موتور (اکشن‌های دوره) عوض می‌شوند، نه با PATCH
        read_only_fields = [
            'created_at', 'updated_at', 'locked_at', 'locked_by', 'submitted_at', 'submitted_by', 'status',
            'rejection_reason', 'supervisor_approved_by', 'supervisor_approved_at', 'accountant_approved_by',
            'accountant_approved_at', 'manager_approved_by', 'manager_approved_at', 'treasury_paid_by',
            'treasury_paid_at', 'payment_tracking_code', 'payment_batch_id', 'revision_requested_by',
            'revision_requested_at',
        ]

    def get_locked_by_name(self, obj):
        if obj.locked_by:
            return f"{obj.locked_by.first_name} {obj.locked_by.last_name}".strip() or obj.locked_by.username
        return None

    def get_submitted_by_name(self, obj):
        if obj.submitted_by:
            return f"{obj.submitted_by.first_name} {obj.submitted_by.last_name}".strip() or obj.submitted_by.username
        return None

    def get_payroll_workflow_step(self, obj):
        # 4.5-d: open payroll workflow step (manager_ok / treasury_pay) so the payroll page knows the lock after reload
        from ..workflows import payroll_open_task
        task = payroll_open_task(obj.pk)
        return task.step_key if task is not None else None

    def get_pending_approvals_count(self, obj):
        # شمارش کارکردهای تاییدنشده دوره
        qs = DailyAttendance.objects.filter(
            date_shamsi__startswith=obj.year_month,
            is_deleted=False
        ).exclude(approval_status='APPROVED')
        if obj.section_id:
            qs = qs.filter(section_id=obj.section_id)
        elif obj.project_id:
            qs = qs.filter(project_id=obj.project_id)
        elif obj.warehouse_id:
            qs = qs.filter(warehouse_id=obj.warehouse_id)
        return qs.count()
