import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Message
from .serializers import MessageSerializer, GenericCommentSerializer

logger = logging.getLogger(__name__)


def broadcast_message_ws(msg, request=None):
    """
    برودکست بلادرنگ پیام جدید به کانال‌های وب‌سوکت مرتبط
    ارسال تک‌مقصدی به کانال اختصاصی هر یک از اعضا جهت جلوگیری از تکثیر فریم
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    # سریالایز بی‌طرفانه پیام بدون کانتکست اختصاصی کاربر فرستنده تا is_me به صورت اشتباه برای سایرین True نشود
    data = MessageSerializer(msg).data
    data['is_me'] = False

    # ارسال اختصاصی به روم شخصی هر یک از اعضای گفتگو (غیر از فرستنده)
    participant_ids = list(msg.conversation.participants.values_list('id', flat=True))
    for p_id in participant_ids:
        if p_id == msg.sender_id:
            continue
        user_room = f"chat_user_{p_id}"
        try:
            async_to_sync(channel_layer.group_send)(
                user_room,
                {
                    "type": "chat_message_broadcast",
                    "event": "chat.message.new",
                    "data": data
                }
            )
        except Exception as e:
            logger.debug(f"[WS Broadcast] Error sending to user room {user_room}: {e}")


def broadcast_message_updated_ws(msg, request=None):
    """
    برودکست بلادرنگ تغییرات پیام (مانند افزوده شدن پیوست) به کانال‌های وب‌سوکت مرتبط
    ارسال تک‌مقصدی به کانال شخصی اعضا جهت جلوگیری از تکثیر فریم
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    # سریالایز بی‌طرفانه پیام بدون کانتکست اختصاصی کاربر فرستنده
    data = MessageSerializer(msg).data
    data['is_me'] = False

    # ارسال به روم شخصی هر یک از اعضا
    participant_ids = list(msg.conversation.participants.values_list('id', flat=True))
    for p_id in participant_ids:
        if p_id == msg.sender_id:
            continue
        user_room = f"chat_user_{p_id}"
        try:
            async_to_sync(channel_layer.group_send)(
                user_room,
                {
                    "type": "chat_message_broadcast",
                    "event": "chat.message.updated",
                    "data": data
                }
            )
        except Exception as e:
            logger.debug(f"[WS Broadcast] Error sending updated msg to user room: {e}")


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


def broadcast_read_receipt_ws(conversation, reader_user):
    """
    برودکست بلادرنگ وضعیت خوانده‌شدن پیام‌ها (Read Receipt / تیک دوم) به اعضای گفتگو
    ارسال تک‌مقصدی به کانال شخصی فرستندگان جهت جلوگیری از فریم مضاعف
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        return

    conv_id = str(conversation.id)
    payload = {
        "conversation_id": conv_id,
        "reader_id": reader_user.id,
        "reader_name": f"{reader_user.first_name or ''} {reader_user.last_name or ''}".strip() or reader_user.username,
    }

    # ارسال به روم شخصی فرستندگان پیام‌های داخل این گفتگو (غیر از خواننده)
    participant_ids = list(conversation.participants.exclude(id=reader_user.id).values_list('id', flat=True))
    for p_id in participant_ids:
        user_room = f"chat_user_{p_id}"
        try:
            async_to_sync(channel_layer.group_send)(
                user_room,
                {
                    "type": "chat_message_broadcast",
                    "event": "chat.read_receipt",
                    "data": payload
                }
            )
        except Exception as e:
            logger.debug(f"[WS Broadcast] Error sending read receipt to user room: {e}")

