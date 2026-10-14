import json
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from warehouses.models import Warehouse
from inventory.models import Item
from communications.models import (
    Conversation, Message, MessageAttachment, GenericComment, ConversationType
)

User = get_user_model()


class BaseCommsTestCase(TestCase):
    """
    کلاس پایه جهت راه‌اندازی و ایزولاسیون داده‌های آزمون سیستم ارتباطات
    دارای ۲ انبار، ۵ کاربر با سطوح دسترسی تفکیک‌شده و گفتگوهای نمونه
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()

        # ۱. ساخت انبارهای تستی (انبار ۱ و انبار ۲)
        self.wh1 = Warehouse.objects.create(
            name="انبار مرکزی ۱",
            project_name="پروژه شیراز"
        )
        self.wh2 = Warehouse.objects.create(
            name="انبار فرعی ۲",
            project_name="پروژه بوشهر"
        )

        # ۲. ساخت کاربران
        # سوپریوزر
        self.admin = User.objects.create_superuser(
            username="admin_comms",
            email="admin_comms@test.com",
            password="Password123!"
        )

        # مدیر انبار ۱
        self.manager_wh1 = User.objects.create_user(
            username="manager_wh1",
            first_name="مدیر",
            last_name="انبار یک",
            password="Password123!",
            is_staff=True
        )
        self.manager_wh1.assigned_warehouses.set([self.wh1])

        # پرسنل انبار ۱
        self.staff_wh1 = User.objects.create_user(
            username="staff_wh1",
            first_name="کارمند",
            last_name="انبار یک",
            password="Password123!"
        )
        self.staff_wh1.assigned_warehouses.set([self.wh1])

        # پرسنل انبار ۲
        self.staff_wh2 = User.objects.create_user(
            username="staff_wh2",
            first_name="کارمند",
            last_name="انبار دو",
            password="Password123!"
        )
        self.staff_wh2.assigned_warehouses.set([self.wh2])

        # کاربر بدون انبار تخصیص‌یافته
        self.unassigned_user = User.objects.create_user(
            username="unassigned_user",
            first_name="کاربر",
            last_name="بدون انبار",
            password="Password123!"
        )

        # ۳. ساخت گفتگوهای نمونه
        # گفتگوی خصوصی دو‌نفره بین مدیر انبار ۱ و پرسنل انبار ۱
        self.direct_conv = Conversation.objects.create(
            title="گفتگوی مدیر و پرسنل ۱",
            conv_type=ConversationType.DIRECT,
            created_by=self.manager_wh1
        )
        self.direct_conv.participants.set([self.manager_wh1, self.staff_wh1])

        # گروه کاری انبار ۱
        self.wh1_group = Conversation.objects.create(
            title="گروه کاری انبار ۱",
            conv_type=ConversationType.WAREHOUSE_GROUP,
            warehouse=self.wh1,
            created_by=self.manager_wh1
        )
        self.wh1_group.participants.set([self.manager_wh1, self.staff_wh1])

        # کانال اطلاعیه سراسری
        self.announcement = Conversation.objects.create(
            title="اطلاعیه سراسری شرکت",
            conv_type=ConversationType.ANNOUNCEMENT,
            created_by=self.admin
        )

        # ۴. ساخت کالا و کامنت تستی
        self.item_wh1 = Item.objects.create(
            warehouse=self.wh1,
            fa_unic_code="COMMS-101",
            description="کالای آزمایشی انبار ۱",
            inventory=Decimal('50.000'),
            bal4miv=Decimal('50.000')
        )
        self.item_ct = ContentType.objects.get_for_model(Item)

        self.comment_wh1 = GenericComment.objects.create(
            content_type=self.item_ct,
            object_id=str(self.item_wh1.id),
            warehouse=self.wh1,
            author=self.staff_wh1,
            text="یادداشت اولیه روی کالای انبار ۱"
        )

        # پیام نمونه در گفتگوی خصوصی
        self.direct_message = Message.objects.create(
            conversation=self.direct_conv,
            sender=self.manager_wh1,
            text="پیام محرمانه مدیر به کارمند ۱"
        )

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()
        super().tearDown()

    def auth(self, user):
        """احراز هویت کلاینت تستی با کاربر داده‌شده"""
        self.client.force_authenticate(user=user)

    def get_jwt_token(self, user):
        """تولید توکن JWT برای تست‌های وب‌سوکت و API"""
        return str(AccessToken.for_user(user))
