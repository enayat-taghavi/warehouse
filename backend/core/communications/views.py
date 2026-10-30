import os
import re
import uuid
import logging
import mimetypes
from datetime import datetime, timezone as dt_timezone
from urllib.parse import quote
from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.db import transaction
from django.db.models import Q, Prefetch, Count, Subquery, OuterRef, Value, IntegerField, DateTimeField
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import AuditLog
from notifications.models import Notification
from .models import (
    Conversation, ConversationParticipant, Message,
    MessageAttachment, GenericComment, ConversationType, ParticipantRole
)
from .serializers import (
    ConversationSerializer, MessageSerializer,
    MessageAttachmentSerializer, GenericCommentSerializer, UserShortSerializer
)
from .permissions import (
    IsChatEnabled, IsConversationParticipantOrAdmin,
    IsMessageAuthor, IsCommentAuthor
)
from .access import (
    visible_conversations, can_read_conversation, can_post_to_conversation,
    can_modify_message, can_access_comment_target, can_modify_comment,
    is_chat_group_manager, resolve_comment_content_type
)
from .broadcast import (
    broadcast_message_ws, broadcast_comment_ws,
    broadcast_message_updated_ws, broadcast_message_deleted_ws, broadcast_read_receipt_ws,
    broadcast_membership_ws
)
from .membership import (
    add_member, add_members, remove_member, leave_conversation, member_role, active_member_records,
    ensure_member_record, post_system_message, display_name, MAX_GROUP_MEMBERS_PER_REQUEST
)
from rest_framework import serializers as drf_serializers
from common.warehouse_scope import can_access_warehouse
from settings_core.services import get_setting

logger = logging.getLogger(__name__)
User = get_user_model()


def record_audit_log(user, warehouse, module, action, severity, target_model, target_id, target_repr, before_state=None, after_state=None):
    """ثبت رویدادهای ممیزی و امنیتی چت و نظرات در مدل مرکزی AuditLog"""
    try:
        actor_name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip() if user else 'سیستم'
        actor_username = getattr(user, 'username', '') if user else 'system'
        wh_id = getattr(warehouse, 'id', warehouse) if warehouse is not None else None
        AuditLog.objects.create(
            user=user if getattr(user, 'is_authenticated', False) else None,
            actor_username=actor_username,
            actor_name=actor_name,
            warehouse_id=wh_id,
            module=module,
            action=action,
            severity=severity,
            target_model=target_model,
            target_object_id=str(target_id) if target_id else '',
            target_repr=str(target_repr)[:255] if target_repr else '',
            before_state=before_state,
            after_state=after_state
        )
    except Exception as e:
        logger.warning(f"[AuditLog] Failed to record audit log: {e}")

DISALLOWED_EXTENSIONS = {
    '.html', '.htm', '.svg', '.exe', '.bat', '.sh', '.js', '.php',
    '.py', '.vbs', '.msi', '.cmd', '.scr', '.pif'
}


def validate_uploaded_file(file_obj):
    """
    اعتبارسنجی نوع فایل، پسوند و هدر بایت‌ها (Magic Bytes) جهت ممانعت از حملات XSS و آپلود اسکریپت
    """
    ext = os.path.splitext(file_obj.name)[1].lower()
    if not ext or ext in DISALLOWED_EXTENSIONS:
        return False, "آپلود فایل‌های اجرایی، اسکریپت، HTML یا SVG مجاز نیست"

    pos = file_obj.tell()
    file_obj.seek(0)
    header = file_obj.read(1024)
    file_obj.seek(pos)

    # اعتبارسنجی هدرهای مشخص
    if ext == '.png' and not header.startswith(b'\x89PNG\r\n\x1a\n'):
        return False, "محتوای فایل با ساختار استاندارد PNG تطابق ندارد"
    if ext in ['.jpg', '.jpeg'] and not header.startswith(b'\xff\xd8\xff'):
        return False, "محتوای فایل با ساختار استاندارد JPEG تطابق ندارد"
    if ext == '.gif' and not (header.startswith(b'GIF87a') or header.startswith(b'GIF89a')):
        return False, "محتوای فایل با ساختار استاندارد GIF تطابق ندارد"
    if ext == '.webp' and not (header.startswith(b'RIFF') and b'WEBP' in header[:16]):
        return False, "محتوای فایل با ساختار استاندارد WebP تطابق ندارد"
    if ext == '.pdf' and not header.startswith(b'%PDF-'):
        return False, "محتوای فایل با ساختار استاندارد PDF تطابق ندارد"

    # بررسی عدم وجود تگ‌های مخرب اسکریپتی در محتوای هدر
    lower_header = header.lower()
    if b'<script' in lower_header or b'<html' in lower_header or b'<svg' in lower_header:
        return False, "فایل ارسالی حاوی کدهای غیرمجاز است"

    return True, None


class _UserIdsSerializer(drf_serializers.Serializer):
    """بدنهٔ افزودن عضو: {"user_ids": [..]} — اعداد مثبت، حداکثر MAX_GROUP_MEMBERS_PER_REQUEST"""
    user_ids = drf_serializers.ListField(
        child=drf_serializers.IntegerField(min_value=1), allow_empty=False,
        max_length=MAX_GROUP_MEMBERS_PER_REQUEST
    )


