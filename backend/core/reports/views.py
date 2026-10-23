"""
Viewهای گزارش‌ساز

همه endpointها پشت مجوز منوی view_sys_reports هستند.
هر خطای کاربری با ReportError به پاسخ 4xx فارسی تبدیل می‌شود.
خطاهای سروری/غیرمنتظره لاگ شده و به صورت 500 استاندارد بازگردانده می‌شوند.
"""
from django.db.models import Q
from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import require_menu_access

from django.utils import timezone

from .engine import ReportEngine, ReportError
from .excel import SYNC_ROW_LIMIT, cleanup_old_jobs, start_export_job, sync_excel_response, worker_alive
from .pdf import sync_pdf_response
from .models import ReportExportJob, ReportTemplate
from .registry import get_registry
from .serializers import ReportExportJobSerializer, ReportTemplateSerializer

ReportsMenuAccess = require_menu_access('view_sys_reports')


def _error_response(exc: ReportError):
    return Response({'error': exc.message}, status=exc.status)


class EntitiesView(APIView):
    """GET /api/reports/entities/ — موجودیت‌های مجاز برای کاربر جاری."""
    permission_classes = [IsAuthenticated, ReportsMenuAccess]

    def get(self, request):
        out = [
            {'key': cfg.key, 'label': cfg.label}
            for cfg in get_registry().values()
            if cfg.user_has_access(request.user)
        ]
        return Response(out)


class EntityFieldsView(APIView):
    """GET /api/reports/entities/<key>/fields/?warehouse_id= — متادیتای فیلدها."""
    permission_classes = [IsAuthenticated, ReportsMenuAccess]

    def get(self, request, entity_key):
        registry = get_registry()
        cfg = registry.get(entity_key)
        if cfg is None:
            return Response({'error': f'موجودیت نامعتبر: {entity_key}'}, status=400)
        if not cfg.user_has_access(request.user):
            return Response({'error': 'شما به این موجودیت دسترسی ندارید.'}, status=403)

        warehouse_id = request.query_params.get('warehouse_id') or None
        if warehouse_id is not None:
            try:
                warehouse_id = int(warehouse_id)
            except (ValueError, TypeError):
                return Response({'error': 'شناسه انبار نامعتبر است.'}, status=400)

        fields = cfg.allowed_fields(request.user, warehouse_id)
        out = []
        for fd in fields.values():
            out.append({
                'key': fd.key,
                'label': fd.label,
                'type': fd.type,
                'operators': fd.operators,
                'choices': list(fd.choices) if fd.choices else None,
                'groupable': fd.groupable,
                'aggregatable': fd.aggregatable,
                'dynamic': fd.key.startswith('dyn__'),
            })

        # JOINهای مجاز برای این موجودیت
        from .registry import JOINS
        entity_joins = JOINS.get(cfg.key, {})
        joins_out = []
        for join_key, jd in entity_joins.items():
            target_cfg = get_registry().get(jd.target)
            if target_cfg and target_cfg.user_has_access(request.user):
                joins_out.append({
                    'key': join_key,
                    'target': jd.target,
                    'label': jd.label,
                    'cardinality': jd.cardinality,
                    'allowed_types': list(jd.allowed_types),
                    'default_alias': join_key,
                })

        return Response({
            'entity': cfg.key,
            'label': cfg.label,
            'warehouse_required_for_dynamic': cfg.key == 'items',
            'fields': out,
            'joins': joins_out,
        })


