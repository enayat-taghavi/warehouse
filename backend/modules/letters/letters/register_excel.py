"""
خروجی اکسل دفتر دبیرخانه (ل-ز، ن۱۶، AGENTS §3): ردیف ۱ عنوان فارسی، ردیف ۲ کلید فیلد با قلم کم‌رنگ،
freeze_panes روی A3 و زمان‌ها شمسی (YYYY/MM/DD HH:MM:SS) با ساعت محلی سرور. باطل‌شده‌ها هم می‌آیند.
"""
from urllib.parse import quote

import openpyxl
from django.http import HttpResponse
from django.utils import timezone

from common.date_utils import format_to_shamsi_str
from common.excel_utils import HEADER_FILL, HEADER_FONT, KEY_FONT, sanitize_excel_row

from .models import Letter

COLUMNS = (
    ('number_display', 'شماره'),
    ('registered_at', 'تاریخ ثبت'),
    ('kind', 'نوع'),
    ('subject', 'موضوع'),
    ('status', 'وضعیت'),
    ('confidentiality', 'محرمانگی'),
    ('external_number', 'شمارهٔ بیرونی'),
    ('author', 'نویسنده'),
)
KIND_FA = dict(Letter.KIND_CHOICES)
STATUS_FA = dict(Letter.STATUS_CHOICES)
CONF_FA = dict(Letter.CONFIDENTIALITY_CHOICES)


def _cell(row, key):
    value = row.get(key)
    if key == 'registered_at':
        return format_to_shamsi_str(timezone.localtime(value), include_time=True) if value else ''
    if key == 'kind':
        return str(KIND_FA.get(value, value))
    if key == 'status':
        return str(STATUS_FA.get(value, value))
    if key == 'confidentiality':
        return str(CONF_FA.get(value, value))
    if key == 'author':
        return (value or {}).get('name', '')
    return value or ''


def register_workbook_response(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Register'
    ws.sheet_view.rightToLeft = True
    ws.append([title for _key, title in COLUMNS])
    ws.append([key for key, _title in COLUMNS])
    for cell in ws[1]:
        cell.fill, cell.font = HEADER_FILL, HEADER_FONT
    for cell in ws[2]:
        cell.font = KEY_FONT
    for row in rows:
        ws.append(sanitize_excel_row([_cell(row, key) for key, _title in COLUMNS]))
    ws.freeze_panes = 'A3'
    for letter, width in zip('ABCDEFGH', (16, 20, 12, 40, 12, 12, 16, 20)):
        ws.column_dimensions[letter].width = width
    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    name = quote('دفتر-دبیرخانه.xlsx'.encode('utf-8'))
    response['Content-Disposition'] = f"attachment; filename=\"letters_register.xlsx\"; filename*=UTF-8''{name}"
    wb.save(response)
    return response
