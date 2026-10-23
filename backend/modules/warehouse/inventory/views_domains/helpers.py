# -*- coding: utf-8 -*-
"""
Helper functions, pagination classes, and ordering filters for inventory views.
"""
import os
import re
import time
import logging
import tempfile
from decimal import Decimal, InvalidOperation
from datetime import datetime

from django.db import transaction
from django.db.models import Case, When, Value, IntegerField, Q
from django.forms.models import model_to_dict
from django.utils import timezone
from rest_framework import filters
from rest_framework.pagination import PageNumberPagination

from common.date_utils import parse_date_smart
from common.sync_models import soft_delete_queryset
from ..models import Item, ImportLog, ItemPhoto, CountTask, CountTaskHistory, DocTask

logger = logging.getLogger(__name__)

def _parse_decimal(val):
    if val is None or str(val).strip() == '':
        return None
    try:
        return Decimal(str(val).strip().replace(',', '.'))
    except (InvalidOperation, ValueError, TypeError):
        return None

def _parse_date_flexible(val):
    """
    تحلیل منعطف تاریخ‌ها با استفاده از موتور سراسری هوشمند common.date_utils.
    پشتیبانی از فرمت‌های استاندارد، ارقام فارسی، طول‌های ۶/۸/۱۲/۱۴ رقم و رفع تداخل تک‌رقمی‌ها.
    """
    return parse_date_smart(val, as_datetime=False, strict=False)

def _parse_positive_int(v):
    if v is None or str(v).strip() == '':
        return None
    v_str = str(v).strip()
    persian_digits = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'
    english_digits = '01234567890123456789'
    v_str = v_str.translate(str.maketrans(persian_digits, english_digits))
    match = re.search(r'\d+', v_str)
    if match:
        try:
            val_int = int(match.group(0))
            return val_int if val_int >= 0 else None
        except (ValueError, TypeError):
            return None
    return None

def _clean_currency(v):
    if not v:
        return None
    v_str = str(v).strip()
    if not v_str:
        return None
    curr_map = {
        'ریال': 'IRR',
        'تومان': 'IRR',
        'IRR': 'IRR',
        'دلار': 'USD',
        'USD': 'USD',
        'یورو': 'EUR',
        'EUR': 'EUR',
        'درهم': 'OTHER',
        'AED': 'OTHER',
        'سایر': 'OTHER',
        'OTHER': 'OTHER',
    }
    for fa_name, code in curr_map.items():
        if fa_name.lower() in v_str.lower():
            return code
    valid_choices = [c[0] for c in DocTask.CURRENCY_CHOICES]
    if v_str in valid_choices:
        return v_str
    return v_str[:10]

def _clean_invoice_type(v):
    if not v:
        return None
    v_str = str(v).strip()
    if not v_str:
        return None
    if 'غیررسمی' in v_str or 'غیر رسمی' in v_str:
        return 'domestic'
    type_map = {
        'رسمی': 'formal',
        'مالیاتی': 'formal',
        'formal': 'formal',
        'داخلی': 'domestic',
        'domestic': 'domestic',
        'خارجی': 'foreign',
        'foreign': 'foreign',
        'امانی': 'consignment',
        'consignment': 'consignment',
    }
    for fa_name, code in type_map.items():
        if fa_name.lower() in v_str.lower():
            return code
    valid_choices = [c[0] for c in DocTask.INVOICE_TYPE_CHOICES]
    if v_str in valid_choices:
        return v_str
    return v_str[:20]

def _create_doc_task_snapshot(task):
    """ایجاد اسنپ‌شات از تمام مقادیر ۱۴ فیلد مالی و فیلدهای پویای تسک در لحظه عملیات"""
    return {
        'added_rti_no': task.added_rti_no,
        'inv_rti_number': task.inv_rti_number,
        'invoice_type': task.invoice_type,
        'invoice_date': str(task.invoice_date) if task.invoice_date else None,
        'invoice_page': task.invoice_page,
        'page_row': task.page_row,
        'doc_supplier': task.doc_supplier,
        'total_value': str(task.total_value) if task.total_value is not None else None,
        'price_amount': str(task.price_amount) if task.price_amount is not None else None,
        'similar_unit_price': str(task.similar_unit_price) if task.similar_unit_price is not None else None,
        'currency': task.currency,
        'folder_address': task.folder_address,
        'stamp': task.stamp,
        'signature': task.signature,
        'worker_note': task.worker_note,
        'supervisor_note': task.supervisor_note,
        'manager_note': task.manager_note,
        'status': task.status,
        'item_dynamic_data': task.item.dynamic_data if (task.item and getattr(task.item, 'dynamic_data', None)) else {}
    }

