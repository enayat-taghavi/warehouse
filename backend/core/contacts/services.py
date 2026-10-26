"""
سرویس طرف‌های بیرونی (ص۱ طرح ۳.۱). ماژول‌ها طرف را فقط از این‌جا می‌سازند و ویرایش می‌کنند
تا یکسان‌سازی کد ملی و رقم‌ها و قاعدهٔ «یک طرف با یک شناسه در هر شرکت» یک‌جا بماند.
"""
from common.date_utils import normalize_digits
from companies.access import get_user_allowed_companies

from .models import ExternalParty

# فیلدهای هویتی و تماسی که از بیرون نوشته می‌شوند
PARTY_FIELDS = (
    'kind', 'name', 'national_id', 'economic_code', 'registration_number', 'phone', 'mobile',
    'email', 'address', 'postal_code', 'notes', 'is_active',
)
_DIGIT_FIELDS = ('national_id', 'economic_code', 'registration_number', 'phone', 'mobile', 'postal_code')
NATIONAL_ID_LENGTH = {ExternalParty.KIND_PERSON: 10, ExternalParty.KIND_LEGAL: 11}


def normalize_national_id(value):
    """رقم‌های فارسی و عربی به لاتین؛ خالی یعنی None (قید یکتایی فقط روی شناسهٔ پر است)."""
    cleaned = normalize_digits(str(value)).strip() if value is not None else ''
    return cleaned or None


def infer_kind(national_id, kind=None):
    """نوع ناگفته از طول شناسه: ۱۱ رقم حقوقی، وگرنه حقیقی (درخواست‌های قدیمی صف نوع ندارند)."""
    if kind in NATIONAL_ID_LENGTH:
        return kind
    return ExternalParty.KIND_LEGAL if national_id and len(national_id) == 11 else ExternalParty.KIND_PERSON


def national_id_error(kind, national_id):
    """پیام خطای کد یا شناسهٔ ملی، یا None اگر درست یا خالی است."""
    if not national_id:
        return None
    if not national_id.isdigit():
        return 'کد یا شناسهٔ ملی فقط رقم دارد.'
    expected = NATIONAL_ID_LENGTH.get(kind)
    if expected and len(national_id) != expected:
        return 'کد ملی شخص حقیقی ۱۰ رقم و شناسهٔ ملی شخص حقوقی ۱۱ رقم است.'
    return None


def normalize_party_data(data):
    """فقط کلیدهای PARTY_FIELDS، با رقم لاتین و بی فاصلهٔ اضافه؛ kind اگر نیامده باشد از شناسه حدس زده می‌شود."""
    out = {}
    for key in PARTY_FIELDS:
        if key not in data:
            continue
        value = data[key]
        if key == 'is_active':
            out[key] = bool(value)
        elif key == 'national_id':
            out[key] = normalize_national_id(value)
        elif key in _DIGIT_FIELDS:
            out[key] = normalize_digits(str(value or '')).strip()
        else:
            out[key] = str(value or '').strip() if key != 'kind' else value
    if 'kind' in out or 'national_id' in out:
        out['kind'] = infer_kind(out.get('national_id'), out.get('kind'))
    return out


def find_party(company_id, national_id):
    """طرف همان شرکت با همان کد یا شناسهٔ ملی، یا None."""
    national_id = normalize_national_id(national_id)
    if not company_id or not national_id:
        return None
    return ExternalParty.objects.filter(company_id=company_id, national_id=national_id).first()


def create_party(company, data, user=None):
    """طرف تازه در شرکت. company شیء یا شناسه. یکتایی شناسه را صدازننده با find_party پیش از ساخت می‌سنجد."""
    fields = normalize_party_data(data)
    fields.setdefault('kind', ExternalParty.KIND_PERSON)
    return ExternalParty.objects.create(company_id=getattr(company, 'pk', company), created_by=user, **fields)


def update_party(party, data, user=None):
    """ویرایش فیلدهای داده‌شده؛ شرکت طرف هرگز عوض نمی‌شود."""
    fields = normalize_party_data(data)
    if 'kind' not in data and 'national_id' in fields and fields['national_id'] is None:
        fields['kind'] = party.kind  # پاک کردن شناسه نوع را عوض نمی‌کند
    for key, value in fields.items():
        setattr(party, key, value)
    if fields:
        party.save(update_fields=[*fields, 'updated_at'])
    return party


def parties_for_user(user):
    """طرف‌های شرکت‌هایی که کاربر به آن‌ها راه دارد (مدیر کل سامانه: همه)."""
    if not user or not user.is_authenticated:
        return ExternalParty.objects.none()
    if user.is_superuser:
        return ExternalParty.objects.all()
    return ExternalParty.objects.filter(company__in=get_user_allowed_companies(user))
