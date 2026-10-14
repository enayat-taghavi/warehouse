import os
import django
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient
from personnel.models import (
    FinancialProject,
    PayrollYearlySettings,
    WorkshopInsuranceSettings,
    BankExportSettings,
    TaxRuleSettings,
    JobGradeTier,
    PersonnelProfile,
    MonthlyWorkPeriod,
    MonthlyPayrollRecord
)
from personnel.payroll_engine import PayrollCalculationEngine

User = get_user_model()

class PayrollSettingsComprehensiveTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(username='admin_super', password='password123', email='super@test.com')
        self.normal_user = User.objects.create_user(username='normal_user', password='password123', email='normal@test.com')

        self.manager_user = User.objects.create_user(username='manager_user', password='password123', email='manager@test.com')
        perm_settings = Permission.objects.filter(codename='perm_sys_settings').first()
        if perm_settings:
            self.manager_user.user_permissions.add(perm_settings)

        # Base 1405 Settings
        self.settings, _ = PayrollYearlySettings.objects.get_or_create(
            fiscal_year='1405',
            effective_from='1405/01',
            project=None,
            defaults={
                'title': 'تنظیمات تست ۱۴۰۵',
                'is_active': True,
                'monthly_food_allowance': 22000000,
                'monthly_housing_allowance': 30000000,
                'bad_weather_percent': 10.00,  # 10%
                'standard_daily_hours': 10.00,
                'bonus_daily_coefficient': 5.00,
                'seniority_monthly_coefficient': 2.50,
                'overtime_rate_multiplier': 1.40,
                'friday_work_rate_multiplier': 0.40,
                'worker_insurance_rate': 7.00,
                'employer_insurance_rate': 20.00,
                'unemployment_insurance_rate': 3.00
            }
        )
        self.settings.bad_weather_percent = Decimal('10.00')
        self.settings.save()

        # Grade 1 (حداقل دستمزد ۵,۰۰۰,۰۰۰ ریال روزانه)
        self.grade1, _ = JobGradeTier.objects.update_or_create(
            yearly_settings=self.settings,
            grade_number=1,
            defaults={'daily_base_wage': 5000000, 'daily_seniority_bonus': 100000}
        )
        self.grade19, _ = JobGradeTier.objects.update_or_create(
            yearly_settings=self.settings,
            grade_number=19,
            defaults={'daily_base_wage': 6500000, 'daily_seniority_bonus': 170000}
        )

    def test_permission_enforcement(self):
        """کاربر بدون پرمیشن perm_sys_settings یا admin_all نباید اجازه ویرایش یا ایجاد داشته باشد (403)"""
        self.client.force_authenticate(user=self.normal_user)
        # Attempt update
        res = self.client.post(f'/api/personnel/settings/{self.settings.id}/update-all/', {
            'monthly_food_allowance': 25000000
        }, format='json')
        self.assertEqual(res.status_code, 403)

        # Attempt create-year
        res_year = self.client.post('/api/personnel/settings/create-year/', {
            'year': '1407'
        }, format='json')
        self.assertEqual(res_year.status_code, 403)

        # Manager with perm_sys_settings CAN update
        self.client.force_authenticate(user=self.manager_user)
        res_ok = self.client.post(f'/api/personnel/settings/{self.settings.id}/update-all/', {
            'monthly_food_allowance': 25000000
        }, format='json')
        self.assertEqual(res_ok.status_code, 200)

    def test_payroll_engine_percentage_normalization(self):
        """درصد بدی آب و هوا اگر ۱۰ وارد شود نباید ۱۰ برابر مزد شود بلکه باید ۱۰ درصد مزد شود"""
        engine = PayrollCalculationEngine()
        p, _ = PersonnelProfile.objects.get_or_create(
            national_code='1234567890',
            defaults={
                'first_name': 'علی',
                'last_name': 'تست',
                'job_grade': '19',
                'daily_base_wage': 6500000,
                'include_in_insurance': True,
                'include_in_tax': True,
                'marital_status': 'single'
            }
        )
        period, _ = MonthlyWorkPeriod.objects.get_or_create(year_month='1405/01')
        job_grades = {'19': (Decimal(6500000), Decimal(170000)), '1': (Decimal(5000000), Decimal(100000))}

        res = engine.calculate_single_employee(
            personnel=p,
            period=period,
            settings=self.settings,
            job_grades=job_grades,
            month_days=31
        )
        # Bad weather allowance for insurance_days at 10% of daily wage 6,500,000:
        # 0.10 * 6,500,000 * insurance_days (NOT 10.0 * 6,500,000 * insurance_days)
        ins_days = res['insurance_days']
        expected_bad_weather = Decimal(round(Decimal('0.10') * Decimal(6500000) * Decimal(ins_days)))
        self.assertEqual(res['bad_weather_allowance'], expected_bad_weather)

    def test_smart_insurance_ceiling(self):
        """سقف بیمه به طور خودکار معادل ۷ برابر دستمزد گروه ۱ محاسبه می‌شود"""
        engine = PayrollCalculationEngine()
        # High wage specialist earning 100,000,000 daily
        p, _ = PersonnelProfile.objects.get_or_create(
            national_code='9876543210',
            defaults={
                'first_name': 'مدیر',
                'last_name': 'ارشد',
                'job_grade': '19',
                'daily_base_wage': 100000000,
                'contract_hours': 230,
                'contract_base_salary': 3100000000,  # 310 million tomans
                'include_in_insurance': True,
                'marital_status': 'single'
            }
        )
        period, _ = MonthlyWorkPeriod.objects.get_or_create(year_month='1405/01')
        job_grades = {'1': (Decimal(5000000), Decimal(100000)), '19': (Decimal(100000000), Decimal(170000))}

        res = engine.calculate_single_employee(
            personnel=p,
            period=period,
            settings=self.settings,
            job_grades=job_grades,
            month_days=31
        )
        # Grade 1 wage is 5,000,000. Daily ceiling = 7 * 5,000,000 = 35,000,000
        # For optimized days (22 days): max insurable = 22 * 35,000,000 = 770,000,000
        # Worker insurance (7%) should be 7% of 770,000,000 = 53,900,000 (capped!)
        daily_ceil = Decimal(5000000) * Decimal(7)
        expected_max_insurable = daily_ceil * Decimal(res['insurance_days'])
        self.assertEqual(res['total_insurable_salary_allowances'], expected_max_insurable)
        self.assertEqual(res['worker_insurance'], Decimal(round(expected_max_insurable * Decimal('0.07'))))

    def test_tax_preservation_rule(self):
        """اگر مالیات از قبل از اکسل دارایی ایمپورت شده باشد (IMPORTED_EXCEL)، تحت هیچ شرایطی نباید دست بخورد"""
        engine = PayrollCalculationEngine()
        p, _ = PersonnelProfile.objects.get_or_create(
            national_code='1112223334',
            defaults={
                'first_name': 'پرسنل',
                'last_name': 'مالیاتی',
                'job_grade': '1',
                'daily_base_wage': 5000000,
                'include_in_insurance': True,
                'include_in_tax': True,
                'marital_status': 'single'
            }
        )
        period, _ = MonthlyWorkPeriod.objects.get_or_create(year_month='1405/01')
        existing_rec = MonthlyPayrollRecord(
            income_tax=Decimal(15420000),
            tax_source_type='IMPORTED_EXCEL',
            is_tax_imported=True
        )
        job_grades = {'1': (Decimal(5000000), Decimal(100000))}

        res = engine.calculate_single_employee(
            personnel=p,
            period=period,
            settings=self.settings,
            job_grades=job_grades,
            month_days=31,
            existing_record=existing_rec
        )
        self.assertEqual(res['income_tax'], Decimal(15420000))
        self.assertEqual(res['tax_source_type'], 'IMPORTED_EXCEL')
        self.assertTrue(res['is_tax_imported'])

    def test_create_mid_year_version_effective_to_update(self):
        """ایجاد نسخه میانه سال باید effective_to نسخه قبلی را خودکار تنظیم کند"""
        PayrollYearlySettings.objects.filter(fiscal_year='1405', project=None, effective_from='1405/07').delete()
        self.client.force_authenticate(user=self.superuser)
        res = self.client.post('/api/personnel/settings/create-version/', {
            'year': '1405',
            'effective_from': '1405/07',
            'version_title': 'احکام نیمه دوم سال ۱۴۰۵'
        }, format='json')
        self.assertEqual(res.status_code, 201)

        # Version 1405/01 should now have effective_to = '1405/06'
        v1 = PayrollYearlySettings.objects.filter(fiscal_year='1405', project=None, effective_from='1405/01').first()
        self.assertEqual(v1.effective_to, '1405/06')

    def test_revert_to_global(self):
        """لغو تنظیمات اختصاصی پروژه و بازگشت به تنظیمات سراسری"""
        proj = FinancialProject.objects.create(code='PRJ-REV', name='پروژه تست ریورت')
        self.client.force_authenticate(user=self.superuser)

        # Clone
        res_clone = self.client.post('/api/personnel/settings/clone-for-project/', {
            'project_id': proj.id,
            'year': '1405'
        })
        self.assertEqual(res_clone.status_code, 201)
        cloned_id = res_clone.json()['id']

        # Revert
        res_revert = self.client.post(f'/api/personnel/settings/{cloned_id}/revert-to-global/')
        self.assertEqual(res_revert.status_code, 200)

        # Check that project setting no longer exists in DB
        self.assertFalse(PayrollYearlySettings.objects.filter(id=cloned_id).exists())

    def test_job_grades_hierarchy_validation(self):
        """اعتبارسنجی سلسله‌مراتب جدول مزد ۲۰ گروه شغلی (BIZ-06): مزد گروه بالاتر نباید کمتر از گروه پایین‌تر باشد"""
        self.client.force_authenticate(user=self.superuser)
        # Attempt to save job grade 2 with lower wage than job grade 1
        res = self.client.post(f'/api/personnel/settings/{self.settings.id}/update-all/', {
            'job_grades': [
                {'grade_number': 1, 'daily_base_wage': 5000000, 'daily_seniority_bonus': 100000},
                {'grade_number': 2, 'daily_base_wage': 4000000, 'daily_seniority_bonus': 100000}, # Less than grade 1!
            ]
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('job_grades', res.json())

