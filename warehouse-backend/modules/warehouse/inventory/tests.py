import json
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from warehouses.models import Warehouse
from settings_core.models import SystemSetting
from inventory.models import Item, CountTask, CountTaskHistory, ItemFieldDefinition

User = get_user_model()


class BaseInventoryTestCase(TestCase):
    """کلاس پایه جهت راه‌اندازی و ایزولاسیون داده‌های آزمون چرخه انبارگردانی"""

    def setUp(self):
        self.client = APIClient()

        # ۱. ساخت انبارهای تستی (انبار اصلی و انبار دوم جهت تست ایزولاسیون)
        self.warehouse = Warehouse.objects.create(
            name="انبار مرکزی پروژه شیراز",
            project_name="پروژه شیراز"
        )
        self.warehouse2 = Warehouse.objects.create(
            name="انبار فرعی بوشهر",
            project_name="پروژه بوشهر"
        )

        # ۲. ساخت کاربران با سطوح دسترسی تفکیک‌شده (RBAC)
        self.admin = User.objects.create_superuser(
            username="admin_user",
            email="admin@test.com",
            password="Password123!"
        )

        self.manager = User.objects.create_user(
            username="manager_user",
            first_name="مدیر",
            last_name="انبار",
            password="Password123!"
        )
        self.manager = self._assign_perms(self.manager, [
            'view_sys_manager_review',
            'perm_wh_edit',
            'perm_rec_dispatch',
            'perm_rec_recount',
            'perm_inventory_finalize',
            'can_act_as_manager',
            'view_wh_docs',
            'view_wh_stocktaking'
        ])

        self.supervisor = User.objects.create_user(
            username="supervisor_user",
            first_name="سرپرست",
            last_name="شمارش",
            password="Password123!"
        )
        self.supervisor = self._assign_perms(self.supervisor, [
            'view_sys_supervisor',
            'perm_rec_recount',
            'perm_feed_approve_action',
            'can_act_as_supervisor',
            'view_wh_docs',
            'view_wh_stocktaking'
        ])

        self.counter = User.objects.create_user(
            username="counter_user",
            first_name="انبارگردان",
            last_name="میدانی ۱",
            password="Password123!"
        )
        self.counter = self._assign_perms(self.counter, [
            'view_sys_counter',
            'can_act_as_counter',
            'view_wh_stocktaking'
        ])

        self.counter2 = User.objects.create_user(
            username="counter_user_2",
            first_name="انبارگردان",
            last_name="میدانی ۲",
            password="Password123!"
        )
        self.counter2 = self._assign_perms(self.counter2, [
            'view_sys_counter',
            'can_act_as_counter',
            'view_wh_stocktaking'
        ])

        self.unauthorized_user = User.objects.create_user(
            username="simple_guest",
            first_name="مهمان",
            last_name="عادی",
            password="Password123!"
        )

        # ۳. ساخت اقلام نمونه با تنوع مقادیر و مشخصات
        self.item1 = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="FA-1001",
            description="لوله استیل ۳ اینچ صنعتی",
            po="PO-8812",
            pl="PL-01",
            pk_number="PK-900",
            my_tag="پایپینگ,استیل",
            inventory=Decimal('100.000'),
            bal4miv=Decimal('100.000'),
            new_location="A-01-01",
            field_status="waiting"
        )

        self.item2 = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="FA-1002",
            description="شیر فلکه‌ای ۶ اینچ کربن استیل",
            po="PO-8812",
            pl="PL-02",
            pk_number="PK-900",
            my_tag="ولو,سنگین",
            inventory=Decimal('50.000'),
            bal4miv=Decimal('50.000'),
            new_location="B-02-03",
            field_status="waiting"
        )

        self.item3 = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="FA-1003",
            description="فلنج کربن استیل کلاس ۳۰۰",
            po="PO-9900",
            pl="PL-05",
            inventory=Decimal('20.000'),
            bal4miv=Decimal('20.000'),
            new_location="C-03-01",
            field_status="waiting"
        )

        self.item4 = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="FA-1004",
            description="گسکت اسپیرال وند ۴ اینچ",
            po="PO-9900",
            pl="PL-05",
            inventory=Decimal('10.000'),
            bal4miv=Decimal('10.000'),
            new_location="D-01-05",
            field_status="waiting"
        )

        self.item5 = Item.objects.create(
            warehouse=self.warehouse,
            fa_unic_code="FA-1005",
            description="پیچ و مهره استل B7",
            inventory=Decimal('500.000'),
            bal4miv=Decimal('500.000'),
            new_location="E-02-01",
            field_status="waiting"
        )

        # قلم در انبار دوم جهت تست تفکیک انبارها
        self.item_wh2 = Item.objects.create(
            warehouse=self.warehouse2,
            fa_unic_code="FA-2001",
            description="کابل برق فشار قوی",
            inventory=Decimal('1000.000'),
            bal4miv=Decimal('1000.000'),
            field_status="waiting"
        )

    def _assign_perms(self, user, perm_codenames):
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(User)
        perms = []
        for code in perm_codenames:
            p, _ = Permission.objects.get_or_create(content_type=ct, codename=code, defaults={'name': code})
            perms.append(p)
        user.user_permissions.set(perms)
        user.save()
        if hasattr(user, '_perm_cache'):
            delattr(user, '_perm_cache')
        if hasattr(user, '_user_perm_cache'):
            delattr(user, '_user_perm_cache')
        return User.objects.get(pk=user.pk)


