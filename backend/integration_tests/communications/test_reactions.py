from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from communications.models import (
    Conversation, ConversationParticipant, Message, MessageReaction, ConversationType
)
from communications.reactions import ALLOWED_REACTION_EMOJIS, ALLOWED_REACTION_EMOJI_LIST
from .base import BaseCommsTestCase


class MessageReactionsTestCase(BaseCommsTestCase):
    def setUp(self):
        super().setUp()
        self.message = Message.objects.create(
            conversation=self.wh1_group,
            sender=self.manager_wh1,
            text="سلام به همگی، این پیام آزمایشی واکنش‌هاست."
        )
        self.react_url = f"/api/communications/messages/{self.message.id}/react/"
        self.reactions_url = f"/api/communications/messages/{self.message.id}/reactions/"

    def test_reaction_creation_and_toggle(self):
        """ثبت واکنش جدید و کلیک مجدد روی همان ایموجی جهت حذف (Toggle Off)"""
        self.client.force_authenticate(user=self.staff_wh1)

        # ۱. ثبت واکنش 👍
        res = self.client.post(self.react_url, {'emoji': '👍'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertEqual(data['message_id'], self.message.id)
        self.assertEqual(data['conversation_id'], self.wh1_group.id)
        self.assertEqual(len(data['reactions']), 1)
        self.assertEqual(data['reactions'][0]['emoji'], '👍')
        self.assertEqual(data['reactions'][0]['count'], 1)
        self.assertTrue(data['reactions'][0]['mine'])

        # اعتبارسنجی در دیتابیس
        self.assertEqual(MessageReaction.objects.filter(message=self.message, user=self.staff_wh1).count(), 1)

        # ۲. کلیک مجدد روی همان ایموجی 👍 -> Toggle Off
        res2 = self.client.post(self.react_url, {'emoji': '👍'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        data2 = res2.data
        self.assertEqual(len(data2['reactions']), 0)
        self.assertEqual(MessageReaction.objects.filter(message=self.message, user=self.staff_wh1).count(), 0)

    def test_reaction_replace_with_different_emoji(self):
        """تغییر واکنش به ایموجی دیگر بدون ساخت سطر تکراری (تک‌واکنش برای هر کاربر در هر پیام)"""
        self.client.force_authenticate(user=self.staff_wh1)

        # ۱. واکنش اولیه با 👍
        res = self.client.post(self.react_url, {'emoji': '👍'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['reactions'][0]['emoji'], '👍')

        # ۲. تغییر به ❤️
        res2 = self.client.post(self.react_url, {'emoji': '❤️'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        reactions = res2.data['reactions']
        self.assertEqual(len(reactions), 1)
        self.assertEqual(reactions[0]['emoji'], '❤️')
        self.assertEqual(reactions[0]['count'], 1)
        self.assertTrue(reactions[0]['mine'])

        # باید دقیقاً ۱ سطر در دیتابیس با ایموجی جدید باشد
        user_reactions = MessageReaction.objects.filter(message=self.message, user=self.staff_wh1)
        self.assertEqual(user_reactions.count(), 1)
        self.assertEqual(user_reactions.first().emoji, '❤️')

    def test_allowed_emojis_strict_validation(self):
        """اعتبارسنجی سخت‌گیرانه ۶ ایموجی مجاز و رد هر کاراکتر غیرمجاز"""
        self.client.force_authenticate(user=self.staff_wh1)

        for emo in ALLOWED_REACTION_EMOJI_LIST:
            res = self.client.post(self.react_url, {'emoji': emo}, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            # تمیزکاری برای تست بعدی
            self.client.post(self.react_url, {'emoji': emo}, format='json')

        # ایموجی‌های غیرمجاز یا رشته‌های نامعتبر
        invalid_emojis = ['🔥', '🚀', '🎉', 'smile', '', None, 123]
        for bad in invalid_emojis:
            res = self.client.post(self.react_url, {'emoji': bad}, format='json')
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_member_rejection_and_tenant_scope(self):
        """کاربری که عضو گفتگو نیست باید ۴۰۳ بگیرد و نتواند واکنش ثبت یا فهرست را بخواند"""
        # staff_wh2 عضو انبار ۲ است و عضو گروه انبار ۱ نیست
        self.client.force_authenticate(user=self.staff_wh2)

        res_post = self.client.post(self.react_url, {'emoji': '👍'}, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_403_FORBIDDEN)

        res_get = self.client.get(self.reactions_url)
        self.assertEqual(res_get.status_code, status.HTTP_403_FORBIDDEN)

    def test_deleted_message_rejection(self):
        """پیام حذف‌شده نرم نباید اجازه ثبت یا مشاهده واکنش بدهد (۴۰۴)"""
        self.client.force_authenticate(user=self.staff_wh1)
        self.message.is_deleted = True
        self.message.save(update_fields=['is_deleted'])

        res_post = self.client.post(self.react_url, {'emoji': '👍'}, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_404_NOT_FOUND)

        res_get = self.client.get(self.reactions_url)
        self.assertEqual(res_get.status_code, status.HTTP_404_NOT_FOUND)

    def test_reactors_list_endpoint(self):
        """فهرست افراد واکنش‌دهنده با مشخصات کاربری و ایموجی"""
        # مدیر انبار ۱ و کارمند انبار ۱ هر دو واکنش می‌دهند
        MessageReaction.objects.create(message=self.message, user=self.manager_wh1, emoji='👍')
        MessageReaction.objects.create(message=self.message, user=self.staff_wh1, emoji='❤️')

        self.client.force_authenticate(user=self.staff_wh1)
        res = self.client.get(self.reactions_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertEqual(len(data), 2)
        users = {item['user_id']: item for item in data}
        self.assertIn(self.manager_wh1.id, users)
        self.assertEqual(users[self.manager_wh1.id]['emoji'], '👍')
        self.assertTrue(len(users[self.manager_wh1.id]['full_name']) > 0)
        self.assertIn('created_at', users[self.manager_wh1.id])

        self.assertIn(self.staff_wh1.id, users)
        self.assertEqual(users[self.staff_wh1.id]['emoji'], '❤️')

    def test_message_serializer_n_plus_one_prevention(self):
        """بررسی جلوگیری از N+1 کوئری در لود پیام‌ها با Prefetch واکنش‌ها"""
        # ایجاد ۲۰ پیام در گفتگو
        messages = [
            Message(
                conversation=self.wh1_group,
                sender=self.manager_wh1,
                text=f"پیام شماره {i}"
            )
            for i in range(20)
        ]
        created_msgs = Message.objects.bulk_create(messages)

        # ثبت واکنش برای همه پیام‌ها
        reactions = [
            MessageReaction(message=msg, user=self.staff_wh1, emoji='👍')
            for msg in created_msgs
        ]
        MessageReaction.objects.bulk_create(reactions)

        self.client.force_authenticate(user=self.staff_wh1)
        list_url = f"/api/communications/messages/?conversation_id={self.wh1_group.id}"

        # اجرای درخواست و اندازه‌گیری تعداد کوئری‌ها
        with self.assertNumQueries(8):  # تعداد کوئری‌ها O(1) و ثابت است (شامل پرفچ واکنش‌ها و پیوست‌ها بدون N+1)
            res = self.client.get(list_url)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            results = res.data.get('results', [])
            self.assertGreaterEqual(len(results), 20)
            # همه پیام‌ها باید آرایه واکنش‌های پر داشته باشند
            for m in results[:20]:
                self.assertIn('reactions', m)
