import logging
from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Count, Q
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Company, CompanyGoogleDriveConfig, GoogleDriveSyncQueue
from .google_drive_service import generate_company_auth_url

logger = logging.getLogger(__name__)


def check_user_company_access(user, company, require_write: bool = False) -> bool:
    """
    اعتبارسنجی دسترسی کاربر جاری به شرکت (چندمستأجری / Multi-Tenant RBAC) - فاز ۱ (GD-05 / D3)
    """
    if not user or not user.is_authenticated:
        return False
    if not company or not getattr(company, 'is_active', True):
        return False
    if user.is_superuser:
        return True
    from .views import get_user_allowed_companies
    required_level = 'workspace_full' if require_write else 'docs_read'
    allowed_qs = get_user_allowed_companies(user, required_level=required_level)
    return allowed_qs.filter(id=company.id).exists()


def _format_time_field(val, fallback: str) -> str:
    """فرمت‌بندی امن فیلدهای زمان چه به صورت شیء datetime.time و چه به صورت رشته"""
    if not val:
        return fallback
    if isinstance(val, str):
        parts = val.split(':')
        if len(parts) >= 2:
            return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
        return val
    try:
        return val.strftime('%H:%M')
    except Exception:
        return str(val)[:5]


class CompanyGoogleDriveConfigView(APIView):
    """
    استعلام وضعیت اتصال، تنظیمات و آمار صف همگام‌سازی گوگل‌درایو برای یک شرکت
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company):
            return Response({"error": "شما دسترسی مجاز به اطلاعات این شرکت ندارید."}, status=status.HTTP_403_FORBIDDEN)

        config = CompanyGoogleDriveConfig.objects.filter(company=company).first()

        # محاسبه آمار لحظه‌ای صف تسک‌های شرکت
        stats = GoogleDriveSyncQueue.objects.filter(company=company).aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='pending')),
            processing=Count('id', filter=Q(status='processing')),
            completed=Count('id', filter=Q(status='completed')),
            failed=Count('id', filter=Q(status='failed')),
        )

        # محاسبه تعداد رکوردهای تکمیل‌شده در حسابی غیر از حساب جاری (GD-31 / D8)
        current_email = config.account_email if config else None
        other_accounts_count = 0
        if current_email:
            other_completed_keys = set(
                GoogleDriveSyncQueue.objects.filter(
                    company=company,
                    status='completed'
                ).exclude(
                    drive_account=current_email
                ).exclude(
                    drive_account__isnull=True
                ).exclude(
                    drive_account=''
                ).values_list('model_name', 'object_id', 'field_name')
            )
            current_completed_keys = set(
                GoogleDriveSyncQueue.objects.filter(
                    company=company,
                    drive_account=current_email,
                    status='completed'
                ).values_list('model_name', 'object_id', 'field_name')
            )
            other_accounts_count = len(other_completed_keys - current_completed_keys)

        # محاسبه وضعیت ورکر مرکزی (GD-06 / D4)
        worker_alive = False
        worker_heartbeat_at = None
        try:
            from settings_core.models import SystemGoogleDriveConfig
            sys_cfg = SystemGoogleDriveConfig.objects.filter(id=1).only('worker_heartbeat_at').first()
            if sys_cfg and sys_cfg.worker_heartbeat_at:
                worker_heartbeat_at = sys_cfg.worker_heartbeat_at
                worker_alive = (timezone.now() - sys_cfg.worker_heartbeat_at).total_seconds() < 180
        except Exception:
            pass

        if config:
            data = {
                "company_id": company.id,
                "company_name": company.name,
                "is_enabled": config.is_enabled,
                "is_connected": bool(config.refresh_token),
                "auth_status": getattr(config, 'auth_status', 'ok'),
                "account_email": config.account_email,
                "root_folder_id": config.root_folder_id,
                "root_folder_name": config.root_folder_name,
                "root_folder_url": f"https://drive.google.com/drive/folders/{config.root_folder_id}" if config.root_folder_id else None,
                "sync_accounting_docs": config.sync_accounting_docs,
                "sync_personnel_docs": config.sync_personnel_docs,
                "sync_fleet_docs": config.sync_fleet_docs,
                "sync_inventory_photos": config.sync_inventory_photos,
                "sync_backups": config.sync_backups,
                "sync_mode": config.sync_mode,
                "scheduled_start_time": _format_time_field(config.scheduled_start_time, '23:00'),
                "scheduled_end_time": _format_time_field(config.scheduled_end_time, '06:00'),
                "chunk_delay_seconds": config.chunk_delay_seconds,
                "force_sync_until": config.force_sync_until,
                "worker_alive": worker_alive,
                "worker_heartbeat_at": worker_heartbeat_at,
                "last_sync_at": config.last_sync_at,
                "last_error": config.last_error,
                "other_accounts_count": other_accounts_count,
                "stats": stats
            }
        else:
            # بازگرداندن مقادیر پیش‌فرض بدون ساخت رکورد در دیتابیس (GD-19)
            data = {
                "company_id": company.id,
                "company_name": company.name,
                "is_enabled": False,
                "is_connected": False,
                "auth_status": 'unlinked',
                "account_email": None,
                "root_folder_id": None,
                "root_folder_name": None,
                "root_folder_url": None,
                "sync_accounting_docs": True,
                "sync_personnel_docs": True,
                "sync_fleet_docs": True,
                "sync_inventory_photos": True,
                "sync_backups": False,
                "sync_mode": 'immediate',
                "scheduled_start_time": '23:00',
                "scheduled_end_time": '06:00',
                "chunk_delay_seconds": 1,
                "force_sync_until": None,
                "worker_alive": worker_alive,
                "worker_heartbeat_at": worker_heartbeat_at,
                "last_sync_at": None,
                "last_error": None,
                "other_accounts_count": 0,
                "stats": stats
            }
        return Response(data, status=status.HTTP_200_OK)

    def patch(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز تغییر تنظیمات گوگل‌درایو این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)

        # تغییر sync_backups فقط برای سوپریوزر مجاز است (GD-01 / D1)
        if 'sync_backups' in request.data and not request.user.is_superuser:
            return Response(
                {"error": "تغییر تنظیمات پشتیبان پایگاه داده تنها برای مدیر ارشد سامانه (سوپریوزر) مجاز است."},
                status=status.HTTP_403_FORBIDDEN
            )

        updatable_fields = [
            'is_enabled',
            'sync_accounting_docs',
            'sync_personnel_docs',
            'sync_fleet_docs',
            'sync_inventory_photos',
            'sync_backups',
        ]
        for field in updatable_fields:
            if field in request.data:
                val = request.data[field]
                if isinstance(val, str):
                    val = val.strip().lower() not in ('false', '0', 'no', '')
                setattr(config, field, bool(val))

        # فیلد حالت همگام‌سازی (سیاست ترافیک)
        if 'sync_mode' in request.data:
            mode = str(request.data['sync_mode']).strip().lower()
            if mode not in ('immediate', 'scheduled', 'manual'):
                return Response(
                    {"error": "مقدار حالت همگام‌سازی نامعتبر است. مقادیر مجاز: immediate، scheduled، manual"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            config.sync_mode = mode

        # فیلدهای زمان‌بندی ساعات خلوتی
        from datetime import datetime
        if 'scheduled_start_time' in request.data:
            val = str(request.data['scheduled_start_time']).strip()
            try:
                if len(val.split(':')) == 2:
                    t = datetime.strptime(val, '%H:%M').time()
                else:
                    t = datetime.strptime(val, '%H:%M:%S').time()
                config.scheduled_start_time = t
            except ValueError:
                return Response({"error": "فرمت ساعت شروع نامعتبر است (الگوی صحیح: HH:MM)"}, status=status.HTTP_400_BAD_REQUEST)

        if 'scheduled_end_time' in request.data:
            val = str(request.data['scheduled_end_time']).strip()
            try:
                if len(val.split(':')) == 2:
                    t = datetime.strptime(val, '%H:%M').time()
                else:
                    t = datetime.strptime(val, '%H:%M:%S').time()
                config.scheduled_end_time = t
            except ValueError:
                return Response({"error": "فرمت ساعت پایان نامعتبر است (الگوی صحیح: HH:MM)"}, status=status.HTTP_400_BAD_REQUEST)

        # فیلد تاخیر بین فایل‌ها جهت کنترل مصرف پهنای باند
        if 'chunk_delay_seconds' in request.data:
            try:
                delay = int(request.data['chunk_delay_seconds'])
                if delay < 0 or delay > 300:
                    return Response({"error": "تاخیر بین فایل‌ها باید بین ۰ تا ۳۰۰ ثانیه باشد."}, status=status.HTTP_400_BAD_REQUEST)
                config.chunk_delay_seconds = delay
            except (ValueError, TypeError):
                return Response({"error": "مقدار تاخیر بین فایل‌ها باید عدد صحیح باشد."}, status=status.HTTP_400_BAD_REQUEST)

        # اعتبارسنجی تفاوت ساعت شروع و پایان (GD-25)
        if config.scheduled_start_time == config.scheduled_end_time:
            return Response({"error": "ساعت شروع و پایان ارسال نمی‌تواند یکسان باشد."}, status=status.HTTP_400_BAD_REQUEST)

        config.save()
        return Response({"success": True, "message": "تنظیمات گوگل‌درایو با موفقیت ذخیره شد."}, status=status.HTTP_200_OK)


class CompanyGoogleDriveAuthUrlView(APIView):
    """
    تولید لینک هدایت احراز هویت OAuth 2.0 برای اتصال اکانت گوگل‌درایو شرکت (GD-02)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز اتصال حساب گوگل‌درایو برای این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        mode = request.query_params.get('mode', 'popup')
        if mode not in ('popup', 'redirect'):
            mode = 'popup'

        try:
            auth_url, state = generate_company_auth_url(company.id, user=request.user, mode=mode)
            res = Response({"auth_url": auth_url, "state": state, "mode": mode}, status=status.HTTP_200_OK)
            res['Cache-Control'] = 'no-cache, no-store, must-revalidate, private'
            res['Pragma'] = 'no-cache'
            return res
        except Exception as exc:
            logger.error(f"Error generating OAuth URL for company {company.name}: {exc}")
            return Response(
                {"error": "ایجاد لینک اتصال گوگل با خطا روبه‌رو شد. تنظیمات OAuth سرور را بررسی کنید."},
                status=status.HTTP_400_BAD_REQUEST
            )


