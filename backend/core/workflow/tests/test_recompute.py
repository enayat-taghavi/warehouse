"""
تست‌های محاسبهٔ دوبارهٔ کارهای باز (ت۴ و ت۷)، جانشین عضو شرکت (ت۱۰)، قلاب‌ها و پرس‌وجوهای «کارهای من».
"""
import datetime
import pathlib
import types
from decimal import Decimal
from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import CustomUser, RoleBundleOverride
from accounts.permission_events import notify_assignment_changed, notify_bundle_changed, notify_override_changed
from companies.models import ProjectSection, SectionAssignment
from workflow import engine
from workflow.errors import WorkflowPermissionDenied
from workflow.models import WorkflowInstance, WorkflowStep, WorkflowSubstitute, WorkflowTask, WorkflowTaskRecipient
from workflow.queries import count_tasks_for_user, tasks_for_user, unassigned_open_tasks
from workflow.recipients import compute_recipients_batch, principal_recipient_ids, substitute_rows
from workflow.recompute import recompute_open_tasks
from workflow.registry import REVIEW, reset_workflow_cache

from .base import KIND, STEPS, WF, make_spec
from .test_engine import EngineBase


def _days(n):
    return timezone.localdate() + datetime.timedelta(days=n)


def _count(fn):
    with CaptureQueriesContext(connection) as ctx:
        fn()
    return len(ctx.captured_queries)


class RecomputeBase(EngineBase):
    def sub(self, principal, substitute, start=-1, end=3, company=None):
        return WorkflowSubstitute.objects.create(principal=principal, substitute=substitute, company=company,
                                                 start_date=_days(start), end_date=_days(end))

    def kinds(self):
        return {(e['kind'], tuple(e['user_ids'])) for e in self.events}

    def autos(self, inst):
        return list(WorkflowStep.objects.filter(instance=inst, action=WorkflowStep.AUTO).order_by('id'))


class LostRecipientTests(RecomputeBase):
    def test_only_lead_removed_moves_to_next_step(self):
        d, inst = self.submit()
        old = self.task(d)
        SectionAssignment.objects.filter(user=self.lead).update(is_active=False)
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            notify_assignment_changed([self.lead.pk])
        task = self.task(d)
        self.assertEqual(task.step_key, 'review')
        self.assertEqual(self.recipients(task), {self.reviewer.pk})
        old.refresh_from_db()
        self.assertEqual((old.is_open, old.outcome), (False, WorkflowTask.SKIPPED))
        auto = self.autos(inst)[-1]
        self.assertEqual((auto.actor_id, auto.from_step, auto.to_step), (None, 'lead_ok', 'review'))
        self.assertEqual(auto.skipped, [{'step': 'lead_ok', 'reason': 'no_recipient'}])
        self.assertIn(('removed', (self.lead.pk,)), self.kinds())
        self.assertIn(('received', (self.reviewer.pk,)), self.kinds())

    def test_review_loses_holder_waits_one_alert_then_gains(self):
        d, _ = self.submit()
        self.act(self.lead, d)
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            recompute_open_tasks(user_ids={self.reviewer.pk})
        task = self.task(d)
        self.assertEqual((task.step_key, task.has_recipients), ('review', False))
        self.assertEqual(self.recipients(task), set())
        self.assertIsNotNone(task.superuser_alerted_at)
        self.assertIn(('removed', (self.reviewer.pk,)), self.kinds())
        self.assertEqual(sum(e['kind'] == 'superuser_alert' for e in self.events), 1)
        self.assertEqual([t.pk for t in unassigned_open_tasks(self.su)], [task.pk])
        self.assertEqual([t.pk for t in unassigned_open_tasks(self.su, company_id=self.co.pk)], [task.pk])
        self.assertFalse(unassigned_open_tasks(self.su, company_id=self.co2.pk).exists())
        self.assertFalse(unassigned_open_tasks(self.fresh(self.lead)).exists())
        self.assertFalse(unassigned_open_tasks(None).exists())
        with self.captureOnCommitCallbacks(execute=True):
            recompute_open_tasks(company_ids={self.co.pk})
        self.assertEqual(sum(e['kind'] == 'superuser_alert' for e in self.events), 1)
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            # قلاب post_save انتساب خودش محاسبهٔ دوباره را اجرا می‌کند؛ اجرای دوم تکراری و بی‌رویداد است
            rev2 = self.user('rev2', 'wf_reviewer')
            recompute_open_tasks(company_ids={self.co.pk})
        task.refresh_from_db()
        self.assertTrue(task.has_recipients)
        self.assertEqual(self.kinds(), {('received', (rev2.pk,))})

    def test_bundle_change_removes_rows(self):
        d, _ = self.submit()
        self.act(self.lead, d)
        RoleBundleOverride.objects.create(role_key='wf_reviewer', permission=self.perms['zz_wf_review'],
                                          mode='remove')
        notify_bundle_changed('wf_reviewer')
        task = self.task(d)
        self.assertEqual(self.recipients(task), set())
        self.assertFalse(task.has_recipients)

    def test_company_remove_override_only_in_that_company(self):
        self.assign(self.lead, 'wf_lead', section=self.other_sec)
        d1, _ = self.submit()
        d2, _ = self.submit(d=self.doc(section=self.other_sec))
        self.override(self.lead, 'zz_wf_approve', 'remove', company=self.co)
        notify_override_changed(self.lead.pk, self.co.pk)
        self.assertEqual(self.task(d1).step_key, 'review')
        self.assertEqual(self.recipients(self.task(d2)), {self.lead.pk})

    def test_deactivated_or_superuser_loses_rows(self):
        lead2 = self.user('lead2', 'wf_lead')
        d, _ = self.submit()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk, lead2.pk})
        lead2.is_active = False
        lead2.save()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})
        self.lead.is_superuser = True
        self.lead.save()
        self.assertEqual(self.task(d).step_key, 'review')

    def test_ordinary_user_save_touches_no_workflow_table(self):
        self.submit()
        self.lead.first_name = 'x'
        with CaptureQueriesContext(connection) as ctx:
            self.lead.save()
            self.lead.save(update_fields=['last_login'])
        self.assertFalse([q for q in ctx.captured_queries if 'workflow_' in q['sql']])

    def test_kept_step_version_sync_without_principals_applies_rule3(self):
        d, inst = self.submit()
        SectionAssignment.objects.filter(user=self.lead).update(is_active=False)
        self.specs[:] = [make_spec(version=2)]
        reset_workflow_cache()
        self.assertEqual(engine.migrate_open_instances(WF), 1)
        self.assertEqual(self.task(d).step_key, 'review')
        self.assertEqual(self.autos(inst)[-1].skipped, [{'step': 'lead_ok', 'reason': 'no_recipient'}])


