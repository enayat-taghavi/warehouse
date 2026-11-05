"""
سرپرست تأییدکنندهٔ اختیاری حساب تنخواه (ت۳ و ت۴ طرح بازطراحی تنخواه ۱۴۰۵-۰۸): مرحلهٔ supervisor_ok اول هر دو گردش
فقط برای سرپرست حساب (یا جانشین فعالش)؛ حساب بی سرپرست مثل پیش؛ اعتبارسنجی، قفل تغییر، قلمرو دیدن و نمونهٔ
در جریان نسخهٔ ۱.
"""
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, UserCompanyAccess
from personnel.models import PettyCashAccount, PettyCashTransaction, WorkflowAuditLog
from personnel.scoped_test_support import grant_section_perms, pay_request, temp_media
from personnel.workflows import PETTY_CHARGE_WORKFLOW, PETTY_STATEMENT_WORKFLOW
from workflow import engine as wf_engine
from workflow.errors import WorkflowPermissionDenied
from workflow.models import WorkflowInstance, WorkflowSubstitute, WorkflowTask

User = get_user_model()
TX = '/api/personnel/petty-cash-transactions/'
ACC = '/api/personnel/petty-cash-accounts/'
ST = '/api/personnel/petty-cash-statements/'
V1_KEYS = ['accountant_review', 'manager_ok', 'treasury_pay']


def ids(res):
    data = res.json()
    return {r['id'] for r in (data['results'] if isinstance(data, dict) else data)}


