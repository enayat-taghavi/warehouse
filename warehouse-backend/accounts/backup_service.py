import os
import json
import hashlib
import sqlite3
import shutil
import subprocess
import logging
from datetime import datetime
from django.conf import settings
from django.db import connections
from django.utils import timezone
try:
    import jdatetime
except ImportError:
    jdatetime = None
from .audit_utils import log_audit_event

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(settings.BASE_DIR, 'backups', 'db')


def _ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


def clean_public_schema():
    """
    Cleanly drop all existing tables, sequences, views, and materialized views
    in the public schema using CASCADE, leaving extensions (pg_trgm, btree_gin) intact.
    This guarantees that pg_restore starts with an empty slate and recreates all
    tables, primary keys, and foreign keys without dependency conflicts or duplicate rows.
    """
    connections.close_all()
    try:
        with connections['default'].cursor() as cursor:
            cursor.execute("""
                DO $$
                DECLARE
                    r RECORD;
                BEGIN
                    -- 1. Drop foreign keys and tables with CASCADE
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                    -- 2. Drop sequences
                    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
                        EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
                    END LOOP;
                    -- 3. Drop views
                    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP
                        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
                    END LOOP;
                    -- 4. Drop materialized views
                    FOR r IN (SELECT matviewname FROM pg_matviews WHERE schemaname = 'public') LOOP
                        EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS public.' || quote_ident(r.matviewname) || ' CASCADE';
                    END LOOP;
                END $$;
            """)
            logger.info("Successfully dropped all public tables/views prior to restore.")
    except Exception as exc:
        logger.warning(f"Could not pre-clean public schema tables: {exc}")
    finally:
        connections.close_all()


def calculate_sha256(filepath):
    """محاسبه هش امنیتی SHA-256 فایل"""
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def get_backup_list():
    """دریافت لیست تمام فایل‌های پشتیبان ثبت‌شده همراه با متادیتا و وضعیت سلامت"""
    _ensure_backup_dir()
    backups = []

    for item in os.listdir(BACKUP_DIR):
        if item.endswith('.meta.json'):
            meta_path = os.path.join(BACKUP_DIR, item)
            try:
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                    
                data_file = os.path.join(BACKUP_DIR, meta.get('filename', ''))
                if os.path.exists(data_file):
                    meta['file_exists'] = True
                    meta['actual_size'] = os.path.getsize(data_file)
                else:
                    meta['file_exists'] = False
                    
                backups.append(meta)
            except Exception as e:
                logger.error(f"Error reading backup meta {meta_path}: {e}")

    # مرتب‌سازی بر اساس تاریخ ایجاد نزولی
    backups.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return backups


