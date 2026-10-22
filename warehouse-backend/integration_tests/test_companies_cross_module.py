from django.test import TestCase
from django.apps import apps
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from companies.models import Company, UserCompanyAccess
from companies.access import get_user_allowed_companies, derived_company_ids

User = get_user_model()


class CompanyCrossModuleIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.c3 = Company.objects.create(code='INT-C3', name='شرکت ادغامی')
        self.user = User.objects.create_user(username='int_member', password='x-pass-123', phone_number='09170000099')

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
        # membership opens no section (T11): the archive stays closed without a section level
        from companies.access import companies_with_section
        docs = set(companies_with_section(self.user, 'docs_archive', 'read').values_list('id', flat=True))
        self.assertNotIn(self.c3.id, docs)

    def test_company_with_warehouse_cannot_be_deleted(self):
        if not apps.is_installed('warehouses'):
            self.skipTest('warehouse module is not installed')
        from warehouses.models import Warehouse
        c2 = Company.objects.create(code='INT-C2', name='شرکت دارای انبار')
        admin = User.objects.create_superuser(username='int_admin', password='x-pass-123', phone_number='09170000098')
        Warehouse.objects.create(name='انبار', code='WH-INT-1', company=c2)
        self.client.force_authenticate(admin)
        r = self.client.delete(f'/api/org/companies/{c2.id}/')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(Company.objects.filter(id=c2.id).exists())


class ReportTemplateWarehouseIdIntegrationTests(TestCase):
    def setUp(self):
        if not (apps.is_installed('reports') and apps.is_installed('warehouses')):
            self.skipTest('reports or warehouse module is not installed')
        from warehouses.models import Warehouse
        self.owner = User.objects.create_superuser(username='rt_owner_int', password='x-pass-123', phone_number='09170000097')
        self.wh = Warehouse.objects.create(name='انبار گزارش', code='WH-RT-INT-1')

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
