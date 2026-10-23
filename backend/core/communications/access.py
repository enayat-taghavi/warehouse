from django.contrib.auth import get_user_model
from django.db.models import Q
from common.warehouse_scope import user_warehouse_ids, can_access_warehouse
from .models import Conversation, Message, GenericComment, ConversationType

User = get_user_model()


def visible_conversations(user):
    """
    دریافت تمام گفتگوهای مجاز و قابل مشاهده برای کاربر جاری
    شامل گفتگوهای دارای عضویت، گروه‌های کاری انبار مجاز و اطلاعیه‌ها
    نکته مهم: چت‌های دو‌نفره (direct) منحصراً به اعضای آن گفتگو محدود هستند حتی برای کاربران superuser.
    """
    if not user or not user.is_authenticated:
        return Conversation.objects.none()

    # ۱. گفتگوهایی که کاربر صراحتاً عضو آن است (شامل چت‌های دو‌نفره شخصی)
    q = Q(participants=user)

    # ۲. گروه‌های انبار و کانال‌های اطلاعیه بر اساس محدوده انبار کاربر
    if user.is_superuser:
        q |= Q(conv_type__in=[ConversationType.ANNOUNCEMENT, ConversationType.WAREHOUSE_GROUP])
    else:
        allowed_whs = user_warehouse_ids(user)
        if allowed_whs is None:
            # کاربری که بدون محدودیت انبار است (مثلاً مدیران ارشد)
            q |= Q(conv_type=ConversationType.ANNOUNCEMENT)
            q |= Q(conv_type=ConversationType.WAREHOUSE_GROUP)
        elif allowed_whs:
            q |= Q(conv_type=ConversationType.ANNOUNCEMENT, warehouse_id__isnull=True)
            q |= Q(conv_type=ConversationType.ANNOUNCEMENT, warehouse_id__in=allowed_whs)
            q |= Q(conv_type=ConversationType.WAREHOUSE_GROUP, warehouse_id__in=allowed_whs)
        else:
            # کاربری بدون دسترسی به هیچ انباری
            q |= Q(conv_type=ConversationType.ANNOUNCEMENT, warehouse_id__isnull=True)

    return Conversation.objects.filter(q).distinct()


def can_read_conversation(user, conversation):
    """
    آیا کاربر مجاز به مشاهده پیام‌ها و مشخصات این گفتگو است؟
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    # عضویت مستقیم در گفتگو
    if conversation.participants.filter(id=user.id).exists():
        return True

    # اطلاعیه عمومی
    if conversation.conv_type == ConversationType.ANNOUNCEMENT:
        if conversation.warehouse_id is None:
            return True
        return can_access_warehouse(user, conversation.warehouse_id)

    # گروه کاری انبار
    if conversation.conv_type == ConversationType.WAREHOUSE_GROUP:
        if conversation.warehouse_id:
            return can_access_warehouse(user, conversation.warehouse_id)

    return False


def can_post_to_conversation(user, conversation):
    """
    آیا کاربر مجاز به ارسال پیام در این گفتگو است؟
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    # در کانال اطلاعیه تنها مدیران، ادمین‌ها یا ایجادکننده همان انبار مجاز به ارسال پیام هستند
    if conversation.conv_type == ConversationType.ANNOUNCEMENT:
        is_manager = getattr(user, 'is_staff', False) or user.has_perm('warehouses.can_act_as_manager')
        if not is_manager and conversation.created_by_id != user.id:
            return False
        # اگر اطلاعیه متعلق به انبار مشخصی است، کاربر حتماً باید به آن انبار دسترسی داشته باشد
        if conversation.warehouse_id is not None:
            return can_access_warehouse(user, conversation.warehouse_id)
        return True

    # در گفتگوی خصوصی، فرستنده حتماً باید عضو گفتگو باشد
    if conversation.conv_type == ConversationType.DIRECT:
        return conversation.participants.filter(id=user.id).exists()

    # در گروه کاری انبار، عضویت یا دسترسی انبار لازم است
    if conversation.conv_type == ConversationType.WAREHOUSE_GROUP:
        if conversation.participants.filter(id=user.id).exists():
            return True
        if conversation.warehouse_id:
            return can_access_warehouse(user, conversation.warehouse_id)

    return False


def can_modify_message(user, message):
    """
    آیا کاربر مجاز به ویرایش، الصاق فایل یا حذف این پیام است؟
    تنها فرستنده پیام یا سوپریوزر مجاز هستند.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return message.sender_id == user.id


def can_access_comment_target(user, content_type, object_id):
    """
    آیا کاربر به موجودیت هدف کامنت (کالا، سند، تسک انبارگردانی) دسترسی دارد؟
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    try:
        model_cls = content_type.model_class()
        if model_cls is None:
            return False
        target = model_cls.objects.filter(id=object_id).first()
        if not target:
            return False

        if hasattr(target, 'warehouse_id') and target.warehouse_id is not None:
            return can_access_warehouse(user, target.warehouse_id)
        if hasattr(target, 'warehouse') and target.warehouse:
            return can_access_warehouse(user, target.warehouse.id)

        return True
    except Exception:
        return False


def can_modify_comment(user, comment):
    """
    آیا کاربر مجاز به ویرایش یا حذف این کامنت است؟
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return comment.author_id == user.id
