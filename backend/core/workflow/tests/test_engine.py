"""
طرح ۲.۳-الف: قاعده‌های موتور گردش کار — ت۳، ت۵، ت۶ (هر بند جدا)، ت۸، ت۱۰، ت۱۱، ت۱۳، ت۱۵ و ت۱۶.
"""
import datetime
from decimal import Decimal

from django.utils import timezone

from accounts.scoped_permissions import section_permission_holder_ids
from workflow import engine, events
from workflow.errors import ReasonRequired, TaskAlreadyDone, WorkflowError, WorkflowPermissionDenied
from workflow.models import (
    WorkflowInstance, WorkflowStep, WorkflowSubstitute, WorkflowTask, WorkflowTaskRecipient, WorkflowThreshold,
)
from workflow.registry import reset_workflow_cache

from .base import STEPS, WF, WorkflowTestBase, make_spec


class EngineBase(WorkflowTestBase):
    def submit(self, user=None, d=None, **kw):
        d = d or self.doc(**kw)
        inst = engine.submit(WF, d, user or self.member)
        return d, inst

    def task(self, d):
        return engine.open_task(WF, d.pk)

    def act(self, user, d, **kw):
        return engine.act(self.fresh(user), self.task(d), **kw)

    def last_step(self, inst):
        return WorkflowStep.objects.filter(instance=inst).order_by('-id').first()


class FullFlowTests(EngineBase):
    def test_member_to_lead_reviewer_boss_payer(self):
        d, inst = self.submit()
        self.assertEqual(self.task(d).step_key, 'lead_ok')
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})
        for actor, nxt in ((self.lead, 'review'), (self.reviewer, 'boss_ok'), (self.boss, 'pay')):
            self.act(actor, d)
            self.assertEqual(self.task(d).step_key, nxt)
        self.act(self.payer, d)
        inst.refresh_from_db()
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertIsNone(self.task(d))
        self.assertEqual(d.states, ['lead_ok', 'review', 'boss_ok', 'pay', 'completed'])
        self.assertEqual(list(inst.steps.values_list('action', flat=True)), ['submit', 'act', 'act', 'act', 'act'])
        self.assertFalse(WorkflowTaskRecipient.objects.filter(task__instance=inst).exists())
        self.assertEqual(inst.summary, {'title': f'سند {d.pk}', 'amount': '100'})

    def test_section_inheritance_and_other_section_excluded(self):
        # سرپرست سطح شرکت دریافت‌کننده است؛ سرپرست بخش دیگر یا شرکت دیگر نه
        company_lead = self.user('clead', 'wf_lead', company=self.co)
        self.user('lead_sec2', 'wf_lead', section=self.sec2)
        self.user('lead_other', 'wf_lead', section=self.other_sec)
        d, _ = self.submit()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk, company_lead.pk})

    def test_role_without_permission_is_not_recipient(self):
        self.override(self.lead, 'zz_wf_approve', 'remove')
        extra = self.user('lead2', 'wf_lead')
        d, _ = self.submit()
        self.assertEqual(self.recipients(self.task(d)), {extra.pk})


class Rule1ThresholdTests(EngineBase):
    def test_amount_under_company_threshold_skips_approve(self):
        WorkflowThreshold.objects.create(workflow_key=WF, step_key='lead_ok', company=self.co, amount=Decimal('1000'))
        d, inst = self.submit(amount=Decimal('500'))
        self.assertEqual(self.task(d).step_key, 'review')
        self.assertEqual(self.last_step(inst).skipped, [{'step': 'lead_ok', 'reason': 'threshold'}])

    def test_section_threshold_wins_over_company(self):
        WorkflowThreshold.objects.create(workflow_key=WF, step_key='lead_ok', company=self.co, amount=Decimal('1000'))
        WorkflowThreshold.objects.create(workflow_key=WF, step_key='lead_ok', section=self.sec, amount=Decimal('100'))
        d, _ = self.submit(amount=Decimal('500'))
        self.assertEqual(self.task(d).step_key, 'lead_ok')

    def test_threshold_never_skips_review(self):
        WorkflowThreshold.objects.create(workflow_key=WF, step_key='review', company=self.co, amount=Decimal('1000'))
        d, _ = self.submit(amount=Decimal('5'))
        self.act(self.lead, d)
        self.assertEqual(self.task(d).step_key, 'review')

    def test_resubmit_with_higher_amount_reaches_step(self):
        WorkflowThreshold.objects.create(workflow_key=WF, step_key='lead_ok', company=self.co, amount=Decimal('1000'))
        d, inst = self.submit(amount=Decimal('500'))
        engine.return_for_fix(self.fresh(self.reviewer), self.task(d), 'مبلغ اشتباه است')
        d.amount = Decimal('5000')
        inst = engine.submit(WF, d, self.member)
        self.assertEqual(self.task(d).step_key, 'lead_ok')
        self.assertEqual(inst.skip_plan, {})
        self.assertFalse(inst.others_acted)


