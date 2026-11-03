"""
قلاب‌های رجیستری سند نامه (letters_letter) برای هسته (ن۱ و ن۹).

همه در برابر شناسهٔ نادرست یا نامهٔ ناموجود «بسته» رفتار می‌کنند: قفل = True، محرمانه = True، شرکت و شیء = None.
"""
from .models import Letter


def _letter_id(entity_id):
    try:
        value = int(str(entity_id).strip())
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def resolve_letter(entity_id):
    pk = _letter_id(entity_id)
    if pk is None:
        return None
    return Letter.objects.filter(pk=pk).first()


def letter_company_id(entity_id):
    pk = _letter_id(entity_id)
    if pk is None:
        return None
    return Letter.objects.filter(pk=pk).values_list('company_id', flat=True).first()


def letter_is_locked(entity_id) -> bool:
    """از ثبت به بعد قفل (ن۳)؛ نامهٔ ناموجود قفل حساب می‌شود."""
    pk = _letter_id(entity_id)
    status = Letter.objects.filter(pk=pk).values_list('status', flat=True).first() if pk else None
    return status is None or status in Letter.LOCKED_STATUSES


def letter_is_confidential(entity_id) -> bool:
    """محرمانه و سری ← پیوست فقط روی سرور (ن۹)؛ نامهٔ ناموجود محرمانه حساب می‌شود."""
    pk = _letter_id(entity_id)
    level = Letter.objects.filter(pk=pk).values_list('confidentiality', flat=True).first() if pk else None
    return level is None or level != Letter.CONF_NORMAL
