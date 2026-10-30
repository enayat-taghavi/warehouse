"""
دسترسی امضاشده به فایل‌های رسانه — بستن مسیر دانلود بدون احراز هویت

مسئله: مسیر `/media/` با `django.views.static.serve` همه فایل‌ها را بدون هیچ
بررسی هویتی سرو می‌کند. تا وقتی محتوای رسانه فقط لوگو و پیوست‌های عمومی بود
اهمیتی نداشت، ولی با آمدن عکس کالای انبار، هر کسی که یک URL داشته باشد (یا
حدس بزند) می‌تواند تصاویر انبار را ببیند.

چرا «هدر Authorization» جواب نمی‌دهد: مرورگر روی `<img src>` هدر سفارشی
نمی‌فرستد. تنها راه‌های واقعی، کوکی یا URL امضاشده است. این پروژه توکن را در
localStorage نگه می‌دارد (نه کوکی)، پس URL امضاشده انتخاب شده است.

نکته کلیدی طراحی — امضا باید *پایدار* باشد:
اگر برای هر پاسخ یک امضای تازه (با زمان لحظه‌ای) تولید شود، URL هر بار عوض
می‌شود و کش Service Worker و کش مرورگر هر بار miss می‌خورند — یعنی عکس‌ها
آفلاین دیده نمی‌شوند و مصرف پهنای باند چند برابر می‌شود. پس انقضا روی مرز
پنجره‌های ۳۰ روزه گِرد می‌شود: رشته URL در طول یک پنجره ثابت می‌ماند و اعتبار
هر URL بین ۳۰ تا ۶۰ روز است.

محدودیت باقی‌مانده (صادقانه): این امضا به فایل مقید است نه به کاربر. کسی که
URL امضاشده را در اختیار دیگری بگذارد، تا پایان اعتبار قابل استفاده است. آنچه
بسته می‌شود، دسترسی *بدون* عبور از احراز هویت و شمارش/حدس مسیرها است. برای
مقید کردن به کاربر باید رسانه از طریق کوکی HttpOnly سرو شود که تغییر معماری
ورود را لازم دارد.
"""
import os
import posixpath
import time
from urllib.parse import quote, unquote

from django.conf import settings
from django.http import HttpResponseForbidden
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.static import serve

# پیشوندهایی که دسترسی به آن‌ها امضا لازم دارد. بقیه مسیرهای رسانه (لوگو،
# پیوست‌های قدیمی) رفتار قبلی خود را نگه می‌دارند تا چیزی نشکند.
PROTECTED_PREFIXES = (
    'item_photos/',
    'comment_attachments/',
    'company_documents/',
    'company_core_docs/',
    'personnel_docs/',
    'vehicle_docs/',
)

# پیشوندهایی که از مسیر `/media` هرگز سرو نمی‌شوند، حتی با امضای معتبر (ص۶ طرح ۲.۶):
# پیوست عمومی فقط از `/api/attachments/<id>/download/` باز می‌شود که در هر درخواست `can_view` را می‌سنجد.
# پیوست چت (و بندانگشتی آن) فقط از `/api/communications/attachments/<id>/download/` باز می‌شود که در هر
# درخواست عضویت فعلی در گفتگو را می‌سنجد؛ پیوندهای امضاشدهٔ قدیمی `/media/chat_attachments/...` هم دیگر کار نمی‌کنند.
FORBIDDEN_PREFIXES = (
    'attachments/',
    'chat_attachments/',
)

# طول پنجره اعتبار/پایداری امضا (۷ روز برای چت و رسانه‌ها)
_WINDOW_SECONDS = 7 * 24 * 60 * 60

_KEY_SALT = 'inventory.media.signed_url.v1'
_SAFE_INLINE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf')


