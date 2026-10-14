"""
اندپوینت‌های عکس کالا

چرا ماژول جدا: `inventory/views.py` حدود ۴۲۶۰ خط است و قاعده «حداکثر ۵۰۰ خط»
پروژه را نقض می‌کند. افزودن منطق عکس به آن فایل، مسئله را بدتر می‌کرد.

سه اصل حاکم بر این فایل:

۱. اسکوپ انبار همیشه از `common.warehouse_scope` می‌آید — نه کوئری دستی. اکشن
   `reorder` قبلاً با منیجر جهانی کار می‌کرد و هر کاربر لاگین‌شده می‌توانست
   ترتیب عکس‌های هر انباری را عوض کند (IDOR).

۲. کار سنگین (دیکود و انکود تصویر) و نوشتن روی دیسک *بیرون* از تراکنش انجام
   می‌شود؛ تراکنش فقط چند INSERT کوتاه را می‌گیرد. اگر مرحله دیتابیس شکست
   بخورد، فایل‌های نوشته‌شده صریحاً پاک می‌شوند تا یتیم نمانند.

۳. آپلود idempotent است: کلاینت می‌تواند `sync_ids` بفرستد. اگر پاسخ سرور در
   تونل گم شود و کلاینت دوباره بفرستد، رکورد تکراری ساخته نمی‌شود.
"""
import logging

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.middleware import get_client_ip
from accounts.permissions import CanManageItemPhotos
from common.warehouse_scope import can_access_warehouse, scope_queryset

from .models import Item, ItemPhoto
from .serializers import ItemPhotoSerializer, ItemPhotoUpdateSerializer
from .utils.image_processor import (
    MAX_PHOTOS_PER_ITEM,
    ImageValidationError,
    process_uploaded_image,
)
from .utils.photo_request import (
    as_bool,
    audit_safe,
    extract_captions,
    extract_files,
    extract_sync_ids,
    resolve_count_task,
)

logger = logging.getLogger(__name__)

# ترتیب واحد نمایش عکس‌ها. تا پیش از این، Meta مدل (`display_order` اول) با
# ترتیب ویوها (`-is_primary` اول) هم‌خوان نبود و «عکس شاخص» بسته به مسیرِ
# درخواست جای متفاوتی می‌ایستاد. مدل هم با همین هم‌تراز شد.
PHOTO_ORDERING = ('-is_primary', 'display_order', '-created_at', '-id')


def list_item_photos(request, item):
    photos = (
        ItemPhoto.objects.filter(item=item)
        .select_related('created_by')
        .order_by(*PHOTO_ORDERING)
    )
    serializer = ItemPhotoSerializer(photos, many=True, context={'request': request})
    return Response(serializer.data)


