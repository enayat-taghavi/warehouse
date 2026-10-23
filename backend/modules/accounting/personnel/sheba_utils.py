"""
Iranian IBAN (Sheba) Validation and Bank Directory Utility
Standard: ISO 7064 Mod 97-10 & ISO 13616
"""
import re
from typing import Optional, Dict, Tuple

# لیست کامل ۳۲ بانک و مؤسسه اعتباری رسمی کشور با کد ۳ رقمی استاندارد شبا (CBI Official Directory)
IRANIAN_BANKS_MAP: Dict[str, Dict[str, str]] = {
    '010': {'name': 'بانک مرکزی جمهوری اسلامی ایران', 'short_name': 'مرکزی', 'icon': '🏛️'},
    '011': {'name': 'بانک صنعت و معدن', 'short_name': 'صنعت و معدن', 'icon': '🏭'},
    '012': {'name': 'بانک ملت', 'short_name': 'ملت', 'icon': '🔴'},
    '013': {'name': 'بانک رفاه کارگران', 'short_name': 'رفاه', 'icon': '🔵'},
    '014': {'name': 'بانک مسکن', 'short_name': 'مسکن', 'icon': '🏠'},
    '015': {'name': 'بانک سپه', 'short_name': 'سپه', 'icon': '⭐'},
    '016': {'name': 'بانک کشاورزی', 'short_name': 'کشاورزی', 'icon': '🌾'},
    '017': {'name': 'بانک ملی ایران', 'short_name': 'ملی', 'icon': '🦁'},
    '018': {'name': 'بانک تجارت', 'short_name': 'تجارت', 'icon': '🔷'},
    '019': {'name': 'بانک صادرات ایران', 'short_name': 'صادرات', 'icon': '💎'},
    '020': {'name': 'بانک توسعه صادرات ایران', 'short_name': 'توسعه صادرات', 'icon': '🚢'},
    '021': {'name': 'پست بانک ایران', 'short_name': 'پست بانک', 'icon': '📮'},
    '022': {'name': 'بانک توسعه تعاون', 'short_name': 'توسعه تعاون', 'icon': '🤝'},
    '051': {'name': 'موسسه اعتباری غیربانکی ملل (عسکریه)', 'short_name': 'ملل', 'icon': '🏢'},
    '053': {'name': 'بانک کارآفرین', 'short_name': 'کارآفرین', 'icon': '💼'},
    '054': {'name': 'بانک پارسیان', 'short_name': 'پارسیان', 'icon': '🌸'},
    '055': {'name': 'بانک اقتصاد نوین', 'short_name': 'اقتصاد نوین', 'icon': '🌐'},
    '056': {'name': 'بانک سامان', 'short_name': 'سامان', 'icon': '🌊'},
    '057': {'name': 'بانک پاسارگاد', 'short_name': 'پاسارگاد', 'icon': '🏛️'},
    '058': {'name': 'بانک سرمایه', 'short_name': 'سرمایه', 'icon': '📊'},
    '059': {'name': 'بانک سینا', 'short_name': 'سینا', 'icon': '💠'},
    '060': {'name': 'بانک قرض‌الحسنه مهر ایران', 'short_name': 'مهر ایران', 'icon': '☀️'},
    '061': {'name': 'بانک شهر', 'short_name': 'شهر', 'icon': '🏙️'},
    '062': {'name': 'بانک آینده', 'short_name': 'آینده', 'icon': '🔮'},
    '063': {'name': 'بانک انصار (ادغام در سپه)', 'short_name': 'انصار', 'icon': '⭐'},
    '064': {'name': 'بانک گردشگری', 'short_name': 'گردشگری', 'icon': '🧭'},
    '065': {'name': 'بانک حکمت ایرانیان (ادغام در سپه)', 'short_name': 'حکمت', 'icon': '⭐'},
    '066': {'name': 'بانک دی', 'short_name': 'دی', 'icon': '🦅'},
    '069': {'name': 'بانک ایران زمین', 'short_name': 'ایران زمین', 'icon': '🌍'},
    '070': {'name': 'بانک قرض‌الحسنه رسالت', 'short_name': 'رسالت', 'icon': '🌿'},
    '075': {'name': 'موسسه اعتباری غیربانکی نور', 'short_name': 'نور', 'icon': '💡'},
    '078': {'name': 'بانک خاورمیانه', 'short_name': 'خاورمیانه', 'icon': '🗺️'},
}

def extract_sheba_digits(raw_input: str) -> str:
    """
    استخراج هوشمند صرفاً ارقام عددی از هر متن آلوده به حروف، فواصل و نشانه‌ها
    """
    if not raw_input:
        return ""
    persian_digits = "۰۱۲۳۴۵۶۷۸۹"
    arabic_digits = "٠١٢٣٤٥٦٧٨٩"
    cleaned = str(raw_input)
    for i, d in enumerate(persian_digits):
        cleaned = cleaned.replace(d, str(i))
    for i, d in enumerate(arabic_digits):
        cleaned = cleaned.replace(d, str(i))
    
    digits_only = re.sub(r'\D', '', cleaned)
    return digits_only[:24]

