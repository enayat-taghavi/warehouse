"""دستور seed_video_demo برای فیلم‌های آموزشی (طرح فیلم‌های آموزشی، §۳.۴)."""
import os
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from companies.models import Company, Project, ProjectSection, SectionAssignment
from personnel.models import CompanyBankAccount, CompanyFiscalPeriod, Counterparty, ExpenseHead

COMMAND = 'personnel.management.commands.seed_video_demo'


class SeedVideoDemoTests(TestCase):
    def setUp(self):
        writer = mock.patch(f'{COMMAND}.CREDENTIALS_FILE')
        self.credentials = writer.start()
        self.credentials.exists.return_value = False
        self.addCleanup(writer.stop)

    def _run(self, **opts):
        with mock.patch.dict(os.environ, {'WH_ALLOW_SCENARIO_SEED': '1'}):
            call_command('seed_video_demo', stdout=mock.MagicMock(), **opts)

    def test_guard_refuses_without_env(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('WH_ALLOW_SCENARIO_SEED', None)
            with self.assertRaises(CommandError):
                call_command('seed_video_demo', admin=True, stdout=mock.MagicMock())
        self.assertFalse(get_user_model().objects.filter(username='demo_admin').exists())

    def test_admin_only_creates_superuser(self):
        self._run(admin=True)
        admin = get_user_model().objects.get(username='demo_admin')
        self.assertTrue(admin.is_superuser)
        self.assertFalse(Company.objects.filter(code='DEMO-VID').exists())
        written = self.credentials.with_name.return_value.write_text.call_args[0][0]
        self.assertIn('demo_admin', written)

    def test_base_and_purge_keep_other_data(self):
        User = get_user_model()
        other_company = Company.objects.create(code='OTHER-CO', name='شرکت دیگر')
        other_project = Project.objects.create(company=other_company, code='O-P1', name='پروژهٔ دیگر')
        ProjectSection.objects.create(project=other_project, code='O-S1', name='بخش دیگر')
        other_user = User.objects.create_user(username='real_user', password='x-unused-1')
        demo_like = User.objects.create_user(username='demo_real_person', password='x-unused-2')

        self._run(base=True)
        company = Company.objects.get(code='DEMO-VID')
        self.assertEqual(ProjectSection.objects.filter(project__company=company).count(), 2)
        self.assertEqual(User.objects.filter(username__startswith='demo_').count(), 8)
        self.assertEqual(SectionAssignment.objects.filter(user__username__startswith='demo_').count(), 6)
        self.assertTrue(CompanyFiscalPeriod.objects.filter(company=company, status='open').exists())
        self.assertTrue(CompanyBankAccount.objects.filter(company=company).exists())
        self.assertTrue(ExpenseHead.objects.filter(company=company, code='5001', parent__code='50').exists())
        heads = ExpenseHead.objects.filter(company=company).count()
        self.assertTrue(Counterparty.objects.filter(party__company=company).exists())
        # اجرای دوباره خطا نمی‌دهد و چیزی را دوبرابر نمی‌کند
        self._run(base=True)
        self.assertEqual(ExpenseHead.objects.filter(company=company).count(), heads)

        self._run(purge=True)
        self.assertFalse(Company.objects.filter(code='DEMO-VID').exists())
        self.assertEqual(list(User.objects.filter(username__startswith='demo_').values_list('username', flat=True)),
                         ['demo_real_person'])
        self.assertTrue(Company.objects.filter(pk=other_company.pk).exists())
        self.assertTrue(ProjectSection.objects.filter(code='O-S1').exists())
        self.assertTrue(User.objects.filter(pk__in=[other_user.pk, demo_like.pk]).count() == 2)
        # پاک کردن دوباره بی‌خطاست
        self._run(purge=True)

    def test_blocker_of_other_company_is_refused(self):
        from personnel.management.commands.seed_video_demo import Command
        self._run(base=True)
        demo = Company.objects.get(code='DEMO-VID')
        other = Company.objects.create(code='OTHER-CO2', name='x')
        demo_head = ExpenseHead.objects.get(company=demo, code='5001')
        other_head = ExpenseHead.objects.filter(company=other, parent__isnull=False).first()
        command = Command()
        self.assertEqual(command._owner_companies(demo_head), {demo.pk})
        with self.assertRaises(CommandError):
            command._delete_blocker(other_head, demo.pk)
        self.assertTrue(ExpenseHead.objects.filter(pk=other_head.pk).exists())

    def test_with_invoice_stages_and_purge(self):
        from personnel.models import ExpenseInvoice
        from personnel.workflows import INVOICE_WORKFLOW
        from workflow import engine as wf_engine

        with self.assertRaises(CommandError):
            self._run(admin=True, with_invoice='submitted')
        self._run(base=True, with_invoice='submitted')
        invoice = ExpenseInvoice.objects.get(invoice_number='DEMO-INV-100')
        self.assertTrue(invoice.number)
        self.assertEqual(invoice.amount, invoice.subtotal + invoice.vat_amount)
        self.assertEqual(wf_engine.open_task(INVOICE_WORKFLOW, invoice.pk).step_key, 'supervisor_ok')
        self._run(purge=True)
        self.assertFalse(ExpenseInvoice.objects.filter(pk=invoice.pk).exists())

        self._run(base=True, with_invoice='approved')
        invoice = ExpenseInvoice.objects.get(invoice_number='DEMO-INV-100')
        self.assertEqual(wf_engine.open_task(INVOICE_WORKFLOW, invoice.pk).step_key, 'treasury_pay')
        self._run(base=True, with_invoice='approved')
        self.assertEqual(ExpenseInvoice.objects.filter(invoice_number='DEMO-INV-100').count(), 1)
        self._run(purge=True)
        self.assertFalse(Company.objects.filter(code='DEMO-VID').exists())
