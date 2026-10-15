import re
from decimal import Decimal
from common.date_utils import normalize_digits

def normalize_iranian_phone(phone_str):
    if not phone_str:
        return ''
    norm = normalize_digits(str(phone_str)).strip()
    digits = re.sub(r'\D', '', norm)
    if digits.startswith('98') and len(digits) == 12:
        digits = '0' + digits[2:]
    elif digits.startswith('0098'):
        digits = '0' + digits[4:]
    elif len(digits) == 10 and digits.startswith('9'):
        digits = '0' + digits
    return digits

def normalize_plate(plate_str):
    if not plate_str:
        return ''
    norm = normalize_digits(str(plate_str)).strip()
    match = re.match(r'^(\d{2})[-_\s]*(الف|[\u0600-\u06FF])[-_\s]*(\d{3})[-_\s]*(?:ایران|-)?[-_\s]*(\d{2})$', norm)
    if match:
        p1, letter, p3, p4 = match.groups()
        return f"{p1} {letter} {p3} ایران {p4}"
    return re.sub(r'\s+', ' ', norm).strip()

ROAD_VEHICLE_TYPES = ('pickup', 'nissan', 'khavar', 'sedan', 'truck', 'trailer')

FLEET_RATE_FIELDS = ('default_service_rate',)

def user_can_view_fleet_rates(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return bool(
        user.has_perm('accounts.perm_approve_fleet_finance')
        or user.has_perm('accounts.can_act_as_accountant')
        or user.has_perm('accounts.perm_approve_fleet_manager')
        or user.has_perm('accounts.can_act_as_manager')
        or user.has_perm('accounts.can_act_as_company_manager')
    )
