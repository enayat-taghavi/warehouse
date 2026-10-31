"""
طرح ۲.۳-ب: API گردش کار — کارهای من، شمارنده، بی‌دریافت‌کننده، اقدام (409 بی‌تغییر)، لغو، سابقه (۴۰۴ برای نادیدنی)،
تعریف‌ها، سقف مبلغ (ت۹) و تنظیمات شرکت (ت۱۲) با مجوز perm_workflow_thresholds و عضویت شرکت.
"""
from decimal import Decimal

from django.contrib.auth.models import Permission
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import AuditLog
from companies.models import ProjectSection, SectionAssignment
from workflow.models import (WorkflowCompanySettings, WorkflowInstance, WorkflowTask, WorkflowTaskRecipient,
                             WorkflowThreshold)
from workflow.registry import REVIEW, reset_workflow_cache, validate_specs

from .base import KIND, STEPS, WF, make_spec
from .test_engine import EngineBase

API = '/api/workflow/'


class ApiBase(EngineBase):
    def setUp(self):
        super().setUp()
        self.outsider = self.user('outsider', 'wf_lead', section=self.other_sec)

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user=self.fresh(user))
        return c

    def get(self, user, path, **params):
        return self.client_for(user).get(API + path, params)

    def post(self, user, path, data=None):
        return self.client_for(user).post(API + path, data or {}, format='json')

    def do(self, user, task, action='act', **data):
        return self.post(user, f'tasks/{task.pk}/action/', {'action': action, **data})

    def set_spec(self, spec):
        self.specs[:] = [spec]
        reset_workflow_cache()


