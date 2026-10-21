"""
منبع فایل انبار برای همگام‌سازی فایل‌ها (مثل گوگل‌درایو) از راه رجیستری پلتفرم.

ماژول انبار این منبع را با contribute('file_sync_sources', ...) ثبت می‌کند. هر ماژولی که
مقصد همگام‌سازی است (اکنون گوگل‌درایو در حسابداری)، منبع‌ها را از رجیستری می‌خواند و
مقصدهایش را با contribute('file_sync_sinks', ...) ثبت می‌کند. هیچ‌کدام دیگری را ایمپورت نمی‌کند.
"""
import logging

logger = logging.getLogger(__name__)


def _iter_company_files(company):
    """(نمونه، نام فیلد، فایل) تصاویر کالاهای انبارهای یک شرکت."""
    from inventory.models import ItemPhoto
    qs = ItemPhoto.objects.filter(item__warehouse__company=company, image__isnull=False).exclude(image='')
    for photo in qs.iterator():
        yield photo, 'image', photo.image


def _resolve_path(instance, doc_date: str, ext: str, sanitize):
    """(company, folder, filename) تصویر کالا؛ شرکت ناشناخته None."""
    item = getattr(instance, 'item', None)
    warehouse_name = "انبار_مرکزی"
    company = None

    if item and hasattr(item, 'warehouse') and item.warehouse:
        warehouse = item.warehouse
        warehouse_name = sanitize(warehouse.name)
        company = getattr(warehouse, 'company', None)

    if not company:
        logger.warning(f"[GDrive Path Resolver] Company not resolved for ItemPhoto (id={getattr(instance, 'id', None)}). Skipping.")
        return None

    item_code = sanitize(getattr(item, 'fa_unic_code', None) or getattr(item, 'code', None) or str(instance.id))
    item_desc = sanitize(getattr(item, 'description', None) or getattr(item, 'name', None) or 'کالا')[:40]
    folder = f"سامانه انبارداری/{warehouse_name}/تصاویر کالاها/{item_code}_{item_desc}"
    filename = f"{doc_date}_عکس_کالا_کد{item_code}_{instance.id}{ext or '.webp'}"
    return company, folder, filename


ITEM_PHOTO_FILE_SOURCE = {
    'model_name': 'ItemPhoto',
    # پرچم تنظیمات مقصد که همگام‌سازی این منبع را روشن می‌کند
    'config_flag': 'sync_inventory_photos',
    'iter_company_files': _iter_company_files,
    'resolve_path': _resolve_path,
}


def notify_file_saved(instance, field_name: str, file_obj):
    """فایل ذخیره شد: به همهٔ مقصدهای همگام‌سازی ثبت‌شده خبر می‌دهد (اگر مقصدی نصب نباشد هیچ)."""
    from platform_core.registry import contributions
    for sink in contributions('file_sync_sinks'):
        try:
            sink['upload'](instance, field_name, file_obj)
        except Exception as exc:
            logger.warning(f"[FileSync] upload sink failed for ItemPhoto#{getattr(instance, 'id', None)}: {exc}")


def notify_file_deleted(instance, field_name: str, file_obj):
    """فایل حذف شد: مقصدها نسخهٔ خود را بایگانی می‌کنند."""
    from platform_core.registry import contributions
    for sink in contributions('file_sync_sinks'):
        try:
            sink['archive_delete'](instance, field_name, file_obj)
        except Exception as exc:
            logger.warning(f"[FileSync] archive sink failed for ItemPhoto#{getattr(instance, 'id', None)}: {exc}")