def create_database_backup(user=None, description="پشتیبان‌گیری دستی", is_emergency=False):
    """
    ایجاد نسخه پشتیبان باینری کامل و یکپارچه بر اساس موتور پایگاه‌داده (PostgreSQL یا SQLite)
    """
    _ensure_backup_dir()
    db_config = settings.DATABASES['default']
    engine = db_config.get('ENGINE', '')
    now_str = datetime.now().strftime('%Y%m%d_%H%M%S')
    prefix = 'emergency' if is_emergency else 'backup'

    if 'postgresql' in engine:
        filename = f"{prefix}_{now_str}.dump"
        dest_path = os.path.join(BACKUP_DIR, filename)

        env = os.environ.copy()
        if db_config.get('PASSWORD'):
            env['PGPASSWORD'] = str(db_config.get('PASSWORD'))

        cmd = [
            'pg_dump',
            '-h', str(db_config.get('HOST', '127.0.0.1')),
            '-p', str(db_config.get('PORT', '5432')),
            '-U', str(db_config.get('USER', 'postgres')),
            '-d', str(db_config.get('NAME', 'warehouse_db')),
            '-F', 'c',  # Custom compressed archive format
            '-f', dest_path
        ]

        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"pg_dump failed (code {res.returncode}): {res.stderr}")

        file_size = os.path.getsize(dest_path)
        checksum = calculate_sha256(dest_path)

        meta = {
            'id': filename,
            'filename': filename,
            'description': description,
            'engine': 'postgresql',
            'size': file_size,
            'checksum': checksum,
            'is_emergency': is_emergency,
            'created_by': user.username if user else 'System',
            'created_by_name': f"{user.first_name} {user.last_name}".strip() if user else 'سیستم',
            'created_at': datetime.now().isoformat()
        }

        meta_path = os.path.join(BACKUP_DIR, f"{filename}.meta.json")
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        log_audit_event(
            module='system',
            action='BACKUP',
            severity='info' if not is_emergency else 'warning',
            target_model='Database',
            target_object_id=filename,
            target_repr=f"پشتیبان پایگاه داده: {filename} ({round(file_size / 1024, 1)} KB)",
            user=user,
            details=meta
        )

        try:
            from accounts.signals import backup_created
            backup_created.send(sender=None, dest_path=dest_path, filename=filename, meta=meta)
        except Exception as sig_err:
            logger.warning(f"Could not dispatch backup_created signal: {sig_err}")
        return meta

    elif 'sqlite3' in engine:
        db_path = db_config.get('NAME')
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database file not found at {db_path}")

        filename = f"{prefix}_{now_str}.sqlite3"
        dest_path = os.path.join(BACKUP_DIR, filename)

        src_conn = sqlite3.connect(db_path)
        dest_conn = sqlite3.connect(dest_path)
        try:
            with dest_conn:
                src_conn.backup(dest_conn)
        finally:
            src_conn.close()
            dest_conn.close()

        file_size = os.path.getsize(dest_path)
        checksum = calculate_sha256(dest_path)

        meta = {
            'id': filename,
            'filename': filename,
            'description': description,
            'engine': 'sqlite3',
            'size': file_size,
            'checksum': checksum,
            'is_emergency': is_emergency,
            'created_by': user.username if user else 'System',
            'created_by_name': f"{user.first_name} {user.last_name}".strip() if user else 'سیستم',
            'created_at': datetime.now().isoformat()
        }

        meta_path = os.path.join(BACKUP_DIR, f"{filename}.meta.json")
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        log_audit_event(
            module='system',
            action='BACKUP',
            severity='info' if not is_emergency else 'warning',
            target_model='Database',
            target_object_id=filename,
            target_repr=f"پشتیبان SQLite دیتابیس: {filename} ({round(file_size / 1024, 1)} KB)",
            user=user,
            details=meta
        )

        try:
            from accounts.signals import backup_created
            backup_created.send(sender=None, dest_path=dest_path, filename=filename, meta=meta)
        except Exception as sig_err:
            logger.warning(f"Could not dispatch backup_created signal: {sig_err}")
        return meta

    else:
        raise NotImplementedError(f"موتور دیتابیس {engine} پشتیبانی نمی‌شود.")


def verify_backup_integrity(filename):
    """اعتبارسنجی یکپارچگی فایل پشتیبان با تطبیق هش SHA-256 و بررسی اولیه فایل"""
    _ensure_backup_dir()
    data_path = os.path.join(BACKUP_DIR, filename)
    meta_path = os.path.join(BACKUP_DIR, f"{filename}.meta.json")

    if not os.path.exists(data_path):
        return {'is_valid': False, 'error': 'فایل داده پشتیبان در سرور یافت نشد.'}

    if not os.path.exists(meta_path):
        return {'is_valid': False, 'error': 'فایل متادیتای پشتیبان مفقود شده است.'}

    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    current_hash = calculate_sha256(data_path)
    if current_hash != meta.get('checksum'):
        return {
            'is_valid': False,
            'error': 'هش SHA-256 فایل با متادیتای ذخیره‌شده همخوانی ندارد (احتمال دستکاری یا خرابی داده).'
        }

    return {
        'is_valid': True,
        'size': os.path.getsize(data_path),
        'checksum': current_hash,
        'meta': meta
    }


