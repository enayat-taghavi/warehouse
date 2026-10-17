from rest_framework import serializers
from .models import Notification, DeviceToken


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'title', 'message', 'notification_type',
            'target_model', 'target_id', 'is_read', 'created_at'
        ]
        read_only_fields = ['id', 'title', 'message', 'notification_type', 'target_model', 'target_id', 'created_at']


class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = [
            'id', 'token', 'platform', 'app_version', 'created_at', 'last_seen_at'
        ]
        read_only_fields = ['id', 'created_at', 'last_seen_at']
