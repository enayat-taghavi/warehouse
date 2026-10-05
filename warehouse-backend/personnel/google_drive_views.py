import logging
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Company, CompanyGoogleDriveConfig, GoogleDriveSyncQueue
from .google_drive_service import (
    generate_company_auth_url,
    verify_oauth_state,
    exchange_code_and_store_credentials,
    sync_single_queue_item
)
from .google_drive_path_resolver import GoogleDrivePathResolver

logger = logging.getLogger(__name__)


def check_user_company_access(user, company, require_write: bool = False) -> bool:
    """
    اعتبارسنجی دسترسی کاربر جاری به شرکت (چندمستأجری / Multi-Tenant RBAC)
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    from .models import UserCompanyAccess
    qs = UserCompanyAccess.objects.filter(user=user, company=company)
    if not qs.exists():
        return False
    if require_write:
        return qs.filter(access_level__in=['docs_write', 'workspace_full']).exists()
    return True


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

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)

        # محاسبه آمار لحظه‌ای صف تسک‌های شرکت
        stats = GoogleDriveSyncQueue.objects.filter(company=company).aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='pending')),
            processing=Count('id', filter=Q(status='processing')),
            completed=Count('id', filter=Q(status='completed')),
            failed=Count('id', filter=Q(status='failed')),
        )

        data = {
            "company_id": company.id,
            "company_name": company.name,
            "is_enabled": config.is_enabled,
            "is_connected": bool(config.refresh_token),
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
            "last_sync_at": config.last_sync_at,
            "last_error": config.last_error,
            "stats": stats
        }
        return Response(data, status=status.HTTP_200_OK)

    def patch(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز تغییر تنظیمات گوگل‌درایو این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)

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

        config.save()
        return Response({"success": True, "message": "تنظیمات گوگل‌درایو با موفقیت ذخیره شد."}, status=status.HTTP_200_OK)


class CompanyGoogleDriveAuthUrlView(APIView):
    """
    تولید لینک هدایت احراز هویت OAuth 2.0 برای اتصال اکانت گوگل‌درایو شرکت
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز اتصال حساب گوگل‌درایو برای این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        try:
            auth_url, state = generate_company_auth_url(company.id)
            return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.error(f"Error generating OAuth URL for company {company.name}: {exc}")
            return Response(
                {"error": f"خطا در ایجاد لینک اتصال گوگل: {str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST
            )


class GoogleDriveOAuthCallbackView(APIView):
    """
    رسیدگی به Callback بازگشتی از گوگل پس از تایید دسترسی توسط کاربر
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        code = request.GET.get('code')
        state = request.GET.get('state')
        error = request.GET.get('error')

        if error:
            logger.warning(f"Google OAuth error returned: {error}")
            html_content = f"""
            <!DOCTYPE html>
            <html dir="rtl" lang="fa">
            <head><meta charset="utf-8"><title>خطا در اتصال</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 40px;">
                <h3 style="color: #e11d48;">خطا در اتصال به حساب گوگل</h3>
                <p>کاربر دسترسی را تایید نکرد یا خطایی رخ داد: {error}</p>
                <button onclick="window.close();" style="padding: 10px 20px; border-radius: 8px; cursor: pointer;">بستن پنجره</button>
            </body>
            </html>
            """
            return HttpResponse(html_content, status=400)

        if not code or not state:
            return HttpResponse("کد یا وضعیت احراز هویت ارسال نشده است.", status=400)

        company_id = verify_oauth_state(state)
        if not company_id:
            return HttpResponse("شناسه وضعیت (State) نامعتبر است یا منقضی شده است.", status=400)

        try:
            result = exchange_code_and_store_credentials(code, company_id)
            account_email = result.get('account_email', '')
            company_name = result.get('company_name', '')

            html_content = f"""
            <!DOCTYPE html>
            <html dir="rtl" lang="fa">
            <head>
                <meta charset="utf-8">
                <title>اتصال به گوگل‌درایو موفقیت‌آمیز بود</title>
                <style>
                    body {{ font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #1e293b; }}
                    .card {{ background: white; max-width: 450px; margin: 0 auto; padding: 30px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }}
                    .badge {{ background: #dcfce7; color: #15803d; padding: 6px 12px; border-radius: 9999px; font-weight: bold; font-size: 14px; display: inline-block; margin-bottom: 16px; }}
                    h2 {{ margin: 0 0 10px; font-size: 20px; }}
                    p {{ color: #64748b; font-size: 14px; margin-bottom: 24px; }}
                    button {{ background: #4f46e5; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: bold; cursor: pointer; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="badge">✓ اتصال موفق</div>
                    <h2>اتصال گوگل‌درایو برقرار شد</h2>
                    <p>شرکت <strong>{company_name}</strong> با موفقیت به حساب <strong>{account_email}</strong> متصل شد.</p>
                    <button onclick="finish();">تایید و بازگشت به سامانه</button>
                </div>
                <script>
                    function finish() {{
                        if (window.opener) {{
                            window.opener.postMessage({{ type: 'GDRIVE_OAUTH_SUCCESS', companyId: {company_id} }}, '*');
                        }}
                        window.close();
                    }}
                    setTimeout(finish, 2000);
                </script>
            </body>
            </html>
            """
            return HttpResponse(html_content, status=200)

        except Exception as exc:
            logger.error(f"Error handling Google OAuth callback for company {company_id}: {exc}", exc_info=True)
            return HttpResponse(f"خطا در پردازش توکن گوگل: {str(exc)}", status=500)


class CompanyGoogleDriveDisconnectView(APIView):
    """
    قطع اتصال حساب گوگل‌درایو شرکت و پاکسازی توکن‌ها
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز قطع اتصال گوگل‌درایو این شرکت را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)
        config.refresh_token = None
        config.account_email = None
        config.is_enabled = False
        config.last_error = None
        config.save()
        return Response({"success": True, "message": "اتصال گوگل‌درایو شرکت با موفقیت قطع شد."}, status=status.HTTP_200_OK)


class CompanyGoogleDriveQueueView(APIView):
    """
    مشاهده لیست فایل‌های صف همگام‌سازی گوگل‌درایو شرکت
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, company_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company):
            return Response({"error": "شما دسترسی مجاز به این شرکت ندارید."}, status=status.HTTP_403_FORBIDDEN)

        status_filter = request.GET.get('status')
        limit = min(int(request.GET.get('limit', 50)), 100)

        qs = GoogleDriveSyncQueue.objects.filter(company=company).order_by('-created_at')
        if status_filter and status_filter != 'all':
            qs = qs.filter(status=status_filter)

        tasks = qs[:limit]
        results = [
            {
                "id": t.id,
                "model_name": t.model_name,
                "object_id": t.object_id,
                "target_filename": t.target_filename,
                "target_folder_path": t.target_folder_path,
                "action": t.action,
                "status": t.status,
                "retry_count": t.retry_count,
                "error_message": t.error_message,
                "gdrive_file_id": t.gdrive_file_id,
                "created_at": t.created_at,
                "completed_at": t.completed_at
            }
            for t in tasks
        ]
        return Response({"results": results, "count": qs.count()}, status=status.HTTP_200_OK)


class CompanyGoogleDriveRetryTaskView(APIView):
    """
    تلاش مجدد برای ارسال یک تسک دارای خطا
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, company_id, task_id):
        company = get_object_or_404(Company, id=company_id)
        if not check_user_company_access(request.user, company, require_write=True):
            return Response({"error": "شما مجوز اجرای مجدد تسک را ندارید."}, status=status.HTTP_403_FORBIDDEN)

        task = get_object_or_404(GoogleDriveSyncQueue, id=task_id, company=company)
        task.status = 'pending'
        task.retry_count = 0
        task.error_message = None
        task.save(update_fields=['status', 'retry_count', 'error_message', 'updated_at'])

        success = sync_single_queue_item(task.id)
        task.refresh_from_db()
        return Response({
            "success": True,
            "synced_immediately": success,
            "task_id": task.id,
            "status": task.status
        }, status=status.HTTP_200_OK)


class CompanyGoogleDriveSyncAllView(APIView):
    """
    پیمایش اسناد و فایل‌های موجود این شرکت و افزودن موارد سینک‌نشده به صف
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

        enqueued_count = 0

        def _enqueue_or_reopen(model_name: str, object_id, source_path: str, target_folder: str, target_fname: str) -> bool:
            task = GoogleDriveSyncQueue.objects.filter(
                company=company,
                model_name=model_name,
                object_id=object_id,
                source_file_path=source_path
            ).first()

            if not task:
                GoogleDriveSyncQueue.objects.create(
                    company=company,
                    model_name=model_name,
                    object_id=object_id,
                    source_file_path=source_path,
                    target_folder_path=target_folder,
                    target_filename=target_fname,
                    status='pending',
                    action='upload'
                )
                return True
            elif task.status == 'failed':
                task.status = 'pending'
                task.retry_count = 0
                task.error_message = None
                task.target_folder_path = target_folder
                task.target_filename = target_fname
                task.save(update_fields=['status', 'retry_count', 'error_message', 'target_folder_path', 'target_filename', 'updated_at'])
                return True
            return False

        # ۱. اسناد رسمی و مرکزی شرکت و اسناد مالی
        if config.sync_accounting_docs:
            from .models import CompanyDocument, CompanyBoardMember, ExpenseInvoice, PettyCashTransaction

            # مدارک پایه شرکت
            for ffield in ('articles_of_association', 'latest_gazette', 'logo'):
                fobj = getattr(company, ffield, None)
                if fobj and fobj.name:
                    res = GoogleDrivePathResolver.resolve(company, field_name=ffield, file_obj=fobj)
                    if res:
                        _, folder, fname = res
                        if _enqueue_or_reopen('Company', company.id, fobj.name, folder, fname):
                            enqueued_count += 1

            for doc in CompanyDocument.objects.filter(company=company, file__isnull=False).exclude(file=''):
                res = GoogleDrivePathResolver.resolve(doc, field_name='file')
                if res:
                    comp, folder, fname = res
                    if _enqueue_or_reopen('CompanyDocument', doc.id, doc.file.name, folder, fname):
                        enqueued_count += 1

            for bm in CompanyBoardMember.objects.filter(company=company):
                for bfield in ('attached_id_doc', 'attached_appointment_doc'):
                    bfobj = getattr(bm, bfield, None)
                    if bfobj and bfobj.name:
                        res = GoogleDrivePathResolver.resolve(bm, field_name=bfield, file_obj=bfobj)
                        if res:
                            _, folder, fname = res
                            if _enqueue_or_reopen('CompanyBoardMember', bm.id, bfobj.name, folder, fname):
                                enqueued_count += 1

            for inv in ExpenseInvoice.objects.filter(section__project__company=company, attachment__isnull=False).exclude(attachment=''):
                res = GoogleDrivePathResolver.resolve(inv, field_name='attachment')
                if res:
                    _, folder, fname = res
                    if _enqueue_or_reopen('ExpenseInvoice', inv.id, inv.attachment.name, folder, fname):
                        enqueued_count += 1

            for tx in PettyCashTransaction.objects.filter(
                Q(section__project__company=company) | Q(account__section__project__company=company),
                attachment__isnull=False
            ).exclude(attachment='').distinct():
                res = GoogleDrivePathResolver.resolve(tx, field_name='attachment')
                if res:
                    _, folder, fname = res
                    if _enqueue_or_reopen('PettyCashTransaction', tx.id, tx.attachment.name, folder, fname):
                        enqueued_count += 1

        # ۲. مدارک پرسنلی (PersonnelProfile, PersonnelDocument)
        if config.sync_personnel_docs:
            from .models import PersonnelProfile, PersonnelDocument
            for p in PersonnelProfile.objects.filter(company=company, attachment__isnull=False).exclude(attachment=''):
                res = GoogleDrivePathResolver.resolve(p, field_name='attachment')
                if res:
                    _, folder, fname = res
                    if _enqueue_or_reopen('PersonnelProfile', p.id, p.attachment.name, folder, fname):
                        enqueued_count += 1

            for pdoc in PersonnelDocument.objects.filter(personnel__company=company, file__isnull=False).exclude(file=''):
                res = GoogleDrivePathResolver.resolve(pdoc, field_name='file')
                if res:
                    _, folder, fname = res
                    if _enqueue_or_reopen('PersonnelDocument', pdoc.id, pdoc.file.name, folder, fname):
                        enqueued_count += 1

        # ۳. مدارک ناوگان شرکت (VehicleDocument)
        if config.sync_fleet_docs:
            from .models import VehicleDocument
            for vdoc in VehicleDocument.objects.filter(vehicle__company=company, file__isnull=False).exclude(file=''):
                res = GoogleDrivePathResolver.resolve(vdoc, field_name='file')
                if res:
                    comp, folder, fname = res
                    if _enqueue_or_reopen('VehicleDocument', vdoc.id, vdoc.file.name, folder, fname):
                        enqueued_count += 1

        # ۴. تصاویر اقلام انبار (ItemPhoto)
        if config.sync_inventory_photos:
            try:
                from inventory.models import ItemPhoto
                for iphoto in ItemPhoto.objects.filter(item__warehouse__company=company, image__isnull=False).exclude(image=''):
                    res = GoogleDrivePathResolver.resolve(iphoto, field_name='image')
                    if res:
                        _, folder, fname = res
                        if _enqueue_or_reopen('ItemPhoto', iphoto.id, iphoto.image.name, folder, fname):
                            enqueued_count += 1
            except ImportError:
                pass

        # ۵. نسخه‌های پشتیبان پایگاه داده (Database Backups)
        if config.sync_backups:
            try:
                import os
                from accounts.backup_service import get_backup_list, BACKUP_DIR
                from personnel.google_drive_path_resolver import get_current_shamsi_year_str
                shamsi_year = get_current_shamsi_year_str()
                existing_backups = get_backup_list()
                for b in existing_backups[:10]:
                    fname = b.get('filename')
                    if not fname:
                        continue
                    full_backup_path = os.path.join(BACKUP_DIR, fname)
                    if not os.path.exists(full_backup_path):
                        continue
                    target_folder = f"پشتیبان‌های پایگاه داده/{shamsi_year}"
                    if _enqueue_or_reopen('DatabaseBackup', None, full_backup_path, target_folder, fname):
                        enqueued_count += 1
            except Exception as b_exc:
                logger.warning(f"Error scanning existing database backups for sync-all: {b_exc}")

        if enqueued_count > 0 and config.sync_mode == 'immediate':
            import threading
            def _run_sync_all_async():
                try:
                    from personnel.management.commands.run_gdrive_sync_worker import Command
                    cmd = Command()
                    processed_total = 0
                    while processed_total < enqueued_count + 10:
                        done = cmd.process_batch(limit=50, company_id=company.id, ignore_schedule=True)
                        if done == 0:
                            break
                        processed_total += done
                except Exception as exc:
                    logger.error(f"[GDrive SyncAll] Error running auto-triggered batch for company #{company.id}: {exc}", exc_info=True)

            th = threading.Thread(target=_run_sync_all_async, daemon=True)
            th.start()

        return Response({
            "success": True,
            "message": f"تعداد {enqueued_count} فایل به صف همگام‌سازی گوگل‌درایو افزوده شد.",
            "enqueued_count": enqueued_count
        }, status=status.HTTP_200_OK)


class CompanyGoogleDriveTriggerSyncView(APIView):
    """
    شروع فوری ارسال صف فایل‌های معلق خارج از نوبت (برای حالت دستی یا ارسال اضطراری)
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
            status='pending',
            retry_count__lt=5
        )
        count = pending_qs.count()

        if count == 0:
            return Response({
                "success": True,
                "message": "هیچ فایل معلقی در صف همگام‌سازی این شرکت وجود ندارد.",
                "pending_count": 0
            }, status=status.HTTP_200_OK)

        # اجرای ورکر در نخ پس‌زمینه با نادیده‌گرفتن بازه زمان‌بندی
        import threading
        def _run_trigger():
            try:
                from personnel.management.commands.run_gdrive_sync_worker import Command
                cmd = Command()
                # پردازش در دسته‌های تا سقف ۵۰ تسک تا خالی شدن صف معلق
                processed_total = 0
                while processed_total < count + 10:
                    done = cmd.process_batch(limit=50, company_id=company.id, ignore_schedule=True)
                    if done == 0:
                        break
                    processed_total += done
            except Exception as exc:
                logger.error(f"[GDrive TriggerSync] Error running triggered sync for company #{company.id}: {exc}", exc_info=True)

        th = threading.Thread(target=_run_trigger, daemon=True)
        th.start()

        return Response({
            "success": True,
            "message": f"فرآیند ارسال {count} فایل معلق در صف با موفقیت در پس‌زمینه آغاز شد.",
            "pending_count": count
        }, status=status.HTTP_200_OK)