def restore_database_backup(filename, user=None, ip_address=None):
    """
    بازیابی کامل پایگاه داده از روی نسخه پشتیبان با ایجاد snapshot اضطراری قبل از بازگردانی
    """
    verify_res = verify_backup_integrity(filename)
    if not verify_res.get('is_valid'):
        raise ValueError(f"امکان بازیابی وجود ندارد: {verify_res.get('error')}")

    # ۱. ایجاد نسخه پشتیبان اضطراری پیش از بازیابی
    logger.warning("Creating emergency safety snapshot before restoring database...")
    emergency_meta = create_database_backup(
        user=user,
        description=f"اسنپ‌شات اضطراری قبل از بازیابی فایل {filename}",
        is_emergency=True
    )

    db_config = settings.DATABASES['default']
    engine = db_config.get('ENGINE', '')
    backup_file = os.path.join(BACKUP_DIR, filename)

    if 'postgresql' in engine:
        # پاکسازی تمیز جداول و ویوها با حفظ اکستنشن‌های دیتابیس
        clean_public_schema()

        env = os.environ.copy()
        if db_config.get('PASSWORD'):
            env['PGPASSWORD'] = str(db_config.get('PASSWORD'))

        cmd = [
            'pg_restore',
            '-h', str(db_config.get('HOST', '127.0.0.1')),
            '-p', str(db_config.get('PORT', '5432')),
            '-U', str(db_config.get('USER', 'postgres')),
            '-d', str(db_config.get('NAME', 'warehouse_db')),
            '--no-owner',
            '--no-privileges',
            '--clean',
            '--if-exists',
            backup_file
        ]

        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if res.returncode not in (0, 1):
            raise RuntimeError(f"pg_restore failed (code {res.returncode}): {res.stderr}")

        # بازگشایی اتصال و تست
        connections['default'].cursor().execute("SELECT 1;")
        connections.close_all()

        log_audit_event(
            module='system',
            action='ROLLBACK',
            severity='critical',
            target_model='Database',
            target_object_id=filename,
            target_repr=f"بازیابی کامل دیتابیس PostgreSQL از فایل: {filename}",
            user=user,
            details={
                'restored_from': filename,
                'emergency_snapshot': emergency_meta.get('filename'),
                'timestamp': datetime.now().isoformat()
            },
            ip_address=ip_address
        )

        return {
            'success': True,
            'message': f"پایگاه داده با موفقیت از نسخه پشتیبان {filename} بازیابی شد.",
            'emergency_snapshot': emergency_meta.get('filename')
        }

    elif 'sqlite3' in engine:
        connections.close_all()
        db_path = db_config.get('NAME')
        shutil.copy2(backup_file, db_path)
        connections['default'].cursor().execute("SELECT 1;")

        log_audit_event(
            module='system',
            action='ROLLBACK',
            severity='critical',
            target_model='Database',
            target_object_id=filename,
            target_repr=f"بازیابی کامل دیتابیس SQLite از فایل: {filename}",
            user=user,
            details={
                'restored_from': filename,
                'emergency_snapshot': emergency_meta.get('filename'),
                'timestamp': datetime.now().isoformat()
            },
            ip_address=ip_address
        )

        return {
            'success': True,
            'message': f"پایگاه داده SQLite با موفقیت از فایل {filename} بازیابی شد.",
            'emergency_snapshot': emergency_meta.get('filename')
        }

    else:
        raise NotImplementedError(f"موتور دیتابیس {engine} پشتیبانی نمی‌شود.")


def format_shamsi(iso_or_datetime_str):
    """تبدیل تاریخ ISO یا دیت‌تایم به رشته استاندارد هجری شمسی"""
    if not iso_or_datetime_str:
        return ''
    if jdatetime is None:
        return str(iso_or_datetime_str)
    try:
        if isinstance(iso_or_datetime_str, str):
            dt = datetime.fromisoformat(iso_or_datetime_str)
        else:
            dt = iso_or_datetime_str
        return jdatetime.datetime.fromgregorian(datetime=dt).strftime('%Y/%m/%d %H:%M:%S')
    except Exception:
        return str(iso_or_datetime_str)


