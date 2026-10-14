"""
مرکز جامع و یکپارچه تحلیل، اعتبارسنجی و تبدیل تاریخ و زمان (Dual-Path Date Parser Engine)
پشتیبانی کامل از هر ۴ اصل فنی:
1. پشتیبانی از طول‌های متغیر (6, 8, 12, 14 رقم) با قانون آستانه محوری 50 برای سال‌های 2 رقمی.
2. نرمال‌سازی خودکار ارقام فارسی و عربی به ارقام انگلیسی.
3. پیش‌پردازش قطعات جداکننده‌دار (Token-Padding) جهت رفع تداخل ماه‌ها و روزهای تک‌رقمی.
4. اعتبارسنجی سخت‌گیرانه دامنه‌های تقویمی خورشیدی و میلادی.
الگوی عملکردی:
- مسیر سریع (Fast-Path): پردازش کمتر از ۲ میکروثانیه برای ورودی‌های استاندارد.
- مسیر کمکی هوشمند (Fallback Engine): بازیابی و تصحیح ورودی‌های شلخته، بدون جداکننده، یا چندفرمت.
"""

import re
from datetime import date as dt_date, datetime as dt_datetime, time as dt_time
from typing import Optional, Union, Tuple, Any
import jdatetime
from django.core.exceptions import ValidationError

# جدول نگاشت ارقام فارسی و عربی به لاتین
PERSIAN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'
ENGLISH_DIGITS = '01234567890123456789'
DIGIT_TRANSLATION_TABLE = str.maketrans(PERSIAN_ARABIC_DIGITS, ENGLISH_DIGITS)

# رگکس مسیر سریع برای تاریخ‌های استاندارد خورشیدی یا میلادی (با اسلش یا خط تیره)
RE_STANDARD_DATE = re.compile(
    r'^\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?\s*$'
)

# رگکس شناسایی کاراکترهای جداکننده متداول
RE_SEPARATORS = re.compile(r'[^0-9]+')


def normalize_digits(val_str: str) -> str:
    """تبدیل کاراکترهای ارقام فارسی و عربی به ارقام استاندارد انگلیسی."""
    if not val_str:
        return ''
    return str(val_str).strip().translate(DIGIT_TRANSLATION_TABLE)


def _convert_calendar(
    year: int,
    month: int,
    day: int,
    hour: int = 0,
    minute: int = 0,
    second: int = 0,
    strict: bool = True
) -> Optional[dt_datetime]:
    """
    اعتبارسنجی تقویمی و تبدیل به شیء datetime میلادی.
    - بازه ۱۳۰۰ تا ۱۵۰۰: تقویم هجری خورشیدی (Jalali)
    - بازه ۱۹۰۰ تا ۲۱۵۰: تقویم میلادی (Gregorian)
    """
    # بررسی اولیه مقادیر ماه، روز و زمان
    if not (1 <= month <= 12):
        if strict:
            raise ValidationError(f"ماه تاریخ نامعتبر است ({month}). مقدار باید بین ۱ تا ۱۲ باشد.")
        return None

    if not (1 <= day <= 31):
        if strict:
            raise ValidationError(f"روز تاریخ نامعتبر است ({day}). مقدار باید بین ۱ تا ۳۱ باشد.")
        return None

    if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        if strict:
            raise ValidationError(f"زمان نامعتبر است ({hour:02d}:{minute:02d}:{second:02d}).")
        return None

    if 1300 <= year <= 1500:
        try:
            jdt = jdatetime.datetime(year, month, day, hour, minute, second)
            return jdt.togregorian()
        except (ValueError, TypeError) as e:
            if strict:
                raise ValidationError(f"تاریخ خورشیدی نامعتبر است ({year}/{month:02d}/{day:02d}): {e}")
            return None

    elif 1900 <= year <= 2150:
        try:
            return dt_datetime(year, month, day, hour, minute, second)
        except (ValueError, TypeError) as e:
            if strict:
                raise ValidationError(f"تاریخ میلادی نامعتبر است ({year}-{month:02d}-{day:02d}): {e}")
            return None

    else:
        if strict:
            raise ValidationError(
                f"سال خارج از محدوده مجاز سامانه است ({year}). دامنه‌های معتبر: ۱۳۰۰ تا ۱۵۰۰ خورشیدی یا ۱۹۰۰ تا ۲۱۵۰ میلادی."
            )
        return None


