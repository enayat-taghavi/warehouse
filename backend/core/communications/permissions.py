from rest_framework import permissions
from .access import (
    can_read_conversation,
    can_post_to_conversation,
    can_modify_message,
    can_access_comment_target,
    can_modify_comment
)
from common.warehouse_scope import can_access_warehouse


class IsChatEnabled(permissions.BasePermission):
    """
    بررسی فعال بودن سیستم پیام‌رسان در تنظیمات سراسری یا اختصاصی انبار
    """
    message = "سیستم پیام‌رسان در این انبار غیرفعال است"

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        wh_id = request.query_params.get('warehouse_id')
        if not wh_id and hasattr(request, 'data') and isinstance(request.data, dict):
            wh_id = request.data.get('warehouse')
        if not wh_id:
            wh_id = getattr(view, 'warehouse_id', None)

        try:
            wh_id_int = int(wh_id) if wh_id else None
        except (ValueError, TypeError):
            wh_id_int = None

        from settings_core.services import get_setting
        return bool(get_setting('chat_enabled', warehouse_id=wh_id_int))


class IsConversationParticipantOrAdmin(permissions.BasePermission):
    """
    تنها اعضای مجاز یا مدیران ارشد مجاز به مشاهده یا تعامل با گفتگو هستند.
    ویرایش یا حذف گفتگو تنها توسط سازنده (در صورت داشتن نقش مدیریت) یا سوپریوزر مجاز است.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        # اگر آبجکت Conversation است
        if hasattr(obj, 'participants') and hasattr(obj, 'conv_type'):
            if request.method in permissions.SAFE_METHODS or getattr(view, 'action', None) == 'mark_as_read':
                return can_read_conversation(request.user, obj)
            # عملیات ویرایش یا حذف گفتگو
            is_manager = getattr(request.user, 'is_staff', False) or request.user.has_perm('warehouses.can_act_as_manager')
            return is_manager and obj.created_by_id == request.user.id

        # اگر آبجکت Message است
        if hasattr(obj, 'conversation'):
            if request.method in permissions.SAFE_METHODS:
                return can_read_conversation(request.user, obj.conversation)
            return can_modify_message(request.user, obj)

        return True


class IsMessageAuthor(permissions.BasePermission):
    """
    تنها نویسنده پیام یا سوپریوزر مجاز به ویرایش، حذف یا الصاق فایل به پیام است.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if request.method in permissions.SAFE_METHODS:
            return can_read_conversation(request.user, obj.conversation)

        return can_modify_message(request.user, obj)


class IsCommentAuthor(permissions.BasePermission):
    """
    تنها نویسنده کامنت یا سوپریوزر مجاز به ویرایش یا حذف کامنت است.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if request.method in permissions.SAFE_METHODS:
            return can_access_comment_target(request.user, obj.content_type, obj.object_id)

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
