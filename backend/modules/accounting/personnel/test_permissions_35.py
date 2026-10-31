# -*- coding: utf-8 -*-
"""
طرح ۳.۵ (ص۴ تا ص۶): فهرست نهایی ۲۱ مجوز حسابداری، بستهٔ پنج نقش و نبود کدهای حذف‌شده در کد ماژول.
کدهای حذف‌شده فقط از REMOVED_PERMISSION_CODENAMES خوانده می‌شوند تا این فایل خودش در پویش نیاید.
"""
import importlib.util
import re
from pathlib import Path

from django.test import SimpleTestCase, TestCase

from accounts.scoped_permissions import default_bundles, permission_specs
REPO = Path(__file__).resolve().parents[4]
# module.py بسته نیست؛ مثل module_catalog از مسیر فایل بارگذاری می‌شود
_spec = importlib.util.spec_from_file_location('_p35_accounting_manifest', REPO / 'backend/modules/accounting/module.py')
_manifest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_manifest)
ACCOUNTING_PERMISSION_CATEGORIES = _manifest.ACCOUNTING_PERMISSION_CATEGORIES
ACCOUNTING_PERMISSION_CODENAMES = _manifest.ACCOUNTING_PERMISSION_CODENAMES
ACCOUNTING_PERMISSIONS = _manifest.ACCOUNTING_PERMISSIONS
ACCOUNTING_SPEC = _manifest.ACCOUNTING_SPEC
REMOVED_PERMISSION_CODENAMES = _manifest.REMOVED_PERMISSION_CODENAMES

REMOVED = tuple(REMOVED_PERMISSION_CODENAMES)

# جدول ص۴: {کد: (دسته، نقش‌های بسته)}
E, S, A, M, T = 'employee', 'supervisor', 'accountant', 'manager', 'treasury'
EXPECTED = {
    'view_sys_personnel_attendance': ('attendance', {E, S}),
    'view_sys_fleet_attendance': ('attendance', {E, S}),
    'view_sys_personnel': ('personnel', {M}),
    'perm_delete_personnel_nomovement': ('personnel', {M}),
    'perm_delete_vehicle_nomovement': ('personnel', {M}),
    'perm_approve_personnel_supervisor': ('approvals', {S}),
    'perm_approve_fleet_supervisor': ('approvals', {S}),
    'perm_approve_personnel_finance': ('approvals', {A}),
    'perm_approve_fleet_finance': ('approvals', {A}),
    'perm_approve_personnel_manager': ('approvals', {M}),
    'perm_approve_fleet_manager': ('approvals', {M}),
    'perm_lock_work_period': ('approvals', {S, M}),
    # د۲ طرح ۴.۴: گردش کارکرد ماهانه
    'perm_approve_attendance_supervisor': ('approvals', {S}),
    'perm_approve_attendance_finance': ('approvals', {A}),
    'perm_approve_attendance_manager': ('approvals', {M}),
    'view_sys_payroll': ('payroll', {A, M}),
    'view_sys_fleet_settlement': ('payroll', {A, M}),
    'perm_manager_payment_authorize': ('treasury', {M}),
    'perm_treasury_disburse_action': ('treasury', {T}),
    'perm_invoice_record': ('invoices', {E, S, A, M, T}),
    'perm_invoice_approve': ('invoices', {S}),
    'perm_invoice_review': ('invoices', {A}),
    'perm_petty_cash_manage': ('petty_cash', {S, A, M, T}),
    'perm_counterparty_manage': ('counterparties', {A, T}),
    # د۳ طرح ۴.۷
    'perm_accounting_reports': ('reports', {A, M}),
}


class AccountingCatalog35Tests(SimpleTestCase):
    def test_catalog_is_the_21_codes_of_the_table(self):
        declared = {p['code']: p for p in ACCOUNTING_PERMISSIONS}
        self.assertEqual(set(declared), set(EXPECTED))
        self.assertEqual(set(ACCOUNTING_PERMISSION_CODENAMES), set(EXPECTED))
        for code, (category, roles) in EXPECTED.items():
            self.assertEqual(declared[code]['category'], category, code)
            self.assertEqual(set(declared[code]['defaults']), roles, code)
            self.assertEqual(declared[code]['scope'], 'section', code)

    def test_categories_have_a_menu_and_no_work_roles(self):
        keys = {c['key'] for c in ACCOUNTING_PERMISSION_CATEGORIES}
        self.assertNotIn('work_roles', keys)
        self.assertEqual(keys, {cat for cat, _ in EXPECTED.values()})
        for cat in ACCOUNTING_PERMISSION_CATEGORIES:
            self.assertTrue(cat['menu'], cat['key'])

    def test_removed_codes_absent_and_mapped_to_declared_codes(self):
        self.assertEqual(len(REMOVED), 5)
        markers = {m.split('.', 1)[1] for m in ACCOUNTING_SPEC.permission_markers}
        for code, replacements in REMOVED_PERMISSION_CODENAMES.items():
            self.assertNotIn(code, EXPECTED)
            self.assertNotIn(code, markers)
            self.assertTrue(replacements)
            self.assertTrue(set(replacements) <= set(EXPECTED), code)
        self.assertTrue({'perm_invoice_approve', 'perm_invoice_review', 'perm_counterparty_manage'} <= markers)


class AccountingBundles35Tests(TestCase):
    def test_default_bundles_equal_the_table(self):
        bundles = default_bundles()
        specs = permission_specs()
        for role in (E, S, A, M, T):
            got = {c for c in bundles.get(role, ()) if specs.get(c, {}).get('module') == 'accounting'}
            want = {code for code, (_, roles) in EXPECTED.items() if role in roles}
            self.assertEqual(got, want, role)
            self.assertFalse(set(REMOVED) & set(bundles.get(role, ())), role)

    def test_removed_codes_not_in_catalog(self):
        self.assertFalse(set(REMOVED) & set(permission_specs()))


def _scan(root, patterns, skip):
    word = re.compile(r'\b(' + '|'.join(REMOVED) + r')\b')
    hits = []
    for pattern in patterns:
        for path in root.rglob(pattern):
            if skip(path):
                continue
            for n, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                if word.search(line):
                    hits.append(f'{path.relative_to(REPO)}:{n}')
    return hits


class RemovedCodesScan35Tests(SimpleTestCase):
    def test_backend_accounting_has_no_removed_code(self):
        root = REPO / 'backend' / 'modules' / 'accounting'
        hits = _scan(root, ('*.py',), lambda p: 'migrations' in p.parts or p.name == 'module.py')
        self.assertEqual(hits, [])

    def test_frontend_accounting_has_no_removed_code(self):
        root = REPO / 'frontend' / 'src' / 'app' / 'modules' / 'accounting'
        hits = _scan(root, ('*.ts', '*.html'), lambda p: p.name.endswith('.spec.ts'))
        self.assertEqual(hits, [])
