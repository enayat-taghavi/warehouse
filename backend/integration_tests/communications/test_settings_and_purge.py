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

    def test_upload_limit_default_is_10mb(self):
        """بدون تنظیم، سقف ۱۰ مگابایت است و ۱۱ مگابایت رد می‌شود"""
        SystemSetting.objects.filter(key='chat_max_upload_mb').delete()
        clear_setting_cache('chat_max_upload_mb')
        resp = self._upload_size_probe(11 * 1024 * 1024)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('10', resp.data['error'])

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
        """مقدار خراب در دیتابیس سقف را به ۱۰ برمی‌گرداند"""
        SystemSetting.objects.update_or_create(
            key='chat_max_upload_mb', warehouse_id=None, defaults={'value': 'abc'}
        )
        clear_setting_cache('chat_max_upload_mb')
        from settings_core.services import get_chat_max_upload_mb
        self.assertEqual(get_chat_max_upload_mb(), 10)

    def test_public_config_exposes_upload_limit(self):
        """/api/public/config/ مقدار chat_max_upload_mb را می‌دهد"""
        SystemSetting.objects.filter(key='chat_max_upload_mb').delete()
        clear_setting_cache('chat_max_upload_mb')
        self.client.credentials()
        resp = self.client.get('/api/public/config/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['chat_max_upload_mb'], 10)
        SystemSetting.objects.update_or_create(
            key='chat_max_upload_mb', warehouse_id=None, defaults={'value': 25}
        )
        clear_setting_cache('chat_max_upload_mb')
        resp = self.client.get('/api/public/config/')
        self.assertEqual(resp.data['chat_max_upload_mb'], 25)

    def test_purge_preserves_soft_delete_tombstone(self):
        """دستور purge_expired_chat_media به صورت پیش‌فرض فایل فیزیکی را پاک کرده و Tombstone را برای کلاینت‌های آفلاین حفظ می‌کند"""
        old_time = timezone.now() - timedelta(days=200)

        # ساخت پیوست
        att = MessageAttachment.objects.create(
            message=self.direct_message,
            file=SimpleUploadedFile("old_attachment.txt", b"old attachment content"),
            file_name="old_attachment.txt",
            file_size=22
        )
        file_path = att.file.path
        MessageAttachment.objects.filter(id=att.id).update(created_at=old_time)
        self.assertTrue(os.path.exists(file_path))

        # اجرای دستور با روزهای کمتر از ۲۰۰
        call_command('purge_expired_chat_media', days=180)

        # فایل فیزیکی از دیسک پاک شده باشد
        self.assertFalse(os.path.exists(file_path))
        # در objects عادی مخفی است (حذف نرم شده)
        self.assertEqual(MessageAttachment.objects.filter(id=att.id).count(), 0)
        # در all_objects به عنوان Tombstone برای سینک آفلاین باقی مانده است
        att.refresh_from_db()
        self.assertTrue(att.is_deleted)
        self.assertEqual(MessageAttachment.all_objects.filter(id=att.id).count(), 1)

    def test_purge_hard_delete_flag(self):
        """فلگ --hard-delete در صورت ارسال صریح رکورد را کاملاً از all_objects نیز حذف می‌کند"""
        old_time = timezone.now() - timedelta(days=200)

        att = MessageAttachment.objects.create(
            message=self.direct_message,
            file=SimpleUploadedFile("hard_delete.txt", b"hard delete content"),
            file_name="hard_delete.txt",
            file_size=19
        )
        MessageAttachment.objects.filter(id=att.id).update(created_at=old_time)

        call_command('purge_expired_chat_media', days=180, hard_delete=True)

        self.assertEqual(MessageAttachment.all_objects.filter(id=att.id).count(), 0)

    def test_purge_dry_run_changes_nothing(self):
        """فلگ --dry-run نباید هیچ رکوردی یا فایلی را تغییر دهد"""
        old_time = timezone.now() - timedelta(days=200)

        att = MessageAttachment.objects.create(
            message=self.direct_message,
            file=SimpleUploadedFile("dry_run_file.txt", b"dry run content"),
            file_name="dry_run_file.txt",
            file_size=15
        )
        file_path = att.file.path
        MessageAttachment.objects.filter(id=att.id).update(created_at=old_time)

        call_command('purge_expired_chat_media', days=180, dry_run=True)

        self.assertEqual(MessageAttachment.all_objects.filter(id=att.id).count(), 1)
        self.assertTrue(os.path.exists(file_path))

    def test_purge_respects_days_argument(self):
        """پیوست‌های تازه‌تر از سقف روز مشخص‌شده نباید پاک شوند"""
        fresh_time = timezone.now() - timedelta(days=30)

        att = MessageAttachment.objects.create(
            message=self.direct_message,
            file=SimpleUploadedFile("fresh_file.png", b"\x89PNG fresh"),
            file_name="fresh_file.png",
            file_size=10
        )
        MessageAttachment.objects.filter(id=att.id).update(created_at=fresh_time)

        call_command('purge_expired_chat_media', days=180)

        # فایل تازه باید همچنان در سیستم باقی مانده باشد
        self.assertEqual(MessageAttachment.objects.filter(id=att.id).count(), 1)
