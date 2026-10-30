import asyncio
import json
import logging
import time
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

from .models import Conversation
from .access import can_read_conversation, can_access_comment_target, resolve_comment_content_type
from .presence import connect_user, disconnect_user, touch_online_user, get_online_users
from common.warehouse_scope import can_access_warehouse

logger = logging.getLogger(__name__)
User = get_user_model()

# E9: مهلت احراز هویت پیام اول و فاصلهٔ کمینهٔ بررسی فعال بودن کاربر روی ping
WS_AUTH_TIMEOUT_SECONDS = 10
WS_ACTIVE_CHECK_INTERVAL_SECONDS = 60
WS_CLOSE_AUTH = 4003


def _decode_token(token_str):
    """(کاربر فعال، زمان exp) یا (None, None)"""
    try:
        access_token = AccessToken(token_str)
        user_id = access_token['user_id']
        exp = access_token.get('exp')
        user = User.objects.get(id=user_id, is_active=True)
        return user, (float(exp) if exp else None)
    except Exception as e:
        logger.debug(f"[WebSocketAuth] Token decode error: {e}")
        return None, None


@database_sync_to_async
def get_user_from_token(token_str):
    """
    اعتبارسنجی و استخراج کاربر از توکن JWT
    """
    return _decode_token(token_str)[0]


@database_sync_to_async
def get_user_and_exp_from_token(token_str):
    """اعتبارسنجی توکن JWT؛ خروجی (کاربر، exp)"""
    return _decode_token(token_str)


@database_sync_to_async
def check_user_is_active(user_id):
    return User.objects.filter(id=user_id, is_active=True).exists()


@database_sync_to_async
def check_can_read_conversation(user, conv_id):
    """
    بررسی دسترسی کاربر به گفتگوی مشخص
    """
    try:
        conv = Conversation.objects.get(id=conv_id)
        return can_read_conversation(user, conv)
    except Exception:
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


def resolve_comment_subscription(user, model_name, object_id):
    """
    نام مدلِ حل‌شدهٔ هدف (برای نام گروه comments_<model>_<id>) یا None اگر مجاز نباشد.
    فقط مدل‌های فهرست مجاز و ContentType بی‌ابهام پذیرفته می‌شوند (E6).
    """
    try:
        ct = resolve_comment_content_type(model_name)
        if not ct:
            return None
        if not can_access_comment_target(user, ct, str(object_id)):
            return None
        return ct.model
    except Exception:
        return None


@database_sync_to_async
def check_can_access_comment_target(user, model_name, object_id):
    """
    بررسی دسترسی کاربر به موجودیت هدف کامنت؛ خروجی نام مدل حل‌شده یا None
    """
    return resolve_comment_subscription(user, model_name, object_id)


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


class WsAuthLifecycleMixin:
    """
    چرخهٔ عمر احراز هویت وب‌سوکت (E9):
    - توکن فقط در پیام اول پذیرفته می‌شود (نه در آدرس)؛
    - اتصال احرازنشده پس از WS_AUTH_TIMEOUT_SECONDS بسته می‌شود؛
    - authenticate دوم روی اتصال احرازشده رد می‌شود؛
    - با انقضای توکن یا غیرفعال شدن کاربر، اتصال با کد 4003 بسته می‌شود.
    """

    def _init_auth_state(self):
        self.is_authenticated = False
        self.user = None
        self.token_exp = None
        self._last_active_check = 0.0
        self._auth_timeout_task = None

    def _start_auth_timeout(self):
        self._auth_timeout_task = asyncio.ensure_future(self._auth_timeout())

    def _cancel_auth_timeout(self):
        task = getattr(self, '_auth_timeout_task', None)
        if task and not task.done():
            task.cancel()
        self._auth_timeout_task = None

    async def _auth_timeout(self):
        try:
            await asyncio.sleep(WS_AUTH_TIMEOUT_SECONDS)
        except asyncio.CancelledError:
            return
        if not getattr(self, 'is_authenticated', False):
            try:
                await self.send(text_data=json.dumps({'type': 'error', 'code': 4001, 'message': 'مهلت احراز هویت به پایان رسید'}))
            except Exception:
                pass
            await self.close(code=WS_CLOSE_AUTH)

    async def _handle_authenticate(self, payload):
        """True اگر احراز هویت موفق شد؛ در غیر این صورت پاسخ خطا (و در صورت لزوم بستن) انجام شده است."""
        if getattr(self, 'is_authenticated', False):
            # تغییر هویت روی یک اتصال باز ممنوع است؛ هویت فعلی دست‌نخورده می‌ماند
            await self.send(text_data=json.dumps({'type': 'error', 'code': 4009, 'message': 'این اتصال قبلاً احراز هویت شده است'}))
            return False
        token = payload.get('token')
        if not token:
            await self.send(text_data=json.dumps({'type': 'error', 'code': 4003, 'message': 'توکن نامعتبر است'}))
            await self.close(code=WS_CLOSE_AUTH)
            return False
        user, exp = await get_user_and_exp_from_token(token)
        if not user or not user.is_authenticated:
            await self.send(text_data=json.dumps({'type': 'error', 'code': 4003, 'message': 'احراز هویت ناموفق بود'}))
            await self.close(code=WS_CLOSE_AUTH)
            return False
        self._cancel_auth_timeout()
        self.token_exp = exp
        self._last_active_check = time.monotonic()
        await self._setup_authenticated_session(user)
        return True

    async def _session_still_valid(self, check_active=False):
        """انقضای توکن همیشه؛ فعال بودن کاربر فقط وقتی check_active و حداکثر هر ۶۰ ثانیه یک بار"""
        if self.token_exp is not None and time.time() >= self.token_exp:
            await self.close(code=WS_CLOSE_AUTH)
            return False
        if check_active:
            now = time.monotonic()
            if now - self._last_active_check >= WS_ACTIVE_CHECK_INTERVAL_SECONDS:
                self._last_active_check = now
                if not await check_user_is_active(self.user.id):
                    await self.close(code=WS_CLOSE_AUTH)
                    return False
        return True


