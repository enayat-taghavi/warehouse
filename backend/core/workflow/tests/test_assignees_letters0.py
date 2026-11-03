"""
ل-۰ طرح نامه‌ها: مرحلهٔ با گیرندهٔ انتخاب‌شده روی سند (StepSpec.assignees) — کار برای نفر انتخاب‌شده با
target_user، چند امضاکننده به ترتیب، عودت و شروع دوباره از نفر اول، پایداری در برابر تغییر نقش، خروج از شرکت
(انتظار یا رد شدن طبق تنظیم)، و اجرای on_state_change پایانی در همان تراکنش اقدام.
"""
import datetime

from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone

from companies.models import SectionAssignment
from workflow import engine
from workflow.errors import WorkflowPermissionDenied
from workflow.models import WorkflowInstance, WorkflowStep, WorkflowSubstitute, WorkflowTask
from workflow.recompute import recompute_open_tasks
from workflow.registry import APPROVE, COMPLETED, EXECUTE, REVIEW, StepSpec, reset_workflow_cache, validate_specs

from .base import WorkflowTestBase, make_spec

SIGN_WF = 'zz_wf_sign'
SIGN_SKIP_WF = 'zz_wf_sign_skip'


def signers_of(obj):
    return list(obj.signers)


def record_or_fail(obj, state, instance):
    if getattr(obj, 'fail_on', None) == state:
        raise RuntimeError('صدور شماره شکست خورد')
    obj.states.append(state)


def sign_step(missing):
    # نقش و مجوز مرحله فقط برچسب‌اند؛ امضاکننده‌ها نه این نقش را دارند و نه این مجوز را
    return StepSpec('sign', 'امضا', 'wf_boss', 'zz_wf_approve', APPROVE, assignees=signers_of,
                    fixed_missing_action=missing)


class AssigneeBase(WorkflowTestBase):
    def setUp(self):
        super().setUp()
        self.specs.append(make_spec(
            key=SIGN_WF, steps=(sign_step('wait'), StepSpec('review', 'بررسی', 'wf_reviewer', 'zz_wf_review', REVIEW)),
            on_state_change=record_or_fail))
        self.specs.append(make_spec(key=SIGN_SKIP_WF, steps=(sign_step('skip'),), on_state_change=record_or_fail))
        reset_workflow_cache()

    def submit(self, signers, wf=SIGN_WF):
        d = self.doc()
        d.signers = [u.pk for u in signers]
        inst = engine.submit(wf, d, self.fresh(self.member))
        return d, inst

    def task(self, d, wf=SIGN_WF):
        return engine.open_task(wf, d.pk)

    def act(self, user, d, wf=SIGN_WF):
        return engine.act(self.fresh(user), self.task(d, wf), obj=d)


