"""
تست‌های گردش کار تنخواه سطح شرکت (طرح ۳.۶-ج):
شارژهای در گردش روی سقف حساب، سقف مبلغ شرکت برای عبور از مدیر، عودت کل صورت‌حساب و ردیف‌های باز/ردشده،
ثبت هزینه فقط روی حساب خود، قفل دورهٔ مالی، جداسازی دسترسی شرکت دیگر و بخش اختیاری.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.models import (
    CompanyFiscalPeriod,
    ExpenseHead,
    PettyCashAccount,
    PettyCashTransaction,
)
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import PETTY_CHARGE_WORKFLOW, PETTY_STATEMENT_WORKFLOW
from workflow import engine as wf_engine
from workflow.models import WorkflowThreshold

User = get_user_model()
TX = '/api/personnel/petty-cash-transactions/'
ACC = '/api/personnel/petty-cash-accounts/'
ST = '/api/personnel/petty-cash-statements/'


class PettyCashWorkflowTests(TestCase):
    def setUp(self):
        self.co = Company.objects.create(code='PW36', name='شرکت تنخواه گردش', is_active=True)
        self.co2 = Company.objects.create(code='PW36X', name='شرکت دیگر گردش', is_active=True)
        self.emp = self.user('emp', 'employee', ['perm_petty_cash_manage'])
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')
        self.outsider = self.user('out', 'accountant', ['perm_petty_cash_manage'], company=self.co2)
        self.account = PettyCashAccount.objects.create(
            company=self.co, custodian=self.emp, ceiling_amount=Decimal('1000000')
        )

    def user(self, name, role, codes=(), company=None):
        company = company or self.co
        u = User.objects.create_user(username=f'pc36w_{name}', password='x')
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

    def test_charges_in_flight_count_toward_ceiling(self):
        res1 = self.call(self.emp, 'post', f'{TX}request-charge/', {'amount': '600000'})
        self.assertEqual(res1.status_code, 201, res1.content)
        tx1_id = res1.json()['id']
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx1_id), 'accountant_review')
        self.act(PETTY_CHARGE_WORKFLOW, tx1_id, self.acc)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx1_id), 'treasury_pay')

        res2 = self.call(self.emp, 'post', f'{TX}request-charge/', {'amount': '600000'})
        self.assertEqual(res2.status_code, 201, res2.content)
        tx2_id = res2.json()['id']
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx2_id), 'accountant_review')
        self.act(PETTY_CHARGE_WORKFLOW, tx2_id, self.acc)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx2_id), 'manager_ok')

    def test_accountant_custodian_skips_review_only_when_sole_accountant(self):
        from workflow.models import WorkflowStep
        acc_c = self.user('accc', 'accountant', ['perm_petty_cash_manage'])
        PettyCashAccount.objects.create(company=self.co, custodian=acc_c, ceiling_amount=Decimal('1000000'))
        res = self.call(acc_c, 'post', f'{TX}request-charge/', {'amount': '100000'})
        self.assertEqual(res.status_code, 201, res.content)
        tx1 = res.json()['id']
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx1), 'accountant_review')  # حسابدار دیگر هست
        self.act(PETTY_CHARGE_WORKFLOW, tx1, self.acc)
        self.acc.is_active = False
        self.acc.save()
        res = self.call(acc_c, 'post', f'{TX}request-charge/', {'amount': '100000'})
        self.assertEqual(res.status_code, 201, res.content)
        tx2 = res.json()['id']
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx2), 'treasury_pay')
        skipped = WorkflowStep.objects.get(instance__entity_id=tx2, instance__workflow_key=PETTY_CHARGE_WORKFLOW,
                                           action='submit').skipped
        self.assertIn({'step': 'accountant_review', 'reason': 'no_second_approval'}, skipped)
        # واریز شارژ خود همچنان نه: creator_may_act برای تنخواه روشن نیست
        self.assertFalse(wf_engine.can_act(acc_c, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx2)))
        self.assertTrue(wf_engine.can_act(self.trs, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx2)))

    def test_statement_under_company_threshold_skips_manager(self):
        WorkflowThreshold.objects.create(
            workflow_key=PETTY_STATEMENT_WORKFLOW, step_key='manager_ok',
            company=self.co, amount=Decimal('500000'),
        )
        lines1 = [PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp, transaction_type='expense',
            amount=Decimal('100000'), transaction_date_shamsi='1405/08/01', title='t1', category='c', status='draft',
        ) for _ in range(2)]
        res1 = self.call(self.emp, 'post', ST, {'line_ids': [l.pk for l in lines1]})
        self.assertEqual(res1.status_code, 201, res1.content)
        st1_id = res1.json()['id']
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st1_id), 'accountant_review')
        self.act(PETTY_STATEMENT_WORKFLOW, st1_id, self.acc)
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st1_id), 'treasury_pay')

        line2 = PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp, transaction_type='expense',
            amount=Decimal('900000'), transaction_date_shamsi='1405/08/01', title='t2', category='c', status='draft',
        )
        res2 = self.call(self.emp, 'post', ST, {'line_ids': [line2.pk]})
        self.assertEqual(res2.status_code, 201, res2.content)
        st2_id = res2.json()['id']
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st2_id), 'accountant_review')
        self.act(PETTY_STATEMENT_WORKFLOW, st2_id, self.acc)
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st2_id), 'manager_ok')

    def test_whole_statement_return_frees_open_lines_keeps_rejected(self):
        lines = [PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp, transaction_type='expense',
            amount=Decimal(a), transaction_date_shamsi='1405/08/01', title='t', category='c', status='draft',
        ) for a in ('100000', '250000')]
        initial_tx_count = PettyCashTransaction.objects.count()
        res = self.call(self.emp, 'post', ST, {'line_ids': [l.pk for l in lines]})
        self.assertEqual(res.status_code, 201, res.content)
        st_id = res.json()['id']

        res_reject = self.call(self.acc, 'post', f'{ST}{st_id}/reject-line/',
                               {'line_id': lines[0].pk, 'reason': 'فاکتور نامعتبر'})
        self.assertEqual(res_reject.status_code, 200, res_reject.content)

        wf_engine.return_for_fix(self.acc, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id), 'fix')

        lines[0].refresh_from_db()
        lines[1].refresh_from_db()
        self.assertIsNone(lines[1].statement_id)
        self.assertEqual(lines[1].line_status, 'open')
        self.assertEqual(lines[0].statement_id, st_id)
        self.assertEqual(lines[0].line_status, 'rejected')

        self.account.refresh_from_db()
        self.assertEqual(self.account.debt, lines[0].amount)
        self.assertEqual(PettyCashTransaction.objects.count(), initial_tx_count)

    def test_custodian_records_expense_only_on_own_account(self):
        other = self.user('other', 'employee', ['perm_petty_cash_manage'])
        head = ExpenseHead.objects.get(company=self.co, code='9001')
        payload = {
            'account': self.account.pk,
            'custodian': self.emp.pk,
            'transaction_type': 'expense',
            'amount': '50000',
            'transaction_date_shamsi': '1405/08/01',
            'title': 'هزینه اقلام مصرفی',
            'expense_head': head.pk,
        }
        res_other = self.call(other, 'post', TX, payload)
        self.assertIn(res_other.status_code, (400, 403), res_other.content)
        self.assertFalse(PettyCashTransaction.objects.filter(account=self.account, created_by=other).exists())

        res_emp = self.call(self.emp, 'post', TX, payload)
        self.assertEqual(res_emp.status_code, 201, res_emp.content)
        self.assertTrue(
            PettyCashTransaction.objects.filter(account=self.account, created_by=self.emp, amount=Decimal('50000')).exists()
        )

    def test_expense_in_closed_period_rejected(self):
        CompanyFiscalPeriod.objects.create(
            company=self.co, fiscal_year='1405', title='x',
            start_date='1405/01/01', end_date='1405/12/29', status='closed', is_active=False,
        )
        head = ExpenseHead.objects.get(company=self.co, code='9001')
        payload = {
            'account': self.account.pk,
            'custodian': self.emp.pk,
            'transaction_type': 'expense',
            'amount': '50000',
            'transaction_date_shamsi': '1405/08/01',
            'title': 'هزینه در دوره بسته',
            'expense_head': head.pk,
        }
        res = self.call(self.emp, 'post', TX, payload)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('transaction_date_shamsi', res.json())

    def test_other_company_user_cannot_see_or_act_on_statement(self):
        line = PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp, transaction_type='expense',
            amount=Decimal('100000'), transaction_date_shamsi='1405/08/01', title='t', category='c', status='draft',
        )
        res = self.call(self.emp, 'post', ST, {'line_ids': [line.pk]})
        self.assertEqual(res.status_code, 201, res.content)
        st_id = res.json()['id']

        list_res = self.call(self.outsider, 'get', ST, company=self.co2)
        self.assertEqual(list_res.status_code, 200, list_res.content)
        statement_ids = [s['id'] for s in list_res.json()]
        self.assertNotIn(st_id, statement_ids)

        detail_res = self.call(self.outsider, 'get', f'{ST}{st_id}/', company=self.co2)
        self.assertIn(detail_res.status_code, (403, 404), detail_res.content)

        reject_res = self.call(self.outsider, 'post', f'{ST}{st_id}/reject-line/',
                               {'line_id': line.pk, 'reason': 'x'}, company=self.co2)
        self.assertIn(reject_res.status_code, (403, 404), reject_res.content)

        line.refresh_from_db()
        self.assertEqual(line.line_status, 'open')

    def test_expense_optional_section_and_other_company_section_rejected(self):
        head = ExpenseHead.objects.get(company=self.co, code='9001')
        payload = {
            'account': self.account.pk,
            'custodian': self.emp.pk,
            'transaction_type': 'expense',
            'amount': '50000',
            'transaction_date_shamsi': '1405/08/01',
            'title': 'هزینه سطح شرکت بی بخش',
            'expense_head': head.pk,
        }
        res_ok = self.call(self.emp, 'post', TX, payload)
        self.assertEqual(res_ok.status_code, 201, res_ok.content)

        other_proj = Project.objects.create(company=self.co2, code='PW36P2', name='پروژه شرکت دوم')
        other_sec = ProjectSection.objects.create(project=other_proj, code='PW36S2', name='بخش شرکت دوم')
        payload_other_sec = {
            **payload,
            'title': 'هزینه با بخش شرکت دیگر',
            'section': other_sec.pk,
        }
        res_bad = self.call(self.emp, 'post', TX, payload_other_sec)
        self.assertEqual(res_bad.status_code, 400, res_bad.content)
