from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.urls import reverse
from common.media_urls import signed_media_url
from rest_framework.exceptions import PermissionDenied
from .access import (  # noqa: F401 (get_allowed_comment_models re-export)
    get_allowed_comment_models, resolve_comment_content_type, can_access_comment_target
)
from .models import Conversation, ConversationParticipant, Message, MessageAttachment, GenericComment, ConversationType
from .membership import MAX_GROUP_MEMBERS_PER_REQUEST

User = get_user_model()


class UserShortSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'full_name']

    def get_full_name(self, obj):
        name = f"{obj.first_name or ''} {obj.last_name or ''}".strip()
        return name if name else obj.username


class MessageAttachmentSerializer(serializers.ModelSerializer):
    """
    پیوست چت فقط از مسیر دانلود محافظت‌شده باز می‌شود که در هر درخواست عضویت فعلی را می‌سنجد (تصمیم ۷)؛
    آدرس رسانهٔ خام (/media/chat_attachments/...) دیگر خروجی داده نمی‌شود.
    """
    download_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = ['id', 'file_name', 'file_size', 'content_type', 'download_url', 'thumbnail_url', 'created_at']

    def get_download_url(self, obj):
        if not obj.file:
            return None
        return reverse('chat_attachment_download', args=[obj.pk])

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        return f"{reverse('chat_attachment_download', args=[obj.pk])}?thumb=1"


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
    # ساخت گروه (U1): شناسهٔ اعضای اولیه؛ اعتبارسنجی فعال بودن کاربران در view انجام می‌شود
    member_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), write_only=True, required=False,
        max_length=MAX_GROUP_MEMBERS_PER_REQUEST
    )
    my_role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'title', 'conv_type', 'warehouse', 'participants', 'target_user_id',
            'participants_details', 'is_active', 'created_at', 'updated_at',
            'last_message', 'unread_count', 'member_ids', 'my_role', 'member_count'
        ]
        read_only_fields = ['id', 'participants', 'created_at', 'updated_at', 'is_active']

    def validate_title(self, value):
        return value.strip() if isinstance(value, str) else value

    def validate(self, attrs):
        conv_type = attrs.get('conv_type') if self.instance is None else self.instance.conv_type
        if conv_type == ConversationType.GROUP and (self.instance is None or 'title' in attrs):
            if not attrs.get('title'):
                raise serializers.ValidationError({'title': 'عنوان گروه الزامی است'})
        return attrs

    def get_my_role(self, obj):
        if obj.conv_type != ConversationType.GROUP:
            return None
        if hasattr(obj, 'annotated_my_role'):
            return obj.annotated_my_role
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        from .membership import member_role
        return member_role(obj, request.user)

    def get_member_count(self, obj):
        if obj.conv_type != ConversationType.GROUP:
            return None
        return len(obj.participants.all())

    def create(self, validated_data):
        validated_data.pop('member_ids', None)
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

        # افزودن اعضا (سازنده، طرف گفتگو، اعضای گروه) فقط با membership.add_member در view (U1)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # فیلدهای حساس conv_type و participants نباید با update مستقیم کاربر تغییر کنند
        validated_data.pop('conv_type', None)
        validated_data.pop('participants', None)
        validated_data.pop('target_user_id', None)
        validated_data.pop('member_ids', None)
        # انبار گفتگو پس از ساخت تغییر نمی‌کند (E23)
        validated_data.pop('warehouse_id', None)
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
            # عضوی که بعداً اضافه شده: نخوانده‌ها از زمان پیوستن شمرده می‌شوند، نه کل تاریخچه (E4)
            if part and part.joined_at:
                qs = qs.filter(created_at__gte=part.joined_at)
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
        # منشن فقط از راه mentioned_user_ids و توکن متن (با بررسی دسترسی) ثبت می‌شود؛ پیوست از این مسیر نوشته نمی‌شود (E25)
        read_only_fields = [
            'id', 'author', 'author_details', 'content_type', 'mentioned_users', 'attachment',
            'created_at', 'updated_at'
        ]

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

        if self.instance is None and not content_type_str:
            raise serializers.ValidationError({'content_type_str': 'نوع موجودیت هدف (app_label.model) الزامی است'})

        if content_type_str:
            if '.' not in content_type_str:
                raise serializers.ValidationError({'content_type_str': 'فرمت content_type_str باید شامل app_label.model باشد (مثال: inventory.item)'})

            app_label, model = content_type_str.split('.', 1)
            model_lower = model.lower()

            if model_lower not in get_allowed_comment_models():
                raise serializers.ValidationError({'content_type_str': f'ارسال نظر روی مدل {model} مجاز نیست'})

            ct = resolve_comment_content_type(f'{app_label}.{model_lower}')
            if not ct:
                raise serializers.ValidationError({'content_type_str': 'مدل مورد نظر در سیستم یافت نشد'})

            attrs['content_type'] = ct

            if object_id:
                # اول دسترسی، بعد وجود: «نبودن» و «دسترسی نداشتن» یک پاسخ ۴۰۳ یکسان می‌گیرند (بدون افشای وجود شیء)
                # (بدون request — مصرف داخلی — بررسی دسترسی به perform_create سپرده می‌شود)
                request = self.context.get('request')
                if request is not None and not can_access_comment_target(request.user, ct, str(object_id)):
                    raise PermissionDenied('شما به موجودیت هدف این کامنت دسترسی ندارید')
                model_cls = ct.model_class()
                if model_cls is None or not model_cls.objects.filter(id=object_id).exists():
                    raise serializers.ValidationError({'object_id': 'شناسه شیء مورد نظر یافت نشد'})

            # پاسخ فقط به نظری روی همان شیء (E25)
            parent = attrs.get('parent')
            if parent is not None and (
                parent.content_type_id != ct.id or str(parent.object_id) != str(object_id)
            ):
                raise serializers.ValidationError({'parent': 'نظر والد متعلق به همین موجودیت نیست'})

        return attrs

    def update(self, instance, validated_data):
        # فیلدهای ساختاری کامنت نباید در ویرایش تغییر کنند
        validated_data.pop('content_type', None)
        validated_data.pop('object_id', None)
        validated_data.pop('warehouse_id', None)
        validated_data.pop('author', None)
        validated_data.pop('client_temp_id', None)
        validated_data.pop('parent', None)
        validated_data.pop('mentioned_users', None)
        validated_data.pop('attachment', None)
        return super().update(instance, validated_data)
