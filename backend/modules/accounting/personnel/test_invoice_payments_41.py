"""
مجموعه آزمون‌های جامع پرداخت چندمرحله‌ای فاکتور هزینه (زیرمرحلهٔ ۴.۱-ب).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.company_bank import bank_account_has_movements
from personnel.models import (
    CompanyBankAccount,
    CompanyFiscalPeriod,
    Counterparty,
    ExpenseInvoice,
    ExpenseInvoiceLine,
    InvoicePayment,
    PartyBankAccount,
)
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine
from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance, WorkflowSubstitute

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


class InvoicePayments41Tests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IPS', name='شرکت قسط', is_active=True)
        project = Project.objects.create(company=self.company, code='IPS-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=project, code='IPS-S', name='بخش')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        self.bank = CompanyBankAccount.objects.create(
            company=self.company, bank_name='ملت', sheba_number='IR120120000000000000000001'
        )
        self.emp = self.user('emp', 'employee')
        self.sup = self.user('sup', 'supervisor')
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')

    def user(self, name, role):
        u = User.objects.create_user(username=f'ips_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, [], section=self.sec, role=role, exact=False)
        return u

    def post(self, user, inv, action, **data):
        c = APIClient()
        c.force_authenticate(user)
        with self.captureOnCommitCallbacks(execute=True):
            return c.post(f'{BASE}{inv.pk}/{action}/', data, format='json', HTTP_X_COMPANY_ID=str(self.company.pk))

    def payable_invoice(self, amount='1000'):
        inv = ExpenseInvoice.objects.create(
            section=self.sec,
            counterparty=self.cp,
            invoice_number=f'IPS-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01',
            amount=Decimal(amount),
            description='d',
            created_by=self.emp,
        )
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 200)
        for u in (self.sup, self.acc, self.mgr):
            res = self.post(u, inv, 'approve')
            self.assertEqual(res.status_code, 200, res.data)
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(task.step_key, 'treasury_pay')
        return inv

    def pay(self, user, inv, amount, code='TRK'):
        return self.post(
            user,
            inv,
            'payments',
            amount=str(amount),
            tracking_code=code,
            payment_date_shamsi='1405/08/10',
            method='transfer',
            company_bank_account=self.bank.pk,
        )

    def test_two_instalments_partial_then_paid(self):
        inv = self.payable_invoice('1000')
        res1 = self.pay(self.trs, inv, 400, 'T1')
        self.assertEqual(res1.status_code, 201, res1.data)
        self.assertEqual(res1.data['status'], 'partially_paid')
        self.assertEqual(res1.data['remaining'], '600')

        res2 = self.pay(self.trs, inv, 600, 'T2')
        self.assertEqual(res2.status_code, 201, res2.data)
        self.assertEqual(res2.data['status'], 'paid')
        self.assertEqual(res2.data['remaining'], '0')

        wf = wf_engine.instance_of(INVOICE_WORKFLOW, inv.pk)
        self.assertIsNotNone(wf)
        self.assertNotEqual(wf.status, WorkflowInstance.IN_PROGRESS)

    def test_amount_over_remaining_rejected(self):
        inv = self.payable_invoice('1000')
        res1 = self.pay(self.trs, inv, 400, 'T1')
        self.assertEqual(res1.status_code, 201, res1.data)

        res2 = self.pay(self.trs, inv, 700, 'T2')
        self.assertEqual(res2.status_code, 400, res2.data)
        self.assertEqual(res2.data.get('code'), 'amount_exceeds_remaining')
        self.assertEqual(InvoicePayment.objects.filter(invoice=inv).count(), 1)

    def test_creator_cannot_pay_even_with_treasurer_perm(self):
        inv = self.payable_invoice('1000')
        grant_section_perms(self.emp, [], section=self.sec, role='treasury', exact=False)
        res = self.pay(self.emp, inv, 100)
        self.assertEqual(res.status_code, 403, res.data)
        self.assertEqual(res.data.get('code'), 'creator_cannot_pay')

    def test_delegate_of_treasurer_can_pay(self):
        delegate = self.user('delegate', 'employee')
        today = timezone.localdate()
        WorkflowSubstitute.objects.create(
            principal=self.trs,
            substitute=delegate,
            company=self.company,
            start_date=today,
            end_date=today,
        )
        inv = self.payable_invoice('1000')
        res = self.pay(delegate, inv, 200, 'T-DEL')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['remaining'], '800')

    def test_return_and_cancel_blocked_after_instalment(self):
        inv = self.payable_invoice('1000')
        res = self.pay(self.trs, inv, 400, 'T1')
        self.assertEqual(res.status_code, 201)

        res_rev = self.post(self.trs, inv, 'request-revision', reason='عودت به دلیل مغایرت')
        self.assertEqual(res_rev.status_code, 409, res_rev.data)
        self.assertEqual(res_rev.data.get('code'), 'payments_exist')

        res_can = self.post(self.emp, inv, 'cancel')
        self.assertEqual(res_can.status_code, 409, res_can.data)
        self.assertEqual(res_can.data.get('code'), 'payments_exist')

    def test_void_with_reason_restores_remaining_and_void_after_full_blocked(self):
        inv = self.payable_invoice('1000')
        res = self.pay(self.trs, inv, 400, 'T1')
        self.assertEqual(res.status_code, 201)
        pid = res.data['payment']['id']

        res_no_reason = self.post(self.trs, inv, f'payments/{pid}/void')
        self.assertEqual(res_no_reason.status_code, 400)

        res_void = self.post(self.trs, inv, f'payments/{pid}/void', reason='اشتباه در ثبت')
        self.assertEqual(res_void.status_code, 200, res_void.data)
        self.assertEqual(res_void.data['remaining'], '1000')
        self.assertEqual(res_void.data['status'], 'ready_to_pay')

        res_full = self.pay(self.trs, inv, 1000, 'T-FULL')
        self.assertEqual(res_full.status_code, 201, res_full.data)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'paid')
        pid2 = res_full.data['payment']['id']

        res_void_full = self.post(self.trs, inv, f'payments/{pid2}/void', reason='اشتباه بعد تسویه')
        self.assertEqual(res_void_full.status_code, 409, res_void_full.data)
        self.assertEqual(res_void_full.data.get('code'), 'void_after_full_payment')

    def test_closed_period_and_foreign_bank_accounts_rejected(self):
        inv = self.payable_invoice('1000')

        CompanyFiscalPeriod.objects.create(
            company=self.company,
            fiscal_year='1404',
            title='سال ۱۴۰۴ بسته',
            start_date='1404/01/01',
            end_date='1404/12/29',
            status='closed',
        )
        res_period = self.post(
            self.trs,
            inv,
            'payments',
            amount='100',
            tracking_code='TRK-CLOSED',
            payment_date_shamsi='1404/06/15',
            method='transfer',
            company_bank_account=self.bank.pk,
        )
        self.assertEqual(res_period.status_code, 400, res_period.data)
        self.assertIn('payment_date_shamsi', res_period.data)

        other_company = Company.objects.create(code='OTH', name='شرکت دیگر', is_active=True)
        foreign_bank = CompanyBankAccount.objects.create(
            company=other_company, bank_name='صادرات', sheba_number='IR120190000000000000000001'
        )
        res_foreign_bank = self.post(
            self.trs,
            inv,
            'payments',
            amount='100',
            tracking_code='TRK-FOREIGN-BANK',
            payment_date_shamsi='1405/08/10',
            method='transfer',
            company_bank_account=foreign_bank.pk,
        )
        self.assertEqual(res_foreign_bank.status_code, 400, res_foreign_bank.data)
        self.assertIn('company_bank_account', res_foreign_bank.data)

        other_cp = Counterparty.objects.create(company=self.company, name='طرف دیگر', counterparty_type='other')
        foreign_party_bank = PartyBankAccount.objects.create(
            party=other_cp.party, bank_name='تجارت', sheba_number='IR120180000000000000000001'
        )
        res_foreign_party = self.post(
            self.trs,
            inv,
            'payments',
            amount='100',
            tracking_code='TRK-FOREIGN-PARTY',
            payment_date_shamsi='1405/08/10',
            method='transfer',
            company_bank_account=self.bank.pk,
            party_bank_account=foreign_party_bank.pk,
        )
        self.assertEqual(res_foreign_party.status_code, 400, res_foreign_party.data)
        self.assertIn('party_bank_account', res_foreign_party.data)

    def test_company_bank_account_has_movements_after_payment(self):
        self.assertFalse(bank_account_has_movements(self.bank))
        inv = self.payable_invoice('1000')
        res = self.pay(self.trs, inv, 200, 'T-MOV')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(bank_account_has_movements(self.bank))

    def test_generic_act_without_payment_does_not_close(self):
        inv = self.payable_invoice('1000')
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertIsNotNone(task)
        with self.assertRaises(WorkflowError) as cm:
            wf_engine.act(self.trs, task)
        self.assertEqual(cm.exception.code, 'payment_required')
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'ready_to_pay')

    def test_legacy_pay_pays_whole_remaining(self):
        inv = self.payable_invoice('1000')
        res1 = self.pay(self.trs, inv, 300, 'T-INSTALMENT')
        self.assertEqual(res1.status_code, 201)

        res2 = self.post(self.trs, inv, 'pay', tracking_code='LEGACY-700')
        self.assertEqual(res2.status_code, 200, res2.data)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'paid')
        self.assertEqual(inv.paid_amount, Decimal('1000'))

        payments = list(InvoicePayment.objects.filter(invoice=inv).order_by('pk'))
        self.assertEqual(len(payments), 2)
        self.assertEqual(payments[1].amount, Decimal('700'))
        self.assertEqual(payments[1].tracking_code, 'LEGACY-700')

    def test_party_sheba_masked_without_sensitive_perm(self):
        pba = PartyBankAccount.objects.create(
            party=self.cp.party,
            bank_name='بانک ملت',
            sheba_number='IR120120000000000000000002',
            is_primary=True,
        )
        inv = self.payable_invoice('1000')
        res = self.post(
            self.trs,
            inv,
            'payments',
            amount='400',
            tracking_code='T-SHEBA',
            payment_date_shamsi='1405/08/10',
            method='transfer',
            company_bank_account=self.bank.pk,
            party_bank_account=pba.pk,
        )
        self.assertEqual(res.status_code, 201, res.data)

        c = APIClient()
        c.force_authenticate(self.emp)
        res_get = c.get(f'{BASE}{inv.pk}/payments/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res_get.status_code, 200, res_get.data)
        self.assertGreater(len(res_get.data['results']), 0)
        sheba = res_get.data['results'][0]['party_sheba_number']
        self.assertTrue(sheba.startswith('*'), f'Expected masked sheba starting with *, got {sheba}')
        self.assertNotIn('IR120120000000000000000002', sheba)

    def test_outsider_gets_404(self):
        inv = self.payable_invoice('1000')

        other_company = Company.objects.create(code='OUT', name='شرکت غریبه', is_active=True)
        other_proj = Project.objects.create(company=other_company, code='OUT-P', name='پروژه غریبه')
        other_sec = ProjectSection.objects.create(project=other_proj, code='OUT-S', name='بخش غریبه')
        outsider = User.objects.create_user(username='ips_outsider', password='x')
        UserCompanyAccess.objects.create(user=outsider, company=other_company, is_default=True)
        grant_section_perms(outsider, [], section=other_sec, role='employee', exact=False)

        c = APIClient()
        c.force_authenticate(outsider)

        res_get = c.get(f'{BASE}{inv.pk}/payments/', HTTP_X_COMPANY_ID=str(other_company.pk))
        self.assertEqual(res_get.status_code, 404)

        res_post = c.post(
            f'{BASE}{inv.pk}/payments/',
            {'amount': '100', 'tracking_code': 'T'},
            format='json',
            HTTP_X_COMPANY_ID=str(other_company.pk),
        )
        self.assertEqual(res_post.status_code, 404)

        res_print = c.get(f'/api/print/expense_invoice/{inv.pk}/pdf/', HTTP_X_COMPANY_ID=str(other_company.pk))
        self.assertEqual(res_print.status_code, 404)

    def test_list_query_count_constant(self):
        c = APIClient()
        c.force_authenticate(self.acc)

        def make_batch(count, prefix):
            invoices = [
                ExpenseInvoice(
                    section=self.sec,
                    counterparty=self.cp,
                    invoice_number=f'{prefix}-{i}',
                    invoice_date_shamsi='1405/08/01',
                    amount=Decimal('3000'),
                    description='توضیحات فله',
                    created_by=self.emp,
                )
                for i in range(count)
            ]
            created = ExpenseInvoice.objects.bulk_create(invoices)
            lines = []
            for inv in created:
                for pos in range(1, 4):
                    lines.append(
                        ExpenseInvoiceLine(
                            invoice=inv,
                            position=pos,
                            description=f'ردیف {pos}',
                            quantity=Decimal('1'),
                            unit='عدد',
                            unit_price=Decimal('1000'),
                            line_amount=Decimal('1000'),
                        )
                    )
            ExpenseInvoiceLine.objects.bulk_create(lines)

        make_batch(30, 'BULK1')

        # درخواست گرم‌کردن کش‌های مجوز و کاربر
        c.get(f'{BASE}?page=1', HTTP_X_COMPANY_ID=str(self.company.pk))

        with CaptureQueriesContext(connection) as ctx:
            res1 = c.get(f'{BASE}?page=1', HTTP_X_COMPANY_ID=str(self.company.pk))
            self.assertEqual(res1.status_code, 200)
            recorded = len(ctx.captured_queries)

        make_batch(30, 'BULK2')

        with self.assertNumQueries(recorded):
            res2 = c.get(f'{BASE}?page=1', HTTP_X_COMPANY_ID=str(self.company.pk))
            self.assertEqual(res2.status_code, 200)
