"""طرح ۲.۳-الف: اعتبارسنجی اعلام گردش‌ها (ت۱) و بررسی سامانه‌ای workflow.E001."""
from django.core.exceptions import ImproperlyConfigured

from workflow.apps import check_workflow_specs
from workflow.registry import APPROVE, StepSpec, get_spec, reset_workflow_cache, validate_specs, workflow_specs

from .base import STEPS, WF, WorkflowTestBase, make_spec


class RegistryValidationTests(WorkflowTestBase):
    def assertInvalid(self, spec, fragment):
        with self.assertRaises(ImproperlyConfigured) as cm:
            validate_specs([spec])
        self.assertIn(fragment, str(cm.exception))

    def step(self, **kw):
        params = dict(key='s1', title_fa='مرحله', role='wf_lead', permission='zz_wf_approve', kind=APPROVE)
        params.update(kw)
        return StepSpec(**params)

    def test_valid_spec_cached(self):
        self.assertIs(workflow_specs()[WF], get_spec(WF))
        self.assertEqual(get_spec(WF).step_keys, [s.key for s in STEPS])

    def test_duplicate_workflow_key(self):
        with self.assertRaises(ImproperlyConfigured) as cm:
            validate_specs([make_spec(), make_spec()])
        self.assertIn(WF, str(cm.exception))

    def test_bad_version(self):
        self.assertInvalid(make_spec(version=0), WF)

    def test_no_steps(self):
        self.assertInvalid(make_spec(steps=()), WF)

    def test_duplicate_step_keys(self):
        self.assertInvalid(make_spec(steps=(self.step(), self.step())), WF)

    def test_terminal_step_key(self):
        self.assertInvalid(make_spec(steps=(self.step(key='completed'),)), 'completed')

    def test_bad_kind_and_actions(self):
        self.assertInvalid(make_spec(steps=(self.step(kind='vote'),)), 's1')
        self.assertInvalid(make_spec(steps=(self.step(actions=('return',)),)), 's1')
        self.assertInvalid(make_spec(steps=(self.step(actions=('act', 'fly')),)), 's1')

    def test_unknown_or_unranked_role(self):
        self.assertInvalid(make_spec(steps=(self.step(role='wf_ghost'),)), 'wf_ghost')
        self.assertInvalid(make_spec(steps=(self.step(role='wf_legacy'),)), 'wf_legacy')

    def test_permission_must_be_declared_section(self):
        self.assertInvalid(make_spec(steps=(self.step(permission='zz_wf_sys'),)), 'zz_wf_sys')
        self.assertInvalid(make_spec(steps=(self.step(permission='zz_wf_missing'),)), 'zz_wf_missing')

    def test_route_and_callables(self):
        self.assertInvalid(make_spec(route='/app/zz'), WF)
        self.assertInvalid(make_spec(summary='x'), WF)

    def test_system_check_reports_e001(self):
        self.assertEqual(check_workflow_specs(None), [])
        self.specs.append(make_spec(steps=(self.step(role='wf_ghost'),), key='zz_bad'))
        reset_workflow_cache()
        errors = check_workflow_specs(None)
        self.assertEqual([e.id for e in errors], ['workflow.E001'])
        self.assertIn('zz_bad', errors[0].msg)
