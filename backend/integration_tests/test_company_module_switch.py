"""
کلید ماژول هر شرکت در بک‌اند (طرح ۲.۱، ت۸): مسیر API ماژولی که در شرکت خاموش است رد می‌شود و شرکت خاموش
از شرکت‌های مجاز همان درخواست کنار می‌رود؛ مسیرهای هسته دست‌نخورده‌اند.
"""
from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.middleware import MODULE_KEY, _current_allowed_companies_cache
from companies.access import get_user_allowed_companies
from companies.models import Company, Project, ProjectSection, SectionAssignment

User = get_user_model()


class CompanyModuleSwitchTests(TestCase):
    def setUp(self):
        if not apps.is_installed('personnel'):
            self.skipTest('accounting module is not installed')
        self.on = Company.objects.create(code='MS-ON', name='شرکت روشن')
        self.off = Company.objects.create(code='MS-OFF', name='شرکت خاموش', disabled_modules=['accounting'])
        self.user = User.objects.create_user(username='ms_member', password='x-pass-123', phone_number='09170000301')
        for company in (self.on, self.off):
            project = Project.objects.create(company=company, code='P', name='پروژه')
            section = ProjectSection.objects.create(project=project, code='S', name='بخش')
            SectionAssignment.objects.create(user=self.user, section=section, role='employee')
        self.client = APIClient()
        self.client.force_login(self.user)

    def test_module_api_for_disabled_company_is_rejected(self):
        r = self.client.get('/api/personnel/counterparties/', HTTP_X_COMPANY_ID=str(self.off.id))
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json().get('error'), 'module_disabled_for_company')

    def test_module_api_for_enabled_company_passes_the_switch(self):
        r = self.client.get('/api/personnel/counterparties/', HTTP_X_COMPANY_ID=str(self.on.id))
        self.assertNotIn(b'module_disabled_for_company', r.content)

    def test_core_api_ignores_the_module_switch(self):
        r = self.client.get('/api/org/projects/', HTTP_X_COMPANY_ID=str(self.off.id))
        self.assertNotEqual(r.status_code, 403)

    def test_section_level_gates_close_for_disabled_company_without_header(self):
        # کاربر پیوندی با سطح نوشتن بیمه و مالیات؛ بدون هدر شرکت هم دروازهٔ حوزه در مسیر ماژول بسته است
        from companies.models import UserCompanyAccess
        linked = User.objects.create_user(username='ms_linked', password='x-pass-123', phone_number='09170000302')
        UserCompanyAccess.objects.create(user=linked, company=self.off, section_levels={'insurance_tax': 'write'})
        client = APIClient()
        client.force_authenticate(linked)
        r = client.patch(f'/api/personnel/companies/{self.off.id}/payroll-profile/', {'workshop_code': '1234567890'},
                         format='json')
        self.assertIn(r.status_code, (403, 404))

    def test_section_level_is_none_inside_module_scope_only(self):
        from companies.access import company_section_level, request_module
        from companies.models import UserCompanyAccess
        UserCompanyAccess.objects.create(user=self.user, company=self.off, section_levels={'insurance_tax': 'write'})
        self.assertEqual(company_section_level(self.user, self.off.id, 'insurance_tax'), 'write')
        with request_module('accounting'):
            self.assertEqual(company_section_level(self.user, self.off.id, 'insurance_tax'), 'none')
            self.assertEqual(company_section_level(self.user, self.on.id, 'insurance_tax'), 'none')

    def test_allowed_companies_drop_disabled_company_only_inside_module_request(self):
        everywhere = set(get_user_allowed_companies(self.user).values_list('id', flat=True))
        self.assertEqual(everywhere, {self.on.id, self.off.id})
        token = _current_allowed_companies_cache.set({MODULE_KEY: 'accounting'})
        try:
            in_module = set(get_user_allowed_companies(self.user).values_list('id', flat=True))
        finally:
            _current_allowed_companies_cache.reset(token)
        self.assertEqual(in_module, {self.on.id})
