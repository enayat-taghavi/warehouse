"""
Pull API همگام‌سازی Local-First — GET /api/inventory/sync/pull/

پارامترها:
- warehouse_id (الزامی)
- models: لیست جداشده با کاما از count_tasks,items,dynamic_fields (پیش‌فرض: همه)
- since: ISO datetime — فقط رکوردهای updated_at >= since (کلاینت خودش ۳۰ ثانیه
  حاشیه همپوشانی از server_time قبلی کم می‌کند)
- cursor: مقدار مات (opaque) برگشتی از صفحه قبل برای ادامه دانلود نیمه‌کاره
- limit: حداکثر تعداد ردیف در پاسخ (پیش‌فرض ۵۰۰، سقف ۱۰۰۰)

پاسخ:
{ "server_time": "...", "results": {"items": [...], ...}, "next_cursor": "...", "has_more": bool }

قواعد:
- از all_objects می‌خواند تا tombstoneهای حذف نرم (is_deleted=true) هم برسند.
  ردیف tombstone فقط {sync_id, is_deleted, updated_at} دارد (نشت داده ندارد).
- Permission-aware: کاربر با view_wh_docs همه داده انبار را می‌گیرد؛ کاربر
  با view_sys_counter فقط تسک‌های خودش/استخر و آیتم‌های همان تسک‌ها
  (با redaction فیلدهای شمارش کور، مطابق CountTaskSerializer).
- ترتیب پایدار (updated_at, id) صعودی + cursor مرکب → قطعی وسط دانلود بی‌ضرر است.
- اگر since قدیمی‌تر از عمر نگهداری tombstoneها باشد → 410 Gone → کلاینت Full Resync.
"""
import base64
import json
from datetime import datetime as _dt, timedelta, timezone as _tz

from django.db.models import Q, Prefetch
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CountTask, CountTaskHistory, DocTask, DocTaskHistory, Item, ItemFieldDefinition
from .serializers import (
    CountTaskSerializer,
    DocTaskSerializer,
    ItemFieldDefinitionSerializer,
    ItemSerializer,
    photo_prefetch,
)

# هم‌راستا با نگهداری ۶ ماهه کلاینت؛ tombstone قدیمی‌تر از این قابل اتکا نیست
TOMBSTONE_RETENTION_DAYS = 180
DEFAULT_LIMIT = 500
MAX_LIMIT = 1000
# ترتیب ثابت پردازش (وابستگی‌ها اول: تعریف فیلدها → آیتم‌ها → تسک‌ها)
#
# ItemPhoto عمداً اینجا نیست: ردیف عکس بدون فایل تصویرش برای کلاینت آفلاین
# بی‌فایده است و استراتژی کش فایل هنوز وجود ندارد. آنچه رابط آفلاین لازم دارد
# (`photos_count` و `primary_thumbnail`) از قبل روی خود ردیف کالا می‌آید. اگر
# روزی اضافه شد، به یک جدول Dexie و پیش‌کش فایل در Service Worker هم نیاز است.
MODEL_ORDER = ['dynamic_fields', 'items', 'count_tasks', 'doc_tasks']


def _encode_cursor(model_key, updated_at, row_id):
    payload = json.dumps({'m': model_key, 'u': updated_at.isoformat(), 'i': row_id})
    return base64.urlsafe_b64encode(payload.encode('utf-8')).decode('ascii')


def _decode_cursor(raw):
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw.encode('ascii')).decode('utf-8'))
        updated_at = parse_datetime(payload['u'])
        if payload['m'] not in MODEL_ORDER or updated_at is None:
            return None
        return {'m': payload['m'], 'u': updated_at, 'i': int(payload['i'])}
    except Exception:
        return None