@temp_media
class PettyApproverTests(TestCase):
    def setUp(self):
        self.co = Company.objects.create(code='PAP1', name='شرکت سرپرست', is_active=True)
        self.co2 = Company.objects.create(code='PAP2', name='شرکت دیگر', is_active=True)
        self.emp = self.user('emp', 'employee', ['perm_petty_cash_manage'])
        self.emp2 = self.user('emp2', 'employee', ['perm_petty_cash_manage'])
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')
        self.sup = self.user('sup', 'employee')
        self.outsider = self.user('out', 'employee', company=self.co2)
        self.account = PettyCashAccount.objects.create(company=self.co, custodian=self.emp,
                                                       ceiling_amount=Decimal('1000000'))
        self.account2 = PettyCashAccount.objects.create(company=self.co, custodian=self.emp2,
                                                        ceiling_amount=Decimal('1000000'))

    def user(self, name, role, codes=(), company=None):
        company = company or self.co
        u = User.objects.create_user(username=f'pap_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company, is_default=True)
        grant_section_perms(u, list(codes), company=company, role=role, exact=False)
        return u

    def call(self, user, method, url, data=None, company=None):
        c = APIClient()
        c.force_authenticate(user)
        data, fmt = pay_request(url, data or {})
        with self.captureOnCommitCallbacks(execute=True):
            return getattr(c, method)(url, data, format=fmt, HTTP_X_COMPANY_ID=str((company or self.co).pk))

    def step(self, key, pk):
        task = wf_engine.open_task(key, pk)
        return task.step_key if task else None

    def set_approver(self, approver, account=None):
        account = account or self.account
        res = self.call(self.mgr, 'patch', f'{ACC}{account.pk}/', {'approver': getattr(approver, 'pk', None)})
        self.assertEqual(res.status_code, 200, res.content)
        return res

    def charge(self, amount='500000', user=None):
        res = self.call(user or self.emp, 'post', f'{TX}request-charge/', {'amount': amount})
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()['id']

    def lines(self, account=None, custodian=None):
        return [PettyCashTransaction.objects.create(
            account=account or self.account, custodian=custodian or self.emp, created_by=custodian or self.emp,
            transaction_type='expense', amount=Decimal(a), transaction_date_shamsi='1405/08/01', title='t',
            category='c', status='draft') for a in ('100000', '250000')]

    # ─── رفتار پیشین بی سرپرست ─────────────────────────────────────────────
    def test_no_approver_charge_goes_straight_to_accountant(self):
        tx_id = self.charge()
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'accountant_review')
        inst = wf_engine.instance_of(PETTY_CHARGE_WORKFLOW, tx_id)
        self.assertFalse(WorkflowTask.objects.filter(instance=inst, step_key='supervisor_ok').exists())
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id))
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'treasury_pay')

    # ─── شارژ و صورت‌حساب با سرپرست ─────────────────────────────────────────
    def test_charge_stops_at_supervisor_only_approver_acts(self):
        res = self.set_approver(self.sup)
        self.assertEqual((res.json()['approver'], res.json()['approver_name']), (self.sup.pk, 'pap_sup'))
        self.assertTrue(WorkflowAuditLog.objects.filter(
            content_type='pettycashaccount', object_id=self.account.pk, action='petty_approver_change',
            from_status='', to_status=str(self.sup.pk)).exists())
        tx_id = self.charge()
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'supervisor_ok')
        task = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id)
        self.assertEqual(task.target_user_id, self.sup.pk)
        for other in (self.acc, self.mgr, self.emp):
            with self.assertRaises(WorkflowPermissionDenied):
                wf_engine.act(other, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id))
        wf_engine.act(self.sup, task)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'accountant_review')
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id))
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'treasury_pay')

    def test_approver_return_then_resend_goes_back_to_supervisor(self):
        self.set_approver(self.sup)
        tx_id = self.charge()
        wf_engine.return_for_fix(self.sup, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id), 'رسید ناقص')
        self.assertEqual(PettyCashTransaction.objects.get(pk=tx_id).status, 'draft')
        self.assertIsNone(self.step(PETTY_CHARGE_WORKFLOW, tx_id))
        res = self.call(self.emp, 'post', f'{TX}{tx_id}/send-charge/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'supervisor_ok')

    def test_statement_supervisor_cannot_reject_lines(self):
        self.set_approver(self.sup)
        lines = self.lines()
        res = self.call(self.emp, 'post', ST, {'line_ids': [l.pk for l in lines]})
        self.assertEqual(res.status_code, 201, res.content)
        st_id = res.json()['id']
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st_id), 'supervisor_ok')
        res = self.call(self.sup, 'post', f'{ST}{st_id}/reject-line/', {'line_id': lines[0].pk, 'reason': 'x'})
        self.assertEqual(res.status_code, 409, res.content)
        # سرپرست صورت‌حساب و ردیف‌هایش را می‌بیند
        self.assertIn(st_id, ids(self.call(self.sup, 'get', ST)))
        self.assertEqual(self.call(self.sup, 'get', f'{ST}{st_id}/').status_code, 200)
        self.assertEqual(ids(self.call(self.sup, 'get', f'{TX}?statement_id={st_id}')), {l.pk for l in lines})
        wf_engine.act(self.sup, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id))
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st_id), 'accountant_review')
        res = self.call(self.acc, 'post', f'{ST}{st_id}/reject-line/', {'line_id': lines[0].pk, 'reason': 'بی رسید'})
        self.assertEqual(res.status_code, 200, res.content)

    def test_active_substitute_of_approver_may_act(self):
        self.set_approver(self.sup)
        sub = self.user('sub', 'employee')
        today = datetime.date.today()
        WorkflowSubstitute.objects.create(principal=self.sup, substitute=sub, company=None,
                                          start_date=today - datetime.timedelta(days=1),
                                          end_date=today + datetime.timedelta(days=1))
        tx_id = self.charge()
        wf_engine.act(sub, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id))
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'accountant_review')

    # ─── اعتبارسنجی و مجوز تعیین سرپرست ────────────────────────────────────
    def test_approver_validation(self):
        url = f'{ACC}{self.account.pk}/'
        res = self.call(self.mgr, 'patch', url, {'approver': self.emp.pk})
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('approver', res.json())
        res = self.call(self.mgr, 'patch', url, {'approver': self.outsider.pk})
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('approver', res.json())
        # فقط مدیریت تنخواه یا مدیر در سطح شرکت (همان _can_manage)؛ تنخواه‌گردان سرپرست حساب خودش را تعیین نمی‌کند
        self.assertEqual(self.call(self.sup, 'patch', url, {'approver': self.sup.pk}).status_code, 404)
        self.assertEqual(self.call(self.emp, 'patch', url, {'approver': self.sup.pk}).status_code, 403)
        self.assertEqual(self.call(self.emp2, 'patch', url, {'approver': self.sup.pk}).status_code, 200)
        self.call(self.emp2, 'patch', url, {'approver': None})
        self.account.refresh_from_db()
        self.assertIsNone(self.account.approver_id)

    def test_create_account_with_approver(self):
        cust = self.user('cust', 'employee')
        res = self.call(self.mgr, 'post', ACC, {'custodian': cust.pk, 'approver': cust.pk})
        self.assertEqual(res.status_code, 400, res.content)
        res = self.call(self.mgr, 'post', ACC, {'custodian': cust.pk, 'approver': self.sup.pk})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(PettyCashAccount.objects.get(pk=res.json()['id']).approver_id, self.sup.pk)

    def test_change_blocked_while_pending_then_allowed(self):
        self.set_approver(self.sup)
        tx_id = self.charge()
        for value in (None, self.mgr.pk):
            res = self.call(self.mgr, 'patch', f'{ACC}{self.account.pk}/', {'approver': value})
            self.assertEqual(res.status_code, 400, res.content)
            self.assertEqual(res.json()['code'], 'approver_pending')
        # تغییر فیلد دیگر با همان سرپرست مجاز است
        res = self.call(self.mgr, 'patch', f'{ACC}{self.account.pk}/', {'description': 'یادداشت'})
        self.assertEqual(res.status_code, 200, res.content)
        wf_engine.act(self.sup, wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id))
        self.set_approver(None)
        self.account.refresh_from_db()
        self.assertIsNone(self.account.approver_id)
        self.assertTrue(WorkflowAuditLog.objects.filter(
            content_type='pettycashaccount', object_id=self.account.pk, action='petty_approver_change',
            from_status=str(self.sup.pk), to_status='').exists())

    # ─── قلمرو دیدن ─────────────────────────────────────────────────────────
    def test_approver_sees_only_own_accounts_documents(self):
        self.set_approver(self.sup)
        own_tx = self.charge()
        other_tx = self.charge(user=self.emp2)
        res = self.call(self.emp2, 'post', ST, {'line_ids': [l.pk for l in self.lines(self.account2, self.emp2)]})
        self.assertEqual(res.status_code, 201, res.content)
        other_st = res.json()['id']
        self.assertEqual(ids(self.call(self.sup, 'get', ACC)), {self.account.pk})
        txs = ids(self.call(self.sup, 'get', TX))
        self.assertIn(own_tx, txs)
        self.assertNotIn(other_tx, txs)
        self.assertEqual(ids(self.call(self.sup, 'get', ST)), set())
        self.assertEqual(self.call(self.sup, 'get', f'{TX}{own_tx}/').status_code, 200)
        self.assertEqual(self.call(self.sup, 'get', f'{TX}{other_tx}/').status_code, 404)
        self.assertEqual(self.call(self.sup, 'get', f'{ST}{other_st}/').status_code, 404)
        # دیدن پیوست/سابقه از قلاب can_view موتور؛ پیوست تازه نه
        from personnel.workflows import can_attach_petty_tx, can_view_petty_tx
        self.assertTrue(can_view_petty_tx(self.sup, own_tx))
        self.assertIsNone(can_view_petty_tx(self.sup, other_tx))
        self.assertIsNone(can_attach_petty_tx(self.sup, own_tx))
        # بی سرپرستی هیچ چیز دیده نمی‌شود
        PettyCashAccount.objects.filter(pk=self.account.pk).update(approver=None)
        self.assertEqual(self.call(self.sup, 'get', ACC).json(), [])

    # ─── نمونهٔ در جریان نسخهٔ ۱ ────────────────────────────────────────────
    def test_v1_instance_at_accountant_keeps_step_after_version_bump(self):
        tx_id = self.charge()
        inst = wf_engine.instance_of(PETTY_CHARGE_WORKFLOW, tx_id)
        task = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id)
        self.assertEqual(task.step_key, 'accountant_review')
        # همان شکل نمونهٔ ساخته‌شده با نسخهٔ ۱ روی app/soft
        WorkflowInstance.objects.filter(pk=inst.pk).update(version=1, step_keys=V1_KEYS)
        PettyCashAccount.objects.filter(pk=self.account.pk).update(approver=self.sup)
        self.assertEqual(wf_engine.migrate_open_instances(PETTY_CHARGE_WORKFLOW), 1)
        inst.refresh_from_db()
        self.assertEqual((inst.version, inst.current_step), (2, 'accountant_review'))
        self.assertEqual(inst.step_keys[0], 'supervisor_ok')
        same = wf_engine.open_task(PETTY_CHARGE_WORKFLOW, tx_id)
        self.assertEqual((same.pk, same.step_key), (task.pk, 'accountant_review'))
        wf_engine.act(self.acc, same)
        self.assertEqual(self.step(PETTY_CHARGE_WORKFLOW, tx_id), 'treasury_pay')
        self.assertFalse(WorkflowTask.objects.filter(instance=inst, step_key='supervisor_ok').exists())

    def test_v1_statement_at_manager_migrates_lazily_on_action(self):
        lines = self.lines()
        st_id = self.call(self.emp, 'post', ST, {'line_ids': [l.pk for l in lines]}).json()['id']
        wf_engine.act(self.acc, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id))
        self.assertEqual(self.step(PETTY_STATEMENT_WORKFLOW, st_id), 'manager_ok')
        inst = wf_engine.instance_of(PETTY_STATEMENT_WORKFLOW, st_id)
        WorkflowInstance.objects.filter(pk=inst.pk).update(version=1, step_keys=V1_KEYS)
        PettyCashAccount.objects.filter(pk=self.account.pk).update(approver=self.sup)
        # بی migrate_open_instances: اقدام خودش نمونه را به نسخهٔ ۲ می‌برد و مرحله را نگه می‌دارد
        wf_engine.act(self.mgr, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id))
        inst.refresh_from_db()
        self.assertEqual((inst.version, inst.current_step), (2, 'treasury_pay'))