class Rule2CreatorLevelTests(EngineBase):
    def test_lower_rank_step_skipped(self):
        d, inst = self.submit(user=self.reviewer)
        # سرپرست (۲۰) زیر بررسی‌کننده (۳۰) است؛ بررسی خود ثبت‌کننده را نمی‌گیرد و منتظر می‌ماند
        self.assertEqual(inst.skip_plan, {'lead_ok': 'creator_level'})

    def test_equal_rank_skipped_when_higher_approve_follows(self):
        lead2 = self.user('lead2', 'wf_lead')
        d, inst = self.submit(user=self.lead)
        self.assertEqual(inst.skip_plan, {'lead_ok': 'creator_level'})
        self.assertEqual(self.task(d).step_key, 'review')
        self.assertNotIn(lead2.pk, self.recipients(self.task(d)))

    def test_equal_rank_kept_without_higher_later_second_approval(self):
        boss2 = self.user('boss2', 'wf_boss')
        d, inst = self.submit(user=self.boss)
        self.assertEqual(inst.skip_plan, {'lead_ok': 'creator_level'})
        self.act(self.reviewer, d)
        task = self.task(d)
        self.assertEqual(task.step_key, 'boss_ok')
        self.assertEqual(self.recipients(task), {boss2.pk})

    def test_equal_rank_with_higher_later_skipped_by_threshold_is_kept(self):
        WorkflowThreshold.objects.create(workflow_key=WF, step_key='boss_ok', company=self.co, amount=Decimal('1000'))
        lead2 = self.user('lead2', 'wf_lead')
        d, inst = self.submit(user=self.lead, amount=Decimal('10'))
        self.assertEqual(inst.skip_plan, {'boss_ok': 'threshold'})
        self.assertEqual(self.recipients(self.task(d)), {lead2.pk})

    def test_payer_rank_creator_still_needs_boss(self):
        # ت۵: خزانه‌دار/پرداخت‌کننده (۳۰) پایین‌تر از رئیس (۴۰) است
        d, inst = self.submit(user=self.payer)
        self.assertNotIn('boss_ok', inst.skip_plan)
        self.act(self.reviewer, d)
        self.assertEqual(self.task(d).step_key, 'boss_ok')
        self.act(self.boss, d)
        task = self.task(d)
        self.assertEqual((task.step_key, task.has_recipients), ('pay', False))

    def test_superuser_without_assignment_has_rank_zero(self):
        d, inst = self.submit(user=self.su)
        self.assertEqual((inst.creator_rank, inst.skip_plan), (0, {}))
        self.assertEqual(self.task(d).step_key, 'lead_ok')