class MyTasksApiTests(ApiBase):
    def test_card_fields(self):
        d, inst = self.submit()
        r = self.get(self.lead, 'tasks/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data['count'], r.data['page'], r.data['page_size']), (1, 1, 20))
        card = r.data['results'][0]
        task = self.task(d)
        self.assertEqual(card['task_id'], task.pk)
        self.assertEqual(card['instance_id'], inst.pk)
        self.assertEqual(card['revision'], task.revision)
        self.assertEqual(card['step_key'], 'lead_ok')
        self.assertEqual(card['step_title_fa'], 'تأیید سرپرست')
        self.assertEqual(card['workflow_title_fa'], 'گردش آزمایشی')
        self.assertEqual(card['actions'], ['act', 'return', 'reject'])
        self.assertEqual(card['route'], f'/app/zz/{d.pk}')
        self.assertEqual(card['company'], {'id': self.co.pk, 'name': self.co.name})
        self.assertEqual(card['section'], {'id': self.sec.pk, 'name': self.sec.name})
        self.assertEqual(card['summary']['title'], f'سند {d.pk}')
        self.assertEqual(card['amount'], '100.00')
        self.assertIsNone(card['on_behalf_of'])
        self.assertFalse(card['can_cancel'])
        self.assertTrue(card['opened_at_shamsi'])
        self.assertEqual(self.get(self.lead, 'tasks/count/').data, {'count': 1})

    def test_filters_and_paging(self):
        for _ in range(3):
            self.submit()
        self.assertEqual(self.get(self.lead, 'tasks/', company=self.co2.pk).data['count'], 0)
        self.assertEqual(self.get(self.lead, 'tasks/', workflow='nope').data['count'], 0)
        r = self.get(self.lead, 'tasks/', company=self.co.pk, workflow=WF, page=2, page_size=2)
        self.assertEqual((r.data['count'], len(r.data['results']), r.data['page']), (3, 1, 2))
        self.assertEqual(self.get(self.lead, 'tasks/', page_size=1000).data['page_size'], 100)
        self.assertEqual(self.get(self.lead, 'tasks/', company='x').status_code, 400)

    def test_non_recipient_cannot_list_act_or_see_history(self):
        d, _inst = self.submit()
        task = self.task(d)
        for u in (self.payer, self.outsider):
            self.assertEqual(self.get(u, 'tasks/').data['count'], 0)
            self.assertEqual(self.do(u, task).status_code, 404)
            self.assertEqual(self.get(u, 'history/', kind=KIND, id=d.pk).status_code, 404)
        self.assertEqual(self.do(self.lead, type('T', (), {'pk': 999999})).status_code, 404)
        # ثبت‌کننده کار را می‌بیند: خطای موتور (self_approval) بی‌تغییر
        r = self.do(self.member, task)
        self.assertEqual((r.status_code, r.data['code']), (403, 'self_approval'))

    def test_unassigned_superuser_only(self):
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d, _ = self.submit()
        self.assertEqual(self.do(self.lead, self.task(d)).status_code, 200)
        self.assertFalse(self.task(d).has_recipients)
        self.assertEqual(self.get(self.lead, 'tasks/unassigned/').status_code, 403)
        r = self.get(self.su, 'tasks/unassigned/')
        self.assertEqual((r.status_code, r.data['count']), (200, 1))
        self.assertEqual(r.data['results'][0]['step_key'], 'review')
        self.assertEqual(self.get(self.su, 'tasks/unassigned/', company=self.co2.pk).data['count'], 0)
        su = self.fresh(self.su)
        su.is_active = False
        su.save()
        self.assertIn(self.get(su, 'tasks/unassigned/').status_code, (401, 403))


class ActionApiTests(ApiBase):
    def test_act_returns_new_state_and_double_action_409(self):
        lead2 = self.user('lead2', 'wf_lead')
        d, _ = self.submit()
        task = self.task(d)
        r = self.do(self.lead, task, revision=task.revision)
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data['status'], r.data['current_step']), ('in_progress', 'review'))
        self.assertEqual(r.data['revision'], WorkflowInstance.objects.get(pk=task.instance_id).revision)
        for u in (self.lead, lead2):
            r = self.do(u, task)
            self.assertEqual((r.status_code, r.data['code']), (409, 'task_already_done'))
            self.assertEqual(r.data['detail'], 'این کار را نفر دیگری انجام داده است')
        # کار بستهٔ شرکت دیگر وجودش را لو نمی‌دهد
        self.assertEqual(self.do(self.outsider, task).status_code, 404)

    def test_stale_revision_409_and_validation(self):
        d, _ = self.submit()
        task = self.task(d)
        r = self.do(self.lead, task, revision=task.revision + 5)
        self.assertEqual((r.status_code, r.data['code']), (409, 'task_already_done'))
        self.assertEqual(self.do(self.lead, task, action='bogus').status_code, 400)
        r = self.do(self.lead, task, action='return')
        self.assertEqual((r.status_code, r.data['code']), (400, 'reason_required'))
        r = self.do(self.lead, task, action='reject', reason='نادرست')
        self.assertEqual((r.status_code, r.data['status']), (200, 'rejected'))

    def test_cancel(self):
        d, inst = self.submit()
        self.assertEqual(self.post(self.outsider, f'instances/{inst.pk}/cancel/').status_code, 404)
        self.assertEqual(self.post(self.payer, f'instances/{inst.pk}/cancel/').status_code, 404)
        r = self.post(self.lead, f'instances/{inst.pk}/cancel/')
        self.assertEqual((r.status_code, r.data['code']), (403, 'cancel_not_allowed'))
        r = self.post(self.member, f'instances/{inst.pk}/cancel/', {'reason': 'اشتباه'})
        self.assertEqual((r.status_code, r.data['status']), (200, 'cancelled'))
        r = self.post(self.member, f'instances/{inst.pk}/cancel/')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.post(self.member, 'instances/999999/cancel/').status_code, 404)


