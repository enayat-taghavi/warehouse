import re
from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from .models import (
    Company,
    CompanyDocument,
    CompanyBankAccount,
    CompanyBoardMember,
    CompanyFiscalPeriod,
    UserCompanyAccess,
    FinancialProject,
    ProjectSection,
    UserSectionAssignment,
    Counterparty,
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
    VehicleTripAuditLog,
    PayrollYearlySettings,
    JobGradeTier,
    WorkshopInsuranceSettings,
    TaxRuleSettings,
    BankExportSettings,
    MonthlyPayrollRecord,
    WorkflowAuditLog,
    PersonnelBankAccount,
    InsuranceJobTitle,
    PersonnelDocument,
    VehicleBankAccount,
    VehicleDocument
)
import os
from datetime import date as dt_date, datetime as dt_datetime
from .sheba_utils import validate_sheba, clean_sheba, get_bank_from_sheba
from common.date_utils import normalize_digits, parse_date_smart, format_to_shamsi_str
from common.media_urls import signed_media_url


def normalize_iranian_phone(phone_str):
    if not phone_str:
        return ''
    norm = normalize_digits(str(phone_str)).strip()
    digits = re.sub(r'\D', '', norm)
    if digits.startswith('98') and len(digits) == 12:
        digits = '0' + digits[2:]
    elif digits.startswith('0098'):
        digits = '0' + digits[4:]
    elif len(digits) == 10 and digits.startswith('9'):
        digits = '0' + digits
    return digits


def normalize_plate(plate_str):
    if not plate_str:
        return ''
    norm = normalize_digits(str(plate_str)).strip()
    match = re.match(r'^(\d{2})\s*([^\d\s]+)\s*(\d{3})\s*(?:ایران|-)?\s*(\d{2})$', norm)
    if match:
        p1, p2, p3, p4 = match.groups()
        return f"{p1} {p2} {p3} ایران {p4}"
    return re.sub(r'\s+', ' ', norm).strip()



class VehicleTripAuditLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VehicleTripAuditLog
        fields = '__all__'

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return f"{obj.changed_by.first_name} {obj.changed_by.last_name}".strip() or obj.changed_by.username
        return 'سیستم'


class JobGradeTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobGradeTier
        exclude = ['yearly_settings']
        validators = []

    def validate_daily_base_wage(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("مزد پایه روزانه نمی‌تواند منفی باشد.")
        return value

    def validate_daily_seniority_bonus(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("پایه سنوات روزانه نمی‌تواند منفی باشد.")
        return value


class WorkshopInsuranceSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkshopInsuranceSettings
        exclude = ['yearly_settings']
        validators = []


class TaxRuleSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRuleSettings
        exclude = ['yearly_settings']
        validators = []


class BankExportSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankExportSettings
        exclude = ['yearly_settings']
        validators = []


class PayrollYearlySettingsSerializer(serializers.ModelSerializer):
    job_grades = JobGradeTierSerializer(many=True, required=False)
    workshop_insurance = WorkshopInsuranceSettingsSerializer(required=False, allow_null=True)
    tax_settings = TaxRuleSettingsSerializer(required=False, allow_null=True)
    bank_export_settings = BankExportSettingsSerializer(required=False, allow_null=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PayrollYearlySettings
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'updated_by']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_updated_by_name(self, obj):
        if obj.updated_by:
            return f"{obj.updated_by.first_name} {obj.updated_by.last_name}".strip() or obj.updated_by.username
        return None

    def validate_attendance_edit_past_days(self, value):
        if value is not None and value < -1:
            raise serializers.ValidationError("مقدار روزهای گذشته مجاز باید ۰ یا مثبت باشد، یا ۱- به معنای نامحدود.")
        return value

    def validate_attendance_edit_future_days(self, value):
        if value is not None and value < -1:
            raise serializers.ValidationError("مقدار روزهای آینده مجاز باید ۰ یا مثبت باشد، یا ۱- به معنای نامحدود.")
        return value

    def validate_job_grades(self, value):
        if value:
            sorted_grades = sorted(value, key=lambda x: int(x.get('grade_number') or 0))
            prev_wage = None
            for item in sorted_grades:
                g_num = item.get('grade_number')
                wage = item.get('daily_base_wage')
                if wage is not None:
                    try:
                        w = Decimal(str(wage))
                        if w < 0:
                            raise serializers.ValidationError(f"مزد روزانه گروه {g_num} نمی‌تواند منفی باشد.")
                        if prev_wage is not None and w < prev_wage:
                            raise serializers.ValidationError(
                                f"مزد روزانه گروه {g_num} ({w}) نمی‌تواند کمتر از گروه ماقبل ({prev_wage}) باشد."
                            )
                        prev_wage = w
                    except (ValueError, TypeError):
                        pass
        return value

    def update(self, instance, validated_data):
        job_grades_data = validated_data.pop('job_grades', None)
        workshop_data = validated_data.pop('workshop_insurance', None)
        tax_data = validated_data.pop('tax_settings', None)
        bank_data = validated_data.pop('bank_export_settings', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if workshop_data is not None:
            WorkshopInsuranceSettings.objects.update_or_create(
                yearly_settings=instance,
                defaults=workshop_data
            )

        if tax_data is not None:
            TaxRuleSettings.objects.update_or_create(
                yearly_settings=instance,
                defaults=tax_data
            )

        if bank_data is not None:
            BankExportSettings.objects.update_or_create(
                yearly_settings=instance,
                defaults=bank_data
            )

        if job_grades_data is not None:
            for jg_item in job_grades_data:
                grade_num = jg_item.get('grade_number')
                if grade_num:
                    JobGradeTier.objects.update_or_create(
                        yearly_settings=instance,
                        grade_number=int(grade_num),
                        defaults={
                            'daily_base_wage': jg_item.get('daily_base_wage', 0),
                            'daily_seniority_bonus': jg_item.get('daily_seniority_bonus', 0),
                        }
                    )

        return instance



class MonthlyPayrollRecordSerializer(serializers.ModelSerializer):
    personnel_name = serializers.CharField(source='personnel.full_name', read_only=True)
    period_year_month = serializers.CharField(source='period.year_month', read_only=True)
    # وضعیت دوره (OPEN/LOCKED/...) تا هاب حقوق حسابدار وضعیت قفل را همان هنگام بارگذاری بداند
    period_status = serializers.CharField(source='period.status', read_only=True)
    paid_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MonthlyPayrollRecord
        fields = '__all__'
        read_only_fields = [
            'created_at', 'updated_at', 'paid_by', 'paid_at',
            'payment_hold', 'payment_hold_reason',
            'payment_hold_released_at', 'payment_hold_released_by'
        ]

    def get_paid_by_name(self, obj):
        if obj.paid_by:
            return f"{obj.paid_by.first_name} {obj.paid_by.last_name}".strip() or obj.paid_by.username
        return None



class PersonnelBankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonnelBankAccount
        fields = [
            'id', 'personnel', 'bank_name', 'account_number', 'sheba_number',
            'card_number', 'is_primary', 'is_active', 'description',
            'created_at', 'updated_at'
        ]
        # DEF-10: پرسنل صاحب حساب همیشه از URL یا پروندهٔ والد گرفته می‌شود و از بدنهٔ درخواست پذیرفته نمی‌شود
        read_only_fields = ['id', 'personnel', 'created_at', 'updated_at']

    def validate_sheba_number(self, value):
        if not value or not str(value).strip():
            raise serializers.ValidationError("شماره شبا الزامی است.")
        cleaned = clean_sheba(value)
        is_valid, err_msg, _ = validate_sheba(cleaned)
        if not is_valid:
            raise serializers.ValidationError(err_msg or "شماره شبا نامعتبر است.")
        return cleaned

    def validate_is_primary(self, value):
        # برداشتن تیک حساب اصلی، پرسنل را بی‌حساب اصلی می‌گذارد؛ تعویض فقط با اصلی کردن حساب دیگر انجام می‌شود
        if self.instance is not None and getattr(self.instance, 'is_primary', False) and value is False:
            raise serializers.ValidationError("برای تغییر حساب اصلی، حساب دیگری را به‌عنوان حساب اصلی تعیین کنید.")
        return value


class PersonnelDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    doc_type_display = serializers.CharField(source='get_doc_type_display', read_only=True)
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = PersonnelDocument
        fields = [
            'id', 'personnel', 'doc_type', 'doc_type_display',
            'file', 'file_name', 'uploaded_by', 'uploaded_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'uploaded_by', 'created_at']

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return None

    def get_file_name(self, obj):
        if obj.file:
            return os.path.basename(obj.file.name)
        return None


class PersonnelProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    effective_daily_rate = serializers.FloatField(read_only=True)
    hourly_rate = serializers.FloatField(read_only=True)
    assigned_warehouse_name = serializers.SerializerMethodField()
    user_username = serializers.CharField(source='user.username', read_only=True)
    supervisor_approved_by_name = serializers.SerializerMethodField()
    accountant_approved_by_name = serializers.SerializerMethodField()
    manager_approved_by_name = serializers.SerializerMethodField()
    treasury_paid_by_name = serializers.SerializerMethodField()
    revision_requested_by_name = serializers.SerializerMethodField()
    auto_passed_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    pending_change_request = serializers.SerializerMethodField()
    missing_fields = serializers.SerializerMethodField()
    bank_accounts = PersonnelBankAccountSerializer(many=True, required=False)
    documents = PersonnelDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = PersonnelProfile
        fields = '__all__'
        read_only_fields = [
            'approval_status', 'rejection_reason', 'has_pending_changes', 'is_active',
            'created_at', 'updated_at', 'created_by',
            'supervisor_approved_by', 'supervisor_approved_at',
            'accountant_approved_by', 'accountant_approved_at',
            'manager_approved_by', 'manager_approved_at',
            'treasury_paid_by', 'treasury_paid_at',
            'is_auto_passed', 'auto_passed_by', 'auto_passed_at',
            'revision_requested_by', 'revision_requested_at'
        ]
        extra_kwargs = {
            'company': {'required': False, 'allow_null': True}
        }
        validators = []

    BANK_MIRROR_FIELDS = ('bank_name', 'account_number', 'sheba_number', 'card_number')

    def get_fields(self):
        fields = super().get_fields()
        # DEF-08: حساب‌های پروندهٔ موجود فقط از اکشن bank-accounts تغییر می‌کنند؛
        # در ویرایش، bank_accounts ارسالی نادیده گرفته می‌شود تا نوشتن تودرتو به خطای ۵۰۰ نخورد.
        if self.instance is not None and 'bank_accounts' in fields:
            fields['bank_accounts'].read_only = True
        return fields

    def get_missing_fields(self, obj):
        from .lifecycle_services import get_missing_fields
        stage = 'submit' if obj.approval_status in ('draft', 'revision_required') else ('accountant' if obj.approval_status == 'pending_accountant' else 'draft')
        return get_missing_fields(obj, stage=stage)

    def get_assigned_warehouse_name(self, obj):
        aw = obj.assigned_warehouse
        return aw.name if aw else None

    def get_supervisor_approved_by_name(self, obj):
        if obj.supervisor_approved_by:
            return f"{obj.supervisor_approved_by.first_name} {obj.supervisor_approved_by.last_name}".strip() or obj.supervisor_approved_by.username
        return None

    def get_accountant_approved_by_name(self, obj):
        if obj.accountant_approved_by:
            return f"{obj.accountant_approved_by.first_name} {obj.accountant_approved_by.last_name}".strip() or obj.accountant_approved_by.username
        return None

    def get_manager_approved_by_name(self, obj):
        if obj.manager_approved_by:
            return f"{obj.manager_approved_by.first_name} {obj.manager_approved_by.last_name}".strip() or obj.manager_approved_by.username
        return None

    def get_treasury_paid_by_name(self, obj):
        if obj.treasury_paid_by:
            return f"{obj.treasury_paid_by.first_name} {obj.treasury_paid_by.last_name}".strip() or obj.treasury_paid_by.username
        return None

    def get_revision_requested_by_name(self, obj):
        if obj.revision_requested_by:
            return f"{obj.revision_requested_by.first_name} {obj.revision_requested_by.last_name}".strip() or obj.revision_requested_by.username
        return None

    def get_auto_passed_by_name(self, obj):
        if obj.auto_passed_by:
            return f"{obj.auto_passed_by.first_name} {obj.auto_passed_by.last_name}".strip() or obj.auto_passed_by.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_pending_change_request(self, obj):
        if not getattr(obj, 'has_pending_changes', False):
            return None
        cr = obj.change_requests.filter(
            status__in=['pending_supervisor', 'pending_accountant', 'pending_manager', 'supervisor_approved', 'accountant_approved', 'manager_approved']
        ).order_by('-created_at').first()
        if cr:
            return {
                'id': cr.id,
                'status': cr.status,
                'proposed_changes': cr.proposed_changes,
                'previous_values': cr.previous_values,
                'created_at': cr.created_at.isoformat() if cr.created_at else None,
            }
        return None

    def _is_unchanged_stored_value(self, field: str, value) -> bool:
        """
        مقدار ذخیره‌شدهٔ قبلی که دست نخورده دوباره فرستاده شده (PATCH کامل‌شیء) دوباره سنجیده نمی‌شود؛
        وگرنه دادهٔ قدیمی که پیش از سخت‌گیری قالب‌ها ثبت شده، هر ذخیرهٔ نامربوط پرونده را با ۴۰۰ رد می‌کند.
        """
        if self.instance is None or isinstance(self.instance, (list, tuple)) or value in (None, ''):
            return False
        return str(value).strip() == str(getattr(self.instance, field, '') or '').strip()

    def validate_national_code(self, value):
        if not value:
            raise serializers.ValidationError("کد ملی الزامی است.")
        if self._is_unchanged_stored_value('national_code', value):
            return value
        from common.validators import validate_iranian_national_code
        try:
            return validate_iranian_national_code(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_phone_number(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('phone_number', value):
            return value
        from common.validators import validate_iranian_mobile
        try:
            return validate_iranian_mobile(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_postal_code(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('postal_code', value):
            return value
        from common.validators import validate_iranian_postal_code
        try:
            return validate_iranian_postal_code(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_sheba_number(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('sheba_number', value):
            return value
        cleaned = clean_sheba(value)
        is_valid, err_msg, _ = validate_sheba(cleaned)
        if not is_valid:
            raise serializers.ValidationError(err_msg or "شماره شبا نامعتبر است.")
        return cleaned

    def validate_valid_until_date(self, value):
        # DEF-20: قالب YYYY/MM/DD با صفر پیش‌رو و تاریخ شمسی معتبر؛ مقایسهٔ انقضا با شیء تاریخ انجام می‌شود
        from .lifecycle_services import normalize_shamsi_date
        if self._is_unchanged_stored_value('valid_until_date', value):
            return value
        try:
            return normalize_shamsi_date(value) or None
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def _request_user_hides_wages(self) -> bool:
        """DEF-21: نقش غیرمالی دستمزد را نه می‌بیند و نه می‌نویسد (تصمیم‌های مصوب ۶.۵ و ۶.۹)."""
        request = self.context.get('request')
        if request is None or self.context.get('apply_change_request'):
            return False
        from .lifecycle_services import user_can_view_wages
        return not user_can_view_wages(getattr(request, 'user', None))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self._request_user_hides_wages():
            # حذف بی‌صدا، نه رد: فرم قدیمی هنوز daily_base_wage=0 می‌فرستد و ۴xx رکورد صف آفلاین را پاک می‌کند
            from .lifecycle_services import WAGE_FIELDS
            for wage_field in WAGE_FIELDS:
                attrs.pop(wage_field, None)
        company = attrs.get('company')
        if not company:
            sec = attrs.get('section')
            if sec and hasattr(sec, 'project') and sec.project and sec.project.company:
                company = sec.project.company
                attrs['company'] = company

        nat_code = attrs.get('national_code')
        if nat_code:
            qs = PersonnelProfile.objects.filter(national_code=nat_code)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if company:
                qs = qs.filter(company=company)
                if qs.exists():
                    raise serializers.ValidationError({"national_code": f"پرسنلی با کد ملی «{nat_code}» قبلاً در این شرکت ثبت شده است."})
            else:
                qs = qs.filter(company__isnull=True)
                if qs.exists():
                    raise serializers.ValidationError({"national_code": f"پرسنلی با کد ملی «{nat_code}» قبلاً در سامانه ثبت شده است."})
        return attrs

    def create(self, validated_data):
        bank_accounts_data = validated_data.pop('bank_accounts', None)
        with transaction.atomic():
            if bank_accounts_data:
                # DEF-01: یک نویسندهٔ واحد. وقتی حساب‌ها تودرتو آمده‌اند فیلدهای تخت بانکی نوشته نمی‌شوند
                # و آینه را فقط PersonnelBankAccount.save() پر می‌کند؛ وگرنه حساب تکراری ساخته می‌شود.
                for field_name in self.BANK_MIRROR_FIELDS:
                    validated_data.pop(field_name, None)
            instance = super().create(validated_data)
            if bank_accounts_data:
                primary_idx = next((i for i, acc in enumerate(bank_accounts_data) if acc.get('is_primary')), 0)
                ordered = [bank_accounts_data[primary_idx]] + [acc for i, acc in enumerate(bank_accounts_data) if i != primary_idx]
                for idx, acc_data in enumerate(ordered):
                    acc_data['is_primary'] = (idx == 0)
                    PersonnelBankAccount.objects.create(personnel=instance, **acc_data)
                instance.refresh_from_db(fields=list(self.BANK_MIRROR_FIELDS))
        return instance

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        if request:
            sec_id = request.query_params.get('section_id')
            if sec_id and str(sec_id).isdigit():
                sec_id = int(sec_id)
                assignment = instance.section_assignments.filter(section_id=sec_id, is_active=True).first()
                if assignment:
                    if assignment.job_title:
                        ret['job_title'] = assignment.job_title
                    if assignment.daily_base_wage:
                        ret['daily_base_wage'] = float(assignment.daily_base_wage)
                    ret['is_assigned_to_section'] = True
                    ret['assignment_id'] = assignment.id
        if self._request_user_hides_wages():
            from .lifecycle_services import WAGE_FIELDS
            for wage_field in WAGE_FIELDS:
                ret.pop(wage_field, None)
        return ret


class VehicleBankAccountSerializer(serializers.ModelSerializer):
    payee_type_display = serializers.CharField(source='get_payee_type_display', read_only=True)

    class Meta:
        model = VehicleBankAccount
        fields = [
            'id', 'vehicle', 'bank_name', 'account_number', 'sheba_number',
            'card_number', 'account_owner_name', 'account_owner_national_code',
            'payee_type', 'payee_type_display', 'is_primary', 'is_active',
            'description', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'vehicle', 'created_at', 'updated_at']

    def validate_is_primary(self, value):
        if self.instance is not None and getattr(self.instance, 'is_primary', False) and value is False:
            raise serializers.ValidationError("برای تغییر حساب اصلی، حساب دیگری را به‌عنوان حساب اصلی تعیین کنید.")
        return value

    def validate_sheba_number(self, value):
        if not value or not str(value).strip():
            return value
        cleaned = clean_sheba(value)
        is_valid, err_msg, _ = validate_sheba(cleaned)
        if not is_valid:
            raise serializers.ValidationError(err_msg or "شماره شبا نامعتبر است.")
        return cleaned

    def validate_account_owner_national_code(self, value):
        if not value or not str(value).strip():
            return value
        from common.validators import validate_iranian_national_code
        try:
            return validate_iranian_national_code(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate(self, attrs):
        sheba = attrs.get('sheba_number')
        bank_name = attrs.get('bank_name')
        if sheba and not bank_name:
            bank_info = get_bank_from_sheba(sheba)
            if bank_info:
                attrs['bank_name'] = bank_info['name']
        return attrs


class VehicleDocumentSerializer(serializers.ModelSerializer):
    doc_type_display = serializers.CharField(source='get_doc_type_display', read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VehicleDocument
        fields = [
            'id', 'vehicle', 'doc_type', 'doc_type_display', 'file', 'title',
            'issue_date', 'expiry_date', 'uploaded_by', 'uploaded_by_name',
            'created_at'
        ]
        read_only_fields = ['id', 'vehicle', 'created_at', 'uploaded_by']

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return None

    def validate_issue_date(self, value):
        if not value or not str(value).strip():
            return value
        from .lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_expiry_date(self, value):
        if not value or not str(value).strip():
            return value
        from .lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)


ROAD_VEHICLE_TYPES = ('pickup', 'nissan', 'khavar', 'sedan', 'truck', 'trailer')
FLEET_RATE_FIELDS = ('default_service_rate',)


def user_can_view_fleet_rates(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return bool(
        user.has_perm('accounts.perm_approve_fleet_finance')
        or user.has_perm('accounts.can_act_as_accountant')
        or user.has_perm('accounts.perm_approve_fleet_manager')
        or user.has_perm('accounts.can_act_as_manager')
        or user.has_perm('accounts.can_act_as_company_manager')
    )


class VehicleDriverProfileSerializer(serializers.ModelSerializer):
    vehicle_type_display = serializers.CharField(source='get_vehicle_type_display', read_only=True)
    ownership_type_display = serializers.CharField(source='get_ownership_type_display', read_only=True)
    assigned_warehouse_name = serializers.SerializerMethodField()
    user_username = serializers.CharField(source='user.username', read_only=True)
    supervisor_approved_by_name = serializers.SerializerMethodField()
    accountant_approved_by_name = serializers.SerializerMethodField()
    manager_approved_by_name = serializers.SerializerMethodField()
    treasury_paid_by_name = serializers.SerializerMethodField()
    revision_requested_by_name = serializers.SerializerMethodField()
    auto_passed_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    pending_change_request = serializers.SerializerMethodField()
    missing_fields = serializers.SerializerMethodField()
    bank_accounts = VehicleBankAccountSerializer(many=True, required=False)
    documents = VehicleDocumentSerializer(many=True, read_only=True)

    BANK_MIRROR_FIELDS = ('bank_name', 'account_number', 'sheba_number')

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None and 'bank_accounts' in fields:
            fields['bank_accounts'].read_only = True
        return fields

    class Meta:
        model = VehicleDriverProfile
        fields = '__all__'
        read_only_fields = [
            'created_at', 'updated_at', 'created_by',
            'supervisor_approved_by', 'supervisor_approved_at',
            'accountant_approved_by', 'accountant_approved_at',
            'manager_approved_by', 'manager_approved_at',
            'treasury_paid_by', 'treasury_paid_at',
            'is_auto_passed', 'auto_passed_by', 'auto_passed_at',
            'revision_requested_by', 'revision_requested_at',
            'has_pending_changes',
            'approval_status', 'rejection_reason', 'is_active', 'end_date'
        ]
        extra_kwargs = {
            'company': {'required': False, 'allow_null': True}
        }
        validators = []

    def get_missing_fields(self, obj):
        from .fleet_lifecycle_services import get_vehicle_missing_fields
        stage = 'submit' if obj.approval_status in ('draft', 'revision_required') else ('accountant' if obj.approval_status == 'pending_accountant' else 'draft')
        return get_vehicle_missing_fields(obj, stage=stage)

    def _is_unchanged_stored_value(self, field: str, value) -> bool:
        if self.instance is None or isinstance(self.instance, (list, tuple)) or value in (None, ''):
            return False
        return str(value).strip() == str(getattr(self.instance, field, '') or '').strip()

    def _request_user_hides_rates(self) -> bool:
        request = self.context.get('request')
        if not request:
            return False
        return not user_can_view_fleet_rates(getattr(request, 'user', None))

    def get_assigned_warehouse_name(self, obj):
        aw = obj.assigned_warehouse
        return aw.name if aw else None

    def get_supervisor_approved_by_name(self, obj):
        if obj.supervisor_approved_by:
            return f"{obj.supervisor_approved_by.first_name} {obj.supervisor_approved_by.last_name}".strip() or obj.supervisor_approved_by.username
        return None

    def get_accountant_approved_by_name(self, obj):
        if obj.accountant_approved_by:
            return f"{obj.accountant_approved_by.first_name} {obj.accountant_approved_by.last_name}".strip() or obj.accountant_approved_by.username
        return None

    def get_manager_approved_by_name(self, obj):
        if obj.manager_approved_by:
            return f"{obj.manager_approved_by.first_name} {obj.manager_approved_by.last_name}".strip() or obj.manager_approved_by.username
        return None

    def get_treasury_paid_by_name(self, obj):
        if obj.treasury_paid_by:
            return f"{obj.treasury_paid_by.first_name} {obj.treasury_paid_by.last_name}".strip() or obj.treasury_paid_by.username
        return None

    def get_revision_requested_by_name(self, obj):
        if obj.revision_requested_by:
            return f"{obj.revision_requested_by.first_name} {obj.revision_requested_by.last_name}".strip() or obj.revision_requested_by.username
        return None

    def get_auto_passed_by_name(self, obj):
        if obj.auto_passed_by:
            return f"{obj.auto_passed_by.first_name} {obj.auto_passed_by.last_name}".strip() or obj.auto_passed_by.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_pending_change_request(self, obj):
        if not getattr(obj, 'has_pending_changes', False):
            return None
        valid_statuses = {'pending_supervisor', 'pending_accountant', 'pending_manager', 'supervisor_approved', 'accountant_approved', 'manager_approved'}
        if hasattr(obj, '_prefetched_objects_cache') and 'change_requests' in obj._prefetched_objects_cache:
            crs = [cr for cr in obj.change_requests.all() if cr.status in valid_statuses]
            if crs:
                crs.sort(key=lambda x: x.created_at or timezone.now(), reverse=True)
                cr = crs[0]
            else:
                cr = None
        else:
            cr = obj.change_requests.filter(status__in=valid_statuses).order_by('-created_at').first()
        if cr:
            return {
                'id': cr.id,
                'status': cr.status,
                'proposed_changes': cr.proposed_changes,
                'previous_values': cr.previous_values,
                'created_at': cr.created_at.isoformat() if cr.created_at else None,
            }
        return None

    def validate_plate_number(self, value):
        if not value or not str(value).strip():
            raise serializers.ValidationError("شماره پلاک الزامی است.")
        if self._is_unchanged_stored_value('plate_number', value):
            return value
        v_type = self.initial_data.get('vehicle_type') if hasattr(self, 'initial_data') else None
        if not v_type and self.instance:
            v_type = self.instance.vehicle_type
        if not v_type or v_type in ROAD_VEHICLE_TYPES:
            from .fleet_lifecycle_services import is_valid_national_plate
            if not is_valid_national_plate(value):
                raise serializers.ValidationError("ساختار شماره پلاک ملی برای خودروهای جاده‌ای نامعتبر است (الگوی ۲ رقم - حرف - ۳ رقم - ایران - ۲ رقم).")
            return normalize_plate(value)
        return str(value).strip()

    def validate_driver_phone(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('driver_phone', value):
            return value
        from common.validators import validate_iranian_mobile
        try:
            return validate_iranian_mobile(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_owner_phone(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('owner_phone', value):
            return value
        from common.validators import validate_iranian_mobile
        try:
            return validate_iranian_mobile(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_driver_national_code(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('driver_national_code', value):
            return value
        from common.validators import validate_iranian_national_code
        try:
            return validate_iranian_national_code(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_owner_national_code(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('owner_national_code', value):
            return value
        from common.validators import validate_iranian_national_code
        try:
            return validate_iranian_national_code(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_insurance_expiry_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('insurance_expiry_date', value):
            return value
        from .lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_inspection_expiry_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('inspection_expiry_date', value):
            return value
        from .lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_license_expiry_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('license_expiry_date', value):
            return value
        from .lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_valid_until_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('valid_until_date', value):
            return value
        from .lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_end_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('end_date', value):
            return value
        from .lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_sheba_number(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('sheba_number', value):
            return value
        cleaned = clean_sheba(value)
        is_valid, err_msg, _ = validate_sheba(cleaned)
        if not is_valid:
            raise serializers.ValidationError(err_msg or "شماره شبا نامعتبر است.")
        return cleaned

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self._request_user_hides_rates():
            for rate_field in FLEET_RATE_FIELDS:
                attrs.pop(rate_field, None)

        company = attrs.get('company')
        if not company and self.instance:
            company = self.instance.company
        if not company:
            sec = attrs.get('section')
            if sec and hasattr(sec, 'project') and sec.project and sec.project.company:
                company = sec.project.company
                attrs['company'] = company

        plate = attrs.get('plate_number')
        if plate and not self._is_unchanged_stored_value('plate_number', plate):
            qs = VehicleDriverProfile.objects.filter(plate_number=plate)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if company:
                qs = qs.filter(company=company)
                if qs.exists():
                    raise serializers.ValidationError({"plate_number": f"خودرویی با شماره پلاک «{plate}» قبلاً در این شرکت ثبت شده است."})
            else:
                qs = qs.filter(company__isnull=True)
                if qs.exists():
                    raise serializers.ValidationError({"plate_number": f"خودرویی با شماره پلاک «{plate}» قبلاً در سامانه ثبت شده است."})

        sheba = attrs.get('sheba_number')
        bank_name = attrs.get('bank_name')
        if sheba and not bank_name:
            bank_info = get_bank_from_sheba(sheba)
            if bank_info:
                attrs['bank_name'] = bank_info['name']
        return attrs

    def create(self, validated_data):
        bank_accounts_data = validated_data.pop('bank_accounts', None)
        with transaction.atomic():
            if bank_accounts_data:
                for field_name in self.BANK_MIRROR_FIELDS:
                    validated_data.pop(field_name, None)
            instance = super().create(validated_data)
            if bank_accounts_data:
                primary_idx = next((i for i, acc in enumerate(bank_accounts_data) if acc.get('is_primary')), 0)
                ordered = [bank_accounts_data[primary_idx]] + [acc for i, acc in enumerate(bank_accounts_data) if i != primary_idx]
                for idx, acc_data in enumerate(ordered):
                    acc_data['is_primary'] = (idx == 0)
                    VehicleBankAccount.objects.create(vehicle=instance, **acc_data)
                instance.refresh_from_db(fields=list(self.BANK_MIRROR_FIELDS))
        return instance

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if self._request_user_hides_rates():
            for rate_field in FLEET_RATE_FIELDS:
                ret.pop(rate_field, None)
        return ret


class PersonnelChangeRequestSerializer(serializers.ModelSerializer):
    personnel_name = serializers.CharField(source='personnel.full_name', read_only=True)
    personnel_national_code = serializers.CharField(source='personnel.national_code', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    supervisor_reviewed_by_name = serializers.SerializerMethodField()
    accountant_reviewed_by_name = serializers.SerializerMethodField()
    manager_reviewed_by_name = serializers.SerializerMethodField()
    revision_requested_by_name = serializers.SerializerMethodField()
    auto_passed_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PersonnelChangeRequest
        fields = '__all__'
        read_only_fields = [
            'created_at', 'updated_at', 'requested_by',
            'supervisor_reviewed_by', 'supervisor_reviewed_at',
            'accountant_reviewed_by', 'accountant_reviewed_at',
            'manager_reviewed_by', 'manager_reviewed_at',
            'is_auto_passed', 'auto_passed_by', 'auto_passed_at',
            'revision_requested_by', 'revision_requested_at'
        ]

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return f"{obj.requested_by.first_name} {obj.requested_by.last_name}".strip() or obj.requested_by.username
        return "سیستم"

    def get_supervisor_reviewed_by_name(self, obj):
        if obj.supervisor_reviewed_by:
            return f"{obj.supervisor_reviewed_by.first_name} {obj.supervisor_reviewed_by.last_name}".strip() or obj.supervisor_reviewed_by.username
        return None

    def get_accountant_reviewed_by_name(self, obj):
        if obj.accountant_reviewed_by:
            return f"{obj.accountant_reviewed_by.first_name} {obj.accountant_reviewed_by.last_name}".strip() or obj.accountant_reviewed_by.username
        return None

    def get_manager_reviewed_by_name(self, obj):
        if obj.manager_reviewed_by:
            return f"{obj.manager_reviewed_by.first_name} {obj.manager_reviewed_by.last_name}".strip() or obj.manager_reviewed_by.username
        return None

    def get_revision_requested_by_name(self, obj):
        if obj.revision_requested_by:
            return f"{obj.revision_requested_by.first_name} {obj.revision_requested_by.last_name}".strip() or obj.revision_requested_by.username
        return None

    def get_auto_passed_by_name(self, obj):
        if obj.auto_passed_by:
            return f"{obj.auto_passed_by.first_name} {obj.auto_passed_by.last_name}".strip() or obj.auto_passed_by.username
        return None


class VehicleChangeRequestSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source='vehicle.driver_name', read_only=True)
    plate_number = serializers.CharField(source='vehicle.plate_number', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    supervisor_reviewed_by_name = serializers.SerializerMethodField()
    accountant_reviewed_by_name = serializers.SerializerMethodField()
    manager_reviewed_by_name = serializers.SerializerMethodField()
    revision_requested_by_name = serializers.SerializerMethodField()
    auto_passed_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = VehicleChangeRequest
        fields = '__all__'
        read_only_fields = [
            'created_at', 'updated_at', 'requested_by',
            'supervisor_reviewed_by', 'supervisor_reviewed_at',
            'accountant_reviewed_by', 'accountant_reviewed_at',
            'manager_reviewed_by', 'manager_reviewed_at',
            'is_auto_passed', 'auto_passed_by', 'auto_passed_at',
            'revision_requested_by', 'revision_requested_at'
        ]

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return f"{obj.requested_by.first_name} {obj.requested_by.last_name}".strip() or obj.requested_by.username
        return "سیستم"

    def get_supervisor_reviewed_by_name(self, obj):
        if obj.supervisor_reviewed_by:
            return f"{obj.supervisor_reviewed_by.first_name} {obj.supervisor_reviewed_by.last_name}".strip() or obj.supervisor_reviewed_by.username
        return None

    def get_accountant_reviewed_by_name(self, obj):
        if obj.accountant_reviewed_by:
            return f"{obj.accountant_reviewed_by.first_name} {obj.accountant_reviewed_by.last_name}".strip() or obj.accountant_reviewed_by.username
        return None

    def get_manager_reviewed_by_name(self, obj):
        if obj.manager_reviewed_by:
            return f"{obj.manager_reviewed_by.first_name} {obj.manager_reviewed_by.last_name}".strip() or obj.manager_reviewed_by.username
        return None

    def get_revision_requested_by_name(self, obj):
        if obj.revision_requested_by:
            return f"{obj.revision_requested_by.first_name} {obj.revision_requested_by.last_name}".strip() or obj.revision_requested_by.username
        return None

    def get_auto_passed_by_name(self, obj):
        if obj.auto_passed_by:
            return f"{obj.auto_passed_by.first_name} {obj.auto_passed_by.last_name}".strip() or obj.auto_passed_by.username
        return None


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
    personnel_national_code = serializers.CharField(source='personnel.national_code', read_only=True)
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
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'modified_by']

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
        read_only_fields = ['created_at', 'updated_at', 'created_by']


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

    class Meta:
        model = MonthlyWorkPeriod
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'locked_at', 'locked_by', 'submitted_at', 'submitted_by']

    def get_locked_by_name(self, obj):
        if obj.locked_by:
            return f"{obj.locked_by.first_name} {obj.locked_by.last_name}".strip() or obj.locked_by.username
        return None

    def get_submitted_by_name(self, obj):
        if obj.submitted_by:
            return f"{obj.submitted_by.first_name} {obj.submitted_by.last_name}".strip() or obj.submitted_by.username
        return None

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


# ==============================================================================
# سریالایزرهای ساختار سازمانی، شرکت، پروژه، بخش، طرف‌حساب و فاکتور هزینه
# ==============================================================================

ALLOWED_DOCUMENT_EXTENSIONS = (
    '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.zip', '.rar',
    '.xlsx', '.xls', '.docx', '.doc'
)
MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


def validate_uploaded_document(file_obj, max_size_bytes=MAX_DOCUMENT_SIZE_BYTES, allowed_exts=ALLOWED_DOCUMENT_EXTENSIONS):
    """
    اعتبارسنجی یکپارچه حجم و فرمت فایل‌های اسناد و مدارک شرکت‌ها
    """
    if not file_obj:
        return file_obj

    # ۱. بررسی حجم فایل
    if hasattr(file_obj, 'size') and file_obj.size > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise serializers.ValidationError(f"حجم فایل نمی‌تواند بیشتر از {max_mb} مگابایت باشد.")

    # ۲. بررسی پسوند فایل
    name = getattr(file_obj, 'name', '') or ''
    ext = os.path.splitext(name)[1].lower()
    if not ext or ext not in allowed_exts:
        exts_display = ', '.join([e.replace('.', '').upper() for e in allowed_exts])
        raise serializers.ValidationError(f"فرمت فایل غیرمجاز است ({ext or 'نامشخص'}). پسوندهای مجاز: {exts_display}")

    return file_obj


class ShamsiDateField(serializers.Field):
    """
    فیلد اختصاصی تاریخ برای پشتیبانی دوطرفه از تاریخ شمسی و میلادی:
    - در ورودی (to_internal_value): دریافت رشته شمسی (۱۴۰۳/۰۵/۲۰ یا 1403/05/20)، میلادی یا شیء تاریخ و تبدیل به datetime.date
    - در خروجی (to_representation): رشته استاندارد شمسی YYYY/MM/DD
    """
    def __init__(self, output_shamsi=True, **kwargs):
        self.output_shamsi = output_shamsi
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if data in (None, '', 'null'):
            return None
        if isinstance(data, dt_date) and not isinstance(data, dt_datetime):
            return data
        if isinstance(data, dt_datetime):
            return data.date()
        try:
            parsed = parse_date_smart(data, as_datetime=False, strict=True)
            if parsed is None:
                raise serializers.ValidationError("فرمت تاریخ ارسالی نامعتبر است.")
            return parsed
        except serializers.ValidationError:
            raise
        except Exception as e:
            raise serializers.ValidationError(f"تاریخ نامعتبر است: {e}")

    def to_representation(self, value):
        if not value:
            return None
        if self.output_shamsi:
            return format_to_shamsi_str(value)
        return str(value)


class CompanySerializer(serializers.ModelSerializer):
    projects_count = serializers.SerializerMethodField()
    documents_count = serializers.SerializerMethodField()
    documents_health_status = serializers.SerializerMethodField()
    bank_accounts = serializers.SerializerMethodField()
    board_members = serializers.SerializerMethodField()
    registration_date = ShamsiDateField(required=False, allow_null=True)
    board_term_expiry = ShamsiDateField(required=False, allow_null=True)

    class Meta:
        model = Company
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_projects_count(self, obj):
        if hasattr(obj, 'projects_count'):
            return obj.projects_count
        return obj.projects.count()

    def get_documents_count(self, obj):
        if hasattr(obj, 'documents_count'):
            return obj.documents_count
        return obj.documents.count()

    def get_documents_health_status(self, obj):
        """
        خلاصه وضعیت سلامت مدارک:
        expired: دست‌کم یک مدرک منقضی شده
        expiring_soon: دست‌کم یک مدرک کمتر از ۳۰ روز مانده به انقضا
        valid: همه مدارک معتبرند
        no_documents: فاقد مدرک
        """
        docs = obj.documents.all()
        if not docs.exists():
            return 'no_documents'
        statuses = [d.expiry_status for d in docs]
        if 'expired' in statuses:
            return 'expired'
        if 'expiring_soon' in statuses:
            return 'expiring_soon'
        return 'valid'

    def get_bank_accounts(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'bank_accounts' in obj._prefetched_objects_cache:
            accounts = [a for a in obj.bank_accounts.all() if a.is_active]
        else:
            accounts = obj.bank_accounts.filter(is_active=True)
        return CompanyBankAccountSerializer(accounts, many=True).data

    def get_board_members(self, obj):
        if hasattr(obj, '_prefetched_objects_cache') and 'board_members' in obj._prefetched_objects_cache:
            members = [m for m in obj.board_members.all() if m.is_active]
        else:
            members = obj.board_members.filter(is_active=True)
        return CompanyBoardMemberSerializer(members, many=True, context=self.context).data

    def validate_code(self, value):
        if not value:
            raise serializers.ValidationError("کد یکتای شرکت الزامی است.")
        return value.strip().upper()

    def validate_national_id(self, value):
        if not value:
            return value
        cleaned = normalize_digits(str(value)).strip()
        if cleaned and not cleaned.isdigit():
            raise serializers.ValidationError("شناسه ملی باید فقط شامل ارقام عددی باشد.")
        if cleaned and len(cleaned) != 11:
            raise serializers.ValidationError("شناسه ملی شرکت باید دقیقاً ۱۱ رقم باشد.")
        return cleaned

    def validate_articles_of_association(self, value):
        return validate_uploaded_document(value)

    def validate_latest_gazette(self, value):
        return validate_uploaded_document(value)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        if instance.articles_of_association and instance.articles_of_association.name:
            signed_url = signed_media_url(instance.articles_of_association.name)
            ret['articles_of_association'] = request.build_absolute_uri(signed_url) if request else signed_url
        if instance.latest_gazette and instance.latest_gazette.name:
            signed_url = signed_media_url(instance.latest_gazette.name)
            ret['latest_gazette'] = request.build_absolute_uri(signed_url) if request else signed_url
        return ret


class CompanyDocumentSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    expiry_status = serializers.ReadOnlyField()
    days_until_expiry = serializers.ReadOnlyField()
    file_url = serializers.SerializerMethodField()
    issue_date = ShamsiDateField(required=False, allow_null=True)
    expiry_date = ShamsiDateField(required=False, allow_null=True)

    class Meta:
        model = CompanyDocument
        fields = [
            'id', 'company', 'company_name', 'document_type', 'document_type_display',
            'title', 'file', 'file_url', 'file_size', 'issue_date', 'expiry_date',
            'expiry_status', 'days_until_expiry', 'is_confidential', 'version', 'is_superseded',
            'description', 'uploaded_by', 'uploaded_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['file_size', 'uploaded_by', 'created_at', 'updated_at']

    def validate_file(self, value):
        return validate_uploaded_document(value)

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return None

    def get_file_url(self, obj):
        if obj.file and obj.file.name:
            request = self.context.get('request')
            signed_url = signed_media_url(obj.file.name)
            if request:
                return request.build_absolute_uri(signed_url)
            return signed_url
        return None



class CompanyBoardMemberSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    member_type_display = serializers.CharField(source='get_member_type_display', read_only=True)
    term_start = ShamsiDateField(required=False, allow_null=True)
    term_expiry = ShamsiDateField(required=False, allow_null=True)
    has_signature_right = serializers.BooleanField(default=False, required=False)
    is_active = serializers.BooleanField(default=True, required=False)
    attached_id_doc_url = serializers.SerializerMethodField()
    attached_appointment_doc_url = serializers.SerializerMethodField()

    class Meta:
        model = CompanyBoardMember
        fields = [
            'id', 'company', 'company_name', 'first_name', 'last_name',
            'national_code', 'member_type', 'member_type_display',
            'represented_legal_name', 'role', 'role_display',
            'has_signature_right', 'signature_scope',
            'term_start', 'term_expiry',
            'attached_id_doc', 'attached_appointment_doc',
            'attached_id_doc_url', 'attached_appointment_doc_url',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_attached_id_doc_url(self, obj):
        if obj.attached_id_doc and obj.attached_id_doc.name:
            request = self.context.get('request')
            signed_url = signed_media_url(obj.attached_id_doc.name)
            return request.build_absolute_uri(signed_url) if request else signed_url
        return None

    def get_attached_appointment_doc_url(self, obj):
        if obj.attached_appointment_doc and obj.attached_appointment_doc.name:
            request = self.context.get('request')
            signed_url = signed_media_url(obj.attached_appointment_doc.name)
            return request.build_absolute_uri(signed_url) if request else signed_url
        return None

    def validate_national_code(self, value):
        # رفتار پیش از طرح بازگردانده شد: رقم کنترلی فقط برای پرسنل خواسته شده بود (تسک ۲.۲)، نه اعضای هیئت‌مدیره
        if not value:
            raise serializers.ValidationError("کد ملی الزامی است.")
        val = normalize_digits(str(value)).strip()
        if not val.isdigit() or len(val) != 10:
            raise serializers.ValidationError("کد ملی باید دقیقاً ۱۰ رقم عددی باشد.")
        return val



class CompanyBankAccountSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = CompanyBankAccount
        fields = [
            'id', 'company', 'company_name', 'bank_name', 'account_number',
            'sheba_number', 'account_title', 'is_primary', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate_sheba_number(self, value):
        if not value:
            raise serializers.ValidationError("شماره شبا الزامی است.")
        clean = clean_sheba(value)
        is_valid, msg, _ = validate_sheba(clean)
        if not is_valid:
            raise serializers.ValidationError(msg or "شماره شبا نامعتبر است.")
        return clean


class UserCompanyAccessSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source='company.name', read_only=True)
    company_code = serializers.CharField(source='company.code', read_only=True)
    access_level_display = serializers.CharField(source='get_access_level_display', read_only=True)

    class Meta:
        model = UserCompanyAccess
        fields = '__all__'
        read_only_fields = ['created_at']

    def get_user_full_name(self, obj):
        if obj.user:
            return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
        return None


class FinancialProjectSerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all(), required=False, allow_null=True)
    company_name = serializers.CharField(source='company.name', read_only=True)
    company_code = serializers.CharField(source='company.code', read_only=True)
    sections_count = serializers.SerializerMethodField()

    class Meta:
        model = FinancialProject
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
        validators = []

    def validate(self, attrs):
        company = attrs.get('company') or getattr(self.instance, 'company', None)
        code = attrs.get('code') or getattr(self.instance, 'code', None)
        if code:
            qs = FinancialProject.objects.filter(code=code, company=company)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'code': 'پروژه‌ای با این کد برای این شرکت از قبل ثبت شده است.'})
        return attrs

    def get_sections_count(self, obj):
        if hasattr(obj, 'sections_count'):
            return obj.sections_count
        return obj.sections.count()


class ProjectSectionSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_code = serializers.CharField(source='project.code', read_only=True)
    company_id = serializers.IntegerField(source='project.company_id', read_only=True)

    class Meta:
        model = ProjectSection
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class UserSectionAssignmentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    section_name = serializers.CharField(source='section.name', read_only=True)
    section_code = serializers.CharField(source='section.code', read_only=True)
    project_id = serializers.IntegerField(source='section.project.id', read_only=True)
    project_name = serializers.CharField(source='section.project.name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = UserSectionAssignment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_user_full_name(self, obj):
        if obj.user:
            return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
        return None


class CounterpartySerializer(serializers.ModelSerializer):
    counterparty_type_display = serializers.CharField(source='get_counterparty_type_display', read_only=True)
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = Counterparty
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def validate_national_id(self, value):
        if not value:
            return value
        cleaned = normalize_digits(str(value)).strip()
        if cleaned and not cleaned.isdigit():
            raise serializers.ValidationError("شناسه/کد ملی باید فقط شامل ارقام عددی باشد.")
        if cleaned and (len(cleaned) < 10 or len(cleaned) > 11):
            raise serializers.ValidationError("کد ملی اشخاص حقیقی ۱۰ رقم و شناسه ملی اشخاص حقوقی ۱۱ رقم است.")
        return cleaned

    def validate_phone(self, value):
        if not value:
            return value
        cleaned = normalize_digits(str(value)).strip()
        return cleaned

    def validate_sheba_number(self, value):
        if not value:
            return ""
        cleaned = normalize_digits(str(value)).upper().replace("IR", "").strip()
        if not cleaned:
            return ""
        if len(cleaned) != 24:
            raise serializers.ValidationError("ارقام شماره شبا باید دقیقاً ۲۴ رقم (بدون احتساب IR) باشد.")
        is_valid, err_msg, _ = validate_sheba("IR" + cleaned)
        if not is_valid:
            raise serializers.ValidationError(err_msg or "ساختار شماره شبا نامعتبر است (خطای الگوریتم Mod 97).")
        return cleaned


class ExpenseInvoiceSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    project_id = serializers.IntegerField(source='section.project.id', read_only=True)
    project_name = serializers.CharField(source='section.project.name', read_only=True)
    counterparty_name = serializers.CharField(source='counterparty.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    paid_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseInvoice
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_paid_by_name(self, obj):
        if obj.paid_by:
            return f"{obj.paid_by.first_name} {obj.paid_by.last_name}".strip() or obj.paid_by.username
        return None


class PettyCashAccountSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    project_id = serializers.IntegerField(source='section.project.id', read_only=True)
    project_name = serializers.CharField(source='section.project.name', read_only=True)
    custodian_name = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashAccount
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_custodian_name(self, obj):
        if obj.custodian:
            return f"{obj.custodian.first_name} {obj.custodian.last_name}".strip() or obj.custodian.username
        return None


class PettyCashTransactionSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    project_id = serializers.IntegerField(source='section.project.id', read_only=True)
    project_name = serializers.CharField(source='section.project.name', read_only=True)
    custodian_name = serializers.SerializerMethodField()
    counterparty_name = serializers.CharField(source='counterparty.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashTransaction
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by']

    def get_custodian_name(self, obj):
        if obj.custodian:
            return f"{obj.custodian.first_name} {obj.custodian.last_name}".strip() or obj.custodian.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None


class CompanyFiscalPeriodSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    closed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CompanyFiscalPeriod
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'closed_at', 'closed_by']

    def get_closed_by_name(self, obj):
        if obj.closed_by:
            return f"{obj.closed_by.first_name} {obj.closed_by.last_name}".strip() or obj.closed_by.username
        return None


class WorkflowAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    created_at_shamsi = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowAuditLog
        fields = '__all__'

    def get_actor_name(self, obj):
        if obj.actor:
            return f"{obj.actor.first_name} {obj.actor.last_name}".strip() or obj.actor.username
        return "سیستم"

    def get_created_at_shamsi(self, obj):
        if obj.created_at:
            from common.date_utils import format_to_shamsi_str
            return format_to_shamsi_str(obj.created_at)
        return ""

    SNAPSHOT_SUMMARY_KEYS = (
        'id', 'full_name', 'driver_name', 'plate_number', 'vehicle_type',
        'approval_status', 'company_id', 'section_id', 'reason', 'purged_by', 'deleted_by_username'
    )

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        if request is None:
            return ret
        from .lifecycle_services import WAGE_FIELDS, user_can_view_wages
        from .fleet_lifecycle_services import FLEET_RATE_FIELDS, FLEET_FINANCE_STAGE_PERMS, FLEET_MANAGER_STAGE_PERMS, user_has_any_perm
        user = getattr(request, 'user', None)
        can_view_financials = user_can_view_wages(user) or user_has_any_perm(user, FLEET_FINANCE_STAGE_PERMS + FLEET_MANAGER_STAGE_PERMS)
        if can_view_financials:
            return ret
        # DEF-19/DEF-21/SoD: نقش غیرمالی عکس کامل حذف (شبا و دستمزد/نرخ خودرو) و تغییرات مالی را در تایملاین نمی‌بیند
        sensitive_fields = set(WAGE_FIELDS) | set(FLEET_RATE_FIELDS)
        metadata = dict(ret.get('metadata') or {})
        snapshot = metadata.get('snapshot')
        if isinstance(snapshot, dict):
            metadata['snapshot'] = {k: snapshot[k] for k in self.SNAPSHOT_SUMMARY_KEYS if k in snapshot}
        for key in ('diff', 'old_diff'):
            if isinstance(metadata.get(key), dict):
                metadata[key] = {k: v for k, v in metadata[key].items() if k not in sensitive_fields}
        ret['metadata'] = metadata
        return ret



