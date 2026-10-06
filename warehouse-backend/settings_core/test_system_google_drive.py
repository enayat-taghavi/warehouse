import os
from unittest.mock import patch, MagicMock
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from settings_core.models import (
    SystemGoogleDriveConfig,
    SystemDriveUploadTask,
    GoogleOAuthState,
)
from settings_core.google_drive_client import (
    encrypt_secret,
    decrypt_secret,
    register_gdrive_target_handler,
    _TARGET_HANDLERS,
)
from settings_core.google_drive_service import (
    generate_system_auth_url,
    disconnect_system_google_drive,
    sync_single_system_task,
)
from accounts.signals import backup_created

User = get_user_model()


class SystemGoogleDriveTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='sys_admin',
            email='admin@farsalish.ir',
            password='Password123!'
        )
        self.regular_user = User.objects.create_user(
            username='regular_staff',
            password='Password123!',
            is_staff=True
        )
        self.client = APIClient()

    def test_system_config_singleton(self):
        """تست عملکرد تک‌رکوردی SystemGoogleDriveConfig و مقادیر پیش‌فرض"""
        cfg1 = SystemGoogleDriveConfig.get_solo()
        self.assertEqual(cfg1.id, 1)
        self.assertTrue(cfg1.is_enabled)
        self.assertEqual(cfg1.auth_status, 'unlinked')

        cfg2 = SystemGoogleDriveConfig.get_solo()
        self.assertEqual(cfg1.id, cfg2.id)

    def test_system_endpoints_restricted_to_superuser(self):
        """تست ممانعت از دسترسی کاربران غیر سوپریوزر به درایو سامانه"""
        endpoints = [
            ('GET', '/api/settings/gdrive/system/'),
            ('PATCH', '/api/settings/gdrive/system/'),
            ('GET', '/api/settings/gdrive/system/auth-url/'),
            ('POST', '/api/settings/gdrive/system/disconnect/'),
            ('GET', '/api/settings/gdrive/system/tasks/'),
        ]

        # کاربر لاگین‌نکرده
        for method, url in endpoints:
            res = getattr(self.client, method.lower())(url)
            self.assertEqual(res.status_code, 401, f"{method} {url} should be 401")

        # کاربر staff عادی
        self.client.force_authenticate(user=self.regular_user)
        for method, url in endpoints:
            res = getattr(self.client, method.lower())(url)
            self.assertEqual(res.status_code, 403, f"{method} {url} should be 403")

        # سوپریوزر مجاز است
        self.client.force_authenticate(user=self.superuser)
        res_get = self.client.get('/api/settings/gdrive/system/')
        self.assertEqual(res_get.status_code, 200)
        self.assertFalse(res_get.data['is_connected'])

    def test_generate_system_auth_url(self):
        """تست تولید آدرس اتصال درایو سراسری سامانه با Nonce پایگاه داده"""
        with override_settings(GOOGLE_OAUTH_CLIENT_ID='test_client', GOOGLE_OAUTH_CLIENT_SECRET='test_sec'):
            auth_url, state = generate_system_auth_url(user=self.superuser, mode='redirect')
            self.assertIn('https://accounts.google.com/o/oauth2/auth', auth_url)

            # بررسی رکورد State ساخته‌شده در پایگاه داده
            st_rec = GoogleOAuthState.objects.filter(target='system').first()
            self.assertIsNotNone(st_rec)
            self.assertEqual(st_rec.user, self.superuser)
            self.assertEqual(st_rec.mode, 'redirect')
            self.assertIsNone(st_rec.company_id)

    def test_system_callback_success_redirect_mode(self):
        """تست پردازش موفق کال‌بک درایو سامانه در حالت redirect"""
        with override_settings(GOOGLE_OAUTH_CLIENT_ID='test_client', GOOGLE_OAUTH_CLIENT_SECRET='test_sec'):
            _, state = generate_system_auth_url(user=self.superuser, mode='redirect')

            with patch('settings_core.google_drive_views.exchange_system_code_and_store_credentials') as mock_exchange:
                mock_exchange.return_value = {
                    'success': True,
                    'account_email': 'server-backups@gmail.com',
                    'root_folder_name': 'سامانه ابری پشتیبان پایگاه داده'
                }

                res = self.client.get('/api/accounts/gdrive/callback/', {'code': 'auth_code_123', 'state': state})
                self.assertEqual(res.status_code, 200)
                content = res.content.decode('utf-8')
                self.assertIn("/app/operations/snapshots?gdrive=connected", content)
                self.assertIn("اتصال درایو سامانه با موفقیت برقرار شد", content)

    def test_system_callback_rejected_for_non_superuser(self):
        """تست رد اتصال درایو سامانه اگر درخواست‌دهنده سوپریوزر نباشد"""
        with override_settings(GOOGLE_OAUTH_CLIENT_ID='test_client', GOOGLE_OAUTH_CLIENT_SECRET='test_sec'):
            _, state = generate_system_auth_url(user=self.regular_user, mode='popup')

            res = self.client.get('/api/accounts/gdrive/callback/', {'code': 'auth_code_123', 'state': state})
            self.assertEqual(res.status_code, 400)
            content = res.content.decode('utf-8')
            self.assertIn("تنها مدیران ارشد سیستم مجاز به اتصال درایو سراسری هستند", content)

    def test_backup_created_signal_enqueues_system_task(self):
        """تست ایجاد خودکار وظیفه در صف درایو سامانه هنگام ارسال سیگنال backup_created"""
        cfg = SystemGoogleDriveConfig.get_solo()
        cfg.is_enabled = True
        cfg.refresh_token = encrypt_secret("valid_test_token")
        cfg.save()

        initial_count = SystemDriveUploadTask.objects.count()

        # شبیه‌سازی انتشار سیگنال اتمام پشتیبان‌گیری پایگاه داده
        backup_created.send(
            sender=None,
            dest_path="/tmp/backups/db/backup_20261006.dump",
            filename="backup_20261006.dump",
            meta={'size': 1024}
        )

        self.assertEqual(SystemDriveUploadTask.objects.count(), initial_count + 1)
        task = SystemDriveUploadTask.objects.latest('created_at')
        self.assertEqual(task.task_type, 'backup')
        self.assertEqual(task.target_filename, "backup_20261006.dump")
        self.assertEqual(task.status, 'pending')
        self.assertEqual(task.priority, 1)

    def test_disconnect_system_google_drive(self):
        """تست قطع اتصال درایو سامانه و پاکسازی توکن‌ها"""
        cfg = SystemGoogleDriveConfig.get_solo()
        cfg.refresh_token = encrypt_secret("token_to_disconnect")
        cfg.account_email = "test@gmail.com"
        cfg.auth_status = "authenticated"
        cfg.save()

        with patch('urllib.request.urlopen'):
            ok = disconnect_system_google_drive()
            self.assertTrue(ok)

        cfg.refresh_from_db()
        self.assertIsNone(cfg.refresh_token)
        self.assertIsNone(cfg.account_email)
        self.assertEqual(cfg.auth_status, 'unlinked')

    def test_worker_command_execution_and_heartbeat(self):
        """تست اجرای ورکر مرکزی و به‌روزرسانی ضربان حیات (worker_heartbeat_at)"""
        from django.core.management import call_command
        cfg = SystemGoogleDriveConfig.get_solo()
        self.assertIsNone(cfg.worker_heartbeat_at)

        call_command('run_gdrive_sync_worker', once=True, limit=5)

        cfg.refresh_from_db()
        self.assertIsNotNone(cfg.worker_heartbeat_at)
