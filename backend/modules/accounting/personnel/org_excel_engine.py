"""
موتور استاندارد ورود و خروج اکسل طرف‌حساب‌های مالی (Counterparties Excel Engine).
اکسل پروژه‌ها، بخش‌ها و انتساب‌ها از گام ۲ طرح Project_Section_To_Core در هسته است (`companies.org_excel`)
و helperهای سربرگ دوسطری و تاریخ شمسی از همان‌جا می‌آیند:
- ساختار ۲ سطری هدر (سطر ۱: عناوین فارسی، سطر ۲: کلیدهای دیتابیسی با فونت طوسی)
- فریز پنل در A3، راست‌به‌چپ، تاریخ شمسی و پیش‌نمایش واقعی (dry_run)
"""

import io
import openpyxl
from openpyxl.styles import Font, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Q

from companies.org_excel import _apply_2row_header, _format_datetime_shamsi
from .models import Counterparty
from common.date_utils import normalize_digits

# فهرست‌های مجاز جهت استفاده در منوهای کشویی اکسل (Data Validation Lists)
COUNTERPARTY_TYPES_TUPLES = [
    ('راننده / مالک خودرو', 'driver'),
    ('تعمیرگاه و قطعات', 'repair_shop'),
    ('جایگاه سوخت', 'fuel_station'),
    ('پیمانکار خدماتی', 'contractor'),
    ('سایر اشخاص حقیقی/حقوقی', 'other'),
]

IRANIAN_BANKS_LIST = [
    'بانک ملی ایران',
    'بانک ملت',
    'بانک صادرات ایران',
    'بانک سپه',
    'بانک تجارت',
    'بانک پاسارگاد',
    'بانک سامان',
    'بانک پارسیان',
    'بانک کارآفرین',
    'بانک اقتصاد نوین',
    'بانک سینا',
    'بانک شهر',
    'بانک دی',
    'بانک گردشگری',
    'بانک ایران زمین',
    'بانک سرمایه',
    'بانک رفاه کارگران',
    'بانک مسکن',
    'بانک کشاورزی',
    'بانک صنعت و معدن',
    'بانک توسعه صادرات ایران',
    'بانک توسعه تعاون',
    'پست بانک ایران',
    'بانک قرض‌الحسنه مهر ایران',
    'بانک قرض‌الحسنه رسالت',
    'بانک خاورمیانه',
    'بانک آینده',
    'موسسه اعتباری غیربانکی ملل (عسکریه)',
    'بانک مرکزی جمهوری اسلامی ایران',
]

BOOLEAN_LIST = ['بله', 'خیر']


# -------------------------------------------------------------
# ۳. طرف‌حساب‌های مالی (Counterparties)
# -------------------------------------------------------------
COUNTERPARTY_COLUMNS = [
    {'title': 'نام طرف‌حساب', 'key': 'name', 'width': 26},
    {'title': 'نوع طرف‌حساب', 'key': 'counterparty_type', 'width': 18},
    {'title': 'کد ملی / شناسه اقتصادی', 'key': 'national_id', 'width': 20},
    {'title': 'تلفن تماس', 'key': 'phone', 'width': 18},
    {'title': 'نام بانک عامل', 'key': 'bank_name', 'width': 18},
    {'title': 'شماره حساب', 'key': 'account_number', 'width': 20},
    {'title': 'شماره شبا (۲۴ رقمی)', 'key': 'sheba_number', 'width': 28},
    {'title': 'کد حساب تفصیلی', 'key': 'account_code', 'width': 20},
    {'title': 'وضعیت فعال', 'key': 'is_active', 'width': 14},
    {'title': 'تاریخ ثبت', 'key': 'created_at', 'width': 22},
]

