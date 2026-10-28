# -*- coding: utf-8 -*-
"""
Release v1 step 4.5-c: payroll workflow, lock and treasury API tests.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.attendance_periods import get_or_create_period
from personnel.models import (
    DailyAttendance,
    MonthlyPayrollRecord,
    MonthlyWorkPeriod,
    PersonnelProfile,
)
from personnel.payroll_engine import PayrollCalculationEngine
from personnel.scoped_test_support import grant_section_perms
from personnel.test_payroll_45_excel import YM, _PayrollFixtureMixin
from personnel.workflows import PAYROLL_PERIOD_WORKFLOW
from workflow import engine
from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance

User = get_user_model()
API = '/api/personnel/monthly-payroll/'
TREASURY_API = '/api/personnel/cartable/treasury/'
VALID_SHEBA_1 = 'IR820540102680020817909002'
VALID_SHEBA_2 = 'IR450120000000101111111001'


class _Base(_PayrollFixtureMixin):
    def person(self, code, section, user=None, account_number=None, company=None, project=None, sheba_number=VALID_SHEBA_1):
        return PersonnelProfile.objects.create(
            first_name='نفر', last_name=code, national_code=f'4520000{code}',
            company=company or section.project.company,
            project=project or section.project, section=section, is_active=True, approval_status='approved', job_grade='10',
            contract_hours=230, contract_base_salary=400000000, user=user,
            account_number=account_number or f'60379900000{code}',
            sheba_number=sheba_number,
        )

    def attend(self, personnel, section, total_hours=200, days=20, approval='APPROVED'):
        return DailyAttendance.objects.bulk_create(
            self.day_rows(personnel, section, section.project, total_hours, days, approval=approval)
        )

    def calc(self, period):
        return PayrollCalculationEngine(period).calculate_period(period)

    def make_user(self, name, codes=(), section=None, company=None, role='employee'):
        company = company or self.company
        sec = section or self.section
        u = User.objects.create_user(username=f'p45w_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), section=sec, role=role, exact=True)
        return u

    def client_for(self, user, company=None):
        c = APIClient()
        c.force_authenticate(user)
        c.credentials(HTTP_X_COMPANY_ID=str((company or self.company).pk))
        return c


class Payroll45WorkflowTests(_Base, TestCase):
    def setUp(self):
        self.company, self.project, self.section = self.make_org('P45W1')
        self.make_settings(self.company)
        self.period = self.ready_period(self.section)
        self.accountant = self.make_user('acc', ['view_sys_payroll'], role='accountant')
        self.manager = self.make_user('mgr', ['perm_manager_payment_authorize', 'perm_lock_work_period'], role='manager')
        self.treasurer = self.make_user('trs', ['perm_treasury_disburse_action'], role='treasury')

    def test_full_flow_to_paid(self):
        p1 = self.person('101', self.section, sheba_number=VALID_SHEBA_1)
        p2 = self.person('102', self.section, sheba_number=VALID_SHEBA_2)
        self.attend(p1, self.section)
        self.attend(p2, self.section)
        self.calc(self.period)

        client_acc = self.client_for(self.accountant)
        res_submit = client_acc.post(f'{API}submit-workflow/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res_submit.status_code, 200)

        task = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'manager_ok')

        engine.act(self.manager, task)

        records = MonthlyPayrollRecord.objects.filter(period=self.period)
        self.assertEqual(records.count(), 2)
        for r in records:
            self.assertEqual(r.payment_status, 'READY_TO_PAY')

        task_pay = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertIsNotNone(task_pay)
        self.assertEqual(task_pay.step_key, 'treasury_pay')

        client_trs = self.client_for(self.treasurer)
        res_disburse = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_period', 'period_id': self.period.id, 'tracking_code': 'TRK-P45W-001'},
            format='json'
        )
        self.assertEqual(res_disburse.status_code, 200)

        self.period.refresh_from_db()
        self.assertEqual(self.period.status, 'PAID')

        for r in MonthlyPayrollRecord.objects.filter(period=self.period):
            self.assertEqual(r.payment_status, 'PAID')
            self.assertEqual(r.payment_tracking_code, 'TRK-P45W-001')

        inst = engine.instance_of(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)

    def test_manager_return_frees_recalculation(self):
        p1 = self.person('201', self.section, sheba_number=VALID_SHEBA_1)
        p2 = self.person('202', self.section, sheba_number=VALID_SHEBA_2)
        self.attend(p1, self.section)
        self.attend(p2, self.section)
        self.calc(self.period)

        client_acc = self.client_for(self.accountant)
        res_submit = client_acc.post(f'{API}submit-workflow/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res_submit.status_code, 200)

        task = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'manager_ok')

        engine.return_for_fix(self.manager, task, 'fix')

        for r in MonthlyPayrollRecord.objects.filter(period=self.period):
            self.assertEqual(r.payment_status, 'PENDING')

        self.assertIsNone(engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id))

        res_calc = client_acc.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res_calc.status_code, 200)

        res_submit2 = client_acc.post(f'{API}submit-workflow/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res_submit2.status_code, 200)

    def test_treasury_cannot_pay_before_manager(self):
        p1 = self.person('301', self.section, sheba_number=VALID_SHEBA_1)
        p2 = self.person('302', self.section, sheba_number=VALID_SHEBA_2)
        self.attend(p1, self.section)
        self.attend(p2, self.section)
        self.calc(self.period)

        client_acc = self.client_for(self.accountant)
        res_submit = client_acc.post(f'{API}submit-workflow/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res_submit.status_code, 200)

        task = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertEqual(task.step_key, 'manager_ok')

        client_trs = self.client_for(self.treasurer)
        res_pay = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_period', 'period_id': self.period.id, 'tracking_code': 'TRK-EARLY'},
            format='json'
        )
        self.assertEqual(res_pay.status_code, 400)
        self.assertEqual(res_pay.json().get('code'), 'not_ready_to_pay')

        res_get = client_trs.get(TREASURY_API)
        self.assertEqual(res_get.status_code, 200)
        period_ids = [p['id'] for p in res_get.json().get('periods', [])]
        self.assertNotIn(self.period.id, period_ids)

        self.period.refresh_from_db()
        self.assertEqual(self.period.status, 'READY_TO_PAY')

    def test_pay_needs_tracking_code_and_pays_once(self):
        p1 = self.person('401', self.section, sheba_number=VALID_SHEBA_1)
        p2 = self.person('402', self.section, sheba_number=VALID_SHEBA_2)
        self.attend(p1, self.section)
        self.attend(p2, self.section)
        self.calc(self.period)

        client_acc = self.client_for(self.accountant)
        client_acc.post(f'{API}submit-workflow/', {'period_id': self.period.id}, format='json')

        task = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        engine.act(self.manager, task)

        task_trs = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertEqual(task_trs.step_key, 'treasury_pay')

        with self.assertRaises(WorkflowError) as cm:
            engine.act(self.treasurer, task_trs)
        self.assertEqual(cm.exception.code, 'tracking_code_required')

        self.period.refresh_from_db()
        self.assertNotEqual(self.period.status, 'PAID')

        client_trs = self.client_for(self.treasurer)
        res_disburse = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_period', 'period_id': self.period.id, 'tracking_code': 'TRK-ONCE-01'},
            format='json'
        )
        self.assertEqual(res_disburse.status_code, 200)

        self.period.refresh_from_db()
        self.assertEqual(self.period.status, 'PAID')

        paid_ats = {r.id: r.paid_at for r in MonthlyPayrollRecord.objects.filter(period=self.period)}
        for paid_at in paid_ats.values():
            self.assertIsNotNone(paid_at)

        res_second = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_period', 'period_id': self.period.id, 'tracking_code': 'TRK-ONCE-01'},
            format='json'
        )
        self.assertEqual(res_second.status_code, 400)

        for r in MonthlyPayrollRecord.objects.filter(period=self.period):
            self.assertEqual(r.paid_at, paid_ats[r.id])

    def test_failed_sheba_split_and_single_repay(self):
        p_ok = self.person('501', self.section, sheba_number=VALID_SHEBA_1)
        p_bad = self.person('502', self.section, sheba_number='')
        self.attend(p_ok, self.section)
        self.attend(p_bad, self.section)
        self.calc(self.period)

        client_acc = self.client_for(self.accountant)
        client_acc.post(f'{API}submit-workflow/', {'period_id': self.period.id}, format='json')

        task = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        engine.act(self.manager, task)

        client_trs = self.client_for(self.treasurer)
        res_disburse = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_period', 'period_id': self.period.id, 'tracking_code': 'TRK-SPLIT-01'},
            format='json'
        )
        self.assertEqual(res_disburse.status_code, 200)

        self.period.refresh_from_db()
        self.assertEqual(self.period.status, 'PAID')

        rec_ok = MonthlyPayrollRecord.objects.get(period=self.period, personnel=p_ok)
        rec_bad = MonthlyPayrollRecord.objects.get(period=self.period, personnel=p_bad)
        self.assertEqual(rec_ok.payment_status, 'PAID')
        self.assertEqual(rec_bad.payment_status, 'FAILED_SHEBA')

        res_single_paid = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_single_payroll', 'payroll_id': rec_ok.id, 'tracking_code': 'TRK-SINGLE-01'},
            format='json'
        )
        self.assertEqual(res_single_paid.status_code, 400)
        self.assertEqual(res_single_paid.json().get('code'), 'not_failed_sheba')

        p_bad.sheba_number = VALID_SHEBA_2
        p_bad.save(update_fields=['sheba_number'])

        res_single_failed = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_single_payroll', 'payroll_id': rec_bad.id, 'tracking_code': 'TRK-SINGLE-02'},
            format='json'
        )
        self.assertEqual(res_single_failed.status_code, 200)

        rec_bad.refresh_from_db()
        self.assertEqual(rec_bad.payment_status, 'PAID')
        self.assertEqual(rec_bad.payment_tracking_code, 'TRK-SINGLE-02')

    def test_lock_after_manager_approval(self):
        p1 = self.person('601', self.section, sheba_number=VALID_SHEBA_1)
        p2 = self.person('602', self.section, sheba_number=VALID_SHEBA_2)
        self.attend(p1, self.section)
        self.attend(p2, self.section)
        self.calc(self.period)

        client_acc = self.client_for(self.accountant)
        client_acc.post(f'{API}submit-workflow/', {'period_id': self.period.id}, format='json')

        task = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        engine.act(self.manager, task)

        rec = MonthlyPayrollRecord.objects.filter(period=self.period).first()

        res_calc = client_acc.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res_calc.status_code, 400)
        self.assertEqual(res_calc.json().get('code'), 'payroll_locked')

        res_patch = client_acc.patch(f'{API}{rec.id}/', {'overtime_hours': 15}, format='json')
        self.assertEqual(res_patch.status_code, 400)
        self.assertEqual(res_patch.json().get('code'), 'payroll_locked')

        res_tax = client_acc.post(
            f'{API}import-tax-excel/',
            {'period_id': self.period.id, 'items': [{'national_code': rec.national_code, 'tax_amount': 2000}]},
            format='json'
        )
        self.assertEqual(res_tax.status_code, 400)
        self.assertEqual(res_tax.json().get('code'), 'payroll_locked')

        res_hold = client_acc.post(f'{API}{rec.id}/release-payment-hold/', format='json')
        self.assertEqual(res_hold.status_code, 400)
        self.assertEqual(res_hold.json().get('code'), 'payroll_locked')

        client_mgr = self.client_for(self.manager)
        res_unlock = client_mgr.post(
            f'/api/personnel/periods/{self.period.id}/unlock/',
            {'reason': 'unlock attempt'},
            format='json'
        )
        self.assertEqual(res_unlock.status_code, 400)
        self.assertEqual(res_unlock.json().get('code'), 'payroll_exists')

    def test_treasury_404s(self):
        client_trs = self.client_for(self.treasurer)

        res_period_404 = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_period', 'period_id': 987654, 'tracking_code': 'TRK-987654'},
            format='json'
        )
        self.assertEqual(res_period_404.status_code, 404)

        company_b, proj_b, sec_b = self.make_org('P45W2')
        self.make_settings(company_b)
        period_b = self.ready_period(sec_b)

        res_cross_disburse = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_period', 'period_id': period_b.id, 'tracking_code': 'TRK-CROSS'},
            format='json'
        )
        self.assertEqual(res_cross_disburse.status_code, 404)

        res_cross_diskette = client_trs.get(
            f'{TREASURY_API}export-diskette/?period_id={period_b.id}&type=paya'
        )
        self.assertEqual(res_cross_diskette.status_code, 404)

        res_single_404 = client_trs.post(
            TREASURY_API,
            {'action': 'disburse_single_payroll', 'payroll_id': 987654, 'tracking_code': 'TRK-S987654'},
            format='json'
        )
        self.assertEqual(res_single_404.status_code, 404)

    def test_open_workflows_command_idempotent(self):
        p1 = self.person('801', self.section, sheba_number=VALID_SHEBA_1)
        p2 = self.person('802', self.section, sheba_number=VALID_SHEBA_2)
        self.attend(p1, self.section)
        self.attend(p2, self.section)
        self.calc(self.period)

        self.assertEqual(self.period.status, 'READY_TO_PAY')
        self.assertTrue(self.period.payroll_records.exists())
        self.assertIsNone(engine.instance_of(PAYROLL_PERIOD_WORKFLOW, self.period.id))

        call_command('payroll_open_workflows', '--dry-run')
        self.assertIsNone(engine.instance_of(PAYROLL_PERIOD_WORKFLOW, self.period.id))

        call_command('payroll_open_workflows')
        inst = engine.instance_of(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertIsNotNone(inst)
        task = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'manager_ok')

        call_command('payroll_open_workflows')
        instances = WorkflowInstance.objects.filter(
            workflow_key=PAYROLL_PERIOD_WORKFLOW, entity_id=str(self.period.id)
        )
        self.assertEqual(instances.count(), 1)
        task_after = engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.id)
        self.assertIsNotNone(task_after)
        self.assertEqual(task_after.step_key, 'manager_ok')
