"""
فهرست مجاز پیوست چت، تشخیص نوع از روی محتوا (E17) و ساخت پیش‌نمایش پیوست (U11).

قانون ق۲: شکستِ ساخت پیش‌نمایش هرگز فایل اصلی را پاک یا رد نمی‌کند؛ فقط preview_status='failed' می‌شود.
"""
import io
import logging
import os
import re
import zipfile

from django.core.files.base import ContentFile
from django.db import transaction

logger = logging.getLogger(__name__)

# باید با فهرست accept در chat-drawer.component.html یکسان بماند
ALLOWED_EXTENSIONS = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    # پیام صوتی (U9): خروجی MediaRecorder در کروم/اندروید webm، در فایرفاکس ogg و در سافاری m4a است
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
}
IMAGE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp', '.gif')
AUDIO_EXTENSIONS = ('.webm', '.ogg', '.m4a')
# نام فایل پیام صوتی ضبط‌شده: voice_<زمان>_<مدت به ثانیه>s.<پسوند> (مدت پیش از پخش نشان داده می‌شود)
VOICE_NAME_RE = re.compile(r'^voice_[\w-]*_(\d{1,6})s\.(webm|ogg|m4a)$', re.IGNORECASE)
MAX_VOICE_SECONDS = 24 * 3600


def voice_duration_from_name(name):
    """مدت پیام صوتی از نام فایل ضبط‌شده؛ None برای فایل‌های دیگر یا عدد نامعتبر."""
    m = VOICE_NAME_RE.match(os.path.basename(name or ''))
    if not m:
        return None
    seconds = int(m.group(1))
    return seconds if 0 < seconds <= MAX_VOICE_SECONDS else None

THUMB_MAX_SIDE = 320
# مرز ایمنی: عکس‌های بزرگ‌تر از این تعداد پیکسل باز نمی‌شوند (بمب فشرده‌سازی)
MAX_IMAGE_PIXELS = 50_000_000
MAX_PDF_PAGES_TO_COUNT = 5000
SNIFF_BYTES = 8192

_OLE_MAGIC = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
_DANGEROUS_MARKERS = (b'<script', b'<html', b'<svg', b'<?xml-stylesheet', b'<iframe', b'<object')


def _read_head(file_obj, size=SNIFF_BYTES):
    pos = file_obj.tell()
    file_obj.seek(0)
    head = file_obj.read(size)
    file_obj.seek(pos)
    return head


def _zip_member_names(file_obj):
    pos = file_obj.tell()
    try:
        file_obj.seek(0)
        with zipfile.ZipFile(file_obj) as zf:
            return set(zf.namelist())
    except (zipfile.BadZipFile, OSError, ValueError):
        return None
    finally:
        file_obj.seek(pos)


def detect_content_type(file_obj, ext):
    """نوع فایل را از روی محتوا تشخیص می‌دهد؛ اگر محتوا با پسوند نخواند None برمی‌گرداند."""
    head = _read_head(file_obj)
    if ext == '.png':
        ok = head.startswith(b'\x89PNG\r\n\x1a\n')
    elif ext in ('.jpg', '.jpeg'):
        ok = head.startswith(b'\xff\xd8\xff')
    elif ext == '.gif':
        ok = head.startswith((b'GIF87a', b'GIF89a'))
    elif ext == '.webp':
        ok = head.startswith(b'RIFF') and head[8:12] == b'WEBP'
    elif ext == '.pdf':
        ok = head.startswith(b'%PDF-')
    elif ext in ('.xls', '.doc'):
        ok = head.startswith(_OLE_MAGIC)
    elif ext in ('.xlsx', '.docx'):
        names = _zip_member_names(file_obj) if head.startswith(b'PK\x03\x04') else None
        marker = 'xl/' if ext == '.xlsx' else 'word/'
        ok = bool(names) and '[Content_Types].xml' in names and any(n.startswith(marker) for n in names)
    elif ext == '.webm':
        ok = head.startswith(b'\x1a\x45\xdf\xa3')
    elif ext == '.ogg':
        ok = head.startswith(b'OggS')
    elif ext == '.m4a':
        ok = head[4:8] == b'ftyp'
    elif ext in ('.txt', '.csv'):
        lower = head.lower()
        ok = b'\x00' not in head and not any(m in lower for m in _DANGEROUS_MARKERS)
    else:
        ok = False
    return ALLOWED_EXTENSIONS[ext] if ok else None


