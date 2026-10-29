"""تست‌های وب‌پوش سرور (د۹ طرح ۵، زیرمرحلهٔ ۵-د۱)."""
import base64
import json
import os
import shutil
import tempfile
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from . import push, webpush
from .models import DeviceToken, WebPushSubscription
from .services import notify_users

P256DH = base64.urlsafe_b64encode(b'\x04' + bytes(range(64))).rstrip(b'=').decode()
AUTH = base64.urlsafe_b64encode(bytes(range(16))).rstrip(b'=').decode()
URL = '/api/notifications/webpush/subscriptions/'


def endpoint(n=1, host='fcm.googleapis.com'):
    return f'https://{host}/fcm/send/device-{n}'


class KeyDirMixin:
    def make_key(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        path = os.path.join(tmp, 'vapid.pem')
        out = StringIO()
        call_command('generate_vapid_keys', '--out', path, stdout=out)
        return path, out.getvalue()


class VapidKeyTests(KeyDirMixin, TestCase):
    @override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE='')
    def test_no_key_file_means_disabled(self):
        self.assertEqual(webpush.get_vapid_public_key(), '')
        self.assertFalse(webpush.WebPushProvider().is_enabled)

    @override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=r'Z:\no\such\vapid.pem')
    def test_missing_file_does_not_create_key(self):
        self.assertEqual(webpush.get_vapid_public_key(), '')
        self.assertFalse(os.path.exists(r'Z:\no\such\vapid.pem'))

    def test_key_from_pem_and_command_output(self):
        path, out = self.make_key()
        with override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=path):
            key = webpush.get_vapid_public_key()
        raw = base64.urlsafe_b64decode(key + '=' * (-len(key) % 4))
        self.assertEqual((len(raw), raw[0]), (65, 4))
        self.assertIn(f'Public key: {key}', out)
        self.assertNotIn('PRIVATE', out)

    def test_command_refuses_overwrite(self):
        path, _ = self.make_key()
        with open(path, 'rb') as f:
            before = f.read()
        with self.assertRaises(CommandError):
            call_command('generate_vapid_keys', '--out', path, stdout=StringIO())
        with open(path, 'rb') as f:
            self.assertEqual(f.read(), before)

    def test_invalid_pem_means_disabled(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        path = os.path.join(tmp, 'bad.pem')
        with open(path, 'w') as f:
            f.write('-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----\n')
        with override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=path), self.assertLogs('notifications.webpush', 'ERROR'):
            self.assertEqual(webpush.get_vapid_public_key(), '')


class ValidateEndpointTests(TestCase):
    def test_invalid(self):
        for url in ('http://fcm.googleapis.com/fcm/send/x', 'https://evil.example/x', 'https://127.0.0.1/x',
                    'https://fcm.googleapis.com.evil.example/x', 'https://notpush.apple.com/x',
                    'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
                    'https://fcm.googleapis.com/' + 'a' * 2048, '', None, 5):
            self.assertFalse(webpush.validate_endpoint(url), url)

    def test_valid(self):
        for url in ('https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QGx',
                    'https://updates.push.services.mozilla.com/wpush/v2/x',
                    'https://wns2-par02p.notify.windows.com/w/?token=x'):
            self.assertTrue(webpush.validate_endpoint(url), url)


