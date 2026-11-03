"""
API tests for company workflow policy settings (Step C of Role-policy plan).
Covers GET, preview, PUT, DELETE, preview_stale (409), AuditLog tracking,
scoped recompute, forced tasks, and backward-compatible company settings.
"""
from unittest import mock

from django.contrib.auth.models import Permission

from accounts.models import AuditLog
from companies.models import SectionAssignment
from platform_core import registry as preg
from workflow import engine
from workflow.models import WorkflowCompanySettings, WorkflowPolicy
from workflow.recompute import recompute_open_tasks

from .base import WF
from .test_api import API, ApiBase


class PolicyApiTests(ApiBase):
    def setUp(self):
        super().setUp()
        p = mock.patch.dict(preg._CONTRIBUTIONS, {'workflow_role_defaults': []})
        p.start()
        self.addCleanup(p.stop)

        self.editor = self.user('editor', 'wf_member')
        perm = Permission.objects.get(codename='perm_workflow_thresholds', content_type__app_label='accounts')
        self.editor.user_permissions.add(perm)

        self.no_member_editor = self.user('editor2', 'wf_member', section=self.other_sec)
        self.no_member_editor.user_permissions.add(perm)

    def test_permissions(self):
        base_co = f'company-policies/{self.co.pk}/'
        preview_co = f'company-policies/{self.co.pk}/preview/'

        # self.lead (no permission) -> 403
        r_get = self.get(self.lead, base_co)
        self.assertEqual(r_get.status_code, 403)
        self.assertEqual(r_get.data.get('code'), 'not_allowed')

        r_prev = self.post(self.lead, preview_co, {'workflow_key': WF, 'values': {}})
        self.assertEqual(r_prev.status_code, 403)
        self.assertEqual(r_prev.data.get('code'), 'not_allowed')

        r_put = self.client_for(self.lead).put(API + base_co, {}, format='json')
        self.assertEqual(r_put.status_code, 403)
        self.assertEqual(r_put.data.get('code'), 'not_allowed')

        # self.no_member_editor on self.co -> 403
        r_nm_get = self.get(self.no_member_editor, base_co)
        self.assertEqual(r_nm_get.status_code, 403)
        self.assertEqual(r_nm_get.data.get('code'), 'not_allowed')

        r_nm_prev = self.post(self.no_member_editor, preview_co, {'workflow_key': WF, 'values': {}})
        self.assertEqual(r_nm_prev.status_code, 403)
        self.assertEqual(r_nm_prev.data.get('code'), 'not_allowed')

        r_nm_put = self.client_for(self.no_member_editor).put(API + base_co, {}, format='json')
        self.assertEqual(r_nm_put.status_code, 403)
        self.assertEqual(r_nm_put.data.get('code'), 'not_allowed')

        # self.editor on company id 999999 -> 403 with the same body as the non-member
        r_missing = self.get(self.editor, 'company-policies/999999/')
        self.assertEqual(r_missing.status_code, 403)
        self.assertEqual(r_missing.data, r_nm_get.data)

        # self.su and self.editor on self.co -> 200 for GET
        self.assertEqual(self.get(self.su, base_co).status_code, 200)
        self.assertEqual(self.get(self.editor, base_co).status_code, 200)

        # self.no_member_editor on self.co2 -> 200
        self.assertEqual(self.get(self.no_member_editor, f'company-policies/{self.co2.pk}/').status_code, 200)

    def test_get_sources(self):
        WorkflowPolicy.objects.create(company=self.co, workflow_key='', role_actions={'wf_reviewer': 'skip'})
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_lead': 'wait'})

        r = self.get(self.editor, f'company-policies/{self.co.pk}/')
        self.assertEqual(r.status_code, 200)

        wf_entry = next(w for w in r.data['workflows'] if w['key'] == WF)
        self.assertTrue(wf_entry['has_own_row'])
        roles = {item['role']: item for item in wf_entry['roles']}
        self.assertEqual(roles['wf_reviewer']['source'], 'company')
        self.assertEqual(roles['wf_reviewer']['effective'], 'skip')
        self.assertEqual(roles['wf_lead']['source'], 'own')
        self.assertEqual(roles['wf_lead']['effective'], 'wait')
        self.assertEqual(roles['wf_boss']['source'], 'default')
        self.assertEqual(roles['wf_boss']['effective'], 'skip')

        cd_roles = {item['role']: item for item in r.data['company_default']['roles']}
        self.assertEqual(cd_roles['wf_reviewer']['source'], 'own')

    def test_notify_candidates_are_active_company_members(self):
        # Step E: options for «کاربران انتخاب‌شده» follow the same rule as clean_values
        r = self.get(self.editor, f'company-policies/{self.co.pk}/')
        self.assertEqual(r.status_code, 200)
        ids = {c['id'] for c in r.data['notify_candidates']}
        self.assertIn(self.lead.pk, ids)
        self.assertIn(self.editor.pk, ids)
        self.assertNotIn(self.outsider.pk, ids)
        self.assertNotIn(self.su.pk, ids)
        self.assertNotIn(self.no_member_editor.pk, ids)
        self.assertTrue(all(set(c) == {'id', 'name'} for c in r.data['notify_candidates']))
        self.lead.is_active = False
        self.lead.save(update_fields=['is_active'])
        r2 = self.get(self.editor, f'company-policies/{self.co.pk}/')
        self.assertNotIn(self.lead.pk, {c['id'] for c in r2.data['notify_candidates']})

    def test_invalid_values_400(self):
        cases = [
            ({'workflow_key': WF, 'values': {'role_actions': {'unknown_role': 'skip'}}}, 'unknown_role'),
            ({'workflow_key': WF, 'values': {'role_actions': {'wf_lead': 'x'}}}, 'invalid_action'),
            ({'workflow_key': 'unknown_wf', 'values': {}}, 'unknown_workflow'),
            ({'workflow_key': WF, 'values': {'creator_may_approve_own': 'yes'}}, 'invalid_creator_may_approve_own'),
            ({'workflow_key': WF, 'values': {'notify_mode': 'other'}}, 'invalid_notify_mode'),
            ({'workflow_key': '', 'reset': True}, 'invalid_reset'),
        ]
        for payload, expected_code in cases:
            r = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', payload)
            self.assertEqual((r.status_code, r.data.get('code')), (400, expected_code), payload)

        # unknown workflow key in path
        r_path = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/unknown_wf/',
            {'values': {}, 'confirm_token': 'dummy'},
            format='json',
        )
        self.assertEqual((r_path.status_code, r_path.data.get('code')), (400, 'unknown_workflow'))

        self.assertEqual(WorkflowPolicy.objects.count(), 0)

    def test_notify_users_outside_company_400(self):
        # self.outsider (member of co2 only) -> 400 notify_user_not_member
        r1 = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'notify_mode': 'users', 'notify_user_ids': [self.outsider.pk]},
        })
        self.assertEqual(r1.status_code, 400)
        self.assertEqual(r1.data.get('code'), 'notify_user_not_member')

        # self.su -> 400 notify_user_not_member
        r2 = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'notify_mode': 'users', 'notify_user_ids': [self.su.pk]},
        })
        self.assertEqual(r2.status_code, 400)
        self.assertEqual(r2.data.get('code'), 'notify_user_not_member')

        # empty list -> 400 notify_users_required
        r3 = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'notify_mode': 'users', 'notify_user_ids': []},
        })
        self.assertEqual(r3.status_code, 400)
        self.assertEqual(r3.data.get('code'), 'notify_users_required')

        # self.lead (active member of co) -> 200
        r4 = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'notify_mode': 'users', 'notify_user_ids': [self.lead.pk]},
        })
        self.assertEqual(r4.status_code, 200)

    def test_preview_writes_nothing(self):
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d, inst = self.submit(self.member)
        self.act(self.lead, d)
        task = self.task(d)
        self.assertEqual(task.step_key, 'review')
        self.assertFalse(task.has_recipients)
        self.assertTrue(task.is_open)

        r = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_reviewer': 'skip'}},
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['counts']['advance'], 1)
        self.assertEqual(len(r.data['samples']), 1)
        sample = r.data['samples'][0]
        self.assertEqual(sample['instance_id'], inst.pk)
        self.assertEqual(sample['effect'], 'advance')

        self.assertEqual(WorkflowPolicy.objects.count(), 0)
        t = self.task(d)
        self.assertTrue(t.is_open)
        self.assertEqual(t.step_key, 'review')
        self.assertEqual(AuditLog.objects.filter(target_model='WorkflowPolicy').count(), 0)

    def test_confirm_applies_and_counts_match(self):
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d, inst = self.submit(self.member)
        self.act(self.lead, d)

        preview = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_reviewer': 'skip'}},
        })
        self.assertEqual(preview.status_code, 200)
        token = preview.data['token']
        adv_count = preview.data['counts']['advance']

        r = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_reviewer': 'skip'}}, 'confirm_token': token},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['stats']['skipped'], adv_count)

        task = self.task(d)
        self.assertTrue(task.is_open)
        self.assertEqual(task.step_key, 'boss_ok')

    def test_missing_token_400(self):
        r = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_reviewer': 'skip'}}},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data.get('code'), 'confirm_token_required')

    def test_preview_stale_409(self):
        preview = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_reviewer': 'skip'}},
        })
        self.assertEqual(preview.status_code, 200)
        old_token = preview.data['token']

        # Change state by creating a company default row directly
        WorkflowPolicy.objects.create(company=self.co, workflow_key='', role_actions={'wf_lead': 'wait'})

        r = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_reviewer': 'skip'}}, 'confirm_token': old_token},
            format='json',
        )
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data.get('code'), 'preview_stale')
        self.assertIn('preview', r.data)
        self.assertNotEqual(r.data['preview']['token'], old_token)
        self.assertFalse(WorkflowPolicy.objects.filter(company=self.co, workflow_key=WF).exists())

    def test_audit_row_before_after(self):
        # 1. CREATE
        p1 = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_reviewer': 'skip'}},
        })
        self.assertEqual(p1.status_code, 200)
        token1 = p1.data['token']

        r1 = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_reviewer': 'skip'}}, 'confirm_token': token1},
            format='json',
        )
        self.assertEqual(r1.status_code, 200)

        # 2. UPDATE
        p2 = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_reviewer': 'wait'}},
        })
        self.assertEqual(p2.status_code, 200)
        token2 = p2.data['token']

        r2 = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_reviewer': 'wait'}}, 'confirm_token': token2},
            format='json',
        )
        self.assertEqual(r2.status_code, 200)

        logs = list(AuditLog.objects.filter(
            module='workflow', target_model='WorkflowPolicy', company_id=self.co.pk
        ).order_by('id'))
        self.assertEqual(len(logs), 2)
        self.assertEqual(logs[0].action, 'CREATE')
        self.assertEqual(logs[1].action, 'UPDATE')
        self.assertEqual(logs[1].before_state['role_actions'], {'wf_reviewer': 'skip'})
        self.assertEqual(logs[1].after_state['role_actions'], {'wf_reviewer': 'wait'})

    def test_delete_resets_to_company_default(self):
        WorkflowPolicy.objects.create(company=self.co, workflow_key='', role_actions={'wf_reviewer': 'skip'})
        WorkflowPolicy.objects.create(company=self.co, workflow_key=WF, role_actions={'wf_reviewer': 'wait'})

        p = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'reset': True,
        })
        self.assertEqual(p.status_code, 200)
        token = p.data['token']

        r = self.client_for(self.editor).delete(
            f'{API}company-policies/{self.co.pk}/{WF}/?confirm_token={token}'
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(WorkflowPolicy.objects.filter(company=self.co, workflow_key=WF).exists())

        get_res = self.get(self.editor, f'company-policies/{self.co.pk}/')
        wf_entry = next(w for w in get_res.data['workflows'] if w['key'] == WF)
        self.assertFalse(wf_entry['has_own_row'])
        roles = {item['role']: item for item in wf_entry['roles']}
        self.assertEqual(roles['wf_reviewer']['source'], 'company')
        self.assertEqual(roles['wf_boss']['source'], 'default')

        del_log = AuditLog.objects.filter(module='workflow', target_model='WorkflowPolicy', action='DELETE').last()
        self.assertIsNotNone(del_log)
        self.assertEqual(del_log.company_id, self.co.pk)

    def test_recompute_scoped_to_company_and_workflow(self):
        # Waiting review task in self.co
        SectionAssignment.objects.filter(user=self.reviewer).update(is_active=False)
        d1, inst1 = self.submit(self.member)
        self.act(self.lead, d1)

        # Waiting review task in self.co2 (doc in other_sec; no reviewer in co2)
        d2 = self.doc(section=self.other_sec)
        inst2 = engine.submit(WF, d2, self.no_member_editor)
        self.act(self.outsider, d2)

        # Both tasks should be waiting on review
        t1 = self.task(d1)
        self.assertEqual(t1.step_key, 'review')
        self.assertFalse(t1.has_recipients)

        t2 = self.task(d2)
        self.assertEqual(t2.step_key, 'review')
        self.assertFalse(t2.has_recipients)

        # Save wf_reviewer: skip for self.co
        p = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_reviewer': 'skip'}},
        })
        token = p.data['token']
        r = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_reviewer': 'skip'}}, 'confirm_token': token},
            format='json',
        )
        self.assertEqual(r.status_code, 200)

        # co task moves to boss_ok; co2 task stays open on review
        t1_after = self.task(d1)
        self.assertEqual(t1_after.step_key, 'boss_ok')

        t2_after = self.task(d2)
        self.assertEqual(t2_after.step_key, 'review')
        self.assertTrue(t2_after.is_open)

        # Fresh waiting task with a skip row:
        WorkflowPolicy.objects.filter(company=self.co, workflow_key=WF).update(role_actions={'wf_reviewer': 'wait'})
        d3 = self.doc()
        engine.submit(WF, d3, self.member)
        self.act(self.lead, d3)
        t3 = self.task(d3)
        self.assertEqual(t3.step_key, 'review')

        # Now set row to skip (so row has skip, but recompute has not run yet)
        WorkflowPolicy.objects.filter(company=self.co, workflow_key=WF).update(role_actions={'wf_reviewer': 'skip'})

        # Call recompute_open_tasks with a different workflow key
        stats = recompute_open_tasks(company_ids=[self.co.pk], workflow_keys=['other_key'])
        self.assertEqual(stats['tasks'], 0)
        t3_after = self.task(d3)
        self.assertEqual(t3_after.step_key, 'review')
        self.assertTrue(t3_after.is_open)

    def test_forced_task_not_skipped(self):
        SectionAssignment.objects.filter(user=self.boss).update(is_active=False)
        doc = self.doc()
        engine.open_at_step(WF, doc, self.member, 'boss_ok')
        task = self.task(doc)
        self.assertTrue(task.forced)
        self.assertEqual(task.step_key, 'boss_ok')

        p = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_boss': 'skip'}},
        })
        self.assertEqual(p.status_code, 200)
        self.assertEqual(p.data['counts']['advance'], 0)
        token = p.data['token']

        r = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_boss': 'skip'}}, 'confirm_token': token},
            format='json',
        )
        self.assertEqual(r.status_code, 200)

        task_after = self.task(doc)
        self.assertTrue(task_after.is_open)
        self.assertEqual(task_after.step_key, 'boss_ok')

    def test_company_default_put(self):
        p = self.post(self.editor, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': '',
            'values': {'role_actions': {'wf_reviewer': 'skip'}},
        })
        self.assertEqual(p.status_code, 200)
        token = p.data['token']

        r = self.client_for(self.editor).put(
            f'{API}company-policies/{self.co.pk}/',
            {'values': {'role_actions': {'wf_reviewer': 'skip'}}, 'confirm_token': token},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        row = WorkflowPolicy.objects.filter(company=self.co, workflow_key='').first()
        self.assertIsNotNone(row)
        self.assertEqual(row.role_actions.get('wf_reviewer'), 'skip')

    def test_old_settings_endpoint_writes_policy_row(self):
        r = self.client_for(self.editor).put(
            f'{API}settings/{self.co.pk}/',
            {'creator_may_approve_own': True},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['creator_may_approve_own'])

        policy_row = WorkflowPolicy.objects.get(company=self.co, workflow_key='')
        self.assertTrue(policy_row.creator_may_approve_own)

        settings_row = WorkflowCompanySettings.for_company(self.co.pk)
        self.assertFalse(settings_row.creator_may_approve_own)

        get_res = self.get(self.editor, f'settings/{self.co.pk}/')
        self.assertEqual(get_res.status_code, 200)
        self.assertTrue(get_res.data['creator_may_approve_own'])

    def test_superuser_can_change_settings(self):
        p = self.post(self.su, f'company-policies/{self.co.pk}/preview/', {
            'workflow_key': WF,
            'values': {'role_actions': {'wf_lead': 'wait'}},
        })
        self.assertEqual(p.status_code, 200)
        token = p.data['token']

        r = self.client_for(self.su).put(
            f'{API}company-policies/{self.co.pk}/{WF}/',
            {'values': {'role_actions': {'wf_lead': 'wait'}}, 'confirm_token': token},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(
            WorkflowPolicy.objects.filter(
                company=self.co, workflow_key=WF, role_actions={'wf_lead': 'wait'}
            ).exists()
        )
