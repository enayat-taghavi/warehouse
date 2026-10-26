"""
Scenario tests for the closed fiscal period lock on invoices and petty cash (Release v1 step 3.2-b).
Run: $env:PYTHONUTF8='1'; ./venv/Scripts/python.exe manage.py test personnel.test_fiscal_lock_api_32 --keepdb --noinput
"""
import unittest

from personnel.models import ExpenseInvoice, PettyCashTransaction
from personnel.test_fiscal_period_32 import FiscalFixtures, INVOICES, PERIODS, PETTY
from personnel.scoped_test_support import expense_head_id


class FiscalLockApiTests(FiscalFixtures):

    def test_invoice_create_in_closed_period_rejected(self):
        self.period(year='1405', start='1405/01/01', end='1405/12/29', status='closed')
        initial_count = ExpenseInvoice.objects.count()
        res = self.api.post(INVOICES, self.invoice_payload('1405/08/01'), format='json')
        self.assert_closed(res, 'invoice_date_shamsi')
        self.assertEqual(ExpenseInvoice.objects.count(), initial_count)

    def test_invoice_create_in_open_period_or_without_period_allowed(self):
        self.period(year='1405', start='1405/01/01', end='1405/12/29', status='open')
        p1 = self.invoice_payload('1405/08/01')
        p1['invoice_number'] = 'INV-OPEN-1'
        res1 = self.api.post(INVOICES, p1, format='json')
        self.assertEqual(res1.status_code, 201, res1.content)

        p2 = self.invoice_payload('1407/01/10')
        p2['invoice_number'] = 'INV-NOPERIOD-1'
        res2 = self.api.post(INVOICES, p2, format='json')
        self.assertEqual(res2.status_code, 201, res2.content)

    def test_invoice_patch_date_into_closed_period_rejected(self):
        self.period(year='1405', start='1405/01/01', end='1405/12/29', status='closed')
        inv = self.invoice(date='1406/02/01')
        res = self.api.patch(f'{INVOICES}{inv.id}/', {'invoice_date_shamsi': '1405/08/01'}, format='json')
        self.assert_closed(res, 'invoice_date_shamsi')
        inv.refresh_from_db()
        self.assertEqual(inv.invoice_date_shamsi, '1406/02/01')

    def test_invoice_patch_of_closed_period_invoice_rejected(self):
        self.period(year='1405', start='1405/01/01', end='1405/12/29', status='closed')
        inv = self.invoice(date='1405/08/01')
        res = self.api.patch(f'{INVOICES}{inv.id}/', {'description': 'changed'}, format='json')
        self.assert_closed(res, 'invoice_date_shamsi')
        inv.refresh_from_db()
        self.assertEqual(inv.description, 'd')

    def test_invoice_delete_in_closed_period_rejected(self):
        self.period(year='1405', start='1405/01/01', end='1405/12/29', status='closed')
        inv = self.invoice(date='1405/08/01')
        res = self.api.delete(f'{INVOICES}{inv.id}/')
        self.assert_closed(res, 'invoice_date_shamsi')
        self.assertTrue(ExpenseInvoice.objects.filter(id=inv.id).exists())

    def test_petty_cash_create_and_submit_in_closed_period_rejected(self):
        self.period(year='1405', start='1405/01/01', end='1405/12/29', status='closed')
        payload = {
            'section': self.sec.id,
            'custodian': self.admin.id,
            'amount': '10000',
            'transaction_date_shamsi': '1405/08/01',
            'title': 'tx',
            'expense_head': expense_head_id(self.sec),
        }
        res = self.api.post(PETTY, payload, format='json')
        self.assert_closed(res, 'transaction_date_shamsi')

        tx = self.petty()
        res_submit = self.api.post(f'{PETTY}{tx.id}/submit/')
        self.assert_closed(res_submit, 'transaction_date_shamsi')
        tx.refresh_from_db()
        self.assertEqual(tx.status, 'draft')

    def test_reopen_period_allows_create(self):
        p = self.period(year='1405', start='1405/01/01', end='1405/12/29', status='closed')
        payload = self.invoice_payload('1405/08/01')
        res1 = self.api.post(INVOICES, payload, format='json')
        self.assert_closed(res1, 'invoice_date_shamsi')

        res_reopen = self.api.post(f'{PERIODS}{p.id}/reopen-period/')
        self.assertEqual(res_reopen.status_code, 200, res_reopen.content)

        res2 = self.api.post(INVOICES, payload, format='json')
        self.assertEqual(res2.status_code, 201, res2.content)

    def test_other_company_closed_period_does_not_lock(self):
        self.period(year='1405', start='1405/01/01', end='1405/12/29', status='closed', company=self.other)
        payload = self.invoice_payload('1405/08/01')
        res = self.api.post(INVOICES, payload, format='json')
        self.assertEqual(res.status_code, 201, res.content)