class SyncPullView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        full_access = user.is_superuser or user.has_perm('accounts.view_wh_docs')
        counter_access = user.has_perm('accounts.view_sys_counter')
        if not (full_access or counter_access):
            return Response({'detail': 'دسترسی همگام‌سازی ندارید.'}, status=403)

        warehouse_id = request.query_params.get('warehouse_id')
        if not warehouse_id:
            return Response({'detail': 'warehouse_id الزامی است.'}, status=400)

        try:
            limit = min(int(request.query_params.get('limit', DEFAULT_LIMIT)), MAX_LIMIT)
            limit = max(limit, 1)
        except ValueError:
            return Response({'detail': 'limit نامعتبر است.'}, status=400)

        requested = [m.strip() for m in request.query_params.get('models', ','.join(MODEL_ORDER)).split(',') if m.strip()]
        invalid = [m for m in requested if m not in MODEL_ORDER]
        if invalid:
            return Response({'detail': f"مدل نامعتبر: {', '.join(invalid)}"}, status=400)
        # ترتیب canonical تا cursor معنادار بماند
        requested = [m for m in MODEL_ORDER if m in requested]

        since = None
        since_raw = request.query_params.get('since')
        if since_raw:
            since = parse_datetime(since_raw)
            if since is None:
                return Response({'detail': 'since نامعتبر است.'}, status=400)
            if timezone.is_naive(since):
                since = timezone.make_aware(since)
            if since < timezone.now() - timedelta(days=TOMBSTONE_RETENTION_DAYS):
                # کلاینت آن‌قدر قدیمی است که ممکن است tombstoneها را از دست بدهد
                return Response({'detail': 'full_resync_required'}, status=410)

        cursor = None
        cursor_raw = request.query_params.get('cursor')
        if cursor_raw:
            cursor = _decode_cursor(cursor_raw)
            if cursor is None or cursor['m'] not in requested:
                return Response({'detail': 'cursor نامعتبر است.'}, status=400)

        # قبل از خواندن دیتابیس ثبت می‌شود تا مبنای دلتای بعدی محافظه‌کارانه باشد
        server_time = timezone.now()

        blind = False
        if not full_access:
            from warehouses.services import get_setting
            blind = get_setting('blind_counting', warehouse_id) == 'blind'

        total_records = None
        if not cursor:
            total_records = 0
            for model_key in requested:
                qs = self._build_queryset(model_key, warehouse_id, user, full_access)
                if since is not None:
                    qs = qs.filter(updated_at__gte=since)
                total_records += qs.count()

        results = {}
        next_cursor = None
        has_more = False
        remaining = limit

        # اگر cursor داریم، مدل‌های قبل از آن در این نوبت قبلاً کامل ارسال شده‌اند
        start_idx = requested.index(cursor['m']) if cursor else 0

        for model_key in requested[start_idx:]:
            qs = self._build_queryset(model_key, warehouse_id, user, full_access)
            if since is not None:
                qs = qs.filter(updated_at__gte=since)
            if cursor and cursor['m'] == model_key:
                qs = qs.filter(
                    Q(updated_at__gt=cursor['u'])
                    | Q(updated_at=cursor['u'], id__gt=cursor['i'])
                )
            qs = qs.order_by('updated_at', 'id')

            rows = list(qs[: remaining + 1])
            page_full = len(rows) > remaining
            if page_full:
                rows = rows[:remaining]

            results[model_key] = [self._serialize(model_key, obj, blind, request, full_access=full_access) for obj in rows]
            remaining -= len(rows)

            if page_full:
                last = rows[-1]
                next_cursor = _encode_cursor(model_key, last.updated_at, last.id)
                has_more = True
                break
            if remaining <= 0 and model_key != requested[-1]:
                # صفحه پر شد ولی مدل‌های بعدی مانده‌اند → ادامه از ابتدای مدل بعد
                nxt = requested[requested.index(model_key) + 1]
                next_cursor = _encode_cursor(nxt, _dt(1970, 1, 1, tzinfo=_tz.utc), 0)
                has_more = True
                break

        response_data = {
            'server_time': server_time.isoformat(),
            'results': results,
            'next_cursor': next_cursor,
            'has_more': has_more,
        }
        if total_records is not None:
            response_data['total_records'] = total_records

        return Response(response_data)

    def _build_queryset(self, model_key, warehouse_id, user, full_access):
        if model_key == 'dynamic_fields':
            return ItemFieldDefinition.all_objects.filter(
                Q(warehouse_id=warehouse_id) | Q(warehouse__isnull=True)
            ).select_related('created_by')

        if model_key == 'items':
            base = Item.all_objects.filter(warehouse_id=warehouse_id).select_related(
                'warehouse', 'created_by', 'modified_by'
            ).prefetch_related(photo_prefetch())
            if full_access:
                return base
            # شمارشگر: فقط آیتم‌های تسک‌های خودش/استخر + همه tombstoneها (فقط sync_id)
            task_scope = (
                Q(count_tasks__counter=user)
                | Q(count_tasks__counter__isnull=True, count_tasks__status='PENDING_COUNT')
            )
            return base.filter(
                Q(is_deleted=True) | (task_scope & Q(count_tasks__is_deleted=False))
            ).distinct()

        if model_key == 'doc_tasks':
            base = DocTask.objects.filter(item__warehouse_id=warehouse_id).select_related(
                'item', 'item__warehouse', 'item__created_by', 'item__modified_by',
                'doc_worker', 'doc_supervisor', 'assigned_manager', 'created_by', 'modified_by'
            ).prefetch_related(
                Prefetch('history', queryset=DocTaskHistory.objects.order_by('created_at').select_related('action_by')),
                photo_prefetch('item__photos'),
            )
            if full_access:
                return base
            # کارشناس مالی: فقط تسک‌های خودش یا استخر + تسک‌هایی که قبلاً داشته (جهت صدور tombstone)
            return base.filter(
                Q(is_deleted=True)
                | Q(doc_worker=user)
                | Q(doc_worker__isnull=True, status='PENDING_DOC')
                | Q(history__action_by=user)
            ).distinct()

        # count_tasks
        base = CountTask.all_objects.filter(item__warehouse_id=warehouse_id).select_related(
            'item', 'item__warehouse', 'item__created_by', 'item__modified_by',
            'counter', 'supervisor', 'assigned_manager', 'created_by', 'modified_by'
        ).prefetch_related(
            Prefetch('history', queryset=CountTaskHistory.objects.order_by('created_at').select_related('action_by')),
            photo_prefetch('item__photos'),
        )
        if full_access:
            return base
        return base.filter(
            Q(is_deleted=True)
            | Q(counter=user)
            | Q(counter__isnull=True, status='PENDING_COUNT')
            | Q(history__action_by=user)
        ).distinct()

    def _serialize(self, model_key, obj, blind, request, full_access=False):
        if getattr(obj, 'is_deleted', False):
            return {
                'sync_id': str(obj.sync_id) if getattr(obj, 'sync_id', None) else None,
                'is_deleted': True,
                'updated_at': obj.updated_at.isoformat(),
            }

        # تسک شمارش: اگر از کاربر گرفته شده (Unassign/Reassign)، به عنوان tombstone برای این کلاینت ارسال شود (تسک ۱۳)
        if model_key == 'count_tasks' and not full_access:
            user = request.user
            if user and user.is_authenticated:
                is_user_task = (obj.counter_id == user.id) or (obj.counter_id is None and obj.status == 'PENDING_COUNT')
                if not is_user_task:
                    return {
                        'sync_id': str(obj.sync_id) if getattr(obj, 'sync_id', None) else None,
                        'is_deleted': True,
                        'updated_at': obj.updated_at.isoformat(),
                    }

        # تسک اسناد: اگر از کاربر سلب شده باشد، ارسال به صورت tombstone
        if model_key == 'doc_tasks' and not full_access:
            user = request.user
            if user and user.is_authenticated:
                is_user_task = (obj.doc_worker_id == user.id) or (obj.doc_worker_id is None and obj.status == 'PENDING_DOC')
                if not is_user_task:
                    return {
                        'sync_id': str(obj.sync_id) if getattr(obj, 'sync_id', None) else None,
                        'is_deleted': True,
                        'updated_at': obj.updated_at.isoformat(),
                    }

        # request در context لازم است تا آدرس تصویر شاخص مطلق شود؛ کلاینت همین
        # ردیف را در همان جدول Dexie می‌نویسد که پاسخ REST را می‌نویسد و دو نوع
        # آدرس متفاوت برای یک کالا دردسر می‌شود.
        context = {'request': request}
        if model_key == 'doc_tasks':
            return DocTaskSerializer(obj, context=context).data
        if model_key == 'dynamic_fields':
            return ItemFieldDefinitionSerializer(obj, context=context).data
        if model_key == 'items':
            data = ItemSerializer(obj, context=context).data
            if blind:
                data.pop('inventory', None)
                data.pop('bal4miv', None)
            return data
        return CountTaskSerializer(obj, context={**context, 'is_blind': blind}).data

