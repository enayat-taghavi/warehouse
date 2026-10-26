"""
طرح ۳.۴ (ب): سرفصل‌های هزینهٔ شرکت؛ فهرست پیش‌فرض، API، مجوز `expense_heads` و سرفصل روی فاکتور و تنخواه.
اجرا: PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py test personnel.test_expense_heads_34 --noinput
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from accounts.models import AuditLog
from companies.models import Company, UserCompanyAccess
from companies.testing import grant_membership
from personnel.expense_heads import DEFAULT_EXPENSE_HEADS, seed_default_expense_heads
from personnel.models import ExpenseHead, ExpenseInvoice, PettyCashTransaction
from personnel.test_fiscal_period_32 import FiscalFixtures, INVOICES, PETTY

User = get_user_model()
HEADS = '/api/personnel/expense-heads/'
DEFAULT_COUNT = sum(1 + len(heads) for _code, _title, heads in DEFAULT_EXPENSE_HEADS)


class HeadFixtures(FiscalFixtures):
    def setUp(self):
        super().setUp()
        self.writer = self.user('eh34_writer', {'expense_heads': 'write'})
        self.member = self.user('eh34_member', {})
        grant_membership(self.member, self.company)
        self.head = ExpenseHead.objects.get(company=self.company, code='1001')
        self.other_head = ExpenseHead.objects.get(company=self.other, code='1001')
        self.group = self.head.parent

    def user(self, name, levels):
        u = User.objects.create_user(username=name, password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True, section_levels=levels)
        return u

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def invoice_body(self, **extra):
        return {'section': self.sec.id, 'counterparty': self.cp.id, 'invoice_number': 'EH34-1',
                'invoice_date_shamsi': '1405/08/01', 'amount': '1000', 'description': 'd', **extra}

    def petty_body(self, **extra):
        return {'section': self.sec.id, 'custodian': self.admin.id, 'amount': '1000',
                'transaction_date_shamsi': '1405/08/01', 'title': 't', **extra}


class SeedTests(HeadFixtures):
    def test_new_company_gets_defaults_and_seed_is_idempotent(self):
        company = Company.objects.create(code='EH34-N', name='شرکت تازه', is_active=True)
        self.assertEqual(ExpenseHead.objects.filter(company=company).count(), DEFAULT_COUNT)
        self.assertEqual(seed_default_expense_heads(company), 0)
        self.assertEqual(ExpenseHead.objects.filter(company=company).count(), DEFAULT_COUNT)
        self.assertEqual(ExpenseHead.objects.filter(company=company, parent__isnull=True).count(),
                         len(DEFAULT_EXPENSE_HEADS))

    def test_seed_action_needs_writer_and_fills_empty_company(self):
        ExpenseHead.objects.filter(company=self.company, parent__isnull=False).delete()
        ExpenseHead.objects.filter(company=self.company).delete()
        url = f'{HEADS}seed-defaults/?company_id={self.company.id}'
        self.assertEqual(self.client_for(self.member).post(url).status_code, 403)
        r = self.client_for(self.writer).post(url)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['created'], DEFAULT_COUNT)
        self.assertEqual(self.client_for(self.writer).post(url).json()['created'], 0)

    def test_company_delete_takes_its_heads(self):
        company = Company.objects.create(code='EH34-D', name='شرکت حذفی', is_active=True)
        company.delete()
        self.assertFalse(ExpenseHead.objects.filter(company_id=company.pk).exists())


class ApiTests(HeadFixtures):
    def test_list_needs_company_id(self):
        self.assertEqual(self.client_for(self.member).get(HEADS).status_code, 400)

    def test_member_reads_without_usage_count_writer_with(self):
        r = self.client_for(self.member).get(HEADS, {'company_id': self.company.id})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.json()), DEFAULT_COUNT)
        self.assertNotIn('usage_count', r.json()[0])
        r = self.client_for(self.writer).get(HEADS, {'company_id': self.company.id})
        self.assertIn('usage_count', r.json()[0])

    def test_other_company_list_and_detail_denied(self):
        c = self.client_for(self.member)
        self.assertEqual(c.get(HEADS, {'company_id': self.other.id}).status_code, 403)
        self.assertEqual(c.get(f'{HEADS}{self.other_head.id}/').status_code, 404)
        self.assertEqual(self.client_for(self.writer).patch(f'{HEADS}{self.other_head.id}/', {'title': 'x'},
                                                            format='json').status_code, 404)

    def test_active_filter_hides_inactive_and_children_of_inactive_group(self):
        self.group.is_active = False
        self.group.save()
        r = self.client_for(self.member).get(HEADS, {'company_id': self.company.id, 'active': '1'})
        ids = {row['id'] for row in r.json()}
        self.assertNotIn(self.head.id, ids)
        self.assertNotIn(self.group.id, ids)

    def test_write_needs_section(self):
        body = {'company': self.company.id, 'parent': self.group.id, 'code': '1099', 'title': 'تازه'}
        self.assertEqual(self.client_for(self.member).post(HEADS, body, format='json').status_code, 403)
        r = self.client_for(self.writer).post(HEADS, body, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(AuditLog.objects.filter(action='expense_head_created', target_model='ExpenseHead').exists())

    def test_other_company_write_is_403_before_validation(self):
        body = {'company': self.other.id, 'parent': self.other_head.parent_id, 'code': '1001', 'title': 'x'}
        self.assertEqual(self.client_for(self.writer).post(HEADS, body, format='json').status_code, 403)

    def test_persian_digits_and_duplicate_code(self):
        c = self.client_for(self.writer)
        r = c.post(HEADS, {'company': self.company.id, 'parent': self.group.id, 'code': '۱۰۹۹', 'title': 'الف'},
                   format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['code'], '1099')
        r = c.post(HEADS, {'company': self.company.id, 'parent': self.group.id, 'code': '1099', 'title': 'ب'},
                   format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('code', r.json())
        r = c.post(HEADS, {'company': self.company.id, 'code': '12a', 'title': 'ج'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_depth_is_two(self):
        r = self.client_for(self.writer).post(
            HEADS, {'company': self.company.id, 'parent': self.head.id, 'code': '1098', 'title': 'نوه'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('parent', r.json())

    def test_parent_from_other_company_rejected(self):
        r = self.client_for(self.writer).post(
            HEADS, {'company': self.company.id, 'parent': self.other_head.parent_id, 'code': '1097', 'title': 'x'},
            format='json')
        self.assertEqual(r.status_code, 400)

    def test_company_cannot_change(self):
        r = self.client_for(self.admin).patch(f'{HEADS}{self.head.id}/', {'company': self.other.id}, format='json')
        self.assertIn(r.status_code, (400, 403))
        self.head.refresh_from_db()
        self.assertEqual(self.head.company_id, self.company.id)

    def test_delete_used_head_and_group_with_children_blocked(self):
        c = self.client_for(self.writer)
        self.assertEqual(c.delete(f'{HEADS}{self.group.id}/').status_code, 400)
        self.client_for(self.admin).post(INVOICES, self.invoice_body(expense_head=self.head.id), format='json')
        self.assertEqual(c.delete(f'{HEADS}{self.head.id}/').status_code, 400)
        unused = ExpenseHead.objects.get(company=self.company, code='1002')
        self.assertEqual(c.delete(f'{HEADS}{unused.id}/').status_code, 204)


class DocumentTests(HeadFixtures):
    def test_invoice_without_head_400(self):
        r = self.api.post(INVOICES, self.invoice_body(category='c'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('expense_head', r.json())

    def test_invoice_with_group_inactive_or_foreign_head_400(self):
        inactive = ExpenseHead.objects.get(company=self.company, code='1002')
        inactive.is_active = False
        inactive.save()
        for head in (self.group, inactive, self.other_head):
            r = self.api.post(INVOICES, self.invoice_body(expense_head=head.id), format='json')
            self.assertEqual(r.status_code, 400, head.code)

    def test_invoice_with_head_sets_category(self):
        r = self.api.post(INVOICES, self.invoice_body(expense_head=self.head.id, category='ignored'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        inv = ExpenseInvoice.objects.get(pk=r.json()['id'])
        self.assertEqual(inv.category, self.head.title)
        self.assertEqual(r.json()['expense_head_code'], '1001')
        self.assertEqual(r.json()['expense_head_group_title'], self.group.title)

    def test_old_invoice_keeps_inactive_head_on_edit(self):
        r = self.api.post(INVOICES, self.invoice_body(expense_head=self.head.id), format='json')
        inv_id = r.json()['id']
        self.head.is_active = False
        self.head.save()
        r = self.api.patch(f'{INVOICES}{inv_id}/', {'description': 'تازه'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        other = ExpenseHead.objects.get(company=self.company, code='1002')
        other.is_active = False
        other.save()
        r = self.api.patch(f'{INVOICES}{inv_id}/', {'expense_head': other.id}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_petty_expense_needs_head_allocation_refuses_it(self):
        r = self.api.post(PETTY, self.petty_body(transaction_type='expense'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('expense_head', r.json())
        r = self.api.post(PETTY, self.petty_body(transaction_type='allocation', expense_head=self.head.id),
                          format='json')
        self.assertEqual(r.status_code, 400)
        r = self.api.post(PETTY, self.petty_body(transaction_type='allocation'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(PettyCashTransaction.objects.get(pk=r.json()['id']).category, 'شارژ تنخواه')
        r = self.api.post(PETTY, self.petty_body(transaction_type='expense', expense_head=self.head.id),
                          format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(PettyCashTransaction.objects.get(pk=r.json()['id']).category, self.head.title)

    def test_replenishment_keeps_its_text(self):
        r = self.api.post(f'{PETTY}request-replenishment/', {'section_id': self.sec.id, 'amount': '5000'},
                          format='json')
        self.assertEqual(r.status_code, 201, r.content)
        tx = PettyCashTransaction.objects.get(pk=r.json()['id'])
        self.assertEqual(tx.category, 'شارژ مجدد تنخواه')
        self.assertIsNone(tx.expense_head_id)
        r = self.api.patch(f'{PETTY}{tx.id}/', {'title': 'عنوان تازه'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        tx.refresh_from_db()
        self.assertEqual(tx.category, 'شارژ مجدد تنخواه')
