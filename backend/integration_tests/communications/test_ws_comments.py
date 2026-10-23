import json
from decimal import Decimal
from django.test import TransactionTestCase
from django.db import close_old_connections
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async

from config.asgi import application
from warehouses.models import Warehouse
from inventory.models import Item
from communications.models import GenericComment
from accounts.models import AuditLog
from notifications.models import Notification

User = get_user_model()


class WebSocketCommentsTestCase(TransactionTestCase):
    """
    تست‌های اختصاصی وب‌سوکت نظرات تعاملی، اشتراک/لغو اشتراک، برودکست زنده و اعتبارسنجی منشن
    """

    def setUp(self):
        super().setUp()
        close_old_connections()

        self.wh1 = Warehouse.objects.create(name="انبار مرکزی ۱", project_name="شیراز")
        self.wh2 = Warehouse.objects.create(name="انبار فرعی ۲", project_name="بوشهر")

        self.manager1 = User.objects.create_user(
            username="manager_wh1_ws",
            first_name="مدیر",
            last_name="انبار یک",
            password="Password123!",
            is_staff=True
        )
        self.manager1.assigned_warehouses.set([self.wh1])

        self.staff1 = User.objects.create_user(
            username="staff_wh1_ws",
            first_name="کارمند",
            last_name="انبار یک",
            password="Password123!"
        )
        self.staff1.assigned_warehouses.set([self.wh1])

        self.staff2 = User.objects.create_user(
            username="staff_wh2_ws",
            first_name="کارمند",
            last_name="انبار دو",
            password="Password123!"
        )
        self.staff2.assigned_warehouses.set([self.wh2])

        self.item1 = Item.objects.create(
            warehouse=self.wh1,
            fa_unic_code="ITEM-WS-101",
            description="کالای آزمایشی وب‌سوکت",
            inventory=Decimal('10.000'),
            bal4miv=Decimal('10.000')
        )
        self.item_ct = ContentType.objects.get_for_model(Item)

        self.manager1_client = APIClient()
        self.manager1_client.force_authenticate(user=self.manager1)

    async def get_comment_communicator(self, user):
        token = str(AccessToken.for_user(user))
        communicator = WebsocketCommunicator(
            application,
            f"/ws/comments/?token={token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected, "اتصال سوکت نظرات باید برقرار شود")
        return communicator

    @database_sync_to_async
    def post_comment(self, client, data):
        return client.post('/api/communications/comments/', data)

    async def test_subscriber_receives_new_comment(self):
        """
        کاربر مشترک در نظرات کالا باید کامنت‌های جدید را به‌صورت بلادرنگ دریافت کند (ایراد ۲۵)
        """
        comm = await self.get_comment_communicator(self.staff1)

        # ۱. ارسال درخواست اشتراک در نظرات کالای ۱
        await comm.send_json_to({
            'type': 'subscribe_comments',
            'model': 'item',
            'object_id': str(self.item1.id)
        })

        sub_resp = await comm.receive_json_from(timeout=5)
        self.assertEqual(sub_resp.get('type'), 'subscribed_comments')
        self.assertEqual(sub_resp.get('object_id'), str(self.item1.id))

        # ۲. ثبت یک کامنت روی کالای ۱ توسط مدیر
        res = await self.post_comment(self.manager1_client, {
            'content_type_str': 'inventory.item',
            'object_id': str(self.item1.id),
            'text': 'کامنت آزمایشی زنده برای تست برودکست'
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # ۳. دریافت رویداد comment.new روی سوکت کاربر مشترک
        msg_event = await comm.receive_json_from(timeout=5)
        self.assertEqual(msg_event.get('event'), 'comment.new')
        self.assertEqual(msg_event.get('data', {}).get('text'), 'کامنت آزمایشی زنده برای تست برودکست')
        self.assertEqual(msg_event.get('data', {}).get('object_id'), str(self.item1.id))

        await comm.disconnect()

    async def test_unsubscribe_stops_delivery(self):
        """
        پس از لغو اشتراک (unsubscribe)، دیگر کامنت‌های جدید نباید به سوکت کاربر ارسال شوند (ایراد ۲۵)
        """
        comm = await self.get_comment_communicator(self.staff1)

        # اشتراک
        await comm.send_json_to({
            'type': 'subscribe_comments',
            'content_type': 'item',
            'object_id': str(self.item1.id)
        })
        await comm.receive_json_from(timeout=5)

        # لغو اشتراک
        await comm.send_json_to({
            'type': 'unsubscribe_comments',
            'content_type': 'item',
            'object_id': str(self.item1.id)
        })
        unsub_resp = await comm.receive_json_from(timeout=5)
        self.assertEqual(unsub_resp.get('type'), 'unsubscribed_comments')

        # ثبت کامنت جدید
        await self.post_comment(self.manager1_client, {
            'content_type_str': 'inventory.item',
            'object_id': str(self.item1.id),
            'text': 'کامنت پس از لغو اشتراک'
        })

        # تایید عدم دریافت پیام
        nothing = await comm.receive_nothing(timeout=0.5)
        self.assertTrue(nothing)

        await comm.disconnect()

    def test_persian_full_name_mention_token_parsed(self):
        """
        منشن با توکن استاندارد @[id:نام فارسی] باید شناسه کاربر را استخراج و ذخیره کند (ایراد ۳۸)
        """
        token_str = f"@[{self.staff1.id}:سید علی محمدی]"
        text = f"سلام {token_str} لطفاً این کالا را بازبینی کنید."

        res = self.manager1_client.post('/api/communications/comments/', {
            'content_type_str': 'inventory.item',
            'object_id': str(self.item1.id),
            'text': text
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        comment_id = res.data['id']
        comment = GenericComment.objects.get(id=comment_id)
        mentioned = list(comment.mentioned_users.all())
        self.assertIn(self.staff1, mentioned)

        # بررسی ثبت لاگ ممیزی / اعلان پایدار (ایراد ۳۹)
        logs = AuditLog.objects.filter(action='MENTION', target_object_id=str(self.item1.id))
        self.assertTrue(logs.exists())

        # بررسی ایجاد اعلان پایدار در دیتابیس برای کاربر منشن‌شده
        notif = Notification.objects.filter(recipient=self.staff1, target_id=str(self.item1.id)).first()
        self.assertIsNotNone(notif, "رکورد اعلان پایدار برای کاربر منشن‌شده در دیتابیس ساخته نشد")
        self.assertFalse(notif.is_read)
        self.assertEqual(notif.notification_type, 'mention')

    def test_mention_of_inaccessible_user_rejected(self):
        """
        منشن کاربری که به انبار کالا دسترسی ندارد باید فیلتر و رد شود (ایراد ۱۰، ۳۸)
        """
        token_str = f"@[{self.staff2.id}:کارمند انبار ۲]"
        text = f"سلام {token_str} لطفاً مشاهده فرمایید."

        res = self.manager1_client.post('/api/communications/comments/', {
            'content_type_str': 'inventory.item',
            'object_id': str(self.item1.id),
            'text': text
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        comment_id = res.data['id']
        comment = GenericComment.objects.get(id=comment_id)
        mentioned = list(comment.mentioned_users.all())
        self.assertNotIn(self.staff2, mentioned)
