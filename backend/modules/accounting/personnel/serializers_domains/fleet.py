import re
from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from common.date_utils import normalize_digits, parse_date_smart, format_to_shamsi_str
from common.media_urls import signed_file_url, signed_media_url
from common.serializer_fields import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_SIZE_BYTES,
    validate_uploaded_document,
    ShamsiDateField,
)
from ..sheba_utils import validate_sheba, clean_sheba, get_bank_from_sheba
from .helpers import (
    ROAD_VEHICLE_TYPES,
    FLEET_RATE_FIELDS,
    normalize_iranian_phone,
    normalize_plate,
    user_can_view_fleet_rates,
)
from ..models import (
    VehicleDriverProfile,
    VehicleBankAccount,
    VehicleDocument,
    VehicleChangeRequest,
)


def _vehicle_full_view(serializer, vehicle) -> bool:
    """د۸ طرح ۴.۶: قاعدهٔ can_view_vehicle_sensitive با cache درخواست؛ بی request پوشیده (فراموشی context نشت نمی‌دهد)."""
    request = serializer.context.get('request')
    user = getattr(request, 'user', None) if request is not None else None
    if user is None:
        return False
    from ..fleet_lifecycle_services import can_view_vehicle_sensitive
    cache = serializer.context.setdefault('_vehicle_sensitive_cache', {})
    return can_view_vehicle_sensitive(user, vehicle, cache)


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

    def to_internal_value(self, data):
        # د۸: مقدار ستاره‌دار برگشتی بی‌صدا کنار می‌رود (مقدار قبلی می‌ماند؛ بی 400 تا صف آفلاین پاک نشود)
        from ..lifecycle_services import strip_masked_values
        from ..fleet_lifecycle_services import VEHICLE_BANK_SENSITIVE_FIELDS
        return super().to_internal_value(strip_masked_values(data, VEHICLE_BANK_SENSITIVE_FIELDS))

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        vehicle = getattr(instance, 'vehicle', None)
        if vehicle is not None and not _vehicle_full_view(self, vehicle):
            from ..fleet_lifecycle_services import VEHICLE_BANK_SENSITIVE_FIELDS, mask_vehicle_mapping
            ret = mask_vehicle_mapping(ret, VEHICLE_BANK_SENSITIVE_FIELDS)
        return ret

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

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # vehicle_docs/ محافظت‌شده است (ص۶ طرح ۲.۶): همان کلید `file` با پیوند امضاشده
        ret['file'] = signed_file_url(instance.file, self.context.get('request'))
        return ret

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return None

    def validate_issue_date(self, value):
        if not value or not str(value).strip():
            return value
        from ..lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_expiry_date(self, value):
        if not value or not str(value).strip():
            return value
        from ..lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

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
        from ..fleet_lifecycle_services import get_vehicle_missing_fields
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
            from ..fleet_lifecycle_services import is_valid_national_plate
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
        from ..lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_inspection_expiry_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('inspection_expiry_date', value):
            return value
        from ..lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_license_expiry_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('license_expiry_date', value):
            return value
        from ..lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_valid_until_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('valid_until_date', value):
            return value
        from ..lifecycle_services import normalize_shamsi_date
        return normalize_shamsi_date(value)

    def validate_end_date(self, value):
        if not value or not str(value).strip() or self._is_unchanged_stored_value('end_date', value):
            return value
        from ..lifecycle_services import normalize_shamsi_date
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

    def to_internal_value(self, data):
        # د۸: مقدار ستاره‌دار برگشتی بی‌صدا کنار می‌رود (مقدار قبلی می‌ماند؛ بی 400 تا صف آفلاین پاک نشود)
        from ..lifecycle_services import strip_masked_values
        from ..fleet_lifecycle_services import VEHICLE_SENSITIVE_FIELDS
        return super().to_internal_value(strip_masked_values(data, VEHICLE_SENSITIVE_FIELDS))

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if self._request_user_hides_rates():
            for rate_field in FLEET_RATE_FIELDS:
                ret.pop(rate_field, None)
        if not _vehicle_full_view(self, instance):
            # د۸: کد ملی و حساب پوشیده؛ diff درخواست تغییر باز هم پوشیده؛ مدرک‌ها فقط برای بارگذارنده
            from ..fleet_lifecycle_services import VEHICLE_SENSITIVE_FIELDS, mask_vehicle_mapping
            ret = mask_vehicle_mapping(ret, VEHICLE_SENSITIVE_FIELDS)
            pending = ret.get('pending_change_request')
            if isinstance(pending, dict):
                pending = dict(pending)
                pending['proposed_changes'] = mask_vehicle_mapping(pending.get('proposed_changes'))
                pending['previous_values'] = mask_vehicle_mapping(pending.get('previous_values'))
                ret['pending_change_request'] = pending
            if 'documents' in ret:
                request = self.context.get('request')
                uid = getattr(getattr(request, 'user', None), 'id', None)
                ret['documents'] = [d for d in (ret.get('documents') or []) if uid and d.get('uploaded_by') == uid]
        return ret

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

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not _vehicle_full_view(self, instance.vehicle):
            # د۸: همان کلیدهای حساس در diff درخواست تغییر پوشیده‌اند
            from ..fleet_lifecycle_services import mask_vehicle_mapping
            ret['proposed_changes'] = mask_vehicle_mapping(ret.get('proposed_changes'))
            ret['previous_values'] = mask_vehicle_mapping(ret.get('previous_values'))
        return ret

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
