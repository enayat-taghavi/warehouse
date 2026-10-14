import os
import io
import zipfile
import django
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from warehouses.models import Warehouse
from personnel.models import (
    FinancialProject,
    ProjectSection,
    PersonnelProfile,
    MonthlyWorkPeriod,
    MonthlyPayrollRecord,
    PayrollYearlySettings,
    WorkshopInsuranceSettings,
    BankExportSettings
)

User = get_user_model()

class ProjectScopedExportTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(username='treasury_tester', password='password123', email='tr@test.com')
        self.client.force_authenticate(user=self.user)

        self.wh = Warehouse.objects.create(name='انبار تست مرکزی', code='WH-01')

        # ۲ پروژه مختلف
        self.proj_tehran = FinancialProject.objects.create(code='PRJ-TEH', name='پروژه تهران')
        self.proj_shiraz = FinancialProject.objects.create(code='PRJ-SHZ', name='پروژه شیراز')

        # تنظیمات سال ۱۴۰۵ پروژه شیراز با کد کارگاه اختصاصی
        self.settings_shz = PayrollYearlySettings.objects.create(
            fiscal_year='1405',
            project=self.proj_shiraz,
            title='تنظیمات شیراز ۱۴۰۵'
        )
        self.ws_shz = WorkshopInsuranceSettings.objects.create(
            yearly_settings=self.settings_shz,
            workshop_code='7777666655',
            workshop_name='کارگاه تامین اجتماعی شیراز',
            employer_name='مدیریت فارس'
        )
        self.bank_shz = BankExportSettings.objects.create(
            yearly_settings=self.settings_shz,
            bank_name='بانک ملی شعبه شیراز',
            source_account_number='0199999999999',
            deposit_description_template='واریز حقوق پرسنل شیراز {month_name}'
        )

        # دوره کاری ماهانه
        self.period = MonthlyWorkPeriod.objects.create(
            warehouse=self.wh,
            year_month='1405/04',
            status='CALCULATED'
        )

        # ۲ پرسنل: یکی در پروژه تهران و یکی در پروژه شیراز
        self.person_tehran = PersonnelProfile.objects.create(
            first_name='علی',
            last_name='تهرانی',
            national_code='0011223344',
            insurance_number='12345678',
            job_title='انباردار',
            contract_type='CONTRACT',
            project=self.proj_tehran,
            account_number='0101111111111'
        )
        self.person_shiraz = PersonnelProfile.objects.create(
            first_name='رضا',
            last_name='شیرازی',
            national_code='0099887766',
            insurance_number='87654321',
            job_title='سرپرست شیراز',
            contract_type='CONTRACT',
            project=self.proj_shiraz,
            account_number='0102222222222'
        )

        # رکورد حقوق برای هر دو پرسنل
        self.rec_tehran = MonthlyPayrollRecord.objects.create(
            period=self.period,
            personnel=self.person_tehran,
            daily_wage=Decimal('5000000'),
            base_salary=Decimal('150000000'),
            insurance_days=30,
            gross_salary=Decimal('200000000'),
            worker_insurance=Decimal('14000000'),
            employer_insurance=Decimal('40000000'),
            unemployment_insurance=Decimal('6000000'),
            payable_amount=Decimal('180000000'),
            include_in_insurance=True,
            include_in_bank=True
        )
        self.rec_shiraz = MonthlyPayrollRecord.objects.create(
            period=self.period,
            personnel=self.person_shiraz,
            daily_wage=Decimal('6000000'),
            base_salary=Decimal('180000000'),
            insurance_days=31,
            gross_salary=Decimal('250000000'),
            worker_insurance=Decimal('17500000'),
            employer_insurance=Decimal('50000000'),
            unemployment_insurance=Decimal('7500000'),
            payable_amount=Decimal('220000000'),
            include_in_insurance=True,
            include_in_bank=True
        )

    def test_bimeh_diskettes_requires_project_id(self):
        """تولید دیسکت بدون ارسال شناسه پروژه باید با خطای ۴۰۰ متوقف شود"""
        res = self.client.get('/api/personnel/monthly-payroll/export-bimeh-diskettes/', {
            'period_id': self.period.id
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('انتخاب پروژه', res.json()['error'])

    def test_bimeh_diskettes_scoped_to_single_project(self):
        """دیسکت صادرشده برای پروژه شیراز فقط باید شامل رکورد پرسنل شیراز با کد کارگاه شیراز باشد"""
        res = self.client.get('/api/personnel/monthly-payroll/export-bimeh-diskettes/', {
            'period_id': self.period.id,
            'project_id': self.proj_shiraz.id
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/zip')

        # باز کردن فایل زیپ و بررسی فایل‌های DBF درون آن
        zip_file = zipfile.ZipFile(io.BytesIO(res.content))
        file_names = zip_file.namelist()
        self.assertIn('DSKKAR00.DBF', file_names)
        self.assertIn('DSKWOR00.DBF', file_names)

        # خواندن محتوای DSKWOR00.DBF برای تایید اینکه کد کارگاه شیراز درون فایل درج شده است
        dskwor_bytes = zip_file.read('DSKWOR00.DBF')
        self.assertIn(b'7777666655', dskwor_bytes)

    def test_bank_excel_requires_project_id(self):
        """صدور فایل پرداخت بانک بدون انتخاب پروژه باید با خطای ۴۰۰ متوقف شود"""
        res = self.client.get('/api/personnel/monthly-payroll/export-bank-excel/', {
            'period_id': self.period.id
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('انتخاب پروژه', res.json()['error'])

    def test_bank_excel_scoped_to_single_project(self):
        """فایل بانک صادرشده برای پروژه شیراز باید فقط پرسنل شیراز را با حساب شیراز درج کند"""
        res = self.client.get('/api/personnel/monthly-payroll/export-bank-excel/', {
            'period_id': self.period.id,
            'project_id': self.proj_shiraz.id
        })
        self.assertEqual(res.status_code, 200)
        self.assertIn('application/vnd.openxmlformats', res['Content-Type'])
        self.assertIn(f'Bank_Payment_{self.proj_shiraz.code}', res['Content-Disposition'])

    def test_tax_wh_requires_project_id(self):
        """صدور فایل مالیاتی WH بدون انتخاب پروژه باید با خطای ۴۰۰ متوقف شود"""
        res = self.client.get('/api/personnel/monthly-payroll/export-tax-wh/', {
            'period_id': self.period.id
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('انتخاب پروژه', res.json()['error'])

    def test_tax_wp_requires_project_id(self):
        """صدور فایل مالیاتی WP بدون انتخاب پروژه باید با خطای ۴۰۰ متوقف شود"""
        res = self.client.get('/api/personnel/monthly-payroll/export-tax-wp/', {
            'period_id': self.period.id
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('انتخاب پروژه', res.json()['error'])

    def test_tax_exports_scoped_to_project(self):
        """فایل‌های مالیاتی WH و WP باید به نام پروژه و صرفاً برای پرسنل آن پروژه صادر شوند"""
        res_wh = self.client.get('/api/personnel/monthly-payroll/export-tax-wh/', {
            'period_id': self.period.id,
            'project_id': self.proj_shiraz.id
        })
        self.assertEqual(res_wh.status_code, 200)
        self.assertIn(f'WH_{self.proj_shiraz.code}_0504.txt', res_wh['Content-Disposition'])

        res_wp = self.client.get('/api/personnel/monthly-payroll/export-tax-wp/', {
            'period_id': self.period.id,
            'project_id': self.proj_shiraz.id
        })
        self.assertEqual(res_wp.status_code, 200)
        self.assertIn(f'WP_{self.proj_shiraz.code}_0504.txt', res_wp['Content-Disposition'])
        # محتوای متنی باید شامل کد ملی پرسنل شیراز باشد و نه تهرانی
        content = res_wp.content.decode('utf-8')
        self.assertIn(self.person_shiraz.national_code, content)
        self.assertNotIn(self.person_tehran.national_code, content)

