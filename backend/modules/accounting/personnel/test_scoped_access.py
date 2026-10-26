"""
طرح ۲.۲ (مجوزهای ریز): سناریوهای ۱ و ۲ بخش ۵ و ت۴ و ت۹، روی بسته‌های پیش‌فرض واقعی حسابداری.

- «چه کاری» از مجوز و «کجا» از انتساب (ق۶ و ت۱): کاربری که در بخش الف حسابدار و در بخش ب کارمند است، فاکتورهای الف و ب
  را می‌بیند و نه ج؛ تنخواه را فقط در الف مدیریت می‌کند؛ پرونده‌های پرسنل ج را نمی‌بیند.
- خزانه‌دار سطح شرکت تنخواه همهٔ بخش‌های همان شرکت را می‌بیند و شرکت دیگر را نه.
- تفاوت کاربر برای یک شرکت (ت۴) کار همان کاربر را در شرکت دیگر عوض نمی‌کند.
- رتبهٔ نقش‌های انتساب (ت۹).
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserPermissionOverride
from accounts.scoped_permissions import can, clear_scoped_permission_cache
from companies.models import (
    Company, Project, ProjectSection, SectionAssignment, UserCompanyAccess, section_role_choices, section_role_ranks,
)
from personnel.models import Counterparty, ExpenseInvoice, PersonnelProfile, PettyCashTransaction
from personnel.scoped_test_support import expense_head_id

User = get_user_model()

INVOICES = '/api/personnel/expense-invoices/'
PETTY_CASH = '/api/personnel/petty-cash-transactions/'
PROFILES = '/api/personnel/profiles/'


def _ids(res):
    body = res.json()
    rows = body.get('results', body) if isinstance(body, dict) else body
    return {row['id'] for row in rows}


class ScopedAccessFixture(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company_x = Company.objects.create(code='SCP-X', name='شرکت ایکس')
        self.company_y = Company.objects.create(code='SCP-Y', name='شرکت ایگرگ')
        self.project_x = Project.objects.create(company=self.company_x, code='SCP-PX', name='پروژه ایکس')
        self.project_y = Project.objects.create(company=self.company_y, code='SCP-PY', name='پروژه ایگرگ')
        self.sec_a = ProjectSection.objects.create(project=self.project_x, code='SCP-A', name='بخش الف')
        self.sec_b = ProjectSection.objects.create(project=self.project_x, code='SCP-B', name='بخش ب')
        self.sec_c = ProjectSection.objects.create(project=self.project_x, code='SCP-C', name='بخش ج')
        self.sec_d = ProjectSection.objects.create(project=self.project_y, code='SCP-D', name='بخش د')
        self.sections = {'A': self.sec_a, 'B': self.sec_b, 'C': self.sec_c, 'D': self.sec_d}

        self.custodian = self._user('scp_custodian')
        for sec in self.sections.values():
            SectionAssignment.objects.create(user=self.custodian, section=sec, role='employee')

        cp_x = Counterparty.objects.create(company=self.company_x, name='طرف ایکس', counterparty_type='other')
        cp_y = Counterparty.objects.create(company=self.company_y, name='طرف ایگرگ', counterparty_type='other')
        self.invoices, self.petty, self.profiles = {}, {}, {}
        for key, sec in self.sections.items():
            company = sec.project.company
            self.invoices[key] = ExpenseInvoice.objects.create(
                section=sec, counterparty=cp_y if key == 'D' else cp_x, invoice_number=f'SCP-INV-{key}',
                invoice_date_shamsi='1405/05/01', amount=Decimal('1000000'), category='other',
                description=f'فاکتور {key}', status='pending_supervisor',
            )
            self.petty[key] = PettyCashTransaction.objects.create(
                section=sec, custodian=self.custodian, created_by=self.custodian, transaction_type='expense',
                amount=Decimal('500000'), transaction_date_shamsi='1405/05/02', title=f'تنخواه {key}',
                status='pending_supervisor',
            )
            self.profiles[key] = PersonnelProfile.objects.create(
                company=company, section=sec, first_name='پرسنل', last_name=f'بخش {key}',
                national_code=f'00{ord(key):08d}', personnel_id_code=f'SCP-EMP-{key}',
            )

    def _user(self, username, *companies):
        user = User.objects.create_user(username=username, password='p')
        for company in companies:
            UserCompanyAccess.objects.create(user=user, company=company)
        return user

    def _get(self, user, url, company=None):
        self.client.force_authenticate(user=User.objects.get(pk=user.pk))
        headers = {'HTTP_X_COMPANY_ID': str(company.id)} if company else {}
        res = self.client.get(url, **headers)
        self.assertEqual(res.status_code, 200, res.content)
        return _ids(res)


class AccountantHereEmployeeThereTests(ScopedAccessFixture):
    """سناریوی ۱ بخش ۵: حسابدار در بخش الف و کارمند در بخش ب، با بسته‌های پیش‌فرض."""

    def setUp(self):
        super().setUp()
        self.user = self._user('scp_acc_emp', self.company_x)
        SectionAssignment.objects.create(user=self.user, section=self.sec_a, role='accountant')
        SectionAssignment.objects.create(user=self.user, section=self.sec_b, role='employee')

    def test_engine_answers_follow_the_section(self):
        user = User.objects.get(pk=self.user.pk)
        self.assertTrue(can(user, 'perm_petty_cash_manage', self.sec_a))
        self.assertFalse(can(user, 'perm_petty_cash_manage', self.sec_b))
        self.assertTrue(can(user, 'perm_invoice_record', self.sec_b))
        self.assertFalse(can(user, 'perm_invoice_record', self.sec_c))

    def test_sees_invoices_of_a_and_b_not_c(self):
        inv = self.invoices
        for company in (self.company_x, None):
            ids = self._get(self.user, INVOICES, company)
            self.assertEqual(ids, {inv['A'].id, inv['B'].id})

    def test_cannot_record_invoice_in_section_c(self):
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        payload = {
            'section': self.sec_c.id, 'counterparty': self.invoices['C'].counterparty_id, 'invoice_number': 'SCP-NEW-C',
            'invoice_date_shamsi': '1405/05/03', 'amount': '100000', 'expense_head': expense_head_id(self.sec_c), 'description': 'x',
        }
        res = self.client.post(INVOICES, payload, format='json', HTTP_X_COMPANY_ID=str(self.company_x.id))
        self.assertEqual(res.status_code, 403, res.content)
        self.assertFalse(ExpenseInvoice.objects.filter(invoice_number='SCP-NEW-C').exists())

    def test_manages_petty_cash_only_in_a(self):
        ids = self._get(self.user, PETTY_CASH, self.company_x)
        self.assertEqual(ids, {self.petty['A'].id})

        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        res = self.client.post(f"{PETTY_CASH}{self.petty['A'].id}/approve/", {}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.petty['A'].refresh_from_db()
        self.assertNotEqual(self.petty['A'].status, 'pending_supervisor')

        # سند تنخواه ب دیده نمی‌شود و تأیید نمی‌شود
        res = self.client.post(f"{PETTY_CASH}{self.petty['B'].id}/approve/", {}, format='json')
        self.assertEqual(res.status_code, 404, res.content)
        self.petty['B'].refresh_from_db()
        self.assertEqual(self.petty['B'].status, 'pending_supervisor')

    def test_own_petty_cash_in_b_is_visible_but_not_approvable(self):
        own_b = PettyCashTransaction.objects.create(
            section=self.sec_b, custodian=self.user, created_by=self.user, transaction_type='expense',
            amount=Decimal('100000'), transaction_date_shamsi='1405/05/04', title='تنخواه خودم', status='pending_supervisor',
        )
        self.assertIn(own_b.id, self._get(self.user, PETTY_CASH, self.company_x))
        self.client.force_authenticate(user=User.objects.get(pk=self.user.pk))
        res = self.client.post(f'{PETTY_CASH}{own_b.id}/approve/', {}, format='json')
        self.assertEqual(res.status_code, 403, res.content)
        own_b.refresh_from_db()
        self.assertEqual(own_b.status, 'pending_supervisor')

    def test_does_not_see_personnel_files_of_c(self):
        ids = self._get(self.user, PROFILES, self.company_x)
        self.assertIn(self.profiles['A'].id, ids)
        self.assertIn(self.profiles['B'].id, ids)
        self.assertNotIn(self.profiles['C'].id, ids)
        self.assertNotIn(self.profiles['D'].id, ids)

    def test_finance_approval_of_personnel_only_in_own_accountant_section(self):
        """مجوز تأیید مالی حسابدارِ الف در بخش ب (که آن‌جا کارمند است) کار نمی‌کند (ت۸)."""
        from personnel.lifecycle_services import FINANCE_STAGE_PERMS, user_has_any_perm
        user = User.objects.get(pk=self.user.pk)
        self.assertTrue(user_has_any_perm(user, FINANCE_STAGE_PERMS, self.profiles['A']))
        self.assertFalse(user_has_any_perm(user, FINANCE_STAGE_PERMS, self.profiles['B']))
        self.assertTrue(user_has_any_perm(user, FINANCE_STAGE_PERMS))  # «دست‌کم در یک بخش»


class CompanyLevelTreasurerTests(ScopedAccessFixture):
    """سناریوی ۲ بخش ۵: خزانه‌دار سطح شرکت."""

    def setUp(self):
        super().setUp()
        self.treasurer = self._user('scp_treasurer', self.company_x)
        SectionAssignment.objects.create(user=self.treasurer, company=self.company_x, role='treasury')

    def test_sees_petty_cash_of_every_section_of_its_company_only(self):
        expected = {self.petty['A'].id, self.petty['B'].id, self.petty['C'].id}
        self.assertEqual(self._get(self.treasurer, PETTY_CASH, self.company_x), expected)
        self.assertEqual(self._get(self.treasurer, PETTY_CASH), expected)

    def test_other_company_header_is_refused_or_empty(self):
        self.client.force_authenticate(user=User.objects.get(pk=self.treasurer.pk))
        res = self.client.get(PETTY_CASH, HTTP_X_COMPANY_ID=str(self.company_y.id))
        if res.status_code == 200:
            self.assertNotIn(self.petty['D'].id, _ids(res))
        else:
            self.assertEqual(res.status_code, 403, res.content)


class PerCompanyOverrideTests(ScopedAccessFixture):
    """ت۴: برداشتن «ثبت و دیدن فاکتور» برای شرکت ایکس، فاکتورهای ایکس را پنهان می‌کند و ایگرگ را نه."""

    def setUp(self):
        super().setUp()
        self.user = self._user('scp_two_companies', self.company_x, self.company_y)
        SectionAssignment.objects.create(user=self.user, section=self.sec_a, role='employee')
        SectionAssignment.objects.create(user=self.user, section=self.sec_d, role='employee')

    def test_remove_override_for_company_x_only_hides_x_invoices(self):
        self.assertEqual(self._get(self.user, INVOICES), {self.invoices['A'].id, self.invoices['D'].id})

        perm = Permission.objects.get(content_type__app_label='accounts', codename='perm_invoice_record')
        UserPermissionOverride.objects.create(user=self.user, permission=perm, company=self.company_x, mode='remove')

        self.assertEqual(self._get(self.user, INVOICES), {self.invoices['D'].id})
        self.assertEqual(self._get(self.user, INVOICES, self.company_y), {self.invoices['D'].id})
        self.assertEqual(self._get(self.user, INVOICES, self.company_x), set())
        user = User.objects.get(pk=self.user.pk)
        self.assertFalse(can(user, 'perm_invoice_record', self.sec_a))
        self.assertTrue(can(user, 'perm_invoice_record', self.sec_d))

    def test_direct_tick_of_section_perm_grants_nothing(self):
        """تیک مستقیم مجوز بخشی جای انتساب را نمی‌گیرد (ت۲): کاربر بی‌انتساب فاکتوری نمی‌بیند."""
        outsider = self._user('scp_ticked', self.company_x)
        outsider.user_permissions.add(
            Permission.objects.get(content_type__app_label='accounts', codename='perm_invoice_record'))
        clear_scoped_permission_cache(outsider)
        self.assertEqual(self._get(outsider, INVOICES), set())


class WorkflowRoutingOverrideTests(ScopedAccessFixture):
    """مسیریابی اعلان مرحله (lifecycle_services) همان قاعدهٔ can() را دارد: تفاوت «برداشته» گیرنده را حذف می‌کند."""

    def test_removed_stage_perm_drops_recipient(self):
        from personnel.lifecycle_services import _workflow_recipient_ids
        sup = self._user('scp_sup', self.company_x)
        SectionAssignment.objects.create(user=sup, section=self.sec_a, role='supervisor')
        ids = _workflow_recipient_ids('pending_supervisor', self.company_x.id, self.sec_a.id, None)
        self.assertIn(sup.id, ids)
        self.assertNotIn(self.custodian.id, ids)  # کارمند مجوز مرحلهٔ سرپرست را ندارد

        for code in ('perm_approve_personnel_supervisor',):
            perm = Permission.objects.get(content_type__app_label='accounts', codename=code)
            UserPermissionOverride.objects.create(user=sup, permission=perm, company=self.company_x, mode='remove')
        ids = _workflow_recipient_ids('pending_supervisor', self.company_x.id, self.sec_a.id, None)
        self.assertNotIn(sup.id, ids)


class SectionRoleRankTests(TestCase):
    """ت۹: رتبهٔ نقش انتساب؛ اعلام تکراری فقط با برچسب و رتبهٔ یکسان."""

    def test_accounting_ranks_are_final_approval_authority(self):
        # ت۵ طرح ۲.۳: خزانه‌دار هم‌رتبهٔ حسابدار و پایین‌تر از مدیر است
        ranks = section_role_ranks()
        expected = {'employee': 10, 'supervisor': 20, 'accountant': 30, 'manager': 40, 'treasury': 30}
        for key, rank in expected.items():
            self.assertEqual(ranks.get(key), rank)
        self.assertEqual([code for code, _ in section_role_choices()][:5], list(expected))

    def test_duplicate_declaration_must_match(self):
        same = [[('employee', 'کارمند', 10)], [('employee', 'کارمند', 10), ('legacy', 'قدیمی')]]
        with mock.patch('platform_core.registry.contributions', return_value=same):
            self.assertEqual(section_role_ranks(), {'employee': 10, 'legacy': None})
        for other in (('employee', 'کارمند', 99), ('employee', 'برچسب دیگر', 10)):
            with mock.patch('platform_core.registry.contributions', return_value=[[('employee', 'کارمند', 10)], [other]]):
                with self.assertRaises(ValueError):
                    section_role_ranks()

    def test_malformed_declaration_raises(self):
        with mock.patch('platform_core.registry.contributions', return_value=[[('employee',)]]):
            with self.assertRaises(ValueError):
                section_role_ranks()
