from unittest.mock import patch
from django.test import SimpleTestCase
from platform_core.registry import audit_scope_keys, _REGISTRY


class PlatformCoreRegistryTests(SimpleTestCase):
    def test_audit_scope_keys_reads_from_catalog_when_uninstalled(self):
        """
        در پروفایل تک‌ماژول (عدم حضور accounting در _REGISTRY)، audit_scope_keys
        همچنان باید از MODULE_CATALOG شش کلید دامنه ممیزی را برگرداند تا
        .exclude(...) در AuditLogViewSet خالی نشود.
        """
        with patch.dict('platform_core.registry._REGISTRY', {k: v for k, v in _REGISTRY.items() if k != 'accounting'}, clear=True):
            keys = audit_scope_keys('accounting')
            self.assertEqual(keys, ('personnel', 'payroll', 'attendance', 'fleet', 'treasury', 'finance'))
