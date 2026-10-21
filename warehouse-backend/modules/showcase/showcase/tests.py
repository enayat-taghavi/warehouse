from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import CustomUser


class ShowcaseModuleTests(TestCase):
    """فقط در پروفایل دارای ماژول نمایشی اجرا می‌شود (WH_MODULES=…,showcase)"""

    def test_module_registered_in_catalog_as_opt_in(self):
        from platform_core.module_catalog import MODULE_CATALOG, default_module_codes
        self.assertIn('showcase', MODULE_CATALOG)
        self.assertTrue(MODULE_CATALOG['showcase'].opt_in)
        self.assertNotIn('showcase', default_module_codes())

    def test_module_registered_in_registry(self):
        from platform_core.registry import get_module
        spec = get_module('showcase')
        self.assertIsNotNone(spec)
        self.assertEqual(spec.code, 'showcase')

    def test_module_permission_created_without_core_change(self):
        content_type = ContentType.objects.get_for_model(CustomUser)
        self.assertTrue(Permission.objects.filter(codename='view_showcase_hub', content_type=content_type).exists())

    def test_hub_requires_module_permission(self):
        user = CustomUser.objects.create_user(username='showcase_tester', password='x')
        client = APIClient()
        client.force_authenticate(user=user)
        self.assertEqual(client.get('/api/showcase/hub/').status_code, 403)
        user.user_permissions.add(Permission.objects.get(codename='view_showcase_hub'))
        user = CustomUser.objects.get(pk=user.pk)
        client.force_authenticate(user=user)
        response = client.get('/api/showcase/hub/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('showcase', response.json()['installed_modules'])
