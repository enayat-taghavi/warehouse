"""
طرح ۲.۳-و-ب: ارجاع در هستهٔ گردش کار — شاخه‌های موازی کنار کار مرحله (ر۱)، گیرندهٔ شخص‌محور (ر۵)، پرچم
جانشین (ر۴)، بستن با «انجام شد» و «رؤیت شد» (ر۷)، رؤیت (ر۸)، رد و لغو نمونه (ر۹)، سابقه (ر۱۲) و نمونهٔ فقط
ارجاع (ر۱۵).
"""
import datetime

from django.utils import timezone

from companies.models import SectionAssignment
from platform_core import registry as preg
from workflow import engine
from workflow.errors import TaskAlreadyDone, WorkflowError, WorkflowPermissionDenied, WorkflowStateError
from workflow.models import WorkflowInstance, WorkflowStep, WorkflowSubstitute, WorkflowTask
from workflow.recompute import recompute_open_tasks
from workflow.registry import INFORM, REFER, reset_workflow_cache

from .base import WF, WorkflowTestBase, make_spec

REF_WF = 'zz_wf_referral_only'


class ReferralBase(WorkflowTestBase):
    def submit(self):
        d = self.doc()
        inst = engine.submit(WF, d, self.member)
        return d, inst

    def step_task(self, d):
        return engine.open_task(WF, d.pk)

    def refer(self, user, inst, targets, kind=REFER, **kw):
        return engine.refer(self.fresh(user), inst, [t.pk for t in targets], kind=kind, **kw)

    def open_referrals(self, inst):
        return WorkflowTask.objects.filter(instance=inst, track=WorkflowTask.TRACK_REFERRAL, is_open=True)

    def sub(self, principal, substitute):
        today = timezone.localdate()
        return WorkflowSubstitute.objects.create(principal=principal, substitute=substitute, company=self.co,
                                                 start_date=today, end_date=today + datetime.timedelta(days=5))


class ParallelReferralTests(ReferralBase):
    def test_parallel_referrals_beside_step_task(self):
        d, inst = self.submit()
        step = self.step_task(d)
        tasks = self.refer(self.lead, inst, [self.reviewer, self.payer], instruction='بررسی شود')
        self.assertEqual(len(tasks), 2)
        self.assertEqual({t.target_user_id for t in tasks}, {self.reviewer.pk, self.payer.pk})
        for t in tasks:
            self.assertEqual((t.parent_task_id, t.referred_by_id, t.step_kind), (step.pk, self.lead.pk, REFER))
            self.assertEqual(self.recipients(t), {t.target_user_id})
        self.assertTrue(WorkflowTask.objects.get(pk=step.pk).is_open)
        self.assertEqual(WorkflowStep.objects.filter(instance=inst, action=WorkflowStep.REFER).count(), 2)

    def test_step_act_keeps_referrals_and_flow_unchanged(self):
        d, inst = self.submit()
        self.refer(self.lead, inst, [self.payer])
        engine.act(self.fresh(self.lead), self.step_task(d))
        self.assertEqual(self.step_task(d).step_key, 'review')
        engine.act(self.fresh(self.reviewer), self.step_task(d))
        engine.act(self.fresh(self.boss), self.step_task(d))
        engine.act(self.fresh(self.payer), self.step_task(d))
        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertEqual(self.open_referrals(inst).count(), 1)
        self.assertEqual(d.states[-1], 'completed')

    def test_referral_task_rejects_step_actions_and_step_rejects_done(self):
        d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        with self.assertRaises(WorkflowPermissionDenied) as cm:
            engine.act(self.fresh(self.payer), ref)
        self.assertEqual(cm.exception.code, 'action_not_allowed')
        with self.assertRaises(WorkflowPermissionDenied) as cm:
            engine.complete_referral(self.fresh(self.lead), self.step_task(d), action=WorkflowStep.DONE)
        self.assertEqual(cm.exception.code, 'action_not_allowed')

    def test_tree_child_of_referral(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        child = self.refer(self.payer, inst, [self.reviewer], kind=INFORM, parent_task=ref.pk)[0]
        self.assertEqual(child.parent_task_id, ref.pk)
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE)
        self.assertTrue(WorkflowTask.objects.get(pk=child.pk).is_open)


