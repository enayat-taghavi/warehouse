"""
پردازش تصویر آپلودشده کالا

مرزِ ورودیِ بی‌اعتماد سیستم اینجاست: بایت‌هایی که کاربر می‌فرستد مستقیم به
دیکودر PIL داده می‌شود. پس اعتبارسنجی *پیش از* دیکود انجام می‌شود و هر خطای
قابل‌انتظارِ ورودی به‌صورت ImageValidationError بالا می‌رود تا ویو بتواند ۴۰۰
با پیام فارسی برگرداند، نه ۵۰۰ با متن استثنای پایتون.
"""
import io
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError
from django.core.files.base import ContentFile

# سقف حجم هر فایل. فرانت تصویر را قبل از ارسال به WebP فشرده می‌کند و معمولاً
# زیر ۵۰۰KB می‌شود؛ این سقف برای مسیرهایی است که فشرده‌سازی سمت کلاینت شکست
# خورده و فایل خام دوربین ارسال شده است.
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

# سقف تعداد پیکسل — سد اصلی در برابر «بمب فشرده‌سازی» (فایل ۱۰۰ کیلوبایتی که
# باز شدنش چند گیگابایت رم می‌خواهد). حجم فایل به‌تنهایی این را نمی‌گیرد.
MAX_PIXELS = 50_000_000
MAX_DIMENSION = 20_000

MAX_PHOTOS_PER_ITEM = 30

# فرمت‌هایی که واقعاً می‌خواهیم بپذیریم. تصمیم بر اساس فرمتِ *دیکودشده* گرفته
# می‌شود نه پسوند فایل یا هدر Content-Type، چون هر دو دست کلاینت‌اند.
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP', 'BMP', 'TIFF', 'GIF'}

# سطوح خروجی: (پسوند نام، حداکثر ابعاد، کیفیت)
TIERS = (
    ('orig', (1920, 1920), 86),
    ('med', (600, 600), 82),
    ('thumb', (150, 150), 78),
)

_HEIF_BRANDS = (b'heic', b'heix', b'hevc', b'heim', b'heis', b'hevm', b'mif1', b'msf1')


class ImageValidationError(ValueError):
    """ورودی نامعتبر کاربر — پیام آن مستقیماً به کاربر نمایش داده می‌شود."""


def _looks_like_heif(head: bytes) -> bool:
    """HEIC/HEIF عکس پیش‌فرض آیفون است و PIL بدون pillow-heif آن را نمی‌شناسد."""
    return len(head) >= 12 and head[4:8] == b'ftyp' and head[8:12] in _HEIF_BRANDS


def validate_uploaded_image(uploaded_file):
    """
    اعتبارسنجی فایل پیش از پردازش. در صورت اشکال ImageValidationError.

    خروجی: فرمت تشخیص‌داده‌شده (برای لاگ/تصمیم‌های بعدی)
    """
    size = getattr(uploaded_file, 'size', None)
    if size is not None and size <= 0:
        raise ImageValidationError('فایل ارسالی خالی است.')
    if size is not None and size > MAX_UPLOAD_BYTES:
        raise ImageValidationError(
            f'حجم فایل «{getattr(uploaded_file, "name", "تصویر")}» '
            f'{size / (1024 * 1024):.1f} مگابایت است و از سقف مجاز '
            f'{MAX_UPLOAD_BYTES // (1024 * 1024)} مگابایت بیشتر است.'
        )

    try:
        uploaded_file.seek(0)
        head = uploaded_file.read(12)
        uploaded_file.seek(0)
    except Exception:
        raise ImageValidationError('فایل ارسالی قابل خواندن نیست.')

    if _looks_like_heif(head):
        raise ImageValidationError(
            'قالب HEIC پشتیبانی نمی‌شود. در تنظیمات دوربین آیفون گزینه '
            '«Most Compatible» را انتخاب کنید یا تصویر را به JPEG تبدیل نمایید.'
        )

    # verify() ساختار فایل را بدون دیکود کامل بررسی می‌کند، ولی شیء تصویر را
    # پس از خود بی‌مصرف می‌کند — پس فقط برای اعتبارسنجی و روی نسخه جداگانه.
    try:
        with Image.open(uploaded_file) as probe:
            fmt = (probe.format or '').upper()
            width, height = probe.size
            probe.verify()
    except UnidentifiedImageError:
        raise ImageValidationError(
            f'فایل «{getattr(uploaded_file, "name", "ارسالی")}» یک تصویر معتبر نیست.'
        )
    except ImageValidationError:
        raise
    except Exception:
        raise ImageValidationError('تصویر ارسالی آسیب‌دیده یا ناقص است.')
    finally:
        try:
            uploaded_file.seek(0)
        except Exception:
            pass

    if fmt not in ALLOWED_FORMATS:
        raise ImageValidationError(
            f'قالب تصویر «{fmt or "ناشناس"}» پشتیبانی نمی‌شود. '
            'قالب‌های مجاز: JPEG، PNG، WebP.'
        )

    if width <= 0 or height <= 0:
        raise ImageValidationError('ابعاد تصویر نامعتبر است.')
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ImageValidationError(
            f'ابعاد تصویر ({width}×{height}) بیش از حد بزرگ است.'
        )
    if width * height > MAX_PIXELS:
        raise ImageValidationError(
            f'تصویر با {width * height // 1_000_000} مگاپیکسل بیش از حد بزرگ است '
            f'(سقف {MAX_PIXELS // 1_000_000} مگاپیکسل).'
        )

    return fmt


