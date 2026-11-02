"""
گام ج طرح اصلاح فاکتور (۱۱ آبان ۱۴۰۵): فهرست فاکتور بی section_id («همه بخش‌ها») فقط دامنهٔ کاربر را می‌دهد؛
section_id فقط تنگ می‌کند و مقدار نامعتبر خطای ۵۰۰ نمی‌دهد.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.models import Counterparty, ExpenseInvoice
from personnel.scoped_test_support import grant_section_perms

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


class InvoiceAllSectionsScopeTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IAS', name='شرکت یک', is_active=True)
        project = Project.objects.create(company=self.company, code='IAS-P', name='پروژه یک')
        self.s1 = ProjectSection.objects.create(project=project, code='IAS-S1', name='بخش یک')
        self.s2 = ProjectSection.objects.create(project=project, code='IAS-S2', name='بخش دو')
        self.s3 = ProjectSection.objects.create(project=project, code='IAS-S3', name='بخش بی‌دسترسی')
        self.other_company = Company.objects.create(code='IAS-B', name='شرکت دو', is_active=True)
        other_project = Project.objects.create(company=self.other_company, code='IAS-BP', name='پروژه دو')
        self.sb = ProjectSection.objects.create(project=other_project, code='IAS-SB', name='بخش شرکت دو')

        self.emp = User.objects.create_user(username='ias_emp', password='x')
        UserCompanyAccess.objects.create(user=self.emp, company=self.company, is_default=True)
        grant_section_perms(self.emp, [], section=self.s1, role='employee', exact=False)
        grant_section_perms(self.emp, [], section=self.s2, role='employee', exact=False)

        creator = User.objects.create_user(username='ias_creator', password='x')
        cp = Counterparty.objects.create(company=self.company, name='طرف یک', counterparty_type='other')
        cp_b = Counterparty.objects.create(company=self.other_company, name='طرف دو', counterparty_type='other')
        self.inv = {}
        for key, sec, party in (('s1', self.s1, cp), ('s2', self.s2, cp), ('s3', self.s3, cp), ('sb', self.sb, cp_b)):
            self.inv[key] = ExpenseInvoice.objects.create(
                section=sec, counterparty=party, invoice_number=f'IAS-{key}', invoice_date_shamsi='1405/08/01',
                amount=Decimal('1000'), description='d', created_by=creator)

    def ids(self, **params):
        c = APIClient()
        c.force_authenticate(self.emp)
        res = c.get(BASE, params, HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200, res.content[:300])
        body = res.json()
        rows = body['results'] if isinstance(body, dict) else body
        return {r['id'] for r in rows}

    def test_all_sections_returns_only_user_scope(self):
        self.assertEqual(self.ids(), {self.inv['s1'].pk, self.inv['s2'].pk})

    def test_all_sections_paginated_same_scope(self):
        self.assertEqual(self.ids(page=1, page_size=50), {self.inv['s1'].pk, self.inv['s2'].pk})

    def test_section_filter_only_narrows(self):
        self.assertEqual(self.ids(section_id=self.s1.pk), {self.inv['s1'].pk})
        self.assertEqual(self.ids(section_id=self.s3.pk), set())
        self.assertEqual(self.ids(section_id=self.sb.pk), set())

    def test_invalid_filter_value_is_ignored_not_500(self):
        self.assertEqual(self.ids(section_id='abc'), {self.inv['s1'].pk, self.inv['s2'].pk})
        self.assertEqual(self.ids(project_id='x'), {self.inv['s1'].pk, self.inv['s2'].pk})

    def test_export_without_section_uses_scoped_queryset(self):
        c = APIClient()
        c.force_authenticate(self.emp)
        res = c.get(f'{BASE}export-excel/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200)
