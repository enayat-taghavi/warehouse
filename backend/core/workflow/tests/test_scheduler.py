"""
تست زمان‌بند گردش کار (ت۱۰ و ت۱۲): یادآوری و خبر به بالاتر فقط یک بار و نه زودتر از مدت شرکت، هدف خبر به
بالاتر (بالاترین رتبهٔ حاضر در زنجیرهٔ همان بخش یا مدیران کل)، رویدادهای شروع و پایان بازهٔ جانشینی،
هم‌سان‌سازی محدودشده، جدایی خطای گام‌ها، شمار پرس‌وجوی ثابت و دستور --once.
"""
import datetime
import io
from unittest import mock

from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from companies.models import ProjectSection, SectionAssignment
from workflow import scheduler
from workflow.models import (
    WorkflowCompanySettings, WorkflowInstance, WorkflowTask, WorkflowTaskRecipient,
)
from workflow.recompute import recompute_open_tasks
from workflow.registry import REVIEW
from workflow.scheduler import run_tick

from .base import KIND, STEPS, WF
from .test_recompute import RecomputeBase, _days

H = datetime.timedelta(hours=1)


class SchedulerBase(RecomputeBase):
    def setUp(self):
        super().setUp()
        self.t0 = timezone.now()

    def submit(self, *args, **kw):
        with self.captureOnCommitCallbacks(execute=True):
            return super().submit(*args, **kw)

    def tick(self, hours=0, **kw):
        kw.setdefault('last_reconciled_at', self.t0 + hours * H)  # هم‌سان‌سازی خاموش مگر خواسته شود
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            stats = run_tick(self.t0 + hours * H, **kw)
        self.assertEqual(stats['errors'], [])
        return stats

    def of_kind(self, kind):
        return [(e['entity_id'], tuple(e['user_ids'])) for e in self.events if e['kind'] == kind]


class ReminderEscalationTests(SchedulerBase):
    def test_reminder_once_not_before_hours(self):
        d, _ = self.submit()
        self.assertEqual(self.tick(47)['reminders'], 0)
        self.assertEqual(self.of_kind('reminder'), [])
        self.assertEqual(self.tick(49)['reminders'], 1)
        self.assertEqual(self.of_kind('reminder'), [(d.pk, (self.lead.pk,))])
        self.assertEqual(self.tick(50)['reminders'], 0)
        self.assertEqual(self.of_kind('reminder'), [])
        self.assertIsNotNone(self.task(d).reminder_sent_at)

    def test_escalation_once_to_top_rank_in_section_chain(self):
        company_boss = self.user('cboss', 'wf_boss', company=self.co)
        self.user('boss_sec2', 'wf_boss', section=self.sec2)       # بخش دیگر
        self.user('boss_other', 'wf_boss', section=self.other_sec)  # شرکت دیگر
        d, _ = self.submit()
        self.act(self.lead, d)                     # مرحلهٔ بررسی (رتبهٔ ۳۰)؛ پرداخت‌کنندهٔ هم‌رتبه هدف نیست
        self.assertEqual(self.tick(95)['escalations'], 0)
        stats = self.tick(97)
        self.assertEqual((stats['escalations'], stats['escalations_to_superusers']), (1, 0))
        self.assertEqual(self.of_kind('escalation'), [(d.pk, tuple(sorted({self.boss.pk, company_boss.pk})))])
        self.assertEqual(self.tick(200)['escalations'], 0)
        self.assertEqual(self.of_kind('escalation'), [])

    def test_escalation_falls_back_to_superusers(self):
        d, _ = self.submit()
        self.act(self.lead, d)
        self.act(self.reviewer, d)                 # مرحلهٔ رئیس: رتبهٔ بالاتری نیست
        # کار بررسی بدون رتبهٔ بالاتر در بخش: رئیس‌ها غیرفعال
        d2, _ = self.submit()
        self.act(self.lead, d2)
        SectionAssignment.objects.filter(role='wf_boss').update(is_active=False)
        stats = self.tick(100)
        self.assertEqual((stats['escalations'], stats['escalations_to_superusers']), (2, 2))
        esc = [e for e in self.events if e['kind'] == 'escalation']
        self.assertEqual({e['entity_id'] for e in esc}, {d.pk, d2.pk})
        self.assertTrue(all(e['to_superusers'] and e['user_ids'] == [] for e in esc))

    def test_per_company_settings(self):
        WorkflowCompanySettings.objects.create(company=self.co, reminder_hours=2, escalation_hours=5)
        self.user('lead_b', 'wf_lead', section=self.other_sec)
        d, _ = self.submit()
        d_b, _ = self.submit(d=self.doc(section=self.other_sec), user=self.user('member_b', 'wf_member',
                                                                                 section=self.other_sec))
        self.assertEqual([e for e, _u in self.of_kind('reminder')], [])
        self.tick(3)
        self.assertEqual([e for e, _u in self.of_kind('reminder')], [d.pk])
        self.tick(6)
        self.assertEqual([e for e, _u in self.of_kind('escalation')], [d.pk])
        self.tick(49)
        self.assertEqual([e for e, _u in self.of_kind('reminder')], [d_b.pk])

    def test_waiting_task_without_recipients_not_reminded(self):
        self.submit(d=self.doc(section=self.sec2))  # بررسی بی‌دریافت‌کننده (هشدار مدیر کل از پیش)
        stats = self.tick(200)
        self.assertEqual((stats['reminders'], stats['escalations']), (0, 0))


