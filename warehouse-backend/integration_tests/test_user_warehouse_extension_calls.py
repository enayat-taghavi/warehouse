from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.serializers import UserSerializer, _get_user_warehouse_extension
import platform_core.registry as registry_module
from warehouses.models import Warehouse

User = get_user_model()


class UserWarehouseExtensionCallsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin_wh_ext',
            password='adminpassword123',
            phone_number='09120000001',
        )
        self.client.force_authenticate(user=self.admin)
        self.wh1 = Warehouse.objects.create(name='انبار مرکزی ۱', code='WH-CTR-01')
        self.wh2 = Warehouse.objects.create(name='انبار مرکزی ۲', code='WH-CTR-02')

    def test_create_user_with_assigned_warehouses_sets_them(self):
        """ایجاد کاربر از طریق API با assigned_warehouses انبارها را منتسب می‌کند."""
        data = {
            'username': 'user_ext_create',
            'password': 'Password123!',
            'first_name': 'علی',
            'last_name': 'محمدی',
            'phone_number': '09121112233',
            'assigned_warehouses': [self.wh1.id],
        }
        response = self.client.post('/api/auth/users/', data=data, format='json')
        self.assertEqual(response.status_code, 201, response.content)

        user = User.objects.get(username='user_ext_create')
        wh_ext = _get_user_warehouse_extension()
        self.assertIsNotNone(wh_ext)
        self.assertEqual(wh_ext.get_assigned_ids(user), [self.wh1.id])
        self.assertEqual(wh_ext.get_assigned_names(user), [self.wh1.name])
        self.assertEqual([w.id for w in wh_ext.get_assigned(user)], [self.wh1.id])

    def test_user_detail_returns_assigned_warehouses_ids(self):
        """دریافت جزئیات کاربر همان شناسه انبارهای منتسب را بازمی‌گرداند."""
        user = User.objects.create_user(
            username='user_ext_detail',
            phone_number='09121112234',
        )
        wh_ext = _get_user_warehouse_extension()
        self.assertIsNotNone(wh_ext)
        wh_ext.set_assigned(user, [self.wh1])

        response = self.client.get(f'/api/auth/users/{user.id}/')
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertIn('assigned_warehouses', data)
        self.assertEqual(data['assigned_warehouses'], [self.wh1.id])

    def test_update_user_replaces_assigned_warehouses(self):
        """به‌روزرسانی با فهرست جدید، انبارهای انتسابی را جایگزین می‌کند."""
        user = User.objects.create_user(
            username='user_ext_update',
            phone_number='09121112235',
        )
        wh_ext = _get_user_warehouse_extension()
        self.assertIsNotNone(wh_ext)
        wh_ext.set_assigned(user, [self.wh1])
        self.assertEqual(wh_ext.get_assigned_ids(user), [self.wh1.id])

        patch_data = {
            'assigned_warehouses': [self.wh2.id],
        }
        response = self.client.patch(f'/api/auth/users/{user.id}/', data=patch_data, format='json')
        self.assertEqual(response.status_code, 200, response.content)

        user.refresh_from_db()
        self.assertEqual(wh_ext.get_assigned_ids(user), [self.wh2.id])
        self.assertNotIn(self.wh1.id, wh_ext.get_assigned_ids(user))

    def test_user_serializer_without_warehouse_extension(self):
        """در صورت عدم وجود اکستنشن انبار، فیلد assigned_warehouses وجود ندارد و ایجاد کاربر کار می‌کند."""
        orig_contributions = registry_module.contributions

        def mock_contributions(point):
            if point == 'user_extensions':
                return ()
            return orig_contributions(point)

        with patch.object(registry_module, 'contributions', side_effect=mock_contributions):
            serializer = UserSerializer(data={
                'username': 'user_no_wh_ext',
                'password': 'Password123!',
                'phone_number': '09121112236',
            })
            self.assertNotIn('assigned_warehouses', serializer.fields)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            user = serializer.save()
            self.assertIsNotNone(user.id)
            self.assertEqual(user.username, 'user_no_wh_ext')
            rep = UserSerializer(user).data
            self.assertNotIn('assigned_warehouses', rep)

    def test_warehouse_user_extension_methods_tolerance(self):
        """متدهای WarehouseUserExtension در برابر شیء None یا فاقد ویژگی ایمن هستند."""
        wh_ext = _get_user_warehouse_extension()
        self.assertIsNotNone(wh_ext)

        # آزمون با None
        self.assertEqual(wh_ext.get_assigned_ids(None), [])
        self.assertEqual(wh_ext.get_assigned_names(None), [])
        self.assertEqual(wh_ext.get_assigned(None), [])
        wh_ext.set_assigned(None, [self.wh1])

        # آزمون با شیء بدون ویژگی assigned_warehouses
        dummy = object()
        self.assertEqual(wh_ext.get_assigned_ids(dummy), [])
        self.assertEqual(wh_ext.get_assigned_names(dummy), [])
        self.assertEqual(wh_ext.get_assigned(dummy), [])
        wh_ext.set_assigned(dummy, [self.wh1])
