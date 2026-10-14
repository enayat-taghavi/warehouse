import os
import django
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from personnel.models import (
    FinancialProject,
    PayrollYearlySettings,
    WorkshopInsuranceSettings,
    BankExportSettings,
    TaxRuleSettings,
    JobGradeTier
)

User = get_user_model()

class ProjectScopedSettingsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(username='admin_test', password='password123', email='admin@test.com')
        self.client.force_authenticate(user=self.user)

        # Global 1405 Settings
        self.global_settings, _ = PayrollYearlySettings.objects.get_or_create(
            fiscal_year='1405',
            project=None,
            effective_from='1405/01',
            defaults={
                'title': 'تنظیمات سراسری سازمان ۱۴۰۵',
                'is_active': True,
                'monthly_food_allowance': 22000000,
                'monthly_housing_allowance': 30000000
            }
        )
        self.global_workshop, _ = WorkshopInsuranceSettings.objects.get_or_create(
            yearly_settings=self.global_settings,
            defaults={
                'workshop_code': '4894290013',
                'workshop_name': 'دفتر مرکزی شرکت',
                'employer_name': 'شرکت مادر'
            }
        )
        self.global_bank, _ = BankExportSettings.objects.get_or_create(
            yearly_settings=self.global_settings,
            defaults={
                'bank_name': 'بانک ملی',
                'source_account_number': '0100000000001'
            }
        )
        self.tier19, _ = JobGradeTier.objects.get_or_create(
            yearly_settings=self.global_settings,
            grade_number=19,
            defaults={
                'daily_base_wage': 5000000,
                'daily_seniority_bonus': 200000
            }
        )

        # Project 1: Shiraz
        self.proj_shiraz, _ = FinancialProject.objects.get_or_create(
            code='PRJ-SHIRAZ',
            defaults={'name': 'پروژه انبار شیراز'}
        )

    def test_fallback_to_global_when_project_has_no_override(self):
        """اگر پروژه تنظیمی نداشته باشد، باید تنظیمات سراسری سازمان بازگردانده شود"""
        res = self.client.get('/api/personnel/settings/active-or-year/', {
            'year': '1405',
            'project_id': self.proj_shiraz.id
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsNone(data['project'])
        self.assertEqual(data['workshop_insurance']['workshop_code'], '4894290013')

    def test_clone_settings_for_project(self):
        """کپی هوشمند تنظیمات برای پروژه و ایجاد رکورد اختصاصی"""
        res = self.client.post('/api/personnel/settings/clone-for-project/', {
            'project_id': self.proj_shiraz.id,
            'year': '1405'
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data['project'], self.proj_shiraz.id)
        self.assertEqual(data['project_name'], 'پروژه انبار شیراز')

        # تغییر کد کارگاه برای پروژه شیراز
        new_settings_id = data['id']
        update_payload = {
            **data,
            'workshop_insurance': {
                **data['workshop_insurance'],
                'workshop_code': '9999888877',
                'workshop_name': 'کارگاه بیمه شیراز'
            }
        }
        res_update = self.client.post(f'/api/personnel/settings/{new_settings_id}/update-all/', update_payload, format='json')
        self.assertEqual(res_update.status_code, 200)

        # حال استعلام مجدد پروژه شیراز باید کد کارگاه جدید را برگرداند
        res_shiraz = self.client.get('/api/personnel/settings/active-or-year/', {
            'year': '1405',
            'project_id': self.proj_shiraz.id
        })
        self.assertEqual(res_shiraz.json()['workshop_insurance']['workshop_code'], '9999888877')

        # در حالی که استعلام سراسری همچنان کد مادر را دارد (ایزولاسیون کامل)
        res_global = self.client.get('/api/personnel/settings/active-or-year/', {'year': '1405'})
        self.assertEqual(res_global.json()['workshop_insurance']['workshop_code'], '4894290013')
