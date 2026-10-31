"""
سناریوهای آزمون جامع تنخواه (طرح ۴.۲-ب مرحلهٔ انتشار v1).
آزمون ۸ سناریوی اصلی سطح و بدهی، قفل موجودی اولیه، قواعد تسویه، تهاتر با شارژ،
بررسی دوباره سقف، قفل دوره با تطبیق، بستن و تحویل، و دامنه/چاپ/پوشاندن شبا.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess
from personnel.models import (
    ExpenseHead,
    PettyCashAccount,
    PettyCashDebtSettlement,
    PettyCashTransaction,
    WorkflowAuditLog,
)
from personnel.scoped_test_support import grant_section_perms, pay_request, temp_media
from personnel.workflows import (
    PETTY_CHARGE_WORKFLOW,
    PETTY_STATEMENT_WORKFLOW,
    petty_fund_level,
)
from workflow import engine as wf_engine

User = get_user_model()
TX = '/api/personnel/petty-cash-transactions/'
ACC = '/api/personnel/petty-cash-accounts/'
ST = '/api/personnel/petty-cash-statements/'
SET = '/api/personnel/petty-cash-settlements/'
REC = '/api/personnel/petty-cash-reconciliations/'
SHEBA_A = 'IR820540102680020817909002'


@temp_media
class PettyCash42Tests(TestCase):
    def setUp(self):
        self.co = Company.objects.create(code='PC42', name='شرکت تنخواه سناریو', is_active=True)
        self.co2 = Company.objects.create(code='PC42X', name='شرکت دیگر', is_active=True)
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
        u = User.objects.create_user(username=f'pc42_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), company=company, role=role, exact=False)
        return u

    def call(self, user, method, url, data=None, company=None):
        c = APIClient()
        c.force_authenticate(user)
        data, fmt = pay_request(url, data or {})
        with self.captureOnCommitCallbacks(execute=True):
            return getattr(c, method)(
                url, data, format=fmt,
                HTTP_X_COMPANY_ID=str((company or self.co).pk)
            )

    def act(self, key, pk, user):
        wf_engine.act(user, wf_engine.open_task(key, pk))

    def step(self, key, pk):
        task = wf_engine.open_task(key, pk)
        return task.step_key if task else None

    def rejected_line(self, amount='100000'):
        return PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp,
            transaction_type='expense', amount=Decimal(amount),
            transaction_date_shamsi='1405/08/01', title='t', category='c',
            status='rejected', line_status='rejected'
        )

    def charge_at_pay(self, amount):
        tx_id = self.call(self.emp, 'post', f'{TX}request-charge/', {'amount': amount}).json()['id']
        self.act(PETTY_CHARGE_WORKFLOW, tx_id, self.acc)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'treasury_pay')
        return tx_id

    def set_opening(self, amount):
        PettyCashAccount.objects.filter(pk=self.account.pk).update(
            opening_balance=Decimal(amount), opening_balance_date='1405/01/01'
        )
        self.account.refresh_from_db()

    def draft_expense(self, amount='100000', day='1405/08/01'):
        return PettyCashTransaction.objects.create(
            account=self.account, custodian=self.emp, created_by=self.emp,
            transaction_type='expense', amount=Decimal(amount),
            transaction_date_shamsi=day, title='t', category='c', status='draft'
        )

    def expense_payload(self, day, **extra):
        head = ExpenseHead.objects.get(company=self.co, code='9001')
        return {
            'transaction_type': 'expense',
            'amount': '50000',
            'transaction_date_shamsi': day,
            'title': 'x',
            'expense_head': head.pk,
            'custodian': self.emp.pk,
            **extra,
        }

    def test_rejected_line_lowers_level_and_raises_debt(self):
        self.set_opening('500000')
        bal_before = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal_before['current_balance'], 500000)

        self.rejected_line('100000')
        bal_after = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal_after['current_balance'], bal_before['current_balance'] - 100000)
        self.assertEqual(bal_after['debt'], 100000)
        self.assertEqual(bal_after['rejected_total'], 100000)

    def test_opening_balance_locked_after_activity(self):
        url = f'{ACC}{self.account.pk}/'
        res = self.call(self.emp, 'patch', url, {'opening_balance': '50000', 'opening_balance_date': '1405/08/01'})
        self.assertEqual(res.status_code, 200, res.content)

        self.draft_expense('10000')

        res_locked = self.call(self.emp, 'patch', url, {'opening_balance': '60000', 'opening_balance_date': '1405/08/01'})
        self.assertEqual(res_locked.status_code, 403)
        self.assertEqual(res_locked.json()['code'], 'opening_balance_locked')

        res_no_reason = self.call(self.mgr, 'patch', url, {'opening_balance': '60000', 'opening_balance_date': '1405/08/01'})
        self.assertEqual(res_no_reason.status_code, 400)
        self.assertEqual(res_no_reason.json()['code'], 'reason_required')

        res_ok = self.call(self.mgr, 'patch', url, {
            'opening_balance': '60000', 'opening_balance_date': '1405/08/01', 'reason': 'تغییر با دلیل'
        })
        self.assertEqual(res_ok.status_code, 200, res_ok.content)
        self.assertTrue(WorkflowAuditLog.objects.filter(
            object_id=self.account.pk, action='petty_opening_balance_changed', reason='تغییر با دلیل'
        ).exists())

    def test_cash_settlement_rules(self):
        self.rejected_line('100000')
        bal_before = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal_before['debt'], 100000)

        data = {'account': self.account.pk, 'amount': '100000', 'method': 'cash', 'reference': 'REF-1'}
        res_cust = self.call(self.emp, 'post', SET, data)
        self.assertEqual(res_cust.status_code, 403)

        res_exceeds = self.call(self.acc, 'post', SET, {**data, 'amount': '150000'})
        self.assertEqual(res_exceeds.status_code, 400)
        self.assertEqual(res_exceeds.json()['code'], 'amount_exceeds_debt')

        res_no_ref = self.call(self.acc, 'post', SET, {'account': self.account.pk, 'amount': '100000', 'method': 'cash'})
        self.assertEqual(res_no_ref.status_code, 400)
        self.assertEqual(res_no_ref.json()['code'], 'reference_required')

        # ۴.۵ گیرندهٔ رجیستری را ثبت می‌کند؛ رفتار «بی گیرنده» ۴.۲ با رجیستری خالی سنجیده می‌شود
        from unittest import mock
        with mock.patch('personnel.petty_settlements.payroll_deduction_available', return_value=False):
            res_payroll = self.call(self.acc, 'post', SET, {'account': self.account.pk, 'amount': '100000', 'method': 'payroll'})
        self.assertEqual(res_payroll.status_code, 400)
        self.assertEqual(res_payroll.json()['code'], 'payroll_not_available')

        res_done = self.call(self.acc, 'post', SET, data)
        self.assertEqual(res_done.status_code, 201)
        self.assertEqual(res_done.json()['status'], 'done')
        settlement_id = res_done.json()['id']

        bal_settled = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal_settled['debt'], 0)
        self.assertEqual(bal_settled['current_balance'], bal_before['current_balance'])

        res_void = self.call(self.acc, 'post', f'{SET}{settlement_id}/void/', {'reason': 'ابطال رسید'})
        self.assertEqual(res_void.status_code, 200)
        self.assertEqual(res_void.json()['status'], 'void')

        bal_void = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal_void['debt'], 100000)

    def test_charge_offset_net_on_pay(self):
        self.rejected_line('100000')
        bal_start = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal_start['debt'], 100000)
        start_bal = bal_start['current_balance']

        tx_id = self.charge_at_pay('300000')

        extra_rej = self.rejected_line('300000')
        res_exceeds = self.call(self.acc, 'post', SET, {
            'account': self.account.pk, 'amount': '400000', 'method': 'charge_offset', 'charge': tx_id
        })
        self.assertEqual(res_exceeds.status_code, 400)
        self.assertEqual(res_exceeds.json()['code'], 'offset_exceeds_charge')
        extra_rej.delete()

        res_pending = self.call(self.acc, 'post', SET, {
            'account': self.account.pk, 'amount': '100000', 'method': 'charge_offset', 'charge': tx_id
        })
        self.assertEqual(res_pending.status_code, 201)
        self.assertEqual(res_pending.json()['status'], 'pending')
        settlement_id = res_pending.json()['id']

        res_pay = self.call(self.trs, 'post', f'{TX}{tx_id}/pay-charge/', {'tracking_code': 'TRK-PAY'})
        self.assertEqual(res_pay.status_code, 200)
        self.assertEqual(res_pay.json()['offset_total'], 100000)
        self.assertEqual(res_pay.json()['net_amount'], 200000)

        settlement = PettyCashDebtSettlement.objects.get(pk=settlement_id)
        self.assertEqual(settlement.status, 'done')

        bal_end = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal_end['current_balance'], start_bal + 200000)
        self.assertEqual(bal_end['debt'], 0)

    def test_ceiling_rechecked_at_pay(self):
        tx_id = self.charge_at_pay('500000')
        tx_before = PettyCashTransaction.objects.get(pk=tx_id)
        status_before = tx_before.status
        receipt_before = tx_before.receipt_number

        res = self.call(self.mgr, 'patch', f'{ACC}{self.account.pk}/', {'ceiling_amount': '400000'})
        self.assertEqual(res.status_code, 200, res.content)

        res = self.call(self.trs, 'post', f'{TX}{tx_id}/pay-charge/', {'tracking_code': 'TRK-C'})
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()['code'], 'ceiling_exceeded_at_pay')

        tx_after = PettyCashTransaction.objects.get(pk=tx_id)
        self.assertEqual(tx_after.status, status_before)
        self.assertEqual(tx_after.receipt_number, receipt_before)

    def test_reconciliation_period_lock(self):
        self.set_opening('500000')
        res_rec1 = self.call(self.acc, 'post', REC, {
            'account': self.account.pk, 'period_end_date': '1405/08/10', 'counted_cash': '350000'
        })
        self.assertEqual(res_rec1.status_code, 201)
        diff1 = Decimal(res_rec1.json()['difference'])
        self.assertLess(diff1, 0)
        self.assertEqual(diff1, Decimal('-150000'))

        bal1 = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal1['debt'], 150000)

        res_rec2 = self.call(self.acc, 'post', REC, {
            'account': self.account.pk, 'period_end_date': '1405/08/20', 'counted_cash': '600000'
        })
        self.assertEqual(res_rec2.status_code, 201)
        diff2 = Decimal(res_rec2.json()['difference'])
        self.assertGreater(diff2, 0)

        bal2 = self.call(self.emp, 'get', f'{TX}my-balance/').json()
        self.assertEqual(bal2['debt'], 150000)

        res_locked = self.call(self.emp, 'post', TX, self.expense_payload('1405/08/20'))
        self.assertEqual(res_locked.status_code, 400)
        self.assertEqual(res_locked.json()['code'], 'period_locked')

        line = self.draft_expense('50000', day='1405/08/25')
        res_st = self.call(self.emp, 'post', ST, {'line_ids': [line.pk]})
        self.assertEqual(res_st.status_code, 201)

        res_in_flight = self.call(self.acc, 'post', REC, {
            'account': self.account.pk, 'period_end_date': '1405/08/30', 'counted_cash': '500000'
        })
        self.assertEqual(res_in_flight.status_code, 400)
        self.assertEqual(res_in_flight.json()['code'], 'work_in_flight')

    def test_expense_without_custodian_defaults_to_user(self):
        # فرم کارمند و صف آفلاین custodian نمی‌فرستند (بررسی سنگین مرحلهٔ ۵: POST 400 custodian)
        self.set_opening('500000')
        payload = self.expense_payload('1405/08/11')
        payload.pop('custodian')
        res = self.call(self.emp, 'post', TX, payload)
        self.assertEqual(res.status_code, 201, res.content)
        tx = PettyCashTransaction.objects.get(pk=res.json()['id'])
        self.assertEqual(tx.custodian_id, self.emp.pk)
        self.assertEqual(tx.account_id, self.account.pk)

    def test_custodian_without_manage_perm_posts_only_on_own_account(self):
        # e55e9747: کارمند بی perm_petty_cash_manage با حساب فعال خودش هزینه ثبت می‌کند، نه بیشتر
        self.set_opening('500000')
        plain = self.user('plain', 'employee')
        own = PettyCashAccount.objects.create(company=self.co, custodian=plain, ceiling_amount=Decimal('1000000'),
                                              opening_balance=Decimal('500000'), opening_balance_date='1405/01/01')
        payload = self.expense_payload('1405/08/11')
        payload.pop('custodian')
        res = self.call(plain, 'post', TX, payload)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(PettyCashTransaction.objects.get(pk=res.json()['id']).account_id, own.pk)

        foreign = self.call(plain, 'post', TX, {**payload, 'account': self.account.pk})
        self.assertIn(foreign.status_code, (400, 403))
        other_user = self.call(plain, 'post', TX, {**payload, 'custodian': self.emp.pk})
        self.assertEqual(other_user.status_code, 403)

        no_account = self.user('plain2', 'employee')
        self.assertEqual(self.call(no_account, 'post', TX, payload).status_code, 403)

    def test_close_and_handover(self):
        self.set_opening('300000')
        self.rejected_line('100000')
        url_close = f'{ACC}{self.account.pk}/close/'

        res_debt = self.call(self.mgr, 'post', url_close)
        self.assertEqual(res_debt.status_code, 400)
        self.assertEqual(res_debt.json()['code'], 'debt_open')

        res_settle = self.call(self.acc, 'post', SET, {
            'account': self.account.pk, 'amount': '100000', 'method': 'cash', 'reference': 'REF-S'
        })
        self.assertEqual(res_settle.status_code, 201)

        res_no_ref = self.call(self.mgr, 'post', url_close)
        self.assertEqual(res_no_ref.status_code, 400)
        self.assertEqual(res_no_ref.json()['code'], 'reference_required')

        res_close = self.call(self.mgr, 'post', url_close, {'reference': 'REF-OK'})
        self.assertEqual(res_close.status_code, 200)

        cust2 = self.user('cust2', 'employee', ['perm_petty_cash_manage'])
        acc2 = PettyCashAccount.objects.create(
            company=self.co, custodian=cust2, ceiling_amount=Decimal('1000000'),
            opening_balance=Decimal('400000'), opening_balance_date='1405/01/01'
        )
        old_level_before = petty_fund_level(acc2)

        new_cust = self.user('newcust', 'employee', ['perm_petty_cash_manage'])
        res_ho = self.call(self.mgr, 'post', f'{ACC}{acc2.pk}/handover/', {'new_custodian': new_cust.pk})
        self.assertEqual(res_ho.status_code, 201)
        fresh_acc = PettyCashAccount.objects.get(pk=res_ho.json()['new_account']['id'])
        acc2.refresh_from_db()
        self.assertEqual(petty_fund_level(acc2) + petty_fund_level(fresh_acc), old_level_before)

        res_patch_closed = self.call(self.mgr, 'patch', f'{ACC}{self.account.pk}/', {'is_active': True})
        self.assertEqual(res_patch_closed.status_code, 400)
        self.assertEqual(res_patch_closed.json()['code'], 'account_closed')

        res_post_expense = self.call(self.emp, 'post', TX, self.expense_payload('1405/08/11'))
        self.assertEqual(res_post_expense.status_code, 400)
        self.assertEqual(res_post_expense.json()['code'], 'account_closed')

    def test_scope_print_and_masking(self):
        self.set_opening('500000')
        res_rec = self.call(self.acc, 'post', REC, {
            'account': self.account.pk, 'period_end_date': '1405/08/10', 'counted_cash': '450000'
        })
        self.assertEqual(res_rec.status_code, 201)
        rec_id = res_rec.json()['id']

        res_set = self.call(self.acc, 'post', SET, {
            'account': self.account.pk, 'amount': '50000', 'method': 'cash', 'reference': 'REF-H'
        })
        self.assertEqual(res_set.status_code, 201)
        set_id = res_set.json()['id']

        line = self.draft_expense('50000', day='1405/08/15')
        res_st = self.call(self.emp, 'post', ST, {'line_ids': [line.pk]})
        self.assertEqual(res_st.status_code, 201)
        statement_id = res_st.json()['id']

        other_sets = self.call(self.outsider, 'get', SET, company=self.co2).json()
        self.assertNotIn(set_id, [s['id'] for s in other_sets])

        other_recs = self.call(self.outsider, 'get', REC, company=self.co2).json()
        self.assertNotIn(rec_id, [r['id'] for r in other_recs])

        res_out_post = self.call(self.outsider, 'post', SET, {
            'account': self.account.pk, 'amount': '10000', 'method': 'cash', 'reference': 'REF-OUT'
        }, company=self.co2)
        self.assertEqual(res_out_post.status_code, 404)

        res_out_print = self.call(
            self.outsider, 'get', f'/api/print/petty_cash_statement/{statement_id}/pdf/', company=self.co2
        )
        self.assertEqual(res_out_print.status_code, 404)

        PettyCashAccount.objects.filter(pk=self.account.pk).update(sheba_number=SHEBA_A)

        plain = self.user('plain', 'employee', ['perm_invoice_review'])
        acc_list = self.call(plain, 'get', ACC).json()
        acc_row = next(a for a in acc_list if a['id'] == self.account.pk)
        self.assertNotEqual(acc_row['sheba_number'], SHEBA_A)

        emp_list = self.call(self.emp, 'get', ACC).json()
        emp_row = next(a for a in emp_list if a['id'] == self.account.pk)
        self.assertEqual(emp_row['sheba_number'], SHEBA_A)
