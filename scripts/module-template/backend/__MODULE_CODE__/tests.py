from django.test import TestCase


class __MODULE_PASCAL__ModuleTests(TestCase):
    def test_module_registered_in_catalog(self):
        """راستی‌آزمایی بارگذاری ماژول در کاتالوگ پلتفرم"""
        from platform_core.module_catalog import MODULE_CATALOG
        self.assertIn('__MODULE_CODE__', MODULE_CATALOG)
        spec = MODULE_CATALOG['__MODULE_CODE__']
        self.assertEqual(spec.code, '__MODULE_CODE__')

    def test_module_registered_in_registry(self):
        """راستی‌آزمایی ثبت ماژول در رجیستری قابلیت‌های هسته"""
        from platform_core.registry import get_module
        spec = get_module('__MODULE_CODE__')
        self.assertIsNotNone(spec)
        self.assertEqual(spec.code, '__MODULE_CODE__')
