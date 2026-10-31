"""
طرح ۳.۱-ب: طرف حساب روی طرف بیرونی هسته. انتخاب شرکت بی 4xx، فیلدهای تخت قدیمی بانک، حساب اصلی، شبا،
پوشیده‌ها، حذف با تنخواه و سابقه. سناریوهای دامنه و تکرار در test_counterparty_parties.py است.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuditLog
from companies.models import Company, Project, ProjectSection
from companies.testing import grant_membership
from contacts.models import ExternalParty
from personnel.models import Counterparty, PartyBankAccount, PettyCashTransaction
from personnel.sheba_utils import normalize_sheba

User = get_user_model()
URL = '/api/personnel/counterparties/'
SHEBA = 'IR450120000000101111111001'
SHEBA_2 = 'IR530170000000202222222002'


class CounterpartyCoreTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.a = Company.objects.create(code='CPC_A', name='شرکت الف')
        self.b = Company.objects.create(code='CPC_B', name='شرکت ب')
        self.admin = User.objects.create_superuser(username='cpc_admin', password='x')
        self.member = User.objects.create_user(username='cpc_member', password='x')
        grant_membership(self.member, self.a)

    def _post(self, user, data, **extra):
        self.client.force_authenticate(user=user)
        return self.client.post(URL, data, format='json', **extra)

    def test_multi_company_user_without_company_lands_in_first_allowed(self):
        grant_membership(self.member, self.b)
        res = self._post(self.member, {'name': 'بی‌شرکت', 'counterparty_type': 'other'})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data['company'], min(self.a.id, self.b.id))
        log = AuditLog.objects.filter(module='invoices', target_model='Counterparty', action='CREATE').latest('id')
        self.assertTrue(log.details.get('company_fallback'))

    def test_user_without_company_gets_403_and_superuser_without_company_400(self):
        loner = User.objects.create_user(username='cpc_loner', password='x')
        self.assertEqual(self._post(loner, {'name': 'x'}).status_code, 403)
        self.assertEqual(self._post(self.admin, {'name': 'x'}).status_code, 400)
        self.assertEqual(self._post(self.admin, {'name': 'x'}, HTTP_X_COMPANY_ID=str(self.b.id)).status_code, 201)

    def test_legacy_flat_bank_fields_create_primary_account(self):
        res = self._post(self.member, {'name': 'تخت', 'bank_name': 'بانک ملت', 'sheba_number': SHEBA[2:],
                                       'account_number': '۰۱۰۱۱۱۱۱۱۱۰۰۱'})
        self.assertEqual(res.status_code, 201, res.content)
        account = PartyBankAccount.objects.get(party_id=res.data['party'])
        self.assertEqual(account.sheba_number, SHEBA)
        self.assertTrue(account.is_primary)
        self.assertEqual(account.account_number, '0101111111001')
        # ثبت‌کننده دید کامل دارد؛ شبای تخت مثل شکل پیشین بی IR
        self.assertEqual(res.data['sheba_number'], SHEBA[2:])
        self.assertFalse(res.data['bank_masked'])
        self.assertEqual(res.data['bank_accounts'][0]['sheba_number'], SHEBA)

    def test_invalid_sheba_rejected(self):
        res = self._post(self.member, {'name': 'بد', 'sheba_number': 'IR000000000000000000000000'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('sheba_number', res.data)

    def test_normalize_sheba(self):
        self.assertEqual(normalize_sheba(' ir 45-0120 0000 0010 1111 1110 01 '), SHEBA)
        self.assertEqual(normalize_sheba('۴۵۰۱۲۰۰۰۰۰۰۰۱۰۱۱۱۱۱۱۱۰۰۱'), SHEBA)
        self.assertEqual(normalize_sheba('ir12'), 'IR12')

    def test_one_primary_and_promotion_after_delete(self):
        cp = Counterparty.objects.create(company=self.a, name='دوحسابی')
        first = PartyBankAccount.objects.create(party=cp.party, sheba_number=SHEBA)
        second = PartyBankAccount.objects.create(party=cp.party, sheba_number=SHEBA_2, is_primary=True)
        first.refresh_from_db()
        self.assertFalse(first.is_primary)
        self.assertTrue(second.is_primary)
        second.delete()
        first.refresh_from_db()
        self.assertTrue(first.is_primary)

    def test_masked_value_never_overwrites_real_value(self):
        res = self._post(self.member, {'name': 'پوشیده', 'sheba_number': SHEBA, 'national_id': '0012345678'})
        cp_id = res.data['id']
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch(f'{URL}{cp_id}/', {'sheba_number': '********************1001',
                                                   'national_id': '******5678', 'phone': '0211'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        cp = Counterparty.objects.get(pk=cp_id)
        self.assertEqual(cp.party.national_id, '0012345678')
        self.assertEqual(cp.party.bank_accounts.get().sheba_number, SHEBA)
        self.assertEqual(cp.party.phone, '0211')

    def test_destroy_with_petty_cash_only_deactivates(self):
        project = Project.objects.create(company=self.a, code='CPC_P', name='پ')
        section = ProjectSection.objects.create(project=project, code='CPC_S', name='ب')
        used = Counterparty.objects.create(company=self.a, name='استفاده‌شده')
        PettyCashTransaction.objects.create(section=section, custodian=self.member, amount=1000,
                                            transaction_date_shamsi='1405/01/01', title='t', counterparty=used)
        unused = Counterparty.objects.create(company=self.a, name='آزاد')
        PartyBankAccount.objects.create(party=unused.party, sheba_number=SHEBA)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.delete(f'{URL}{used.id}/').status_code, 204)
        used.refresh_from_db()
        self.assertFalse(used.is_active)
        self.assertEqual(self.client.delete(f'{URL}{unused.id}/').status_code, 204)
        self.assertFalse(Counterparty.objects.filter(pk=unused.pk).exists())
        self.assertFalse(ExternalParty.objects.filter(pk=unused.party_id).exists())

    def test_audit_never_stores_raw_sheba_or_account(self):
        self._post(self.member, {'name': 'سابقه', 'sheba_number': SHEBA, 'account_number': '0101111111001'})
        for log in AuditLog.objects.filter(module='invoices'):
            text = str(log.before_state) + str(log.after_state) + str(log.details)
            self.assertNotIn(SHEBA[2:], text)
            self.assertNotIn('0101111111001', text)
        self.assertTrue(AuditLog.objects.filter(module='invoices', target_model='PartyBankAccount').exists())
