# -*- coding: utf-8 -*-
"""
Release v1 step 4.6-b: fleet scope and sensitive-data API tests (class Fleet46ScopeTests).
Covers vehicle profile and bank account masking, section scope enforcement for supervisor
and finance roles, audit log metadata masking, starred writes idempotency, multi-company 404
isolation, and fleet settlement permissions and masking.
"""
import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.attendance_periods import get_or_create_period
from personnel.fleet_lifecycle_services import ROAD_VEHICLE_TYPES, get_vehicle_missing_fields
from personnel.fleet_settlement_engine import calculate_monthly_fleet_settlement
from personnel.models import (
    VehicleBankAccount,
    VehicleDriverProfile,
    VehicleTripLog,
)
from personnel.sheba_utils import generate_sheba_from_account

User = get_user_model()


def make_nc(prefix: str) -> str:
    s = sum(int(prefix[i]) * (10 - i) for i in range(9))
    r = s % 11
    check = r if r < 2 else 11 - r
    return f"{prefix}{check}"


VALID_SHEBA = generate_sheba_from_account("بانک ملی ایران", "0105678901004")
NEW_VALID_SHEBA = generate_sheba_from_account("بانک ملی ایران", "0105678901005")
NON_ROAD_TYPE = next(c[0] for c in VehicleDriverProfile._meta.get_field('vehicle_type').choices
                     if c[0] not in ROAD_VEHICLE_TYPES)
OWNERSHIP = next(c[0] for c in VehicleDriverProfile._meta.get_field('ownership_type').choices)


