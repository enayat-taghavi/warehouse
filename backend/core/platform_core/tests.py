from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from accounts.middleware import get_user_valid_roles_for_app, get_current_active_app
from platform_core.registry import (
    audit_scope_keys,
    build_user_token_scopes,
    normalize_ws_app_scope,
    resolve_default_active_app,
    app_code_to_module,
    module_scope_codes,
    default_module,
    ModuleSpec,
    _REGISTRY,
)


class PlatformCoreRegistryTests(TestCase):
    def test_audit_scope_keys_reads_from_catalog_when_uninstalled(self):
        """
        در پروفایل تک‌ماژول (عدم حضور accounting در _REGISTRY)، audit_scope_keys
        همچنان باید از MODULE_CATALOG شش کلید دامنه ممیزی را برگرداند تا
        .exclude(...) در AuditLogViewSet خالی نشود.
        """
        with patch.dict('platform_core.registry._REGISTRY', {k: v for k, v in _REGISTRY.items() if k != 'accounting'}, clear=True):
            keys = audit_scope_keys('accounting')
            self.assertEqual(keys, ('personnel', 'payroll', 'attendance', 'fleet', 'treasury', 'finance'))

    def test_normalize_ws_app_scope(self):
        cases = [
            ('warehouse', 'warehouse'),
            ('finance', 'finance'),
            ('personnel', 'finance'),
            ('accounting', 'finance'),
            ('operations', None),
            (None, None),
            ('Warehouse', None),
            ('unknown', None),
        ]
        for inp, expected in cases:
            with self.subTest(app_code=inp):
                self.assertEqual(normalize_ws_app_scope(inp), expected)

    def test_resolve_default_active_app(self):
        self.assertEqual(resolve_default_active_app(['finance']), 'finance')
        self.assertEqual(resolve_default_active_app(['warehouse']), 'warehouse')
        self.assertEqual(resolve_default_active_app(['warehouse', 'finance']), 'warehouse')
        self.assertEqual(resolve_default_active_app([]), 'finance')

    def test_build_user_token_scopes_for_normal_user(self):
        User = get_user_model()
        user = User.objects.create_user(
            username='test_normal_registry_user',
            password='Password123!',
            email='test_normal@test.com'
        )
        scopes = build_user_token_scopes(user)
        self.assertEqual(set(scopes.keys()), {'finance', 'warehouse'})
        self.assertEqual(scopes['finance'], get_user_valid_roles_for_app(user, 'personnel'))
        self.assertEqual(scopes['warehouse'], get_user_valid_roles_for_app(user, 'warehouse'))

    def test_app_code_and_scope_codes_fallback_to_catalog_when_uninstalled(self):
        with patch.dict('platform_core.registry._REGISTRY', {k: v for k, v in _REGISTRY.items() if k != 'accounting'}, clear=True):
            self.assertEqual(app_code_to_module('personnel'), 'accounting')
            self.assertEqual(module_scope_codes('accounting'), ('finance', 'personnel'))

    def test_resolve_default_active_app_active_priority(self):
        zeta_spec = ModuleSpec(code='zeta', title_fa='زتا', allowed_app_code='zeta', active_priority=5)
        with patch.dict('platform_core.module_catalog.MODULE_CATALOG', {'zeta': zeta_spec}):
            self.assertEqual(resolve_default_active_app(['zeta', 'warehouse']), 'zeta')

    def test_get_current_active_app_outside_request_equals_default_module(self):
        self.assertEqual(get_current_active_app(), default_module())
