# -*- coding: utf-8 -*-
"""
طرح ۴.۵-ب: آزمون‌های جامع دامنه، مجوزها و پوشش داده‌های حساس ماژول حقوق و دستمزد.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
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

User = get_user_model()
API = '/api/personnel/monthly-payroll/'


class _Base(_PayrollFixtureMixin):
    def person(self, code, section, user=None, account_number=None):
        return PersonnelProfile.objects.create(
            first_name='نفر', last_name=code, national_code=f'4520000{code}', company=self.company,
            project=self.project, section=section, is_active=True, approval_status='approved', job_grade='10',
            contract_hours=230, contract_base_salary=400000000, user=user,
            account_number=account_number or f'60379900000{code}')

    def attend(self, personnel, section, total_hours=200, days=20, approval='APPROVED'):
        return DailyAttendance.objects.bulk_create(
            self.day_rows(personnel, section, section.project, total_hours, days, approval=approval)
        )

    def calc(self, period):
        return PayrollCalculationEngine(period).calculate_period(period)

    def make_user(self, name, codes=(), company=None, role='employee'):
        company = company or self.company
        u = User.objects.create_user(username=f'p45s_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), company=company, role=role, exact=True)
        return u

    def client_for(self, user, company=None):
        c = APIClient()
        c.force_authenticate(user)
        c.credentials(HTTP_X_COMPANY_ID=str((company or self.company).pk))
        return c


class Payroll45ScopeTests(_Base, TestCase):
    def setUp(self):
        self.company, self.project, self.section = self.make_org('P45S1')
        self.make_settings(self.company)
        self.period = self.ready_period(self.section)

    def test_section_period_counts_only_own_section_attendance(self):
        section_b = ProjectSection.objects.create(
            project=self.project, code='SEC-P45SB', name='بخش دوم', is_active=True)
        self.ready_period(section_b)
        p = self.person('101', self.section)
        self.attend(p, self.section, total_hours=150, days=15)
        self.attend(p, section_b, total_hours=60, days=6)

        user = self.make_user('pay_a', ['view_sys_payroll'])
        client = self.client_for(user)
        res = client.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res.status_code, 200)

        rec = MonthlyPayrollRecord.objects.get(period=self.period, personnel=p)
        self.assertEqual(rec.worked_hours, Decimal('150.00'))
        self.assertNotEqual(rec.worked_hours, Decimal('210.00'))

    def test_not_ready_period_400_and_skipped_list(self):
        sec_open = ProjectSection.objects.create(
            project=self.project, code='SEC-P45S_OP', name='بخش باز', is_active=True)
        period_open, _ = get_or_create_period(None, sec_open.id, YM)
        self.assertEqual(period_open.status, 'OPEN')

        user = self.make_user('pay_b', ['view_sys_payroll'])
        client = self.client_for(user)

        res_open = client.post(f'{API}calculate-period/', {'period_id': period_open.id}, format='json')
        self.assertEqual(res_open.status_code, 400)
        self.assertEqual(res_open.json().get('code'), 'attendance_not_approved')

        p_attended = self.person('201', self.section)
        p_skipped = self.person('202', self.section)
        self.attend(p_attended, self.section, total_hours=120, days=12)

        res_ready = client.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json')
        self.assertEqual(res_ready.status_code, 200)

        self.assertFalse(MonthlyPayrollRecord.objects.filter(period=self.period, personnel=p_skipped).exists())
        self.assertTrue(MonthlyPayrollRecord.objects.filter(period=self.period, personnel=p_attended).exists())

        skipped_ids = {item['personnel_id'] for item in res_ready.json().get('skipped_no_attendance', [])}
        self.assertIn(p_skipped.id, skipped_ids)
        self.assertNotIn(p_attended.id, skipped_ids)

    def test_body_company_id_ignored(self):
        other_company, _, _ = self.make_org('P45SC')
        user = self.make_user('pay_c', ['view_sys_payroll'])
        client = self.client_for(user)

        p = self.person('301', self.section)
        self.attend(p, self.section, total_hours=100, days=10)

        initial_other_periods = MonthlyWorkPeriod.objects.filter(company=other_company).count()

        res = client.post(
            f'{API}calculate-period/',
            {'period_id': self.period.id, 'company_id': other_company.id},
            format='json'
        )
        self.assertEqual(res.status_code, 200)

        records = MonthlyPayrollRecord.objects.filter(period=self.period)
        self.assertTrue(records.exists())
        for r in records:
            self.assertEqual(r.period.company_id, self.company.id)
            self.assertEqual(r.personnel.company_id, self.company.id)

        self.assertEqual(MonthlyWorkPeriod.objects.filter(company=other_company).count(), initial_other_periods)

    def test_employee_sees_only_own_row(self):
        emp_user = self.make_user('emp_d', codes=())
        p_mine = self.person('401', self.section, user=emp_user)
        p_other = self.person('402', self.section)
        self.attend(p_mine, self.section, total_hours=100, days=10)
        self.attend(p_other, self.section, total_hours=100, days=10)
        self.calc(self.period)

        rec_mine = MonthlyPayrollRecord.objects.get(period=self.period, personnel=p_mine)
        rec_other = MonthlyPayrollRecord.objects.get(period=self.period, personnel=p_other)

        client = self.client_for(emp_user)

        res_list = client.get(f'{API}', {'period_id': self.period.id})
        self.assertEqual(res_list.status_code, 200)
        data = res_list.json()
        self.assertEqual([r['id'] for r in data], [rec_mine.id])
        self.assertEqual([r['personnel'] for r in data], [p_mine.id])

        res_detail = client.get(f'{API}{rec_other.id}/')
        self.assertEqual(res_detail.status_code, 404)

        res_del = client.delete(f'{API}{rec_mine.id}/')
        self.assertEqual(res_del.status_code, 405)

    def test_other_company_404_everywhere(self):
        other_company, other_proj, other_sec = self.make_org('P45SE')
        self.make_settings(other_company)
        outsider = self.make_user('out_e', ['view_sys_payroll'], company=other_company, role='accountant')
        client = self.client_for(outsider, company=other_company)

        p = self.person('501', self.section)
        self.attend(p, self.section, total_hours=100, days=10)
        self.calc(self.period)
        rec = MonthlyPayrollRecord.objects.get(period=self.period, personnel=p)

        self.assertEqual(client.get(f'{API}', {'period_id': self.period.id}).json(), [])
        self.assertEqual(client.get(f'{API}{rec.id}/').status_code, 404)
        self.assertEqual(client.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json').status_code, 404)
        self.assertEqual(client.get(f'{API}export-tax-wh/', {'period_id': self.period.id}).status_code, 404)
        self.assertEqual(client.get(f'{API}export-tax-wp/', {'period_id': self.period.id}).status_code, 404)
        self.assertEqual(client.get(f'{API}export-dsk-zip/', {'period_id': self.period.id}).status_code, 404)
        self.assertEqual(client.get(f'{API}export-bank-excel/', {'period_id': self.period.id}).status_code, 404)
        self.assertEqual(client.get(f'{API}export-monthly-excel/', {'period_id': self.period.id}).status_code, 404)
        self.assertEqual(client.get(f'{API}export-dsk-zip/', {'project_id': self.project.id, 'year_month': YM}).status_code, 404)

    def test_no_payroll_perm_403(self):
        user = self.make_user('noperm_f', codes=(), company=self.company)
        client = self.client_for(user)

        p = self.person('601', self.section)
        self.attend(p, self.section, total_hours=100, days=10)
        self.calc(self.period)

        self.assertEqual(client.post(f'{API}calculate-period/', {'period_id': self.period.id}, format='json').status_code, 403)
        self.assertEqual(client.post(f'{API}import-tax-excel/', {'period_id': self.period.id, 'items': [{'national_code': '4520000601', 'tax_amount': 1000}]}, format='json').status_code, 403)
        self.assertEqual(client.get(f'{API}export-tax-wh/', {'period_id': self.period.id}).status_code, 403)
        self.assertEqual(client.get(f'{API}export-tax-wp/', {'period_id': self.period.id}).status_code, 403)
        self.assertEqual(client.get(f'{API}export-dsk-zip/', {'period_id': self.period.id}).status_code, 403)
        self.assertEqual(client.get(f'{API}export-bank-excel/', {'period_id': self.period.id}).status_code, 403)
        self.assertEqual(client.get(f'{API}export-monthly-excel/', {'period_id': self.period.id}).status_code, 403)

    def test_import_tax_requires_period_id(self):
        user = self.make_user('pay_g', ['view_sys_payroll'])
        client = self.client_for(user)

        res = client.post(
            f'{API}import-tax-excel/',
            {'items': [{'national_code': '4520000701', 'tax_amount': 1000}]},
            format='json'
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data.get('code'), 'period_required')

    def test_sensitive_fields_masked(self):
        emp = self.make_user('emp_h', codes=())
        mine = self.person('801', self.section, user=emp, account_number='60379900000801')
        other = self.person('802', self.section, account_number='60379900000802')
        self.attend(mine, self.section)
        self.attend(other, self.section)
        self.calc(self.period)

        payroll_user = self.make_user('pay_h', ['view_sys_payroll'])

        # کارمند عادی فیلدهای حساس ردیف خود را بدون پوشش می‌بیند
        rows_emp = self.client_for(emp).get(f'{API}', {'period_id': self.period.id}).json()
        self.assertEqual([r['personnel'] for r in rows_emp], [mine.id])
        self.assertEqual(rows_emp[0]['national_code'], mine.national_code)
        self.assertEqual(rows_emp[0]['bank_account_number'], mine.account_number)

        # کاربر دارای view_sys_payroll بدون دسترسی حساس، کد ملی پرسنل دیگر را پوشیده‌شده می‌بیند
        rows_pay = self.client_for(payroll_user).get(f'{API}', {'period_id': self.period.id}).json()
        by_person = {r['personnel']: r for r in rows_pay}
        self.assertEqual(set(by_person), {mine.id, other.id})
        self.assertNotEqual(by_person[other.id]['national_code'], other.national_code)
        self.assertTrue(by_person[other.id]['national_code'].endswith(other.national_code[-4:]))

        # پاسخ POST calculate-period برای آن کاربر نیز از همین قاعدهٔ پوشش پیروی می‌کند
        res_calc = self.client_for(payroll_user).post(
            f'{API}calculate-period/', {'period_id': self.period.id}, format='json'
        )
        self.assertEqual(res_calc.status_code, 200)
        calc_by_person = {r['personnel']: r for r in res_calc.json().get('records', [])}
        self.assertEqual(set(calc_by_person), {mine.id, other.id})
        self.assertNotEqual(calc_by_person[other.id]['national_code'], other.national_code)
        self.assertTrue(calc_by_person[other.id]['national_code'].endswith(other.national_code[-4:]))
