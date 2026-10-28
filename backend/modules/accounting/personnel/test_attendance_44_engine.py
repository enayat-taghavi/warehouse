# -*- coding: utf-8 -*-
"""طرح ۴.۴-ب۱: دورهٔ کارکرد «بخش + ماه» روی موتور ۲.۳ (د۱، د۲، د۴، د۵، د۶)."""
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from personnel.attendance_periods import get_or_create_period, is_period_locked
from personnel.models import (AttendanceAuditLog, Company, DailyAttendance, MonthlyWorkPeriod, PersonnelProfile,
                              Project, ProjectSection)
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import ATTENDANCE_PERIOD_WORKFLOW
from workflow import engine as wf_engine
from workflow.models import WorkflowInstance

User = get_user_model()
YM = '1405/07'


class AttendancePeriodEngineTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='CMP-A44', name='شرکت کارکرد ۴۴')
        self.project = Project.objects.create(company=self.company, code='PRJ-A44', name='پروژه ۴۴', is_active=True)
        self.section = ProjectSection.objects.create(project=self.project, code='SEC-A44', name='بخش ۴۴', is_active=True)
        self.other_company = Company.objects.create(code='CMP-B44', name='شرکت دیگر ۴۴')
        other_project = Project.objects.create(company=self.other_company, code='PRJ-B44', name='پروژه دیگر')
        self.other_section = ProjectSection.objects.create(project=other_project, code='SEC-B44', name='بخش دیگر')

        def user(name, role, codes, section=None):
            u = User.objects.create_user(username=name, password='p')
            grant_section_perms(u, codes, section=section or self.section, exact=False, role=role)
            return u
        self.employee = user('a44_emp', 'employee', ('view_sys_personnel_attendance',))
        self.supervisor = user('a44_sup', 'supervisor', ('perm_approve_attendance_supervisor',))
        self.accountant = user('a44_acc', 'accountant', ('perm_approve_attendance_finance',))
        self.manager = user('a44_mgr', 'manager', ('perm_approve_attendance_manager', 'perm_lock_work_period'))
        self.outsider = user('a44_out', 'supervisor', ('perm_approve_attendance_supervisor', 'perm_lock_work_period'),
                             section=self.other_section)
        self.personnel = PersonnelProfile.objects.create(
            first_name='کارگر', last_name='آزمون', national_code='4400000001', section=self.section,
            company=self.company, daily_base_wage=Decimal('1000000'), is_active=True, approval_status='approved')
        self.att = DailyAttendance.objects.create(
            personnel=self.personnel, section=self.section, project=self.project, date_shamsi=f'{YM}/03',
            status='PRESENT_10H', effective_hours=Decimal('10.00'), approval_status='PENDING_SUPERVISOR')

    def post(self, user, url, data=None):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(url, data or {}, format='json')

    def submit(self, user=None):
        return self.post(user or self.employee, '/api/personnel/periods/workflow-action/', {
            'action': 'submit', 'year_month': YM, 'section_id': self.section.id,
            'company_id': self.other_company.id,  # نادیده: شرکت از بخش
        })

    def test_full_flow_section_company_and_month_approval(self):
        res = self.submit()
        self.assertEqual(res.status_code, 200, res.data)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        self.assertEqual(period.company_id, self.company.id)
        self.assertEqual(period.status, 'SUBMITTED')
        self.assertEqual(period.submitted_by, self.employee)
        self.assertTrue(is_period_locked(period))
        url = f'/api/personnel/periods/{period.id}/approve/'
        # مدیر پیش از سرپرست و حسابدار نمی‌تواند
        self.assertIn(self.post(self.manager, url).status_code, (400, 403))
        self.assertEqual(self.post(self.supervisor, url).status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED_SUPERVISOR')
        self.assertEqual(period.supervisor_approved_by, self.supervisor)
        self.att.refresh_from_db()
        self.assertEqual(self.att.approval_status, 'APPROVED')
        self.assertTrue(AttendanceAuditLog.objects.filter(attendance=self.att, new_value='APPROVED').exists())
        self.assertEqual(self.post(self.accountant, url).status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED_ACCOUNTANT')
        self.assertEqual(self.post(self.manager, url).status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'READY_TO_PAY')
        self.assertEqual(period.manager_approved_by, self.manager)
        self.assertEqual(period.locked_by, self.manager)
        self.assertIsNotNone(period.locked_at)

    def test_revision_rows_block_supervisor_approval(self):
        self.assertEqual(self.submit().status_code, 200)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        DailyAttendance.objects.filter(pk=self.att.pk).update(approval_status='REVISION_REQUIRED')
        res = self.post(self.supervisor, f'/api/personnel/periods/{period.id}/approve/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['code'], 'action_blocked')
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED')

    def test_return_then_resubmit(self):
        self.assertEqual(self.submit().status_code, 200)
        res = self.post(self.supervisor, '/api/personnel/periods/workflow-action/', {
            'action': 'return', 'year_month': YM, 'section_id': self.section.id, 'notes': 'اصلاح کنید'})
        self.assertEqual(res.status_code, 200, res.data)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        self.assertEqual(period.status, 'REVISION_REQUIRED')
        self.assertFalse(is_period_locked(period))
        self.assertEqual(self.submit().status_code, 200)
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED')

    def test_unlock_rules(self):
        period, _ = get_or_create_period(None, self.section.id, YM)
        MonthlyWorkPeriod.objects.filter(pk=period.pk).update(status='READY_TO_PAY')
        url = f'/api/personnel/periods/{period.id}/unlock/'
        self.assertEqual(self.post(self.employee, url, {'reason': 'x'}).status_code, 403)
        self.assertEqual(self.post(self.manager, url).data['code'], 'reason_required')
        with mock.patch('personnel.attendance_periods.period_payroll_exists', return_value=True):
            self.assertEqual(self.post(self.manager, url, {'reason': 'x'}).data['code'], 'payroll_exists')
        res = self.post(self.manager, url, {'reason': 'اصلاح کارکرد'})
        self.assertEqual(res.status_code, 200, res.data)
        period.refresh_from_db()
        self.assertEqual(period.status, 'OPEN')

    def test_lock_requires_permission_and_submits(self):
        period, _ = get_or_create_period(None, self.section.id, YM)
        url = f'/api/personnel/periods/{period.id}/lock/'
        self.assertEqual(self.post(self.employee, url).status_code, 403)
        self.assertEqual(self.post(self.manager, url).status_code, 200)
        period.refresh_from_db()
        self.assertTrue(is_period_locked(period))

    def test_other_company_user_gets_404(self):
        res = self.post(self.outsider, '/api/personnel/periods/workflow-action/', {
            'action': 'submit', 'year_month': YM, 'section_id': self.section.id})
        self.assertEqual(res.status_code, 404)
        self.assertFalse(MonthlyWorkPeriod.objects.filter(section=self.section).exists())
        period, _ = get_or_create_period(None, self.section.id, YM)
        self.assertEqual(self.post(self.outsider, f'/api/personnel/periods/{period.id}/unlock/',
                                   {'reason': 'x'}).status_code, 404)

    def test_get_or_create_period_company_from_section(self):
        with self.assertRaises(ValueError):
            get_or_create_period(self.other_company.id, self.section.id, YM)
        p1, created1 = get_or_create_period(self.company.id, self.section.id, YM)
        p2, created2 = get_or_create_period(None, self.section.id, YM)
        self.assertEqual(p1.pk, p2.pk)
        self.assertTrue(created1)
        self.assertFalse(created2)

    def test_open_workflows_command_idempotent(self):
        period, _ = get_or_create_period(None, self.section.id, YM)
        MonthlyWorkPeriod.objects.filter(pk=period.pk).update(status='SUBMITTED_SUPERVISOR', submitted_by=self.employee)
        call_command('attendance_open_workflows', '--dry-run', stdout=StringIO())
        self.assertFalse(WorkflowInstance.objects.filter(workflow_key=ATTENDANCE_PERIOD_WORKFLOW).exists())
        call_command('attendance_open_workflows', stdout=StringIO())
        call_command('attendance_open_workflows', stdout=StringIO())
        self.assertEqual(WorkflowInstance.objects.filter(workflow_key=ATTENDANCE_PERIOD_WORKFLOW,
                                                         entity_id=period.pk).count(), 1)
        self.assertEqual(wf_engine.open_task(ATTENDANCE_PERIOD_WORKFLOW, period.pk).step_key, 'accountant_review')
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED_SUPERVISOR')