class Fleet46ScopeTests(TestCase):
    def setUp(self):
        # Company 1 with Section A and Section B
        self.company = Company.objects.create(code="F46S-CO1", name="شرکت ناوگان ۴۶ اسکوپ ۱", is_active=True)
        self.project = Project.objects.create(code="F46S-P1", name="پروژه ۱", company=self.company, is_active=True)
        self.section = ProjectSection.objects.create(project=self.project, code="F46S-SA", name="بخش الف", is_active=True)
        self.section2 = ProjectSection.objects.create(project=self.project, code="F46S-SB", name="بخش ب", is_active=True)

        # Company 2 with Section C
        self.company2 = Company.objects.create(code="F46S-CO2", name="شرکت ناوگان ۴۶ اسکوپ ۲", is_active=True)
        self.project2 = Project.objects.create(code="F46S-P2", name="پروژه ۲", company=self.company2, is_active=True)
        self.section_c = ProjectSection.objects.create(project=self.project2, code="F46S-SC", name="بخش ج", is_active=True)

        perms = {
            'operator': ['view_sys_fleet_attendance'],
            'supervisor': ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance'],
            'supervisor2': ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance'],
            'supervisor_b_only': ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance'],
            'accountant': ['perm_approve_fleet_finance', 'view_sys_fleet_attendance', 'view_sys_fleet_settlement'],
            'accountant2': ['perm_approve_fleet_finance', 'view_sys_fleet_attendance'],
            'accountant_b_only': ['perm_approve_fleet_finance', 'view_sys_fleet_attendance'],
            'manager': ['perm_approve_fleet_manager', 'view_sys_fleet_attendance'],
        }
        self.users = {}
        for name, codes in perms.items():
            u = User.objects.create(username=f"f46s_{name}", first_name=name, last_name="تست")
            for code in codes:
                p = Permission.objects.filter(codename=code).first()
                if p:
                    u.user_permissions.add(p)
            UserCompanyAccess.objects.get_or_create(user=u, company=self.company, defaults={"is_default": True})
            self.users[name] = u

        for name, sec, role in (
            ('operator', self.section, 'employee'),
            ('supervisor', self.section, 'supervisor'),
            ('accountant', self.section, 'accountant'),
            ('manager', self.section, 'manager'),
            ('supervisor2', self.section2, 'supervisor'),
            ('supervisor2', self.section, 'employee'),
            ('supervisor_b_only', self.section2, 'supervisor'),
            ('accountant2', self.section2, 'accountant'),
            ('accountant2', self.section, 'employee'),
            ('accountant_b_only', self.section2, 'accountant'),
        ):
            SectionAssignment.objects.create(user=self.users[name], section=sec, role=role, is_active=True)

        # Settlement viewer in Section B (role accountant in Section B, role employee in Section A)
        # Using SectionAssignment role bundle keeps view_sys_fleet_settlement scoped strictly to Section B
        self.users['settle_b'] = User.objects.create(username="f46s_settle_b", first_name="تسویه ب", last_name="تست")
        UserCompanyAccess.objects.create(user=self.users['settle_b'], company=self.company, is_default=True)
        SectionAssignment.objects.create(user=self.users['settle_b'], section=self.section2, role='accountant', is_active=True)
        SectionAssignment.objects.create(user=self.users['settle_b'], section=self.section, role='employee', is_active=True)

        # User of Company 2 (Section C)
        self.users['user_c'] = User.objects.create(username="f46s_user_c", first_name="کاربر شرکت دو", last_name="تست")
        for code in ['perm_approve_fleet_supervisor', 'view_sys_fleet_attendance', 'view_sys_fleet_settlement']:
            p = Permission.objects.filter(codename=code).first()
            if p:
                self.users['user_c'].user_permissions.add(p)
        UserCompanyAccess.objects.create(user=self.users['user_c'], company=self.company2, is_default=True)
        SectionAssignment.objects.create(user=self.users['user_c'], section=self.section_c, role='supervisor', is_active=True)

        # Superuser
        self.superuser = User.objects.create_superuser(username='f46s_admin', password='x', email='admin@test.com')
        UserCompanyAccess.objects.get_or_create(user=self.superuser, company=self.company, defaults={"is_default": True})
        UserCompanyAccess.objects.get_or_create(user=self.superuser, company=self.company2, defaults={"is_default": False})

    # ── helpers ──
    def call(self, user, method, url, data=None, company=None):
        c = APIClient()
        c.force_authenticate(user)
        co = company or self.company
        kwargs = {'HTTP_X_COMPANY_ID': str(co.pk)}
        if method == 'get':
            return c.get(url, data or {}, **kwargs)
        return getattr(c, method)(url, data or {}, format='json', **kwargs)

    def make_vehicle(self, sheba=VALID_SHEBA, **overrides):
        nc_drv = make_nc("228012345")
        nc_own = make_nc("228012346")
        data = dict(
            plate_number="12ب345-67", vehicle_type=NON_ROAD_TYPE, ownership_type=OWNERSHIP,
            driver_name="رحیم رانندگان", driver_national_code=nc_drv, driver_phone="09171234567",
            is_driver_owner=False, owner_name="مالک خودرو", owner_national_code=nc_own, owner_phone="09171234568",
            default_service_rate=2500000, bank_name="بانک ملی ایران", account_number="0105678901004",
            sheba_number=sheba, insurance_expiry_date="1406/12/29", inspection_expiry_date="1406/12/29",
            license_expiry_date="1406/12/29", valid_until_date="1406/12/29",
            section=self.section, project=self.project, company=self.company,
            created_by=self.users['operator'], approval_status='draft',
        )
        data.update(overrides)
        v = VehicleDriverProfile.objects.create(**data)
        if sheba:
            VehicleBankAccount.objects.create(
                vehicle=v, bank_name="بانک ملی ایران", account_number="0105678901004",
                sheba_number=sheba, account_owner_name=v.owner_name,
                account_owner_national_code=v.owner_national_code, is_primary=True, is_active=True
            )
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

    # ── Task 4 tests ──
    def test_supervisor_sees_masked_vehicle(self):
        """a) Supervisor sees masked driver/owner national codes and sheba in detail and list."""
        nc_drv = make_nc("228012345")
        nc_own = make_nc("228012346")
        v = self.make_vehicle(
            approval_status='approved', is_active=True,
            driver_national_code=nc_drv, owner_national_code=nc_own,
            sheba_number=VALID_SHEBA,
        )
        r = self.call(self.users['supervisor'], 'get', f'/api/personnel/vehicles/{v.pk}/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('*', r.data['driver_national_code'])
        self.assertTrue(r.data['driver_national_code'].endswith(nc_drv[-4:]))
        self.assertIn('*', r.data['owner_national_code'])
        self.assertTrue(r.data['owner_national_code'].endswith(nc_own[-4:]))
        self.assertIn('*', r.data['sheba_number'])
        self.assertTrue(r.data['sheba_number'].endswith(VALID_SHEBA[-4:]))

        r_list = self.call(self.users['supervisor'], 'get', '/api/personnel/vehicles/')
        self.assertEqual(r_list.status_code, 200, r_list.data)
        results = r_list.data if isinstance(r_list.data, list) else r_list.data.get('results', [])
        row = next((item for item in results if item['id'] == v.pk), None)
        self.assertIsNotNone(row, "Vehicle must be in list")
        self.assertIn('*', row['driver_national_code'])
        self.assertTrue(row['driver_national_code'].endswith(nc_drv[-4:]))
        self.assertIn('*', row['owner_national_code'])
        self.assertTrue(row['owner_national_code'].endswith(nc_own[-4:]))
        self.assertIn('*', row['sheba_number'])
        self.assertTrue(row['sheba_number'].endswith(VALID_SHEBA[-4:]))

    def test_finance_in_section_sees_full(self):
        """b) Finance in section A sees full values; finance only in section B gets 404 or sees masked."""
        nc_drv = make_nc("228012345")
        nc_own = make_nc("228012346")
        v = self.make_vehicle(
            approval_status='approved', is_active=True,
            driver_national_code=nc_drv, owner_national_code=nc_own,
            sheba_number=VALID_SHEBA,
        )
        # Finance user in section A sees full values
        r_fin = self.call(self.users['accountant'], 'get', f'/api/personnel/vehicles/{v.pk}/')
        self.assertEqual(r_fin.status_code, 200, r_fin.data)
        self.assertEqual(r_fin.data['driver_national_code'], nc_drv)
        self.assertEqual(r_fin.data['owner_national_code'], nc_own)
        self.assertEqual(r_fin.data['sheba_number'], VALID_SHEBA)

        # Finance user whose permission is only in section B:
        # sees them masked for the section A vehicle (or gets 404 if the vehicle is outside their list)
        r_b = self.call(self.users['accountant2'], 'get', f'/api/personnel/vehicles/{v.pk}/')
        if r_b.status_code == 404:
            self.assertEqual(r_b.status_code, 404)
        else:
            self.assertEqual(r_b.status_code, 200)
            self.assertIn('*', r_b.data['driver_national_code'])
            self.assertIn('*', r_b.data['owner_national_code'])
            self.assertIn('*', r_b.data['sheba_number'])

        r_b_only = self.call(self.users['accountant_b_only'], 'get', f'/api/personnel/vehicles/{v.pk}/')
        if r_b_only.status_code == 404:
            self.assertEqual(r_b_only.status_code, 404)
        else:
            self.assertEqual(r_b_only.status_code, 200)
            self.assertIn('*', r_b_only.data['driver_national_code'])
            self.assertIn('*', r_b_only.data['owner_national_code'])
            self.assertIn('*', r_b_only.data['sheba_number'])

    def test_bank_accounts_masked_for_supervisor(self):
        """c) Supervisor GETs bank-accounts -> masked; section A finance -> full."""
        v = self.make_vehicle(approval_status='approved', is_active=True, sheba=VALID_SHEBA)
        r_sup = self.call(self.users['supervisor'], 'get', f'/api/personnel/vehicles/{v.pk}/bank-accounts/')
        self.assertEqual(r_sup.status_code, 200, r_sup.data)
        self.assertTrue(len(r_sup.data) > 0)
        acc_sup = r_sup.data[0]
        self.assertIn('*', acc_sup['sheba_number'])
        self.assertTrue(acc_sup['sheba_number'].endswith(VALID_SHEBA[-4:]))
        self.assertIn('*', acc_sup['account_number'])
        self.assertTrue(acc_sup['account_number'].endswith("0105678901004"[-4:]))

        r_fin = self.call(self.users['accountant'], 'get', f'/api/personnel/vehicles/{v.pk}/bank-accounts/')
        self.assertEqual(r_fin.status_code, 200, r_fin.data)
        self.assertTrue(len(r_fin.data) > 0)
        acc_fin = r_fin.data[0]
        self.assertEqual(acc_fin['sheba_number'], VALID_SHEBA)
        self.assertEqual(acc_fin['account_number'], "0105678901004")

    def test_audit_log_metadata_masked(self):
        """d) Audit log metadata has sheba/national codes masked for supervisor and full for superuser."""
        v = self.make_vehicle()
        nc_drv = v.driver_national_code
        nc_own = v.owner_national_code
        self.submit(v)
        self.approve('supervisor', v, 'supervisor')
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'pending_accountant')

        # Section A finance user PATCHes vehicle sheba
        r_patch = self.call(self.users['accountant'], 'patch', f'/api/personnel/vehicles/{v.pk}/',
                            {'sheba_number': NEW_VALID_SHEBA})
        self.assertEqual(r_patch.status_code, 200, r_patch.data)

        # Supervisor GETs workflow-audit-logs
        r_sup = self.call(self.users['supervisor'], 'get', '/api/personnel/workflow-audit-logs/',
                          {'content_type': 'vehicle', 'object_id': v.pk})
        self.assertEqual(r_sup.status_code, 200, r_sup.data)
        sup_json = json.dumps(r_sup.data)
        self.assertNotIn(NEW_VALID_SHEBA, sup_json)
        self.assertNotIn(VALID_SHEBA, sup_json)
        self.assertNotIn(nc_drv, sup_json)
        self.assertNotIn(nc_own, sup_json)

        # Superuser GETs workflow-audit-logs and sees full value
        r_admin = self.call(self.superuser, 'get', '/api/personnel/workflow-audit-logs/',
                            {'content_type': 'vehicle', 'object_id': v.pk})
        self.assertEqual(r_admin.status_code, 200, r_admin.data)
        admin_json = json.dumps(r_admin.data)
        self.assertIn(NEW_VALID_SHEBA, admin_json)

    def test_masked_write_keeps_value(self):
        """e) Creator of draft vehicle PATCHes sheba with masked string -> stored value unchanged."""
        v = self.make_vehicle(sheba=VALID_SHEBA)
        self.assertEqual(v.approval_status, 'draft')
        masked_sheba = '******' + VALID_SHEBA[-4:]
        r = self.call(self.users['operator'], 'patch', f'/api/personnel/vehicles/{v.pk}/',
                      {'sheba_number': masked_sheba, 'driver_name': 'رحیم تغییر نام'})
        self.assertIn(r.status_code, [200, 204], r.data)
        v.refresh_from_db()
        self.assertEqual(v.sheba_number, VALID_SHEBA)
        self.assertEqual(v.driver_name, 'رحیم تغییر نام')

    def test_other_section_supervisor_gets_403(self):
        """f) Supervisor of section B calling approve-supervisor on section A vehicle gets 403 or 404."""
        v = self.make_vehicle()
        self.submit(v)
        self.assertEqual(v.approval_status, 'pending_supervisor')

        # Supervisor of section B (who is also an employee in section A) gets 403
        r_403 = self.call(self.users['supervisor2'], 'post',
                          f'/api/personnel/vehicles/{v.pk}/approve-supervisor/', {'note': 'ok'})
        self.assertEqual(r_403.status_code, 403, r_403.data)
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'pending_supervisor')

        # Supervisor of section B only (vehicle outside their list) gets 404
        r_404 = self.call(self.users['supervisor_b_only'], 'post',
                          f'/api/personnel/vehicles/{v.pk}/approve-supervisor/', {'note': 'ok'})
        self.assertEqual(r_404.status_code, 404)
        v.refresh_from_db()
        self.assertEqual(v.approval_status, 'pending_supervisor')

    def test_other_company_gets_404(self):
        """g) User of company 2 gets 404 on company 1 vehicle, bank-accounts, and fleet settlement."""
        v = self.make_vehicle(approval_status='approved', is_active=True, sheba=VALID_SHEBA)
        period = get_or_create_period(None, self.section.pk, '1405/06')[0]

        # GET vehicle -> 404
        r_v = self.call(self.users['user_c'], 'get', f'/api/personnel/vehicles/{v.pk}/', company=self.company2)
        self.assertEqual(r_v.status_code, 404)

        # GET bank-accounts -> 404
        r_b = self.call(self.users['user_c'], 'get', f'/api/personnel/vehicles/{v.pk}/bank-accounts/', company=self.company2)
        self.assertEqual(r_b.status_code, 404)

        # GET fleet settlement with period_id of company 1 section period -> 404
        r_s = self.call(self.users['user_c'], 'get', '/api/personnel/fleet-settlement/calculate/',
                        {'period_id': period.pk}, company=self.company2)
        self.assertEqual(r_s.status_code, 404)

    def test_settlement_requires_permission_and_masks(self):
        """h) Settlement requires view_sys_fleet_settlement (403 without it) and masks sheba for non-full view."""
        period = get_or_create_period(None, self.section.pk, '1405/06')[0]
        v = self.make_vehicle(
            plate_number="55ب555-55", ownership_type='contract', sheba=VALID_SHEBA,
            approval_status='approved', is_active=True
        )
        VehicleTripLog.objects.create(
            vehicle=v, section=self.section, period=period, date_shamsi='1405/06/10',
            trip_count=2, unit_rate=1000, total_amount=2000
        )

        # User without view_sys_fleet_settlement gets 403 on fleet settlement endpoint
        r_no_perm = self.call(self.users['operator'], 'get', '/api/personnel/fleet-settlement/calculate/',
                              {'period_id': period.pk})
        self.assertEqual(r_no_perm.status_code, 403)
        r_no_perm_ym = self.call(self.users['operator'], 'get', '/api/personnel/fleet-settlement/calculate/',
                                 {'year_month': '1405/06'})
        self.assertEqual(r_no_perm_ym.status_code, 403)

        # User with view_sys_fleet_settlement in section B (no full view of section A vehicle)
        # sees sheba masked in settlement rows
        masked_calc = calculate_monthly_fleet_settlement(period_id=period.pk, viewer=self.users['settle_b'])
        rec = next((item for item in masked_calc['records'] if item['vehicle_id'] == v.pk), None)
        self.assertIsNotNone(rec)
        self.assertIn('*', rec['sheba_number'])
        self.assertNotEqual(rec['sheba_number'], VALID_SHEBA)

        # Full-view user (finance in section A) sees sheba in full via engine and endpoint
        full_calc = calculate_monthly_fleet_settlement(period_id=period.pk, viewer=self.users['accountant'])
        rec_full_calc = next((item for item in full_calc['records'] if item['vehicle_id'] == v.pk), None)
        self.assertIsNotNone(rec_full_calc)
        self.assertEqual(rec_full_calc['sheba_number'], VALID_SHEBA)

        r_full = self.call(self.users['accountant'], 'get', '/api/personnel/fleet-settlement/calculate/',
                           {'period_id': period.pk})
        self.assertEqual(r_full.status_code, 200, r_full.data)
        rec_full = next((item for item in r_full.data['records'] if item['vehicle_id'] == v.pk), None)
        self.assertIsNotNone(rec_full)
        self.assertEqual(rec_full['sheba_number'], VALID_SHEBA)
