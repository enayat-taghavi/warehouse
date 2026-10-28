"""
تست‌های قلمرو و دسترسی گزارش‌های حسابداری (۴.۷-ب).
اجرا: set PYTHONUTF8=1&& .\\venv\\Scripts\\python.exe manage.py test personnel.test_reports_47 --keepdb
"""
from decimal import Decimal
import jdatetime

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import UserCompanyAccess, ProjectSection
from personnel.models import (
    CompanyBankAccount, ExpenseHead, ExpenseInvoice, ExpenseInvoiceLine,
    InvoicePayment, MonthlyPayrollRecord, MonthlyWorkPeriod,
    PersonnelProfile, PettyCashAccount, PettyCashTransaction,
    VehicleDriverProfile, VehicleTripLog,
)
from personnel.scoped_test_support import grant_section_perms
from personnel.test_fiscal_period_32 import FiscalFixtures

User = get_user_model()
REPORTS = '/api/personnel/reports/'


class Reports47Tests(FiscalFixtures):
    def setUp(self):
        super().setUp()
        self.heads = list(
            ExpenseHead.objects.filter(company=self.company, parent__isnull=False)
            .order_by('code')[:3]
        )

    def make_invoice(self, status='paid', discount=Decimal('101'), vat=Decimal('290'), section=None):
        inv = ExpenseInvoice.objects.create(
            section=section or self.sec,
            counterparty=self.cp,
            invoice_number=f'R47T-{ExpenseInvoice.objects.count()}',
            invoice_date_shamsi='1405/08/01',
            amount=Decimal('0'),
            discount_amount=discount,
            vat_amount=vat,
            description='d',
            created_by=self.admin,
            status=status,
        )
        specs = [
            (self.heads[0], '2.5', '1001'),
            (self.heads[1], '1', '500'),
            (self.heads[2], '3', '333'),
            (self.heads[0], '1', '7'),
        ]
        for pos, (head, qty, price) in enumerate(specs, start=1):
            ExpenseInvoiceLine.objects.create(
                invoice=inv,
                position=pos,
                description='l',
                quantity=Decimal(qty),
                unit_price=Decimal(price),
                expense_head=head,
            )
        subtotal = sum(line.line_amount for line in inv.lines.all())
        inv.subtotal = subtotal
        inv.amount = subtotal - discount + vat
        inv.save()
        return inv

    def member(self, name, codes, section=None, role='employee'):
        u = User.objects.create_user(username=name, password='x')
        UserCompanyAccess.objects.create(user=u, company=self.company, is_default=True)
        grant_section_perms(u, codes, section=section or self.sec, role=role)
        c = APIClient()
        c.force_authenticate(u)
        c.credentials(HTTP_X_COMPANY_ID=str(self.company.id))
        return c

    def test_expense_excludes_draft_and_rejected_and_rejected_petty_line(self):
        """فاکتور پیش‌نویس و ردشده و ردیف تنخواه ردشده در هزینه نمی‌آیند؛ کل برابر فاکتورهای تأییدشده + تنخواه تأییدشده."""
        inv = self.make_invoice(status='paid')
        self.make_invoice(status='draft')
        self.make_invoice(status='rejected')

        petty_acc = PettyCashAccount.objects.create(
            company=self.company, custodian=self.admin, ceiling_amount=Decimal('5000000')
        )
        PettyCashTransaction.objects.create(
            account=petty_acc, custodian=self.admin, created_by=self.admin,
            transaction_type='expense', amount=Decimal('5000'),
            transaction_date_shamsi='1405/08/02', title='petty valid',
            status='approved', line_status='approved', section=self.sec,
            expense_head=self.heads[0],
        )
        PettyCashTransaction.objects.create(
            account=petty_acc, custodian=self.admin, created_by=self.admin,
            transaction_type='expense', amount=Decimal('7000'),
            transaction_date_shamsi='1405/08/03', title='petty rejected',
            status='rejected', line_status='rejected', section=self.sec,
            expense_head=self.heads[1],
        )

        r = self.api.get(f'{REPORTS}expense/?group_by=head')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()

        want_inv = int(inv.amount - inv.vat_amount)
        want_petty = 5000
        self.assertEqual(data['totals']['invoice_amount'], want_inv)
        self.assertEqual(data['totals']['petty_amount'], want_petty)
        self.assertEqual(data['totals']['total'], want_inv + want_petty)
        self.assertEqual(data['totals']['invoice_count'], 1)

        r_sec = self.api.get(f'{REPORTS}expense/?group_by=section')
        self.assertEqual(r_sec.status_code, 200)
        self.assertEqual(r_sec.json()['totals']['total'], want_inv + want_petty)

    def test_unpaid_remainder_and_age_after_partial_payment(self):
        """فاکتور تاییدشده با پرداخت ناقص، مانده و سن بدهی را در بازه درست نشان می‌دهد."""
        inv = self.make_invoice(status='ready_to_pay')

        today = timezone.localdate()
        inv_jdate = jdatetime.date.fromgregorian(date=today) - jdatetime.timedelta(days=45)
        inv.invoice_date_shamsi = inv_jdate.strftime('%Y/%m/%d')
        inv.save()

        bank = CompanyBankAccount.objects.create(
            company=self.company, bank_name='ملی', account_number='1111222233',
            sheba_number='IR120170000000000000000001', is_primary=True,
        )
        paid = Decimal('500')
        InvoicePayment.objects.create(
            invoice=inv, amount=paid, payment_date_shamsi='1405/08/05',
            tracking_code='R47T-TRK1', method='transfer', company_bank_account=bank,
            created_by=self.admin,
        )
        inv.paid_amount = paid
        inv.status = 'partially_paid'
        inv.save()

        r = self.api.get(f'{REPORTS}unpaid-invoices/')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()

        expected_rem = int(inv.amount - paid)
        self.assertEqual(data['totals']['remaining'], expected_rem)
        self.assertEqual(data['totals']['age_31_60'], expected_rem)

        results = data['details']['results']
        match = next((x for x in results if x['invoice_id'] == inv.id), None)
        self.assertIsNotNone(match)
        self.assertEqual(match['remaining'], expected_rem)
        self.assertEqual(match['paid_amount'], int(paid))
        self.assertEqual(match['amount'], int(inv.amount))
        self.assertEqual(match['age_bucket'], 'age_31_60')
        self.assertEqual(match['age_days'], 45)

    def test_petty_debt_equals_debt_breakdown(self):
        """بدهی گزارش تنخواه دقیقاً برابر debt_breakdown حساب است."""
        custodian = User.objects.create_user(username='r47_custodian', password='x')
        UserCompanyAccess.objects.create(user=custodian, company=self.company, is_default=True)
        petty_acc = PettyCashAccount.objects.create(
            company=self.company, custodian=custodian, ceiling_amount=Decimal('5000000')
        )
        PettyCashTransaction.objects.create(
            account=petty_acc, custodian=custodian, created_by=custodian,
            transaction_type='expense', amount=Decimal('35000'),
            transaction_date_shamsi='1405/08/01', title='line rejected',
            status='rejected', line_status='rejected',
        )

        breakdown = petty_acc.debt_breakdown()
        self.assertEqual(breakdown['debt'], Decimal('35000'))

        r = self.api.get(f'{REPORTS}petty-cash/')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        row = next(x for x in data['rows'] if x['account_id'] == petty_acc.id)
        self.assertEqual(row['debt'], int(breakdown['debt']))

    def test_no_report_perm_is_403(self):
        """کاربر بدون مجوز perm_accounting_reports روی تمامی کلیدهای گزارش 403 می‌گیرد."""
        user = self.member('r47_no_rep', ['perm_invoice_record', 'perm_invoice_approve'])
        for key in ('expense', 'unpaid-invoices', 'petty-cash', 'bank-payments', 'labor-cost', 'fleet-cost', 'dashboard-summary'):
            self.assertEqual(user.get(f'{REPORTS}{key}/').status_code, 403, key)
            if key != 'dashboard-summary':
                self.assertEqual(user.get(f'{REPORTS}{key}/export-excel/').status_code, 403, key)

    def test_other_company_and_section_is_404(self):
        """درخواست گزارش با شناسه شرکت یا بخش دیگر، 404 برمی‌گرداند."""
        reporter = self.member('r47_reporter', ['perm_accounting_reports', 'perm_invoice_record'])
        self.assertEqual(reporter.get(f'{REPORTS}expense/?company_id={self.other.id}').status_code, 404)
        self.assertEqual(reporter.get(f'{REPORTS}expense/?section_id={self.other_sec.id}').status_code, 404)
        self.assertEqual(reporter.get(f'{REPORTS}unpaid-invoices/?company_id={self.other.id}').status_code, 404)
        self.assertEqual(reporter.get(f'{REPORTS}unpaid-invoices/?project_id={self.other_sec.project_id}').status_code, 404)
        self.assertEqual(reporter.get(f'{REPORTS}petty-cash/?company_id={self.other.id}').status_code, 404)
        self.assertEqual(reporter.get(f'{REPORTS}bank-payments/?company_id={self.other.id}').status_code, 404)

    def test_single_section_member_sees_only_own_section(self):
        """عضو یک بخش فقط ارقام بخش خود را مشاهده می‌کند."""
        sec_b = ProjectSection.objects.create(project=self.sec.project, code='FP32-S-B2', name='بخش دوم')
        inv_a = self.make_invoice(status='paid', section=self.sec)
        inv_b = self.make_invoice(status='paid', section=sec_b)

        mem_a = self.member('r47_sec_a_user', ['perm_accounting_reports', 'perm_invoice_record'], section=self.sec)
        r = mem_a.get(f'{REPORTS}expense/?group_by=section')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()

        row_keys = [row['key'] for row in data['rows']]
        self.assertEqual(row_keys, [self.sec.id])
        self.assertNotIn(sec_b.id, row_keys)
        self.assertEqual(data['totals']['invoice_amount'], int(inv_a.amount - inv_a.vat_amount))

    def test_labor_cost_needs_payroll_perm(self):
        """گزارش بهای نیروی انسانی به view_sys_payroll نیاز دارد و هویت فردی فاش نمی‌شود."""
        no_payroll = self.member('r47_no_payroll', ['perm_accounting_reports'])
        self.assertEqual(no_payroll.get(f'{REPORTS}labor-cost/').status_code, 403)

        with_payroll = self.member('r47_with_payroll', ['perm_accounting_reports', 'view_sys_payroll'])
        profile = PersonnelProfile.objects.create(
            company=self.company, section=self.sec, national_code='0010376488',
            first_name='محمدرضا', last_name='شجریانی', birth_date='13600101',
            approval_status='approved', is_active=True,
        )
        period = MonthlyWorkPeriod.objects.create(
            company=self.company, section=self.sec, project=self.sec.project,
            year_month='1405/08', status='READY_TO_PAY',
        )
        MonthlyPayrollRecord.objects.create(
            period=period, personnel=profile, row_number=1,
            national_code=profile.national_code, full_name=profile.full_name,
            base_salary=Decimal('20000000'), overtime_amount=Decimal('5000000'),
            gross_salary=Decimal('30000000'), total_insurance=Decimal('7000000'),
            worker_insurance=Decimal('2000000'), net_salary=Decimal('25000000'),
        )

        r = with_payroll.get(f'{REPORTS}labor-cost/?date_from=1405/08/01&date_to=1405/08/30')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(len(data['rows']), 1)
        self.assertEqual(data['rows'][0]['headcount'], 1)
        self.assertEqual(data['rows'][0]['base_salary'], 20000000)

        content_str = r.content.decode('utf-8')
        self.assertNotIn('national_code', content_str)
        self.assertNotIn('0010376488', content_str)
        self.assertNotIn('محمدرضا', content_str)
        self.assertNotIn('شجریانی', content_str)

    def test_fleet_cost_needs_fleet_perm(self):
        """گزارش هزینه ناوگان بدون view_sys_fleet_settlement برابر 403 و با آن 200 است."""
        no_fleet = self.member('r47_no_fleet', ['perm_accounting_reports'])
        self.assertEqual(no_fleet.get(f'{REPORTS}fleet-cost/').status_code, 403)

        with_fleet = self.member('r47_with_fleet', ['perm_accounting_reports', 'view_sys_fleet_settlement'])
        vehicle = VehicleDriverProfile.objects.create(
            company=self.company, section=self.sec, plate_number='99ج888-11',
            vehicle_type='pickup', ownership_type='contract', driver_name='علی رضایی',
            driver_national_code='0010376488', approval_status='approved', is_active=True,
        )
        VehicleTripLog.objects.create(
            vehicle=vehicle, section=self.sec,
            project=self.sec.project, date_shamsi='1405/08/05', trip_count=3,
            unit_rate=Decimal('100000'), is_deleted=False,
        )

        r = with_fleet.get(f'{REPORTS}fleet-cost/?date_from=1405/08/01&date_to=1405/08/30')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(len(data['rows']), 1)
        self.assertEqual(data['rows'][0]['services'], 3)
        self.assertEqual(data['rows'][0]['rent'], 300000)

    def test_bank_numbers_masked_for_accountant(self):
        """در پرداخت‌های بانکی حسابدار شبا و حساب را ماسک‌شده و صاحب دسترسی کامل آن را کامل می‌بیند."""
        bank = CompanyBankAccount.objects.create(
            company=self.company, bank_name='ملت', account_title='حساب جاری',
            account_number='1234567890', sheba_number='IR120170000000000000000001',
            opening_balance=Decimal('1000000'), opening_balance_date='1405/01/01', is_primary=True,
        )
        inv = self.make_invoice(status='paid')
        InvoicePayment.objects.create(
            invoice=inv, amount=Decimal('2000'), payment_date_shamsi='1405/08/01',
            tracking_code='R47T-BNK1', method='transfer', company_bank_account=bank,
            created_by=self.admin,
        )

        accountant = self.member('r47_accountant', ['perm_accounting_reports', 'perm_invoice_record'], section=self.sec)
        r = accountant.get(f'{REPORTS}bank-payments/')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        bank_row = next(x for x in data['rows'] if x['bank_account_id'] == bank.id)
        self.assertEqual(bank_row['account_number'], '******7890')
        self.assertTrue(bank_row['sheba_number'].startswith('******'))
        self.assertTrue(bank_row['sheba_number'].endswith('0001'))
        self.assertEqual(bank_row['sheba_number'], '*' * (len(bank.sheba_number) - 4) + '0001')
        detail_row = data['details']['results'][0]
        self.assertEqual(detail_row['sheba_number'], '*' * (len(bank.sheba_number) - 4) + '0001')

        disburser_user = User.objects.create_user(username='r47_disburser', password='x')
        UserCompanyAccess.objects.create(user=disburser_user, company=self.company, is_default=True)
        grant_section_perms(disburser_user, ['perm_accounting_reports', 'perm_invoice_record', 'perm_treasury_disburse_action'], company=self.company)
        c_disb = APIClient()
        c_disb.force_authenticate(disburser_user)
        c_disb.credentials(HTTP_X_COMPANY_ID=str(self.company.id))

        r_full = c_disb.get(f'{REPORTS}bank-payments/')
        self.assertEqual(r_full.status_code, 200, r_full.content)
        data_full = r_full.json()
        bank_row_full = next(x for x in data_full['rows'] if x['bank_account_id'] == bank.id)
        self.assertEqual(bank_row_full['account_number'], '1234567890')
        self.assertEqual(bank_row_full['sheba_number'], 'IR120170000000000000000001')
        detail_row_full = data_full['details']['results'][0]
        self.assertEqual(detail_row_full['sheba_number'], 'IR120170000000000000000001')
