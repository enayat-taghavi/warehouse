import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Message
from .serializers import MessageSerializer, GenericCommentSerializer

logger = logging.getLogger(__name__)


def _send_to_user_rooms(channel_layer, user_ids, event, data):
    for p_id in user_ids:
        user_room = f"chat_user_{p_id}"
        try:
            async_to_sync(channel_layer.group_send)(
                user_room,
                {"type": "chat_message_broadcast", "event": event, "data": data}
            )
        except Exception as e:
            logger.debug(f"[WS Broadcast] Error sending {event} to user room {user_room}: {e}")


def _send_message_event(msg, event, recipient_ids):
    """
    رویداد پیام به روم شخصی همهٔ خوانندگان؛ نسخهٔ فرستنده با is_me=True به روم خودش هم می‌رود
    تا دستگاه‌های دیگرش هماهنگ شوند (E26؛ فرانت از روی client_temp_id تکراری را کنار می‌گذارد).
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    # سریالایز بی‌طرفانه پیام بدون کانتکست اختصاصی کاربر فرستنده تا is_me به صورت اشتباه برای سایرین True نشود
    data = MessageSerializer(msg).data
    data['is_me'] = False
    others = sorted(p_id for p_id in recipient_ids if p_id != msg.sender_id)
    _send_to_user_rooms(channel_layer, others, event, data)
    if msg.sender_id in recipient_ids:
        own = dict(data)
        own['is_me'] = True
        _send_to_user_rooms(channel_layer, [msg.sender_id], event, own)


def _notify_chat_message(msg, recipient_ids):
    """
    اعلان پایدار و پوش برای خوانندگان غیر بی‌صدا (غیر از فرستنده).
    جمع‌سازی (E15/U4): اگر گیرنده برای همین گفتگو اعلان خوانده‌نشده دارد، همان یکی «N پیام جدید» می‌شود
    و اعلان یا پوش تازه ساخته نمی‌شود؛ هیچ اعلانی پاک نمی‌شود.
    """
    from django.db.models import Count, IntegerField, OuterRef, Subquery
    from notifications.models import Notification
    from .models import ConversationParticipant

    conv = msg.conversation
    muted_user_ids = set(
        ConversationParticipant.objects.filter(
            conversation=conv,
            is_muted=True
        ).values_list('user_id', flat=True)
    )
    notify_ids = sorted(p_id for p_id in recipient_ids if p_id != msg.sender_id and p_id not in muted_user_ids)
    if not notify_ids:
        return

    sender = getattr(msg, 'sender', None)
    sender_display = (
        f"{sender.first_name or ''} {sender.last_name or ''}".strip()
        if sender else ''
    ) or (getattr(sender, 'username', '') if sender else '') or 'کاربر'

    if getattr(conv, 'conv_type', 'direct') == 'direct':
        title = f"پیام جدید از {sender_display}"
    else:
        title = f"{sender_display} در {conv.title or 'گفتگو'}"

    msg_preview = (msg.text or '').strip()
    if not msg_preview:
        has_attachments = hasattr(msg, 'attachments') and msg.attachments.exists()
        msg_preview = '[فایل ضمیمه]' if has_attachments else 'پیام جدید'
    elif len(msg_preview) > 120:
        msg_preview = msg_preview[:117] + '...'

    conv_target = str(conv.id)
    # تعداد پیام‌های دیگران پس از ساخت اعلان باز (شامل همین پیام)، در یک کوئری
    count_sq = Subquery(
        Message.objects.filter(
            conversation_id=conv.id, is_system=False, created_at__gte=OuterRef('created_at')
        ).exclude(sender_id=OuterRef('recipient_id')).order_by().values('conversation')
        .annotate(c=Count('id')).values('c')[:1],
        output_field=IntegerField()
    )
    pending = list(
        Notification.objects.filter(
            recipient_id__in=notify_ids, notification_type='chat_message',
            target_model='Conversation', target_id=conv_target, is_read=False
        ).annotate(pending_count=count_sq)
    )
    batched_ids = set()
    short = msg_preview if len(msg_preview) <= 80 else msg_preview[:77] + '...'
    for n in pending:
        batched_ids.add(n.recipient_id)
        # پیام اولی که این اعلان را ساخت پیش از خود اعلان ثبت شده؛ بقیه (شامل همین پیام) پس از آن
        count = max((n.pending_count or 0) + 1, 2)
        n.title = title
        n.message = f"{count} پیام جدید — آخرین: {short}"
    if pending:
        Notification.objects.bulk_update(pending, ['title', 'message'])

    # یک INSERT برای همهٔ گیرندگان تازه (ق۱۸)؛ bulk_create سیگنال post_save ندارد، پس پوش جدا زمان‌بندی می‌شود
    created = Notification.objects.bulk_create([
        Notification(
            recipient_id=p_id,
            title=title,
            message=msg_preview,
            notification_type='chat_message',
            target_model='Conversation',
            target_id=conv_target,
            is_read=False
        )
        for p_id in notify_ids
        if p_id not in batched_ids
    ])
    if created:
        from notifications.push import schedule_push_for_notifications
        schedule_push_for_notifications(created)


def broadcast_message_ws(msg, request=None):
    """
    برودکست بلادرنگ پیام جدید به روم شخصی همهٔ خوانندگان مؤثر گفتگو (E3: اطلاعیه هم به همهٔ
    خوانندگان مجاز می‌رسد) و ساخت اعلان و پوش برای خوانندگان غیر بی‌صدا
    """
    from .access import effective_reader_ids
    recipient_ids = effective_reader_ids(msg.conversation)
    _send_message_event(msg, "chat.message.new", recipient_ids)

    if not getattr(msg, 'is_system', False):
        try:
            _notify_chat_message(msg, recipient_ids)
        except Exception as exc:
            logger.exception(f"[Chat Push] Error creating notifications for message {getattr(msg, 'id', None)}: {exc}")


def broadcast_message_updated_ws(msg, request=None):
    """
    برودکست بلادرنگ تغییرات پیام (مانند افزوده شدن پیوست) به روم شخصی خوانندگان و فرستنده (E26)
    """
    from .access import effective_reader_ids
    _send_message_event(msg, "chat.message.updated", effective_reader_ids(msg.conversation))


def broadcast_message_deleted_ws(conversation, message_id):
    """
    خبر زندهٔ حذف پیام (E12) به روم شخصی همهٔ خوانندگان مؤثر گفتگو؛ فقط شناسه‌ها، بدون متن
    """
    from .access import effective_reader_ids
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    data = {'id': message_id, 'conversation': str(conversation.id)}
    _send_to_user_rooms(channel_layer, sorted(effective_reader_ids(conversation)), "chat.message.deleted", data)


def broadcast_comment_ws(comment, request=None):
    """
    برودکست بلادرنگ کامنت جدید به روم تعاملی شیء هدف و هشدارهای منشن
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    data = GenericCommentSerializer(comment, context={'request': request}).data
    model_name = comment.content_type.model if comment.content_type else 'item'
    target_group = f"comments_{model_name}_{comment.object_id}"

    try:
        async_to_sync(channel_layer.group_send)(
            target_group,
            {
                "type": "comment_new_broadcast",
                "data": data
            }
        )
    except Exception as e:
        logger.debug(f"[WS Broadcast] Error sending comment: {e}")

    for u in comment.mentioned_users.exclude(id=comment.author_id):
        user_room = f"comment_user_{u.id}"
        try:
            async_to_sync(channel_layer.group_send)(
                user_room,
                {
                    "type": "comment_mention_alert",
                    "data": {
                        "comment_id": str(comment.id),
                        "model": model_name,
                        "object_id": comment.object_id,
                        "author_name": f"{comment.author.first_name} {comment.author.last_name}".strip() or comment.author.username,
                        "text": comment.text[:80]
                    }
                }
            )
        except Exception as e:
            logger.debug(f"[WS Broadcast] Error sending mention: {e}")