class SubstituteRecomputeTests(RecomputeBase):
    def test_create_and_revoke_substitute(self):
        d, _ = self.submit()
        helper = self.user('helper', 'wf_member')
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            s = self.sub(self.lead, helper)
        row = WorkflowTaskRecipient.objects.get(task=self.task(d), user=helper)
        self.assertEqual(row.on_behalf_of_id, self.lead.pk)
        self.assertEqual(self.kinds(), {('received', (helper.pk,))})
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            s.revoked_at = timezone.now()
            s.save()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})
        self.assertEqual(self.kinds(), {('removed', (helper.pk,))})

    def test_substitute_not_member_of_company(self):
        d, _ = self.submit()
        outsider = self.user('outsider', 'wf_member', section=self.other_sec)
        self.sub(self.lead, outsider)
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})
        with self.assertRaises(WorkflowPermissionDenied):
            self.act(outsider, d)
        self.assertEqual(substitute_rows({self.lead.pk}, self.co.pk, self.member.pk), [])

    def test_future_window_row_without_received(self):
        d, _ = self.submit()
        helper = self.user('helper', 'wf_member')
        self.events.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.sub(self.lead, helper, start=2, end=5)
        self.assertTrue(WorkflowTaskRecipient.objects.filter(task=self.task(d), user=helper).exists())
        self.assertEqual(self.events, [])
        self.assertEqual(count_tasks_for_user(self.fresh(helper)), 0)
        with self.captureOnCommitCallbacks(execute=True):
            self.act(self.lead, d)
        self.assertNotIn(('removed', (helper.pk,)), self.kinds())


