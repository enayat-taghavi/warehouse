"""
رسید پرداخت (۹ آبان ۱۴۰۵): در هر پرداخت فاکتور و تنخواه اجباری است، پیش از هر نوشتن سنجیده می‌شود و پیوست هستهٔ
همان سند با برچسب payment_receipt می‌شود. همهٔ شرکت‌کنندگان گردش و مدیر و حسابدارِ دامنه آن را همیشه می‌بینند؛
بیرون از شرکت، بخش دیگر و کسی که از شرکت رفته نه.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from attachments.models import Attachment
from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.models import (CompanyBankAccount, Counterparty, ExpenseInvoice, InvoicePayment, PettyCashAccount,
                              PettyCashTransaction)
from personnel.scoped_test_support import give_valid_sheba, grant_section_perms, pay_request, receipt_file, temp_media
from personnel.workflows import INVOICE_WORKFLOW, PETTY_CHARGE_WORKFLOW, PETTY_STATEMENT_WORKFLOW
from workflow import engine as wf_engine
from workflow.errors import WorkflowError

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'
TX = '/api/personnel/petty-cash-transactions/'
ST = '/api/personnel/petty-cash-statements/'
ATT = '/api/attachments/'
LABEL = 'payment_receipt'


class _ClientMixin:
    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def receipts(self, user, kind, entity_id):
        return self.client_for(user).get(ATT, {'kind': kind, 'id': entity_id, 'label': LABEL},
                                         HTTP_X_COMPANY_ID=str(self.company.pk))


@temp_media
class InvoicePaymentReceiptTests(_ClientMixin, TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='RCP', name='شرکت رسید', is_active=True)
        project = Project.objects.create(company=self.company, code='RCP-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=project, code='RCP-S', name='بخش')
        self.sec2 = ProjectSection.objects.create(project=project, code='RCP-S2', name='بخش دیگر')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        give_valid_sheba(self.cp)
        self.bank = CompanyBankAccount.objects.create(company=self.company, bank_name='ملت',
                                                      sheba_number='IR120120000000000000000001')
        self.emp = self.user('emp', 'employee')
        self.sup = self.user('sup', 'supervisor')
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')
        # مدیر و حسابدار سطح شرکت که روی این فاکتور اقدامی نکرده‌اند
        self.co_mgr = self.user('comgr', 'manager', company=self.company)
        self.co_acc = self.user('coacc', 'accountant', company=self.company)
        # کارمند و حسابدار بخش دیگر همان شرکت: نه شرکت‌کننده، نه پوشش دامنه
        self.other_emp = self.user('oemp', 'employee', section=self.sec2)
        self.other_acc = self.user('oacc', 'accountant', section=self.sec2)
        other = Company.objects.create(code='RCPX', name='شرکت دیگر', is_active=True)
        self.outsider = self.user('out', 'manager', company=other)

    def user(self, name, role, section=None, company=None):
        u = User.objects.create_user(username=f'rcp_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company or self.company, is_default=True)
        if company is not None:
            grant_section_perms(u, [], company=company, role=role, exact=False)
        else:
            grant_section_perms(u, [], section=section or self.sec, role=role, exact=False)
        return u

    def post(self, user, inv, action, **data):
        data, fmt = pay_request(action, data)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client_for(user).post(f'{BASE}{inv.pk}/{action}/', data, format=fmt,
                                              HTTP_X_COMPANY_ID=str(self.company.pk))

    def payable_invoice(self, amount='1000'):
        inv = ExpenseInvoice.objects.create(
            section=self.sec, counterparty=self.cp, invoice_number=f'RCP-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01', amount=Decimal(amount), description='d', created_by=self.emp)
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 200)
        for u in (self.sup, self.acc, self.mgr):
            self.assertEqual(self.post(u, inv, 'approve').status_code, 200)
        self.assertEqual(wf_engine.open_task(INVOICE_WORKFLOW, inv.pk).step_key, 'treasury_pay')
        return inv

    def pay(self, inv, amount, **extra):
        return self.post(self.trs, inv, 'payments', amount=str(amount), tracking_code='TRK',
                         payment_date_shamsi='1405/08/10', method='transfer', company_bank_account=self.bank.pk,
                         **extra)

    def test_payment_without_receipt_rejected_before_any_write(self):
        inv = self.payable_invoice()
        res = self.pay(inv, 400, receipt=None)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('receipt', res.json())
        self.assertFalse(InvoicePayment.objects.filter(invoice=inv).exists())
        inv.refresh_from_db()
        self.assertEqual((inv.status, inv.paid_amount), ('ready_to_pay', Decimal('0')))
        # پرداخت قدیمی کل مانده هم بی‌رسید رد می‌شود
        res = self.post(self.trs, inv, 'pay', tracking_code='T', receipt=None)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('receipt', res.json())
        # پسوند غیرمجاز
        bad = SimpleUploadedFile('r.exe', b'MZ', content_type='application/octet-stream')
        res = self.pay(inv, 400, receipt=bad)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('receipt', res.json())
        self.assertFalse(Attachment.objects.filter(entity_kind='expense_invoice', entity_id=str(inv.pk)).exists())

    def test_receipt_linked_to_instalment_and_kept_after_void(self):
        inv = self.payable_invoice()
        res = self.pay(inv, 400, receipt=receipt_file('first.pdf'))
        self.assertEqual(res.status_code, 201, res.content)
        pid = res.json()['payment']['id']
        att = Attachment.objects.get(entity_kind='expense_invoice', entity_id=str(inv.pk), label=LABEL)
        self.assertEqual((att.description, att.original_name, att.uploaded_by_id),
                         (f'payment:{pid}', 'first.pdf', self.trs.pk))
        self.assertEqual(self.post(self.trs, inv, f'payments/{pid}/void', reason='اشتباه').status_code, 200)
        att.refresh_from_db()
        self.assertIsNone(att.archived_at)

    def test_all_participants_and_overseers_see_receipt_after_paid(self):
        inv = self.payable_invoice()
        self.assertEqual(self.pay(inv, 1000).status_code, 201)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'paid')
        for u in (self.emp, self.sup, self.acc, self.mgr, self.trs, self.co_mgr, self.co_acc):
            res = self.receipts(u, 'expense_invoice', inv.pk)
            self.assertEqual(res.status_code, 200, (u.username, res.content))
            self.assertEqual(len(res.json()), 1, u.username)
            dl = self.client_for(u).get(f"{ATT}{res.json()[0]['id']}/download/",
                                        HTTP_X_COMPANY_ID=str(self.company.pk))
            self.assertEqual(dl.status_code, 200, u.username)
        # جزئیات فاکتور هم برای مدیر سطح شرکتی که اقدامی نکرده باز است
        res = self.client_for(self.co_mgr).get(f'{BASE}{inv.pk}/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200, res.content)
        for u in (self.other_emp, self.other_acc, self.outsider):
            self.assertEqual(self.receipts(u, 'expense_invoice', inv.pk).status_code, 403, u.username)

    def test_participant_who_left_company_loses_view(self):
        inv = self.payable_invoice()
        self.assertEqual(self.pay(inv, 1000).status_code, 201)
        SectionAssignment.objects.filter(user=self.sup).update(is_active=False)
        self.assertEqual(self.receipts(self.sup, 'expense_invoice', inv.pk).status_code, 403)
        res = self.client_for(self.sup).get(f'{BASE}{inv.pk}/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertIn(res.status_code, (403, 404))

    def test_inactive_company_hides_receipt_from_overseer(self):
        inv = self.payable_invoice()
        self.assertEqual(self.pay(inv, 1000).status_code, 201)
        Company.objects.filter(pk=self.company.pk).update(is_active=False)
        self.assertEqual(self.receipts(self.co_mgr, 'expense_invoice', inv.pk).status_code, 403)


@temp_media
class PettyPaymentReceiptTests(_ClientMixin, TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='RCPC', name='شرکت تنخواه رسید', is_active=True)
        other = Company.objects.create(code='RCPCX', name='شرکت دیگر', is_active=True)
        self.emp = self.user('emp', 'employee', ['perm_petty_cash_manage'])
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')
        self.plain = self.user('plain', 'employee')
        self.outsider = self.user('out', 'manager', company=other)
        self.account = PettyCashAccount.objects.create(company=self.company, custodian=self.emp,
                                                       ceiling_amount=Decimal('1000000'))

    def user(self, name, role, codes=(), company=None):
        company = company or self.company
        u = User.objects.create_user(username=f'rcpc_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), company=company, role=role, exact=False)
        return u

    def call(self, user, method, url, data=None):
        data, fmt = pay_request(url, data or {})
        with self.captureOnCommitCallbacks(execute=True):
            return getattr(self.client_for(user), method)(url, data, format=fmt,
                                                          HTTP_X_COMPANY_ID=str(self.company.pk))

    def test_charge_pay_requires_receipt_and_manager_sees_it(self):
        res = self.call(self.emp, 'post', f'{TX}request-charge/', {'amount': '500000'})
        self.assertEqual(res.status_code, 201, res.content)
        tx_id = res.json()['id']
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id))
        res = self.call(self.trs, 'post', f'{TX}{tx_id}/pay-charge/', {'tracking_code': 'T1', 'receipt': None})
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('receipt', res.json())
        tx = PettyCashTransaction.objects.get(pk=tx_id)
        self.assertNotEqual(tx.status, 'approved')
        self.assertFalse(tx.receipt_number)
        # اقدام عمومی «کارهای من» شارژ را بی‌رسید نمی‌بندد، حتی اگر شمارهٔ رسید روی ردیف باشد
        PettyCashTransaction.objects.filter(pk=tx_id).update(receipt_number='x')
        with self.assertRaises(WorkflowError):
            wf_engine.act(self.trs, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id))
        self.assertEqual(wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id).step_key, 'treasury_pay')
        PettyCashTransaction.objects.filter(pk=tx_id).update(receipt_number='')
        res = self.call(self.trs, 'post', f'{TX}{tx_id}/pay-charge/', {'tracking_code': 'T1'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Attachment.objects.filter(entity_kind='petty_cash_charge', entity_id=str(tx_id),
                                                   label=LABEL).count(), 1)
        # مدیر سطح شرکت (این شارژ زیر سقف بود و مرحلهٔ مدیر نداشت) و تنخواه‌دار می‌بینند
        for u in (self.emp, self.acc, self.trs, self.mgr):
            res = self.receipts(u, 'petty_cash_charge', tx_id)
            self.assertEqual((res.status_code, len(res.json())), (200, 1), u.username)
        for u in (self.plain, self.outsider):
            self.assertEqual(self.receipts(u, 'petty_cash_charge', tx_id).status_code, 403, u.username)

    def test_statement_pay_requires_receipt(self):
        line = PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp, transaction_type='expense',
            amount=Decimal('100000'), transaction_date_shamsi='1405/08/01', title='t', category='c', status='draft')
        res = self.call(self.emp, 'post', ST, {'line_ids': [line.pk]})
        self.assertEqual(res.status_code, 201, res.content)
        st_id = res.json()['id']
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id))
        wf_engine.act(self.mgr, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id))
        res = self.call(self.trs, 'post', f'{ST}{st_id}/pay/', {'tracking_code': 'TS', 'receipt': None})
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id).step_key, 'treasury_pay')
        res = self.call(self.trs, 'post', f'{ST}{st_id}/pay/', {'tracking_code': 'TS'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['status'], 'paid')
        res = self.receipts(self.emp, 'petty_cash_statement', st_id)
        self.assertEqual((res.status_code, len(res.json())), (200, 1))