SAFE_INLINE_ATTACHMENT_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf')


class ChatAttachmentDownloadView(APIView):
    """
    دانلود محافظت‌شدهٔ پیوست چت (تصمیم ۷): در هر درخواست عضویت فعلی در گفتگو سنجیده می‌شود،
    پس عضو حذف‌شده دیگر فایل را نمی‌بیند. «نبودن» و «دسترسی نداشتن» یک پاسخ ۴۰۳ یکسان دارند.
    ?thumb=1 بندانگشتی را می‌دهد؛ ?download=1 همیشه به صورت attachment.
    """
    permission_classes = [permissions.IsAuthenticated, IsChatEnabled]

    def get(self, request, pk):
        att = MessageAttachment.objects.select_related('message__conversation').filter(
            pk=pk, message__is_deleted=False, message__conversation__is_deleted=False
        ).first()
        if att is None or not can_read_conversation(request.user, att.message.conversation):
            return Response({'detail': 'پیوست یافت نشد یا اجازهٔ دیدن آن را ندارید.'}, status=status.HTTP_403_FORBIDDEN)

        want_thumb = request.query_params.get('thumb') == '1'
        field = att.thumbnail if want_thumb else att.file
        if not field or not field.name:
            raise Http404
        name = att.file_name or os.path.basename(field.name)
        if want_thumb:
            name = os.path.basename(field.name)
        # نوع محتوا از پسوند فایل ذخیره‌شده (نه از هدر ارسالی کلاینت)
        stored_ext = os.path.splitext(field.name)[1].lower()
        content_type = mimetypes.guess_type(field.name)[0] or 'application/octet-stream'
        if getattr(settings, 'MEDIA_ACCEL_REDIRECT', False):
            response = HttpResponse(content_type=content_type)
            response['X-Accel-Redirect'] = f'/internal_media/{quote(field.name)}'
        else:
            try:
                response = FileResponse(field.open('rb'), content_type=content_type)
            except FileNotFoundError:
                raise Http404
        inline = request.query_params.get('download') != '1' and stored_ext in SAFE_INLINE_ATTACHMENT_EXTENSIONS
        disposition = 'inline' if inline else 'attachment'
        response['Content-Disposition'] = (
            f"{disposition}; filename=\"file{stored_ext}\"; filename*=UTF-8''{quote(name.encode('utf-8'))}")
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'private, no-store'
        return response


class MessagePagination(LimitOffsetPagination):
    default_limit = 30
    max_limit = 100


