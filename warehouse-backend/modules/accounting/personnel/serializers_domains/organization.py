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
    FinancialProject,
    ProjectSection,
    UserSectionAssignment,
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