class ChatConsumer(WsAuthLifecycleMixin, AsyncWebsocketConsumer):
    async def connect(self):
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        params = parse_qs(query_string)

        self._init_auth_state()
        self.joined_conversations = set()
        self.user_group = None
        self.presence_group = None

        self.wh_id = params.get('warehouse_id', [None])[0]
        chat_enabled = await check_is_chat_enabled(self.wh_id)
        if not chat_enabled:
            await self.close(code=4003)
            return

        # کلاینت توکن را در پیام اول به صورت امن (First-message handshake) می‌فرستد؛
        # ?token= در آدرس دیگر پذیرفته نمی‌شود چون در لاگ پروکسی‌ها می‌ماند (E9)
        await self.accept()
        self._start_auth_timeout()

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
        # هر اتصال یک بار شمرده می‌شود (E10)؛ احراز هویت دوباره روی همان سوکت دوباره نمی‌شمارد
        if not getattr(self, '_presence_counted', False):
            self._presence_counted = True
            await connect_user(self.user.id)

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
        self._cancel_auth_timeout()
        if getattr(self, 'is_authenticated', False) and getattr(self, 'user', None):
            # حذف کاربر از کش آنلاین‌ها
            remaining = 0
            if getattr(self, '_presence_counted', False):
                self._presence_counted = False
                remaining = await disconnect_user(self.user.id)
            # اطلاع‌رسانی آفلاین شدن کاربر
            if getattr(self, 'presence_group', None):
                try:
                    # کاربر هنوز اتصال دیگری دارد (تب یا دستگاه دیگر): آفلاین اعلام نمی‌شود (E10)
                    if remaining <= 0:
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
                await self._handle_authenticate(payload)
                return

            if not getattr(self, 'is_authenticated', False) or not self.user:
                await self.send(text_data=json.dumps({'type': 'error', 'code': 4001, 'message': 'ابتدا باید احراز هویت شوید'}))
                await self.close(code=4003)
                return

            if not await self._session_still_valid(check_active=(msg_type == 'ping')):
                return

            if msg_type == 'ping':
                if hasattr(self, 'user') and self.user:
                    await touch_online_user(self.user.id)
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

    async def chat_membership_revoked(self, event):
        """
        عضو از گروه حذف شد یا خارج شد (U1): خروج فوری از روم conv_<id> تا هیچ رویداد زنده‌ای
        (مثل تایپ) دیگر به او نرسد، و اطلاع به کلاینت برای برداشتن گفتگو از فهرست.
        """
        conv_id = str(event.get('conversation_id') or '')
        if not conv_id:
            return
        room_group = f"conv_{conv_id}"
        if hasattr(self, 'joined_conversations'):
            self.joined_conversations.discard(room_group)
        await self.channel_layer.group_discard(room_group, self.channel_name)
        await self.send(text_data=json.dumps({
            'event': 'chat.conversation.removed',
            'data': {'conversation_id': conv_id}
        }))

    async def chat_typing_event(self, event):
        """ارسال وضعیت تایپ کردن به کلاینت‌های داخل اتاق"""
        # فقط اگر هنوز عضو روم است (پس از حذف عضویت، رویداد جامانده رله نمی‌شود)
        room_group = f"conv_{event.get('conversation_id')}"
        if room_group not in getattr(self, 'joined_conversations', set()):
            return
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


class CommentConsumer(WsAuthLifecycleMixin, AsyncWebsocketConsumer):
    async def connect(self):
        self._init_auth_state()
        self.subscribed_groups = set()
        self.user_group = None

        # توکن فقط در پیام اول پذیرفته می‌شود (E9)
        await self.accept()
        self._start_auth_timeout()

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
        self._cancel_auth_timeout()
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
                await self._handle_authenticate(payload)
                return

            if not getattr(self, 'is_authenticated', False) or not self.user:
                await self.send(text_data=json.dumps({'type': 'error', 'code': 4001, 'message': 'ابتدا باید احراز هویت شوید'}))
                await self.close(code=4003)
                return

            if not await self._session_still_valid(check_active=(msg_type == 'ping')):
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
                    resolved_model = await check_can_access_comment_target(self.user, model, obj_id)
                    if resolved_model:
                        # نام گروه با همان نام مدلی ساخته می‌شود که broadcast_comment_ws به کار می‌برد
                        target_group = f"comments_{resolved_model}_{obj_id}"
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
                    model_key = str(model).strip().lower().split('.')[-1]
                    target_group = f"comments_{model_key}_{obj_id}"
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
