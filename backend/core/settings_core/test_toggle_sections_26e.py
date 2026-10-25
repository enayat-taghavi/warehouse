import unittest
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.cache import cache
from rest_framework.test import APITestCase

import platform_core.registry
from settings_core.models import SystemSetting
from settings_core.services import clear_setting_cache


class ToggleSections26eTests(APITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.patcher = patch.dict(
            platform_core.registry._CONTRIBUTIONS,
            {'toggle_sections': [('zz.alpha', 'Alpha'), ('zz.beta', 'Beta')]},
        )
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.addCleanup(cache.clear)

        User = get_user_model()
        self.superuser = User.objects.create_superuser(
            username='admin_toggle_26e',
            email='admin_toggle_26e@example.com',
            password='password123',
        )
        self.user_p = User.objects.create_user(
            username='user_p_toggle_26e',
            email='user_p_toggle_26e@example.com',
            password='password123',
            is_active=True,
        )
        perm = Permission.objects.filter(
            codename='perm_sys_settings',
            content_type__app_label='accounts',
        ).first() or Permission.objects.get(codename='perm_sys_settings')
        self.user_p.user_permissions.add(perm)
        self.user_p = User.objects.get(pk=self.user_p.pk)

    def test_superuser_can_disable_declared_section(self):
        self.client.force_authenticate(user=self.superuser)
        resp = self.client.post(
            '/api/settings/global/',
            {'disabled_sections': ['zz.alpha']},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)

        self.client.force_authenticate(user=None)
        pub_resp = self.client.get('/api/public/config/')
        self.assertEqual(pub_resp.status_code, 200)
        self.assertEqual(pub_resp.json().get('disabled_sections'), ['zz.alpha'])

    def test_undeclared_code_rejected(self):
        self.client.force_authenticate(user=self.superuser)
        resp = self.client.post(
            '/api/settings/global/',
            {'disabled_sections': ['zz.nope']},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('disabled_sections', resp.json().get('invalid_keys', []))

    def test_wrong_shape_rejected(self):
        self.client.force_authenticate(user=self.superuser)
        for payload in [
            {'disabled_sections': 'zz.alpha'},
            {'disabled_sections': ['zz.alpha', 'zz.alpha']},
            {'disabled_sections': [1]},
        ]:
            resp = self.client.post('/api/settings/global/', payload, format='json')
            self.assertEqual(resp.status_code, 400, f"Payload {payload} did not return 400")
            self.assertIn('disabled_sections', resp.json().get('invalid_keys', []))

    def test_non_superuser_cannot_change(self):
        self.client.force_authenticate(user=self.user_p)
        resp = self.client.post(
            '/api/settings/global/',
            {'disabled_sections': ['zz.alpha']},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(SystemSetting.objects.filter(key='disabled_sections').exists())

    def test_non_superuser_unchanged_value_allowed(self):
        self.client.force_authenticate(user=self.user_p)
        resp = self.client.post(
            '/api/settings/global/',
            {'disabled_sections': []},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)

    def test_public_config_toggle_sections_only_for_superuser(self):
        self.client.force_authenticate(user=None)
        anon_resp = self.client.get('/api/public/config/')
        self.assertEqual(anon_resp.status_code, 200)
        self.assertNotIn('toggle_sections', anon_resp.json())

        self.client.force_authenticate(user=self.user_p)
        p_resp = self.client.get('/api/public/config/')
        self.assertEqual(p_resp.status_code, 200)
        self.assertNotIn('toggle_sections', p_resp.json())

        self.client.force_authenticate(user=self.superuser)
        admin_resp = self.client.get('/api/public/config/')
        self.assertEqual(admin_resp.status_code, 200)
        expected = [
            {'code': 'zz.alpha', 'title_fa': 'Alpha'},
            {'code': 'zz.beta', 'title_fa': 'Beta'},
        ]
        self.assertEqual(admin_resp.json().get('toggle_sections'), expected)

    def test_stale_code_dropped_from_public_config(self):
        SystemSetting.objects.create(
            key='disabled_sections',
            warehouse_id=None,
            value=['zz.alpha', 'zz.gone'],
        )
        clear_setting_cache()

        self.client.force_authenticate(user=None)
        resp = self.client.get('/api/public/config/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get('disabled_sections'), ['zz.alpha'])