def _persist_photos(request, item, processed, count_task, source_type, force_primary):
    """
    نوشتن فایل‌ها روی استوریج و سپس درج ردیف‌ها در یک تراکنش کوتاه.

    خروجی: (لیست عکس‌های ساخته‌شده، پاسخ خطا) — یکی از دو مقدار None است.
    """
    written = []
    instances = []
    try:
        for payload, caption, sync_id in processed:
            photo = ItemPhoto(
                item=item,
                count_task=count_task,
                source_type=source_type,
                caption=caption,
                width=payload['width'],
                height=payload['height'],
                file_size=payload['file_size'],
                created_by=request.user if request.user.is_authenticated else None,
            )
            if sync_id:
                photo.sync_id = sync_id

            for field_name, key in (
                ('image', 'orig_file'),
                ('medium', 'medium_file'),
                ('thumbnail', 'thumb_file'),
            ):
                content = payload.get(key)
                if not content:
                    continue
                field = getattr(photo, field_name)
                field.save(content.name, content, save=False)
                written.append((field.storage, field.name))

            instances.append(photo)

        with transaction.atomic():
            # قفل ردیف کالا: دو آپلود همزمان روی یک کالا نباید display_order یا
            # is_primary یکسان بگیرند. با ItemPhoto قفل نمی‌کنیم چون ردیف جدید
            # هنوز وجود ندارد و چیزی برای قفل‌کردن نیست.
            Item.all_objects.select_for_update().filter(pk=item.pk).first()

            existing = ItemPhoto.objects.filter(item=item)
            highest = existing.aggregate(value=Max('display_order'))['value']
            next_order = 0 if highest is None else highest + 1
            has_existing = existing.exists()

            primary_offset = 0 if (force_primary or not has_existing) else None
            if force_primary and has_existing:
                # updated_at صریح ست می‌شود چون update() سیگنال auto_now را رد
                # می‌کند و بدون آن، تغییر در دلتای Pull به کلاینت آفلاین نمی‌رسد.
                existing.filter(is_primary=True).update(
                    is_primary=False, updated_at=timezone.now()
                )

            for offset, photo in enumerate(instances):
                photo.display_order = next_order + offset
                photo.is_primary = (offset == primary_offset)
                photo.save()

        return instances, None

    except Exception:
        # فایل‌ها پیش از تراکنش نوشته شده‌اند؛ rollback دیتابیس آن‌ها را برنمی‌گرداند.
        for storage, name in written:
            try:
                storage.delete(name)
            except Exception:
                logger.exception('پاکسازی فایل یتیم «%s» ناموفق بود.', name)
        logger.exception('ذخیره عکس‌های کالای %s شکست خورد.', item.id)
        return None, Response(
            {'error': 'خطا در ذخیره تصاویر. لطفاً دوباره تلاش کنید.'}, status=500
        )


def handle_item_photos_upload(request, item):
    if not can_access_warehouse(request.user, item.warehouse_id):
        return Response({'error': 'شما به انبار این کالا دسترسی ندارید.'}, status=403)

    files = extract_files(request)
    if not files:
        return Response({'error': 'هیچ فایلی برای آپلود ارسال نشده است.'}, status=400)

    existing_count = ItemPhoto.objects.filter(item=item).count()
    if existing_count + len(files) > MAX_PHOTOS_PER_ITEM:
        return Response(
            {
                'error': f'هر کالا حداکثر {MAX_PHOTOS_PER_ITEM} تصویر می‌پذیرد. '
                         f'این کالا {existing_count} تصویر دارد و '
                         f'{len(files)} تصویر جدید ارسال شده است.'
            },
            status=400,
        )

    source_type = request.data.get('source_type', 'gallery')
    if source_type not in dict(ItemPhoto.SOURCE_CHOICES):
        source_type = 'gallery'

    captions = extract_captions(request, len(files))
    sync_ids = extract_sync_ids(request, len(files))
    count_task = resolve_count_task(request, item)
    force_primary = as_bool(request.data.get('is_primary', False))

    # --- idempotency: آنچه با همین sync_id قبلاً ثبت شده دوباره ساخته نمی‌شود ---
    reused = []
    pending = []
    known = [s for s in sync_ids if s]
    seen = {}
    if known:
        for photo in ItemPhoto.all_objects.filter(sync_id__in=known):
            if photo.item_id != item.id:
                # sync_id یکتای جهانی است؛ اگر متعلق به کالای دیگری باشد نه
                # می‌توانیم درج کنیم و نه مجازیم عکس آن کالا را برگردانیم.
                return Response(
                    {'error': 'شناسه همگام‌سازی ارسالی متعلق به کالای دیگری است.'},
                    status=400,
                )
            seen[str(photo.sync_id)] = photo

    for idx, uploaded in enumerate(files):
        sync_id = sync_ids[idx]
        if sync_id and sync_id in seen:
            reused.append(seen[sync_id])
        else:
            pending.append((uploaded, captions[idx], sync_id))

    if not pending:
        # همه‌چیز قبلاً ثبت شده بود — یعنی این یک ارسال دوباره است.
        serializer = ItemPhotoSerializer(reused, many=True, context={'request': request})
        return Response(serializer.data, status=200)

    # --- مرحله ۱: اعتبارسنجی و پردازش، بیرون از تراکنش ---
    processed = []
    try:
        for uploaded, caption, sync_id in pending:
            processed.append((process_uploaded_image(uploaded), caption, sync_id))
    except ImageValidationError as exc:
        # ورودی نامعتبر کاربر ⇒ ۴۰۰ با پیام قابل‌فهم، نه ۵۰۰ با متن استثنا.
        return Response({'error': str(exc)}, status=400)
    except Exception:
        logger.exception('پردازش تصویر کالای %s شکست خورد.', item.id)
        return Response(
            {'error': 'خطا در پردازش تصویر. لطفاً تصویر دیگری امتحان کنید.'}, status=500
        )

    # --- مرحله ۲: نوشتن فایل و درج ردیف ---
    created, error = _persist_photos(
        request, item, processed, count_task, source_type, force_primary
    )
    if error is not None:
        return error

    audit_safe(
        user=request.user,
        warehouse=item.warehouse,
        module='inventory',
        action='CREATE',
        severity='info',
        target_model='ItemPhoto',
        target_object_id=created[0].id if created else None,
        target_repr=(
            f"ثبت {len(created)} تصویر برای کالای «{item.fa_unic_code}» "
            f"({'دوربین' if source_type == 'camera' else 'گالری'})"
        ),
        details={
            'item_id': item.id,
            'fa_unic_code': item.fa_unic_code,
            'count': len(created),
            'source_type': source_type,
        },
        ip_address=get_client_ip(request),
    )

    serializer = ItemPhotoSerializer(
        created + reused, many=True, context={'request': request}
    )
    return Response(serializer.data, status=201)