# اکشن‌های جزئی که شیء را مستقیم (نه از فهرست قابل مشاهده) می‌گیرند؛ دسترسی با object permission سنجیده می‌شود
DETAIL_CONVERSATION_ACTIONS = (
    'retrieve', 'update', 'partial_update', 'destroy', 'members', 'member_detail', 'leave', 'mute',
    'read_status'
)


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated, IsChatEnabled, IsConversationParticipantOrAdmin]
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        if self.action in DETAIL_CONVERSATION_ACTIONS:
            return Conversation.objects.all().select_related('created_by').prefetch_related('participants')

        user = self.request.user
        wh_id = self.request.query_params.get('warehouse_id')

        last_msg_prefetch = Prefetch(
            'messages',
            queryset=Message.objects.select_related('sender').prefetch_related('attachments').order_by('-created_at', '-id'),
            to_attr='prefetched_messages'
        )

        # محاسبه بهینه تعداد پیام‌های نخوانده با استفاده از ConversationParticipant بدون اتکا به جدول حجیم ManyToMany
        # توجه: ارجاع باید به conversation_id پیام بیرونی باشد، نه pk (چون pk به شناسه خود Message ارجاع می‌دهد)
        participant_last_read_subquery = Subquery(
            ConversationParticipant.objects.filter(
                conversation_id=OuterRef('conversation_id'),
                user=user
            ).values('last_read_message_id')[:1]
        )
        # عضوی که بعداً اضافه شده: نخوانده‌ها از زمان پیوستن شمرده می‌شوند، نه کل تاریخچه (E4)
        participant_joined_subquery = Subquery(
            ConversationParticipant.objects.filter(
                conversation_id=OuterRef('conversation_id'),
                user=user
            ).values('joined_at')[:1],
            output_field=DateTimeField()
        )
        # خوانندهٔ ضمنی اطلاعیه (بدون ردیف عضویت): مبنا زمان عضویت کاربر در سامانه، نه کل تاریخچه (E4)
        baseline = getattr(user, 'date_joined', None) or datetime(1970, 1, 1, tzinfo=dt_timezone.utc)

        unread_count_subquery = Subquery(
            Message.objects.filter(
                conversation=OuterRef('pk')
            ).exclude(
                sender=user
            ).filter(
                Q(id__gt=Coalesce(participant_last_read_subquery, Value(0))),
                Q(created_at__gte=Coalesce(participant_joined_subquery, Value(baseline, output_field=DateTimeField())))
            ).values('conversation').annotate(cnt=Count('id')).values('cnt')[:1],
            output_field=IntegerField()
        )
        my_role_subquery = Subquery(
            ConversationParticipant.objects.filter(
                conversation_id=OuterRef('pk'), user=user, left_at__isnull=True
            ).values('role')[:1]
        )

        qs = visible_conversations(user).select_related(
            'created_by'
        ).prefetch_related(
            'participants',
            last_msg_prefetch
        ).annotate(
            annotated_unread_count=Coalesce(unread_count_subquery, Value(0)),
            annotated_my_role=my_role_subquery,
            annotated_is_muted=Coalesce(Subquery(
                ConversationParticipant.objects.filter(
                    conversation_id=OuterRef('pk'), user=user, left_at__isnull=True
                ).values('is_muted')[:1]
            ), Value(False))
        )

        if wh_id:
            try:
                wh_id_int = int(wh_id)
                qs = qs.filter(Q(warehouse_id=wh_id_int) | Q(warehouse_id__isnull=True))
            except ValueError:
                pass

        # فیلتر کردن چت‌های دو‌نفره خالی که هیچ پیامی در آن‌ها ارسال نشده است
        qs = qs.exclude(conv_type=ConversationType.DIRECT, messages__isnull=True)

        return qs.order_by('-updated_at')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conv_type = serializer.validated_data.get('conv_type', ConversationType.DIRECT)
        if conv_type == ConversationType.DIRECT:
            return self._create_direct(serializer)

        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def _create_direct(self, serializer):
        """
        گفتگوی دو‌نفره (E13): مخاطب فعال و غیر از خود کاربر الزامی است؛ گفتگوی قبلی (حتی بدون پیام) برگردانده می‌شود.
        قفل ردیف دو کاربر به ترتیب شناسه، بررسی و ساخت را در برابر درخواست هم‌زمان (هر دو طرف) یکتا می‌کند.
        """
        user = self.request.user
        target_id = serializer.validated_data.get('target_user_id')
        if not target_id or target_id == user.id:
            raise ValidationError({'target_user_id': 'مخاطب گفتگوی دو‌نفره الزامی است'})
        with transaction.atomic():
            locked = list(
                User.objects.select_for_update().filter(id__in=sorted({user.id, target_id})).order_by('id')
            )
            target_user = next((u for u in locked if u.id == target_id and u.is_active), None)
            if target_user is None:
                raise ValidationError({'target_user_id': 'کاربر مخاطب یافت نشد یا غیرفعال است'})
            existing = Conversation.objects.filter(
                conv_type=ConversationType.DIRECT, participants=user
            ).filter(participants=target_user).order_by('created_at', 'id').first()
            if existing:
                return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)
            conv = serializer.save(created_by=user, conv_type=ConversationType.DIRECT, warehouse_id=None)
            add_member(conv, user)
            add_member(conv, target_user)
        out = self.get_serializer(conv)
        return Response(out.data, status=status.HTTP_201_CREATED, headers=self.get_success_headers(out.data))

    def perform_create(self, serializer):
        user = self.request.user
        conv_type = serializer.validated_data.get('conv_type', ConversationType.DIRECT)

        # ساخت گروه یا کانال اطلاعیه تنها توسط مدیران گروه چت (سوپرکاربر، is_staff، قابلیت chat_group_manager)
        if conv_type in [ConversationType.ANNOUNCEMENT, ConversationType.GROUP]:
            if not is_chat_group_manager(user):
                raise PermissionDenied('شما مجاز به ایجاد گروه یا کانال اطلاعیه نیستید')

        if conv_type == ConversationType.GROUP:
            self._create_group(serializer)
            return

        if conv_type == ConversationType.ANNOUNCEMENT:
            warehouse_id = serializer.validated_data.get('warehouse_id')
            if warehouse_id and not can_access_warehouse(user, warehouse_id):
                raise PermissionDenied('شما مجاز به ایجاد گفتگو برای این انبار نیستید')

        # فقط اطلاعیه به اینجا می‌رسد؛ دو‌نفره در _create_direct و گروه در _create_group ساخته می‌شود
        conv = serializer.save(created_by=user)
        add_member(conv, user, role=ParticipantRole.OWNER)

    @staticmethod
    def _resolve_member_users(raw_ids):
        """شناسه‌های اعضا: عدد، یکتا، حداکثر MAX_GROUP_MEMBERS_PER_REQUEST، کاربر موجود و فعال (تصمیم ۳)"""
        ids = list(dict.fromkeys(int(i) for i in (raw_ids or [])))
        if len(ids) > MAX_GROUP_MEMBERS_PER_REQUEST:
            raise ValidationError({'user_ids': f'حداکثر {MAX_GROUP_MEMBERS_PER_REQUEST} عضو در هر درخواست مجاز است'})
        users = list(User.objects.filter(id__in=ids, is_active=True))
        found = {u.id for u in users}
        missing = [i for i in ids if i not in found]
        if missing:
            raise ValidationError({'user_ids': 'برخی کاربران یافت نشدند یا غیرفعال هستند', 'invalid_ids': missing})
        return users

    def _create_group(self, serializer):
        user = self.request.user
        members = self._resolve_member_users(serializer.validated_data.get('member_ids'))
        with transaction.atomic():
            # گروه به انبار وابسته نیست؛ عضویت فقط با فهرست اعضا تعیین می‌شود (U1)
            conv = serializer.save(created_by=user, warehouse_id=None)
            add_members(conv, [user], role=ParticipantRole.OWNER)
            add_members(conv, [m for m in members if m.id != user.id])
            post_system_message(conv, user, f"{display_name(user)} گروه «{conv.title}» را ساخت")
        transaction.on_commit(lambda: broadcast_membership_ws(conv))

    def perform_update(self, serializer):
        instance = serializer.instance
        old_title = instance.title
        with transaction.atomic():
            conv = serializer.save()
            if conv.conv_type == ConversationType.GROUP and conv.title != old_title:
                post_system_message(
                    conv, self.request.user,
                    f"{display_name(self.request.user)} نام گروه را به «{conv.title}» تغییر داد"
                )
        if conv.conv_type == ConversationType.GROUP:
            transaction.on_commit(lambda: broadcast_membership_ws(conv))

    # ─── عملیات عضویت گروه (U1) ───

    def _get_group(self, request):
        conv = self.get_object()
        if conv.conv_type != ConversationType.GROUP:
            raise ValidationError({'detail': 'این عملیات فقط برای گروه‌ها مجاز است'})
        return conv

    @staticmethod
    def _member_payload(rec):
        u = rec.user
        return {
            'id': u.id,
            'username': u.username,
            'first_name': u.first_name,
            'last_name': u.last_name,
            'full_name': display_name(u),
            'role': rec.role,
            'joined_at': rec.joined_at.isoformat() if rec.joined_at else None,
        }

    @action(detail=True, methods=['get', 'post'], url_path='members')
    def members(self, request, pk=None):
        conv = self._get_group(request)
        if request.method == 'GET':
            recs = active_member_records(conv).select_related('user').order_by('joined_at', 'id')
            return Response([self._member_payload(r) for r in recs])

        actor_role = member_role(conv, request.user)
        if actor_role not in (ParticipantRole.OWNER, ParticipantRole.ADMIN):
            raise PermissionDenied('فقط مالک یا مدیر گروه می‌تواند عضو اضافه کند')
        ids_ser = _UserIdsSerializer(data=request.data)
        ids_ser.is_valid(raise_exception=True)
        users = self._resolve_member_users(ids_ser.validated_data['user_ids'])
        with transaction.atomic():
            Conversation.objects.select_for_update().filter(pk=conv.pk).first()
            added = add_members(conv, users)
            if added:
                names = '، '.join(display_name(u) for u in added)
                post_system_message(conv, request.user, f"{display_name(request.user)}، {names} را اضافه کرد")
        if added:
            transaction.on_commit(lambda: broadcast_membership_ws(conv))
        recs = active_member_records(conv).select_related('user').filter(user__in=added)
        return Response({'added': [self._member_payload(r) for r in recs]}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['delete', 'patch'], url_path=r'members/(?P<user_id>\d+)')
    def member_detail(self, request, pk=None, user_id=None):
        conv = self._get_group(request)
        actor_role = member_role(conv, request.user)
        target_id = int(user_id)
        if target_id == request.user.id:
            raise ValidationError({'detail': 'برای خروج از گروه از گزینهٔ «ترک گروه» استفاده کنید'})
        target_rec = active_member_records(conv).select_related('user').filter(user_id=target_id).first()

        if request.method == 'PATCH':
            # تغییر نقش فقط توسط مالک: member ⇄ admin
            if actor_role != ParticipantRole.OWNER:
                raise PermissionDenied('فقط مالک گروه می‌تواند نقش اعضا را تغییر دهد')
            if target_rec is None:
                raise ValidationError({'detail': 'این کاربر عضو گروه نیست'})
            new_role = request.data.get('role')
            if new_role not in (ParticipantRole.ADMIN, ParticipantRole.MEMBER):
                raise ValidationError({'role': 'نقش باید admin یا member باشد'})
            if target_rec.role != new_role:
                target_rec.role = new_role
                target_rec.save(update_fields=['role', 'updated_at'])
                transaction.on_commit(lambda: broadcast_membership_ws(conv))
            return Response(self._member_payload(target_rec))

        if actor_role not in (ParticipantRole.OWNER, ParticipantRole.ADMIN):
            raise PermissionDenied('فقط مالک یا مدیر گروه می‌تواند عضو حذف کند')
        if target_rec is None:
            raise ValidationError({'detail': 'این کاربر عضو گروه نیست'})
        # مدیر گروه نمی‌تواند مالک یا مدیر دیگری را حذف کند
        if actor_role == ParticipantRole.ADMIN and target_rec.role in (ParticipantRole.OWNER, ParticipantRole.ADMIN):
            raise PermissionDenied('مدیر گروه نمی‌تواند مالک یا مدیر دیگر را حذف کند')
        target_user = target_rec.user
        with transaction.atomic():
            remove_member(conv, target_user)
            post_system_message(
                conv, request.user, f"{display_name(request.user)}، {display_name(target_user)} را حذف کرد"
            )
        transaction.on_commit(lambda: broadcast_membership_ws(conv, removed_user_ids=[target_user.id]))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='leave')
    def leave(self, request, pk=None):
        conv = self._get_group(request)
        user = request.user
        with transaction.atomic():
            Conversation.objects.select_for_update().filter(pk=conv.pk).first()
            # پیام سیستمی پیش از خروج ثبت می‌شود تا اعضای باقی‌مانده آن را بگیرند
            post_system_message(conv, user, f"{display_name(user)} گروه را ترک کرد")
            new_owner = leave_conversation(conv, user)
        transaction.on_commit(lambda: broadcast_membership_ws(conv, removed_user_ids=[user.id]))
        return Response({
            'status': 'left',
            'conversation_id': str(conv.id),
            'new_owner_id': new_owner.id if new_owner else None,
        })

    @action(detail=True, methods=['post'], url_path='mute')
    def mute(self, request, pk=None):
        conv = self.get_object()
        if not conv.participants.filter(id=request.user.id).exists():
            raise ValidationError({'detail': 'فقط اعضای گفتگو می‌توانند آن را بی‌صدا کنند'})
        muted = request.data.get('muted')
        if isinstance(muted, str):
            muted = muted.strip().lower() in ('1', 'true', 'yes')
        elif not isinstance(muted, bool):
            raise ValidationError({'muted': 'مقدار muted باید true یا false باشد'})
        rec, _ = ensure_member_record(conv, request.user)
        if rec.is_muted != muted:
            rec.is_muted = muted
            rec.save(update_fields=['is_muted', 'updated_at'])
        return Response({'conversation_id': str(conv.id), 'muted': muted})

    def perform_destroy(self, instance):
        record_audit_log(
            user=self.request.user,
            warehouse=instance.warehouse,
            module='system',
            action='DELETE',
            severity='warning',
            target_model='Conversation',
            target_id=instance.id,
            target_repr=f"حذف گفتگوی {instance}",
            before_state={'id': str(instance.id), 'title': instance.title, 'conv_type': instance.conv_type}
        )
        instance.soft_delete()

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_as_read(self, request, pk=None):
        conversation = self.get_object()
        user = request.user

        if not can_read_conversation(user, conversation):
            raise PermissionDenied('دسترسی غیرمجاز به این گفتگو')

        until_msg_id = request.data.get('until_message_id')

        with transaction.atomic():
            if until_msg_id:
                try:
                    ref_msg = conversation.messages.filter(id=int(until_msg_id)).first()
                except (ValueError, TypeError):
                    ref_msg = None
            else:
                ref_msg = conversation.messages.order_by('-id').first()

            now = timezone.now()
            rec, _created = ConversationParticipant.all_objects.select_for_update().get_or_create(
                conversation=conversation, user=user
            )
            current = rec.last_read_message
            # نشانگر خواندن فقط جلو می‌رود (E11)
            advanced = ref_msg is not None and (current is None or ref_msg.id > current.id)
            if advanced:
                rec.last_read_message = ref_msg
            rec.last_read_at = now
            rec.save(update_fields=['last_read_message', 'last_read_at', 'updated_at'])
            effective = rec.last_read_message

            # Dual-write جهت سازگاری عقبروی به صورت Bulk Create در یک کوئری سریع دیتابیسی
            if advanced:
                unread_qs = conversation.messages.exclude(sender=user).exclude(read_by=user).filter(
                    Q(created_at__lt=ref_msg.created_at) |
                    Q(created_at=ref_msg.created_at, id__lte=ref_msg.id)
                )
                unread_msg_ids = list(unread_qs.values_list('id', flat=True))
                if unread_msg_ids:
                    through_model = Message.read_by.through
                    fk_to_message = [f for f in through_model._meta.fields if f.related_model == Message][0].name
                    fk_to_user = [f for f in through_model._meta.fields if f.related_model == User][0].name
                    entries = [through_model(**{fk_to_message: Message(id=mid), fk_to_user: user}) for mid in unread_msg_ids]
                    through_model.objects.bulk_create(entries, ignore_conflicts=True)

        # ارسال رویداد وب‌سوکت دو‌تیک خوانده‌شدن به اعضا و دستگاه‌های دیگر خود خواننده (E11، E26)
        if advanced:
            broadcast_read_receipt_ws(conversation, user, effective)

        return Response({
            'status': 'marked_read',
            'conversation_id': str(conversation.id),
            'last_read_message_id': str(effective.id) if effective else None,
        })

    @action(detail=True, methods=['get'], url_path='read_status')
    def read_status(self, request, pk=None):
        """
        وضعیت خواندن اعضا (U8): برای هر عضو فعال، آخرین پیام خوانده‌شده؛ کلاینت «خوانده‌شده توسط» را
        با مقایسهٔ شناسهٔ پیام می‌سازد. دو‌نفره و گروه فقط برای اعضا؛ اطلاعیه فقط برای کسی که حق ارسال دارد:
        سوپرکاربر فهرست خوانندگان را می‌بیند، بقیه فقط تعداد (نشت نام کاربران شرکت‌های دیگر نه).
        """
        conversation = self.get_object()
        user = request.user
        if not can_read_conversation(user, conversation):
            raise PermissionDenied('دسترسی غیرمجاز به این گفتگو')
        if conversation.conv_type == ConversationType.ANNOUNCEMENT:
            if not can_post_to_conversation(user, conversation):
                raise PermissionDenied('فقط مدیران کانال اطلاعیه وضعیت خواندن را می‌بینند')
            records = ConversationParticipant.objects.filter(
                conversation=conversation, left_at__isnull=True, last_read_message__isnull=False,
                user__is_active=True
            )
            if not user.is_superuser:
                # خوانندگان اطلاعیه ممکن است از شرکت‌های دیگر باشند: غیرسوپرکاربر فقط تعداد را می‌بیند
                return Response({
                    'conversation_id': str(conversation.id),
                    'read_count': records.count(),
                    'members': [],
                })
        else:
            records = active_member_records(conversation)
        records = list(records.select_related('user').order_by('user_id'))
        return Response({
            'conversation_id': str(conversation.id),
            'read_count': sum(1 for r in records if r.last_read_message_id),
            'members': [
                {
                    'user_id': r.user_id,
                    'name': display_name(r.user),
                    'last_read_message_id': str(r.last_read_message_id) if r.last_read_message_id else None,
                    'last_read_at': r.last_read_at.isoformat() if r.last_read_at else None,
                }
                for r in records
            ],
        })


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated, IsChatEnabled, IsMessageAuthor]
    pagination_class = MessagePagination
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'chat_message'

    def get_throttles(self):
        if self.action == 'upload_attachment':
            self.throttle_scope = 'chat_upload'
        else:
            self.throttle_scope = 'chat_message'
        return super().get_throttles()

    def get_queryset(self):
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy']:
            return Message.objects.all().select_related('sender', 'conversation').prefetch_related('attachments')

        conv_id = self.request.query_params.get('conversation_id')
        if not conv_id:
            return Message.objects.none()

        try:
            conversation = Conversation.objects.get(id=conv_id)
        except (Conversation.DoesNotExist, ValueError):
            return Message.objects.none()

        # بررسی دسترسی خواندن گفتگو
        if not can_read_conversation(self.request.user, conversation):
            return Message.objects.none()

        qs = Message.objects.filter(
            conversation=conversation
        ).select_related('sender', 'reply_to__sender').prefetch_related('attachments').annotate(
            annotated_read_by_count=Count('read_by', distinct=True)
        )

        since_id = self.request.query_params.get('since_id')
        if since_id:
            try:
                ref_msg = Message.objects.get(id=since_id, conversation=conversation)
                qs = qs.filter(
                    Q(created_at__gt=ref_msg.created_at) |
                    Q(created_at=ref_msg.created_at, id__gt=ref_msg.id)
                )
            except (Message.DoesNotExist, ValueError):
                pass

        # مکان‌نمای پیام‌های قدیمی‌تر (E21): پیام‌های در انتظار/ناموفق کلاینت جابه‌جایی نمی‌سازند؛ offset برای سازگاری می‌ماند
        before_id = self.request.query_params.get('before_id')
        if before_id:
            try:
                ref_msg = Message.all_objects.get(id=before_id, conversation=conversation)
            except (Message.DoesNotExist, ValueError, DjangoValidationError):
                return Message.objects.none()
            qs = qs.filter(
                Q(created_at__lt=ref_msg.created_at) |
                Q(created_at=ref_msg.created_at, id__lt=ref_msg.id)
            )

        return qs.order_by('-created_at', '-id')

    def create(self, request, *args, **kwargs):
        client_temp_id = request.data.get('client_temp_id')
        conv_id = request.data.get('conversation')
        if client_temp_id and conv_id:
            try:
                existing = Message.objects.filter(
                    conversation_id=conv_id,
                    sender=request.user,
                    client_temp_id=client_temp_id
                ).first()
                if existing:
                    serializer = self.get_serializer(existing)
                    return Response(serializer.data, status=status.HTTP_200_OK)
            except (ValueError, TypeError):
                pass
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        conv_id = self.request.data.get('conversation')
        if not conv_id:
            raise ValidationError({'conversation': 'شناسه گفتگو الزامی است'})

        try:
            conversation = Conversation.objects.get(id=conv_id)
        except (Conversation.DoesNotExist, ValueError):
            raise ValidationError({'conversation': 'گفتگوی مورد نظر یافت نشد'})

        if not can_post_to_conversation(user, conversation):
            raise PermissionDenied('شما مجاز به ارسال پیام در این گفتگو نیستید')

        msg = serializer.save(sender=user, conversation=conversation, is_system=False)
        conversation.save(update_fields=['updated_at'])
        
        # خروج برودکست از چرخه مسدودکننده Request و اجرای امن پس از Commit تراکنش
        req = self.request
        transaction.on_commit(lambda: broadcast_message_ws(msg, req))

    def perform_update(self, serializer):
        instance = self.get_object()
        before_state = {'text': instance.text}
        msg = serializer.save()
        after_state = {'text': msg.text}
        record_audit_log(
            user=self.request.user,
            warehouse=msg.conversation.warehouse if msg.conversation else None,
            module='docs',
            action='UPDATE',
            severity='info',
            target_model='Message',
            target_id=msg.id,
            target_repr=f"ویرایش پیام #{msg.id}",
            before_state=before_state,
            after_state=after_state
        )
        broadcast_message_updated_ws(msg, self.request)

    def perform_destroy(self, instance):
        record_audit_log(
            user=self.request.user,
            warehouse=instance.conversation.warehouse if instance.conversation else None,
            module='docs',
            action='DELETE',
            severity='warning',
            target_model='Message',
            target_id=instance.id,
            target_repr=f"حذف پیام #{instance.id} توسط {self.request.user}",
            before_state={'id': str(instance.id), 'text': instance.text}
        )
        instance.soft_delete()
        # خبر زندهٔ حذف به همهٔ خوانندگان و دستگاه‌های خود حذف‌کننده (E12)
        conversation, message_id = instance.conversation, instance.id
        transaction.on_commit(lambda: broadcast_message_deleted_ws(conversation, message_id))

    @action(detail=False, methods=['post'], url_path='upload')
    def upload_attachment(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'فایلی ارسال نشده است'}, status=status.HTTP_400_BAD_REQUEST)

        # اعتبارسنجی حجم فایل (حداکثر ۱۰ مگابایت)
        if file_obj.size > 10 * 1024 * 1024:
            return Response({'error': 'حجم فایل نباید بیش از ۱۰ مگابایت باشد'}, status=status.HTTP_400_BAD_REQUEST)

        # اعتبارسنجی ساختار و نوع فایل
        is_valid, err_msg = validate_uploaded_file(file_obj)
        if not is_valid:
            return Response({'error': err_msg}, status=status.HTTP_400_BAD_REQUEST)

        msg_id = request.data.get('message_id')
        if not msg_id:
            return Response({'error': 'شناسه پیام الزامی است'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            msg = Message.objects.get(id=msg_id)
        except (Message.DoesNotExist, ValueError):
            return Response({'error': 'پیام یافت نشد'}, status=status.HTTP_404_NOT_FOUND)

        # تنها فرستنده پیام یا سوپریوزر مجاز به افزودن پیوست است
        if not can_modify_message(request.user, msg):
            raise PermissionDenied('شما مجاز به الصاق فایل به پیام دیگران نیستید')

        # بررسی فعال بودن قابلیت اشتراک فایل در تنظیمات
        wh_id = msg.conversation.warehouse_id if msg.conversation else None
        if not get_setting('chat_file_sharing', warehouse_id=wh_id):
            raise PermissionDenied('قابلیت ارسال فایل در این انبار غیرفعال است')

        # تولید نام یکتای UUID برای فایل روی دیسک
        original_name = file_obj.name
        ext = os.path.splitext(original_name)[1].lower()
        file_obj.name = f"{uuid.uuid4().hex}{ext}"

        # ساخت رکورد پیوست
        attachment = MessageAttachment.objects.create(
            message=msg,
            file=file_obj,
            file_name=original_name,
            file_size=file_obj.size,
            content_type=file_obj.content_type or 'application/octet-stream'
        )

        broadcast_message_updated_ws(msg, request)
        return Response(MessageAttachmentSerializer(attachment, context={'request': request}).data, status=status.HTTP_201_CREATED)


class GenericCommentViewSet(viewsets.ModelViewSet):
    serializer_class = GenericCommentSerializer
    permission_classes = [permissions.IsAuthenticated, IsCommentAuthor]
    pagination_class = LimitOffsetPagination
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'chat_comments'

    def get_queryset(self):
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy']:
            return GenericComment.objects.all().select_related('author')

        model_name = self.request.query_params.get('model_name')
        object_id = self.request.query_params.get('object_id')

        # ارسال model_name و object_id برای دریافت کامنت‌ها اجباری است
        if not model_name or not object_id:
            raise ValidationError({'detail': 'پارامترهای model_name و object_id الزامی هستند'})

        # فقط مدل‌های فهرست مجاز و با حل بی‌ابهام (app_label.model یا نام یکتای مدل) — E6
        ct = resolve_comment_content_type(model_name)
        if not ct:
            raise ValidationError({'model_name': 'نوع موجودیت نامعتبر است'})

        # بررسی دسترسی کاربر به شیء هدف
        if not can_access_comment_target(self.request.user, ct, str(object_id)):
            return GenericComment.objects.none()

        return GenericComment.objects.filter(
            content_type=ct,
            object_id=str(object_id)
        ).select_related('author').prefetch_related('mentioned_users').order_by('created_at')

    def create(self, request, *args, **kwargs):
        client_temp_id = request.data.get('client_temp_id')
        content_type_str = request.data.get('content_type_str', '')
        object_id = request.data.get('object_id')
        if client_temp_id and content_type_str and object_id and '.' in str(content_type_str):
            # همان فهرست مجاز و همان بررسی دسترسی مسیر عادی، پیش از برگرداندن نظر موجود
            ct = resolve_comment_content_type(str(content_type_str))
            if ct and can_access_comment_target(request.user, ct, str(object_id)):
                existing = GenericComment.objects.filter(
                    content_type=ct,
                    object_id=str(object_id),
                    author=request.user,
                    client_temp_id=client_temp_id
                ).first()
                if existing:
                    serializer = self.get_serializer(existing)
                    return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        ct = serializer.validated_data.get('content_type')
        object_id = serializer.validated_data.get('object_id')

        if not can_access_comment_target(user, ct, object_id):
            raise PermissionDenied('شما به موجودیت هدف این کامنت دسترسی ندارید')

        # استخراج انبار مرتبط در صورت وجود (بدون وابستگی مستقیم به اپ انبار)
        wh = None
        model_cls = ct.model_class()
        if model_cls:
            target = model_cls.objects.filter(id=object_id).first()
            if target:
                if hasattr(target, 'warehouse') and target.warehouse:
                    wh = target.warehouse
                elif hasattr(target, 'warehouse_id') and target.warehouse_id:
                    from platform_core.registry import resolve_entity
                    wh = resolve_entity('warehouse', target.warehouse_id)

        comment = serializer.save(author=user, warehouse_id=getattr(wh, 'id', wh) if wh else None)

        # مدیریت منشن‌ها با استخراج توکن‌های استاندارد @[id:username] و @username
        mentioned_ids = set()
        req_ids = self.request.data.get('mentioned_user_ids', [])
        if isinstance(req_ids, list):
            for i in req_ids:
                try:
                    mentioned_ids.add(int(i))
                except (ValueError, TypeError):
                    pass

        # استخراج توکن استاندارد @[id:username] یا @[id]
        text = comment.text or ''
        for match in re.finditer(r'@\[(\d+)(?::[^\]]*)?\]', text):
            try:
                mentioned_ids.add(int(match.group(1)))
            except (ValueError, TypeError):
                pass

        # استخراج نام‌های کاربری @username
        for match in re.finditer(r'@([a-zA-Z0-9_\.]+)', text):
            uname = match.group(1)
            found_u = User.objects.filter(username=uname, is_active=True).first()
            if found_u:
                mentioned_ids.add(found_u.id)

        if mentioned_ids:
            users = User.objects.filter(id__in=mentioned_ids, is_active=True)
            valid_users = [u for u in users if can_access_comment_target(u, ct, object_id)]
            comment.mentioned_users.set(valid_users)

            # ثبت ممیزی و اعلان پایدار برای کاربران منشن‌شده
            author_display = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username
            for u in valid_users:
                if u.id != user.id:
                    record_audit_log(
                        user=user,
                        warehouse=wh,
                        module='docs',
                        action='MENTION',
                        severity='info',
                        target_model=ct.model,
                        target_id=object_id,
                        target_repr=f"منشن کاربر {u.username} در نظر #{comment.id} توسط {user.username}"
                    )
                    Notification.objects.create(
                        recipient=u,
                        title=f"منشن جدید از طرف {author_display}",
                        message=f"{author_display} شما را در نظرات {ct.model} #{object_id} منشن کرد: {comment.text[:120]}",
                        notification_type='mention',
                        target_model=ct.model,
                        target_id=str(object_id),
                        is_read=False
                    )

        broadcast_comment_ws(comment, self.request)

    def perform_update(self, serializer):
        instance = self.get_object()
        before_state = {'text': instance.text}
        comment = serializer.save()
        after_state = {'text': comment.text}
        record_audit_log(
            user=self.request.user,
            warehouse=comment.warehouse,
            module='docs',
            action='UPDATE',
            severity='info',
            target_model='GenericComment',
            target_id=comment.id,
            target_repr=f"ویرایش نظر #{comment.id}",
            before_state=before_state,
            after_state=after_state
        )

    def perform_destroy(self, instance):
        record_audit_log(
            user=self.request.user,
            warehouse=instance.warehouse,
            module='docs',
            action='DELETE',
            severity='warning',
            target_model='GenericComment',
            target_id=instance.id,
            target_repr=f"حذف نظر #{instance.id}",
            before_state={'id': str(instance.id), 'text': instance.text}
        )
        instance.soft_delete()


class ChatContactsListView(APIView):
    """
    فهرست مخاطبین مجاز جهت گفتگوی سازمانی (تمام کاربران فعال سیستم به جز خود کاربر)
    """
    permission_classes = [permissions.IsAuthenticated, IsChatEnabled]

    def get(self, request):
        user = request.user
        qs = User.objects.filter(is_active=True).exclude(id=user.id).distinct().order_by('first_name', 'last_name', 'username')
        data = UserShortSerializer(qs, many=True).data
        return Response(data)


class ChatCapabilitiesView(APIView):
    """قابلیت‌های چت کاربر جاری برای ظاهر (مثلاً نمایش دکمهٔ «گروه جدید»)"""
    permission_classes = [permissions.IsAuthenticated, IsChatEnabled]

    def get(self, request):
        return Response({'can_create_group': is_chat_group_manager(request.user)})
