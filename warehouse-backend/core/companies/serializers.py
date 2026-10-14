from rest_framework import serializers

from common.date_utils import normalize_digits
from common.media_urls import signed_media_url
from common.serializer_fields import ShamsiDateField, validate_uploaded_document

from .models import Company, UserCompanyAccess


class CompanySerializer(serializers.ModelSerializer):
    """
    سریالایزر پایهٔ شرکت در هسته. ماژول حسابداری آن را با شمار پروژه‌ها، سلامت مدارک،
    حساب‌های بانکی و اعضای هیئت‌مدیره گسترش می‌دهد (personnel.serializers.CompanySerializer).
    """
    registration_date = ShamsiDateField(required=False, allow_null=True)
    board_term_expiry = ShamsiDateField(required=False, allow_null=True)

    class Meta:
        model = Company
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

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