def _flatten_to_rgb(img):
    """حذف کانال آلفا/پالت با پس‌زمینه سفید. تصویر ورودی بسته می‌شود."""
    if img.mode == 'RGB':
        return img

    if img.mode in ('RGBA', 'LA', 'P', 'PA'):
        source = img.convert('RGBA') if img.mode in ('P', 'PA') else img
        background = Image.new('RGB', source.size, (255, 255, 255))
        if 'A' in source.mode:
            background.paste(source, mask=source.split()[-1])
        else:
            background.paste(source)
        if source is not img:
            source.close()
        img.close()
        return background

    converted = img.convert('RGB')
    if converted is not img:
        img.close()
    return converted


def process_uploaded_image(uploaded_file):
    """
    اعتبارسنجی و تبدیل تصویر به سه سطح WebP (۱۹۲۰ / ۶۰۰ / ۱۵۰ پیکسل).

    نام فایل‌ها از UUID کامل ساخته می‌شود، نه از نام فایل کاربر:
      • نام کاربر یک ورودی بی‌اعتماد است (کاراکتر عجیب، مسیر، طول زیاد)
      • با نام قابل‌حدس، آدرس تصاویر انبار قابل شمارش می‌شد

    :raises ImageValidationError: ورودی نامعتبر (باید ۴۰۰ برگردد)
    """
    validate_uploaded_image(uploaded_file)

    token = uuid.uuid4().hex
    img = None
    try:
        img = Image.open(uploaded_file)
        try:
            transposed = ImageOps.exif_transpose(img)
            if transposed is not None and transposed is not img:
                img.close()
                img = transposed
        except Exception:
            # چرخش EXIF یک بهبود است نه شرط لازم؛ خرابی متادیتا نباید آپلود را
            # شکست دهد. تصویر بدون تصحیح چرخش ذخیره می‌شود.
            pass

        img = _flatten_to_rgb(img)

        result = {}
        for suffix, box, quality in TIERS:
            tier = img.copy()
            try:
                tier.thumbnail(box, Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                tier.save(buffer, format='WEBP', quality=quality, method=6)
                payload = buffer.getvalue()
                result[suffix] = ContentFile(payload, name=f'{token}_{suffix}.webp')
                if suffix == 'orig':
                    result['width'], result['height'] = tier.size
                    # طول واقعی بافر؛ tell() به موقعیت اشاره‌گر وابسته است و
                    # اگر انکودر seek کند عدد اشتباه می‌دهد.
                    result['file_size'] = len(payload)
            finally:
                tier.close()
    except ImageValidationError:
        raise
    except (UnidentifiedImageError, OSError) as exc:
        # دیکود ناقص در میانه کار (فایل بریده، بایت خراب)
        raise ImageValidationError('پردازش تصویر ممکن نشد؛ فایل معتبر نیست.') from exc
    finally:
        if img is not None:
            try:
                img.close()
            except Exception:
                pass

    return {
        'orig_file': result['orig'],
        'medium_file': result['med'],
        'thumb_file': result['thumb'],
        'width': result['width'],
        'height': result['height'],
        'file_size': result['file_size'],
    }
