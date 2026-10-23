import json
import logging
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework_simplejwt.tokens import AccessToken

from .models import Conversation
from .access import can_read_conversation, can_access_comment_target
from .presence import add_online_user, remove_online_user, get_online_users
from common.warehouse_scope import can_access_warehouse

logger = logging.getLogger(__name__)
User = get_user_model()


@database_sync_to_async
def get_user_from_token(token_str):
    """
    اعتبارسنجی و استخراج کاربر از توکن JWT
    """
    try:
        access_token = AccessToken(token_str)
        user_id = access_token['user_id']
        return User.objects.get(id=user_id, is_active=True)
    except Exception as e:
        logger.debug(f"[WebSocketAuth] Token decode error: {e}")
        return None


@database_sync_to_async
def check_can_read_conversation(user, conv_id):
    """
    بررسی دسترسی کاربر به گفتگوی مشخص
    """
    try:
        conv = Conversation.objects.get(id=conv_id)
        return can_read_conversation(user, conv)
    except (Conversation.DoesNotExist, ValueError):
        return False


@database_sync_to_async
def check_can_access_warehouse(user, wh_id):
    """
    بررسی دسترسی کاربر به انبار
    """
    try:
        return can_access_warehouse(user, int(wh_id))
    except (ValueError, TypeError):
        return False


@database_sync_to_async
def check_can_access_comment_target(user, model_name, object_id):
    """
    بررسی دسترسی کاربر به موجودیت هدف کامنت
    """
    try:
        ct = ContentType.objects.filter(model=model_name.lower()).first()
        if not ct:
            return False
        return can_access_comment_target(user, ct, str(object_id))
    except Exception:
        return False


