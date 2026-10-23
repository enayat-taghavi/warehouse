from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APITestCase
from rest_framework import status
from settings_core.models import SystemSetting
from .models import Warehouse

User = get_user_model()


class SettingsTestHelper:
    """Helper methods for creating users with specific permissions for settings tests."""

    @staticmethod
    def create_user(username='testuser', password='password123', is_superuser=False, perms=None):
        user = User.objects.create_user(
            username=username,
            password=password,
            is_superuser=is_superuser,
            is_staff=is_superuser,
        )
        if perms:
            for perm_codename in perms:
                try:
                    perm = Permission.objects.get(codename=perm_codename)
                    user.user_permissions.add(perm)
                except Permission.DoesNotExist:
                    content_type = ContentType.objects.get_for_model(User)
                    perm = Permission.objects.create(
                        codename=perm_codename,
                        name=f"Can {perm_codename}",
                        content_type=content_type
                    )
                    user.user_permissions.add(perm)
        return user


class GlobalSettingsSmokeTests(APITestCase):
    """Smoke and baseline unit tests for global settings endpoints."""

    def setUp(self):
        self.endpoint = '/api/settings/global/'
        self.normal_user = SettingsTestHelper.create_user('regular_user')
        self.admin_user = SettingsTestHelper.create_user('admin_user', is_superuser=True)
        self.settings_manager = SettingsTestHelper.create_user(
            'manager_user',
            perms=['perm_sys_settings']
        )

    def test_settings_endpoint_reachable_for_authenticated_user(self):
        """GET /api/settings/global/ returns 200 for authenticated users."""
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.get(self.endpoint)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, dict)

    def test_settings_endpoint_rejects_anonymous_user(self):
        """GET /api/settings/global/ rejects unauthenticated requests with 401."""
        response = self.client.get(self.endpoint)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_settings_post_forbidden_without_perm(self):
        """POST /api/settings/global/ returns 403 for user lacking perm_sys_settings."""
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.post(self.endpoint, {'system_version': '2.0'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_settings_post_allowed_for_superuser(self):
        """POST /api/settings/global/ succeeds for superuser."""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(self.endpoint, {'system_version': '1.5'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'success')
        self.assertTrue(SystemSetting.objects.filter(key='system_version').exists())

    def test_settings_post_allowed_for_manager_with_perm(self):
        """POST /api/settings/global/ succeeds for user with accounts.perm_sys_settings."""
        self.client.force_authenticate(user=self.settings_manager)
        response = self.client.post(self.endpoint, {'offline_sync_interval_minutes': 25}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'success')
        self.assertTrue(SystemSetting.objects.filter(key='offline_sync_interval_minutes').exists())

    def test_settings_validation_rejects_string_for_ttl_and_bool_for_int(self):
        """Item 1-4: offline_cache_ttl_minutes rejects string 'abc' and bool True is rejected for int."""
        self.client.force_authenticate(user=self.admin_user)
        
        # Test 'abc' in ttl
        response = self.client.post(self.endpoint, {'offline_cache_ttl_minutes': 'abc'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('offline_cache_ttl_minutes', response.data.get('invalid_keys', []))

        # Test True (boolean) sent to integer field
        response = self.client.post(self.endpoint, {'offline_sync_interval_minutes': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('offline_sync_interval_minutes', response.data.get('invalid_keys', []))

    def test_settings_validation_for_enums_and_booleans(self):
        """Item 1-4: Validates conflict strategies, camera presets, and booleans."""
        self.client.force_authenticate(user=self.admin_user)

        # Invalid conflict strategy
        response = self.client.post(self.endpoint, {'default_conflict_strategy': 'destroy_all'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('default_conflict_strategy', response.data.get('invalid_keys', []))

        # Non-boolean for boolean key
        response = self.client.post(self.endpoint, {'require_supervisor_approval': 'yes'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('require_supervisor_approval', response.data.get('invalid_keys', []))

        # Valid payload with 0 ttl (never expire) and valid booleans
        valid_payload = {
            'offline_cache_ttl_minutes': 0,
            'default_conflict_strategy': 'replace',
            'require_supervisor_approval': False,
            'scanner_custom_interval_ms': 120,
            'scanner_custom_roi_size': 900,
        }
        response = self.client.post(self.endpoint, valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_etag_header_and_optimistic_locking(self):
        """Item 2-5: Tests ETag generation and 412 on If-Match mismatch."""
        self.client.force_authenticate(user=self.admin_user)

        get_resp = self.client.get(self.endpoint)
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        etag = get_resp.get('ETag')
        self.assertIsNotNone(etag)

        # Post with matching ETag
        post_resp = self.client.post(
            self.endpoint,
            {'system_version': '3.0'},
            format='json',
            HTTP_IF_MATCH=etag
        )
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK)

        # Post with outdated/mismatched ETag returns 412 Precondition Failed
        post_conflict = self.client.post(
            self.endpoint,
            {'system_version': '3.1'},
            format='json',
            HTTP_IF_MATCH='"outdated_etag_123"'
        )
        self.assertEqual(post_conflict.status_code, status.HTTP_412_PRECONDITION_FAILED)
        self.assertEqual(post_conflict.data.get('code'), 'CONCURRENT_MODIFICATION')


class CascadeSettingsTests(APITestCase):
    """
    فاز ۱ §۱.۳ — بازسازی رفتار CASCADE. پیش از فاز ۱، `SystemSetting.warehouse`
    یک FK با `on_delete=CASCADE` بود؛ اکنون `warehouse_id` عددی ساده است و
    سیگنال `post_delete` ثبت‌شده از سمت `wh-warehouse` حذف آبشاری را بازتولید
    می‌کند. این تست تضمین می‌کند حذف انبار تنظیماتِ متعلق به آن را هم پاک کند.
    """

    def setUp(self):
        self.wh = Warehouse.objects.create(
            name='انبار تست', code='CASCADE-TEST',
        )
        # یک تنظیم سراسری (نباید حذف شود) و یک override انباری.
        self.global_setting = SystemSetting.objects.create(
            key='system_version', value='1.0', warehouse_id=None
        )
        self.wh_setting = SystemSetting.objects.create(
            key='system_version', value='9.9', warehouse_id=self.wh.id
        )

    def test_warehouse_delete_purges_its_settings_but_keeps_global(self):
        wh_id = self.wh.id  # پس از delete، Django `instance.pk` را None می‌کند
        before_keys = set(SystemSetting.objects.values_list('warehouse_id', flat=True))
        self.assertIn(wh_id, before_keys)

        self.wh.delete()

        self.assertFalse(
            SystemSetting.objects.filter(warehouse_id=wh_id).exists(),
            "تنظیمات override انبار پس از حذف انبار باید پاک شوند."
        )
        self.assertTrue(
            SystemSetting.objects.filter(key='system_version', warehouse_id__isnull=True).exists(),
            "تنظیمات سراسری نباید با حذف یک انبار حذف شوند."
        )
