from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from warehouses.models import Warehouse
from personnel.models import Company, UserCompanyAccess

User = get_user_model()


class CompanyWarehouseIsolationTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # ۱. دریافت یا ایجاد شرکت‌ها
        self.company_fa, _ = Company.objects.get_or_create(
            code="FA",
            defaults={"name": "فارس عالیش", "has_warehouse_module": True}
        )
        self.company_pts, _ = Company.objects.get_or_create(
            code="PTS",
            defaults={"name": "پاینده توان ساینا", "has_warehouse_module": True}
        )
        self.company_consulting, _ = Company.objects.get_or_create(
            code="CONSULT",
            defaults={"name": "شرکت مهندسی مشاور", "has_warehouse_module": False}
        )

        # ۲. ایجاد انبارها برای هر شرکت
        self.wh_fa_1 = Warehouse.objects.create(
            name="انبار مرکزی فارس عالیش",
            code="WH-FA-01",
            company_id=self.company_fa.id,
            company_name=self.company_fa.name
        )
        self.wh_fa_2 = Warehouse.objects.create(
            name="انبار قطعات فارس عالیش",
            code="WH-FA-02",
            company_id=self.company_fa.id,
            company_name=self.company_fa.name
        )
        self.wh_pts_1 = Warehouse.objects.create(
            name="انبار دالان پاینده توان",
            code="WH-PTS-01",
            company_id=self.company_pts.id,
            company_name=self.company_pts.name
        )

        # ۳. ایجاد کاربران
        self.superuser = User.objects.create_superuser(
            username="admin_user",
            email="admin@test.com",
            password="adminpassword123"
        )
        self.regular_user = User.objects.create_user(
            username="pts_manager",
            email="manager@test.com",
            password="managerpassword123"
        )
        # انتساب کاربر عادی فقط به شرکت PTS با دسترسی فضای کاری
        UserCompanyAccess.objects.create(
            user=self.regular_user,
            company=self.company_pts,
            access_level='workspace_full',
            is_default=True
        )

        # کاربر با دسترسی صرفاً مدارک (الگوی نسرین بیرمی)
        self.docs_user = User.objects.create_user(
            username="docs_only_user",
            email="docs@test.com",
            password="docspassword123"
        )
        UserCompanyAccess.objects.create(
            user=self.docs_user,
            company=self.company_pts,
            access_level='docs_read',
            is_default=False
        )

    def test_superuser_sees_all_warehouses_without_company_filter(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get('/api/warehouses/')
        self.assertEqual(response.status_code, status.status.HTTP_200_OK if hasattr(status, 'status') else 200)
        names = [w['name'] for w in response.data]
        self.assertIn("انبار مرکزی فارس عالیش", names)
        self.assertIn("انبار دالان پاینده توان", names)
        self.assertEqual(len(response.data), 3)

    def test_warehouse_isolation_via_x_company_id_header(self):
        self.client.force_authenticate(user=self.superuser)
        
        # درخواست برای شرکت فارس عالیش (FA)
        response_fa = self.client.get('/api/warehouses/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(response_fa.status_code, 200)
        self.assertEqual(len(response_fa.data), 2)
        names_fa = [w['name'] for w in response_fa.data]
        self.assertIn("انبار مرکزی فارس عالیش", names_fa)
        self.assertIn("انبار قطعات فارس عالیش", names_fa)
        self.assertNotIn("انبار دالان پاینده توان", names_fa)

        # درخواست برای شرکت پاینده توان ساینا (PTS)
        response_pts = self.client.get('/api/warehouses/', HTTP_X_COMPANY_ID=str(self.company_pts.id))
        self.assertEqual(response_pts.status_code, 200)
        self.assertEqual(len(response_pts.data), 1)
        self.assertEqual(response_pts.data[0]['name'], "انبار دالان پاینده توان")
        self.assertEqual(response_pts.data[0]['company_id'], self.company_pts.id)
        self.assertEqual(response_pts.data[0]['company_name'], "پاینده توان ساینا")

    def test_warehouse_isolation_via_query_param(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(f'/api/warehouses/?company_id={self.company_fa.id}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_regular_user_scoped_to_assigned_company(self):
        self.client.force_authenticate(user=self.regular_user)
        # کاربر عادی بدون ارسال هدر، فقط انبارهای شرکت PTS را دریافت می‌کند
        response = self.client.get('/api/warehouses/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "انبار دالان پاینده توان")

    def test_perform_create_auto_assigns_company(self):
        self.client.force_authenticate(user=self.superuser)
        # ثبت انبار جدید برای شرکت فارس عالیش با هدر X-Company-ID
        payload = {
            "name": "انبار جدید تست",
            "code": "WH-TEST-NEW",
            "type": "فیزیکی"
        }
        response = self.client.post(
            '/api/warehouses/',
            data=payload,
            format='json',
            HTTP_X_COMPANY_ID=str(self.company_fa.id)
        )
        self.assertEqual(response.status_code, 201)
        new_wh = Warehouse.objects.get(code="WH-TEST-NEW")
        self.assertEqual(new_wh.company_id, self.company_fa.id)
        self.assertEqual(new_wh.company_name, "فارس عالیش")

    def test_company_has_warehouse_module_flag(self):
        self.assertTrue(self.company_fa.has_warehouse_module)
        self.assertFalse(self.company_consulting.has_warehouse_module)
        
        self.client.force_authenticate(user=self.superuser)
        response = self.client.get(f'/api/personnel/companies/{self.company_consulting.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['has_warehouse_module'], False)

    def test_regular_user_blocked_from_other_company_warehouses_via_header(self):
        """
        تست منفی BOLA: کاربر عادی شرکت PTS نباید بتواند با ارسال هدر X-Company-ID شرکت FA،
        انبارهای شرکت FA را مشاهده کند و باید خطای 403 دریافت نماید.
        """
        self.client.force_authenticate(user=self.regular_user)
        response = self.client.get('/api/warehouses/', HTTP_X_COMPANY_ID=str(self.company_fa.id))
        self.assertEqual(response.status_code, 403)

    def test_regular_user_blocked_from_other_company_warehouses_via_query_param(self):
        """
        تست منفی BOLA: کاربر عادی شرکت PTS نباید بتواند با ارسال کوئری‌پارامتر company_id شرکت FA،
        انبارهای شرکت FA را مشاهده کند و باید خطای 403 دریافت نماید.
        """
        self.client.force_authenticate(user=self.regular_user)
        response = self.client.get(f'/api/warehouses/?company_id={self.company_fa.id}')
        self.assertEqual(response.status_code, 403)

    def test_regular_user_cannot_create_warehouse_in_unauthorized_company(self):
        """
        تست منفی BOLA: کاربر عادی نباید بتواند انباری را در شرکتی که به آن دسترسی ندارد ثبت کند.
        """
        # اعطای مجوز ساخت انبار به کاربر عادی
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(Warehouse)
        perm = Permission.objects.filter(codename='perm_wh_create').first()
        if perm:
            self.regular_user.user_permissions.add(perm)

        self.client.force_authenticate(user=self.regular_user)
        payload = {
            "name": "انبار متجاوز",
            "code": "WH-ILLEGAL",
            "type": "فیزیکی"
        }
        response = self.client.post(
            '/api/warehouses/',
            data=payload,
            format='json',
            HTTP_X_COMPANY_ID=str(self.company_fa.id)
        )
        self.assertEqual(response.status_code, 403)

    def test_docs_only_user_cannot_access_or_see_warehouses(self):
        """
        کاربری که صرفاً دسترسی مشاهده مدارک رسمی (docs_read) دارد (الگوی نسرین بیرمی)،
        نباید هیچ انباری در لیست ببیند و در صورت ارسال هدر با خطای 403 مواجه شود.
        """
        self.client.force_authenticate(user=self.docs_user)
        response = self.client.get('/api/warehouses/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

        response_header = self.client.get('/api/warehouses/', HTTP_X_COMPANY_ID=str(self.company_pts.id))
        self.assertEqual(response_header.status_code, 403)