class Rule3RecipientTests(EngineBase):
    def test_approve_without_holders_skipped_no_recipient(self):
        self.lead.section_assignments.update(is_active=False)
        d, inst = self.submit()
        self.assertEqual(self.task(d).step_key, 'review')
        self.assertEqual(self.last_step(inst).skipped, [{'step': 'lead_ok', 'reason': 'no_recipient'}])

    def test_only_holder_is_creator_no_second_approval(self):
        d, inst = self.submit(user=self.boss)
        self.act(self.reviewer, d)
        task = self.task(d)
        self.assertEqual(task.step_key, 'pay')
        self.assertEqual(self.last_step(inst).skipped, [{'step': 'boss_ok', 'reason': 'no_second_approval'}])

    def test_review_without_recipient_waits_and_alerts(self):
        self.reviewer.section_assignments.update(is_active=False)
        d, inst = self.submit()
        with self.captureOnCommitCallbacks(execute=True):
            self.act(self.lead, d)
        task = self.task(d)
        self.assertEqual((task.step_key, task.has_recipients), ('review', False))
        self.assertIn('superuser_alert', [e['kind'] for e in self.events])
        engine.act(self.fresh(self.su), task)
        self.assertTrue(self.last_step(inst).as_superuser)
        self.assertEqual(self.task(d).step_key, 'boss_ok')

    def test_creator_excluded_from_review_second_reviewer_gets_it(self):
        reviewer2 = self.user('reviewer2', 'wf_reviewer')
        d, _ = self.submit(user=self.reviewer)
        task = self.task(d)
        self.assertEqual((task.step_key, self.recipients(task)), ('review', {reviewer2.pk}))

    def test_single_reviewer_creator_waits(self):
        d, _ = self.submit(user=self.reviewer)
        task = self.task(d)
        self.assertEqual((task.step_key, task.has_recipients), ('review', False))


class ActionRuleTests(EngineBase):
    def test_reason_required_for_return_and_reject(self):
        d, _ = self.submit()
        with self.assertRaises(ReasonRequired):
            engine.return_for_fix(self.fresh(self.lead), self.task(d), '  ')
        with self.assertRaises(ReasonRequired):
            engine.reject(self.fresh(self.lead), self.task(d), '')

    def test_reject_is_terminal(self):
        d, inst = self.submit()
        engine.reject(self.fresh(self.lead), self.task(d), 'نامعتبر')
        inst.refresh_from_db()
        self.assertEqual(inst.status, 'rejected')
        self.assertEqual(d.states[-1], 'rejected')
        with self.assertRaises(WorkflowError) as cm:
            engine.submit(WF, d, self.member)
        self.assertEqual(cm.exception.code, 'already_in_progress')

    def test_return_makes_restartable(self):
        d, inst = self.submit()
        engine.return_for_fix(self.fresh(self.lead), self.task(d), 'اصلاح شود')
        inst.refresh_from_db()
        self.assertEqual((inst.status, inst.current_step), ('returned', ''))
        engine.submit(WF, d, self.member)
        self.assertEqual(self.task(d).step_key, 'lead_ok')

    def test_action_not_allowed_on_step(self):
        d, _ = self.submit(user=self.su)
        for u in (self.lead, self.reviewer, self.boss):
            self.act(u, d)
        with self.assertRaises(WorkflowPermissionDenied) as cm:
            engine.reject(self.fresh(self.payer), self.task(d), 'دلیل')
        self.assertEqual(cm.exception.code, 'action_not_allowed')

    def test_not_recipient_and_self_approval(self):
        d, _ = self.submit()
        with self.assertRaises(WorkflowPermissionDenied) as cm:
            self.act(self.reviewer, d)
        self.assertEqual(cm.exception.code, 'not_recipient')
        self.assign(self.member, 'wf_lead')
        with self.assertRaises(WorkflowPermissionDenied) as cm:
            self.act(self.member, d)
        self.assertEqual(cm.exception.code, 'self_approval')

    def test_superuser_acts_but_not_on_own_and_is_not_recipient(self):
        d, _ = self.submit()
        self.assertNotIn(self.su.pk, self.recipients(self.task(d)))
        self.act(self.su, d)
        d2, _ = self.submit(user=self.su)
        with self.assertRaises(WorkflowPermissionDenied) as cm:
            self.act(self.su, d2)
        self.assertEqual(cm.exception.code, 'self_approval')

    def test_cancel_rules(self):
        d, inst = self.submit()
        with self.assertRaises(WorkflowError) as cm:
            engine.cancel(self.fresh(self.su), inst)
        self.assertEqual(cm.exception.code, 'cancel_not_allowed')
        engine.cancel(self.fresh(self.member), inst)
        inst.refresh_from_db()
        self.assertEqual(inst.status, 'cancelled')
        self.assertEqual(WorkflowTask.objects.get(instance=inst).outcome, 'cancelled')
        self.assertEqual(d.states[-1], 'cancelled')
        engine.submit(WF, d, self.member)
        self.act(self.lead, d)
        with self.assertRaises(WorkflowError) as cm:
            engine.cancel(self.fresh(self.member), inst)
        self.assertEqual((cm.exception.code, cm.exception.status), ('cancel_not_allowed', 409))

    def test_cancel_allowed_after_automatic_skip_only(self):
        self.lead.section_assignments.update(is_active=False)
        d, inst = self.submit()
        engine.cancel(self.fresh(self.member), self.task(d))
        inst.refresh_from_db()
        self.assertEqual(inst.status, 'cancelled')


