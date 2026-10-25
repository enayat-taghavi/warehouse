"""
سرویس صف درایو شرکت‌ها در هسته (۲.۶-ج۲، ص۸ طرح ۲.۶): ساخت کلاینت درایو شرکت، پوشه‌های ریشه و بایگانی،
پردازش یک ردیف صف و حلقهٔ دسته‌ای ورکر. پیمایش اسناد پیشین (`scan_all`) کار ماژول است و از قلاب
`gdrive_scan_all` خوانده می‌شود؛ بی‌قلاب، ردیف در صف می‌ماند و هرگز حذف نمی‌شود.
"""
import os
import time
import hashlib
import logging
from typing import Optional, Tuple, Dict
from datetime import time as dt_time, timedelta

from django.conf import settings
from django.db import transaction, models
from django.utils import timezone

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
import google_auth_httplib2

from platform_core.registry import contributions

from .google_drive_client import (
    SCOPES,
    decrypt_secret,
    get_http_client,
    check_folder_exists as _check_folder_exists,
    find_or_create_folder as _find_or_create_folder,
    classify_gdrive_error,
    transient_backoff_seconds,
)

try:
    import jdatetime
except ImportError:  # pragma: no cover
    jdatetime = None

logger = logging.getLogger(__name__)

# کش شناسهٔ پوشه‌های درایو: {(company_id, parent_id, folder_name): folder_id}
_FOLDER_CACHE: Dict[Tuple[int, str, str], str] = {}
# کش پوشهٔ ریشه و بایگانی هر شرکت: {company_id: (root_id, archive_id, timestamp)}
_ROOT_ARCHIVE_CACHE: Dict[int, Tuple[str, str, float]] = {}


def get_current_shamsi_year_str() -> str:
    if jdatetime:
        return str(jdatetime.datetime.now().year)
    return str(timezone.now().year)


def invalidate_folder_cache(company_id: Optional[int] = None):
    """
    ابطال کش پوشه‌ها در صورت بروز خطای 404 یا حذف پوشه در درایو (GD-15)
    """
    global _FOLDER_CACHE, _ROOT_ARCHIVE_CACHE
    if company_id is None:
        _FOLDER_CACHE.clear()
        _ROOT_ARCHIVE_CACHE.clear()
        logger.info("[GDrive Service] Global folder cache cleared.")
    else:
        keys_to_remove = [k for k in _FOLDER_CACHE if k[0] == company_id]
        for k in keys_to_remove:
            _FOLDER_CACHE.pop(k, None)
        _ROOT_ARCHIVE_CACHE.pop(company_id, None)
        logger.info(f"[GDrive Service] Folder cache cleared for company #{company_id}.")


def get_google_drive_service(company_id: int):
    """
    Construct an authorized Google Drive API v3 service resource for a company
    """
    from .models import CompanyGoogleDriveConfig

    try:
        config = CompanyGoogleDriveConfig.objects.get(company_id=company_id)
    except CompanyGoogleDriveConfig.DoesNotExist:
        return None

    decrypted_token = decrypt_secret(config.refresh_token)
    if not decrypted_token:
        if config.refresh_token:
            config.auth_status = 'needs_reauth'
            config.last_error = "خطا در رمزگشایی کلید دسترسی گوگل؛ نیازمند اتصال مجدد است."
            config.save(update_fields=['auth_status', 'last_error', 'updated_at'])
        return None

    client_id = getattr(settings, 'GOOGLE_OAUTH_CLIENT_ID', '')
    client_secret = getattr(settings, 'GOOGLE_OAUTH_CLIENT_SECRET', '')

    creds = Credentials(
        token=None,
        refresh_token=decrypted_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES
    )

    http_client = get_http_client()
    authorized_http = google_auth_httplib2.AuthorizedHttp(creds, http=http_client)
    service = build('drive', 'v3', http=authorized_http, cache_discovery=False)
    return service


