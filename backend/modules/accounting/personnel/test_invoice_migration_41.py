"""
طرح ۴.۱-الف (د۱، د۳): migration personnel/0015. هر فاکتور قدیمی دقیقاً یک ردیف با همان مبلغ و سرفصل می‌گیرد،
متن category از دست نمی‌رود، subtotal و invoice_number_norm پر می‌شوند و برگشت سرفصل و category را برمی‌گرداند.
tearDown به آخرین migration برمی‌گردد (قاعدهٔ test_counterparty_core.py).
"""
import importlib
from decimal import Decimal

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TransactionTestCase

from personnel.models import ExpenseInvoiceLine, compute_line_amount, normalize_invoice_number

FROM = [('personnel', '0014_petty_cash_company_level')]
TO = [('personnel', '0015_invoice_lines_vat_number')]
FA_NUMBER = '۱۲–۳ ٤'  # ۱۲–۳ ٤ (Persian/Arabic digits, en dash, space)


class NormalizeInvoiceNumberTests(SimpleTestCase):
    def test_digits_spaces_and_dashes(self):
        self.assertEqual(normalize_invoice_number(FA_NUMBER), '1234')
        self.assertEqual(normalize_invoice_number(' AB-12‌3 '), 'AB123')
        self.assertEqual(normalize_invoice_number(None), '')
        self.assertEqual(normalize_invoice_number(''), '')

    def test_frozen_migration_copy_matches(self):
        mig = importlib.import_module('personnel.migrations.0015_invoice_lines_vat_number')
        for value in (FA_NUMBER, ' AB-12‌3 ', 'ـ۹۹/۱', 'x' * 150, None):
            self.assertEqual(mig._normalize(value), normalize_invoice_number(value))

    def test_line_amount_rounding(self):
        self.assertEqual(compute_line_amount(Decimal('1.5'), Decimal('3')), Decimal('5'))
        self.assertEqual(compute_line_amount(Decimal('0.333'), Decimal('1000')), Decimal('333'))
        line = ExpenseInvoiceLine(quantity=Decimal('2.5'), unit_price=Decimal('101'))
        self.assertEqual(compute_line_amount(line.quantity, line.unit_price), Decimal('253'))


class InvoiceLinesDataMigrationTests(TransactionTestCase):
    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def _seed(self):
        executor = MigrationExecutor(connection)
        executor.migrate(FROM)
        apps = executor.loader.project_state(FROM).apps
        Company_ = apps.get_model('companies', 'Company')
        Project_ = apps.get_model('companies', 'Project')
        Section_ = apps.get_model('companies', 'ProjectSection')
        Party = apps.get_model('contacts', 'ExternalParty')
        Cp = apps.get_model('personnel', 'Counterparty')
        Head = apps.get_model('personnel', 'ExpenseHead')
        Inv = apps.get_model('personnel', 'ExpenseInvoice')
        co = Company_.objects.create(code='MG41', name='شرکت آزمون')
        sec = Section_.objects.create(project_id=Project_.objects.create(company_id=co.id, code='P41', name='p').id,
                                      code='S41', name='s')
        cp = Cp.objects.create(party_id=Party.objects.create(company_id=co.id, name='فروشنده').id)
        group = Head.objects.create(company_id=co.id, code='G41', title='گروه')
        head = Head.objects.create(company_id=co.id, parent_id=group.id, code='H41', title='حمل و نقل')
        with_head = Inv.objects.create(section_id=sec.id, counterparty_id=cp.id, invoice_number=FA_NUMBER,
                                       invoice_date_shamsi='1405/01/02', amount=1250000, category='حمل و نقل',
                                       expense_head_id=head.id, description='کرایهٔ بار')
        old_text = Inv.objects.create(section_id=sec.id, counterparty_id=cp.id, invoice_number='A-7',
                                      invoice_date_shamsi='1404/12/20', amount=300, category='پذیرایی قدیمی',
                                      description='چای')
        return head, with_head, old_text

    def test_copy_into_one_line_then_drop_and_reverse(self):
        head, with_head, old_text = self._seed()

        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(TO)
        apps = executor.loader.project_state(TO).apps
        Inv = apps.get_model('personnel', 'ExpenseInvoice')
        Line = apps.get_model('personnel', 'ExpenseInvoiceLine')

        self.assertEqual(Inv.objects.count(), 2)
        self.assertEqual(Line.objects.count(), 2)
        inv = Inv.objects.get(pk=with_head.pk)
        self.assertEqual((inv.subtotal, inv.amount, inv.invoice_number_norm), (Decimal('1250000'), Decimal('1250000'), '1234'))
        self.assertEqual((inv.discount_amount, inv.vat_amount, inv.vat_applicable, inv.possible_duplicate, inv.number),
                         (Decimal('0'), Decimal('0'), False, False, ''))
        line = Line.objects.get(invoice_id=inv.pk)
        self.assertEqual((line.position, line.quantity, line.unit_price, line.line_amount, line.expense_head_id),
                         (1, Decimal('1'), Decimal('1250000'), Decimal('1250000'), head.pk))
        self.assertEqual(line.description, 'کرایهٔ بار')  # category was just the head title

        inv2 = Inv.objects.get(pk=old_text.pk)
        self.assertEqual((inv2.subtotal, inv2.invoice_number_norm), (Decimal('300'), 'A7'))
        line2 = Line.objects.get(invoice_id=inv2.pk)
        self.assertIsNone(line2.expense_head_id)
        self.assertEqual(line2.line_amount, Decimal('300'))
        self.assertEqual(line2.description, 'پذیرایی قدیمی - چای')  # old category text kept

        field_names = {f.name for f in Inv._meta.get_fields()}
        self.assertNotIn('category', field_names)
        self.assertNotIn('expense_head', field_names)

        # reverse: head and category come back from the first line
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(FROM)
        apps = executor.loader.project_state(FROM).apps
        Inv = apps.get_model('personnel', 'ExpenseInvoice')
        back = Inv.objects.get(pk=with_head.pk)
        self.assertEqual((back.expense_head_id, back.category, back.amount), (head.pk, 'حمل و نقل', Decimal('1250000')))
        back2 = Inv.objects.get(pk=old_text.pk)
        self.assertIsNone(back2.expense_head_id)
        self.assertEqual(back2.category, 'پذیرایی قدیمی - چای')
        self.assertEqual(Inv.objects.count(), 2)
