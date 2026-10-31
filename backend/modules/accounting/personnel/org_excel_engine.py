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
# ص۸ طرح ۳.۱: نه ستون نخست همان ترتیب پیشین است تا قالب‌های قدیمی هم خوانده شوند؛ ستون‌های تازه پس از آن‌ها
COUNTERPARTY_COLUMNS = [
    {'title': 'نام طرف‌حساب', 'key': 'name', 'width': 26},
    {'title': 'نوع طرف‌حساب', 'key': 'counterparty_type', 'width': 18},
    {'title': 'کد ملی / شناسهٔ ملی', 'key': 'national_id', 'width': 20},
    {'title': 'تلفن تماس', 'key': 'phone', 'width': 18},
    {'title': 'نام بانک عامل', 'key': 'bank_name', 'width': 18},
    {'title': 'شماره حساب', 'key': 'account_number', 'width': 20},
    {'title': 'شماره شبا (۲۴ رقمی)', 'key': 'sheba_number', 'width': 28},
    {'title': 'کد حساب تفصیلی', 'key': 'account_code', 'width': 20},
    {'title': 'وضعیت فعال', 'key': 'is_active', 'width': 14},
    {'title': 'حقیقی / حقوقی', 'key': 'kind', 'width': 14},
    {'title': 'کد اقتصادی', 'key': 'economic_code', 'width': 18},
    {'title': 'موبایل', 'key': 'mobile', 'width': 18},
    {'title': 'نشانی', 'key': 'address', 'width': 36},
    {'title': 'تاریخ ثبت', 'key': 'created_at', 'width': 22},
]
KIND_TITLES = {'person': 'حقیقی', 'legal': 'حقوقی'}


def export_counterparties_excel(section_id=None, company_ids=None, user=None):
    """خروجی طرف‌حساب‌ها؛ شبا، شماره‌حساب و کد ملی حقیقی‌ها با همان قاعدهٔ پوشش API (ص۴ و ص۸ طرح ۳.۱)."""
    from .counterparty_services import can_view_sensitive, mask_tail
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'طرف‌حساب‌های مالی'
    _apply_2row_header(ws, COUNTERPARTY_COLUMNS, header_bg='059669')  # سبز زمردی

    qs = Counterparty.objects.select_related('party').prefetch_related('party__bank_accounts')
    if company_ids is not None:
        qs = qs.filter(party__company_id__in=company_ids)
    qs = qs.order_by('party__name', 'id')

    font_data = Font(name='B Nazanin', size=11)
    align_data = Alignment(horizontal='center', vertical='center')
    align_text = Alignment(horizontal='right', vertical='center')

    type_map = dict(Counterparty.TYPE_CHOICES)
    cache = {}

    for row_idx, cp in enumerate(qs, 3):
        party = cp.party
        full = user is None or can_view_sensitive(user, party, cache)
        guard = (lambda v: v) if full else mask_tail
        primary = next((acc for acc in party.bank_accounts.all() if acc.is_primary), None)
        national_id = party.national_id if party.kind == 'legal' else guard(party.national_id)
        values = [
            (party.name, align_text),
            (type_map.get(cp.counterparty_type, cp.counterparty_type), align_data),
            (national_id or '-', align_data),
            (party.phone or '-', align_data),
            ((primary.bank_name if primary else '') or '-', align_text),
            ((guard(primary.account_number) if primary else '') or '-', align_data),
            ((primary.sheba_number if primary else '') or '-', align_data),
            (cp.account_code or '-', align_data),
            ('بله' if cp.is_active else 'خیر', align_data),
            (KIND_TITLES.get(party.kind, party.kind), align_data),
            (party.economic_code or '-', align_data),
            (party.mobile or '-', align_data),
            (party.address or '-', align_text),
            (_format_datetime_shamsi(cp.created_at), align_data),
        ]
        for col, (value, align) in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            cell.alignment = align
            cell.font = font_data

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
    _apply_2row_header(ws, COUNTERPARTY_COLUMNS[:-1], header_bg='059669')

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

    for idx, title in enumerate(KIND_TITLES.values(), 1):
        ws_lists.cell(row=idx, column=4, value=title)

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

    # ۴. دراپ‌داون حقیقی / حقوقی (ستون J سطر ۳ تا ۵۰۰)
    dv_kind = DataValidation(type="list", formula1=f"Lists!$D$1:$D${len(KIND_TITLES)}", allow_blank=True)
    dv_kind.error = 'تنها گزینه‌های «حقیقی» یا «حقوقی» مجاز است.'
    dv_kind.errorTitle = 'ورودی نامعتبر'
    ws.add_data_validation(dv_kind)
    dv_kind.add("J3:J500")

    # ردیف ۳: ردیف نمونه اول (راننده / مالک خودرو)
    ws.cell(row=3, column=1, value='شرکت حمل‌ونقل پیشتاز')
    ws.cell(row=3, column=2, value='راننده / مالک خودرو')
    ws.cell(row=3, column=3, value='10101234567')
    ws.cell(row=3, column=4, value='09121111111')
    ws.cell(row=3, column=5, value='بانک ملت')
    ws.cell(row=3, column=6, value='0101111111001')
    ws.cell(row=3, column=7, value='450120000000101111111001')  # ۲۴ رقم عددی بدون IR
    ws.cell(row=3, column=8, value='110201')
    ws.cell(row=3, column=9, value='بله')
    ws.cell(row=3, column=10, value='حقوقی')
    ws.cell(row=3, column=11, value='411111111111')
    ws.cell(row=3, column=12, value='09121111112')
    ws.cell(row=3, column=13, value='تهران، خیابان آزادی')

    # ردیف ۴: ردیف نمونه دوم (تعمیرگاه و قطعات)
    ws.cell(row=4, column=1, value='تعمیرگاه مرکزی ایران')
    ws.cell(row=4, column=2, value='تعمیرگاه و قطعات')
    ws.cell(row=4, column=3, value='14002345678')
    ws.cell(row=4, column=4, value='02188888888')
    ws.cell(row=4, column=5, value='بانک ملی ایران')
    ws.cell(row=4, column=6, value='0202222222002')
    ws.cell(row=4, column=7, value='530170000000202222222002')
    ws.cell(row=4, column=8, value='110202')
    ws.cell(row=4, column=9, value='بله')
    ws.cell(row=4, column=10, value='حقوقی')

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
def _cell_text(ws, row_idx, col, digits=False):
    value = ws.cell(row=row_idx, column=col).value
    text = str(value if value is not None else '').strip()
    return normalize_digits(text).strip() if digits else text


