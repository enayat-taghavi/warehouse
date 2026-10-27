"""
تست دود تنخواه سطح شرکت روی موتور (طرح ۳.۶-ج): شارژ زیر سقف بی مدیر، صورت‌حساب با یک ردیف ردشده،
جداسازی شرکت و سقف فقط با مدیر، و اعلام گردش‌ها.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess
from personnel.models import PettyCashAccount, PettyCashTransaction, WorkflowAuditLog
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import PETTY_CHARGE_WORKFLOW, PETTY_STATEMENT_WORKFLOW
from workflow import engine as wf_engine
from workflow.registry import validate_specs

User = get_user_model()
TX = '/api/personnel/petty-cash-transactions/'
ACC = '/api/personnel/petty-cash-accounts/'
ST = '/api/personnel/petty-cash-statements/'


class PettyCashSmokeTests(TestCase):
    def setUp(self):
        self.co = Company.objects.create(code='PC36', name='شرکت تنخواه', is_active=True)
        self.co2 = Company.objects.create(code='PC36X', name='شرکت دیگر', is_active=True)
        self.emp = self.user('emp', 'employee', ['perm_petty_cash_manage'])
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')
        self.outsider = self.user('out', 'accountant', ['perm_petty_cash_manage'], company=self.co2)
        self.account = PettyCashAccount.objects.create(company=self.co, custodian=self.emp,
                                                       ceiling_amount=Decimal('1000000'))

    def user(self, name, role, codes=(), company=None):
        company = company or self.co
        u = User.objects.create_user(username=f'pc36_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), company=company, role=role, exact=False)
        return u

    def call(self, user, method, url, data=None, company=None):
        c = APIClient()
        c.force_authenticate(user)
        with self.captureOnCommitCallbacks(execute=True):
            return getattr(c, method)(url, data or {}, format='json',
                                      HTTP_X_COMPANY_ID=str((company or self.co).pk))

    def act(self, key, pk, user):
        wf_engine.act(user, wf_engine.open_task(key, pk))

    def step(self, key, pk):
        task = wf_engine.open_task(key, pk)
        return task.step_key if task else None

    def test_charge_under_ceiling_skips_manager(self):
        res = self.call(self.emp, 'post', f'{TX}request-charge/', {'amount': '500000'})
        self.assertEqual(res.status_code, 201, res.content)
        tx_id = res.json()['id']
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'accountant_review')
        self.act(PETTY_CHARGE_WORKFLOW, tx_id, self.acc)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'treasury_pay')
        self.assertEqual(self.call(self.trs, 'post', f'{TX}{tx_id}/pay-charge/').status_code, 400)
        res = self.call(self.trs, 'post', f'{TX}{tx_id}/pay-charge/', {'tracking_code': 'TRK-36'})
        self.assertEqual(res.status_code, 200, res.content)
        tx = PettyCashTransaction.objects.get(pk=tx_id)
        self.assertEqual((tx.status, tx.receipt_number), ('approved', 'TRK-36'))
        bal = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal['current_balance'], 500000)
        # بالای سقف: مرحلهٔ مدیر می‌ماند
        res = self.call(self.emp, 'post', f'{TX}request-charge/', {'amount': '600000'})
        self.act(PETTY_CHARGE_WORKFLOW, res.json()['id'], self.acc)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, res.json()['id']), 'manager_ok')
        # مسیر قدیمی کنار رفته است
        self.assertEqual(self.call(self.emp, 'post', f'{TX}request-replenishment/', {'amount': '1'}).status_code, 410)

    def test_statement_recharge_equals_approved_after_line_reject(self):
        lines = [PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp, transaction_type='expense',
            amount=Decimal(a), transaction_date_shamsi='1405/08/01', title='t', category='c', status='draft',
        ) for a in ('100000', '250000')]
        res = self.call(self.emp, 'post', ST, {'line_ids': [l.pk for l in lines]})
        self.assertEqual(res.status_code, 201, res.content)
        st_id = res.json()['id']
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st_id), 'accountant_review')
        self.assertEqual(self.call(self.emp, 'post', f'{ST}{st_id}/reject-line/',
                                   {'line_id': lines[0].pk, 'reason': 'x'}).status_code, 403)
        self.assertEqual(self.call(self.acc, 'post', f'{ST}{st_id}/reject-line/',
                                   {'line_id': lines[0].pk}).status_code, 400)
        res = self.call(self.acc, 'post', f'{ST}{st_id}/reject-line/', {'line_id': lines[0].pk, 'reason': 'بی رسید'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Decimal(res.json()['approved_amount']), Decimal('250000'))
        self.act(PETTY_STATEMENT_WORKFLOW, st_id, self.acc)
        self.act(PETTY_STATEMENT_WORKFLOW, st_id, self.mgr)
        res = self.call(self.trs, 'post', f'{ST}{st_id}/pay/', {'tracking_code': 'TRK-ST'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual((res.json()['status'], res.json()['is_locked']), ('paid', True))
        recharge = PettyCashTransaction.objects.get(account=self.account, transaction_type='allocation')
        self.assertEqual((recharge.amount, recharge.status), (Decimal('250000'), 'approved'))
        self.account.refresh_from_db()
        self.assertEqual(self.account.debt, Decimal('100000'))
        self.assertEqual(self.call(self.emp, 'get', f'{TX}my-balance/').json()['debt'], 100000)

    def test_other_company_isolated_and_ceiling_only_manager(self):
        self.assertEqual(self.call(self.outsider, 'get', f'{ACC}{self.account.pk}/', company=self.co2).status_code, 404)
        self.assertEqual(self.call(self.outsider, 'get', f'{ACC}{self.account.pk}/').status_code, 403)
        self.assertNotIn(self.account.pk, [a['id'] for a in self.call(self.outsider, 'get', ACC, company=self.co2).json()])
        self.assertEqual(self.call(self.acc, 'patch', f'{ACC}{self.account.pk}/', {'ceiling_amount': '5'}).status_code, 403)
        res = self.call(self.mgr, 'patch', f'{ACC}{self.account.pk}/', {'ceiling_amount': '2000000'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(WorkflowAuditLog.objects.filter(content_type='pettycashaccount', object_id=self.account.pk,
                                                        action='ceiling_change', to_status='2000000').exists())

    def test_validate_specs(self):
        specs = validate_specs()
        self.assertIn(PETTY_CHARGE_WORKFLOW, specs)
        self.assertIn(PETTY_STATEMENT_WORKFLOW, specs)
        self.assertEqual(specs[PETTY_STATEMENT_WORKFLOW].company_field, 'company')
