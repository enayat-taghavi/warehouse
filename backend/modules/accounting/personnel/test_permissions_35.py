# -*- coding: utf-8 -*-
"""
طرح ۳.۵ (ص۴ تا ص۷): فهرست نهایی ۲۱ مجوز حسابداری، بستهٔ پنج نقش، نبود کدهای حذف‌شده در کد ماژول و
انتقال افزودنی تفاوت‌ها و مرحله‌های باز گردش در migration personnel/0013.
کدهای حذف‌شده فقط از REMOVED_PERMISSION_CODENAMES خوانده می‌شوند تا این فایل خودش در پویش نیاید.
"""
import importlib
import importlib.util
import re
from decimal import Decimal
from pathlib import Path

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import SimpleTestCase, TestCase

from accounts.models import RoleBundleOverride, UserPermissionOverride
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

User = get_user_model()
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
    'view_sys_payroll': ('payroll', {A, M}),
    'view_sys_fleet_settlement': ('payroll', {A, M}),
    'perm_manager_payment_authorize': ('treasury', {M}),
    'perm_treasury_disburse_action': ('treasury', {T}),
    'perm_invoice_record': ('invoices', {E, S, A, M, T}),
    'perm_invoice_approve': ('invoices', {S}),
    'perm_invoice_review': ('invoices', {A}),
    'perm_petty_cash_manage': ('petty_cash', {S, A, M, T}),
    'perm_counterparty_manage': ('counterparties', {A, T}),
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


class Migration0013Tests(TestCase):
    """تابع migration مستقیم روی دادهٔ نمونه اجرا می‌شود (ص۶)؛ هیچ ردیفی حذف نمی‌شود."""

    def setUp(self):
        self.migration = importlib.import_module('personnel.migrations.0013_accounting_permissions_35')
        ct = ContentType.objects.get_for_model(User)
        self.old = {code: Permission.objects.get_or_create(content_type=ct, codename=code,
                                                           defaults={'name': code})[0] for code in REMOVED}
        self.supervisor_marker, self.accountant_marker = REMOVED[1], REMOVED[2]

    def _run(self):
        self.migration.forwards(django_apps, None)

    def test_role_bundle_overrides_copied_without_deleting(self):
        RoleBundleOverride.objects.create(role_key='employee', permission=self.old[self.accountant_marker], mode='add')
        RoleBundleOverride.objects.create(role_key='accountant', permission=self.old[self.accountant_marker],
                                          mode='remove')
        before = RoleBundleOverride.objects.count()
        self._run()
        self._run()  # idempotent
        added = set(RoleBundleOverride.objects.filter(role_key='employee', mode='add')
                    .values_list('permission__codename', flat=True))
        self.assertTrue(set(REMOVED_PERMISSION_CODENAMES[self.accountant_marker]) <= added)
        removed = set(RoleBundleOverride.objects.filter(role_key='accountant', mode='remove')
                      .values_list('permission__codename', flat=True))
        # برداشتن نشانه فقط کارهای انحصاری‌اش را برمی‌دارد، نه تأیید مالی که همیشه جدا هم باز بود
        self.assertEqual(removed, {self.accountant_marker, 'perm_invoice_review', 'perm_counterparty_manage'})
        self.assertEqual(RoleBundleOverride.objects.count(), before + 4 + 2)

    def test_user_override_copied_with_company_and_existing_choice_wins(self):
        from personnel.models import Company
        company = Company.objects.create(code='P35', name='شرکت ۳۵', is_active=True)
        user = User.objects.create_user(username='p35_user', password='x')
        UserPermissionOverride.objects.create(user=user, permission=self.old[self.supervisor_marker],
                                              company=company, mode='add')
        approve = Permission.objects.get(codename='perm_invoice_approve')
        UserPermissionOverride.objects.create(user=user, permission=approve, company=company, mode='remove')
        self._run()
        rows = {r.permission.codename: r.mode for r in UserPermissionOverride.objects.filter(user=user, company=company)}
        self.assertEqual(rows['perm_approve_personnel_supervisor'], 'add')
        self.assertEqual(rows['perm_approve_fleet_supervisor'], 'add')
        self.assertEqual(rows['perm_invoice_approve'], 'remove')
        self.assertEqual(rows[self.supervisor_marker], 'add')

    def test_open_invoice_step_permission_repointed(self):
        from personnel.models import Counterparty, ExpenseInvoice, Project, ProjectSection, Company
        from personnel.workflows import INVOICE_WORKFLOW
        from workflow import engine as wf_engine
        from workflow.models import WorkflowTask
        company = Company.objects.create(code='P35W', name='شرکت گردش', is_active=True)
        project = Project.objects.create(company=company, code='P35W-P', name='پروژه')
        section = ProjectSection.objects.create(project=project, code='P35W-S', name='بخش')
        creator = User.objects.create_user(username='p35_creator', password='x')
        cp = Counterparty.objects.create(company=company, name='طرف', counterparty_type='other')
        inv = ExpenseInvoice.objects.create(
            section=section, counterparty=cp, invoice_number='P35-1', invoice_date_shamsi='1404/05/01',
            amount=Decimal('1000'), description='d', status='draft', created_by=creator,
        )
        wf_engine.submit(INVOICE_WORKFLOW, inv, creator)
        task = WorkflowTask.objects.get(instance__entity_id=inv.pk, is_open=True, track='step')
        new_code = task.permission
        old_code = {v: k for k, v in self.migration.STEP_PERMISSION_MAP.items()}[new_code]
        self.assertIn(old_code, REMOVED)
        WorkflowTask.objects.filter(pk=task.pk).update(permission=old_code)
        self._run()
        task.refresh_from_db()
        self.assertEqual(task.permission, new_code)