def ensure_company_drive_folders(company, drive_service) -> Tuple[str, str]:
    """
    Ensure the company root folder and archive folder exist in Google Drive
    Returns (root_folder_id, archive_folder_id) with memory caching to avoid redundant queries (GD-15)
    """
    import time
    now_ts = time.time()
    cached = _ROOT_ARCHIVE_CACHE.get(company.id)
    if cached and (now_ts - cached[2]) < 300:
        return cached[0], cached[1]

    from .models import CompanyGoogleDriveConfig
    config, _ = CompanyGoogleDriveConfig.objects.get_or_create(company=company)
    root_folder_name = f"سامانه ابری شرکت {company.name}"
    
    # Check or create root folder
    root_id = config.root_folder_id
    if not root_id or not _check_folder_exists(drive_service, root_id):
        root_id = _find_or_create_folder(drive_service, parent_id='root', folder_name=root_folder_name)
        config.root_folder_id = root_id
        config.root_folder_name = root_folder_name

    # Check or create archive folder inside root
    archive_id = config.archive_folder_id
    archive_name = "بایگانی و اسناد حذف‌شده"
    if not archive_id or not _check_folder_exists(drive_service, archive_id):
        archive_id = _find_or_create_folder(drive_service, parent_id=root_id, folder_name=archive_name)
        config.archive_folder_id = archive_id

    config.save(update_fields=['root_folder_id', 'root_folder_name', 'archive_folder_id'])
    _ROOT_ARCHIVE_CACHE[company.id] = (root_id, archive_id, now_ts)
    return root_id, archive_id


def resolve_folder_hierarchy(company_id: int, drive_service, root_folder_id: str, relative_path: str) -> str:
    """
    Given a path like 'سامانه حسابداری و اداری/پروژه مرکزی/بخش تدارکات/۱۴۰۵',
    ensures all intermediate folders exist in Google Drive and returns the destination folder ID.
    Uses memory cache to avoid redundant API queries with 404 recovery (GD-15).
    """
    segments = [s.strip() for s in relative_path.replace('\\', '/').split('/') if s.strip()]
    current_parent_id = root_folder_id

    for seg in segments:
        cache_key = (company_id, current_parent_id, seg)
        if cache_key in _FOLDER_CACHE:
            current_parent_id = _FOLDER_CACHE[cache_key]
            continue

        try:
            folder_id = _find_or_create_folder(drive_service, parent_id=current_parent_id, folder_name=seg)
            _FOLDER_CACHE[cache_key] = folder_id
            current_parent_id = folder_id
        except HttpError as he:
            if getattr(getattr(he, 'resp', None), 'status', None) == 404:
                invalidate_folder_cache(company_id)
                folder_id = _find_or_create_folder(drive_service, parent_id=root_folder_id, folder_name=seg)
                _FOLDER_CACHE[(company_id, root_folder_id, seg)] = folder_id
                current_parent_id = folder_id
            else:
                raise

    return current_parent_id


def _run_scan_all(task) -> bool:
    """پیمایش اسناد پیشین با قلاب ماژول (`gdrive_scan_all`)؛ بی‌قلاب، ردیف یک ساعت بعد دوباره دیده می‌شود."""
    hooks = contributions('gdrive_scan_all')
    if not hooks:
        task.status = 'pending'
        task.next_retry_at = timezone.now() + timedelta(hours=1)
        task.error_message = "پیمایش اسناد پیشین در این نسخه در دسترس نیست؛ ردیف در صف می‌ماند."
        task.save(update_fields=['status', 'next_retry_at', 'error_message', 'updated_at'])
        return False
    return hooks[-1](task)


