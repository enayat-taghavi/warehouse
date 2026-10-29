"""
تغییر رمز توکن‌های پیشین را باطل می‌کند (iat قدیمی‌تر از password_changed_at)؛ همان درخواست باید جفت توکن
تازه برگرداند تا کاربر پس از تغییر رمز اجباری ورود اول با خطای ۴۰۱ روبه‌رو نشود (فیلم آموزشی ۱، ف-ب).
"""
import time
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import CustomUser
from accounts.serializers import CustomTokenObtainPairSerializer

CHANGE = '/api/auth/users/change_password/'
PROBE = '/api/notifications/unread-count/'


class ChangePasswordTokensTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user('cp_user', 'cp@x.com', 'Old-pass-1')
        CustomUser.objects.filter(pk=self.user.pk).update(
            password_changed_at=timezone.now() - timedelta(minutes=10), requires_password_change=True)
        token = CustomTokenObtainPairSerializer.get_token(self.user)
        token['iat'] = int(time.time()) - 60  # صادرشده پیش از تغییر رمز
        self.old_access = str(token.access_token)

    def client_with(self, access):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        return client

    def test_old_token_dies_and_new_tokens_work(self):
        self.assertEqual(self.client_with(self.old_access).get(PROBE).status_code, 200)
        res = self.client_with(self.old_access).post(CHANGE, {'old_password': 'Old-pass-1', 'new_password': 'New-pass-2'},
                                                     format='json')
        self.assertEqual(res.status_code, 200)
        tokens = res.json()['tokens']
        self.assertTrue(tokens['access'] and tokens['refresh'])
        self.assertEqual(self.client_with(self.old_access).get(PROBE).status_code, 401)
        self.assertEqual(self.client_with(tokens['access']).get(PROBE).status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.requires_password_change)

    def test_wrong_old_password_gives_no_tokens(self):
        res = self.client_with(self.old_access).post(CHANGE, {'old_password': 'nope', 'new_password': 'New-pass-2'},
                                                     format='json')
        self.assertEqual(res.status_code, 400)
        self.assertNotIn('tokens', res.json())
