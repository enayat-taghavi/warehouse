"""
ماژول پردازش، برش و بهینه‌سازی تصاویر پرسنلی (WebP Optimizer)
"""
import io
import os
import uuid
from PIL import Image, ImageOps
from django.core.files.base import ContentFile

# محدودیت امنیتی جهت جلوگیری از حملات Decompression Bomb
Image.MAX_IMAGE_PIXELS = 10_000_000


def process_and_optimize_avatar(file_obj, max_dimension=600, quality=85):
    """
    پردازش و فشرده‌سازی تصویر:
    - اصلاح چرخش خودکار بر اساس داده‌های EXIF
    - تغییر اندازه متناسب به حداکثر ۶۰۰ پیکسل
    - خروجی بهینه فرمت WebP با کیفیت ۸۵ و حداقل حجم
    """
    try:
        if hasattr(file_obj, 'read'):
            file_bytes = file_obj.read()
            if hasattr(file_obj, 'seek'):
                file_obj.seek(0)
        else:
            file_bytes = file_obj

        img = Image.open(io.BytesIO(file_bytes))
        
        # اصلاح جهت بر اساس EXIF (مثلاً عکس‌های گرفته شده با موبایل یا تبلت)
        img = ImageOps.exif_transpose(img)

        # تبدیل به RGBA یا RGB
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            # اگر شفافیت دارد، پس‌زمینه سفید برای پرسنلی مناسب‌تر است
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[3]) # استفاده از کانال آلفا به عنوان ماسک
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # تغییر اندازه با حفظ نسبت ابعاد
        w, h = img.size
        if w > max_dimension or h > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        # ذخیره خروجی به فرمت WebP
        buffer = io.BytesIO()
        img.save(buffer, format='WEBP', quality=quality, method=6)
        buffer.seek(0)

        filename = f"avatar_{uuid.uuid4().hex[:10]}.webp"
        return ContentFile(buffer.getvalue(), name=filename)

    except Exception as e:
        raise ValueError(f"خطا در پردازش تصویر: {str(e)}")


def delete_user_avatar_file(user):
    """حذف فیزیکی فایل تصویر قبلی کاربر از روی دیسک در صورت وجود"""
    if user.avatar and hasattr(user.avatar, 'path'):
        try:
            if os.path.isfile(user.avatar.path):
                os.remove(user.avatar.path)
        except Exception:
            pass
