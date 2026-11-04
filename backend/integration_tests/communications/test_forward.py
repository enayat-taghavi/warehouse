import os
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status

from communications.models import (
    Conversation, ConversationParticipant, Message, MessageAttachment, ConversationType, ParticipantRole
)
from communications.membership import add_members
from .base import BaseCommsTestCase


class MessageForwardTestCase(BaseCommsTestCase):
    def setUp(self):
        super().setUp()
        self.forward_url = "/api/communications/messages/forward/"

        # ساخت گفتگوی گروهی دوم در انبار ۱
        self.wh1_group_2 = Conversation.objects.create(
            title="گروه آزمایشی دوم انبار ۱",
            conv_type=ConversationType.GROUP,
            warehouse=self.wh1,
            created_by=self.manager_wh1
        )
        add_members(self.wh1_group_2, [self.manager_wh1], role=ParticipantRole.OWNER)
        add_members(self.wh1_group_2, [self.staff_wh1])

        # ساخت گروه انبار ۲ (برای تست تفکیک دسترسی)
        self.wh2_group = Conversation.objects.create(
            title="گروه آزمایشی انبار ۲",
            conv_type=ConversationType.GROUP,
            warehouse=self.wh2,
            created_by=self.staff_wh2
        )
        add_members(self.wh2_group, [self.staff_wh2], role=ParticipantRole.OWNER)

        # ساخت کانال اطلاعیه انبار ۱
        self.wh1_announcement = Conversation.objects.create(
            title="اطلاعیه‌های انبار ۱",
            conv_type=ConversationType.ANNOUNCEMENT,
            warehouse_id=self.wh1.id,
            created_by=self.manager_wh1
        )

        # پیام‌های آزمایشی
        self.msg1 = Message.objects.create(
            conversation=self.wh1_group,
            sender=self.manager_wh1,
            text="پیام شماره ۱ از مدیر"
        )
        self.msg2 = Message.objects.create(
            conversation=self.wh1_group,
            sender=self.staff_wh1,
            text="پیام شماره ۲ از پرسنل"
        )

    def test_forward_single_message_to_single_destination(self):
        """بازارسال یک پیام به یک گفتگوی دیگر با ایجاد رکورد پیام جدید و ثبت نام بازارسال"""
        self.client.force_authenticate(user=self.staff_wh1)
        payload = {
            'message_ids': [self.msg1.id],
            'conversation_ids': [self.wh1_group_2.id],
        }
        res = self.client.post(self.forward_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['count'], 1)

        new_msg = Message.objects.filter(conversation=self.wh1_group_2).latest('id')
        self.assertEqual(new_msg.text, self.msg1.text)
        self.assertEqual(new_msg.sender, self.staff_wh1)
        self.assertEqual(new_msg.forwarded_from_message_id, self.msg1.id)
        self.assertEqual(new_msg.forwarded_from_name, self.manager_wh1.get_full_name() or self.manager_wh1.username)

    def test_forward_multi_message_to_multi_destinations(self):
        """بازارسال چند پیام به چند گفتگوی مقصد به صورت اتمیک و حفظ ترتیب زمانی"""
        # ساخت گفتگوی سوم برای مقصد دوم
        wh1_group_3 = Conversation.objects.create(
            title="گروه آزمایشی سوم انبار ۱",
            conv_type=ConversationType.GROUP,
            created_by=self.manager_wh1
        )
        add_members(wh1_group_3, [self.staff_wh1])

        self.client.force_authenticate(user=self.staff_wh1)
        # پیام‌ها معکوس فرستاده می‌شوند تا تست مرتب‌سازی زمانی سنجیده شود
        payload = {
            'message_ids': [self.msg2.id, self.msg1.id],
            'conversation_ids': [self.wh1_group_2.id, wh1_group_3.id],
        }
        res = self.client.post(self.forward_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['count'], 4)

        # بررسی حفظ ترتیب زمانی در مقصد
        dest_msgs = list(Message.objects.filter(conversation=self.wh1_group_2).order_by('created_at', 'id'))
        self.assertEqual(len(dest_msgs), 2)
        self.assertEqual(dest_msgs[0].text, self.msg1.text)
        self.assertEqual(dest_msgs[1].text, self.msg2.text)

    def test_forward_validation_limits(self):
        """محدودیت تعداد پیام‌ها (۱ تا ۲۰) و مقصدهای بازارسال (۱ تا ۵)"""
        self.client.force_authenticate(user=self.staff_wh1)

        # پیام خالی
        res = self.client.post(self.forward_url, {'message_ids': [], 'conversation_ids': [self.wh1_group_2.id]}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # بیش از ۲۰ پیام
        res = self.client.post(self.forward_url, {'message_ids': list(range(1, 22)), 'conversation_ids': [self.wh1_group_2.id]}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # مقصد خالی
        res = self.client.post(self.forward_url, {'message_ids': [self.msg1.id], 'conversation_ids': []}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # بیش از ۵ مقصد
        res = self.client.post(self.forward_url, {'message_ids': [self.msg1.id], 'conversation_ids': [1, 2, 3, 4, 5, 6]}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthorized_source_message_rejection(self):
        """کاربر بدون دسترسی خواندن به پیام مبدأ، خطای ۴۰۳ می‌گیرد"""
        # staff_wh2 عضو انبار ۲ است و به پیام‌های wh1 دسترسی ندارد
        self.client.force_authenticate(user=self.staff_wh2)
        payload = {
            'message_ids': [self.msg1.id],
            'conversation_ids': [self.wh2_group.id],
        }
        res = self.client.post(self.forward_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_target_conversation_rejection(self):
        """کاربری که عضو فعال گفتگوی مقصد نیست یا حق ارسال ندارد، خطای ۴۰۳ می‌گیرد"""
        self.client.force_authenticate(user=self.staff_wh1)

        # گفتگوی مقصد متعلق به انبار ۲ است و staff_wh1 عضو آن نیست
        payload = {
            'message_ids': [self.msg1.id],
            'conversation_ids': [self.wh2_group.id],
        }
        res = self.client.post(self.forward_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # کانال اطلاعیه انبار ۱ که staff_wh1 مدیرش نیست و حق ارسال ندارد
        payload2 = {
            'message_ids': [self.msg1.id],
            'conversation_ids': [self.wh1_announcement.id],
        }
        res2 = self.client.post(self.forward_url, payload2, format='json')
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_forwarded_from_name_snapshot_preserved_on_original_message_delete(self):
        """حفظ نام فرستنده اصلی (اسنپ‌شات) پس از حذف پیام اصلی یا فرستنده"""
        self.client.force_authenticate(user=self.staff_wh1)
        res = self.client.post(self.forward_url, {
            'message_ids': [self.msg1.id],
            'conversation_ids': [self.wh1_group_2.id],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        fwd_msg = Message.objects.filter(conversation=self.wh1_group_2).latest('id')
        original_sender_name = fwd_msg.forwarded_from_name
        self.assertTrue(bool(original_sender_name))

        # حذف پیام اصلی (حذف فیزیکی/دیتابیسی)
        self.msg1.delete()

        # بازخوانی پیام بازارسال‌شده
        fwd_msg.refresh_from_db()
        self.assertIsNone(fwd_msg.forwarded_from_message)
        self.assertEqual(fwd_msg.forwarded_from_name, original_sender_name)

        # بازارسال مجدد پیام بازارسال‌شده (Nested Forward) باید نام اولیه را حفظ کند
        res2 = self.client.post(self.forward_url, {
            'message_ids': [fwd_msg.id],
            'conversation_ids': [self.wh1_group.id],
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        nested_fwd_msg = Message.objects.filter(conversation=self.wh1_group).latest('id')
        self.assertEqual(nested_fwd_msg.forwarded_from_name, original_sender_name)

    def test_attachment_reference_counting_data_loss_protection(self):
        """
        حفاظت حیاتی از عدم از دست رفتن داده:
        وقتی پیامی دارای پیوست فایل به گفتگوی دیگری بازارسال می‌شود، حذف یکی از پیام‌ها یا
        پیوست‌های آن نباید فایل فیزیکی را از روی دیسک پاک کند تا زمانی که آخرین ارجاع حذف شود.
        """
        with tempfile.TemporaryDirectory() as tmp_media:
            with override_settings(MEDIA_ROOT=tmp_media):
                # ۱. ساخت پیام با پیوست فایل واقعی
                file_content = b"Content of confidential warehouse document for forward test"
                test_file = SimpleUploadedFile("report.pdf", file_content, content_type="application/pdf")

                msg_with_file = Message.objects.create(
                    conversation=self.wh1_group,
                    sender=self.manager_wh1,
                    text="سند بررسی انبار"
                )
                att1 = MessageAttachment.objects.create(
                    message=msg_with_file,
                    file=test_file,
                    file_name="report.pdf",
                    file_size=len(file_content),
                    content_type="application/pdf"
                )

                file_path = att1.file.path
                self.assertTrue(os.path.exists(file_path), "فایل فیزیکی باید پس از ایجاد روی دیسک وجود داشته باشد")

                # ۲. بازارسال پیام به گفتگوی دوم
                self.client.force_authenticate(user=self.staff_wh1)
                res = self.client.post(self.forward_url, {
                    'message_ids': [msg_with_file.id],
                    'conversation_ids': [self.wh1_group_2.id],
                }, format='json')
                self.assertEqual(res.status_code, status.HTTP_201_CREATED)

                fwd_msg = Message.objects.filter(conversation=self.wh1_group_2).latest('id')
                att2 = fwd_msg.attachments.first()
                self.assertIsNotNone(att2)
                self.assertEqual(att2.file.name, att1.file.name)
                self.assertEqual(att2.file.path, file_path)

                # ۳. حذف پیام مبدأ (CASCADE پیوست اول را حذف می‌کند)
                msg_with_file.delete()
                self.assertEqual(MessageAttachment.objects.filter(pk=att1.pk).count(), 0)

                # اعتبارسنجی حیاتی: فایل فیزیکی روی دیسک باید حفظ شده باشد چون att2 هنوز به آن اشاره دارد!
                self.assertTrue(
                    os.path.exists(file_path),
                    "خطای مهلک از دست رفتن داده: فایل فیزیکی نباید با حذف پیوست اول پاک می‌شد!"
                )

                # ۴. حذف پیام مقصد (آخرین ارجاع پیوست)
                fwd_msg.delete()
                self.assertEqual(MessageAttachment.objects.filter(pk=att2.pk).count(), 0)

                # اعتبارسنجی: اکنون که آخرین ارجاع حذف شد، فایل از روی دیسک پاک می‌شود
                self.assertFalse(
                    os.path.exists(file_path),
                    "فایل فیزیکی پس از حذف آخرین ارجاع باید از دیسک پاکسازی شود"
                )