def sync_single_queue_item(task_id: int) -> bool:
    """
    پردازش تک وظیفه صف گوگل‌درایو با تصاحب اتمیک، دسته‌بندی پیشرفته خطا و تکرار مقاوم (GD-06 تا GD-11)
    """
    from .models import GoogleDriveSyncQueue

    # ۱. تصاحب اتمیک تسک (GD-06)
    acquired = GoogleDriveSyncQueue.objects.filter(
        id=task_id,
        status='pending'
    ).update(status='processing', updated_at=timezone.now())

    if acquired == 0:
        logger.debug(f"[GDrive Queue] Task #{task_id} could not be acquired (already processing or not pending).")
        return False

    task = GoogleDriveSyncQueue.objects.select_related('company', 'company__gdrive_config').filter(id=task_id).first()
    if not task:
        return False

    company = task.company
    config = getattr(company, 'gdrive_config', None)
    if not config or not config.is_enabled or not config.refresh_token:
        # تسک آزاد می‌شود و در صف می‌ماند تا پس از اتصال یا فعال‌سازی دوباره ارسال شود.
        task.status = 'pending'
        task.error_message = "سرویس گوگل‌درایو برای این شرکت فعال یا متصل نیست."
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    # ۲. بررسی تسک از نوع پیمایش سراسری (GD-10)
    if task.action == 'scan_all':
        return _run_scan_all(task)

    drive_service = get_google_drive_service(company.id)
    if not drive_service:
        config.auth_status = 'needs_reauth'
        config.last_error = "امکان ساخت کلاینت گوگل‌درایو برای این شرکت وجود ندارد؛ نیازمند اتصال مجدد است."
        config.save(update_fields=['auth_status', 'last_error', 'updated_at'])

        task.status = 'pending'
        task.error_message = config.last_error
        task.save(update_fields=['status', 'error_message', 'updated_at'])
        return False

    try:
        root_id, archive_id = ensure_company_drive_folders(company, drive_service)

        if task.action == 'archive_delete':
            # انتقال فایل حذف‌شده به پوشه بایگانی سالانه
            if task.gdrive_file_id:
                try:
                    shamsi_year = get_current_shamsi_year_str()
                    dest_archive_folder_id = resolve_folder_hierarchy(
                        company_id=company.id,
                        drive_service=drive_service,
                        root_folder_id=archive_id,
                        relative_path=shamsi_year
                    )

                    file_info = drive_service.files().get(fileId=task.gdrive_file_id, fields='parents').execute()
                    previous_parents = ",".join(file_info.get('parents', []))
                    drive_service.files().update(
                        fileId=task.gdrive_file_id,
                        addParents=dest_archive_folder_id,
                        removeParents=previous_parents,
                        fields='id, parents'
                    ).execute()
                    task.status = 'completed'
                    task.completed_at = timezone.now()
                    task.error_message = None
                    task.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])
                    return True
                except HttpError as he:
                    if getattr(getattr(he, 'resp', None), 'status', None) == 404:
                        task.status = 'completed'
                        task.completed_at = timezone.now()
                        task.error_message = "فایل در درایو یافت نشد (احتمالاً قبلاً حذف شده)."
                        task.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])
                        return True
                    raise
            else:
                task.status = 'completed'
                task.completed_at = timezone.now()
                task.error_message = "فایل در گوگل‌درایو بارگذاری نشده بود (فاقد شناسه فایل)."
                task.save(update_fields=['status', 'completed_at', 'error_message', 'updated_at'])
                return True

        elif task.action == 'upload':
            abs_local_path = task.source_file_path
            clean_rel = abs_local_path.lstrip('/\\')
            if clean_rel.lower().startswith('media/') or clean_rel.lower().startswith('media\\'):
                clean_rel = clean_rel[6:]

            in_media = os.path.join(settings.MEDIA_ROOT, clean_rel)
            in_media_raw = os.path.join(settings.MEDIA_ROOT, abs_local_path)
            in_base = os.path.join(settings.BASE_DIR, clean_rel)
            from accounts.backup_service import get_backup_dir
            in_db_backups = os.path.join(get_backup_dir(), os.path.basename(abs_local_path))
            in_backups = os.path.join(settings.BASE_DIR, 'accounts', 'backups', os.path.basename(abs_local_path))

            if os.path.exists(abs_local_path) and os.path.isfile(abs_local_path):
                pass
            elif os.path.exists(in_media) and os.path.isfile(in_media):
                abs_local_path = in_media
            elif os.path.exists(in_media_raw) and os.path.isfile(in_media_raw):
                abs_local_path = in_media_raw
            elif os.path.exists(in_base) and os.path.isfile(in_base):
                abs_local_path = in_base
            elif os.path.exists(in_db_backups) and os.path.isfile(in_db_backups):
                abs_local_path = in_db_backups
            elif os.path.exists(in_backups) and os.path.isfile(in_backups):
                abs_local_path = in_backups

            if not os.path.exists(abs_local_path):
                task.status = 'failed'
                task.error_code = 'file_not_found'
                task.error_message = f"فایل مبدأ در سرور یافت نشد: {task.source_file_path}"
                task.save(update_fields=['status', 'error_code', 'error_message', 'updated_at'])
                return False

            # محاسبه هش امنیتی SHA-256 و MD5 همزمان در همان حلقه تکه‌ای ۶۴ کیلوبایتی (GD-14)
            hasher_sha256 = hashlib.sha256()
            hasher_md5 = hashlib.md5()
            with open(abs_local_path, 'rb') as f:
                while chunk := f.read(65536):
                    hasher_sha256.update(chunk)
                    hasher_md5.update(chunk)
            task.file_sha256 = hasher_sha256.hexdigest()
            local_md5 = hasher_md5.hexdigest()

            # مسیر پوشه مقصد در گوگل‌درایو
            dest_folder_id = resolve_folder_hierarchy(
                company_id=company.id,
                drive_service=drive_service,
                root_folder_id=root_id,
                relative_path=task.target_folder_path
            )

            file_metadata = {
                'name': task.target_filename,
                'parents': [dest_folder_id]
            }

            def _new_media():
                return MediaFileUpload(
                    abs_local_path,
                    resumable=True,
                    chunksize=1024 * 1024 * 5  # قطعات ۵ مگابایتی
                )

            def _run_upload(req):
                result = None
                while result is None:
                    _, result = req.next_chunk(num_retries=3)
                return result

            # به‌روزرسانی فقط با شناسه گوگل‌درایو از رکورد قبلی همان کلید انجام می‌شود (حذف جستجوی هم‌نام GD-12)
            existing_id = task.gdrive_file_id
            if not existing_id and task.object_id and task.field_name:
                prev_completed = GoogleDriveSyncQueue.objects.filter(
                    company=company,
                    model_name=task.model_name,
                    object_id=task.object_id,
                    field_name=task.field_name,
                    drive_account=task.drive_account,
                    source_file_path=task.source_file_path,
                    status='completed',
                    gdrive_file_id__isnull=False
                ).exclude(id=task.id).order_by('-completed_at').first()
                if prev_completed and prev_completed.gdrive_file_id:
                    existing_id = prev_completed.gdrive_file_id

            uploaded = None
            if existing_id:
                try:
                    uploaded = _run_upload(drive_service.files().update(
                        fileId=existing_id,
                        media_body=_new_media(),
                        fields='id, md5Checksum'
                    ))
                except HttpError as he:
                    # خطای 404 فقط هنگام ارسال (next_chunk) بالا می‌آید: فایل در درایو حذف شده،
                    # پس فایل تازه ساخته می‌شود به‌جای تکرار بی‌پایان به‌روزرسانی.
                    if getattr(getattr(he, 'resp', None), 'status', None) != 404:
                        raise
                    logger.warning(f"[GDrive Sync] File {existing_id} for task #{task.id} not found in Drive; uploading as new file.")
                    task.gdrive_file_id = None
            if uploaded is None:
                uploaded = _run_upload(drive_service.files().create(
                    body=file_metadata,
                    media_body=_new_media(),
                    fields='id, md5Checksum'
                ))

            # مقایسه md5Checksum گوگل با MD5 محلی (GD-14)
            gdrive_md5 = uploaded.get('md5Checksum')
            if gdrive_md5 and local_md5 and gdrive_md5.lower() != local_md5.lower():
                logger.error(f"[GDrive Sync] MD5 mismatch for task #{task.id}! Local: {local_md5}, Drive: {gdrive_md5}")
                task.status = 'failed'
                task.error_code = 'CHECKSUM_MISMATCH'
                task.error_message = f"عدم تطابق هش فایل با گوگل درایو (محلی: {local_md5}، درایو: {gdrive_md5})"
                task.save(update_fields=['status', 'error_code', 'error_message', 'updated_at'])
                return False

            task.gdrive_file_id = uploaded.get('id')
            task.status = 'completed'
            task.completed_at = timezone.now()
            task.error_code = None
            task.error_message = None
            task.save(update_fields=['gdrive_file_id', 'status', 'completed_at', 'error_code', 'error_message', 'updated_at'])

            config.last_sync_at = timezone.now()
            config.auth_status = 'ok'
            config.save(update_fields=['last_sync_at', 'auth_status', 'updated_at'])
            return True

    except Exception as exc:
        logger.error(f"Error processing GDrive task #{task_id}: {exc}", exc_info=True)
        err_info = classify_gdrive_error(exc)
        category = err_info['category']
        user_msg = err_info['user_message']
        reason_code = err_info.get('reason') or 'unknown_error'

        # اگر خطای 404 در ارتباط با پوشه‌ها رخ داده، کش پوشه این شرکت باطل شود (GD-15)
        if isinstance(exc, HttpError) and getattr(getattr(exc, 'resp', None), 'status', None) == 404:
            invalidate_folder_cache(company.id)

        task.error_code = reason_code

        if category == 'needs_reauth':
            config.auth_status = 'needs_reauth'
            config.last_error = user_msg
            config.save(update_fields=['auth_status', 'last_error', 'updated_at'])

            task.status = 'pending'
            task.error_message = user_msg
            task.save(update_fields=['status', 'error_code', 'error_message', 'updated_at'])
            return False

        elif category == 'transient':
            # خطای گذرا هیچ‌وقت تسک را failed نمی‌کند؛ با تأخیر نمایی (سقف یک ساعت) دوباره تلاش می‌شود.
            task.retry_count += 1
            backoff_secs = transient_backoff_seconds(task.retry_count)
            task.next_retry_at = timezone.now() + timedelta(seconds=backoff_secs)
            task.status = 'pending'
            task.error_message = f"{user_msg} (تلاش مجدد در {backoff_secs} ثانیه)"
            task.save(update_fields=['retry_count', 'next_retry_at', 'status', 'error_code', 'error_message', 'updated_at'])

            # ثبت خطای سطح ارتباط فقط در صورت خطای کلی شبکه یا سرور (GD-20)
            if 'network' in reason_code or 'http_5' in reason_code:
                config.last_error = f"خطای موقت در ارتباط با سرور گوگل: {user_msg}"
                config.save(update_fields=['last_error', 'updated_at'])
            return False

        else:  # permanent
            task.status = 'failed'
            task.retry_count += 1
            task.error_message = user_msg
            task.save(update_fields=['status', 'retry_count', 'error_code', 'error_message', 'updated_at'])

            # ثبت خطای سیستمی فقط برای خطاهای سطح فضای دیسک یا عدم دسترسی کلی درایو (GD-20)
            if reason_code in ('storageQuotaExceeded', 'insufficientPermissions'):
                config.last_error = f"خطای دسترسی یا سهمیه گوگل‌درایو: {user_msg}"
                config.save(update_fields=['last_error', 'updated_at'])
            return False

    return False