class ItemPhotoViewSet(viewsets.ModelViewSet):
    queryset = ItemPhoto.objects.select_related('item', 'created_by')
    serializer_class = ItemPhotoSerializer
    parser_classes = (MultiPartParser, FormParser)
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['item', 'count_task', 'is_primary', 'source_type']
    ordering_fields = ['display_order', 'is_primary', 'created_at']
    ordering = list(PHOTO_ORDERING)

    def get_permissions(self):
        # خواندن برای هر کاربر لاگین‌شده (با اسکوپ انبار)، نوشتن فقط برای
        # نقش‌هایی که واقعاً با عکس کالا کار می‌کنند.
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), CanManageItemPhotos()]

    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return ItemPhotoUpdateSerializer
        return self.serializer_class

    def get_queryset(self):
        qs = super().get_queryset().filter(item__is_deleted=False)
        qs = scope_queryset(qs, self.request.user, field='item__warehouse_id')

        item_id = self.request.query_params.get('item_id') or self.request.query_params.get('item')
        if item_id:
            qs = qs.filter(item_id=item_id)
        count_task_id = (
            self.request.query_params.get('count_task_id')
            or self.request.query_params.get('count_task')
        )
        if count_task_id:
            qs = qs.filter(count_task_id=count_task_id)
        return qs

    def create(self, request, *args, **kwargs):
        item_id = request.data.get('item') or request.data.get('item_id')
        if not item_id:
            return Response({'error': 'شناسه کالا (item) الزامی است.'}, status=400)

        item = Item.objects.filter(pk=item_id).first()
        if item is None:
            return Response({'error': 'کالای مورد نظر یافت نشد.'}, status=404)

        return handle_item_photos_upload(request, item)

    def perform_update(self, serializer):
        photo = serializer.save(modified_by=self.request.user)
        audit_safe(
            user=self.request.user,
            warehouse=photo.item.warehouse if photo.item else None,
            module='inventory',
            action='UPDATE',
            severity='info',
            target_model='ItemPhoto',
            target_object_id=photo.id,
            target_repr=f"ویرایش توضیح تصویر کالای «{photo.item.fa_unic_code}»",
            details={'photo_id': photo.id, 'item_id': photo.item_id},
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=['patch'])
    def set_primary(self, request, pk=None):
        photo = self.get_object()
        with transaction.atomic():
            (
                ItemPhoto.objects.filter(item_id=photo.item_id, is_primary=True)
                .exclude(id=photo.id)
                .update(is_primary=False, updated_at=timezone.now())
            )
            photo.is_primary = True
            photo.save(update_fields=['is_primary', 'updated_at'])

        audit_safe(
            user=request.user,
            warehouse=photo.item.warehouse,
            module='inventory',
            action='UPDATE',
            severity='info',
            target_model='ItemPhoto',
            target_object_id=photo.id,
            target_repr=f"تعیین تصویر به عنوان شاخص برای کالای «{photo.item.fa_unic_code}»",
            details={'photo_id': photo.id, 'item_id': photo.item_id},
            ip_address=get_client_ip(request),
        )
        return Response(ItemPhotoSerializer(photo, context={'request': request}).data)

    @action(detail=False, methods=['patch'])
    def reorder(self, request):
        order_list = request.data.get('order', [])
        if not isinstance(order_list, list):
            return Response({'error': 'داده‌های ترتیب نامعتبر است.'}, status=400)

        updates = {}
        for entry in order_list:
            if not isinstance(entry, dict):
                return Response({'error': 'داده‌های ترتیب نامعتبر است.'}, status=400)
            try:
                photo_id = int(entry.get('id'))
                display_order = int(entry.get('display_order', 0))
            except (TypeError, ValueError):
                return Response({'error': 'شناسه یا ترتیب نامعتبر است.'}, status=400)
            if display_order < 0:
                return Response({'error': 'ترتیب نمایش نمی‌تواند منفی باشد.'}, status=400)
            updates[photo_id] = display_order

        if not updates:
            return Response({'message': 'تغییری اعمال نشد.'}, status=200)

        # هسته رفع IDOR: مجموعه مجاز از get_queryset (اسکوپ انبار + کالای زنده)
        # می‌آید، نه از منیجر جهانی.
        allowed = set(self.get_queryset().filter(id__in=updates.keys()).values_list('id', flat=True))
        if set(updates.keys()) - allowed:
            return Response(
                {'error': 'برخی از تصاویر درخواستی وجود ندارند یا در دسترس شما نیستند.'},
                status=403,
            )

        now = timezone.now()
        with transaction.atomic():
            for photo_id in allowed:
                ItemPhoto.objects.filter(id=photo_id).update(
                    display_order=updates[photo_id], updated_at=now
                )

        return Response({'message': 'ترتیب تصاویر با موفقیت بروزرسانی شد.'}, status=200)

    def perform_destroy(self, instance):
        item = instance.item
        photo_id = instance.id
        was_primary = instance.is_primary

        with transaction.atomic():
            # is_primary روی خودِ tombstone پاک می‌شود. اگر پاک نشود، رکورد
            # حذف‌شده در دلتای سینک با is_primary=True به کلاینت می‌رسد و کلاینت
            # آفلاین دو «عکس شاخص» می‌بیند.
            instance.is_primary = False
            instance.is_deleted = True
            instance.modified_by = self.request.user if self.request.user.is_authenticated else None
            instance.save(update_fields=['is_primary', 'is_deleted', 'modified_by', 'updated_at'])

            if was_primary:
                successor = (
                    ItemPhoto.objects.filter(item=item)
                    .order_by('display_order', '-created_at', '-id')
                    .first()
                )
                if successor:
                    successor.is_primary = True
                    successor.save(update_fields=['is_primary', 'updated_at'])

        audit_safe(
            user=self.request.user,
            warehouse=item.warehouse if item else None,
            module='inventory',
            action='DELETE',
            severity='warning',
            target_model='ItemPhoto',
            target_object_id=photo_id,
            target_repr=f"حذف تصویر کالای «{item.fa_unic_code if item else '—'}»",
            details={'photo_id': photo_id, 'item_id': item.id if item else None},
            ip_address=get_client_ip(self.request),
        )
