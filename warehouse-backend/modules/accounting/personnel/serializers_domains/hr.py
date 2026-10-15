import os
import re
from rest_framework import serializers
from django.db import transaction
from common.date_utils import normalize_digits, parse_date_smart, format_to_shamsi_str
from common.media_urls import signed_media_url
from common.serializer_fields import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_SIZE_BYTES,
    validate_uploaded_document,
    ShamsiDateField,
)
from ..sheba_utils import validate_sheba, clean_sheba, get_bank_from_sheba
from .helpers import normalize_iranian_phone
from ..models import (
    PersonnelProfile,
    PersonnelBankAccount,
    PersonnelDocument,
    PersonnelChangeRequest,
    InsuranceJobTitle,
)

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
        from ..lifecycle_services import get_missing_fields
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
        from ..lifecycle_services import normalize_shamsi_date
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
        from ..lifecycle_services import user_can_view_wages
        return not user_can_view_wages(getattr(request, 'user', None))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self._request_user_hides_wages():
            # حذف بی‌صدا، نه رد: فرم قدیمی هنوز daily_base_wage=0 می‌فرستد و ۴xx رکورد صف آفلاین را پاک می‌کند
            from ..lifecycle_services import WAGE_FIELDS
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
            from ..lifecycle_services import WAGE_FIELDS
            for wage_field in WAGE_FIELDS:
                ret.pop(wage_field, None)
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
