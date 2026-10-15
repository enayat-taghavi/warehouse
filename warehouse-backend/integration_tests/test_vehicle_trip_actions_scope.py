"""
آزمون‌های یکپارچگی قلمرو شرکت در actionهای سفارشی VehicleTripViewSet.
طرح پیگیری‌های ناظر — نشست دامنهٔ شرکت در actionهای سفارشی ناوگان (بک‌اند).
"""
import io
import openpyxl
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess

User = get_user_model()


def _make_fleet_excel(rows, days_in_month=31):
    wb = openpyxl.Workbook()
    ws = wb.active
    row1 = ['ردیف', 'نام راننده', 'پلاک انتظامی', 'نوع خودرو', 'نوع مالکیت', 'نرخ پایه (تومان)']
    row2 = ['row_idx', 'driver_name', 'plate_number', 'vehicle_type', 'ownership_type', 'default_rate']
    for d in range(1, days_in_month + 1):
        row1.append(f"{d}")
        row2.append(f"day_{d:02d}")
    row1.extend(['جمع سرویس', 'جمع کل کرایه (تومان)', 'شماره شبا'])
    row2.extend(['total_trips', 'total_amount', 'sheba_number'])
    ws.append(row1)
    ws.append(row2)
    for r in rows:
        r_data = [
            r.get('row_idx', 1),
            r.get('driver_name', ''),
            r.get('plate_number', ''),
            r.get('vehicle_type', 'وانت'),
            r.get('ownership_type', 'شرکتی'),
            r.get('default_rate', 100000),
        ]
        for d in range(1, days_in_month + 1):
            r_data.append(r.get(f"day_{d:02d}", 0))
        r_data.extend([r.get('total_trips', 0), r.get('total_amount', 0), r.get('sheba_number', '')])
        ws.append(r_data)
    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio


class VehicleTripActionsScopeIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.company_a = Company.objects.create(code='COMP-A-FLEET', name='شرکت ناوگان الف', is_active=True)
        self.company_b = Company.objects.create(code='COMP-B-FLEET', name='شرکت ناوگان ب', is_active=True)

        self.superuser = User.objects.create_superuser(
            username='fleet_superuser',
            password='Password123!',
            national_code='0011111112',
            phone_number='09121111112'
        )
        self.user_a = User.objects.create_user(
            username='user_fleet_a',
            password='Password123!',
            national_code='0022222223',
            phone_number='09122222223',
            first_name='کاربر',
            last_name='شرکت الف'
        )
        self.user_no_company = User.objects.create_user(
            username='user_fleet_nocomp',
            password='Password123!',
            national_code='0044444445',
            phone_number='09124444445',
            first_name='کاربر',
            last_name='بدون شرکت'
        )

        UserCompanyAccess.objects.create(
            user=self.user_a,
            company=self.company_a,
            access_level='workspace_full',
            is_default=True
        )

        perms = Permission.objects.filter(
            codename__in=[
                'view_sys_fleet_settlement',
                'view_sys_personnel',
                'view_sys_reports',
            ]
        )
        for u in (self.user_a, self.user_no_company):
            u.user_permissions.set(perms)

        if apps.is_installed('personnel'):
            from personnel.models import (
                FinancialProject, ProjectSection,
                VehicleDriverProfile, VehicleTripLog,
                VehicleTripAuditLog, UserSectionAssignment
            )
            self.proj_a = FinancialProject.objects.create(company=self.company_a, code='PA_FL', name='پروژه ناوگان الف')
            self.sec_a = ProjectSection.objects.create(project=self.proj_a, code='SA_FL', name='بخش ناوگان الف')
            self.proj_b = FinancialProject.objects.create(company=self.company_b, code='PB_FL', name='پروژه ناوگان ب')
            self.sec_b = ProjectSection.objects.create(project=self.proj_b, code='SB_FL', name='بخش ناوگان ب')

            UserSectionAssignment.objects.create(user=self.user_a, section=self.sec_a, is_active=True)

            self.veh_a = VehicleDriverProfile.objects.create(
                company=self.company_a,
                section=self.sec_a,
                driver_name='راننده الف',
                plate_number='11-111-11',
                approval_status='approved',
                is_active=True,
                default_service_rate=Decimal('200000'),
            )
            self.veh_b = VehicleDriverProfile.objects.create(
                company=self.company_b,
                section=self.sec_b,
                driver_name='راننده ب',
                plate_number='22-222-22',
                approval_status='approved',
                is_active=True,
                default_service_rate=Decimal('200000'),
            )

            self.trip_a = VehicleTripLog.objects.create(
                vehicle=self.veh_a,
                section=self.sec_a,
                project=self.proj_a,
                date_shamsi='1405/01/10',
                trip_count=1,
                unit_rate=Decimal('200000'),
                total_amount=Decimal('200000'),
            )
            self.trip_b = VehicleTripLog.objects.create(
                vehicle=self.veh_b,
                section=self.sec_b,
                project=self.proj_b,
                date_shamsi='1405/01/11',
                trip_count=2,
                unit_rate=Decimal('200000'),
                total_amount=Decimal('400000'),
            )

            self.audit_a = VehicleTripAuditLog.objects.create(
                trip=self.trip_a,
                driver_name=self.veh_a.driver_name,
                plate_number=self.veh_a.plate_number,
                date_shamsi=self.trip_a.date_shamsi,
                changed_by=self.superuser,
                field_name='trip_count',
                old_value='0',
                new_value='1',
                reason='ثبت اولیه تردد الف'
            )
            self.audit_b = VehicleTripAuditLog.objects.create(
                trip=self.trip_b,
                driver_name=self.veh_b.driver_name,
                plate_number=self.veh_b.plate_number,
                date_shamsi=self.trip_b.date_shamsi,
                changed_by=self.superuser,
                field_name='trip_count',
                old_value='0',
                new_value='2',
                reason='ثبت اولیه تردد ب'
            )

    def test_matrix_scope(self):
        """matrix: کاربر الف فقط خودرو و سفر الف را می‌بیند؛ سوپریوزر هر دو را."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        res = self.client.get('/api/personnel/trips/matrix/?date_shamsi=1405/01/10')
        self.assertEqual(res.status_code, 200, res.content)
        v_ids = {r['vehicle_id'] for r in res.json().get('rows', [])}
        self.assertIn(self.veh_a.id, v_ids)
        self.assertNotIn(self.veh_b.id, v_ids)

        self.client.force_authenticate(self.superuser)
        res_super = self.client.get('/api/personnel/trips/matrix/?date_shamsi=1405/01/10')
        self.assertEqual(res_super.status_code, 200, res_super.content)
        v_ids_super = {r['vehicle_id'] for r in res_super.json().get('rows', [])}
        self.assertTrue({self.veh_a.id, self.veh_b.id} <= v_ids_super)

    def test_matrix_with_company_b_header_for_user_a(self):
        """matrix با سربرگ شرکت ب برای کاربر الف: هیچ دادهٔ ب برنمی‌گردد (۴۰۳ یا نتیجهٔ بی ب)."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        res = self.client.get(
            '/api/personnel/trips/matrix/?date_shamsi=1405/01/10',
            HTTP_X_COMPANY_ID=str(self.company_b.id)
        )
        if res.status_code == 200:
            v_ids = {r['vehicle_id'] for r in res.json().get('rows', [])}
            self.assertNotIn(self.veh_b.id, v_ids)
        else:
            self.assertEqual(res.status_code, 403)

    def test_monthly_summary_user_a_sees_no_company_b(self):
        """monthly-summary: کاربر الف هیچ دادهٔ ب نمی‌بیند."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        res = self.client.get('/api/personnel/trips/monthly-summary/?year_month=1405/01')
        self.assertEqual(res.status_code, 200, res.content)
        summary = res.json().get('summary', [])
        v_ids = {r['vehicle_id'] for r in summary}
        self.assertIn(self.veh_a.id, v_ids)
        self.assertNotIn(self.veh_b.id, v_ids)

    def test_monthly_grid_user_a_sees_no_company_b(self):
        """monthly-grid: کاربر الف هیچ دادهٔ ب نمی‌بیند."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        res = self.client.get('/api/personnel/trips/monthly-grid/?year_month=1405/01')
        self.assertEqual(res.status_code, 200, res.content)
        rows = res.json().get('rows', [])
        v_ids = {r['vehicle_id'] for r in rows}
        self.assertIn(self.veh_a.id, v_ids)
        self.assertNotIn(self.veh_b.id, v_ids)

    def test_audit_logs_user_a_sees_only_trip_a(self):
        """audit-logs: ممیزی سفر ب برای کاربر الف برنمی‌گردد و ممیزی سفر الف برمی‌گردد."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        res = self.client.get('/api/personnel/trips/audit-logs/')
        self.assertEqual(res.status_code, 200, res.content)
        trip_ids = {r['trip'] for r in res.json()}
        self.assertIn(self.trip_a.id, trip_ids)
        self.assertNotIn(self.trip_b.id, trip_ids)

    def test_bulk_save_with_vehicle_b_by_user_a(self):
        """bulk-save با خودروی ب توسط کاربر الف: پس از خواندن دوباره از دیتابیس، هیچ سفری برای خودروی ب ساخته یا عوض نشده است."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'date_shamsi': '1405/01/25',
            'items': [
                {'vehicle_id': self.veh_b.id, 'trip_count': 5, 'unit_rate': 300000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.trip_b.refresh_from_db()
        self.assertEqual(self.trip_b.trip_count, 2)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_b, date_shamsi='1405/01/25').exists())

    def test_update_day_trip_with_vehicle_b_by_user_a(self):
        """update-day-trip با خودروی ب: پاسخ غیر ۲xx و سفر ب پس از خواندن دوباره دست‌نخورده."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        payload = {
            'vehicle_id': self.veh_b.id,
            'date_shamsi': self.trip_b.date_shamsi,
            'trip_count': 99,
        }
        res = self.client.post('/api/personnel/trips/update-day-trip/', payload, format='json')
        self.assertNotEqual(res.status_code // 100, 2)
        self.trip_b.refresh_from_db()
        self.assertEqual(self.trip_b.trip_count, 2)

    def test_bulk_save_monthly_grid_with_vehicle_b_by_user_a(self):
        """bulk-save-monthly-grid با خودروی ب: سفر ب دست‌نخورده و سفر تازه‌ای برای ب ساخته نشده."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'year_month': '1405/01',
            'items': [
                {'vehicle_id': self.veh_b.id, 'day': 26, 'trip_count': 4}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save-monthly-grid/', payload, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.trip_b.refresh_from_db()
        self.assertEqual(self.trip_b.trip_count, 2)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_b, date_shamsi='1405/01/26').exists())

    def test_bulk_save_with_section_b_by_user_a(self):
        """bulk-save با section_id بخش ب توسط کاربر الف: پاسخ ۴۰۳ و هیچ سفر تازه‌ای."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'section_id': self.sec_b.id,
            'date_shamsi': '1405/01/20',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 3, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(date_shamsi='1405/01/20').exists())

    def test_export_monthly_excel_user_a(self):
        """export-monthly-excel توسط کاربر الف: پلاک خودروی ب در هیچ سلول کتاب‌کار (با openpyxl) نیست و پلاک الف هست."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        res = self.client.get('/api/personnel/trips/export-monthly-excel/?year_month=1405/01')
        self.assertEqual(res.status_code, 200, res.content)
        wb = openpyxl.load_workbook(io.BytesIO(res.content))
        ws = wb.active
        all_cell_values = [str(cell.value) for row in ws.rows for cell in row if cell.value is not None]
        self.assertIn(self.veh_a.plate_number, all_cell_values)
        self.assertNotIn(self.veh_b.plate_number, all_cell_values)

    def test_import_monthly_excel_user_a_with_row_for_vehicle_b(self):
        """import-monthly-excel توسط کاربر الف با ردیفی برای پلاک ب: سفر ب ساخته یا عوض نمی‌شود."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        excel_bio = _make_fleet_excel([
            {'plate_number': self.veh_b.plate_number, 'driver_name': self.veh_b.driver_name, 'day_15': 5}
        ])
        upload_file = SimpleUploadedFile(
            'test_fleet_scope.xlsx',
            excel_bio.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        res = self.client.post(
            '/api/personnel/trips/import-monthly-excel/',
            {'file': upload_file, 'year_month': '1405/01'},
            format='multipart'
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.trip_b.refresh_from_db()
        self.assertEqual(self.trip_b.trip_count, 2)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_b, date_shamsi='1405/01/15').exists())

    def test_bulk_save_positive_path_vehicle_a_by_user_a(self):
        """مسیر مثبت: bulk-save با خودروی الف توسط کاربر الف موفق است و سفر ساخته یا به‌روز می‌شود."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'date_shamsi': '1405/01/15',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 4, 'unit_rate': 250000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/01/15', trip_count=4).exists())

    def test_user_no_company_matrix_returns_no_vehicles(self):
        """کاربر بی‌شرکت: matrix هیچ خودرویی برنمی‌گرداند."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_no_company)
        res = self.client.get('/api/personnel/trips/matrix/?date_shamsi=1405/01/10')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json().get('rows', []), [])

    def test_update_day_trip_with_section_b_by_user_a(self):
        """update-day-trip با section_id بخش ب توسط کاربر الف: ۴۰۳ و عدم تغییر یا ایجاد سفر."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'vehicle_id': self.veh_a.id,
            'section_id': self.sec_b.id,
            'date_shamsi': '1405/01/22',
            'trip_count': 3,
        }
        res = self.client.post('/api/personnel/trips/update-day-trip/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/01/22').exists())

    def test_bulk_save_monthly_grid_with_section_b_by_user_a(self):
        """bulk-save-monthly-grid با section_id بخش ب توسط کاربر الف: ۴۰۳ و عدم ایجاد سفر."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'year_month': '1405/01',
            'section_id': self.sec_b.id,
            'items': [
                {'vehicle_id': self.veh_a.id, 'day': 22, 'trip_count': 2}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save-monthly-grid/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/01/22').exists())

    def test_bulk_save_with_vehicle_a_and_project_b_by_user_a(self):
        """bulk-save با خودروی الف و project_id پروژهٔ ب توسط کاربر الف: ۴۰۳ و عدم ایجاد سفر."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'project_id': self.proj_b.id,
            'date_shamsi': '1405/01/23',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 2, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/01/23').exists())

    def test_update_day_trip_with_project_b_by_user_a(self):
        """update-day-trip با project_id پروژهٔ ب توسط کاربر الف: ۴۰۳ و عدم ایجاد سفر."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'vehicle_id': self.veh_a.id,
            'project_id': self.proj_b.id,
            'date_shamsi': '1405/01/24',
            'trip_count': 1,
        }
        res = self.client.post('/api/personnel/trips/update-day-trip/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/01/24').exists())

    def test_bulk_save_monthly_grid_with_project_b_by_user_a(self):
        """bulk-save-monthly-grid با project_id پروژهٔ ب توسط کاربر الف: ۴۰۳ و عدم ایجاد سفر."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'year_month': '1405/01',
            'project_id': self.proj_b.id,
            'items': [
                {'vehicle_id': self.veh_a.id, 'day': 24, 'trip_count': 3}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save-monthly-grid/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/01/24').exists())

    def test_bulk_save_with_company_a_header_and_section_b_by_dual_company_user(self):
        """کاربر دارای دسترسی به الف و ب، با سربرگ شرکت الف و section_id بخش ب در bulk-save: ۴۰۳."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        user_ab = User.objects.create_user(
            username='user_fleet_dual_ab',
            password='Password123!',
            national_code='0033333334',
            phone_number='09123333334'
        )
        UserCompanyAccess.objects.create(user=user_ab, company=self.company_a, access_level='workspace_full')
        UserCompanyAccess.objects.create(user=user_ab, company=self.company_b, access_level='workspace_full')
        user_ab.user_permissions.set(Permission.objects.filter(
            codename__in=['view_sys_fleet_settlement', 'view_sys_personnel', 'view_sys_reports']
        ))
        self.client.force_authenticate(user_ab)
        payload = {
            'section_id': self.sec_b.id,
            'date_shamsi': '1405/01/27',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 1, 'unit_rate': 200000}
            ]
        }
        res = self.client.post(
            '/api/personnel/trips/bulk-save/',
            payload,
            format='json',
            HTTP_X_COMPANY_ID=str(self.company_a.id)
        )
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(date_shamsi='1405/01/27').exists())

    def test_bulk_save_with_mismatched_section_and_project(self):
        """bulk-save با section_id بخش الف و project_id پروژهٔ ناهمخوان (پروژه ب): ۴۰۰ و عدم ایجاد سفر."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'section_id': self.sec_a.id,
            'project_id': self.proj_b.id,
            'date_shamsi': '1405/01/28',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 2, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 400, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(date_shamsi='1405/01/28').exists())

    def test_bulk_save_positive_path_with_section_and_project_a(self):
        """مسیر مثبت: bulk-save با خودرو، بخش و پروژهٔ الف توسط کاربر الف موفق است و سفر با همان بخش و پروژه ذخیره می‌شود."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'section_id': self.sec_a.id,
            'project_id': self.proj_a.id,
            'date_shamsi': '1405/01/29',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 3, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        saved_trip = VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/01/29').first()
        self.assertIsNotNone(saved_trip)
        self.assertEqual(saved_trip.trip_count, 3)
        self.assertEqual(saved_trip.section_id, self.sec_a.id)
        self.assertEqual(saved_trip.project_id, self.proj_a.id)

    def test_bulk_save_with_nonexistent_section_id_returns_400(self):
        """bulk-save با section_id ناموجود در دیتابیس: ۴۰۰."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        payload = {
            'section_id': 999999,
            'date_shamsi': '1405/01/30',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 1, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 400, res.content)

    def test_bulk_save_with_nonexistent_project_id_returns_400(self):
        """bulk-save با project_id ناموجود در دیتابیس: ۴۰۰."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        self.client.force_authenticate(self.user_a)
        payload = {
            'project_id': 999999,
            'date_shamsi': '1405/01/30',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 1, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 400, res.content)

    def test_bulk_save_with_company_a_header_and_project_b_by_dual_company_user(self):
        """کاربر دارای دسترسی به الف و ب، با سربرگ شرکت الف و project_id پروژهٔ ب در bulk-save: ۴۰۳."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleTripLog
        user_ab = User.objects.create_user(
            username='user_fleet_dual_ab_proj',
            password='Password123!',
            national_code='0055555556',
            phone_number='09125555556'
        )
        UserCompanyAccess.objects.create(user=user_ab, company=self.company_a, access_level='workspace_full')
        UserCompanyAccess.objects.create(user=user_ab, company=self.company_b, access_level='workspace_full')
        user_ab.user_permissions.set(Permission.objects.filter(
            codename__in=['view_sys_fleet_settlement', 'view_sys_personnel', 'view_sys_reports']
        ))
        self.client.force_authenticate(user_ab)
        payload = {
            'project_id': self.proj_b.id,
            'date_shamsi': '1405/01/31',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 1, 'unit_rate': 200000}
            ]
        }
        res = self.client.post(
            '/api/personnel/trips/bulk-save/',
            payload,
            format='json',
            HTTP_X_COMPANY_ID=str(self.company_a.id)
        )
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(VehicleTripLog.objects.filter(date_shamsi='1405/01/31').exists())

    def _create_user_b(self):
        user_b = User.objects.create_user(
            username='user_fleet_b_scope',
            password='Password123!',
            national_code='0077777778',
            phone_number='09127777778',
            first_name='کاربر',
            last_name='شرکت ب'
        )
        UserCompanyAccess.objects.create(
            user=user_b,
            company=self.company_b,
            access_level='workspace_full',
            is_default=True
        )
        user_b.user_permissions.set(Permission.objects.filter(
            codename__in=['view_sys_fleet_settlement', 'view_sys_personnel', 'view_sys_reports']
        ))
        return user_b

    def _create_warehouses(self):
        if not apps.is_installed('warehouses'):
            self.skipTest('ماژول انبار نصب نیست.')
        from warehouses.models import Warehouse
        wh_a = Warehouse.objects.create(name='انبار تست شرکت الف', code='WH-A-TEST-SCOPE', company=self.company_a)
        wh_b = Warehouse.objects.create(name='انبار تست شرکت ب', code='WH-B-TEST-SCOPE', company=self.company_b)
        return wh_a, wh_b

    def test_orphan_vehicle_trips_visible_to_creator_in_trips_and_monthly_grid(self):
        """کاربر الف خودروی یتیم خودش را دارد و سفر آن را با bulk-save ثبت می‌کند؛ سفر در GET /api/personnel/trips/ و در monthly-grid برای همان کاربر دیده می‌شود."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleDriverProfile, VehicleTripLog
        veh_orphan = VehicleDriverProfile.objects.create(
            company=None,
            section=None,
            created_by=self.user_a,
            driver_name='راننده یتیم الف',
            plate_number='33-333-33',
            approval_status='approved',
            is_active=True,
            default_service_rate=Decimal('150000'),
        )
        self.client.force_authenticate(self.user_a)
        payload = {
            'date_shamsi': '1405/02/05',
            'items': [
                {'vehicle_id': veh_orphan.id, 'trip_count': 3, 'unit_rate': 150000}
            ]
        }
        res_save = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res_save.status_code, 200, res_save.content)

        res_trips = self.client.get('/api/personnel/trips/')
        self.assertEqual(res_trips.status_code, 200, res_trips.content)
        trip_ids = [t['id'] for t in res_trips.json()]
        saved_trip = VehicleTripLog.objects.filter(vehicle=veh_orphan, date_shamsi='1405/02/05').first()
        self.assertIsNotNone(saved_trip)
        self.assertIn(saved_trip.id, trip_ids)

        res_grid = self.client.get('/api/personnel/trips/monthly-grid/?year_month=1405/02')
        self.assertEqual(res_grid.status_code, 200, res_grid.content)
        grid_rows = res_grid.json().get('rows', [])
        orphan_row = next((r for r in grid_rows if r['vehicle_id'] == veh_orphan.id), None)
        self.assertIsNotNone(orphan_row)
        self.assertEqual(orphan_row['total_trips'], 3)

    def test_orphan_vehicle_trips_not_visible_to_other_users_same_or_other_company(self):
        """همان سفر یتیم برای کاربر دیگر شرکت الف (نه سازنده) و برای کاربر شرکت ب دیده نمی‌شود."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleDriverProfile, VehicleTripLog
        veh_orphan = VehicleDriverProfile.objects.create(
            company=None,
            section=None,
            created_by=self.user_a,
            driver_name='راننده یتیم انحصاری',
            plate_number='33-444-33',
            approval_status='approved',
            is_active=True,
            default_service_rate=Decimal('150000'),
        )
        trip_orphan = VehicleTripLog.objects.create(
            vehicle=veh_orphan,
            section=None,
            project=None,
            date_shamsi='1405/02/06',
            trip_count=2,
            unit_rate=Decimal('150000'),
            total_amount=Decimal('300000'),
            created_by=self.user_a
        )

        user_other_a = User.objects.create_user(
            username='user_other_a_scope',
            password='Password123!',
            national_code='0088888889',
            phone_number='09128888889'
        )
        UserCompanyAccess.objects.create(user=user_other_a, company=self.company_a, access_level='workspace_full')
        user_other_a.user_permissions.set(Permission.objects.filter(
            codename__in=['view_sys_fleet_settlement', 'view_sys_personnel', 'view_sys_reports']
        ))

        user_b = self._create_user_b()

        self.client.force_authenticate(user_other_a)
        res_trips_other = self.client.get('/api/personnel/trips/')
        self.assertEqual(res_trips_other.status_code, 200, res_trips_other.content)
        ids_other = [t['id'] for t in res_trips_other.json()]
        self.assertNotIn(trip_orphan.id, ids_other)

        res_grid_other = self.client.get('/api/personnel/trips/monthly-grid/?year_month=1405/02')
        self.assertEqual(res_grid_other.status_code, 200, res_grid_other.content)
        grid_other_vids = {r['vehicle_id'] for r in res_grid_other.json().get('rows', [])}
        self.assertNotIn(veh_orphan.id, grid_other_vids)

        self.client.force_authenticate(user_b)
        res_trips_b = self.client.get('/api/personnel/trips/')
        self.assertEqual(res_trips_b.status_code, 200, res_trips_b.content)
        ids_b = [t['id'] for t in res_trips_b.json()]
        self.assertNotIn(trip_orphan.id, ids_b)

        res_grid_b = self.client.get('/api/personnel/trips/monthly-grid/?year_month=1405/02')
        self.assertEqual(res_grid_b.status_code, 200, res_grid_b.content)
        grid_b_vids = {r['vehicle_id'] for r in res_grid_b.json().get('rows', [])}
        self.assertNotIn(veh_orphan.id, grid_b_vids)

    def test_trips_with_vehicle_company_and_no_section_visible_to_company_user_only(self):
        """سفری با خودروی دارای company شرکت الف و بی section برای کاربر الف دیده می‌شود و برای کاربر ب نه."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleDriverProfile, VehicleTripLog
        veh_comp_only = VehicleDriverProfile.objects.create(
            company=self.company_a,
            section=None,
            driver_name='راننده شرکت الف بدون بخش',
            plate_number='44-444-44',
            approval_status='approved',
            is_active=True,
            default_service_rate=Decimal('180000'),
        )
        trip_comp_only = VehicleTripLog.objects.create(
            vehicle=veh_comp_only,
            section=None,
            project=None,
            date_shamsi='1405/02/07',
            trip_count=2,
            unit_rate=Decimal('180000'),
            total_amount=Decimal('360000')
        )
        user_b = self._create_user_b()

        self.client.force_authenticate(self.user_a)
        res_trips_a = self.client.get('/api/personnel/trips/')
        self.assertEqual(res_trips_a.status_code, 200, res_trips_a.content)
        ids_a = [t['id'] for t in res_trips_a.json()]
        self.assertIn(trip_comp_only.id, ids_a)

        self.client.force_authenticate(user_b)
        res_trips_b = self.client.get('/api/personnel/trips/')
        self.assertEqual(res_trips_b.status_code, 200, res_trips_b.content)
        ids_b = [t['id'] for t in res_trips_b.json()]
        self.assertNotIn(trip_comp_only.id, ids_b)

    def test_fleet_trips_report_returns_orphan_vehicle_trips_for_creator_only(self):
        """گزارش fleet_trips (POST /api/reports/run/) برای سازندهٔ خودروی یتیم سفرش را برمی‌گرداند و برای کاربر ب نه."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        from personnel.models import VehicleDriverProfile, VehicleTripLog
        veh_orphan = VehicleDriverProfile.objects.create(
            company=None,
            section=None,
            created_by=self.user_a,
            driver_name='راننده گزارش یتیم',
            plate_number='55-555-55',
            approval_status='approved',
            is_active=True,
            default_service_rate=Decimal('100000'),
        )
        trip_orphan = VehicleTripLog.objects.create(
            vehicle=veh_orphan,
            section=None,
            project=None,
            date_shamsi='1405/02/08',
            trip_count=1,
            unit_rate=Decimal('100000'),
            total_amount=Decimal('100000'),
            created_by=self.user_a
        )
        user_b = self._create_user_b()

        spec = {'entity': 'fleet_trips', 'fields': ['id', 'total_amount']}

        self.client.force_authenticate(self.user_a)
        res_a = self.client.post('/api/reports/run/', spec, format='json')
        self.assertEqual(res_a.status_code, 200, res_a.content)
        ids_a = [r['id'] for r in res_a.json().get('rows', [])]
        self.assertIn(trip_orphan.id, ids_a)

        self.client.force_authenticate(user_b)
        res_b = self.client.post('/api/reports/run/', spec, format='json')
        self.assertEqual(res_b.status_code, 200, res_b.content)
        ids_b = [r['id'] for r in res_b.json().get('rows', [])]
        self.assertNotIn(trip_orphan.id, ids_b)

    def test_bulk_save_with_other_company_warehouse_forbidden(self):
        """bulk-save با warehouse_id انبار شرکت ب توسط کاربر الف: ۴۰۳ و هیچ سفر تازه."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        wh_a, wh_b = self._create_warehouses()
        from personnel.models import VehicleTripLog
        cnt_before = VehicleTripLog.objects.count()

        self.client.force_authenticate(self.user_a)
        payload = {
            'warehouse_id': wh_b.id,
            'date_shamsi': '1405/02/10',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 1, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        self.assertEqual(VehicleTripLog.objects.count(), cnt_before)

    def test_update_day_trip_with_other_company_warehouse_forbidden(self):
        """update-day-trip با warehouse_id انبار شرکت ب: ۴۰۳."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        wh_a, wh_b = self._create_warehouses()
        self.client.force_authenticate(self.user_a)
        payload = {
            'vehicle_id': self.veh_a.id,
            'warehouse_id': wh_b.id,
            'date_shamsi': '1405/02/11',
            'trip_count': 1,
            'unit_rate': 200000
        }
        res = self.client.post('/api/personnel/trips/update-day-trip/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)

    def test_bulk_save_monthly_grid_with_other_company_warehouse_forbidden(self):
        """bulk-save-monthly-grid با warehouse_id انبار شرکت ب: ۴۰۳."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        wh_a, wh_b = self._create_warehouses()
        self.client.force_authenticate(self.user_a)
        payload = {
            'warehouse_id': wh_b.id,
            'year_month': '1405/02',
            'items': [
                {'vehicle_id': self.veh_a.id, 'day': 12, 'trip_count': 1, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save-monthly-grid/', payload, format='json')
        self.assertEqual(res.status_code, 403, res.content)

    def test_import_monthly_excel_with_other_company_warehouse_forbidden(self):
        """import-monthly-excel با warehouse_id انبار شرکت ب: ۴۰۳."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        wh_a, wh_b = self._create_warehouses()
        self.client.force_authenticate(self.user_a)
        excel_bio = _make_fleet_excel([{
            'driver_name': self.veh_a.driver_name,
            'plate_number': self.veh_a.plate_number,
            'day_01': 2
        }])
        excel_file = SimpleUploadedFile(
            'fleet_import_test.xlsx',
            excel_bio.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        data = {
            'file': excel_file,
            'warehouse_id': wh_b.id,
            'year_month': '1405/02'
        }
        res = self.client.post('/api/personnel/trips/import-monthly-excel/', data, format='multipart')
        self.assertEqual(res.status_code, 403, res.content)

    def test_bulk_save_with_non_existent_warehouse_returns_400(self):
        """warehouse_id ناموجود در bulk-save: ۴۰۰."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        if not apps.is_installed('warehouses'):
            self.skipTest('ماژول انبار نصب نیست.')
        self.client.force_authenticate(self.user_a)
        payload = {
            'warehouse_id': 999999,
            'date_shamsi': '1405/02/15',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 1, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 400, res.content)

    def test_bulk_save_with_company_warehouse_succeeds(self):
        """مسیر مثبت: bulk-save با warehouse_id انبار شرکت الف موفق است و سفر با همان warehouse_id ذخیره می‌شود."""
        if not apps.is_installed('personnel'):
            self.skipTest('ماژول پرسنل و حسابداری نصب نیست.')
        wh_a, wh_b = self._create_warehouses()
        from personnel.models import VehicleTripLog
        self.client.force_authenticate(self.user_a)
        payload = {
            'warehouse_id': wh_a.id,
            'date_shamsi': '1405/02/16',
            'items': [
                {'vehicle_id': self.veh_a.id, 'trip_count': 2, 'unit_rate': 200000}
            ]
        }
        res = self.client.post('/api/personnel/trips/bulk-save/', payload, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        trip = VehicleTripLog.objects.filter(vehicle=self.veh_a, date_shamsi='1405/02/16').first()
        self.assertIsNotNone(trip)
        self.assertEqual(trip.warehouse_id, wh_a.id)
        self.assertEqual(trip.trip_count, 2)

