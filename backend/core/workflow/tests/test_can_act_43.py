"""
طرح ۴.۳ (د۲ و د۵): قلاب پیش از اقدام can_act:<entity_kind>، open_at_step تکرارپذیر و submit با restart_closed.
"""
from unittest import mock

import platform_core.registry as preg
from workflow import engine
from workflow.errors import WorkflowError, WorkflowStateError
from workflow.models import WorkflowInstance, WorkflowStep, WorkflowTask

from .base import KIND, WF
from .test_api import ApiBase

BLOCK_MSG = 'blocked by module gate'


class CanActHookTests(ApiBase):
    def setUp(self):
        super().setUp()
        self.calls = []

        def hook(user, obj, task, action):
            self.calls.append((user.pk, obj.pk, task.step_key, action))
            return BLOCK_MSG if action == 'act' and task.step_key == 'review' else None

        patcher = mock.patch.dict(preg._CONTRIBUTIONS, {f'can_act:{KIND}': [hook]})
        patcher.start()
        self.addCleanup(patcher.stop)

    def _at_review(self):
        d, _ = self.submit()
        engine.act(self.lead, self.task(d), obj=d)
        task = self.task(d)
        self.assertEqual(task.step_key, 'review')
        return d, task

    def test_engine_act_blocked_inside_lock(self):
        d, task = self._at_review()
        with self.assertRaises(WorkflowError) as ctx:
            engine.act(self.reviewer, task, obj=d)
        self.assertEqual((ctx.exception.code, ctx.exception.status, ctx.exception.message_fa),
                         ('action_blocked', 400, BLOCK_MSG))
        task.refresh_from_db()
        self.assertTrue(task.is_open)
        self.assertEqual(WorkflowInstance.objects.get(pk=task.instance_id).current_step, 'review')
        self.assertIn((self.reviewer.pk, d.pk, 'review', 'act'), self.calls)

    def test_hook_not_called_for_unauthorized_user(self):
        d, task = self._at_review()
        self.calls.clear()
        with self.assertRaises(WorkflowError) as ctx:
            engine.act(self.member, task, obj=d)
        self.assertNotEqual(ctx.exception.code, 'action_blocked')
        self.assertEqual(self.calls, [])

    def test_return_is_free_and_other_steps_pass(self):
        d, task = self._at_review()
        engine.return_for_fix(self.reviewer, task, 'fix it', obj=d)
        self.assertEqual(WorkflowInstance.objects.get(pk=task.instance_id).status, WorkflowInstance.RETURNED)
        self.assertIn((self.reviewer.pk, d.pk, 'review', 'return'), self.calls)

    def test_my_tasks_api_is_gated_too(self):
        _d, task = self._at_review()
        r = self.do(self.reviewer, task)
        self.assertEqual((r.status_code, r.data['code'], r.data['detail']), (400, 'action_blocked', BLOCK_MSG))


class OpenAtStepAndRestartTests(ApiBase):
    def test_open_at_step_is_idempotent(self):
        d = self.doc()
        task = engine.open_at_step(WF, d, self.member, 'review')
        self.assertIsNotNone(task)
        self.assertEqual((task.step_key, task.is_open), ('review', True))
        instance = WorkflowInstance.objects.get(pk=task.instance_id)
        self.assertEqual((instance.status, instance.created_by_id), (WorkflowInstance.IN_PROGRESS, self.member.pk))
        self.assertEqual(d.states, ['review'])
        self.assertTrue(WorkflowStep.objects.filter(instance=instance, action=WorkflowStep.AUTO).exists())
        self.assertIsNone(engine.open_at_step(WF, d, self.member, 'review'))
        self.assertEqual(WorkflowInstance.objects.filter(entity_kind=KIND, entity_id=d.pk).count(), 1)
        self.assertEqual(WorkflowTask.objects.filter(instance=instance).count(), 1)
        # the creator never approves their own record, even on a legacy-opened instance
        engine.act(self.reviewer, task, obj=d)
        self.assertEqual(self.task(d).step_key, 'boss_ok')

    def test_restart_closed(self):
        d, _ = self.submit()
        engine.reject(self.lead, self.task(d), 'no', obj=d)
        with self.assertRaises(WorkflowStateError):
            engine.submit(WF, d, self.member)
        instance = engine.submit(WF, d, self.member, restart_closed=True)
        self.assertEqual((instance.status, instance.current_step), (WorkflowInstance.IN_PROGRESS, 'lead_ok'))
