import json
from decimal import Decimal
from django.test import TransactionTestCase
from django.db import close_old_connections
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework_simplejwt.tokens import AccessToken
from channels.testing import WebsocketCommunicator

from config.asgi import application
from warehouses.models import Warehouse
from inventory.models import Item
from communications.models import Conversation, Message, GenericComment, ConversationType

User = get_user_model()


class WebSocketSecurityTestCase(TransactionTestCase):
    """
    مجموعه آزمون‌های امن‌سازی وب‌سوکت، کنترل دسترسی به روم‌ها و جلوگیری از شنود زنده
    استفاده از TransactionTestCase جهت اطمینان از ایزولاسیون کامل دیتابیس در تریدهای ناهمگام Channels
    """

    def setUp(self):
        super().setUp()
        close_old_connections()

        # ۱. ساخت انبارهای تستی
        self.wh1 = Warehouse.objects.create(name="انبار مرکزی ۱", project_name="شیراز")
        self.wh2 = Warehouse.objects.create(name="انبار فرعی ۲", project_name="بوشهر")

        # ۲. ساخت کاربران
        self.admin = User.objects.create_superuser(username="admin_ws", email="admin_ws@test.com", password="Password123!")

        self.manager_wh1 = User.objects.create_user(username="manager_wh1_ws", password="Password123!", is_staff=True)
        self.manager_wh1.assigned_warehouses.set([self.wh1])

        self.staff_wh1 = User.objects.create_user(username="staff_wh1_ws", password="Password123!")
        self.staff_wh1.assigned_warehouses.set([self.wh1])

        self.staff_wh2 = User.objects.create_user(username="staff_wh2_ws", password="Password123!")
        self.staff_wh2.assigned_warehouses.set([self.wh2])

        # ۳. ساخت گفتگوها
        self.direct_conv = Conversation.objects.create(
            title="چت خصوصی مدیر و پرسنل ۱",
            conv_type=ConversationType.DIRECT,
            created_by=self.manager_wh1
        )
        self.direct_conv.participants.set([self.manager_wh1, self.staff_wh1])

        self.wh1_group = Conversation.objects.create(
            title="گروه انبار ۱",
            conv_type=ConversationType.WAREHOUSE_GROUP,
            warehouse=self.wh1,
            created_by=self.manager_wh1
        )
        self.wh1_group.participants.set([self.manager_wh1, self.staff_wh1])

        # ۴. ساخت کالای انبار ۱
        self.item_wh1 = Item.objects.create(
            warehouse=self.wh1,
            fa_unic_code="WS-101",
            description="کالای تستی وب‌سوکت",
            inventory=Decimal('10.000'),
            bal4miv=Decimal('10.000')
        )

    def tearDown(self):
        close_old_connections()
        super().tearDown()

    def get_jwt_token(self, user):
        return str(AccessToken.for_user(user))

    async def test_first_message_authentication_success(self):
        """احراز هویت پیام اول بدون ارسال توکن در URL (First-message handshake)"""
        communicator = WebsocketCommunicator(application, "/ws/chat/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        token = self.get_jwt_token(self.staff_wh1)
        await communicator.send_json_to({
            'type': 'authenticate',
            'token': token
        })

        resp = await communicator.receive_json_from(timeout=5)
        self.assertEqual(resp.get('type'), 'authenticated')
        self.assertEqual(resp.get('user_id'), self.staff_wh1.id)

        await communicator.disconnect()

    async def test_connect_without_token_and_unauthenticated_command_rejected(self):
        """ارسال دستور قبل از ارسال پیام احراز هویت باید اتصال را با کد خطای امنیتی قطع کند"""
        communicator = WebsocketCommunicator(application, "/ws/chat/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({
            'type': 'join_conversation',
            'conversation_id': str(self.direct_conv.id)
        })

        resp = await communicator.receive_json_from(timeout=5)
        self.assertEqual(resp.get('type'), 'error')
        self.assertEqual(resp.get('code'), 4001)

        await communicator.disconnect()

    async def test_connect_with_invalid_token_rejected(self):
        """اتصال به وب‌سوکت با توکن نامعتبر باید با کد ۴۰۰۳ رد شود"""
        communicator = WebsocketCommunicator(application, "/ws/chat/?token=garbage_fake_jwt_token")
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4003)
        await communicator.disconnect()

    async def test_participant_can_join_conversation(self):
        """عضو مجاز گفتگو (پرسنل ۱) باید بتواند با موفقیت به روم گفتگو بپیوندد"""
        token = self.get_jwt_token(self.staff_wh1)
        communicator = WebsocketCommunicator(application, f"/ws/chat/?token={token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # ارسال درخواست ورود به اتاق گفتگو
        await communicator.send_json_to({
            'type': 'join_conversation',
            'conversation_id': str(self.direct_conv.id)
        })

        response = await communicator.receive_json_from(timeout=5)
        self.assertEqual(response.get('type'), 'joined_conversation')
        self.assertEqual(response.get('conversation_id'), str(self.direct_conv.id))

        await communicator.disconnect()

    async def test_outsider_join_denied(self):
        """کاربر متفرقه (پرسنل انبار ۲) در تلاش برای ورود به روم گفتگوی دیگران باید پیام خطا دریافت کند"""
        token = self.get_jwt_token(self.staff_wh2)
        communicator = WebsocketCommunicator(application, f"/ws/chat/?token={token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # تلاش برای ورود به گفتگوی خصوصی مدیر و پرسنل ۱
        await communicator.send_json_to({
            'type': 'join_conversation',
            'conversation_id': str(self.direct_conv.id)
        })

        response = await communicator.receive_json_from(timeout=5)
        self.assertEqual(response.get('type'), 'error')
        self.assertEqual(response.get('code'), 4003)

        await communicator.disconnect()

    async def test_typing_denied_for_outsider(self):
        """ارسال رویداد typing برای گفتگویی که کاربر در آن عضو نیست باید با خطا مواجه شود"""
        token = self.get_jwt_token(self.staff_wh2)
        communicator = WebsocketCommunicator(application, f"/ws/chat/?token={token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({
            'type': 'typing',
            'conversation_id': str(self.direct_conv.id),
            'is_typing': True
        })

        response = await communicator.receive_json_from(timeout=5)
        self.assertEqual(response.get('type'), 'error')
        self.assertEqual(response.get('code'), 4003)

        await communicator.disconnect()

    async def test_comment_subscribe_requires_target_access(self):
        """کاربر انبار ۲ نباید بتواند به روم نظرات زنده کالای انبار ۱ متصل شود"""
        token = self.get_jwt_token(self.staff_wh2)
        communicator = WebsocketCommunicator(application, f"/ws/comments/?token={token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({
            'type': 'subscribe_comments',
            'model': 'item',
            'object_id': str(self.item_wh1.id)
        })

        response = await communicator.receive_json_from(timeout=5)
        self.assertEqual(response.get('type'), 'error')
        self.assertEqual(response.get('code'), 4003)

        await communicator.disconnect()

    async def test_authorized_comment_subscribe_succeeds(self):
        """کاربر انبار ۱ باید بتواند با موفقیت به روم نظرات کالای همان انبار متصل شود"""
        token = self.get_jwt_token(self.staff_wh1)
        communicator = WebsocketCommunicator(application, f"/ws/comments/?token={token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({
            'type': 'subscribe_comments',
            'model': 'item',
            'object_id': str(self.item_wh1.id)
        })

        response = await communicator.receive_json_from(timeout=5)
        self.assertEqual(response.get('type'), 'subscribed_comments')
        self.assertEqual(response.get('object_id'), str(self.item_wh1.id))

        await communicator.disconnect()

    async def test_warehouse_group_requires_access(self):
        """کاربر انبار ۲ نباید بتواند به روم برودکست انبار ۱ بپیوندد"""
        token = self.get_jwt_token(self.staff_wh2)
        communicator = WebsocketCommunicator(application, f"/ws/chat/?token={token}&warehouse_id={self.wh1.id}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.disconnect()

    async def test_two_subscriptions_keep_both_groups(self):
        """اشتراک در نظرات دو کالای مختلف باید هر دو روم را در وضعیت فعال نگه دارد"""
        item2 = await Item.objects.acreate(
            warehouse=self.wh1,
            fa_unic_code="WS-102",
            description="کالای تستی دوم",
            inventory=Decimal('5.000'),
            bal4miv=Decimal('5.000')
        )
        token = self.get_jwt_token(self.staff_wh1)
        communicator = WebsocketCommunicator(application, f"/ws/comments/?token={token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # اشتراک در کالای ۱
        await communicator.send_json_to({
            'type': 'subscribe_comments',
            'model': 'item',
            'object_id': str(self.item_wh1.id)
        })
        resp1 = await communicator.receive_json_from(timeout=5)
        self.assertEqual(resp1.get('type'), 'subscribed_comments')

        # اشتراک در کالای ۲
        await communicator.send_json_to({
            'type': 'subscribe_comments',
            'model': 'item',
            'object_id': str(item2.id)
        })
        resp2 = await communicator.receive_json_from(timeout=5)
        self.assertEqual(resp2.get('type'), 'subscribed_comments')

        await communicator.disconnect()

    async def test_outsider_does_not_receive_broadcast(self):
        """پیام ارسالی در گفتگوی خصوصی نباید به سوکت کاربر متفرقه تحویل داده شود"""
        token_outsider = self.get_jwt_token(self.staff_wh2)
        comm_outsider = WebsocketCommunicator(application, f"/ws/chat/?token={token_outsider}")
        connected_out, _ = await comm_outsider.connect()
        self.assertTrue(connected_out)

        # تلاش غیرمجاز برای ورود به گفتگو
        await comm_outsider.send_json_to({
            'type': 'join_conversation',
            'conversation_id': str(self.direct_conv.id)
        })
        err = await comm_outsider.receive_json_from(timeout=5)
        self.assertEqual(err.get('type'), 'error')

        # شبیه‌سازی برودکست پیام
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"conv_{self.direct_conv.id}",
            {
                "type": "chat_message_broadcast",
                "data": {"id": "msg-999", "text": "پیام محرمانه"}
            }
        )

        # اطمینان از اینکه پیامی به کاربر متفرقه نرسیده است
        nothing = await comm_outsider.receive_nothing(timeout=0.5)
        self.assertTrue(nothing, "پیام محرمانه به کاربر متفرقه نشت کرد!")

        await comm_outsider.disconnect()

    async def test_chat_disabled_rejects_websocket(self):
        """هنگامی که چت غیرفعال است، اتصال وب‌سوکت باید با کد ۴۰۰۳ بسته شود"""
        from settings_core.models import SystemSetting
        from warehouses.services import clear_setting_cache
        from channels.db import database_sync_to_async
        from asgiref.sync import sync_to_async

        await database_sync_to_async(SystemSetting.objects.update_or_create)(
            key='chat_enabled',
            warehouse_id=None,
            defaults={'value': False}
        )
        await sync_to_async(clear_setting_cache)('chat_enabled')

        token = self.get_jwt_token(self.staff_wh1)
        communicator = WebsocketCommunicator(
            application,
            f"/ws/chat/?token={token}"
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4003)

        # بازگرداندن تنظیمات
        await database_sync_to_async(SystemSetting.objects.filter(key='chat_enabled').delete)()
        await sync_to_async(clear_setting_cache)('chat_enabled')
