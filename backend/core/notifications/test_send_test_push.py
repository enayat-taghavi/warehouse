"""تست‌های دستور send_test_push (د۵ طرح ۵ اندروید)."""
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TransactionTestCase, override_settings

from .models import DeviceToken, Notification


class SendTestPushTests(TransactionTestCase):
    """TransactionTestCase: like a real run, there is no outer transaction, so on_commit work runs right away."""

    def setUp(self):
        patcher = mock.patch('channels.layers.get_channel_layer', return_value=None)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = get_user_model().objects.create_user(username='stp_user', password='x')

    def run_cmd(self, *args):
        out = StringIO()
        call_command('send_test_push', *args, stdout=out)
        return out.getvalue()

    @override_settings(FIREBASE_CREDENTIALS_FILE='')
    def test_no_key_creates_in_app_row(self):
        """بی کلید FCM ردیف زنگوله ساخته می‌شود و پیام روشن چاپ می‌شود."""
        DeviceToken.objects.create(user=self.user, token='secret-device-token-123456')
        out = self.run_cmd('--username', 'stp_user')
        n = Notification.objects.get(recipient=self.user)
        self.assertEqual((n.url, n.notification_type), ('/app/my-tasks', 'test_push'))
        self.assertIn('DisabledPushProvider', out)
        self.assertIn('FCM key not configured', out)
        self.assertIn('Device tokens for user: 1', out)
        self.assertNotIn('secret-device-token', out)

    def test_unknown_user_raises(self):
        with self.assertRaises(CommandError):
            self.run_cmd('--username', 'nobody_here')
        self.assertFalse(Notification.objects.exists())

    def test_inactive_user_raises(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        with self.assertRaises(CommandError):
            self.run_cmd('--username', 'stp_user')
        self.assertFalse(Notification.objects.exists())

    def test_bad_url_raises(self):
        with self.assertRaises(CommandError):
            self.run_cmd('--username', 'stp_user', '--url', 'https://evil.example/x')

    def test_fcm_provider_sends_once_with_url(self):
        """با سرویس FCM (ساختگی) یک بار ارسال با نشانی داده‌شده و بی چاپ توکن."""
        DeviceToken.objects.create(user=self.user, token='secret-device-token-abcdef')
        provider = mock.MagicMock()
        provider.is_enabled = True
        with mock.patch('notifications.push.get_push_provider', return_value=provider):
            out = self.run_cmd('--username', 'stp_user', '--url', '/app/my-tasks?tab=1')
        provider.send.assert_called_once()
        kwargs = provider.send.call_args.kwargs
        self.assertEqual(kwargs['tokens'], ['secret-device-token-abcdef'])
        self.assertEqual(kwargs['data']['url'], '/app/my-tasks?tab=1')
        self.assertIn('FCM push dispatched to 1 device(s)', out)
        self.assertNotIn('secret-device-token', out)
