from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from common.warehouse_scope import user_warehouse_ids, can_access_warehouse
from platform_core.registry import contributions, has_permission_alias
from .models import Conversation, Message, GenericComment, ConversationType

User = get_user_model()

# قابلیت عمومی «مدیر گروه چت»؛ هر ماژول مجوز خودش را با
# contribute('permission_aliases:chat_group_manager', codename) به آن وصل می‌کند (E19)
CHAT_GROUP_MANAGER_CAPABILITY = 'chat_group_manager'


def is_chat_group_manager(user):
    """سوپرکاربر، is_staff یا دارندهٔ قابلیت chat_group_manager"""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or getattr(user, 'is_staff', False):
        return True
    return has_permission_alias(user, CHAT_GROUP_MANAGER_CAPABILITY)


def _is_participant(user, conversation):
    return conversation.participants.filter(id=user.id).exists()


def visible_conversations(user):
    """
    دریافت تمام گفتگوهای مجاز و قابل مشاهده برای کاربر جاری
    شامل گفتگوهای دارای عضویت فعال (دو‌نفره و گروه) و اطلاعیه‌ها
    نکته مهم: چت‌های دو‌نفره (direct) منحصراً به اعضای آن گفتگو محدود هستند حتی برای کاربران superuser.
    """
    if not user or not user.is_authenticated:
        return Conversation.objects.none()

    # ۱. گفتگوهایی که کاربر صراحتاً عضو آن است (شامل چت‌های دو‌نفره شخصی)
    q = Q(participants=user)

    # ۲. کانال‌های اطلاعیه بر اساس محدوده انبار کاربر؛ گروه‌ها فقط با عضویت فعال (بند ۱) دیده می‌شوند (U1)
    if user.is_superuser:
        q |= Q(conv_type=ConversationType.ANNOUNCEMENT)
    else:
        allowed_whs = user_warehouse_ids(user)
        if allowed_whs is None:
            # کاربری که بدون محدودیت انبار است (مثلاً مدیران ارشد)
            q |= Q(conv_type=ConversationType.ANNOUNCEMENT)
        elif allowed_whs:
            q |= Q(conv_type=ConversationType.ANNOUNCEMENT, warehouse_id__isnull=True)
            q |= Q(conv_type=ConversationType.ANNOUNCEMENT, warehouse_id__in=allowed_whs)
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

    # چت دو‌نفره و گروه فقط برای اعضای فعال خودش، حتی سوپرکاربر (تصمیم کاربر، E5 و U1)
    if conversation.conv_type in (ConversationType.DIRECT, ConversationType.GROUP):
        return _is_participant(user, conversation)

    if user.is_superuser:
        return True

    # عضویت مستقیم در گفتگو
    if _is_participant(user, conversation):
        return True

    # اطلاعیه عمومی
    if conversation.conv_type == ConversationType.ANNOUNCEMENT:
        if conversation.warehouse_id is None:
            return True
        return can_access_warehouse(user, conversation.warehouse_id)

    return False


def can_post_to_conversation(user, conversation):
    """
    آیا کاربر مجاز به ارسال پیام در این گفتگو است؟
    """
    if not user or not user.is_authenticated:
        return False

    # در گفتگوی خصوصی و گروه، فرستنده حتماً باید عضو فعال گفتگو باشد (سوپرکاربر هم، E5 و U1)
    if conversation.conv_type in (ConversationType.DIRECT, ConversationType.GROUP):
        return _is_participant(user, conversation)

    if user.is_superuser:
        return True

    # در کانال اطلاعیه تنها مدیران، ادمین‌ها یا ایجادکننده همان انبار مجاز به ارسال پیام هستند
    if conversation.conv_type == ConversationType.ANNOUNCEMENT:
        if not is_chat_group_manager(user) and conversation.created_by_id != user.id:
            return False
        # اگر اطلاعیه متعلق به انبار مشخصی است، کاربر حتماً باید به آن انبار دسترسی داشته باشد
        if conversation.warehouse_id is not None:
            return can_access_warehouse(user, conversation.warehouse_id)
        return True

    return False


def can_modify_message(user, message):
    """
    آیا کاربر مجاز به ویرایش متن یا الصاق فایل به این پیام است؟
    فقط فرستنده؛ سوپرکاربر هم متن پیام دیگران را ویرایش نمی‌کند (E5).
    """
    if not user or not user.is_authenticated:
        return False
    if message.sender_id != user.id:
        return False
    return not _left_group(user, message)


