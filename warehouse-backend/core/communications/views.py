import os
import re
import uuid
import logging
from django.db import transaction
from django.db.models import Q, Prefetch, Count, Subquery, OuterRef, Value, IntegerField
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
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
    MessageAttachment, GenericComment, ConversationType
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
    can_modify_message, can_access_comment_target, can_modify_comment
)
from .broadcast import (
    broadcast_message_ws, broadcast_comment_ws,
    broadcast_message_updated_ws, broadcast_read_receipt_ws
)
from common.warehouse_scope import can_access_warehouse
from django.apps import apps
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


class MessagePagination(LimitOffsetPagination):
    default_limit = 30
    max_limit = 100


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated, IsChatEnabled, IsConversationParticipantOrAdmin]
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy']:
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

        unread_count_subquery = Subquery(
            Message.objects.filter(
                conversation=OuterRef('pk')
            ).exclude(
                sender=user
            ).filter(
                Q(id__gt=Coalesce(participant_last_read_subquery, Value(0)))
            ).values('conversation').annotate(cnt=Count('id')).values('cnt')[:1],
            output_field=IntegerField()
        )

        qs = visible_conversations(user).select_related(
            'created_by'
        ).prefetch_related(
            'participants',
            last_msg_prefetch
        ).annotate(
            annotated_unread_count=Coalesce(unread_count_subquery, Value(0))
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
        target_user_id = request.data.get('target_user_id')

        # برای گفتگوی دو‌نفره: ابتدا بررسی وجود گفتگوی قبلی در تمام رکوردها (حتی بدون پیام) جهت جلوگیری از ایجاد رکورد تکراری
        if conv_type == ConversationType.DIRECT and target_user_id:
            try:
                target_user_id_int = int(target_user_id)
                existing = Conversation.objects.filter(
                    conv_type=ConversationType.DIRECT,
                    participants=request.user
                ).filter(
                    participants__id=target_user_id_int
                ).first()
                if existing:
                    out_serializer = self.get_serializer(existing)
                    return Response(out_serializer.data, status=status.HTTP_200_OK)
            except (ValueError, TypeError):
                pass

        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = self.request.user
        conv_type = serializer.validated_data.get('conv_type', ConversationType.DIRECT)

        # ساخت کانال اطلاعیه یا گروه کاری تنها توسط مدیران، سوپریوزرها یا کاربران دارای پرمیشن مجاز است
        if conv_type in [ConversationType.ANNOUNCEMENT, ConversationType.WAREHOUSE_GROUP]:
            is_manager = getattr(user, 'is_staff', False) or user.has_perm('warehouses.can_act_as_manager')
            if not is_manager and not user.is_superuser:
                raise PermissionDenied('شما مجاز به ایجاد گروه کاری یا کانال اطلاعیه نیستید')
            warehouse_id = serializer.validated_data.get('warehouse_id')
            if warehouse_id and not can_access_warehouse(user, warehouse_id):
                raise PermissionDenied('شما مجاز به ایجاد گفتگو برای این انبار نیستید')

        conv = serializer.save(created_by=user)
        conv.participants.add(user)
        ConversationParticipant.objects.get_or_create(conversation=conv, user=user)

        target_user_id = self.request.data.get('target_user_id')
        if target_user_id:
            try:
                target_user = User.objects.get(id=target_user_id)
                conv.participants.add(target_user)
                ConversationParticipant.objects.get_or_create(conversation=conv, user=target_user)
            except User.DoesNotExist:
                pass

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
            ConversationParticipant.objects.update_or_create(
                conversation=conversation,
                user=user,
                defaults={
                    'last_read_message': ref_msg,
                    'last_read_at': now
                }
            )
            # Dual-write جهت سازگاری عقبروی به صورت Bulk Create در یک کوئری سریع دیتابیسی
            unread_qs = conversation.messages.exclude(sender=user).exclude(read_by=user)
            if ref_msg:
                unread_qs = unread_qs.filter(
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

        # ارسال رویداد وب‌سوکت دو‌تیک خوانده‌شدن به اعضا
        broadcast_read_receipt_ws(conversation, user)

        return Response({'status': 'marked_read', 'conversation_id': str(conversation.id)})


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
        ).select_related('sender').prefetch_related('attachments').annotate(
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

        ct = ContentType.objects.filter(model=model_name.lower()).first()
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
        if client_temp_id and content_type_str and object_id and '.' in content_type_str:
            app_label, model = content_type_str.split('.', 1)
            ct = ContentType.objects.filter(app_label=app_label, model=model.lower()).first()
            if ct:
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

        # استخراج انبار مرتبط در صورت وجود — فقط اگر اپ انبار نصب باشد.
        # در نصب حسابداری‌تنها این بلوک بی‌صدا رد می‌شود تا چت خنثی بماند.
        wh = None
        if apps.is_installed('warehouses'):
            model_cls = ct.model_class()
            if model_cls:
                target = model_cls.objects.filter(id=object_id).first()
                if target:
                    if hasattr(target, 'warehouse') and target.warehouse:
                        wh = target.warehouse
                    elif hasattr(target, 'warehouse_id') and target.warehouse_id:
                        Warehouse = apps.get_model('warehouses', 'Warehouse')
                        wh = Warehouse.objects.filter(id=target.warehouse_id).first()

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