class SameRuleTests(RecomputeBase):
    def test_batch_equals_single_path(self):
        self.user('lead_p', 'wf_lead', project=self.pr)
        self.user('rev_c', 'wf_reviewer', company=self.co)
        self.user('boss2', 'wf_boss', section=self.other_sec)
        self.override(self.boss, 'zz_wf_approve', 'remove')
        self.override(self.member, 'zz_wf_review', 'add')
        self.override(self.reviewer, 'zz_wf_review', 'add', company=self.co2)
        helper = self.user('helper', 'wf_member')
        outsider = self.user('outsider', 'wf_member', section=self.other_sec)
        self.sub(self.lead, helper)
        self.sub(self.reviewer, outsider)
        self.sub(self.boss, helper, start=3, end=4)
        self.sub(self.payer, helper, company=self.co2)
        items, expected = [], {}
        for sec in ProjectSection.objects.select_related('project').filter(pk__in=[
                self.sec.pk, self.sec2.pk, self.other_sec.pk]):
            for step in STEPS:
                for creator in (self.member.pk, self.lead.pk, None):
                    key = (sec.pk, step.key, creator)
                    chain = (sec.pk, sec.project_id, sec.project.company_id)
                    items.append((key, chain, step.role, step.permission, creator))
                    principals = principal_recipient_ids(sec, step.role, step.permission, creator)
                    subs = substitute_rows(principals, sec.project.company_id, creator)
                    inst = types.SimpleNamespace(created_by_id=creator)
                    single = engine._compute_recipients(engine._Ctx(None, None, sec), inst, step)
                    self.assertEqual((single[0], sorted(single[1])), (principals, sorted(subs)), key)
                    expected[key] = (principals, sorted(subs))
        batch = compute_recipients_batch(items)
        self.assertEqual({k: (p, sorted(s)) for k, (p, s, _h) in batch.items()}, expected)
        self.assertTrue(any(s for _p, s in expected.values()))

    def test_no_channel_layer_in_workflow(self):
        root = pathlib.Path(engine.__file__).parent
        for path in root.glob('*.py'):
            text = path.read_text(encoding='utf-8')
            if path.name == 'realtime.py':
                # تنها فرستندهٔ وب‌سوکت (ت۱۶): هرگز کانال شرکت یا عمومی
                self.assertNotIn('company_', text.replace('company_id', ''), path.name)
                self.assertNotIn('global_', text, path.name)
                continue
            self.assertNotIn('channel_layer', text, path.name)
            self.assertNotIn('group_send', text, path.name)


class HookTests(RecomputeBase):
    def test_notify_functions_trigger_recompute(self):
        with mock.patch('workflow.recompute.recompute_open_tasks') as m:
            notify_assignment_changed([self.lead.pk])
            m.assert_called_with(company_ids=set(), user_ids={self.lead.pk})
            notify_bundle_changed('wf_lead')
            m.assert_called_with(all_tasks=True)
            notify_override_changed(self.lead.pk, self.co.pk)
            m.assert_called_with(company_ids={self.co.pk}, user_ids={self.lead.pk})

    def test_recompute_failure_does_not_break_caller(self):
        def boom(**kwargs):
            with connection.cursor() as cur:
                cur.execute('SELECT * FROM zz_no_such_table_wf')

        with mock.patch('workflow.recompute.recompute_open_tasks', side_effect=boom):
            with self.assertLogs('workflow.recompute', 'ERROR'):
                messages = notify_override_changed(self.lead.pk, self.co.pk)
        self.assertTrue(messages)
        self.assertTrue(CustomUser.objects.filter(pk=self.lead.pk).exists())


class QueryCountTests(RecomputeBase):
    def bulk(self, company, project, n_sections, n_tasks, tag, base):
        secs = ProjectSection.objects.bulk_create([
            ProjectSection(project=project, code=f'{tag}{i}', name=f'بخش {tag}{i}') for i in range(n_sections)])
        rev = self.user(f'{tag}_rev', 'wf_reviewer', company=company)
        helper = self.user(f'{tag}_sub', 'wf_member', company=company)
        self.sub(rev, helper)
        keys = [s.key for s in STEPS]
        insts = WorkflowInstance.objects.bulk_create([
            WorkflowInstance(workflow_key=WF, version=1, entity_kind=KIND, entity_id=base + i, company=company,
                             section=secs[i % n_sections], created_by=self.member, current_step='review',
                             step_keys=keys, revision=1)
            for i in range(n_tasks)])
        tasks = WorkflowTask.objects.bulk_create([
            WorkflowTask(instance=inst, step_key='review', step_kind=REVIEW, role='wf_reviewer',
                         permission='zz_wf_review', revision=1, has_recipients=True)
            for inst in insts])
        WorkflowTaskRecipient.objects.bulk_create(
            [WorkflowTaskRecipient(task=t, user=rev, announced=True) for t in tasks]
            + [WorkflowTaskRecipient(task=t, user=helper, on_behalf_of=rev, valid_from=_days(-1), valid_to=_days(3),
                                     announced=True)
               for t in tasks])
        inst = insts[0]
        self.docs[inst.entity_id] = types.SimpleNamespace(
            pk=inst.entity_id, id=inst.entity_id, section_id=inst.section_id, amount=Decimal('100'), states=[])
        return rev, helper, tasks[0]

    def test_constant_queries_small_vs_large(self):
        small = self.bulk(self.co, self.pr, 20, 50, 'S', 100000)
        large = self.bulk(self.co2, self.pr2, 300, 2000, 'L', 200000)
        # bulk_create بی سیگنال: محاسبهٔ دوباره فقط همان که اندازه گرفته می‌شود
        SectionAssignment.objects.bulk_create([
            SectionAssignment(user=self.user('S_rev2'), role='wf_reviewer', company=self.co, is_active=True),
            SectionAssignment(user=self.user('L_rev2'), role='wf_reviewer', company=self.co2, is_active=True)])

        stats = {}
        n_small = _count(lambda: stats.setdefault('s', recompute_open_tasks(company_ids={self.co.pk})))
        n_large = _count(lambda: stats.setdefault('l', recompute_open_tasks(company_ids={self.co2.pk})))
        self.assertEqual(n_small, n_large)
        self.assertEqual((stats['s']['received'], stats['l']['received']), (50, 2000))
        self.assertEqual(stats['l']['skipped'], 0)

        def page(user):
            rows = list(tasks_for_user(user)[:20])
            self.assertEqual(len(rows), 20)
            for t in rows:
                self.assertEqual(t.my_rows[0].on_behalf_of.pk, (small if user == small[1] else large)[0].pk)
                str(t.instance.section.name) + str(t.instance.company.name)
            count_tasks_for_user(user)

        self.assertEqual(_count(lambda: page(small[1])), _count(lambda: page(large[1])))
        self.assertEqual(count_tasks_for_user(large[1]), 2000)
        self.assertEqual(count_tasks_for_user(large[0]), 2000)

        a_small = _count(lambda: engine.act(self.fresh(small[0]), small[2]))
        a_large = _count(lambda: engine.act(self.fresh(large[0]), large[2]))
        self.assertEqual(a_small, a_large)


