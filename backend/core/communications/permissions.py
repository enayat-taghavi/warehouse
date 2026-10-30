from rest_framework import permissions
from .access import (
    can_read_conversation,
    can_post_to_conversation,
    can_modify_message,
    can_delete_message,
    can_access_comment_target,
    can_modify_comment,
    can_delete_comment,
    is_chat_group_manager,
)
from .models import Conversation, Message, ConversationType
from common.warehouse_scope import can_access_warehouse


_NO_TARGET = object()


class IsChatEnabled(permissions.BasePermission):
    """
    بررسی فعال بودن سیستم پیام‌رسان در تنظیمات سراسری یا اختصاصی انبار
    """
    message = "سیستم پیام‌رسان در این انبار غیرفعال است"

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        wh_id = request.query_params.get('warehouse_id')
        data = request.data if isinstance(getattr(request, 'data', None), dict) else {}
        # E18: برای پیام و پیوست، انبار از خودِ گفتگوی هدف خوانده می‌شود، نه از ورودی کلاینت
        target_wh = self._warehouse_from_target(data, view)
        if target_wh is not _NO_TARGET:
            wh_id = target_wh
        else:
            if not wh_id and data:
                wh_id = request.data.get('warehouse')
            if not wh_id:
                wh_id = getattr(view, 'warehouse_id', None)

        try:
            wh_id_int = int(wh_id) if wh_id else None
        except (ValueError, TypeError):
            wh_id_int = None

        from settings_core.services import get_setting
        return bool(get_setting('chat_enabled', warehouse_id=wh_id_int))

    @staticmethod
    def _warehouse_from_target(data, view=None):
        conv_id = data.get('conversation') if data else None
        msg_id = data.get('message_id') if data else None
        # مسیرهای جزئی (/messages/<id>/، /conversations/<id>/، mark-read): هدف از خودِ آدرس
        pk = getattr(view, 'kwargs', {}).get('pk') if view is not None else None
        if pk:
            meta = getattr(getattr(view, 'serializer_class', None), 'Meta', None)
            model = getattr(meta, 'model', None)
            if model is Conversation:
                conv_id, msg_id = pk, None
            elif model is Message:
                conv_id, msg_id = None, pk
        try:
            if conv_id:
                row = Conversation.objects.filter(id=conv_id).values_list('warehouse_id', flat=True)[:1]
                return next(iter(row), None)
            if msg_id:
                row = Message.objects.filter(id=msg_id).values_list('conversation__warehouse_id', flat=True)[:1]
                return next(iter(row), None)
        except Exception:
            return None
        return _NO_TARGET


class IsConversationParticipantOrAdmin(permissions.BasePermission):
    """
    تنها اعضای مجاز یا مدیران ارشد مجاز به مشاهده یا تعامل با گفتگو هستند.
    ویرایش یا حذف گفتگو تنها توسط سازنده (در صورت داشتن نقش مدیریت) یا سوپریوزر مجاز است.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        user = request.user

        # اگر آبجکت Conversation است
        if hasattr(obj, 'participants') and hasattr(obj, 'conv_type'):
            if request.method in permissions.SAFE_METHODS or getattr(view, 'action', None) == 'mark_as_read':
                return can_read_conversation(user, obj)
            # چت دو‌نفره فقط برای اعضای خودش، سوپرکاربر هم (E5)
            if obj.conv_type == ConversationType.DIRECT and not obj.participants.filter(id=user.id).exists():
                return False
            if user.is_superuser:
                return True
            # عملیات ویرایش یا حذف گفتگو
            return is_chat_group_manager(user) and obj.created_by_id == user.id

        # اگر آبجکت Message است
        if hasattr(obj, 'conversation'):
            return _message_object_permission(request, obj)

        return True


def _message_object_permission(request, message):
    """خواندن با دسترسی گفتگو؛ حذف با can_delete_message؛ ویرایش فقط فرستنده (E5)"""
    if request.method in permissions.SAFE_METHODS:
        return can_read_conversation(request.user, message.conversation)
    if request.method == 'DELETE':
        return can_delete_message(request.user, message)
    return can_modify_message(request.user, message)


class IsMessageAuthor(permissions.BasePermission):
    """
    تنها نویسنده پیام یا سوپریوزر مجاز به ویرایش، حذف یا الصاق فایل به پیام است.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        return _message_object_permission(request, obj)


class IsCommentAuthor(permissions.BasePermission):
    """
    تنها نویسنده کامنت یا سوپریوزر مجاز به ویرایش یا حذف کامنت است.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in permissions.SAFE_METHODS:
            return can_access_comment_target(request.user, obj.content_type, obj.object_id)
        if request.method == 'DELETE':
            return can_delete_comment(request.user, obj)
        return can_modify_comment(request.user, obj)


class CanAccessWarehouseObject(permissions.BasePermission):
    """
    بررسی دسترسی کاربر به انبار مرتبط با موجودیت
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        wh_id = None
        if hasattr(obj, 'warehouse_id') and obj.warehouse_id is not None:
            wh_id = obj.warehouse_id
        elif hasattr(obj, 'warehouse') and obj.warehouse:
            wh_id = obj.warehouse.id

        return can_access_warehouse(request.user, wh_id)
