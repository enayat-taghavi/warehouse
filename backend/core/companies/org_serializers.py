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
    # هر پروژه شرکت دارد (طرح ۲.۱، ت۲)؛ پروژهٔ سراسری ساخته نمی‌شود
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all())
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


TARGET_FIELDS = ('company', 'project', 'section')
SINGLE_TARGET_MESSAGE = "انتساب باید دقیقاً یکی از «شرکت»، «پروژه» یا «بخش» را هدف بگیرد."
DUPLICATE_ASSIGNMENT_MESSAGE = "این کاربر همین نقش را در همین شرکت، پروژه یا بخش از قبل دارد."


def assignment_target_company_id(field, obj):
    """شرکتِ هدف انتساب: خود شرکت، شرکت پروژه، یا شرکت پروژهٔ بخش."""
    if obj is None:
        return None
    if field == 'company':
        return obj.id
    if field == 'project':
        return obj.company_id
    return obj.project.company_id


class SectionAssignmentSerializer(serializers.ModelSerializer):
    """
    انتساب در سه سطح (طرح ۲.۱، ت۳): دقیقاً یکی از company، project یا section. پاسخ قبلی (section_name،
    project_id و …) برای انتساب بخش همان است؛ level و target_company_id برای هر سه سطح می‌آید.
    """
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all(), required=False, allow_null=True)
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all(), required=False, allow_null=True)
    section = serializers.PrimaryKeyRelatedField(
        queryset=ProjectSection.objects.select_related('project'), required=False, allow_null=True
    )
    username = serializers.CharField(source='user.username', read_only=True)
    user_full_name = serializers.SerializerMethodField()
    level = serializers.CharField(read_only=True)
    target_company_id = serializers.IntegerField(read_only=True)
    company_name = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()
    section_code = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = SectionAssignment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
        # یکتایی شرطی سه سطح را validate خودش می‌سنجد
        validators = []

    def get_user_full_name(self, obj):
        if obj.user:
            return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username
        return None

    def get_company_name(self, obj):
        if obj.company_id:
            return obj.company.name
        project = obj.target_project
        return project.company.name if project is not None else None

    def get_section_name(self, obj):
        return obj.section.name if obj.section_id else None

    def get_section_code(self, obj):
        return obj.section.code if obj.section_id else None

    def get_project_id(self, obj):
        project = obj.target_project
        return project.id if project is not None else None

    def get_project_name(self, obj):
        project = obj.target_project
        return project.name if project is not None else None

    def validate_role(self, value):
        return validate_section_role(value)

    def validate(self, attrs):
        field, target = final_assignment_target(attrs, self.instance)
        if field is None:
            raise serializers.ValidationError({'target': SINGLE_TARGET_MESSAGE})
        user = attrs.get('user', getattr(self.instance, 'user', None))
        role = attrs.get('role', getattr(self.instance, 'role', None) or 'employee')
        if 'role' not in attrs and self.instance is None:
            # نقش پیش‌فرض مدل هم باید یکی از نقش‌های اعلام‌شده باشد
            validate_section_role(role)
        if user is not None:
            dup = SectionAssignment.objects.filter(user=user, role=role, **{field: target})
            if self.instance is not None:
                dup = dup.exclude(pk=self.instance.pk)
            if dup.exists():
                raise serializers.ValidationError({'target': DUPLICATE_ASSIGNMENT_MESSAGE})
        return attrs


def final_assignment_target(attrs, instance=None):
    """(نام فیلد هدف، شیء هدف) پس از اعمال attrs روی instance؛ (None, None) اگر دقیقاً یک هدف نباشد."""
    targets = {f: attrs[f] if f in attrs else getattr(instance, f, None) for f in TARGET_FIELDS}
    given = [f for f, v in targets.items() if v is not None]
    if len(given) != 1:
        return None, None
    return given[0], targets[given[0]]
