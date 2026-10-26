"""
طرح ۳.۵ (ب): تست‌های سناریویی مجوزهای حسابداری برای ۵ نقش در سطح سکشن و طرف‌حساب.
اجرا: PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py test personnel.test_permissions_api_35 --keepdb --noinput
"""

from accounts.scoped_permissions import can, clear_scoped_permission_cache
from companies.models import UserCompanyAccess
from companies.testing import grant_membership
from personnel.models import ExpenseInvoice, Project, ProjectSection
from personnel.scoped_test_support import grant_section_perms
from personnel.test_expense_heads_34 import HeadFixtures, INVOICES

ROLES = ['employee', 'supervisor', 'accountant', 'manager', 'treasury']

ROLE_BUNDLES = {
    'employee': {
        'perm_invoice_record',
    },
    'supervisor': {
        'perm_invoice_record',
        'perm_invoice_approve',
    },
    'accountant': {
        'perm_invoice_record',
        'perm_invoice_review',
        'perm_counterparty_manage',
    },
    'manager': {
        'perm_invoice_record',
        'perm_manager_payment_authorize',
    },
    'treasury': {
        'perm_invoice_record',
        'perm_treasury_disburse_action',
        'perm_counterparty_manage',
    },
}

TESTED_CODES = [
    'perm_invoice_record',
    'perm_invoice_approve',
    'perm_invoice_review',
    'perm_manager_payment_authorize',
    'perm_treasury_disburse_action',
    'perm_counterparty_manage',
]


class AccountingPermissionsApi35Tests(HeadFixtures):
    def setUp(self):
        super().setUp()
        self.sec_b = ProjectSection.objects.create(
            project=self.sec.project, code='P35-B', name='B'
        )
        self.proj_other = Project.objects.create(
            company=self.other, code='P35-O', name='O'
        )
        self.sec_other = ProjectSection.objects.create(
            project=self.proj_other, code='P35-OS', name='OS'
        )

        self.users = {}
        for role in ROLES:
            u = self.user(f'p35_{role}', {})
            grant_section_perms(u, [], section=self.sec, role=role, exact=False)
            clear_scoped_permission_cache(u)
            self.users[role] = u

    def test_role_matrix_in_section_a(self):
        for role in ROLES:
            user = self.users[role]
            for code in TESTED_CODES:
                with self.subTest(role=role, code=code):
                    expected = code in ROLE_BUNDLES[role]
                    self.assertEqual(can(user, code, self.sec), expected)

    def test_no_assignment_in_section_b_denies_all(self):
        for role in ROLES:
            user = self.users[role]
            for code in TESTED_CODES:
                with self.subTest(role=role, code=code):
                    self.assertFalse(can(user, code, self.sec_b))

    def test_invoice_post_by_assignment(self):
        emp_a = self.users['employee']
        c_a = self.client_for(emp_a)
        body_a = self.invoice_body(expense_head=self.head.id, invoice_number='INV-P35-A')
        res_a = c_a.post(INVOICES, body_a, format='json')
        self.assertEqual(res_a.status_code, 201)

        emp_b = self.user('p35_emp_b', {})
        grant_section_perms(emp_b, [], section=self.sec_b, role='employee', exact=False)
        clear_scoped_permission_cache(emp_b)

        c_b = self.client_for(emp_b)
        body_b = self.invoice_body(expense_head=self.head.id, invoice_number='INV-P35-B-FAIL')
        count_before = ExpenseInvoice.objects.count()
        res_b = c_b.post(INVOICES, body_b, format='json')
        self.assertIn(res_b.status_code, (400, 403))
        self.assertEqual(ExpenseInvoice.objects.count(), count_before)

    def test_counterparty_full_view_by_role(self):
        # The manager bundle has perm_approve_personnel_manager, an org-structure write permission, and an
        # org-structure writer sees full counterparty data (rule from plan 3.1 s4), so only employee and supervisor are masked.
        url = f'/api/personnel/counterparties/{self.cp.id}/'
        for role in ROLES:
            user = self.users[role]
            with self.subTest(role=role):
                c = self.client_for(user)
                res = c.get(url)
                self.assertEqual(res.status_code, 200)
                if role in ('accountant', 'treasury', 'manager'):
                    self.assertEqual(res.data.get('bank_masked'), False)
                else:
                    self.assertEqual(res.data.get('bank_masked'), True)

    def test_counterparty_patch_by_role(self):
        url = f'/api/personnel/counterparties/{self.cp.id}/'
        c_acc = self.client_for(self.users['accountant'])
        res_acc = c_acc.patch(url, {'phone': '09120000000'}, format='json')
        self.assertEqual(res_acc.status_code, 200)

        c_sup = self.client_for(self.users['supervisor'])
        res_sup = c_sup.patch(url, {'phone': '09120000000'}, format='json')
        self.assertEqual(res_sup.status_code, 403)

    def test_counterparty_manage_in_other_company_is_not_enough(self):
        acc_other = self.user('p35_acc_other', {})
        grant_section_perms(acc_other, [], section=self.sec_other, role='accountant', exact=False)
        grant_membership(acc_other, self.company)
        UserCompanyAccess.objects.update_or_create(
            user=acc_other, company=self.company,
            defaults={'is_default': True, 'section_levels': {}}
        )
        clear_scoped_permission_cache(acc_other)

        url = f'/api/personnel/counterparties/{self.cp.id}/'
        c = self.client_for(acc_other)
        res_get = c.get(url)
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.data.get('bank_masked'), True)

        res_patch = c.patch(url, {'phone': '09120000000'}, format='json')
        self.assertEqual(res_patch.status_code, 403)