def broadcast_membership_ws(conversation, removed_user_ids=()):
    """
    تغییر عضویت گروه (U1):
    - به کاربر حذف‌شده/خارج‌شده: رویداد داخلی chat_membership_revoked که مصرف‌کنندهٔ او را فوراً از
      روم conv_<id> بیرون می‌برد و رویداد chat.conversation.removed را به کلاینت می‌فرستد؛
    - به همهٔ اعضای فعال باقی‌مانده: chat.conversation.updated تا فهرست و اعضا را تازه کنند.
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    conv_id = str(conversation.id)
    for u_id in set(removed_user_ids):
        try:
            async_to_sync(channel_layer.group_send)(
                f"chat_user_{u_id}",
                {"type": "chat_membership_revoked", "conversation_id": conv_id}
            )
        except Exception as e:
            logger.debug(f"[WS Broadcast] Error sending membership revoke: {e}")
    for p_id in conversation.participants.values_list('id', flat=True):
        try:
            async_to_sync(channel_layer.group_send)(
                f"chat_user_{p_id}",
                {
                    "type": "chat_message_broadcast",
                    "event": "chat.conversation.updated",
                    "data": {"conversation_id": conv_id}
                }
            )
        except Exception as e:
            logger.debug(f"[WS Broadcast] Error sending conversation update: {e}")


def broadcast_read_receipt_ws(conversation, reader_user, last_read_message=None):
    """
    برودکست بلادرنگ وضعیت خوانده‌شدن (تیک دوم) به اعضای فعال گفتگو و دستگاه‌های دیگر خود خواننده (E11، E26).
    اطلاعیه: فقط اعضای صریح (معمولاً سازنده) و خود خواننده، نه همهٔ خوانندگان.
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    payload = {
        "conversation_id": str(conversation.id),
        "reader_id": reader_user.id,
        "reader_name": f"{reader_user.first_name or ''} {reader_user.last_name or ''}".strip() or reader_user.username,
        "last_read_message_id": str(last_read_message.id) if last_read_message else None,
    }
    recipient_ids = set(conversation.participants.filter(is_active=True).values_list('id', flat=True))
    recipient_ids.add(reader_user.id)
    _send_to_user_rooms(channel_layer, sorted(recipient_ids), "chat.read_receipt", payload)
