from rest_framework import serializers
from companies.serializers import (
    CompanySerializer as CoreCompanySerializer,
    UserCompanyAccessSerializer,
)
from common.serializer_fields import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_SIZE_BYTES,
    validate_uploaded_document,
    ShamsiDateField,
)
from common.date_utils import normalize_digits, parse_date_smart, format_to_shamsi_str
from common.media_urls import signed_media_url
from ..sheba_utils import validate_sheba, clean_sheba, get_bank_from_sheba
from .helpers import normalize_iranian_phone
from ..models import (
    Company,
    CompanyDocument,
    CompanyBankAccount,
    CompanyBoardMember,
    CompanyFiscalPeriod,
    CompanyPayrollProfile,
)

class CompanySerializer(CoreCompanySerializer):
    """
    سریالایزر شرکت در حسابداری: سریالایزر پایهٔ هسته به‌علاوهٔ شمار پروژه‌ها و مدارک،
    سلامت مدارک، حساب‌های بانکی و اعضای هیئت‌مدیره.
    """
    projects_count = serializers.SerializerMethodField()
    documents_count = serializers.SerializerMethodField()
    documents_health_status = serializers.SerializerMethodField()
    bank_accounts = serializers.SerializerMethodField()
    board_members = serializers.SerializerMethodField()

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

class CompanyPayrollProfileSerializer(serializers.ModelSerializer):
    """پروندهٔ بیمه و مالیات شرکت (ت۵ طرح ۲.۱)؛ شرکت از نشانی API می‌آید و تغییر نمی‌کند."""
    DIGIT_FIELDS = ('workshop_code', 'social_security_branch_code', 'contract_row', 'tax_memory_id', 'tax_economic_code')

    class Meta:
        model = CompanyPayrollProfile
        fields = ['company', *CompanyPayrollProfile.FIELDS, 'updated_at']
        read_only_fields = ['company', 'updated_at']

    @classmethod
    def visible_data(cls, data, visible):
        """
        ت۱۲ طرح ۲.۲: شناسه‌های بیمه و مالیات فقط برای سطح «خواندن» حوزهٔ insurance_tax (ابرکاربر همیشه).
        عضو بی‌سطح همان شکل پاسخ را با مقدار null همهٔ FIELDS می‌گیرد؛ identifiers_visible به فرانت می‌گوید چرا خالی است.
        """
        data = dict(data)
        if not visible:
            for field in CompanyPayrollProfile.FIELDS:
                data[field] = None
        data['identifiers_visible'] = bool(visible)
        return data

    def validate(self, attrs):
        # ارقام فارسی و عربی کدها به لاتین؛ فاصله‌های دو سر همهٔ فیلدها حذف می‌شود
        for field, value in list(attrs.items()):
            if isinstance(value, str):
                value = value.strip()
                if field in self.DIGIT_FIELDS:
                    value = normalize_digits(value)
                attrs[field] = value or None
        return attrs


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
        validators = []

    def validate_sheba_number(self, value):
        if not value:
            raise serializers.ValidationError("شماره شبا الزامی است.")
        clean = clean_sheba(value)
        is_valid, msg, _ = validate_sheba(clean)
        if not is_valid:
            raise serializers.ValidationError(msg or "شماره شبا نامعتبر است.")
        return clean

    def validate(self, attrs):
        # یکتایی شبا در هر شرکت (F2) با پیام فارسی، پیش از قید پایگاه داده
        company = attrs.get('company') or getattr(self.instance, 'company', None)
        sheba = attrs.get('sheba_number') or getattr(self.instance, 'sheba_number', None)
        if company and sheba:
            dup = CompanyBankAccount.objects.filter(company=company, sheba_number__iexact=sheba.strip())
            if self.instance is not None:
                dup = dup.exclude(pk=self.instance.pk)
            if dup.exists():
                raise serializers.ValidationError({'sheba_number': "این شماره شبا قبلاً برای همین شرکت ثبت شده است."})
        return attrs

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
