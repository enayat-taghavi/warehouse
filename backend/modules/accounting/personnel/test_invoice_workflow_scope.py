"""
سناریوهای ۸ تا ۱۰ بخش ۵ طرح ۲.۳ روی فاکتور (۲.۳-ه): دامنهٔ جانشین، برداشتن تنها سرپرست، زمان‌بند و کانال‌های
وب‌سوکت؛ و دستور seed_workflow_scenario.
"""
import datetime
import os
import re
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess
from personnel.models import Counterparty, ExpenseInvoice, PersonnelProfile
from personnel.scoped_test_support import grant_section_perms
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine
from workflow import realtime
from workflow.models import WorkflowSubstitute, WorkflowThreshold
from workflow.scheduler import run_tick

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'
PERSONAL = re.compile(r'^user_\d+$')


class FakeLayer:
    def __init__(self):
        self.sent = []

    async def group_send(self, group, message):
        self.sent.append((group, message))


class InvoiceScopeScenarioTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IWS', name='شرکت دامنه', is_active=True)
        self.project = Project.objects.create(company=self.company, code='IWS-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=self.project, code='IWS-S', name='بخش')
        self.other = ProjectSection.objects.create(project=self.project, code='IWS-S2', name='بخش دو')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        self.emp = self.user('emp', 'employee')
        self.sup = self.user('sup', 'supervisor')
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')

    def user(self, name, role, section=None):
        u = User.objects.create_user(username=f'iws_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, [], section=section or self.sec, role=role, exact=False)
        return u

    def invoice(self, creator, amount='1000'):
        return ExpenseInvoice.objects.create(
            section=self.sec, counterparty=self.cp, invoice_number=f'IWS-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01', amount=Decimal(amount), description='d',
            created_by=creator,
        )

    def api(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def post(self, user, inv, action, **data):
        with self.captureOnCommitCallbacks(execute=True):
            return self.api(user).post(f'{BASE}{inv.pk}/{action}/', data, format='json',
                                          HTTP_X_COMPANY_ID=str(self.company.pk))

    def cards(self, user):
        res = self.api(user).get('/api/workflow/tasks/')
        self.assertEqual(res.status_code, 200)
        return {c['entity_id']: c for c in res.json()['results'] if c['entity_kind'] == 'expense_invoice'}

    def step(self, inv):
        task = wf_engine.open_task(INVOICE_WORKFLOW, inv.pk)
        return task.step_key if task else None

    # ── سناریوی ۸ ──
    def test_8_substitute_label_window_own_invoice_and_personnel_scope(self):
        helper = self.user('helper', 'employee', section=self.other)
        profile = PersonnelProfile.objects.create(first_name='پرسنل', last_name='بخش یک', national_code='0012345678',
                                                  company=self.company, project=self.project, section=self.sec)
        profiles_before = self.api(helper).get('/api/personnel/profiles/', HTTP_X_COMPANY_ID=str(self.company.pk))
        today = timezone.localdate()
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowSubstitute.objects.create(principal=self.acc, substitute=helper, start_date=today, end_date=today)

        inv = self.invoice(self.emp)
        self.post(self.emp, inv, 'submit')
        self.post(self.sup, inv, 'approve')
        card = self.cards(helper)[inv.pk]
        self.assertEqual((card['step_key'], card['on_behalf_of']['id']), ('accountant_review', self.acc.pk))
        self.assertIsNone(self.cards(self.acc)[inv.pk]['on_behalf_of'])

        # پرونده‌های پرسنل دامنهٔ حسابدار با جانشینی دیده نمی‌شوند
        res = self.api(helper).get('/api/personnel/profiles/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, profiles_before.status_code)
        if res.status_code == 200:
            body = res.json()
            rows = body.get('results', body) if isinstance(body, dict) else body
            self.assertNotIn(profile.pk, [r.get('id') for r in rows])
        self.assertIn(self.api(helper).get(f'/api/personnel/profiles/{profile.pk}/',
                                              HTTP_X_COMPANY_ID=str(self.company.pk)).status_code, (403, 404))

        # کار فاکتوری که جانشین خودش ثبت کرده به او نمی‌رسد (فاکتور در بخش حسابدار)
        grant_section_perms(helper, [], section=self.sec, role='employee', exact=False)
        own = self.invoice(helper)
        self.post(helper, own, 'submit')
        self.post(self.sup, own, 'approve')
        self.assertEqual(self.step(own), 'accountant_review')
        self.assertNotIn(own.pk, self.cards(helper))
        self.assertIn(own.pk, self.cards(self.acc))

        # بعد از پایان بازه (فردا) کار بی‌درنگ از کارتابل جانشین برداشته می‌شود؛ صاحب کار آن را دارد
        tomorrow = today + datetime.timedelta(days=1)
        with mock.patch('django.utils.timezone.localdate', return_value=tomorrow):
            self.assertNotIn(inv.pk, self.cards(helper))
            self.assertIn(inv.pk, self.cards(self.acc))
            self.assertEqual(self.post(helper, inv, 'approve').status_code, 403)

    # ── سناریوی ۹ ──
    def test_9_removing_only_supervisor_moves_open_tasks_to_accountant(self):
        inv = self.invoice(self.emp)
        self.post(self.emp, inv, 'submit')
        self.assertEqual(self.step(inv), 'supervisor_ok')
        self.assertIn(inv.pk, self.cards(self.sup))
        # همان مسیر لغو انتساب در org_views (غیرفعال‌سازی با save، نه update گروهی)
        assignment = SectionAssignment.objects.get(user=self.sup, role='supervisor')
        with self.captureOnCommitCallbacks(execute=True):
            assignment.is_active = False
            assignment.save(update_fields=['is_active', 'updated_at'])
        self.assertEqual(self.step(inv), 'accountant_review')
        self.assertNotIn(inv.pk, self.cards(self.sup))
        self.assertIn(inv.pk, self.cards(self.acc))

    def test_9_concurrent_double_approve_one_wins_other_409(self):
        sup2 = self.user('sup2', 'supervisor')
        inv = self.invoice(self.emp)
        self.post(self.emp, inv, 'submit')
        task_id = self.cards(self.sup)[inv.pk]['task_id']
        self.assertEqual(self.cards(sup2)[inv.pk]['task_id'], task_id)
        first = self.api(self.sup).post(f'/api/workflow/tasks/{task_id}/action/', {'action': 'act'}, format='json')
        second = self.api(sup2).post(f'/api/workflow/tasks/{task_id}/action/', {'action': 'act'}, format='json')
        self.assertEqual(first.status_code, 200)
        self.assertEqual((second.status_code, second.json()['code']), (409, 'task_already_done'))
        self.assertEqual(self.step(inv), 'accountant_review')

    # ── سناریوی ۱۰ ──
    def test_10_scheduler_reminder_and_escalation_once_personal_channels_only(self):
        layer = FakeLayer()
        patcher = mock.patch('channels.layers.get_channel_layer', return_value=layer)
        patcher.start()
        self.addCleanup(patcher.stop)
        inv = self.invoice(self.emp)
        self.post(self.emp, inv, 'submit')
        now = timezone.now() + datetime.timedelta(hours=500)
        counts = []
        for _ in range(2):
            with self.captureOnCommitCallbacks(execute=True):
                stats = run_tick(now, last_reconciled_at=now)
            self.assertEqual(stats['errors'], [])
            counts.append((stats['reminders'], stats['escalations']))
        self.assertEqual(counts, [(1, 1), (0, 0)])
        # فقط پیام‌های رویداد گردش کار (اعلان ۲.۴ و پیام‌های دیگر ماژول از همین لایه هم می‌گذرند)
        wf_sent = [(g, m) for g, m in layer.sent if 'workflow_event' in m]
        kinds = [m['workflow_event'] for _g, m in wf_sent]
        self.assertEqual((kinds.count('reminder'), kinds.count('escalation')), (1, 1))
        for group, _m in wf_sent:
            self.assertTrue(PERSONAL.match(group) or group == realtime.SUPERUSER_GROUP, group)


class SeedWorkflowScenarioTests(TestCase):
    def test_seed_creates_scenario_rows_and_purge_removes_them(self):
        env = mock.patch.dict(os.environ, {'WH_ALLOW_SCENARIO_SEED': '1'})
        cred = mock.MagicMock()
        with env, mock.patch('companies.management.commands.seed_scenario.CREDENTIALS_FILE', cred), \
                mock.patch('personnel.management.commands.seed_workflow_scenario.CREDENTIALS_FILE', cred):
            for _ in range(2):  # دوباره‌اجرا امن است
                call_command('seed_workflow_scenario', stdout=mock.MagicMock())
            company = Company.objects.get(code='QA-SCN')
            s2 = ProjectSection.objects.get(project__company=company, code='QA-S2')
            live = SectionAssignment.objects.filter(is_active=True)
            self.assertFalse(live.filter(section=s2, role='supervisor').exists())
            self.assertEqual(live.filter(section=s2, role='accountant').count(), 2)
            self.assertEqual(live.filter(role='accountant', section__code='QA-S1').count(), 1)
            self.assertEqual(live.filter(role='manager').count(), 2)
            subs = WorkflowSubstitute.objects.filter(revoked_at__isnull=True, principal__username='qa_scn_accountant')
            self.assertEqual(subs.count(), 1)
            self.assertTrue(subs[0].start_date <= timezone.localdate() <= subs[0].end_date)
            self.assertEqual(WorkflowThreshold.objects.get(company=company, workflow_key=INVOICE_WORKFLOW).amount,
                             Decimal('50000000'))

            call_command('seed_workflow_scenario', purge=True, stdout=mock.MagicMock())
        self.assertFalse(User.objects.filter(username__startswith='qa_scn_').exists())
        self.assertFalse(WorkflowThreshold.objects.filter(workflow_key=INVOICE_WORKFLOW).exists())

    def test_refuses_without_flag(self):
        from django.core.management.base import CommandError
        with mock.patch.dict(os.environ, {'WH_ALLOW_SCENARIO_SEED': '0'}), self.assertRaises(CommandError):
            call_command('seed_workflow_scenario', stdout=mock.MagicMock())
