# -*- coding: utf-8 -*-
"""آزمون‌های سناریوی یکپارچهٔ API دورهٔ کارکرد و گردش کار موتور ۲.۳ (طرح ۴.۴-ب)."""
import io
from decimal import Decimal

import jdatetime
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from personnel.attendance_periods import get_or_create_period, is_period_locked
from personnel.models import (
    AttendanceAuditLog,
    Company,
    DailyAttendance,
    MonthlyWorkPeriod,
    PersonnelProfile,
    Project,
    ProjectSection,
)
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import ATTENDANCE_PERIOD_WORKFLOW
from workflow.models import WorkflowInstance, WorkflowTask

User = get_user_model()
TODAY = jdatetime.date.today().strftime('%Y/%m/%d')
YM = TODAY[:7]
DAY = int(TODAY[8:10])
LOCKED = 'attendance_period_locked'


class Attendance44ScenarioTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='CMP-A44S', name='شرکت سناریو ۴۴')
        self.project = Project.objects.create(company=self.company, code='PRJ-A44S', name='پروژه سناریو ۴۴', is_active=True)
        self.section = ProjectSection.objects.create(project=self.project, code='SEC-A44S', name='بخش سناریو ۴۴', is_active=True)
        self.other_company = Company.objects.create(code='CMP-B44S', name='شرکت دیگر سناریو ۴۴')
        other_project = Project.objects.create(company=self.other_company, code='PRJ-B44S', name='پروژه دیگر')
        self.other_section = ProjectSection.objects.create(project=other_project, code='SEC-B44S', name='بخش دیگر')

        def user(name, role, codes, section=None):
            u = User.objects.create_user(username=name, password='p')
            grant_section_perms(u, codes, section=section or self.section, exact=False, role=role)
            return u

        self.employee = user('a44s_emp', 'employee', ('view_sys_personnel_attendance',))
        self.supervisor = user('a44s_sup', 'supervisor', ('perm_approve_attendance_supervisor',))
        self.accountant = user('a44s_acc', 'accountant', ('perm_approve_attendance_finance',))
        self.manager = user('a44s_mgr', 'manager', ('perm_approve_attendance_manager', 'perm_lock_work_period'))
        self.outsider = user('a44s_out', 'supervisor', ('perm_approve_attendance_supervisor', 'perm_lock_work_period'),
                             section=self.other_section)
        self.admin = User.objects.create_superuser(username='a44s_admin', password='p', email='admin@a44s.ir')

        self.personnel = PersonnelProfile.objects.create(
            first_name='کارگر یک', last_name='آزمون', national_code='4420000001', section=self.section,
            company=self.company, daily_base_wage=Decimal('1000000'), is_active=True, approval_status='approved')
        self.personnel2 = PersonnelProfile.objects.create(
            first_name='کارگر دو', last_name='آزمون', national_code='4420000002', section=self.section,
            company=self.company, daily_base_wage=Decimal('1000000'), is_active=True, approval_status='approved')
        self.personnel3 = PersonnelProfile.objects.create(
            first_name='کارگر سه', last_name='آزمون', national_code='4420000003', section=self.section,
            company=self.company, daily_base_wage=Decimal('1000000'), is_active=True, approval_status='approved')

        self.att = DailyAttendance.objects.create(
            personnel=self.personnel, section=self.section, project=self.project, date_shamsi=TODAY,
            status='PRESENT_10H', effective_hours=Decimal('10.00'), approval_status='PENDING_SUPERVISOR')
        self.att2 = DailyAttendance.objects.create(
            personnel=self.personnel2, section=self.section, project=self.project, date_shamsi=TODAY,
            status='PRESENT_10H', effective_hours=Decimal('10.00'), approval_status='PENDING_SUPERVISOR')

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def post(self, user, url, data=None):
        return self.client_for(user).post(url, data or {}, format='json')

    def submit(self, user=None, ym=YM):
        return self.post(user or self.employee, '/api/personnel/periods/workflow-action/', {
            'action': 'submit', 'year_month': ym, 'section_id': self.section.id,
        })

    def bulk_save(self, user, items=None, date_shamsi=None, **extra):
        payload = {
            'date_shamsi': date_shamsi or TODAY,
            'section_id': self.section.id,
            'items': items or [{'personnel_id': self.personnel.id, 'status': 'HALF_5H', 'effective_hours': 5}],
        }
        payload.update(extra)
        return self.client_for(user).post('/api/personnel/attendance/bulk-save/', payload, format='json')

    def _advance_to_ready_to_pay(self, ym=YM):
        self.submit(ym=ym)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=ym)
        url = f'/api/personnel/periods/{period.id}/approve/'
        self.post(self.supervisor, url)
        self.post(self.accountant, url)
        self.post(self.manager, url)
        period.refresh_from_db()
        return period

    def test_full_flow_to_ready_to_pay(self):
        # Two PENDING_SUPERVISOR attendance rows in the section period
        self.assertEqual(self.att.approval_status, 'PENDING_SUPERVISOR')
        self.assertEqual(self.att2.approval_status, 'PENDING_SUPERVISOR')

        # The registrar submits the period -> status SUBMITTED
        res_sub = self.submit(self.employee)
        self.assertEqual(res_sub.status_code, 200, res_sub.data)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        self.assertEqual(period.status, 'SUBMITTED')

        # The manager acts before the accountant -> 400 with code wrong_step
        res_mgr_early = self.client_for(self.manager).post('/api/personnel/cartable/manager/', {
            'action': 'approve', 'model': 'period', 'id': period.id,
        })
        self.assertEqual(res_mgr_early.status_code, 400, res_mgr_early.data)
        self.assertEqual(res_mgr_early.data.get('code'), 'wrong_step')

        # Supervisor approves -> SUBMITTED_SUPERVISOR and both attendance rows are APPROVED with AttendanceAuditLog rows
        url = f'/api/personnel/periods/{period.id}/approve/'
        res_sup = self.post(self.supervisor, url)
        self.assertEqual(res_sup.status_code, 200, res_sup.data)
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED_SUPERVISOR')

        self.att.refresh_from_db()
        self.att2.refresh_from_db()
        self.assertEqual(self.att.approval_status, 'APPROVED')
        self.assertEqual(self.att2.approval_status, 'APPROVED')
        self.assertTrue(AttendanceAuditLog.objects.filter(attendance=self.att, new_value='APPROVED').exists())
        self.assertTrue(AttendanceAuditLog.objects.filter(attendance=self.att2, new_value='APPROVED').exists())

        # The manager acts before the accountant (again, at accountant review step) -> 400 with code wrong_step
        res_mgr_before_acc = self.client_for(self.manager).post('/api/personnel/cartable/manager/', {
            'action': 'approve', 'model': 'period', 'id': period.id,
        })
        self.assertEqual(res_mgr_before_acc.status_code, 400, res_mgr_before_acc.data)
        self.assertEqual(res_mgr_before_acc.data.get('code'), 'wrong_step')

        # Accountant acts -> SUBMITTED_ACCOUNTANT
        res_acc = self.post(self.accountant, url)
        self.assertEqual(res_acc.status_code, 200, res_acc.data)
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED_ACCOUNTANT')

        # Manager acts -> READY_TO_PAY with locked_at set
        res_mgr = self.post(self.manager, url)
        self.assertEqual(res_mgr.status_code, 200, res_mgr.data)
        period.refresh_from_db()
        self.assertEqual(period.status, 'READY_TO_PAY')
        self.assertIsNotNone(period.locked_at)

        # A WorkflowInstance with entity_kind='attendance_period' for that period is completed
        inst = WorkflowInstance.objects.get(entity_kind='attendance_period', entity_id=period.id)
        self.assertEqual(inst.status, WorkflowInstance.COMPLETED)

    def test_revision_row_blocks_supervisor(self):
        # One attendance row set to REVISION_REQUIRED
        DailyAttendance.objects.filter(pk=self.att.pk).update(approval_status='REVISION_REQUIRED')

        # If submit itself is refused, assert that refusal
        res_submit = self.submit()
        self.assertEqual(res_submit.status_code, 400)
        self.assertEqual(res_submit.data.get('code'), 'action_blocked')

        # Reset to PENDING_SUPERVISOR so submit succeeds
        DailyAttendance.objects.filter(pk=self.att.pk).update(approval_status='PENDING_SUPERVISOR')
        self.assertEqual(self.submit().status_code, 200)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        self.assertEqual(period.status, 'SUBMITTED')

        # Now set one row to REVISION_REQUIRED after submit
        DailyAttendance.objects.filter(pk=self.att.pk).update(approval_status='REVISION_REQUIRED')

        # The supervisor approval returns 400 with code action_blocked
        res_sup = self.post(self.supervisor, f'/api/personnel/periods/{period.id}/approve/')
        self.assertEqual(res_sup.status_code, 400)
        self.assertEqual(res_sup.data.get('code'), 'action_blocked')

        # The period status does not advance
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED')

    def test_return_for_fix_reopens_editing(self):
        # Submitted period
        self.assertEqual(self.submit().status_code, 200)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        self.assertEqual(period.status, 'SUBMITTED')

        # Returning without a reason -> 400
        res_no_reason = self.post(self.supervisor, '/api/personnel/periods/workflow-action/', {
            'action': 'return', 'year_month': YM, 'section_id': self.section.id, 'notes': '',
        })
        self.assertEqual(res_no_reason.status_code, 400)

        # The supervisor returns it with a reason -> period REVISION_REQUIRED
        res_return = self.post(self.supervisor, '/api/personnel/periods/workflow-action/', {
            'action': 'return', 'year_month': YM, 'section_id': self.section.id, 'notes': 'لطفا ساعت‌ها اصلاح گردد',
        })
        self.assertEqual(res_return.status_code, 200, res_return.data)
        period.refresh_from_db()
        self.assertEqual(period.status, 'REVISION_REQUIRED')
        self.assertFalse(is_period_locked(period))

        # A daily bulk-save on that month now succeeds (200)
        res_bulk = self.bulk_save(self.employee)
        self.assertEqual(res_bulk.status_code, 200, res_bulk.content)

    def test_no_self_approval(self):
        # A user holding both the attendance and the supervisor permission
        dual_user = User.objects.create_user(username='a44s_dual', password='p')
        grant_section_perms(
            dual_user,
            ('view_sys_personnel_attendance', 'perm_approve_attendance_supervisor'),
            section=self.section,
            exact=False,
            role='employee',
        )

        # Submits the period
        res_sub = self.submit(user=dual_user)
        self.assertEqual(res_sub.status_code, 200, res_sub.data)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        self.assertEqual(period.status, 'SUBMITTED')

        # Then tries to approve it as supervisor -> 400 or 403, never 200
        res_app = self.post(dual_user, f'/api/personnel/periods/{period.id}/approve/')
        self.assertIn(res_app.status_code, (400, 403))
        self.assertNotEqual(res_app.status_code, 200)

        # Also via workflow-action
        res_action = self.post(dual_user, '/api/personnel/periods/workflow-action/', {
            'action': 'approve', 'year_month': YM, 'section_id': self.section.id,
        })
        self.assertIn(res_action.status_code, (400, 403))
        self.assertNotEqual(res_action.status_code, 200)

    def test_unlock_ready_to_pay(self):
        # Take a period to READY_TO_PAY (reuse helper code from test a)
        period = self._advance_to_ready_to_pay()
        self.assertEqual(period.status, 'READY_TO_PAY')
        url = f'/api/personnel/periods/{period.id}/unlock/'

        # Unlock without a reason -> 400
        res_no_reason = self.post(self.manager, url, {'reason': ''})
        self.assertEqual(res_no_reason.status_code, 400)
        self.assertEqual(res_no_reason.data.get('code'), 'reason_required')

        # Unlock by a user without perm_lock_work_period -> 403 or 404
        res_no_perm = self.post(self.employee, url, {'reason': 'اصلاح کارکرد'})
        self.assertIn(res_no_perm.status_code, (403, 404))

        # Unlock with a reason by a holder of perm_lock_work_period in the section -> period OPEN
        res_unlock = self.post(self.manager, url, {'reason': 'اصلاح کارکرد ماهانه'})
        self.assertEqual(res_unlock.status_code, 200, res_unlock.data)
        period.refresh_from_db()
        self.assertEqual(period.status, 'OPEN')

        # A monthly grid save on that month then succeeds
        grid = self.client_for(self.employee).post('/api/personnel/attendance/bulk-save-monthly-grid/', {
            'year_month': YM, 'section_id': self.section.id,
            'items': [{'personnel_id': self.personnel.id, 'day': DAY, 'status': 'HALF_5H', 'effective_hours': 5}],
        }, format='json')
        self.assertEqual(grid.status_code, 200, grid.content)

    def test_lock_on_write_paths_and_override(self):
        # Submitted period
        self.assertEqual(self.submit().status_code, 200)
        period = MonthlyWorkPeriod.objects.get(section=self.section, year_month=YM)
        self.assertEqual(period.status, 'SUBMITTED')

        c = self.client_for(self.employee)

        # Monthly grid save of a changed cell -> 400 attendance_period_locked
        res_changed = c.post('/api/personnel/attendance/bulk-save-monthly-grid/', {
            'year_month': YM, 'section_id': self.section.id,
            'items': [{'personnel_id': self.personnel.id, 'day': DAY, 'status': 'HALF_5H', 'effective_hours': 5}],
        }, format='json')
        self.assertEqual(res_changed.status_code, 400)
        self.assertEqual(res_changed.json().get('code'), LOCKED)

        # The same grid save sending only an unchanged existing cell -> 200
        res_unchanged = c.post('/api/personnel/attendance/bulk-save-monthly-grid/', {
            'year_month': YM, 'section_id': self.section.id,
            'items': [{'personnel_id': self.personnel.id, 'day': DAY, 'status': 'PRESENT_10H', 'effective_hours': 10, 'overtime_hours': 0}],
        }, format='json')
        self.assertEqual(res_unchanged.status_code, 200, res_unchanged.content)

        # Clear-day -> 400 attendance_period_locked
        res_clear = c.post('/api/personnel/attendance/clear-day/', {
            'date_shamsi': TODAY, 'section_id': self.section.id,
        }, format='json')
        self.assertEqual(res_clear.status_code, 400)
        self.assertEqual(res_clear.json().get('code'), LOCKED)

        # Single PATCH /api/personnel/attendance/<id>/ -> 400 attendance_period_locked
        res_patch = c.patch(f'/api/personnel/attendance/{self.att.id}/', {'effective_hours': '5.00'}, format='json')
        self.assertEqual(res_patch.status_code, 400)
        self.assertEqual(res_patch.json().get('code'), LOCKED)

        # A superuser bulk-save with is_override true and no override_reason -> 400
        res_override_no_reason = self.bulk_save(self.admin, is_override=True)
        self.assertEqual(res_override_no_reason.status_code, 400)
        self.assertEqual(res_override_no_reason.json().get('code'), 'override_reason_required')

        # With override_reason -> 200 and an AttendanceAuditLog row containing the reason
        reason_text = 'اصلاح ناگزیر پس از ارسال'
        res_override_ok = self.bulk_save(self.admin, is_override=True, override_reason=reason_text)
        self.assertEqual(res_override_ok.status_code, 200, res_override_ok.content)
        self.assertTrue(AttendanceAuditLog.objects.filter(
            attendance=self.att, field_name='period_lock_override', reason=reason_text,
        ).exists())

    def test_open_workflows_command_idempotent(self):
        # Dry-run on a fresh period creates nothing
        period_dry, _ = get_or_create_period(None, self.section.id, '1405/11')
        MonthlyWorkPeriod.objects.filter(pk=period_dry.pk).update(status='SUBMITTED_SUPERVISOR', submitted_by=self.employee)
        call_command('attendance_open_workflows', '--dry-run', stdout=io.StringIO())
        self.assertFalse(WorkflowInstance.objects.filter(
            workflow_key=ATTENDANCE_PERIOD_WORKFLOW, entity_id=period_dry.pk,
        ).exists())

        # Create a sectioned period directly with status SUBMITTED_SUPERVISOR (no engine instance)
        period, _ = get_or_create_period(None, self.section.id, '1405/12')
        MonthlyWorkPeriod.objects.filter(pk=period.pk).update(status='SUBMITTED_SUPERVISOR', submitted_by=self.employee)

        # call_command('attendance_open_workflows') (capture stdout with io.StringIO)
        call_command('attendance_open_workflows', stdout=io.StringIO())

        # -> one open WorkflowTask at step accountant_review and the period status unchanged
        open_task = WorkflowTask.objects.filter(
            instance__entity_kind='attendance_period', instance__entity_id=period.pk, is_open=True,
        ).first()
        self.assertIsNotNone(open_task)
        self.assertEqual(open_task.step_key, 'accountant_review')
        period.refresh_from_db()
        self.assertEqual(period.status, 'SUBMITTED_SUPERVISOR')

        # Run it again -> still exactly one WorkflowInstance
        call_command('attendance_open_workflows', stdout=io.StringIO())
        self.assertEqual(WorkflowInstance.objects.filter(
            workflow_key=ATTENDANCE_PERIOD_WORKFLOW, entity_id=period.pk,
        ).count(), 1)

    def test_scope_and_offline_compat(self):
        period, _ = get_or_create_period(None, self.section.id, YM)
        out = self.client_for(self.outsider)

        # A user of another company gets 404 on the period detail and on GET /api/personnel/attendance/<id>/
        self.assertEqual(out.get(f'/api/personnel/periods/{period.id}/').status_code, 404)
        self.assertEqual(out.get(f'/api/personnel/attendance/{self.att.id}/').status_code, 404)

        # POST /api/personnel/periods/ with the other company's section_id -> 404 and no period is created
        res_sec_other = self.client_for(self.employee).post('/api/personnel/periods/', {
            'year_month': '1405/11', 'section_id': self.other_section.id,
        }, format='json')
        self.assertEqual(res_sec_other.status_code, 404)
        self.assertFalse(MonthlyWorkPeriod.objects.filter(section=self.other_section, year_month='1405/11').exists())

        # An old-style single POST /api/personnel/attendance/ without section (offline queue shape: personnel, date_shamsi, status, effective_hours) -> 201
        res_single = self.client_for(self.employee).post('/api/personnel/attendance/', {
            'personnel': self.personnel3.id,
            'date_shamsi': TODAY,
            'status': 'PRESENT_10H',
            'effective_hours': 10,
        }, format='json')
        self.assertEqual(res_single.status_code, 201, res_single.content)

        # Posting the same personnel, day and section twice leaves exactly one active (is_deleted=False) row
        p_dup = {
            'personnel': self.personnel3.id,
            'date_shamsi': TODAY,
            'section': self.section.id,
            'status': 'PRESENT_10H',
            'effective_hours': 10,
        }
        res_dup1 = self.client_for(self.employee).post('/api/personnel/attendance/', p_dup, format='json')
        self.assertEqual(res_dup1.status_code, 201, res_dup1.content)
        p_dup_update = dict(p_dup, status='HALF_5H', effective_hours=5)
        res_dup2 = self.client_for(self.employee).post('/api/personnel/attendance/', p_dup_update, format='json')
        self.assertIn(res_dup2.status_code, (200, 201))
        active_day = DailyAttendance.objects.filter(
            personnel=self.personnel3, date_shamsi=TODAY, section=self.section, is_deleted=False,
        )
        self.assertEqual(active_day.count(), 1)
        self.assertEqual(active_day.first().status, 'HALF_5H')

        # AGENTS §6: a row saved with status LEAVE has effective_hours == 0 and overtime_hours == 0 after a bulk-save
        res_leave = self.bulk_save(self.employee, items=[{
            'personnel_id': self.personnel3.id,
            'status': 'LEAVE',
            'effective_hours': 8,
            'overtime_hours': 3,
        }], date_shamsi=TODAY)
        self.assertEqual(res_leave.status_code, 200, res_leave.content)
        leave_row = DailyAttendance.objects.get(
            personnel=self.personnel3, date_shamsi=TODAY, section=self.section, is_deleted=False,
        )
        self.assertEqual(leave_row.status, 'LEAVE')
        self.assertEqual(float(leave_row.effective_hours), 0.0)
        self.assertEqual(float(leave_row.overtime_hours), 0.0)
