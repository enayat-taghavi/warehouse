"""
API پیوست عمومی (ص۵، ص۶، ص۷ و ص۹ طرح ۲.۶).

- هر درخواست قلاب‌های رجیستری را می‌پرسد: دیدن با `can_view`، افزودن/حذف/جایگزینی با `can_attach`، و حذف یا
  جایگزینی فقط وقتی سند قفل نیست (`is_entity_locked`). نوع بی‌قلاب = منع.
- دانلود فقط از همین API است و `can_view` را در **هر** درخواست می‌سنجد؛ مسیر `/media/attachments/` همیشه ۴۰۳ است.
- حذف نرم است: `archived_at` پر می‌شود و فایل روی دیسک می‌ماند (ق۱۶).
"""
import hashlib
import mimetypes
import os
import re
from urllib.parse import quote

from django.conf import settings
from django.db import transaction
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from common.serializer_fields import validate_uploaded_document
from platform_core.registry import can_attach, can_view, company_of, is_entity_confidential, is_entity_locked

from .models import Attachment

_KIND_RE = re.compile(r'^[a-z][a-z0-9_]{0,49}$')
# برچسب‌هایی که همیشه فقط روی سرور می‌مانند (امضا و مهر کاربر، ص۹)
SERVER_ONLY_LABELS = ('signature', 'stamp')


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = [
            'id', 'entity_kind', 'entity_id', 'label', 'order', 'description', 'original_name', 'size',
            'content_type', 'sha256', 'storage', 'status', 'uploaded_by', 'uploaded_by_name', 'created_at',
            'archived_at', 'replaced_by', 'download_url',
        ]
        read_only_fields = fields

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        if not u:
            return None
        return f'{u.first_name} {u.last_name}'.strip() or u.username

    def get_download_url(self, obj):
        return f'/api/attachments/{obj.pk}/download/'


def _entity_params(data):
    kind = str(data.get('kind') or data.get('entity_kind') or '').strip()
    entity_id = str(data.get('id') or data.get('entity_id') or '').strip()
    if not _KIND_RE.match(kind) or not entity_id or len(entity_id) > 64:
        raise serializers.ValidationError({'detail': 'نوع یا شناسهٔ سند نامعتبر است.'})
    return kind, entity_id


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


def _int_or_zero(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _active_or_404(pk):
    return get_object_or_404(Attachment, pk=pk, archived_at__isnull=True)


def _ensure_can_change(request, obj):
    """حذف و جایگزینی: اجازهٔ پیوست و سند باز. خروجی Response خطا یا None."""
    if not can_attach(request.user, obj.entity_kind, obj.entity_id):
        return Response({'detail': 'اجازهٔ تغییر پیوست‌های این سند را ندارید.'}, status=status.HTTP_403_FORBIDDEN)
    if is_entity_locked(obj.entity_kind, obj.entity_id):
        return Response({'detail': 'سند قفل است؛ پیوست موجود حذف یا جایگزین نمی‌شود، فقط پیوست تازه اضافه می‌شود.'},
                        status=status.HTTP_409_CONFLICT)
    return None


class AttachmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        kind, entity_id = _entity_params(request.query_params)
        if not can_view(request.user, kind, entity_id):
            return Response({'detail': 'اجازهٔ دیدن این سند را ندارید.'}, status=status.HTTP_403_FORBIDDEN)
        qs = (Attachment.objects.filter(entity_kind=kind, entity_id=entity_id, archived_at__isnull=True)
              .select_related('uploaded_by'))
        label = request.query_params.get('label')
        if label:
            qs = qs.filter(label=label)
        return Response(AttachmentSerializer(qs, many=True).data)

    def post(self, request):
        kind, entity_id = _entity_params(request.data)
        if not can_attach(request.user, kind, entity_id):
            return Response({'detail': 'اجازهٔ افزودن پیوست به این سند را ندارید.'}, status=status.HTTP_403_FORBIDDEN)
        upload = request.FILES.get('file')
        if not upload:
            return Response({'file': ['فایل پیوست لازم است.']}, status=status.HTTP_400_BAD_REQUEST)
        meta = _read_upload(upload)
        label = str(request.data.get('label') or '').strip()[:30]
        company_id = company_of(kind, entity_id)
        with transaction.atomic():
            obj = Attachment.objects.create(
                company_id=company_id,
                entity_kind=kind, entity_id=entity_id, label=label,
                order=_int_or_zero(request.data.get('order')),
                description=str(request.data.get('description') or '')[:2000],
                file=upload, storage=_storage_for(kind, entity_id, label, company_id),
                uploaded_by=request.user, **meta,
            )
            _enqueue_drive_copy(obj)
        return Response(AttachmentSerializer(obj).data, status=status.HTTP_201_CREATED)


class AttachmentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        with transaction.atomic():
            obj = get_object_or_404(Attachment.objects.select_for_update(), pk=pk, archived_at__isnull=True)
            error = _ensure_can_change(request, obj)
            if error is not None:
                return error
            obj.archived_at = timezone.now()
            obj.save(update_fields=['archived_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AttachmentReplaceView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'file': ['فایل پیوست لازم است.']}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            old = get_object_or_404(Attachment.objects.select_for_update(), pk=pk, archived_at__isnull=True)
            error = _ensure_can_change(request, old)
            if error is not None:
                return error
            meta = _read_upload(upload)
            new = Attachment.objects.create(
                company_id=old.company_id, entity_kind=old.entity_kind, entity_id=old.entity_id,
                label=old.label, order=old.order,
                description=str(request.data.get('description') or old.description)[:2000],
                file=upload, storage=_storage_for(old.entity_kind, old.entity_id, old.label, old.company_id),
                uploaded_by=request.user, **meta,
            )
            _enqueue_drive_copy(new)
            old.archived_at = timezone.now()
            old.replaced_by = new
            old.save(update_fields=['archived_at', 'replaced_by'])
        return Response(AttachmentSerializer(new).data, status=status.HTTP_201_CREATED)


class AttachmentDownloadView(APIView):
    """دانلود محافظت‌شده (ص۶): `can_view` در هر درخواست؛ پیوست بایگانی‌شده فقط برای مدیر کل."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        obj = get_object_or_404(Attachment, pk=pk)
        if obj.archived_at is not None and not request.user.is_superuser:
            raise Http404
        if not can_view(request.user, obj.entity_kind, obj.entity_id):
            return Response({'detail': 'اجازهٔ دیدن این پیوست را ندارید.'}, status=status.HTTP_403_FORBIDDEN)
        if not obj.file or not obj.file.name:
            raise Http404

        name = obj.original_name or os.path.basename(obj.file.name)
        content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        if getattr(settings, 'MEDIA_ACCEL_REDIRECT', False):
            response = HttpResponse(content_type=content_type)
            response['X-Accel-Redirect'] = f'/internal_media/{quote(obj.file.name)}'
        else:
            try:
                response = FileResponse(obj.file.open('rb'), content_type=content_type)
            except FileNotFoundError:
                raise Http404
        inline = request.query_params.get('download') != '1' and (
            content_type.startswith('image/') or content_type == 'application/pdf')
        ext = os.path.splitext(name)[1]
        disposition = 'inline' if inline else 'attachment'
        response['Content-Disposition'] = (
            f"{disposition}; filename=\"document{ext}\"; filename*=UTF-8''{quote(name.encode('utf-8'))}")
        response['X-Content-Type-Options'] = 'nosniff'
        response['Cache-Control'] = 'private, no-store'
        return response
