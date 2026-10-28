# -*- coding: utf-8 -*-
"""
طرح ۴.۵-ب۱:
- د۲: برابری عددی موتور حقوق با برگهٔ تیر TirSalary.xlsm (هر ۵۸ ستون، اختلاف صفر ریال در دقت ذخیره).
- د۱: محاسبه روی دورهٔ «بخش + ماه» (فقط پرسنل و کارکرد APPROVED همان دوره، attendance_not_approved،
  skipped_no_attendance، بی‌اثری company_id بدنه، period_not_found).
- د۱۱: تعداد پرس‌وجوی ثابت (۳ نفر و ۳۰۰ نفر برابر).
"""
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from personnel.attendance_periods import get_or_create_period
from personnel.models import (Company, DailyAttendance, JobGradeTier, MonthlyPayrollRecord, MonthlyWorkPeriod,
                              PayrollYearlySettings, PersonnelProfile, Project, ProjectSection)
from personnel.payroll_engine import PayrollCalculationEngine

User = get_user_model()
FIXTURE = json.loads((Path(__file__).parent / 'tests_data' / 'payroll_tir_1405.json').read_text(encoding='utf-8'))
YM = FIXTURE['year_month']
MARRIED = 'متاهل'

# ستون اکسل ← فیلد MonthlyPayrollRecord (۵۸ ستون)
COLUMN_FIELDS = {
    'A': 'status_category', 'B': 'row_number', 'C': 'include_in_tax', 'D': 'include_in_insurance',
    'E': 'include_in_bank', 'F': 'national_code', 'G': 'full_name', 'H': 'marital_status', 'I': 'children_count',
    'J': 'contract_hours', 'K': 'contract_salary', 'L': 'job_grade', 'M': 'daily_wage', 'N': 'daily_seniority',
    'O': 'years_of_service', 'P': 'base_daily_rate', 'Q': 'worked_hours', 'R': 'insurance_days',
    'S': 'overtime_hours', 'T': 'friday_work_days', 'U': 'mission_days', 'V': 'income_tax',
    'W': 'advance_payment_deduction', 'X': 'other_allowances', 'Y': 'friday_work_amount', 'Z': 'overtime_amount',
    'AA': 'travel_cost_amount', 'AB': 'mission_amount', 'AC': 'bonus_amount', 'AD': 'leave_amount',
    'AE': 'food_allowance', 'AF': 'housing_allowance', 'AG': 'marital_allowance', 'AH': 'transport_allowance',
    'AI': 'market_attraction_allowance', 'AJ': 'bad_weather_allowance', 'AK': 'remote_hardship_allowance',
    'AL': 'south_pars_allowance', 'AM': 'child_allowance', 'AN': 'seniority_allowance',
    'AO': 'total_taxable_allowances', 'AP': 'total_non_continuous_taxable_allowances',
    'AQ': 'continuous_taxable_allowances', 'AR': 'total_non_taxable_allowances',
    'AS': 'total_seniority_accumulated', 'AT': 'worker_insurance', 'AU': 'employer_insurance',
    'AV': 'unemployment_insurance', 'AW': 'total_insurance', 'AX': 'base_salary',
    'AY': 'continuous_taxable_salary_allowances', 'AZ': 'total_insurable_salary_allowances', 'BA': 'gross_salary',
    'BB': 'total_deductions', 'BC': 'net_salary', 'BD': 'bank_account_number', 'BE': 'payable_amount',
    'BF': 'tax_check_discrepancy',
}
TEXT_COLS = {'A', 'F', 'G', 'H', 'BD'}
BOOL_COLS = {'C', 'D', 'E'}

# ناسازگاری درونی خود اکسل (نه خطای موتور): ردیف ۸ تنها ردیف جمعه‌کاری است و Z8/AA8/AB8 با مزد مبنای کهنه
# (مزد روزانه بی سنوات: P = 6,044,057 به جای 7,230,326) دستی وارد شده‌اند؛ مازاد با P کهنه دقیقاً 2×Z8 است
# (BA8 − اقلام قانونی با P کهنه = 253,050,937) ولی AX8/AC8/AN8/Y8 با P فعلی‌اند و BF8 = −0.3 همین را نشان می‌دهد.
# ستون‌های وابسته به Z/AA/AB در این ردیف از اکسل جدا می‌شوند؛ بقیهٔ ستون‌ها (ازجمله Y جمعه‌کاری و AX/AS سنوات) سنجیده می‌شوند.
KNOWN_EXCEL_INCONSISTENCIES = {
    8: {'Z', 'AA', 'AB', 'U', 'AO', 'AP', 'AR', 'AT', 'AU', 'AV', 'AW', 'AZ', 'BB', 'BC', 'BE'},
}


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal(1), rounding=ROUND_HALF_UP)


