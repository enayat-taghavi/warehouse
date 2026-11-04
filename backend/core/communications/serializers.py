from datetime import timedelta

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.urls import reverse
from common.media_urls import signed_media_url
from rest_framework.exceptions import PermissionDenied
from .access import (  # noqa: F401 (get_allowed_comment_models re-export)
    get_allowed_comment_models, resolve_comment_content_type, can_access_comment_target
)
from .models import (
    Conversation, ConversationParticipant, Message, MessageAttachment,
    MessageReaction, GenericComment, ConversationType, PinnedMessage
)
from .reactions import format_reactions_summary
from .membership import MAX_GROUP_MEMBERS_PER_REQUEST

User = get_user_model()

# مهلت ویرایش پیام توسط فرستنده (E12)
MESSAGE_EDIT_WINDOW = timedelta(minutes=15)
# فاصلهٔ updated_at از created_at که «ویرایش‌شده» حساب می‌شود (auto_now و auto_now_add چند میکروثانیه فرق دارند)
_EDITED_THRESHOLD = timedelta(seconds=2)
_REPLY_TO_ERROR = 'پیام مورد پاسخ در این گفتگو نیست'


class UserShortSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    last_seen_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'full_name', 'last_seen_at']

    def get_full_name(self, obj):
        name = f"{obj.first_name or ''} {obj.last_name or ''}".strip()
        return name if name else obj.username

    def get_last_seen_at(self, obj):
        # زمان آخرین مشاهده فقط برای طرف مقابل در گفتگوی دونفره (با بررسی صریح مجوز) بازگردانده می‌شود
        last_seen_map = self.context.get('direct_participants_last_seen')
        if last_seen_map and isinstance(last_seen_map, dict):
            return last_seen_map.get(obj.id)
        return None


class MessageAttachmentSerializer(serializers.ModelSerializer):
    """
    پیوست چت فقط از مسیر دانلود محافظت‌شده باز می‌شود که در هر درخواست عضویت فعلی را می‌سنجد (تصمیم ۷)؛
    آدرس رسانهٔ خام (/media/chat_attachments/...) دیگر خروجی داده نمی‌شود.
    """
    download_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = [
            'id', 'file_name', 'file_size', 'content_type', 'download_url', 'thumbnail_url',
            'width', 'height', 'page_count', 'duration', 'preview_status', 'created_at'
        ]

    def get_download_url(self, obj):
        if not obj.file:
            return None
        return reverse('chat_attachment_download', args=[obj.pk])

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail:
            return None
        return f"{reverse('chat_attachment_download', args=[obj.pk])}?thumb=1"




class MessageReactorSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = MessageReaction
        fields = ['user_id', 'full_name', 'emoji', 'created_at']

    def get_full_name(self, obj):
        u = getattr(obj, 'user', None)
        if not u:
            return ''
        name = f"{u.first_name or ''} {u.last_name or ''}".strip()
        return name or u.username

