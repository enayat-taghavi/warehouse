# -*- coding: utf-8 -*-
"""طرح ۴.۴-ب۲: دامنهٔ کارکرد (ق۶)، قفل یکسان دوره (د۴)، دورهٔ مالی، کارتابل ردیفی (د۳)، سرعت (د۸)."""
import io
from decimal import Decimal

import jdatetime
import openpyxl
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from personnel.attendance_periods import get_or_create_period
from personnel.models import (AttendanceAuditLog, Company, CompanyFiscalPeriod, DailyAttendance, PersonnelProfile,
                              Project, ProjectSection)
from personnel.scoped_test_support import grant_section_perms

User = get_user_model()
TODAY = jdatetime.date.today().strftime('%Y/%m/%d')
YM = TODAY[:7]
LOCKED = 'attendance_period_locked'


class AttendanceScopeLockTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='CMP-S44', name='شرکت دامنه ۴۴')
        self.project = Project.objects.create(company=self.company, code='PRJ-S44', name='پروژه', is_active=True)
        self.section = ProjectSection.objects.create(project=self.project, code='SEC-S44', name='بخش', is_active=True)
        self.section2 = ProjectSection.objects.create(project=self.project, code='SEC-S44B', name='بخش دو', is_active=True)
        self.other_company = Company.objects.create(code='CMP-O44', name='شرکت دیگر')
        other_project = Project.objects.create(company=self.other_company, code='PRJ-O44', name='پروژه دیگر')
        self.other_section = ProjectSection.objects.create(project=other_project, code='SEC-O44', name='بخش دیگر')

        def user(name, role, codes, section):
            u = User.objects.create_user(username=name, password='p')
            grant_section_perms(u, codes, section=section, exact=False, role=role)
            return u
        self.employee = user('s44_emp', 'employee', ('view_sys_personnel_attendance',), self.section)
        self.supervisor = user('s44_sup', 'supervisor', ('perm_approve_attendance_supervisor',), self.section)
        self.sup2 = user('s44_sup2', 'supervisor', ('perm_approve_attendance_supervisor',), self.section2)
        self.outsider = user('s44_out', 'employee', ('view_sys_personnel_attendance',), self.other_section)
        self.admin = User.objects.create_superuser(username='s44_admin', password='p', email='a@x.ir')
        self.personnel = self._personnel('4410000001', self.section, self.company)
        self.other_personnel = self._personnel('4410000002', self.other_section, self.other_company)
        self.att = DailyAttendance.objects.create(
            personnel=self.personnel, section=self.section, project=self.project, date_shamsi=TODAY,
            status='PRESENT_10H', effective_hours=Decimal('10.00'), approval_status='PENDING_SUPERVISOR')

    def _personnel(self, code, section, company):
        return PersonnelProfile.objects.create(
            first_name='کارگر', last_name=code, national_code=code, section=section, company=company,
            daily_base_wage=Decimal('1000000'), is_active=True, approval_status='approved')

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def lock_period(self, status='SUBMITTED'):
        period, _ = get_or_create_period(None, self.section.id, YM)
        period.status = status
        period.save(update_fields=['status'])
        return period

    def bulk_save(self, user, **extra):
        payload = {'date_shamsi': TODAY, 'section_id': self.section.id, 'items': [
            {'personnel_id': self.personnel.id, 'status': 'HALF_5H', 'effective_hours': 5}]}
        payload.update(extra)
        return self.client_for(user).post('/api/personnel/attendance/bulk-save/', payload, format='json')

    # ─── ق۶: دامنه ───
    def test_other_company_cannot_list_or_retrieve(self):
        out = self.client_for(self.outsider)
        self.assertEqual(out.get(f'/api/personnel/attendance/{self.att.id}/').status_code, 404)
        ids = [r['id'] for r in out.get('/api/personnel/attendance/').json()]
        self.assertNotIn(self.att.id, ids)
        mine = self.client_for(self.employee).get('/api/personnel/attendance/').json()
        self.assertIn(self.att.id, [r['id'] for r in mine])

    def test_forged_company_id_rejected(self):
        res = self.client_for(self.employee).get(f'/api/personnel/attendance/?company_id={self.other_company.id}')
        self.assertIn(res.status_code, (403, 404))

    def test_page_param_paginates_only_when_present(self):
        c = self.client_for(self.employee)
        self.assertIsInstance(c.get('/api/personnel/attendance/').json(), list)
        paged = c.get('/api/personnel/attendance/?page=1').json()
        self.assertIn('results', paged)
        self.assertEqual(paged['count'], 1)

    def test_monthly_grid_and_summary_scoped(self):
        out = self.client_for(self.outsider)
        url = f'/api/personnel/attendance/monthly-grid/?section_id={self.section.id}&year_month={YM}'
        self.assertEqual(out.get(url).status_code, 404)
        res = out.get(f'/api/personnel/attendance/monthly-grid/?year_month={YM}')
        self.assertEqual(res.status_code, 200)
        self.assertNotIn(self.personnel.id, [r['personnel_id'] for r in res.json()['rows']])
        summary = out.get(f'/api/personnel/attendance/monthly-summary/?year_month={YM}').json()
        self.assertNotIn(self.personnel.id, [r['personnel_id'] for r in summary['summary']])
        mine = self.client_for(self.employee).get(url)
        self.assertEqual(mine.status_code, 200)
        self.assertIn(self.personnel.id, [r['personnel_id'] for r in mine.json()['rows']])

    def test_period_create_ignores_body_company_and_scopes(self):
        out = self.client_for(self.outsider).post('/api/personnel/periods/', {
            'year_month': YM, 'section_id': self.section.id}, format='json')
        self.assertEqual(out.status_code, 404)
        res = self.client_for(self.employee).post('/api/personnel/periods/', {
            'year_month': YM, 'section_id': self.section.id, 'company_id': self.other_company.id}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        period_id = res.json()['id']
        self.assertEqual(self.client_for(self.outsider).get(f'/api/personnel/periods/{period_id}/').status_code, 404)
        self.assertEqual(self.client_for(self.employee).get(f'/api/personnel/periods/{period_id}/').status_code, 200)

    def test_write_for_other_company_personnel_refused(self):
        res = self.client_for(self.employee).post('/api/personnel/attendance/bulk-save/', {
            'date_shamsi': TODAY, 'items': [{'personnel_id': self.other_personnel.id, 'status': 'PRESENT_10H',
                                             'effective_hours': 10}]}, format='json')
        self.assertIn(res.status_code, (400, 404))
        self.assertFalse(DailyAttendance.objects.filter(personnel=self.other_personnel).exists())

    # ─── د۴: قفل یکسان روی شش مسیر نوشتن ───
    def test_lock_blocks_all_write_paths(self):
        self.lock_period('SUBMITTED_ACCOUNTANT')
        c = self.client_for(self.employee)
        self.assertEqual(self.bulk_save(self.employee).json().get('code'), LOCKED)
        grid = c.post('/api/personnel/attendance/bulk-save-monthly-grid/', {
            'year_month': YM, 'section_id': self.section.id,
            'items': [{'personnel_id': self.personnel.id, 'day': int(TODAY[8:10]), 'status': 'HALF_5H',
                       'effective_hours': 5}]}, format='json')
        self.assertEqual((grid.status_code, grid.json().get('code')), (400, LOCKED))
        patch = c.patch(f'/api/personnel/attendance/{self.att.id}/', {'effective_hours': '5.00'}, format='json')
        self.assertEqual((patch.status_code, patch.json().get('code')), (400, LOCKED))
        delete = c.delete(f'/api/personnel/attendance/{self.att.id}/')
        self.assertEqual((delete.status_code, delete.json().get('code')), (400, LOCKED))
        clear = c.post('/api/personnel/attendance/clear-day/', {
            'date_shamsi': TODAY, 'section_id': self.section.id}, format='json')
        self.assertEqual((clear.status_code, clear.json().get('code')), (400, LOCKED))
        wb = openpyxl.Workbook()
        ws = wb.active
        day_key = f'day_{TODAY[8:10]}'
        ws.append(['national', 'day'])
        ws.append(['national_code', day_key])
        ws.append([self.personnel.national_code, 5])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = 'grid.xlsx'
        imp = c.post('/api/personnel/attendance/import-monthly-excel/', {
            'file': buf, 'year_month': YM, 'section_id': self.section.id}, format='multipart')
        self.assertEqual((imp.status_code, imp.json().get('code')), (400, LOCKED))
        self.att.refresh_from_db()
        self.assertEqual((self.att.status, self.att.is_deleted), ('PRESENT_10H', False))
        grid_read = c.get(f'/api/personnel/attendance/monthly-grid/?section_id={self.section.id}&year_month={YM}')
        self.assertTrue(grid_read.json()['is_locked'])

    def test_override_needs_permission_and_reason(self):
        self.lock_period('READY_TO_PAY')
        res = self.bulk_save(self.employee, is_override=True, override_reason='x')
        self.assertEqual(res.json().get('code'), LOCKED)
        res = self.bulk_save(self.admin, is_override=True)
        self.assertEqual((res.status_code, res.json().get('code')), (400, 'override_reason_required'))
        res = self.bulk_save(self.admin, is_override=True, override_reason='اصلاح پس از بستن')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(AttendanceAuditLog.objects.filter(
            attendance=self.att, field_name='period_lock_override', reason='اصلاح پس از بستن').exists())

    def test_open_period_write_ok_and_old_queue_payload_accepted(self):
        res = self.bulk_save(self.employee)
        self.assertEqual(res.status_code, 200, res.content)
        self.att.refresh_from_db()
        self.assertEqual(self.att.status, 'HALF_5H')
        self.assertIsNotNone(self.att.period_id)

    def test_fiscal_closed_refuses_write(self):
        CompanyFiscalPeriod.objects.create(company=self.company, fiscal_year=YM[:4], title='بسته',
                                           start_date=f'{YM[:4]}/01/01', end_date=f'{YM[:4]}/12/29', status='closed')
        res = self.bulk_save(self.employee)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get('code'), 'fiscal_period_closed')

    # ─── د۳: کارتابل ردیفی سرپرست ───
    def row_action(self, user, action, reason=''):
        return self.client_for(user).post('/api/personnel/cartable/supervisor/', {
            'action': action, 'model': 'attendance', 'id': self.att.id, 'reason': reason}, format='json')

    def test_supervisor_row_actions_scope_and_lock(self):
        self.assertEqual(self.row_action(self.sup2, 'approve').status_code, 403)
        self.assertEqual(self.row_action(self.outsider, 'approve').status_code, 404)
        self.assertEqual(self.row_action(self.supervisor, 'revision').status_code, 400)  # بی دلیل
        res = self.row_action(self.supervisor, 'reject', reason='ساعت اشتباه')
        self.assertEqual(res.status_code, 200, res.content)
        self.att.refresh_from_db()
        self.assertEqual((self.att.approval_status, self.att.revision_reason), ('REVISION_REQUIRED', 'ساعت اشتباه'))
        self.lock_period()
        res = self.row_action(self.supervisor, 'approve')
        self.assertEqual((res.status_code, res.json().get('code')), (400, LOCKED))