class CloseReferralTests(ReferralBase):
    def test_refer_closes_by_done_with_reply_once(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        with self.assertRaises(WorkflowPermissionDenied):
            engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.SEEN)
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE, reply='انجام شد')
        ref.refresh_from_db()
        self.assertEqual((ref.is_open, ref.outcome, ref.reply), (False, WorkflowTask.ACTED, 'انجام شد'))
        self.assertEqual(self.recipients(ref), set())
        step = WorkflowStep.objects.get(instance=inst, action=WorkflowStep.DONE)
        self.assertEqual((step.actor_id, step.reason), (self.payer.pk, 'انجام شد'))
        with self.assertRaises(TaskAlreadyDone):
            engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE)

    def test_inform_closes_only_by_seen(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer], kind=INFORM)[0]
        with self.assertRaises(WorkflowPermissionDenied):
            engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE)
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.SEEN)
        self.assertTrue(WorkflowStep.objects.filter(instance=inst, action=WorkflowStep.SEEN).exists())

    def test_only_target_closes_not_superuser_or_referrer(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        for user in (self.su, self.lead, self.boss):
            with self.assertRaises(WorkflowPermissionDenied):
                engine.complete_referral(self.fresh(user), ref, action=WorkflowStep.DONE)

    def test_stale_revision_is_409(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        with self.assertRaises(TaskAlreadyDone):
            engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE, revision=ref.revision + 1)

    def test_mark_read_once(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        self.assertFalse(engine.mark_read(self.fresh(self.boss), ref))
        self.assertTrue(engine.mark_read(self.fresh(self.payer), ref))
        first = ref.recipients.get(user=self.payer).read_at
        self.assertIsNotNone(first)
        self.assertFalse(engine.mark_read(self.fresh(self.payer), ref))
        self.assertEqual(ref.recipients.get(user=self.payer).read_at, first)


class InstanceCloseTests(ReferralBase):
    def test_reject_closes_referrals(self):
        d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        engine.reject(self.fresh(self.lead), self.step_task(d), 'نادرست')
        ref.refresh_from_db()
        self.assertEqual((ref.is_open, ref.outcome), (False, WorkflowTask.CANCELLED))
        with self.assertRaises(WorkflowStateError):
            self.refer(self.su, inst, [self.payer])

    def test_cancel_closes_referrals(self):
        _d, inst = self.submit()
        ref = self.refer(self.su, inst, [self.payer])[0]
        engine.cancel(self.fresh(self.member), inst)
        ref.refresh_from_db()
        self.assertEqual(ref.outcome, WorkflowTask.CANCELLED)

    def test_return_keeps_referrals_and_resubmit_keeps_them(self):
        d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        engine.return_for_fix(self.fresh(self.lead), self.step_task(d), 'اصلاح')
        self.assertTrue(WorkflowTask.objects.get(pk=ref.pk).is_open)
        engine.submit(WF, d, self.member)
        self.assertTrue(WorkflowTask.objects.get(pk=ref.pk).is_open)
        engine.complete_referral(self.fresh(self.payer), ref, action=WorkflowStep.DONE)


class ReferRightsTests(ReferralBase):
    def test_non_member_target_rejected(self):
        _d, inst = self.submit()
        outsider = self.user('outsider', 'wf_lead', section=self.other_sec)
        with self.assertRaises(WorkflowError) as cm:
            self.refer(self.lead, inst, [outsider])
        self.assertEqual((cm.exception.code, cm.exception.status), ('target_not_member', 400))
        self.assertEqual(self.open_referrals(inst).count(), 0)

    def test_non_recipient_cannot_refer_and_self_target(self):
        _d, inst = self.submit()
        with self.assertRaises(WorkflowPermissionDenied):
            self.refer(self.boss, inst, [self.payer])
        with self.assertRaises(WorkflowError) as cm:
            self.refer(self.lead, inst, [self.lead])
        self.assertEqual(cm.exception.code, 'self_target')
        with self.assertRaises(WorkflowError):
            self.refer(self.lead, inst, [])

    def test_hook_allows_root_referral(self):
        _d, inst = self.submit()
        preg._CONTRIBUTIONS[f'can_refer:{inst.entity_kind}'] = [lambda user, eid: user.pk == self.boss.pk]
        tasks = self.refer(self.boss, inst, [self.payer])
        self.assertIsNone(tasks[0].parent_task_id)

    def test_hook_user_from_other_company_denied(self):
        _d, inst = self.submit()
        outsider = self.user('outsider2', 'wf_lead', section=self.other_sec)
        preg._CONTRIBUTIONS[f'can_refer:{inst.entity_kind}'] = [lambda user, eid: True]
        with self.assertRaises(WorkflowPermissionDenied):
            self.refer(outsider, inst, [self.payer])


class ReferralRecipientTests(ReferralBase):
    def test_role_change_keeps_target(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        SectionAssignment.objects.filter(user=self.payer).update(role='wf_member')
        recompute_open_tasks(company_ids={self.co.pk})
        self.assertEqual(self.recipients(ref), {self.payer.pk})

    def test_membership_loss_alerts_not_closes_then_regains(self):
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        SectionAssignment.objects.filter(user=self.payer).update(is_active=False)
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            recompute_open_tasks(company_ids={self.co.pk})
        ref.refresh_from_db()
        self.assertEqual((ref.is_open, ref.has_recipients), (True, False))
        self.assertEqual(self.recipients(ref), set())
        self.assertIn('superuser_alert', [e['kind'] for e in self.events])
        SectionAssignment.objects.filter(user=self.payer).update(is_active=True)
        recompute_open_tasks(company_ids={self.co.pk})
        ref.refresh_from_db()
        self.assertTrue(ref.has_recipients)
        self.assertEqual(self.recipients(ref), {self.payer.pk})

    def test_recompute_covers_completed_instance(self):
        d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.member])[0]
        for user in (self.lead, self.reviewer, self.boss, self.payer):
            engine.act(self.fresh(user), self.step_task(d))
        SectionAssignment.objects.filter(user=self.member).update(is_active=False)
        recompute_open_tasks(company_ids={self.co.pk})
        self.assertFalse(WorkflowTask.objects.get(pk=ref.pk).has_recipients)

    def test_substitute_with_and_without_flag(self):
        _d, inst = self.submit()
        helper = self.user('helper', 'wf_member')
        self.sub(self.payer, helper)
        ref = self.refer(self.lead, inst, [self.payer])[0]
        self.assertEqual(self.recipients(ref), {self.payer.pk, helper.pk})
        engine.set_allow_substitute(inst, False)
        self.assertEqual(self.recipients(ref), {self.payer.pk})
        self.assertEqual(self.recipients(self.step_task(_d)), {self.lead.pk})
        with self.assertRaises(WorkflowPermissionDenied):
            engine.complete_referral(self.fresh(helper), ref, action=WorkflowStep.DONE)
        engine.set_allow_substitute(inst, True)
        self.assertEqual(self.recipients(ref), {self.payer.pk, helper.pk})
        engine.complete_referral(self.fresh(helper), ref, action=WorkflowStep.DONE)
        step = WorkflowStep.objects.get(instance=inst, action=WorkflowStep.DONE)
        self.assertEqual((step.actor_id, step.on_behalf_of_id), (helper.pk, self.payer.pk))

    def test_flag_blocks_step_substitute(self):
        d, inst = self.submit()
        helper = self.user('helper2', 'wf_member')
        self.sub(self.lead, helper)
        recompute_open_tasks(company_ids={self.co.pk})
        self.assertIn(helper.pk, self.recipients(self.step_task(d)))
        engine.set_allow_substitute(inst, False)
        self.assertNotIn(helper.pk, self.recipients(self.step_task(d)))
        with self.assertRaises(WorkflowPermissionDenied):
            engine.act(self.fresh(helper), self.step_task(d))


class ReferralEscalationTests(ReferralBase):
    def test_escalation_goes_to_referrer(self):
        from workflow.scheduler import escalation_targets
        _d, inst = self.submit()
        ref = self.refer(self.lead, inst, [self.payer])[0]
        task = WorkflowTask.objects.select_related('instance__section__project').get(pk=ref.pk)
        self.assertEqual(escalation_targets([task]), {ref.pk: {self.lead.pk}})


class ReferralOnlyTests(ReferralBase):
    def setUp(self):
        super().setUp()
        self.specs.append(make_spec(key=REF_WF, steps=(), referral_only=True))
        reset_workflow_cache()

    def test_open_for_referral_idempotent_and_referable(self):
        d = self.doc()
        inst = engine.open_for_referral(REF_WF, d, self.member)
        self.assertEqual((inst.status, inst.step_keys), (WorkflowInstance.COMPLETED, []))
        self.assertEqual(engine.open_for_referral(REF_WF, d, self.member).pk, inst.pk)
        self.assertEqual(WorkflowTask.objects.filter(instance=inst).count(), 0)
        preg._CONTRIBUTIONS[f'can_refer:{inst.entity_kind}'] = [lambda user, eid: user.pk == self.member.pk]
        ref = self.refer(self.member, inst, [self.boss], kind=INFORM)[0]
        engine.complete_referral(self.fresh(self.boss), ref, action=WorkflowStep.SEEN)

    def test_submit_refused_for_referral_only(self):
        with self.assertRaises(WorkflowError) as cm:
            engine.submit(REF_WF, self.doc(), self.member)
        self.assertEqual(cm.exception.code, 'referral_only')
