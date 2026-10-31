"""
QR واقعی فاکتور (O3 طرح شبانه): صفحهٔ عمومی صحت‌سنجی وضعیت و مبلغ زندهٔ فاکتور را می‌دهد؛ حذف یا شرکت
ناهمخوان = `exists: false`؛ هیچ دادهٔ دیگری (طرف حساب، شرح) بیرون نمی‌رود.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from companies.models import Company, Project, ProjectSection
from personnel.models import Counterparty, ExpenseInvoice
from personnel.workflows import INVOICE_ENTITY
from reports.document_pdf import verify_token


class InvoiceVerifyLiveTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(code='IVO', name='شرکت صحت', is_active=True)
        project = Project.objects.create(company=self.company, code='IVO-P', name='پروژه')
        sec = ProjectSection.objects.create(project=project, code='IVO-S', name='بخش')
        cp = Counterparty.objects.create(company=self.company, name='طرف محرمانه', counterparty_type='other')
        self.inv = ExpenseInvoice.objects.create(
            section=sec, counterparty=cp, invoice_number='V-1', number='1405-9', invoice_date_shamsi='1405/08/01',
            amount=Decimal('2500'), description='شرح داخلی')

    def verify(self, company_id=None):
        token = verify_token(INVOICE_ENTITY, self.inv.pk, '1405-9', title='فاکتور هزینه',
                             company_id=self.company.pk if company_id is None else company_id)
        res = APIClient().get(f'/api/public/verify/{token}/')
        self.assertEqual(res.status_code, 200)
        return res.data

    def test_live_status_and_amount(self):
        ExpenseInvoice.objects.filter(pk=self.inv.pk).update(status='paid', amount=Decimal('3000'))
        data = self.verify()
        self.assertIs(data['valid'], True)
        self.assertIs(data['exists'], True)
        self.assertEqual(data['company_name'], 'شرکت صحت')
        self.assertEqual(data['current']['number'], '1405-9')
        self.assertEqual(data['current']['amount'], '3000')
        self.assertEqual(data['current']['date'], '1405/08/01')
        self.assertEqual(data['current']['status'], ExpenseInvoice(status='paid').get_status_display())
        text = str(data)
        self.assertNotIn('طرف محرمانه', text)
        self.assertNotIn('شرح داخلی', text)

    def test_deleted_invoice(self):
        data_before = self.verify()
        self.assertIs(data_before['exists'], True)
        ExpenseInvoice.objects.filter(pk=self.inv.pk).delete()
        data = self.verify()
        self.assertIs(data['valid'], True)
        self.assertIs(data['exists'], False)
        self.assertNotIn('current', data)

    def test_company_mismatch_hides_live_data(self):
        other = Company.objects.create(code='IVO2', name='دیگر', is_active=True)
        data = self.verify(company_id=other.pk)
        self.assertIs(data['exists'], False)
        self.assertNotIn('current', data)
