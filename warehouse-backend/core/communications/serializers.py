from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from common.media_urls import signed_media_url
from .models import Conversation, ConversationParticipant, Message, MessageAttachment, GenericComment, ConversationType

User = get_user_model()

ALLOWED_COMMENT_MODELS = {'item', 'counttask', 'doctask', 'warehouse', 'document', 'financialdocument'}


class UserShortSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'full_name']

    def get_full_name(self, obj):
        name = f"{obj.first_name or ''} {obj.last_name or ''}".strip()
        return name if name else obj.username


class MessageAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = ['id', 'file', 'file_name', 'file_size', 'content_type', 'thumbnail', 'file_url', 'created_at']

    def get_file_url(self, obj):
        if obj.file:
            signed_url = signed_media_url(obj.file.name)
            request = self.context.get('request')
            if request and signed_url:
                return request.build_absolute_uri(signed_url)
            return signed_url
        return None


class MessageSerializer(serializers.ModelSerializer):
    sender_details = UserShortSerializer(source='sender', read_only=True)
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    client_temp_id = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    text = serializers.CharField(max_length=4000, required=False, allow_blank=True, allow_null=True)
    is_me = serializers.SerializerMethodField()
    read_by_count = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'client_temp_id', 'conversation', 'sender', 'sender_details',
            'text', 'reply_to', 'is_system', 'created_at', 'updated_at',
            'attachments', 'is_me', 'read_by_count'
        ]
        read_only_fields = ['id', 'sender', 'sender_details', 'created_at', 'updated_at', 'is_system']

    def get_is_me(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.sender_id == request.user.id
        return False

    def get_read_by_count(self, obj):
        if hasattr(obj, 'annotated_read_by_count'):
            return obj.annotated_read_by_count
        return obj.read_by.count()

    def update(self, instance, validated_data):
        # فیلدهای ساختاری مانند conversation، client_temp_id و sender نباید با ویرایش تغییر کنند
        validated_data.pop('conversation', None)
        validated_data.pop('client_temp_id', None)
        validated_data.pop('sender', None)
        return super().update(instance, validated_data)


class ConversationSerializer(serializers.ModelSerializer):
    participants = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    participants_details = UserShortSerializer(source='participants', many=True, read_only=True)
    target_user_id = serializers.IntegerField(write_only=True, required=False)
    # پس از فاز ۴، `warehouse` دیگر FK نیست؛ فیلد API را به `warehouse_id` ساده مپ می‌کنیم
    # تا عین قراردادِ قبلی (عدد شناسهٔ انبار، قابل خواندن و نوشتن) حفظ شود.
    warehouse = serializers.IntegerField(source='warehouse_id', required=False, allow_null=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'title', 'conv_type', 'warehouse', 'participants', 'target_user_id',
            'participants_details', 'is_active', 'created_at', 'updated_at',
            'last_message', 'unread_count'
        ]
        read_only_fields = ['id', 'participants', 'created_at', 'updated_at']

    def create(self, validated_data):
        target_user_id = validated_data.pop('target_user_id', None)
        conv_type = validated_data.get('conv_type', ConversationType.DIRECT)
        request = self.context.get('request')

        # در گفتگوی دونفره، اگر قبلاً چنین گفتگویی وجود دارد همان را برمی‌گردانیم
        if conv_type == ConversationType.DIRECT and target_user_id and request and request.user.is_authenticated:
            existing = Conversation.objects.filter(
                conv_type=ConversationType.DIRECT,
                participants=request.user
            ).filter(
                participants__id=target_user_id
            ).first()
            if existing:
                return existing

        conv = super().create(validated_data)
        if request and request.user.is_authenticated:
            conv.participants.add(request.user)
        if target_user_id:
            try:
                target_user = User.objects.get(id=target_user_id)
                conv.participants.add(target_user)
            except User.DoesNotExist:
                pass
        return conv

    def update(self, instance, validated_data):
        # فیلدهای حساس conv_type و participants نباید با update مستقیم کاربر تغییر کنند
        validated_data.pop('conv_type', None)
        validated_data.pop('participants', None)
        validated_data.pop('target_user_id', None)
        return super().update(instance, validated_data)

    def get_last_message(self, obj):
        if hasattr(obj, 'prefetched_messages') and obj.prefetched_messages:
            msg = obj.prefetched_messages[0]
        else:
            msg = obj.messages.select_related('sender').prefetch_related('attachments').order_by('-created_at', '-id').first()
        if msg:
            has_att = len(msg.attachments.all()) > 0 if hasattr(msg, '_prefetched_objects_cache') and 'attachments' in msg._prefetched_objects_cache else msg.attachments.exists()
            sender_name = f"{msg.sender.first_name} {msg.sender.last_name}".strip() if msg.sender else ""
            if not sender_name and msg.sender:
                sender_name = msg.sender.username
            return {
                'id': str(msg.id),
                'text': msg.text,
                'sender_name': sender_name,
                'created_at': msg.created_at.isoformat() if msg.created_at else None,
                'has_attachment': has_att,
            }
        return None

    def get_unread_count(self, obj):
        if hasattr(obj, 'annotated_unread_count'):
            return obj.annotated_unread_count
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            part = ConversationParticipant.objects.filter(conversation=obj, user=request.user).first()
            last_read_id = part.last_read_message_id if part else None
            qs = obj.messages.exclude(sender=request.user)
            if last_read_id:
                qs = qs.filter(id__gt=last_read_id)
            return qs.count()
        return 0


class GenericCommentSerializer(serializers.ModelSerializer):
    author_details = UserShortSerializer(source='author', read_only=True)
    mentioned_users_details = UserShortSerializer(source='mentioned_users', many=True, read_only=True)
    client_temp_id = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    text = serializers.CharField(max_length=4000)
    replies_count = serializers.SerializerMethodField()
    content_type_str = serializers.CharField(write_only=True, required=False)
    attachment_url = serializers.SerializerMethodField()
    # پس از فاز ۴، `warehouse` دیگر FK نیست؛ فیلد API را به `warehouse_id` ساده مپ می‌کنیم.
    warehouse = serializers.IntegerField(source='warehouse_id', required=False, allow_null=True)

    class Meta:
        model = GenericComment
        fields = [
            'id', 'client_temp_id', 'content_type', 'content_type_str', 'object_id',
            'warehouse', 'author', 'author_details', 'parent', 'text',
            'mentioned_users', 'mentioned_users_details', 'attachment', 'attachment_url',
            'replies_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'author', 'author_details', 'content_type', 'created_at', 'updated_at']

    def get_attachment_url(self, obj):
        if obj.attachment:
            signed_url = signed_media_url(obj.attachment.name)
            request = self.context.get('request')
            if request and signed_url:
                return request.build_absolute_uri(signed_url)
            return signed_url
        return None

    def get_replies_count(self, obj):
        return obj.replies.count()

    def validate(self, attrs):
        content_type_str = attrs.pop('content_type_str', None)
        object_id = attrs.get('object_id')

        if content_type_str:
            if '.' not in content_type_str:
                raise serializers.ValidationError({'content_type_str': 'فرمت content_type_str باید شامل app_label.model باشد (مثال: inventory.item)'})

            app_label, model = content_type_str.split('.', 1)
            model_lower = model.lower()

            if model_lower not in ALLOWED_COMMENT_MODELS:
                raise serializers.ValidationError({'content_type_str': f'ارسال نظر روی مدل {model} مجاز نیست'})

            ct = ContentType.objects.filter(app_label=app_label, model=model_lower).first()
            if not ct:
                raise serializers.ValidationError({'content_type_str': 'مدل مورد نظر در سیستم یافت نشد'})

            attrs['content_type'] = ct

            if object_id:
                model_cls = ct.model_class()
                if model_cls is None or not model_cls.objects.filter(id=object_id).exists():
                    raise serializers.ValidationError({'object_id': 'شناسه شیء مورد نظر یافت نشد'})

        return attrs

    def update(self, instance, validated_data):
        # فیلدهای ساختاری کامنت نباید در ویرایش تغییر کنند
        validated_data.pop('content_type', None)
        validated_data.pop('object_id', None)
        validated_data.pop('warehouse_id', None)
        validated_data.pop('author', None)
        validated_data.pop('client_temp_id', None)
        return super().update(instance, validated_data)
