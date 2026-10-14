"""
سریالایزرهای گزارش‌ساز
"""
from rest_framework import serializers

from .models import ReportExportJob, ReportTemplate
from .registry import get_registry


class ReportTemplateSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    is_owner = serializers.SerializerMethodField()
    warehouse = serializers.IntegerField(source='warehouse_id', required=False, allow_null=True)

    class Meta:
        model = ReportTemplate
        fields = [
            'id', 'name', 'description', 'entity', 'spec', 'is_public',
            'warehouse', 'owner', 'owner_username', 'is_owner',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['owner', 'created_at', 'updated_at']

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return bool(request and request.user and obj.owner_id == request.user.id)

    def validate_warehouse(self, value):
        if value is None:
            return value
        from django.apps import apps
        if not apps.is_installed('warehouses'):
            raise serializers.ValidationError('سامانهٔ انبار نصب نیست.')
        if not apps.get_model('warehouses', 'Warehouse').objects.filter(pk=value).exists():
            raise serializers.ValidationError('انبار نامعتبر است.')
        return value

    def validate_entity(self, value):
        if value not in get_registry():
            raise serializers.ValidationError(f'موجودیت نامعتبر: {value}')
        return value

    def validate_spec(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('تعریف گزارش باید آبجکت JSON باشد.')
        return value

    def validate(self, attrs):
        # entity داخل spec باید با فیلد entity قالب یکی باشد (منبع حقیقت واحد)
        spec = attrs.get('spec', getattr(self.instance, 'spec', {}) or {})
        entity = attrs.get('entity', getattr(self.instance, 'entity', None))
        if spec.get('entity') and entity and spec['entity'] != entity:
            raise serializers.ValidationError(
                {'spec': 'موجودیت spec با موجودیت قالب هم‌خوانی ندارد.'}
            )
        return attrs


class ReportExportJobSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ReportExportJob
        fields = [
            'id', 'report_name', 'status', 'status_display', 'progress',
            'total_rows', 'error_message', 'created_at', 'finished_at',
        ]
        read_only_fields = fields
