import os
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status

from communications.models import (
    Conversation, ConversationParticipant, Message, MessageAttachment,
    PinnedMessage, MessageReaction, ConversationType, ParticipantRole
)
from communications.consumers import record_delivery_ack
from .base import BaseCommsTestCase


class Phase8DeliveryAndBulkDeleteTestCase(BaseCommsTestCase):
    def setUp(self):
        super().setUp()
        self.bulk_delete_url = "/api/communications/messages/bulk-delete/"
        self.conv_url = "/api/communications/conversations/"

        # ساخت گفتگوی دونفره بین مدیر و پرسنل
        self.direct_conv = Conversation.objects.create(
            conv_type=ConversationType.DIRECT,
            created_by=self.manager_wh1
        )
        self.part_manager = ConversationParticipant.objects.create(
            conversation=self.direct_conv, user=self.manager_wh1, role=ParticipantRole.MEMBER
        )
        self.part_staff = ConversationParticipant.objects.create(
            conversation=self.direct_conv, user=self.staff_wh1, role=ParticipantRole.MEMBER
        )
        self.direct_conv.participants.set([self.manager_wh1, self.staff_wh1])

    def test_delivery_and_read_ticks_lifecycle(self):
        """
        چرخه کامل وضعیت تیک‌ها:
        ۱) تک تیک خاکستری: پیام ذخیره شده ولی به گیرنده نرسیده (is_delivered=False, read_by_count=0)
        ۲) دو تیک خاکستری: رویداد نوتیفیکیشن یا واکشی لیست گفتگوها توسط گیرنده (is_delivered=True, read_by_count=0)
        ۳) دو تیک آبی: خوانده شدن پیام توسط گیرنده (read_by_count > 0)
        """
        # ۱) مدیر پیامی در گفتگوی دونفره ارسال می‌کند
        msg = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.manager_wh1,
            text="سلام پرسنل، وضعیت انبار چطوره؟"
        )

        # استعلام فرستنده از پیام قبل از تحویل به گیرنده
        self.client.force_authenticate(user=self.manager_wh1)
        res = self.client.get(f"/api/communications/messages/?conversation_id={self.direct_conv.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        msg_data = res.data['results'][0]
        self.assertEqual(msg_data['id'], msg.id)
        self.assertFalse(msg_data['is_delivered'])
        self.assertEqual(msg_data['delivered_count'], 0)
        self.assertEqual(msg_data['read_by_count'], 0)

        # ۲) پرسنل لیست مکالمات خود را واکشی می‌کند (مشابه لود شدن تب چت در فرانت یا رسیدن اعلان)
        self.client.force_authenticate(user=self.staff_wh1)
        # برودکست تحویل در on_commit اجرا می‌شود؛ بدون اجرای آن، خطای واقعی فهرست گفتگوها پنهان می‌ماند
        with self.captureOnCommitCallbacks(execute=True):
            res_conv = self.client.get(self.conv_url)
        self.assertEqual(res_conv.status_code, status.HTTP_200_OK)

        # بررسی به‌روزرسانی last_delivered_message در دیتابیس
        self.part_staff.refresh_from_db()
        self.assertEqual(self.part_staff.last_delivered_message_id, msg.id)

        # حال فرستنده وضعیت پیام را استعلام می‌گیرد: دو تیک خاکستری (is_delivered=True)
        self.client.force_authenticate(user=self.manager_wh1)
        res2 = self.client.get(f"/api/communications/messages/?conversation_id={self.direct_conv.id}")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        msg_data2 = res2.data['results'][0]
        self.assertTrue(msg_data2['is_delivered'])
        self.assertGreaterEqual(msg_data2['delivered_count'], 1)
        self.assertEqual(msg_data2['read_by_count'], 0)

        # ۳) پرسنل گفتگو را باز کرده و پیام را می‌خواند
        self.client.force_authenticate(user=self.staff_wh1)
        res_read = self.client.post(
            f"/api/communications/conversations/{self.direct_conv.id}/mark-read/",
            {'until_message_id': msg.id},
            format='json'
        )
        self.assertEqual(res_read.status_code, status.HTTP_200_OK)

        # حال فرستنده پیام را می‌بیند: دو تیک آبی (read_by_count > 0)
        self.client.force_authenticate(user=self.manager_wh1)
        res3 = self.client.get(f"/api/communications/messages/?conversation_id={self.direct_conv.id}")
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        msg_data3 = res3.data['results'][0]
        self.assertTrue(msg_data3['is_delivered'])
        self.assertGreaterEqual(msg_data3['read_by_count'], 1)

    def test_bulk_delete_validation_and_permissions(self):
        """
        اعتبارسنجی پارامترها و دسترسی در حذف گروهی پیام‌ها:
        - آرایه خالی یا بیش از ۲۰ پیام رد می‌شود (400)
        - عدم دسترسی به حذف پیام دیگران (403) و عدم تغییر هیچ پیامی
        - حذف موفق پیام‌های خود کاربر و پاکسازی سنجاق‌ها و واکنش‌ها
        """
        msg1 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۱")
        msg2 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۲")
        msg3 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۳")

        # ثبت سنجاق و واکنش روی پیام‌ها
        pin2 = PinnedMessage.objects.create(conversation=self.direct_conv, message=msg2, pinned_by=self.manager_wh1)
        react3 = MessageReaction.objects.create(message=msg3, user=self.manager_wh1, emoji="👍")

        # تست اعتبارسنجی آرایه خالی
        self.client.force_authenticate(user=self.manager_wh1)
        res_empty = self.client.post(self.bulk_delete_url, {'message_ids': []}, format='json')
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)

        # تست بیش از ۲۰ پیام
        res_too_many = self.client.post(self.bulk_delete_url, {'message_ids': list(range(1, 25))}, format='json')
        self.assertEqual(res_too_many.status_code, status.HTTP_400_BAD_REQUEST)

        # پرسنل سعی می‌کند پیام‌های مدیر را حذف کند (۴۰۳ غیرمجاز)
        self.client.force_authenticate(user=self.staff_wh1)
        res_forbidden = self.client.post(
            self.bulk_delete_url,
            {'message_ids': [msg1.id, msg2.id, msg3.id]},
            format='json'
        )
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)
        # پیام‌ها نباید حذف شده باشند
        self.assertFalse(Message.objects.filter(id__in=[msg1.id, msg2.id, msg3.id], is_deleted=True).exists())

        # مدیر پیام‌های خودش را به شکل گروهی حذف می‌کند
        self.client.force_authenticate(user=self.manager_wh1)
        res_ok = self.client.post(
            self.bulk_delete_url,
            {'message_ids': [msg1.id, msg2.id, msg3.id]},
            format='json'
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ok.data['count'], 3)

        # تأیید سافت‌دلیت شدن پیام‌ها
        for m in [msg1, msg2, msg3]:
            m.refresh_from_db()
            self.assertTrue(m.is_deleted)
            self.assertEqual(m.text, '')

        # تأیید پاکسازی سنجاق و واکنش وابسته
        self.assertFalse(PinnedMessage.objects.filter(id=pin2.id).exists())
        self.assertFalse(MessageReaction.objects.filter(id=react3.id).exists())

    def test_bulk_delete_preserves_shared_attachment_via_refcount(self):
        """
        حذف گروهی پیام دارای پیوست مشترک، با ایمنی شمارش ارجاع (Reference Counting)
        فایل مشترک روی دیسک را پاک نمی‌کند.
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            with override_settings(MEDIA_ROOT=temp_dir):
                file_content = b"Phase 8 shared test image content"
                uploaded = SimpleUploadedFile("test_phase8.png", file_content, content_type="image/png")

                msg1 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="با فایل")
                att1 = MessageAttachment.objects.create(
                    message=msg1,
                    file=uploaded,
                    file_name="test_phase8.png",
                    file_size=len(file_content),
                    content_type="image/png"
                )
                file_path = att1.file.path
                self.assertTrue(os.path.exists(file_path))

                # پیام دوم (مثلاً بازارسال‌شده) که به همان فایل اشاره دارد
                msg2 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="بازارسال")
                att2 = MessageAttachment.objects.create(
                    message=msg2,
                    file=att1.file.name,
                    file_name="test_phase8.png",
                    file_size=len(file_content),
                    content_type="image/png"
                )

                # حذف پیام اول در عملیات bulk-delete
                self.client.force_authenticate(user=self.manager_wh1)
                res = self.client.post(self.bulk_delete_url, {'message_ids': [msg1.id]}, format='json')
                self.assertEqual(res.status_code, status.HTTP_200_OK)

                # رکورد پیوست پیام اول حذف شده است
                self.assertFalse(MessageAttachment.all_objects.filter(id=att1.id).exists())
                # رکورد پیوست پیام دوم باقی مانده است
                self.assertTrue(MessageAttachment.all_objects.filter(id=att2.id).exists())
                # فایل فیزیکی روی دیسک به دلیل وجود ارجاع دوم پاک نشده است!
                self.assertTrue(os.path.exists(file_path))

    def test_single_delete_cleans_attachments_with_refcount(self):
        """
        حذف تکی پیام (DELETE /messages/<id>/) نیز همانند حذف گروهی پیوست‌ها را با رعایت شمارش ارجاع پاک‌سازی می‌کند.
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            with override_settings(MEDIA_ROOT=temp_dir):
                file_content = b"Single delete shared test content"
                uploaded = SimpleUploadedFile("single_del.png", file_content, content_type="image/png")

                msg1 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۱")
                att1 = MessageAttachment.objects.create(
                    message=msg1, file=uploaded, file_name="single_del.png",
                    file_size=len(file_content), content_type="image/png"
                )
                file_path = att1.file.path
                self.assertTrue(os.path.exists(file_path))

                msg2 = Message.objects.create(conversation=self.direct_conv, sender=self.manager_wh1, text="پیام ۲")
                att2 = MessageAttachment.objects.create(
                    message=msg2, file=att1.file.name, file_name="single_del.png",
                    file_size=len(file_content), content_type="image/png"
                )

                self.client.force_authenticate(user=self.manager_wh1)
                res1 = self.client.delete(f"/api/communications/messages/{msg1.id}/")
                self.assertEqual(res1.status_code, status.HTTP_204_NO_CONTENT)
                self.assertFalse(MessageAttachment.all_objects.filter(id=att1.id).exists())
                self.assertTrue(os.path.exists(file_path))

                res2 = self.client.delete(f"/api/communications/messages/{msg2.id}/")
                self.assertEqual(res2.status_code, status.HTTP_204_NO_CONTENT)
                self.assertFalse(MessageAttachment.all_objects.filter(id=att2.id).exists())
                self.assertFalse(os.path.exists(file_path))

    def test_edit_message_replying_to_soft_deleted_message_succeeds(self):
        """
        ویرایش پیامی که به یک پیام حذف‌شدهٔ نرم پاسخ داده است نباید خطای DoesNotExist بدهد.
        """
        parent = Message.objects.create(conversation=self.direct_conv, sender=self.staff_wh1, text="پیام والد")
        reply = Message.objects.create(
            conversation=self.direct_conv, sender=self.manager_wh1, text="پاسخ اولیه", reply_to=parent
        )
        parent.soft_delete()

        self.client.force_authenticate(user=self.manager_wh1)
        res = self.client.patch(
            f"/api/communications/messages/{reply.id}/",
            {'text': 'پاسخ ویرایش‌شده'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['text'], 'پاسخ ویرایش‌شده')
        self.assertEqual(res.data['reply_to_details'], {'id': parent.id, 'deleted': True})
