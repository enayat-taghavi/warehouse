"""
اصلاح ۱ طرح ۲.۲: رویداد بلادرنگ لاگ ممیزی و لاگ ورود هرگز به کانال عمومی
`global_notifications` نمی‌رود (همهٔ کاربران وصل‌شده از هر شرکتی عضو آن‌اند).
لاگ ممیزی شرکت‌دار ← کانال همان شرکت؛ بی‌شرکت و لاگ ورود ← فقط مدیران کل.
"""
from unittest import mock

from django.test import TestCase

from accounts import signals as account_signals
from accounts.models import AuditLog, UserLoginLog
from notifications.consumers import SUPERUSER_GROUP


class _Layer:
    def __init__(self):
        self.sent = []

    async def group_send(self, group, payload):
        self.sent.append((group, payload))


class AuditWsRoutingTests(TestCase):
    def setUp(self):
        self.layer = _Layer()
        patcher = mock.patch.object(account_signals, 'get_channel_layer', return_value=self.layer)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _groups(self, type_str):
        return [g for g, p in self.layer.sent if p.get('type_str') == type_str]

    def test_superuser_group_constant_matches_consumer(self):
        self.assertEqual(account_signals.SUPERUSER_GROUP, SUPERUSER_GROUP)

    def test_company_audit_log_goes_only_to_company_channel(self):
        with self.captureOnCommitCallbacks(execute=True):
            AuditLog.objects.create(company_id=7, module='system', action='UPDATE', target_repr='x')
        self.assertEqual(self._groups('audit_log_created'), ['company_7_notifications'])
        payload = [p for g, p in self.layer.sent if p.get('type_str') == 'audit_log_created'][0]
        self.assertEqual(payload.get('company_id'), 7)

    def test_audit_log_without_company_goes_only_to_superusers(self):
        with self.captureOnCommitCallbacks(execute=True):
            AuditLog.objects.create(warehouse_id=3, module='system', action='UPDATE', target_repr='y')
        self.assertEqual(self._groups('audit_log_created'), [SUPERUSER_GROUP])

    def test_login_log_goes_only_to_superusers(self):
        with self.captureOnCommitCallbacks(execute=True):
            UserLoginLog.objects.create(username_attempted='someone', status='SUCCESS')
        self.assertEqual(self._groups('login_log_created'), [SUPERUSER_GROUP])

    def test_never_global(self):
        with self.captureOnCommitCallbacks(execute=True):
            AuditLog.objects.create(company_id=1, module='system', action='UPDATE')
            AuditLog.objects.create(module='system', action='UPDATE')
            UserLoginLog.objects.create(username_attempted='u2', status='FAILED')
        self.assertTrue(self.layer.sent)
        self.assertNotIn('global_notifications', [g for g, _ in self.layer.sent])
