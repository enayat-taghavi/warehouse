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
        return mask_company_fields(ret, instance, request)


# فیلدهایی که هر دارندهٔ پیوند می‌بیند (فهرست و سربرگ استودیو)
COMPANY_PUBLIC_FIELDS = {'id', 'code', 'name', 'company_type', 'is_active', 'logo', 'has_warehouse_module'}


def mask_company_fields(ret, instance, request):
    """
    کاربرِ غیرعضوِ غیرsuperuser (حالت محدود) فقط فیلدهای بخش‌هایی را می‌بیند که دست‌کم «خواندن» دارد
    (یافتهٔ tenant-scope-reviewer گام ۸). عضو و superuser بدون تغییر.
    """
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated or user.is_superuser:
        return ret
    from .access import get_user_allowed_companies, user_section_levels
    from .permission_sections import field_sections
    if get_user_allowed_companies(user).filter(id=instance.id).exists():
        return ret
    levels = user_section_levels(user).get(instance.id, {})
    mapping = field_sections()
    return {
        k: v for k, v in ret.items()
        if k in COMPANY_PUBLIC_FIELDS or levels.get(mapping.get(k), 'none') in ('read', 'write')
    }


class UserCompanyAccessSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source='company.name', read_only=True)
    company_code = serializers.CharField(source='company.code', read_only=True)

    class Meta:
        model = UserCompanyAccess
        fields = '__all__'
        read_only_fields = ['created_at']

    def to_internal_value(self, data):
        # رکورد کهنهٔ صف آفلاین که فقط access_level دارد بی‌صدا پذیرفته نمی‌شود (۲۰۰ بی‌اثر آن را گم می‌کرد):
        # ردِ صریح، تا کاربر سطح بخش‌ها را در تب «دسترسی» دوباره تعیین کند
        if hasattr(data, 'get') and data.get('access_level') not in (None, '', 'link') and 'section_levels' not in data:
            raise serializers.ValidationError({
                'access_level': 'سطح دسترسی قدیمی دیگر پذیرفته نمی‌شود؛ سطح بخش‌ها را در تب «دسترسی» شرکت تعیین کنید.'
            })
        return super().to_internal_value(data)

    def validate_section_levels(self, value):
        from .permission_sections import normalize_levels
        if not isinstance(value, dict):
            raise serializers.ValidationError("سطح بخش‌ها باید به‌صورت {بخش: سطح} باشد.")
        return normalize_levels(value)

    def to_representation(self, instance):
        from .access import _row_levels
        ret = super().to_representation(instance)
        ret['section_levels'] = _row_levels(instance)
        return ret

    def get_user_full_name(self, obj):
        if obj.user:
            return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
        return None
