from unittest.mock import MagicMock, patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Notification, DeviceToken
from . import push

User = get_user_model()


class NotificationAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username='user1',
            email='user1@test.com',
            password='Password123!'
        )
        self.user2 = User.objects.create_user(
            username='user2',
            email='user2@test.com',
            password='Password123!'
        )

        self.notif1 = Notification.objects.create(
            recipient=self.user1,
            title='اعلان اول',
            message='شما منشن شدید',
            notification_type='mention',
            target_model='item',
            target_id='100',
            is_read=False
        )
        self.notif2 = Notification.objects.create(
            recipient=self.user1,
            title='اعلان دوم',
            message='پیام دوم',
            notification_type='mention',
            target_model='item',
            target_id='101',
            is_read=False
        )
        self.notif_other = Notification.objects.create(
            recipient=self.user2,
            title='اعلان کاربر دیگر',
            message='پیام کاربر دو',
            notification_type='mention',
            is_read=False
        )

    def test_list_notifications_isolated_by_recipient(self):
        self.client.force_authenticate(user=self.user1)
        res = self.client.get('/api/notifications/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data) if isinstance(res.data, dict) else res.data
        ids = [n['id'] for n in results]
        self.assertIn(self.notif1.id, ids)
        self.assertIn(self.notif2.id, ids)
        self.assertNotIn(self.notif_other.id, ids)

    def test_unread_count(self):
        self.client.force_authenticate(user=self.user1)
        res = self.client.get('/api/notifications/unread-count/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['unread_count'], 2)

    def test_mark_single_read(self):
        self.client.force_authenticate(user=self.user1)
        res = self.client.post(f'/api/notifications/{self.notif1.id}/mark-read/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.notif1.refresh_from_db()
        self.assertTrue(self.notif1.is_read)

    def test_mark_all_read(self):
        self.client.force_authenticate(user=self.user1)
        res = self.client.post('/api/notifications/mark-all-read/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['updated_count'], 2)
        self.assertEqual(Notification.objects.filter(recipient=self.user1, is_read=False).count(), 0)

    # ─────────────────────────────────────────────────────────────────────────
    # Device Token & FCM Push Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_register_device_token(self):
        self.client.force_authenticate(user=self.user1)
        res = self.client.post('/api/notifications/devices/', {
            'token': 'fcm-token-register-test',
            'platform': 'android',
            'app_version': '1.0.0'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            DeviceToken.objects.filter(
                token='fcm-token-register-test',
                user=self.user1,
                platform='android',
                app_version='1.0.0'
            ).exists()
        )

    def test_refresh_device_token(self):
        DeviceToken.objects.create(
            user=self.user1,
            token='fcm-token-refresh-test',
            platform='android',
            app_version='1.0.0'
        )
        self.client.force_authenticate(user=self.user1)
        res = self.client.post('/api/notifications/devices/', {
            'token': 'fcm-token-refresh-test',
            'platform': 'android',
            'app_version': '1.0.1'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        dt = DeviceToken.objects.get(token='fcm-token-refresh-test')
        self.assertEqual(dt.app_version, '1.0.1')
        self.assertEqual(DeviceToken.objects.filter(token='fcm-token-refresh-test').count(), 1)

    def test_move_token_to_another_user(self):
        DeviceToken.objects.create(
            user=self.user1,
            token='fcm-shared-device-token',
            platform='android',
            app_version='1.0.0'
        )
        self.client.force_authenticate(user=self.user2)
        res = self.client.post('/api/notifications/devices/', {
            'token': 'fcm-shared-device-token',
            'platform': 'ios',
            'app_version': '2.0.0'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        dt = DeviceToken.objects.get(token='fcm-shared-device-token')
        self.assertEqual(dt.user, self.user2)
        self.assertEqual(dt.platform, 'ios')
        self.assertFalse(DeviceToken.objects.filter(user=self.user1, token='fcm-shared-device-token').exists())

    def test_delete_own_device_token(self):
        DeviceToken.objects.create(user=self.user1, token='fcm-token-delete-own')
        self.client.force_authenticate(user=self.user1)
        res = self.client.delete('/api/notifications/devices/', {'token': 'fcm-token-delete-own'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DeviceToken.objects.filter(token='fcm-token-delete-own').exists())

    def test_delete_own_device_token_via_url_param(self):
        DeviceToken.objects.create(user=self.user1, token='fcm-token-delete-url')
        self.client.force_authenticate(user=self.user1)
        res = self.client.delete('/api/notifications/devices/fcm-token-delete-url/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DeviceToken.objects.filter(token='fcm-token-delete-url').exists())

    def test_cannot_delete_another_users_token(self):
        DeviceToken.objects.create(user=self.user1, token='fcm-user1-protected-token')
        self.client.force_authenticate(user=self.user2)
        res = self.client.delete('/api/notifications/devices/', {'token': 'fcm-user1-protected-token'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(DeviceToken.objects.filter(token='fcm-user1-protected-token', user=self.user1).exists())

    def test_unauthenticated_device_endpoints_rejected(self):
        res_post = self.client.post('/api/notifications/devices/', {'token': 'fcm-anon-token'}, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_401_UNAUTHORIZED)

        res_del = self.client.delete('/api/notifications/devices/', {'token': 'fcm-anon-token'}, format='json')
        self.assertEqual(res_del.status_code, status.HTTP_401_UNAUTHORIZED)

        res_get = self.client.get('/api/notifications/devices/')
        self.assertEqual(res_get.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_own_device_tokens_only(self):
        DeviceToken.objects.create(user=self.user1, token='u1-token')
        DeviceToken.objects.create(user=self.user2, token='u2-token')
        self.client.force_authenticate(user=self.user1)
        res = self.client.get('/api/notifications/devices/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        tokens = [d['token'] for d in res.data]
        self.assertIn('u1-token', tokens)
        self.assertNotIn('u2-token', tokens)

    def test_disabled_provider_sends_nothing(self):
        provider = push.get_push_provider()
        self.assertFalse(provider.is_enabled)
        with patch('requests.post') as mock_post:
            provider.send(tokens=['fake-token'], title='Test Title', body='Test Body')
            mock_post.assert_not_called()

    def test_created_notification_schedules_push_to_recipient_tokens(self):
        DeviceToken.objects.create(user=self.user1, token='user1-device-token-a')
        DeviceToken.objects.create(user=self.user1, token='user1-device-token-b')
        DeviceToken.objects.create(user=self.user2, token='user2-device-token')

        with patch('notifications.push.get_push_provider') as mock_get_provider:
            mock_provider = MagicMock()
            mock_get_provider.return_value = mock_provider

            with self.captureOnCommitCallbacks(execute=True):
                Notification.objects.create(
                    recipient=self.user1,
                    title='اعلان تست پوش',
                    message='شما یک پیام جدید دارید',
                    notification_type='mention',
                    target_model='item',
                    target_id='555',
                )

            if push._last_push_thread:
                push._last_push_thread.join(timeout=5)

            mock_provider.send.assert_called_once()
            call_kwargs = mock_provider.send.call_args.kwargs
            call_args = mock_provider.send.call_args.args
            tokens = call_kwargs.get('tokens') if 'tokens' in call_kwargs else (call_args[0] if call_args else [])
            self.assertEqual(sorted(tokens), sorted(['user1-device-token-a', 'user1-device-token-b']))
            self.assertNotIn('user2-device-token', tokens)

            title = call_kwargs.get('title') if 'title' in call_kwargs else (call_args[1] if len(call_args) > 1 else '')
            self.assertEqual(title, 'اعلان تست پوش')

            data = call_kwargs.get('data') if 'data' in call_kwargs else (call_args[3] if len(call_args) > 3 else {})
            self.assertEqual(data.get('target_model'), 'item')
            self.assertEqual(data.get('target_id'), '555')

    def test_provider_errors_do_not_raise(self):
        DeviceToken.objects.create(user=self.user1, token='user1-token-for-err')

        with patch('notifications.push.get_push_provider') as mock_get_provider:
            mock_provider = MagicMock()
            mock_provider.send.side_effect = RuntimeError("FCM Provider exploded")
            mock_get_provider.return_value = mock_provider

            # Notification creation must succeed and not raise
            with self.captureOnCommitCallbacks(execute=True):
                notif = Notification.objects.create(
                    recipient=self.user1,
                    title='تست خطا',
                    message='خطای پرووایدر نباید بالا بیاید'
                )

            if push._last_push_thread:
                push._last_push_thread.join(timeout=5)

            self.assertIsNotNone(notif.id)

    def test_unregistered_token_deleted(self):
        bad_token = 'unregistered-token-999'
        DeviceToken.objects.create(user=self.user1, token=bad_token)

        provider = push.FcmPushProvider(credentials_file=None)

        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.json.return_value = {
            'error': {
                'code': 404,
                'message': 'Requested entity was not found.',
                'status': 'NOT_FOUND',
                'details': [{'errorCode': 'UNREGISTERED'}]
            }
        }
        mock_resp.text = '{"error": {"code": 404, "status": "NOT_FOUND"}}'

        provider._handle_fcm_error(bad_token, mock_resp)

        self.assertFalse(DeviceToken.objects.filter(token=bad_token).exists())