class RunReportView(APIView):
    """POST /api/reports/run/ — اجرای spec با پاسخ صفحه‌بندی‌شده."""
    permission_classes = [IsAuthenticated, ReportsMenuAccess]

    def post(self, request):
        try:
            engine = ReportEngine(request.user, request.data)
            return Response(engine.run())
        except ReportError as e:
            return _error_response(e)
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception('Report execution failed: %s', e)
            return Response({'error': 'خطای داخلی در اجرای گزارش. لطفاً با مدیر سیستم تماس بگیرید.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ExportReportView(APIView):
    """
    POST /api/reports/export/ — خروجی گزارش:
    - format='pdf': همیشه sync با سقف ردیف/ستون (خطای فارسی اگر بزرگ باشد).
    - xlsx (پیش‌فرض) تا SYNC_ROW_LIMIT ردیف: فایل همان لحظه برمی‌گردد.
    - xlsx بزرگ‌تر: job پس‌زمینه ساخته می‌شود و 202 {job_id} برمی‌گردد.
    """
    permission_classes = [IsAuthenticated, ReportsMenuAccess]

    def post(self, request):
        try:
            spec = request.data if isinstance(request.data, dict) else {}
            engine = ReportEngine(request.user, spec)
            qs, columns, total = engine.export_queryset()

            report_name = str(spec.get('report_name') or 'report')[:100]
            fmt = str(spec.get('format') or 'xlsx').lower()
            if fmt == 'pdf':
                safe_pdf_name = f'{report_name}.pdf'
                return sync_pdf_response(
                    qs, columns, total, filename=safe_pdf_name, report_name=report_name,
                )
            if total <= SYNC_ROW_LIMIT:
                safe_excel_name = f'{report_name}.xlsx'
                return sync_excel_response(
                    qs, columns, filename=safe_excel_name, report_name=report_name,
                )

            job = start_export_job(request.user, spec, report_name, total)
            return Response(
                {'job_id': job.pk, 'total_rows': total, 'status': job.status},
                status=status.HTTP_202_ACCEPTED,
            )
        except ReportError as e:
            return _error_response(e)
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception('Report export failed: %s', e)
            return Response({'error': 'خطای داخلی در ایجاد خروجی گزارش. لطفاً با مدیر سیستم تماس بگیرید.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ExportJobListView(APIView):
    """GET /api/reports/exports/ — jobهای کاربر جاری + پاک‌سازی فرصت‌طلبانه."""
    permission_classes = [IsAuthenticated, ReportsMenuAccess]

    def get(self, request):
        cleanup_old_jobs()
        jobs = ReportExportJob.objects.filter(owner=request.user).order_by('-created_at', '-id')[:20]
        return Response(ReportExportJobSerializer(jobs, many=True).data)


class ExportJobDetailView(APIView):
    """GET /api/reports/exports/<id>/ — وضعیت/درصد پیشرفت job."""
    permission_classes = [IsAuthenticated, ReportsMenuAccess]

    def get(self, request, job_id):
        try:
            job = ReportExportJob.objects.get(pk=job_id, owner=request.user)
        except ReportExportJob.DoesNotExist:
            return Response({'error': 'job یافت نشد.'}, status=404)

        # بازیابی خودکار jobهای گیرکرده (نبض مرده بیش از ۵ دقیقه یا صف معلق در حالت بدون worker)
        now = timezone.now()
        is_stale_running = (
            job.status == 'running'
            and (
                (job.heartbeat_at and (now - job.heartbeat_at).total_seconds() > 300)
                or (not job.heartbeat_at and (now - job.created_at).total_seconds() > 300)
            )
        )
        is_stale_pending = (
            job.status == 'pending'
            and not worker_alive()
            and (now - job.created_at).total_seconds() > 300
        )
        if is_stale_running or is_stale_pending:
            job.status = 'failed'
            job.error_message = 'پردازش متوقف شد (عدم پاسخ سرور)؛ لطفاً مجدداً خروجی بگیرید.'
            job.finished_at = now
            job.save(update_fields=['status', 'error_message', 'finished_at'])

        return Response(ReportExportJobSerializer(job).data)


class ExportJobDownloadView(APIView):
    """GET /api/reports/exports/<id>/download/ — دانلود streaming فایل آماده."""
    permission_classes = [IsAuthenticated, ReportsMenuAccess]

    def get(self, request, job_id):
        try:
            job = ReportExportJob.objects.get(pk=job_id, owner=request.user)
        except ReportExportJob.DoesNotExist:
            return Response({'error': 'job یافت نشد.'}, status=404)
        if job.status != 'done':
            return Response({'error': 'فایل هنوز آماده نیست.'}, status=409)
        p = job.absolute_file_path
        if p is None or not p.exists():
            return Response(
                {'error': 'فایل منقضی/حذف شده است؛ دوباره خروجی بگیرید.'}, status=410,
            )
        safe_name = f'report_{job.pk}.xlsx'
        return FileResponse(
            p.open('rb'), as_attachment=True, filename=safe_name,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )


class ReportTemplateViewSet(viewsets.ModelViewSet):
    """CRUD قالب‌های گزارش — نمایش: شخصی + عمومی؛ نوشتن: فقط owner یا superuser."""
    serializer_class = ReportTemplateSerializer
    permission_classes = [IsAuthenticated, ReportsMenuAccess]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        qs = ReportTemplate.objects.select_related('owner')
        if user.is_superuser:
            return qs
        return qs.filter(Q(owner=user) | Q(is_public=True))

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def _check_write(self, instance):
        user = self.request.user
        if not (user.is_superuser or instance.owner_id == user.id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('فقط سازنده قالب می‌تواند آن را تغییر دهد.')

    def perform_update(self, serializer):
        self._check_write(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_write(instance)
        instance.delete()
