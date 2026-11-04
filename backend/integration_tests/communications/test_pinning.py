from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from communications.models import (
    Conversation, ConversationParticipant, Message, PinnedMessage, ConversationType, ParticipantRole
)
from communications.membership import add_members
from .base import BaseCommsTestCase


class PinningTestCase(BaseCommsTestCase):
    def setUp(self):
        super().setUp()
        # Direct chat between manager_wh1 and staff_wh1
        self.direct_conv = Conversation.objects.create(
            conv_type=ConversationType.DIRECT,
            created_by=self.manager_wh1
        )
        self.direct_part1 = ConversationParticipant.objects.create(
            conversation=self.direct_conv, user=self.manager_wh1, role=ParticipantRole.MEMBER
        )
        self.direct_part2 = ConversationParticipant.objects.create(
            conversation=self.direct_conv, user=self.staff_wh1, role=ParticipantRole.MEMBER
        )
        self.direct_conv.participants.set([self.manager_wh1, self.staff_wh1])

        self.msg_direct = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.manager_wh1,
            text="پیام تست در گفتگوی دونفره"
        )

        # Message in group
        self.msg_group = Message.objects.create(
            conversation=self.wh1_group,
            sender=self.staff_wh1,
            text="پیام عضو عادی در گروه"
        )

        # Announcement channel
        self.announcement_conv = Conversation.objects.create(
            title="کانال اطلاعیه‌ها",
            conv_type=ConversationType.ANNOUNCEMENT,
            created_by=self.manager_wh1
        )
        ConversationParticipant.objects.create(
            conversation=self.announcement_conv, user=self.manager_wh1, role=ParticipantRole.OWNER
        )
        self.announcement_conv.participants.set([self.manager_wh1])

        self.msg_announcement = Message.objects.create(
            conversation=self.announcement_conv,
            sender=self.manager_wh1,
            text="اطلاعیه رسمی شرکت"
        )

    def test_conversation_pin_toggle_and_personal_isolation(self):
        """سنجاق گفتگو شخصی است و برای هر کاربر جداگانه محاسبه می‌شود"""
        self.client.force_authenticate(user=self.staff_wh1)
        url = f"/api/communications/conversations/{self.direct_conv.id}/pin/"

        # ۱. سنجاق کردن گفتگو
        res = self.client.post(url, {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_pinned'])
        self.assertIsNotNone(res.data['pinned_at'])

        self.direct_part2.refresh_from_db()
        self.assertIsNotNone(self.direct_part2.pinned_at)

        # کاربر دیگر نباید این گفتگو را سنجاق‌شده ببیند
        self.direct_part1.refresh_from_db()
        self.assertIsNone(self.direct_part1.pinned_at)

        # ۲. کلیک مجدد -> برداشتن سنجاق (Toggle Off)
        res2 = self.client.post(url, {}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertFalse(res2.data['is_pinned'])
        self.assertIsNone(res2.data['pinned_at'])

    def test_conversation_pin_max_limit_5(self):
        """هر کاربر حداکثر می‌تواند ۵ گفتگو را سنجاق کند و تلاش برای ششمین گفتگو ۴۰۰ می‌دهد"""
        self.client.force_authenticate(user=self.staff_wh1)

        # ایجاد ۵ گفتگوی دیگر برای کاربر
        convs = []
        for i in range(5):
            c = Conversation.objects.create(
                title=f"گروه آزمایشی {i}",
                conv_type=ConversationType.GROUP,
                created_by=self.manager_wh1
            )
            ConversationParticipant.objects.create(
                conversation=c,
                user=self.staff_wh1,
                role=ParticipantRole.MEMBER,
                pinned_at=timezone.now() - timedelta(minutes=i)
            )
            c.participants.set([self.staff_wh1])
            convs.append(c)

        # اکنون کاربر ۵ گفتگوی سنجاق‌شده دارد؛ تلاش برای سنجاق direct_conv باید با ۴۰۰ رد شود
        url = f"/api/communications/conversations/{self.direct_conv.id}/pin/"
        res = self.client.post(url, {'pinned': True}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("حداکثر ۵ گفتگو", str(res.data))

    def test_conversation_pin_non_member_rejection(self):
        """کاربری که عضو گفتگو نیست نمی‌تواند آن را سنجاق کند (۴۰۳ یا ۴۰۴)"""
        # staff_wh2 عضو direct_conv نیست
        self.client.force_authenticate(user=self.staff_wh2)
        url = f"/api/communications/conversations/{self.direct_conv.id}/pin/"
        res = self.client.post(url, {}, format='json')
        self.assertIn(res.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_conversation_ordering_pinned_first(self):
        """گفتگوهای سنجاق‌شده در ابتدای فهرست قرار می‌گیرند"""
        self.client.force_authenticate(user=self.staff_wh1)

        # ایجاد پیام در direct_conv تا در get_queryset فیلتر نشود
        # ساخت گفتگوی دوم
        c2 = Conversation.objects.create(
            title="گفتگوی تست دوم",
            conv_type=ConversationType.GROUP,
            created_by=self.manager_wh1
        )
        ConversationParticipant.objects.create(
            conversation=c2, user=self.staff_wh1, role=ParticipantRole.MEMBER
        )
        c2.participants.set([self.staff_wh1])

        # سنجاق کردن direct_conv
        self.client.post(f"/api/communications/conversations/{self.direct_conv.id}/pin/", {'pinned': True}, format='json')

        res = self.client.get("/api/communications/conversations/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get('results', [])
        self.assertGreaterEqual(len(results), 2)
        # اولین گفتگو باید گفتگوی سنجاق‌شده باشد
        self.assertEqual(str(results[0]['id']), str(self.direct_conv.id))
        self.assertTrue(results[0]['is_pinned'])

    def test_message_pin_direct_chat_both_participants_allowed(self):
        """در گفتگوی دونفره هر دو مخاطب فعال می‌توانند پیام را سنجاق یا از سنجاق خارج کنند"""
        pin_url = f"/api/communications/messages/{self.msg_direct.id}/pin/"

        # ۱. فرستنده (manager_wh1) سنجاق می‌کند
        self.client.force_authenticate(user=self.manager_wh1)
        res1 = self.client.post(pin_url, {}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertTrue(res1.data['is_pinned'])
        self.assertEqual(len(res1.data['pinned_messages']), 1)
        self.assertEqual(res1.data['pinned_messages'][0]['id'], str(self.msg_direct.id))

        # ۲. گیرنده (staff_wh1) پیام را از سنجاق خارج می‌کند
        self.client.force_authenticate(user=self.staff_wh1)
        res2 = self.client.post(pin_url, {'pinned': False}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertFalse(res2.data['is_pinned'])
        self.assertEqual(len(res2.data['pinned_messages']), 0)

    def test_message_pin_group_chat_permissions(self):
        """در گروه فقط مالک یا مدیران می‌توانند سنجاق کنند؛ عضو عادی ۴۰۳ می‌گیرد"""
        pin_url = f"/api/communications/messages/{self.msg_group.id}/pin/"

        # ۱. عضو عادی (staff_wh1) تلاش برای سنجاق می‌کند -> ۴۰۳
        self.client.force_authenticate(user=self.staff_wh1)
        res_member = self.client.post(pin_url, {}, format='json')
        self.assertEqual(res_member.status_code, status.HTTP_403_FORBIDDEN)

        # ۲. مدیر/مالک (manager_wh1) پیام را سنجاق می‌کند -> ۲۰۰
        self.client.force_authenticate(user=self.manager_wh1)
        res_manager = self.client.post(pin_url, {}, format='json')
        self.assertEqual(res_manager.status_code, status.HTTP_200_OK)
        self.assertTrue(res_manager.data['is_pinned'])
        self.assertEqual(len(res_manager.data['pinned_messages']), 1)

    def test_message_pin_announcement_permissions(self):
        """در کانال اطلاعیه تنها فرستنده یا فرد دارای مجوز ارسال می‌تواند سنجاق کند"""
        pin_url = f"/api/communications/messages/{self.msg_announcement.id}/pin/"

        # عضو غیرفرستنده (staff_wh1) -> ۴۰۳
        self.client.force_authenticate(user=self.staff_wh1)
        res_other = self.client.post(pin_url, {}, format='json')
        self.assertEqual(res_other.status_code, status.HTTP_403_FORBIDDEN)

        # فرستنده (manager_wh1) -> ۲۰۰
        self.client.force_authenticate(user=self.manager_wh1)
        res_sender = self.client.post(pin_url, {}, format='json')
        self.assertEqual(res_sender.status_code, status.HTTP_200_OK)
        self.assertTrue(res_sender.data['is_pinned'])

    def test_message_pin_max_limit_5_per_conversation(self):
        """حداکثر ۵ پیام در هر گفتگو قابل سنجاق کردن است؛ سنجاق ششمین پیام ۴۰۰ می‌دهد"""
        self.client.force_authenticate(user=self.manager_wh1)

        # ساخت و سنجاق ۵ پیام در wh1_group
        msgs = []
        for i in range(5):
            m = Message.objects.create(
                conversation=self.wh1_group,
                sender=self.manager_wh1,
                text=f"پیام گروه {i}"
            )
            PinnedMessage.objects.create(
                conversation=self.wh1_group,
                message=m,
                pinned_by=self.manager_wh1
            )
            msgs.append(m)

        # تلاش برای سنجاق پیام ششم (msg_group) -> ۴۰۰
        url = f"/api/communications/messages/{self.msg_group.id}/pin/"
        res = self.client.post(url, {'pinned': True}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("حداکثر ۵ پیام", str(res.data))

    def test_soft_deleting_pinned_message_cleans_up_pin(self):
        """حذف نرم پیام سنجاق‌شده ردیف سنجاق را حذف کرده و لیست پیام‌های سنجاق‌شده را خالی می‌کند"""
        self.client.force_authenticate(user=self.manager_wh1)

        # سنجاق کردن پیام
        pin_url = f"/api/communications/messages/{self.msg_direct.id}/pin/"
        res_pin = self.client.post(pin_url, {'pinned': True}, format='json')
        self.assertEqual(res_pin.status_code, status.HTTP_200_OK)
        self.assertEqual(PinnedMessage.objects.filter(message=self.msg_direct).count(), 1)

        # حذف پیام توسط فرستنده
        delete_url = f"/api/communications/messages/{self.msg_direct.id}/"
        res_del = self.client.delete(delete_url)
        self.assertEqual(res_del.status_code, status.HTTP_204_NO_CONTENT)

        # ردیف سنجاق باید پاک شده باشد
        self.assertEqual(PinnedMessage.objects.filter(message=self.msg_direct).count(), 0)

        # دریافت گفتگو باید لیست pinned_messages خالی برگرداند
        conv_res = self.client.get(f"/api/communications/conversations/{self.direct_conv.id}/")
        self.assertEqual(conv_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(conv_res.data.get('pinned_messages', [])), 0)
