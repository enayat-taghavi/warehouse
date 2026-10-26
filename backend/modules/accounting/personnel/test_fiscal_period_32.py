"""
طرح ۳.۲ (ب): دورهٔ مالی شرکت و قفل دورهٔ بسته.
اجرا: PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py test personnel.test_fiscal_period_32 --keepdb
"""
import importlib
from datetime import datetime
from decimal import Decimal

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AuditLog
from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.fiscal import (
    FISCAL_CLOSED_CODE, closed_period_for, ensure_period_open, fiscal_period_key, period_for_date, to_shamsi_str,
)
from personnel.models import (
    CompanyFiscalPeriod, Counterparty, ExpenseInvoice, PettyCashAccount, PettyCashTransaction,
)
from personnel.workflows import is_invoice_locked

User = get_user_model()
PERIODS = '/api/personnel/company-fiscal-periods/'
INVOICES = '/api/personnel/expense-invoices/'
PETTY = '/api/personnel/petty-cash-transactions/'


class FiscalFixtures(TestCase):
    """شرکت الف (با بخش و طرف حساب) و شرکت ب؛ مدیر کل با دسترسی هر دو. سازنده‌ها برای تست‌های دیگر هم."""

    def setUp(self):
        self.company = Company.objects.create(code='FP32-A', name='شرکت دوره الف', is_active=True)
        self.other = Company.objects.create(code='FP32-B', name='شرکت دوره ب', is_active=True)
        project = Project.objects.create(company=self.company, code='FP32-P', name='پروژه الف')
        other_project = Project.objects.create(company=self.other, code='FP32-PB', name='پروژه ب')
        self.sec = ProjectSection.objects.create(project=project, code='FP32-S', name='بخش الف')
        self.other_sec = ProjectSection.objects.create(project=other_project, code='FP32-SB', name='بخش ب')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف حساب دوره', counterparty_type='other')
        self.admin = User.objects.create_superuser(username='fp32_admin', password='x')
        UserCompanyAccess.objects.create(user=self.admin, company=self.company, is_default=True)
        UserCompanyAccess.objects.create(user=self.admin, company=self.other)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.api.credentials(HTTP_X_COMPANY_ID=str(self.company.id))

    def period(self, year='1405', start='1405/01/01', end='1405/12/29', status='open', company=None, is_active=False):
        return CompanyFiscalPeriod.objects.create(
            company=company or self.company, fiscal_year=year, title=f'سال {year}',
            start_date=start, end_date=end, status=status, is_active=is_active)

    def invoice(self, date='1405/08/01', section=None, status='draft'):
        return ExpenseInvoice.objects.create(
            section=section or self.sec, counterparty=self.cp,
            invoice_number=f'FP32-{ExpenseInvoice.objects.count() + 1}', invoice_date_shamsi=date,
            amount=Decimal('1000'), category='c', description='d', created_by=self.admin, status=status)

    def petty(self, date='1405/08/01', status='draft'):
        account, _ = PettyCashAccount.objects.get_or_create(
            section=self.sec, custodian=self.admin, defaults={'ceiling_amount': Decimal('100000000')})
        return PettyCashTransaction.objects.create(
            section=self.sec, account=account, custodian=self.admin, created_by=self.admin,
            amount=Decimal('10000'), transaction_date_shamsi=date, title='تنخواه دوره', category='متفرقه',
            status=status)

    def invoice_payload(self, date):
        return {'section': self.sec.id, 'counterparty': self.cp.id, 'invoice_number': 'FP32-NEW',
                'invoice_date_shamsi': date, 'amount': '1000', 'category': 'c', 'description': 'd'}

    def assert_closed(self, res, field):
        self.assertEqual(res.status_code, 400, res.content)
        body = res.json()
        self.assertEqual(body.get('code'), FISCAL_CLOSED_CODE, body)
        self.assertIn(field, body)


