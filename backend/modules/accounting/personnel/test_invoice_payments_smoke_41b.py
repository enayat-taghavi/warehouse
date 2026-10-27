"""
تست دود پرداخت چندمرحله‌ای فاکتور (۴.۱-ب، د۵). مجموعهٔ کامل: test_invoice_payments_41.py (آنتی‌گرویتی).
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.models import CompanyBankAccount, Counterparty, ExpenseInvoice, InvoicePayment
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


class InvoicePaymentSmokeTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IPS', name='شرکت قسط', is_active=True)
        project = Project.objects.create(company=self.company, code='IPS-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=project, code='IPS-S', name='بخش')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        self.bank = CompanyBankAccount.objects.create(company=self.company, bank_name='ملت',
                                                      sheba_number='IR120120000000000000000001')
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
            section=self.sec, counterparty=self.cp, invoice_number=f'IPS-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01', amount=Decimal(amount), description='d', created_by=self.emp)
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 200)
        for u in (self.sup, self.acc, self.mgr):
            res = self.post(u, inv, 'approve')
            self.assertEqual(res.status_code, 200, res.data)
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(task.step_key, 'treasury_pay')
        return inv

    def pay(self, user, inv, amount, code='TRK'):
        return self.post(user, inv, 'payments', amount=str(amount), tracking_code=code,
                         payment_date_shamsi='1405/08/10', method='transfer', company_bank_account=self.bank.pk)

    def test_two_instalments_partial_then_paid_and_return_blocked(self):
        inv = self.payable_invoice()
        res = self.pay(self.trs, inv, 400, 'T1')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'partially_paid')
        self.assertEqual(res.data['remaining'], '600')
        self.assertIsNotNone(wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        res = self.post(self.trs, inv, 'request-revision', reason='x')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'payments_exist')
        res = self.pay(self.trs, inv, 600, 'T2')
        self.assertEqual(res.status_code, 201, res.data)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'paid')
        self.assertEqual(inv.paid_amount, Decimal('1000'))
        self.assertEqual(inv.payment_ref, 'T2')
        self.assertIsNone(wf_engine.open_task(INVOICE_WORKFLOW, inv.pk))
        self.assertTrue(self.bank.invoice_payments.exists())

    def test_over_remaining_rejected_and_void_restores(self):
        inv = self.payable_invoice()
        res = self.pay(self.trs, inv, 1001)
        self.assertEqual(res.status_code, 400)
        self.assertIn('amount', res.data)
        self.assertFalse(InvoicePayment.objects.filter(invoice=inv).exists())
        res = self.pay(self.trs, inv, 300)
        pid = res.data['payment']['id']
        self.assertEqual(self.post(self.trs, inv, f'payments/{pid}/void').status_code, 400)  # بی دلیل
        res = self.post(self.trs, inv, f'payments/{pid}/void', reason='اشتباه')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'ready_to_pay')
        self.assertEqual(res.data['remaining'], '1000')

    def test_creator_cannot_pay(self):
        inv = self.payable_invoice()
        ExpenseInvoice.objects.filter(pk=inv.pk).update(created_by=self.trs)
        res = self.pay(self.trs, inv, 100)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data['code'], 'creator_cannot_pay')
        res = self.pay(self.acc, inv, 100)
        self.assertEqual(res.status_code, 403)

    def test_legacy_pay_pays_whole_remaining(self):
        inv = self.payable_invoice()
        self.assertEqual(self.pay(self.trs, inv, 250).status_code, 201)
        res = self.post(self.trs, inv, 'pay', tracking_code='OLD-1')
        self.assertEqual(res.status_code, 200, res.data)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'paid')
        self.assertEqual(inv.paid_amount, Decimal('1000'))
        last = InvoicePayment.objects.filter(invoice=inv).order_by('-pk').first()
        self.assertEqual(last.amount, Decimal('750'))
        self.assertEqual(last.company_bank_account_id, self.bank.pk)
        # فهرست قسط‌ها و جزئیات فاکتور
        c = APIClient()
        c.force_authenticate(self.trs)
        res = c.get(f'{BASE}{inv.pk}/payments/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['results']), 2)
        self.assertEqual(res.data['remaining'], '0')

    def test_print_and_excel(self):
        import io
        import openpyxl
        inv = self.payable_invoice()
        self.pay(self.trs, inv, 400)
        c = APIClient()
        c.force_authenticate(self.acc)
        res = c.get(f'/api/print/expense_invoice/{inv.pk}/pdf/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        outsider = User.objects.create_user(username='ips_out', password='x')
        c.force_authenticate(outsider)
        self.assertEqual(c.get(f'/api/print/expense_invoice/{inv.pk}/pdf/').status_code, 404)
        c.force_authenticate(self.acc)
        res = c.get(f'{BASE}export-excel/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200)
        wb = openpyxl.load_workbook(io.BytesIO(res.content))
        self.assertEqual(len(wb.sheetnames), 2)
        keys = [cell.value for cell in wb.worksheets[0][2]]
        self.assertIn('paid_amount', keys)
        self.assertIn('remaining', keys)
        row = {k: cell.value for k, cell in zip(keys, wb.worksheets[0][3])}
        self.assertEqual(int(row['remaining']), 600)