class ConcurrencyTests(EngineBase):
    def test_second_act_conflicts(self):
        lead2 = self.user('lead2', 'wf_lead')
        d, _ = self.submit()
        task = self.task(d)
        engine.act(self.fresh(self.lead), task)
        with self.assertRaises(TaskAlreadyDone) as cm:
            engine.act(self.fresh(lead2), task)
        self.assertEqual((cm.exception.status, cm.exception.code), (409, 'task_already_done'))
        self.assertEqual(cm.exception.message_fa, 'این کار را نفر دیگری انجام داده است')

    def test_stale_revision_conflicts(self):
        d, _ = self.submit()
        task = self.task(d)
        with self.assertRaises(TaskAlreadyDone):
            engine.act(self.fresh(self.lead), task, revision=task.revision + 5)
        engine.act(self.fresh(self.lead), task, revision=task.revision)


class SubstituteTests(EngineBase):
    def sub(self, principal, substitute, start=-1, end=3, company=None):
        today = timezone.localdate()
        return WorkflowSubstitute.objects.create(
            principal=principal, substitute=substitute, company=company,
            start_date=today + datetime.timedelta(days=start), end_date=today + datetime.timedelta(days=end))

    def test_substitute_in_window_acts_on_behalf(self):
        helper = self.user('helper', 'wf_member')
        self.sub(self.lead, helper)
        d, inst = self.submit()
        row = WorkflowTaskRecipient.objects.get(task=self.task(d), user=helper)
        self.assertEqual(row.on_behalf_of_id, self.lead.pk)
        self.assertTrue(engine.task_grants_view(self.fresh(helper), 'zz_wf_doc', d.pk))
        self.act(helper, d)
        step = self.last_step(inst)
        self.assertEqual((step.actor_id, step.on_behalf_of_id), (helper.pk, self.lead.pk))

    def test_future_window_refused_and_no_view(self):
        helper = self.user('helper', 'wf_member')
        self.sub(self.lead, helper, start=2, end=5)
        d, _ = self.submit()
        self.assertTrue(WorkflowTaskRecipient.objects.filter(task=self.task(d), user=helper).exists())
        self.assertFalse(engine.task_grants_view(self.fresh(helper), 'zz_wf_doc', d.pk))
        with self.assertRaises(WorkflowPermissionDenied):
            self.act(helper, d)

    def test_other_company_substitution_ignored(self):
        helper = self.user('helper', 'wf_member')
        self.sub(self.lead, helper, company=self.co2)
        d, _ = self.submit()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})

    def test_creator_never_substitute_row(self):
        self.sub(self.lead, self.member)
        d, _ = self.submit()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})
        with self.assertRaises(WorkflowPermissionDenied):
            self.act(self.member, d)

    def test_task_grants_view_only_open_tasks(self):
        d, _ = self.submit()
        self.assertTrue(engine.task_grants_view(self.fresh(self.lead), 'zz_wf_doc', d.pk))
        self.assertFalse(engine.task_grants_view(self.fresh(self.reviewer), 'zz_wf_doc', d.pk))
        self.act(self.lead, d)
        self.assertFalse(engine.task_grants_view(self.fresh(self.lead), 'zz_wf_doc', d.pk))


