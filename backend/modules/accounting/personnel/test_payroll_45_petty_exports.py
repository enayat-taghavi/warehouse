# -*- coding: utf-8 -*-
"""
طرح ۴.۵-ب۲: کسر بدهی تنخواه از حقوق (د۳)، خروجی‌های پروژه + ماه (د۸) و چند تست دود دامنه (د۷).
ماتریس کامل دامنه در test_payroll_45_scope.py (جدا) نوشته می‌شود.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import UserCompanyAccess
from personnel.models import (MonthlyPayrollRecord, PersonnelProfile, PettyCashAccount, PettyCashDebtSettlement,
                              DailyAttendance)
from personnel.payroll_engine import PayrollCalculationEngine, confirm_record_petty_deductions
from personnel.scoped_test_support import grant_section_perms
from personnel.test_payroll_45_excel import YM, _PayrollFixtureMixin
from companies.models import ProjectSection

User = get_user_model()
API = '/api/personnel/monthly-payroll/'
VIEWS = 'personnel.views_domains.payroll_views'


class _Base(_PayrollFixtureMixin):
    def person(self, code, section, user=None):
        return PersonnelProfile.objects.create(
            first_name='نفر', last_name=code, national_code=f'4520000{code}', company=self.company,
            project=self.project, section=section, is_active=True, approval_status='approved', job_grade='10',
            contract_hours=230, contract_base_salary=400000000, user=user)

    def attend(self, personnel, section):
        DailyAttendance.objects.bulk_create(self.day_rows(personnel, section, self.project, 200, 20))

    def calc(self, period):
        return PayrollCalculationEngine(period).calculate_period(period)

    def make_user(self, name, codes=(), company=None, role='employee'):
        company = company or self.company
        u = User.objects.create_user(username=f'p45b2_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), company=company, role=role, exact=True)
        return u

    def client_for(self, user, company=None):
        c = APIClient()
        c.force_authenticate(user)
        c.credentials(HTTP_X_COMPANY_ID=str((company or self.company).pk))
        return c


class PettyPayrollDeductionTests(_Base, TestCase):
    """د۳: کسر تنخواه در کسورات و قابل پرداخت، سقف، بی دو بار کسر، قطعی شدن تکرارپذیر."""

    def setUp(self):
        self.company, self.project, self.section = self.make_org('PB2')
        self.make_settings(self.company)
        self.emp = User.objects.create_user(username='p45b2_emp', password='x')
        self.worker = self.person('001', self.section, user=self.emp)
        self.attend(self.worker, self.section)
        self.period = self.ready_period(self.section)
        self.account = PettyCashAccount.objects.create(company=self.company, custodian=self.emp,
                                                       ceiling_amount=Decimal('1000000000'))
        rec = self.calc(self.period)[0]
        self.base_payable, self.base_deductions = rec.payable_amount, rec.total_deductions
        self.assertGreater(self.base_payable, 0)
        self.assertEqual(rec.petty_cash_deduction, 0)

    def settle(self, amount):
        return PettyCashDebtSettlement.objects.create(account=self.account, company=self.company,
                                                      amount=Decimal(amount), method='payroll', status='pending')

    def record(self):
        return MonthlyPayrollRecord.objects.get(period=self.period, personnel=self.worker)

    def test_deduction_in_totals_and_recalculation_does_not_double_count(self):
        s = self.settle('1000000')
        for _ in range(2):
            self.calc(self.period)
            rec = self.record()
            self.assertEqual(rec.petty_cash_deduction, Decimal('1000000'))
            self.assertEqual(rec.petty_settlement_ids, [s.id])
            self.assertEqual(rec.total_deductions, self.base_deductions + Decimal('1000000'))
            self.assertEqual(rec.payable_amount, self.base_payable - Decimal('1000000'))
        # تسویه شد (مثلاً نقدی/ابطال) ← محاسبهٔ دوباره کسر را از نو می‌سازد
        PettyCashDebtSettlement.objects.filter(pk=s.pk).update(status='void')
        self.calc(self.period)
        rec = self.record()
        self.assertEqual((rec.petty_cash_deduction, rec.petty_settlement_ids), (0, []))
        self.assertEqual(rec.payable_amount, self.base_payable)

    def test_cap_at_payable_only_fully_covered_settlements(self):
        too_big = self.settle(str(self.base_payable + 1))
        small = self.settle('500000')
        self.calc(self.period)
        rec = self.record()
        self.assertEqual(rec.petty_settlement_ids, [small.id])
        self.assertEqual(rec.petty_cash_deduction, Decimal('500000'))
        self.assertGreaterEqual(rec.payable_amount, 0)
        too_big.refresh_from_db()
        self.assertEqual(too_big.status, 'pending')

    def test_confirm_helper_is_idempotent(self):
        s = self.settle('700000')
        self.calc(self.period)
        rec = self.record()
        self.assertEqual(confirm_record_petty_deductions(rec), [s.id])
        s.refresh_from_db()
        self.assertEqual((s.status, s.payroll_ref), ('done', f'payroll:{rec.id}'))
        self.assertEqual(confirm_record_petty_deductions(rec), [])
        s.refresh_from_db()
        self.assertEqual(s.status, 'done')


class PayrollProjectExportTests(_Base, TestCase):
    """د۸: خروجی پروژه + ماه همهٔ بخش‌ها را جمع می‌کند؛ هشدار دورهٔ تأییدنشده؛ بانک فقط READY_TO_PAY."""

    def setUp(self):
        self.company, self.project, self.section = self.make_org('PX2')
        self.section_b = ProjectSection.objects.create(project=self.project, code='SEC-PX2B', name='بخش دوم',
                                                       is_active=True)
        self.make_settings(self.company)
        self.a1 = self.person('101', self.section)
        self.b1 = self.person('102', self.section_b)
        self.attend(self.a1, self.section)
        self.attend(self.b1, self.section_b)
        self.period_a = self.ready_period(self.section)
        self.period_b = self.ready_period(self.section_b)
        self.calc(self.period_a)
        self.calc(self.period_b)
        self.admin = User.objects.create_superuser(username='p45b2_admin', password='x', email='b2@x.test')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_dsk_project_month_aggregates_sections_and_flags_unapproved(self):
        with mock.patch(f'{VIEWS}.generate_dskwor_bytes', return_value=b'W') as wor:
            res = self.client.get(f'{API}export-dsk-zip/', {'project_id': self.project.id, 'year_month': YM})
        self.assertEqual(res.status_code, 200, getattr(res, 'data', None))
        ids = {r.personnel_id for r in wor.call_args.kwargs['payroll_records']}
        self.assertEqual(ids, {self.a1.id, self.b1.id})
        self.assertEqual(res['X-Payroll-Unapproved-Periods'], '2')
        self.assertIn('X-Payroll-Unapproved-Periods', res['Access-Control-Expose-Headers'])

        MonthlyPayrollRecord.objects.filter(period=self.period_a).update(payment_status='READY_TO_PAY')
        with mock.patch(f'{VIEWS}.generate_wh_tax_content', return_value='') as wh:
            res = self.client.get(f'{API}export-tax-wh/', {'period_id': self.period_a.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual({r.personnel_id for r in wh.call_args.args[0]}, {self.a1.id, self.b1.id})
        self.assertEqual(res['X-Payroll-Unapproved-Periods'], '1')
        from urllib.parse import unquote
        import json
        self.assertEqual(json.loads(unquote(res['X-Payroll-Unapproved-Sections'])), [self.section_b.name])

    def test_bank_excel_only_ready_to_pay_rows(self):
        MonthlyPayrollRecord.objects.filter(period=self.period_a).update(payment_status='READY_TO_PAY')
        with mock.patch(f'{VIEWS}.generate_bank_meli_excel', return_value=b'X') as bank:
            res = self.client.get(f'{API}export-bank-excel/', {'project_id': self.project.id, 'year_month': YM})
        self.assertEqual(res.status_code, 200)
        self.assertEqual([r.personnel_id for r in bank.call_args.args[0]], [self.a1.id])

    def test_import_tax_requires_period_id(self):
        res = self.client.post(f'{API}import-tax-excel/', {'items': [{'national_code': '1', 'tax_amount': 1}]},
                               format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['code'], 'period_required')


class PayrollScopeSmokeTests(_Base, TestCase):
    """د۷ (دود): بی مجوز 403، شرکت دیگر 404، کاربر عادی فقط ردیف خودش، پوشش کد ملی."""

    def setUp(self):
        self.company, self.project, self.section = self.make_org('PS2')
        self.make_settings(self.company)
        self.emp = self.make_user('emp')
        self.mine = self.person('201', self.section, user=self.emp)
        self.other = self.person('202', self.section)
        self.attend(self.mine, self.section)
        self.attend(self.other, self.section)
        self.period = self.ready_period(self.section)
        self.calc(self.period)
        self.other_company, _, _ = self.make_org('PS2X')

    def test_no_perm_403_and_other_company_404(self):
        c = self.client_for(self.emp)
        self.assertEqual(c.get(f'{API}export-tax-wh/', {'period_id': self.period.id}).status_code, 403)
        self.assertEqual(c.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json').status_code, 403)
        self.assertEqual(c.get(f'{API}export-monthly-excel/', {'period_id': self.period.id}).status_code, 403)
        outsider = self.make_user('out', ['view_sys_payroll'], company=self.other_company, role='accountant')
        o = self.client_for(outsider, self.other_company)
        self.assertEqual(o.get(f'{API}export-tax-wh/', {'period_id': self.period.id}).status_code, 404)
        self.assertEqual(o.get(f'{API}export-dsk-zip/', {'project_id': self.project.id, 'year_month': YM}).status_code, 404)
        self.assertEqual(o.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json').status_code, 404)
        self.assertEqual(o.get(f'{API}', {'period_id': self.period.id}).json(), [])

    def test_own_rows_only_and_sensitive_masked_for_payroll_role(self):
        rows = self.client_for(self.emp).get(f'{API}', {'period_id': self.period.id}).json()
        self.assertEqual([r['personnel'] for r in rows], [self.mine.id])
        self.assertEqual(rows[0]['national_code'], self.mine.national_code)
        other_rec = MonthlyPayrollRecord.objects.get(period=self.period, personnel=self.other)
        self.assertEqual(self.client_for(self.emp).get(f'{API}{other_rec.id}/').status_code, 404)

        payroll_user = self.make_user('pay', ['view_sys_payroll'])
        rows = self.client_for(payroll_user).get(f'{API}', {'period_id': self.period.id}).json()
        by_person = {r['personnel']: r for r in rows}
        self.assertEqual(set(by_person), {self.mine.id, self.other.id})
        self.assertNotEqual(by_person[self.other.id]['national_code'], self.other.national_code)
        self.assertTrue(by_person[self.other.id]['national_code'].endswith(self.other.national_code[-4:]))


class ReviewFixTests(_Base, TestCase):
    """Fixes from the 4.5-b reviews (tenant scope + data loss)."""

    def setUp(self):
        self.company, self.project, self.section = self.make_org('RF2')
        self.make_settings(self.company)
        self.emp = self.make_user('rf_emp')
        self.worker = self.person('301', self.section, user=self.emp)
        self.attend(self.worker, self.section)
        self.period = self.ready_period(self.section)
        self.account = PettyCashAccount.objects.create(company=self.company, custodian=self.emp,
                                                       ceiling_amount=Decimal('1000000000'))
        self.settlement = PettyCashDebtSettlement.objects.create(
            account=self.account, company=self.company, amount=Decimal('900000'), method='payroll', status='pending')
        self.calc(self.period)

    def record(self):
        return MonthlyPayrollRecord.objects.get(period=self.period, personnel=self.worker)

    def test_paid_row_keeps_confirmed_petty_on_recalculation(self):
        rec = self.record()
        confirm_record_petty_deductions(rec)
        MonthlyPayrollRecord.objects.filter(pk=rec.pk).update(payment_status='PAID')
        before = rec.payable_amount
        self.calc(self.period)
        rec = self.record()
        self.assertEqual((rec.petty_cash_deduction, rec.petty_settlement_ids), (Decimal('900000'), [self.settlement.id]))
        self.assertEqual(rec.payable_amount, before)

    def test_confirm_raises_for_settlement_voided_after_calculation(self):
        from personnel.petty_settlements import SettlementError
        PettyCashDebtSettlement.objects.filter(pk=self.settlement.pk).update(status='void')
        with self.assertRaises(SettlementError):
            confirm_record_petty_deductions(self.record())

    def test_release_petty_when_payable_turns_negative(self):
        from personnel.payroll_engine import release_petty_if_over_payable
        rec = self.record()
        rec.payable_amount = Decimal('-100')
        deductions = rec.total_deductions
        release_petty_if_over_payable(rec)
        self.assertEqual(rec.payable_amount, Decimal('899900'))
        self.assertEqual(rec.total_deductions, deductions - Decimal('900000'))
        self.assertEqual((rec.petty_cash_deduction, rec.petty_settlement_ids), (Decimal('0'), []))

    def test_legacy_calculate_never_touches_section_period_and_no_create_delete(self):
        payroll_user = self.make_user('rf_pay', ['view_sys_payroll'])
        c = self.client_for(payroll_user)
        stamp = self.record().updated_at
        resp = c.post(f'{API}calculate-period/', {'year_month': YM, 'company_id': self.company.id}, format='json')
        self.assertNotEqual(resp.status_code, 500)
        self.assertEqual(self.record().updated_at, stamp)
        rec = self.record()
        self.assertEqual(c.delete(f'{API}{rec.id}/').status_code, 405)
        self.assertEqual(self.client_for(self.emp).delete(f'{API}{rec.id}/').status_code, 405)
        self.assertEqual(c.post(f'{API}', {'period': self.period.id, 'personnel': self.worker.id}, format='json').status_code, 405)
        self.assertTrue(MonthlyPayrollRecord.objects.filter(pk=rec.pk).exists())
