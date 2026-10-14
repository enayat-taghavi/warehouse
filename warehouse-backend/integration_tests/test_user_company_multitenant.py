import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from personnel.models import Company, UserCompanyAccess
from warehouses.models import Warehouse
from accounts.serializers import UserSerializer

User = get_user_model()


class UserCompanyMultiTenantTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # ایجاد یا دریافت شرکت‌های آزمایشی (جلوگیری از تداخل با داده‌های پیش‌فرض مایگریشن)
        self.comp1, _ = Company.objects.get_or_create(code="PTS", defaults={'name': "Payandeh Tavan Sayna"})
        self.comp2, _ = Company.objects.get_or_create(code="FA", defaults={'name': "Fars Alish"})

        # ایجاد انبارهای آزمایشی
        self.wh1 = Warehouse.objects.create(name="Warehouse PTS 1", code="WH-PTS-01", company=self.comp1)
        self.wh2 = Warehouse.objects.create(name="Warehouse FA 1", code="WH-FA-01", company=self.comp2)

        # سوپریوزر آزمایشی برای احراز هویت در تست‌ها
        self.admin = User.objects.create_superuser(
            username="admin_test",
            password="adminpassword123",
            phone_number="09171111111"
        )
        self.client.force_authenticate(user=self.admin)

    def test_create_user_with_companies_and_default(self):
        """تست ایجاد کاربر با شرکت‌های مجاز و شرکت پیش‌فرض"""
        data = {
            'username': 'user_multi_1',
            'phone_number': '09172222222',
            'first_name': 'Ali',
            'last_name': 'Rezaei',
            'company_ids': [self.comp1.id, self.comp2.id],
            'default_company_id': self.comp1.id,
            'assigned_warehouses': [self.wh1.id]
        }
        serializer = UserSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()

        # بررسی ایجاد دسترسی‌ها
        accesses = UserCompanyAccess.objects.filter(user=user)
        self.assertEqual(accesses.count(), 2)

        acc1 = accesses.get(company=self.comp1)
        self.assertTrue(acc1.is_default)
        self.assertEqual(acc1.access_level, 'workspace_full')

        acc2 = accesses.get(company=self.comp2)
        self.assertFalse(acc2.is_default)

        # بررسی فیلد شرکت کاربر
        user.refresh_from_db()
        self.assertEqual(user.company, self.comp1.name)

        # بررسی خروجی سریالایزر
        rep = UserSerializer(user).data
        self.assertIn(self.comp1.id, rep['company_ids'])
        self.assertIn(self.comp2.id, rep['company_ids'])
        self.assertEqual(rep['default_company_id'], self.comp1.id)

    def test_update_user_companies_sync(self):
        """تست به‌روزرسانی شرکت‌های کاربر و حذف شرکت‌های نامعتبر"""
        # ایجاد کاربر اولیه با دسترسی به هر دو شرکت
        user = User.objects.create_user(
            username='user_update_1',
            phone_number='09173333333'
        )
        UserCompanyAccess.objects.create(user=user, company=self.comp1, is_default=True)
        UserCompanyAccess.objects.create(user=user, company=self.comp2, is_default=False)

        # به‌روزرسانی و واگذاری فقط به شرکت ۲
        update_data = {
            'company_ids': [self.comp2.id],
            'default_company_id': self.comp2.id
        }
        serializer = UserSerializer(instance=user, data=update_data, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        # بررسی دسترسی‌ها
        accesses = UserCompanyAccess.objects.filter(user=user)
        self.assertEqual(accesses.count(), 1)
        self.assertEqual(accesses.first().company, self.comp2)
        self.assertTrue(accesses.first().is_default)

        user.refresh_from_db()
        self.assertEqual(user.company, self.comp2.name)

    def test_warehouse_company_isolation_validation(self):
        """اعتبارسنجی عدم تخصیص انبار متعلق به شرکتی که کاربر به آن دسترسی ندارد"""
        invalid_data = {
            'username': 'user_isolated_1',
            'phone_number': '09174444444',
            'company_ids': [self.comp1.id], # فقط شرکت پاینده
            'assigned_warehouses': [self.wh2.id] # انبار متعلق به فارس عالیش
        }
        serializer = UserSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('assigned_warehouses', serializer.errors)

        # با انبار مجاز باید موفق شود
        valid_data = {
            'username': 'user_isolated_1',
            'phone_number': '09174444444',
            'company_ids': [self.comp1.id],
            'assigned_warehouses': [self.wh1.id]
        }
        serializer_valid = UserSerializer(data=valid_data)
        self.assertTrue(serializer_valid.is_valid(), serializer_valid.errors)

    def test_user_viewset_company_filtering(self):
        """تست فیلترینگ کوئری‌پارامتر company_id در لیست کاربران"""
        u1 = User.objects.create_user(username='u_pts', phone_number='09175555551')
        UserCompanyAccess.objects.create(user=u1, company=self.comp1, is_default=True)

        u2 = User.objects.create_user(username='u_fa', phone_number='09175555552')
        UserCompanyAccess.objects.create(user=u2, company=self.comp2, is_default=True)

        # درخواست فیلتر شرکت پاینده
        res_pts = self.client.get(f'/api/auth/users/?company_id={self.comp1.id}')
        self.assertEqual(res_pts.status_code, 200)
        data_pts = res_pts.json()
        list_pts = data_pts if isinstance(data_pts, list) else data_pts.get('results', [])
        usernames_pts = [item['username'] for item in list_pts]
        self.assertIn('u_pts', usernames_pts)
        self.assertNotIn('u_fa', usernames_pts)

        # درخواست فیلتر شرکت فارس عالیش
        res_fa = self.client.get(f'/api/auth/users/?company_id={self.comp2.id}')
        self.assertEqual(res_fa.status_code, 200)
        data_fa = res_fa.json()
        list_fa = data_fa if isinstance(data_fa, list) else data_fa.get('results', [])
        usernames_fa = [item['username'] for item in list_fa]
        self.assertIn('u_fa', usernames_fa)
        self.assertNotIn('u_pts', usernames_fa)
