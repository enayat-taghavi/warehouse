"""
تست «تن‌خواه من» (petty-cash-accounts/mine/): فقط حساب‌های خود کاربر و حساب باز صاحب‌کار در بازهٔ جانشینی،
در همهٔ شرکت‌های مجاز کاربر و مستقل از سرآیند شرکت؛ بی نشت حساب دیگران و بی کارت و شبا.
"""
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess
from personnel.models import PettyCashAccount
from personnel.scoped_test_support import grant_section_perms

User = get_user_model()
MINE = '/api/personnel/petty-cash-accounts/mine/'
FIELDS = {'id', 'company', 'company_name', 'is_active', 'is_closed', 'role'}


class PettyMineEndpointTests(TestCase):
    def setUp(self):
        self.co = Company.objects.create(code='PM1', name='الف شرکت', is_active=True)
        self.co2 = Company.objects.create(code='PM2', name='ب شرکت', is_active=True)
        self.emp = self.user('emp', 'employee')
        UserCompanyAccess.objects.create(user=self.emp, company=self.co2)
        grant_section_perms(self.emp, [], company=self.co2, role='employee', exact=False)
        self.acc_user = self.user('acc', 'accountant', ['perm_petty_cash_manage'])
        self.outsider = self.user('out', 'employee', company=self.co2)
        self.closed = PettyCashAccount.objects.create(
            company=self.co, custodian=self.emp, ceiling_amount=Decimal('1000000'), is_active=False,
            closed_at=timezone.now(), card_or_account_number='6037991123456789')
        self.active = PettyCashAccount.objects.create(
            company=self.co2, custodian=self.emp, ceiling_amount=Decimal('1000000'),
            sheba_number='IR000000000000000000000001')

    def user(self, name, role, codes=(), company=None):
        company = company or self.co
        u = User.objects.create_user(username=f'pm_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), company=company, role=role, exact=False)
        return u

    def mine(self, user, company=None):
        c = APIClient()
        c.force_authenticate(user)
        res = c.get(MINE, HTTP_X_COMPANY_ID=str((company or self.co).pk))
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_custodian_sees_active_and_closed_across_companies(self):
        for header in (self.co, self.co2):
            rows = self.mine(self.emp, company=header)
            self.assertEqual([r['id'] for r in rows], [self.active.pk, self.closed.pk])
            self.assertEqual(rows[0], {'id': self.active.pk, 'company': self.co2.pk, 'company_name': 'ب شرکت',
                                       'is_active': True, 'is_closed': False, 'role': 'custodian'})
            self.assertEqual((rows[1]['is_active'], rows[1]['is_closed']), (False, True))
            for r in rows:
                self.assertEqual(set(r), FIELDS)

    def test_manager_role_with_account_sees_it(self):
        mgr = self.user('mgr', 'manager')
        acc = PettyCashAccount.objects.create(company=self.co, custodian=mgr, ceiling_amount=Decimal('5'))
        self.assertEqual([(r['id'], r['role']) for r in self.mine(mgr)], [(acc.pk, 'custodian')])

    def test_deputy_sees_principal_active_account_only_in_window(self):
        from workflow.models import WorkflowSubstitute
        today = datetime.date.today()
        dep = self.user('dep', 'employee')
        UserCompanyAccess.objects.create(user=dep, company=self.co2)
        grant_section_perms(dep, [], company=self.co2, role='employee', exact=False)
        sub = WorkflowSubstitute.objects.create(principal=self.emp, substitute=dep, company=None,
                                                start_date=today - datetime.timedelta(days=1),
                                                end_date=today + datetime.timedelta(days=1))
        rows = self.mine(dep)
        self.assertEqual([(r['id'], r['role']) for r in rows], [(self.active.pk, 'deputy')])
        WorkflowSubstitute.objects.filter(pk=sub.pk).update(start_date=today - datetime.timedelta(days=3),
                                                            end_date=today - datetime.timedelta(days=2))
        self.assertEqual(self.mine(dep), [])

    def test_deputy_without_company_access_sees_nothing(self):
        from workflow.models import WorkflowSubstitute
        today = datetime.date.today()
        dep = self.user('dep2', 'employee')  # فقط شرکت الف؛ حساب باز صاحب‌کار در شرکت ب است
        WorkflowSubstitute.objects.create(principal=self.emp, substitute=dep, company=None,
                                          start_date=today - datetime.timedelta(days=1),
                                          end_date=today + datetime.timedelta(days=1))
        self.assertEqual(self.mine(dep), [])

    def test_outsider_and_user_without_account_get_empty(self):
        self.assertEqual(self.mine(self.outsider, company=self.co2), [])
        plain = self.user('plain', 'employee')
        self.assertEqual(self.mine(plain), [])

    def test_company_level_viewer_does_not_see_others_accounts(self):
        other = self.user('other', 'employee')
        PettyCashAccount.objects.create(company=self.co, custodian=other, ceiling_amount=Decimal('5'))
        self.assertEqual(self.mine(self.acc_user), [])

    def test_requires_authentication(self):
        self.assertIn(APIClient().get(MINE).status_code, (401, 403))