class SubscriptionApiTests(KeyDirMixin, TestCase):
    def setUp(self):
        User = get_user_model()
        self.alice = User.objects.create_user(username='wp_alice', password='x')
        self.bob = User.objects.create_user(username='wp_bob', password='x')
        self.client = APIClient()
        self.client.force_authenticate(self.alice)

    def post(self, ep, **keys):
        body = {'endpoint': ep, 'keys': {'p256dh': keys.get('p256dh', P256DH), 'auth': keys.get('auth', AUTH)}}
        return self.client.post(URL, body, format='json')

    def test_key_endpoint(self):
        self.assertEqual(APIClient().get('/api/notifications/webpush/key/').status_code, 401)
        with override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=''):
            self.assertEqual(self.client.get('/api/notifications/webpush/key/').json(), {'public_key': ''})
        path, _ = self.make_key()
        with override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=path):
            self.assertTrue(self.client.get('/api/notifications/webpush/key/').json()['public_key'])

    def test_anonymous_rejected(self):
        self.assertEqual(APIClient().post(URL, {}, format='json').status_code, 401)

    def test_register_and_upsert(self):
        r = self.post(endpoint(1))
        self.assertEqual(r.status_code, 201)
        r = self.post(endpoint(1))
        self.assertEqual(r.status_code, 200)
        sub = WebPushSubscription.objects.get()
        self.assertEqual((sub.user_id, sub.endpoint, sub.endpoint_hash),
                         (self.alice.id, endpoint(1), webpush.endpoint_hash(endpoint(1))))
        self.assertNotIn('endpoint', r.json())

    def test_bad_input_400(self):
        for resp in (self.post('http://fcm.googleapis.com/x'), self.post('https://evil.example/x'),
                     self.post(endpoint(1), p256dh='abc'), self.post(endpoint(1), auth='abc'),
                     self.client.post(URL, {'endpoint': endpoint(1)}, format='json'),
                     self.client.post(URL, [1, 2], format='json')):
            self.assertEqual(resp.status_code, 400)
            self.assertTrue(resp.json()['detail'])
        self.assertFalse(WebPushSubscription.objects.exists())

    def test_ownership_moves_to_current_user(self):
        WebPushSubscription.objects.create(user=self.bob, endpoint=endpoint(1),
                                           endpoint_hash=webpush.endpoint_hash(endpoint(1)), p256dh=P256DH, auth=AUTH)
        self.assertEqual(self.post(endpoint(1)).status_code, 200)
        self.assertEqual(WebPushSubscription.objects.get().user_id, self.alice.id)

    def test_cap_ten_per_user(self):
        for i in range(12):
            self.assertIn(self.post(endpoint(i)).status_code, (200, 201))
        WebPushSubscription.objects.create(user=self.bob, endpoint=endpoint(99),
                                           endpoint_hash=webpush.endpoint_hash(endpoint(99)), p256dh=P256DH, auth=AUTH)
        mine = set(WebPushSubscription.objects.filter(user=self.alice).values_list('endpoint', flat=True))
        self.assertEqual(len(mine), 10)
        self.assertIn(endpoint(11), mine)
        self.assertNotIn(endpoint(0), mine)
        self.assertTrue(WebPushSubscription.objects.filter(user=self.bob).exists())

    def test_delete_own_and_other(self):
        self.post(endpoint(1))
        WebPushSubscription.objects.create(user=self.bob, endpoint=endpoint(2),
                                           endpoint_hash=webpush.endpoint_hash(endpoint(2)), p256dh=P256DH, auth=AUTH)
        other = self.client.delete(URL, {'endpoint': endpoint(2)}, format='json')
        self.assertEqual(other.status_code, 404)
        self.assertTrue(WebPushSubscription.objects.filter(user=self.bob).exists())
        self.assertEqual(self.client.delete(URL, {}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(URL, {'endpoint': endpoint(1)}, format='json').status_code, 204)
        self.assertFalse(WebPushSubscription.objects.filter(user=self.alice).exists())


class ProviderTests(KeyDirMixin, TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='wp_prov', password='x')
        path, _ = self.make_key()
        ctx = override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=path, OUTBOUND_HTTP_PROXY='')
        ctx.enable()
        self.addCleanup(ctx.disable)

    def make_sub(self, n):
        sub = WebPushSubscription.objects.create(user=self.user, endpoint=endpoint(n),
                                                 endpoint_hash=webpush.endpoint_hash(endpoint(n)), p256dh=P256DH, auth=AUTH)
        return {'id': sub.id, 'endpoint': sub.endpoint, 'p256dh': sub.p256dh, 'auth': sub.auth}

    def test_payload_has_action_click(self):
        payload = json.loads(webpush.build_payload('t', 'm', '/app/x', 5))
        n = payload['notification']
        self.assertEqual((n['title'], n['body'], n['dir'], n['lang'], n['tag']), ('t', 'm', 'rtl', 'fa', 'n-5'))
        self.assertEqual(n['data']['onActionClick']['default'],
                         {'operation': 'navigateLastFocusedOrOpen', 'url': '/app/x'})
        self.assertEqual(json.loads(webpush.build_payload('t', 'm', '', 6))['notification']['data']['url'],
                         '/app/my-tasks')

    def test_send_accepts_and_410_deletes(self):
        from pywebpush import WebPushException
        ok, gone, failing = self.make_sub(1), self.make_sub(2), self.make_sub(3)

        def fake(subscription_info, **kwargs):
            self.assertEqual(kwargs['ttl'], 86400)
            self.assertEqual(kwargs['vapid_claims']['sub'][:7], 'mailto:')
            if subscription_info['endpoint'] == gone['endpoint']:
                raise WebPushException('gone', response=mock.Mock(status_code=410))
            if subscription_info['endpoint'] == failing['endpoint']:
                raise WebPushException('busy', response=mock.Mock(status_code=503))
            return mock.Mock(status_code=201)

        with mock.patch('pywebpush.webpush', side_effect=fake) as wp:
            accepted = webpush.WebPushProvider().send([ok, gone, failing], webpush.build_payload('t', 'm', '/a', 1))
        self.assertEqual((accepted, wp.call_count), (1, 3))
        left = set(WebPushSubscription.objects.values_list('id', flat=True))
        self.assertEqual(left, {ok['id'], failing['id']})

    def test_disabled_without_key(self):
        sub = self.make_sub(1)
        with override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=''), mock.patch('pywebpush.webpush') as wp:
            self.assertEqual(webpush.WebPushProvider().send([sub], '{}'), 0)
        wp.assert_not_called()


