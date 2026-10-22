"""
سریالایزرهای پروژه، بخش و انتساب کاربر به بخش در هسته (طرح Project_Section_To_Core، گام ۲).
شکل پاسخ همان شکل قبلی /api/personnel/ است تا فرانت فقط مسیر را عوض کند.
"""
from rest_framework import serializers

from .models import Company, Project, ProjectSection, SectionAssignment, section_role_choices

NO_SECTION_ROLES_MESSAGE = "هیچ ماژول نصب‌شده‌ای نقش انتساب به بخش اعلام نکرده است؛ در این نصب انتساب کاربر به بخش ممکن نیست."


def validate_section_role(value):
    """نقش باید یکی از نقش‌های اعلام‌شدهٔ ماژول‌ها باشد؛ بی هیچ نقش اعلام‌شده، انتساب رد می‌شود."""
    roles = dict(section_role_choices())
    if not roles:
        raise serializers.ValidationError(NO_SECTION_ROLES_MESSAGE)
    if value not in roles:
        raise serializers.ValidationError(f"نقش انتخاب‌شده معتبر نیست. نقش‌های مجاز: {', '.join(roles)}")
    return value


class ProjectSerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all(), required=False, allow_null=True)
    company_name = serializers.CharField(source='company.name', read_only=True)
    company_code = serializers.CharField(source='company.code', read_only=True)
    sections_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
        validators = []

    def validate(self, attrs):
        company = attrs['company'] if 'company' in attrs else getattr(self.instance, 'company', None)
        code = attrs.get('code') or getattr(self.instance, 'code', None)
        if code:
            qs = Project.objects.filter(code=code, company=company)
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


class SectionAssignmentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    section_name = serializers.CharField(source='section.name', read_only=True)
    section_code = serializers.CharField(source='section.code', read_only=True)
    project_id = serializers.IntegerField(source='section.project.id', read_only=True)
    project_name = serializers.CharField(source='section.project.name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = SectionAssignment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_user_full_name(self, obj):
        if obj.user:
            return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
        return None

    def validate_role(self, value):
        return validate_section_role(value)
