import re
from common.date_utils import normalize_digits


def validate_iranian_national_code(value: str) -> str:
    """
    اعتبارسنجی جامع کد ملی ایرانی بر اساس الگوریتم مودولوس ۱۱ (رقم کنترلی)
    در صورت نامعتبر بودن، ValueError برمی‌گرداند و در صورت معتبر بودن، رشته ۱۰ رقمی نرمال‌شده را برمی‌گرداند.
    """
    if not value:
        raise ValueError("کد ملی الزامی است.")

    raw = normalize_digits(str(value).strip())
    digits = re.sub(r'\D', '', raw)
    if not digits:
        raise ValueError("کد ملی نامعتبر است.")
    if len(digits) < 10:
        digits = digits.zfill(10)
    if len(digits) != 10:
        raise ValueError("کد ملی باید دقیقاً ۱۰ رقم باشد.")
    if len(set(digits)) == 1:
        raise ValueError("کد ملی نامعتبر است (ارقام یکسان و تکراری).")

    s = sum(int(digits[i]) * (10 - i) for i in range(9))
    r = s % 11
    check = int(digits[9])
    if not ((r < 2 and check == r) or (r >= 2 and check == 11 - r)):
        raise ValueError("کد ملی وارد شده با الگوریتم اعتبارسنجی همخوانی ندارد و نامعتبر است.")

    return digits


def validate_iranian_mobile(value: str) -> str:
    """
    اعتبارسنجی شماره همراه ایرانی: باید با 09 شروع شده و مجموعاً ۱۱ رقم باشد.
    """
    if not value:
        raise ValueError("شماره همراه الزامی است.")
    raw = normalize_digits(str(value).strip())
    digits = re.sub(r'\D', '', raw)
    if not re.match(r'^09\d{9}$', digits):
        raise ValueError("شماره همراه باید ۱۱ رقم بوده و با 09 آغاز شود.")
    return digits


def validate_iranian_postal_code(value: str) -> str:
    """
    اعتبارسنجی کد پستی ایرانی: باید دقیقاً ۱۰ رقم عددی باشد.
    """
    if not value:
        raise ValueError("کد پستی الزامی است.")
    raw = normalize_digits(str(value).strip())
    digits = re.sub(r'\D', '', raw)
    if not re.match(r'^\d{10}$', digits):
        raise ValueError("کد پستی باید دقیقاً ۱۰ رقم عددی باشد.")
    return digits