def _parse_fallback_digits(cleaned_str: str, strict: bool = True) -> Tuple[Optional[dt_datetime], bool]:
    """
    مسیر کمکی هوشمند (Fallback Engine):
    پوشش ۴ اصل:
    1. طول‌های متغیر (6, 8, 12, 14 رقم) با قاعده Pivot=50 برای سال‌های 2 رقمی.
    2. ارقام فارسی/عربی که در normalize_digits اصلاح شده‌اند.
    3. Token-Padding برای قطعات دارای جداکننده (مانند جداکننده‌های نقطه یا خط‌فاصله).
    4. اعتبارسنجی دقیق محدوده تقویمی.
    خروجی: تاپل (datetime_obj, has_time_component)
    """
    # نکته ۳: بررسی وجود جداکننده و پدینگ صفر برای قطعات تک‌رقمی
    tokens = [t for t in RE_SEPARATORS.split(cleaned_str) if t]
    
    if len(tokens) >= 3:
        # ساختار سال / ماه / روز تفکیک‌شده وجود دارد
        y_token = tokens[0]
        m_token = tokens[1].zfill(2)
        d_token = tokens[2].zfill(2)
        time_tokens = [t.zfill(2) for t in tokens[3:]]
        
        # بازسازی رشته ارقام یکدست
        digits = y_token + m_token + d_token + ''.join(time_tokens)
    else:
        # فاقد جداکننده یا ارقام پیوسته
        digits = re.sub(r'\D', '', cleaned_str)

    num_len = len(digits)
    has_time = False

    if num_len == 6:
        # نکته ۱: سال ۲ رقمی خورشیدی (YYMMDD) با قانون آستانه محوری 50
        yy = int(digits[:2])
        century = 13 if yy >= 50 else 14
        year = (century * 100) + yy
        month = int(digits[2:4])
        day = int(digits[4:6])
        hour, minute, second = 0, 0, 0

    elif num_len == 8:
        # ۸ رقم (YYYYMMDD): فقط تاریخ
        year = int(digits[:4])
        month = int(digits[4:6])
        day = int(digits[6:8])
        hour, minute, second = 0, 0, 0

    elif num_len == 12:
        # ۱۲ رقم (YYYYMMDDHHmm): تاریخ + ساعت و دقیقه
        year = int(digits[:4])
        month = int(digits[4:6])
        day = int(digits[6:8])
        hour = int(digits[8:10])
        minute = int(digits[10:12])
        second = 0
        has_time = True

    elif num_len == 14:
        # ۱۴ رقم (YYYYMMDDHHmmss): تاریخ و زمان کامل با ثانیه
        year = int(digits[:4])
        month = int(digits[4:6])
        day = int(digits[6:8])
        hour = int(digits[8:10])
        minute = int(digits[10:12])
        second = int(digits[12:14])
        has_time = True

    else:
        if strict:
            raise ValidationError(
                f"تعداد ارقام ورودی تاریخ نامعتبر است ({num_len} رقم برای ورودی '{cleaned_str}'). "
                f"طول‌های مجاز: ۶ رقم (سال دو رقمی)، ۸ رقم (تاریخ)، ۱۲ یا ۱۴ رقم (تاریخ و زمان)."
            )
        return None, False

    dt_obj = _convert_calendar(year, month, day, hour, minute, second, strict=strict)
    return dt_obj, has_time


# نام مستعار برای سازگاری فنی با نگارش قبلی
_parse_digits_fallback = _parse_fallback_digits