class ChosenAssigneeTests(AssigneeBase):
    def test_task_goes_only_to_chosen_person(self):
        d, inst = self.submit([self.payer])
        task = self.task(d)
        self.assertEqual((task.step_key, task.target_user_id, task.track), ('sign', self.payer.pk, 'step'))
        self.assertTrue(task.has_recipients)
        self.assertEqual(self.recipients(task), {self.payer.pk})
        # دارندهٔ نقش و مجوز مرحله (رئیس و سرپرست) اقدام نمی‌کنند؛ فقط نفر انتخاب‌شده
        for other in (self.boss, self.lead, self.reviewer):
            self.assertFalse(engine.can_act(self.fresh(other), task))
            with self.assertRaises(WorkflowPermissionDenied):
                engine.act(self.fresh(other), task, obj=d)
        self.assertTrue(engine.can_act(self.fresh(self.payer), task))
        self.assertTrue(engine.task_grants_view(self.payer, 'zz_wf_doc', d.pk))

    def test_signers_in_order_then_next_step(self):
        d, inst = self.submit([self.payer, self.lead, self.boss])
        order = []
        for signer in (self.payer, self.lead, self.boss):
            task = self.task(d)
            order.append(task.target_user_id)
            self.assertFalse(engine.can_act(self.fresh(self.boss if signer != self.boss else self.payer), task))
            self.act(signer, d)
        self.assertEqual(order, [self.payer.pk, self.lead.pk, self.boss.pk])
        nxt = self.task(d)
        self.assertEqual((nxt.step_key, nxt.target_user_id), ('review', None))
        self.assertEqual(self.recipients(nxt), {self.reviewer.pk})
        acts = list(WorkflowStep.objects.filter(instance=inst, action=WorkflowStep.ACT).order_by('pk')
                    .values_list('actor_id', 'from_step', 'to_step'))
        self.assertEqual(acts, [(self.payer.pk, 'sign', 'sign'), (self.lead.pk, 'sign', 'sign'),
                                (self.boss.pk, 'sign', 'review')])
        self.act(self.reviewer, d)
        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertEqual(d.states[-1], COMPLETED)

    def test_duplicate_signers_sign_once(self):
        d, _inst = self.submit([self.payer, self.payer, self.lead])
        self.act(self.payer, d)
        self.assertEqual(self.task(d).target_user_id, self.lead.pk)

    def test_creator_chosen_as_signer_may_sign(self):
        d, _inst = self.submit([self.member])
        task = self.task(d)
        self.assertEqual(task.target_user_id, self.member.pk)
        self.assertTrue(engine.can_act(self.fresh(self.member), task))
        self.act(self.member, d)
        self.assertEqual(self.task(d).step_key, 'review')

    def test_no_signers_skips_step(self):
        d, inst = self.submit([])
        self.assertEqual(self.task(d).step_key, 'review')
        skipped = WorkflowStep.objects.get(instance=inst, action=WorkflowStep.SUBMIT).skipped
        self.assertEqual(skipped, [{'step': 'sign', 'reason': engine.SKIP_NO_RECIPIENT}])

    def test_return_for_fix_restarts_from_first_signer(self):
        d, inst = self.submit([self.payer, self.lead])
        self.act(self.payer, d)
        engine.return_for_fix(self.fresh(self.lead), self.task(d), 'اصلاح متن', obj=d)
        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.RETURNED)
        self.assertIsNone(self.task(d))
        engine.submit(SIGN_WF, d, self.fresh(self.member))
        self.assertEqual(self.task(d).target_user_id, self.payer.pk)
        self.act(self.payer, d)
        self.assertEqual(self.task(d).target_user_id, self.lead.pk)

    def test_substitute_follows_allow_substitute(self):
        today = timezone.localdate()
        WorkflowSubstitute.objects.create(principal=self.payer, substitute=self.reviewer, company=self.co,
                                          start_date=today, end_date=today + datetime.timedelta(days=3))
        d, inst = self.submit([self.payer])
        task = self.task(d)
        self.assertTrue(engine.can_act(self.fresh(self.reviewer), task))
        engine.set_allow_substitute(inst, False)
        self.assertFalse(engine.can_act(self.fresh(self.reviewer), self.task(d)))
        engine.set_allow_substitute(inst, True)
        engine.act(self.fresh(self.reviewer), self.task(d), obj=d)
        step = WorkflowStep.objects.filter(instance=inst, action=WorkflowStep.ACT).get()
        self.assertEqual((step.actor_id, step.on_behalf_of_id), (self.reviewer.pk, self.payer.pk))