def import_counterparties_from_excel(file_obj, dry_run=False, company_id=None, user=None):
    """
    خواندن و ثبت دسته‌جمعی طرف‌های حساب از اکسل با پشتیبانی از dry_run (ص۸ طرح ۳.۱).
    شرکت مقصد اجباری است؛ ردیف موجود با شناسهٔ ملی و بعد نام، هر دو فقط داخل همان شرکت، پیدا می‌شود.
    ساخت و ویرایش از راه counterparty_services (سابقه، تکرار امن، حساب بانکی اصلی).
    """
    from rest_framework import serializers as drf_serializers
    from contacts.services import infer_kind, national_id_error, normalize_national_id
    from .counterparty_services import create_counterparty, update_counterparty
    from .serializers_domains.treasury_audit import _clean_sheba

    def _result(created, updated, errors):
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

    if company_id is None:
        return _result(0, 0, ['شرکت مقصد درون‌ریزی مشخص نیست.'])
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

    type_titles = {
        'راننده': 'driver', 'مالک خودرو': 'driver', 'راننده / مالک خودرو': 'driver',
        'راننده/مالک خودرو': 'driver',
        'تعمیرگاه': 'repair_shop', 'تعمیرگاه و قطعات': 'repair_shop',
        'جایگاه سوخت': 'fuel_station', 'بنزین': 'fuel_station',
        'پیمانکار': 'contractor', 'خدماتی': 'contractor', 'پیمانکار خدماتی': 'contractor',
        'سایر': 'other', 'سایر اشخاص حقیقی/حقوقی': 'other'
    }
    kind_titles = {title: key for key, title in KIND_TITLES.items()}

    created = 0
    updated = 0
    errors = []

    # خواندن از ردیف ۳ به بعد (ردیف ۱ و ۲ هدر هستند)
    for row_idx in range(3, ws.max_row + 1):
        name = _cell_text(ws, row_idx, 1)
        if not name:
            continue

        cp_type = (_cell_text(ws, row_idx, 2) or 'other').lower()
        if cp_type not in dict(Counterparty.TYPE_CHOICES):
            cp_type = type_titles.get(cp_type, 'other')

        national_id = normalize_national_id(_cell_text(ws, row_idx, 3, digits=True))
        raw_kind = _cell_text(ws, row_idx, 10)
        kind = infer_kind(national_id, kind_titles.get(raw_kind, raw_kind.lower() or None))
        active_val = (_cell_text(ws, row_idx, 9) or 'بله').lower()
        party_data = {
            'name': name,
            'kind': kind,
            'national_id': national_id,
            'phone': _cell_text(ws, row_idx, 4, digits=True),
            'economic_code': _cell_text(ws, row_idx, 11, digits=True),
            'mobile': _cell_text(ws, row_idx, 12, digits=True),
            'address': _cell_text(ws, row_idx, 13),
        }
        role_data = {
            'counterparty_type': cp_type,
            'account_code': _cell_text(ws, row_idx, 8, digits=True) or None,
            'is_active': active_val not in ['خیر', 'false', '0', 'no'],
        }
        bank = {
            'bank_name': _cell_text(ws, row_idx, 5),
            'account_number': _cell_text(ws, row_idx, 6, digits=True),
            'sheba_number': _cell_text(ws, row_idx, 7, digits=True),
        }
        try:
            error = national_id_error(kind, national_id)
            if error:
                raise ValueError(error)
            bank['sheba_number'] = _clean_sheba(bank['sheba_number'])
        except drf_serializers.ValidationError as e:
            errors.append(f"ردیف {row_idx} ({name}): {' '.join(str(m) for m in e.detail)}")
            continue
        except ValueError as e:
            errors.append(f"ردیف {row_idx} ({name}): {e}")
            continue
        bank = {k: v for k, v in bank.items() if v}

        existing = None
        if national_id:
            existing = Counterparty.objects.select_related('party').filter(
                party__company_id=company_id, party__national_id=national_id).first()
        if existing is None:
            existing = Counterparty.objects.select_related('party').filter(
                party__company_id=company_id, party__name=name).order_by('id').first()
        try:
            if dry_run:
                if existing:
                    updated += 1
                else:
                    created += 1
            else:
                with transaction.atomic():
                    if existing:
                        if national_id and existing.party.national_id and existing.party.national_id != national_id:
                            raise ValueError('شناسهٔ ملی این ردیف با طرف هم‌نام موجود فرق دارد.')
                        update_counterparty(existing, party_data, role_data, bank, user)
                        updated += 1
                    else:
                        rows = [{**bank, 'is_primary': True}] if bank.get('sheba_number') else []
                        _cp, was_existing = create_counterparty(company_id, party_data, role_data, rows, user,
                                                                details={'source': 'excel_import'})
                        if was_existing:
                            updated += 1
                        else:
                            created += 1
        except Exception as e:
            errors.append(f"ردیف {row_idx} ({name}): {str(e)}")

    return _result(created, updated, errors)
