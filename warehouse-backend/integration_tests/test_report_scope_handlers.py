"""
تست‌های اعتبارسنجی هندلرهای قلمرو موتور گزارش (فاز ۴ گام ۲).
اجرا: python manage.py test integration_tests.test_report_scope_handlers
"""
from decimal import Decimal
from django.contrib.auth.models import Permission
from django.test import TestCase

from accounts.models import CustomUser
from inventory.models import Item
from warehouses.models import Warehouse
from settings_core.models import SystemSetting
from platform_core.registry import contributions
from platform_core.query_engine.definitions import EntityConfig, register_entity
from reports.engine import ReportEngine, ReportError
from reports.registry import register_warehouse_reports


def _perm(codename):
    return Permission.objects.get(codename=codename, content_type__app_label='accounts')


def make_user(username, perms=(), superuser=False, warehouses=(), first_name='', last_name=''):
    u = CustomUser.objects.create_user(
        username=username, password='x', is_superuser=superuser,
        first_name=first_name, last_name=last_name,
    )
    for c in perms:
        u.user_permissions.add(_perm(c))
    for w in warehouses:
        u.assigned_warehouses.add(w)
    return CustomUser.objects.get(pk=u.pk)


class ReportScopeHandlerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        register_warehouse_reports()
        cls.wh1 = Warehouse.objects.create(name='انبار تست ۱')
        cls.wh2 = Warehouse.objects.create(name='انبار تست ۲')

        # شمارش کور پیش‌فرض را عادی کن
        SystemSetting.objects.create(key='blind_counting', value='normal', warehouse_id=None)

        cls.admin = make_user('admin_handler', superuser=True)
        cls.viewer = make_user(
            'viewer_handler',
            perms=('view_sys_reports', 'view_wh_docs', 'view_sys_supervisor'),
            warehouses=(cls.wh1,),
        )

        cls.i1 = Item.objects.create(
            warehouse=cls.wh1, fa_unic_code='FA-H01', description='کالای انبار ۱',
            inventory=Decimal('10'), dynamic_data={},
        )
        cls.i2 = Item.objects.create(
            warehouse=cls.wh2, fa_unic_code='FA-H02', description='کالای انبار ۲',
            inventory=Decimal('20'), dynamic_data={},
        )

    def test_exactly_one_warehouse_handler_registered(self):
        handlers = [h for h in contributions('report_scope_handlers') if getattr(h, 'kind', None) == 'warehouse']
        self.assertEqual(len(handlers), 1)
        handler = handlers[0]
        self.assertEqual(handler.kind, 'warehouse')
        self.assertTrue(handler.per_scope_settings)

    def test_non_superuser_assigned_warehouse_scoping(self):
        res = ReportEngine(self.viewer, {'entity': 'items', 'fields': ['fa_unic_code']}).run()
        codes = {r['fa_unic_code'] for r in res['rows']}
        self.assertEqual(codes, {'FA-H01'})

    def test_requesting_foreign_warehouse_id_raises_403(self):
        with self.assertRaises(ReportError) as ctx:
            ReportEngine(self.viewer, {
                'entity': 'items',
                'warehouse_id': self.wh2.id,
                'fields': ['fa_unic_code'],
            }).run()
        self.assertEqual(ctx.exception.status, 403)

    def test_unregistered_scope_kind_with_scope_path_raises_403(self):
        cfg = EntityConfig(
            key='fake_scoped_item',
            label='کالای ساختگی با قلمرو ناشناخته',
            model=Item,
            permissions=('view_sys_reports',),
            scope_path='warehouse_id',
            scope_kind='custom_unknown_kind',
            include=('id', 'fa_unic_code'),
        )
        register_entity(cfg, module_code='test')
        try:
            with self.assertRaises(ReportError) as ctx:
                ReportEngine(self.admin, {
                    'entity': 'fake_scoped_item',
                    'fields': ['fa_unic_code'],
                }).run()
            self.assertEqual(ctx.exception.status, 403)
        finally:
            from platform_core.query_engine.definitions import _ENTITIES
            _ENTITIES.pop('fake_scoped_item', None)

    def test_unregistered_scope_kind_without_scope_path_allowed(self):
        cfg = EntityConfig(
            key='fake_unscoped_item',
            label='کالای بدون قلمرو',
            model=Item,
            permissions=('view_sys_reports',),
            scope_path=None,
            scope_kind='custom_unknown_kind_no_path',
            include=('id', 'fa_unic_code'),
        )
        register_entity(cfg, module_code='test')
        try:
            res = ReportEngine(self.admin, {
                'entity': 'fake_unscoped_item',
                'fields': ['fa_unic_code'],
            }).run()
            codes = {r['fa_unic_code'] for r in res['rows']}
            self.assertEqual(codes, {'FA-H01', 'FA-H02'})
        finally:
            from platform_core.query_engine.definitions import _ENTITIES
            _ENTITIES.pop('fake_unscoped_item', None)

    def test_per_scope_settings_in_get_fields(self):
        SystemSetting.objects.create(key='blind_counting', value='blind', warehouse_id=self.wh1.id)
        cfg = EntityConfig(
            key='fake_blind_item',
            label='کالای تست شمارش کور',
            model=Item,
            permissions=('view_sys_reports',),
            scope_path='warehouse_id',
            scope_kind='warehouse',
            include=('id', 'inventory'),
            blind_sensitive=('inventory',),
        )
        register_entity(cfg, module_code='test')
        try:
            fields_wh1 = cfg.get_fields(warehouse_id=self.wh1.id)
            self.assertTrue(fields_wh1['inventory'].sensitive)

            fields_wh2 = cfg.get_fields(warehouse_id=self.wh2.id)
            self.assertFalse(fields_wh2['inventory'].sensitive)
        finally:
            from platform_core.query_engine.definitions import _ENTITIES
            _ENTITIES.pop('fake_blind_item', None)
