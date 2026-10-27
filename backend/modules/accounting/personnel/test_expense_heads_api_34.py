"""
Release v1 step 3.4-b: API scenario tests for company expense heads
(lifecycle, petty cash, Excel export, usage_count, other company, seed-defaults).
"""
import io
import openpyxl

from personnel.models import ExpenseHead, PettyCashTransaction
from personnel.test_expense_heads_34 import HEADS, INVOICES, PETTY, HeadFixtures


class ExpenseHeadApiScenarioTests(HeadFixtures):
    def test_lifecycle_group_head_invoice_deactivate(self):
        writer = self.client_for(self.writer)
        writer.credentials(HTTP_X_COMPANY_ID=str(self.company.id))

        # 1. As writer POST a group ('company', 'code' '30', 'title' 'گروه تست') -> 201
        res_group = writer.post(
            HEADS,
            {'company': self.company.id, 'code': '30', 'title': 'گروه تست'},
            format='json',
        )
        self.assertEqual(res_group.status_code, 201)
        group_id = res_group.data['id']

        # 2. POST a head under it ('parent' = new group id, 'code' '3001') -> 201
        res_head = writer.post(
            HEADS,
            {'company': self.company.id, 'parent': group_id, 'code': '3001', 'title': 'سرفصل تستی ۳۰۰۱'},
            format='json',
        )
        self.assertEqual(res_head.status_code, 201)
        head_id = res_head.data['id']
        head_title = res_head.data['title']

        # 3. As admin (self.api) POST an invoice with that head -> 201, category equals head title
        inv_body = self.invoice_body(expense_head=head_id)
        res_inv = self.api.post(INVOICES, inv_body, format='json')
        self.assertEqual(res_inv.status_code, 201)
        self.assertEqual(res_inv.data['lines'][0]['expense_head_title'], head_title)
        inv_id = res_inv.data['id']

        # 4. As writer PATCH the head {'is_active': False} -> 200
        res_patch_head = writer.patch(f'{HEADS}{head_id}/', {'is_active': False}, format='json')
        self.assertEqual(res_patch_head.status_code, 200)

        # 5. PATCH the invoice {'description': 'x'} -> 200
        res_patch_inv = self.api.patch(f'{INVOICES}{inv_id}/', {'description': 'x'}, format='json')
        self.assertEqual(res_patch_inv.status_code, 200)

        # 6. Create a second head '3002', deactivate it, PATCH invoice {'expense_head': <3002 id>} -> 400
        res_head2 = writer.post(
            HEADS,
            {'company': self.company.id, 'parent': group_id, 'code': '3002', 'title': 'سرفصل تستی ۳۰۰۲'},
            format='json',
        )
        self.assertEqual(res_head2.status_code, 201)
        head2_id = res_head2.data['id']

        res_patch_head2 = writer.patch(f'{HEADS}{head2_id}/', {'is_active': False}, format='json')
        self.assertEqual(res_patch_head2.status_code, 200)

        res_patch_inv2 = self.api.patch(f'{INVOICES}{inv_id}/', {'expense_head': head2_id}, format='json')
        self.assertEqual(res_patch_inv2.status_code, 400)

    def test_petty_cash_expense_with_head_allocation_without(self):
        # 1. POST petty cash transaction_type='expense' with expense_head=self.head.id -> 201
        res_exp = self.api.post(
            PETTY,
            self.petty_body(transaction_type='expense', expense_head=self.head.id),
            format='json',
        )
        self.assertEqual(res_exp.status_code, 201)

        # 2. POST transaction_type='allocation' without a head -> 201 and stored category is 'شارژ تنخواه'
        res_alloc = self.api.post(
            PETTY,
            self.petty_body(transaction_type='allocation'),
            format='json',
        )
        self.assertEqual(res_alloc.status_code, 201)
        stored_tx = PettyCashTransaction.objects.get(id=res_alloc.data['id'])
        self.assertEqual(stored_tx.category, 'شارژ تنخواه')

        # 3. POST transaction_type='refund' with expense_head=self.head.id -> 400
        res_ref = self.api.post(
            PETTY,
            self.petty_body(transaction_type='refund', expense_head=self.head.id),
            format='json',
        )
        self.assertEqual(res_ref.status_code, 400)

    def test_invoice_excel_export_contains_head_title(self):
        # 1. Create an invoice with self.head via POST
        res_inv = self.api.post(
            INVOICES,
            self.invoice_body(expense_head=self.head.id),
            format='json',
        )
        self.assertEqual(res_inv.status_code, 201)

        # 2. GET export with self.api -> 200
        export_url = f'{INVOICES}export-excel/'
        res_export = self.api.get(export_url)
        self.assertEqual(res_export.status_code, 200)

        # 3. Load openpyxl workbook and assert some cell value equals self.head.title
        wb = openpyxl.load_workbook(io.BytesIO(res_export.content))
        ws = wb.active
        found = any(
            cell.value == self.head.title
            for row in ws.iter_rows()
            for cell in row
        )
        self.assertTrue(found, f"Head title '{self.head.title}' not found in any cell of Excel export")

    def test_usage_count_only_for_writer(self):
        # 1. After one invoice with self.head
        res_inv = self.api.post(
            INVOICES,
            self.invoice_body(expense_head=self.head.id),
            format='json',
        )
        self.assertEqual(res_inv.status_code, 201)

        # 2. Writer's list row for self.head has usage_count == 1
        writer = self.client_for(self.writer)
        writer.credentials(HTTP_X_COMPANY_ID=str(self.company.id))
        res_w = writer.get(f'{HEADS}?company_id={self.company.id}')
        self.assertEqual(res_w.status_code, 200)
        rows_w = res_w.data if isinstance(res_w.data, list) else res_w.data.get('results', [])
        row = next((r for r in rows_w if r['id'] == self.head.id), None)
        self.assertIsNotNone(row)
        self.assertEqual(row.get('usage_count'), 1)

        # 3. Member's rows have no usage_count key
        member = self.client_for(self.member)
        member.credentials(HTTP_X_COMPANY_ID=str(self.company.id))
        res_m = member.get(f'{HEADS}?company_id={self.company.id}')
        self.assertEqual(res_m.status_code, 200)
        rows_m = res_m.data if isinstance(res_m.data, list) else res_m.data.get('results', [])
        for r in rows_m:
            self.assertNotIn('usage_count', r)

    def test_other_company_head_rejected_on_invoice(self):
        # 1. POST an invoice with expense_head=self.other_head.id -> 400 with key expense_head
        res_other = self.api.post(
            INVOICES,
            self.invoice_body(expense_head=self.other_head.id),
            format='json',
        )
        self.assertEqual(res_other.status_code, 400)
        self.assertIn('expense_head', res_other.data['lines'][0])

        # 2. Also a group id (self.group.id) gives 400
        res_grp = self.api.post(
            INVOICES,
            self.invoice_body(expense_head=self.group.id),
            format='json',
        )
        self.assertEqual(res_grp.status_code, 400)
        self.assertIn('expense_head', res_grp.data['lines'][0])

    def test_seed_defaults_idempotent(self):
        initial_count = ExpenseHead.objects.filter(company=self.company).count()

        # As writer POST seed-defaults/?company_id=<self.company.id> -> 200, created == 0
        writer = self.client_for(self.writer)
        writer.credentials(HTTP_X_COMPANY_ID=str(self.company.id))
        res = writer.post(f'{HEADS}seed-defaults/?company_id={self.company.id}', {}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data.get('created'), 0)

        # Head count of self.company is unchanged
        final_count = ExpenseHead.objects.filter(company=self.company).count()
        self.assertEqual(initial_count, final_count)