def _left_group(user, message):
    """عضو حذف‌شده یا خارج‌شده از گروه، پیام‌های قبلی خودش را هم ویرایش یا حذف نمی‌کند (U1)"""
    conversation = getattr(message, 'conversation', None)
    return (
        conversation is not None
        and conversation.conv_type == ConversationType.GROUP
        and not _is_participant(user, conversation)
    )


def can_delete_message(user, message):
    """
    آیا کاربر مجاز به حذف این پیام است؟
    فرستنده همیشه؛ سوپرکاربر فقط در گفتگوهای غیرخصوصی (حذف پیام نامناسب، با ثبت ممیزی؛ E5).
    """
    if not user or not user.is_authenticated:
        return False
    if message.sender_id == user.id:
        return not _left_group(user, message)
    conversation = getattr(message, 'conversation', None)
    if user.is_superuser and conversation is not None:
        # گروه فقط برای اعضای فعال است؛ سوپرکاربرِ غیرعضو پیام گروه را هم حذف نمی‌کند (U1)
        if conversation.conv_type == ConversationType.GROUP:
            return _is_participant(user, conversation)
        return conversation.conv_type == ConversationType.ANNOUNCEMENT
    return False


def get_allowed_comment_models() -> set[str]:
    """
    دریافت مدل‌های مجاز برای ارسال نظر از مشارکت ماژول‌ها (Extension Point: comment_target_models).
    """
    models = set()
    for item in contributions('comment_target_models'):
        if isinstance(item, (set, list, tuple)):
            models.update(str(m).lower() for m in item)
        else:
            models.add(str(item).lower())
    return models


def resolve_comment_content_type(model_name):
    """
    حل بی‌ابهام ContentType هدف نظر از «app_label.model» یا نام خالی مدل (E6).
    فقط مدل‌های فهرست مجاز پذیرفته می‌شوند؛ نام خالی‌ای که به بیش از یک ContentType برسد رد می‌شود.
    """
    if not model_name or not isinstance(model_name, str):
        return None
    raw = model_name.strip().lower()
    if '.' in raw:
        app_label, model = raw.split('.', 1)
        if not app_label or not model:
            return None
        qs = ContentType.objects.filter(app_label=app_label, model=model)
    else:
        model = raw
        qs = ContentType.objects.filter(model=model)
    if model not in get_allowed_comment_models():
        return None
    matches = list(qs[:2])
    if len(matches) != 1:
        return None
    return matches[0]


def can_access_comment_target(user, content_type, object_id):
    """
    آیا کاربر به موجودیت هدف کامنت (کالا، سند، تسک انبارگردانی) دسترسی دارد؟
    ترتیب: قلاب ماژول مالک (comment_target_access) ← ستون انبار شیء ← پیش‌فرض رد (E6).
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    try:
        if content_type is None or content_type.model not in get_allowed_comment_models():
            return False
        model_cls = content_type.model_class()
        if model_cls is None:
            return False
        target = model_cls.objects.filter(id=object_id).first()
        if not target:
            return False

        # ۱. قلاب دسترسی ماژول مالک مدل: fn(user, target) -> bool | None (None یعنی «مال من نیست»)
        for hook in contributions('comment_target_access'):
            verdict = hook(user, target)
            if verdict is not None:
                return bool(verdict)

        # ۲. شیء دارای ستون انبار
        if hasattr(target, 'warehouse_id'):
            return can_access_warehouse(user, target.warehouse_id)

        # ۳. شیء ناشناخته: پیش‌فرض رد
        return False
    except Exception:
        return False


def can_modify_comment(user, comment):
    """
    آیا کاربر مجاز به ویرایش متن این کامنت است؟ فقط نویسنده؛ سوپرکاربر هم نه (همان قاعدهٔ پیام، E5).
    """
    if not user or not user.is_authenticated:
        return False
    return comment.author_id == user.id


def can_delete_comment(user, comment):
    """
    آیا کاربر مجاز به حذف این کامنت است؟ نویسنده، یا سوپرکاربر (حذف نظر نامناسب، با ثبت ممیزی).
    """
    if not user or not user.is_authenticated:
        return False
    return comment.author_id == user.id or user.is_superuser