class NotifyUsersWebPushTests(KeyDirMixin, TestCase):
    def setUp(self):
        patcher = mock.patch('channels.layers.get_channel_layer', return_value=None)
        patcher.start()
        self.addCleanup(patcher.stop)
        path, _ = self.make_key()
        ctx = override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=path)
        ctx.enable()
        self.addCleanup(ctx.disable)
        self.counter = 0

    def make_user(self, token=False, subs=1):
        self.counter += 1
        u = get_user_model().objects.create_user(username=f'wpn_{self.counter}', password='x')
        if token:
            DeviceToken.objects.create(user=u, token=f'tok-{self.counter}')
        for i in range(subs):
            ep = endpoint(f'{self.counter}-{i}')
            WebPushSubscription.objects.create(user=u, endpoint=ep, endpoint_hash=webpush.endpoint_hash(ep),
                                               p256dh=P256DH, auth=AUTH)
        return u

    def notify(self, ids):
        with self.captureOnCommitCallbacks(execute=True):
            return notify_users(ids, title='t', message='m', notification_type='test_push', url='/app/x')

    def test_both_fcm_and_webpush_scheduled(self):
        with_token, web_only = self.make_user(token=True), self.make_user()
        with mock.patch.object(push, '_schedule_push') as fcm, mock.patch.object(push, '_schedule_webpush') as web:
            self.notify([with_token.id, web_only.id])
        self.assertEqual(fcm.call_count, 1)
        self.assertEqual(sorted(c.args[1][0]['endpoint'] for c in web.call_args_list),
                         sorted([endpoint('1-0'), endpoint('2-0')]))
        self.assertEqual(web.call_args_list[0].args[4], '/app/x')

    def test_post_save_path_user_without_device(self):
        """کاربر بی دستگاه بومی از مسیر post_save هم وب‌پوش می‌گیرد."""
        from .models import Notification
        u = self.make_user()
        with mock.patch.object(push, '_schedule_push') as fcm, mock.patch.object(push, '_schedule_webpush') as web, \
                self.captureOnCommitCallbacks(execute=True):
            Notification.objects.create(recipient=u, title='t', message='m', url='/app/y')
        fcm.assert_not_called()
        self.assertEqual(web.call_count, 1)

    def test_constant_queries(self):
        counts = []
        for size in (2, 5):
            ids = [self.make_user(token=True, subs=2).id for _ in range(size)]
            with mock.patch.object(push, '_schedule_push'), mock.patch.object(push, '_schedule_webpush') as web, \
                    CaptureQueriesContext(connection) as ctx:
                self.notify(ids)
            self.assertEqual(web.call_count, size)
            counts.append(len(ctx.captured_queries))
        self.assertEqual(counts[0], counts[1])

    def test_no_key_no_subscription_query(self):
        u = self.make_user()
        with override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=''), \
                mock.patch.object(push, '_schedule_webpush') as web, CaptureQueriesContext(connection) as ctx:
            self.notify([u.id])
        web.assert_not_called()
        self.assertFalse(any('webpushsubscription' in q['sql'] for q in ctx.captured_queries))


class SendTestPushWebPushTests(KeyDirMixin, TransactionTestCase):
    """TransactionTestCase: on_commit runs right away, like a real run of the command."""

    def setUp(self):
        patcher = mock.patch('channels.layers.get_channel_layer', return_value=None)
        patcher.start()
        self.addCleanup(patcher.stop)
        path, _ = self.make_key()
        ctx = override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=path, OUTBOUND_HTTP_PROXY='', FIREBASE_CREDENTIALS_FILE='')
        ctx.enable()
        self.addCleanup(ctx.disable)

    def test_send_test_push_reports_web_push(self):
        u = get_user_model().objects.create_user(username='wp_stp', password='x')
        for i in range(2):
            ep = endpoint(f'stp-{i}')
            WebPushSubscription.objects.create(user=u, endpoint=ep, endpoint_hash=webpush.endpoint_hash(ep),
                                               p256dh=P256DH, auth=AUTH)
        out = StringIO()
        with mock.patch('pywebpush.webpush', return_value=mock.Mock(status_code=201)) as wp:
            call_command('send_test_push', '--username', u.username, stdout=out)
        self.assertEqual(wp.call_count, 2)
        text = out.getvalue()
        self.assertIn('Web push subscriptions for user: 2', text)
        self.assertIn('Web push accepted 2 of 2', text)
        self.assertNotIn('fcm.googleapis.com', text)
        with override_settings(WEBPUSH_VAPID_PRIVATE_KEY_FILE=''):
            out = StringIO()
            call_command('send_test_push', '--username', u.username, stdout=out)
        self.assertIn('Web push key not configured', out.getvalue())