def is_time_in_range(start_time: dt_time, end_time: dt_time, current_time: dt_time) -> bool:
    """
    بررسی قرار داشتن ساعت جاری سرور در بازه مجاز با پشتیبانی کامل از عبور از نیمه‌شب
    مثال: ۲۳:۰۰ تا ۰۶:۰۰ بامداد
    """
    if start_time <= end_time:
        return start_time <= current_time <= end_time
    else:
        # بازه عبورکننده از نیمه‌شب (overnight span)
        return current_time >= start_time or current_time <= end_time


def _ensure_time(val, default_time: dt_time) -> dt_time:
    """اطمینان از تبدیل مقدار ساعت به شیء dt_time چه به صورت رشته و چه شیء زمان"""
    if isinstance(val, dt_time):
        return val
    if isinstance(val, str):
        try:
            parts = [int(p) for p in val.split(':')]
            if len(parts) >= 2:
                return dt_time(parts[0], parts[1], parts[2] if len(parts) > 2 else 0)
        except Exception:
            pass
    return default_time


def is_company_eligible_for_sync(config, ignore_schedule: bool = False) -> tuple[bool, str]:
    """
    بررسی صلاحیت شرکت برای اجرای همگام‌سازی در لحظه جاری بر اساس سیاست زمان‌بندی
    """
    if not config or not config.is_enabled or not config.refresh_token:
        return False, "سرویس گوگل‌درایو شرکت غیرفعال یا فاقد توکن اتصال است"

    if ignore_schedule:
        return True, "ارسال اجباری / دستور مستقیم مدیر (Ignore Schedule)"

    if config.force_sync_until and config.force_sync_until > timezone.now():
        return True, "همگام‌سازی اجباری موقت فعال است (Force Sync Window)"

    if config.sync_mode == 'immediate':
        return True, "حالت همگام‌سازی آنی (Immediate)"

    if config.sync_mode == 'manual':
        return False, "حالت فقط دستی (Manual) - نیازمند تایید مستقیم کاربر در پنل"

    if config.sync_mode == 'scheduled':
        now_time = timezone.localtime().time()
        start = _ensure_time(config.scheduled_start_time, dt_time(23, 0))
        end = _ensure_time(config.scheduled_end_time, dt_time(6, 0))
        if is_time_in_range(start, end, now_time):
            return True, f"در بازه مجاز ساعات خلوتی شبکه ({start.strftime('%H:%M')} تا {end.strftime('%H:%M')})"
        else:
            return False, f"خارج از بازه ساعات خلوتی شبکه ({start.strftime('%H:%M')} تا {end.strftime('%H:%M')})"

    return True, "حالت پیش‌فرض"


