"""
گام ط طرح اصلاح رسید پرداخت: تنظیم شرکتی «ایجادکننده می‌تواند رسید خودش را تأیید کند» و ویرایش حسابدار مرحلهٔ
بررسی پیش از اولین پرداخت با ردیف سابقه.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.models import Counterparty, ExpenseInvoice
from personnel.scoped_test_support import (expense_head_id, give_valid_sheba, grant_section_perms, pay_request,
                                           temp_media)
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine
from workflow.models import WorkflowCompanySettings, WorkflowStep, WorkflowThreshold

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


@temp_media
class InvoiceStepITests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IST', name='شرکت ط', is_active=True)
        project = Project.objects.create(company=self.company, code='IST-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=project, code='IST-S', name='بخش')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        give_valid_sheba(self.cp)
        self.head = expense_head_id(self.sec)
        self.emp = self.user('emp', 'employee')
        self.sup = self.user('sup', 'supervisor')
        self.acc = self.user('acc', 'accountant')
        self.acc2 = self.user('acc2', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')

    def user(self, name, role, company=None, section=None):
        u = User.objects.create_user(username=f'ist_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=company or self.company, is_default=True)
        grant_section_perms(u, [], section=section or self.sec, role=role, exact=False)
        return u

    def invoice(self, creator, amount='1000'):
        inv = ExpenseInvoice.objects.create(
            section=self.sec, counterparty=self.cp, invoice_number=f'IST-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01', amount=Decimal(amount), description='d', created_by=creator,
        )
        inv.lines.create(position=1, description='d', quantity=Decimal('1'), unit_price=Decimal(amount),
                         line_amount=Decimal(amount), expense_head_id=self.head)
        return inv

    def client_for(self, user, company=None):
        c = APIClient()
        c.force_authenticate(user)
        c.credentials(HTTP_X_COMPANY_ID=str((company or self.company).pk))
        return c

    def post(self, user, inv, action, **data):
        data, fmt = pay_request(action, data)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client_for(user).post(f'{BASE}{inv.pk}/{action}/', data, format=fmt)

    def patch(self, user, inv, data, company=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client_for(user, company).patch(f'{BASE}{inv.pk}/', data, format='json')

    def step(self, inv):
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        return task.step_key if task else None

    def set_self_approval(self, on):
        WorkflowCompanySettings.objects.update_or_create(company=self.company,
                                                         defaults={'creator_may_approve_own': on})

    def at_accountant(self, creator=None):
        inv = self.invoice(creator or self.emp)
        self.assertEqual(self.post(creator or self.emp, inv, 'submit').status_code, 200)
        if self.step(inv) == 'supervisor_ok':
            self.assertEqual(self.post(self.sup, inv, 'approve').status_code, 200)
        self.assertEqual(self.step(inv), 'accountant_review')
        return inv

    # ─── تنظیم شرکتی تأیید خود ─────────────────────────────────────────────

    def test_setting_off_keeps_self_approval_block(self):
        inv = self.at_accountant(self.acc)
        res = self.post(self.acc, inv, 'approve')
        self.assertEqual((res.status_code, res.data.get('code')), (403, 'self_approval'))

    def test_setting_on_creator_reviews_own_invoice(self):
        self.set_self_approval(True)
        inv = self.at_accountant(self.acc)
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 200)
        self.assertEqual(self.step(inv), 'manager_ok')

    def test_setting_on_sole_accountant_creator_is_not_skipped(self):
        self.acc2.is_active = False
        self.acc2.save()
        self.set_self_approval(True)
        inv = self.invoice(self.acc)
        self.post(self.acc, inv, 'submit')
        self.assertEqual(self.step(inv), 'accountant_review')
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 200)

    def test_setting_of_other_company_has_no_effect(self):
        other = Company.objects.create(code='IST2', name='دیگر', is_active=True)
        WorkflowCompanySettings.objects.create(company=other, creator_may_approve_own=True)
        inv = self.at_accountant(self.acc)
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 403)

    def test_superuser_creator_never_self_approves(self):
        self.set_self_approval(True)
        root = User.objects.create_superuser(username='ist_root', password='x')
        UserCompanyAccess.objects.create(user=root, company=self.company, is_default=True)
        inv = self.invoice(root)
        self.post(root, inv, 'submit')
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertIsNotNone(task)
        res = self.post(root, inv, 'approve')
        self.assertEqual((res.status_code, res.data.get('code')), (403, 'self_approval'))

    def test_toggle_recomputes_open_task_recipients(self):
        inv = self.at_accountant(self.acc)
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        self.assertFalse(task.recipients.filter(user=self.acc).exists())
        root = User.objects.create_superuser(username='ist_root2', password='x')
        url = reverse('workflow-company-settings', args=[self.company.pk])
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client_for(root).put(url, {'reminder_hours': 48, 'escalation_hours': 96,
                                                  'creator_may_approve_own': True}, format='json')
        self.assertEqual((res.status_code, res.data['creator_may_approve_own']), (200, True))
        self.assertTrue(task.recipients.filter(user=self.acc).exists())
        bad = self.client_for(root).put(url, {'reminder_hours': 48, 'escalation_hours': 96,
                                              'creator_may_approve_own': 'yes'}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(self.client_for(self.acc).get(url).status_code, 403)

    # ─── ویرایش حسابدار ─────────────────────────────────────────────────────

    def lines(self, price):
        return [{'expense_head': self.head, 'description': 'ردیف تازه', 'quantity': '1', 'unit_price': str(price)}]

    def test_accountant_edits_at_review_and_history_row(self):
        inv = self.at_accountant()
        res = self.patch(self.acc, inv, {'description': 'شرح تازه', 'lines': self.lines(1500)})
        self.assertEqual(res.status_code, 200, res.data)
        inv.refresh_from_db()
        self.assertEqual((inv.description, inv.amount, inv.updated_by_id, inv.status),
                         ('شرح تازه', Decimal('1500'), self.acc.pk, 'pending_accountant'))
        row = WorkflowStep.objects.get(instance__entity_id=inv.pk, action=WorkflowStep.EDIT)
        self.assertEqual((row.actor_id, row.from_step, row.to_step), (self.acc.pk, 'accountant_review',
                                                                      'accountant_review'))
        self.assertIn('ردیف‌ها', row.reason)
        self.assertEqual(wf_engine.instance_of(INVOICE_WORKFLOW, inv.pk).amount, Decimal('1500'))
        # بی تغییر واقعی ردیف سابقهٔ تازه نیست
        self.assertEqual(self.patch(self.acc, inv, {'description': 'شرح تازه'}).status_code, 200)
        self.assertEqual(WorkflowStep.objects.filter(instance__entity_id=inv.pk, action='edit').count(), 1)

    def test_amount_increase_replans_later_threshold(self):
        WorkflowThreshold.objects.create(workflow_key=INVOICE_WORKFLOW, company=self.company,
                                         step_key='manager_ok', amount=Decimal('5000'))
        inv = self.at_accountant()
        self.assertIn('manager_ok', wf_engine.instance_of(INVOICE_WORKFLOW, inv.pk).skip_plan)
        self.assertEqual(self.patch(self.acc, inv, {'lines': self.lines(9000)}).status_code, 200)
        self.assertNotIn('manager_ok', wf_engine.instance_of(INVOICE_WORKFLOW, inv.pk).skip_plan)
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 200)
        self.assertEqual(self.step(inv), 'manager_ok')

    def test_amount_past_skipped_earlier_threshold_is_allowed_and_logged(self):
        # تصمیم کاربر ۱۱ آبان ۱۴۰۵: حسابدار مبلغ را بالا می‌برد؛ مرحلهٔ گذشته دوباره باز نمی‌شود، مبلغ پیشین در سابقه
        WorkflowThreshold.objects.create(workflow_key=INVOICE_WORKFLOW, company=self.company,
                                         step_key='supervisor_ok', amount=Decimal('5000'))
        inv = self.at_accountant()
        self.assertEqual(self.patch(self.acc, inv, {'lines': self.lines(9000)}).status_code, 200)
        inv.refresh_from_db()
        self.assertEqual(inv.amount, Decimal('9000'))
        row = WorkflowStep.objects.get(instance__entity_id=inv.pk, action='edit')
        self.assertIn('1,000', row.reason)
        self.assertIn('9,000', row.reason)
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 200)
        self.assertEqual(self.step(inv), 'manager_ok')

    def test_others_cannot_edit_at_review(self):
        inv = self.at_accountant()
        for user in (self.emp, self.sup, self.mgr, self.trs):
            self.assertIn(self.patch(user, inv, {'description': 'x'}).status_code, (403, 404), user.username)
        other = Company.objects.create(code='IST3', name='سوم', is_active=True)
        osec = ProjectSection.objects.create(project=Project.objects.create(company=other, code='O', name='o'),
                                             code='OS', name='os')
        outsider = self.user('oacc', 'accountant', company=other, section=osec)
        self.assertIn(self.patch(outsider, inv, {'description': 'x'}, company=other).status_code, (403, 404))
        self.assertIn(self.patch(outsider, inv, {'description': 'x'}).status_code, (403, 404))
        inv.refresh_from_db()
        self.assertEqual(inv.description, 'd')

    def test_accountant_cannot_change_section_or_edit_later_steps(self):
        inv = self.at_accountant()
        sec2 = ProjectSection.objects.create(project=self.sec.project, code='IST-S2', name='بخش ۲')
        grant_section_perms(self.acc, [], section=sec2, role='accountant', exact=False)
        self.assertEqual(self.patch(self.acc, inv, {'section': sec2.pk}).status_code, 403)
        self.assertEqual(self.post(self.acc, inv, 'approve').status_code, 200)
        self.assertEqual(self.patch(self.acc, inv, {'description': 'x'}).status_code, 403)
        self.post(self.mgr, inv, 'approve')
        self.assertEqual(self.post(self.trs, inv, 'pay', tracking_code='T-1').status_code, 200)
        self.assertIn(self.patch(self.acc, inv, {'description': 'x'}).status_code, (403, 404))

    def test_creator_accountant_edits_only_with_setting(self):
        inv = self.at_accountant(self.acc)
        self.assertIn(self.patch(self.acc, inv, {'description': 'x'}).status_code, (403, 404))
        self.set_self_approval(True)
        from workflow.recompute import recompute_open_tasks
        recompute_open_tasks(company_ids={self.company.pk})
        self.assertEqual(self.patch(self.acc, inv, {'description': 'x'}).status_code, 200)