class ReviewFixTests(RecomputeBase):
    def test_plain_assignment_save_recomputes(self):
        # انتساب غیرفعال‌شده با save ساده (مثل ورود اکسل یا ادمین)، بی notify_assignment_changed
        lead2 = self.user('lead2', 'wf_lead')
        d, _ = self.submit()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk, lead2.pk})
        a2 = SectionAssignment.objects.get(user=lead2)
        a2.is_active = False
        a2.save()
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})
        a1 = SectionAssignment.objects.get(user=self.lead)
        a1.is_active = False
        a1.save()
        self.assertEqual(self.task(d).step_key, 'review')
        self.assertFalse(WorkflowTaskRecipient.objects.filter(user__in=[self.lead, lead2]).exists())

    def test_assignment_delete_and_substitute_hooks_pass_users(self):
        a = self.assign(self.member, 'wf_lead', project=self.pr)
        with mock.patch('workflow.hooks.safe_recompute') as m:
            a.delete()
            m.assert_called_once_with(user_ids={self.member.pk}, company_ids={self.co.pk})
            helper = self.user('helper_h')
            m.reset_mock()
            self.sub(self.lead, helper)
            m.assert_called_once_with(user_ids={self.lead.pk, helper.pk})

    def test_company_access_row_alone_is_not_membership(self):
        from companies.models import UserCompanyAccess
        d, _ = self.submit()
        helper = self.user('uca_only')
        UserCompanyAccess.objects.create(user=helper, company=self.co)
        self.sub(self.lead, helper)
        self.assertEqual(self.recipients(self.task(d)), {self.lead.pk})
        self.assertEqual(substitute_rows({self.lead.pk}, self.co.pk, self.member.pk), [])
        with self.assertRaises(WorkflowPermissionDenied):
            self.act(helper, d)

    def test_poison_task_does_not_stop_other_tasks(self):
        d1, _ = self.submit()
        d2, _ = self.submit()

        def boom(obj, state, instance):
            if obj.pk == d1.pk:
                raise RuntimeError('module hook failed')
            obj.states.append(state)

        self.specs[:] = [make_spec(on_state_change=boom)]
        reset_workflow_cache()
        SectionAssignment.objects.filter(user=self.lead).update(is_active=False)
        with self.assertLogs('workflow.recompute', 'ERROR'):
            stats = recompute_open_tasks(user_ids={self.lead.pk})
        self.assertEqual((stats['skipped'], stats['alerts']), (1, 1))
        self.assertEqual(self.task(d2).step_key, 'review')
        t1 = self.task(d1)
        self.assertEqual((t1.step_key, t1.is_open, t1.has_recipients), ('lead_ok', True, False))
        self.assertIsNotNone(t1.superuser_alerted_at)
        self.assertEqual(self.recipients(t1), set())
        self.assertEqual(WorkflowInstance.objects.get(entity_id=d1.pk).current_step, 'lead_ok')