# ═══════════════════════════════════════════════════════════════════════════
# فاز ۱: آزمون‌های تخصیص و ارجاع اقلام (Dispatch & Routing Tests)
# ═══════════════════════════════════════════════════════════════════════════
class InventoryDispatchAndRoutingTests(BaseInventoryTestCase):
    """
    مجموعه تست‌های جامع تخصیص و ارجاع اقلام به انبارگردانی:
    ۱. تخصیص مستقیم ۳ سطحی (شمارشگر، سرپرست، مدیر)
    ۲. تخصیص مستقیم به مدیر با پرچم skip_supervisor
    ۳. تخصیص به استخر عمومی شمارشگران و سرپرستان
    ۴. تخصیص گروهی بر اساس فیلترهای پیشرفته داینامیک (select_all)
    ۵. هشدار امنیتی ارجاع مجدد بدون force و عبور موفق با force=True
    ۶. ایزولاسیون کامل تخصیص بین انبارهای مختلف
    """

    def test_01_direct_three_level_dispatch(self):
        """تست تخصیص کامل ۳ سطحی: شمارشگر + سرپرست + مدیر"""
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/items/bulk_assign/', {
            'item_ids': [self.item1.id],
            'field_assignee': self.counter.id,
            'supervisor_assignee': self.supervisor.id,
            'manager_assignee': self.manager.id,
            'field_status': 'counting'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task = CountTask.objects.get(item=self.item1)
        self.assertEqual(task.status, 'PENDING_COUNT')
        self.assertEqual(task.counter, self.counter)
        self.assertEqual(task.supervisor, self.supervisor)
        self.assertEqual(task.assigned_manager, self.manager)
        self.assertFalse(task.skip_supervisor)

        self.item1.refresh_from_db()
        self.assertEqual(self.item1.field_status, 'counting')
        self.assertEqual(self.item1.field_assignee, f"{self.counter.first_name} {self.counter.last_name}")

    def test_02_skip_supervisor_dispatch_and_routing(self):
        """تست تخصیص با دور زدن سرپرست (skip_supervisor) و ارجاع مستقیم به مدیر"""
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/items/bulk_assign/', {
            'item_ids': [self.item2.id],
            'field_assignee': self.counter.id,
            'supervisor_assignee': 'skip',
            'manager_assignee': self.manager.id,
            'field_status': 'counting'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task = CountTask.objects.get(item=self.item2)
        self.assertTrue(task.skip_supervisor)
        self.assertIsNone(task.supervisor)
        self.assertEqual(task.counter, self.counter)
        self.assertEqual(task.assigned_manager, self.manager)

    def test_03_dispatch_to_public_pools(self):
        """تست ارجاع به استخر عمومی شمارشگران (بدون شمارشگر) و استخر سرپرستان"""
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/items/bulk_assign/', {
            'item_ids': [self.item3.id],
            'field_assignee': None,  # استخر عمومی شمارشگران
            'supervisor_assignee': None,  # استخر عمومی سرپرستان
            'manager_assignee': self.manager.id,
            'field_status': 'counting'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task = CountTask.objects.get(item=self.item3)
        self.assertIsNone(task.counter)
        self.assertIsNone(task.supervisor)
        self.assertEqual(task.status, 'PENDING_COUNT')

        self.item3.refresh_from_db()
        self.assertEqual(self.item3.field_assignee, 'استخر عمومی')

    def test_04_bulk_dispatch_with_advanced_filters(self):
        """تست تخصیص گروهی اقلام با پرچم select_all و فیلترهای ترکیبی (مانند PO و انبار)"""
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/items/bulk_assign/', {
            'select_all': True,
            'filters': {
                'warehouse': self.warehouse.id,
                'po': 'PO-8812'  # شامل item1 و item2
            },
            'field_assignee': self.counter.id,
            'supervisor_assignee': self.supervisor.id,
            'field_status': 'counting'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        tasks = CountTask.objects.filter(item__warehouse=self.warehouse)
        self.assertEqual(tasks.count(), 2)
        task_items = set(tasks.values_list('item_id', flat=True))
        self.assertIn(self.item1.id, task_items)
        self.assertIn(self.item2.id, task_items)
        self.assertNotIn(self.item3.id, task_items)

    def test_05_redispatch_warning_and_force_override(self):
        """تست نمایش هشدار در صورت ارجاع مجدد کالای دارای تسک فعال و امکان بازتخصیص با force=True"""
        # الف) ایجاد تسک اولیه
        CountTask.objects.create(
            item=self.item4,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        # ب) ارجاع مجدد بدون force -> باید هشدار بازگرداند
        self.client.force_authenticate(user=self.manager)
        warn_resp = self.client.post('/api/inventory/items/bulk_assign/', {
            'item_ids': [self.item4.id],
            'field_assignee': self.counter2.id,
            'field_status': 'counting',
            'force': False
        }, format='json')
        self.assertEqual(warn_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(warn_resp.data.get('warning'))
        self.assertIn('دارای فرآیند شمارش فعال هستند', warn_resp.data.get('message', ''))

        # ج) ارجاع مجدد با force=True -> باید با موفقیت تسک جدید بسازد
        force_resp = self.client.post('/api/inventory/items/bulk_assign/', {
            'item_ids': [self.item4.id],
            'field_assignee': self.counter2.id,
            'field_status': 'counting',
            'force': True
        }, format='json')
        self.assertEqual(force_resp.status_code, status.HTTP_200_OK)
        self.assertNotIn('warning', force_resp.data)

    def test_06_multi_warehouse_dispatch_isolation(self):
        """تست ایزولاسیون انبارها: ارجاع انبار ۱ نباید بر انبار ۲ تاثیر بگذارد"""
        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/items/bulk_assign/', {
            'item_ids': [self.item_wh2.id],
            'field_assignee': self.counter.id,
            'field_status': 'counting'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        wh2_tasks = CountTask.objects.filter(item__warehouse=self.warehouse2)
        self.assertEqual(wh2_tasks.count(), 1)
        wh1_tasks = CountTask.objects.filter(item__warehouse=self.warehouse)
        self.assertEqual(wh1_tasks.count(), 0)


# ═══════════════════════════════════════════════════════════════════════════
# فاز ۲: استخر عمومی، رقابت همزمانی و ثبت شمارش میدانی (Pools & Field Counting)
# ═══════════════════════════════════════════════════════════════════════════
class InventoryPoolAndFieldCountingTests(BaseInventoryTestCase):
    """
    مجموعه تست‌های کارتابل شمارشگر، استخر عمومی و پیش‌نویس:
    ۷. استعلام استخر و Claim برای انبارگردان
    ۸. استعلام استخر و Claim برای سرپرست
    ۹. استعلام استخر و Claim برای مدیر
    ۱۰. رقابت همزمانی بین دو شمارشگر (Race condition prevention)
    ۱۱. ثبت و به‌روزرسانی پیش‌نویس موقت شمارشگر (INITIAL_COUNT)
    ۱۲. ثبت شمارش عدد صفر (Zero inventory) به عنوان مقدار معتبر
    ۱۳. ثبت شمارش با اعشار ۳ رقمی حساس (Decimal precision)
    ۱۴. ارسال گروهی شمارش‌ها (bulk_submit) و تفکیک مسیر سرپرست/مدیر
    ۱۵. پایداری Idempotency در ارسال مجدد تسک‌های شمارش
    ۱۶. ارسال با شناسه یکتای آفلاین (sync_id)
    ۱۷. به‌روزرسانی مشخصات و فیلدهای پویای کالا حین شمارش
    """

    def test_07_counter_pool_retrieval_and_claim(self):
        """تست مشاهده استخر عمومی توسط شمارشگر و بر عهده گرفتن موفق تسک"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=None,
            supervisor=self.supervisor,
            status='PENDING_COUNT'
        )

        # شمارشگر استخر انبار خود را می‌بیند
        self.client.force_authenticate(user=self.counter)
        pool_resp = self.client.get('/api/inventory/count-tasks/pool_tasks/', {
            'as_role': 'counter',
            'warehouse_id': self.warehouse.id
        })
        self.assertEqual(pool_resp.status_code, status.HTTP_200_OK)
        task_ids = [t['id'] for t in pool_resp.data]
        self.assertIn(task.id, task_ids)

        # شمارشگر تسک را بر عهده می‌گیرد (Claim)
        claim_resp = self.client.post('/api/inventory/count-tasks/claim_tasks/', {
            'task_ids': [task.id],
            'as_role': 'counter'
        }, format='json')
        self.assertEqual(claim_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(claim_resp.data.get('success'))

        task.refresh_from_db()
        self.assertEqual(task.counter, self.counter)

        self.item1.refresh_from_db()
        self.assertEqual(self.item1.field_assignee, f"{self.counter.first_name} {self.counter.last_name}")

    def test_08_supervisor_pool_retrieval_and_claim(self):
        """تست مشاهده استخر تسک‌های بدون سرپرست (COUNTED) و بر عهده گرفتن توسط سرپرست"""
        task = CountTask.objects.create(
            item=self.item2,
            counter=self.counter,
            supervisor=None,
            status='COUNTED',
            counted_balance=Decimal('50.000')
        )

        self.client.force_authenticate(user=self.supervisor)
        pool_resp = self.client.get('/api/inventory/count-tasks/pool_tasks/', {
            'as_role': 'supervisor',
            'warehouse_id': self.warehouse.id
        })
        self.assertEqual(pool_resp.status_code, status.HTTP_200_OK)
        task_ids = [t['id'] for t in pool_resp.data]
        self.assertIn(task.id, task_ids)

        claim_resp = self.client.post('/api/inventory/count-tasks/claim_tasks/', {
            'task_ids': [task.id],
            'as_role': 'supervisor'
        }, format='json')
        self.assertEqual(claim_resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.supervisor, self.supervisor)

    def test_09_manager_pool_retrieval_and_claim(self):
        """تست مشاهده استخر تسک‌های در انتظار مدیر (MANAGER_REVIEW) و بر عهده گرفتن توسط مدیر"""
        task = CountTask.objects.create(
            item=self.item3,
            counter=self.counter,
            supervisor=self.supervisor,
            assigned_manager=None,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('20.000')
        )

        self.client.force_authenticate(user=self.manager)
        pool_resp = self.client.get('/api/inventory/count-tasks/pool_tasks/', {
            'as_role': 'manager',
            'warehouse_id': self.warehouse.id
        })
        self.assertEqual(pool_resp.status_code, status.HTTP_200_OK)
        task_ids = [t['id'] for t in pool_resp.data]
        self.assertIn(task.id, task_ids)

        claim_resp = self.client.post('/api/inventory/count-tasks/claim_tasks/', {
            'task_ids': [task.id],
            'as_role': 'manager'
        }, format='json')
        self.assertEqual(claim_resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.assigned_manager, self.manager)

    def test_10_concurrent_claim_race_condition(self):
        """تست شبیه‌سازی رقابت همزمان دو انبارگردان: نفر اول برنده و نفر دوم پیام واضح دریافت می‌کند"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=None,
            status='PENDING_COUNT'
        )

        # انبارگردان ۱ سریع‌تر تسک را بر عهده می‌گیرد
        self.client.force_authenticate(user=self.counter)
        claim1 = self.client.post('/api/inventory/count-tasks/claim_tasks/', {
            'task_ids': [task.id],
            'as_role': 'counter'
        }, format='json')
        self.assertEqual(claim1.status_code, status.HTTP_200_OK)
        self.assertTrue(claim1.data.get('success'))

        # انبارگردان ۲ چند لحظه بعد تلاش می‌کند همان تسک را بر عهده بگیرد
        self.client.force_authenticate(user=self.counter2)
        claim2 = self.client.post('/api/inventory/count-tasks/claim_tasks/', {
            'task_ids': [task.id],
            'as_role': 'counter'
        }, format='json')
        self.assertEqual(claim2.status_code, status.HTTP_200_OK)
        self.assertFalse(claim2.data.get('success'))
        self.assertIn('قبلاً توسط انبارگردان دیگری بر عهده گرفته شده', claim2.data.get('message', ''))

        task.refresh_from_db()
        self.assertEqual(task.counter, self.counter)

    def test_11_initial_count_draft_and_note_updates(self):
        """تست ثبت پیش‌نویس موقت شمارش و ویرایش یادداشت قبل از ارسال قطعی"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.counter)
        # پیش‌نویس ۱
        patch1 = self.client.patch(f'/api/inventory/count-tasks/{task.id}/', {
            'status': 'INITIAL_COUNT',
            'counted_balance': Decimal('98.000'),
            'counter_note': 'شمارش ردیف اول'
        }, format='json')
        self.assertEqual(patch1.status_code, status.HTTP_200_OK)

        # ویرایش پیش‌نویس
        patch2 = self.client.patch(f'/api/inventory/count-tasks/{task.id}/', {
            'counted_balance': Decimal('100.000'),
            'counter_note': 'شمارش نهایی شد'
        }, format='json')
        self.assertEqual(patch2.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.counted_balance, Decimal('100.000'))
        self.assertEqual(task.counter_note, 'شمارش نهایی شد')

    def test_12_zero_count_validity(self):
        """تست ثبت معتبر موجودی صفر (0.000) به عنوان کسری کامل کالا"""
        task = CountTask.objects.create(
            item=self.item2,
            counter=self.counter,
            status='INITIAL_COUNT',
            counted_balance=Decimal('0.000'),
            counter_note='قفسه کاملاً خالی است'
        )

        self.client.force_authenticate(user=self.counter)
        submit_resp = self.client.post('/api/inventory/count-tasks/bulk_submit/', {
            'task_ids': [task.id],
            'warehouse_id': self.warehouse.id
        }, format='json')
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertIsNotNone(task.counted_balance)
        self.assertEqual(task.counted_balance, Decimal('0.000'))

    def test_13_high_precision_decimal_counting(self):
        """تست دقت ۳ رقمی اعشار در شمارش اقلام (مثلاً ۱۲.۳۴۵ کیلوگرم یا متر)"""
        task = CountTask.objects.create(
            item=self.item3,
            counter=self.counter,
            status='INITIAL_COUNT',
            counted_balance=Decimal('12.345')
        )

        self.client.force_authenticate(user=self.counter)
        submit_resp = self.client.post('/api/inventory/count-tasks/bulk_submit/', {
            'task_ids': [task.id],
            'warehouse_id': self.warehouse.id
        }, format='json')
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.counted_balance, Decimal('12.345'))

    def test_14_bulk_submit_routing_rules(self):
        """تست تفکیک هوشمند در ارسال گروهی: تسک نیازمند سرپرست به COUNTED و تسک skip به MANAGER_REVIEW می‌رود"""
        # تسک ۱: نیازمند سرپرست
        t1 = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            skip_supervisor=False,
            status='INITIAL_COUNT',
            counted_balance=Decimal('100.000')
        )
        # تسک ۲: بدون سرپرست
        t2 = CountTask.objects.create(
            item=self.item2,
            counter=self.counter,
            skip_supervisor=True,
            status='INITIAL_COUNT',
            counted_balance=Decimal('50.000')
        )

        self.client.force_authenticate(user=self.counter)
        submit_resp = self.client.post('/api/inventory/count-tasks/bulk_submit/', {
            'task_ids': [t1.id, t2.id],
            'warehouse_id': self.warehouse.id
        }, format='json')
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)

        t1.refresh_from_db()
        t2.refresh_from_db()
        self.assertEqual(t1.status, 'COUNTED')
        self.assertEqual(t2.status, 'MANAGER_REVIEW')

    def test_15_bulk_submit_idempotency(self):
        """تست Idempotency: ارسال مجدد درخواست تکراری نباید خطا تولید کند"""
        t = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='COUNTED',
            counted_balance=Decimal('100.000')
        )

        self.client.force_authenticate(user=self.counter)
        resubmit_resp = self.client.post('/api/inventory/count-tasks/bulk_submit/', {
            'task_ids': [t.id],
            'warehouse_id': self.warehouse.id
        }, format='json')
        self.assertEqual(resubmit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resubmit_resp.data.get('already_submitted'), 1)

    def test_16_counter_offline_sync_id_submission(self):
        """تست ارسال تسک بر اساس شناسه کلاینت آفلاین (sync_ids)"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='INITIAL_COUNT',
            counted_balance=Decimal('100.000')
        )

        self.client.force_authenticate(user=self.counter)
        resp = self.client.post('/api/inventory/count-tasks/bulk_submit/', {
            'sync_ids': [str(task.sync_id)],
            'warehouse_id': self.warehouse.id
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.status, 'COUNTED')

    def test_17_updating_dynamic_fields_and_item_details(self):
        """تست ثبت فیلدهای پویا و لوکیشن جدید توسط شمارشگر حین انبارگردانی"""
        self.client.force_authenticate(user=self.manager)
        resp = self.client.patch(f'/api/inventory/items/{self.item1.id}/', {
            'new_location': 'BAY-99-SHELF-04',
            'my_tag': 'سالم,بازبینی_شده',
            'dynamic_data': {
                'serial_no': 'SN-2026-XYZ',
                'inspection_status': 'Passed'
            }
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        self.item1.refresh_from_db()
        self.assertEqual(self.item1.new_location, 'BAY-99-SHELF-04')
        self.assertEqual(self.item1.my_tag, 'سالم,بازبینی_شده')
        self.assertEqual(self.item1.dynamic_data.get('serial_no'), 'SN-2026-XYZ')


# ═══════════════════════════════════════════════════════════════════════════
# فاز ۳: کارتابل سرپرستی و کارتابل مدیر و تحلیل مغایرت (Supervisor & Manager)
# ═══════════════════════════════════════════════════════════════════════════
class InventorySupervisorAndManagerReviewTests(BaseInventoryTestCase):
    """
    مجموعه تست‌های کارتابل سرپرستی، کارتابل مدیر و الگوریتم‌های مغایرت:
    ۱۸. فیلترهای کارتابل سرپرست
    ۱۹. تایید گروهی سرپرست (bulk_approve)
    ۲۰. رد تکی سرپرست به شمارشگر (reject)
    ۲۱. رد گروهی سرپرست (bulk_reject)
    ۲۲. اصلاح شمارش و ارسال مجدد توسط شمارشگر
    ۲۳. تایید نهایی مدیر برای اقلام بدون مغایرت (has_conflict=False)
    ۲۴. تایید نهایی مدیر برای اقلام دارای مغایرت (has_conflict=True)
    ۲۵. رد تکی مدیر در حضور سرپرست (MANAGER_REJECTED)
    ۲۶. رد تکی مدیر در حالت بدون سرپرست (PENDING_COUNT با ریست مقدار)
    ۲۷. رد گروهی مدیر با مسیریابی هوشمند (bulk_manager_reject)
    ۲۸. اجباری بودن یادداشت علت بازشماری در رد مدیر
    ۲۹. دورهای بازشماری نامحدود (تکرار ۵ دور متوالی بدون خطا)
    ۳۰. رفع خودکار مغایرت در دور بازشماری
    """

    def test_18_supervisor_view_and_filtering(self):
        """تست فیلتر کارتابل سرپرست بر اساس نقش و انبار"""
        CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='COUNTED',
            counted_balance=Decimal('100.000')
        )

        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.get('/api/inventory/count-tasks/', {
            'as_role': 'supervisor',
            'warehouse_id': self.warehouse.id,
            'status': 'COUNTED'
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get('results', resp.data)
        self.assertEqual(len(results), 1)

    def test_19_supervisor_bulk_approve(self):
        """تست تایید گروهی اقلام شمرده شده توسط سرپرست و ارسال به مدیر"""
        t1 = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='COUNTED',
            counted_balance=Decimal('100.000')
        )
        t2 = CountTask.objects.create(
            item=self.item2,
            counter=self.counter,
            supervisor=self.supervisor,
            status='COUNTED',
            counted_balance=Decimal('50.000')
        )

        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.post('/api/inventory/count-tasks/bulk_approve/', {
            'task_ids': [t1.id, t2.id],
            'note': 'تایید سرپرست: شمارش هر دو قلم تایید است'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        t1.refresh_from_db()
        t2.refresh_from_db()
        self.assertEqual(t1.status, 'MANAGER_REVIEW')
        self.assertEqual(t2.status, 'MANAGER_REVIEW')
        self.assertEqual(t1.supervisor_note, 'تایید سرپرست: شمارش هر دو قلم تایید است')

    def test_20_supervisor_single_reject_to_counter(self):
        """تست رد تکی سرپرست و بازگشت تسک به انبارگردان"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='COUNTED',
            counted_balance=Decimal('90.000')
        )

        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.post(f'/api/inventory/count-tasks/{task.id}/reject/', {
            'note': 'تعداد قفسه بالا شمرده نشده است'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.status, 'SUPERVISOR_REJECTED')
        self.assertEqual(task.supervisor_note, 'تعداد قفسه بالا شمرده نشده است')

    def test_21_supervisor_bulk_reject(self):
        """تست رد گروهی سرپرست برای چندین تسک"""
        t1 = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='COUNTED',
            counted_balance=Decimal('90.000')
        )
        t2 = CountTask.objects.create(
            item=self.item2,
            counter=self.counter,
            supervisor=self.supervisor,
            status='COUNTED',
            counted_balance=Decimal('40.000')
        )

        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.post('/api/inventory/count-tasks/bulk_reject/', {
            'task_ids': [t1.id, t2.id],
            'note': 'بازشماری مجدد به دلیل ابهام در پالت‌ها'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        t1.refresh_from_db()
        t2.refresh_from_db()
        self.assertEqual(t1.status, 'SUPERVISOR_REJECTED')
        self.assertEqual(t2.status, 'SUPERVISOR_REJECTED')

    def test_22_counter_recount_and_resubmit_after_supervisor_reject(self):
        """تست اصلاح و ارسال مجدد شمارش توسط انبارگردان پس از رد سرپرست"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='SUPERVISOR_REJECTED',
            counted_balance=Decimal('90.000')
        )

        self.client.force_authenticate(user=self.counter)
        task.status = 'INITIAL_COUNT'
        task.counted_balance = Decimal('100.000')
        task.counter_note = 'مجدداً شمارش شد و ۱۰ عدد قفسه بالا اضافه گردید'
        task.save()

        submit_resp = self.client.post('/api/inventory/count-tasks/bulk_submit/', {
            'task_ids': [task.id],
            'warehouse_id': self.warehouse.id
        }, format='json')
        self.assertEqual(submit_resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.status, 'COUNTED')
        self.assertEqual(task.counted_balance, Decimal('100.000'))

    def test_23_manager_final_approval_perfect_match(self):
        """تست تایید نهایی مدیر برای کالای بدون مغایرت (counted_balance == bal4miv)"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            assigned_manager=self.manager,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('100.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/bulk_manager_approve/', {
            'task_ids': [task.id],
            'note': 'تایید نهایی بدون مغایرت'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.item1.refresh_from_db()
        self.assertEqual(task.status, 'FINAL_APPROVED')
        self.assertEqual(self.item1.field_status, 'done')
        self.assertEqual(self.item1.inventory, Decimal('100.000'))
        self.assertFalse(self.item1.has_conflict)

    def test_24_manager_final_approval_with_discrepancy(self):
        """تست تایید نهایی مدیر برای کالای دارای مغایرت (علامت‌گذاری خودکار has_conflict=True)"""
        task = CountTask.objects.create(
            item=self.item2,  # bal4miv = 50
            counter=self.counter,
            supervisor=self.supervisor,
            assigned_manager=self.manager,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('42.000')  # ۸ عدد کسری
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/bulk_manager_approve/', {
            'task_ids': [task.id],
            'note': 'تایید کسری ۸ عددی'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.item2.refresh_from_db()
        self.assertEqual(task.status, 'FINAL_APPROVED')
        self.assertEqual(self.item2.field_status, 'done')
        self.assertEqual(self.item2.inventory, Decimal('42.000'))
        self.assertTrue(self.item2.has_conflict)

    def test_25_manager_single_reject_routing_with_supervisor(self):
        """تست رد مدیر در حضور سرپرست -> ارسال به سرپرست با وضعیت MANAGER_REJECTED و حفظ مقدار شمرده‌شده"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            assigned_manager=self.manager,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('85.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post(f'/api/inventory/count-tasks/{task.id}/manager_reject/', {
            'note': 'کسری غیرعادی است، سرپرست بررسی کند'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.status, 'MANAGER_REJECTED')
        self.assertEqual(task.counted_balance, Decimal('85.000'))
        self.assertEqual(task.manager_note, 'کسری غیرعادی است، سرپرست بررسی کند')

    def test_26_manager_single_reject_routing_without_supervisor(self):
        """تست رد مدیر بدون سرپرست -> ارجاع مستقیم به انبارگردان (PENDING_COUNT) و ریست مقدار شمرده‌شده"""
        task = CountTask.objects.create(
            item=self.item3,
            counter=self.counter,
            supervisor=None,
            skip_supervisor=True,
            assigned_manager=self.manager,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('15.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post(f'/api/inventory/count-tasks/{task.id}/manager_reject/', {
            'note': 'شمارش مجدد بدون سرپرست'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        task.refresh_from_db()
        self.assertEqual(task.status, 'PENDING_COUNT')
        self.assertIsNone(task.counted_balance)

    def test_27_manager_bulk_reject_mixed_routing(self):
        """تست رد گروهی مدیر برای مجموعه‌ای از تسک‌ها و مسیریابی هوشمند هر تسک"""
        t_with_sup = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('90.000')
        )
        t_no_sup = CountTask.objects.create(
            item=self.item2,
            counter=self.counter,
            supervisor=None,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('40.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/bulk_manager_reject/', {
            'task_ids': [t_with_sup.id, t_no_sup.id],
            'note': 'دستور بازشماری گروهی توسط مدیر'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        t_with_sup.refresh_from_db()
        t_no_sup.refresh_from_db()
        self.assertEqual(t_with_sup.status, 'MANAGER_REJECTED')
        self.assertEqual(t_no_sup.status, 'PENDING_COUNT')

    def test_28_manager_reject_note_mandatory(self):
        """تست اعتبارسنجی الزامی بودن یادداشت علت بازشماری در رد مدیر"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('90.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post(f'/api/inventory/count-tasks/{task.id}/manager_reject/', {
            'note': '   '  # یادداشت خالی
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('علت بازشماری', resp.data.get('error', ''))

    def test_29_unlimited_recount_cycles(self):
        """تست بازشماری نامحدود: اجرای ۵ دور متوالی رد و بازشماری بدون محدودیت سقف ۳ بار"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            assigned_manager=self.manager,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('80.000')
        )

        self.client.force_authenticate(user=self.manager)
        for cycle in range(1, 6):
            task.status = 'MANAGER_REVIEW'
            task.counted_balance = Decimal('80.000')
            task.save()

            reject_resp = self.client.post(f'/api/inventory/count-tasks/{task.id}/manager_reject/', {
                'note': f'رد مدیر دور {cycle}'
            }, format='json')
            self.assertEqual(reject_resp.status_code, status.HTTP_200_OK, f"رد در دور {cycle} ناموفق بود")

            task.refresh_from_db()
            self.assertEqual(task.status, 'MANAGER_REJECTED')

    def test_30_conflict_resolution_after_successful_recount(self):
        """تست رفع خودکار پرچم مغایرت هنگامی که شمارش مجدد با موجودی دفتری منطبق می‌شود"""
        self.item5.has_conflict = True
        self.item5.bal4miv = Decimal('500.000')
        self.item5.save()

        task = CountTask.objects.create(
            item=self.item5,
            counter=self.counter,
            supervisor=self.supervisor,
            assigned_manager=self.manager,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('500.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/bulk_manager_approve/', {
            'task_ids': [task.id]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        self.item5.refresh_from_db()
        self.assertFalse(self.item5.has_conflict)
        self.assertEqual(self.item5.inventory, Decimal('500.000'))


# ═══════════════════════════════════════════════════════════════════════════
# فاز ۴: لغو، شمارش کور، همگام‌سازی، امنیت RBAC و اکسل (Advanced Scenarios)
# ═══════════════════════════════════════════════════════════════════════════
class InventoryAdvancedWorkflowsAndRBACTests(BaseInventoryTestCase):
    """
    مجموعه تست‌های پیشرفته، امنیت و همگام‌سازی:
    ۳۱. لغو تخصیص موفق تسک‌های PENDING_COUNT و INITIAL_COUNT و ریست کالا
    ۳۲. ممانعت از لغو تسک‌های در جریان پیشرفته (COUNTED, MANAGER_REVIEW, FINAL_APPROVED)
    ۳۳. مدیریت لغو گروهی با تسک‌های ترکیبی مجاز و غیرمجاز
    ۳۴. پنهان‌سازی موجودی دفتری در حالت شمارش کور (blind_counting) برای شمارشگر
    ۳۵. عدم پنهان‌سازی موجودی دفتری برای مدیر و سرپرست
    ۳۶. تداخل همزمانی خوش‌بینانه و خطای 409 Conflict با base_updated_at
    ۳۷. حذف نرم و تولید تومب‌استون دلتا در sync/pull
    ۳۸. ثبت کامل زنجیره تاریخچه CountTaskHistory
    ۳۹. تولید رویدادهای AuditLog سیستم
    ۴۰. مسدودسازی درخواست‌های احرازهویت‌نشده
    ۴۱. ممانعت از اقدامات فراتر از نقش برای شمارشگر
    ۴۲. ممانعت از تایید نهایی توسط سرپرست
    ۴۳. تفکیک تسک‌های خصوصی بین شمارشگران مختلف
    ۴۴. دریافت متادیتای ستون‌های اکسل کارتابل
    ۴۵. تولید و دانلود فایل اکسل کارتابل بدون خطا
    """

    def test_31_bulk_cancel_eligible_tasks_and_reset_item(self):
        """تست لغو موفق تسک‌های در انتظار و ریست وضعیت کالا به checking و حذف انتساب"""
        self.item1.field_status = 'counting'
        self.item1.field_assignee = 'انبارگردان میدانی ۱'
        self.item1.save()

        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/bulk_cancel/', {
            'task_ids': [task.id]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        self.assertFalse(CountTask.objects.filter(id=task.id).exists())
        self.item1.refresh_from_db()
        self.assertEqual(self.item1.field_status, 'checking')
        self.assertIsNone(self.item1.field_assignee)

    def test_32_bulk_cancel_prevent_advanced_tasks(self):
        """تست ممانعت از لغو تسک‌هایی که در وضعیت‌های پیشرفته هستند (مانند COUNTED)"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='COUNTED',
            counted_balance=Decimal('100.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/bulk_cancel/', {
            'task_ids': [task.id]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(CountTask.objects.filter(id=task.id).exists())

    def test_33_bulk_cancel_partial_eligibility(self):
        """تست لغو گروهی با اقلام ترکیبی: حذف مجازها و گزارش نادیده گرفتن نامجازها"""
        t_eligible = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='INITIAL_COUNT',
            counted_balance=Decimal('100.000')
        )
        t_ineligible = CountTask.objects.create(
            item=self.item2,
            counter=self.counter,
            status='COUNTED',
            counted_balance=Decimal('50.000')
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/bulk_cancel/', {
            'task_ids': [t_eligible.id, t_ineligible.id]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('1 وظیفه شمارش با موفقیت لغو تخصیص شد', resp.data.get('message', ''))
        self.assertIn('1 رکورد به دلیل وضعیت نامعتبر نادیده گرفته شد', resp.data.get('message', ''))

        self.assertFalse(CountTask.objects.filter(id=t_eligible.id).exists())
        self.assertTrue(CountTask.objects.filter(id=t_ineligible.id).exists())

    def test_34_blind_counting_redaction_for_counter(self):
        """تست پنهان‌سازی موجودی دفتری در حالت شمارش کور برای انبارگردان"""
        SystemSetting.objects.update_or_create(
            key='blind_counting',
            warehouse_id=self.warehouse.id,
            defaults={'value': 'blind'}
        )

        CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.counter)
        pull_resp = self.client.get('/api/inventory/sync/pull/', {
            'warehouse_id': self.warehouse.id,
            'models': 'items,count_tasks'
        })
        self.assertEqual(pull_resp.status_code, status.HTTP_200_OK)

        items = pull_resp.data.get('results', {}).get('items', [])
        for itm in items:
            self.assertNotIn('inventory', itm)
            self.assertNotIn('bal4miv', itm)

    def test_35_blind_counting_exemption_for_manager(self):
        """تست عدم پنهان‌سازی موجودی دفتری برای مدیر حتی در حالت شمارش کور"""
        SystemSetting.objects.update_or_create(
            key='blind_counting',
            warehouse_id=self.warehouse.id,
            defaults={'value': 'blind'}
        )

        CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.manager)
        pull_resp = self.client.get('/api/inventory/sync/pull/', {
            'warehouse_id': self.warehouse.id,
            'models': 'items,count_tasks'
        })
        self.assertEqual(pull_resp.status_code, status.HTTP_200_OK)

        items = pull_resp.data.get('results', {}).get('items', [])
        found_item = next((i for i in items if i['id'] == self.item1.id), None)
        if found_item:
            self.assertIn('inventory', found_item)
            self.assertIn('bal4miv', found_item)

    def test_36_optimistic_concurrency_409_conflict(self):
        """تست تداخل همزمانی خوش‌بینانه با ارسال base_updated_at قدیمی و خطای 409"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.counter)
        conflict_resp = self.client.patch(f'/api/inventory/count-tasks/{task.id}/', {
            'counted_balance': Decimal('100.000'),
            'base_updated_at': '2019-01-01T00:00:00Z'
        }, format='json')
        self.assertEqual(conflict_resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('server_record', conflict_resp.data)

    def test_37_soft_delete_and_delta_sync_tombstone(self):
        """تست حذف نرم تسک و دریافت تومب‌استون با is_deleted=True در سینک دلتا"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )
        task_sync_id = str(task.sync_id)
        task.soft_delete()

        self.client.force_authenticate(user=self.counter)
        pull_resp = self.client.get('/api/inventory/sync/pull/', {
            'warehouse_id': self.warehouse.id,
            'models': 'count_tasks'
        })
        self.assertEqual(pull_resp.status_code, status.HTTP_200_OK)

        tasks = pull_resp.data.get('results', {}).get('count_tasks', [])
        deleted_task = next((t for t in tasks if str(t.get('sync_id')) == task_sync_id), None)
        self.assertIsNotNone(deleted_task)
        self.assertTrue(deleted_task.get('is_deleted'))

    def test_38_complete_count_task_history_audit_trail(self):
        """تست ثبت زنجیره کامل تاریخچه اقدامات در CountTaskHistory"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.counter)
        self.client.patch(f'/api/inventory/count-tasks/{task.id}/', {
            'status': 'INITIAL_COUNT',
            'counted_balance': Decimal('100.000'),
            'counter_note': 'یادداشت اولیه'
        }, format='json')

        histories = CountTaskHistory.objects.filter(task=task)
        self.assertTrue(histories.exists())
        last_hist = histories.last()
        self.assertEqual(last_hist.action_type, 'INITIAL_COUNT')
        self.assertEqual(last_hist.counted_balance, Decimal('100.000'))

    def test_39_system_audit_event_generation(self):
        """تست تولید رویداد در لاگ تغییرات سیستم هنگام تغییر وضعیت تسک شمارش"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.counter)
        self.client.patch(f'/api/inventory/count-tasks/{task.id}/', {
            'status': 'INITIAL_COUNT',
            'counted_balance': Decimal('100.000')
        }, format='json')

        from accounts.models import AuditLog
        audit_exists = AuditLog.objects.filter(target_model='CountTask', target_object_id=str(task.id)).exists()
        self.assertTrue(audit_exists)

    def test_40_unauthenticated_requests_blocked(self):
        """تست مسدودسازی درخواست‌های احرازهویت‌نشده با خطای 401"""
        self.client.force_authenticate(user=None)
        resp = self.client.get('/api/inventory/count-tasks/')
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_41_counter_cannot_perform_supervisor_or_manager_actions(self):
        """تست ممانعت از اجرای تایید سرپرست یا تایید نهایی مدیر توسط انبارگردان"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='COUNTED',
            counted_balance=Decimal('100.000')
        )

        self.client.force_authenticate(user=self.counter)
        # شمارشگر نباید بتواند تایید نهایی مدیر را اجرا کند
        mgr_resp = self.client.post('/api/inventory/count-tasks/bulk_manager_approve/', {
            'task_ids': [task.id]
        }, format='json')
        self.assertEqual(mgr_resp.status_code, status.HTTP_403_FORBIDDEN)

        # شمارشگر نباید بتواند تایید سرپرست را اجرا کند
        sup_resp = self.client.post('/api/inventory/count-tasks/bulk_approve/', {
            'task_ids': [task.id]
        }, format='json')
        self.assertEqual(sup_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_42_supervisor_cannot_perform_final_approval(self):
        """تست ممانعت از اجرای تایید نهایی مدیر توسط سرپرست"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            supervisor=self.supervisor,
            status='MANAGER_REVIEW',
            counted_balance=Decimal('100.000')
        )

        self.client.force_authenticate(user=self.supervisor)
        resp = self.client.post('/api/inventory/count-tasks/bulk_manager_approve/', {
            'task_ids': [task.id]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_43_cross_user_task_isolation(self):
        """تست ایزولاسیون کارتابل شمارشگر: شمارشگر ۱ نباید تسک‌های اختصاصی شمارشگر ۲ را در لیست خود ببیند"""
        t1 = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )
        t2 = CountTask.objects.create(
            item=self.item2,
            counter=self.counter2,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.counter)
        resp = self.client.get('/api/inventory/count-tasks/', {'as_role': 'counter'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get('results', resp.data)
        task_ids = [t['id'] for t in results]
        self.assertIn(t1.id, task_ids)
        self.assertNotIn(t2.id, task_ids)

    def test_44_get_export_columns_metadata(self):
        """تست دریافت متادیتای ستون‌های خروجی اکسل کارتابل انبارگردانی"""
        self.client.force_authenticate(user=self.manager)
        resp = self.client.get('/api/inventory/count-tasks/get_export_columns/', {
            'warehouse_id': self.warehouse.id
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        columns = resp.data if isinstance(resp.data, list) else resp.data.get('columns', [])
        col_keys = [c['key'] for c in columns]
        self.assertIn('fa_unic_code', col_keys)
        self.assertIn('counted_balance', col_keys)

    def test_45_export_excel_endpoint(self):
        """تست خروجی اکسل تسک‌های انبارگردانی و دریافت فایل Spreadsheet"""
        CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/export_excel/', {
            'warehouse_id': self.warehouse.id,
            'as_role': 'manager'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    def test_46_export_excel_with_active_search_query(self):
        """تست خروجی اکسل با کلمه جستجوی فعال بدون بروز خطای ۵۰۰ FieldError"""
        CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.manager)
        resp = self.client.post('/api/inventory/count-tasks/export_excel/', {
            'warehouse_id': self.warehouse.id,
            'as_role': 'manager',
            'q': 'VALVE-101'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    def test_47_manager_supervisor_blind_mode_context(self):
        """تست نمایش موجودی دفتری و سیستم برای مدیر و سرپرست حتی در حالت شمارش کور"""
        SystemSetting.objects.create(
            warehouse_id=self.warehouse.id,
            key='blind_counting',
            value='blind'
        )
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='MANAGER_REVIEW'
        )

        # نقش مدیر: باید موجودی را دریافت کند
        self.client.force_authenticate(user=self.manager)
        resp = self.client.get('/api/inventory/count-tasks/', {'as_role': 'manager'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        res_list = resp.data.get('results', resp.data)
        manager_task = next((t for t in res_list if t['id'] == task.id), None)
        self.assertIsNotNone(manager_task)
        self.assertIn('inventory', manager_task['item_details'])
        self.assertIn('bal4miv', manager_task['item_details'])

    def test_48_patch_disallows_direct_final_approval(self):
        """تست مسدود بودن تغییر مستقیم وضعیت تسک به FINAL_APPROVED با متد PATCH"""
        task = CountTask.objects.create(
            item=self.item1,
            counter=self.counter,
            status='PENDING_COUNT'
        )

        self.client.force_authenticate(user=self.counter)
        resp = self.client.patch(f'/api/inventory/count-tasks/{task.id}/', {
            'status': 'FINAL_APPROVED'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        task.refresh_from_db()
        self.assertEqual(task.status, 'PENDING_COUNT')

    def test_49_bulk_manager_approve_reject_idor_guard(self):
        """تست گارد امنیتی انبار (IDOR) در تایید و رد گروهی مدیر"""
        # ساخت کاربری که فقط به warehouse1 دسترسی دارد
        restricted_mgr = User.objects.create_user(
            username="restricted_mgr",
            password="Password123!"
        )
        restricted_mgr = self._assign_perms(restricted_mgr, [
            'view_sys_manager_review',
            'can_act_as_manager',
            'perm_inventory_finalize'
        ])
        restricted_mgr.assigned_warehouses.set([self.warehouse])

        # کالایی در انبار دوم (warehouse2)
        item_other = Item.objects.create(
            warehouse=self.warehouse2,
            fa_unic_code="UN-OTHER-99",
            description="Other warehouse item",
            inventory=Decimal("50"),
            bal4miv=Decimal("50")
        )
        task_other = CountTask.objects.create(
            item=item_other,
            counter=self.counter,
            status='MANAGER_REVIEW',
            counted_balance=Decimal("55")
        )

        self.client.force_authenticate(user=restricted_mgr)
        # تلاش برای تایید کالای انبار دیگر
        resp_app = self.client.post('/api/inventory/count-tasks/bulk_manager_approve/', {
            'task_ids': [task_other.id]
        }, format='json')
        self.assertEqual(resp_app.status_code, status.HTTP_403_FORBIDDEN)

        # تلاش برای رد کالای انبار دیگر
        resp_rej = self.client.post('/api/inventory/count-tasks/bulk_manager_reject/', {
            'task_ids': [task_other.id],
            'note': 'تست رد'
        }, format='json')
        self.assertEqual(resp_rej.status_code, status.HTTP_403_FORBIDDEN)


from django.test import TransactionTestCase

class ExcelImportAndAuditLoggingTestCase(TransactionTestCase):
    """تست اعتبارسنجی ورود اکسل کالاها و لاگ‌گیری ممیزی بدون خطای logger"""

    def setUp(self):
        super().setUp()
        self.warehouse = Warehouse.objects.create(
            name="انبار تست اکسل",
            project_name="پروژه تست"
        )
        self.admin = User.objects.create_superuser(
            username="admin_excel",
            email="admin_excel@test.com",
            password="Password123!"
        )
        self.client = APIClient()

    def test_log_audit_event_supports_warehouse_id_and_object(self):
        from accounts.audit_utils import log_audit_event
        # تست با آبجکت انبار
        entry1 = log_audit_event(
            module='docs',
            action='IMPORT',
            user=self.admin,
            warehouse=self.warehouse,
            target_model='Item'
        )
        self.assertIsNotNone(entry1)
        self.assertEqual(entry1.warehouse, self.warehouse)
        self.assertEqual(entry1.warehouse_id, self.warehouse.id)

        # تست با warehouse_id عددی (که قبلاً خطا می‌داد)
        entry2 = log_audit_event(
            module='docs',
            action='IMPORT',
            user=self.admin,
            warehouse_id=self.warehouse.id,
            target_model='Item'
        )
        self.assertIsNotNone(entry2)
        self.assertEqual(entry2.warehouse, self.warehouse)
        self.assertEqual(entry2.warehouse_id, self.warehouse.id)

    def test_excel_import_endpoint_success(self):
        import io
        import openpyxl
        from django.core.files.uploadedfile import SimpleUploadedFile

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['fa_unic_code', 'description', 'inventory'])
        ws.append(['TEST-ITEM-1001', 'کالای تستی ورود اکسل ۱', 50])
        ws.append(['TEST-ITEM-1002', 'کالای تستی ورود اکسل ۲', 120])
        
        file_io = io.BytesIO()
        wb.save(file_io)
        file_io.seek(0)
        
        upload_file = SimpleUploadedFile(
            "test_items.xlsx",
            file_io.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/inventory/items/import_excel/', {
            'file': upload_file,
            'warehouse_id': self.warehouse.id,
            'conflict_strategy': 'replace'
        }, format='multipart')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # خروجی استریم ndjson از نوع async generator است
        async def consume_stream():
            chunks = []
            async for chunk in resp.streaming_content:
                if isinstance(chunk, str):
                    chunks.append(chunk)
                else:
                    chunks.append(chunk.decode('utf-8'))
            return "".join(chunks)

        import asyncio
        content = asyncio.run(consume_stream())

        self.assertNotIn("خطای سیستمی: name 'logger' is not defined", content)
        self.assertIn('"status": "success"', content)
        
        # بررسی اینکه کالاها حتماً در دیتابیس ذخیره شده‌اند و رول‌بک نشده‌اند
        self.assertTrue(Item.objects.filter(fa_unic_code='TEST-ITEM-1001', warehouse=self.warehouse).exists())
        self.assertTrue(Item.objects.filter(fa_unic_code='TEST-ITEM-1002', warehouse=self.warehouse).exists())

    def test_filter_by_deleted_or_nonexistent_warehouse_does_not_error(self):
        """اعتبارسنجی اینکه فیلتر با شناسه انبار حذف‌شده یا ناموجود باعث خطای 400 جنگو نمی‌شود"""
        self.client.force_authenticate(user=self.admin)
        non_existent_wh_id = 999999
        
        # ۱. تست فیلتر کالاها با شناسه انبار ناموجود — باید 200 با نتیجه خالی برگردد نه خطای 400
        resp_items = self.client.get(f'/api/inventory/items/?warehouse={non_existent_wh_id}')
        self.assertEqual(resp_items.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_items.data.get('results', [])), 0)

        # ۲. تست فیلتر فیلدهای پویا با شناسه انبار ناموجود
        resp_fields = self.client.get(f'/api/inventory/dynamic-fields/?warehouse={non_existent_wh_id}')
        self.assertEqual(resp_fields.status_code, status.HTTP_200_OK)



