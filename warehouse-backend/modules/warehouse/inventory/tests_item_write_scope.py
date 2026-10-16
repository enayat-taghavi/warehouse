# -*- coding: utf-8 -*-
import io
import openpyxl

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from warehouses.models import Warehouse
from companies.models import Company, UserCompanyAccess
from inventory.models import Item

User = get_user_model()


class ItemWriteScopeSecurityTests(TestCase):
    """
    تست‌های ایزولاسیون تفکیک داده (Tenant Scope) در مسیرهای ویرایشی ItemViewSet:
    clear_warehouse_data, delete_from_excel, import_excel, bulk_update
    """

    def setUp(self):
        self.client = APIClient()

        self.company_a = Company.objects.create(
            code="CO-A",
            name="شرکت الف",
            is_active=True,
            has_warehouse_module=True,
        )
        self.company_b = Company.objects.create(
            code="CO-B",
            name="شرکت ب",
            is_active=True,
            has_warehouse_module=True,
        )

        self.warehouse_a = Warehouse.objects.create(
            name="انبار الف",
            project_name="پروژه الف",
            company_id=self.company_a.id,
            company_name=self.company_a.name,
        )
        self.warehouse_b = Warehouse.objects.create(
            name="انبار ب",
            project_name="پروژه ب",
            company_id=self.company_b.id,
            company_name=self.company_b.name,
        )

        self.user = User.objects.create_user(
            username="user_scope_tester",
            password="Password123!",
            is_superuser=False,
        )

        # دسترسی کامل به شرکت الف و بدون انتساب به هیچ انبار مشخصی
        UserCompanyAccess.objects.create(
            user=self.user,
            company=self.company_a,
            access_level="workspace_full",
            is_default=True,
        )

        # ثبت مجوزهای لازم روی کانتنت‌تایپ User
        ct = ContentType.objects.get_for_model(User)
        for perm_code in ['perm_rec_import', 'perm_wh_edit', 'view_sys_counter', 'view_sys_supervisor']:
            perm, _ = Permission.objects.get_or_create(
                content_type=ct,
                codename=perm_code,
                defaults={'name': perm_code}
            )
            self.user.user_permissions.add(perm)

        # ایجاد اقلام تستی در هر دو انبار
        self.item_a = Item.objects.create(
            warehouse=self.warehouse_a,
            fa_unic_code="ITEM-A-01",
            description="کالای انبار الف",
            is_deleted=False,
        )
        self.item_b = Item.objects.create(
            warehouse=self.warehouse_b,
            fa_unic_code="ITEM-B-01",
            description="کالای انبار ب",
            is_deleted=False,
        )

        self.client.force_authenticate(user=self.user)

    def _create_sample_excel_file(self, headers, rows, filename="test.xlsx"):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(headers)
        for row in rows:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = filename
        return buf

    def test_clear_warehouse_data_blocks_other_company_warehouse(self):
        """
        پاکسازی داده‌های انبار شرکت ب توسط کاربر شرکت الف باید با خطای ۴۰۳ مسدود شود
        و هیچ رکوردی حذف نرم نشود.
        """
        url = "/api/inventory/items/clear_warehouse_data/"
        response = self.client.post(url, {'warehouse_id': self.warehouse_b.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.item_b.refresh_from_db()
        self.assertFalse(self.item_b.is_deleted)
        self.assertTrue(Item.objects.filter(id=self.item_b.id).exists())

    def test_delete_from_excel_blocks_other_company_warehouse(self):
        """
        حذف از طریق فایل اکسل برای انبار شرکت ب باید با خطای ۴۰۳ مسدود شود
        و هیچ رکوردی حذف نشود.
        """
        excel_file = self._create_sample_excel_file(
            headers=['id', 'fa_unic_code'],
            rows=[[self.item_b.id, self.item_b.fa_unic_code]],
            filename="delete_items.xlsx"
        )
        url = "/api/inventory/items/delete_from_excel/"
        response = self.client.post(
            url,
            {'warehouse_id': self.warehouse_b.id, 'file': excel_file},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.item_b.refresh_from_db()
        self.assertFalse(self.item_b.is_deleted)
        self.assertTrue(Item.objects.filter(id=self.item_b.id).exists())

    def test_import_excel_blocks_other_company_warehouse(self):
        """
        بارگذاری فایل اکسل با شناسه انبار شرکت ب باید با خطای ۴۰۳ مسدود شود.
        """
        excel_file = self._create_sample_excel_file(
            headers=['fa_unic_code', 'description'],
            rows=[['ITEM-NEW-01', 'کالای جدید']],
            filename="import_items.xlsx"
        )
        url = "/api/inventory/items/import_excel/"
        response = self.client.post(
            url,
            {'warehouse_id': self.warehouse_b.id, 'file': excel_file},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_bulk_update_protected_fields_ignored_and_item_remains_active(self):
        """
        در bulk_update فیلدهای warehouse و is_deleted حفاظت‌شده هستند:
        تلاش برای تغییر warehouse به انبار شرکت دیگر نادیده گرفته شده و انبار تغییر نمی‌کند؛
        همچنین ارسال is_deleted: true نادیده گرفته شده و کالا فعال باقی می‌ماند.
        """
        url = "/api/inventory/items/bulk_update/"
        payload = [
            {
                'id': self.item_a.id,
                'warehouse': self.warehouse_b.id,
                'is_deleted': True,
                'description': 'شرح ویرایش‌شده در محدوده مجاز',
            }
        ]
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.item_a.refresh_from_db()
        # انبار باید دست‌نخورده روی انبار الف باقی بماند
        self.assertEqual(self.item_a.warehouse_id, self.warehouse_a.id)
        # وضعیت حذف نباید تغییر کند و کالا باید فعال بماند
        self.assertFalse(self.item_a.is_deleted)
        # سایر فیلدهای مجاز (مثل description) باید تغییر یافته باشند
        self.assertEqual(self.item_a.description, 'شرح ویرایش‌شده در محدوده مجاز')

    def test_user_can_still_clear_warehouse_data_in_own_company(self):
        """
        کاربر مجاز شرکت الف باید همچنان بتواند داده‌های انبار شرکت الف را پاکسازی کند (۲۰۰).
        """
        url = "/api/inventory/items/clear_warehouse_data/"
        response = self.client.post(url, {'warehouse_id': self.warehouse_a.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.item_a.refresh_from_db()
        self.assertTrue(self.item_a.is_deleted)
        # با ActiveManager نباید در objects یافت شود ولی در all_objects هست
        self.assertFalse(Item.objects.filter(id=self.item_a.id).exists())
        self.assertTrue(Item.all_objects.filter(id=self.item_a.id).exists())
