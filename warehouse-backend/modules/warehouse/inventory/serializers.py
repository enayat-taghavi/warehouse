from django.db.models import Prefetch
from rest_framework import serializers
from common.media_urls import signed_media_url
from common.date_utils import parse_date_smart
from .models import Item, ItemPhoto, CountTask, CountTaskHistory, DocTask, DocTaskHistory, ItemFieldDefinition


# نام صفت و ترتیبی که Prefetch و خواننده آن باید بر سرش توافق داشته باشند.
PHOTO_CACHE_ATTR = 'cached_photos'
PHOTO_CACHE_ORDERING = ('-is_primary', '-created_at', '-id')


def photo_prefetch(path='photos'):
    """
    Prefetch عکس‌های زنده کالا برای پرکردن `cached_photos`.

    بدون این، هر سطر در لیست کالاها/تسک‌ها دو کوئری اضافه می‌زد: یکی برای شمارش
    عکس‌ها و یکی برای بندانگشتی شاخص. روی یک صفحه ۱۰۰ ردیفی یعنی ۲۰۰ کوئری
    اضافه، و در Pull سینک (تا ۱۰۰۰ ردیف) یعنی ۲۰۰۰ کوئری.

    `path` برای کوئری‌ست‌هایی است که خودشان Item نیستند و از راه FK به آن
    می‌رسند (`item__photos` در CountTask/DocTask).

    ترتیب باید *دقیقاً* همان `_live_photos` باشد، چون `get_primary_thumbnail`
    عضو اول لیست را «عکس شاخص» فرض می‌کند.
    """
    return Prefetch(
        path,
        queryset=ItemPhoto.objects.order_by(*PHOTO_CACHE_ORDERING),
        to_attr=PHOTO_CACHE_ATTR,
    )


def _photo_asset_url(photo, *field_names):
    """
    اولین فایل موجود از میان فیلدهای داده‌شده را به‌صورت URL امضاشده برمی‌گرداند.

    بدون try/except نوشته شده: `field.name` و امضا هر دو محاسبه رشته‌ای‌اند و
    استثنا نمی‌دهند. قالب قبلی این توابع یک `except Exception: pass` سرتاسری
    داشت که هر اشکالی (از جمله خطای تنظیمات) را به «تصویر ندارد» ترجمه می‌کرد.
    """
    for name in field_names:
        file_field = getattr(photo, name, None)
        if file_field and file_field.name:
            return signed_media_url(file_field.name)
    return None


def _live_photos(item):
    """
    عکس‌های زنده کالا، مرتب‌شده به‌گونه‌ای که عضو اول «شاخص، وگرنه جدیدترین» باشد.

    اگر ویو با `photo_prefetch()` داده را از قبل آورده باشد از همان استفاده
    می‌شود؛ در غیر این صورت یک کوئری زده می‌شود.
    """
    cached = getattr(item, PHOTO_CACHE_ATTR, None)
    if cached is not None:
        return cached
    return list(item.photos.filter(is_deleted=False).order_by(*PHOTO_CACHE_ORDERING))


class ItemPhotoSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    medium_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = ItemPhoto
        fields = [
            'id', 'sync_id', 'item', 'image', 'medium', 'thumbnail',
            'image_url', 'medium_url', 'thumbnail_url',
            'caption', 'is_primary', 'display_order',
            'file_size', 'width', 'height', 'source_type', 'count_task',
            'created_at', 'updated_at', 'created_by', 'created_by_name'
        ]
        # همه‌چیز فقط‌خواندنی است. ساخت عکس از مسیر اختصاصی آپلود انجام می‌شود
        # (اعتبارسنجی فایل، تولید سه سطح WebP، اسکوپ انبار). اگر این فیلدها
        # نوشتنی بمانند، کلاینت می‌تواند با یک PATCH ساده عکس را به کالای انبار
        # دیگری منتقل کند، فایل دلخواه (بدون پردازش و بدون اعتبارسنجی) بنشاند،
        # یا عکس شاخص را بدون گذر از منطق set_primary عوض کند.
        read_only_fields = [
            'id', 'sync_id', 'item', 'image', 'medium', 'thumbnail',
            'is_primary', 'display_order', 'file_size', 'width', 'height',
            'source_type', 'count_task', 'created_at', 'updated_at', 'created_by',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_image_url(self, obj):
        return _photo_asset_url(obj, 'image')

    def get_medium_url(self, obj):
        return _photo_asset_url(obj, 'medium', 'image')

    def get_thumbnail_url(self, obj):
        return _photo_asset_url(obj, 'thumbnail', 'medium', 'image')


class ItemPhotoUpdateSerializer(serializers.ModelSerializer):
    """
    ویرایش عکس = فقط ویرایش توضیح آن.

    هر تغییر دیگری (شاخص‌کردن، ترتیب، جابه‌جایی بین کالاها) اکشن اختصاصی خودش
    را دارد که اسکوپ و لاگ ممیزی را رعایت می‌کند.
    """

    class Meta:
        model = ItemPhoto
        fields = ['id', 'caption']
        read_only_fields = ['id']

class ItemSerializer(serializers.ModelSerializer):
    sync_id = serializers.UUIDField(required=False, allow_null=True)
    created_by_name = serializers.SerializerMethodField()
    modified_by_name = serializers.SerializerMethodField()
    warehouse_name = serializers.SerializerMethodField()
    photos_count = serializers.SerializerMethodField()
    primary_thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = '__all__'

    def get_warehouse_name(self, obj):
        if obj.warehouse:
            return obj.warehouse.project_name or obj.warehouse.name
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_modified_by_name(self, obj):
        if obj.modified_by:
            return f"{obj.modified_by.first_name} {obj.modified_by.last_name}".strip() or obj.modified_by.username
        return None

    def get_photos_count(self, obj):
        # مسیر آماده‌شده در ویو (annotate) اولویت دارد؛ سپس داده Prefetch؛ و
        # فقط در نهایت یک کوئری مستقل. بدون دو مسیر اول، هر سطر لیست کالاها یک
        # COUNT جدا می‌زد.
        annotated = getattr(obj, 'annotated_photos_count', None)
        if annotated is not None:
            return annotated
        cached = getattr(obj, PHOTO_CACHE_ATTR, None)
        if cached is not None:
            return len(cached)
        return obj.photos.filter(is_deleted=False).count()

    def get_primary_thumbnail(self, obj):
        photos = _live_photos(obj)
        if not photos:
            return None

        # عضو اول: عکس شاخص (جدیدترین، اگر چند شاخص باشد) وگرنه آخرین عکس آپلودشده
        url = _photo_asset_url(photos[0], 'thumbnail', 'medium', 'image')
        if not url:
            return None

        request = self.context.get('request')
        if request and not url.startswith(('http://', 'https://')):
            return request.build_absolute_uri(url)
        return url

class ItemFieldDefinitionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ItemFieldDefinition
        fields = ['id', 'warehouse', 'name', 'label', 'field_type', 'default_value', 'is_required', 'is_active', 'created_by_name', 'sync_id', 'is_deleted', 'updated_at']
        read_only_fields = ['id', 'sync_id', 'is_deleted', 'updated_at']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

class CountTaskHistorySerializer(serializers.ModelSerializer):
    action_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CountTaskHistory
        fields = '__all__'

    def get_action_by_name(self, obj):
        if obj.action_by:
            return f"{obj.action_by.first_name} {obj.action_by.last_name}".strip() or obj.action_by.username
        return None

class CountTaskSerializer(serializers.ModelSerializer):
    counter_name = serializers.SerializerMethodField()
    supervisor_name = serializers.SerializerMethodField()
    assigned_manager_name = serializers.SerializerMethodField()
    item_details = serializers.SerializerMethodField()
    history = CountTaskHistorySerializer(many=True, read_only=True)
    is_blind = serializers.SerializerMethodField()

    class Meta:
        model = CountTask
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'modified_by')

    def get_counter_name(self, obj):
        if obj.counter:
            return f"{obj.counter.first_name} {obj.counter.last_name}".strip() or obj.counter.username
        return None

    def get_supervisor_name(self, obj):
        if obj.supervisor:
            return f"{obj.supervisor.first_name} {obj.supervisor.last_name}".strip() or obj.supervisor.username
        return None

    def get_assigned_manager_name(self, obj):
        if obj.assigned_manager:
            return f"{obj.assigned_manager.first_name} {obj.assigned_manager.last_name}".strip() or obj.assigned_manager.username
        return None

    def get_is_blind(self, obj):
        """آیا شمارش کور فعال است؟"""
        if self.context and 'is_blind' in self.context:
            return bool(self.context['is_blind'])
        from warehouses.services import get_setting
        wh_id = obj.item.warehouse_id if obj.item else None
        blind_mode = get_setting('blind_counting', wh_id)
        return blind_mode == 'blind'

    def get_item_details(self, obj):
        """اگر شمارش کور فعال باشد، inventory (موجودی) از پاسخ حذف شود"""
        if not obj.item:
            return None
        data = ItemSerializer(obj.item, context=self.context).data
        is_blind = False
        if self.context and 'is_blind' in self.context:
            is_blind = bool(self.context['is_blind'])
        else:
            from warehouses.services import get_setting
            wh_id = obj.item.warehouse_id if obj.item else None
            blind_mode = get_setting('blind_counting', wh_id)
            is_blind = (blind_mode == 'blind')
        if is_blind:
            data.pop('inventory', None)
            data.pop('bal4miv', None)
            data.pop('balance', None)
        return data

