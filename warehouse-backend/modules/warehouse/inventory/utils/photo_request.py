"""
خواندن و اعتبارسنجی ورودی درخواستِ آپلود عکس کالا

چرا جدا از `views_photos.py`: آن فایل با افزودن منطق امنیت و صحت داده از ۵۰۰ خط
گذشت و قاعده پروژه را نقض کرد. این توابع تنها کارشان *تفسیر بدنه درخواست* است
(مرز سیستم)، نه منطق دامنه — پس سرجمعِ طبیعی‌شان همین ماژول است.

قاعده مشترک همه: ورودی خراب باعث شکست آپلود نمی‌شود، فقط نادیده گرفته و لاگ
می‌شود. عکس، دادهٔ اصلی کاربر است؛ یک متادیتای بدشکل نباید آن را از بین ببرد.
"""
import json
import logging
import uuid

logger = logging.getLogger(__name__)

CAPTION_MAX_LENGTH = 255


def as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ('true', '1', 'yes', 'on')
    return bool(value)


def multi_values(request, key):
    """
    مقادیر یک کلید فرم را به‌صورت لیست برمی‌گرداند.

    کلاینت می‌تواند هم فیلد تکراری بفرستد (captions=a&captions=b) و هم یک رشته
    JSON (captions=["a","b"]). هر دو پذیرفته می‌شود.
    """
    data = request.data
    values = data.getlist(key) if hasattr(data, 'getlist') else data.get(key)
    if values is None:
        return []
    if not isinstance(values, list):
        values = [values]
    if len(values) == 1 and isinstance(values[0], str):
        text = values[0].strip()
        if text.startswith('['):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return parsed
            except (ValueError, TypeError):
                pass
    return values


def extract_files(request):
    """اولین کلید ناتهی برنده است — سازگار با نام‌های مختلفی که کلاینت‌ها می‌فرستند."""
    for key in ('images', 'files', 'image', 'file'):
        files = request.FILES.getlist(key)
        if files:
            return files
    return []


def extract_captions(request, count):
    """
    توضیح هر عکس جدا. پیش از این یک `caption` مشترک روی *همه* عکس‌های یک آپلود
    نوشته می‌شد، پس توضیح عکس دوم به بعد الزاماً غلط بود.
    """
    values = [str(v or '')[:CAPTION_MAX_LENGTH] for v in multi_values(request, 'captions')]
    fallback = str(request.data.get('caption') or '')[:CAPTION_MAX_LENGTH]
    return [values[i] if i < len(values) else fallback for i in range(count)]


def extract_sync_ids(request, count):
    """شناسه‌های idempotency تولیدشده در کلاینت. نامعتبر → نادیده گرفته می‌شود."""
    raw = multi_values(request, 'sync_ids') or multi_values(request, 'sync_id')
    result = []
    for i in range(count):
        candidate = raw[i] if i < len(raw) else None
        if not candidate:
            result.append(None)
            continue
        try:
            result.append(str(uuid.UUID(str(candidate))))
        except (ValueError, AttributeError, TypeError):
            logger.warning('sync_id نامعتبر در آپلود عکس نادیده گرفته شد: %r', candidate)
            result.append(None)
    return result


def resolve_count_task(request, item):
    """
    تسک شمارش مرتبط — *فقط* اگر واقعاً به همین کالا مربوط باشد.

    پیش از این هر شناسه‌ای پذیرفته می‌شد و عکس کالای A می‌توانست به تسک کالای B
    بچسبد. حالا لینکِ نامعتبر دور انداخته می‌شود ولی آپلود رد *نمی‌شود*: عکس
    داده اصلی کاربر است و نباید به‌خاطر یک متادیتای فرعی از بین برود
    (مثلاً وقتی صف آفلاین بعد از حذف تسک replay می‌شود).
    """
    # واردکردن تنبل: این ماژول زیرمجموعه `inventory.utils` است و ایمپورت
    # سطح‌ماژولِ مدل‌ها، حلقهٔ ایمپورت با خود اپ می‌سازد.
    from ..models import CountTask

    raw = request.data.get('count_task') or request.data.get('count_task_id')
    if not raw:
        return None
    try:
        pk = int(raw)
    except (TypeError, ValueError):
        logger.warning('شناسه تسک شمارش نامعتبر در آپلود عکس: %r', raw)
        return None

    task = CountTask.objects.filter(pk=pk).only('id', 'item_id').first()
    if task is None:
        logger.warning('تسک شمارش %s برای پیوست عکس یافت نشد.', pk)
        return None
    if task.item_id != item.id:
        logger.warning(
            'تسک شمارش %s به کالای %s مربوط نیست (کالای تسک: %s) — لینک نادیده گرفته شد.',
            pk, item.id, task.item_id,
        )
        return None
    return task


def audit_safe(**kwargs):
    """لاگ ممیزی نباید عملیات موفق را بشکند، ولی خطایش هم نباید بی‌صدا گم شود."""
    try:
        from accounts.audit_utils import log_audit_event
        log_audit_event(**kwargs)
    except Exception:
        logger.exception('ثبت لاگ ممیزی عکس کالا شکست خورد.')
