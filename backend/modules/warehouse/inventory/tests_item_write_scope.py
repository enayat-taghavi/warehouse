# -*- coding: utf-8 -*-
import io
import openpyxl

from companies.testing import grant_membership
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient

from warehouses.models import Warehouse
from companies.models import Company, UserCompanyAccess
from inventory.models import Item

User = get_user_model()


class ItemWriteScopeSecurityTests(TransactionTestCase):
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
        )
        self.company_b = Company.objects.create(
            code="CO-B",
            name="شرکت ب",
            is_active=True,
        )

        self.warehouse_a = Warehouse.objects.create(
            code="WH-A-01",
            name="انبار الف",
            project_name="پروژه الف",
            company_id=self.company_a.id,
            company_name=self.company_a.name,
        )
        self.warehouse_b = Warehouse.objects.create(
            code="WH-B-01",
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
            is_default=True,
        )
        grant_membership(self.user, self.company_a)

        # ثبت مجوزهای لازم روی کانتنت‌تایپ User
        ct = ContentType.objects.get_for_model(User)
        for perm_code in ['perm_rec_import', 'perm_wh_edit', 'view_sys_counter', 'view_sys_supervisor', 'perm_rec_dispatch']:
            perm, _ = Permission.objects.get_or_create(
                content_type=ct,
                codename=perm_code,
                defaults={'name': perm_code}
            )
            self.user.user_permissions.add(perm)

        # کاربر شرکت ب (بدون انتساب انبار، دسترسی نامحدود به شرکت ب)
        self.user_b = User.objects.create_user(
            username="user_b_scope_tester",
            password="Password123!",
            is_superuser=False,
        )
        UserCompanyAccess.objects.create(
            user=self.user_b,
            company=self.company_b,
            is_default=True,
        )
        grant_membership(self.user_b, self.company_b)
        for perm_code in ['perm_rec_import', 'perm_wh_edit', 'view_sys_counter', 'view_sys_supervisor', 'perm_rec_dispatch']:
            perm = Permission.objects.get(codename=perm_code)
            self.user_b.user_permissions.add(perm)

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

    def test_created_by_and_modified_by_cannot_be_set_by_client(self):
        """
        فیلدهای created_by و modified_by فقط‌خواندنی‌اند: شناسهٔ کاربر دیگر (حتی از شرکت دیگر) در ایجاد و ویرایش نادیده گرفته می‌شود.
        """
        other = User.objects.create_user(username="other_company_user", password="Password123!")
        url = "/api/inventory/items/"
        response = self.client.post(url, {
            'warehouse': self.warehouse_a.id,
            'fa_unic_code': 'ITEM-A-FORGE',
            'description': 'کالای تازه',
            'created_by': other.id,
            'modified_by': other.id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Item.objects.get(fa_unic_code='ITEM-A-FORGE', warehouse=self.warehouse_a)
        self.assertNotEqual(created.created_by_id, other.id)
        self.assertNotEqual(created.modified_by_id, other.id)

        response = self.client.patch(f"{url}{self.item_a.id}/", {'created_by': other.id, 'modified_by': other.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item_a.refresh_from_db()
        self.assertNotEqual(self.item_a.created_by_id, other.id)
        self.assertNotEqual(self.item_a.modified_by_id, other.id)

    def test_null_warehouse_import_log_cannot_be_reverted_cancelled_or_downloaded_by_other_company_user(self):
        """
        لاگ واردات بدون انبار (warehouse=None) توسط کاربر نامحدود شرکت دیگر قابل بازگردانی، لغو یا دانلود نیست (۴۰۳)
        و اقلام بدون تغییر باقی می‌مانند.
        """
        import os
        import tempfile
        from inventory.models import ImportLog, ImportHistory

        import_id = "IMP-NULL-SCOPE-01"
        log = ImportLog.objects.create(
            import_id=import_id,
            warehouse=None,
            imported_by=self.user,
            file_name="test_null_wh.xlsx",
            records_created=0,
            records_updated=1,
            conflict_strategy="update",
        )
        ImportHistory.objects.create(
            import_log=log,
            item=self.item_a,
            action="update",
            previous_state={"description": "توضیحات قبل از بازگردانی"},
        )

        temp_dir = os.path.abspath(tempfile.gettempdir())
        file_path = os.path.join(temp_dir, f"import_log_{import_id}.xlsx")
        with open(file_path, "wb") as f:
            f.write(b"dummy-import-log-content")
        self.addCleanup(lambda: os.remove(file_path) if os.path.exists(file_path) else None)

        client_b = APIClient()
        client_b.force_authenticate(user=self.user_b)

        # ۱. تلاش برای revert_import
        resp_revert = client_b.post("/api/inventory/items/revert_import/", {'import_id': import_id}, format='json')
        self.assertEqual(resp_revert.status_code, status.HTTP_403_FORBIDDEN)
        log.refresh_from_db()
        self.assertFalse(log.is_reverted)
        self.item_a.refresh_from_db()
        self.assertEqual(self.item_a.description, "کالای انبار الف")

        # ۲. تلاش برای cancel_import
        resp_cancel = client_b.post("/api/inventory/items/cancel_import/", {'import_id': import_id}, format='json')
        self.assertEqual(resp_cancel.status_code, status.HTTP_403_FORBIDDEN)

        # ۳. تلاش برای download_import_log
        resp_download = client_b.get(f"/api/inventory/items/download_import_log/?import_id={import_id}")
        self.assertEqual(resp_download.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancel_running_import_with_no_log_works_for_owner_and_forbidden_for_other(self):
        """
        لغو فرآیند در حال اجرای واردات (قبل از تشکیل لاگ) برای مالک موفق و برای کاربر شرکت دیگر ۴۰۳ است.
        """
        from django.core.cache import cache

        running_id = "IMP-RUNNING-SCOPE-99"
        cache.set(f"import_owner_{running_id}", self.user.id, timeout=3600)
        self.addCleanup(lambda: cache.delete(f"import_owner_{running_id}"))
        self.addCleanup(lambda: cache.delete(f"cancel_import_{running_id}"))

        client_b = APIClient()
        client_b.force_authenticate(user=self.user_b)

        # تلاش کاربر شرکت دیگر برای لغو فرآیند در حال اجرا
        resp_b = client_b.post("/api/inventory/items/cancel_import/", {'import_id': running_id}, format='json')
        self.assertEqual(resp_b.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp_b.json().get('error'), 'شما دسترسی لازم برای لغو این فرآیند را ندارید.')
        self.assertIsNone(cache.get(f"cancel_import_{running_id}"))

        # لغو توسط کاربر مالک
        resp_a = self.client.post("/api/inventory/items/cancel_import/", {'import_id': running_id}, format='json')
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_a.json().get('status'), 'cancelled')
        self.assertTrue(cache.get(f"cancel_import_{running_id}"))

    def test_import_row_naming_other_company_warehouse_code_returns_generic_error_without_leaking_name(self):
        """
        ردیف واردات با کد انبار شرکت دیگر باید خطای عمومی 'یافت نشد' برگرداند و نام انبار شرکت دیگر را لو ندهد.
        """
        import asyncio

        self.warehouse_b.code = "WH-B-SECRET-CODE"
        self.warehouse_b.name = "انبار فوق محرمانه شرکت ب"
        self.warehouse_b.save(update_fields=['code', 'name'])

        excel_file = self._create_sample_excel_file(
            headers=['fa_unic_code', 'description', 'warehouse'],
            rows=[['ITEM-TEST-CROSS', 'کالای تستی', 'WH-B-SECRET-CODE']],
            filename="import_cross_wh.xlsx"
        )

        response = self.client.post(
            "/api/inventory/items/import_excel/",
            {'warehouse_id': self.warehouse_a.id, 'file': excel_file, 'import_id': 'IMP-CROSS-01'},
            format='multipart'
        )

        async def _consume(streaming_content):
            res = []
            async for chunk in streaming_content:
                res.append(chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk)
            return "".join(res)

        import json
        content = asyncio.run(_consume(response.streaming_content))
        # نام انبار شرکت ب نباید در پاسخ حضور داشته باشد
        self.assertNotIn(self.warehouse_b.name, content)
        # خطای عمومی عدم یافتن انبار باید بازگردانده شود
        lines = [json.loads(line) for line in content.strip().splitlines() if line.strip()]
        error_msgs = [line.get('msg', '') for line in lines if line.get('type') == 'err']
        self.assertTrue(any("انبار با نام یا کد 'WH-B-SECRET-CODE' یافت نشد." in msg for msg in error_msgs))

    def test_bulk_assign_blocks_cross_company_assignee_and_creates_no_count_task(self):
        """
        تخصیص کاربر شرکت ب به عنوان field_assignee برای کالاهای شرکت الف با خطای ۴۰۰ رد شده و تسک شمارش ایجاد نمی‌شود.
        """
        from inventory.models import CountTask

        response = self.client.post(
            "/api/inventory/items/bulk_assign/",
            {
                'ids': [self.item_a.id],
                'field_assignee': self.user_b.id,
                'field_status': 'counting',
            },
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json().get('error'), 'کاربر انتخابشده عضو شرکت این کالاها نیست.')
        self.assertFalse(CountTask.objects.filter(item=self.item_a).exists())

    def test_bulk_assign_permits_same_company_assignee(self):
        """
        تخصیص کاربر همان شرکت با موفقیت انجام می‌شود و CountTask ایجاد می‌گردد.
        """
        from inventory.models import CountTask

        response = self.client.post(
            "/api/inventory/items/bulk_assign/",
            {
                'ids': [self.item_a.id],
                'field_assignee': self.user.id,
                'field_status': 'counting',
            },
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(CountTask.objects.filter(item=self.item_a).exists())
