"""
Release v1 step 3.3-b: API scenario tests for company bank account opening balance.
"""
from decimal import Decimal
import unittest

from accounts.models import AuditLog
from personnel.models import CompanyBankAccount
from personnel.test_company_bank_33 import BankFixtures, SHEBA_B, URL


class CompanyBankApiTests(BankFixtures):
    def test_create_with_date_writes_one_history_row(self):
        resp = self.api(self.admin).post(
            URL,
            {
                'company': self.company.id,
                'bank_name': 'B2',
                'account_number': '2',
                'sheba_number': SHEBA_B,
                'opening_balance': '500',
                'opening_balance_date': '1405/03/01',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        account = CompanyBankAccount.objects.get(id=resp.data['id'])
        changes = list(account.opening_balance_changes.all())
        self.assertEqual(len(changes), 1)
        h = changes[0]
        self.assertIsNone(h.old_amount)
        self.assertIsNone(h.old_date)
        self.assertEqual(h.new_date, '1405/03/01')

    def test_change_adds_history_and_treasury_audit(self):
        resp = self.api(self.admin).post(
            URL,
            {
                'company': self.company.id,
                'bank_name': 'B2',
                'account_number': '2',
                'sheba_number': SHEBA_B,
                'opening_balance': '500',
                'opening_balance_date': '1405/03/01',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        account = CompanyBankAccount.objects.get(id=resp.data['id'])

        resp_change = self.set_opening(self.admin, account=account)
        self.assertEqual(resp_change.status_code, 200)

        self.assertEqual(account.opening_balance_changes.count(), 2)
        self.assertTrue(
            AuditLog.objects.filter(
                module='treasury',
                action='bank_opening_balance_changed',
                target_object_id=str(account.id),
            ).exists()
        )

    def test_repeat_same_body_is_noop(self):
        r1 = self.set_opening(self.writer)
        r2 = self.set_opening(self.writer)
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(self.account.opening_balance_changes.count(), 1)

    def test_member_sees_null_in_list_and_company_detail(self):
        client_member = self.api(self.member)
        resp_list = client_member.get(f'{URL}?company_id={self.company.id}')
        self.assertEqual(resp_list.status_code, 200)
        items = resp_list.data if isinstance(resp_list.data, list) else resp_list.data.get('results', [])
        acct_item = next(item for item in items if item['id'] == self.account.id)
        self.assertIsNone(acct_item['opening_balance'])
        self.assertIsNone(acct_item['opening_balance_date'])

        resp_detail = client_member.get(f'/api/personnel/companies/{self.company.id}/')
        if resp_detail.status_code == 200:
            bank_accounts = resp_detail.data.get('bank_accounts', [])
            detail_item = next(item for item in bank_accounts if item['id'] == self.account.id)
            self.assertIsNone(detail_item['opening_balance'])
            self.assertIsNone(detail_item['opening_balance_date'])

        client_reader = self.api(self.reader)
        resp_reader = client_reader.get(f'{URL}?company_id={self.company.id}')
        self.assertEqual(resp_reader.status_code, 200)
        items_reader = resp_reader.data if isinstance(resp_reader.data, list) else resp_reader.data.get('results', [])
        reader_item = next(item for item in items_reader if item['id'] == self.account.id)
        self.assertEqual(reader_item['opening_balance_date'], '1405/01/01')

    def test_closed_period_new_date_rejected(self):
        self.period(start='1406/01/01', end='1406/12/29', status='closed', year='1406')
        resp = self.set_opening(self.writer, date='1406/05/01')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data.get('code'), 'fiscal_period_closed')
        self.assertEqual(self.account.opening_balance_changes.count(), 0)

    def test_history_forbidden_for_plain_member(self):
        r_mem = self.api(self.member).get(f'{URL}{self.account.id}/opening-history/')
        self.assertEqual(r_mem.status_code, 403)
        r_read = self.api(self.reader).get(f'{URL}{self.account.id}/opening-history/')
        self.assertEqual(r_read.status_code, 200)
