"""
Step 4.6-b1: vehicle profile and vehicle change request on workflow engine 2.3 (plan 4.6, D1-D4, D8).
Full flow, step enforcement, accountant gate, section scope, return/resubmit, change request apply,
fleet_open_workflows idempotency, sensitive-data masking and starred writes.
"""
import io

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess
from personnel.fleet_lifecycle_services import ROAD_VEHICLE_TYPES, get_vehicle_missing_fields
from personnel.models import (
    Project,
    ProjectSection,
    SectionAssignment,
    VehicleBankAccount,
    VehicleChangeRequest,
    VehicleDriverProfile,
)
from personnel.sheba_utils import generate_sheba_from_account
from personnel.workflows import VEHICLE_CHANGE_WORKFLOW, VEHICLE_WORKFLOW
from workflow.models import WorkflowInstance

User = get_user_model()


def make_nc(prefix: str) -> str:
    s = sum(int(prefix[i]) * (10 - i) for i in range(9))
    r = s % 11
    check = r if r < 2 else 11 - r
    return f"{prefix}{check}"


VALID_SHEBA = generate_sheba_from_account("بانک ملی ایران", "0105678901004")
NON_ROAD_TYPE = next(c[0] for c in VehicleDriverProfile._meta.get_field('vehicle_type').choices
                     if c[0] not in ROAD_VEHICLE_TYPES)
OWNERSHIP = next(c[0] for c in VehicleDriverProfile._meta.get_field('ownership_type').choices)