def _expected(col, value):
    if col in TEXT_COLS:
        return str(value)
    if col in BOOL_COLS:
        return value == 1
    if col == 'L':
        return str(value)
    return _money(value) if col not in ('J', 'Q', 'S', 'T') else Decimal(str(value or 0))


def _actual(col, record):
    value = getattr(record, COLUMN_FIELDS[col])
    if col in TEXT_COLS or col == 'L':
        return str(value)
    if col in BOOL_COLS:
        return bool(value)
    return Decimal(str(value))


class _PayrollFixtureMixin:
    def make_org(self, code):
        company = Company.objects.create(code=f'CMP-{code}', name=f'شرکت {code}')
        project = Project.objects.create(company=company, code=f'PRJ-{code}', name=f'پروژه {code}', is_active=True)
        section = ProjectSection.objects.create(project=project, code=f'SEC-{code}', name=f'بخش {code}', is_active=True)
        return company, project, section

    def make_settings(self, company):
        s = FIXTURE['settings']
        settings = PayrollYearlySettings.objects.create(
            fiscal_year='1405', company=company, effective_from='1405/01', is_active=True,
            monthly_food_allowance=s['monthly_food_allowance'], monthly_housing_allowance=s['monthly_housing_allowance'],
            monthly_spouse_allowance=s['monthly_spouse_allowance'], monthly_child_allowance=s['monthly_child_allowance'],
            transport_help_percent=s['transport_help_percent'],
            specialist_attraction_percent=s['specialist_attraction_percent'],
            bad_weather_percent=s['bad_weather_percent'], remote_hardship_percent=s['remote_hardship_percent'],
            south_pars_percent=s['south_pars_percent'], transport_fixed_amount=s['transport_fixed_amount'],
            travel_cost_per_day=s['travel_cost_per_day'], surplus_overtime_percent=50, standard_daily_hours=10,
            bonus_daily_coefficient=5, seniority_monthly_coefficient=Decimal('2.5'),
            overtime_rate_multiplier=Decimal('1.4'), friday_work_rate_multiplier=Decimal('0.4'),
            worker_insurance_rate=7, employer_insurance_rate=20, unemployment_insurance_rate=3,
        )
        JobGradeTier.objects.bulk_create([
            JobGradeTier(yearly_settings=settings, grade_number=g, daily_base_wage=w, daily_seniority_bonus=sen)
            for g, w, sen in FIXTURE['job_grades']
        ])
        return settings

    def ready_period(self, section):
        period, _ = get_or_create_period(None, section.id, YM)
        MonthlyWorkPeriod.objects.filter(pk=period.pk).update(status='READY_TO_PAY')
        period.refresh_from_db()
        return period

    @staticmethod
    def day_rows(personnel, section, project, total_hours, days, friday_days=0, approval='APPROVED'):
        """days ردیف کارکرد با جمع ساعت total_hours؛ friday_days ردیف اول جمعه‌کاری."""
        total = Decimal(str(total_hours))
        base = (total / days).quantize(Decimal('0.01'), rounding='ROUND_DOWN')
        rows = []
        for d in range(1, days + 1):
            hours = base if d < days else total - base * (days - 1)
            rows.append(DailyAttendance(
                personnel=personnel, section=section, project=project, date_shamsi=f'{YM}/{d:02d}',
                status='FRIDAY_WORK' if d <= friday_days else 'PRESENT_10H', is_friday_work=d <= friday_days,
                effective_hours=hours, approval_status=approval))
        return rows


