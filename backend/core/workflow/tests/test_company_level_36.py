"""
تست‌های گردش کار در سطح شرکت و قلاب required مرحله (طرح ۳.۶-ب).
سندهای سطح شرکت (section_field=None, company_field='company')، دریافت‌کنندگان، جانشین،
سقف مبلغ، رتبهٔ ثبت‌کننده و رد شدن با قلاب required.
"""
import dataclasses
import datetime
from decimal import Decimal

from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone

from workflow import engine
from workflow.models import WorkflowStep, WorkflowSubstitute, WorkflowTaskRecipient, WorkflowThreshold
from workflow.registry import reset_workflow_cache, validate_specs
from workflow.serializers import SKIP_REASON_TITLES
from workflow.tests.base import STEPS, WF, WorkflowTestBase, make_spec

CO_STEPS = (
    STEPS[0],
    STEPS[1],
    dataclasses.replace(STEPS[2], required=lambda o: getattr(o, 'need_boss', True)),
)


class CompanyLevelTests(WorkflowTestBase):
    def setUp(self):
        super().setUp()
        self.specs.append(make_spec(key='zz_co', steps=CO_STEPS, section_field=None, company_field='company'))
        reset_workflow_cache()

    def codoc(self, amount=Decimal('100'), company=None, **extra):
        d = self.doc(amount)
        d.section_id = None
        d.company_id = (company or self.co).pk
        for k, v in extra.items():
            setattr(d, k, v)
        return d

    def test_company_assignment_is_recipient(self):
        co_lead = self.user('co_lead', 'wf_lead', company=self.co)
        self.user('sec_lead', 'wf_lead')
        self.user('pr_lead', 'wf_lead', project=self.pr)
        doc = self.codoc()
        inst = engine.submit('zz_co', doc, self.member)
        task = engine.open_task('zz_co', doc.pk)
        self.assertIsNone(inst.section_id)
        self.assertEqual(inst.company_id, self.co.pk)
        self.assertEqual(task.step_key, 'lead_ok')
        self.assertEqual(self.recipients(task), {co_lead.pk})

    def test_other_company_never_recipient(self):
        x_lead = self.user('x_lead', 'wf_lead', company=self.co2)
        doc = self.codoc()
        engine.submit('zz_co', doc, self.member)
        task = engine.open_task('zz_co', doc.pk)
        if task is not None:
            self.assertNotEqual(task.step_key, 'lead_ok')
        self.assertFalse(WorkflowTaskRecipient.objects.filter(user_id=x_lead.pk).exists())
        self.assertFalse(WorkflowTaskRecipient.objects.filter(user_id=self.lead.pk).exists())

    def test_substitute_of_company_principal(self):
        co_lead = self.user('co_lead', 'wf_lead', company=self.co)
        deputy = self.user('deputy', 'wf_member', company=self.co)
        today = timezone.localdate()
        WorkflowSubstitute.objects.create(
            principal=co_lead,
            substitute=deputy,
            company=None,
            start_date=today - datetime.timedelta(days=1),
            end_date=today + datetime.timedelta(days=3),
        )
        doc = self.codoc()
        engine.submit('zz_co', doc, self.member)
        task = engine.open_task('zz_co', doc.pk)
        self.assertEqual(self.recipients(task), {co_lead.pk, deputy.pk})
        row = WorkflowTaskRecipient.objects.get(task=task, user=deputy)
        self.assertEqual(row.on_behalf_of_id, co_lead.pk)

    def test_creator_rank_company_level(self):
        creator = self.user('co_boss_creator', 'wf_boss', company=self.co)
        self.user('co_lead', 'wf_lead', company=self.co)
        self.user('co_rev', 'wf_reviewer', company=self.co)
        doc = self.codoc()
        inst = engine.submit('zz_co', doc, creator)
        self.assertEqual(inst.creator_rank, 40)
        self.assertEqual(inst.skip_plan.get('lead_ok'), 'creator_level')
        sec_creator = self.user('sec_boss_creator', 'wf_boss')
        doc2 = self.codoc()
        inst2 = engine.submit('zz_co', doc2, sec_creator)
        self.assertEqual(inst2.creator_rank, 0)
        self.assertNotIn('lead_ok', inst2.skip_plan)

    def test_company_threshold_only_same_company(self):
        self.user('co_lead', 'wf_lead', company=self.co)
        WorkflowThreshold.objects.create(
            workflow_key='zz_co', step_key='lead_ok', company=self.co2, amount=Decimal('1000')
        )
        doc1 = self.codoc(Decimal('100'))
        inst = engine.submit('zz_co', doc1, self.member)
        self.assertNotIn('lead_ok', inst.skip_plan)
        WorkflowThreshold.objects.create(
            workflow_key='zz_co', step_key='lead_ok', company=self.co, amount=Decimal('500')
        )
        doc2 = self.codoc(Decimal('100'))
        inst2 = engine.submit('zz_co', doc2, self.member)
        self.assertEqual(inst2.skip_plan.get('lead_ok'), 'threshold')

    def test_required_false_skips_with_reason(self):
        self.user('co_lead', 'wf_lead', company=self.co)
        doc1 = self.codoc(need_boss=False)
        inst = engine.submit('zz_co', doc1, self.member)
        self.assertEqual(inst.skip_plan.get('boss_ok'), 'not_required')
        submit_row = WorkflowStep.objects.get(instance=inst, action=WorkflowStep.SUBMIT)
        self.assertIn({'step': 'boss_ok', 'reason': 'not_required'}, submit_row.skipped)
        doc2 = self.codoc(need_boss=True)
        inst2 = engine.submit('zz_co', doc2, self.member)
        self.assertNotIn('boss_ok', inst2.skip_plan)
        self.assertIn('not_required', SKIP_REASON_TITLES)

    def test_section_document_unchanged(self):
        co_only = self.user('co_only', 'wf_lead', company=self.co2)
        doc = self.doc()
        inst = engine.submit(WF, doc, self.member)
        task = engine.open_task(WF, doc.pk)
        self.assertEqual(inst.section_id, self.sec.pk)
        self.assertEqual(task.step_key, 'lead_ok')
        self.assertIn(self.lead.pk, self.recipients(task))
        self.assertNotIn(co_only.pk, self.recipients(task))

    def test_validate_specs_rejects_bad_specs(self):
        with self.assertRaises(ImproperlyConfigured):
            validate_specs([make_spec(key='zz_bad1', steps=(dataclasses.replace(STEPS[1], required=lambda o: True),))])
        with self.assertRaises(ImproperlyConfigured):
            validate_specs([make_spec(key='zz_bad2', section_field=None, company_field=None)])
        res = validate_specs([make_spec(key='zz_ok', section_field=None, company_field='company')])
        self.assertIn('zz_ok', res)
