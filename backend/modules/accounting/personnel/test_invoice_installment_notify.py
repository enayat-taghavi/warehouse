"""
گام د طرح اصلاح فاکتور (۱۱ آبان ۱۴۰۵): اعلان قسط به ثبت‌کننده و لینک اعلان به صفحهٔ یکپارچه.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from companies.models import Company, SectionAssignment
from notifications.models import Notification
from personnel.invoice_payments import INSTALLMENT_NOTIFICATION_TYPE, INSTALLMENT_TITLE_FA, PATH_PAYMENT_TITLE_FA
from personnel.scoped_test_support import temp_media
from personnel.test_invoice_payments_41 import InvoicePayments41Tests
from personnel.workflows import INVOICE_WORKFLOW_SPEC

User = get_user_model()
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

    def recipients(self):
        return sorted(self.installment_rows().values_list('recipient_id', flat=True))

    def test_partial_payment_notifies_whole_path_but_payer(self):
        # گام ی: ثبت‌کننده و همهٔ تأییدکنندگان مسیر؛ خود خزانه‌دار پرداخت‌کننده نه
        inv = self.payable_invoice('1000')
        res = self.pay(self.trs, inv, 400, 'T1')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.recipients(), sorted([self.emp.pk, self.sup.pk, self.acc.pk, self.mgr.pk]))
        n = self.installment_rows().get(recipient=self.emp)
        self.assertEqual(n.title, INSTALLMENT_TITLE_FA)
        self.assertEqual(n.url, NEW_ROUTE.replace('{id}', str(inv.pk)))
        self.assertEqual(n.target_model, 'ExpenseInvoice')
        self.assertEqual(n.target_id, str(inv.pk))
        self.assertIn('400', n.message)
        self.assertIn('600', n.message)
        other = self.installment_rows().get(recipient=self.sup)
        self.assertEqual(other.title, PATH_PAYMENT_TITLE_FA)
        self.assertEqual(other.message, n.message)
        self.assertEqual(other.url, n.url)

    def test_final_payment_notifies_path_but_not_creator(self):
        inv = self.payable_invoice('1000')
        self.assertEqual(self.pay(self.trs, inv, 1000, 'T1').status_code, 201)
        # ثبت‌کننده اعلان پرداخت جدا ندارد (پایان گردش خبرش می‌دهد)؛ بقیهٔ مسیر دارند
        self.assertEqual(self.recipients(), sorted([self.sup.pk, self.acc.pk, self.mgr.pk]))
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

    def test_inactive_and_access_revoked_users_skipped(self):
        inv = self.payable_invoice('1000')
        self.sup.is_active = False
        self.sup.save(update_fields=['is_active'])
        SectionAssignment.objects.filter(user=self.acc).update(is_active=False)
        self.assertEqual(self.pay(self.trs, inv, 400, 'T1').status_code, 201)
        self.assertEqual(self.recipients(), sorted([self.emp.pk, self.mgr.pk]))

    def test_creator_without_company_access_skipped(self):
        inv = self.payable_invoice('1000')
        SectionAssignment.objects.filter(user=self.emp).update(is_active=False)
        self.assertEqual(self.pay(self.trs, inv, 400, 'T1').status_code, 201)
        self.assertNotIn(self.emp.pk, self.recipients())

    def test_earlier_payer_notified_on_next_payment(self):
        inv = self.payable_invoice('1000')
        trs2 = self.user('trs2', 'treasury')
        self.assertEqual(self.pay(self.trs, inv, 300, 'T1').status_code, 201)
        self.installment_rows().delete()
        self.assertEqual(self.pay(trs2, inv, 300, 'T2').status_code, 201)
        self.assertEqual(self.recipients(), sorted([self.emp.pk, self.sup.pk, self.acc.pk, self.mgr.pk, self.trs.pk]))

    def test_outside_company_user_never_notified(self):
        # کاربری با عضویت در شرکت دیگر که روی گام گردش نامش ثبت شده (دادهٔ ناسازگار) اعلان نمی‌گیرد
        from workflow.models import WorkflowStep
        other = Company.objects.create(code='IPS-X', name='شرکت دیگر', is_active=True)
        outsider = User.objects.create_user(username='ips_outsider', password='x')
        SectionAssignment.objects.create(user=outsider, company=other, is_active=True)
        inv = self.payable_invoice('1000')
        step = WorkflowStep.objects.filter(instance__entity_id=inv.pk, action=WorkflowStep.ACT).first()
        step.on_behalf_of = outsider
        step.save(update_fields=['on_behalf_of'])
        self.assertEqual(self.pay(self.trs, inv, 400, 'T1').status_code, 201)
        self.assertNotIn(outsider.pk, self.recipients())
