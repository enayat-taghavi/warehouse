# -*- coding: utf-8 -*-
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from personnel.models import (
    Company,
    Project,
    ProjectSection,
    UserCompanyAccess,
    SectionAssignment,
    PersonnelProfile,
    VehicleDriverProfile,
    PersonnelChangeRequest,
    VehicleChangeRequest,
    MonthlyWorkPeriod,
    MonthlyPayrollRecord,
    VehicleTripLog,
    ExpenseInvoice,
    PettyCashTransaction,
    Counterparty
)
from personnel.workflow_engine import WorkflowStatuses

User = get_user_model()


class CartableMultiTenantTestCase(TestCase):
    """
    مجموعه آزمون‌های جامع تفکیک چندشرکتی و ایمن‌سازی کارتابل‌های ۵ سطحی (Cartable Multi-Tenant Security)
    راستی‌آزمایی ایزولاسیون کارتابل‌های سرپرست، حسابدار، مدیر و خزانه‌دار و پدافند BOLA
    """

    def setUp(self):
        self.client = APIClient()

        # ۱. ایجاد شرکت‌های آزمایشی
        self.company_fa = Company.objects.create(
            code='FA_TEST',
            name='فارس عالیش تست',
            national_id='14009876543',
            economic_code='411698765432',
            is_active=True
        )
        self.company_pts = Company.objects.create(
            code='PTS_TEST',
            name='پاینده توان ساینا تست',
            national_id='14008123456',
            economic_code='411512345678',
            is_active=True
        )

        # ۲. پروژه‌ها و بخش‌ها
        self.proj_fa = Project.objects.create(
            company=self.company_fa,
            code='PRJ_FA',
            name='پروژه انبار مرکزی فارس عالیش'
        )
        self.sec_fa = ProjectSection.objects.create(
            project=self.proj_fa,
            code='SEC_FA',
            name='بخش انبارداری FA'
        )

        self.proj_pts = Project.objects.create(
            company=self.company_pts,
            code='PRJ_PTS',
            name='پروژه پایانه PTS'
        )
        self.sec_pts = ProjectSection.objects.create(
            project=self.proj_pts,
            code='SEC_PTS',
            name='بخش لجستیک PTS'
        )

        # ۳. طرف حساب‌ها
        self.cp_fa = Counterparty.objects.create(
            company=self.company_fa,
            name='فروشگاه ابزار FA',
            counterparty_type='vendor'
        )
        self.cp_pts = Counterparty.objects.create(
            company=self.company_pts,
            name='تامین قطعات PTS',
            counterparty_type='vendor'
        )

        # ۴. سوپریوزر
        self.superuser = User.objects.create_superuser(
            username='admin_cartable',
            password='password123',
            email='admin@cartable.com'
        )

        # ۵. کاربران شرکت FA
        self.user_fa_supervisor = self._create_user_with_role('fa_sup', 'supervisor', self.company_fa, self.sec_fa)
        self.user_fa_accountant = self._create_user_with_role('fa_acc', 'accountant', self.company_fa, self.sec_fa)
        self.user_fa_manager = self._create_user_with_role('fa_mgr', 'manager', self.company_fa, self.sec_fa)
        self.user_fa_treasurer = self._create_user_with_role('fa_tre', 'treasurer', self.company_fa, self.sec_fa)

        # ۶. کاربران شرکت PTS
        self.user_pts_supervisor = self._create_user_with_role('pts_sup', 'supervisor', self.company_pts, self.sec_pts)
        self.user_pts_accountant = self._create_user_with_role('pts_acc', 'accountant', self.company_pts, self.sec_pts)
        self.user_pts_manager = self._create_user_with_role('pts_mgr', 'manager', self.company_pts, self.sec_pts)
        self.user_pts_treasurer = self._create_user_with_role('pts_tre', 'treasurer', self.company_pts, self.sec_pts)

        # ۷. ایجاد رکوردهای معلق شرکت FA
        self.p_fa = PersonnelProfile.objects.create(
            company=self.company_fa,
            project=self.proj_fa,
            section=self.sec_fa,
            first_name='احمد',
            last_name='سعیدی FA',
            national_code='1111111111',
            approval_status=WorkflowStatuses.PENDING_SUPERVISOR,
            sheba_number='IR110120000000000000000011'
        )
        self.v_fa = VehicleDriverProfile.objects.create(
            company=self.company_fa,
            project=self.proj_fa,
            section=self.sec_fa,
            driver_name='راننده FA',
            plate_number='11-111-11',
            approval_status=WorkflowStatuses.PENDING_SUPERVISOR,
            sheba_number='IR110120000000000000000012'
        )
        self.inv_fa = ExpenseInvoice.objects.create(
            section=self.sec_fa,
            counterparty=self.cp_fa,
            invoice_number='INV-FA-001',
            invoice_date_shamsi='1404/05/01',
            amount=Decimal('10000000'),
            description='هزینه حمل FA',
            status='pending_supervisor'
        )
        self.period_fa = MonthlyWorkPeriod.objects.create(
            company=self.company_fa,
            year_month='1404/05',
            status=WorkflowStatuses.PERIOD_READY_TO_PAY
        )
        self.payroll_fa = MonthlyPayrollRecord.objects.create(
            period=self.period_fa,
            personnel=self.p_fa,
            national_code='1111111111',
            full_name='احمد سعیدی FA',
            payable_amount=Decimal('150000000'),
            payment_status=WorkflowStatuses.PAYROLL_READY_TO_PAY
        )
        self.trip_fa = VehicleTripLog.objects.create(
            vehicle=self.v_fa,
            project=self.proj_fa,
            section=self.sec_fa,
            date_shamsi='1404/05/10',
            total_amount=Decimal('25000000'),
            is_settled=False
        )

        # ۸. ایجاد رکوردهای معلق شرکت PTS
        self.p_pts = PersonnelProfile.objects.create(
            company=self.company_pts,
            project=self.proj_pts,
            section=self.sec_pts,
            first_name='بهرام',
            last_name='رستمی PTS',
            national_code='2222222222',
            approval_status=WorkflowStatuses.PENDING_SUPERVISOR,
            sheba_number='IR220120000000000000000022'
        )
        self.v_pts = VehicleDriverProfile.objects.create(
            company=self.company_pts,
            project=self.proj_pts,
            section=self.sec_pts,
            driver_name='راننده PTS',
            plate_number='22-222-22',
            approval_status=WorkflowStatuses.PENDING_SUPERVISOR,
            sheba_number='IR220120000000000000000023'
        )
        self.inv_pts = ExpenseInvoice.objects.create(
            section=self.sec_pts,
            counterparty=self.cp_pts,
            invoice_number='INV-PTS-001',
            invoice_date_shamsi='1404/05/01',
            amount=Decimal('20000000'),
            description='خرید قطعات PTS',
            status='pending_supervisor'
        )
        self.period_pts = MonthlyWorkPeriod.objects.create(
            company=self.company_pts,
            year_month='1404/05',
            status=WorkflowStatuses.PERIOD_READY_TO_PAY
        )
        self.payroll_pts = MonthlyPayrollRecord.objects.create(
            period=self.period_pts,
            personnel=self.p_pts,
            national_code='2222222222',
            full_name='بهرام رستمی PTS',
            payable_amount=Decimal('300000000'),
            payment_status=WorkflowStatuses.PAYROLL_READY_TO_PAY
        )
        self.trip_pts = VehicleTripLog.objects.create(
            vehicle=self.v_pts,
            project=self.proj_pts,
            section=self.sec_pts,
            date_shamsi='1404/05/10',
            total_amount=Decimal('50000000'),
            is_settled=False
        )

        # ت۱۷ طرح ۲.۳: کارتابل فاکتور از کارهای موتور گردش کار خوانده می‌شود؛ فاکتورها را کارمند هر شرکت ارسال می‌کند
        from personnel.workflows import INVOICE_WORKFLOW
        from workflow import engine as wf_engine
        for inv, company, section, name in ((self.inv_fa, self.company_fa, self.sec_fa, 'fa_emp'),
                                            (self.inv_pts, self.company_pts, self.sec_pts, 'pts_emp')):
            creator = self._create_user_with_role(name, 'employee', company, section)
            inv.status = 'draft'
            inv.created_by = creator
            inv.save(update_fields=['status', 'created_by'])
            wf_engine.submit(INVOICE_WORKFLOW, inv, creator)

    def _create_user_with_role(self, username, role, company, section):
        from django.contrib.auth.models import Permission
        u = User.objects.create_user(
            username=username,
            password='password123',
            email=f'{username}@test.com'
        )
        UserCompanyAccess.objects.create(
            user=u,
            company=company,
            is_default=True
        )
        role_perms = {
            'supervisor': ['perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor'],
            'accountant': ['perm_approve_personnel_finance', 'perm_approve_fleet_finance'],
            'manager': ['perm_approve_personnel_manager', 'can_act_as_manager', 'perm_manager_payment_authorize'],
            'treasurer': ['perm_treasury_disburse_action']
        }
        # مجوزهای بخشی فقط از انتساب (+ تفاوت کاربر برای همان شرکت) می‌آیند (طرح ۲.۲، ت۱)؛ کلید نقش انتساب
        # خزانه‌دار «treasury» است. کدی که مجوز بخشی نیست (can_act_as_manager) مثل پیش تیک مستقیم می‌خورد.
        from accounts.scoped_permissions import section_permission_codes
        from personnel.scoped_test_support import grant_section_perms
        codes = role_perms.get(role, [])
        section_codes = section_permission_codes()
        grant_section_perms(
            u, [c for c in codes if c in section_codes], section=section,
            role='treasury' if role == 'treasurer' else role, exact=False,
        )
        for codename in codes:
            if codename in section_codes:
                continue
            p = Permission.objects.filter(codename=codename).first()
            if p:
                u.user_permissions.add(p)
        return u

    def test_01_supervisor_cartable_isolation(self):
        """سرپرست شرکت FA فقط رکوردهای FA را مشاهده می‌کند و PTS برایش مخفی است"""
        self.client.force_authenticate(user=self.user_fa_supervisor)
        res = self.client.get('/api/personnel/cartable/supervisor/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res.status_code, 200)

        data = res.json()
        p_ids = [p['id'] for p in data['personnel']]
        v_ids = [v['id'] for v in data['vehicles']]
        inv_ids = [i['id'] for i in data['invoices']]

        self.assertIn(self.p_fa.id, p_ids)
        self.assertNotIn(self.p_pts.id, p_ids)

        self.assertIn(self.v_fa.id, v_ids)
        self.assertNotIn(self.v_pts.id, v_ids)

        self.assertIn(self.inv_fa.id, inv_ids)
        self.assertNotIn(self.inv_pts.id, inv_ids)

        # بررسی در شرکت PTS
        self.client.force_authenticate(user=self.user_pts_supervisor)
        res_pts = self.client.get('/api/personnel/cartable/supervisor/', HTTP_X_COMPANY_ID=str(self.company_pts.id))
        self.assertEqual(res_pts.status_code, 200)
        pts_p_ids = [p['id'] for p in res_pts.json()['personnel']]
        self.assertIn(self.p_pts.id, pts_p_ids)
        self.assertNotIn(self.p_fa.id, pts_p_ids)

    def test_02_accountant_cartable_isolation(self):
        """حسابدار فقط احکام و فاکتورهای شرکت متبوع را مشاهده می‌کند"""
        self.p_fa.approval_status = WorkflowStatuses.PENDING_ACCOUNTANT
        self.p_fa.save()
        self.p_pts.approval_status = WorkflowStatuses.PENDING_ACCOUNTANT
        self.p_pts.save()

        self.client.force_authenticate(user=self.user_fa_accountant)
        res = self.client.get('/api/personnel/cartable/accountant/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res.status_code, 200)
        p_ids = [p['id'] for p in res.json()['personnel']]
        self.assertIn(self.p_fa.id, p_ids)
        self.assertNotIn(self.p_pts.id, p_ids)

    def test_03_manager_cartable_isolation(self):
        """مدیر شرکت تنها پرونده‌های سطح مدیر شرکت خود را می‌بیند"""
        self.p_fa.approval_status = WorkflowStatuses.PENDING_MANAGER
        self.p_fa.save()
        self.p_pts.approval_status = WorkflowStatuses.PENDING_MANAGER
        self.p_pts.save()

        self.client.force_authenticate(user=self.user_fa_manager)
        res = self.client.get('/api/personnel/cartable/manager/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res.status_code, 200)
        p_ids = [p['id'] for p in res.json()['personnel']]
        self.assertIn(self.p_fa.id, p_ids)
        self.assertNotIn(self.p_pts.id, p_ids)

    def test_04_treasury_cartable_sheba_isolation(self):
        """خزانه‌دار فقط پرداخت‌ها و شبای شرکت خود را می‌بیند و صف خزانه‌داری تفکیک می‌شود"""
        self.v_fa.approval_status = WorkflowStatuses.APPROVED
        self.v_fa.save()
        self.v_pts.approval_status = WorkflowStatuses.APPROVED
        self.v_pts.save()

        # د۶ طرح ۴.۵: صف حقوق خزانه از کارهای باز treasury_pay گردش حقوق؛ دوره‌های هر دو شرکت در مرحلهٔ پرداخت
        self._open_payroll_pay_step()
        # د۶ طرح ۴.۶: صف ناوگان خزانه از کارهای باز treasury_pay گردش ناوگان (همان دوره‌های بخش)
        from personnel.workflows import FLEET_PERIOD_WORKFLOW
        from workflow import engine as wf_engine
        VehicleTripLog.objects.filter(pk=self.trip_fa.pk).update(unit_rate=Decimal('25000000'), trip_count=1)
        for period in (self.period_fa, self.period_pts):
            period.fleet_payable_total = Decimal('0')
            self.assertIsNotNone(wf_engine.open_at_step(FLEET_PERIOD_WORKFLOW, period, None, 'treasury_pay'))

        self.client.force_authenticate(user=self.user_fa_treasurer)
        res = self.client.get('/api/personnel/cartable/treasury/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual([p['id'] for p in data['periods']], [self.period_fa.id])

        # سرجمع مبالغ خزانه‌داری باید فقط متعلق به FA باشد
        self.assertEqual(data['total_payroll_amount'], 150000000)
        self.assertEqual(data['total_fleet_amount'], 25000000)
        self.assertEqual(data['total_disbursement_queue'], 175000000)

        # شبای پرسنل PTS نباید در خروجی باشد
        payroll_shebas = [r.get('sheba_number') for r in data['payrolls']]
        trip_shebas = [t.get('sheba_number') for t in data['trips']]

        self.assertNotIn('IR220120000000000000000022', payroll_shebas)
        self.assertNotIn('IR220120000000000000000023', trip_shebas)

    def _open_payroll_pay_step(self):
        """دوره‌های حقوق بخش‌دار با کار باز در مرحلهٔ پرداخت خزانه (گردش حقوق ۴.۵)."""
        from personnel.workflows import PAYROLL_PERIOD_WORKFLOW
        from workflow import engine as wf_engine
        for period, section in ((self.period_fa, self.sec_fa), (self.period_pts, self.sec_pts)):
            period.section = section
            period.save(update_fields=['section'])
            period.payroll_payable_total = Decimal('0')
            self.assertIsNotNone(wf_engine.open_at_step(PAYROLL_PERIOD_WORKFLOW, period, None, 'treasury_pay'))

    def test_05_bola_protection_cross_company_supervisor_blocked(self):
        """تلاش سرپرست FA برای تایید پرسنل یا فاکتور شرکت PTS با خطای ۴۰۳ مسدود می‌شود"""
        self.client.force_authenticate(user=self.user_fa_supervisor)

        # تلاش برای تایید پرسنل PTS توسط سرپرست FA
        res = self.client.post('/api/personnel/cartable/supervisor/', {
            'action': 'approve',
            'model': 'personnel',
            'id': self.p_pts.id
        }, HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res.status_code, 403)

        self.p_pts.refresh_from_db()
        self.assertEqual(self.p_pts.approval_status, WorkflowStatuses.PENDING_SUPERVISOR)

        # تلاش برای رد فاکتور PTS توسط سرپرست FA
        res_inv = self.client.post('/api/personnel/cartable/supervisor/', {
            'action': 'reject',
            'model': 'invoice',
            'id': self.inv_pts.id,
            'reason': 'تلاش غیرمجاز'
        }, HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_inv.status_code, 403)

    def test_06_bola_protection_cross_company_manager_blocked(self):
        """تلاش مدیر PTS برای صدور مجوز پرداخت فاکتور FA با خطای ۴۰۳ مسدود می‌شود"""
        self.inv_fa.status = 'pending_manager'
        self.inv_fa.save()

        self.client.force_authenticate(user=self.user_pts_manager)
        res = self.client.post('/api/personnel/cartable/manager/', {
            'action': 'approve',
            'model': 'invoice',
            'id': self.inv_fa.id
        }, HTTP_X_COMPANY_ID=str(self.company_pts.id))
        self.assertEqual(res.status_code, 403)

        self.inv_fa.refresh_from_db()
        self.assertEqual(self.inv_fa.status, 'pending_manager')

    def test_07_treasury_cross_company_disbursement_blocked(self):
        """
        تلاش خزانه‌دار FA برای تسویه حقوق دوره یا فاکتور PTS مسدود می‌شود. د۶ طرح ۴.۵: دوره و ردیف حقوق شرکت
        دیگر یا شناسهٔ ناموجود 404 (نه 403 و نه 500)؛ ناوگان همان 403.
        """
        self._open_payroll_pay_step()
        self.client.force_authenticate(user=self.user_fa_treasurer)
        res_missing = self.client.post('/api/personnel/cartable/treasury/', {
            'action': 'disburse_period', 'period_id': 999999, 'tracking_code': 'TRK-NONE'
        }, HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_missing.status_code, 404)

        # ۱. تسویه دوره کارکرد PTS توسط خزانه‌دار FA
        res_period = self.client.post('/api/personnel/cartable/treasury/', {
            'action': 'disburse_period',
            'period_id': self.period_pts.id,
            'tracking_code': 'TRK-HACK-001'
        }, HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_period.status_code, 404)
        self.period_pts.refresh_from_db()
        self.assertEqual(self.period_pts.status, WorkflowStatuses.PERIOD_READY_TO_PAY)

        # ۲. تسویه رکورد منفرد حقوق PTS توسط خزانه‌دار FA
        res_payroll = self.client.post('/api/personnel/cartable/treasury/', {
            'action': 'disburse_single_payroll',
            'payroll_id': self.payroll_pts.id,
            'tracking_code': 'TRK-HACK-002'
        }, HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_payroll.status_code, 404)

        # ۳. تسویه سرویس ناوگان PTS توسط خزانه‌دار FA
        # د۶ طرح ۴.۶: فقط trip_ids بی دوره 400 fleet_period_required؛ دورهٔ شرکت دیگر 404
        res_fleet = self.client.post('/api/personnel/cartable/treasury/', {
            'action': 'disburse_fleet',
            'trip_ids': [self.trip_pts.id],
            'tracking_code': 'TRK-HACK-003'
        }, format='json', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_fleet.status_code, 400)
        self.assertEqual(res_fleet.json()['code'], 'fleet_period_required')
        res_fleet = self.client.post('/api/personnel/cartable/treasury/', {
            'action': 'disburse_fleet',
            'period_id': self.period_pts.id,
            'tracking_code': 'TRK-HACK-003'
        }, format='json', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_fleet.status_code, 404)
        self.trip_pts.refresh_from_db()
        self.assertFalse(self.trip_pts.is_settled)

    def test_08_treasury_diskette_export_cross_company_blocked(self):
        """دانلود دیسکت بانکی پایا/ساتنا برای دوره شرکت دیگر با خطای ۴۰۳ متوقف می‌شود"""
        self.client.force_authenticate(user=self.user_fa_treasurer)

        # خزانه‌دار FA سعی می‌کند دیسکت PTS را دانلود کند
        res = self.client.get(
            f'/api/personnel/cartable/treasury/export-diskette/?period_id={self.period_pts.id}&type=paya',
            HTTP_X_COMPANY_ID=str(self.company_fa.id)
        )
        # د۶ طرح ۴.۵: دورهٔ شرکت دیگر و شناسهٔ ناموجود 404 (وجود شناسه لو نمی‌رود، هرگز 500)
        self.assertEqual(res.status_code, 404)
        res_missing = self.client.get(
            '/api/personnel/cartable/treasury/export-diskette/?period_id=987654&type=paya',
            HTTP_X_COMPANY_ID=str(self.company_fa.id)
        )
        self.assertEqual(res_missing.status_code, 404)

        # خزانه‌دار FA دیسکت دوره FA را با موفقیت دانلود می‌کند
        res_ok = self.client.get(
            f'/api/personnel/cartable/treasury/export-diskette/?period_id={self.period_fa.id}&type=paya',
            HTTP_X_COMPANY_ID=str(self.company_fa.id)
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertIn('text/csv', res_ok['Content-Type'])

    def test_09_superuser_flexible_company_scoping(self):
        """سوپریوزر در صورت ارسال هدر شرکت، داده‌های آن شرکت و در غیر این صورت کل سیستم را می‌بیند"""
        self.client.force_authenticate(user=self.superuser)

        # با هدر FA
        res_fa = self.client.get('/api/personnel/cartable/supervisor/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(res_fa.status_code, 200)
        p_ids = [p['id'] for p in res_fa.json()['personnel']]
        self.assertIn(self.p_fa.id, p_ids)
        self.assertNotIn(self.p_pts.id, p_ids)

        # بدون هدر (تجمیعی سراسری)
        res_all = self.client.get('/api/personnel/cartable/supervisor/')
        self.assertEqual(res_all.status_code, 200)
        all_p_ids = [p['id'] for p in res_all.json()['personnel']]
        self.assertIn(self.p_fa.id, all_p_ids)
        self.assertIn(self.p_pts.id, all_p_ids)
