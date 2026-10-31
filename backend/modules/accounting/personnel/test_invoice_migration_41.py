"""
طرح ۴.۱-الف (د۱، د۳): یکسان‌سازی شمارهٔ فاکتور و گرد کردن مبلغ ردیف فاکتور.
"""
from decimal import Decimal

from django.test import SimpleTestCase

from personnel.models import ExpenseInvoiceLine, compute_line_amount, normalize_invoice_number

FA_NUMBER = '۱۲–۳ ٤'  # ۱۲–۳ ٤ (Persian/Arabic digits, en dash, space)


class NormalizeInvoiceNumberTests(SimpleTestCase):
    def test_digits_spaces_and_dashes(self):
        self.assertEqual(normalize_invoice_number(FA_NUMBER), '1234')
        self.assertEqual(normalize_invoice_number(' AB-12‌3 '), 'AB123')
        self.assertEqual(normalize_invoice_number(None), '')
        self.assertEqual(normalize_invoice_number(''), '')


    def test_line_amount_rounding(self):
        self.assertEqual(compute_line_amount(Decimal('1.5'), Decimal('3')), Decimal('5'))
        self.assertEqual(compute_line_amount(Decimal('0.333'), Decimal('1000')), Decimal('333'))
        line = ExpenseInvoiceLine(quantity=Decimal('2.5'), unit_price=Decimal('101'))
        self.assertEqual(compute_line_amount(line.quantity, line.unit_price), Decimal('253'))
