# -*- coding: utf-8 -*-
"""
آزمون‌های سناریویی طرف‌حساب‌های محدود به شرکت روی طرف بیرونی هسته (انتشار v1 گام ۳.۱-ب).
بررسی دامنه شرکت، نادیده‌گرفتن شرکت خارجی، سناریوی ادعای مجدد (existing)، فاکتور متناقض و پوشیدگی داده‌های حساس بانکی و کدملی.
"""
import unittest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.scoped_permissions import section_permission_codes
from companies.models import Company, Project, ProjectSection
from companies.testing import grant_membership
from personnel.models import Counterparty, PartyBankAccount, UserCompanyAccess
from personnel.scoped_test_support import grant_section_perms
from personnel.serializers import ExpenseInvoiceSerializer

User = get_user_model()
URL = '/api/personnel/counterparties/'
VALID_SHEBA = 'IR450120000000101111111001'
VALID_PERSON_NID = '0012345678'
VALID_LEGAL_NID = '12345678901'


def _grant(user, codenames, company):
    section_codes = section_permission_codes()
    scoped = [c for c in codenames if c in section_codes]
    if scoped:
        grant_section_perms(user, scoped, company=company, exact=True)
    for codename in codenames:
        if codename not in section_codes:
            user.user_permissions.add(Permission.objects.get(codename=codename, content_type__app_label='accounts'))


class CounterpartyPartiesTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.company_a = Company.objects.create(code='SC_A', name='شرکت الف', is_active=True)
        self.company_b = Company.objects.create(code='SC_B', name='شرکت ب', is_active=True)

        self.project_a = Project.objects.create(company=self.company_a, code='PRJ_A', name='پروژه الف')
        self.section_a = ProjectSection.objects.create(project=self.project_a, code='SEC_A', name='بخش الف')

        self.project_b = Project.objects.create(company=self.company_b, code='PRJ_B', name='پروژه ب')
        self.section_b = ProjectSection.objects.create(project=self.project_b, code='SEC_B', name='بخش ب')

        self.admin = User.objects.create_superuser(username='sc_admin', password='x')
        self.member_a = self._user('sc_member_a', [], self.company_a)
        self.member_b = self._user('sc_member_b', [], self.company_b)

    def _user(self, username, codenames, company, levels=None):
        u = User.objects.create_user(username=username, password='password123', email=f'{username}@test.com')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True, section_levels=levels or {})
        grant_membership(u, company)
        if codenames:
            _grant(u, codenames, company)
        return User.objects.get(pk=u.pk)

    def _post(self, user, data, **extra):
        self.client.force_authenticate(user=user)
        return self.client.post(URL, data, format='json', **extra)

    def _get(self, user, path=URL, **extra):
        self.client.force_authenticate(user=user)
        return self.client.get(path, **extra)

    @staticmethod
    def _rows(res):
        body = res.json()
        return body.get('results', body) if isinstance(body, dict) else body

    def test_list_shows_only_own_company(self):
        """عضو الف فقط طرف‌حساب‌های الف را می‌بیند؛ هدر شرکت ب منجر به 403 می‌شود."""
        cp_a = Counterparty.objects.create(company=self.company_a, name='طرف الف', counterparty_type='other')
        cp_b = Counterparty.objects.create(company=self.company_b, name='طرف ب', counterparty_type='other')

        res = self._get(self.member_a, URL)
        self.assertEqual(res.status_code, 200, res.content)
        row_ids = [r['id'] for r in self._rows(res)]
        self.assertIn(cp_a.id, row_ids)
        self.assertNotIn(cp_b.id, row_ids)

        res_b = self._get(self.member_a, URL, HTTP_X_COMPANY_ID=str(self.company_b.id))
        self.assertEqual(res_b.status_code, 403)

    def test_create_ignores_foreign_company(self):
        """ارسال شناسه شرکت غیرمجاز توسط عضو الف نادیده گرفته شده و رکورد در شرکت الف ساخته می‌شود."""
        res = self._post(self.member_a, {'name': 'طرف در الف با بدنه ب', 'company': self.company_b.id})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data['company'], self.company_a.id)
        self.assertFalse(Counterparty.objects.filter(party__company=self.company_b).exists())
        self.assertTrue(Counterparty.objects.filter(party__company=self.company_a, party__name='طرف در الف با بدنه ب').exists())

    def test_same_national_id_same_company_returns_existing(self):
        """دو ارسال با کد ملی یکسان در شرکت الف؛ دومی 200 با existing: true بازمی‌گرداند و سطر جدیدی ساخته نمی‌شود."""
        payload1 = {'name': 'طرف الف ۱', 'national_id': VALID_PERSON_NID}
        res1 = self._post(self.member_a, payload1)
        self.assertEqual(res1.status_code, 201, res1.content)
        self.assertFalse(res1.data.get('existing', False))
        first_id = res1.data['id']

        payload2 = {'name': 'طرف الف ۱ مجدد', 'national_id': VALID_PERSON_NID}
        res2 = self._post(self.member_a, payload2)
        self.assertEqual(res2.status_code, 200, res2.content)
        self.assertTrue(res2.data.get('existing'))
        self.assertEqual(res2.data['id'], first_id)
        self.assertEqual(Counterparty.objects.filter(party__company=self.company_a, party__national_id=VALID_PERSON_NID).count(), 1)

    def test_same_national_id_other_company_is_new(self):
        """کد ملی یکسان در دو شرکت مختلف منجر به دو سطر مجزا با وضعیت 201 می‌شود."""
        res_a = self._post(self.member_a, {'name': 'طرف در الف', 'national_id': VALID_PERSON_NID})
        self.assertEqual(res_a.status_code, 201, res_a.content)
        self.assertEqual(res_a.data['company'], self.company_a.id)

        res_b = self._post(self.member_b, {'name': 'طرف در ب', 'national_id': VALID_PERSON_NID})
        self.assertEqual(res_b.status_code, 201, res_b.content)
        self.assertEqual(res_b.data['company'], self.company_b.id)

        self.assertNotEqual(res_a.data['id'], res_b.data['id'])
        self.assertEqual(Counterparty.objects.filter(party__national_id=VALID_PERSON_NID).count(), 2)
        self.assertEqual(Counterparty.objects.filter(party__company=self.company_a, party__national_id=VALID_PERSON_NID).count(), 1)
        self.assertEqual(Counterparty.objects.filter(party__company=self.company_b, party__national_id=VALID_PERSON_NID).count(), 1)

    def test_invoice_with_other_company_counterparty_rejected(self):
        """اعتبارسنجی فاکتور با بخشی از شرکت الف و طرف‌حسابی از شرکت ب نامعتبر بوده و کلید خطا counterparty است."""
        cp_b = Counterparty.objects.create(company=self.company_b, name='طرف شرکت ب', counterparty_type='other')
        ser = ExpenseInvoiceSerializer(data={
            'section': self.section_a.id,
            'counterparty': cp_b.id,
            'invoice_number': 'INV-TEST-001',
            'invoice_date_shamsi': '1405/01/01',
            'amount': 500000,
            'category': 'parts',
            'description': 'تست ناسازگاری شرکت طرف حساب با بخش'
        })
        self.assertFalse(ser.is_valid())
        self.assertIn('counterparty', ser.errors)

    def test_duplicate_queued_post_returns_200_without_new_row(self):
        """تکرار دقیق سه درخواست متوالی در صف آفلاین؛ اولی 201 و دوتای بعدی 200، بدون ایجاد طرف یا حساب اضافه."""
        payload = {
            'name': 'پیمانکار تکراری در صف',
            'national_id': VALID_PERSON_NID,
            'sheba_number': VALID_SHEBA,
            'bank_name': 'بانک ملت',
            'counterparty_type': 'contractor'
        }
        res1 = self._post(self.member_a, payload)
        self.assertEqual(res1.status_code, 201, res1.content)
        self.assertFalse(res1.data.get('existing', False))
        cp_id = res1.data['id']

        res2 = self._post(self.member_a, payload)
        self.assertEqual(res2.status_code, 200, res2.content)
        self.assertTrue(res2.data.get('existing'))
        self.assertEqual(res2.data['id'], cp_id)

        res3 = self._post(self.member_a, payload)
        self.assertEqual(res3.status_code, 200, res3.content)
        self.assertTrue(res3.data.get('existing'))
        self.assertEqual(res3.data['id'], cp_id)

        self.assertEqual(Counterparty.objects.filter(party__company=self.company_a).count(), 1)
        cp = Counterparty.objects.get(pk=cp_id)
        self.assertEqual(PartyBankAccount.objects.filter(party=cp.party).count(), 1)

    def test_plain_member_sees_masked_bank_and_national_id(self):
        """عضو ساده شرکت الف فیلدهای شبا و کد ملی را به صورت ماسک‌شده با نمایش ۴ رقم آخر می‌بیند."""
        cp = Counterparty.objects.create(
            company=self.company_a,
            name='فرد حقیقی الف',
            national_id=VALID_PERSON_NID,
            kind='person',
            counterparty_type='other',
            created_by=self.admin
        )
        PartyBankAccount.objects.create(
            party=cp.party,
            bank_name='بانک ملت',
            sheba_number=VALID_SHEBA,
            is_primary=True
        )

        res = self._get(self.member_a, f'{URL}{cp.id}/')
        self.assertEqual(res.status_code, 200, res.content)
        data = res.data

        self.assertTrue(data['bank_masked'])
        self.assertIn('*', data['sheba_number'])
        self.assertTrue(data['sheba_number'].endswith(VALID_SHEBA[-4:]))

        self.assertIn('*', data['national_id'])
        self.assertTrue(data['national_id'].endswith(VALID_PERSON_NID[-4:]))

        self.assertEqual(len(data['bank_accounts']), 1)
        self.assertIn('*', data['bank_accounts'][0]['sheba_number'])
        self.assertTrue(data['bank_accounts'][0]['sheba_number'].endswith(VALID_SHEBA[-4:]))

    def test_accountant_and_treasury_of_same_company_see_full(self):
        """حسابدار و خزانه شرکت الف مقادیر کامل را می‌بینند، ولی اگر همان مجوز فقط در ب باشد اطلاعات ماسک می‌شود."""
        cp = Counterparty.objects.create(
            company=self.company_a,
            name='فرد حقیقی الف',
            national_id=VALID_PERSON_NID,
            kind='person',
            counterparty_type='other',
            created_by=self.admin
        )
        PartyBankAccount.objects.create(
            party=cp.party,
            bank_name='بانک ملت',
            sheba_number=VALID_SHEBA,
            is_primary=True
        )

        # ۱) کاربر با مجوز can_act_as_accountant در شرکت الف
        accountant_a = self._user('cp_accountant_a', ['can_act_as_accountant'], self.company_a)
        res_acc = self._get(accountant_a, f'{URL}{cp.id}/')
        self.assertEqual(res_acc.status_code, 200, res_acc.content)
        self.assertFalse(res_acc.data['bank_masked'])
        self.assertEqual(res_acc.data['national_id'], VALID_PERSON_NID)
        self.assertEqual(res_acc.data['sheba_number'], VALID_SHEBA[2:])
        self.assertEqual(res_acc.data['bank_accounts'][0]['sheba_number'], VALID_SHEBA)

        # ۲) کاربر با مجوز view_sys_treasury در شرکت الف
        treasury_a = self._user('cp_treasury_a', ['view_sys_treasury'], self.company_a)
        res_tre = self._get(treasury_a, f'{URL}{cp.id}/')
        self.assertEqual(res_tre.status_code, 200, res_tre.content)
        self.assertFalse(res_tre.data['bank_masked'])
        self.assertEqual(res_tre.data['national_id'], VALID_PERSON_NID)
        self.assertEqual(res_tre.data['sheba_number'], VALID_SHEBA[2:])
        self.assertEqual(res_tre.data['bank_accounts'][0]['sheba_number'], VALID_SHEBA)

        # ۳) کاربر با مجوز اعطا شده فقط در شرکت ب، ولی عضو شرکت الف بدون مجوز در الف
        treasury_b = self._user('cp_treasury_b', ['view_sys_treasury'], self.company_b)
        grant_membership(treasury_b, self.company_a)

        res_b = self._get(treasury_b, f'{URL}{cp.id}/')
        self.assertEqual(res_b.status_code, 200, res_b.content)
        self.assertTrue(res_b.data['bank_masked'])
        self.assertIn('*', res_b.data['sheba_number'])
        self.assertTrue(res_b.data['sheba_number'].endswith(VALID_SHEBA[-4:]))
        self.assertIn('*', res_b.data['national_id'])
        self.assertTrue(res_b.data['national_id'].endswith(VALID_PERSON_NID[-4:]))
        self.assertIn('*', res_b.data['bank_accounts'][0]['sheba_number'])
        self.assertTrue(res_b.data['bank_accounts'][0]['sheba_number'].endswith(VALID_SHEBA[-4:]))