class AttendanceConstantQueriesTests(TestCase):
    """د۸: تعداد پرس‌وجوی جدول ماهانه، گزارش و اکسل مستقل از تعداد پرسنل."""

    def setUp(self):
        self.company = Company.objects.create(code='CMP-Q44', name='شرکت سرعت')
        project = Project.objects.create(company=self.company, code='PRJ-Q44', name='پروژه', is_active=True)
        self.section = ProjectSection.objects.create(project=project, code='SEC-Q44', name='بخش', is_active=True)
        self.admin = User.objects.create_superuser(username='q44_admin', password='p', email='q@x.ir')
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.count = 0

    def add_personnel(self, n):
        people = PersonnelProfile.objects.bulk_create([PersonnelProfile(
            first_name='پ', last_name=f'{self.count + i:05d}', national_code=f'45{self.count + i:08d}',
            section=self.section, company=self.company, daily_base_wage=Decimal('1000000'), is_active=True,
            approval_status='approved') for i in range(n)])
        self.count += n
        people = PersonnelProfile.objects.filter(national_code__in=[p.national_code for p in people])
        DailyAttendance.objects.bulk_create([DailyAttendance(
            personnel=p, section=self.section, date_shamsi=f'{YM}/{d:02d}', status='PRESENT_10H',
            effective_hours=Decimal('10.00')) for p in people for d in (1, 2, 3)])

    def queries(self, url):
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        return len(ctx.captured_queries)

    def test_grid_summary_export_constant(self):
        base = f'year_month={YM}&section_id={self.section.id}'
        urls = [f'/api/personnel/attendance/monthly-grid/?{base}',
                f'/api/personnel/attendance/monthly-summary/?{base}',
                f'/api/personnel/attendance/export-monthly-excel/?{base}']
        self.add_personnel(10)
        small = [self.queries(u) for u in urls]
        self.add_personnel(290)
        large = [self.queries(u) for u in urls]
        self.assertEqual(small, large)
        for n in large:
            self.assertLess(n, 25)