def rotate_snapshots(keep_count=7):
    """حفظ N نسخه اخیر از اسنپ‌شات‌های روتین سرور و پاکسازی نسخه‌های قدیمی‌تر"""
    _ensure_backup_dir()
    backups = get_backup_list()
    routine_backups = [b for b in backups if not b.get('is_emergency')]

    deleted_count = 0
    if len(routine_backups) > keep_count:
        to_delete = routine_backups[keep_count:]
        for b in to_delete:
            data_file = os.path.join(BACKUP_DIR, b.get('filename', ''))
            meta_file = os.path.join(BACKUP_DIR, f"{b.get('filename', '')}.meta.json")

            if os.path.exists(data_file):
                try:
                    os.remove(data_file)
                except Exception as e:
                    logger.warning(f"Failed to remove old backup file {data_file}: {e}")
            if os.path.exists(meta_file):
                try:
                    os.remove(meta_file)
                except Exception as e:
                    logger.warning(f"Failed to remove old meta file {meta_file}: {e}")
            deleted_count += 1

    return deleted_count


def create_server_snapshot(user=None, description="اسنپ‌شات دستی سرور", is_emergency=False, keep_count=7):
    """ایجاد اسنپ‌شات کامل از دیتابیس در سرور با چرخش خودکار و نگهداری ۷ نسخه اخیر"""
    meta = create_database_backup(
        user=user,
        description=description,
        is_emergency=is_emergency
    )
    if not is_emergency:
        rotate_snapshots(keep_count=keep_count)

    meta['shamsi_date'] = format_shamsi(meta.get('created_at'))
    return meta


def get_snapshot_list(limit=7):
    """دریافت لیست اسنپ‌شات‌های معتبر سرور به همراه تاریخ هجری شمسی"""
    all_backups = get_backup_list()
    enriched = []
    for b in all_backups[:limit]:
        item = dict(b)
        item['shamsi_date'] = format_shamsi(item.get('created_at'))
        item['size_mb'] = round(item.get('size', 0) / (1024 * 1024), 2)
        enriched.append(item)
    return enriched


def get_snapshot_summary():
    """خلاصه وضعیت اسنپ‌شات‌ها جهت نمایش در داشبورد سلامت و پایش سیستم"""
    snapshots = get_snapshot_list(limit=7)
    total_count = len(snapshots)
    total_size = sum(s.get('size', 0) for s in snapshots)
    last_snapshot = snapshots[0] if snapshots else None

    return {
        'total_count': total_count,
        'max_retention': 7,
        'total_size_bytes': total_size,
        'total_size_mb': round(total_size / (1024 * 1024), 2),
        'last_snapshot_filename': last_snapshot.get('filename') if last_snapshot else None,
        'last_snapshot_shamsi': last_snapshot.get('shamsi_date') if last_snapshot else 'هنوز ثبت نشده',
        'last_snapshot_iso': last_snapshot.get('created_at') if last_snapshot else None,
        'status': 'optimal' if total_count > 0 else 'warning'
    }


def quick_rollback_snapshot(filename, user=None, confirm_text="", ip_address=None):
    """
    بازگردانی سریع دیتابیس به یک اسنپ‌شات مشخص با الزامات سد امنیتی و تاییدیه صریح
    """
    if confirm_text != 'ROLLBACK_CONFIRM':
        raise ValueError("جهت اعمال بازگشت سریع به اسنپ‌شات، عبارت تاییدیه امنیتی ROLLBACK_CONFIRM الزامی است.")

    result = restore_database_backup(filename=filename, user=user, ip_address=ip_address)

    log_audit_event(
        module='backup',
        action='RESTORE_COMPLETE',
        severity='critical',
        user=user,
        target_model='DatabaseSnapshot',
        target_repr=f"بازگشت سریع موفقیت‌آمیز به اسنپ‌شات: {filename}",
        details={
            'restored_file': filename,
            'result': result,
            'emergency_snapshot': result.get('emergency_snapshot')
        },
        ip_address=ip_address
    )

    return result