class FiscalHelperTests(FiscalFixtures):
    def test_to_shamsi_str_forms(self):
        self.assertEqual(to_shamsi_str('۱۴۰۵-۱-۲'), '1405/01/02')
        self.assertEqual(to_shamsi_str('1405/1/2'), '1405/01/02')
        self.assertEqual(to_shamsi_str('2026-10-26'), '1405/08/04')
        self.assertIsNone(to_shamsi_str('1405/13/01'))
        self.assertIsNone(to_shamsi_str('abc'))
        self.assertIsNone(to_shamsi_str(''))
        self.assertEqual(to_shamsi_str(datetime(2026, 10, 26).date()), '1405/08/04')

    def test_period_lookup_and_other_company(self):
        p = self.period(status='closed')
        self.assertEqual(period_for_date(self.company.id, '1405/08/01'), p)
        self.assertEqual(closed_period_for(self.company.id, '۱۴۰۵/۰۸/۰۱'), p)
        self.assertIsNone(period_for_date(self.company.id, '1406/01/01'))
        self.assertIsNone(closed_period_for(self.other.id, '1405/08/01'))
        ensure_period_open(self.other.id, '1405/08/01', 'd')  # شرکت دیگر قفل نیست
        ensure_period_open(self.company.id, '1406/02/01', 'd')  # بیرون از دوره قفل نیست

    def test_fiscal_period_key(self):
        at = timezone.make_aware(datetime(2026, 10, 26, 12, 0))
        self.assertEqual(fiscal_period_key(self.company.id, at), '1405')
        self.period(year='1499', start='1405/01/01', end='1405/12/29')
        self.assertEqual(fiscal_period_key(self.company.id, at), '1499')

    def test_fiscal_period_key_as_series_period_key(self):
        from numbering.registry import NumberSeriesSpec
        spec = NumberSeriesSpec(key='accounting.zz_test', title_fa='آزمایشی', period_key=fiscal_period_key)
        self.period(year='1499')
        at = timezone.make_aware(datetime(2026, 10, 26, 12, 0))
        self.assertEqual(spec.period_for(self.company.id, at), '1499')
        self.assertEqual(spec.period_for(self.other.id, at), '1405')