def _soft_delete_items_cascade(items_qs):
    """
    حذف نرم گروهی آیتم‌ها + Cascade دستی به مدل‌های سینک‌شونده وابسته
    (CountTask، CountTaskHistory و ItemPhoto) تا کلاینت آفلاین tombstone همه را بگیرد.

    ItemPhoto اضافه شد چون بدون آن، عکس‌های کالای حذف‌شده در دیتابیس زنده
    می‌ماندند و کلاینت آفلاینی که کالا را حذف‌شده دیده هیچ‌وقت خبردار نمی‌شد که
    عکس‌ها هم رفته‌اند. is_primary هم پاک می‌شود تا رکورد tombstone با
    is_primary=True به کلاینت نرسد. مسیر معکوس (احیای کالا) در
    `_restore_item_photos_cascade` است و باید همیشه با این تابع جفت بماند.

    DocTask/ImportHistory عمداً دست نمی‌خورند (خارج از دامنه سینک فاز ۰؛
    نمایششان با فیلتر item__is_deleted=False کنترل می‌شود).
    خروجی: تعداد آیتم‌های حذف‌نرم‌شده.
    """
    item_ids = list(items_qs.values_list('id', flat=True))
    if not item_ids:
        return 0
    ItemPhoto.objects.filter(item_id__in=item_ids).update(
        is_deleted=True, is_primary=False, updated_at=timezone.now()
    )
    soft_delete_queryset(CountTaskHistory.objects.filter(task__item_id__in=item_ids))
    soft_delete_queryset(CountTask.objects.filter(item_id__in=item_ids))
    soft_delete_queryset(DocTask.objects.filter(item_id__in=item_ids))
    return soft_delete_queryset(Item.objects.filter(id__in=item_ids))

def _restore_item_photos_cascade(item_ids):
    """
    برگرداندن عکس‌های کالاهایی که از حالت حذف‌نرم احیا شده‌اند.

    چرا لازم است: حذف کالا عکس‌هایش را هم tombstone می‌کند. اگر احیا این کار را
    برنگرداند، تصویری که کاربر گرفته برای همیشه نامرئی می‌ماند — فایل روی دیسک
    هست، ردیف با is_deleted=True مانده و هیچ مسیر دیگری آن را زنده نمی‌کند.
    یعنی از دست رفتن داده کاربر.

    is_primary در حذف پاک شده بود، پس برای هر کالا که پس از احیا عکس شاخص ندارد
    دوباره یکی انتخاب می‌شود؛ وگرنه کالا عکس دارد ولی هیچ‌کدام شاخص نیست و
    بند انگشتی (thumbnail) کالا خالی می‌ماند.

    خروجی: تعداد عکس‌های احیاشده.
    """
    item_ids = list(item_ids)
    if not item_ids:
        return 0

    now = timezone.now()
    # updated_at صریح ست می‌شود چون update() سیگنال auto_now را رد می‌کند و
    # بدون آن، احیا در دلتای Pull به کلاینت آفلاین نمی‌رسد.
    restored = ItemPhoto.all_objects.filter(item_id__in=item_ids, is_deleted=True).update(
        is_deleted=False, updated_at=now
    )
    if not restored:
        return 0

    for item_id in item_ids:
        live = ItemPhoto.objects.filter(item_id=item_id)
        if live.filter(is_primary=True).exists():
            continue
        successor = live.order_by('display_order', '-created_at', '-id').first()
        if successor:
            ItemPhoto.objects.filter(id=successor.id).update(is_primary=True, updated_at=now)

    return restored

def _cleanup_old_import_logs(max_age_hours=24):
    """پاکسازی فایل‌های گزارش اکسل قدیمی از پوشه موقت سرور"""
    try:
        temp_dir = tempfile.gettempdir()
        now = time.time()
        for fname in os.listdir(temp_dir):
            if fname.startswith("import_log_") and fname.endswith(".xlsx"):
                fpath = os.path.join(temp_dir, fname)
                if os.path.isfile(fpath):
                    try:
                        if (now - os.path.getmtime(fpath)) > (max_age_hours * 3600):
                            os.remove(fpath)
                    except OSError:
                        pass
    except Exception:
        pass

class ItemPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 500

class PriorityOrderingFilter(filters.OrderingFilter):
    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        
        search_value = request.query_params.get('search', '').strip()
        search_fields = getattr(view, 'search_fields', [])
        
        if search_value and search_fields:
            # Create OR conditions for all search fields starting with the search value
            q_objects = Q()
            for field in search_fields:
                kwargs = {f"{field}__istartswith": search_value}
                q_objects |= Q(**kwargs)
                
            queryset = queryset.annotate(
                match_priority=Case(
                    When(q_objects, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField()
                )
            )
            if ordering:
                return queryset.order_by(*ordering, 'match_priority')
            else:
                return queryset.order_by('match_priority')
        
        if ordering:
            return queryset.order_by(*ordering)
        return queryset

__all__ = [
    'logger',
    '_parse_decimal',
    '_parse_date_flexible',
    '_parse_positive_int',
    '_clean_currency',
    '_clean_invoice_type',
    '_create_doc_task_snapshot',
    '_soft_delete_items_cascade',
    '_restore_item_photos_cascade',
    '_cleanup_old_import_logs',
    'ItemPagination',
    'PriorityOrderingFilter',
]
