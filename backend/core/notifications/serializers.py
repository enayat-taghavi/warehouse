from rest_framework import serializers
from .models import Notification, DeviceToken


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'title', 'message', 'notification_type',
            'target_model', 'target_id', 'url', 'is_read', 'created_at'
        ]
        read_only_fields = ['id', 'title', 'message', 'notification_type', 'target_model', 'target_id', 'url',
                            'created_at']


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


class WebPushKeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField(max_length=200, trim_whitespace=True, error_messages={
        'required': 'کلید p256dh الزامی است.',
        'blank': 'کلید p256dh نمی‌تواند خالی باشد.',
        'max_length': 'کلید p256dh بیش از اندازه بلند است.',
    })
    auth = serializers.CharField(max_length=100, trim_whitespace=True, error_messages={
        'required': 'کلید auth الزامی است.',
        'blank': 'کلید auth نمی‌تواند خالی باشد.',
        'max_length': 'کلید auth بیش از اندازه بلند است.',
    })


class WebPushSubscriptionRegisterSerializer(serializers.Serializer):
    endpoint = serializers.CharField(max_length=2048, trim_whitespace=True, error_messages={
        'required': 'نشانی اشتراک الزامی است.',
        'blank': 'نشانی اشتراک نمی‌تواند خالی باشد.',
        'max_length': 'نشانی اشتراک بیش از اندازه بلند است.',
    })
    keys = WebPushKeysSerializer(error_messages={'required': 'کلیدهای اشتراک الزامی است.'})

    def validate_endpoint(self, value):
        from .webpush import validate_endpoint
        if not validate_endpoint(value):
            raise serializers.ValidationError('نشانی اشتراک معتبر نیست یا سرویس پوش آن پشتیبانی نمی‌شود.')
        return value

    def validate_keys(self, value):
        from .webpush import validate_keys
        if not validate_keys(value.get('p256dh'), value.get('auth')):
            raise serializers.ValidationError('کلیدهای اشتراک معتبر نیستند.')
        return value
