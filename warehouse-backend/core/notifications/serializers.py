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


class DeviceTokenRegisterSerializer(serializers.Serializer):
    token = serializers.CharField(
        max_length=512,
        required=True,
        allow_blank=False,
        trim_whitespace=True,
        error_messages={
            'required': 'توکن دستگاه الزامی است.',
            'blank': 'توکن دستگاه نمی‌تواند خالی باشد.',
            'max_length': 'طول توکن دستگاه نمی‌تواند بیشتر از ۵۱۲ کاراکتر باشد.',
        }
    )
    platform = serializers.ChoiceField(
        choices=['android', 'ios'],
        default='android',
        error_messages={
            'invalid_choice': 'پلتفرم باید android یا ios باشد.',
        }
    )
    app_version = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        default='',
        trim_whitespace=True,
        error_messages={
            'max_length': 'نسخه برنامه نمی‌تواند بیشتر از ۵۰ کاراکتر باشد.',
        }
    )