class SubstituteWindowTests(SchedulerBase):
    def setUp(self):
        super().setUp()
        self.helper = self.user('helper', 'wf_member')

    def test_future_window_received_on_start_day_then_removed_after_end(self):
        self.sub(self.lead, self.helper, start=2, end=5)
        d, _ = self.submit()
        self.assertEqual(self.of_kind('received'), [(d.pk, (self.lead.pk,))])
        row = WorkflowTaskRecipient.objects.get(user=self.helper)
        self.assertFalse(row.announced)
        self.assertEqual(self.tick(1)['substitutes_started'], 0)
        self.assertEqual(self.tick(24 * 2 + 1)['substitutes_started'], 1)
        self.assertEqual(self.of_kind('received'), [(d.pk, (self.helper.pk,))])
        self.assertEqual(self.tick(24 * 2 + 2)['substitutes_started'], 0)
        self.assertEqual(self.of_kind('received'), [])
        stats = self.tick(24 * 6 + 1)
        self.assertEqual(stats['substitutes_ended'], 1)
        self.assertEqual(self.of_kind('removed'), [(d.pk, (self.helper.pk,))])
        self.assertFalse(WorkflowTaskRecipient.objects.filter(user=self.helper).exists())
        self.assertEqual(self.tick(24 * 6 + 2)['substitutes_ended'], 0)
        self.assertEqual(self.of_kind('removed'), [])

    def test_recompute_on_start_day_announces_once(self):
        self.sub(self.lead, self.helper, start=1, end=5)
        d, _ = self.submit()
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            recompute_open_tasks(company_ids={self.co.pk}, today=_days(1))
        self.assertEqual([tuple(e['user_ids']) for e in self.events if e['kind'] == 'received'], [(self.helper.pk,)])
        self.assertTrue(WorkflowTaskRecipient.objects.get(user=self.helper).announced)
        self.assertEqual(self.tick(25)['substitutes_started'], 0)
        self.assertEqual(self.of_kind('received'), [])

    def test_unannounced_expired_row_deleted_silently(self):
        self.sub(self.lead, self.helper, start=2, end=3)
        self.submit()
        stats = self.tick(24 * 5)
        self.assertEqual(stats['substitutes_ended'], 0)
        self.assertEqual(self.of_kind('removed'), [])
        self.assertFalse(WorkflowTaskRecipient.objects.filter(user=self.helper).exists())

    def test_current_window_announced_at_write(self):
        self.sub(self.lead, self.helper, start=-1, end=3)
        d, _ = self.submit()
        self.assertEqual(self.of_kind('received'), [(d.pk, tuple(sorted({self.lead.pk, self.helper.pk})))])
        self.assertTrue(WorkflowTaskRecipient.objects.get(user=self.helper).announced)
        self.assertEqual(self.tick(1)['substitutes_started'], 0)


