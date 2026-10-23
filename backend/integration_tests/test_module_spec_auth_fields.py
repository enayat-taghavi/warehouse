import dataclasses
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import PermissionDenied

from accounts.authentication import CustomJWTAuthentication
from platform_core.registry import _REGISTRY

User = get_user_model()


class ModuleSpecAuthFieldsIntegrationTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()
        self.auth = CustomJWTAuthentication()
        self.user = User.objects.create_user(
            username='auth_spec_testuser',
            password='Password123!',
            is_superuser=False,
        )

    def test_get_warehouses_with_only_finance_passes(self):
        """GET /api/warehouses/ with only 'finance' scope passes via public_read_prefixes."""
        request = self.rf.get('/api/warehouses/')
        token = {'allowed_apps': ['finance']}
        # Should not raise
        self.auth.enforce_token_app_scope(request, self.user, token)

    def test_post_warehouses_with_only_finance_raises_permission_denied(self):
        """POST /api/warehouses/ with only 'finance' scope raises PermissionDenied."""
        request = self.rf.post('/api/warehouses/')
        token = {'allowed_apps': ['finance']}
        with self.assertRaises(PermissionDenied):
            self.auth.enforce_token_app_scope(request, self.user, token)

    def test_reports_fallback_passes_with_warehouse_scope_when_reporting_modules_empty(self):
        """With get_reporting_modules returning [], GET /api/reports/entities/ passes with ['warehouse']."""
        request = self.rf.get('/api/reports/entities/')
        token = {'allowed_apps': ['warehouse']}
        with patch('platform_core.query_engine.get_reporting_modules', return_value=[]):
            # Should not raise
            self.auth.enforce_token_app_scope(request, self.user, token)

    def test_reports_fallback_raises_with_finance_scope_when_reporting_modules_empty(self):
        """With get_reporting_modules returning [], GET /api/reports/entities/ raises PermissionDenied with ['finance']."""
        request = self.rf.get('/api/reports/entities/')
        token = {'allowed_apps': ['finance']}
        with patch('platform_core.query_engine.get_reporting_modules', return_value=[]):
            with self.assertRaises(PermissionDenied):
                self.auth.enforce_token_app_scope(request, self.user, token)

    def test_get_warehouses_with_empty_public_read_prefixes_raises_permission_denied(self):
        """With warehouse spec's public_read_prefixes patched to (), GET /api/warehouses/ with only 'finance' raises PermissionDenied."""
        request = self.rf.get('/api/warehouses/')
        token = {'allowed_apps': ['finance']}
        wh_spec = _REGISTRY.get('warehouse')
        self.assertIsNotNone(wh_spec, "warehouse module must be registered in _REGISTRY")
        patched_spec = dataclasses.replace(wh_spec, public_read_prefixes=())
        with patch.dict('platform_core.registry._REGISTRY', {'warehouse': patched_spec}), \
             patch('modules.warehouse.module.WAREHOUSE_SPEC', patched_spec):
            with self.assertRaises(PermissionDenied):
                self.auth.enforce_token_app_scope(request, self.user, token)
