import os
import tempfile
from io import BytesIO
from datetime import timedelta
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from channels.testing import WebsocketCommunicator
from rest_framework import status

from communications.models import (
    Conversation, Message, MessageAttachment, GenericComment
)
from communications.consumers import ChatConsumer
from .base import BaseCommsTestCase
from settings_core.models import SystemSetting
from warehouses.services import get_setting, clear_setting_cache


class SettingsAndPurgeTestCase(BaseCommsTestCase):
    """
    مجموعه آزمون‌های سوئیچ‌های تنظیمات، پرمیشن‌ها، و پاکسازی رسانه‌های منقضی (فاز ۸)
    """

    def setUp(self):
        super().setUp()
        SystemSetting.objects.filter(key__in=['chat_enabled', 'chat_file_sharing', 'chat_max_upload_mb']).delete()
        clear_setting_cache('chat_max_upload_mb')
        clear_setting_cache('chat_enabled')
        clear_setting_cache('chat_file_sharing')
        clear_setting_cache('chat_enabled', self.wh1.id)
        clear_setting_cache('chat_enabled', self.wh2.id)

    def tearDown(self):
        SystemSetting.objects.filter(key__in=['chat_enabled', 'chat_file_sharing', 'chat_max_upload_mb']).delete()
        clear_setting_cache('chat_max_upload_mb')
        clear_setting_cache('chat_enabled')
        clear_setting_cache('chat_file_sharing')
        clear_setting_cache('chat_enabled', self.wh1.id)
        clear_setting_cache('chat_enabled', self.wh2.id)
        super().tearDown()

    def test_warehouse_override_beats_global(self):
        """تنظیمات اختصاصی انبار باید بر تنظیمات سراسری اولویت داشته باشد"""
        # تنظیم سراسری: chat_enabled = True
        SystemSetting.objects.update_or_create(
            key='chat_enabled',
            warehouse_id=None,
            defaults={'value': True}
        )
        clear_setting_cache('chat_enabled')

        # تنظیم اختصاصی انبار ۱: chat_enabled = False
        SystemSetting.objects.update_or_create(
            key='chat_enabled',
            warehouse_id=self.wh1.id,
            defaults={'value': False}
        )
        clear_setting_cache('chat_enabled', self.wh1.id)

        # نتیجه برای انبار ۱ باید False و برای انبار ۲ باید True باشد
        self.assertFalse(get_setting('chat_enabled', warehouse_id=self.wh1.id))
        self.assertTrue(get_setting('chat_enabled', warehouse_id=self.wh2.id))

    def test_chat_disabled_blocks_rest(self):
        """هنگامی که چت غیرفعال است، درخواست‌های REST باید با کد ۴۰۳ مسدود شوند"""
        SystemSetting.objects.update_or_create(
            key='chat_enabled',
            warehouse_id=None,
            defaults={'value': False}
        )
        clear_setting_cache('chat_enabled')

        self.auth(self.staff_wh1)
        url = "/api/communications/conversations/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_file_sharing_disabled_blocks_upload(self):
        """هنگامی که اشتراک فایل غیرفعال است، آپلود پیوست باید ۴۰۳ برگرداند"""
        SystemSetting.objects.update_or_create(
            key='chat_file_sharing',
            warehouse_id=None,
            defaults={'value': False}
        )
        clear_setting_cache('chat_file_sharing')

        self.auth(self.manager_wh1)
        url = "/api/communications/messages/upload/"

        # ساخت فایل معتبر PNG
        png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        uploaded_file = SimpleUploadedFile("sample.png", png_content, content_type="image/png")

        resp = self.client.post(url, {'file': uploaded_file, 'message_id': self.direct_message.id}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def _upload_size_probe(self, size_bytes):
        self.auth(self.manager_wh1)
        data = SimpleUploadedFile("big.txt", b"a" * size_bytes, content_type="text/plain")
        return self.client.post(
            "/api/communications/messages/upload/",
            {'file': data, 'message_id': self.direct_message.id},
            format='multipart',
        )

    def test_upload_limit_default_is_100mb(self):
        """بدون تنظیم، سقف ۱۰۰ مگابایت است و ۱۱ مگابایت از بررسی حجم رد می‌شود"""
        SystemSetting.objects.filter(key='chat_max_upload_mb').delete()
        clear_setting_cache('chat_max_upload_mb')
        from settings_core.services import get_chat_max_upload_mb
        self.assertEqual(get_chat_max_upload_mb(), 100)
        resp = self._upload_size_probe(11 * 1024 * 1024)
        self.assertNotIn('حجم فایل نباید', str(resp.data.get('error', '')))

    def test_upload_limit_setting_applies(self):
        """با تنظیم ۲ مگابایت، ۳ مگابایت رد و ۱ مگابایت از بررسی حجم رد می‌شود"""
        SystemSetting.objects.update_or_create(
            key='chat_max_upload_mb', warehouse_id=None, defaults={'value': 2}
        )
        clear_setting_cache('chat_max_upload_mb')
        too_big = self._upload_size_probe(3 * 1024 * 1024)
        self.assertEqual(too_big.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('2', too_big.data['error'])
        ok = self._upload_size_probe(1 * 1024 * 1024)
        self.assertNotIn('حجم فایل نباید', str(ok.data.get('error', '')))

    def test_upload_limit_bad_value_falls_back_to_default(self):
        """مقدار خراب در دیتابیس سقف را به پیش‌فرض ۱۰۰ برمی‌گرداند"""
        SystemSetting.objects.update_or_create(
            key='chat_max_upload_mb', warehouse_id=None, defaults={'value': 'abc'}
        )
        clear_setting_cache('chat_max_upload_mb')
        from settings_core.services import get_chat_max_upload_mb
        self.assertEqual(get_chat_max_upload_mb(), 100)

    def test_public_config_exposes_upload_limit(self):
        """/api/public/config/ مقدار chat_max_upload_mb را می‌دهد"""
        SystemSetting.objects.filter(key='chat_max_upload_mb').delete()
        clear_setting_cache('chat_max_upload_mb')
        self.client.credentials()
        resp = self.client.get('/api/public/config/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['chat_max_upload_mb'], 100)
        SystemSetting.objects.update_or_create(
            key='chat_max_upload_mb', warehouse_id=None, defaults={'value': 25}
        )
        clear_setting_cache('chat_max_upload_mb')
        resp = self.client.get('/api/public/config/')
        self.assertEqual(resp.data['chat_max_upload_mb'], 25)

    def test_chat_media_purge_command_is_gone(self):
        """کاربر (۹ آبان ۱۴۰۵): فایل‌ها و پیام‌های صوتی چت هرگز خودکار پاک نمی‌شوند"""
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command('purge_expired_chat_media', days=180)

    def _upload(self, name, content):
        self.auth(self.manager_wh1)
        return self.client.post(
            "/api/communications/messages/upload/",
            {'file': SimpleUploadedFile(name, content, content_type='application/octet-stream'),
             'message_id': self.direct_message.id},
            format='multipart',
        )

    def test_voice_webm_upload_keeps_duration_from_name(self):
        """پیام صوتی webm پذیرفته می‌شود؛ نوع از محتوا و مدت از نام فایل ضبط‌شده"""
        resp = self._upload('voice_20261031-101500_754s.webm', b'\x1a\x45\xdf\xa3' + b'\x00' * 64)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['content_type'], 'audio/webm')
        self.assertEqual(resp.data['duration'], 754)
        self.assertEqual(MessageAttachment.objects.get(pk=resp.data['id']).duration, 754)

    def test_voice_ogg_and_m4a_accepted(self):
        ogg = self._upload('voice_a_3s.ogg', b'OggS' + b'\x00' * 64)
        self.assertEqual(ogg.status_code, status.HTTP_201_CREATED, ogg.data)
        self.assertEqual(ogg.data['content_type'], 'audio/ogg')
        m4a = self._upload('note.m4a', b'\x00\x00\x00\x20ftypM4A ' + b'\x00' * 64)
        self.assertEqual(m4a.status_code, status.HTTP_201_CREATED, m4a.data)
        self.assertEqual(m4a.data['content_type'], 'audio/mp4')
        # نام غیرضبطی مدت ندارد (هنگام پخش خوانده می‌شود)
        self.assertIsNone(m4a.data['duration'])

    def test_voice_with_fake_content_rejected(self):
        """پسوند صوتی با محتوای دیگر (مثلاً HTML) رد می‌شود"""
        resp = self._upload('voice_x_5s.webm', b'<html><script>alert(1)</script>')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_voice_bad_duration_in_name_ignored(self):
        from communications.previews import voice_duration_from_name
        self.assertIsNone(voice_duration_from_name('voice_x_0s.webm'))
        self.assertIsNone(voice_duration_from_name('voice_x_999999s.webm'))
        self.assertIsNone(voice_duration_from_name('report_12s.webm'))
        self.assertEqual(voice_duration_from_name('voice_x_12s.ogg'), 12)