def process_company_batch(limit: int = 20, company_id: int = None, ignore_schedule: bool = False,
                          log=None, keep_running=None) -> int:
    from .models import GoogleDriveSyncQueue, CompanyGoogleDriveConfig

    if log is None:
        def log(msg, style=None):
            logger.info(msg)
    if keep_running is None:
        def keep_running():
            return True
    """
    برداشتن امن تسک‌های صف با قفل ردیف و پردازش آن‌ها با رعایت سیاست‌های زمان‌بندی و تاخیر چانک
    """
    # ۰. بازیابی تسک‌های رها شده در وضعیت processing بیش از ۳۰ دقیقه (Zombies - GD-07)
    cutoff = timezone.now() - timedelta(minutes=30)
    try:
        recovered = GoogleDriveSyncQueue.objects.filter(
            status='processing',
            updated_at__lt=cutoff
        ).update(status='pending', updated_at=timezone.now())
        if recovered > 0:
            logger.warning(f"[Company GDrive Worker] Recovered {recovered} zombie tasks back to pending.")
    except Exception as z_exc:
        logger.debug(f"[Company GDrive Worker] Zombie recovery error: {z_exc}")

    # ۱. تعیین شرکت‌های واجد شرایط در این لحظه
    # شرکت با توکن باطل (needs_reauth) کنار گذاشته می‌شود تا اتصال دوباره؛ وگرنه
    # تسک‌هایش هر ثانیه برداشته و به گوگل فرستاده می‌شوند (حلقهٔ داغ).
    config_qs = CompanyGoogleDriveConfig.objects.filter(
        is_enabled=True,
        refresh_token__isnull=False
    ).exclude(refresh_token='').exclude(auth_status='needs_reauth')

    if company_id:
        config_qs = config_qs.filter(company_id=company_id)

    eligible_company_ids = []
    company_delay_map = {}

    for cfg in config_qs:
        eligible, reason = is_company_eligible_for_sync(cfg, ignore_schedule=ignore_schedule)
        if eligible:
            eligible_company_ids.append(cfg.company_id)
            company_delay_map[cfg.company_id] = cfg.chunk_delay_seconds if cfg.chunk_delay_seconds is not None else 1
        else:
            logger.debug(f"[GDDrive Worker] Company #{cfg.company_id} ({cfg.company.name}) skipped: {reason}")

    if not eligible_company_ids:
        return 0

    candidate_ids = []
    task_company_map = {}

    # ۲. انتخاب تسک‌های در انتظار ارسال با ترتیب اولویت و تاریخ
    # نکته: وضعیت به processing در خود sync_single_queue_item به طور اتمیک تغییر می‌یابد (GD-06)
    with transaction.atomic():
        qs = GoogleDriveSyncQueue.objects.select_for_update(skip_locked=True).filter(
            company_id__in=eligible_company_ids,
            status='pending'
        ).filter(
            models.Q(next_retry_at__isnull=True) | models.Q(next_retry_at__lte=timezone.now())
        ).order_by('priority', 'created_at')

        candidate_tasks = list(qs[:limit])
        for t in candidate_tasks:
            candidate_ids.append(t.id)
            task_company_map[t.id] = t.company_id

    if not candidate_ids:
        return 0

    log(f"Processing {len(candidate_ids)} sync task(s)...")
    success_count = 0

    for task_id in candidate_ids:
        if not keep_running():
            break

        try:
            ok = sync_single_queue_item(task_id)
            if ok:
                success_count += 1
                log(f"  [✓] Task #{task_id} synced successfully.", 'SUCCESS')
            else:
                log(f"  [!] Task #{task_id} sync failed.", 'WARNING')
        except Exception as exc:
            log(f"  [✗] Error syncing task #{task_id}: {exc}", 'ERROR')

        # اعمال مکث تاخیر بین چانک‌ها جهت جلوگیری از اشغال ۱۰۰ درصدی پهنای باند آپلود
        cid = task_company_map.get(task_id)
        delay = company_delay_map.get(cid, 1)
        if delay > 0 and keep_running():
            time.sleep(delay)

    return len(candidate_ids)
