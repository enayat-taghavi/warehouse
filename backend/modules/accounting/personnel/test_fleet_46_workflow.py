# -*- coding: utf-8 -*-
"""
Release v1 step 4.6-c: fleet monthly workflow scenario tests.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.attendance_periods import get_or_create_period
from personnel.models import VehicleBankAccount, VehicleDriverProfile, VehicleTripLog
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import FLEET_PERIOD_WORKFLOW, fleet_open_task, is_fleet_locked
from workflow import engine
from workflow.errors import WorkflowError
from workflow.models import WorkflowInstance

User = get_user_model()
YM = '1405/06'
DAY = '1405/06/05'
TRIPS = '/api/personnel/trips/'
TREASURY_API = '/api/personnel/cartable/treasury/'
SETTLE_API = '/api/personnel/fleet-settlement/'
VALID_SHEBA = 'IR820540102680020817909002'


class Fleet46WorkflowTests(TestCase):
    def setUp(self):
        self.company, self.project, self.section = self.make_org('F46W')
        self.other_company, self.other_project, self.other_section = self.make_org('F46WX')
        self.operator = self.make_user('op', ['view_sys_fleet_attendance'])
        self.supervisor = self.make_user('sup', ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance'],
                                         role='supervisor')
        self.accountant = self.make_user('acc', ['perm_approve_fleet_finance', 'view_sys_fleet_settlement'],
                                         role='accountant')
        self.manager = self.make_user('mgr', ['perm_approve_fleet_manager'], role='manager')
        self.treasurer = self.make_user('trs', ['perm_treasury_disburse_action'], role='treasury')
        self.rented = self.make_vehicle('11ب111-11', 'contract')
        self.company_car = self.make_vehicle('22ب222-22', 'company')
        self.no_sheba = self.make_vehicle('33ب333-33', 'personal', sheba='')

    # ── helpers ──
    def make_org(self, code):
        company = Company.objects.create(code=f'{code}-CO', name=f'شرکت {code}', is_active=True)
        project = Project.objects.create(code=f'{code}-P', name=f'پروژه {code}', company=company, is_active=True)
        section = ProjectSection.objects.create(project=project, code=f'{code}-S', name=f'بخش {code}', is_active=True)
        return company, project, section

    def make_user(self, name, codes, role='employee', section=None, company=None):
        u = User.objects.create_user(username=f'f46w_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company or self.company, is_default=True)
        grant_section_perms(u, list(codes), section=section or self.section, role=role, exact=True)
        return u

    def make_vehicle(self, plate, ownership, sheba=VALID_SHEBA, section=None, company=None):
        v = VehicleDriverProfile.objects.create(
            plate_number=plate, ownership_type=ownership, driver_name=f'راننده {plate}', driver_phone='09170000000',
            driver_national_code='0012345679', default_service_rate=1000, sheba_number=sheba,
            account_number='0105678901004', bank_name='بانک ملی ایران', section=section or self.section,
            project=(section or self.section).project, company=company or self.company,
            approval_status='approved', is_active=True, valid_until_date='1406/12/29',
            insurance_expiry_date='1406/12/29', inspection_expiry_date='1406/12/29',
            license_expiry_date='1406/12/29',
        )
        if sheba:
            VehicleBankAccount.objects.create(vehicle=v, bank_name='بانک ملی ایران', account_number='0105678901004',
                                              sheba_number=sheba, account_owner_name=v.driver_name,
                                              is_primary=True, is_active=True)
        return v

    def client_for(self, user, company=None):
        c = APIClient()
        c.force_authenticate(user)
        c.credentials(HTTP_X_COMPANY_ID=str((company or self.company).pk))
        return c

    def day_trip(self, vehicle, count=3, user=None, date=DAY):
        return self.client_for(user or self.operator).post(f'{TRIPS}update-day-trip/', {
            'vehicle_id': vehicle.pk, 'date_shamsi': date, 'trip_count': count, 'section_id': self.section.pk,
        }, format='json')

    def record_month(self):
        for v in (self.rented, self.company_car, self.no_sheba):
            r = self.day_trip(v)
            self.assertEqual(r.status_code, 200, r.data)
        return get_or_create_period(None, self.section.pk, YM)[0]

    def submit(self, user=None):
        return self.client_for(user or self.operator).post(
            f'{TRIPS}submit-fleet-period/', {'section_id': self.section.pk, 'year_month': YM}, format='json')

    def pay(self, period, code='FLT-123'):
        return self.client_for(self.treasurer).post(TREASURY_API, {
            'action': 'disburse_fleet', 'period_id': period.pk, 'tracking_code': code}, format='json')

    # ── Task A scenarios ──

    def test_status_endpoint_and_grid_follow_workflow(self):
        period = self.record_month()
        op = self.client_for(self.operator)

        # Before submit: fleet_locked is False and fleet_approved is False
        r_status_before = op.get(f'{TRIPS}fleet-period-status/', {'section_id': self.section.pk, 'year_month': YM})
        self.assertEqual(r_status_before.status_code, 200)
        self.assertFalse(r_status_before.data['fleet_locked'])
        self.assertFalse(r_status_before.data['fleet_approved'])

        # Submit fleet period
        r_submit = self.submit()
        self.assertEqual(r_submit.status_code, 200)

        # After submit: fleet_locked is True, fleet_workflow_step is 'supervisor_ok'
        r_status_after = op.get(f'{TRIPS}fleet-period-status/', {'section_id': self.section.pk, 'year_month': YM})
        self.assertEqual(r_status_after.status_code, 200)
        self.assertTrue(r_status_after.data['fleet_locked'])
        self.assertEqual(r_status_after.data['fleet_workflow_step'], 'supervisor_ok')

        # GET monthly-grid with the section: same fleet_locked, is_locked True, every days_meta[].is_editable False
        grid = op.get(f'{TRIPS}monthly-grid/', {'section_id': self.section.pk, 'year_month': YM}).data
        self.assertTrue(grid['fleet_locked'])
        self.assertTrue(grid['is_locked'])
        self.assertTrue(len(grid['days_meta']) > 0)
        self.assertTrue(all(dm['is_editable'] is False for dm in grid['days_meta']))

    def test_accountant_blocked_without_sheba(self):
        period = self.record_month()
        r_sub = self.submit()
        self.assertEqual(r_sub.status_code, 200)
        engine.act(self.supervisor, fleet_open_task(period.pk))

        task = fleet_open_task(period.pk)
        self.assertEqual(task.step_key, 'accountant_review')

        # Accountant act API returns 400 action_blocked
        r_act = self.client_for(self.accountant).post(f'/api/workflow/tasks/{task.pk}/action/', {'action': 'act'}, format='json')
        self.assertEqual(r_act.status_code, 400)
        self.assertEqual(r_act.data['code'], 'action_blocked')

        # Accountant act via engine also raises WorkflowError with 400 action_blocked
        with self.assertRaises(WorkflowError) as ctx:
            engine.act(self.accountant, fleet_open_task(period.pk))
        self.assertEqual(ctx.exception.code, 'action_blocked')
        self.assertEqual(ctx.exception.status, 400)

        # The step stays accountant_review
        self.assertEqual(fleet_open_task(period.pk).step_key, 'accountant_review')

    def test_full_chain_to_paid(self):
        period = self.record_month()
        r_sub = self.submit()
        self.assertEqual(r_sub.status_code, 200)
        engine.act(self.supervisor, fleet_open_task(period.pk))

        # Give valid sheba to the personal vehicle so accountant can approve
        self.no_sheba.sheba_number = VALID_SHEBA
        self.no_sheba.save(update_fields=['sheba_number'])

        engine.act(self.accountant, fleet_open_task(period.pk))
        engine.act(self.manager, fleet_open_task(period.pk))

        self.assertEqual(fleet_open_task(period.pk).step_key, 'treasury_pay')

        # Treasury pays with a tracking code via treasury cartable disburse_fleet with period_id
        r_pay = self.pay(period, code='FLT-FULL-123')
        self.assertEqual(r_pay.status_code, 200)
        self.assertEqual(r_pay.data['settled_trips_count'], 2)

        # Every rented trip of the period has is_settled true
        rented_trips = VehicleTripLog.objects.filter(period=period, vehicle__ownership_type__in=['contract', 'personal'])
        self.assertEqual(rented_trips.count(), 2)
        self.assertTrue(all(t.is_settled for t in rented_trips))
        self.assertTrue(all(t.payment_tracking_code == 'FLT-FULL-123' for t in rented_trips))

        # Company-owned vehicle trips are not paid
        company_trips = VehicleTripLog.objects.filter(period=period, vehicle__ownership_type='company')
        self.assertTrue(company_trips.exists())
        self.assertTrue(all(not t.is_settled for t in company_trips))

    def test_treasury_list_only_after_manager(self):
        period = self.record_month()
        self.submit()
        engine.act(self.supervisor, fleet_open_task(period.pk))

        self.no_sheba.sheba_number = VALID_SHEBA
        self.no_sheba.save(update_fields=['sheba_number'])
        engine.act(self.accountant, fleet_open_task(period.pk))

        # Before manager approves: treasury GET has no entry with that period id in fleet_periods
        trs = self.client_for(self.treasurer)
        data_before = trs.get(TREASURY_API).data
        self.assertNotIn(period.pk, [p['id'] for p in data_before.get('fleet_periods', [])])

        # Manager approves
        engine.act(self.manager, fleet_open_task(period.pk))

        # After manager approves: treasury GET includes that period with right trips_count and total_payable
        data_after = trs.get(TREASURY_API).data
        matching = [p for p in data_after.get('fleet_periods', []) if p['id'] == period.pk]
        self.assertEqual(len(matching), 1)
        period_entry = matching[0]
        self.assertEqual(period_entry['trips_count'], 2)
        self.assertEqual(period_entry['total_payable'], 6000)

    def test_second_pay_is_rejected(self):
        period = self.record_month()
        self.submit()
        engine.act(self.supervisor, fleet_open_task(period.pk))
        self.no_sheba.sheba_number = VALID_SHEBA
        self.no_sheba.save(update_fields=['sheba_number'])
        engine.act(self.accountant, fleet_open_task(period.pk))
        engine.act(self.manager, fleet_open_task(period.pk))

        # First pay succeeds
        r1 = self.pay(period, code='FLT-PAY-1')
        self.assertEqual(r1.status_code, 200)
        settled_count_before = VehicleTripLog.objects.filter(period=period, is_settled=True).count()
        self.assertEqual(settled_count_before, 2)

        # Second pay: 4xx rejected
        r2 = self.pay(period, code='FLT-PAY-2')
        self.assertEqual(r2.status_code, 400)
        self.assertEqual(r2.data['code'], 'not_ready_to_pay')

        # Settled count unchanged (no trip settled twice)
        settled_count_after = VehicleTripLog.objects.filter(period=period, is_settled=True).count()
        self.assertEqual(settled_count_after, settled_count_before)

    def test_manager_return_unlocks(self):
        period = self.record_month()
        self.submit()
        engine.act(self.supervisor, fleet_open_task(period.pk))
        self.no_sheba.sheba_number = VALID_SHEBA
        self.no_sheba.save(update_fields=['sheba_number'])
        engine.act(self.accountant, fleet_open_task(period.pk))

        task = fleet_open_task(period.pk)
        self.assertEqual(task.step_key, 'manager_ok')

        # Manager returns the period with a reason
        engine.return_for_fix(self.manager, task, 'اصلاح اطلاعات تردد راننده')

        # fleet_locked is false
        self.assertFalse(is_fleet_locked(period))
        status_data = self.client_for(self.operator).get(f'{TRIPS}fleet-period-status/', {
            'section_id': self.section.pk, 'year_month': YM
        }).data
        self.assertFalse(status_data['fleet_locked'])

        # A trip write in the period succeeds again
        r_write = self.day_trip(self.rented, count=5)
        self.assertEqual(r_write.status_code, 200)

        # Resubmitting starts at supervisor_ok
        r_resub = self.submit()
        self.assertEqual(r_resub.status_code, 200)
        self.assertEqual(r_resub.data['fleet_workflow_step'], 'supervisor_ok')
        self.assertEqual(fleet_open_task(period.pk).step_key, 'supervisor_ok')
        self.assertTrue(is_fleet_locked(period))