def export_counterparties_excel(section_id=None, company_ids=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'طرف‌حساب‌های مالی'
    _apply_2row_header(ws, COUNTERPARTY_COLUMNS, header_bg='059669')  # سبز زمردی

    qs = Counterparty.objects.all()
    if company_ids is not None:
        qs = qs.filter(Q(company_id__in=company_ids) | Q(company__isnull=True))
    qs = qs.order_by('name')

    font_data = Font(name='B Nazanin', size=11)
    align_data = Alignment(horizontal='center', vertical='center')
    align_text = Alignment(horizontal='right', vertical='center')

    type_map = dict(Counterparty.TYPE_CHOICES)

    for row_idx, cp in enumerate(qs, 3):
        sheba_display = f"IR{cp.sheba_number}" if cp.sheba_number else '-'
        ws.cell(row=row_idx, column=1, value=cp.name).alignment = align_text
        ws.cell(row=row_idx, column=2, value=type_map.get(cp.counterparty_type, cp.counterparty_type)).alignment = align_data
        ws.cell(row=row_idx, column=3, value=cp.national_id or '-').alignment = align_data
        ws.cell(row=row_idx, column=4, value=cp.phone or '-').alignment = align_data
        ws.cell(row=row_idx, column=5, value=cp.bank_name or '-').alignment = align_text
        ws.cell(row=row_idx, column=6, value=cp.account_number or '-').alignment = align_data
        ws.cell(row=row_idx, column=7, value=sheba_display).alignment = align_data
        ws.cell(row=row_idx, column=8, value=cp.account_code or '-').alignment = align_data
        ws.cell(row=row_idx, column=9, value='بله' if cp.is_active else 'خیر').alignment = align_data
        ws.cell(row=row_idx, column=10, value=_format_datetime_shamsi(cp.created_at)).alignment = align_data

        for c in range(1, 11):
            ws.cell(row=row_idx, column=c).font = font_data

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="counterparties.xlsx"'
    return response



# -------------------------------------------------------------
# دانلود قالب آمادهٔ طرف‌حساب‌ها (Template)
# -------------------------------------------------------------
def download_counterparties_template():
    wb = openpyxl.Workbook()
    ws = wb.active

    ws.title = 'قالب طرف‌حساب‌ها'
    _apply_2row_header(ws, COUNTERPARTY_COLUMNS[:9], header_bg='059669')

    # ایجاد شیت دوم جهت نگهداری مقادیر کشویی (Data Validation Lists)
    ws_lists = wb.create_sheet(title='Lists')
    ws_lists.sheet_view.rightToLeft = True

    cp_types = [t[0] for t in COUNTERPARTY_TYPES_TUPLES]
    for idx, t in enumerate(cp_types, 1):
        ws_lists.cell(row=idx, column=1, value=t)

    for idx, b in enumerate(IRANIAN_BANKS_LIST, 1):
        ws_lists.cell(row=idx, column=2, value=b)

    for idx, yn in enumerate(BOOLEAN_LIST, 1):
        ws_lists.cell(row=idx, column=3, value=yn)

    # ۱. دراپ‌داون انتخاب نوع طرف‌حساب (ستون B سطر ۳ تا ۵۰۰)
    dv_type = DataValidation(type="list", formula1=f"Lists!$A$1:$A${len(cp_types)}", allow_blank=True)
    dv_type.error = 'لطفاً نوع طرف‌حساب را از میان گزینه‌های منوی کشویی انتخاب فرمایید.'
    dv_type.errorTitle = 'نوع طرف‌حساب نامعتبر'
    dv_type.prompt = 'نوع طرف‌حساب را از منوی کشویی انتخاب کنید.'
    dv_type.promptTitle = 'انتخاب نوع طرف‌حساب'
    ws.add_data_validation(dv_type)
    dv_type.add("B3:B500")

    # ۲. دراپ‌داون انتخاب نام بانک عامل (ستون E سطر ۳ تا ۵۰۰)
    dv_bank = DataValidation(type="list", formula1=f"Lists!$B$1:$B${len(IRANIAN_BANKS_LIST)}", allow_blank=True)
    dv_bank.error = 'لطفاً نام بانک عامل را از میان گزینه‌های منوی کشویی انتخاب فرمایید.'
    dv_bank.errorTitle = 'بانک نامعتبر'
    dv_bank.prompt = 'نام بانک عامل را از منوی کشویی انتخاب کنید.'
    dv_bank.promptTitle = 'انتخاب بانک عامل'
    ws.add_data_validation(dv_bank)
    dv_bank.add("E3:E500")

    # ۳. دراپ‌داون وضعیت فعال (ستون I سطر ۳ تا ۵۰۰)
    dv_active = DataValidation(type="list", formula1=f"Lists!$C$1:$C${len(BOOLEAN_LIST)}", allow_blank=True)
    dv_active.error = 'تنها گزینه‌های «بله» یا «خیر» مجاز است.'
    dv_active.errorTitle = 'ورودی نامعتبر'
    ws.add_data_validation(dv_active)
    dv_active.add("I3:I500")

    # ردیف ۳: ردیف نمونه اول (راننده / مالک خودرو)
    ws.cell(row=3, column=1, value='شرکت حمل‌ونقل پیشتاز')
    ws.cell(row=3, column=2, value='راننده / مالک خودرو')
    ws.cell(row=3, column=3, value='10101234567')
    ws.cell(row=3, column=4, value='09121111111')
    ws.cell(row=3, column=5, value='بانک ملت')
    ws.cell(row=3, column=6, value='0101111111001')
    ws.cell(row=3, column=7, value='060120000000000101111111')  # ۲۴ رقم عددی بدون IR
    ws.cell(row=3, column=8, value='110201')
    ws.cell(row=3, column=9, value='بله')

    # ردیف ۴: ردیف نمونه دوم (تعمیرگاه و قطعات)
    ws.cell(row=4, column=1, value='تعمیرگاه مرکزی ایران')
    ws.cell(row=4, column=2, value='تعمیرگاه و قطعات')
    ws.cell(row=4, column=3, value='14002345678')
    ws.cell(row=4, column=4, value='02188888888')
    ws.cell(row=4, column=5, value='بانک ملی ایران')
    ws.cell(row=4, column=6, value='0202222222002')
    ws.cell(row=4, column=7, value='170170000000000202222222')
    ws.cell(row=4, column=8, value='110202')
    ws.cell(row=4, column=9, value='بله')

    filename = 'counterparties_template.xlsx'

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

# -------------------------------------------------------------
# پارس و ورود دسته‌جمعی داده‌ها از فایل اکسل (Bulk Import با پشتیبانی از dry_run)
# -------------------------------------------------------------
def import_counterparties_from_excel(file_obj, dry_run=False, company_id=None):
    """
    خواندن و ثبت دسته‌جمعی طرف‌های حساب از اکسل با پشتیبانی از dry_run.
    company_id تهی (سوپریوزر): رفتار قبلی، تطبیق نام روی کل جدول.
    company_id داده‌شده: تطبیق و ساخت فقط در همان شرکت؛ طرف‌حساب سراسری یا شرکت دیگر دست نمی‌خورد.
    """
    try:
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        ws = wb.active
    except Exception as e:
        return {
            'success': False,
            'dry_run': dry_run,
            'summary': {'total_rows': 0, 'valid_count': 0, 'error_count': 1, 'created': 0, 'updated': 0, 'skipped': 1},
            'errors': [{'row': 0, 'message': f'فایل اکسل نامعتبر یا آسیب‌دیده است: {str(e)}'}]
        }

    created = 0
    updated = 0
    errors = []

    # خواندن از ردیف ۳ به بعد (ردیف ۱ و ۲ هدر هستند)
    for row_idx in range(3, ws.max_row + 1):
        name = ws.cell(row=row_idx, column=1).value
        if not name or str(name).strip() == '':
            continue
        name = str(name).strip()

        raw_type = ws.cell(row=row_idx, column=2).value or 'other'
        cp_type = str(raw_type).strip().lower()
        if cp_type not in dict(Counterparty.TYPE_CHOICES):
            # تبدیل عناوین فارسی به کلید سیستمی
            f_map = {
                'راننده': 'driver', 'مالک خودرو': 'driver', 'راننده / مالک خودرو': 'driver',
                'راننده/مالک خودرو': 'driver',
                'تعمیرگاه': 'repair_shop', 'تعمیرگاه و قطعات': 'repair_shop',
                'جایگاه سوخت': 'fuel_station', 'بنزین': 'fuel_station',
                'پیمانکار': 'contractor', 'خدماتی': 'contractor', 'پیمانکار خدماتی': 'contractor',
                'سایر': 'other', 'سایر اشخاص حقیقی/حقوقی': 'other'
            }
            cp_type = f_map.get(cp_type, 'other')

        national_id = normalize_digits(str(ws.cell(row=row_idx, column=3).value or '')).strip()
        phone = normalize_digits(str(ws.cell(row=row_idx, column=4).value or '')).strip()
        bank_name = str(ws.cell(row=row_idx, column=5).value or '').strip()
        account_number = normalize_digits(str(ws.cell(row=row_idx, column=6).value or '')).strip()
        raw_sheba = normalize_digits(str(ws.cell(row=row_idx, column=7).value or '')).strip()
        sheba_number = raw_sheba.upper().replace('IR', '').strip()

        account_code = normalize_digits(str(ws.cell(row=row_idx, column=8).value or '')).strip()

        active_val = str(ws.cell(row=row_idx, column=9).value or 'بله').strip().lower()
        is_active = active_val not in ['خیر', 'false', '0', 'no']

        lookup = {'name': name}
        if company_id is not None:
            lookup['company_id'] = company_id
        try:
            exists = Counterparty.objects.filter(**lookup).exists()
            if dry_run:
                if exists:
                    updated += 1
                else:
                    created += 1
            else:
                with transaction.atomic():
                    defaults = {
                        'counterparty_type': cp_type,
                        'national_id': national_id or None,
                        'phone': phone or None,
                        'bank_name': bank_name or None,
                        'account_number': account_number or None,
                        'sheba_number': sheba_number or None,
                        'account_code': account_code or None,
                        'is_active': is_active
                    }
                    cp, is_new = Counterparty.objects.update_or_create(
                        **lookup,
                        defaults=defaults
                    )
                    if is_new:
                        created += 1
                    else:
                        updated += 1
        except Exception as e:
            errors.append(f"ردیف {row_idx} ({name}): {str(e)}")

    return {
        'success': len(errors) == 0,
        'dry_run': dry_run,
        'summary': {
            'total_rows': created + updated + len(errors),
            'valid_count': created + updated,
            'error_count': len(errors),
            'created': created,
            'updated': updated,
            'skipped': len(errors)
        },
        'errors': [{'row': idx, 'message': err} for idx, err in enumerate(errors, 1)]
    }
