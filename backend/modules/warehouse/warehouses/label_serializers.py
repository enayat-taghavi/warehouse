from rest_framework import serializers
from .models import LabelTemplate


class LabelTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabelTemplate
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
