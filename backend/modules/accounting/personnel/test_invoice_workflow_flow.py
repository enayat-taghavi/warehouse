"""
آزمون‌های سناریوی ۱ و ۲ گردش کار فاکتور هزینه (Release v1 گام ۲.۳-ه):
جابجایی کار بین کارتابل‌ها در هر مرحله، بخش بدون سرپرست، و ثبت دلیل رد در سابقه.
"""
from decimal import Decimal
import unittest

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.models import Counterparty, ExpenseInvoice
from personnel.scoped_test_support import grant_section_perms, pay_request, temp_media
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine
from workflow.models import WorkflowStep, WorkflowSubstitute, WorkflowThreshold

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


@temp_media
class InvoiceFlowScenarioTests(TestCase):
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

    def invoice(self, creator, amount='1000', section=None):
        return ExpenseInvoice.objects.create(
            section=section or self.sec,
            counterparty=self.cp,
            invoice_number=f'IWF-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01',
            amount=Decimal(amount),
            description='d',
            created_by=creator,
        )

    def post(self, user, inv, action, **data):
        c = APIClient()
        c.force_authenticate(user)
        data, fmt = pay_request(action, data)
        with self.captureOnCommitCallbacks(execute=True):
            return c.post(f'{BASE}{inv.pk}/{action}/', data, format=fmt, HTTP_X_COMPANY_ID=str(self.company.pk))

    def step(self, inv):
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        return task.step_key if task else None

    def status(self, inv):
        inv.refresh_from_db()
        return inv.status

    def cartable(self, user):
        """مجموعهٔ entity_id کارتهای فاکتور هزینه در کارتابل کاربر."""
        c = APIClient()
        c.force_authenticate(user)
        res = c.get('/api/workflow/tasks/')
        self.assertEqual(res.status_code, 200)
        return {
            card['entity_id']
            for card in res.data['results']
            if card.get('entity_kind') == 'expense_invoice'
        }

    def cartable_card(self, user, inv):
        """کارت فاکتور مورد نظر در کارتابل کاربر (یا None)."""
        c = APIClient()
        c.force_authenticate(user)
        res = c.get('/api/workflow/tasks/')
        self.assertEqual(res.status_code, 200)
        for card in res.data['results']:
            if card.get('entity_kind') == 'expense_invoice' and card.get('entity_id') == inv.pk:
                return card
        return None

    def task_count(self, user):
        """تعداد کارهای باز کاربر از اندپوینت tasks/count/."""
        c = APIClient()
        c.force_authenticate(user)
        res = c.get('/api/workflow/tasks/count/')
        self.assertEqual(res.status_code, 200)
        return res.data['count']

    def history(self, user, inv):
        """دریافت سابقهٔ گردش کار سند از دید کاربر."""
        c = APIClient()
        c.force_authenticate(user)
        res = c.get(f'/api/workflow/history/?kind=expense_invoice&id={inv.pk}')
        self.assertEqual(res.status_code, 200)
        return res.data

    def test_scenario_1_each_step_moves_task_between_cartables(self):
        """سناریو ۱: در هر مرحله کار از کارتابل قبلی برداشته و در کارتابل بعدی دیده می‌شود؛ در پایان کارتابل همه خالی است."""
        inv = self.invoice(self.emp)
        # ثبت و ارسال فاکتور توسط کارمند
        res = self.post(self.emp, inv, 'submit')
        self.assertEqual(res.status_code, 200)

        # پس از ارسال: کار فقط در کارتابل سرپرست است
        self.assertIn(inv.pk, self.cartable(self.sup))
        self.assertNotIn(inv.pk, self.cartable(self.acc))
        self.assertNotIn(inv.pk, self.cartable(self.mgr))
        self.assertNotIn(inv.pk, self.cartable(self.trs))
        self.assertNotIn(inv.pk, self.cartable(self.emp))
        card = self.cartable_card(self.sup, inv)
        self.assertIsNotNone(card)
        self.assertEqual(card['step_key'], 'supervisor_ok')

        # تأیید سرپرست: کار به کارتابل حسابدار می‌رود و از سرپرست برداشته می‌شود
        res = self.post(self.sup, inv, 'approve')
        self.assertEqual(res.status_code, 200)
        self.assertIn(inv.pk, self.cartable(self.acc))
        self.assertNotIn(inv.pk, self.cartable(self.sup))
        self.assertNotIn(inv.pk, self.cartable(self.mgr))
        self.assertNotIn(inv.pk, self.cartable(self.trs))
        self.assertNotIn(inv.pk, self.cartable(self.emp))
        card = self.cartable_card(self.acc, inv)
        self.assertIsNotNone(card)
        self.assertEqual(card['step_key'], 'accountant_review')

        # تأیید حسابدار: کار به کارتابل مدیر می‌رود و از حسابدار برداشته می‌شود
        res = self.post(self.acc, inv, 'approve')
        self.assertEqual(res.status_code, 200)
        self.assertIn(inv.pk, self.cartable(self.mgr))
        self.assertNotIn(inv.pk, self.cartable(self.acc))
        self.assertNotIn(inv.pk, self.cartable(self.sup))
        self.assertNotIn(inv.pk, self.cartable(self.trs))
        self.assertNotIn(inv.pk, self.cartable(self.emp))
        card = self.cartable_card(self.mgr, inv)
        self.assertIsNotNone(card)
        self.assertEqual(card['step_key'], 'manager_ok')

        # تأیید مدیر: کار به کارتابل خزانه‌دار می‌رود و از مدیر برداشته می‌شود
        res = self.post(self.mgr, inv, 'approve')
        self.assertEqual(res.status_code, 200)
        self.assertIn(inv.pk, self.cartable(self.trs))
        self.assertNotIn(inv.pk, self.cartable(self.mgr))
        self.assertNotIn(inv.pk, self.cartable(self.acc))
        self.assertNotIn(inv.pk, self.cartable(self.sup))
        self.assertNotIn(inv.pk, self.cartable(self.emp))
        card = self.cartable_card(self.trs, inv)
        self.assertIsNotNone(card)
        self.assertEqual(card['step_key'], 'treasury_pay')

        # تسویه و پرداخت توسط خزانه‌دار با شماره پیگیری
        res = self.post(self.trs, inv, 'pay', tracking_code='TRK-SCENARIO-1')
        self.assertEqual(res.status_code, 200)

        # پس از پرداخت در کارتابل هیچ‌یک از ۵ کاربر نیست و شمارنده کارتابل همه ۰ است
        users = (self.emp, self.sup, self.acc, self.mgr, self.trs)
        for u in users:
            self.assertNotIn(inv.pk, self.cartable(u))
            self.assertEqual(self.task_count(u), 0)

    def test_scenario_2_supervisor_invoice_goes_to_accountant_and_reject_reason_in_history(self):
        """سناریو ۲ (بخش اول): فاکتور سرپرست مستقیم به حسابدار می‌رسد و دلیل رد قطعی در سابقه ثبت می‌شود."""
        inv = self.invoice(self.sup)
        res = self.post(self.sup, inv, 'submit')
        self.assertEqual(res.status_code, 200)

        # کار در کارتابل حسابدار است و از سرپرست رد شده
        self.assertIn(inv.pk, self.cartable(self.acc))
        self.assertNotIn(inv.pk, self.cartable(self.sup))
        card = self.cartable_card(self.acc, inv)
        self.assertIsNotNone(card)
        self.assertEqual(card['step_key'], 'accountant_review')

        # قدم submit در سابقه دارای skipped با مرحله supervisor_ok است
        hist = self.history(self.sup, inv)
        inst_data = hist['instances'][0]
        submit_step = next(s for s in inst_data['steps'] if s['action'] == 'submit')
        skipped_steps = [s['step'] for s in submit_step['skipped']]
        self.assertIn('supervisor_ok', skipped_steps)

        # حسابدار فاکتور را با دلیل رد می‌کند
        reject_reason = 'فاکتور تکراری'
        res = self.post(self.acc, inv, 'reject', reason=reject_reason)
        self.assertEqual(res.status_code, 200)

        # خواندن سابقه از دید سرپرست (ثبت‌کننده)
        hist = self.history(self.sup, inv)
        inst_data = hist['instances'][0]
        self.assertEqual(inst_data['status'], 'rejected')

        reject_steps = [s for s in inst_data['steps'] if s['action'] == 'reject']
        self.assertEqual(len(reject_steps), 1)
        self.assertEqual(reject_steps[0]['reason'], reject_reason)

        # فاکتور در کارتابل هیچ‌کس نیست
        for u in (self.emp, self.sup, self.acc, self.mgr, self.trs):
            self.assertNotIn(inv.pk, self.cartable(u))
            self.assertEqual(self.task_count(u), 0)

    def test_scenario_2_unsupervised_section_employee_goes_to_accountant(self):
        """سناریو ۲ (بخش دوم): فاکتور کارمند بخش بی‌سرپرست مستقیم به حسابدار می‌رسد و دلیل رد در سابقه می‌آید."""
        # ایجاد بخش دوم در همان پروژه بدون سرپرست
        sec2 = ProjectSection.objects.create(project=self.sec.project, code='IWF-S2', name='بخش دوم')
        emp2 = self.user('emp2', 'employee', section=sec2)
        acc3 = self.user('acc3', 'accountant', section=sec2)

        # کارمند بخش دوم فاکتور را ثبت و ارسال می‌کند
        inv = self.invoice(emp2, section=sec2)
        res = self.post(emp2, inv, 'submit')
        self.assertEqual(res.status_code, 200)

        # کار در مرحله accountant_review و در کارتابل acc3 است
        self.assertIn(inv.pk, self.cartable(acc3))
        self.assertNotIn(inv.pk, self.cartable(emp2))
        self.assertNotIn(inv.pk, self.cartable(self.sup))
        self.assertNotIn(inv.pk, self.cartable(self.acc))
        card = self.cartable_card(acc3, inv)
        self.assertIsNotNone(card)
        self.assertEqual(card['step_key'], 'accountant_review')

        # قدم submit در سابقه، مرحله supervisor_ok را با دلیل no_recipient رد کرده است
        hist = self.history(emp2, inv)
        inst_data = hist['instances'][0]
        submit_step = next(s for s in inst_data['steps'] if s['action'] == 'submit')
        skipped = submit_step['skipped']
        self.assertTrue(any(s['step'] == 'supervisor_ok' and s['reason'] == 'no_recipient' for s in skipped))

        # حسابدار دوم (acc3) فاکتور را با دلیل رد می‌کند
        reject_reason = 'مدرک ناقص'
        res = self.post(acc3, inv, 'reject', reason=reject_reason)
        self.assertEqual(res.status_code, 200)

        # سابقه فاکتور رد شدن و دلیل آن را نشان می‌دهد
        hist = self.history(emp2, inv)
        inst_data = hist['instances'][0]
        self.assertEqual(inst_data['status'], 'rejected')

        reject_steps = [s for s in inst_data['steps'] if s['action'] == 'reject']
        self.assertEqual(len(reject_steps), 1)
        self.assertEqual(reject_steps[0]['reason'], reject_reason)

        # فاکتور در کارتابل هیچ‌یک از کاربران این بخش نیست
        self.assertNotIn(inv.pk, self.cartable(emp2))
        self.assertNotIn(inv.pk, self.cartable(acc3))
        self.assertEqual(self.task_count(emp2), 0)
        self.assertEqual(self.task_count(acc3), 0)
