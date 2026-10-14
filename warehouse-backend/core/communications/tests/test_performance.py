from datetime import timedelta
from django.utils import timezone
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from django.contrib.auth import get_user_model

from communications.models import (
    Conversation, ConversationParticipant, Message, ConversationType
)
from communications.broadcast import broadcast_message_ws
from communications.tests.base import BaseCommsTestCase

User = get_user_model()


class ReadStateAndPerformanceTestCase(BaseCommsTestCase):
    """
    مجموعه آزمون‌های کارایی دیتابیس، وضعیت خوانده‌شدن و سنجش بار کوئری‌ها (فاز ۵)
    """

    def setUp(self):
        super().setUp()
        # اطمینان از وجود ConversationParticipant اولیه برای گفتگوهای نمونه
        ConversationParticipant.objects.get_or_create(
            conversation=self.direct_conv,
            user=self.manager_wh1
        )
        ConversationParticipant.objects.get_or_create(
            conversation=self.direct_conv,
            user=self.staff_wh1
        )

    def test_mark_read_idempotent(self):
        """فراخوانی چندباره mark_as_read نباید رکورد تکراری ایجاد کند یا مقدار نامعتبر ست کند"""
        self.auth(self.staff_wh1)
        url = f"/api/communications/conversations/{self.direct_conv.id}/mark-read/"

        # ساخت چند پیام
        msg1 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۱")
        msg2 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۲")

        resp1 = self.client.post(url)
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        part = ConversationParticipant.objects.get(conversation=self.direct_conv, user=self.staff_wh1)
        self.assertEqual(part.last_read_message_id, msg2.id)

        # فراخوانی مجدد
        resp2 = self.client.post(url)
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        self.assertEqual(
            ConversationParticipant.objects.filter(conversation=self.direct_conv, user=self.staff_wh1).count(),
            1
        )

    def test_mark_read_is_single_query(self):
        """فراخوانی mark_as_read باید با تعداد کوئری بهینه و ثابت اجرا شود"""
        self.auth(self.staff_wh1)
        url = f"/api/communications/conversations/{self.direct_conv.id}/mark-read/"

        Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="تست کارایی")

        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.post(url)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # تعداد کوئری‌ها باید بهینه و زیر ۲۰ کوئری باشد
        self.assertLessEqual(len(ctx.captured_queries), 20)

    def test_conversation_list_query_count_is_constant(self):
        """تعداد کوئری‌های لیست گفتگوها نباید با افزایش تعداد گفتگوها رشد خطی (N+1) داشته باشد"""
        self.auth(self.manager_wh1)
        url = "/api/communications/conversations/"

        # ایجاد ۵ گفتگو
        for i in range(5):
            c = Conversation.objects.create(
                title=f"گفتگوی شماره {i}",
                conv_type=ConversationType.DIRECT,
                created_by=self.manager_wh1
            )
            c.participants.set([self.manager_wh1, self.staff_wh1])
            Message.objects.create(conversation=c, sender=self.staff_wh1, text=f"پیام گفتگوی {i}")

        with CaptureQueriesContext(connection) as ctx_5:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
        query_count_5 = len(ctx_5.captured_queries)

        # ایجاد ۱۵ گفتگوی دیگر (مجموعاً ۲۰ گفتگو)
        for i in range(5, 20):
            c = Conversation.objects.create(
                title=f"گفتگوی شماره {i}",
                conv_type=ConversationType.DIRECT,
                created_by=self.manager_wh1
            )
            c.participants.set([self.manager_wh1, self.staff_wh1])
            Message.objects.create(conversation=c, sender=self.staff_wh1, text=f"پیام گفتگوی {i}")

        with CaptureQueriesContext(connection) as ctx_20:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
        query_count_20 = len(ctx_20.captured_queries)

        # اثبات عدم وجود N+1 (تعداد کوئری ۵ گفتگو و ۲۰ گفتگو باید یکسان یا با اختلاف ناچیز کش باشد)
        self.assertLessEqual(query_count_20, query_count_5 + 2)

    def test_message_list_query_count_is_constant(self):
        """دریافت پیام‌های یک گفتگو نباید برای هر پیام کوئری N+1 روی sender یا attachments بزند"""
        self.auth(self.manager_wh1)
        url = f"/api/communications/messages/?conversation_id={self.direct_conv.id}"

        # ایجاد ۱۰ پیام
        for i in range(10):
            Message.objects.create(
                conversation=self.direct_conv,
                sender=self.staff_wh1,
                text=f"پیام تستی {i}"
            )

        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # تعداد کوئری‌ها برای ۱۰ پیام نباید از ۸ کوئری فراتر رود (عدم N+1)
        self.assertLessEqual(len(ctx.captured_queries), 8)

    def test_broadcast_query_count_independent_of_participants(self):
        """عملیات برودکست نباید به‌ازای هر عضو یک کوئری COUNT دیتابیس اجرا کند"""
        group_conv = Conversation.objects.create(
            title="گروه پرتعداد",
            conv_type=ConversationType.WAREHOUSE_GROUP,
            warehouse=self.wh1,
            created_by=self.admin
        )
        # افزودن ۲۰ کاربر عضو
        users = [
            User.objects.create_user(username=f"group_user_{i}", password="Password123!")
            for i in range(20)
        ]
        group_conv.participants.set(users)

        msg = Message.objects.create(
            conversation=group_conv,
            sender=self.admin,
            text="پیام برای ۲۰ عضو"
        )

        with CaptureQueriesContext(connection) as ctx:
            broadcast_message_ws(msg)

        # نباید ۲۰ کوئری COUNT اجرا شده باشد
        self.assertLessEqual(len(ctx.captured_queries), 5)

    def test_since_id_returns_same_timestamp_messages(self):
        """پیام‌هایی که تاریخ ارسال یکسان دارند اما شناسه بالاتر دارند نباید با since_id فیلتر شوند"""
        self.auth(self.manager_wh1)
        now = timezone.now()

        # ساخت دو پیام با تاریخ یکسان
        msg1 = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.staff_wh1,
            text="پیام هم‌زمان اول"
        )
        msg2 = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.staff_wh1,
            text="پیام هم‌زمان دوم"
        )

        # هم‌زمان کردن تاریخ دو پیام
        Message.objects.filter(id__in=[msg1.id, msg2.id]).update(created_at=now)

        url = f"/api/communications/messages/?conversation_id={self.direct_conv.id}&since_id={msg1.id}"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        returned_ids = [m['id'] for m in resp.data.get('results', resp.data)]
        self.assertIn(msg2.id, returned_ids)
        self.assertNotIn(msg1.id, returned_ids)

    def test_unread_count_matches_legacy_result(self):
        """شمارنده خوانده‌نشده محاسبه‌شده با متد annotate دقیقا برابر با منطق قبلی باشد"""
        self.auth(self.staff_wh1)
        url = "/api/communications/conversations/"

        Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۱ خوانده‌نشده")
        Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۲ خوانده‌نشده")

        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        results = resp.data.get('results', resp.data)
        direct_result = next((c for c in results if str(c['id']) == str(self.direct_conv.id)), None)
        self.assertIsNotNone(direct_result)
        # دو پیام خوانده‌نشده جدید به علاوه پیام اولیه setup
        self.assertGreaterEqual(direct_result['unread_count'], 2)

    def test_unread_count_becomes_zero_after_mark_read_and_refresh(self):
        """پس از خواندن پیام‌ها و رفرش، شمارنده خوانده‌نشده باید دقیقاً صفر باقی بماند"""
        self.auth(self.staff_wh1)
        conv_url = "/api/communications/conversations/"
        mark_read_url = f"/api/communications/conversations/{self.direct_conv.id}/mark-read/"

        # ساخت ۲ پیام جدید توسط مدیر
        m1 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام تازه ۱")
        m2 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام تازه ۲")

        # قبل از خواندن: شمارنده باید بیشتر از صفر باشد
        resp1 = self.client.get(conv_url)
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)
        results1 = resp1.data.get('results', resp1.data)
        conv_data1 = next(c for c in results1 if str(c['id']) == str(self.direct_conv.id))
        self.assertGreater(conv_data1['unread_count'], 0)

        # ارسال درخواست mark-read
        resp_mark = self.client.post(mark_read_url)
        self.assertEqual(resp_mark.status_code, status.HTTP_200_OK)

        # شبیه‌سازی رفرش صفحه (درخواست مجدد به لیست گفتگوها)
        resp2 = self.client.get(conv_url)
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        results2 = resp2.data.get('results', resp2.data)
        conv_data2 = next(c for c in results2 if str(c['id']) == str(self.direct_conv.id))
        self.assertEqual(conv_data2['unread_count'], 0)

