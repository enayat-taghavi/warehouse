"""
تست‌های پایه و واحد اپ گزارش‌ها (Reports Unit Tests).
تست‌های یکپارچگی نیازمند انبار در integration_tests قرار دارند.
"""
from unittest.mock import patch

from django.apps import apps
from django.test import TestCase

from accounts.models import CustomUser
from platform_core.query_engine import EntityConfig, FieldDef, get_entity
from platform_core.registry import contribute
from reports.engine import ReportEngine
from reports.models import ReportExportJob, ReportTemplate


class ReportsUnitTestCase(TestCase):
    def test_report_models_defined(self):
        self.assertTrue(hasattr(ReportTemplate, 'objects'))
        self.assertTrue(hasattr(ReportExportJob, 'objects'))

    def test_users_entity_has_assigned_warehouses_count(self):
        fields = get_entity('users').get_fields()
        self.assertIn('assigned_warehouses_count', fields)
        self.assertEqual(fields['assigned_warehouses_count'].key, 'assigned_warehouses_count')

    @patch.dict('platform_core.registry._CONTRIBUTIONS', {}, clear=False)
    def test_entity_config_lazy_extra_fields_point(self):
        cfg = EntityConfig(
            key='test_ent',
            label='موجودیت تست',
            model=CustomUser,
            permissions=(),
            extra_fields_point='test_point_extra',
        )
        self.assertNotIn('test_field', cfg.get_fields())

        fd = FieldDef(key='test_field', source='test_field', label='فیلد تستی', type='text')
        contribute('test_point_extra', fd)
        contribute('test_point_extra', lambda: FieldDef(key='callable_field', source='callable_field', label='فیلد فراخوانی', type='number'))
        contribute('test_point_extra', ('tuple_field', FieldDef(key='tuple_field', source='tuple_field', label='فیلد تاپل', type='date')))

        fields = cfg.get_fields()
        self.assertIn('test_field', fields)
        self.assertEqual(fields['test_field'], fd)
        self.assertIn('callable_field', fields)
        self.assertEqual(fields['callable_field'].key, 'callable_field')
        self.assertIn('tuple_field', fields)
        self.assertEqual(fields['tuple_field'].key, 'tuple_field')

    def test_report_engine_users_assigned_warehouses_count(self):
        Warehouse = apps.get_model('warehouses', 'Warehouse')
        wh1 = Warehouse.objects.create(name='انبار تست ۱')
        wh2 = Warehouse.objects.create(name='انبار تست ۲')
        user = CustomUser.objects.create_user(
            username='user_with_two_whs',
            password='testpassword123',
            first_name='کاربر',
            last_name='دو انباره',
        )
        user.assigned_warehouses.add(wh1, wh2)

        admin = CustomUser.objects.create_user(
            username='admin_report_test_user',
            password='testpassword123',
            is_superuser=True,
        )

        spec = {
            'entity': 'users',
            'fields': ['username', 'assigned_warehouses_count'],
            'filters': {'field': 'username', 'operator': 'eq', 'value': user.username},
        }
        res = ReportEngine(admin, spec).run()
        self.assertEqual(res['count'], 1)
        self.assertEqual(res['rows'][0]['username'], user.username)
        self.assertEqual(res['rows'][0]['assigned_warehouses_count'], 2)

