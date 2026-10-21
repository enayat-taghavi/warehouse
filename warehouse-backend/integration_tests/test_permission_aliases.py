"""
گام ۸ ماژولارسازی: ارجاع بین‌ماژولی مجوز با alias مجوز جایگزین شد.

در نصب کامل هر توانایی همان کدهای قبلی را می‌دهد و چک‌های تبدیل‌شده همان نتیجهٔ پیشین را دارند.
"""
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from accounts.models import CustomUser
from platform_core.registry import (
    expand_permission_aliases, has_permission_alias, installed_modules, permission_alias, permission_aliases,
)

FULL_INSTALL = {'accounting', 'warehouse'}.issubset(set(installed_modules()))


class PermissionAliasRegistryTests(TestCase):
    def test_capabilities_resolve_to_previous_codes_in_full_install(self):
        if not FULL_INSTALL:
            self.skipTest('needs accounting + warehouse')
        self.assertEqual(permission_aliases('manager_approver'), ('can_act_as_manager',))
        self.assertEqual(permission_aliases('supervisor_approver'), ('view_sys_supervisor',))
        self.assertEqual(permission_aliases('count_supervisor_exclusion'), ('can_act_as_workshop_supervisor',))

    def test_expand_keeps_plain_codes_and_order(self):
        if not FULL_INSTALL:
            self.skipTest('needs accounting + warehouse')
        from personnel.lifecycle_services import MANAGER_STAGE_PERMS, SUPERVISOR_STAGE_PERMS
        from personnel.fleet_lifecycle_services import FLEET_MANAGER_STAGE_PERMS, FLEET_WORKFLOW_STAGE_PERMS
        self.assertEqual(expand_permission_aliases(MANAGER_STAGE_PERMS),
                         ('perm_approve_personnel_manager', 'can_act_as_manager', 'can_act_as_company_manager'))
        self.assertEqual(expand_permission_aliases(SUPERVISOR_STAGE_PERMS),
                         ('perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor',
                          'perm_approve_personnel_manager', 'can_act_as_manager'))
        self.assertEqual(expand_permission_aliases(FLEET_MANAGER_STAGE_PERMS),
                         ('perm_approve_fleet_manager', 'can_act_as_manager', 'can_act_as_company_manager'))
        self.assertEqual(expand_permission_aliases(FLEET_WORKFLOW_STAGE_PERMS['change_request_finance_approved']),
                         ('perm_approve_fleet_manager', 'can_act_as_manager', 'can_act_as_company_manager'))

    def test_unknown_capability_expands_to_nothing(self):
        self.assertEqual(expand_permission_aliases(('perm_x', permission_alias('no_such_capability'))), ('perm_x',))


class PermissionAliasBehaviourTests(TestCase):
    """رفتار چک‌های تبدیل‌شده برای کاربری که فقط نقش سازگاری مدیر (مالک: انبار) را دارد."""

    def setUp(self):
        if not FULL_INSTALL:
            self.skipTest('needs accounting + warehouse')
        self.ct = ContentType.objects.get_for_model(CustomUser)

    def _user(self, username, *codenames):
        user = CustomUser.objects.create_user(username=username, password='x')
        for code in codenames:
            user.user_permissions.add(Permission.objects.get(codename=code, content_type=self.ct))
        return CustomUser.objects.get(pk=user.pk)

    def test_legacy_manager_still_approves_manager_stages(self):
        from personnel.lifecycle_services import user_has_any_perm, MANAGER_STAGE_PERMS, SUPERVISOR_STAGE_PERMS, FINANCE_STAGE_PERMS
        from personnel.fleet_lifecycle_services import FLEET_MANAGER_STAGE_PERMS
        manager = self._user('alias_legacy_manager', 'can_act_as_manager')
        self.assertTrue(has_permission_alias(manager, 'manager_approver'))
        self.assertTrue(user_has_any_perm(manager, MANAGER_STAGE_PERMS))
        self.assertTrue(user_has_any_perm(manager, SUPERVISOR_STAGE_PERMS))
        self.assertTrue(user_has_any_perm(manager, FLEET_MANAGER_STAGE_PERMS))
        self.assertFalse(user_has_any_perm(manager, FINANCE_STAGE_PERMS))
        plain = self._user('alias_plain_user', 'view_sys_users')
        self.assertFalse(has_permission_alias(plain, 'manager_approver'))
        self.assertFalse(user_has_any_perm(plain, MANAGER_STAGE_PERMS))

    def test_manager_stage_recipients_include_legacy_manager(self):
        from personnel.lifecycle_services import _workflow_recipient_ids
        from companies.models import Company, UserCompanyAccess
        company = Company.objects.create(code='ALIAS-C1', name='alias company')
        manager = self._user('alias_recipient_manager', 'can_act_as_manager')
        other = self._user('alias_recipient_other', 'view_sys_users')
        for user in (manager, other):
            UserCompanyAccess.objects.create(user=user, company=company, access_level='workspace_full')
        recipients = _workflow_recipient_ids('pending_manager', company.id, None, None)
        self.assertIn(manager.id, recipients)
        self.assertNotIn(other.id, recipients)

    def test_workshop_supervisor_is_not_count_supervisor(self):
        from warehouses.role_resolver import resolve_warehouse_roles
        count_sup = self._user('alias_count_sup', 'view_sys_supervisor')
        workshop_sup = self._user('alias_workshop_sup', 'view_sys_supervisor', 'can_act_as_workshop_supervisor')
        self.assertIn('warehouse_supervisor', resolve_warehouse_roles(count_sup))
        self.assertNotIn('warehouse_supervisor', resolve_warehouse_roles(workshop_sup))
