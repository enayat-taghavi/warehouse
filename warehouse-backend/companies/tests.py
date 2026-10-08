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

    def test_section_membership_grants_derived_access_when_accounting_installed(self):
        if not apps.is_installed('personnel'):
            self.skipTest('accounting module is not installed')
        from personnel.models import FinancialProject, ProjectSection, UserSectionAssignment
        project = FinancialProject.objects.create(company=self.c3, code='P1', name='پروژه')
        section = ProjectSection.objects.create(project=project, code='S1', name='بخش')
        UserSectionAssignment.objects.create(user=self.user, section=section)

        self.assertIn(self.c3.id, derived_company_ids(self.user))
        allowed = set(get_user_allowed_companies(self.user).values_list('id', flat=True))
        self.assertIn(self.c3.id, allowed)
        # دسترسی مشتق فقط سطح فضای کاری است، نه دسترسی مدارک
        docs = set(get_user_allowed_companies(self.user, required_level='docs_read').values_list('id', flat=True))
        self.assertNotIn(self.c3.id, docs)


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

    def test_company_with_warehouse_cannot_be_deleted(self):
        if not apps.is_installed('warehouses'):
            self.skipTest('warehouse module is not installed')
        from warehouses.models import Warehouse
        Warehouse.objects.create(name='انبار', code='WH-API-1', company=self.c2)
        self.client.force_authenticate(self.admin)
        r = self.client.delete(f'/api/org/companies/{self.c2.id}/')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Company.objects.filter(id=self.c2.id).exists())

    def test_non_superuser_cannot_grant_access_outside_own_companies(self):
        writer = User.objects.create_user(username='core_writer', password='x-pass-123', phone_number='09170000004', is_staff=True)
        UserCompanyAccess.objects.create(user=writer, company=self.c1, access_level='workspace_full')
        target = User.objects.create_user(username='core_target', password='x-pass-123', phone_number='09170000005')
        self.client.force_authenticate(writer)
        r = self.client.post('/api/org/user-company-access/', {'user': target.id, 'company': self.c2.id, 'access_level': 'workspace_full'}, format='json')
        self.assertEqual(r.status_code, 403)
        r = self.client.post('/api/org/user-company-access/', {'user': target.id, 'company': self.c1.id, 'access_level': 'workspace_full'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)


class ReportTemplateWarehouseIdTests(TestCase):
    def setUp(self):
        if not (apps.is_installed('reports') and apps.is_installed('warehouses')):
            self.skipTest('reports or warehouse module is not installed')
        from warehouses.models import Warehouse
        self.owner = User.objects.create_superuser(username='rt_owner', password='x-pass-123', phone_number='09170000006')
        self.wh = Warehouse.objects.create(name='انبار گزارش', code='WH-RT-1')

    def test_unknown_warehouse_is_rejected_and_delete_nulls_reference(self):
        from reports.models import ReportTemplate
        from reports.serializers import ReportTemplateSerializer

        bad = ReportTemplateSerializer(data={'name': 'ق', 'entity': 'item', 'spec': {'entity': 'item'}, 'warehouse': 999999})
        self.assertFalse(bad.is_valid())
        self.assertIn('warehouse', bad.errors)

        tpl = ReportTemplate.objects.create(name='ق', entity='item', spec={'entity': 'item'}, owner=self.owner, warehouse_id=self.wh.id)
        self.wh.delete()
        tpl.refresh_from_db()
        self.assertIsNone(tpl.warehouse_id)
