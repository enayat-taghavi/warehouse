"""
آزمون‌های لایهٔ شرکت در هسته (طرح Modular_Deploy_Options، گام ۱):
دسترسی مستقیم و مشتق، API هستهٔ /api/org/، و شناسهٔ عددی انبار در قالب گزارش.
"""
from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from companies.access import (
    derived_company_ids,
    get_user_allowed_companies,
    validate_user_company_access,
)
from common.mixins import DeleteImpactChanged
from companies.models import Company, UserCompanyAccess

User = get_user_model()


class CompanyAccessTests(TestCase):
    def setUp(self):
        self.c1 = Company.objects.create(code='CORE-C1', name='شرکت یک')
        self.c2 = Company.objects.create(code='CORE-C2', name='شرکت دو')
        self.c3 = Company.objects.create(code='CORE-C3', name='شرکت سه')
        self.user = User.objects.create_user(username='core_user', password='x-pass-123', phone_number='09170000001')

    def test_direct_access_levels(self):
        UserCompanyAccess.objects.create(user=self.user, company=self.c1, access_level='workspace_full')
        UserCompanyAccess.objects.create(user=self.user, company=self.c2, access_level='docs_read')

        full = set(get_user_allowed_companies(self.user).values_list('id', flat=True))
        docs = set(get_user_allowed_companies(self.user, required_level='docs_read').values_list('id', flat=True))
        self.assertEqual(full, {self.c1.id})
        self.assertEqual(docs, {self.c1.id, self.c2.id})

        self.assertEqual(validate_user_company_access(self.user, self.c1.id), self.c1.id)
        with self.assertRaises(PermissionDenied):
            validate_user_company_access(self.user, self.c2.id)

    def test_inactive_company_is_never_allowed(self):
        UserCompanyAccess.objects.create(user=self.user, company=self.c3, access_level='workspace_full')
        self.c3.is_active = False
        self.c3.save(update_fields=['is_active'])
        self.assertFalse(get_user_allowed_companies(self.user).filter(id=self.c3.id).exists())


class CoreCompanyApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.c1 = Company.objects.create(code='API-C1', name='شرکت الف')
        self.c2 = Company.objects.create(code='API-C2', name='شرکت ب')
        self.admin = User.objects.create_superuser(username='core_admin', password='x-pass-123', phone_number='09170000002')
        self.user = User.objects.create_user(username='core_member', password='x-pass-123', phone_number='09170000003')
        UserCompanyAccess.objects.create(user=self.user, company=self.c1, access_level='workspace_full')

    def test_list_is_scoped_to_allowed_companies(self):
        self.client.force_authenticate(self.user)
        r = self.client.get('/api/org/companies/')
        self.assertEqual(r.status_code, 200)
        rows = r.json()
        rows = rows.get('results', rows) if isinstance(rows, dict) else rows
        self.assertEqual({row['code'] for row in rows}, {'API-C1'})

    def test_user_available_reports_access_level(self):
        self.client.force_authenticate(self.user)
        r = self.client.get('/api/org/companies/user-available/')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['companies'][0]['user_access_level'], 'workspace_full')

    def test_only_admins_create_and_code_is_normalized(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post('/api/org/companies/', {'code': 'new', 'name': 'جدید'}, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        r = self.client.post('/api/org/companies/', {'code': ' new-co ', 'name': 'جدید'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['code'], 'NEW-CO')

    def test_non_superuser_cannot_grant_access_outside_own_companies(self):
        writer = User.objects.create_user(username='core_writer', password='x-pass-123', phone_number='09170000004', is_staff=True)
        UserCompanyAccess.objects.create(user=writer, company=self.c1, access_level='workspace_full')
        target = User.objects.create_user(username='core_target', password='x-pass-123', phone_number='09170000005')
        self.client.force_authenticate(writer)
        r = self.client.post('/api/org/user-company-access/', {'user': target.id, 'company': self.c2.id, 'access_level': 'workspace_full'}, format='json')
        self.assertEqual(r.status_code, 403)
        r = self.client.post('/api/org/user-company-access/', {'user': target.id, 'company': self.c1.id, 'access_level': 'workspace_full'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)


class CompanyDeleteImpactTests(TestCase):
    """طرح بازبینی فرانت شرکت‌ها، گام ۸ (A21 و §۶): اثر حذف شرکت پیش از حذف آبشاری."""

    def setUp(self):
        self.client = APIClient()
        self.c1 = Company.objects.create(code='DEL-C1', name='شرکت حذف یک')
        self.c2 = Company.objects.create(code='DEL-C2', name='شرکت حذف دو')
        self.admin = User.objects.create_superuser(username='del_admin', password='x-pass-123', phone_number='09170000011')
        self.staff = User.objects.create_user(username='del_staff', password='x-pass-123', phone_number='09170000012', is_staff=True)
        self.member = User.objects.create_user(username='del_member', password='x-pass-123', phone_number='09170000013')
        UserCompanyAccess.objects.create(user=self.staff, company=self.c1, access_level='workspace_full')
        UserCompanyAccess.objects.create(user=self.member, company=self.c1, access_level='workspace_full')

    def url(self, company):
        return f'/api/org/companies/{company.id}/delete_impact/'

    def test_impact_counts_cascaded_rows_including_fast_deletes(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get(self.url(self.c1))
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertFalse(body['blocked'])
        self.assertEqual(body['blockers'], [])
        self.assertEqual(body['protected'], [])
        access_label = str(UserCompanyAccess._meta.verbose_name)
        rows = {row['model_name']: row['count'] for row in body['impact']}
        self.assertEqual(rows.get(access_label), 2)
        self.assertEqual(body['total_affected'], sum(rows.values()))
        # فقط محاسبه است و چیزی پاک نمی‌شود
        self.assertEqual(UserCompanyAccess.objects.filter(company=self.c1).count(), 2)
        self.assertTrue(Company.objects.filter(id=self.c1.id).exists())

    def test_staff_in_scope_cannot_create_delete_or_see_impact(self):
        # ساخت، حذف و اثر حذف شرکت فقط برای superuser است (F6)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(self.url(self.c1)).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/org/companies/{self.c1.id}/').status_code, 403)
        self.assertTrue(Company.objects.filter(id=self.c1.id).exists())
        r = self.client.post('/api/org/companies/', {'code': 'DEL-C3', 'name': 'شرکت تازه'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(Company.objects.filter(code='DEL-C3').exists())

    def test_company_outside_scope_is_404(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(self.url(self.c2)).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/org/companies/{self.c2.id}/').status_code, 404)
        self.assertTrue(Company.objects.filter(id=self.c2.id).exists())

    def test_member_without_delete_right_gets_403_not_counts(self):
        self.client.force_authenticate(self.member)
        r = self.client.get(self.url(self.c1))
        self.assertEqual(r.status_code, 403)
        self.assertNotIn('impact', r.json())
        # پیش‌تر destroy مقاوم، PermissionDenied را به ۴۰۰ «خطای ناشناخته» تبدیل می‌کرد
        r = self.client.delete(f'/api/org/companies/{self.c1.id}/')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(Company.objects.filter(id=self.c1.id).exists())

    def test_anonymous_is_rejected(self):
        self.assertIn(self.client.get(self.url(self.c1)).status_code, (401, 403))

    def test_business_blocker_is_reported_and_blocks_destroy_with_its_message(self):
        from unittest import mock
        message = 'این شرکت دسترسی کاربر دارد و نمی‌توان آن را حذف کرد.'
        with mock.patch('companies.views.contributions', return_value=[(10, 'user_accesses', message)]):
            self.client.force_authenticate(self.admin)
            r = self.client.get(self.url(self.c1))
            self.assertEqual(r.status_code, 200, r.content)
            self.assertTrue(r.json()['blocked'])
            self.assertEqual(r.json()['blockers'], [message])
            r = self.client.delete(f'/api/org/companies/{self.c1.id}/')
            self.assertEqual(r.status_code, 400)
            self.assertEqual(r.json(), [message])
        self.assertTrue(Company.objects.filter(id=self.c1.id).exists())

    def test_protected_relation_marks_impact_blocked(self):
        from unittest import mock
        from django.db.models import ProtectedError
        from django.db.models.deletion import Collector
        access = UserCompanyAccess.objects.filter(company=self.c1).first()
        with mock.patch.object(Collector, 'collect', side_effect=ProtectedError('protected', {access})):
            self.client.force_authenticate(self.admin)
            r = self.client.get(self.url(self.c1))
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertTrue(body['blocked'])
        self.assertEqual(body['protected'], [{'model_name': str(UserCompanyAccess._meta.verbose_name), 'count': 1}])
        self.assertEqual(body['impact'], [])

    def test_delete_with_stale_expected_total_is_409_and_keeps_data(self):
        self.client.force_authenticate(self.admin)
        total = self.client.get(self.url(self.c1)).json()['total_affected']
        # کاربر دیگری پس از دیدن اثر حذف، رکورد وابستهٔ تازه افزوده است
        extra = User.objects.create_user(username='del_extra', password='x-pass-123', phone_number='09170000014')
        UserCompanyAccess.objects.create(user=extra, company=self.c1, access_level='docs_read')
        r = self.client.delete(f'/api/org/companies/{self.c1.id}/?expected_total={total}')
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.json()['detail'], DeleteImpactChanged.default_detail)
        self.assertTrue(Company.objects.filter(id=self.c1.id).exists())
        self.assertEqual(UserCompanyAccess.objects.filter(company=self.c1).count(), 3)
        r = self.client.delete(f'/api/org/companies/{self.c1.id}/?expected_total=abc')
        self.assertEqual(r.status_code, 409)

    def test_delete_with_matching_expected_total_cascades(self):
        self.client.force_authenticate(self.admin)
        total = self.client.get(self.url(self.c1)).json()['total_affected']
        r = self.client.delete(f'/api/org/companies/{self.c1.id}/?expected_total={total}')
        self.assertEqual(r.status_code, 204, r.content)
        self.assertFalse(Company.objects.filter(id=self.c1.id).exists())
        self.assertEqual(UserCompanyAccess.objects.filter(company_id=self.c1.id).count(), 0)

    def test_expected_total_check_does_not_bypass_delete_permission(self):
        self.client.force_authenticate(self.member)
        r = self.client.delete(f'/api/org/companies/{self.c1.id}/?expected_total=999')
        self.assertEqual(r.status_code, 403)
        self.assertTrue(Company.objects.filter(id=self.c1.id).exists())

    def test_admin_delete_without_blockers_cascades(self):
        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=False):
            r = self.client.delete(f'/api/org/companies/{self.c2.id}/')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(Company.objects.filter(id=self.c2.id).exists())


class CompanyExcelImportTests(TestCase):
    """F4: two-row header import, create-only, superuser-only."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(username='imp_admin', password='x-pass-123', phone_number='09170000081')
        self.staff = User.objects.create_user(username='imp_staff', password='x-pass-123', phone_number='09170000082', is_staff=True)
        Company.objects.create(code='IMP-OLD', name='old')

    def _file(self, rows):
        import io, openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['fa-code', 'fa-name', 'fa-national'])
        ws.append(['code', 'name', 'national_id'])
        for r in rows:
            ws.append(r)
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = 'c.xlsx'
        return buf

    def test_non_superuser_forbidden(self):
        self.client.force_authenticate(self.staff)
        r = self.client.post('/api/org/companies/import-excel/', {'file': self._file([['IMP-1', 'a', '']])}, format='multipart')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(Company.objects.filter(code='IMP-1').exists())

    def test_dry_run_then_import_reports_duplicates(self):
        self.client.force_authenticate(self.admin)
        rows = [['IMP-1', 'a', ''], ['IMP-OLD', 'dup', ''], ['IMP-2', 'b', '']]
        r = self.client.post('/api/org/companies/import-excel/', {'file': self._file(rows), 'dry_run': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['summary']['created'], 2)
        self.assertFalse(Company.objects.filter(code='IMP-1').exists())
        r = self.client.post('/api/org/companies/import-excel/', {'file': self._file(rows)}, format='multipart')
        body = r.json()
        self.assertEqual(body['summary']['created'], 2)
        self.assertEqual(body['summary']['skipped'], 1)
        self.assertEqual(body['errors'][0]['row'], 4)
        self.assertTrue(Company.objects.filter(code__in=['IMP-1', 'IMP-2']).count() == 2)
        self.assertEqual(Company.objects.get(code='IMP-OLD').name, 'old')

    def test_template_has_header_only(self):
        import io, openpyxl
        self.client.force_authenticate(self.admin)
        r = self.client.get('/api/org/companies/export-excel/?template=1')
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        self.assertEqual(ws.max_row, 2)
