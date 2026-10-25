"""
تست گیرندهٔ وب‌سوکت رویداد کار (ت۱۶): فقط کانال شخصی یا کانال مدیران کل، هرگز کانال شرکت یا عمومی، و
payload شخصی بی فهرست گیرندگان.
"""
import datetime
import re
from unittest import mock

from django.utils import timezone

from workflow import engine, events, realtime
from workflow.scheduler import run_tick

from .test_engine import EngineBase

PERSONAL = re.compile(r'^user_\d+$')
ALLOWED_KEYS = {'type', 'type_str', 'notification_type', 'workflow_event', 'message', 'to_superusers',
                'notification_id', 'title', 'url', 'created_at', *realtime.PUBLIC_KEYS}


class FakeLayer:
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    async def group_send(self, group, message):
        if self.fail:
            raise RuntimeError('layer down')
        self.sent.append((group, message))


class RealtimeTests(EngineBase):
    def setUp(self):
        super().setUp()
        self.layer = FakeLayer()
        p = mock.patch('channels.layers.get_channel_layer', return_value=self.layer)
        p.start()
        self.addCleanup(p.stop)

    def run_flow(self, fn, *args, **kw):
        with self.captureOnCommitCallbacks(execute=True):
            return fn(*args, **kw)

    def got(self):
        """{(kind, group)} همهٔ پیام‌های فرستاده."""
        return {(m['workflow_event'], g) for g, m in self.layer.sent}

    def test_full_flow_only_personal_and_superuser_groups(self):
        g = lambda u: f'user_{u.pk}'  # noqa: E731
        # ارسال، اقدام، عودت، ارسال دوباره، رد
        d, inst = self.run_flow(self.submit)
        self.run_flow(self.act, self.lead, d)
        self.run_flow(engine.return_for_fix, self.fresh(self.reviewer), self.task(d), 'اصلاح شود')
        self.run_flow(engine.submit, 'zz_wf_flow', d, self.member)
        self.run_flow(self.act, self.lead, d)
        self.run_flow(engine.reject, self.fresh(self.reviewer), self.task(d), 'رد')
        # لغو
        d2, inst2 = self.run_flow(self.submit)
        self.run_flow(engine.cancel, self.fresh(self.member), inst2)
        # مرحلهٔ بررسی بی‌دریافت‌کننده در بخش ۲ → هشدار مدیر کل
        self.run_flow(self.submit, section=self.sec2)
        # یادآوری و خبر به بالاتر: یکی در lead_ok (به رئیس) و یکی در boss_ok (به مدیران کل)
        d3, _ = self.run_flow(self.submit)
        d4, _ = self.run_flow(self.submit)
        self.run_flow(self.act, self.lead, d4)
        self.run_flow(self.act, self.reviewer, d4)
        self.assertEqual(self.task(d4).step_key, 'boss_ok')
        self.run_flow(run_tick, timezone.now() + datetime.timedelta(hours=100))

        got = self.got()
        expected = {
            ('received', g(self.lead)), ('done', g(self.lead)), ('received', g(self.reviewer)),
            ('done', g(self.reviewer)), ('returned', g(self.member)), ('rejected', g(self.member)),
            ('removed', g(self.lead)), ('cancelled', g(self.member)),
            ('superuser_alert', realtime.SUPERUSER_GROUP),
            ('reminder', g(self.lead)), ('reminder', g(self.boss)),
            ('escalation', g(self.boss)), ('escalation', realtime.SUPERUSER_GROUP),
        }
        self.assertTrue(expected <= got, expected - got)
        for group, msg in self.layer.sent:
            self.assertTrue(PERSONAL.match(group) or group == realtime.SUPERUSER_GROUP, group)
            self.assertFalse(group.startswith(('company_', 'global')), group)
            self.assertNotIn('user_ids', msg)
            self.assertLessEqual(set(msg), ALLOWED_KEYS)
            self.assertFalse(any(isinstance(v, (list, tuple, set, dict)) for v in msg.values()), msg)
            self.assertEqual(msg['type'], 'send_notification')
            self.assertTrue(msg['message'])
            if group == realtime.SUPERUSER_GROUP:
                self.assertIn(msg['workflow_event'], ('superuser_alert', 'escalation'))
        # خبر به بالاتر به رئیس فقط برای کار سرپرست؛ کار رئیس به مدیران کل رفت
        esc = [(g_, m) for g_, m in self.layer.sent if m['workflow_event'] == 'escalation']
        self.assertEqual(len(esc), 2)
        by_group = {g_: m for g_, m in esc}
        self.assertEqual(by_group[g(self.boss)]['entity_id'], d3.pk)
        self.assertEqual(by_group[realtime.SUPERUSER_GROUP]['entity_id'], d4.pk)
        self.assertTrue(by_group[realtime.SUPERUSER_GROUP]['to_superusers'])

    def test_each_user_gets_own_message_without_other_ids(self):
        lead2 = self.user('lead2', 'wf_lead')
        self.run_flow(self.submit)
        received = [(g, m) for g, m in self.layer.sent if m['workflow_event'] == 'received']
        self.assertEqual({g for g, _m in received}, {f'user_{self.lead.pk}', f'user_{lead2.pk}'})
        for _g, m in received:
            self.assertNotIn('user_ids', m)
            self.assertIsNone(m['actor_id'])
        # «برداشته شد» به همکار، شناسهٔ انجام‌دهنده را ندارد (بازبینی ۲.۳-ب)
        d = self.submit()[0]
        self.run_flow(self.act, self.lead, d)
        removed = [m for g, m in self.layer.sent if m['workflow_event'] == 'removed']
        self.assertEqual(len(removed), 1)
        self.assertIsNone(removed[0]['actor_id'])

    def test_target_messages_never_company_or_global(self):
        payload = {'kind': events.RECEIVED, 'user_ids': [3, 5], 'company_id': 9, 'task_id': 1}
        self.assertEqual([g for g, _m in realtime.target_messages(payload)], ['user_3', 'user_5'])
        alert = dict(payload, kind=events.SUPERUSER_ALERT, user_ids=[])
        self.assertEqual([g for g, _m in realtime.target_messages(alert)], [realtime.SUPERUSER_GROUP])
        esc = dict(payload, kind=events.ESCALATION, user_ids=[], to_superusers=True)
        self.assertEqual([g for g, _m in realtime.target_messages(esc)], [realtime.SUPERUSER_GROUP])
        self.assertEqual(realtime.target_messages(dict(payload, user_ids=[])), [])

    def test_personal_message_carries_own_notification(self):
        from notifications.models import Notification
        d, _inst = self.run_flow(self.submit)
        received = [(g, m) for g, m in self.layer.sent if m['workflow_event'] == 'received']
        self.assertTrue(received)
        for group, msg in received:
            note = Notification.objects.get(pk=msg['notification_id'])
            self.assertEqual(group, f'user_{note.recipient_id}')
            self.assertEqual((msg['title'], msg['url']), (note.title, '/app/my-tasks'))
        self.run_flow(engine.return_for_fix, self.fresh(self.lead), self.task(d), 'مبلغ اشتباه است')
        note = Notification.objects.filter(recipient=self.member).latest('id')
        self.assertIn('مبلغ اشتباه است', note.message)
        self.assertNotIn('my-tasks', note.url)

    def test_channel_layer_failure_does_not_break_engine(self):
        self.layer.fail = True
        d, _inst = self.run_flow(self.submit)
        self.run_flow(self.act, self.lead, d)
        self.assertEqual(self.task(d).step_key, 'review')
        with mock.patch('channels.layers.get_channel_layer', side_effect=RuntimeError('no layer')):
            self.run_flow(self.act, self.reviewer, d)
        self.assertEqual(self.task(d).step_key, 'boss_ok')
