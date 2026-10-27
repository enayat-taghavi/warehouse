"""
تست‌های ردیف‌های فاکتور هزینه، مالیات بر ارزش افزوده، هشدار تکراری و شماره‌گذاری داخلی (۴.۱-الف).
اجرا: set PYTHONUTF8=1&& .\\venv\\Scripts\\python.exe manage.py test personnel.test_invoice_lines_41 --keepdb
"""
from decimal import Decimal

from numbering.models import IssuedNumber
from personnel.models import ExpenseHead, ExpenseInvoice, ExpenseInvoiceLine
from personnel.test_expense_heads_34 import HeadFixtures, INVOICES
from personnel.views_domains.treasury_views import INVOICE_WORKFLOW
from settings_core.models import CompanySetting
from workflow import engine as wf_engine
from workflow.models import WorkflowStep


class InvoiceLines41Tests(HeadFixtures):
    def body(self, **extra):
        h2 = ExpenseHead.objects.get(company=self.company, code='1002')
        return {
            'section': self.sec.id,
            'counterparty': self.cp.id,
            'invoice_number': '۱۲-۳۴',
            'invoice_date_shamsi': '1405/08/01',
            'description': 'd',
            'discount_amount': '101',
            'vat_applicable': True,
            'amount': '1',
            'lines': [
                {'description': 'a', 'quantity': '2.5', 'unit_price': '1001', 'expense_head': self.head.id},
                {'description': 'b', 'quantity': '1', 'unit_price': '500', 'expense_head': h2.id},
            ],
            **extra,
        }

    def test_totals_computed_on_server_client_totals_ignored(self):
        r = self.api.post(INVOICES, self.body(subtotal='1', amount='1'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual(Decimal(d['subtotal']), 3003)
        self.assertEqual(Decimal(d['vat_amount']), 290)
        self.assertEqual(Decimal(d['amount']), 3192)
        self.assertEqual(len(d['lines']), 2)
        self.assertEqual(Decimal(d['lines'][0]['line_amount']), 2503)
        self.assertEqual(Decimal(d['lines'][1]['line_amount']), 500)

    def test_discount_above_subtotal_rejected(self):
        r = self.api.post(INVOICES, self.body(discount_amount='999999'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('discount_amount', r.json())

    def test_line_count_limits(self):
        r0 = self.api.post(INVOICES, self.body(lines=[], discount_amount='0'), format='json')
        self.assertEqual(r0.status_code, 400, r0.content)
        self.assertIn('lines', r0.json())

        lines101 = [
            {'description': f'line_{i}', 'quantity': '1', 'unit_price': '1', 'expense_head': self.head.id}
            for i in range(101)
        ]
        r101 = self.api.post(INVOICES, self.body(lines=lines101, discount_amount='0'), format='json')
        self.assertEqual(r101.status_code, 400, r101.content)
        self.assertIn('lines', r101.json())

        lines100 = [
            {'description': f'line_{i}', 'quantity': '1', 'unit_price': '1', 'expense_head': self.head.id}
            for i in range(100)
        ]
        r100 = self.api.post(INVOICES, self.body(lines=lines100, discount_amount='0'), format='json')
        self.assertEqual(r100.status_code, 201, r100.content)

    def test_line_head_of_other_company_or_group_rejected(self):
        r_other = self.api.post(
            INVOICES,
            self.body(lines=[{
                'description': 'other',
                'quantity': '1',
                'unit_price': '10',
                'expense_head': self.other_head.id,
            }]),
            format='json',
        )
        self.assertEqual(r_other.status_code, 400, r_other.content)
        self.assertIn('lines', r_other.json())

        r_group = self.api.post(
            INVOICES,
            self.body(lines=[{
                'description': 'grp',
                'quantity': '1',
                'unit_price': '10',
                'expense_head': self.group.id,
            }]),
            format='json',
        )
        self.assertEqual(r_group.status_code, 400, r_group.content)
        self.assertIn('lines', r_group.json())

    def test_edit_replaces_lines_fully(self):
        r = self.api.post(INVOICES, self.body(), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        inv_id = r.json()['id']
        self.assertEqual(len(r.json()['lines']), 2)

        one_line = [{'description': 'single', 'quantity': '3', 'unit_price': '100', 'expense_head': self.head.id}]
        r_patch = self.api.patch(f'{INVOICES}{inv_id}/', {'lines': one_line}, format='json')
        self.assertEqual(r_patch.status_code, 200, r_patch.content)
        d = r_patch.json()
        self.assertEqual(len(d['lines']), 1)
        self.assertEqual(Decimal(d['subtotal']), 300)
        self.assertEqual(ExpenseInvoiceLine.objects.filter(invoice_id=inv_id).count(), 1)

    def test_manual_vat_and_rate_snapshot(self):
        r = self.api.post(INVOICES, self.body(), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        inv_id = d['id']
        self.assertEqual(Decimal(d['vat_amount']), 290)
        self.assertFalse(d['vat_manual'])
        self.assertEqual(Decimal(d['vat_rate']), 10)

        r_patch = self.api.patch(f'{INVOICES}{inv_id}/', {'vat_amount': '300'}, format='json')
        self.assertEqual(r_patch.status_code, 200, r_patch.content)
        d_patch = r_patch.json()
        self.assertTrue(d_patch['vat_manual'])
        self.assertEqual(Decimal(d_patch['amount']), 3202)

        r_err = self.api.patch(f'{INVOICES}{inv_id}/', {'vat_amount': '999999'}, format='json')
        self.assertEqual(r_err.status_code, 400)

        CompanySetting.objects.update_or_create(
            company=self.company, module='accounting', key='vat_rate', defaults={'value': 20}
        )
        inv = ExpenseInvoice.objects.get(pk=inv_id)
        inv.refresh_from_db()
        self.assertEqual(Decimal(inv.vat_rate), 10)

    def test_duplicate_create_never_rejected_submit_needs_reason(self):
        r_a = self.api.post(INVOICES, self.body(invoice_number='12-34'), format='json')
        self.assertEqual(r_a.status_code, 201, r_a.content)

        r_b = self.api.post(
            INVOICES,
            self.body(invoice_number='۱۲-۳۴', invoice_date_shamsi='1404/05/01'),
            format='json',
        )
        self.assertEqual(r_b.status_code, 201, r_b.content)
        d_b = r_b.json()
        self.assertTrue(d_b['possible_duplicate'])
        b_id = d_b['id']

        dup = self.api.get(
            f'{INVOICES}duplicates/',
            {'counterparty': self.cp.id, 'invoice_number': '1234', 'exclude': b_id},
        )
        self.assertEqual(dup.status_code, 200, dup.content)
        self.assertEqual(dup.json()['count'], 1)

        r_sub_fail = self.api.post(f'{INVOICES}{b_id}/submit/', {}, format='json')
        self.assertEqual(r_sub_fail.status_code, 400)
        self.assertEqual(r_sub_fail.json()['code'], 'duplicate_reason_required')

        r_sub_ok = self.api.post(f'{INVOICES}{b_id}/submit/', {'duplicate_reason': 'second copy'}, format='json')
        self.assertEqual(r_sub_ok.status_code, 200, r_sub_ok.content)

        inv_b = ExpenseInvoice.objects.get(pk=b_id)
        self.assertEqual(inv_b.duplicate_reason, 'second copy')

        wf_instance = wf_engine.instance_of(INVOICE_WORKFLOW, b_id)
        step = (
            WorkflowStep.objects.filter(instance=wf_instance, action=WorkflowStep.SUBMIT)
            .order_by('-at', '-pk')
            .first()
        )
        self.assertIsNotNone(step)
        self.assertIn('second copy', step.reason)

    def test_rejected_invoice_not_counted_and_hidden_details(self):
        r_a = self.api.post(INVOICES, self.body(invoice_number='12-34'), format='json')
        self.assertEqual(r_a.status_code, 201, r_a.content)
        a_id = r_a.json()['id']

        ExpenseInvoice.objects.filter(pk=a_id).update(status='rejected')
        dup = self.api.get(f'{INVOICES}duplicates/', {'counterparty': self.cp.id, 'invoice_number': '1234'})
        self.assertEqual(dup.status_code, 200, dup.content)
        self.assertEqual(dup.json()['count'], 0)

        ExpenseInvoice.objects.filter(pk=a_id).update(status='draft')
        c = self.client_for(self.member)
        dup_member = c.get(
            f'{INVOICES}duplicates/',
            {'counterparty': self.cp.id, 'invoice_number': '1234'},
            HTTP_X_COMPANY_ID=str(self.company.id),
        )
        self.assertEqual(dup_member.status_code, 200, dup_member.content)
        self.assertEqual(dup_member.json()['count'], 1)
        self.assertEqual(dup_member.json()['hidden_count'], 1)
        self.assertEqual(dup_member.json()['matches'], [])

    def test_number_at_first_submit_kept_and_voided_on_delete(self):
        r = self.api.post(INVOICES, self.body(), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        inv_id = r.json()['id']
        self.assertEqual(r.json()['number'], '')

        r_sub = self.api.post(f'{INVOICES}{inv_id}/submit/', {}, format='json')
        self.assertEqual(r_sub.status_code, 200, r_sub.content)
        num1 = r_sub.json()['number']
        self.assertTrue(num1)

        inv = ExpenseInvoice.objects.get(pk=inv_id)
        issued_id = inv.issued_number_id
        self.assertIsNotNone(issued_id)
        self.assertTrue(IssuedNumber.objects.filter(pk=issued_id).exists())

        r_can = self.api.post(f'{INVOICES}{inv_id}/cancel/', {}, format='json')
        self.assertEqual(r_can.status_code, 200, r_can.content)

        r_sub2 = self.api.post(f'{INVOICES}{inv_id}/submit/', {}, format='json')
        self.assertEqual(r_sub2.status_code, 200, r_sub2.content)
        self.assertEqual(r_sub2.json()['number'], num1)

        r_can2 = self.api.post(f'{INVOICES}{inv_id}/cancel/', {}, format='json')
        self.assertEqual(r_can2.status_code, 200, r_can2.content)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'draft')

        r_del = self.api.delete(f'{INVOICES}{inv_id}/')
        self.assertEqual(r_del.status_code, 204, r_del.content)
        self.assertEqual(IssuedNumber.objects.get(pk=issued_id).status, IssuedNumber.STATUS_VOID)