def parse_date_smart(
    val: Any,
    as_datetime: bool = False,
    strict: bool = True,
    make_aware: bool = False
) -> Optional[Union[dt_date, dt_datetime]]:
    """
    تابع سراسری و هوشمند پارس و نرمال‌سازی تاریخ و زمان (Fast-Path + Fallback).
    
    پارامترها:
    - val: ورودی تاریخ به صورت رشته، عدد، شیء date یا datetime.
    - as_datetime: در صورت True همواره شیء datetime برمی‌گرداند.
    - strict: در صورت True در مواجهه با داده معیوب ValidationError پرتاب می‌کند.
              در صورت False مقدار None بازمی‌گرداند.
    - make_aware: در صورت True و فعال بودن منطقه زمانی در جنگو، شیء timezone-aware برمی‌گرداند.
    """
    if val is None:
        return None

    # ۱. اگر ورودی از قبل شیء تاریخ/زمان باشد
    if isinstance(val, dt_datetime):
        res_dt = val
        if make_aware:
            from django.utils import timezone
            if timezone.is_naive(res_dt):
                res_dt = timezone.make_aware(res_dt, timezone.get_current_timezone())
        return res_dt if as_datetime else res_dt.date()

    if isinstance(val, dt_date):
        if as_datetime:
            res_dt = dt_datetime.combine(val, dt_time.min)
            if make_aware:
                from django.utils import timezone
                if timezone.is_naive(res_dt):
                    res_dt = timezone.make_aware(res_dt, timezone.get_current_timezone())
            return res_dt
        return val

    # تبدیل به رشته و حذف فاصله‌های اضافی
    raw_str = str(val).strip()
    if not raw_str:
        return None

    # ۲. مسیر سریع (Fast-Path): بررسی مستقیم الگوهای استاندارد انگلیسی بدون سربار اضافه
    match = RE_STANDARD_DATE.match(raw_str)
    if match:
        y = int(match.group(1))
        m = int(match.group(2))
        d = int(match.group(3))
        hh = int(match.group(4) or 0)
        mm = int(match.group(5) or 0)
        ss = int(match.group(6) or 0)
        has_time = match.group(4) is not None

        converted_dt = _convert_calendar(y, m, d, hh, mm, ss, strict=strict)
        if converted_dt is None:
            return None

        if make_aware:
            from django.utils import timezone
            if timezone.is_naive(converted_dt):
                converted_dt = timezone.make_aware(converted_dt, timezone.get_current_timezone())

        if as_datetime or has_time:
            return converted_dt
        return converted_dt.date()

    # ۳. مسیر کمکی هوشمند (Fallback Engine):
    # نرمال‌سازی ارقام فارسی/عربی و پارس ارقام
    cleaned_str = normalize_digits(raw_str)
    converted_dt, has_time = _parse_fallback_digits(cleaned_str, strict=strict)

    if converted_dt is None:
        return None

    if make_aware:
        from django.utils import timezone
        if timezone.is_naive(converted_dt):
            converted_dt = timezone.make_aware(converted_dt, timezone.get_current_timezone())

    if as_datetime or has_time:
        return converted_dt
    return converted_dt.date()


def format_to_shamsi_str(
    val: Union[dt_date, dt_datetime, str],
    include_time: bool = False
) -> str:
    """
    تبدیل شیء تاریخ یا زمان به رشته استاندارد تقویم هجری خورشیدی (YYYY/MM/DD یا YYYY/MM/DD HH:mm:ss).
    """
    if not val:
        return ""

    dt_obj = val
    if isinstance(val, str):
        dt_obj = parse_date_smart(val, as_datetime=True, strict=False)
        if not dt_obj:
            return ""

    if isinstance(dt_obj, dt_date) and not isinstance(dt_obj, dt_datetime):
        dt_obj = dt_datetime.combine(dt_obj, dt_time.min)

    try:
        jdt = jdatetime.datetime.fromgregorian(datetime=dt_obj)
        if include_time:
            return jdt.strftime("%Y/%m/%d %H:%M:%S")
        return jdt.strftime("%Y/%m/%d")
    except Exception:
        return ""


# نام مستعار کمکی برای سازگاری کامل با کدهای قبلی پروژه
_parse_date_flexible = lambda val: parse_date_smart(val, as_datetime=False, strict=False)
