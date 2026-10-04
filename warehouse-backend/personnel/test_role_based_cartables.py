from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from decimal import Decimal
from personnel.models import (
    PersonnelProfile,
    VehicleDriverProfile,
    PersonnelChangeRequest,
    VehicleChangeRequest,
    VehicleBankAccount,
    MonthlyWorkPeriod,
    PayrollYearlySettings,
    JobGradeTier,
    Company,
    FinancialProject,
    ProjectSection
)
from personnel.sheba_utils import generate_sheba_from_account

User = get_user_model()

class RoleBasedCartablesTestCase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='cartable_admin',
            email='admin@example.com',
            password='password123'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

        self.company = Company.objects.create(name='شرکت تست کارتابل', code='CMP-CR')
        self.project = FinancialProject.objects.create(company=self.company, name='پروژه تست', code='PRJ-CR')
        self.section = ProjectSection.objects.create(project=self.project, name='بخش تست', code='SEC-CR')

        # Base Yearly Settings & Job Grades
        self.settings = PayrollYearlySettings.objects.create(
            fiscal_year='1405',
            title='قانون کار ۱۴۰۵',
            is_active=True,
            attendance_edit_past_days=3,
            attendance_edit_future_days=0
        )
        for g in range(1, 21):
            JobGradeTier.objects.create(
                yearly_settings=self.settings,
                grade_number=g,
                daily_base_wage=Decimal(1000000 + g * 50000),
                daily_seniority_bonus=Decimal(g * 10000)
            )

        # Pending Supervisor Personnel Profile
        self.personnel = PersonnelProfile.objects.create(
            first_name='علی',
            last_name='تقوی',
            national_code='0076543218',
            father_name='محمد',
            birth_date='1370/01/01',
            id_number='12345',
            gender='مرد',
            job_title='کارشناس فنی',
            phone_number='09121112233',
            address='تهران، خیابان آزادی',
            postal_code='1998877665',
            sheba_number='780170000000101111111001',
            bank_name='بانک ملی ایران',
            job_code='010203',
            start_date='1405/01/01',
            daily_base_wage=Decimal(7000000),
            section=self.section,
            approval_status='pending_supervisor',
            is_active=False
        )

        # Draft Vehicle Profile
        valid_sheba = generate_sheba_from_account("بانک ملی ایران", "0105678901004")
        self.vehicle = VehicleDriverProfile.objects.create(
            company=self.company,
            project=self.project,
            section=self.section,
            vehicle_type='nissan',
            ownership_type='contract',
            driver_name='حسن مرادی',
            driver_national_code='0010376488',
            driver_phone='09121234567',
            plate_number='33ب888ایران11',
            insurance_expiry_date='1406/01/01',
            bank_name='بانک ملی ایران',
            sheba_number=valid_sheba,
            default_service_rate=Decimal(3500000),
            approval_status='pending_supervisor',
            is_active=False
        )
        VehicleBankAccount.objects.create(
            vehicle=self.vehicle,
            bank_name='بانک ملی ایران',
            sheba_number=valid_sheba,
            account_number='0105678901004',
            is_primary=True,
            is_active=True
        )

    def test_01_base_settings_endpoint(self):
        """بررسی بازیابی تنظیمات پایه و ۲۰ گروه شغلی"""
        response = self.client.get('/api/personnel/settings/active-or-year/?year=1405')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data.get('job_grades', [])), 20)

    def test_02_supervisor_approval_flow(self):
        """بررسی تایید مرحله اول سرپرست برای پرسنل و ناوگان"""
        # Personnel Supervisor Approval
        res = self.client.post(f'/api/personnel/profiles/{self.personnel.id}/approve-supervisor/')
        self.assertEqual(res.status_code, 200)
        self.personnel.refresh_from_db()
        self.assertEqual(self.personnel.approval_status, 'pending_accountant')

        # Vehicle Supervisor Approval
        res_v = self.client.post(f'/api/personnel/vehicles/{self.vehicle.id}/approve-supervisor/')
        self.assertEqual(res_v.status_code, 200)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.approval_status, 'pending_accountant')

    def test_03_finance_and_manager_approval_flow(self):
        """بررسی تایید مرحله دوم (حسابدار) و مرحله نهایی (مدیر)"""
        self.personnel.approval_status = 'pending_accountant'
        self.personnel.save()
        self.vehicle.approval_status = 'pending_accountant'
        self.vehicle.save()

        # Finance Personnel Approval -> pending_manager
        res = self.client.post(f'/api/personnel/profiles/{self.personnel.id}/approve-finance/')
        self.assertEqual(res.status_code, 200)
        self.personnel.refresh_from_db()
        self.assertEqual(self.personnel.approval_status, 'pending_manager')

        # Manager Personnel Approval -> approved
        res_m = self.client.post(f'/api/personnel/profiles/{self.personnel.id}/approve-manager/')
        self.assertEqual(res_m.status_code, 200)
        self.personnel.refresh_from_db()
        self.assertEqual(self.personnel.approval_status, 'approved')

        # Finance Vehicle Approval -> pending_manager
        res_v = self.client.post(f'/api/personnel/vehicles/{self.vehicle.id}/approve-finance/')
        self.assertEqual(res_v.status_code, 200)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.approval_status, 'pending_manager')

        # Manager Vehicle Approval -> approved
        res_vm = self.client.post(f'/api/personnel/vehicles/{self.vehicle.id}/approve-manager/')
        self.assertEqual(res_vm.status_code, 200)
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.approval_status, 'approved')

    def test_04_change_requests_diff_and_approval(self):
        """بررسی کارتابل تغییرات و اعمال متادیتا"""
        cr = PersonnelChangeRequest.objects.create(
            personnel=self.personnel,
            proposed_changes={'first_name': 'علیرضا'},
            previous_values={'first_name': 'علی'},
            status='pending_accountant',
            requested_by=self.admin
        )
        # Finance Approval of CR -> pending_manager
        res_f = self.client.post(f'/api/personnel/personnel-change-requests/{cr.id}/approve-finance/')
        self.assertEqual(res_f.status_code, 200)
        cr.refresh_from_db()
        self.assertEqual(cr.status, 'pending_manager')

        # Manager Approval of CR -> approved & applied
        res = self.client.post(f'/api/personnel/personnel-change-requests/{cr.id}/approve-manager/')
        self.assertEqual(res.status_code, 200)
        cr.refresh_from_db()
        self.assertEqual(cr.status, 'approved')
        self.personnel.refresh_from_db()
        self.assertEqual(self.personnel.first_name, 'علیرضا')

    def test_05_fleet_settlement_calculation(self):
        """بررسی اندپوینت محاسبه تسویه ناوگان"""
        res = self.client.get('/api/personnel/fleet-settlement/calculate/?year_month=1405/04')
        self.assertEqual(res.status_code, 200)
        self.assertIn('records', res.data)
        self.assertIn('summary', res.data)