class FiscalPeriodApiTests(FiscalFixtures):
    def create(self, **data):
        payload = {'company': self.company.id, 'title': 'دوره'}
        payload.update(data)
        return self.api.post(PERIODS, payload, format='json')

    def test_dates_normalized_and_year_filled(self):
        res = self.create(start_date='۱۴۰۵-۱-۱', end_date='1405/12/29')
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body['start_date'], '1405/01/01')
        self.assertEqual(body['fiscal_year'], '1405')
        self.assertFalse(body['is_locked'])

    def test_bad_dates_rejected(self):
        self.assertEqual(self.create(start_date='1405/13/01', end_date='1405/12/29').status_code, 400)
        res = self.create(start_date='1405/12/01', end_date='1405/01/01')
        self.assertEqual(res.status_code, 400)
        self.assertIn('end_date', res.json())

    def test_overlap_rejected_adjacent_allowed(self):
        self.assertEqual(self.create(start_date='1405/01/01', end_date='1405/12/29').status_code, 201)
        res = self.create(fiscal_year='1406', start_date='1405/12/01', end_date='1406/12/29')
        self.assertEqual(res.status_code, 400)
        self.assertIn('start_date', res.json())
        self.assertEqual(self.create(start_date='1406/01/01', end_date='1406/12/29').status_code, 201)
        # شرکت دیگر با همان بازه آزاد است
        self.assertEqual(self.create(company=self.other.id, start_date='1405/01/01', end_date='1405/12/29').status_code, 201)

    def test_duplicate_year_rejected(self):
        self.period(start='1404/01/01', end='1404/12/29')
        res = self.create(fiscal_year='1405', start_date='1406/01/01', end_date='1406/12/29')
        self.assertEqual(res.status_code, 400)
        self.assertIn('fiscal_year', res.json())

    def test_update_overlap_excludes_self(self):
        p = self.period()
        res = self.api.patch(f'{PERIODS}{p.id}/', {'end_date': '1405/12/28'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)

    def test_single_active(self):
        first = self.period(is_active=True, start='1404/01/01', end='1404/12/29', year='1404')
        res = self.create(start_date='1405/01/01', end_date='1405/12/29', is_active=True)
        self.assertEqual(res.status_code, 201)
        first.refresh_from_db()
        self.assertFalse(first.is_active)
        self.assertEqual(CompanyFiscalPeriod.objects.filter(company=self.company, is_active=True).count(), 1)

    def test_freeze_removed_and_migration_reverts_frozen(self):
        p = self.period()
        self.assertEqual(self.api.post(f'{PERIODS}{p.id}/freeze-period/').status_code, 404)
        CompanyFiscalPeriod.objects.filter(pk=p.pk).update(status='frozen')
        mig = importlib.import_module('personnel.migrations.0010_fiscal_period_no_frozen')
        mig.frozen_to_open(django_apps, None)
        p.refresh_from_db()
        self.assertEqual(p.status, 'open')

    def test_close_reopen_and_audit(self):
        p = self.period()
        res = self.api.post(f'{PERIODS}{p.id}/close-period/', {'notes': 'مصوب'}, format='json')
        self.assertEqual(res.status_code, 200)
        p.refresh_from_db()
        self.assertEqual(p.status, 'closed')
        self.assertEqual(p.closed_by, self.admin)
        # تکرار بستن بی‌اثر و ۲۰۰
        self.assertEqual(self.api.post(f'{PERIODS}{p.id}/close-period/').status_code, 200)
        self.assertEqual(self.api.post(f'{PERIODS}{p.id}/reopen-period/').status_code, 200)
        p.refresh_from_db()
        self.assertEqual(p.status, 'open')
        self.assertIsNone(p.closed_at)
        res = self.api.post(f'{PERIODS}{p.id}/reopen-period/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'not_closed')
        events = list(AuditLog.objects.filter(target_model='CompanyFiscalPeriod', target_object_id=str(p.id))
                      .values_list('details', flat=True))
        kinds = [d.get('event') for d in events if isinstance(d, dict)]
        self.assertEqual(kinds.count('close'), 1)
        self.assertEqual(kinds.count('reopen'), 1)

    def test_create_and_delete_audited(self):
        res = self.create(start_date='1405/01/01', end_date='1405/12/29')
        pid = res.json()['id']
        self.assertEqual(self.api.delete(f'{PERIODS}{pid}/').status_code, 204)
        actions = set(AuditLog.objects.filter(target_model='CompanyFiscalPeriod', target_object_id=str(pid))
                      .values_list('action', flat=True))
        self.assertEqual(actions, {'CREATE', 'DELETE'})

    def test_closed_range_immutable_title_editable(self):
        p = self.period(status='closed')
        res = self.api.patch(f'{PERIODS}{p.id}/', {'end_date': '1405/12/28'}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.api.patch(f'{PERIODS}{p.id}/', {'title': 'عنوان تازه'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.api.delete(f'{PERIODS}{p.id}/').status_code, 400)

    def test_date_filter(self):
        p = self.period()
        self.period(year='1406', start='1406/01/01', end='1406/12/29')
        res = self.api.get(PERIODS, {'company_id': self.company.id, 'date': '۱۴۰۵/۰۸/۰۱'})
        self.assertEqual([r['id'] for r in res.json()], [p.id])
        self.assertEqual(self.api.get(PERIODS, {'company_id': self.company.id, 'date': 'bad'}).json(), [])


class ClosedPeriodLockTests(FiscalFixtures):
    def test_invoice_create_closed_rejected_open_allowed(self):
        self.period(status='closed')
        self.assert_closed(self.api.post(INVOICES, self.invoice_payload('1405/08/01'), format='json'),
                           'invoice_date_shamsi')
        res = self.api.post(INVOICES, self.invoice_payload('1406/01/05'), format='json')
        self.assertEqual(res.status_code, 201, res.content)

    def test_invoice_move_into_or_out_of_closed(self):
        self.period(status='closed')
        open_inv = self.invoice(date='1406/02/01')
        self.assert_closed(self.api.patch(f'{INVOICES}{open_inv.id}/', {'invoice_date_shamsi': '1405/08/01'},
                                          format='json'), 'invoice_date_shamsi')
        closed_inv = self.invoice(date='1405/08/01')
        self.assert_closed(self.api.patch(f'{INVOICES}{closed_inv.id}/', {'invoice_date_shamsi': '1406/02/01'},
                                          format='json'), 'invoice_date_shamsi')
        self.assert_closed(self.api.delete(f'{INVOICES}{closed_inv.id}/'), 'invoice_date_shamsi')
        self.assert_closed(self.api.post(f'{INVOICES}{closed_inv.id}/submit/'), 'invoice_date_shamsi')
        self.assertTrue(ExpenseInvoice.objects.filter(pk=closed_inv.pk).exists())

    def test_invoice_lock_hook(self):
        p = self.period()
        inv = self.invoice()
        self.assertFalse(is_invoice_locked(inv.pk))
        CompanyFiscalPeriod.objects.filter(pk=p.pk).update(status='closed')
        self.assertTrue(is_invoice_locked(inv.pk))
        self.assertFalse(is_invoice_locked(self.invoice(date='1406/01/10').pk))
        self.assertFalse(is_invoice_locked(999999))

    def test_petty_cash_closed_rejected(self):
        self.period(status='closed')
        payload = {'section': self.sec.id, 'custodian': self.admin.id, 'amount': '10000', 'transaction_date_shamsi': '1405/08/01',
                   'title': 'تنخواه', 'category': 'متفرقه'}
        self.assert_closed(self.api.post(PETTY, payload, format='json'), 'transaction_date_shamsi')
        tx = self.petty()
        self.assert_closed(self.api.post(f'{PETTY}{tx.id}/submit/'), 'transaction_date_shamsi')
        self.assert_closed(self.api.delete(f'{PETTY}{tx.id}/'), 'transaction_date_shamsi')
        payload['transaction_date_shamsi'] = '1406/01/05'
        self.assertEqual(self.api.post(PETTY, payload, format='json').status_code, 201)

    def test_other_company_period_does_not_lock(self):
        self.period(status='closed', company=self.other)
        res = self.api.post(INVOICES, self.invoice_payload('1405/08/01'), format='json')
        self.assertEqual(res.status_code, 201, res.content)