def extract_account_number_from_sheba(raw_sheba: str) -> str:
    """
    استخراج شماره حساب بانکی از داخل ارقام شماره شبا (حذف صفرهای زائد سمت چپ)
    """
    digits = extract_sheba_digits(raw_sheba)
    if len(digits) <= 6:
        return ""
    raw_account = digits[6:]
    trimmed = raw_account.lstrip('0')
    return trimmed or raw_account

def get_bank_by_name(bank_name: str) -> Optional[Tuple[str, Dict[str, str]]]:
    """
    یافتن کد و مشخصات بانک بر اساس نام
    """
    if not bank_name:
        return None
    name_clean = bank_name.strip()
    for code, info in IRANIAN_BANKS_MAP.items():
        if info['name'] == name_clean or info['short_name'] == name_clean or code == name_clean:
            return code, info
        if name_clean in info['name'] or info['name'] in name_clean:
            return code, info
    return None

def validate_account_number(account_number: str) -> Tuple[bool, Optional[str], str]:
    """
    اعتبارسنجی سخت‌گیرانه شماره حساب بانکی بر اساس قوانین بانکی کشور
    خروجی: (is_valid, error_message, clean_account_number)
    """
    if not account_number or not str(account_number).strip():
        return False, "شماره حساب نمی‌تواند خالی باشد.", ""
    
    clean_digits = extract_sheba_digits(str(account_number))
    if not clean_digits:
        return False, "شماره حساب فاقد هرگونه رقم عددی است.", ""
    
    if re.match(r'^0+$', clean_digits):
        return False, "شماره حساب نمی‌تواند صفر یا تماماً صفر باشد.", clean_digits

    if len(clean_digits) < 4:
        return False, f"طول شماره حساب ناقص است ({len(clean_digits)} از حداقل ۴ رقم).", clean_digits

    if len(clean_digits) > 18:
        return False, "طول شماره حساب بیشتر از سقف مجاز بانکی (۱۸ رقم) است.", clean_digits

    return True, None, clean_digits

def generate_sheba_from_account(bank_identifier: str, account_number: str, account_type: str = "0") -> str:
    """
    تولید خودکار شماره شبا بر مبنای استاندارد ISO 7064 Mod 97-10 از روی شماره حساب و بانک با گارد اعتبارسنجی
    """
    if not bank_identifier or not account_number:
        return ""
    
    is_valid, _, clean_acc = validate_account_number(account_number)
    if not is_valid:
        return ""

    bank_code = None
    if bank_identifier in IRANIAN_BANKS_MAP:
        bank_code = bank_identifier
    else:
        bank_lookup = get_bank_by_name(bank_identifier)
        if bank_lookup:
            bank_code = bank_lookup[0]

    if not bank_code:
        return ""

    padded_account = clean_acc.zfill(18)
    bban = f"{bank_code}{account_type or '0'}{padded_account}"
    payload = f"{bban}182700"

    try:
        rem = int(payload) % 97
        check_digits = str(98 - rem).zfill(2)
        return f"IR{check_digits}{bban}"
    except Exception:
        return ""

def clean_sheba(raw_sheba: str) -> str:
    """
    نرمال‌سازی و پاکسازی کاراکترهای شماره شبا و افزودن خودکار IR
    """
    if not raw_sheba:
        return ""
    digits = extract_sheba_digits(raw_sheba)
    if not digits:
        return ""
    return "IR" + digits

def get_bank_from_sheba(raw_sheba: str) -> Optional[Dict[str, str]]:
    """
    استخراج مشخصات بانک از روی کد ۳ رقمی شبا
    """
    digits = extract_sheba_digits(raw_sheba)
    if len(digits) >= 5:
        bank_code = digits[2:5]
        return IRANIAN_BANKS_MAP.get(bank_code)
    return None

def validate_sheba(raw_sheba: str) -> Tuple[bool, Optional[str], Optional[Dict[str, str]]]:
    """
    اعتبارسنجی ریاضی شماره شبا بر مبنای استاندارد ISO 7064 Mod 97-10
    خروجی: (is_valid, error_message, bank_info)
    """
    if not raw_sheba or not str(raw_sheba).strip():
        return False, "شماره شبا نمی‌تواند خالی باشد.", None

    digits = extract_sheba_digits(raw_sheba)
    bank_info = get_bank_from_sheba(digits)

    if len(digits) == 0:
        return False, "شماره شبا فاقد هرگونه رقم عددی است.", None

    if len(digits) < 24:
        return False, f"طول ارقام شبا ناقص است ({len(digits)} از ۲۴ رقم).", bank_info

    check_digits = digits[:2]
    if check_digits in ['00', '01', '99']:
        return False, "ارقام کنترلی شبا نامعتبر است.", bank_info

    account_part = extract_account_number_from_sheba(digits)
    if not account_part or re.match(r'^0+$', account_part):
        return False, "شماره حساب مندرج در شبا نامعتبر (صفر) است.", bank_info

    bban = digits[2:]
    numeric_str = bban + "1827" + check_digits

    try:
        remainder = int(numeric_str) % 97
        if remainder == 1:
            return True, None, bank_info
        else:
            return False, "کد کنترلی شبا نامعتبر است (خطای محاسباتی Mod 97).", bank_info
    except Exception as e:
        return False, f"خطا در اعتبارسنجی ساختار شبا: {e}", bank_info
