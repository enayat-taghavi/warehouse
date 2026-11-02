"""
آزمون‌های ردگیری ایجاد و ویرایش فاکتور (گام H):
بررسی تنظیم خودکار updated_by در ایجاد، ویرایش، تایید و بازگرداندن آن در سریالایزر.
"""
from decimal import Decimal
import unittest

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection, UserCompanyAccess
from personnel.models import Counterparty, ExpenseInvoice, ExpenseHead
from personnel.scoped_test_support import give_valid_sheba, grant_section_perms, temp_media

User = get_user_model()
BASE = '/api/personnel/expense-invoices/'


@temp_media
class InvoiceUpdatedByHTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IUH', name='شرکت ردگیری', is_active=True)
        project = Project.objects.create(company=self.company, code='IUH-P', name='پروژه')
        self.sec = ProjectSection.objects.create(project=project, code='IUH-S', name='بخش')
        self.cp = Counterparty.objects.create(company=self.company, name='طرف', counterparty_type='other')
        give_valid_sheba(self.cp)
        # سرخط‌های پیش‌فرض هزینه هنگام ایجاد شرکت توسط سیگنال ساخته می‌شوند
        self.head = ExpenseHead.objects.filter(company=self.company, is_active=True).exclude(parent=None).first()
        if not self.head:
            group = ExpenseHead.objects.create(company=self.company, code='99', title='گروه تست')
            self.head = ExpenseHead.objects.create(company=self.company, parent=group, code='9999', title='سرفصل تست', is_active=True)

        self.emp = self.user('emp', 'employee')
        self.emp2 = self.user('emp2', 'employee')
        self.sup = self.user('sup', 'supervisor')
        self.acc = self.user('acc', 'accountant')
        self.mgr = self.user('mgr', 'manager')
        self.trs = self.user('trs', 'treasury')

    def user(self, name, role, section=None):
        u = User.objects.create_user(username=f'iuh_{name}', password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, [], section=section or self.sec, role=role, exact=False)
        return u

    def invoice(self, creator, amount='1000', section=None):
        return ExpenseInvoice.objects.create(
            section=section or self.sec,
            counterparty=self.cp,
            invoice_number=f'IUH-{ExpenseInvoice.objects.count() + 1}',
            invoice_date_shamsi='1405/08/01',
            amount=Decimal(amount),
            description='d',
            created_by=creator,
            updated_by=creator,
        )

    def test_create_sets_updated_by_to_creator(self):
        c = APIClient()
        c.force_authenticate(self.emp)
        data = {
            'section': self.sec.pk,
            'counterparty': self.cp.pk,
            'invoice_number': 'IUH-CRT-1',
            'invoice_date_shamsi': '1405/08/10',
            'description': 'ثبت اولیه فاکتور',
            'lines': [
                {
                    'description': 'کابل برق',
                    'quantity': '1',
                    'unit': 'عدد',
                    'unit_price': '1500000',
                    'expense_head': self.head.pk,
                }
            ],
        }
        res = c.post(BASE, data, format='json', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 201)
        inv = ExpenseInvoice.objects.get(pk=res.data['id'])
        self.assertEqual(inv.created_by, self.emp)
        self.assertEqual(inv.updated_by, self.emp)

    def test_edit_by_other_user_sets_updated_by(self):
        inv = self.invoice(self.emp, amount='2000')
        c = APIClient()
        c.force_authenticate(self.emp2)
        res = c.patch(f'{BASE}{inv.pk}/', {'description': 'ویرایش توسط کاربر دوم'}, format='json', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200)
        inv.refresh_from_db()
        self.assertEqual(inv.created_by, self.emp)
        self.assertEqual(inv.updated_by, self.emp2)

    def test_approve_sets_updated_by_to_approver(self):
        inv = self.invoice(self.emp, amount='3000')
        # ارسال فاکتور توسط کارمند
        c_emp = APIClient()
        c_emp.force_authenticate(self.emp)
        with self.captureOnCommitCallbacks(execute=True):
            res_submit = c_emp.post(f'{BASE}{inv.pk}/submit/', {}, HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res_submit.status_code, 200)

        # تایید فاکتور توسط سرپرست
        c_sup = APIClient()
        c_sup.force_authenticate(self.sup)
        with self.captureOnCommitCallbacks(execute=True):
            res_approve = c_sup.post(f'{BASE}{inv.pk}/approve/', {}, HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res_approve.status_code, 200)

        inv.refresh_from_db()
        self.assertEqual(inv.updated_by, self.sup)

    def test_serializer_returns_updated_by_name(self):
        inv = self.invoice(self.emp, amount='4000')
        inv.updated_by = self.sup
        inv.save(update_fields=['updated_by'])

        c = APIClient()
        c.force_authenticate(self.emp)
        res = c.get(f'{BASE}{inv.pk}/', HTTP_X_COMPANY_ID=str(self.company.pk))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['updated_by'], self.sup.pk)
        expected_name = f"{self.sup.first_name} {self.sup.last_name}".strip() or self.sup.username
        self.assertEqual(res.data['updated_by_name'], expected_name)