class VersionChangeTests(EngineBase):
    def set_spec(self, spec):
        self.specs[:] = [spec]
        reset_workflow_cache()

    def test_removed_current_step_moves_to_next_existing(self):
        d, inst = self.submit()
        self.act(self.lead, d)
        self.assertEqual(self.task(d).step_key, 'review')
        old_task = self.task(d)
        self.set_spec(make_spec(version=2, steps=(STEPS[0], STEPS[2], STEPS[3])))
        with self.assertRaises(TaskAlreadyDone):
            engine.act(self.fresh(self.reviewer), old_task)
        inst.refresh_from_db()
        self.assertEqual((inst.version, inst.current_step), (2, 'boss_ok'))
        auto = self.last_step(inst)
        self.assertEqual((auto.action, auto.actor_id), ('auto', None))
        self.assertEqual(auto.skipped, [{'step': 'review', 'reason': 'version_removed'}])
        self.assertEqual(WorkflowTask.objects.get(pk=old_task.pk).outcome, 'superseded')

    def test_no_later_step_opens_last_step_never_completes(self):
        d, inst = self.submit()
        self.act(self.lead, d)
        self.act(self.reviewer, d)
        self.assertEqual(self.task(d).step_key, 'boss_ok')
        self.set_spec(make_spec(version=2, steps=(STEPS[0], STEPS[1])))
        self.assertEqual(engine.migrate_open_instances(WF), 1)
        inst.refresh_from_db()
        self.assertEqual((inst.status, inst.current_step), ('in_progress', 'review'))
        self.assertEqual(self.task(d).step_key, 'review')

    def test_kept_step_only_updates_version(self):
        d, inst = self.submit()
        self.set_spec(make_spec(version=3))
        self.act(self.lead, d)
        inst.refresh_from_db()
        self.assertEqual((inst.version, inst.current_step), (3, 'review'))


class EventTests(EngineBase):
    def kinds(self):
        return {(e['kind'], tuple(e['user_ids'])) for e in self.events}

    def test_events_only_after_commit(self):
        lead2 = self.user('lead2', 'wf_lead')
        with self.captureOnCommitCallbacks(execute=True):
            d, inst = self.submit()
            self.assertEqual(self.events, [])
        self.assertEqual(self.kinds(), {('received', tuple(sorted((self.lead.pk, lead2.pk))))})
        e = self.events[0]
        self.assertEqual((e['workflow_key'], e['entity_id'], e['step_key'], e['company_id'], e['section_id']),
                         (WF, d.pk, 'lead_ok', self.co.pk, self.sec.pk))
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.act(self.lead, d)
        self.assertEqual(self.kinds(), {
            ('done', (self.lead.pk,)), ('removed', (lead2.pk,)), ('received', (self.reviewer.pk,)),
        })

    def test_return_reject_cancel_and_completion_events_to_creator(self):
        d, _ = self.submit()
        with self.captureOnCommitCallbacks(execute=True):
            engine.return_for_fix(self.fresh(self.lead), self.task(d), 'اصلاح')
        self.assertIn(('returned', (self.member.pk,)), self.kinds())
        self.events.clear()
        engine.submit(WF, d, self.member)
        with self.captureOnCommitCallbacks(execute=True):
            engine.cancel(self.fresh(self.member), self.task(d))
        self.assertIn(('cancelled', (self.member.pk,)), self.kinds())
        self.assertIn(('removed', (self.lead.pk,)), self.kinds())
        self.events.clear()
        d2, _ = self.submit(user=self.su)
        for u in (self.lead, self.reviewer, self.boss):
            self.act(u, d2)
        with self.captureOnCommitCallbacks(execute=True):
            self.act(self.payer, d2)
        done = [e for e in self.events if e['kind'] == 'done' and e['user_ids'] == [self.su.pk]]
        self.assertEqual(done[0]['step_key'], 'completed')

    def test_failed_action_sends_nothing(self):
        d, _ = self.submit()
        with self.captureOnCommitCallbacks(execute=True):
            with self.assertRaises(WorkflowPermissionDenied):
                self.act(self.reviewer, d)
        self.assertEqual(self.events, [])
        self.assertEqual(events.EVENT_KINDS[-1], 'superuser_alert')