class PayrollExcelParityTests(_PayrollFixtureMixin, TestCase):
    """د۲: هر ۵۸ ستون ردیف‌های نمونهٔ برگهٔ تیر برابر اکسل."""

    def setUp(self):
        self.company, self.project, self.section = self.make_org('X45')
        self.make_settings(self.company)
        self.period = self.ready_period(self.section)
        days = int(FIXTURE['settings']['month_days'])
        atts = []
        self.by_row = {}
        for row in FIXTURE['rows']:
            c = row['cells']
            first, last = c['G'].split(' ', 1)
            p = PersonnelProfile.objects.create(
                first_name=first, last_name=last, national_code=c['F'], company=self.company,
                project=self.project, section=self.section, is_active=True, approval_status='approved',
                status_category=c['A'], job_grade=str(c['L']), base_years_experience=c['O'] or 0,
                contract_hours=c['J'], contract_base_salary=c['K'],
                marital_status='married' if c['H'] == MARRIED else 'single', children_count=c['I'] or 0,
                include_in_tax=c['C'] == 1, include_in_insurance=c['D'] == 1, include_in_bank=c['E'] == 1,
                account_number=c['BD'])
            self.by_row[row['excel_row']] = p
            atts += self.day_rows(p, self.section, self.project, c['Q'], days, friday_days=int(c['T'] or 0))
            if c['V']:
                # مالیات (V) در اکسل ورودی سامانهٔ دارایی است؛ مثل ورود اکسل مالیات پیش از محاسبه ثبت می‌شود
                MonthlyPayrollRecord.objects.create(
                    period=self.period, personnel=p, income_tax=c['V'], tax_source_type='IMPORTED_EXCEL',
                    is_tax_imported=True)
        DailyAttendance.objects.bulk_create(atts)

    def test_all_58_columns_match_excel(self):
        engine = PayrollCalculationEngine(self.period)
        engine.calculate_period(self.period)
        self.assertEqual(engine.skipped_no_attendance, [])
        records = {r.personnel_id: r for r in MonthlyPayrollRecord.objects.filter(period=self.period)}
        self.assertEqual(len(records), len(FIXTURE['rows']))
        self.assertEqual(len(COLUMN_FIELDS), 58)
        for row in FIXTURE['rows']:
            rec = records[self.by_row[row['excel_row']].id]
            mismatches = {}
            for col in COLUMN_FIELDS:
                exp, act = _expected(col, row['cells'][col]), _actual(col, rec)
                if exp != act:
                    mismatches[col] = (exp, act)
            known = KNOWN_EXCEL_INCONSISTENCIES.get(row['excel_row'], set())
            with self.subTest(excel_row=row['excel_row']):
                self.assertEqual({k: v for k, v in mismatches.items() if k not in known}, {})
                # فهرست ناسازگاری دقیق است: ستونی که برابر شد نباید در فهرست بماند
                self.assertEqual(set(mismatches) & known, known)