class MessageSerializer(serializers.ModelSerializer):
    sender_details = UserShortSerializer(source='sender', read_only=True)
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    client_temp_id = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    text = serializers.CharField(max_length=4000, required=False, allow_blank=True, allow_null=True)
    is_me = serializers.SerializerMethodField()
    read_by_count = serializers.SerializerMethodField()
    # خطای یکسان برای «پیام وجود ندارد» و «در گفتگوی دیگر است» تا وجود پیام‌های دیگر لو نرود
    reply_to = serializers.PrimaryKeyRelatedField(
        queryset=Message.objects.all(), required=False, allow_null=True,
        error_messages={'does_not_exist': _REPLY_TO_ERROR, 'incorrect_type': _REPLY_TO_ERROR},
    )
    edited_at = serializers.SerializerMethodField()
    editable_until = serializers.SerializerMethodField()
    reply_to_details = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    is_delivered = serializers.SerializerMethodField()
    delivered_count = serializers.SerializerMethodField()
    forwarded_from_message = serializers.PrimaryKeyRelatedField(read_only=True, allow_null=True)
    forwarded_from_name = serializers.CharField(read_only=True, allow_null=True)

    class Meta:
        model = Message
        fields = [
            'id', 'client_temp_id', 'conversation', 'sender', 'sender_details',
            'text', 'reply_to', 'reply_to_details', 'forwarded_from_message', 'forwarded_from_name',
            'is_system', 'created_at', 'updated_at',
            'edited_at', 'editable_until', 'attachments', 'is_me', 'read_by_count', 'is_delivered', 'delivered_count', 'reactions', 'is_pinned'
        ]
        read_only_fields = [
            'id', 'sender', 'sender_details', 'created_at', 'updated_at', 'is_system',
            'forwarded_from_message', 'forwarded_from_name'
        ]

    def get_reactions(self, obj):
        request = self.context.get('request')
        current_user_id = request.user.id if request and request.user.is_authenticated else None
        if hasattr(obj, '_prefetched_objects_cache') and 'reactions' in obj._prefetched_objects_cache:
            reactions_list = obj._prefetched_objects_cache['reactions']
        elif hasattr(obj, 'reactions'):
            reactions_list = list(obj.reactions.all())
        else:
            reactions_list = []
        return format_reactions_summary(reactions_list, current_user_id)

    def get_is_pinned(self, obj):
        if hasattr(obj, 'annotated_is_pinned'):
            return bool(obj.annotated_is_pinned)
        if hasattr(obj, '_prefetched_objects_cache') and 'pin_records' in obj._prefetched_objects_cache:
            return len(obj._prefetched_objects_cache['pin_records']) > 0
        return obj.pin_records.exists()

    def get_is_me(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.sender_id == request.user.id
        return False

    def get_read_by_count(self, obj):
        if hasattr(obj, 'annotated_read_by_count'):
            return obj.annotated_read_by_count
        return obj.read_by.count()

    def _get_delivery_info(self, obj):
        if hasattr(obj, '_cached_delivery_info'):
            return obj._cached_delivery_info

        memberships = self.context.get('participant_memberships')
        if memberships is None:
            conv = getattr(obj, 'conversation', None)
            if conv and hasattr(conv, '_prefetched_objects_cache') and 'participant_memberships' in conv._prefetched_objects_cache:
                memberships = [m for m in conv._prefetched_objects_cache['participant_memberships'] if getattr(m, 'left_at', None) is None and not getattr(m, 'is_deleted', False)]
            elif conv and hasattr(conv, 'participant_memberships'):
                memberships = list(conv.participant_memberships.filter(left_at__isnull=True, is_deleted=False))
            else:
                memberships = []

        delivered_count = 0
        for m in memberships:
            if m.user_id == obj.sender_id:
                continue
            last_del_id = getattr(m, 'last_delivered_message_id', None)
            last_read_id = getattr(m, 'last_read_message_id', None)
            if (last_del_id and last_del_id >= obj.id) or (last_read_id and last_read_id >= obj.id):
                delivered_count += 1

        read_count = self.get_read_by_count(obj)
        if read_count and read_count > 0:
            delivered_count = max(delivered_count, read_count)

        is_delivered = delivered_count > 0
        info = (is_delivered, delivered_count)
        obj._cached_delivery_info = info
        return info

    def get_is_delivered(self, obj):
        if hasattr(obj, 'annotated_is_delivered'):
            return bool(obj.annotated_is_delivered)
        return self._get_delivery_info(obj)[0]

    def get_delivered_count(self, obj):
        if hasattr(obj, 'annotated_is_delivered'):
            if obj.annotated_is_delivered:
                return max(1, self.get_read_by_count(obj))
            return 0
        return self._get_delivery_info(obj)[1]

    def get_edited_at(self, obj):
        # بدون فیلد جدید: پیامی که دیرتر از ساختش ذخیره شده ویرایش‌شده است (فقط مسیر ویرایش متن، پیام را دوباره ذخیره می‌کند)
        if obj.created_at and obj.updated_at and obj.updated_at - obj.created_at > _EDITED_THRESHOLD:
            return obj.updated_at.isoformat()
        return None

    def get_editable_until(self, obj):
        if obj.is_system or not obj.created_at:
            return None
        return (obj.created_at + MESSAGE_EDIT_WINDOW).isoformat()

    def get_reply_to_details(self, obj):
        target = obj.reply_to if obj.reply_to_id else None
        if target is None:
            return None
        if target.is_deleted or target.conversation_id != obj.conversation_id:
            return {'id': target.id, 'deleted': True}
        sender = target.sender
        target_text = (target.text or '').strip()
        target_atts = list(target.attachments.all())
        has_attachment = len(target_atts) > 0
        if not target_text and has_attachment:
            first_att = target_atts[0]
            if first_att:
                ct = (first_att.content_type or '').lower()
                fn = (first_att.file_name or '').lower()
                if ct.startswith('image/') or fn.endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
                    target_text = '📷 تصویر'
                elif ct.startswith('audio/') or fn.endswith(('.mp3', '.ogg', '.wav', '.m4a', '.webm')):
                    target_text = '🎤 پیام صوتی'
                else:
                    target_text = f"📎 {first_att.file_name}" if first_att.file_name else "📎 فایل پیوست"
        return {
            'id': target.id,
            'deleted': False,
            'text': target_text[:200],
            'sender_name': (sender.get_full_name() or sender.username) if sender else '',
            'has_attachment': has_attachment,
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        reply_to = attrs.get('reply_to')
        if reply_to is not None and self.instance is None:
            conversation = attrs.get('conversation')
            if conversation is None or reply_to.is_deleted or reply_to.conversation_id != conversation.id:
                raise serializers.ValidationError({'reply_to': _REPLY_TO_ERROR})
        return attrs

    def update(self, instance, validated_data):
        # فیلدهای ساختاری مانند conversation، client_temp_id، sender و reply_to نباید با ویرایش تغییر کنند
        validated_data.pop('conversation', None)
        validated_data.pop('client_temp_id', None)
        validated_data.pop('sender', None)
        validated_data.pop('reply_to', None)
        if 'text' in validated_data:
            if instance.is_system:
                raise PermissionDenied('پیام سیستمی ویرایش نمی‌شود')
            if timezone.now() > instance.created_at + MESSAGE_EDIT_WINDOW:
                raise PermissionDenied('مهلت ویرایش این پیام تمام شده است')
            new_text = (validated_data.get('text') or '').strip()
            if not new_text and not instance.attachments.exists():
                raise serializers.ValidationError({'text': 'متن پیام نمی‌تواند خالی باشد'})
            if new_text == (instance.text or '').strip():
                # بدون تغییر: ذخیره نمی‌شود تا «ویرایش‌شده» نخورد
                return instance
        return super().update(instance, validated_data)


def get_conversation_pinned_messages_data(obj):
    if hasattr(obj, 'prefetched_pinned_messages'):
        pins = obj.prefetched_pinned_messages
    else:
        pins = obj.pinned_messages.filter(message__is_deleted=False).select_related('message__sender').prefetch_related('message__attachments').order_by('pinned_at', 'id')

    result = []
    for pin in pins:
        m = getattr(pin, 'message', None)
        if not m or getattr(m, 'is_deleted', False):
            continue
        sender = m.sender
        sender_name = f"{sender.first_name} {sender.last_name}".strip() if sender else ""
        if not sender_name and sender:
            sender_name = sender.username
        has_att = len(m.attachments.all()) > 0 if hasattr(m, '_prefetched_objects_cache') and 'attachments' in m._prefetched_objects_cache else m.attachments.exists()
        result.append({
            'id': str(m.id),
            'text': m.text,
            'sender_name': sender_name,
            'created_at': m.created_at.isoformat() if m.created_at else None,
            'pinned_at': pin.pinned_at.isoformat() if pin.pinned_at else None,
            'pinned_by': pin.pinned_by_id,
            'has_attachment': has_att,
        })
    return result


class ConversationSerializer(serializers.ModelSerializer):
    participants = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    participants_details = serializers.SerializerMethodField()
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
    is_muted = serializers.SerializerMethodField()
    # آیا کاربر جاری می‌تواند در این گفتگو پیام بفرستد (E14)؛ همان قاعدهٔ سرور (can_post_to_conversation)
    can_post = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    pinned_at = serializers.SerializerMethodField()
    pinned_messages = serializers.SerializerMethodField()
    last_seen_at = serializers.SerializerMethodField()
    other_user_last_seen_at = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'title', 'conv_type', 'warehouse', 'participants', 'target_user_id',
            'participants_details', 'is_active', 'created_at', 'updated_at',
            'last_message', 'unread_count', 'member_ids', 'my_role', 'member_count', 'is_muted', 'can_post',
            'is_pinned', 'pinned_at', 'pinned_messages', 'last_seen_at', 'other_user_last_seen_at'
        ]
        read_only_fields = ['id', 'participants', 'created_at', 'updated_at', 'is_active']

    def _get_other_user_last_seen(self, obj):
        """
        محاسبه آخرین زمان مشاهده برای طرف مقابل در گفتگوی دونفره (فاز ۷).
        قانون اکید محرمانگی (tenant-scope-reviewer):
        - فقط در گفتگوی دونفره (conv_type == 'direct')
        - فقط در صورتی که کاربر جاری به پیام‌رسان دسترسی داشته باشد (chat_allowed)
        - فقط در صورتی که طرف مقابل مسدود نباشد
        - فقط در صورتی که طرف مقابل طبق contact_scope در حوزهٔ مخاطبان کاربر جاری باشد
        - در غیر این صورت مقدار None بازگردانده می‌شود.
        """
        if obj.conv_type != ConversationType.DIRECT:
            return None
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None

        from .contact_scope import chat_allowed, blocked_user_ids, visible_contact_ids
        if not hasattr(request, '_user_chat_allowed_cached'):
            request._user_chat_allowed_cached = chat_allowed(request.user)
        if not request._user_chat_allowed_cached:
            return None

        participants = list(obj.participants.all())
        other_user = next((p for p in participants if p.id != request.user.id), None)
        if not other_user:
            other_user = participants[0] if participants else None
        if not other_user or not getattr(other_user, 'is_active', True):
            return None

        if not hasattr(request, '_blocked_user_ids_cached'):
            request._blocked_user_ids_cached = blocked_user_ids()
        if other_user.id in request._blocked_user_ids_cached:
            return None

        if request.user.is_superuser:
            can_see = True
        else:
            if not hasattr(request, '_visible_contact_ids_cached'):
                request._visible_contact_ids_cached = visible_contact_ids(request.user)
            visible_ids = request._visible_contact_ids_cached
            can_see = (visible_ids is None or other_user.id in visible_ids)

        if not can_see:
            return None

        from .presence import get_user_last_seen_iso
        return get_user_last_seen_iso(other_user)

    def get_last_seen_at(self, obj):
        return self._get_other_user_last_seen(obj)

    def get_other_user_last_seen_at(self, obj):
        return self._get_other_user_last_seen(obj)

    def get_participants_details(self, obj):
        last_seen_map = {}
        if obj.conv_type == ConversationType.DIRECT:
            last_seen = self._get_other_user_last_seen(obj)
            if last_seen:
                request = self.context.get('request')
                for p in obj.participants.all():
                    if request and p.id != request.user.id:
                        last_seen_map[p.id] = last_seen
        ctx = dict(self.context)
        ctx['direct_participants_last_seen'] = last_seen_map
        return UserShortSerializer(obj.participants.all(), many=True, context=ctx).data

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

    def get_is_muted(self, obj):
        if hasattr(obj, 'annotated_is_muted'):
            return bool(obj.annotated_is_muted)
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return ConversationParticipant.objects.filter(
            conversation=obj, user=request.user, left_at__isnull=True, is_muted=True
        ).exists()

    def get_can_post(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if obj.conv_type in (ConversationType.DIRECT, ConversationType.GROUP):
            # همان «عضو فعال» قاعدهٔ سرور، از فهرست پیش‌واکشی‌شدهٔ اعضا (بدون کوئری اضافه در فهرست)
            return any(p.id == user.id for p in obj.participants.all())
        from .access import can_post_to_conversation
        return can_post_to_conversation(user, obj)

    def get_member_count(self, obj):
        if obj.conv_type != ConversationType.GROUP:
            return None
        return len(obj.participants.all())

    def get_pinned_messages(self, obj):
        return get_conversation_pinned_messages_data(obj)

    def get_is_pinned(self, obj):
        if hasattr(obj, 'annotated_is_pinned'):
            return bool(obj.annotated_is_pinned)
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return ConversationParticipant.objects.filter(
            conversation=obj, user=request.user, left_at__isnull=True, pinned_at__isnull=False
        ).exists()

    def get_pinned_at(self, obj):
        if hasattr(obj, 'annotated_pinned_at'):
            return obj.annotated_pinned_at.isoformat() if obj.annotated_pinned_at else None
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        part = ConversationParticipant.objects.filter(
            conversation=obj, user=request.user, left_at__isnull=True
        ).first()
        return part.pinned_at.isoformat() if (part and part.pinned_at) else None

    def create(self, validated_data):
        validated_data.pop('member_ids', None)
        validated_data.pop('target_user_id', None)
        # یافتن گفتگوی دو‌نفرهٔ قبلی فقط در ConversationViewSet._create_direct (زیر قفل، E13)
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


_SCOPE_CHOICES = ('section', 'project', 'company', 'all')


class ChatUserPolicyWriteSerializer(serializers.Serializer):
    """بدنهٔ PUT سیاست چت کاربر؛ هر دو فیلد اختیاری‌اند. contact_scope خالی یعنی «پیروی از شرکت»."""
    chat_allowed = serializers.BooleanField(required=False)
    contact_scope = serializers.ChoiceField(choices=('',) + _SCOPE_CHOICES, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError('دست‌کم یکی از chat_allowed یا contact_scope لازم است')
        return attrs


class ChatCompanyPolicyWriteSerializer(serializers.Serializer):
    """بدنهٔ PUT پیش‌فرض حوزهٔ مخاطبان شرکت"""
    contact_scope = serializers.ChoiceField(choices=_SCOPE_CHOICES)
