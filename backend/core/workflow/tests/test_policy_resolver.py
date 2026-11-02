"""
تست‌های تفکیک و ارث‌بری سیاست گردش کار (WorkflowPolicy inheritance resolver)،
اعتبارسنجی‌های جدید StepSpec و مهاجرت داده‌ای 0003_role_policies.
"""
import dataclasses
import importlib
from unittest import mock

import django.apps
from django.core.exceptions import ImproperlyConfigured

from platform_core import registry as preg
from workflow.models import (
    WorkflowCompanySettings,
    WorkflowInstance,
    WorkflowPolicy,
    WorkflowStep,
    WorkflowTask,
)
from workflow.policy import (
    APPROVE,
    COMPANY,
    DEFAULT,
    NOTIFY_MODE,
    OWN,
    SKIP,
    WAIT,
    effective_policies,
    effective_policy,
    role_defaults,
)
from workflow.registry import (
    EXECUTE,
    REVIEW,
    StepSpec,
    reset_workflow_cache,
    validate_specs,
)

from .base import KIND, STEPS, WF, WorkflowTestBase, make_spec


class PolicyResolverTests(WorkflowTestBase):
    def setUp(self):
        super().setUp()
        self.patch_role_defaults([])

    def patch_role_defaults(self, defaults):
        p = mock.patch.dict(preg._CONTRIBUTIONS, {'workflow_role_defaults': list(defaults)})
        p.start()
        self.addCleanup(p.stop)

    def test_no_rows_uses_module_default(self):
        self.patch_role_defaults([{'wf_reviewer': 'skip'}])
        eff = effective_policy(self.co.pk, WF)
        step = StepSpec('review', 'بررسی', 'wf_reviewer', 'zz_wf_review', REVIEW)
        self.assertEqual(eff.missing_action(step), 'skip')
        self.assertEqual(eff.role_action('wf_reviewer', REVIEW), 'skip')
        self.assertEqual(eff.source('wf_reviewer'), 'default')

    def test_no_rows_no_module_default_uses_step_kind(self):
        eff = effective_policy(self.co.pk, WF)
        approve_step = StepSpec('s1', 'تأیید', 'wf_lead', 'zz_wf_approve', APPROVE)
        review_step = StepSpec('s2', 'بررسی', 'wf_reviewer', 'zz_wf_review', REVIEW)
        execute_step = StepSpec('s3', 'پرداخت', 'wf_payer', 'zz_wf_pay', EXECUTE)

        self.assertEqual(eff.missing_action(approve_step), 'skip')
        self.assertEqual(eff.role_action('wf_lead', APPROVE), 'skip')

        self.assertEqual(eff.missing_action(review_step), 'wait')
        self.assertEqual(eff.role_action('wf_reviewer', REVIEW), 'wait')

        self.assertEqual(eff.missing_action(execute_step), 'wait')
        self.assertEqual(eff.role_action('wf_payer', EXECUTE), 'wait')

        self.assertEqual(eff.source('wf_lead'), 'default')
        self.assertEqual(eff.source('wf_reviewer'), 'default')
        self.assertEqual(eff.source('wf_payer'), 'default')

    def test_company_row_overrides_module_default(self):
        self.patch_role_defaults([{'wf_boss': 'wait'}])
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            role_actions={'wf_boss': 'skip'},
        )
        eff_wf = effective_policy(self.co.pk, WF)
        self.assertEqual(eff_wf.role_action('wf_boss'), 'skip')
        self.assertEqual(eff_wf.source('wf_boss'), 'company')

        eff_co = effective_policy(self.co.pk, '')
        self.assertEqual(eff_co.role_action('wf_boss'), 'skip')
        self.assertEqual(eff_co.source('wf_boss'), 'own')

    def test_workflow_row_overrides_company_row(self):
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            role_actions={'wf_boss': 'skip'},
        )
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            role_actions={'wf_boss': 'wait'},
        )
        eff = effective_policy(self.co.pk, WF)
        self.assertEqual(eff.role_action('wf_boss'), 'wait')
        self.assertEqual(eff.source('wf_boss'), 'own')

    def test_role_missing_in_workflow_row_inherits_company(self):
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            role_actions={'wf_lead': 'wait'},
        )
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            role_actions={'wf_boss': 'wait'},
        )
        eff = effective_policy(self.co.pk, WF)
        self.assertEqual(eff.role_action('wf_lead'), 'wait')
        self.assertEqual(eff.source('wf_lead'), 'company')

    def test_invalid_stored_value_is_ignored(self):
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            role_actions={'wf_boss': 'skip'},
        )
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            role_actions={'wf_boss': 'maybe'},
        )
        eff = effective_policy(self.co.pk, WF)
        self.assertEqual(eff.role_action('wf_boss'), 'skip')
        self.assertEqual(eff.source('wf_boss'), 'company')

    def test_fixed_missing_action_wins(self):
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            role_actions={'wf_lead': 'skip', 'wf_reviewer': 'wait'},
        )
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            role_actions={'wf_lead': 'skip', 'wf_reviewer': 'wait'},
        )
        eff = effective_policy(self.co.pk, WF)

        step_fixed_wait = StepSpec('s1', 'تأیید', 'wf_lead', 'zz_wf_approve', APPROVE, fixed_missing_action='wait')
        self.assertEqual(eff.missing_action(step_fixed_wait), 'wait')

        step_fixed_skip = StepSpec('s2', 'بررسی', 'wf_reviewer', 'zz_wf_review', REVIEW, fixed_missing_action='skip')
        self.assertEqual(eff.missing_action(step_fixed_skip), 'skip')

    def test_creator_may_approve_own_inherits_and_overrides(self):
        # 1. no rows -> False, source 'default'
        eff = effective_policy(self.co.pk, WF)
        self.assertFalse(eff.creator_may_approve_own)
        self.assertEqual(eff.source('creator_may_approve_own'), 'default')

        # 2. company row True -> True (source 'company')
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            creator_may_approve_own=True,
        )
        eff = effective_policy(self.co.pk, WF)
        self.assertTrue(eff.creator_may_approve_own)
        self.assertEqual(eff.source('creator_may_approve_own'), 'company')

        # 3. add workflow row False -> False (source 'own')
        wf_row = WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            creator_may_approve_own=False,
        )
        eff = effective_policy(self.co.pk, WF)
        self.assertFalse(eff.creator_may_approve_own)
        self.assertEqual(eff.source('creator_may_approve_own'), 'own')

        # 4. workflow row None with company True -> True
        wf_row.creator_may_approve_own = None
        wf_row.save()
        eff = effective_policy(self.co.pk, WF)
        self.assertTrue(eff.creator_may_approve_own)
        self.assertEqual(eff.source('creator_may_approve_own'), 'company')

    def test_notify_mode_inherits(self):
        # 1. no rows -> 'role_assigners' and notify_user_ids == []
        eff = effective_policy(self.co.pk, WF)
        self.assertEqual(eff.notify_mode, 'role_assigners')
        self.assertEqual(eff.notify_user_ids, [])
        self.assertEqual(eff.source('notify_mode'), 'default')

        # 2. company row notify_mode 'users' with notify_user_ids [self.boss.pk]
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            notify_mode='users',
            notify_user_ids=[self.boss.pk],
        )
        eff = effective_policy(self.co.pk, WF)
        self.assertEqual(eff.notify_mode, 'users')
        self.assertEqual(eff.notify_user_ids, [self.boss.pk])
        self.assertEqual(eff.source('notify_mode'), 'company')

        # 3. workflow row notify_mode 'role_assigners' -> 'role_assigners'
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            notify_mode='role_assigners',
            notify_user_ids=[],
        )
        eff = effective_policy(self.co.pk, WF)
        self.assertEqual(eff.notify_mode, 'role_assigners')
        self.assertEqual(eff.notify_user_ids, [])
        self.assertEqual(eff.source('notify_mode'), 'own')

    def test_other_company_untouched(self):
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key='',
            role_actions={'wf_lead': 'wait'},
            creator_may_approve_own=True,
        )
        WorkflowPolicy.objects.create(
            company=self.co,
            workflow_key=WF,
            role_actions={'wf_boss': 'wait'},
        )
        policies = effective_policies([(self.co2.pk, WF)])
        eff2 = policies[(self.co2.pk, WF)]
        self.assertEqual(eff2.source('wf_lead'), 'default')
        self.assertEqual(eff2.source('wf_boss'), 'default')
        self.assertEqual(eff2.role_action('wf_lead', APPROVE), 'skip')
        self.assertFalse(eff2.creator_may_approve_own)

    def test_one_query_for_many_pairs(self):
        WorkflowPolicy.objects.create(company=self.co, workflow_key='')
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF)
        WorkflowPolicy.objects.create(company=self.co2, workflow_key='')
        WorkflowPolicy.objects.create(company=self.co2, workflow_key=WF)

        pairs = [(self.co.pk, WF), (self.co.pk, ''), (self.co2.pk, WF), (self.co2.pk, 'other')]
        with self.assertNumQueries(1):
            res = effective_policies(pairs)
        self.assertEqual(set(res.keys()), set(pairs))

    def test_effective_policy_without_company(self):
        with self.assertNumQueries(0):
            eff = effective_policy(None, WF)
        self.assertEqual(eff.role_action('wf_lead', APPROVE), 'skip')
        self.assertEqual(eff.role_action('wf_reviewer', REVIEW), 'wait')
        self.assertEqual(eff.source('wf_lead'), 'default')
        self.assertFalse(eff.creator_may_approve_own)

    def test_module_default_conflict_raises(self):
        self.patch_role_defaults([{'wf_boss': 'skip'}, {'wf_boss': 'wait'}])
        with self.assertRaises(ImproperlyConfigured):
            role_defaults()

        self.patch_role_defaults([{'wf_boss': 'x'}])
        with self.assertRaises(ImproperlyConfigured):
            role_defaults()

    def test_registry_rejects_payment_on_non_execute(self):
        step = StepSpec('s1', 'تأیید', 'wf_lead', 'zz_wf_approve', APPROVE, payment=True)
        spec = make_spec(steps=(step,))
        with self.assertRaises(ImproperlyConfigured):
            validate_specs([spec])

    def test_registry_rejects_payment_not_last(self):
        s1 = StepSpec('pay', 'پرداخت', 'wf_payer', 'zz_wf_pay', EXECUTE, payment=True)
        s2 = StepSpec('boss_ok', 'تأیید رئیس', 'wf_boss', 'zz_wf_approve', APPROVE)
        spec = make_spec(steps=(s1, s2))
        with self.assertRaises(ImproperlyConfigured):
            validate_specs([spec])

    def test_registry_accepts_payment_last_execute(self):
        pay_step = dataclasses.replace(STEPS[-1], payment=True)
        new_steps = STEPS[:-1] + (pay_step,)
        spec = make_spec(steps=new_steps)
        res = validate_specs([spec])
        self.assertIn(spec.key, res)
        self.assertIs(res[spec.key], spec)

    def test_registry_rejects_bad_fixed_missing_action(self):
        bad_step = dataclasses.replace(STEPS[0], fixed_missing_action='maybe')
        with self.assertRaises(ImproperlyConfigured):
            validate_specs([make_spec(steps=(bad_step,))])

        wait_step = dataclasses.replace(STEPS[0], fixed_missing_action='wait')
        res_wait = validate_specs([make_spec(steps=(wait_step,))])
        self.assertIn(WF, res_wait)

        skip_step = dataclasses.replace(STEPS[0], fixed_missing_action='skip')
        res_skip = validate_specs([make_spec(steps=(skip_step,))])
        self.assertIn(WF, res_skip)

    def test_migration_copies_self_approval(self):
        mod = importlib.import_module('workflow.migrations.0003_role_policies')
        self.specs[:] = [make_spec(company_self_approval=True)]
        reset_workflow_cache()

        s1 = WorkflowCompanySettings.objects.create(company=self.co, creator_may_approve_own=True)
        s2 = WorkflowCompanySettings.objects.create(company=self.co2, creator_may_approve_own=False)

        mod.copy_self_approval(django.apps.apps, None)
        mod.copy_self_approval(django.apps.apps, None)

        policies = list(WorkflowPolicy.objects.all())
        self.assertEqual(len(policies), 1)
        p = policies[0]
        self.assertEqual(p.company_id, self.co.pk)
        self.assertEqual(p.workflow_key, WF)
        self.assertTrue(p.creator_may_approve_own)

        self.assertFalse(WorkflowPolicy.objects.filter(company=self.co2).exists())

        s1.refresh_from_db()
        s2.refresh_from_db()
        self.assertTrue(s1.creator_may_approve_own)
        self.assertFalse(s2.creator_may_approve_own)

    def test_migration_marks_forced_tasks(self):
        mod = importlib.import_module('workflow.migrations.0003_role_policies')
        keys = [s.key for s in STEPS]

        # instance 1: open task on 'review' plus WorkflowStep(instance, task=task1, action='auto', from_step='', to_step='review')
        inst1 = WorkflowInstance.objects.create(
            workflow_key=WF, entity_kind=KIND, entity_id=101, company=self.co,
            step_keys=keys, current_step='review',
        )
        task1 = WorkflowTask.objects.create(
            instance=inst1, step_key='review', step_kind=REVIEW, role='wf_reviewer',
            permission='zz_wf_review', is_open=True, track='step',
        )
        WorkflowStep.objects.create(
            instance=inst1, task=task1, action='auto', from_step='', to_step='review',
        )

        # instance 2: open task on 'review' with only WorkflowStep(action='submit', task=task2)
        inst2 = WorkflowInstance.objects.create(
            workflow_key=WF, entity_kind=KIND, entity_id=102, company=self.co,
            step_keys=keys, current_step='review',
        )
        task2 = WorkflowTask.objects.create(
            instance=inst2, step_key='review', step_kind=REVIEW, role='wf_reviewer',
            permission='zz_wf_review', is_open=True, track='step',
        )
        WorkflowStep.objects.create(
            instance=inst2, task=task2, action='submit', from_step='', to_step='review',
        )

        # instance 3: open task on 'pay' plus WorkflowStep(action='auto', task=task3, from_step='old_removed', to_step='pay')
        inst3 = WorkflowInstance.objects.create(
            workflow_key=WF, entity_kind=KIND, entity_id=103, company=self.co,
            step_keys=keys, current_step='pay',
        )
        task3 = WorkflowTask.objects.create(
            instance=inst3, step_key='pay', step_kind=EXECUTE, role='wf_payer',
            permission='zz_wf_pay', is_open=True, track='step',
        )
        WorkflowStep.objects.create(
            instance=inst3, task=task3, action='auto', from_step='old_removed', to_step='pay',
        )

        # instance 4: closed task (is_open=False) plus an auto row with empty from_step
        inst4 = WorkflowInstance.objects.create(
            workflow_key=WF, entity_kind=KIND, entity_id=104, company=self.co,
            step_keys=keys, current_step='review',
        )
        task4 = WorkflowTask.objects.create(
            instance=inst4, step_key='review', step_kind=REVIEW, role='wf_reviewer',
            permission='zz_wf_review', is_open=False, track='step',
        )
        WorkflowStep.objects.create(
            instance=inst4, task=task4, action='auto', from_step='', to_step='review',
        )

        mod.mark_forced_tasks(django.apps.apps, None)

        task1.refresh_from_db()
        task2.refresh_from_db()
        task3.refresh_from_db()
        task4.refresh_from_db()

        self.assertTrue(task1.forced)
        self.assertFalse(task2.forced)
        self.assertTrue(task3.forced)
        self.assertFalse(task4.forced)
