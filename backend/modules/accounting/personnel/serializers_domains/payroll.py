from decimal import Decimal
from rest_framework import serializers
from ..models import (
    PayrollYearlySettings,
    JobGradeTier,
    WorkshopInsuranceSettings,
    TaxRuleSettings,
    BankExportSettings,
    MonthlyPayrollRecord,
)

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