class HistoryApiTests(ApiBase):
    def test_history_rows(self):
        WorkflowThreshold.objects.create(workflow_key=WF, step_key='boss_ok', company=self.co, amount=Decimal('500'))
        d, inst = self.submit()
        self.do(self.lead, self.task(d), reason='خوب')
        with CaptureQueriesContext(connection) as ctx:
            r = self.get(self.member, 'history/', kind=KIND, id=d.pk)
        self.assertEqual(r.status_code, 200)
        self.assertLessEqual(len(ctx.captured_queries), 8)
        item = r.data['instances'][0]
        self.assertEqual((item['instance_id'], item['status']), (inst.pk, 'in_progress'))
        self.assertEqual(item['current_step_title_fa'], 'بررسی')
        self.assertFalse(item['can_cancel'])
        self.assertFalse(item['waiting_for_superuser'])
        submit_row, act_row = item['steps']
        self.assertEqual(submit_row['action'], 'submit')
        self.assertIn({'step': 'boss_ok', 'step_title_fa': 'تأیید رئیس', 'reason': 'threshold',
                       'reason_fa': 'مبلغ در سقف مرحله'}, submit_row['skipped'])
        self.assertEqual(act_row['actor']['id'], self.lead.pk)
        self.assertEqual((act_row['from_step_title_fa'], act_row['to_step_title_fa']), ('تأیید سرپرست', 'بررسی'))
        self.assertEqual(act_row['reason'], 'خوب')
        self.assertTrue(act_row['at_shamsi'])
        # انجام‌دهندهٔ قبلی (lead) و دریافت‌کنندهٔ فعلی (reviewer) هم می‌بینند؛ بقیه 404
        self.assertEqual(self.get(self.lead, 'history/', kind=KIND, id=d.pk).status_code, 200)
        self.assertEqual(self.get(self.reviewer, 'history/', kind=KIND, id=d.pk).status_code, 200)
        self.assertEqual(self.get(self.su, 'history/', kind=KIND, id=d.pk).status_code, 200)
        self.assertEqual(self.get(self.payer, 'history/', kind=KIND, id=d.pk).status_code, 404)
        self.assertEqual(self.get(self.member, 'history/', kind=KIND, id=999999).status_code, 404)
        self.assertEqual(self.get(self.member, 'history/', kind=KIND).status_code, 400)

    def test_waiting_for_superuser(self):
        # کار باز بی‌دریافت‌کننده (ثبت‌کننده تنها دارندهٔ نقش مرحله) در سابقه نشان داده می‌شود
        d, inst = self.submit()
        inst.tasks.filter(is_open=True).update(has_recipients=False)
        r = self.get(self.su, 'history/', kind=KIND, id=d.pk)
        self.assertTrue(r.data['instances'][0]['waiting_for_superuser'])

    def test_view_permission(self):
        self.set_spec(make_spec(view_permission='zz_wf_pay'))
        d, _ = self.submit()
        self.assertEqual(self.get(self.payer, 'history/', kind=KIND, id=d.pk).status_code, 200)
        # بخشی بودن مجوز سنجیده می‌شود
        with self.assertRaises(ImproperlyConfigured):
            validate_specs([make_spec(view_permission='zz_wf_sys')])
        with self.assertRaises(ImproperlyConfigured):
            validate_specs([make_spec(view_permission='zz_unknown')])

    def test_definitions(self):
        r = self.get(self.payer, 'definitions/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]['key'], WF)
        self.assertEqual([s['key'] for s in r.data[0]['steps']], [s.key for s in STEPS])
        self.assertEqual(r.data[0]['steps'][3]['actions'], ['act', 'return'])


class SettingsApiTests(ApiBase):
    def setUp(self):
        super().setUp()
        self.editor = self.user('editor', 'wf_member')
        perm = Permission.objects.get(codename='perm_workflow_thresholds', content_type__app_label='accounts')
        self.editor.user_permissions.add(perm)
        self.no_member_editor = self.user('editor2', 'wf_member', section=self.other_sec)
        self.no_member_editor.user_permissions.add(perm)

    def body(self, **kw):
        data = {'workflow_key': WF, 'step_key': 'lead_ok', 'company': self.co.pk, 'amount': '1000'}
        data.update(kw)
        return data

    def test_threshold_crud_and_audit(self):
        r = self.post(self.editor, 'thresholds/', self.body())
        self.assertEqual(r.status_code, 201)
        r = self.post(self.editor, 'thresholds/', self.body(amount='2500.5'))
        self.assertEqual((r.status_code, r.data['amount']), (200, '2500.50'))
        r2 = self.post(self.editor, 'thresholds/', self.body(section=self.sec.pk, amount='0'))
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(WorkflowThreshold.objects.count(), 2)
        rows = self.get(self.editor, 'thresholds/', company=self.co.pk).data
        self.assertEqual({(x['company_id'], (x['section'] or {}).get('id')) for x in rows},
                         {(self.co.pk, None), (None, self.sec.pk)})
        self.assertEqual(self.client_for(self.no_member_editor).delete(f'{API}thresholds/{r2.data["id"]}/').status_code,
                         404)
        self.assertEqual(self.client_for(self.editor).delete(f'{API}thresholds/{r2.data["id"]}/').status_code, 204)
        actions = list(AuditLog.objects.filter(module='workflow', target_model='WorkflowThreshold')
                       .order_by('id').values_list('action', flat=True))
        self.assertEqual(actions, ['CREATE', 'UPDATE', 'CREATE', 'DELETE'])

    def test_threshold_validation(self):
        cases = [
            (self.body(workflow_key='nope'), 'unknown_workflow'),
            (self.body(step_key='nope'), 'unknown_step'),
            (self.body(step_key='review'), 'not_approve_step'),
            (self.body(amount='-1'), 'invalid_amount'),
            (self.body(amount='abc'), 'invalid_amount'),
            (self.body(section=self.other_sec.pk), 'section_not_in_company'),
        ]
        for data, code in cases:
            r = self.post(self.editor, 'thresholds/', data)
            self.assertEqual((r.status_code, r.data['code']), (400, code), data)
        self.assertEqual(WorkflowThreshold.objects.count(), 0)

    def test_threshold_permission(self):
        # بی‌مجوز، ناعضو، و شرکت ناموجود همه 403 یکسان
        for u, company in ((self.lead, self.co.pk), (self.no_member_editor, self.co.pk), (self.editor, 999999)):
            self.assertEqual(self.post(u, 'thresholds/', self.body(company=company)).status_code, 403)
            self.assertEqual(self.get(u, 'thresholds/', company=company).status_code, 403)
        self.assertEqual(self.post(self.su, 'thresholds/', self.body()).status_code, 201)
        self.assertEqual(self.get(self.no_member_editor, 'thresholds/', company=self.co2.pk).status_code, 200)

    def test_company_settings(self):
        path = f'settings/{self.co.pk}/'
        r = self.get(self.editor, path)
        self.assertEqual((r.data['reminder_hours'], r.data['escalation_hours'], r.data['is_default']), (48, 96, True))
        c = self.client_for(self.editor)
        for bad in ({'reminder_hours': 0}, {'reminder_hours': 100}, {'escalation_hours': 721},
                    {'reminder_hours': 'x'}):
            r = c.put(API + path, bad, format='json')
            self.assertEqual((r.status_code, r.data['code']), (400, 'invalid_hours' if 'x' not in bad.values()
                                                                   else 'invalid_param'), bad)
        r = c.put(API + path, {'reminder_hours': 24, 'escalation_hours': 720}, format='json')
        self.assertEqual((r.status_code, r.data['reminder_hours'], r.data['is_default']), (200, 24, False))
        self.assertEqual(WorkflowCompanySettings.for_company(self.co.pk).escalation_hours, 720)
        self.assertEqual(AuditLog.objects.filter(module='workflow', target_model='WorkflowCompanySettings').count(), 1)
        self.assertEqual(self.client_for(self.no_member_editor).put(API + path, {'reminder_hours': 2},
                                                                    format='json').status_code, 403)
        self.assertEqual(self.get(self.lead, path).status_code, 403)


class TaskListQueryCountTests(ApiBase):
    def bulk(self, company, project, n_sections, n_tasks, tag, base):
        secs = ProjectSection.objects.bulk_create([
            ProjectSection(project=project, code=f'{tag}{i}', name=f'بخش {tag}{i}') for i in range(n_sections)])
        rev = self.user(f'{tag}_rev')
        keys = [s.key for s in STEPS]
        insts = WorkflowInstance.objects.bulk_create([
            WorkflowInstance(workflow_key=WF, version=1, entity_kind=KIND, entity_id=base + i, company=company,
                             section=secs[i % n_sections], created_by=self.member, current_step='review',
                             step_keys=keys, revision=1, summary={'title': f't{i}'})
            for i in range(n_tasks)])
        tasks = WorkflowTask.objects.bulk_create([
            WorkflowTask(instance=inst, step_key='review', step_kind=REVIEW, role='wf_reviewer',
                         permission='zz_wf_review', revision=1, has_recipients=True)
            for inst in insts])
        WorkflowTaskRecipient.objects.bulk_create([WorkflowTaskRecipient(task=t, user=rev) for t in tasks])
        return rev

    def test_constant_queries(self):
        small = self.bulk(self.co, self.pr, 10, 50, 'S', 100000)
        large = self.bulk(self.co2, self.pr2, 200, 2000, 'L', 200000)

        def measure(user):
            c = self.client_for(user)
            with CaptureQueriesContext(connection) as ctx:
                r = c.get(API + 'tasks/')
            self.assertEqual(len(r.data['results']), 20)
            return len(ctx.captured_queries), r.data['count']

        n_small, c_small = measure(small)
        n_large, c_large = measure(large)
        self.assertEqual((c_small, c_large), (50, 2000))
        self.assertEqual(n_small, n_large)
        self.assertLessEqual(n_large, 4)
