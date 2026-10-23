"""
گام ۷ ماژولارسازی: مجوزهای سفارشی ماژول‌ها از module.py خودشان اعلام و در post_migrate ساخته می‌شوند.
"""
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, RequestFactory

from accounts.models import CustomUser
from accounts.module_permissions import create_module_permissions
from accounts.permissions import any_menu_access
from platform_core.module_catalog import MODULE_PERMISSIONS, MODULE_PERMISSION_CODENAMES, installed_module_permissions
from platform_core.registry import installed_modules


class ModulePermissionDeclarationTests(TestCase):
    def test_meta_has_no_module_permission(self):
        meta_codes = {code for code, _ in CustomUser._meta.permissions}
        for module_code, perms in MODULE_PERMISSIONS.items():
            overlap = meta_codes & {code for code, _ in perms}
            self.assertFalse(overlap, f'{module_code}: {sorted(overlap)} still in CustomUser.Meta')

    def test_custom_permissions_are_part_of_module_codenames(self):
        for module_code, perms in MODULE_PERMISSIONS.items():
            for codename, name in perms:
                self.assertIn(codename, MODULE_PERMISSION_CODENAMES[module_code])
                self.assertTrue(name)

    def test_installed_module_permissions_exist_after_migrate(self):
        content_type = ContentType.objects.get_for_model(CustomUser)
        declared = installed_module_permissions()
        installed = set(installed_modules())
        expected = sum(len(p) for code, p in MODULE_PERMISSIONS.items() if code in installed)
        self.assertEqual(len(declared), expected)
        existing = dict(Permission.objects.filter(content_type=content_type).values_list('codename', 'name'))
        for codename, name in declared:
            self.assertIn(codename, existing)

    def test_handler_is_create_only_and_idempotent(self):
        self.assertEqual(create_module_permissions(verbosity=0), 0)
        declared = installed_module_permissions()
        if not declared:
            return
        codename, name = declared[0]
        content_type = ContentType.objects.get_for_model(CustomUser)
        perm = Permission.objects.get(codename=codename, content_type=content_type)
        # نام تغییر‌یافتهٔ ردیف موجود دست نمی‌خورد (همان رفتار create_permissions جنگو)
        perm.name = 'نام دستی'
        perm.save()
        self.assertEqual(create_module_permissions(verbosity=0), 0)
        perm.refresh_from_db()
        self.assertEqual(perm.name, 'نام دستی')
        # ردیف نبوده دوباره ساخته می‌شود
        perm.delete()
        self.assertEqual(create_module_permissions(verbosity=0), 1)
        self.assertEqual(Permission.objects.get(codename=codename, content_type=content_type).name, name)


class AnyMenuAccessTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.content_type = ContentType.objects.get_for_model(CustomUser)
        self.user = CustomUser.objects.create_user(username='step7_menu_user', password='x')

    def _request(self):
        request = self.factory.get('/')
        request.user = CustomUser.objects.get(pk=self.user.pk)
        return request

    def test_or_of_all_codenames(self):
        perm = any_menu_access('view_sys_users', 'perm_sys_logs', 'view_sys_users')
        self.assertFalse(perm.has_permission(self._request(), None))
        self.user.user_permissions.add(Permission.objects.get(codename='perm_sys_logs', content_type=self.content_type))
        self.assertTrue(perm.has_permission(self._request(), None))

    def test_single_codename(self):
        perm = any_menu_access('view_sys_users')
        self.assertFalse(perm.has_permission(self._request(), None))
