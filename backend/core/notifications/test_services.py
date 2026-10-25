"""تست‌های notify_users، راه عمومی هسته برای اعلان ماژول‌ها (ص۷ طرح ۲.۴)."""
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from .models import Notification
from .services import notify_users


class FakeLayer:
    """لایهٔ کانال ساختگی که هر group_send را ثبت می‌کند."""

    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    async def group_send(self, group, message):
        if self.fail:
            raise RuntimeError('ws down')
        self.sent.append((group, message))


class NotifyUsersTests(TestCase):
    def setUp(self):
        self.layer = FakeLayer()
        patcher = mock.patch('channels.layers.get_channel_layer', return_value=self.layer)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.User = get_user_model()
        self.counter = 0

    def make_user(self, active=True):
        self.counter += 1
        return self.User.objects.create_user(username=f'nu_{self.counter}', password='x', is_active=active)

    def notify(self, ids, **kw):
        params = dict(title='t', message='m', notification_type='personnel_workflow')
        params.update(kw)
        with self.captureOnCommitCallbacks(execute=True):
            return notify_users(ids, **params)

    def test_rows_and_personal_messages(self):
        """هر گیرنده یک ردیف و یک پیام فقط در کانال شخصی خودش."""
        users = [self.make_user() for _ in range(3)]
        self.notify([u.id for u in users], target_model='PersonnelProfile', target_id=7, url='/app/x', company_id=5)
        rows = {n.recipient_id: n for n in Notification.objects.all()}
        self.assertEqual(set(rows), {u.id for u in users})
        for n in rows.values():
            self.assertEqual((n.title, n.message, n.notification_type, n.target_model, n.target_id, n.url),
                             ('t', 'm', 'personnel_workflow', 'PersonnelProfile', '7', '/app/x'))
        self.assertEqual(len(self.layer.sent), 3)
        for group, msg in self.layer.sent:
            uid = int(group.removeprefix('user_'))
            self.assertIn(uid, rows)
            self.assertEqual(msg['type'], 'send_notification')
            self.assertEqual(msg['type_str'], 'personnel_workflow')
            self.assertEqual(msg['notification_id'], rows[uid].id)
            self.assertEqual((msg['title'], msg['message'], msg['url'], msg['company_id']), ('t', 'm', '/app/x', 5))
            self.assertTrue(msg['created_at'])

    def test_inactive_user_skipped(self):
        """کاربر غیرفعال نه ردیف می‌گیرد نه پیام."""
        active, inactive = self.make_user(), self.make_user(active=False)
        self.notify([active.id, inactive.id])
        self.assertEqual(list(Notification.objects.values_list('recipient_id', flat=True)), [active.id])
        self.assertEqual([g for g, _ in self.layer.sent], [f'user_{active.id}'])

    def test_constant_queries(self):
        """شمار پرس‌وجو با شمار گیرندگان رشد نمی‌کند؛ شناسهٔ تکراری و تهی یک ردیف می‌سازد."""
        counts = []
        for size in (2, 12):
            ids = [self.make_user().id for _ in range(size)]
            with CaptureQueriesContext(connection) as ctx:
                self.notify(ids)
            counts.append(len(ctx.captured_queries))
        self.assertEqual(counts[0], counts[1])
        u1 = self.make_user()
        self.notify([u1.id, u1.id, None])
        self.assertEqual(Notification.objects.filter(recipient=u1).count(), 1)

    def test_extra_keys_kept(self):
        """کلیدهای اضافه می‌رسند ولی کلیدهای پایه را عوض نمی‌کنند."""
        u = self.make_user()
        self.notify([u.id], extra={'vehicle_id': 9, 'approval_status': 'pending_supervisor', 'type': 'bad'})
        msg = self.layer.sent[0][1]
        self.assertEqual(msg['vehicle_id'], 9)
        self.assertEqual(msg['approval_status'], 'pending_supervisor')
        self.assertEqual(msg['type'], 'send_notification')

    def test_websocket_failure_logged(self):
        """خطای کانال فقط ثبت می‌شود و ردیف‌ها می‌مانند."""
        self.layer.fail = True
        users = [self.make_user() for _ in range(2)]
        with self.assertLogs('notifications.services', level='ERROR') as logs:
            self.notify([u.id for u in users])
        self.assertEqual(Notification.objects.count(), 2)
        self.assertEqual(len(logs.records), 2)

    def test_row_failure_logged(self):
        """خطای ساخت ردیف فقط ثبت می‌شود و پیامی نمی‌رود."""
        u = self.make_user()
        with mock.patch('notifications.models.Notification.objects.bulk_create', side_effect=RuntimeError('db down')), \
                self.assertLogs('notifications.services', level='ERROR'):
            self.notify([u.id])
        self.assertEqual(self.layer.sent, [])

    def test_runs_after_commit(self):
        """تا commit نشده، نه ردیفی ساخته می‌شود نه پیامی."""
        u = self.make_user()
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            result = notify_users([u.id], title='t', message='m', notification_type='fleet_workflow')
        self.assertEqual(result, {})
        self.assertFalse(Notification.objects.exists())
        self.assertEqual(self.layer.sent, [])
        for cb in callbacks:
            cb()
        self.assertTrue(Notification.objects.filter(recipient=u).exists())
        self.assertEqual(len(self.layer.sent), 1)