class AssigneeRecomputeTests(AssigneeBase):
    def test_role_change_keeps_task_with_chosen_person(self):
        d, _inst = self.submit([self.payer])
        task = self.task(d)
        SectionAssignment.objects.filter(user=self.payer).update(role='wf_member')
        # کسی که حالا نقش مرحله را دارد هم کار را نمی‌گیرد
        self.assign(self.user('newboss'), 'wf_boss')
        recompute_open_tasks(all_tasks=True)
        task.refresh_from_db()
        self.assertTrue(task.is_open and task.has_recipients)
        self.assertEqual((task.target_user_id, self.recipients(task)), (self.payer.pk, {self.payer.pk}))

    def test_left_company_waits_then_regains(self):
        d, _inst = self.submit([self.payer, self.lead])
        task = self.task(d)
        SectionAssignment.objects.filter(user=self.payer).update(is_active=False)
        recompute_open_tasks(all_tasks=True)
        task.refresh_from_db()
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, WorkflowTask.WAIT_NO_HOLDER)
        self.assertEqual(self.recipients(task), set())
        self.assertEqual(task.target_user_id, self.payer.pk)
        self.assertFalse(engine.can_act(self.fresh(self.payer), task))
        SectionAssignment.objects.filter(user=self.payer).update(is_active=True)
        recompute_open_tasks(all_tasks=True)
        task.refresh_from_db()
        self.assertTrue(task.has_recipients)
        self.assertEqual(self.recipients(task), {self.payer.pk})

    def test_left_company_with_skip_moves_to_next_signer(self):
        d, inst = self.submit([self.payer, self.lead], wf=SIGN_SKIP_WF)
        first = self.task(d, SIGN_SKIP_WF)
        SectionAssignment.objects.filter(user=self.payer).update(is_active=False)
        recompute_open_tasks(all_tasks=True)
        first.refresh_from_db()
        self.assertEqual((first.is_open, first.outcome), (False, WorkflowTask.SKIPPED))
        nxt = self.task(d, SIGN_SKIP_WF)
        self.assertEqual((nxt.step_key, nxt.target_user_id), ('sign', self.lead.pk))
        self.act(self.lead, d, SIGN_SKIP_WF)
        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)


class AssigneeTransactionTests(AssigneeBase):
    def test_final_on_state_change_runs_in_action_transaction(self):
        d, inst = self.submit([self.payer], wf=SIGN_SKIP_WF)
        d.fail_on = COMPLETED
        with self.assertRaises(RuntimeError):
            self.act(self.payer, d, SIGN_SKIP_WF)
        # خطای on_state_change پایانی کل اقدام را برمی‌گرداند: کار باز و نمونه در جریان می‌ماند
        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.IN_PROGRESS)
        self.assertEqual(self.task(d, SIGN_SKIP_WF).target_user_id, self.payer.pk)
        self.assertFalse(WorkflowStep.objects.filter(instance=inst, action=WorkflowStep.ACT).exists())
        d.fail_on = None
        self.act(self.payer, d, SIGN_SKIP_WF)
        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)


class AssigneeRegistryTests(AssigneeBase):
    def test_validation(self):
        ok = make_spec(key='zz_ok', steps=(sign_step(None),))
        self.assertIn('zz_ok', validate_specs([ok]))
        bad = (
            StepSpec('s', 'امضا', 'wf_boss', 'zz_wf_approve', APPROVE, assignees=[1, 2]),
            StepSpec('s', 'اجرا', 'wf_payer', 'zz_wf_pay', EXECUTE, assignees=signers_of, creator_may_act=True),
            StepSpec('s', 'اجرا', 'wf_payer', 'zz_wf_pay', EXECUTE, assignees=signers_of, payment=True),
            StepSpec('s', 'بررسی', 'wf_reviewer', 'zz_wf_review', REVIEW, assignees=signers_of,
                     skip_when_creator_only=True),
        )
        for step in bad:
            with self.subTest(step=step), self.assertRaises(ImproperlyConfigured):
                validate_specs([make_spec(key='zz_bad', steps=(step,))])

    def test_creator_level_rule_does_not_skip_chosen_signers(self):
        # ثبت‌کنندهٔ هم‌رتبه یا بالاتر از نقش برچسب مرحله، امضای انتخاب‌شده را رد نمی‌کند
        d = self.doc()
        d.signers = [self.payer.pk]
        inst = engine.submit(SIGN_WF, d, self.fresh(self.boss))
        self.assertEqual(inst.skip_plan, {})
        self.assertEqual(self.task(d).target_user_id, self.payer.pk)
