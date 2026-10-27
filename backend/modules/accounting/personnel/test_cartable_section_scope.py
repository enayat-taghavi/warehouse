# -*- coding: utf-8 -*-
"""
اصلاح ۱ طرح ۲.۲ (یافتهٔ بازبین قلمرو): کارتابل‌های حسابداری قلمرو بخشی دارند.
کاربر حسابدار در S1 و کارمند در S2 (یک شرکت) فقط اقلام S1 را در کارتابل حسابدار می‌بیند و
نمی‌تواند تنخواه یا فاکتور S2 را از کارتابل تایید کند؛ برداشتن مدیریت تنخواه از او تایید تنخواه را می‌بندد.
همچنین طرف‌حساب و حساب تنخواه شرکت/بخش دیگر در فاکتور و سند تنخواه پذیرفته نمی‌شود.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserPermissionOverride
from accounts.scoped_permissions import clear_scoped_permission_cache
from personnel.models import (
    Company, Project, ProjectSection, UserCompanyAccess, PersonnelProfile,
    ExpenseInvoice, PettyCashAccount, PettyCashTransaction, Counterparty,
)
from personnel.scoped_test_support import _permission, grant_section_perms, expense_head_id
from personnel.serializers import ExpenseInvoiceSerializer, PettyCashTransactionSerializer
from personnel.workflows import INVOICE_WORKFLOW
from workflow import engine as wf_engine

User = get_user_model()
URL = '/api/personnel/cartable/accountant/'


class AccountantCartableSectionScopeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(code='CSS', name='شرکت قلمرو', is_active=True)
        self.other_company = Company.objects.create(code='CSS2', name='شرکت دیگر', is_active=True)
        project = Project.objects.create(company=self.company, code='CSS-P', name='پروژه')
        self.s1 = ProjectSection.objects.create(project=project, code='CSS-S1', name='بخش یک')
        self.s2 = ProjectSection.objects.create(project=project, code='CSS-S2', name='بخش دو')

        self.user = User.objects.create_user(username='css_acc', password='x')
        UserCompanyAccess.objects.create(user=self.user, company=self.company, is_default=True)
        # بسته‌های پیش‌فرض نقش: حسابدار در S1، کارمند در S2
        grant_section_perms(self.user, [], section=self.s1, role='accountant', exact=False)
        grant_section_perms(self.user, [], section=self.s2, role='employee', exact=False)

        self.custodian = User.objects.create_user(username='css_cust', password='x')
        self.creator = User.objects.create_user(username='css_creator', password='x')
        UserCompanyAccess.objects.create(user=self.creator, company=self.company, is_default=True)
        for sec in (self.s1, self.s2):
            grant_section_perms(self.creator, [], section=sec, role='employee', exact=False)
        self.cp = Counterparty.objects.create(company=self.company, name='طرف یک', counterparty_type='other')

        self.inv = {}
        self.pc = {}
        self.pp = {}
        for i, sec in enumerate((self.s1, self.s2), start=1):
            self.inv[i] = ExpenseInvoice.objects.create(
                section=sec, counterparty=self.cp, invoice_number=f'CSS-{i}', invoice_date_shamsi='1404/05/01',
                amount=Decimal('1000'), description='d', status='draft', created_by=self.creator,
            )
            # ت۱۷ طرح ۲.۳: کارتابل فاکتور از کارهای موتور گردش کار خوانده می‌شود
            wf_engine.submit(INVOICE_WORKFLOW, self.inv[i], self.creator)
            # طرح ۳.۶ (ص۹): یک حساب فعال برای هر (شرکت، تنخواه‌گردان)؛ حساب قدیمی دوم مثل migration 0014 غیرفعال است
            account = PettyCashAccount.objects.create(section=sec, custodian=self.custodian,
                                                      ceiling_amount=Decimal('100000'), is_active=(i == 1))
            self.pc[i] = PettyCashTransaction.objects.create(
                account=account, section=sec, custodian=self.custodian, transaction_type='expense',
                amount=Decimal('500'), transaction_date_shamsi='1404/05/02', title='t', category='c',
                status='pending_accountant',
            )
            self.pp[i] = PersonnelProfile.objects.create(
                company=self.company, project=project, section=sec, first_name='ن', last_name=f'پ{i}',
                national_code=f'00000000{i}{i}', approval_status='pending_accountant',
            )
        self.client.force_authenticate(user=self.user)

    def _get(self):
        res = self.client.get(URL, HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(res.status_code, 200, res.content)
        return res.data

    def _post(self, model, obj):
        return self.client.post(URL, {'action': 'approve', 'model': model, 'id': obj.id},
                                format='json', HTTP_X_COMPANY_ID=str(self.company.id))

    def test_accountant_cartable_lists_only_s1_items(self):
        data = self._get()
        self.assertEqual({r['id'] for r in data['invoices']}, {self.inv[1].id})
        self.assertEqual({r['id'] for r in data['petty_cash']}, {self.pc[1].id})
        self.assertEqual({r['id'] for r in data['personnel']}, {self.pp[1].id})
        self.assertEqual(data['counts']['invoices'], 1)
        self.assertEqual(data['counts']['petty_cash'], 1)

    def test_cannot_approve_s2_petty_cash_or_invoice(self):
        self.assertEqual(self._post('petty_cash', self.pc[2]).status_code, 403)
        self.assertEqual(self._post('invoice', self.inv[2]).status_code, 403)
        self.pc[2].refresh_from_db()
        self.inv[2].refresh_from_db()
        self.assertEqual(self.pc[2].status, 'pending_accountant')
        self.assertEqual(self.inv[2].status, 'pending_accountant')

    def test_s1_petty_cash_approval_allowed_then_blocked_by_remove_override(self):
        # پیش از برداشتن: تایید تنخواه S1 مجاز است
        self.assertEqual(self._post('petty_cash', self.pc[1]).status_code, 200)
        # تفاوت «برداشته» برای همان شرکت
        UserPermissionOverride.objects.create(
            user=self.user, permission=_permission('perm_petty_cash_manage'), company_id=self.company.id, mode='remove',
        )
        clear_scoped_permission_cache(self.user)
        self.pc[1].status = 'pending_accountant'
        self.pc[1].save(update_fields=['status'])
        res = self._post('petty_cash', self.pc[1])
        self.assertEqual(res.status_code, 403, res.content)
        self.assertNotIn(self.pc[1].id, {r['id'] for r in self._get()['petty_cash']})

    def test_s1_invoice_approval_blocked_without_step_permission(self):
        # ت۳ طرح ۲.۳: دریافت‌کنندهٔ مرحلهٔ بررسی = نقش حسابدار + مجوز مرحله؛ برداشتن مجوز مرحله کار را برمی‌دارد
        UserPermissionOverride.objects.create(
            user=self.user, permission=_permission('perm_invoice_review'), company_id=self.company.id, mode='remove',
        )
        clear_scoped_permission_cache(self.user)
        # ساخت مستقیم ORM سیگنال permissions_changed ندارد (API آن را می‌فرستد)؛ محاسبهٔ دوباره مثل زمان‌بند
        from workflow.recompute import recompute_open_tasks
        recompute_open_tasks(user_ids={self.user.pk})
        self.assertEqual(self._post('invoice', self.inv[1]).status_code, 403)
        self.assertEqual(self._get()['invoices'], [])

    def test_superuser_sees_both_sections(self):
        admin = User.objects.create_superuser(username='css_admin', password='x', email='a@b.c')
        self.client.force_authenticate(user=admin)
        data = self._get()
        # ت۳ طرح ۲.۳: مدیر کل دریافت‌کنندهٔ کار نیست؛ کارهای بی‌دریافت‌کننده را در «کارهای من» (تب مدیر کل) می‌بیند
        self.assertEqual(data['invoices'], [])
        self.assertEqual({r['id'] for r in data['petty_cash']}, {self.pc[1].id, self.pc[2].id})

    # ─── ارجاع بین‌شرکتی/بین‌بخشی در سریالایزر ───────────────────────────────────────

    def test_invoice_rejects_other_company_counterparty(self):
        foreign = Counterparty.objects.create(company=self.other_company, name='طرف بیگانه', counterparty_type='other')
        base = {'section': self.s1.id, 'invoice_number': 'X1', 'invoice_date_shamsi': '1404/05/01',
                'amount': '1000', 'expense_head': expense_head_id(self.s1), 'description': 'd'}
        ser = ExpenseInvoiceSerializer(data={**base, 'counterparty': foreign.id})
        self.assertFalse(ser.is_valid())
        self.assertIn('counterparty', ser.errors)
        own = Counterparty.objects.create(company=self.company, name='طرف خودی', counterparty_type='other')
        ser_ok = ExpenseInvoiceSerializer(data={**base, 'counterparty': own.id})
        self.assertTrue(ser_ok.is_valid(), ser_ok.errors)

    def test_petty_cash_rejects_account_of_another_section(self):
        account_s2 = self.pc[2].account
        ser = PettyCashTransactionSerializer(data={
            'section': self.s1.id, 'account': account_s2.id, 'custodian': self.custodian.id,
            'transaction_type': 'expense', 'amount': '100', 'transaction_date_shamsi': '1404/05/03',
            'title': 't', 'expense_head': expense_head_id(self.s1),
        })
        self.assertFalse(ser.is_valid())
        self.assertIn('account', ser.errors)