class TickTests(SchedulerBase):
    def test_reconciliation_throttled(self):
        with mock.patch('workflow.recompute.safe_recompute', return_value={'tasks': 0}) as rec:
            s1 = self.tick(0, last_reconciled_at=None)
            self.assertEqual(rec.call_count, 1)
            self.assertEqual(s1['reconciled_at'], self.t0)
            s2 = self.tick(0.5, last_reconciled_at=s1['reconciled_at'], reconcile_minutes=60)
            self.assertEqual(rec.call_count, 1)
            self.assertEqual(s2['reconciled_at'], self.t0)
            self.tick(1.01, last_reconciled_at=s2['reconciled_at'], reconcile_minutes=60)
            self.assertEqual(rec.call_count, 2)
            self.assertEqual(rec.call_args.kwargs['all_tasks'], True)

    def test_step_failure_isolated(self):
        d, _ = self.submit()
        with mock.patch.object(scheduler, 'send_reminders', side_effect=RuntimeError('boom')):
            with self.captureOnCommitCallbacks(execute=True):
                stats = run_tick(self.t0 + 100 * H, last_reconciled_at=self.t0 + 100 * H)
        self.assertEqual(stats['errors'], ['reminders'])
        self.assertEqual(stats['escalations'], 1)

    def test_command_once(self):
        self.submit()
        out = io.StringIO()
        call_command('run_workflow_scheduler', '--once', '--interval', '1', stdout=out)
        self.assertIn('reminders=0', out.getvalue())
        self.assertIn('reconciled=yes', out.getvalue())


class SchedulerQueryCountTests(SchedulerBase):
    def bulk(self, company, project, n, tag, base):
        secs = ProjectSection.objects.bulk_create([
            ProjectSection(project=project, code=f'{tag}{i}', name=f'بخش {tag}{i}') for i in range(20)])
        rev = self.user(f'{tag}_rev', 'wf_reviewer', company=company)
        self.user(f'{tag}_boss', 'wf_boss', company=company)
        helper = self.user(f'{tag}_sub', 'wf_member', company=company)
        old = self.user(f'{tag}_old', 'wf_member', company=company)
        keys = [s.key for s in STEPS]
        insts = WorkflowInstance.objects.bulk_create([
            WorkflowInstance(workflow_key=WF, version=1, entity_kind=KIND, entity_id=base + i, company=company,
                             section=secs[i % 20], created_by=self.member, current_step='review',
                             step_keys=keys, revision=1)
            for i in range(n)])
        tasks = WorkflowTask.objects.bulk_create([
            WorkflowTask(instance=inst, step_key='review', step_kind=REVIEW, role='wf_reviewer',
                         permission='zz_wf_review', revision=1, has_recipients=True,
                         opened_at=self.t0 - 100 * H)
            for inst in insts])
        WorkflowTaskRecipient.objects.bulk_create(
            [WorkflowTaskRecipient(task=t, user=rev, announced=True) for t in tasks]
            + [WorkflowTaskRecipient(task=t, user=helper, on_behalf_of=rev, valid_from=_days(0), valid_to=_days(3))
               for t in tasks]
            + [WorkflowTaskRecipient(task=t, user=old, on_behalf_of=rev, valid_from=_days(-5), valid_to=_days(-1),
                                     announced=True)
               for t in tasks])

    def measure(self):
        self.events.clear()
        # ساخت اعلان پس از commit و برای هر رویداد است (شمار ثابت برای هر رویداد در test_notify)؛ اینجا فقط زمان‌بند
        with mock.patch('workflow.notify.create_for_event', return_value={}), \
                CaptureQueriesContext(connection) as ctx:
            with self.captureOnCommitCallbacks(execute=True):
                stats = run_tick(self.t0, last_reconciled_at=self.t0)
        self.assertEqual(stats['errors'], [])
        return len(ctx.captured_queries), stats

    def test_constant_queries_20_vs_300(self):
        self.bulk(self.co, self.pr, 20, 'S', 300000)
        n_small, small = self.measure()
        self.bulk(self.co2, self.pr2, 300, 'L', 400000)
        n_large, large = self.measure()
        for n, st in ((20, small), (300, large)):
            self.assertEqual((st['reminders'], st['escalations'], st['substitutes_started'],
                              st['substitutes_ended']), (n, n, n, n))
        self.assertEqual(sum(1 for e in self.events if e['kind'] == 'escalation'), 300)
        self.assertEqual(n_small, n_large)
        print(f'[scheduler query count] 20 tasks: {n_small}, 300 tasks: {n_large}')
