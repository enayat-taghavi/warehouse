from decimal import Decimal
from rest_framework import serializers
from common.date_utils import normalize_digits, parse_date_smart, format_to_shamsi_str
from common.media_urls import signed_media_url
from common.serializer_fields import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_SIZE_BYTES,
    validate_uploaded_document,
    ShamsiDateField,
)
from ..sheba_utils import validate_sheba
from .helpers import normalize_iranian_phone
from ..models import (
    Counterparty,
    ExpenseInvoice,
    PettyCashAccount,
    PettyCashTransaction,
    WorkflowAuditLog,
)

def _section_company_id(section):
    project = getattr(section, 'project', None) if section is not None else None
    return getattr(project, 'company_id', None)


def validate_counterparty_company(serializer, attrs):
    """
    اصلاح ۲.۲: طرف‌حساب فاکتور/تنخواه باید سراسری (بی‌شرکت) یا از شرکت همان بخش باشد؛
    وگرنه ردیف شرکت دیگری ارجاع و نامش در پاسخ نمایش داده می‌شود.
    """
    if 'counterparty' not in attrs and 'section' not in attrs:
        return
    instance = getattr(serializer, 'instance', None)
    section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
    counterparty = attrs['counterparty'] if 'counterparty' in attrs else getattr(instance, 'counterparty', None)
    if counterparty is None or section is None or counterparty.company_id is None:
        return
    if counterparty.company_id != _section_company_id(section):
        raise serializers.ValidationError({'counterparty': "طرف‌حساب انتخاب‌شده متعلق به شرکت این بخش نیست."})


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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validate_counterparty_company(self, attrs)
        return attrs

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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validate_counterparty_company(self, attrs)
        # حساب تنخواه باید از همان بخش سند باشد (نه حساب بخش یا شرکت دیگر)
        if 'account' in attrs or 'section' in attrs:
            instance = getattr(self, 'instance', None)
            account = attrs['account'] if 'account' in attrs else getattr(instance, 'account', None)
            section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
            if account is not None and section is not None and account.section_id != section.pk:
                raise serializers.ValidationError({'account': "حساب تنخواه انتخاب‌شده متعلق به بخش این سند نیست."})
        return attrs

    def get_custodian_name(self, obj):
        if obj.custodian:
            return f"{obj.custodian.first_name} {obj.custodian.last_name}".strip() or obj.custodian.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
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
        from ..lifecycle_services import WAGE_FIELDS, user_can_view_wages
        from ..fleet_lifecycle_services import FLEET_RATE_FIELDS, FLEET_FINANCE_STAGE_PERMS, FLEET_MANAGER_STAGE_PERMS, user_has_any_perm
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
