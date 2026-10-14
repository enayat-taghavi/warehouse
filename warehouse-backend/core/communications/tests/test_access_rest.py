import json
from rest_framework import status
from django.core.files.uploadedfile import SimpleUploadedFile

from communications.models import Conversation, Message, GenericComment, ConversationType
from communications.tests.base import BaseCommsTestCase, User


class AccessControlRESTTestCase(BaseCommsTestCase):
    """
    مجموعه آزمون‌های جامع کنترل دسترسی REST، مسدودسازی رخنه‌های IDOR و تفکیک انبارها
    """

    # ─── ۱. آزمون‌های دسترسی به پیام‌ها (Message Access Control & IDOR) ───

    def test_outsider_cannot_list_messages(self):
        """کاربر غیرعضو (پرسنل انبار ۲) نباید بتواند پیام‌های چت خصوصی مدیر و پرسنل ۱ را ببیند"""
        self.auth(self.staff_wh2)
        response = self.client.get(f'/api/communications/messages/?conversation_id={self.direct_conv.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 0, "کاربر غیرعضو به پیام‌های گفتگوی خصوصی دسترسی پیدا کرد (IDOR)")

    def test_participant_can_list_messages(self):
        """عضو مجاز گفتگو (پرسنل انبار ۱) باید بتواند پیام‌های گفتگوی خود را دریافت کند"""
        self.auth(self.staff_wh1)
        response = self.client.get(f'/api/communications/messages/?conversation_id={self.direct_conv.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]['text'], self.direct_message.text)

    def test_outsider_cannot_post_message(self):
        """کاربر غیرعضو نباید بتواند در گفتگوی خصوصی دیگران پیام ارسال کند (باید ۴۰۳ دریافت کند)"""
        self.auth(self.staff_wh2)
        payload = {
            'conversation': str(self.direct_conv.id),
            'text': 'تلاش برای تزریق پیام توسط فرد متفرقه'
        }
        response = self.client.post('/api/communications/messages/', payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_conversation_returns_400_not_500(self):
        """ارسال پیام بدون شناسه گفتگو یا گفتگوی ناموجود باید ۴۰۰ برگرداند، نه خطای ۵۰۰ سرور"""
        self.auth(self.staff_wh1)
        # بدون فیلد conversation
        response = self.client.post('/api/communications/messages/', {'text': 'سلام'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # با شناسه گفتگوی ناموجود
        response2 = self.client.post('/api/communications/messages/', {'conversation': '99999', 'text': 'سلام'})
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_is_system_flag_is_ignored_from_client(self):
        """کلاینت نباید بتواند با ارسال is_system=True پیام جعلی سیستمی بسازد"""
        self.auth(self.staff_wh1)
        payload = {
            'conversation': str(self.direct_conv.id),
            'text': 'پیام به ظاهر سیستمی',
            'is_system': True
        }
        response = self.client.post('/api/communications/messages/', payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        msg_id = response.data['id']
        msg = Message.objects.get(id=msg_id)
        self.assertFalse(msg.is_system, "پرچم is_system نباید توسط کاربر عادی قابل تنظیم باشد")

    def test_non_author_cannot_edit_or_delete_message(self):
        """تنها فرستنده پیام یا سوپریوزر مجاز به ویرایش یا حذف پیام است"""
        # پرسنل انبار ۱ تلاش می‌کند پیام مدیر انبار ۱ را ویرایش کند
        self.auth(self.staff_wh1)
        response_edit = self.client.patch(
            f'/api/communications/messages/{self.direct_message.id}/',
            {'text': 'متن دستکاری‌شده توسط پرسنل'}
        )
        self.assertEqual(response_edit.status_code, status.HTTP_403_FORBIDDEN)

        response_delete = self.client.delete(f'/api/communications/messages/{self.direct_message.id}/')
        self.assertEqual(response_delete.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_move_message_to_another_conversation(self):
        """فیلد conversation پیام نباید در ویرایش تغییر کند و به گفتگوی دیگر منتقل شود"""
        self.auth(self.manager_wh1)
        original_conv_id = self.direct_message.conversation_id
        response = self.client.patch(
            f'/api/communications/messages/{self.direct_message.id}/',
            {
                'text': 'متن ویرایش‌شده',
                'conversation': str(self.wh1_group.id)
            }
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.direct_message.refresh_from_db()
        self.assertEqual(self.direct_message.conversation_id, original_conv_id, "شناسه گفتگو نباید تغییر کند")
        self.assertEqual(self.direct_message.text, 'متن ویرایش‌شده')

    # ─── ۲. آزمون‌های گفتگوها (Conversation Access & Permissions) ───

    def test_cannot_convert_direct_to_announcement(self):
        """نوع گفتگو (conv_type) نباید پس از ایجاد توسط کلاینت تغییر داده شود"""
        self.auth(self.staff_wh1)
        response = self.client.patch(
            f'/api/communications/conversations/{self.direct_conv.id}/',
            {'conv_type': 'announcement'}
        )
        self.direct_conv.refresh_from_db()
        self.assertEqual(self.direct_conv.conv_type, ConversationType.DIRECT)

    def test_outsider_cannot_rename_or_delete_conversation(self):
        """کاربر متفرقه نباید بتواند گروه یا گفتگوی دیگران را ویرایش یا حذف کند"""
        self.auth(self.staff_wh2)
        response = self.client.patch(
            f'/api/communications/conversations/{self.wh1_group.id}/',
            {'title': 'نام دستکاری‌شده'}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_participants_field_is_read_only(self):
        """فیلد اعضا نباید به صورت مستقیم با ارسال آرایه دلخواه توسط کاربر عادی دستکاری شود"""
        self.auth(self.staff_wh1)
        self.client.patch(
            f'/api/communications/conversations/{self.direct_conv.id}/',
            {'participants': [self.staff_wh1.id, self.staff_wh2.id]}
        )
        self.direct_conv.refresh_from_db()
        self.assertFalse(self.direct_conv.participants.filter(id=self.staff_wh2.id).exists())

    def test_manager_cannot_post_to_other_warehouse_announcement_channel(self):
        """مدیر یک انبار نباید بتواند در کانال اطلاعیه انبار دیگر پیام بفرستد"""
        # ساخت کانال اطلاعیه برای انبار ۱
        wh1_announcement = Conversation.objects.create(
            title="کانال اطلاعیه انبار ۱",
            conv_type=ConversationType.ANNOUNCEMENT,
            warehouse=self.wh1,
            created_by=self.manager_wh1
        )

        # ساخت مدیر برای انبار ۲
        manager_wh2 = User.objects.create_user(
            username="manager_wh2_test",
            password="Password123!",
            is_staff=True
        )
        manager_wh2.assigned_warehouses.set([self.wh2])

        # مدیر انبار ۲ تلاش می‌کند در اطلاعیه انبار ۱ پیام بفرستد -> باید ۴۰۳ شود
        self.auth(manager_wh2)
        resp_forbidden = self.client.post(
            '/api/communications/messages/',
            {
                'conversation': str(wh1_announcement.id),
                'text': 'پیام غیرمجاز مدیر انبار ۲ در اطلاعیه انبار ۱'
            }
        )
        self.assertEqual(resp_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # مدیر انبار ۱ پیام می‌فرستد -> باید ۲۰۱ شود
        self.auth(self.manager_wh1)
        resp_allowed = self.client.post(
            '/api/communications/messages/',
            {
                'conversation': str(wh1_announcement.id),
                'text': 'پیام مجاز مدیر انبار ۱'
            }
        )
        self.assertEqual(resp_allowed.status_code, status.HTTP_201_CREATED)

    # ─── ۳. آزمون‌های کامنت‌های چندریختی (Generic Comments Control) ───

    def test_comments_require_target_params(self):
        """درخواست فهرست کامنت‌ها بدون پارامترهای model_name و object_id باید ۴۰۰ برگرداند"""
        self.auth(self.staff_wh1)
        response = self.client.get('/api/communications/comments/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_comment_scoped_to_user_warehouses(self):
        """کاربر انبار ۲ نباید به کامنت‌های کالای انبار ۱ دسترسی داشته باشد"""
        self.auth(self.staff_wh2)
        response = self.client.get(
            f'/api/communications/comments/?model_name=item&object_id={self.item_wh1.id}'
        )
        # یا باید ۴۰۳ بدهد یا لیست خالی
        if response.status_code == status.HTTP_200_OK:
            results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
            self.assertEqual(len(results), 0)
        else:
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_author_cannot_edit_comment(self):
        """کاربری غیر از نویسنده کامنت نباید بتواند کامنت را ویرایش کند"""
        self.auth(self.staff_wh2)
        response = self.client.patch(
            f'/api/communications/comments/{self.comment_wh1.id}/',
            {'text': 'دستکاری متن کامنت'}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_malformed_content_type_returns_400(self):
        """ارسال content_type_str نامعتبر باید ۴۰۰ برگرداند نه خطای ۵۰۰"""
        self.auth(self.staff_wh1)
        payload = {
            'content_type_str': 'invalid_format_without_dot',
            'object_id': '1',
            'text': 'کامنت آزمایشی'
        }
        response = self.client.post('/api/communications/comments/', payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_disallowed_content_type_rejected(self):
        """ارسال مدل‌هایی خارج از Allowlist مجاز باید رد شود"""
        self.auth(self.staff_wh1)
        payload = {
            'content_type_str': 'auth.user',
            'object_id': '1',
            'text': 'کامنت روی مدل غیرمجاز'
        }
        response = self.client.post('/api/communications/comments/', payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nonexistent_object_id_rejected(self):
        """ارسال شناسه شیء ناموجود باید با ۴۰۰ رد شود"""
        self.auth(self.staff_wh1)
        payload = {
            'content_type_str': 'inventory.item',
            'object_id': '999999',
            'text': 'کامنت روی کالای ناموجود'
        }
        response = self.client.post('/api/communications/comments/', payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ─── ۴. آزمون‌های لیست مخاطبین (Contacts List) ───

    def test_contacts_returns_all_active_users(self):
        """لیست مخاطبین باید تمام پرسنل فعال سازمان را بدون محدودیت انبار برگرداند و خود کاربر را استثنا کند"""
        self.auth(self.staff_wh1)
        response = self.client.get('/api/communications/contacts/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user_ids = [u['id'] for u in (response.data.get('results', response.data) if isinstance(response.data, dict) else response.data)]
        self.assertIn(self.manager_wh1.id, user_ids)
        self.assertIn(self.staff_wh2.id, user_ids)
        self.assertNotIn(self.staff_wh1.id, user_ids, "خود کاربر نباید در لیست مخاطبین خود باشد")
