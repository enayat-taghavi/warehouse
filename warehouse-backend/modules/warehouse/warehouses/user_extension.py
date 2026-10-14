"""
اکستنشن مشخصات و روابط انبار برای کاربران — طرح راه میانهٔ ماژولار (گام ۳-ب).
ارائه‌دهندهٔ فیلد اختصاصی انبار در سریالایزر کاربر و ستون‌های اکسل مرتبط.
"""
from rest_framework import serializers

from platform_core.registry import contribute


class WarehouseUserExtension:
    name = 'warehouses'

    def get_serializer_field(self):
        """فیلد انتساب انبار در سریالایزر کاربر پلتفرم."""
        from warehouses.models import Warehouse
        return serializers.PrimaryKeyRelatedField(
            many=True,
            queryset=Warehouse.objects.all(),
            required=False,
            error_messages={'does_not_exist': 'انبار با شناسه {pk_value} وجود ندارد.'}
        )

    def get_all_warehouse_ids(self):
        """شناسه کلیه انبارهای فعال برای کاربران ارشد (Superuser)."""
        from warehouses.models import Warehouse
        return list(Warehouse.objects.values_list('id', flat=True))

    def format_excel_warehouses(self, user):
        """قالب‌بندی متن انبارها برای ستون اکسل کاربران و کارت تردد."""
        if not hasattr(user, 'assigned_warehouses'):
            return ''
        wh_items = []
        for w in user.assigned_warehouses.all():
            wh_items.append(f"{w.name} ({w.code})" if w.code else w.name)
        return '، '.join(wh_items)

    def get_template_warehouse_names(self):
        """فهرست نام انبارها جهت منوی آبشاری قالب اکسل."""
        from warehouses.models import Warehouse
        return [w.name for w in Warehouse.objects.all().order_by('name') if w.name and w.name.strip()]

    def get_all_warehouses(self):
        """لیست تمامی اشیاء انبار برای گزینه «همه انبارها» در اکسل."""
        from warehouses.models import Warehouse
        return list(Warehouse.objects.all())

    def build_warehouses_lookup(self):
        """ساخت نقشه جستجوی نام و کد انبار جهت تطبیق هوشمند ردیف‌های فایل اکسل."""
        from warehouses.models import Warehouse
        lookup = {}
        for wh in Warehouse.objects.all():
            if wh.code:
                lookup[wh.code.lower().strip()] = wh
            if wh.name:
                lookup[wh.name.lower().strip()] = wh
                if wh.code:
                    lookup[f"{wh.name.lower().strip()} ({wh.code.lower().strip()})"] = wh
        return lookup


def register_user_extension():
    """ثبت اکستنشن کاربر انبار در نقطه توسعه user_extensions هسته."""
    contribute('user_extensions', WarehouseUserExtension())