class VehicleWorkflow46Tests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code="FV46-CO", name="شرکت ناوگان ۴۶", is_active=True)
        self.project = Project.objects.create(code="FV46-P", name="پروژه ۴۶", company=self.company, is_active=True)
        self.section = ProjectSection.objects.create(project=self.project, code="FV46-S1", name="بخش یک", is_active=True)
        self.section2 = ProjectSection.objects.create(project=self.project, code="FV46-S2", name="بخش دو", is_active=True)
        perms = {
            'operator': ['view_sys_fleet_attendance'],
            'supervisor': ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance'],
            'supervisor2': ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance'],
            'accountant': ['perm_approve_fleet_finance', 'view_sys_fleet_attendance'],
            'manager': ['perm_approve_fleet_manager', 'view_sys_fleet_attendance'],
        }
        self.users = {}
        for name, codes in perms.items():
            u = User.objects.create(username=f"fv46_{name}", first_name=name, last_name="تست")
            for code in codes:
                p = Permission.objects.filter(codename=code).first()
                if p:
                    u.user_permissions.add(p)
            UserCompanyAccess.objects.get_or_create(user=u, company=self.company, defaults={"is_default": True})
            self.users[name] = u
        for name, section, role in (
            ('operator', self.section, 'employee'), ('supervisor', self.section, 'supervisor'),
            ('accountant', self.section, 'accountant'), ('manager', self.section, 'manager'),
            ('supervisor2', self.section2, 'supervisor'), ('supervisor2', self.section, 'employee'),
        ):
            SectionAssignment.objects.create(user=self.users[name], section=section, role=role, is_active=True)

    # ── helpers ──
    def call(self, user, method, url, data=None):
        c = APIClient()
        c.force_authenticate(user)
        kwargs = {'HTTP_X_COMPANY_ID': str(self.company.pk)}
        if method == 'get':
            return c.get(url, data or {}, **kwargs)
        return getattr(c, method)(url, data or {}, format='json', **kwargs)

    def make_vehicle(self, sheba=VALID_SHEBA, **overrides):
        nc = make_nc("228012345")
        data = dict(
            plate_number="12ب345-67", vehicle_type=NON_ROAD_TYPE, ownership_type=OWNERSHIP,
            driver_name="رحیم رانندگان", driver_national_code=nc, driver_phone="09171234567",
            is_driver_owner=True, owner_name="رحیم رانندگان", owner_national_code=nc, owner_phone="09171234567",
            default_service_rate=2500000, bank_name="بانک ملی ایران", account_number="0105678901004",
            sheba_number=sheba, insurance_expiry_date="1406/12/29", inspection_expiry_date="1406/12/29",
            license_expiry_date="1406/12/29", valid_until_date="1406/12/29",
            section=self.section, project=self.project, company=self.company,
            created_by=self.users['operator'], approval_status='draft',
        )
        data.update(overrides)
        v = VehicleDriverProfile.objects.create(**data)
        VehicleBankAccount.objects.create(vehicle=v, bank_name="بانک ملی ایران", account_number="0105678901004",
                                          sheba_number=sheba, account_owner_name="رحیم رانندگان",
                                          account_owner_national_code=nc, is_primary=True, is_active=True)
        return v

    def submit(self, v):
        missing = get_vehicle_missing_fields(v, stage='submit')
        self.assertEqual(missing, [], missing)
        r = self.call(self.users['operator'], 'post', f'/api/personnel/vehicles/{v.pk}/submit/')
        self.assertEqual(r.status_code, 200, r.data)
        v.refresh_from_db()
        return r

    def approve(self, who, v, stage):
        return self.call(self.users[who], 'post', f'/api/personnel/vehicles/{v.pk}/approve-{stage}/', {'note': 'ok'})

    # ── D1/D3 ──
    def test_full_flow_draft_to_approved_and_active(self):
        v = self.make_vehicle()
        self.submit(v)
        self.assertEqual(v.approval_status, 'pending_supervisor')
        self.assertEqual(self.approve('supervisor', v, 'supervisor').status_code, 200)
        r = self.approve('accountant', v, 'finance')
        self.assertEqual(r.status_code, 200, r.data)
        r = self.approve('manager', v, 'manager')
        self.assertEqual(r.status_code, 200, r.data)
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'approved')
        self.assertTrue(v.is_active)
        self.assertEqual(v.supervisor_approved_by, self.users['supervisor'])
        self.assertEqual(v.accountant_approved_by, self.users['accountant'])
        self.assertEqual(v.manager_approved_by, self.users['manager'])

    def test_manager_cannot_skip_accountant(self):
        v = self.make_vehicle()
        self.submit(v)
        self.approve('supervisor', v, 'supervisor')
        r = self.approve('manager', v, 'manager')
        self.assertEqual(r.status_code, 400, r.data)
        self.assertEqual(r.data['code'], 'wrong_step')
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'pending_accountant')
        self.assertIsNone(v.accountant_approved_by)

    def test_accountant_blocked_without_sheba(self):
        v = self.make_vehicle()
        self.submit(v)
        self.approve('supervisor', v, 'supervisor')
        VehicleDriverProfile.objects.filter(pk=v.pk).update(sheba_number='')
        VehicleBankAccount.objects.filter(vehicle=v).update(sheba_number='')
        r = self.approve('accountant', v, 'finance')
        self.assertEqual(r.status_code, 400, r.data)
        self.assertEqual(r.data['code'], 'action_blocked')
        self.assertTrue(r.data.get('missing_fields'))
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'pending_accountant')

    def test_supervisor_of_other_section_forbidden(self):
        v = self.make_vehicle()
        self.submit(v)
        r = self.approve('supervisor2', v, 'supervisor')
        self.assertEqual(r.status_code, 403, r.data)
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'pending_supervisor')

    def test_return_then_resubmit(self):
        v = self.make_vehicle()
        self.submit(v)
        r = self.call(self.users['supervisor'], 'post', f'/api/personnel/vehicles/{v.pk}/request-revision/',
                      {'reason': 'پلاک را اصلاح کنید'})
        self.assertEqual(r.status_code, 200, r.data)
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'revision_required')
        self.submit(v)
        self.assertEqual(v.approval_status, 'pending_supervisor')
        r = self.call(self.users['supervisor'], 'post', f'/api/personnel/vehicles/{v.pk}/reject/', {'reason': ''})
        self.assertEqual(r.status_code, 400)
        self.assertTrue(VehicleDriverProfile.objects.filter(pk=v.pk).exists())

    def test_batch_approve_returns_each_row(self):
        v1 = self.make_vehicle()
        v2 = self.make_vehicle(plate_number="22ب345-67")
        self.submit(v1)
        r = self.call(self.users['supervisor'], 'post', '/api/personnel/vehicles/batch-approve/',
                      {'stage': 'supervisor', 'ids': [v1.pk, v2.pk, 999999]})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['success_ids'], [v1.pk])
        self.assertEqual(len(r.data['results']), 3)
        self.assertEqual(r.data['failed_count'], 2)

    # ── D2 ──
    def _approved_vehicle(self):
        v = self.make_vehicle()
        self.submit(v)
        self.approve('supervisor', v, 'supervisor')
        self.approve('accountant', v, 'finance')
        self.approve('manager', v, 'manager')
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'approved')
        return v

    def test_change_request_done_applies_and_clears_pending(self):
        v = self._approved_vehicle()
        r = self.call(self.users['operator'], 'patch', f'/api/personnel/vehicles/{v.pk}/', {'driver_phone': '09179876543'})
        self.assertEqual(r.status_code, 202, r.data)
        cr = VehicleChangeRequest.objects.get(pk=r.data['change_request_id'])
        v.refresh_from_db()
        self.assertTrue(v.has_pending_changes)
        self.assertIsNotNone(WorkflowInstance.objects.filter(workflow_key=VEHICLE_CHANGE_WORKFLOW, entity_id=str(cr.pk)).first())
        for who, stage in (('supervisor', 'supervisor'), ('accountant', 'finance'), ('manager', 'manager')):
            rr = self.call(self.users[who], 'post', f'/api/personnel/vehicle-change-requests/{cr.pk}/approve-{stage}/')
            self.assertEqual(rr.status_code, 200, rr.data)
        cr.refresh_from_db()
        v.refresh_from_db()
        self.assertEqual(cr.status, 'approved')
        self.assertEqual(v.driver_phone, '09179876543')
        self.assertFalse(v.has_pending_changes)

    # ── D4 ──
    def test_fleet_open_workflows_idempotent_and_dry_run(self):
        v = self.make_vehicle(approval_status='pending_accountant')
        out = io.StringIO()
        call_command('fleet_open_workflows', '--dry-run', stdout=out)
        self.assertEqual(WorkflowInstance.objects.filter(workflow_key=VEHICLE_WORKFLOW).count(), 0)
        call_command('fleet_open_workflows', stdout=out)
        call_command('fleet_open_workflows', stdout=out)
        self.assertEqual(WorkflowInstance.objects.filter(workflow_key=VEHICLE_WORKFLOW, entity_id=str(v.pk)).count(), 1)
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'pending_accountant')

    # ── D8 ──
    def test_masking_supervisor_vs_accountant_and_starred_write(self):
        v = self.make_vehicle()
        nc = v.driver_national_code
        r = self.call(self.users['supervisor'], 'get', f'/api/personnel/vehicles/{v.pk}/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('*', r.data['driver_national_code'])
        self.assertTrue(r.data['driver_national_code'].endswith(nc[-4:]))
        self.assertIn('*', r.data['sheba_number'])
        self.assertIn('*', r.data['bank_accounts'][0]['sheba_number'])
        r = self.call(self.users['accountant'], 'get', f'/api/personnel/vehicles/{v.pk}/')
        self.assertEqual(r.data['driver_national_code'], nc)
        self.assertEqual(r.data['sheba_number'], VALID_SHEBA)
        # starred write is silently ignored (no 400, value kept)
        r = self.call(self.users['operator'], 'patch', f'/api/personnel/vehicles/{v.pk}/',
                      {'driver_national_code': '******' + nc[-4:], 'driver_name': 'رحیم تازه'})
        self.assertEqual(r.status_code, 200, r.data)
        v.refresh_from_db()
        self.assertEqual(v.driver_national_code, nc)
        self.assertEqual(v.driver_name, 'رحیم تازه')

    def test_list_page_only_pagination(self):
        self.make_vehicle()
        r = self.call(self.users['accountant'], 'get', '/api/personnel/vehicles/')
        self.assertIsInstance(r.data, list)
        r = self.call(self.users['accountant'], 'get', '/api/personnel/vehicles/', {'page': 1})
        self.assertIn('results', r.data)