def _current_expiry() -> int:
    """
    مرز پنجره بعدی — برای همه درخواست‌های داخل یک پنجره یکسان است.

    +2 (نه +1) تا URLای که در آخرین ثانیه‌های یک پنجره تولید شده هم دست‌کم
    یک پنجره کامل اعتبار داشته باشد.
    """
    now = int(time.time())
    return ((now // _WINDOW_SECONDS) + 2) * _WINDOW_SECONDS


def _signature(path: str, expiry: int) -> str:
    return salted_hmac(_KEY_SALT, f'{path}:{expiry}', algorithm='sha256').hexdigest()[:32]


def _prefix_key(path: str) -> str:
    # normpath تا `x/../attachments/...` یا `./attachments/...` هم بسته شوند؛ lower چون دیسک ویندوز به حروف حساس نیست
    return posixpath.normpath(unquote(path or '').replace('\\', '/')).lstrip('/').lower()


def is_protected(path: str) -> bool:
    key = _prefix_key(path)
    return any(key.startswith(p) for p in PROTECTED_PREFIXES)


def is_forbidden(path: str) -> bool:
    key = _prefix_key(path)
    return any(key.startswith(p) for p in FORBIDDEN_PREFIXES)


def signed_file_url(field_file, request=None):
    """پیوند امضاشدهٔ مطلق (اگر request باشد) برای یک FieldFile؛ بی‌فایل = None."""
    if not field_file or not getattr(field_file, 'name', ''):
        return None
    url = signed_media_url(field_file.name)
    return request.build_absolute_uri(url) if request else url


def signed_media_url(name: str) -> str:
    """
    URL امضاشده برای یک فایل ذخیره‌شده.

    :param name: مسیر نسبیِ فایل در استوریج (مقدار FieldFile.name)
    """
    if not name:
        return ''
    path = unquote(name or '').lstrip('/')
    base = f"{settings.MEDIA_URL.rstrip('/')}/{quote(path)}"
    if not is_protected(path):
        return base
    expiry = _current_expiry()
    return f'{base}?e={expiry}&s={_signature(path, expiry)}'


def verify(path: str, expiry_raw: str, signature: str) -> bool:
    unquoted = unquote(path or '').lstrip('/')
    try:
        expiry = int(expiry_raw)
    except (TypeError, ValueError):
        return False
    if expiry < int(time.time()):
        return False
    return constant_time_compare(signature or '', _signature(unquoted, expiry))


def serve_media(request, path):
    """
    جایگزین `django.views.static.serve` برای مسیر `/media/`.

    مسیرهای محافظت‌شده امضای معتبر می‌خواهند؛ بقیه مثل قبل سرو می‌شوند.
    """
    # حتماً مسیر را رمزگشایی می‌کنیم چون در درخواست‌های وب فایل‌های فارسی به صورت URL-encoded (%D8%AF...) می‌آیند
    normalized = unquote(path or '').lstrip('/')

    if is_forbidden(normalized):
        return HttpResponseForbidden('این فایل فقط از مسیر دانلود پیوست باز می‌شود.')

    if is_protected(normalized) and not verify(
        normalized, request.GET.get('e'), request.GET.get('s')
    ):
        return HttpResponseForbidden('لینک تصویر معتبر نیست یا منقضی شده است.')

    # در صورت فعال بودن X-Accel-Redirect (محیط پروداکشن لینوکس با Nginx)،
    # فایل مستقیماً توسط وب‌سرور با sendfile و پشتیبانی Range ارسال می‌شود.
    if getattr(settings, 'MEDIA_ACCEL_REDIRECT', False):
        import mimetypes
        from django.http import HttpResponse
        content_type, _ = mimetypes.guess_type(normalized)
        response = HttpResponse(content_type=content_type or 'application/octet-stream')
        response['X-Accel-Redirect'] = f'/internal_media/{quote(normalized)}'
    else:
        # برای سرو دیسک محلی نیز مسیر باید unquote باشد تا نام فارسی پیدا شود
        response = serve(request, normalized, document_root=settings.MEDIA_ROOT)
    response['X-Content-Type-Options'] = 'nosniff'
    response['X-Frame-Options'] = 'SAMEORIGIN'

    # برای فایل‌های غیرتصویر و غیر PDF (مانند ZIP, TXT) یا در صورت درخواست دانلود صریح، هدر attachment ست می‌شود
    lower_path = normalized.lower()
    force_download = request.GET.get('download') == '1' or request.GET.get('disposition') == 'attachment'
    
    raw_filename = normalized.split('/')[-1]
    encoded_filename = quote(raw_filename.encode('utf-8'))
    ext = os.path.splitext(raw_filename)[1]
    ascii_fallback = f"document{ext}"

    if force_download or not any(lower_path.endswith(ext_item) for ext_item in _SAFE_INLINE_EXTENSIONS):
        response['Content-Disposition'] = f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_filename}"
    elif lower_path.endswith('.pdf'):
        response['Content-Disposition'] = f"inline; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_filename}"

    # عکس‌ها با نام یکتا ذخیره می‌شوند و هرگز بازنویسی نمی‌شوند، پس تا سقف
    # اعتبار امضا کش‌شدنی‌اند. این همان چیزی است که مشاهده آفلاین را ممکن می‌کند.
    if is_protected(normalized):
        response['Cache-Control'] = f'private, max-age={_WINDOW_SECONDS}, immutable'
    return response


__all__ = ['signed_media_url', 'serve_media', 'is_protected', 'verify']
