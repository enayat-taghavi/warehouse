import uuid
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from warehouses.models import Warehouse
from companies.models import Company, UserCompanyAccess
from inventory.models import Item, CountTask, CountTaskHistory, DocTask, DocTaskHistory, ItemFieldDefinition
from inventory.serializers import DocTaskSerializer, ItemSerializer
from inventory.views import _soft_delete_items_cascade

User = get_user_model()


class OfflineSystemRemediationTests(TestCase):
    """
    مجموعه تست‌های جامع صحت‌سنجی رفع ۲۲ ایراد سیستم آفلاین و همگام‌سازی
    """

    def setUp(self):
        self.client = APIClient()

        self.company, _ = Company.objects.get_or_create(
            code="TEST-OFFLINE-CO",
            defaults={"name": "شرکت تستی آفلاین", "has_warehouse_module": True}
        )

        self.warehouse = Warehouse.objects.create(
            name="انبار مرکزی تست آفلاین",
            project_name="پروژه تست",
            company_id=self.company.id,
            company_name=self.company.name
        )

        self.user = User.objects.create_superuser(
            username="admin_offline_tester",
            email="tester@test.com",
            password="Password123!"
        )

        self.counter = User.objects.create_user(
            username="counter_offline",
            password="Password123!"
        )
        ct = ContentType.objects.get_for_model(User)
        for code in ['view_sys_counter', 'can_act_as_counter', 'view_wh_stocktaking']:
            p, _ = Permission.objects.get_or_create(content_type=ct, codename=code, defaults={'name': code})
            self.counter.user_permissions.add(p)

        UserCompanyAccess.objects.create(
            user=self.counter,
            company=self.company,
            is_default=True
        )
        self.warehouse.assigned_users.add(self.counter)

        self.client.force_authenticate(user=self.user)

    def test_doctask_soft_delete_and_cascade(self):
        """تسک ۷: بررسی حذف نرم DocTask و کسکید آن از کالا"""
        item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="TEST-DOC-001",
            description="کالای تست اسناد"
        )
        doc_task = DocTask.objects.create(
            item=item,
            status='PENDING_DOC'
        )

        self.assertFalse(doc_task.is_deleted)
        self.assertEqual(DocTask.objects.filter(id=doc_task.id).count(), 1)

        # اجرای کسکید حذف نرم کالا
        deleted_count = _soft_delete_items_cascade(Item.objects.filter(id=item.id))
        self.assertEqual(deleted_count, 1)

        doc_task.refresh_from_db()
        self.assertTrue(doc_task.is_deleted)
        # به دلیل ActiveManager باید در objects فیلتر شود ولی در all_objects بماند
        self.assertEqual(DocTask.objects.filter(id=doc_task.id).count(), 0)
        self.assertEqual(DocTask.all_objects.filter(id=doc_task.id).count(), 1)

    def test_doctask_serializer_warehouse_id_and_sync_id(self):
        """تسک ۱۷: بررسی وجود warehouse_id و sync_id در سریالایزر DocTask"""
        item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="TEST-SER-001"
        )
        doc_task = DocTask.objects.create(
            item=item,
            status='PENDING_DOC'
        )

        serializer = DocTaskSerializer(doc_task)
        data = serializer.data
        self.assertIn('warehouse_id', data)
        self.assertEqual(data['warehouse_id'], self.warehouse.id)
        self.assertEqual(data['sync_id'], str(doc_task.sync_id))

    def test_uuid_lookup_by_sync_id(self):
        """تسک ۲۲: بررسی بازیابی رکوردها در ویوها با استفاده از sync_id به جای id عددی"""
        custom_sync_id = uuid.uuid4()
        item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="TEST-UUID-001",
            sync_id=custom_sync_id
        )

        doc_sync_id = uuid.uuid4()
        doc_task = DocTask.objects.create(
            item=item,
            status='PENDING_DOC',
            sync_id=doc_sync_id
        )

        # تست درخواست با UUID برای Item
        res_item = self.client.get(f'/api/inventory/items/{custom_sync_id}/')
        self.assertEqual(res_item.status_code, status.HTTP_200_OK)
        self.assertEqual(res_item.data['id'], item.id)

        # تست درخواست با UUID برای DocTask
        res_doc = self.client.get(f'/api/inventory/doc-tasks/{doc_sync_id}/')
        self.assertEqual(res_doc.status_code, status.HTTP_200_OK)
        self.assertEqual(res_doc.data['id'], doc_task.id)

    def test_idempotent_creation_with_sync_id(self):
        """تسک ۱۴: ارسال مجدد sync_id نباید باعث خطای تکراری شود بلکه باید idempotently رفتار کند"""
        client_sync_id = str(uuid.uuid4())
        payload = {
            'warehouse': self.warehouse.id,
            'fa_unic_code': 'TEST-IDEM-001',
            'description': 'اولین ارسال کلاینت',
            'sync_id': client_sync_id
        }

        # ارسال اول
        res1 = self.client.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        first_id = res1.data['id']

        # ارسال دوم (مثلاً به دلیل خطای شبکه یا Retry صف آفلاین)
        payload['description'] = 'ارسال مجدد با همان شناسه سینک'
        res2 = self.client.post('/api/inventory/items/', payload, format='json')
        self.assertIn(res2.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(res2.data['id'], first_id)
        self.assertEqual(Item.objects.filter(sync_id=client_sync_id).count(), 1)

    def test_idempotent_creation_out_of_scope_sync_id_forbidden(self):
        """تست عدم امکان تغییر یا احیای کالای انبار/شرکت دیگر از طریق ارسال مجدد sync_id توسط کاربر غیرسوپریوزر"""
        other_company = Company.objects.create(
            code="OTHER-OFFLINE-CO",
            name="شرکت دیگر آفلاین",
            has_warehouse_module=True
        )
        other_warehouse = Warehouse.objects.create(
            name="انبار شرکت دیگر",
            project_name="پروژه شرکت دیگر",
            company_id=other_company.id,
            company_name=other_company.name
        )
        other_sync_id = str(uuid.uuid4())
        other_item = Item.all_objects.create(
            warehouse=other_warehouse,
            fa_unic_code="OTHER-IDEM-001",
            description="شرح اولیه شرکت دیگر",
            sync_id=other_sync_id,
            is_deleted=True
        )

        # احراز هویت با کاربر غیرسوپریوزر دارای دسترسی به شرکت و انبار تستی
        self.client.force_authenticate(user=self.counter)
        payload = {
            'warehouse': self.warehouse.id,
            'fa_unic_code': 'ATTACK-IDEM-001',
            'description': 'تلاش برای دستکاری کالای شرکت دیگر',
            'sync_id': other_sync_id
        }

        res = self.client.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        other_item.refresh_from_db()
        self.assertEqual(other_item.description, "شرح اولیه شرکت دیگر")
        self.assertTrue(other_item.is_deleted)

    def test_optimistic_concurrency_conflict_409(self):
        """تسک ۶: بررسی تشخیص تداخل و ارسال پاسخ 409 در صورت قدیمی بودن نسخه کلاینت"""
        item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="TEST-CONFLICT-001",
            description="نسخه اولیه"
        )
        # تاریخ کلاینت ۱ ساعت قبل از آپدیت سرور است
        stale_client_time = (item.updated_at - timedelta(hours=1)).isoformat()

        # تلاش برای آپدیت با تاریخ منسوخ
        res = self.client.patch(
            f'/api/inventory/items/{item.id}/',
            {'description': 'ویرایش متداخل', 'base_updated_at': stale_client_time},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data.get('detail'), 'conflict')
        self.assertIn('server_record', res.data)

    def test_sync_pull_global_dynamic_fields(self):
        """تسک ۱۸: بررسی دریافت فیلدهای پویای سراسری در کنار فیلدهای اختصاصی انبار"""
        # فیلد اختصاصی انبار
        ItemFieldDefinition.objects.create(
            warehouse=self.warehouse,
            name="local_field",
            label="فیلد محلی",
            field_type="text"
        )
        # فیلد سراسری (بدون انبار)
        ItemFieldDefinition.objects.create(
            warehouse=None,
            name="global_field",
            label="فیلد سراسری",
            field_type="text"
        )

        res = self.client.get(
            f'/api/inventory/sync/pull/?warehouse_id={self.warehouse.id}&models=dynamic_fields'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        fields = res.data.get('results', {}).get('dynamic_fields', [])
        field_names = [f['name'] for f in fields]
        self.assertIn('local_field', field_names)
        self.assertIn('global_field', field_names)

    def test_sync_pull_unassigned_task_tombstone(self):
        """تسک ۱۳: بررسی صدور tombstone هنگام سلب تسک از شمارشگر"""
        item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="TEST-TASK-001"
        )
        task = CountTask.objects.create(
            item=item,
            counter=self.counter,
            status='INITIAL_COUNT'
        )
        # ثبت سابقه حضور این شمارشگر در تسک
        CountTaskHistory.objects.create(
            task=task,
            action_by=self.counter,
            action_type='ASSIGN'
        )

        # حالا تسک از این شمارشگر گرفته می‌شود و به شخص دیگری داده می‌شود
        other_user = User.objects.create_user(username="other_counter", password="Password123!")
        task.counter = other_user
        task.status = 'INITIAL_COUNT'
        task.save()

        # لاگین با شمارشگر قبلی
        self.client.force_authenticate(user=self.counter)
        res = self.client.get(
            f'/api/inventory/sync/pull/?warehouse_id={self.warehouse.id}&models=count_tasks'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        tasks = res.data.get('results', {}).get('count_tasks', [])
        target = next((t for t in tasks if t.get('sync_id') == str(task.sync_id)), None)
        self.assertIsNotNone(target)
        self.assertTrue(target.get('is_deleted'))

    def test_personnel_sync_pull_view(self):
        """تسک ۵: بررسی پاسخ موفق اندپوینت همگام‌سازی پرسنلی"""
        res = self.client.get('/api/personnel/sync/pull/?project_id=1')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('server_time', res.data)
        self.assertIn('results', res.data)
        self.assertIn('next_cursor', res.data)
        self.assertIn('has_more', res.data)

    def test_sync_id_retry_keeps_existing_item_unchanged(self):
        """تسک ۲۴: ارسال مجدد با همان sync_id اما شرح متفاوت، ۲۰۰ با همان id می‌دهد و شرح اول دست‌نخورده می‌ماند"""
        client_sync_id = str(uuid.uuid4())
        payload = {
            'warehouse': self.warehouse.id,
            'fa_unic_code': 'TEST-NOOP-RETRY-001',
            'description': 'شرح اولیه ثابت',
            'sync_id': client_sync_id
        }

        # ارسال اول: ایجاد رکورد با 201
        res1 = self.client.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        first_id = res1.data['id']

        # ارسال مجدد با همان sync_id اما شرح متفاوت
        payload['description'] = 'شرح ثانویه که نباید اعمال شود'
        res2 = self.client.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['id'], first_id)

        # بررسی پایگاه داده: شرح کالا همچنان شرح اول است
        item = Item.objects.get(id=first_id)
        self.assertEqual(item.description, 'شرح اولیه ثابت')

    def test_sync_id_retry_for_soft_deleted_item_returns_200_and_stays_soft_deleted(self):
        """تسک ۲۴: ارسال مجدد sync_id برای کالای حذف‌نرم شده، ۲۰۰ می‌دهد و کالا همچنان حذف‌نرم می‌ماند"""
        client_sync_id = str(uuid.uuid4())
        item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code='TEST-DEL-STAYS-001',
            description='کالای حذف‌شده اولیه',
            sync_id=client_sync_id
        )
        _soft_delete_items_cascade(Item.objects.filter(id=item.id))
        item.refresh_from_db()
        self.assertTrue(item.is_deleted)

        payload = {
            'warehouse': self.warehouse.id,
            'fa_unic_code': 'TEST-DEL-STAYS-001',
            'description': 'تلاش برای احیا با ارسال مجدد sync_id',
            'sync_id': client_sync_id
        }
        res = self.client.post('/api/inventory/items/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['id'], item.id)

        item.refresh_from_db()
        self.assertTrue(item.is_deleted)

    def test_scoped_user_cannot_create_or_patch_item_to_other_company_warehouse(self):
        """تسک ۲۴: کاربر با اسکوپ محدود نمی‌تواند در انبار شرکت دیگر کالا بسازد (403) یا کالای خود را با PATCH به آن منتقل کند (403)"""
        other_company = Company.objects.create(
            code="ANOTHER-CO-TARGET",
            name="شرکت دیگر هدف",
            has_warehouse_module=True
        )
        other_warehouse = Warehouse.objects.create(
            name="انبار شرکت دیگر هدف",
            project_name="پروژه شرکت دیگر",
            company_id=other_company.id,
            company_name=other_company.name
        )

        self.client.force_authenticate(user=self.counter)

        # ۱. تلاش برای POST کالای جدید در انبار شرکت دیگر -> 403 و رکوردی ساخته نمی‌شود
        post_payload = {
            'warehouse': other_warehouse.id,
            'fa_unic_code': 'FORBIDDEN-POST-001',
            'description': 'کالای ممنوعه در انبار شرکت دیگر'
        }
        res_post = self.client.post('/api/inventory/items/', post_payload, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Item.all_objects.filter(fa_unic_code='FORBIDDEN-POST-001').exists())

        # ۲. ایجاد کالای مجاز در انبار خود کاربر
        own_item = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code='OWN-ITEM-TARGET-001',
            description='کالای انبار مجاز کاربر'
        )

        # ۳. تلاش برای PATCH و تغییر انبار به انبار شرکت دیگر -> 403 و انبار بدون تغییر می‌ماند
        patch_payload = {
            'warehouse': other_warehouse.id
        }
        res_patch = self.client.patch(f'/api/inventory/items/{own_item.id}/', patch_payload, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        own_item.refresh_from_db()
        self.assertEqual(own_item.warehouse_id, self.warehouse.id)

