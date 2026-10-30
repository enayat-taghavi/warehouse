"""
فهرست کمینهٔ کاربران برای «مدیریت تنخواه» (فیلم‌های آموزشی ف-د): حسابدار تنخواه‌گردان را در «حساب جدید» و
«تحویل حساب» جست‌وجو می‌کند؛ فقط کاربران شرکت‌های خودش و فقط فیلدهای کمینه.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess
from personnel.scoped_test_support import grant_section_perms

User = get_user_model()
URL = '/api/auth/users/'


class PettyUserDirectoryTests(TestCase):
    def setUp(self):
        self.co = Company.objects.create(code='PUD1', name='شرکت یک', is_active=True)
        self.co2 = Company.objects.create(code='PUD2', name='شرکت دو', is_active=True)
        self.acc = self.user('acc', 'accountant', self.co)
        self.emp = self.user('emp', 'employee', self.co, national_code='0012345678')
        self.other = self.user('oth', 'employee', self.co2)

    def user(self, name, role, company, **extra):
        u = User.objects.create_user(username=f'pud_{name}', password='x', first_name=f'نام{name}', **extra)
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, [], company=company, role=role, exact=False)
        return u

    def get(self, user, **params):
        client = APIClient()
        client.force_authenticate(user)
        return client.get(URL, params, HTTP_X_COMPANY_ID=str(self.co.pk))

    def rows(self, res):
        data = res.json()
        return data['results'] if isinstance(data, dict) else data

    def test_accountant_sees_minimal_own_company_directory(self):
        res = self.get(self.acc, search='pud_')
        self.assertEqual(res.status_code, 200, res.content)
        ids = {r['id'] for r in self.rows(res)}
        self.assertIn(self.emp.pk, ids)
        self.assertNotIn(self.other.pk, ids)
        for row in self.rows(res):
            self.assertNotIn('national_code', row)
            self.assertNotIn('phone_number', row)
        self.assertEqual(self.get(self.acc, company_id=str(self.co2.pk)).status_code, 403)
        # فقط فهرست باز می‌شود، نه جزئیات یا ویرایش
        client = APIClient()
        client.force_authenticate(self.acc)
        self.assertEqual(client.get(f'{URL}{self.emp.pk}/').status_code, 403)
        self.assertEqual(client.patch(f'{URL}{self.emp.pk}/', {'first_name': 'x'}, format='json').status_code, 403)

    def test_employee_without_petty_perm_is_refused(self):
        self.assertEqual(self.get(self.emp).status_code, 403)
