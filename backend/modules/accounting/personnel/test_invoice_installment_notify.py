"""
گام د طرح اصلاح فاکتور (۱۱ آبان ۱۴۰۵): اعلان قسط به ثبت‌کننده و لینک اعلان به صفحهٔ یکپارچه.
"""
from django.test import TestCase

from notifications.models import Notification
from personnel.invoice_payments import INSTALLMENT_NOTIFICATION_TYPE
from personnel.scoped_test_support import temp_media
from personnel.test_invoice_payments_41 import InvoicePayments41Tests
from personnel.workflows import INVOICE_WORKFLOW_SPEC

NEW_ROUTE = '/app/finance/invoices?view=mine&invoice={id}'


@temp_media
class InvoiceInstallmentNotifyTests(TestCase):
    setUp = InvoicePayments41Tests.setUp
    user = InvoicePayments41Tests.user
    post = InvoicePayments41Tests.post
    payable_invoice = InvoicePayments41Tests.payable_invoice
    pay = InvoicePayments41Tests.pay

    def installment_rows(self):
        return Notification.objects.filter(notification_type=INSTALLMENT_NOTIFICATION_TYPE)

    def test_route_points_to_unified_page(self):
        self.assertEqual(INVOICE_WORKFLOW_SPEC.route, NEW_ROUTE)

    def test_partial_payment_notifies_creator_only(self):
        inv = self.payable_invoice('1000')
        res = self.pay(self.trs, inv, 400, 'T1')
        self.assertEqual(res.status_code, 201, res.data)
        rows = list(self.installment_rows())
        self.assertEqual([n.recipient_id for n in rows], [self.emp.pk])
        n = rows[0]
        self.assertEqual(n.url, NEW_ROUTE.replace('{id}', str(inv.pk)))
        self.assertEqual(n.target_model, 'ExpenseInvoice')
        self.assertEqual(n.target_id, str(inv.pk))
        self.assertIn('400', n.message)
        self.assertIn('600', n.message)

    def test_final_payment_sends_no_extra_installment_notice(self):
        inv = self.payable_invoice('1000')
        self.assertEqual(self.pay(self.trs, inv, 1000, 'T1').status_code, 201)
        self.assertFalse(self.installment_rows().exists())
        # پایان گردش همچنان به ثبت‌کننده با لینک تازه خبر می‌دهد
        done = Notification.objects.filter(recipient=self.emp, notification_type='workflow_task',
                                           url=NEW_ROUTE.replace('{id}', str(inv.pk)))
        self.assertTrue(done.exists())

    def test_failed_payment_sends_nothing(self):
        inv = self.payable_invoice('1000')
        res = self.pay(self.trs, inv, 5000, 'T1')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(self.installment_rows().exists())

    def test_outsider_payment_attempt_sends_nothing(self):
        inv = self.payable_invoice('1000')
        res = self.pay(self.sup, inv, 400, 'T1')
        self.assertNotIn(res.status_code, (200, 201))
        self.assertFalse(self.installment_rows().exists())
