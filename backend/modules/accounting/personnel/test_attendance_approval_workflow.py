# -*- coding: utf-8 -*-
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from personnel.models import (
    Company,
    PersonnelProfile,
    DailyAttendance,
    MonthlyWorkPeriod,
    AttendanceAuditLog,
    Project,
    ProjectSection
)
from personnel.payroll_engine import PayrollCalculationEngine, get_effective_payroll_settings
from django.apps import apps

# انبار از راه رجیستری اپ‌ها، بی import مستقیم ماژول انبار (حصار ماژول)
Warehouse = apps.get_model('warehouses', 'Warehouse') if apps.is_installed('warehouses') else None

User = get_user_model()


class AttendanceApprovalWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username='admin_workflow',
            password='Password123!',
            email='workflow_admin@example.com'
        )
        self.supervisor = User.objects.create_user(
            username='supervisor_user',
            password='Password123!',
            email='supervisor@example.com'
        )
        # تخصیص دسترسی سرپرست
        from django.contrib.auth.models import Permission
        p_sup = Permission.objects.filter(codename__in=['perm_approve_personnel_supervisor', 'view_sys_supervisor'])
        self.supervisor.user_permissions.set(p_sup)

        self.client.force_authenticate(user=self.superuser)

        self.warehouse = Warehouse.objects.create(name='انبار مرکزی تست', is_active=True)
        self.company = Company.objects.create(code='CMP-ATT', name='شرکت آزمون کارکرد')
        self.project = Project.objects.create(company=self.company, code='PRJ-01', name='پروژه عملیاتی تست', is_active=True)
        self.section = ProjectSection.objects.create(project=self.project, code='SEC-01', name='بخش سوله اصلی', is_active=True)

        self.personnel = PersonnelProfile.objects.create(
            first_name='بهرام',
            last_name='کارکردی',
            national_code='1234567890',
            assigned_warehouse=self.warehouse,
            section=self.section,
            daily_base_wage=Decimal('10000000'), # روزی ۱ میلیون تومان
            is_active=True,
            approval_status='approved'
        )

    def test_01_separation_of_physical_status_and_approval_status(self):
        """
        تست تفکیک وضعیت حضور فیزیکی (status) از وضعیت چرخه تایید (approval_status)
        """
        att = DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            project=self.project,
            date_shamsi='1405/06/01',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            notes='ثبت اولیه توسط اپراتور'
        )
        self.assertEqual(att.status, 'PRESENT_10H')
        self.assertEqual(att.approval_status, 'PENDING_SUPERVISOR')
        self.assertIsNone(att.supervisor_approved_by)
        self.assertIsNone(att.supervisor_approved_at)

    def test_02_supervisor_approve_attendance_via_cartable(self):
        """
        تست تایید کارکرد توسط سرپرست از طریق کارتابل سرپرست
        """
        att = DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            date_shamsi='1405/06/02',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='PENDING_SUPERVISOR',
            notes='یادداشت اولیه'
        )

        res = self.client.post('/api/personnel/cartable/supervisor/', {
            'action': 'approve',
            'model': 'attendance',
            'id': att.id
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        att.refresh_from_db()
        self.assertEqual(att.approval_status, 'APPROVED')
        self.assertEqual(att.supervisor_approved_by, self.superuser)
        self.assertIsNotNone(att.supervisor_approved_at)
        self.assertEqual(att.notes, 'یادداشت اولیه') # عدم تخریب فیلد یادداشت

        # بررسی ثبت لاگ ممیزی
        log = AttendanceAuditLog.objects.filter(attendance=att, field_name='approval_status', new_value='APPROVED').first()
        self.assertIsNotNone(log)

    def test_03_supervisor_revision_attendance_non_destructive(self):
        """
        تست عودت کارکرد جهت بازنگری بدون تخریب فیلد notes
        """
        att = DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            date_shamsi='1405/06/03',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='PENDING_SUPERVISOR',
            notes='یادداشت مهم سرپرست کارگاه'
        )

        reason_text = 'مغایرت ساعت اضافه‌کاری با برگه خروج'
        res = self.client.post('/api/personnel/cartable/supervisor/', {
            'action': 'revision',
            'model': 'attendance',
            'id': att.id,
            'reason': reason_text
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        att.refresh_from_db()
        self.assertEqual(att.approval_status, 'REVISION_REQUIRED')
        self.assertEqual(att.revision_reason, reason_text)
        self.assertEqual(att.revision_requested_by, self.superuser)
        self.assertIsNotNone(att.revision_requested_at)
        # یادداشت اصلی نباید با علت عودت رونویسی شود
        self.assertEqual(att.notes, 'یادداشت مهم سرپرست کارگاه')

    def test_04_payroll_engine_strictly_excludes_unapproved_attendance(self):
        """
        تست موتور محاسبات حقوق: کارکردهای غیر تاییدشده نباید در حقوق محاسبه شوند
        """
        # ایجاد یک کارکرد تاییدشده (۱۰ ساعت)
        DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            date_shamsi='1405/06/04',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='APPROVED'
        )

        # ایجاد یک کارکرد در انتظار (۱۰ ساعت)
        DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            date_shamsi='1405/06/05',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='PENDING_SUPERVISOR'
        )

        period = MonthlyWorkPeriod.objects.create(
            warehouse_id=self.warehouse.id,
            section=self.section,
            project=self.project,
            year_month='1405/06',
            status='OPEN'
        )

        settings = get_effective_payroll_settings('1405/06', project_id=self.project.id)
        engine = PayrollCalculationEngine(period=period)
        calc_data = engine.calculate_single_employee(
            personnel=self.personnel,
            period=period,
            settings=settings,
            job_grades={},
            month_days=31
        )
        # فقط ۱۰ ساعت رکورد تایید شده باید لحاظ شود و ۱۰ ساعت رکورد معلق نادیده گرفته شود
        self.assertEqual(calc_data['worked_hours'], Decimal('10.00'))

    def test_05_period_lock_barrier_blocks_when_unapproved_exist(self):
        """
        تست سد سروری قفل دوره: در صورت وجود حتی ۱ کارکرد معلق، قفل دوره مسدود می‌شود
        """
        period = MonthlyWorkPeriod.objects.create(
            warehouse_id=self.warehouse.id,
            section=self.section,
            project=self.project,
            year_month='1405/06',
            status='OPEN'
        )

        # ایجاد کارکرد معلق
        DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            period=period,
            date_shamsi='1405/06/10',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='PENDING_SUPERVISOR'
        )

        res = self.client.post('/api/personnel/cartable/supervisor/', {
            'action': 'approve',
            'model': 'period',
            'id': period.id
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('امکان قفل و ارسال دوره به حسابداری وجود ندارد', str(res.data))

        period.refresh_from_db()
        self.assertEqual(period.status, 'OPEN')

    def test_06_period_lock_barrier_succeeds_when_all_approved(self):
        """
        تست سد سروری قفل دوره: پس از تایید تمامی کارکردها، دوره با موفقیت قفل می‌شود
        """
        period = MonthlyWorkPeriod.objects.create(
            warehouse_id=self.warehouse.id,
            section=self.section,
            project=self.project,
            year_month='1405/06',
            status='OPEN'
        )

        # ایجاد کارکرد تاییدشده
        DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            period=period,
            date_shamsi='1405/06/11',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='APPROVED'
        )

        res = self.client.post('/api/personnel/cartable/supervisor/', {
            'action': 'approve',
            'model': 'period',
            'id': period.id
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED_SUPERVISOR')

    def test_07_bulk_save_revokes_approved_status_on_modification(self):
        """
        تست ابطال خودکار تاییدیه در صورت ویرایش کارکرد تاییدشده از طریق bulk-save
        """
        att = DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            date_shamsi='1405/06/12',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='APPROVED',
            supervisor_approved_by=self.superuser,
            supervisor_approved_at=timezone.now()
        )

        payload = {
            'warehouse_id': self.warehouse.id,
            'date_shamsi': '1405/06/12',
            'is_override': True,
            'items': [
                {
                    'personnel_id': self.personnel.id,
                    'status': 'HALF_5H',
                    'effective_hours': 5.0,
                    'overtime_hours': 0.0,
                    'is_friday_work': False,
                    'is_mission': False,
                    'advance_payment': 0,
                    'notes': 'تغییر به نیمه‌وقت'
                }
            ]
        }
        res = self.client.post('/api/personnel/attendance/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        att.refresh_from_db()
        self.assertEqual(att.status, 'HALF_5H')
        self.assertEqual(att.effective_hours, Decimal('5.00'))
        # تاییدیه باطل شده و به وضعیت در انتظار بازمی‌گردد
        self.assertEqual(att.approval_status, 'PENDING_SUPERVISOR')
        self.assertIsNone(att.supervisor_approved_by)

    def test_08_bulk_save_blocked_when_period_locked(self):
        """
        تست مسدودسازی ثبت کارکرد در صورت قفل بودن دوره (SUBMITTED_SUPERVISOR به بعد)
        """
        import jdatetime
        today_shamsi = jdatetime.date.today().strftime('%Y/%m/%d')
        today_ym = today_shamsi[:7]

        MonthlyWorkPeriod.objects.create(
            warehouse_id=self.warehouse.id,
            year_month=today_ym,
            status='SUBMITTED_SUPERVISOR'
        )

        payload = {
            'warehouse_id': self.warehouse.id,
            'date_shamsi': today_shamsi,
            'items': [
                {
                    'personnel_id': self.personnel.id,
                    'status': 'PRESENT_10H',
                    'effective_hours': 10.0,
                    'overtime_hours': 0.0,
                    'is_friday_work': False,
                    'is_mission': False,
                    'advance_payment': 0
                }
            ]
        }
        # کاربر سرپرست بدون حق دور زدن قفل دوره
        self.client.force_authenticate(user=self.supervisor)
        res = self.client.post('/api/personnel/attendance/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('دوره کارکرد', str(res.data))

    def test_09_monthly_summary_returns_accurate_pending_approvals_count(self):
        """
        تست اندپوینت monthly-summary برای بازگرداندن شمارش دقیق کارکردهای نیازمند بررسی
        """
        DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            date_shamsi='1405/06/20',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='APPROVED'
        )
        DailyAttendance.objects.create(
            personnel=self.personnel,
            warehouse_id=self.warehouse.id,
            section=self.section,
            date_shamsi='1405/06/21',
            status='PRESENT_10H',
            effective_hours=Decimal('10.00'),
            approval_status='PENDING_SUPERVISOR'
        )

        res = self.client.get(f'/api/personnel/attendance/monthly-summary/?warehouse_id={self.warehouse.id}&year_month=1405/06')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['pending_approvals_count'], 1)
        self.assertFalse(res.data['is_locked'])
