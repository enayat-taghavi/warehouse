"""
فیلدها و اعتبارسنج‌های مشترک سریالایزرها (تاریخ شمسی و فایل مدارک)؛ از personnel/serializers.py به common منتقل شده‌اند
تا هستهٔ companies هم بتواند از آن‌ها استفاده کند.
"""
import os
from datetime import date as dt_date, datetime as dt_datetime

from rest_framework import serializers

from common.date_utils import parse_date_smart, format_to_shamsi_str


ALLOWED_DOCUMENT_EXTENSIONS = (
    '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.zip', '.rar',
    '.xlsx', '.xls', '.docx', '.doc'
)
MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


def validate_uploaded_document(file_obj, max_size_bytes=MAX_DOCUMENT_SIZE_BYTES, allowed_exts=ALLOWED_DOCUMENT_EXTENSIONS):
    """
    اعتبارسنجی یکپارچه حجم و فرمت فایل‌های اسناد و مدارک شرکت‌ها
    """
    if not file_obj:
        return file_obj

    # ۱. بررسی حجم فایل
    if hasattr(file_obj, 'size') and file_obj.size > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise serializers.ValidationError(f"حجم فایل نمی‌تواند بیشتر از {max_mb} مگابایت باشد.")

    # ۲. بررسی پسوند فایل
    name = getattr(file_obj, 'name', '') or ''
    ext = os.path.splitext(name)[1].lower()
    if not ext or ext not in allowed_exts:
        exts_display = ', '.join([e.replace('.', '').upper() for e in allowed_exts])
        raise serializers.ValidationError(f"فرمت فایل غیرمجاز است ({ext or 'نامشخص'}). پسوندهای مجاز: {exts_display}")

    return file_obj


class ShamsiDateField(serializers.Field):
    """
    فیلد اختصاصی تاریخ برای پشتیبانی دوطرفه از تاریخ شمسی و میلادی:
    - در ورودی (to_internal_value): دریافت رشته شمسی (۱۴۰۳/۰۵/۲۰ یا 1403/05/20)، میلادی یا شیء تاریخ و تبدیل به datetime.date
    - در خروجی (to_representation): رشته استاندارد شمسی YYYY/MM/DD
    """
    def __init__(self, output_shamsi=True, **kwargs):
        self.output_shamsi = output_shamsi
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if data in (None, '', 'null'):
            return None
        if isinstance(data, dt_date) and not isinstance(data, dt_datetime):
            return data
        if isinstance(data, dt_datetime):
            return data.date()
        try:
            parsed = parse_date_smart(data, as_datetime=False, strict=True)
            if parsed is None:
                raise serializers.ValidationError("فرمت تاریخ ارسالی نامعتبر است.")
            return parsed
        except serializers.ValidationError:
            raise
        except Exception as e:
            raise serializers.ValidationError(f"تاریخ نامعتبر است: {e}")

    def to_representation(self, value):
        if not value:
            return None
        if self.output_shamsi:
            return format_to_shamsi_str(value)
        return str(value)
