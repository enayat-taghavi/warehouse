import io
from unittest.mock import patch
from django.test import override_settings
from rest_framework import status
from communications.models import Message, GenericComment
from accounts.models import AuditLog
from .base import BaseCommsTestCase


class DataIntegrityAndDeliveryTestCase(BaseCommsTestCase):
    """
    مجموعه تست‌های بسته ۲: یکپارچگی داده، صف آفلاین و پایداری پیام‌ها (فاز ۴)
    پوشش‌دهنده ایرادات: ۱۳، ۱۴، ۱۶، ۱۸، ۱۹، ۲۰، ۲۱، ۲۲، ۲۴
    """

    def test_duplicate_client_temp_id_returns_same_message(self):
        """
        ارسال مجدد پیام با همان client_temp_id نباید رکورد تکراری ایجاد کند (Idempotency - ایراد ۱۸)
        """
        self.client.force_authenticate(user=self.staff_wh1)
        temp_id = "temp-msg-uuid-999"
        payload = {
            'conversation': str(self.direct_conv.id),
            'text': 'سلام، این پیام برای بررسی عدم تکرار است',
            'client_temp_id': temp_id
        }

        # ارسال اول
        res1 = self.client.post('/api/communications/messages/', payload)
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        first_msg_id = res1.data['id']

        # ارسال دوم با همان client_temp_id
        res2 = self.client.post('/api/communications/messages/', payload)
        self.assertIn(res2.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(res2.data['id'], first_msg_id)

        # اطمینان از وجود دقیقاً ۱ رکورد در دیتابیس
        count = Message.objects.filter(
            conversation=self.direct_conv,
            client_temp_id=temp_id
        ).count()
        self.assertEqual(count, 1)

    def test_replay_after_offline_queue_does_not_duplicate(self):
        """
        شبیه‌سازی Replay صف آفلاین: دو پیام متوالی با temp_id مشخص نباید بیش از یک بار ثبت شوند (ایراد ۱۸)
        """
        self.client.force_authenticate(user=self.staff_wh1)
        temp_id_1 = "offline-queue-item-101"
        payload_1 = {
            'conversation': str(self.wh1_group.id),
            'text': 'پیام اول از صف آفلاین',
            'client_temp_id': temp_id_1
        }

        # ثبت اولیه
        res = self.client.post('/api/communications/messages/', payload_1)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # بازپخش مجدد پیام اول
        res_replay = self.client.post('/api/communications/messages/', payload_1)
        self.assertEqual(res_replay.status_code, status.HTTP_200_OK)
        self.assertEqual(res_replay.data['client_temp_id'], temp_id_1)

        # تعداد کل پیام‌های گروه انبار با این temp_id باید دقیقاً ۱ باشد
        self.assertEqual(Message.objects.filter(conversation=self.wh1_group, client_temp_id=temp_id_1).count(), 1)

    def test_delete_message_is_soft(self):
        """
        حذف پیام باید به صورت نرم (Soft Delete) انجام شود و رکورد در all_objects باقی بماند (ایراد ۱۶)
        """
        self.client.force_authenticate(user=self.staff_wh1)
        msg = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.staff_wh1,
            text='پیامی که باید حذف نرم شود'
        )

        res = self.client.delete(f'/api/communications/messages/{msg.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

        # در کوئری عادی objects نباید پیدا شود
        self.assertFalse(Message.objects.filter(id=msg.id).exists())

        # در all_objects با وضعیت is_deleted=True باید موجود باشد
        deleted_msg = Message.all_objects.filter(id=msg.id).first()
        self.assertIsNotNone(deleted_msg)
        self.assertTrue(deleted_msg.is_deleted)

    def test_soft_deleted_message_hidden_from_list(self):
        """
        پیام‌های حذف نرم شده نباید در لیست تاریخچه پیام‌ها برگردانده شوند (ایراد ۱۶)
        """
        self.client.force_authenticate(user=self.staff_wh1)
        msg1 = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.staff_wh1,
            text='پیام فعال'
        )
        msg2 = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.staff_wh1,
            text='پیام حذف‌شده'
        )
        msg2.soft_delete()

        res = self.client.get(f'/api/communications/messages/?conversation_id={self.direct_conv.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data.get('results', res.data)
        ids = [item['id'] for item in data]
        self.assertIn(msg1.id, ids)
        self.assertNotIn(msg2.id, ids)

    def test_delete_writes_audit_log(self):
        """
        حذف پیام باید یک رکورد ممیزی در AuditLog ثبت کند (ایراد ۲۴)
        """
        self.client.force_authenticate(user=self.staff_wh1)
        msg = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.staff_wh1,
            text='پیام برای تست ممیزی'
        )

        res = self.client.delete(f'/api/communications/messages/{msg.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

        # بررسی ثبت لاگ
        log_entry = AuditLog.objects.filter(
            target_model='Message',
            target_object_id=str(msg.id),
            action='DELETE'
        ).first()

        self.assertIsNotNone(log_entry)
        self.assertEqual(log_entry.user, self.staff_wh1)
        self.assertEqual(log_entry.severity, 'warning')

    def test_text_over_limit_rejected(self):
        """
        ارسال متن با طول بیش از ۴۰۰۰ کاراکتر باید با خطای ۴۰۰ رد شود (ایراد ۱۴)
        """
        self.client.force_authenticate(user=self.staff_wh1)

        # ارسال ۴۰۰۱ کاراکتر -> رد می‌شود
        long_text = 'A' * 4001
        res = self.client.post('/api/communications/messages/', {
            'conversation': self.direct_conv.id,
            'text': long_text
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('text', res.data)

        # ارسال ۴۰۰۰ کاراکتر -> تایید می‌شود
        valid_text = 'A' * 4000
        res_valid = self.client.post('/api/communications/messages/', {
            'conversation': self.direct_conv.id,
            'text': valid_text
        })
        if res_valid.status_code != 201:
            print("DEBUG res_valid.data:", res_valid.data)
        self.assertEqual(res_valid.status_code, status.HTTP_201_CREATED)

    def test_message_burst_is_throttled(self):
        """
        نرخ ارسال پیام با Throttling کنترل شده و در ارسال بیش از حد کد ۴۲۹ برمی‌گرداند (ایراد ۱۳)
        """
        from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
        from django.core.cache import cache
        cache.clear()

        old_scoped = ScopedRateThrottle.THROTTLE_RATES.get('chat_message')
        old_simple = SimpleRateThrottle.THROTTLE_RATES.get('chat_message')
        ScopedRateThrottle.THROTTLE_RATES['chat_message'] = '3/minute'
        SimpleRateThrottle.THROTTLE_RATES['chat_message'] = '3/minute'

        try:
            self.client.force_authenticate(user=self.staff_wh1)
            
            # ۳ درخواست مجاز
            for i in range(3):
                res = self.client.post('/api/communications/messages/', {
                    'conversation': self.direct_conv.id,
                    'text': f'پیام شماره {i}'
                })
                self.assertEqual(res.status_code, status.HTTP_201_CREATED)

            # درخواست ۴ ام باید ۴۲۹ شود
            res_throttled = self.client.post('/api/communications/messages/', {
                'conversation': self.direct_conv.id,
                'text': 'پیام مسدودشده با Throttling'
            })
            self.assertEqual(res_throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        finally:
            if old_scoped:
                ScopedRateThrottle.THROTTLE_RATES['chat_message'] = old_scoped
            if old_simple:
                SimpleRateThrottle.THROTTLE_RATES['chat_message'] = old_simple
            cache.clear()

    def test_upload_burst_is_throttled_with_chat_upload_scope(self):
        """
        نرخ آپلود فایل به صورت مجزا با اسکوپ chat_upload کنترل می‌شود (ایراد ۱۵ / ۴۸)
        """
        from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
        from django.core.cache import cache
        cache.clear()

        old_scoped = ScopedRateThrottle.THROTTLE_RATES.get('chat_upload')
        old_simple = SimpleRateThrottle.THROTTLE_RATES.get('chat_upload')
        ScopedRateThrottle.THROTTLE_RATES['chat_upload'] = '2/minute'
        SimpleRateThrottle.THROTTLE_RATES['chat_upload'] = '2/minute'

        try:
            self.client.force_authenticate(user=self.staff_wh1)
            msg = Message.objects.create(
                conversation=self.direct_conv,
                sender=self.staff_wh1,
                text='پیام آپلود تستی'
            )

            png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'

            # ۲ آپلود مجاز
            for i in range(2):
                f = io.BytesIO(png_content)
                f.name = f'test_{i}.png'
                res = self.client.post(
                    '/api/communications/messages/upload/',
                    {'file': f, 'message_id': str(msg.id)},
                    format='multipart'
                )
                self.assertEqual(res.status_code, status.HTTP_201_CREATED)

            # آپلود ۳ ام باید ۴۲۹ شود
            f3 = io.BytesIO(png_content)
            f3.name = 'test_3.png'
            res_throttled = self.client.post(
                '/api/communications/messages/upload/',
                {'file': f3, 'message_id': str(msg.id)},
                format='multipart'
            )
            self.assertEqual(res_throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        finally:
            if old_scoped:
                ScopedRateThrottle.THROTTLE_RATES['chat_upload'] = old_scoped
            if old_simple:
                SimpleRateThrottle.THROTTLE_RATES['chat_upload'] = old_simple
            cache.clear()

    def test_attachment_emits_updated_event(self):
        """
        بارگذاری پیوست باید رویداد chat.message.updated را روی وب‌سوکت منتشر کند (ایراد ۲۲)
        """
        self.client.force_authenticate(user=self.staff_wh1)
        msg = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.staff_wh1,
            text='پیام دارای پیوست'
        )

        png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        file_obj = io.BytesIO(png_content)
        file_obj.name = 'attachment.png'

        with patch('communications.views.broadcast_message_updated_ws') as mock_broadcast:
            res = self.client.post(
                '/api/communications/messages/upload/',
                {'file': file_obj, 'message_id': str(msg.id)},
                format='multipart'
            )
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertTrue(mock_broadcast.called)
            # آرگومان فراخوانی باید همان شیء پیام باشد
            called_msg = mock_broadcast.call_args[0][0]
            self.assertEqual(called_msg.id, msg.id)
