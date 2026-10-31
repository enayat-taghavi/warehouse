"""
فاکتور روی موتور گردش کار هسته (ت۱۷ و ت۲ طرح ۲.۳): سناریوهای بخش ۵ در سطح سرور، با همان نشانی اکشن‌های فاکتور.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.models import Counterparty, ExpenseInvoice
from personnel.scoped_test_support import expense_head_id, grant_section_perms
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine
from workflow.models import WorkflowStep, WorkflowSubstitute, WorkflowThreshold

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


class InvoiceWorkflowTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IWF', name='شرکت گردش', is_active=True)
        project = Project.objects.create(company=self.company, code='IWF-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=project, code='IWF-S', name='بخش')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        self.emp = self.user('emp', 'employee')
        self.sup = self.user('sup', 'supervisor')
        self.acc = self.user('acc', 'accountant')
        self.acc2 = self.user('acc2', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')

    def user(self, name, role, section=None):
        u = User.objects.create_user(username=f'iwf_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, [], section=section or self.sec, role=role, exact=False)
        return u

    def invoice(self, creator, amount='1000'):
        return ExpenseInvoice.objects.create(
            section=self.sec, counterparty=self.cp,
            invoice_number=f'IWF-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01', amount=Decimal(amount), description='d',
            created_by=creator,
        )

    def post(self, user, inv, action, **data):
        c = APIClient()
        c.force_authenticate(user)
        with self.captureOnCommitCallbacks(execute=True):
            return c.post(f'{BASE}{inv.pk}/{action}/', data, format='json', HTTP_X_COMPANY_ID=str(self.company.pk))

    def step(self, inv):
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        return task.step_key if task else None

    def status(self, inv):
        inv.refresh_from_db()
        return inv.status

    def test_1_employee_invoice_full_chain_and_pay_needs_tracking(self):
        inv = self.invoice(self.emp)
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 200)
        self.assertEqual((self.step(inv), self.status(inv)), ('supervisor_ok', 'pending_supervisor'))
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 403)  # سند را می‌بیند، ولی کار او نیست
        self.assertEqual(self.post(self.sup, inv, 'approve').status_code, 200)
        self.assertEqual(self.status(inv), 'pending_accountant')
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 200)
        self.assertEqual(self.status(inv), 'pending_manager')
        self.assertEqual(self.post(self.mgr, inv, 'approve').status_code, 200)
        self.assertEqual(self.status(inv), 'ready_to_pay')
        # پرداخت بی‌شمارهٔ پیگیری از اکشن عمومی رد می‌شود و وضعیت عوض نمی‌شود
        self.assertEqual(self.post(self.trs, inv, 'approve').status_code, 400)
        self.assertEqual(self.status(inv), 'ready_to_pay')
        self.assertEqual(self.post(self.trs, inv, 'pay', tracking_code='TRK-1').status_code, 200)
        inv.refresh_from_db()
        self.assertEqual((inv.status, inv.payment_ref, inv.paid_by_id), ('paid', 'TRK-1', self.trs.pk))
        self.assertIsNone(self.step(inv))

    def test_2_supervisor_invoice_skips_to_accountant_with_reason(self):
        inv = self.invoice(self.sup)
        self.post(self.sup, inv, 'submit')
        self.assertEqual(self.step(inv), 'accountant_review')
        skipped = WorkflowStep.objects.get(instance__entity_id=inv.pk, action='submit').skipped
        self.assertEqual([s['step'] for s in skipped], ['supervisor_ok'])

    def test_3_accountant_invoice_goes_to_second_accountant_or_waits_with_alert(self):
        from unittest import mock
        from workflow import events
        inv = self.invoice(self.acc)
        self.post(self.acc, inv, 'submit')
        self.assertEqual(self.step(inv), 'accountant_review')
        res = self.post(self.acc, inv, 'approve')
        self.assertEqual((res.status_code, res.data.get('code')), (403, 'self_approval'))  # بررسی سند خود نه
        self.assertEqual(self.post(self.acc2, inv, 'approve').status_code, 200)
        self.assertEqual(self.step(inv), 'manager_ok')
        # ثبت‌کننده تنها حسابدار بخش: «بررسی حسابدار» با «بدون تأیید دوم» رد می‌شود و کار نزد مدیر است
        self.acc2.is_active = False
        self.acc2.save()
        inv2 = self.invoice(self.acc)
        self.post(self.acc, inv2, 'submit')
        self.assertEqual(self.step(inv2), 'manager_ok')
        skipped = WorkflowStep.objects.get(instance__entity_id=inv2.pk, action='submit').skipped
        self.assertEqual(skipped, [{'step': 'supervisor_ok', 'reason': 'creator_level'},
                                   {'step': 'accountant_review', 'reason': 'no_second_approval'}])
        # بخش بی حسابدار: کار بررسی بی‌دریافت‌کننده منتظر می‌ماند و مدیر کل هشدار می‌گیرد
        self.acc.is_active = False
        self.acc.save()
        inv3 = self.invoice(self.sup)
        with mock.patch.object(events, 'emit', wraps=events.emit) as emit:
            self.post(self.sup, inv3, 'submit')
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv3.pk)
        self.assertEqual((task.step_key, task.has_recipients), ('accountant_review', False))
        self.assertIn(events.SUPERUSER_ALERT, [c.args[0] for c in emit.call_args_list])
        from workflow.serializers import history_instance
        self.assertTrue(history_instance(task.instance, self.sup)['waiting_for_superuser'])

    def test_5_treasurer_invoice_keeps_manager_and_treasurer_pays_own(self):
        # ت۵: رتبهٔ خزانه‌دار (۳۰) از مدیر (۴۰) کمتر است؛ تأیید مدیر رد نمی‌شود، فقط سرپرست
        trs2 = self.user('trs2', 'treasury')
        inv = self.invoice(self.trs)
        self.post(self.trs, inv, 'submit')
        self.assertEqual(self.step(inv), 'accountant_review')
        self.post(self.acc, inv, 'approve')
        self.assertEqual(self.step(inv), 'manager_ok')
        self.post(self.mgr, inv, 'approve')
        self.assertEqual(self.step(inv), 'treasury_pay')
        skipped = [s['step'] for st in WorkflowStep.objects.filter(instance__entity_id=inv.pk) for s in st.skipped]
        self.assertEqual(skipped, ['supervisor_ok'])
        # مرحلهٔ پرداخت (creator_may_act): ثبت‌کننده هم دریافت‌کننده است و فاکتور تأییدشدهٔ خودش را پرداخت می‌کند
        from workflow.models import WorkflowTaskRecipient
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(set(WorkflowTaskRecipient.objects.filter(task=task).values_list('user_id', flat=True)),
                         {self.trs.pk, trs2.pk})
        self.assertEqual(self.post(self.trs, inv, 'pay', tracking_code='TRK-5').status_code, 200)
        inv.refresh_from_db()
        self.assertEqual((inv.status, inv.paid_by_id), ('paid', self.trs.pk))

    def test_4_manager_invoice_goes_to_other_manager_or_no_second_approval(self):
        inv = self.invoice(self.mgr)
        self.post(self.mgr, inv, 'submit')
        self.post(self.acc, inv, 'approve')
        self.assertEqual(self.step(inv), 'treasury_pay')  # مدیر دیگری نیست: «بدون تأیید دوم»
        mgr2 = self.user('mgr2', 'manager')
        inv2 = self.invoice(self.mgr)
        self.post(self.mgr, inv2, 'submit')
        self.post(self.acc, inv2, 'approve')
        self.assertEqual(self.step(inv2), 'manager_ok')
        self.assertEqual(self.post(self.mgr, inv2, 'approve').status_code, 403)  # تأیید سند خود نه
        self.assertEqual(self.post(mgr2, inv2, 'approve').status_code, 200)

    def test_6_threshold_and_resubmit_with_new_amount(self):
        WorkflowThreshold.objects.create(workflow_key=INVOICE_WORKFLOW, step_key='manager_ok', company=self.company,
                                         amount=Decimal('50000000'))
        inv = self.invoice(self.acc, amount='40000000')
        self.post(self.acc, inv, 'submit')
        self.post(self.acc2, inv, 'approve')
        self.assertEqual(self.step(inv), 'treasury_pay')
        self.assertEqual(self.post(self.trs, inv, 'request-revision', reason='مبلغ اشتباه').status_code, 200)
        self.assertEqual(self.status(inv), 'revision_required')
        inv.amount = Decimal('60000000')
        inv.save()
        self.post(self.acc, inv, 'submit')
        self.post(self.acc2, inv, 'approve')
        self.assertEqual(self.step(inv), 'manager_ok')

    def test_7_reject_locks_and_cancel_only_before_others_act(self):
        inv = self.invoice(self.emp)
        self.post(self.emp, inv, 'submit')
        self.assertEqual(self.post(self.emp, inv, 'cancel').status_code, 200)
        self.assertEqual((self.status(inv), self.step(inv)), ('draft', None))
        self.post(self.emp, inv, 'submit')
        self.post(self.sup, inv, 'approve')
        self.assertEqual(self.post(self.emp, inv, 'cancel').status_code, 409)
        self.assertEqual(self.post(self.acc, inv, 'reject').status_code, 400)  # دلیل اجباری
        self.assertEqual(self.post(self.acc, inv, 'reject', reason='تکراری').status_code, 200)
        self.assertEqual(self.status(inv), 'rejected')
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 400)
        c = APIClient()
        c.force_authenticate(self.emp)
        res = c.patch(f'{BASE}{inv.pk}/', {'status': 'draft'}, format='json', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 403)
        # فیلدهای پرداخت از ویرایش عادی نوشته نمی‌شوند (پرداخت فقط با اکشن pay)
        draft = self.invoice(self.emp)
        res = c.patch(f'{BASE}{draft.pk}/', {'payment_ref': 'X', 'paid_by': self.trs.pk}, format='json',
                      HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200)
        draft.refresh_from_db()
        self.assertEqual((draft.payment_ref or '', draft.paid_by_id), ('', None))

    def test_8_substitute_sees_and_acts_but_not_own_invoice_nor_list(self):
        other = ProjectSection.objects.create(project=self.sec.project, code='IWF-S2', name='بخش دو')
        helper = self.user('helper', 'employee', section=other)
        from django.utils import timezone
        WorkflowSubstitute.objects.create(principal=self.acc, substitute=helper, start_date=timezone.localdate(),
                                          end_date=timezone.localdate())
        self.acc2.is_active = False
        self.acc2.save()
        inv = self.invoice(self.sup)
        self.post(self.sup, inv, 'submit')
        c = APIClient()
        c.force_authenticate(helper)
        self.assertEqual(c.get(f'{BASE}{inv.pk}/', HTTP_X_COMPANY_ID=str(self.company.pk)).status_code, 200)
        other_company = Company.objects.create(code='IWF2', name='شرکت دیگر', is_active=True)
        self.assertIn(c.get(f'{BASE}{inv.pk}/', HTTP_X_COMPANY_ID=str(other_company.pk)).status_code, (403, 404))
        # ردیف کار کهنه بدون عضویت زندهٔ شرکت (نه دسترسی شرکت، نه انتساب بخش) سند را نشان نمی‌دهد
        UserCompanyAccess.objects.filter(user=helper).delete()
        SectionAssignment.objects.filter(user=helper).update(is_active=False)
        self.assertIn(c.get(f'{BASE}{inv.pk}/', HTTP_X_COMPANY_ID=str(self.company.pk)).status_code, (403, 404))
        self.assertEqual(c.get(f'{BASE}{inv.pk}/').status_code, 404)
        UserCompanyAccess.objects.create(user=helper, company=self.company, is_default=True)
        SectionAssignment.objects.filter(user=helper).update(is_active=True)
        listed = c.get(BASE, HTTP_X_COMPANY_ID=str(self.company.pk)).json()
        self.assertNotIn(inv.pk, [r['id'] for r in (listed.get('results') if isinstance(listed, dict) else listed)])
        self.assertEqual(self.post(helper, inv, 'approve').status_code, 200)
        self.assertEqual(WorkflowStep.objects.filter(instance__entity_id=inv.pk, action='act',
                                                     on_behalf_of=self.acc).count(), 1)

    def test_9_double_approve_gets_409(self):
        sup2 = self.user('sup2', 'supervisor')
        inv = self.invoice(self.emp)
        self.post(self.emp, inv, 'submit')
        stale = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertEqual(self.post(self.sup, inv, 'approve').status_code, 200)
        from workflow.errors import TaskAlreadyDone
        with self.assertRaises(TaskAlreadyDone):
            wf_engine.act(sup2, stale)
