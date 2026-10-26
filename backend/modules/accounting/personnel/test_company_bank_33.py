"""
طرح ۳.۳ (ب): موجودی اولیهٔ حساب بانکی شرکت، کنش تغییر، سابقه، پوشش و منع حذف با گردش.
اجرا: PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py test personnel.test_company_bank_33 --noinput
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuditLog
from companies.models import Company, UserCompanyAccess
from companies.testing import grant_membership
from personnel.company_bank import bank_account_has_movements, can_see_opening_balance
from personnel.fiscal import FISCAL_CLOSED_CODE
from personnel.models import CompanyBankAccount, CompanyBankOpeningBalanceChange, CompanyFiscalPeriod

User = get_user_model()
URL = '/api/personnel/company-bank-accounts/'
SHEBA_A = 'IR820540102680020817909002'
from personnel.sheba_utils import generate_sheba_from_account  # noqa: E402
SHEBA_B = generate_sheba_from_account('017', '9876543210')
MOVES = 'personnel.company_bank.bank_account_has_movements'


class BankFixtures(TestCase):
    """شرکت الف و ب؛ مدیر کل، نویسندهٔ `bank`، خوانندهٔ `bank`، عضو ساده و دارندهٔ `bank_opening_balance`."""

    def setUp(self):
        self.company = Company.objects.create(code='CB33-A', name='شرکت بانک الف', is_active=True)
        self.other = Company.objects.create(code='CB33-B', name='شرکت بانک ب', is_active=True)
        self.admin = User.objects.create_superuser(username='cb33_admin', password='x')
        self.writer = self.user('cb33_writer', {'bank': 'write'})
        self.reader = self.user('cb33_reader', {'bank': 'read'})
        self.member = self.user('cb33_member', {})
        grant_membership(self.member, self.company)  # عضو شرکت بی هیچ بخش
        self.opener = self.user('cb33_opener', {'bank': 'write', 'bank_opening_balance': 'write'})
        self.account = CompanyBankAccount.objects.create(
            company=self.company, bank_name='بانک ملت', account_number='1', sheba_number=SHEBA_A,
            opening_balance=Decimal('1000'), opening_balance_date='1405/01/01')

    def user(self, name, levels, company=None):
        u = User.objects.create_user(username=name, password='x')
        UserCompanyAccess.objects.create(user=u, company=company or self.company, is_default=True,
                                         section_levels=levels)
        return u

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def period(self, start='1405/01/01', end='1405/12/29', status='open', year='1405'):
        return CompanyFiscalPeriod.objects.create(
            company=self.company, fiscal_year=year, title=f'سال {year}',
            start_date=start, end_date=end, status=status)

    def set_opening(self, user, amount='2000', date='1405/02/01', reason='', account=None):
        account = account or self.account
        return self.api(user).post(f'{URL}{account.id}/set-opening-balance/', {
            'opening_balance': amount, 'opening_balance_date': date, 'reason': reason}, format='json')


class CreateTests(BankFixtures):
    def body(self, **extra):
        return {'company': self.company.id, 'bank_name': 'بانک ملی', 'account_number': '2',
                'sheba_number': SHEBA_B, **extra}

    def test_create_without_date_is_400(self):
        r = self.api(self.admin).post(URL, self.body(opening_balance='500'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('opening_balance_date', r.json())

    def test_create_with_date_writes_first_history_row(self):
        r = self.api(self.admin).post(URL, self.body(opening_balance='500', opening_balance_date='۱۴۰۵-۰۳-۰۱'),
                                      format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['opening_balance_date'], '1405/03/01')
        self.assertEqual(Decimal(r.json()['opening_balance']), Decimal('500'))
        rows = CompanyBankOpeningBalanceChange.objects.filter(account_id=r.json()['id'])
        self.assertEqual(rows.count(), 1)
        self.assertIsNone(rows[0].old_amount)
        self.assertIsNone(rows[0].old_date)
        self.assertTrue(AuditLog.objects.filter(action='bank_opening_balance_set', target_object_id=str(r.json()['id'])).exists())

    def test_create_empty_amount_is_zero_and_negative_rejected(self):
        r = self.api(self.admin).post(URL, self.body(opening_balance_date='1405/03/01'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Decimal(r.json()['opening_balance']), 0)
        r = self.api(self.admin).post(URL, self.body(sheba_number=SHEBA_A, opening_balance='-1',
                                                     opening_balance_date='1405/03/01', company=self.other.id),
                                      format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_create_invalid_date_is_400(self):
        r = self.api(self.admin).post(URL, self.body(opening_balance_date='1405/13/40'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('opening_balance_date', r.json())

    def test_create_in_closed_period_is_400(self):
        self.period(status='closed')
        r = self.api(self.admin).post(URL, self.body(opening_balance_date='1405/03/01'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json().get('code'), FISCAL_CLOSED_CODE)
        self.assertFalse(CompanyBankAccount.objects.filter(sheba_number=SHEBA_B).exists())


class UpdateTests(BankFixtures):
    def test_patch_changed_opening_balance_is_400(self):
        r = self.api(self.writer).patch(f'{URL}{self.account.id}/', {'opening_balance': '5'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('opening_balance', r.json())
        r = self.api(self.writer).patch(f'{URL}{self.account.id}/', {'opening_balance_date': '1405/05/05'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.account.refresh_from_db()
        self.assertEqual(self.account.opening_balance, Decimal('1000'))

    def test_member_patch_cannot_probe_hidden_balance(self):
        # پاسخ برای رقم درست و نادرست یکسان (403) است، پس رقم پوشیده حدس زده نمی‌شود (یافتهٔ tenant-scope-reviewer)
        for guess in ('1000', '999'):
            r = self.api(self.member).patch(f'{URL}{self.account.id}/', {'opening_balance': guess}, format='json')
            self.assertEqual(r.status_code, 403, r.content)

    def test_patch_same_values_and_other_fields_ok(self):
        r = self.api(self.writer).patch(f'{URL}{self.account.id}/', {
            'opening_balance': '1000', 'opening_balance_date': '1405/01/01', 'account_title': 'حقوق'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.account.refresh_from_db()
        self.assertEqual(self.account.account_title, 'حقوق')


class SetOpeningTests(BankFixtures):
    def test_without_movements_bank_write_is_enough(self):
        r = self.set_opening(self.writer)
        self.assertEqual(r.status_code, 200, r.content)
        self.account.refresh_from_db()
        self.assertEqual((self.account.opening_balance, self.account.opening_balance_date), (Decimal('2000'), '1405/02/01'))
        row = self.account.opening_balance_changes.get()
        self.assertEqual((row.old_amount, row.old_date, row.new_amount, row.new_date),
                         (Decimal('1000'), '1405/01/01', Decimal('2000'), '1405/02/01'))
        self.assertEqual(row.changed_by, self.writer)
        self.assertFalse(row.had_movements)
        log = AuditLog.objects.get(action='bank_opening_balance_changed')
        self.assertEqual(log.module, 'treasury')
        self.assertEqual(log.company_id, self.company.id)

    def test_repeat_is_noop(self):
        self.assertEqual(self.set_opening(self.writer).status_code, 200)
        r = self.set_opening(self.writer)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.account.opening_balance_changes.count(), 1)

    def test_reader_and_member_cannot_set(self):
        self.assertEqual(self.set_opening(self.reader).status_code, 403)
        self.assertEqual(self.set_opening(self.member).status_code, 403)

    def test_missing_or_bad_input_is_400(self):
        r = self.set_opening(self.writer, date='')
        self.assertEqual(r.status_code, 400)
        self.assertIn('opening_balance_date', r.json())
        self.assertEqual(self.set_opening(self.writer, amount='-5').status_code, 400)
        self.assertEqual(self.set_opening(self.writer, amount='abc').status_code, 400)
        self.assertEqual(self.set_opening(self.writer, date='1405/13/01').status_code, 400)

    def test_with_movements_needs_permission_and_reason(self):
        with mock.patch(MOVES, return_value=True):
            self.assertEqual(self.set_opening(self.writer, reason='علت').status_code, 403)
            r = self.set_opening(self.opener)
            self.assertEqual(r.status_code, 400, r.content)
            self.assertIn('reason', r.json())
            r = self.set_opening(self.opener, reason='اصلاح خطای ثبت')
            self.assertEqual(r.status_code, 200, r.content)
        row = self.account.opening_balance_changes.get()
        self.assertTrue(row.had_movements)
        self.assertEqual(row.reason, 'اصلاح خطای ثبت')

    def test_closed_period_old_or_new_date_is_400(self):
        self.period(start='1404/01/01', end='1404/12/29', status='closed', year='1404')
        r = self.set_opening(self.writer, date='1404/06/01')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json().get('code'), FISCAL_CLOSED_CODE)
        self.period(status='closed')  # دورهٔ تاریخ فعلی حساب (۱۴۰۵) هم بسته
        r = self.set_opening(self.writer, date='1406/01/01')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json().get('code'), FISCAL_CLOSED_CODE)
        self.assertEqual(self.account.opening_balance_changes.count(), 0)

    def test_other_company_account_is_hidden(self):
        stranger = self.user('cb33_stranger', {'bank': 'write'}, company=self.other)
        self.assertIn(self.set_opening(stranger).status_code, (403, 404))
        self.assertIn(self.api(stranger).get(f'{URL}{self.account.id}/opening-history/').status_code, (403, 404))


class VisibilityTests(BankFixtures):
    def test_member_sees_null_reader_and_admin_see_value(self):
        def first(user):
            r = self.api(user).get(f'{URL}?company_id={self.company.id}')
            self.assertEqual(r.status_code, 200, r.content)
            data = r.json()
            return (data['results'] if isinstance(data, dict) else data)[0]
        member_row = first(self.member)
        self.assertIsNone(member_row['opening_balance'])
        self.assertIsNone(member_row['opening_balance_date'])
        self.assertEqual(member_row['sheba_number'], SHEBA_A)
        self.assertEqual(Decimal(first(self.reader)['opening_balance']), Decimal('1000'))
        self.assertEqual(first(self.admin)['opening_balance_date'], '1405/01/01')
        self.assertFalse(first(self.admin)['has_movements'])

    def test_helper_levels(self):
        self.assertTrue(can_see_opening_balance(self.admin, self.company.id))
        self.assertTrue(can_see_opening_balance(self.reader, self.company.id))
        self.assertFalse(can_see_opening_balance(self.member, self.company.id))
        self.assertFalse(can_see_opening_balance(None, self.company.id))

    def test_history_needs_bank_read(self):
        self.set_opening(self.writer)
        self.assertEqual(self.api(self.member).get(f'{URL}{self.account.id}/opening-history/').status_code, 403)
        r = self.api(self.reader).get(f'{URL}{self.account.id}/opening-history/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['count'], 1)
        self.assertEqual(r.json()['results'][0]['new_date'], '1405/02/01')


class MovementTests(BankFixtures):
    def test_history_rows_are_not_movements(self):
        self.set_opening(self.writer)
        self.assertFalse(bank_account_has_movements(self.account))

    def test_delete_blocked_with_movements(self):
        with mock.patch(MOVES, return_value=True):
            r = self.api(self.writer).delete(f'{URL}{self.account.id}/')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertTrue(CompanyBankAccount.objects.filter(id=self.account.id).exists())
        r = self.api(self.writer).delete(f'{URL}{self.account.id}/')
        self.assertEqual(r.status_code, 204, r.content)
