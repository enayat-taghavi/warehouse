"""
تست سناریوهای اعلان‌های داخل برنامه برای رویدادهای گردش کار (طرح ۲.۴-الف).
"""
import datetime
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from notifications.models import Notification
from workflow import engine, events, notify, realtime
from workflow.models import WorkflowSubstitute

from .test_engine import EngineBase


class FakeLayer:
    """لایهٔ جعلی کانال برای رهگیری پیام‌های وب‌سوکت ارسالی."""
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    async def group_send(self, group, message):
        if self.fail:
            raise RuntimeError('layer down')
        self.sent.append((group, message))


class NotifyTests(EngineBase):
    """آزمون‌های اعتبارسنجی ساخت اعلان داخل برنامه بر پایهٔ رویدادهای کار."""

    def setUp(self):
        super().setUp()
        self.layer = FakeLayer()
        p = mock.patch('channels.layers.get_channel_layer', return_value=self.layer)
        p.start()
        self.addCleanup(p.stop)

    def run_flow(self, fn, *args, **kw):
        with self.captureOnCommitCallbacks(execute=True):
            return fn(*args, **kw)

    def sub(self, principal, substitute, start=-1, end=3, company=None):
        today = timezone.localdate()
        return WorkflowSubstitute.objects.create(
            principal=principal, substitute=substitute, company=company,
            start_date=today + datetime.timedelta(days=start), end_date=today + datetime.timedelta(days=end))

    def test_received_creates_row_per_holder(self):
        """ساخت دقیقاً یک ردیف اعلان برای هر دارندهٔ کار هنگام رسیدن رویداد کار تازه."""
        lead2 = self.user('lead2', 'wf_lead')
        d, instance = self.run_flow(self.submit)

        lead_notes = Notification.objects.filter(recipient=self.lead)
        lead2_notes = Notification.objects.filter(recipient=lead2)
        member_notes = Notification.objects.filter(recipient=self.member)

        self.assertEqual(lead_notes.count(), 1)
        self.assertEqual(lead2_notes.count(), 1)
        self.assertEqual(member_notes.count(), 0)

        for note in (lead_notes.first(), lead2_notes.first()):
            self.assertEqual(note.notification_type, notify.NOTIFICATION_TYPE)
            self.assertEqual(note.title, notify.TITLES_FA[events.RECEIVED])
            self.assertEqual(note.url, notify.MY_TASKS_URL)
            self.assertEqual(note.target_model, notify.TARGET_MODEL)
            self.assertEqual(note.target_id, str(instance.pk))
            self.assertIn('تأیید سرپرست', note.message)

    def test_substitute_gets_on_behalf_text(self):
        """درج عبارت «به جانشینی از» برای جانشین و عدم تکرار آن برای دارندهٔ مستقیم کار."""
        helper = self.user('helper', 'wf_member')
        self.sub(self.lead, helper)
        lead2 = self.user('lead2', 'wf_lead')
        self.sub(self.lead, lead2)

        d, instance = self.run_flow(self.submit)

        helper_notes = Notification.objects.filter(recipient=helper)
        lead_notes = Notification.objects.filter(recipient=self.lead)
        lead2_notes = Notification.objects.filter(recipient=lead2)

        self.assertEqual(helper_notes.count(), 1)
        lead_display = self.lead.get_full_name() or self.lead.username
        self.assertIn('به جانشینی از', helper_notes.first().message)
        self.assertIn(lead_display, helper_notes.first().message)

        self.assertEqual(lead_notes.count(), 1)
        self.assertNotIn('به جانشینی از', lead_notes.first().message)

        # کاربری که هم‌زمان دارندهٔ مستقیم و جانشین است دقیقاً یک ردیف می‌گیرد و بدون متن جانشینی
        self.assertEqual(lead2_notes.count(), 1)
        self.assertNotIn('به جانشینی از', lead2_notes.first().message)

    def test_no_row_for_removed_or_own_done(self):
        """عدم ایجاد ردیف اعلان برای رویداد انجام کار توسط خود اقدام‌کننده و برداشته شدن از کارتابل همکار."""
        lead2 = self.user('lead2', 'wf_lead')
        d, instance = self.run_flow(self.submit)
        self.run_flow(self.act, self.lead, d)

        self.assertEqual(Notification.objects.filter(recipient=self.lead).count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=lead2).count(), 1)

        rev_notes = Notification.objects.filter(recipient=self.reviewer)
        self.assertEqual(rev_notes.count(), 1)
        self.assertEqual(rev_notes.first().title, notify.TITLES_FA[events.RECEIVED])

    def test_superuser_alert_rows(self):
        """ایجاد ردیف اعلان برای همهٔ مدیران کل فعال و پیام وب‌سوکت بدون شناسهٔ اعلان شخصی."""
        User = get_user_model()
        inactive_su = User.objects.create_user(
            username='wf_su_inactive', password='x', is_superuser=True, is_staff=True, is_active=False
        )
        d, instance = self.run_flow(self.submit, section=self.sec2)

        active_sus = User.objects.filter(is_active=True, is_superuser=True)
        self.assertTrue(active_sus.exists())
        for su in active_sus:
            su_notes = Notification.objects.filter(recipient=su)
            self.assertEqual(su_notes.count(), 1)
            self.assertEqual(su_notes.first().title, notify.TITLES_FA[events.SUPERUSER_ALERT])

        self.assertEqual(Notification.objects.filter(recipient=inactive_su).count(), 0)

        su_messages = [m for g, m in self.layer.sent if g == realtime.SUPERUSER_GROUP]
        self.assertTrue(su_messages)
        for msg in su_messages:
            self.assertTrue(msg.get('title'))
            self.assertNotIn('notification_id', msg)

    def test_reason_in_return_and_reject(self):
        """درج دلیل عودت و رد در متن اعلان ثبت‌کننده و تنظیم آدرس سند."""
        d, instance = self.run_flow(self.submit)
        self.run_flow(engine.return_for_fix, self.fresh(self.lead), self.task(d), 'مبلغ اشتباه است')
        self.run_flow(engine.submit, 'zz_wf_flow', d, self.member)
        self.run_flow(self.act, self.lead, d)
        self.run_flow(engine.reject, self.fresh(self.reviewer), self.task(d), 'تکراری')

        returned_note = Notification.objects.get(recipient=self.member, title=notify.TITLES_FA[events.RETURNED])
        self.assertIn('مبلغ اشتباه است', returned_note.message)
        self.assertNotEqual(returned_note.url, notify.MY_TASKS_URL)
        self.assertIn(str(d.pk), returned_note.url)

        rejected_note = Notification.objects.get(recipient=self.member, title=notify.TITLES_FA[events.REJECTED])
        self.assertIn('تکراری', rejected_note.message)
        self.assertNotEqual(rejected_note.url, notify.MY_TASKS_URL)
        self.assertIn(str(d.pk), rejected_note.url)

    def test_completed_url(self):
        """تنظیم آدرس مستقیم سند در اعلان پایان فرایند گردش کار برای ثبت‌کننده."""
        d, instance = self.run_flow(self.submit)
        for actor in (self.lead, self.reviewer, self.boss, self.payer):
            self.run_flow(self.act, actor, d)

        notes = Notification.objects.filter(recipient=self.member, title=notify.COMPLETED_TITLE_FA)
        self.assertEqual(notes.count(), 1)
        note = notes.first()
        self.assertIn(str(d.pk), note.url)

    def test_inactive_user_no_row(self):
        """عدم ساخت ردیف اعلان برای کاربری که غیرفعال است."""
        self.lead.is_active = False
        self.lead.save()
        d, instance = self.run_flow(self.submit)

        self.assertEqual(Notification.objects.filter(recipient=self.lead).count(), 0)

    def test_failure_does_not_break_engine(self):
        """خطای پایگاه داده هنگام ساخت ردیف اعلان مانع گردش کار و ارسال وب‌سوکت نمی‌شود."""
        with mock.patch('notifications.models.Notification.objects.bulk_create', side_effect=RuntimeError('db down')):
            d, instance = self.run_flow(self.submit)
            self.run_flow(self.act, self.lead, d)

        self.assertEqual(self.task(d).step_key, 'review')
        received_msgs = [m for g, m in self.layer.sent if m.get('workflow_event') == 'received']
        self.assertTrue(received_msgs)
        for msg in received_msgs:
            self.assertNotIn('notification_id', msg)

    def test_constant_queries_per_event(self):
        """ثابت بودن تعداد پرس‌وجوهای پایگاه داده مستقل از تعداد گیرندگان در ساخت اعلان رویداد."""
        d, instance = self.submit()
        task = self.task(d)

        lead2 = self.user('lead2', 'wf_lead')
        user_ids_2 = [self.lead.pk, lead2.pk]

        extra_leads = [self.user(f'extra_lead_{i}', 'wf_lead') for i in range(10)]
        user_ids_12 = user_ids_2 + [u.pk for u in extra_leads]

        payload_2 = events.build_payload(events.RECEIVED, instance, task, user_ids_2)
        payload_12 = events.build_payload(events.RECEIVED, instance, task, user_ids_12)

        with self.captureOnCommitCallbacks(execute=False):
            with CaptureQueriesContext(connection) as ctx_2:
                notify.create_for_event(payload_2)

        with self.captureOnCommitCallbacks(execute=False):
            with CaptureQueriesContext(connection) as ctx_12:
                notify.create_for_event(payload_12)

        self.assertEqual(len(ctx_2.captured_queries), len(ctx_12.captured_queries))
