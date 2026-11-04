from datetime import timedelta
from django.utils import timezone
from django.core.cache import cache
from rest_framework import status

from communications.models import ChatPresence, ConversationType
from communications.presence import (
    connect_user_sync, disconnect_user_sync, touch_online_user_sync,
    record_last_seen_sync, _last_seen_throttle_key, _last_seen_cache_key,
    _count_key
)
from integration_tests.communications.test_chat_access import ChatAccessTestBase, CONV_URL


class ChatPresenceRecordingTests(ChatAccessTestBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.user = self.make_user(username='u_presence_test')

    def tearDown(self):
        cache.clear()
        super().tearDown()

    def test_disconnect_to_zero_records_last_seen(self):
        """قطع ارتباط تا صفر: ChatPresence.last_seen_at ثبت می‌شود"""
        # کاربر متصل می‌شود
        connect_user_sync(self.user.id)
        self.assertTrue(ChatPresence.objects.filter(user=self.user).exists())

        # تغییر زمان به ۱۰ دقیقه پیش جهت آزمایش بروزرسانی هنگام قطع
        old_time = timezone.now() - timedelta(minutes=10)
        ChatPresence.objects.filter(user=self.user).update(last_seen_at=old_time)

        # قطع اتصال تا رسیدن به صفر
        remaining = disconnect_user_sync(self.user.id)
        self.assertEqual(remaining, 0)

        presence = ChatPresence.objects.get(user=self.user)
        # زمان ثبت‌شده باید جدید باشد (بیش از ۹ دقیقه بعد از زمان قبلی)
        self.assertGreater(presence.last_seen_at, old_time + timedelta(minutes=9))

    def test_throttle_60s_on_connect_and_touch(self):
        """بروزرسانی در اتصال و ping حداکثر هر ۶۰ ثانیه یک بار در دیتابیس نوشته می‌شود"""
        now = timezone.now()
        # فراخوانی اولیه
        record_last_seen_sync(self.user.id, force=False)
        p1 = ChatPresence.objects.get(user=self.user)

        # دستکاری زمان رکورد به ۳۰ ثانیه قبل
        past_time = now - timedelta(seconds=30)
        ChatPresence.objects.filter(user=self.user).update(last_seen_at=past_time)

        # فراخوانی دوباره در فاصله کمتر از ۶۰ ثانیه (کلید throttle در کش وجود دارد)
        touch_online_user_sync(self.user.id)
        p2 = ChatPresence.objects.get(user=self.user)
        # دیتابیس تغییر نمی‌کند چون throttle فعال است
        self.assertEqual(p2.last_seen_at, past_time)

        # پاک کردن کش throttle برای شبیه‌سازی گذشت ۶۰ ثانیه
        cache.delete(_last_seen_throttle_key(self.user.id))
        touch_online_user_sync(self.user.id)
        p3 = ChatPresence.objects.get(user=self.user)
        # پس از گذشت ۶۰ ثانیه رکورد بروزرسانی می‌شود
        self.assertGreater(p3.last_seen_at, past_time)


class ChatPresencePrivacyTenantScopeTests(ChatAccessTestBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        # ایجاد دو شرکت مجزا با پیش‌فرض حوزهٔ شرکت
        self.co_a = self.make_company()
        self.co_b = self.make_company()
        self.sec_a = self.make_section(self.make_project(self.co_a))
        self.sec_b = self.make_section(self.make_project(self.co_b))

        self.user_a1 = self.make_user(username='a1')
        self.user_a2 = self.make_user(username='a2')
        self.user_b1 = self.make_user(username='b1')

        self.assign_section(self.user_a1, self.sec_a)
        self.assign_section(self.user_a2, self.sec_a)
        self.assign_section(self.user_b1, self.sec_b)

        # ایجاد رکوردهای حضور
        self.a2_time = timezone.now() - timedelta(minutes=15)
        self.b1_time = timezone.now() - timedelta(hours=2)
        ChatPresence.objects.create(user=self.user_a2, last_seen_at=self.a2_time)
        ChatPresence.objects.create(user=self.user_b1, last_seen_at=self.b1_time)

    def tearDown(self):
        cache.clear()
        super().tearDown()

    def test_direct_chat_within_scope_exposes_last_seen(self):
        """کاربر درون حوزهٔ مخاطبان (همان شرکت): آخرین بازدید طرف مقابل در گفتگوی دونفره نمایش داده می‌شود"""
        conv = self.make_direct(self.user_a1, self.user_a2)
        self.auth(self.user_a1)

        res = self.client.get(f'{CONV_URL}{conv.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        self.assertIsNotNone(data.get('other_user_last_seen_at'))
        self.assertEqual(data.get('last_seen_at'), data.get('other_user_last_seen_at'))

        # در participants_details فقط طرف مقابل مقدار دارد
        details = {p['id']: p.get('last_seen_at') for p in data.get('participants_details', [])}
        self.assertIsNotNone(details.get(self.user_a2.id))
        self.assertIsNone(details.get(self.user_a1.id))

    def test_direct_chat_cross_tenant_outside_scope_returns_none(self):
        """کاربر بیرون از حوزه (شرکت دیگر): آخرین بازدید null می‌شود و نشت نمی‌کند"""
        # گفتگوی دونفره بین کاربر شرکت الف و شرکت ب
        conv = self.make_direct(self.user_a1, self.user_b1)
        self.auth(self.user_a1)

        res = self.client.get(f'{CONV_URL}{conv.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        # به دلیل عدم اجازهٔ contact_scope، مقدار last_seen نشت نمی‌کند
        self.assertIsNone(data.get('other_user_last_seen_at'))
        self.assertIsNone(data.get('last_seen_at'))

        details = {p['id']: p.get('last_seen_at') for p in data.get('participants_details', [])}
        self.assertIsNone(details.get(self.user_b1.id))
        self.assertIsNone(details.get(self.user_a1.id))

    def test_superuser_sees_last_seen_across_tenants(self):
        """مدیر کل همیشه به تمام حوزه‌ها دسترسی دارد و آخرین بازدید را می‌بیند"""
        conv = self.make_direct(self.superuser, self.user_b1)
        self.auth(self.superuser)

        res = self.client.get(f'{CONV_URL}{conv.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIsNotNone(data.get('other_user_last_seen_at'))

    def test_group_chat_never_exposes_last_seen(self):
        """در گفتگوهای گروهی، آخرین بازدید هیچ کاربری فاش نمی‌شود"""
        conv = self.make_group(self.user_a1, [self.user_a1, self.user_a2])
        self.auth(self.user_a1)

        res = self.client.get(f'{CONV_URL}{conv.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        self.assertIsNone(data.get('other_user_last_seen_at'))
        self.assertIsNone(data.get('last_seen_at'))
        for p in data.get('participants_details', []):
            self.assertIsNone(p.get('last_seen_at'))

    def test_blocked_chat_user_gets_none(self):
        """کاربری که چتش مسدود شده آخرین بازدید را دریافت نمی‌کند"""
        self.set_user_policy(self.user_a1, chat_allowed=False)
        conv = self.make_direct(self.user_a1, self.user_a2)
        self.auth(self.user_a1)

        res = self.client.get(f'{CONV_URL}{conv.id}/')
        # حتی اگر به شیء دسترسی داشته باشد، last_seen_at نشت نمی‌کند
        if res.status_code == status.HTTP_200_OK:
            self.assertIsNone(res.json().get('other_user_last_seen_at'))