class PermissionHolderTests(EngineBase):
    def test_holders_follow_bundles_and_overrides(self):
        self.assertEqual(section_permission_holder_ids('zz_wf_approve', self.sec), {self.lead.pk, self.boss.pk})
        self.override(self.lead, 'zz_wf_approve', 'remove')
        self.override(self.member, 'zz_wf_approve', 'add')
        self.override(self.payer, 'zz_wf_approve', 'add', company=self.co2)
        self.assertEqual(section_permission_holder_ids('zz_wf_approve', self.sec.pk), {self.boss.pk, self.member.pk})
        self.assertEqual(section_permission_holder_ids('zz_wf_sys', self.sec), set())
        self.assertEqual(section_permission_holder_ids('zz_wf_approve', self.other_sec), set())

    def test_holders_parity_with_can(self):
        # همان قاعدهٔ can(): سه سطح انتساب، تفاوت افزوده/برداشتهٔ هر شرکت، مجوز حساس، کاربر غیرفعال و مدیر کل
        from unittest import mock

        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        from accounts.models import CustomUser, UserPermissionOverride
        from accounts.scoped_permissions import can, section_permission_holders
        from companies.models import ProjectSection

        from .base import PERM_SPECS, _pspec

        sensitive = 'perm_rollback_data'
        patcher = mock.patch.dict(PERM_SPECS, {sensitive: _pspec(sensitive, defaults=('wf_lead', 'wf_boss'))})
        patcher.start()
        self.addCleanup(patcher.stop)
        sens_perm = Permission.objects.get_or_create(
            codename=sensitive, content_type=ContentType.objects.get_for_model(CustomUser),
            defaults={'name': sensitive})[0]

        c_lead = self.user('c_lead', 'wf_lead', company=self.co)
        p_rev = self.user('p_rev', 'wf_reviewer', project=self.pr)
        self.user('o_boss', 'wf_boss', section=self.other_sec)
        both = self.user('both', 'wf_lead', company=self.co2)
        self.assign(both, 'wf_member', section=self.sec2)
        inactive = self.user('inactive', 'wf_lead')
        inactive.is_active = False
        inactive.save()
        self.assign(self.su, 'wf_lead')
        self.override(self.member, 'zz_wf_approve', 'add')            # با انتساب پوشاننده
        self.override(self.payer, 'zz_wf_review', 'add', company=self.co2)  # بی انتساب در شرکت دوم
        self.override(c_lead, 'zz_wf_approve', 'remove')
        self.override(both, 'zz_wf_approve', 'remove', company=self.co)    # فقط در شرکت اول
        self.override(both, 'zz_wf_review', 'add', company=self.co)
        self.override(p_rev, 'zz_wf_review', 'remove', company=self.co2)   # شرکت دیگر: بی‌اثر
        self.override(self.boss, 'zz_wf_pay', 'add')
        UserPermissionOverride.objects.create(user=self.lead, permission=sens_perm, company=self.co, mode='add')

        codes = ['zz_wf_approve', 'zz_wf_review', 'zz_wf_pay', sensitive]
        secs = list(ProjectSection.objects.select_related('project').filter(
            pk__in=[self.sec.pk, self.sec2.pk, self.other_sec.pk]))
        users = list(CustomUser.objects.filter(username__startswith='wf_'))
        chains = {s.pk: (s.project_id, s.project.company_id) for s in secs}
        batch = section_permission_holders(chains, codes)
        checked = 0
        for sec in secs:
            for code in codes:
                expected = {u.pk for u in users if not u.is_superuser and can(u, code, sec)}
                self.assertEqual(section_permission_holder_ids(code, sec), expected, (sec.code, code))
                self.assertEqual(batch.get((sec.pk, code), set()), expected, (sec.code, code))
                checked += bool(expected)
        self.assertGreaterEqual(checked, 5)
        self.assertEqual(section_permission_holder_ids(sensitive, self.sec), set())


class ReviewOrderTests(EngineBase):
    def test_non_recipient_gets_403_before_revision(self):
        d, _ = self.submit()
        task = self.task(d)
        with self.assertRaises(WorkflowPermissionDenied):
            engine.act(self.fresh(self.payer), task, revision=task.revision + 5)
        with self.assertRaises(TaskAlreadyDone):
            engine.act(self.fresh(self.lead), task, revision=task.revision + 5)

    def test_obj_of_other_entity_is_rejected(self):
        d, _ = self.submit()
        other = self.doc()
        with self.assertRaises(WorkflowError) as cm:
            engine.act(self.fresh(self.lead), self.task(d), obj=other)
        self.assertEqual((cm.exception.code, cm.exception.status), ('entity_mismatch', 400))
        self.assertEqual(self.task(d).step_key, 'lead_ok')
