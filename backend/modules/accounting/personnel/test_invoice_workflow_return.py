"""
فاکتور روی موتور گردش کار هسته (طرح ۲.۳ سناریوهای ۴ و ۷):
- سناریوی ۴: فاکتور مدیر بدون مدیر دیگر با برچسب «بدون تأیید دوم» رد می‌شود و در کارتابل مدیر نمی‌آید.
- سناریوی ۷: عودت برای اصلاح کار را از سطح ثبت‌کننده از نو شروع می‌کند؛ رد قطعی فاکتور را قفل می‌کند و لغو پس از اقدام نفر دیگر ناممکن است.
"""
from decimal import Decimal
import unittest

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.models import Counterparty, ExpenseInvoice
from personnel.scoped_test_support import give_valid_sheba, grant_section_perms
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine
from workflow.models import WorkflowStep, WorkflowSubstitute, WorkflowThreshold

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


class InvoiceReturnScenarioTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IWF', name='شرکت گردش', is_active=True)
        project = Project.objects.create(company=self.company, code='IWF-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=project, code='IWF-S', name='بخش')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        give_valid_sheba(self.cp)
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
            section=self.sec, counterparty=self.cp, invoice_number=f'IWF-{ExpenseInvoice.objects.count() + 1}',
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

    def cartable(self, user):
        """مجموعهٔ entity_id کارت‌های گردش کار با entity_kind == 'expense_invoice' در کارتابل کاربر."""
        c = APIClient()
        c.force_authenticate(user)
        res = c.get('/api/workflow/tasks/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        return {card['entity_id'] for card in data.get('results', []) if card.get('entity_kind') == 'expense_invoice'}

    def history(self, user, inv):
        """دریافت ساختار سابقهٔ گردش کار فاکتور با احراز هویت کاربر مشخص."""
        c = APIClient()
        c.force_authenticate(user)
        return c.get(f'/api/workflow/history/?kind=expense_invoice&id={inv.pk}')

    def all_skipped(self, user, inv):
        """تمام آیتم‌های skipped در تمام گام‌های تمام نمونه‌ها در سابقهٔ فاکتور."""
        res = self.history(user, inv)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        skipped = []
        for inst in data.get('instances', []):
            for step in inst.get('steps', []):
                skipped.extend(step.get('skipped', []))
        return skipped

    def test_scenario_4_manager_invoice_without_other_manager_shows_no_second_approval(self):
        """
        سناریوی ۴: فاکتور مدیر، ارسال و تأیید حسابدار.
        مرحله روی پرداخت خزانه‌دار (treasury_pay) قرار می‌گیرد؛
        آیتم‌های ردشده حاوی مرحلهٔ manager_ok با دلیل no_second_approval و «بدون تأیید دوم» هستند؛
        فاکتور در هیچ نقطه‌ای پس از ارسال در کارتابل مدیر قرار نمی‌گیرد.
        """
        inv = self.invoice(self.mgr)
        self.assertEqual(self.post(self.mgr, inv, 'submit').status_code, 200)
        # پس از ارسال، فاکتور در کارتابل مدیر ثبت‌کننده نیست
        self.assertNotIn(inv.pk, self.cartable(self.mgr))

        # حسابدار تأیید می‌کند
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 200)
        self.assertEqual(self.step(inv), 'treasury_pay')

        # تمام موارد ردشدهٔ فاکتور باید شامل مرحلهٔ manager_ok با دلیل no_second_approval باشد
        skipped = self.all_skipped(self.mgr, inv)
        found = any(
            s.get('step') == 'manager_ok' and
            s.get('reason') == 'no_second_approval' and
            s.get('reason_fa') == 'بدون تأیید دوم'
            for s in skipped
        )
        self.assertTrue(found, f"مرحلهٔ manager_ok با دلیل no_second_approval در موارد ردشده یافت نشد: {skipped}")

        # فاکتور در کارتابل مدیر نیست
        self.assertNotIn(inv.pk, self.cartable(self.mgr))

    def test_scenario_7_return_for_fix_restarts_from_creator_level(self):
        """
        سناریوی ۷ (بخش ۱): عودت برای اصلاح به ثبت‌کننده.
        فاکتور کارمند، تأیید سرپرست و سپس عودت توسط حسابدار با دلیل «مبلغ اشتباه است».
        وضعیت فاکتور revision_required می‌شود، در کارتابل هیچ‌کس نیست و سابقه گام return با همان دلیل دارد.
        پس از اصلاح مبلغ توسط کارمند و ارسال دوباره، گردش از supervisor_ok مجدداً شروع شده،
        در کارتابل سرپرست قرار می‌گیرد (نه حسابدار) و سابقه گام جدید submit را پس از return نشان می‌دهد.
        """
        inv = self.invoice(self.emp)
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 200)
        self.assertEqual(self.post(self.sup, inv, 'approve').status_code, 200)

        # حسابدار عودت برای اصلاح می‌دهد
        res = self.post(self.acc, inv, 'request-revision', reason='مبلغ اشتباه است')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.status(inv), 'revision_required')

        # فاکتور در کارتابل هیچ‌یک از کاربران نیست
        for u in (self.emp, self.sup, self.acc, self.acc2, self.mgr, self.trs):
            self.assertNotIn(inv.pk, self.cartable(u))

        # سابقه گامی با action == 'return' و دلیل مربوطه دارد
        h_res = self.history(self.emp, inv)
        self.assertEqual(h_res.status_code, 200)
        h_data = h_res.json()
        return_steps = [
            s for inst in h_data.get('instances', [])
            for s in inst.get('steps', [])
            if s.get('action') == 'return'
        ]
        self.assertTrue(return_steps, "گام return در سابقه فاکتور یافت نشد")
        self.assertEqual(return_steps[-1].get('reason'), 'مبلغ اشتباه است')

        # کارمند مبلغ را تغییر داده (ذخیره مدل) و مجدداً ارسال می‌کند
        inv.amount = Decimal('2000')
        inv.save()
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 200)

        # کار مجدداً در supervisor_ok است و در کارتابل سرپرست قرار دارد نه حسابدار
        self.assertEqual(self.step(inv), 'supervisor_ok')
        self.assertIn(inv.pk, self.cartable(self.sup))
        self.assertNotIn(inv.pk, self.cartable(self.acc))

        # سابقه شکل واقعی API و ترتیب گام‌های submit -> act -> return -> submit را دارد
        h_res_after = self.history(self.emp, inv)
        self.assertEqual(h_res_after.status_code, 200)
        h_data_after = h_res_after.json()
        instances = h_data_after.get('instances', [])
        # در موتور فعلی، نمونهٔ عودت‌داده‌شده هنگام submit دوباره استفاده می‌شود (۱ نمونه)
        self.assertEqual(len(instances), 1)
        actions = [s.get('action') for inst in instances for s in inst.get('steps', [])]
        self.assertEqual(actions, ['submit', 'act', 'return', 'submit'])

    def test_scenario_7_reject_locks_and_cancel_flag(self):
        """
        سناریوی ۷ (بخش ۲): قفل رد قطعی و وضعیت پرچم can_cancel.
        فاکتور کارمند، ارسال: can_cancel برای کارمند True است.
        سرپرست تأیید می‌کند: can_cancel برابر False می‌شود و درخواست cancel کد ۴۰۹ برمی‌گرداند.
        حسابدار با دلیل «تکراری» رد قطعی می‌کند: وضعیت rejected، ارسال مجدد کد ۴۰۰، و فاکتور در کارتابل هیچ‌کس نیست.
        """
        inv = self.invoice(self.emp)
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 200)

        # سابقه: can_cancel برای کارمند True است
        h1 = self.history(self.emp, inv)
        self.assertEqual(h1.status_code, 200)
        self.assertTrue(h1.json()['instances'][0].get('can_cancel'))

        # سرپرست تأیید می‌کند
        self.assertEqual(self.post(self.sup, inv, 'approve').status_code, 200)

        # اکنون can_cancel برابر False است و فراخوانی POST cancel خطای ۴۰۹ برمی‌گرداند
        h2 = self.history(self.emp, inv)
        self.assertEqual(h2.status_code, 200)
        self.assertFalse(h2.json()['instances'][0].get('can_cancel'))
        self.assertEqual(self.post(self.emp, inv, 'cancel').status_code, 409)

        # حسابدار با دلیل «تکراری» رد قطعی می‌کند
        self.assertEqual(self.post(self.acc, inv, 'reject', reason='تکراری').status_code, 200)
        self.assertEqual(self.status(inv), 'rejected')

        # ارسال مجدد با کد ۴۰۰ رد می‌شود
        self.assertEqual(self.post(self.emp, inv, 'submit').status_code, 400)

        # فاکتور در کارتابل هیچ‌یک از کاربران نیست
        for u in (self.emp, self.sup, self.acc, self.acc2, self.mgr, self.trs):
            self.assertNotIn(inv.pk, self.cartable(u))