class PayrollSectionPeriodTests(_PayrollFixtureMixin, TestCase):
    """د۱: محاسبه روی دورهٔ بخش."""

    def setUp(self):
        self.company, self.project, self.section = self.make_org('S45')
        self.other_company, self.other_project, self.other_section = self.make_org('O45')
        self.sibling_section = ProjectSection.objects.create(project=self.project, code='SEC-S45B', name='بخش دوم')
        self.make_settings(self.company)
        self.admin = User.objects.create_superuser(username='p45_admin', password='p', email='a@x.test')

        def person(code, section, company, project):
            return PersonnelProfile.objects.create(
                first_name='نفر', last_name=code, national_code=f'45000000{code}', company=company, project=project,
                section=section, is_active=True, approval_status='approved', job_grade='10',
                contract_hours=230, contract_base_salary=400000000)
        self.worker = person('01', self.section, self.company, self.project)
        self.idle = person('02', self.section, self.company, self.project)
        self.outsider = person('03', self.other_section, self.other_company, self.other_project)
        atts = self.day_rows(self.worker, self.section, self.project, 200, 20)
        # کارکرد همان نفر در بخش دیگر و کارکرد تأییدنشده شمرده نمی‌شوند
        atts += [DailyAttendance(personnel=self.worker, section=self.sibling_section, project=self.project,
                                 date_shamsi=f'{YM}/25', effective_hours=Decimal('10'), approval_status='APPROVED'),
                 DailyAttendance(personnel=self.worker, section=self.section, project=self.project,
                                 date_shamsi=f'{YM}/26', effective_hours=Decimal('10'),
                                 approval_status='PENDING_SUPERVISOR')]
        atts += self.day_rows(self.outsider, self.other_section, self.other_project, 230, 23)
        DailyAttendance.objects.bulk_create(atts)

    def post(self, data):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        return client.post('/api/personnel/monthly-payroll/calculate-period/', data, format='json')

    def test_not_ready_period_returns_attendance_not_approved(self):
        get_or_create_period(None, self.section.id, YM)
        res = self.post({'section_id': self.section.id, 'year_month': YM})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['code'], 'attendance_not_approved')
        self.assertFalse(MonthlyPayrollRecord.objects.exists())

    def test_missing_period_returns_404_and_is_not_created(self):
        res = self.post({'section_id': self.section.id, 'year_month': YM})
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data['code'], 'period_not_found')
        self.assertFalse(MonthlyWorkPeriod.objects.filter(section=self.section).exists())

    def test_section_scope_approved_only_and_skipped_list(self):
        period = self.ready_period(self.section)
        res = self.post({'section_id': self.section.id, 'year_month': YM, 'company_id': self.other_company.id})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['period_id'], period.id)
        recs = list(MonthlyPayrollRecord.objects.filter(period=period))
        self.assertEqual([r.personnel_id for r in recs], [self.worker.id])
        self.assertEqual(recs[0].worked_hours, Decimal('200'))
        self.assertEqual(res.data['skipped_no_attendance'],
                         [{'personnel_id': self.idle.id, 'full_name': self.idle.full_name}])
        period.refresh_from_db()
        self.assertEqual(period.company_id, self.company.id)

    def test_period_id_path_and_recalculation_keeps_manual_override(self):
        period = self.ready_period(self.section)
        self.assertEqual(self.post({'period_id': period.id}).status_code, 200)
        rec = MonthlyPayrollRecord.objects.get(period=period, personnel=self.worker)
        MonthlyPayrollRecord.objects.filter(pk=rec.pk).update(is_manually_overridden=True, payable_amount=1)
        self.assertEqual(self.post({'period_id': period.id}).status_code, 200)
        rec.refresh_from_db()
        self.assertEqual(rec.payable_amount, 1)
        self.assertEqual(MonthlyPayrollRecord.objects.filter(period=period).count(), 1)


class PayrollQueryCountTests(_PayrollFixtureMixin, TestCase):
    """د۱۱: تعداد پرس‌وجوی calculate_period مستقل از تعداد پرسنل."""

    def build(self, code, count):
        company, project, section = self.make_org(code)
        self.make_settings(company)
        people = PersonnelProfile.objects.bulk_create([
            PersonnelProfile(first_name='نفر', last_name=f'{code}-{i:04d}', national_code=f'{code}{i:06d}',
                             company=company, project=project, section=section, is_active=True,
                             approval_status='approved', job_grade='10', contract_hours=230,
                             contract_base_salary=400000000)
            for i in range(count)])
        people = list(PersonnelProfile.objects.filter(section=section))
        DailyAttendance.objects.bulk_create([
            DailyAttendance(personnel=p, section=section, project=project, date_shamsi=f'{YM}/{d:02d}',
                            effective_hours=Decimal('10'), approval_status='APPROVED')
            for p in people for d in (1, 2)])
        return self.ready_period(section), len(people)

    def count_queries(self, period):
        with CaptureQueriesContext(connection) as ctx:
            records = PayrollCalculationEngine(period).calculate_period(period)
        return len(ctx.captured_queries), len(records)

    def test_query_count_constant_for_3_and_300_personnel(self):
        small, n_small = self.build('Q3', 3)
        large, n_large = self.build('Q300', 300)
        q_small, r_small = self.count_queries(small)
        q_large, r_large = self.count_queries(large)
        self.assertEqual((r_small, r_large), (n_small, n_large))
        self.assertEqual(q_small, q_large)
        # دوباره (مسیر bulk_update)
        q_small2, _ = self.count_queries(small)
        q_large2, _ = self.count_queries(large)
        self.assertEqual(q_small2, q_large2)
        self.assertEqual(MonthlyPayrollRecord.objects.filter(period=large).count(), 300)
