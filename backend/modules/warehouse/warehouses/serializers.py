from rest_framework import serializers
from .models import Warehouse
from settings_core.models import SystemSetting

class WarehouseSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(read_only=False, required=False, allow_null=True)
    total_quantity = serializers.SerializerMethodField()
    counted_quantity = serializers.SerializerMethodField()
    percent = serializers.SerializerMethodField()

    class Meta:
        model = Warehouse
        fields = '__all__'

    def get_total_quantity(self, obj):
        if hasattr(obj, 'annotated_total_quantity'):
            return obj.annotated_total_quantity
        return obj.items.count()

    def get_counted_quantity(self, obj):
        if hasattr(obj, 'annotated_counted_quantity'):
            return obj.annotated_counted_quantity
        return obj.items.exclude(field_status__in=['waiting', 'counting', 'در انتظار شمارش']).count()

    def get_percent(self, obj):
        total = self.get_total_quantity(obj)
        if total == 0:
            return 0
        return int((self.get_counted_quantity(obj) / total) * 100)

class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = '__all__'
