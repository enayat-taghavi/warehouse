from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from personnel.models import (
    Company, FinancialProject, ProjectSection, UserSectionAssignment,
    UserCompanyAccess, PersonnelProfile, PayrollYearlySettings, emit_accounting_event
)
from personnel.payroll_engine import get_effective_payroll_settings
from accounts.audit_utils import log_audit_event
from accounts.models import AuditLog

User = get_user_model()

class CompanyMultiTenantTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username='admin_multitenant',
            password='password123',
            email='admin@test.com'
        )
        self.regular_user = User.objects.create_user(
            username='regular_staff',
            password='password123',
            email='staff@test.com'
        )

        # شرکت‌های تست
        self.company_pts = Company.objects.create(
            code='PTS_TEST',
            name='پاینده توان ساینا تست',
            national_id='14008123456',
            economic_code='411512345678',
            is_active=True
        )
        self.company_fa = Company.objects.create(
            code='FA_TEST',
            name='فارس عالیش تست',
            national_id='14009876543',
            economic_code='411698765432',
            is_active=True
        )

        # پروژه‌ها
        self.proj_dalan = FinancialProject.objects.create(
            company=self.company_pts,
            code='PRJ_DALAN',
            name='پروژه دالان'
        )
        self.proj_parsian = FinancialProject.objects.create(
            company=self.company_pts,
            code='PRJ_PARSIAN',
            name='پروژه پارسیان'
        )
        self.proj_anbar = FinancialProject.objects.create(
            company=self.company_fa,
            code='PRJ_ANBAR',
            name='پروژه انبارداری'
        )

    def test_superuser_can_list_and_create_company(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get('/api/personnel/companies/')
        self.assertEqual(res.status_code, 200)
        codes = [c['code'] for c in res.json()]
        self.assertIn('PTS_TEST', codes)
        self.assertIn('FA_TEST', codes)

        # ایجاد شرکت جدید
        create_res = self.client.post('/api/personnel/companies/', {
            'code': 'NEW_CO',
            'name': 'شرکت جدید آزمایشی',
            'national_id': '14001112233'
        })
        self.assertEqual(create_res.status_code, 201)
        self.assertEqual(create_res.json()['name'], 'شرکت جدید آزمایشی')

    def test_company_national_id_validation(self):
        self.client.force_authenticate(user=self.admin_user)
        # شناسه ملی کمتر از ۱۱ رقم
        res = self.client.post('/api/personnel/companies/', {
            'code': 'INVALID_CO',
            'name': 'شرکت نامعتبر',
            'national_id': '12345'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('۱۱ رقم', str(res.json()))

    def test_user_available_companies_hybrid_access(self):
        # ۱. ابتدا کاربر عادی به هیچ شرکتی دسترسی ندارد
        self.client.force_authenticate(user=self.regular_user)
        res = self.client.get('/api/personnel/companies/user-available/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 0)

        # ۲. انتساب مستقیم کاربر به شرکت PTS با سطح فضای کاری کامل
        UserCompanyAccess.objects.create(
            user=self.regular_user,
            company=self.company_pts,
            access_level='workspace_full',
            is_default=True
        )
        res = self.client.get('/api/personnel/companies/user-available/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 1)
        self.assertEqual(res.json()['companies'][0]['code'], 'PTS_TEST')

        # ۳. انتساب ضمنی از طریق عضویت در بخش پروژه انبارداری (شرکت FA)
        sec_anbar = ProjectSection.objects.create(
            project=self.proj_anbar,
            code='SEC_LOGISTICS',
            name='بخش لجستیک انبار'
        )
        UserSectionAssignment.objects.create(
            user=self.regular_user,
            section=sec_anbar,
            role='supervisor',
            is_active=True
        )
        res = self.client.get('/api/personnel/companies/user-available/')
        self.assertEqual(res.status_code, 200)
        # اکنون باید به هر دو شرکت دسترسی داشته باشد (۱ مستقیم + ۱ مشتق‌شده)
        self.assertEqual(res.json()['count'], 2)

    def test_financial_project_filtering_by_company(self):
        self.client.force_authenticate(user=self.admin_user)

        # فیلتر بر مبنای شرکت PTS
        res_pts = self.client.get('/api/personnel/financial-projects/', {
            'company_id': self.company_pts.id
        })
        self.assertEqual(res_pts.status_code, 200)
        pts_codes = [p['code'] for p in res_pts.json()]
        self.assertIn('PRJ_DALAN', pts_codes)
        self.assertIn('PRJ_PARSIAN', pts_codes)
        self.assertNotIn('PRJ_ANBAR', pts_codes)

        # فیلتر بر مبنای هدر X-Company-ID
        res_header = self.client.get(
            '/api/personnel/financial-projects/',
            HTTP_X_COMPANY_ID=str(self.company_fa.id)
        )
        self.assertEqual(res_header.status_code, 200)
        fa_codes = [p['code'] for p in res_header.json()]
        self.assertIn('PRJ_ANBAR', fa_codes)
        self.assertNotIn('PRJ_DALAN', fa_codes)
        # بررسی فیلد شرکت در سریالایزر پروژه
        self.assertEqual(res_header.json()[0]['company_name'], 'فارس عالیش تست')

    def test_bola_protection_unauthorized_company_access(self):
        # کاربر عادی با سطح فضای کاری فقط به شرکت PTS دسترسی دارد
        UserCompanyAccess.objects.create(
            user=self.regular_user,
            company=self.company_pts,
            access_level='workspace_full',
            is_default=True
        )
        self.client.force_authenticate(user=self.regular_user)

        # تلاش برای دسترسی به پروژه‌های شرکت FA (تلاش برای BOLA)
        res_forbidden = self.client.get(
            '/api/personnel/financial-projects/',
            HTTP_X_COMPANY_ID=str(self.company_fa.id)
        )
        # باید خطای ۴۰۳ (PermissionDenied) پرتاب شود
        self.assertEqual(res_forbidden.status_code, 403)
        self.assertIn('دسترسی ندارید', str(res_forbidden.json()))

        # اما با ارسال شناسه شرکت مجاز، درخواست ۲۰۰ بازمی‌گرداند
        res_allowed = self.client.get(
            '/api/personnel/financial-projects/',
            HTTP_X_COMPANY_ID=str(self.company_pts.id)
        )
        self.assertEqual(res_allowed.status_code, 200)

    def test_personnel_filtering_by_company_scope(self):
        from personnel.models import PersonnelProfile

        # ایجاد بخش برای هر دو شرکت
        sec_dalan = ProjectSection.objects.create(
            project=self.proj_dalan,
            code='SEC_DALAN_TECH',
            name='واحد فنی دالان'
        )
        sec_anbar = ProjectSection.objects.create(
            project=self.proj_anbar,
            code='SEC_FA_LOG',
            name='واحد انبار فارس'
        )

        # ایجاد دو پرسنل
        p_pts = PersonnelProfile.objects.create(
            first_name='علی',
            last_name='پاینده‌پور',
            national_code='0011223344',
            section=sec_dalan,
            is_active=True
        )
        p_fa = PersonnelProfile.objects.create(
            first_name='رضا',
            last_name='فارس‌نیا',
            national_code='0099887766',
            section=sec_anbar,
            is_active=True
        )

        self.client.force_authenticate(user=self.admin_user)

        # فیلتر پرسنل شرکت پاینده توان ساینا (PTS)
        res_pts = self.client.get('/api/personnel/profiles/', {
            'company_id': self.company_pts.id
        })
        self.assertEqual(res_pts.status_code, 200)
        pts_ids = [p['id'] for p in res_pts.json()]
        self.assertIn(p_pts.id, pts_ids)
        self.assertNotIn(p_fa.id, pts_ids)

        # فیلتر پرسنل شرکت فارس عالیش (FA) با هدر X-Company-ID
        res_fa = self.client.get('/api/personnel/profiles/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_fa.status_code, 200)
        fa_ids = [p['id'] for p in res_fa.json()]
        self.assertIn(p_fa.id, fa_ids)
        self.assertNotIn(p_pts.id, fa_ids)

    def test_companies_export_excel(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get('/api/personnel/companies/export-excel/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        self.assertIn('attachment; filename="companies_', res['Content-Disposition'])

    def test_payroll_settings_3tier_inheritance(self):
        """
        آزمون زنجیره ارث‌بری ۳ سطحی تنظیمات حقوق:
        1. تنظیمات پروژه > 2. تنظیمات شرکت متبوع > 3. تنظیمات سراسری
        """
        # 1. ایجاد تنظیمات سراسری
        global_setting = PayrollYearlySettings.objects.create(
            fiscal_year='1405',
            effective_from='1405/01',
            company=None,
            project=None,
            monthly_housing_allowance=10000000,
            title='تنظیمات سراسری هلدینگ'
        )

        # 2. ایجاد تنظیمات در سطح شرکت پاینده توان ساینا (PTS)
        company_setting = PayrollYearlySettings.objects.create(
            fiscal_year='1405',
            effective_from='1405/01',
            company=self.company_pts,
            project=None,
            monthly_housing_allowance=20000000,
            title='تنظیمات اختصاصی شرکت PTS'
        )

        # 3. ایجاد تنظیمات اختصاصی در سطح پروژه دالان (متعلق به PTS)
        project_setting = PayrollYearlySettings.objects.create(
            fiscal_year='1405',
            effective_from='1405/01',
            company=self.company_pts,
            project=self.proj_dalan,
            monthly_housing_allowance=30000000,
            title='تنظیمات اختصاصی پروژه دالان'
        )

        # تست اولویت ۱: پروژه دالان باید تنظیمات خودش را بگیرد (۳۰ میلیون)
        s1 = get_effective_payroll_settings('1405/04', project_id=self.proj_dalan.id)
        self.assertEqual(s1.monthly_housing_allowance, 30000000)
        self.assertEqual(s1.id, project_setting.id)

        # تست اولویت ۲: پروژه پارسیان (متعلق به PTS، بدون تنظیم اختصاصی) باید تنظیمات شرکت PTS را ارث ببرد (۲۰ میلیون)
        s2 = get_effective_payroll_settings('1405/04', project_id=self.proj_parsian.id)
        self.assertEqual(s2.monthly_housing_allowance, 20000000)
        self.assertEqual(s2.id, company_setting.id)

        # تست اولویت ۳: پروژه انبار (متعلق به FA که تنظیم شرکتی ندارد) باید تنظیمات سراسری هلدینگ را بگیرد (۱۰ میلیون)
        s3 = get_effective_payroll_settings('1405/04', project_id=self.proj_anbar.id)
        self.assertEqual(s3.monthly_housing_allowance, 10000000)
        self.assertEqual(s3.id, global_setting.id)

        # تست واکشی مستقیم با شناسه شرکت
        s4 = get_effective_payroll_settings('1405/04', company_id=self.company_pts.id)
        self.assertEqual(s4.monthly_housing_allowance, 20000000)

        # تست واکشی سراسری بدون پروژه و شرکت
        s5 = get_effective_payroll_settings('1405/04')
        self.assertEqual(s5.monthly_housing_allowance, 10000000)

    def test_accounting_event_auto_injects_company_id(self):
        """
        آزمون تزریق خودکار company_id در payload رویدادهای مالی (AccountingEvent)
        """
        # رویداد از شیء پروژه دالان (دارای company=PTS)
        event1 = emit_accounting_event(self.proj_dalan, 'PROJECT_APPROVED')
        self.assertEqual(event1.payload.get('company_id'), self.company_pts.id)
        self.assertEqual(event1.payload.get('company_name'), self.company_pts.name)

        # ایجاد بخش برای شرکت فارس عالیش (FA)
        sec = ProjectSection.objects.create(
            project=self.proj_anbar,
            code='SEC_FA_TEST_EVENT',
            name='بخش تست رویداد'
        )
        event2 = emit_accounting_event(sec, 'SECTION_CONFIGURED')
        self.assertEqual(event2.payload.get('company_id'), self.company_fa.id)
        self.assertEqual(event2.payload.get('company_name'), self.company_fa.name)

    def test_audit_log_captures_and_filters_company_id(self):
        """
        آزمون ثبت شناسه شرکت در details لاگ‌های ممیزی و فیلتر کردن آن‌ها
        """
        # ثبت لاگ با شناسه شرکت صریح
        log1 = log_audit_event(
            module='finance',
            action='UPDATE',
            user=self.admin_user,
            target_model='FinancialProject',
            target_object_id=self.proj_dalan.id,
            details={'info': 'تست لاگ دالان'},
            company_id=self.company_pts.id
        )
        self.assertIsNotNone(log1)
        self.assertEqual(log1.details.get('company_id'), self.company_pts.id)

        log2 = log_audit_event(
            module='finance',
            action='UPDATE',
            user=self.admin_user,
            target_model='FinancialProject',
            target_object_id=self.proj_anbar.id,
            details={'info': 'تست لاگ فارس عالیش'},
            company_id=self.company_fa.id
        )
        self.assertIsNotNone(log2)
        self.assertEqual(log2.details.get('company_id'), self.company_fa.id)

        # تست فیلتر API وب‌سرویس لاگ‌ها بر اساس company_id
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get('/api/accounts/audit-logs/', {'company_id': self.company_pts.id})
        self.assertEqual(res.status_code, 200)
        logs_data = res.json().get('results', res.json()) if isinstance(res.json(), dict) else res.json()
        log_ids = [l['id'] for l in logs_data]
        self.assertIn(log1.id, log_ids)
        self.assertNotIn(log2.id, log_ids)

    def test_counterparty_company_isolation_and_auto_assign(self):
        """
        آزمون ایزولاسیون طرف‌حساب‌ها بر مبنای شرکت و انتساب خودکار
        """
        from personnel.models import Counterparty
        self.client.force_authenticate(user=self.admin_user)

        # ایجاد طرف‌حساب برای شرکت PTS با هدر X-Company-ID
        res_create = self.client.post('/api/personnel/counterparties/', {
            'name': 'تأمین‌کننده قطعات پارسیان',
            'counterparty_type': 'repair_shop'
        }, HTTP_X_COMPANY_ID=str(self.company_pts.id))
        self.assertEqual(res_create.status_code, 201)
        cp_pts_id = res_create.json()['id']
        self.assertEqual(res_create.json()['company'], self.company_pts.id)

        # ایجاد طرف‌حساب برای شرکت FA
        res_create_fa = self.client.post('/api/personnel/counterparties/', {
            'name': 'جایگاه سوخت فارس عالیش',
            'counterparty_type': 'fuel_station'
        }, HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_create_fa.status_code, 201)
        cp_fa_id = res_create_fa.json()['id']

        # استعلام با هدر PTS فقط باید طرف‌حساب PTS را برگرداند
        res_pts = self.client.get('/api/personnel/counterparties/', HTTP_X_COMPANY_ID=str(self.company_pts.id))
        self.assertEqual(res_pts.status_code, 200)
        pts_ids = [c['id'] for c in res_pts.json()]
        self.assertIn(cp_pts_id, pts_ids)
        self.assertNotIn(cp_fa_id, pts_ids)

    def test_personnel_company_auto_assignment(self):
        """
        آزمون انتساب خودکار فیلد company روی پرونده پرسنلی از روی بخش/پروژه
        """
        from personnel.models import PersonnelProfile
        sec = ProjectSection.objects.create(
            project=self.proj_dalan,
            code='SEC_DALAN_HR',
            name='بخش منابع انسانی دالان'
        )
        p = PersonnelProfile.objects.create(
            first_name='حمید',
            last_name='تقوی',
            national_code='0012345678',
            job_title='کارشناس فنی',
            project=self.proj_dalan,
            section=sec
        )
        self.assertIsNotNone(p.company)
        self.assertEqual(p.company.id, self.company_pts.id)

    def test_company_fiscal_period_lifecycle(self):
        """
        آزمون چرخه عمر سال مالی: ایجاد، بستن سال مالی، انجماد و بازگشایی
        """
        from personnel.models import CompanyFiscalPeriod
        self.client.force_authenticate(user=self.admin_user)

        res_create = self.client.post('/api/personnel/company-fiscal-periods/', {
            'company': self.company_pts.id,
            'fiscal_year': '1405',
            'title': 'سال مالی ۱۴۰۵',
            'start_date': '1405/01/01',
            'end_date': '1405/12/29'
        })
        self.assertEqual(res_create.status_code, 201)
        period_id = res_create.json()['id']
        self.assertEqual(res_create.json()['status'], 'open')

        # انجماد دوره مالی
        res_freeze = self.client.post(f'/api/personnel/company-fiscal-periods/{period_id}/freeze-period/')
        self.assertEqual(res_freeze.status_code, 200)
        period = CompanyFiscalPeriod.objects.get(id=period_id)
        self.assertEqual(period.status, 'frozen')

        # بستن سال مالی
        res_close = self.client.post(f'/api/personnel/company-fiscal-periods/{period_id}/close-period/', {
            'notes': 'تصویب مجمع عمومی سالیانه'
        })
        self.assertEqual(res_close.status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'closed')
        self.assertIsNotNone(period.closed_at)
        self.assertEqual(period.closed_by, self.admin_user)

        # بازگشایی توسط مدیر ارشد
        res_reopen = self.client.post(f'/api/personnel/company-fiscal-periods/{period_id}/reopen-period/')
        self.assertEqual(res_reopen.status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'open')

    def test_company_delete_protection_with_warehouses_and_profiles(self):
        """
        آزمون ممانعت از حذف شرکت در صورت وجود انبار، پرسنل یا دوره مالی
        """
        from warehouses.models import Warehouse
        from personnel.models import Company
        self.client.force_authenticate(user=self.admin_user)

        # ایجاد شرکت موقت برای تست حذف
        temp_comp = Company.objects.create(
            code='TEMP_CO_DEL',
            name='شرکت موقت تست حذف'
        )

        # ۱. انتساب انبار به شرکت
        wh = Warehouse.objects.create(
            name='انبار تست شرکت موقت',
            company=temp_comp
        )
        res_del_wh = self.client.delete(f'/api/personnel/companies/{temp_comp.id}/')
        self.assertEqual(res_del_wh.status_code, 400)
        self.assertIn('انبار', res_del_wh.content.decode('utf-8'))

        # حذف انبار و تست وجود پرسنل
        wh.delete()
        from personnel.models import PersonnelProfile
        p = PersonnelProfile.objects.create(
            first_name='علی',
            last_name='رضایی',
            national_code='9988776655',
            company=temp_comp
        )
        res_del_pers = self.client.delete(f'/api/personnel/companies/{temp_comp.id}/')
        self.assertEqual(res_del_pers.status_code, 400)
        self.assertIn('پرسنل', res_del_pers.content.decode('utf-8'))

        # حذف پرسنل -> اکنون حذف موفقیت‌آمیز است
        p.delete()
        res_del_ok = self.client.delete(f'/api/personnel/companies/{temp_comp.id}/')
        self.assertEqual(res_del_ok.status_code, 204)
        self.assertFalse(Company.objects.filter(id=temp_comp.id).exists())

    def test_websocket_broadcast_isolation_and_privacy(self):
        """
        آزمون فاز ۴: ایزولاسیون روم وب‌سوکت به شرکت مربوطه و عدم نشت کدملی در پی‌لود
        """
        from unittest.mock import patch
        from personnel.models import PersonnelProfile
        from personnel.views import broadcast_personnel_update

        p = PersonnelProfile.objects.create(
            first_name='سارا',
            last_name='احمدی',
            national_code='1234567890',
            company=self.company_pts
        )

        with patch('channels.layers.get_channel_layer') as mock_get_layer:
            from unittest.mock import MagicMock, AsyncMock
            mock_layer = MagicMock()
            mock_layer.group_send = AsyncMock()
            mock_get_layer.return_value = mock_layer

            broadcast_personnel_update(p, action_type='updated', message='تست وب‌سوکت')

            mock_layer.group_send.assert_called_once()
            call_args = mock_layer.group_send.call_args[0]
            group_name = call_args[0]
            payload = call_args[1]

            # ۱. پیام باید دقیقاً به کانال تفکیک‌شده شرکت ارسال شود
            self.assertEqual(group_name, f'company_{self.company_pts.id}_notifications')
            self.assertEqual(payload['company_id'], self.company_pts.id)

            # ۲. کدملی نباید در پی‌لود وب‌سوکت وجود داشته باشد (حفاظت از حریم خصوصی)
            self.assertNotIn('national_code', payload)