# فاز ۲: ارجاع به Callback یکپارچه در هسته (settings_core)
from settings_core.google_drive_views import GoogleDriveOAuthCallbackView


class CompanyGoogleDriveDisconnectView(APIView):
    """
    قطع اتصال حساب گوگل‌درایو شرکت و ابطال توکن در سرور گوگل (GD-11)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز قطع اتصال گوگل‌درایو این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)

        # ابطال توکن نزد سرور گوگل (GD-11)
        if config.refresh_token:
            from settings_core.google_drive_client import decrypt_secret, revoke_google_token
            plain_token = decrypt_secret(config.refresh_token)
            if plain_token:
                revoke_google_token(plain_token)

        config.refresh_token = None
        config.account_email = None
        config.is_enabled = False
        config.auth_status = 'unlinked'
        config.last_error = None
        config.save()
        return Response({"success": True, "message": "اتصال گوگل‌درایو شرکت با موفقیت قطع شد."}, status=status.HTTP_200_OK)


class CompanyGoogleDriveQueueView(APIView):
    """
    مشاهده لیست فایل‌های صف همگام‌سازی گوگل‌درایو شرکت با اعتبارسنجی ورودی‌ها (GD-19)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company):
            return Response({"error": "شما دسترسی مجاز به این شرکت ندارید."}, status=status.HTTP_403_FORBIDDEN)

        status_filter = request.GET.get('status')
        allowed_statuses = {'all', 'pending', 'processing', 'completed', 'failed'}
        if status_filter and status_filter not in allowed_statuses:
            return Response(
                {"error": f"وضعیت درخواستی نامعتبر است. مقادیر مجاز: {', '.join(sorted(allowed_statuses))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        raw_limit = request.GET.get('limit', '50')
        try:
            limit = int(raw_limit)
            if limit < 1 or limit > 100:
                return Response({"error": "پارامتر limit باید عددی بین ۱ تا ۱۰۰ باشد."}, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({"error": "پارامتر limit باید یک عدد صحیح معتبر باشد."}, status=status.HTTP_400_BAD_REQUEST)

        raw_offset = request.GET.get('offset', '0')
        try:
            offset = max(0, int(raw_offset))
        except (ValueError, TypeError):
            offset = 0

        qs = GoogleDriveSyncQueue.objects.filter(company=company).order_by('priority', '-created_at')
        if status_filter and status_filter != 'all':
            qs = qs.filter(status=status_filter)

        total_count = qs.count()
        tasks = qs[offset:offset + limit]
        results = [
            {
                "id": t.id,
                "model_name": t.model_name,
                "object_id": t.object_id,
                "field_name": t.field_name,
                "drive_account": t.drive_account,
                "target_filename": t.target_filename,
                "target_folder_path": t.target_folder_path,
                "action": t.action,
                "status": t.status,
                "priority": t.priority,
                "retry_count": t.retry_count,
                "next_retry_at": t.next_retry_at,
                "error_code": t.error_code,
                "error_message": t.error_message,
                "gdrive_file_id": t.gdrive_file_id,
                "created_at": t.created_at,
                "completed_at": t.completed_at
            }
            for t in tasks
        ]
        return Response({"results": results, "count": total_count}, status=status.HTTP_200_OK)


class CompanyGoogleDriveRetryTaskView(APIView):
    """
    تلاش مجدد برای ارسال یک تسک دارای خطا (فقط برای تسک‌های failed، بدون مسدودسازی HTTP - فاز ۳)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, company_id, task_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز اجرای مجدد تسک را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        task = get_object_or_404(GoogleDriveSyncQueue, id=task_id, company=company)
        if task.status != 'failed':
            return Response(
                {"error": "تنها تسک‌های دارای وضعیت خطا (failed) امکان تلاش مجدد دارند."},
                status=status.HTTP_400_BAD_REQUEST
            )

        task.status = 'pending'
        task.retry_count = 0
        task.next_retry_at = None
        task.error_code = None
        task.error_message = None
        task.save(update_fields=['status', 'retry_count', 'next_retry_at', 'error_code', 'error_message', 'updated_at'])

        return Response({
            "success": True,
            "message": "تسک با موفقیت جهت ارسال مجدد توسط ورکر در صف قرار گرفت.",
            "task_id": task.id,
            "status": task.status
        }, status=status.HTTP_202_ACCEPTED)


class CompanyGoogleDriveSyncAllView(APIView):
    """
    ثبت وظیفه پیمایش اسناد و فایل‌های موجود شرکت در صف ناهمگام (GD-10 - اولویت پایین بدون مسدودسازی)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز اجرای همگام‌سازی کلی برای این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)
        if not config.is_enabled or not config.refresh_token:
            return Response(
                {"error": "سرویس گوگل‌درایو برای این شرکت فعال یا متصل نیست."},
                status=status.HTTP_400_BAD_REQUEST
            )

        existing_scan = GoogleDriveSyncQueue.objects.filter(
            company=company,
            action='scan_all',
            status__in=['pending', 'processing']
        ).first()

        if existing_scan:
            return Response({
                "success": True,
                "message": "یک فرآیند پیمایش اسناد در حال حاضر در صف یا در حال اجراست.",
                "task_id": existing_scan.id,
                "status": existing_scan.status
            }, status=status.HTTP_202_ACCEPTED)

        scan_task = GoogleDriveSyncQueue.objects.create(
            company=company,
            model_name='Company',
            object_id=company.id,
            field_name='',
            drive_account=config.account_email or '',
            source_file_path='',
            target_folder_path='',
            target_filename=f"پیمایش سراسری اسناد شرکت {company.name}",
            action='scan_all',
            status='pending',
            priority=50  # اولویت پایین جهت عدم تداخل با فایل‌های روزمره (GD-10)
        )

        return Response({
            "success": True,
            "message": "وظیفه پیمایش اسناد با موفقیت در صف قرار گرفت و توسط ورکر پردازش خواهد شد.",
            "task_id": scan_task.id,
            "status": scan_task.status
        }, status=status.HTTP_202_ACCEPTED)


class CompanyGoogleDriveTriggerSyncView(APIView):
    """
    صدور مجوز ارسال فوری خارج از نوبت برای ساعات خلوتی (D4 / GD-07 - بدون اسپاون نخ)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز اجرای عملیات همگام‌سازی برای این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)
        if not config.is_enabled or not config.refresh_token:
            return Response(
                {"error": "سرویس گوگل‌درایو برای این شرکت فعال یا متصل نیست."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # شمارش تسک‌های معلق
        pending_qs = GoogleDriveSyncQueue.objects.filter(
            company=company,
            status='pending'
        )
        count = pending_qs.count()

        if count == 0:
            return Response({
                "success": True,
                "message": "هیچ فایل معلقی در صف همگام‌سازی این شرکت وجود ندارد.",
                "pending_count": 0
            }, status=status.HTTP_200_OK)

        # تنظیم فیلد force_sync_until جهت عبور ورکر از پنجره ساعات خلوتی
        config.force_sync_until = timezone.now() + timedelta(hours=1)
        config.save(update_fields=['force_sync_until'])

        return Response({
            "success": True,
            "message": f"مجوز ارسال فوری صادر شد. ورکر همگام‌سازی تعداد {count} فایل معلق را خارج از ساعات خلوتی ارسال خواهد کرد.",
            "pending_count": count
        }, status=status.HTTP_202_ACCEPTED)