@database_sync_to_async
def check_is_chat_enabled(wh_id=None):
    """
    بررسی فعال بودن چت در تنظیمات سیستم
    """
    try:
        wh_id_int = int(wh_id) if wh_id else None
    except (ValueError, TypeError):
        wh_id_int = None
    from settings_core.services import get_setting
    return bool(get_setting('chat_enabled', warehouse_id=wh_id_int))


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        params = parse_qs(query_string)
        token = params.get('token', [None])[0]

        self.wh_id = params.get('warehouse_id', [None])[0]
        chat_enabled = await check_is_chat_enabled(self.wh_id)
        if not chat_enabled:
            await self.close(code=4003)
            return

        self.joined_conversations = set()
        self.is_authenticated = False
        self.user = None
        self.user_group = None
        self.presence_group = None

        if token:
            user = await get_user_from_token(token)
            if not user or not user.is_authenticated:
                await self.close(code=4003)
                return
            await self.accept()
            await self._setup_authenticated_session(user, send_ack=False)
        else:
            # کلاینت توکن را در پیام اول به صورت امن (First-message handshake) ارسال خواهد کرد
            await self.accept()

    async def _setup_authenticated_session(self, user, send_ack=True):
        self.user = user
        self.is_authenticated = True

        # ۱. عضویت در کانال اختصاصی کاربر
        self.user_group = f"chat_user_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        # ۲. عضویت در گروه عمومی حضور (Presence)
        self.presence_group = "chat_presence"
        await self.channel_layer.group_add(self.presence_group, self.channel_name)

        # ثبت کاربر در کش آنلاین‌ها
        await add_online_user(self.user.id)

        # اطلاع‌رسانی آنلاین شدن کاربر به سایر کلاینت‌های متصل
        await self.channel_layer.group_send(
            self.presence_group,
            {
                'type': 'chat_presence_event',
                'user_id': self.user.id,
                'status': 'online'
            }
        )

        if send_ack:
            # ارسال تاییدیه احراز هویت به کلاینت
            await self.send(text_data=json.dumps({
                'type': 'authenticated',
                'user_id': self.user.id,
                'username': self.user.username
            }))

    async def disconnect(self, close_code):
        if getattr(self, 'is_authenticated', False) and getattr(self, 'user', None):
            # حذف کاربر از کش آنلاین‌ها
            await remove_online_user(self.user.id)
            # اطلاع‌رسانی آفلاین شدن کاربر
            if getattr(self, 'presence_group', None):
                try:
                    await self.channel_layer.group_send(
                        self.presence_group,
                        {
                            'type': 'chat_presence_event',
                            'user_id': self.user.id,
                            'status': 'offline'
                        }
                    )
                except Exception:
                    pass
                await self.channel_layer.group_discard(self.presence_group, self.channel_name)

            if getattr(self, 'user_group', None):
                await self.channel_layer.group_discard(self.user_group, self.channel_name)
            if hasattr(self, 'joined_conversations'):
                for group in list(self.joined_conversations):
                    await self.channel_layer.group_discard(group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            payload = json.loads(text_data)
            msg_type = payload.get('type')

            # دریافت توکن در پیام اول جهت امنیت و عدم نشت در لاگ پروکسی‌ها
            if msg_type in ['authenticate', 'auth']:
                token = payload.get('token')
                if not token:
                    await self.send(text_data=json.dumps({'type': 'error', 'code': 4003, 'message': 'توکن نامعتبر است'}))
                    await self.close(code=4003)
                    return
                user = await get_user_from_token(token)
                if not user or not user.is_authenticated:
                    await self.send(text_data=json.dumps({'type': 'error', 'code': 4003, 'message': 'احراز هویت ناموفق بود'}))
                    await self.close(code=4003)
                    return
                await self._setup_authenticated_session(user)
                return

            if not getattr(self, 'is_authenticated', False) or not self.user:
                await self.send(text_data=json.dumps({'type': 'error', 'code': 4001, 'message': 'ابتدا باید احراز هویت شوید'}))
                await self.close(code=4003)
                return

            if msg_type == 'ping':
                if hasattr(self, 'user') and self.user:
                    await add_online_user(self.user.id)
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': payload.get('timestamp')
                }))

            elif msg_type == 'get_online_users':
                online_user_ids = await get_online_users()
                await self.send(text_data=json.dumps({
                    'event': 'chat.online_users',
                    'data': {
                        'user_ids': online_user_ids
                    }
                }))

            elif msg_type == 'join_conversation':
                conv_id = payload.get('conversation_id')
                if conv_id:
                    allowed = await check_can_read_conversation(self.user, conv_id)
                    if allowed:
                        room_group = f"conv_{conv_id}"
                        self.joined_conversations.add(room_group)
                        await self.channel_layer.group_add(room_group, self.channel_name)
                        await self.send(text_data=json.dumps({
                            'type': 'joined_conversation',
                            'conversation_id': conv_id
                        }))
                    else:
                        await self.send(text_data=json.dumps({
                            'type': 'error',
                            'code': 4003,
                            'message': 'دسترسی غیرمجاز به این گفتگو'
                        }))

            elif msg_type == 'leave_conversation':
                conv_id = payload.get('conversation_id')
                if conv_id:
                    room_group = f"conv_{conv_id}"
                    self.joined_conversations.discard(room_group)
                    await self.channel_layer.group_discard(room_group, self.channel_name)

            elif msg_type == 'typing':
                conv_id = payload.get('conversation_id')
                if conv_id:
                    if str(conv_id).startswith('draft_'):
                        return
                    allowed = await check_can_read_conversation(self.user, conv_id)
                    if allowed:
                        await self.channel_layer.group_send(
                            f"conv_{conv_id}",
                            {
                                'type': 'chat_typing_event',
                                'user_id': self.user.id,
                                'username': self.user.username,
                                'conversation_id': str(conv_id),
                                'is_typing': payload.get('is_typing', True)
                            }
                        )
                    else:
                        await self.send(text_data=json.dumps({
                            'type': 'error',
                            'code': 4003,
                            'message': 'دسترسی غیرمجاز به رویدادهای این گفتگو'
                        }))

        except Exception as e:
            logger.error(f"[ChatConsumer] receive error: {e}")

    async def chat_message_broadcast(self, event):
        """ارسال پیام جدید یا به‌روزشده چت به کلاینت"""
        event_name = event.get('event', 'chat.message.new')
        await self.send(text_data=json.dumps({
            'event': event_name,
            'data': event.get('data')
        }))

    async def chat_typing_event(self, event):
        """ارسال وضعیت تایپ کردن به کلاینت‌های داخل اتاق"""
        if event.get('user_id') != self.user.id:
            await self.send(text_data=json.dumps({
                'event': 'chat.typing',
                'data': event
            }))

    async def chat_presence_event(self, event):
        """ارسال تغییر وضعیت آنلاین/آفلاین کاربر به کلاینت‌های دیگر"""
        if hasattr(self, 'user') and self.user and event.get('user_id') != self.user.id:
            await self.send(text_data=json.dumps({
                'event': 'chat.presence',
                'data': {
                    'user_id': event.get('user_id'),
                    'status': event.get('status')
                }
            }))


class CommentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        params = parse_qs(query_string)
        token = params.get('token', [None])[0]

        self.subscribed_groups = set()
        self.is_authenticated = False
        self.user = None
        self.user_group = None

        if token:
            user = await get_user_from_token(token)
            if not user or not user.is_authenticated:
                await self.close(code=4003)
                return
            await self.accept()
            await self._setup_authenticated_session(user, send_ack=False)
        else:
            await self.accept()

    async def _setup_authenticated_session(self, user, send_ack=True):
        self.user = user
        self.is_authenticated = True
        # گروه شخصی جهت دریافت هشدارهای منشن شدن (@mention)
        self.user_group = f"comment_user_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        if send_ack:
            await self.send(text_data=json.dumps({
                'type': 'authenticated',
                'user_id': self.user.id
            }))

    async def disconnect(self, close_code):
        if getattr(self, 'user_group', None):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        if hasattr(self, 'subscribed_groups'):
            for group in list(self.subscribed_groups):
                await self.channel_layer.group_discard(group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            payload = json.loads(text_data)
            msg_type = payload.get('type')

            if msg_type in ['authenticate', 'auth']:
                token = payload.get('token')
                if not token:
                    await self.send(text_data=json.dumps({'type': 'error', 'code': 4003, 'message': 'توکن نامعتبر است'}))
                    await self.close(code=4003)
                    return
                user = await get_user_from_token(token)
                if not user or not user.is_authenticated:
                    await self.send(text_data=json.dumps({'type': 'error', 'code': 4003, 'message': 'احراز هویت ناموفق بود'}))
                    await self.close(code=4003)
                    return
                await self._setup_authenticated_session(user)
                return

            if not getattr(self, 'is_authenticated', False) or not self.user:
                await self.send(text_data=json.dumps({'type': 'error', 'code': 4001, 'message': 'ابتدا باید احراز هویت شوید'}))
                await self.close(code=4003)
                return

            if msg_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': payload.get('timestamp')
                }))

            elif msg_type == 'subscribe_comments':
                model = payload.get('model') or payload.get('content_type') or 'item'
                obj_id = payload.get('object_id')
                if obj_id:
                    allowed = await check_can_access_comment_target(self.user, model, obj_id)
                    if allowed:
                        target_group = f"comments_{model}_{obj_id}"
                        self.subscribed_groups.add(target_group)
                        await self.channel_layer.group_add(target_group, self.channel_name)
                        await self.send(text_data=json.dumps({
                            'type': 'subscribed_comments',
                            'model': model,
                            'content_type': model,
                            'object_id': str(obj_id)
                        }))
                    else:
                        await self.send(text_data=json.dumps({
                            'type': 'error',
                            'code': 4003,
                            'message': 'دسترسی غیرمجاز به نظرات این بخش'
                        }))

            elif msg_type == 'unsubscribe_comments':
                model = payload.get('model') or payload.get('content_type') or 'item'
                obj_id = payload.get('object_id')
                if obj_id:
                    target_group = f"comments_{model}_{obj_id}"
                    self.subscribed_groups.discard(target_group)
                    await self.channel_layer.group_discard(target_group, self.channel_name)
                    await self.send(text_data=json.dumps({
                        'type': 'unsubscribed_comments',
                        'model': model,
                        'content_type': model,
                        'object_id': str(obj_id)
                    }))

        except Exception as e:
            logger.error(f"[CommentConsumer] receive error: {e}")

    async def comment_new_broadcast(self, event):
        """پخش کامنت جدید ثبت‌شده روی کالا"""
        await self.send(text_data=json.dumps({
            'event': 'comment.new',
            'data': event.get('data')
        }))

    async def comment_mention_alert(self, event):
        """ارسال نوتیفیکیشن زنگ هشدار برای کاربر منشن‌شده"""
        await self.send(text_data=json.dumps({
            'event': 'comment.mention',
            'data': event.get('data')
        }))
