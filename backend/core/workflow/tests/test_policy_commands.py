"""
تست فرمان‌های پیش از انتشار طرح نبودن نفر: workflow_policy_report (فقط‌خواندنی) و apply_workflow_policies.
"""
import io
from unittest import mock

from django.core.management import CommandError, call_command

from accounts.models import AuditLog
from companies.models import SectionAssignment
from platform_core import registry as preg
from workflow.models import WorkflowPolicy, WorkflowStep, WorkflowTask, WorkflowTaskRecipient
from workflow.policy_admin import policy_report, simulate

from .base import WF
from .test_api import ApiBase


class PolicyCommandTests(ApiBase):
    def setUp(self):
        super().setUp()
        p = mock.patch.dict(preg._CONTRIBUTIONS, {'workflow_role_defaults': []})
        p.start()
        self.addCleanup(p.stop)

    def waiting_review(self):
        """سند منتظر در مرحلهٔ review (بی بازبین) و سپس ردیف «رد شود» بدون محاسبهٔ دوباره."""
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d, inst = self.submit(self.member)
        self.act(self.lead, d)
        task = self.task(d)
        self.assertEqual(task.step_key, 'review')
        self.assertFalse(task.has_recipients)
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_reviewer': 'skip'})
        return d, inst

    def snapshot(self):
        return (
            list(WorkflowTask.objects.order_by('pk').values_list('pk', 'is_open', 'step_key', 'has_recipients')),
            WorkflowTaskRecipient.objects.count(), WorkflowStep.objects.count(), WorkflowPolicy.objects.count(),
            AuditLog.objects.count(),
        )

    def test_report_writes_nothing(self):
        d, _inst = self.waiting_review()
        before = self.snapshot()
        out = io.StringIO()
        call_command('workflow_policy_report', stdout=out)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.task(d).step_key, 'review')
        self.assertIn('would_advance=1', out.getvalue())

    def test_report_counts_match_simulate(self):
        self.waiting_review()
        rows = {r['company_id']: r for r in policy_report()}
        current = WorkflowPolicy.objects.get(company=self.co, workflow_key=WF)
        preview = simulate(self.co.pk, WF, {'role_actions': current.role_actions, 'creator_may_approve_own': None,
                                            'notify_mode': None, 'notify_user_ids': []})
        counts = rows[self.co.pk]['workflows'][WF]
        for effect, value in preview['counts'].items():
            self.assertEqual(counts[effect], value)
        self.assertEqual(counts['advance'], 1)
        self.assertEqual(counts['waiting_now'], 1)
        self.assertEqual(rows[self.co.pk]['superuser_created_open'], 0)

    def test_apply_moves_waiting_task_when_skip(self):
        d, _inst = self.waiting_review()
        out = io.StringIO()
        call_command('apply_workflow_policies', company=[self.co.pk], stdout=out)
        self.assertEqual(self.task(d).step_key, 'boss_ok')
        self.assertIn('skipped=1', out.getvalue())

    def test_apply_dry_run_and_guard(self):
        d, _inst = self.waiting_review()
        call_command('apply_workflow_policies', all_companies=True, dry_run=True, stdout=io.StringIO())
        self.assertEqual(self.task(d).step_key, 'review')
        with self.assertRaises(CommandError):
            call_command('apply_workflow_policies', stdout=io.StringIO())
        with self.assertRaises(CommandError):
            call_command('apply_workflow_policies', company=[self.co.pk], workflow=['nope'], stdout=io.StringIO())
