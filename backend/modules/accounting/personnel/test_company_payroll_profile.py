"""
آزمون‌های طرح ۲.۱ (ت۵ و ت۶) در حسابداری: پروندهٔ بیمه و مالیات شرکت (CompanyPayrollProfile)
با دروازهٔ حوزهٔ insurance_tax، و حساب اصلی شرکت فقط از CompanyBankAccount.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.permission_sections import CORE_FIELD_SECTIONS, CORE_SECTIONS, section_map
from personnel.models import (
    Company, CompanyBankAccount, CompanyPayrollProfile, SectionAssignment, UserCompanyAccess,
    primary_bank_account,
)

User = get_user_model()


class CompanyPayrollProfileApiTests(TestCase):
    def setUp(self):
        self.a = Company.objects.create(code='PP-A', name='شرکت الف')
        self.b = Company.objects.create(code='PP-B', name='شرکت ب')
        self.admin = User.objects.create_superuser(username='pp_admin', password='x-pass-123', phone_number='09170000091')
        self.user = User.objects.create_user(username='pp_user', password='x-pass-123', phone_number='09170000092')
        self.client = APIClient()
        self.url = f'/api/personnel/companies/{self.a.id}/payroll-profile/'

    def _as(self, user):
        self.client.force_authenticate(user)

    def test_section_belongs_to_accounting_contribution(self):
        self.assertNotIn('insurance_tax', {s['key'] for s in CORE_SECTIONS})
        self.assertNotIn('workshop_code', CORE_FIELD_SECTIONS)
        self.assertIn('insurance_tax', section_map())

    def test_get_without_profile_returns_empty_and_creates_nothing(self):
        self._as(self.admin)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['company'], self.a.id)
        self.assertIsNone(res.json()['workshop_code'])
        self.assertFalse(CompanyPayrollProfile.objects.exists())

    def test_write_level_creates_and_updates_profile(self):
        UserCompanyAccess.objects.create(user=self.user, company=self.a, section_levels={'insurance_tax': 'write'})
        self._as(self.user)
        res = self.client.patch(self.url, {'workshop_code': ' ۱۲۳۴۵۶۷۸۹۰ ', 'employer_name': 'کارفرما'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['workshop_code'], '1234567890')
        profile = CompanyPayrollProfile.objects.get(company=self.a)
        self.assertEqual(profile.employer_name, 'کارفرما')
        res = self.client.patch(self.url, {'tax_memory_id': 'A1B2C3'}, format='json')
        self.assertEqual(res.status_code, 200)
        profile.refresh_from_db()
        self.assertEqual((profile.workshop_code, profile.tax_memory_id), ('1234567890', 'A1B2C3'))
        self.assertEqual(CompanyPayrollProfile.objects.count(), 1)
        # شرکت از نشانی می‌آید؛ فرستادن company آن را جابه‌جا نمی‌کند
        self.client.patch(self.url, {'company': self.b.id, 'contract_row': '7'}, format='json')
        profile.refresh_from_db()
        self.assertEqual(profile.company_id, self.a.id)

    def test_read_level_reads_but_cannot_write(self):
        CompanyPayrollProfile.objects.create(company=self.a, workshop_code='111')
        UserCompanyAccess.objects.create(user=self.user, company=self.a, section_levels={'insurance_tax': 'read'})
        self._as(self.user)
        self.assertEqual(self.client.get(self.url).json()['workshop_code'], '111')
        self.assertEqual(self.client.patch(self.url, {'workshop_code': '222'}, format='json').status_code, 403)
        self.assertEqual(CompanyPayrollProfile.objects.get(company=self.a).workshop_code, '111')

    def test_member_reads_but_other_section_holder_does_not(self):
        SectionAssignment.objects.create(user=self.user, role='employee', company=self.a)
        self._as(self.user)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.patch(self.url, {'workshop_code': '1'}, format='json').status_code, 403)

        other = User.objects.create_user(username='pp_other', password='x-pass-123', phone_number='09170000093')
        UserCompanyAccess.objects.create(user=other, company=self.a, section_levels={'identity': 'write'})
        self._as(other)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    # ─── ت۱۲ طرح ۲.۲: شناسه‌ها فقط با سطح «خواندن» insurance_tax ─────────────────
    def _filled_profile(self):
        return CompanyPayrollProfile.objects.create(
            company=self.a, workshop_code='1234567890', social_security_branch_code='12',
            social_security_branch_name='شعبه', contract_row='7', employer_name='کارفرما',
            tax_memory_id='A1B2C3', tax_economic_code='1' * 16)

    def test_member_without_level_gets_same_shape_with_null_identifiers(self):
        self._filled_profile()
        SectionAssignment.objects.create(user=self.user, role='manager', company=self.a)
        self._as(self.user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body['company'], self.a.id)
        self.assertFalse(body['identifiers_visible'])
        for field in CompanyPayrollProfile.FIELDS:
            self.assertIn(field, body)
            self.assertIsNone(body[field], field)

    def test_reader_and_superuser_see_identifiers(self):
        self._filled_profile()
        UserCompanyAccess.objects.create(user=self.user, company=self.a, section_levels={'insurance_tax': 'read'})
        for who in (self.user, self.admin):
            self._as(who)
            body = self.client.get(self.url).json()
            self.assertTrue(body['identifiers_visible'])
            self.assertEqual((body['workshop_code'], body['tax_memory_id'], body['tax_economic_code']),
                             ('1234567890', 'A1B2C3', '1' * 16))

    def test_reader_of_other_company_sees_nothing_here(self):
        self._filled_profile()
        UserCompanyAccess.objects.create(user=self.user, company=self.b, section_levels={'insurance_tax': 'read'})
        SectionAssignment.objects.create(user=self.user, role='employee', company=self.a)
        self._as(self.user)
        body = self.client.get(self.url).json()
        self.assertFalse(body['identifiers_visible'])
        self.assertIsNone(body['workshop_code'])

    def test_writer_patch_response_is_visible(self):
        UserCompanyAccess.objects.create(user=self.user, company=self.a, section_levels={'insurance_tax': 'write'})
        self._as(self.user)
        body = self.client.patch(self.url, {'tax_memory_id': 'Z9'}, format='json').json()
        self.assertTrue(body['identifiers_visible'])
        self.assertEqual(body['tax_memory_id'], 'Z9')

    def test_foreign_company_is_hidden(self):
        UserCompanyAccess.objects.create(user=self.user, company=self.b, section_levels={'insurance_tax': 'write'})
        self._as(self.user)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.patch(self.url, {'workshop_code': '1'}, format='json').status_code, 404)
        self.assertFalse(CompanyPayrollProfile.objects.exists())


class PrimaryBankAccountTests(TestCase):
    def setUp(self):
        self.c = Company.objects.create(code='PB-A', name='شرکت بانک')

    def _acc(self, sheba, **kw):
        return CompanyBankAccount.objects.create(company=self.c, bank_name='بانک', sheba_number=sheba, **kw)

    def test_helper_follows_single_primary(self):
        self.assertIsNone(primary_bank_account(self.c))
        first = self._acc('IR000000000000000000000001')
        self.assertEqual(primary_bank_account(self.c), first)
        self.assertEqual(primary_bank_account(self.c.id), first)
        second = self._acc('IR000000000000000000000002', is_primary=True)
        self.assertEqual(primary_bank_account(self.c), second)
        self.assertEqual(CompanyBankAccount.objects.filter(company=self.c, is_primary=True).count(), 1)
        second.delete()
        self.assertEqual(primary_bank_account(self.c), first)

    def test_inactive_primary_is_not_returned(self):
        self._acc('IR000000000000000000000003', is_active=False)
        self.assertIsNone(primary_bank_account(self.c))
        self.assertIsNone(primary_bank_account(None))
