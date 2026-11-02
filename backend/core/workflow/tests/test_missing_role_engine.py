"""
Tests for missing-role engine decisions (skip/wait), forced tasks, settled_outside,
waiting notice recipients and the superuser view-only rule (Role-policy plan step B).
"""
import dataclasses
from decimal import Decimal
from unittest import mock

from django.urls import reverse
from rest_framework.test import APIClient

from companies.models import SectionAssignment, UserCompanyAccess
from platform_core import registry as preg
from workflow import engine, events, notify
from workflow.errors import WorkflowPermissionDenied
from workflow.models import (
    WorkflowInstance,
    WorkflowPolicy,
    WorkflowStep,
    WorkflowTask,
    WorkflowThreshold,
)
from workflow.recompute import recompute_open_tasks
from workflow.registry import reset_workflow_cache

from .base import KIND, ROLES, STEPS, WF, WorkflowTestBase, make_spec


class MissingRoleEngineTests(WorkflowTestBase):
    def setUp(self):
        super().setUp()
        self.patch_role_defaults([])

    def patch_role_defaults(self, defaults):
        p = mock.patch.dict(preg._CONTRIBUTIONS, {'workflow_role_defaults': list(defaults)})
        p.start()
        self.addCleanup(p.stop)

    def set_spec(self, spec):
        self.specs[:] = [spec]
        reset_workflow_cache()

    def test_approve_no_holder_skips_by_default(self):
        SectionAssignment.objects.filter(user=self.lead).update(is_active=False)
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        step_submit = inst.steps.get(action=WorkflowStep.SUBMIT)
        self.assertIn({'step': 'lead_ok', 'reason': 'no_recipient'}, step_submit.skipped)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'review')
        self.assertTrue(task.is_open)
        self.assertTrue(task.has_recipients)
        self.assertEqual(task.wait_reason, '')

    def test_approve_no_holder_waits_with_row(self):
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_lead': 'wait'})
        SectionAssignment.objects.filter(user=self.lead).update(is_active=False)
        d = self.doc()
        with self.captureOnCommitCallbacks(execute=True):
            inst = engine.submit(WF, d, self.member)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'lead_ok')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')
        waiting_events = [e for e in self.events if e['kind'] == events.WAITING]
        self.assertEqual(len(waiting_events), 1)
        self.assertEqual(waiting_events[0]['step_key'], 'lead_ok')
        self.assertEqual(waiting_events[0]['task_id'], task.pk)

    def test_review_no_holder_waits_by_default(self):
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        lead_task = engine.open_task(WF, d.pk)
        self.assertEqual(lead_task.step_key, 'lead_ok')
        engine.act(self.lead, lead_task)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'review')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

    def test_review_no_holder_skips_with_company_row(self):
        WorkflowPolicy.objects.create(company=self.co, workflow_key='', role_actions={'wf_reviewer': 'skip'})
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        lead_task = engine.open_task(WF, d.pk)
        engine.act(self.lead, lead_task)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'boss_ok')
        act_step = inst.steps.filter(action=WorkflowStep.ACT).order_by('-id').first()
        self.assertIn({'step': 'review', 'reason': 'no_recipient'}, act_step.skipped)

    def test_module_default_used(self):
        self.patch_role_defaults([{'wf_reviewer': 'skip'}])
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        lead_task = engine.open_task(WF, d.pk)
        engine.act(self.lead, lead_task)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'boss_ok')
        act_step = inst.steps.filter(action=WorkflowStep.ACT).order_by('-id').first()
        self.assertIn({'step': 'review', 'reason': 'no_recipient'}, act_step.skipped)

    def test_creator_only_skip_reason(self):
        WorkflowPolicy.objects.create(company=self.co, workflow_key='', role_actions={'wf_reviewer': 'skip'})
        d = self.doc()
        inst = engine.submit(WF, d, self.reviewer)
        submit_step = inst.steps.get(action=WorkflowStep.SUBMIT)
        self.assertIn({'step': 'review', 'reason': 'no_second_approval'}, submit_step.skipped)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'boss_ok')

    def test_creator_only_wait_reason(self):
        d = self.doc()
        with self.captureOnCommitCallbacks(execute=True):
            inst = engine.submit(WF, d, self.reviewer)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'review')
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'creator_only')
        waiting_events = [e for e in self.events if e['kind'] == events.WAITING and e['task_id'] == task.pk]
        self.assertEqual(len(waiting_events), 1)
        notifs = notify.create_for_event(waiting_events[0])
        self.assertTrue(bool(notifs))
        body = list(notifs.values())[0].message
        self.assertIn('ثبت‌کنندهٔ سند', body)

    def test_creator_may_approve_own_policy(self):
        policy = WorkflowPolicy.objects.create(
            company=self.co, workflow_key=WF, creator_may_approve_own=True,
        )
        d = self.doc()
        inst = engine.submit(WF, d, self.boss)
        rev_task = engine.open_task(WF, d.pk)
        self.assertEqual(rev_task.step_key, 'review')
        engine.act(self.reviewer, rev_task)
        boss_task = engine.open_task(WF, d.pk)
        self.assertEqual(boss_task.step_key, 'boss_ok')
        self.assertIn(self.boss.pk, self.recipients(boss_task))
        self.assertTrue(boss_task.has_recipients)
        engine.act(self.boss, boss_task)
        pay_task = engine.open_task(WF, d.pk)
        self.assertEqual(pay_task.step_key, 'pay')

        # With the row set to False:
        policy.creator_may_approve_own = False
        policy.role_actions = {'wf_boss': 'wait'}
        policy.save()
        d2 = self.doc()
        inst2 = engine.submit(WF, d2, self.boss)
        rev_task2 = engine.open_task(WF, d2.pk)
        engine.act(self.reviewer, rev_task2)
        boss_task2 = engine.open_task(WF, d2.pk)
        self.assertEqual(boss_task2.step_key, 'boss_ok')
        self.assertEqual(boss_task2.wait_reason, 'creator_only')
        with self.assertRaises(WorkflowPermissionDenied) as cm:
            engine.act(self.boss, boss_task2)
        self.assertEqual(cm.exception.code, 'self_approval')
        self.assertEqual(cm.exception.status, 403)

        # When role_actions allows default skip:
        policy.role_actions = {}
        policy.save()
        d3 = self.doc()
        inst3 = engine.submit(WF, d3, self.boss)
        rev_task3 = engine.open_task(WF, d3.pk)
        engine.act(self.reviewer, rev_task3)
        step_act3 = inst3.steps.filter(action=WorkflowStep.ACT).order_by('-id').first()
        self.assertIn({'step': 'boss_ok', 'reason': 'no_second_approval'}, step_act3.skipped)
        pay_task3 = engine.open_task(WF, d3.pk)
        self.assertEqual(pay_task3.step_key, 'pay')

    def test_threshold_skip_unchanged(self):
        WorkflowThreshold.objects.create(
            workflow_key=WF, step_key='boss_ok', company=self.co, amount=Decimal('1000'),
        )
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_boss': 'wait'})
        SectionAssignment.objects.filter(user=self.boss).update(is_active=False)
        d = self.doc(amount=Decimal('500'))
        inst = engine.submit(WF, d, self.member)
        engine.act(self.lead, engine.open_task(WF, d.pk))
        engine.act(self.reviewer, engine.open_task(WF, d.pk))
        task = engine.open_task(WF, d.pk)
        self.assertEqual(task.step_key, 'pay')
        submit_step = inst.steps.get(action=WorkflowStep.SUBMIT)
        self.assertIn({'step': 'boss_ok', 'reason': 'threshold'}, submit_step.skipped)
        self.assertNotIn({'step': 'boss_ok', 'reason': 'no_recipient'}, submit_step.skipped)

    def test_forced_task_never_skipped(self):
        SectionAssignment.objects.filter(user=self.boss).update(is_active=False)
        d = self.doc()
        task = engine.open_at_step(WF, d, self.member, 'boss_ok')
        self.assertIsNotNone(task)
        self.assertTrue(task.forced)
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_boss': 'skip'})
        recompute_open_tasks(company_ids=[self.co.pk])

        task.refresh_from_db()
        self.assertTrue(task.is_open)
        self.assertTrue(task.forced)
        self.assertEqual(task.outcome, '')
        task_now = engine.open_task(WF, d.pk)
        self.assertEqual(task_now.pk, task.pk)
        self.assertEqual(task_now.step_key, 'boss_ok')

    def test_recompute_skips_waiting_task_after_policy_change(self):
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        engine.act(self.lead, engine.open_task(WF, d.pk))
        task = engine.open_task(WF, d.pk)
        self.assertEqual(task.step_key, 'review')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)

        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_reviewer': 'skip'})
        recompute_open_tasks(company_ids=[self.co.pk])

        task.refresh_from_db()
        self.assertFalse(task.is_open)
        self.assertEqual(task.outcome, WorkflowTask.SKIPPED)

        next_task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(next_task)
        self.assertEqual(next_task.step_key, 'boss_ok')

        auto_step = inst.steps.filter(action=WorkflowStep.AUTO).order_by('-id').first()
        self.assertIsNotNone(auto_step)
        self.assertIn({'step': 'review', 'reason': 'no_recipient'}, auto_step.skipped)

    def test_recompute_other_company_untouched(self):
        other_member = self.user('other_mem', 'wf_member', section=self.other_sec)
        other_lead = self.user('other_lead', 'wf_lead', section=self.other_sec)
        d2 = self.doc(section=self.other_sec)
        inst2 = engine.submit(WF, d2, other_member)
        engine.act(other_lead, engine.open_task(WF, d2.pk))
        task2 = engine.open_task(WF, d2.pk)
        self.assertEqual(task2.step_key, 'review')
        self.assertTrue(task2.is_open)
        self.assertFalse(task2.has_recipients)

        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_reviewer': 'skip'})
        recompute_open_tasks(company_ids=[self.co.pk, self.co2.pk])

        task2.refresh_from_db()
        self.assertTrue(task2.is_open)
        self.assertFalse(task2.has_recipients)
        self.assertEqual(task2.step_key, 'review')

    def test_recompute_gained_holder_receives(self):
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        engine.act(self.lead, engine.open_task(WF, d.pk))
        task = engine.open_task(WF, d.pk)
        self.assertEqual(task.step_key, 'review')
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            new_reviewer = self.user('new_rev', 'wf_reviewer')
            recompute_open_tasks(company_ids=[self.co.pk])

        task.refresh_from_db()
        self.assertTrue(task.has_recipients)
        self.assertEqual(task.wait_reason, '')
        self.assertIn(new_reviewer.pk, self.recipients(task))

        received_events = [e for e in self.events if e['kind'] == events.RECEIVED and e['task_id'] == task.pk]
        self.assertTrue(len(received_events) >= 1)
        self.assertIn(new_reviewer.pk, received_events[-1]['user_ids'])

    def test_waiting_event_once_per_transition(self):
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d = self.doc()
        with self.captureOnCommitCallbacks(execute=True):
            inst = engine.submit(WF, d, self.member)
            engine.act(self.lead, engine.open_task(WF, d.pk))
        task = engine.open_task(WF, d.pk)
        self.assertEqual(task.step_key, 'review')
        self.assertFalse(task.has_recipients)

        waiting_before = [e for e in self.events if e['kind'] == events.WAITING and e['task_id'] == task.pk]
        self.assertEqual(len(waiting_before), 1)

        with self.captureOnCommitCallbacks(execute=True):
            recompute_open_tasks(company_ids=[self.co.pk])
        with self.captureOnCommitCallbacks(execute=True):
            recompute_open_tasks(company_ids=[self.co.pk])

        waiting_total = [e for e in self.events if e['kind'] == events.WAITING and e['task_id'] == task.pk]
        self.assertEqual(len(waiting_total), 1)

    def test_waiting_recipients_role_assigners_same_company(self):
        u_co = self.user('assigner_co')
        UserCompanyAccess.objects.create(
            user=u_co, company=self.co, section_levels={'projects': 'write'},
        )
        u_co2 = self.user('assigner_co2')
        UserCompanyAccess.objects.create(
            user=u_co2, company=self.co2, section_levels={'projects': 'write'},
        )
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_lead': 'wait'})
        SectionAssignment.objects.filter(user=self.lead).update(is_active=False)

        d = self.doc()
        with self.captureOnCommitCallbacks(execute=True):
            inst = engine.submit(WF, d, self.member)

        waiting_events = [e for e in self.events if e['kind'] == events.WAITING]
        self.assertEqual(len(waiting_events), 1)
        wevent = waiting_events[0]
        self.assertEqual(wevent['user_ids'], [u_co.pk])
        self.assertNotIn('to_superusers', wevent)
        self.assertNotIn(u_co2.pk, wevent['user_ids'])

    def test_waiting_recipients_fallback_superusers(self):
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_lead': 'wait'})
        SectionAssignment.objects.filter(user=self.lead).update(is_active=False)

        d = self.doc()
        with self.captureOnCommitCallbacks(execute=True):
            inst = engine.submit(WF, d, self.member)

        waiting_events = [e for e in self.events if e['kind'] == events.WAITING]
        self.assertEqual(len(waiting_events), 1)
        wevent = waiting_events[0]
        self.assertTrue(wevent.get('to_superusers'))
        self.assertEqual(wevent['user_ids'], [])

    def test_waiting_recipients_users_mode(self):
        user_co2 = self.user('co2_only', 'wf_member', section=self.other_sec)
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            notify_mode=WorkflowPolicy.NOTIFY_USERS,
            notify_user_ids=[self.lead.pk, user_co2.pk],
        )
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)

        d = self.doc()
        with self.captureOnCommitCallbacks(execute=True):
            inst = engine.submit(WF, d, self.member)
            engine.act(self.lead, engine.open_task(WF, d.pk))

        task = engine.open_task(WF, d.pk)
        self.assertEqual(task.step_key, 'review')
        self.assertFalse(task.has_recipients)

        waiting_events = [e for e in self.events if e['kind'] == events.WAITING and e['task_id'] == task.pk]
        self.assertEqual(len(waiting_events), 1)
        self.assertEqual(waiting_events[0]['user_ids'], [self.lead.pk])
        self.assertNotIn('to_superusers', waiting_events[0])

    def test_payment_skip_settles_outside(self):
        pay_step = dataclasses.replace(STEPS[3], payment=True)
        self.set_spec(make_spec(steps=STEPS[:3] + (pay_step,)))
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_payer': 'skip'})
        SectionAssignment.objects.filter(user=self.payer).update(is_active=False)

        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        engine.act(self.lead, engine.open_task(WF, d.pk))
        engine.act(self.reviewer, engine.open_task(WF, d.pk))
        engine.act(self.boss, engine.open_task(WF, d.pk))

        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertTrue(inst.settled_outside)
        self.assertIsNone(engine.open_task(WF, d.pk))
        self.assertEqual(d.states[-1], 'settled_outside')
        last_step = inst.steps.order_by('-id').first()
        self.assertIn({'step': 'pay', 'reason': 'payment_outside'}, last_step.skipped)

    def test_payment_skip_blocked_by_hook_waits(self):
        pay_step = dataclasses.replace(STEPS[3], payment=True)
        self.set_spec(make_spec(steps=STEPS[:3] + (pay_step,)))
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_payer': 'skip'})
        SectionAssignment.objects.filter(user=self.payer).update(is_active=False)

        p_hook = mock.patch.dict(
            preg._CONTRIBUTIONS,
            {f'can_settle_outside:{KIND}': [lambda obj, inst: 'پرداخت بیرون از سامانه مسدود است']},
        )
        p_hook.start()
        self.addCleanup(p_hook.stop)

        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        engine.act(self.lead, engine.open_task(WF, d.pk))
        engine.act(self.reviewer, engine.open_task(WF, d.pk))
        engine.act(self.boss, engine.open_task(WF, d.pk))

        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.IN_PROGRESS)
        self.assertFalse(inst.settled_outside)
        task = engine.open_task(WF, d.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'pay')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

    def test_payment_skip_in_recompute(self):
        pay_step = dataclasses.replace(STEPS[3], payment=True)
        self.set_spec(make_spec(steps=STEPS[:3] + (pay_step,)))

        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        engine.act(self.lead, engine.open_task(WF, d.pk))
        engine.act(self.reviewer, engine.open_task(WF, d.pk))
        engine.act(self.boss, engine.open_task(WF, d.pk))

        task = engine.open_task(WF, d.pk)
        self.assertEqual(task.step_key, 'pay')
        self.assertTrue(task.has_recipients)

        SectionAssignment.objects.filter(user=self.payer).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_payer': 'skip'})
        recompute_open_tasks(company_ids=[self.co.pk])

        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertTrue(inst.settled_outside)
        self.assertIsNone(engine.open_task(WF, d.pk))
        self.assertEqual(d.states[-1], 'settled_outside')
        last_step = inst.steps.order_by('-id').first()
        self.assertEqual(last_step.action, WorkflowStep.AUTO)
        self.assertIn({'step': 'pay', 'reason': 'payment_outside'}, last_step.skipped)

    def test_superuser_cannot_act_or_refer(self):
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        task = engine.open_task(WF, d.pk)

        self.assertFalse(engine.can_act(self.su, task))

        with self.assertRaises(WorkflowPermissionDenied) as cm_act:
            engine.act(self.su, task)
        self.assertEqual(cm_act.exception.code, 'superuser_view_only')
        self.assertEqual(cm_act.exception.status, 403)

        with self.assertRaises(WorkflowPermissionDenied) as cm_ret:
            engine.return_for_fix(self.su, task, 'دلیل عودت')
        self.assertEqual(cm_ret.exception.code, 'superuser_view_only')
        self.assertEqual(cm_ret.exception.status, 403)

        with self.assertRaises(WorkflowPermissionDenied) as cm_rej:
            engine.reject(self.su, task, 'دلیل رد')
        self.assertEqual(cm_rej.exception.code, 'superuser_view_only')
        self.assertEqual(cm_rej.exception.status, 403)

        with self.assertRaises(WorkflowPermissionDenied) as cm_ref:
            engine.refer(self.su, inst, [self.lead.pk], kind=engine.REFER)
        self.assertEqual(cm_ref.exception.code, 'superuser_view_only')
        self.assertEqual(cm_ref.exception.status, 403)

    def test_superuser_api_403_history_200(self):
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        task = engine.open_task(WF, d.pk)

        client = APIClient()
        client.force_authenticate(user=self.su)

        url_action = reverse('workflow-task-action', kwargs={'task_id': task.pk})
        res_act = client.post(url_action, {'action': 'act'}, format='json')
        self.assertEqual(res_act.status_code, 403)
        self.assertEqual(res_act.json().get('code'), 'superuser_view_only')

        url_history = reverse('workflow-history')
        res_hist = client.get(url_history, {'kind': KIND, 'id': d.pk})
        self.assertEqual(res_hist.status_code, 200)
        hdata = res_hist.json()
        self.assertEqual(hdata.get('entity_kind'), KIND)
        self.assertEqual(hdata.get('entity_id'), d.pk)
        self.assertTrue(len(hdata.get('instances', [])) >= 1)
