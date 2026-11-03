# -*- coding: utf-8 -*-
"""
Release role-policy plan step D tests:
Payment step skipped = settled outside (5 payment workflows), settle-outside hooks,
petty balance unchanged, superuser write fence, legacy notifications without superusers.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.superuser_fence import reset_cache as reset_superuser_fence_cache
from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.attendance_periods import get_or_create_period
from personnel.lifecycle_services import _workflow_recipient_ids
from personnel.models import (
    Counterparty,
    DailyAttendance,
    ExpenseInvoice,
    InvoicePayment,
    MonthlyPayrollRecord,
    PersonnelProfile,
    PettyCashAccount,
    PettyCashDebtSettlement,
    PettyCashStatement,
    PettyCashTransaction,
    VehicleBankAccount,
    VehicleDriverProfile,
    VehicleTripLog,
)
from personnel.payroll_engine import PayrollCalculationEngine
from personnel.scoped_test_support import give_valid_sheba, grant_section_perms, temp_media
from personnel.test_payroll_45_excel import _PayrollFixtureMixin
from personnel.workflows import (
    FLEET_PERIOD_WORKFLOW,
    INVOICE_WORKFLOW,
    PAYROLL_PERIOD_WORKFLOW,
    PETTY_CHARGE_WORKFLOW,
    PETTY_STATEMENT_WORKFLOW,
    fleet_open_task,
    is_fleet_locked,
    is_invoice_locked,
    is_payroll_locked,
    is_payroll_period_closed,
    petty_fund_level_breakdown,
)
from platform_core.registry import can_attach
from workflow import engine as wf_engine
from workflow.models import WorkflowInstance, WorkflowPolicy, WorkflowStep
from workflow.recompute import recompute_open_tasks

User = get_user_model()
VALID_SHEBA_1 = 'IR820540102680020817909002'
VALID_SHEBA_2 = 'IR450120000000101111111001'


@temp_media
class InvoiceRolePolicyPaymentTests(TestCase):
    def setUp(self):
        reset_superuser_fence_cache()
        self.company = Company.objects.create(code='IRP-CO', name='شرکت گردش فاکتور', is_active=True)
        self.project = Project.objects.create(company=self.company, code='IRP-P', name='پروژه فاکتور')
        self.sec = ProjectSection.objects.create(project=self.project, code='IRP-S', name='بخش فاکتور')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف حساب', counterparty_type='other')
        give_valid_sheba(self.cp)
        self.emp = self.user('emp', 'employee')
        self.sup = self.user('sup', 'supervisor', ['perm_approve_personnel_supervisor', 'perm_invoice_approve'])
        self.acc = self.user('acc', 'accountant', ['perm_invoice_review'])
        self.mgr = self.user('mgr', 'manager', ['perm_manager_payment_authorize'])
        self.trs = self.user('trs', 'treasury', ['perm_treasury_disburse_action'])

    def user(self, name, role, codes=()):
        u = User.objects.create_user(username=f'irp_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, list(codes), section=self.sec, role=role, exact=False)
        return u

    def invoice(self, creator, amount='1000'):
        return ExpenseInvoice.objects.create(
            section=self.sec,
            counterparty=self.cp,
            invoice_number=f'IRP-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01',
            amount=Decimal(amount),
            description='شرح هزینه',
            created_by=creator,
        )

    def test_invoice_settled_outside_without_treasurer(self):
        inv = self.invoice(self.emp, amount='1000')
        wf_engine.submit(INVOICE_WORKFLOW, inv, self.emp)
        wf_engine.act(self.sup, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.acc, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.mgr, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))

        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'treasury_pay')

        # No treasurer: deactivate treasury assignments and set company policy to skip
        SectionAssignment.objects.filter(user=self.trs).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})

        recompute_open_tasks(company_ids=[self.company.pk])

        inst = wf_engine.instance_of(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertTrue(inst.settled_outside)
        self.assertIsNone(wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))

        last_step = inst.steps.order_by('-id').first()
        self.assertEqual(last_step.action, WorkflowStep.AUTO)
        self.assertIn({'step': 'treasury_pay', 'reason': 'payment_outside'}, last_step.skipped)

        inv.refresh_from_db()
        self.assertEqual(inv.status, 'settled_outside')
        self.assertEqual(inv.paid_amount, Decimal('0'))
        self.assertEqual(inv.payments.count(), 0)
        self.assertFalse(inv.payment_ref)

    def test_invoice_with_installment_waits(self):
        inv = self.invoice(self.emp, amount='1000')
        wf_engine.submit(INVOICE_WORKFLOW, inv, self.emp)
        wf_engine.act(self.sup, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.acc, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.mgr, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))

        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(task.step_key, 'treasury_pay')

        # Record installment (paid_amount > 0)
        InvoicePayment.objects.create(
            invoice=inv,
            amount=Decimal('400'),
            payment_date_shamsi='1405/08/10',
            method='transfer',
            created_by=self.trs,
        )
        inv.paid_amount = Decimal('400')
        inv.save(update_fields=['paid_amount'])

        # Deactivate treasurer and set policy to skip
        SectionAssignment.objects.filter(user=self.trs).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})

        recompute_open_tasks(company_ids=[self.company.pk])

        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'treasury_pay')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

        inst = wf_engine.instance_of(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(inst.status, WorkflowInstance.IN_PROGRESS)
        self.assertFalse(inst.settled_outside)

    def test_invoice_settled_outside_is_locked(self):
        inv = self.invoice(self.emp, amount='1000')
        wf_engine.submit(INVOICE_WORKFLOW, inv, self.emp)
        wf_engine.act(self.sup, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.acc, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.mgr, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))

        SectionAssignment.objects.filter(user=self.trs).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})
        recompute_open_tasks(company_ids=[self.company.pk])

        inv.refresh_from_db()
        self.assertEqual(inv.status, 'settled_outside')
        self.assertTrue(is_invoice_locked(inv.pk))

        c = APIClient()
        c.force_authenticate(self.emp)
        res = c.patch(
            f'/api/personnel/expense-invoices/{inv.pk}/',
            {'description': 'ویرایش غیرمجاز'},
            format='json',
            HTTP_X_COMPANY_ID=str(self.company.pk),
        )
        self.assertEqual(res.status_code, 403)

    def test_treasury_wait_policy_keeps_task_open(self):
        inv = self.invoice(self.emp, amount='1000')
        wf_engine.submit(INVOICE_WORKFLOW, inv, self.emp)
        wf_engine.act(self.sup, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.acc, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        wf_engine.act(self.mgr, wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))

        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(task.step_key, 'treasury_pay')

        # No treasurer: deactivate treasury assignments (module default is 'wait')
        SectionAssignment.objects.filter(user=self.trs).update(is_active=False)

        recompute_open_tasks(company_ids=[self.company.pk])

        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'treasury_pay')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

        inst = wf_engine.instance_of(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(inst.status, WorkflowInstance.IN_PROGRESS)
        self.assertFalse(inst.settled_outside)


@temp_media
class PettyCashRolePolicyPaymentTests(TestCase):
    def setUp(self):
        reset_superuser_fence_cache()
        self.company = Company.objects.create(code='PRP-CO', name='شرکت گردش تنخواه', is_active=True)
        self.project = Project.objects.create(company=self.company, code='PRP-P', name='پروژه تنخواه')
        self.sec = ProjectSection.objects.create(project=self.project, code='PRP-S', name='بخش تنخواه')
        self.emp = self.user('emp', 'employee', ['perm_petty_cash_manage'])
        self.acc = self.user('acc', 'accountant', ['perm_invoice_review'])
        self.mgr = self.user('mgr', 'manager', ['perm_manager_payment_authorize'])
        self.trs = self.user('trs', 'treasury', ['perm_treasury_disburse_action'])
        self.account = PettyCashAccount.objects.create(
            company=self.company,
            custodian=self.emp,
            ceiling_amount=Decimal('1000000'),
            opening_balance=Decimal('200000'),
        )

    def user(self, name, role, codes=()):
        u = User.objects.create_user(username=f'prp_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, list(codes), company=self.company, role=role, exact=False)
        return u

    def test_petty_charge_settled_outside_balance_unchanged(self):
        b_before = petty_fund_level_breakdown(self.account)

        tx = PettyCashTransaction.objects.create(
            account=self.account,
            transaction_type='allocation',
            amount=Decimal('50000'),
            custodian=self.emp,
            status='draft',
        )
        wf_engine.submit(PETTY_CHARGE_WORKFLOW, tx, self.emp)
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk))

        task = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk)
        if task and task.step_key == 'manager_ok':
            wf_engine.act(self.mgr, task)
            task = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk)

        self.assertEqual(task.step_key, 'treasury_pay')

        SectionAssignment.objects.filter(user=self.trs).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})
        recompute_open_tasks(company_ids=[self.company.pk])

        inst = wf_engine.instance_of(PETTY_CHARGE_WORKFLOW, tx.pk)
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertTrue(inst.settled_outside)
        self.assertIsNone(wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk))

        last_step = inst.steps.order_by('-id').first()
        self.assertEqual(last_step.action, WorkflowStep.AUTO)
        self.assertIn({'step': 'treasury_pay', 'reason': 'payment_outside'}, last_step.skipped)

        tx.refresh_from_db()
        self.assertEqual(tx.status, 'settled_outside')
        self.assertFalse(tx.receipt_number)

        b_after = petty_fund_level_breakdown(self.account)
        self.assertEqual(b_after['received_total'], b_before['received_total'])
        self.assertEqual(b_after['fund_level'], b_before['fund_level'])

    def test_petty_charge_with_offset_waits(self):
        tx = PettyCashTransaction.objects.create(
            account=self.account,
            transaction_type='allocation',
            amount=Decimal('50000'),
            custodian=self.emp,
            status='draft',
        )
        PettyCashDebtSettlement.objects.create(
            account=self.account,
            company=self.company,
            amount=Decimal('10000'),
            method='charge_offset',
            status='pending',
            charge=tx,
        )
        wf_engine.submit(PETTY_CHARGE_WORKFLOW, tx, self.emp)
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk))
        task = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk)
        if task and task.step_key == 'manager_ok':
            wf_engine.act(self.mgr, task)
            task = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk)

        self.assertEqual(task.step_key, 'treasury_pay')

        SectionAssignment.objects.filter(user=self.trs).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})
        recompute_open_tasks(company_ids=[self.company.pk])

        task = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'treasury_pay')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

        inst = wf_engine.instance_of(PETTY_CHARGE_WORKFLOW, tx.pk)
        self.assertEqual(inst.status, WorkflowInstance.IN_PROGRESS)
        self.assertFalse(inst.settled_outside)

    def test_petty_statement_settled_outside_no_refill(self):
        statement = PettyCashStatement.objects.create(
            company=self.company,
            account=self.account,
            custodian=self.emp,
            statement_date_shamsi='1405/08/10',
            total_amount=Decimal('50000'),
        )
        line = PettyCashTransaction.objects.create(
            statement=statement,
            line_status='open',
            transaction_type='expense',
            amount=Decimal('50000'),
            account=self.account,
            custodian=self.emp,
            status='draft',
        )
        wf_engine.submit(PETTY_STATEMENT_WORKFLOW, statement, self.emp)
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, statement.pk))
        wf_engine.act(self.mgr, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, statement.pk))

        task = wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, statement.pk)
        self.assertEqual(task.step_key, 'treasury_pay')

        SectionAssignment.objects.filter(user=self.trs).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})
        recompute_open_tasks(company_ids=[self.company.pk])

        inst = wf_engine.instance_of(PETTY_STATEMENT_WORKFLOW, statement.pk)
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertTrue(inst.settled_outside)
        self.assertIsNone(wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, statement.pk))

        last_step = inst.steps.order_by('-id').first()
        self.assertEqual(last_step.action, WorkflowStep.AUTO)
        self.assertIn({'step': 'treasury_pay', 'reason': 'payment_outside'}, last_step.skipped)

        statement.refresh_from_db()
        self.assertEqual(statement.status, 'settled_outside')
        line.refresh_from_db()
        self.assertEqual(line.line_status, 'approved')
        self.assertEqual(line.status, 'approved')
        self.assertFalse(
            PettyCashTransaction.objects.filter(account=self.account, source='statement_refill').exists()
        )


@temp_media
class PayrollRolePolicyPaymentTests(_PayrollFixtureMixin, TestCase):
    def setUp(self):
        reset_superuser_fence_cache()
        self.company, self.project, self.section = self.make_org('PRL-CO')
        self.make_settings(self.company)
        self.period = self.ready_period(self.section)
        self.accountant = self.make_user('acc', ['view_sys_payroll'], role='accountant')
        self.manager = self.make_user('mgr', ['perm_manager_payment_authorize', 'perm_lock_work_period'], role='manager')
        self.treasurer = self.make_user('trs', ['perm_treasury_disburse_action'], role='treasury')

    def make_user(self, name, codes=(), section=None, company=None, role='employee'):
        company = company or self.company
        sec = section or self.section
        u = User.objects.create_user(username=f'prl_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), section=sec, role=role, exact=True)
        return u

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

    def test_payroll_settled_outside_rows(self):
        p1 = self.person('101', self.section, sheba_number=VALID_SHEBA_1)
        p2 = self.person('102', self.section, sheba_number=VALID_SHEBA_2)
        self.attend(p1, self.section)
        self.attend(p2, self.section)
        self.calc(self.period)

        wf_engine.submit(PAYROLL_PERIOD_WORKFLOW, self.period, self.accountant)
        task = wf_engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.pk)
        self.assertEqual(task.step_key, 'manager_ok')
        wf_engine.act(self.manager, task)

        task_pay = wf_engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.pk)
        self.assertEqual(task_pay.step_key, 'treasury_pay')

        records = MonthlyPayrollRecord.objects.filter(period=self.period)
        self.assertTrue(records.exists())
        for r in records:
            self.assertEqual(r.payment_status, 'READY_TO_PAY')

        SectionAssignment.objects.filter(user=self.treasurer).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})
        recompute_open_tasks(company_ids=[self.company.pk])

        inst = wf_engine.instance_of(PAYROLL_PERIOD_WORKFLOW, self.period.pk)
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertTrue(inst.settled_outside)
        self.assertIsNone(wf_engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.pk))

        last_step = inst.steps.order_by('-id').first()
        self.assertEqual(last_step.action, WorkflowStep.AUTO)
        self.assertIn({'step': 'treasury_pay', 'reason': 'payment_outside'}, last_step.skipped)

        records = MonthlyPayrollRecord.objects.filter(period=self.period)
        for r in records:
            self.assertEqual(r.payment_status, 'SETTLED_OUTSIDE')
            self.assertNotEqual(r.payment_status, 'PAID')
            self.assertFalse(r.payment_tracking_code)

        self.assertTrue(is_payroll_locked(self.period))
        self.assertTrue(is_payroll_period_closed(self.period.pk))

    def test_payroll_with_petty_deduction_waits(self):
        p1 = self.person('201', self.section, sheba_number=VALID_SHEBA_1)
        self.attend(p1, self.section)
        self.calc(self.period)

        wf_engine.submit(PAYROLL_PERIOD_WORKFLOW, self.period, self.accountant)
        task = wf_engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.pk)
        self.assertEqual(task.step_key, 'manager_ok')
        wf_engine.act(self.manager, task)

        task_pay = wf_engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.pk)
        self.assertEqual(task_pay.step_key, 'treasury_pay')

        row = MonthlyPayrollRecord.objects.filter(period=self.period, payment_status='READY_TO_PAY').first()
        self.assertIsNotNone(row)
        row.petty_settlement_ids = [999]
        row.save(update_fields=['petty_settlement_ids'])

        SectionAssignment.objects.filter(user=self.treasurer).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})
        recompute_open_tasks(company_ids=[self.company.pk])

        task = wf_engine.open_task(PAYROLL_PERIOD_WORKFLOW, self.period.pk)
        self.assertIsNotNone(task)
        self.assertEqual(task.step_key, 'treasury_pay')
        self.assertTrue(task.is_open)
        self.assertFalse(task.has_recipients)
        self.assertEqual(task.wait_reason, 'no_holder')

        inst = wf_engine.instance_of(PAYROLL_PERIOD_WORKFLOW, self.period.pk)
        self.assertEqual(inst.status, WorkflowInstance.IN_PROGRESS)
        self.assertFalse(inst.settled_outside)


@temp_media
class FleetRolePolicyPaymentTests(TestCase):
    def setUp(self):
        reset_superuser_fence_cache()
        self.company = Company.objects.create(code='FLT-CO', name='شرکت گردش ناوگان', is_active=True)
        self.project = Project.objects.create(company=self.company, code='FLT-P', name='پروژه ناوگان')
        self.section = ProjectSection.objects.create(project=self.project, code='FLT-S', name='بخش ناوگان')
        self.operator = self.make_user('op', ['view_sys_fleet_attendance'])
        self.supervisor = self.make_user('sup', ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance'],
                                         role='supervisor')
        self.accountant = self.make_user('acc', ['perm_approve_fleet_finance', 'view_sys_fleet_settlement'],
                                         role='accountant')
        self.manager = self.make_user('mgr', ['perm_approve_fleet_manager'], role='manager')
        self.treasurer = self.make_user('trs', ['perm_treasury_disburse_action'], role='treasury')

        self.rented1 = self.make_vehicle('11ب111-11', 'contract', sheba=VALID_SHEBA_1)
        self.rented2 = self.make_vehicle('22ب222-22', 'contract', sheba=VALID_SHEBA_2)

    def make_user(self, name, codes, role='employee'):
        u = User.objects.create_user(username=f'flt_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, list(codes), section=self.section, role=role, exact=True)
        return u

    def make_vehicle(self, plate, ownership, sheba=VALID_SHEBA_1):
        v = VehicleDriverProfile.objects.create(
            plate_number=plate, ownership_type=ownership, driver_name=f'راننده {plate}', driver_phone='09170000000',
            driver_national_code='0012345679', default_service_rate=1000, sheba_number=sheba,
            account_number='0105678901004', bank_name='بانک ملی ایران', section=self.section,
            project=self.project, company=self.company,
            approval_status='approved', is_active=True, valid_until_date='1406/12/29',
            insurance_expiry_date='1406/12/29', inspection_expiry_date='1406/12/29',
            license_expiry_date='1406/12/29',
        )
        if sheba:
            VehicleBankAccount.objects.create(vehicle=v, bank_name='بانک ملی ایران', account_number='0105678901004',
                                              sheba_number=sheba, account_owner_name=v.driver_name,
                                              is_primary=True, is_active=True)
        return v

    def test_fleet_settled_outside_trips_unsettled(self):
        period, _ = get_or_create_period(None, self.section.pk, '1405/06')
        VehicleTripLog.objects.create(
            vehicle=self.rented1,
            period=period,
            section=self.section,
            project=self.project,
            date_shamsi='1405/06/05',
            trip_count=3,
            unit_rate=Decimal('1000'),
            total_amount=Decimal('3000'),
            is_settled=False,
            payment_tracking_code='',
        )
        VehicleTripLog.objects.create(
            vehicle=self.rented2,
            period=period,
            section=self.section,
            project=self.project,
            date_shamsi='1405/06/06',
            trip_count=2,
            unit_rate=Decimal('2000'),
            total_amount=Decimal('4000'),
            is_settled=False,
            payment_tracking_code='',
        )

        wf_engine.submit(FLEET_PERIOD_WORKFLOW, period, self.operator)
        wf_engine.act(self.supervisor, fleet_open_task(period.pk))
        wf_engine.act(self.accountant, fleet_open_task(period.pk))
        wf_engine.act(self.manager, fleet_open_task(period.pk))

        task = fleet_open_task(period.pk)
        self.assertEqual(task.step_key, 'treasury_pay')

        SectionAssignment.objects.filter(user=self.treasurer).update(is_active=False)
        WorkflowPolicy.objects.create(company=self.company, workflow_key='', role_actions={'treasury': 'skip'})
        recompute_open_tasks(company_ids=[self.company.pk])

        inst = wf_engine.instance_of(FLEET_PERIOD_WORKFLOW, period.pk)
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)
        self.assertTrue(inst.settled_outside)
        self.assertIsNone(fleet_open_task(period.pk))

        last_step = inst.steps.order_by('-id').first()
        self.assertEqual(last_step.action, WorkflowStep.AUTO)
        self.assertIn({'step': 'treasury_pay', 'reason': 'payment_outside'}, last_step.skipped)

        trips = VehicleTripLog.objects.filter(period=period)
        self.assertTrue(trips.exists())
        for t in trips:
            self.assertFalse(t.is_settled)
            self.assertEqual(t.payment_tracking_code, '')

        self.assertTrue(is_fleet_locked(period))


@temp_media
class SuperuserFenceRolePolicyTests(TestCase):
    def setUp(self):
        reset_superuser_fence_cache()
        self.company = Company.objects.create(code='SUF-CO', name='شرکت حصار مدیر کل', is_active=True)
        self.project = Project.objects.create(company=self.company, code='SUF-P', name='پروژه حصار')
        self.sec = ProjectSection.objects.create(project=self.project, code='SUF-S', name='بخش حصار')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف حساب', counterparty_type='other')
        give_valid_sheba(self.cp)
        self.emp = self.user('emp', 'employee')
        self.sup = self.user('sup', 'supervisor', ['perm_approve_personnel_supervisor', 'perm_invoice_approve'])
        self.inv = ExpenseInvoice.objects.create(
            section=self.sec,
            counterparty=self.cp,
            invoice_number='SUF-INV-1',
            invoice_date_shamsi='1405/08/01',
            amount=Decimal('1000'),
            description='تست حصار',
            created_by=self.emp,
        )

    def user(self, name, role, codes=()):
        u = User.objects.create_user(username=f'suf_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, list(codes), section=self.sec, role=role, exact=False)
        return u

    def test_superuser_write_fence_blocks_documents(self):
        su = User.objects.create_superuser(username='su_fenced', password='x', email='su_fenced@test.com')
        c = APIClient()
        c.force_login(su)
        c.force_authenticate(su)

        # POST expense-invoices
        res1 = c.post('/api/personnel/expense-invoices/', {'amount': '100'}, format='json',
                      HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res1.status_code, 403)
        self.assertEqual(res1.json().get('code'), 'superuser_view_only')

        # PATCH expense-invoices/<id>/
        res2 = c.patch(f'/api/personnel/expense-invoices/{self.inv.pk}/', {'amount': '200'}, format='json',
                       HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res2.status_code, 403)
        self.assertEqual(res2.json().get('code'), 'superuser_view_only')

        # POST petty-cash-transactions
        res3 = c.post('/api/personnel/petty-cash-transactions/', {'amount': '100'}, format='json',
                      HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res3.status_code, 403)
        self.assertEqual(res3.json().get('code'), 'superuser_view_only')

        # POST counterparties
        res4 = c.post('/api/personnel/counterparties/', {'name': 'طرف جدید'}, format='json',
                      HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res4.status_code, 403)
        self.assertEqual(res4.json().get('code'), 'superuser_view_only')

        # POST workflow task action
        res5 = c.post('/api/workflow/tasks/999999/action/', {'action': 'act'}, format='json')
        self.assertEqual(res5.status_code, 403)
        self.assertEqual(res5.json().get('code'), 'superuser_view_only')

    def test_superuser_allowlisted_and_read_routes(self):
        su = User.objects.create_superuser(username='su_allowed', password='x', email='su_allowed@test.com')
        c = APIClient()
        c.force_login(su)
        c.force_authenticate(su)

        # PATCH /api/personnel/companies/<id>/ is allowlisted (macro work)
        res_patch_co = c.patch(
            f'/api/personnel/companies/{self.company.pk}/',
            {'name': 'شرکت تغییر نام یافته'},
            format='json',
        )
        self.assertNotEqual(res_patch_co.status_code, 403)
        self.assertNotEqual(res_patch_co.json().get('code'), 'superuser_view_only')

        # POST /api/personnel/expense-heads/ is allowlisted (macro work)
        res_post_head = c.post(
            '/api/personnel/expense-heads/',
            {'company': self.company.pk, 'code': 'EH-TEST', 'title': 'سرفصل تست'},
            format='json',
        )
        self.assertNotEqual(res_post_head.status_code, 403)
        self.assertNotEqual(res_post_head.json().get('code'), 'superuser_view_only')

        # GET on /api/personnel/expense-invoices/ returns 200 for the superuser
        res_get_inv = c.get(
            '/api/personnel/expense-invoices/',
            HTTP_X_COMPANY_ID=str(self.company.pk),
        )
        self.assertEqual(res_get_inv.status_code, 200)

    def test_superuser_cannot_attach_accounting_document(self):
        su = User.objects.create_superuser(username='su_attach', password='x', email='su_attach@test.com')
        self.assertFalse(can_attach(su, 'expense_invoice', 1))
        self.assertTrue(can_attach(su, 'user', 1))

    def test_legacy_notifications_skip_superusers(self):
        su = User.objects.create_superuser(username='su_notif', password='x', email='su_notif@test.com')
        recipients = _workflow_recipient_ids('pending_supervisor', self.company.pk, self.sec.pk, None)
        self.assertNotIn(su.pk, recipients)
        self.assertIn(self.sup.pk, recipients)