def validate_uploaded_file(file_obj):
    """
    فهرست مجاز پسوند + تطابق محتوا (E17). خروجی: (معتبر؟, پیام خطا, نوع تشخیص‌داده‌شده)
    نوع ذخیره‌شده از محتوا می‌آید، نه از هدر ارسالی مرورگر.
    """
    ext = os.path.splitext(file_obj.name or '')[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, "این نوع فایل مجاز نیست. فقط عکس، PDF، Word، Excel، متن، CSV و پیام صوتی پذیرفته می‌شود", None
    detected = detect_content_type(file_obj, ext)
    if detected is None:
        return False, "محتوای فایل با نوع آن (پسوند) هم‌خوانی ندارد", None
    return True, None, detected


def _save_thumbnail(attachment, image):
    from PIL import Image
    image.thumbnail((THUMB_MAX_SIDE, THUMB_MAX_SIDE), Image.Resampling.LANCZOS)
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
    buf = io.BytesIO()
    image.save(buf, format='WEBP', quality=80, method=4)
    base = os.path.splitext(os.path.basename(attachment.file.name))[0]
    attachment.thumbnail.save(f"{base}_thumb.webp", ContentFile(buf.getvalue()), save=False)


def _build_image_preview(attachment):
    from PIL import Image, ImageOps
    with attachment.file.open('rb') as fh:
        with Image.open(fh) as img:
            if img.width * img.height > MAX_IMAGE_PIXELS:
                raise ValueError('image too large for preview')
            img.seek(0)
            img = ImageOps.exif_transpose(img)
            attachment.width, attachment.height = img.width, img.height
            _save_thumbnail(attachment, img.copy())


def _build_pdf_preview(attachment):
    import pypdfium2 as pdfium
    with attachment.file.open('rb') as fh:
        data = fh.read()
    pdf = pdfium.PdfDocument(data)
    try:
        attachment.page_count = min(len(pdf), MAX_PDF_PAGES_TO_COUNT)
        if len(pdf) == 0:
            raise ValueError('empty pdf')
        page = pdf[0]
        try:
            w, h = page.get_size()
            attachment.width, attachment.height = int(round(w)), int(round(h))
            scale = THUMB_MAX_SIDE / max(w, h, 1)
            bitmap = page.render(scale=max(scale, 0.05))
            _save_thumbnail(attachment, bitmap.to_pil())
        finally:
            page.close()
    finally:
        pdf.close()


def build_attachment_preview(attachment):
    """
    پیش‌نمایش یک پیوست را می‌سازد و فقط فیلدهای پیش‌نمایش را ذخیره می‌کند.
    خروجی: وضعیت نهایی preview_status. هیچ مسیری فایل اصلی را حذف نمی‌کند.
    """
    from .models import PreviewStatus
    ext = os.path.splitext(attachment.file.name or '')[1].lower()
    if ext in IMAGE_EXTENSIONS:
        builder = _build_image_preview
    elif ext == '.pdf':
        builder = _build_pdf_preview
    else:
        builder = None

    old_thumb = attachment.thumbnail.name if attachment.thumbnail else None
    if builder is None:
        attachment.preview_status = PreviewStatus.NONE
    else:
        try:
            builder(attachment)
            attachment.preview_status = PreviewStatus.READY
        except Exception as exc:  # هر خطای کتابخانه: فایل اصلی دست‌نخورده می‌ماند
            logger.warning("[chat preview] attachment %s preview failed: %s", attachment.pk, exc)
            _discard_new_thumbnail(attachment, old_thumb)
            attachment.preview_status = PreviewStatus.FAILED
    try:
        attachment.save(update_fields=['thumbnail', 'width', 'height', 'page_count', 'preview_status', 'updated_at'])
    except Exception:
        _discard_new_thumbnail(attachment, old_thumb)  # بندانگشتیِ بی‌صاحب روی دیسک نماند
        raise
    new_thumb = attachment.thumbnail.name if attachment.thumbnail else None
    if old_thumb and new_thumb and new_thumb != old_thumb:
        # بندانگشتی قبلی (نه فایل اصلی) پس از ذخیرهٔ موفق جایگزین برداشته می‌شود
        try:
            attachment.thumbnail.storage.delete(old_thumb)
        except Exception as exc:
            logger.warning("[chat preview] old thumbnail %s not removed: %s", old_thumb, exc)
    return attachment.preview_status


def _discard_new_thumbnail(attachment, old_thumb):
    """فقط بندانگشتی تازه‌نوشتهٔ همین اجرا را برمی‌دارد و نام قبلی را برمی‌گرداند؛ فایل اصلی هرگز."""
    if attachment.thumbnail and attachment.thumbnail.name != old_thumb:
        try:
            attachment.thumbnail.delete(save=False)
        except Exception as exc:
            logger.warning("[chat preview] half-written thumbnail not removed: %s", exc)
    attachment.thumbnail = old_thumb


def schedule_attachment_preview(attachment_id):
    """پس از commit درخواست اجرا می‌شود تا آپلود کند نشود؛ سپس پیام دوباره برودکست می‌شود."""
    def _run():
        # هر خطایی این‌جا فقط ثبت می‌شود: پاسخ آپلود (فایل ذخیره‌شده) نباید ۵۰۰ شود
        try:
            from .models import MessageAttachment
            from .broadcast import broadcast_message_updated_ws
            att = MessageAttachment.objects.select_related('message__conversation').filter(pk=attachment_id).first()
            if att is None or not att.file:
                return
            build_attachment_preview(att)
            msg = att.message
            if (att.thumbnail or att.page_count or att.width) and not msg.is_deleted:
                broadcast_message_updated_ws(msg)
        except Exception as exc:
            logger.warning("[chat preview] attachment %s preview task failed: %s", attachment_id, exc)
    transaction.on_commit(_run)
