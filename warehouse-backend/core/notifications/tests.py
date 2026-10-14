from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Notification

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