class DocTaskHistorySerializer(serializers.ModelSerializer):
    action_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DocTaskHistory
        fields = '__all__'

    def get_action_by_name(self, obj):
        if obj.action_by:
            return f"{obj.action_by.first_name} {obj.action_by.last_name}".strip() or obj.action_by.username
        return None

class DocTaskSerializer(serializers.ModelSerializer):
    sync_id = serializers.UUIDField(required=False, allow_null=True)
    warehouse_id = serializers.IntegerField(source='item.warehouse_id', read_only=True)
    doc_worker_name = serializers.SerializerMethodField()
    doc_supervisor_name = serializers.SerializerMethodField()
    assigned_manager_name = serializers.SerializerMethodField()
    item_details = serializers.SerializerMethodField()
    history = DocTaskHistorySerializer(many=True, read_only=True)

    class Meta:
        model = DocTask
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at', 'created_by', 'modified_by')

    def get_doc_worker_name(self, obj):
        if obj.doc_worker:
            return f"{obj.doc_worker.first_name} {obj.doc_worker.last_name}".strip() or obj.doc_worker.username
        return None

    def get_doc_supervisor_name(self, obj):
        if obj.doc_supervisor:
            return f"{obj.doc_supervisor.first_name} {obj.doc_supervisor.last_name}".strip() or obj.doc_supervisor.username
        return None

    def get_assigned_manager_name(self, obj):
        if obj.assigned_manager:
            return f"{obj.assigned_manager.first_name} {obj.assigned_manager.last_name}".strip() or obj.assigned_manager.username
        return None

    def get_item_details(self, obj):
        if not obj.item:
            return None
        return ItemSerializer(obj.item, context=self.context).data

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)

        # تبدیل امن تاریخ شمسی و مقادیر خالی به فرمت استاندارد
        inv_date = data.get('invoice_date')
        if inv_date is not None:
            if inv_date == '' or inv_date == 'null':
                data['invoice_date'] = None
            elif inv_date:
                parsed_date = parse_date_smart(inv_date, as_datetime=False, strict=False)
                if parsed_date:
                    data['invoice_date'] = parsed_date.strftime('%Y-%m-%d')

        # تبدیل مقادیر خالی فیلدهای عددی و انتخابی به None
        nullable_fields = [
            'price_amount', 'similar_unit_price', 'total_value',
            'invoice_page', 'page_row', 'currency', 'invoice_type',
            'added_rti_no', 'inv_rti_number', 'doc_supplier', 'folder_address',
            'worker_note', 'supervisor_note', 'manager_note'
        ]
        for f in nullable_fields:
            if f in data and (data[f] == '' or data[f] == 'null'):
                data[f] = None

        return super().to_internal_value(data)


