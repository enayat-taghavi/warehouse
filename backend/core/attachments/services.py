"""
سرویس‌های پیوست هسته:
- ساخت پیوست (`create_attachment`، همان قاعدهٔ API پیوست: اعتبارسنجی، sha256، جای نگه‌داری و صف درایو)؛
  ماژول‌ها برای پیوستی که همراه یک اقدام خودشان ساخته می‌شود (مثل رسید پرداخت) از این استفاده می‌کنند.
- سابقهٔ دیدن سند (ص۱۰ طرح ۲.۶). ماژول‌ها از `platform_core.registry.record_entity_view` صدا می‌زنند.
"""
import hashlib
import mimetypes
import os
from datetime import timedelta

from django.utils import timezone

from common.serializer_fields import validate_uploaded_document
from platform_core.registry import company_of, is_entity_confidential

from .models import Attachment, EntityViewLog

VIEW_LOG_WINDOW = timedelta(minutes=10)
# برچسب‌هایی که همیشه فقط روی سرور می‌مانند (امضا و مهر کاربر، ص۹)
SERVER_ONLY_LABELS = ('signature', 'stamp')


def _storage_for(kind, entity_id, label, company_id):
    """
    جای نگه‌داری (ص۷). امضا و مهر، پیوست کاربر، سند محرمانه و شرکت بی‌درایوِ متصل همیشه سرور؛ وگرنه درایو.
    فایل در هر حال روی سرور هم می‌ماند و درایو فقط رونوشت است.
    """
    if (label or '').lower() in SERVER_ONLY_LABELS or kind == 'user' or not company_id:
        return Attachment.STORAGE_SERVER
    from settings_core.models import CompanyGoogleDriveConfig
    connected = CompanyGoogleDriveConfig.objects.filter(
        company_id=company_id, is_enabled=True, refresh_token__isnull=False,
    ).exclude(refresh_token='').exists()
    if not connected or is_entity_confidential(kind, entity_id):
        return Attachment.STORAGE_SERVER
    return Attachment.STORAGE_GDRIVE


def _enqueue_drive_copy(obj):
    """یک ردیف بارگذاری در صف درایو شرکت؛ ورکر هسته فایل را از همان مسیر سرور می‌فرستد."""
    if obj.storage != Attachment.STORAGE_GDRIVE or not obj.company_id:
        return
    from settings_core.models import GoogleDriveSyncQueue
    GoogleDriveSyncQueue.objects.create(
        company_id=obj.company_id, model_name='Attachment', object_id=obj.pk, field_name='file',
        source_file_path=obj.file.name, target_folder_path=f'پیوست‌ها/{obj.entity_kind}',
        target_filename=f'{obj.pk}_{obj.original_name or os.path.basename(obj.file.name)}'[:300],
        action='upload', status='pending',
    )


def _read_upload(upload):
    """اعتبارسنجی حجم و پسوند و محاسبهٔ sha256 (فایل برای ذخیره به ابتدا برمی‌گردد)."""
    validate_uploaded_document(upload)
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    original = os.path.basename(getattr(upload, 'name', '') or '')[:255]
    # نوع از پسوند مجاز، نه از هدر کاربر (تا فایل با نوع ساختگی مثل image/svg+xml درون صفحه باز نشود)
    content_type = (mimetypes.guess_type(original)[0] or 'application/octet-stream')[:100]
    return {'original_name': original, 'size': upload.size or 0, 'content_type': content_type,
            'sha256': digest.hexdigest()}


# نام عمومی برای ماژول‌هایی که فایل را پیش از هر نوشتن می‌سنجند (رسید پرداخت)
read_upload = _read_upload


def _int_or_zero(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def create_attachment(user, kind, entity_id, upload, *, label='', description='', order=0, meta=None):
    """
    یک پیوست تازه روی سند (kind, entity_id). اجازه را صدازننده می‌سنجد؛ این تابع فقط می‌سازد.
    meta: خروجی از پیش گرفتهٔ `_read_upload(upload)` (اگر صدازننده فایل را پیش از هر نوشتن سنجیده باشد).
    باید درون تراکنش صدازننده صدا زده شود تا با شکست اقدام، ردیف پیوست هم برگردد.
    """
    if meta is None:
        meta = _read_upload(upload)
    label = str(label or '').strip()[:30]
    entity_id = str(entity_id)
    company_id = company_of(kind, entity_id)
    obj = Attachment.objects.create(
        company_id=company_id, entity_kind=kind, entity_id=entity_id, label=label, order=_int_or_zero(order),
        description=str(description or '')[:2000], file=upload,
        storage=_storage_for(kind, entity_id, label, company_id), uploaded_by=user, **meta,
    )
    _enqueue_drive_copy(obj)
    return obj


def record_entity_view(user, kind, entity_id, company_id=None):
    """
    یک ردیف دیدن برای (کاربر، سند)؛ اگر همین کاربر در ۱۰ دقیقهٔ گذشته همین سند را دیده باشد چیزی نمی‌نویسد.
    خروجی: True اگر ردیف تازه نوشته شد. کاربر ناشناس یا سند بی‌نشانی نادیده گرفته می‌شود.
    """
    if user is None or not getattr(user, 'is_authenticated', False) or not kind or entity_id in (None, ''):
        return False
    entity_id = str(entity_id)[:64]
    kind = str(kind)[:50]
    since = timezone.now() - VIEW_LOG_WINDOW
    if EntityViewLog.objects.filter(user=user, entity_kind=kind, entity_id=entity_id, viewed_at__gte=since).exists():
        return False
    try:
        company_id = int(company_id) if company_id not in (None, '') else None
    except (TypeError, ValueError):
        company_id = None
    EntityViewLog.objects.create(user=user, entity_kind=kind, entity_id=entity_id, company_id=company_id)
    return True
