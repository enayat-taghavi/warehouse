"""
عضویت گفتگو (U1)

- M2M `Conversation.participants` = مجموعهٔ اعضای «فعال» (همهٔ بررسی‌های دسترسی و برودکست از همین می‌خوانند).
- `ConversationParticipant` = رکورد عضویت و سابقهٔ آن؛ برای هر عضو همیشه هست و هرگز پاک نمی‌شود:
  حذف/خروج فقط `left_at` می‌گذارد و کاربر را از M2M برمی‌دارد؛ افزودن دوباره `left_at` را پاک
  و `joined_at` را تازه می‌کند.
هر جایی که عضو اضافه یا حذف می‌شود باید از همین توابع استفاده کند تا M2M و رکوردها از هم جدا نشوند.
"""
from django.db import transaction
from django.utils import timezone

from .models import ConversationParticipant, ParticipantRole, Message

# سقف تعداد اعضای یک درخواست افزودن/ساخت گروه
MAX_GROUP_MEMBERS_PER_REQUEST = 500


def display_name(user):
    if user is None:
        return 'سیستم'
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or user.username


def ensure_member_record(conversation, user, role=ParticipantRole.MEMBER):
    """
    رکورد عضویت فعال را برمی‌گرداند یا می‌سازد؛ رکورد خارج‌شده یا حذف‌نرم‌شده دوباره فعال می‌شود.
    خروجی: (رکورد، آیا تازه فعال شد)
    """
    now = timezone.now()
    rec, created = ConversationParticipant.all_objects.get_or_create(
        conversation=conversation, user=user,
        defaults={'role': role, 'joined_at': now},
    )
    if created:
        return rec, True
    changed = []
    reactivated = False
    if rec.is_deleted:
        rec.is_deleted = False
        changed.append('is_deleted')
    if rec.left_at is not None:
        rec.left_at = None
        rec.joined_at = now
        rec.role = role
        changed += ['left_at', 'joined_at', 'role']
        reactivated = True
    elif rec.joined_at is None:
        rec.joined_at = now
        changed.append('joined_at')
    if changed:
        rec.save(update_fields=changed + ['updated_at'])
    return rec, reactivated


def add_member(conversation, user, role=ParticipantRole.MEMBER):
    """افزودن عضو فعال (رکورد + M2M). خروجی: True اگر کاربر پیش از این عضو فعال نبود."""
    was_active = conversation.participants.filter(id=user.id).exists()
    _rec, reactivated = ensure_member_record(conversation, user, role=role)
    if not was_active:
        conversation.participants.add(user)
    return reactivated or not was_active


def add_members(conversation, users, role=ParticipantRole.MEMBER):
    """
    افزودن گروهی اعضا با تعداد کوئری ثابت (ساخت گروه و افزودن عضو).
    خروجی: فهرست کاربرانی که پیش از این عضو فعال نبودند (برای پیام سیستمی).
    """
    users = list({u.id: u for u in users}.values())
    if not users:
        return []
    now = timezone.now()
    ids = [u.id for u in users]
    active_ids = set(conversation.participants.filter(id__in=ids).values_list('id', flat=True))
    existing = {
        r.user_id: r for r in ConversationParticipant.all_objects.filter(conversation=conversation, user_id__in=ids)
    }
    ConversationParticipant.all_objects.bulk_create([
        ConversationParticipant(conversation=conversation, user_id=i, role=role, joined_at=now)
        for i in ids if i not in existing
    ], ignore_conflicts=True)
    rejoined = {i for i, r in existing.items() if r.left_at is not None or r.is_deleted}
    if rejoined:
        ConversationParticipant.all_objects.filter(conversation=conversation, user_id__in=rejoined).update(
            left_at=None, is_deleted=False, joined_at=now, role=role, updated_at=now
        )
    ConversationParticipant.all_objects.filter(
        conversation=conversation, user_id__in=ids, joined_at__isnull=True
    ).update(joined_at=now, updated_at=now)
    conversation.participants.add(*ids)
    return [u for u in users if u.id not in active_ids or u.id in rejoined]


def remove_member(conversation, user):
    """حذف عضو فعال: رکورد فقط left_at می‌گیرد (پاک نمی‌شود) و کاربر از M2M برداشته می‌شود."""
    was_active = conversation.participants.filter(id=user.id).exists()
    ConversationParticipant.all_objects.filter(
        conversation=conversation, user=user, left_at__isnull=True
    ).update(left_at=timezone.now(), updated_at=timezone.now())
    if was_active:
        conversation.participants.remove(user)
    return was_active


def active_member_records(conversation):
    return ConversationParticipant.objects.filter(
        conversation=conversation, left_at__isnull=True,
        user__in=conversation.participants.all(),
    )


def member_role(conversation, user):
    """نقش عضو فعال یا None"""
    if not user or not user.is_authenticated:
        return None
    return active_member_records(conversation).filter(user=user).values_list('role', flat=True).first()


def leave_conversation(conversation, user):
    """
    خروج عضو از گروه. اگر مالک برود، قدیمی‌ترین مدیر گروه وگرنه قدیمی‌ترین عضو مالک می‌شود؛
    با رفتن آخرین عضو، گروه غیرفعال می‌شود (هیچ ردیفی پاک نمی‌شود).
    خروجی: کاربر مالک جدید یا None
    """
    role = member_role(conversation, user)
    remove_member(conversation, user)
    new_owner = None
    remaining = active_member_records(conversation)
    if not remaining.exists():
        if conversation.is_active:
            conversation.is_active = False
            conversation.save(update_fields=['is_active', 'updated_at'])
        return None
    if role == ParticipantRole.OWNER and not remaining.filter(role=ParticipantRole.OWNER).exists():
        successor = (
            remaining.filter(role=ParticipantRole.ADMIN).order_by('joined_at', 'id').first()
            or remaining.order_by('joined_at', 'id').first()
        )
        if successor:
            successor.role = ParticipantRole.OWNER
            successor.save(update_fields=['role', 'updated_at'])
            new_owner = successor.user
    return new_owner


def post_system_message(conversation, actor, text):
    """پیام سیستمی گروه (ساخت، افزودن، حذف، خروج، تغییر نام) و برودکست آن پس از commit"""
    from .broadcast import broadcast_message_ws
    msg = Message.objects.create(conversation=conversation, sender=actor, text=text, is_system=True)
    conversation.save(update_fields=['updated_at'])
    transaction.on_commit(lambda: broadcast_message_ws(msg))
    return msg
