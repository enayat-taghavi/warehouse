"""
خروجی PDF فارسی گزارش‌ساز — فقط sync و با سقف ردیف

رندر فارسی همان الگوی warehouses/label_pdf_generator.py است:
reshape (arabic_reshaper) + bidi (get_display) + فونت TTF ثبت‌شده.
فونت وزیرمتن داخل reports/fonts/ باندل شده؛ fallback به Tahoma ویندوز.

سقف‌ها محافظه‌کارانه‌اند چون درخواست sync است و پشت Cloudflare Tunnel
تایم‌اوت ~۱۰۰ ثانیه داریم؛ نتایج بزرگ‌تر باید از Excel استفاده کنند.
"""
import datetime as _dt
import io
import os
from decimal import Decimal

import arabic_reshaper
from bidi.algorithm import get_display
from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from .engine import ReportError

PDF_ROW_LIMIT = 2000
PDF_MAX_COLUMNS = 12

_FONTS_DIR = os.path.join(os.path.dirname(__file__), 'fonts')
_FONT_REGISTERED = False
_FONT_NAME = 'Helvetica'
_FONT_BOLD_NAME = 'Helvetica-Bold'


def _register_fonts():
    global _FONT_REGISTERED, _FONT_NAME, _FONT_BOLD_NAME
    if _FONT_REGISTERED:
        return
    candidates = [
        (os.path.join(_FONTS_DIR, 'Vazirmatn-Regular.ttf'),
         os.path.join(_FONTS_DIR, 'Vazirmatn-Bold.ttf'), 'Vazirmatn'),
        (r'C:\Windows\Fonts\tahoma.ttf', r'C:\Windows\Fonts\tahomabd.ttf', 'Tahoma'),
        (r'C:\Windows\Fonts\arial.ttf', r'C:\Windows\Fonts\arialbd.ttf', 'Arial'),
    ]
    for regular, bold, name in candidates:
        if not os.path.exists(regular):
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, regular))
            _FONT_NAME = name
            _FONT_BOLD_NAME = name
            if os.path.exists(bold):
                pdfmetrics.registerFont(TTFont(f'{name}-Bold', bold))
                _FONT_BOLD_NAME = f'{name}-Bold'
            _FONT_REGISTERED = True
            return
        except Exception:
            continue
    _FONT_REGISTERED = True  # تلاش شد؛ fallback به Helvetica (فارسی ناقص ولی بدون کرش)


def _rtl(text):
    """شکل‌دهی متن فارسی برای reportlab — الگوی label_pdf_generator."""
    try:
        return get_display(arabic_reshaper.reshape(str(text)))
    except Exception:
        return str(text)


def _jalali_now_str():
    now = timezone.localtime()
    try:
        import jdatetime
        return jdatetime.datetime.fromgregorian(datetime=now).strftime('%Y/%m/%d %H:%M')
    except ImportError:
        return now.strftime('%Y-%m-%d %H:%M')


def _fmt_number(v):
    if isinstance(v, int) or (isinstance(v, float) and float(v).is_integer()) or (
        isinstance(v, Decimal) and v % 1 == 0
    ):
        return f'{int(v):,}'
    return f'{float(v):,.3f}'.rstrip('0').rstrip('.')


def _fmt_datetime(v):
    if timezone.is_aware(v):
        v = timezone.localtime(v)
    try:
        import jdatetime
        j = jdatetime.datetime.fromgregorian(datetime=v)
        return j.strftime('%Y/%m/%d %H:%M') if isinstance(v, _dt.datetime) else j.strftime('%Y/%m/%d')
    except ImportError:
        return v.strftime('%Y-%m-%d %H:%M') if isinstance(v, _dt.datetime) else v.strftime('%Y-%m-%d')


def _fmt_date(v):
    try:
        import jdatetime
        return jdatetime.date.fromgregorian(date=v).strftime('%Y/%m/%d')
    except ImportError:
        return v.strftime('%Y-%m-%d')


def _cell_text(v):
    """متن نمایشی سلول — اعداد جداکننده هزارگان، تاریخ شمسی، بولین فارسی."""
    if v is None or v == '':
        return '—', False
    if isinstance(v, bool):
        return ('بله' if v else 'خیر'), True
    if isinstance(v, (int, float, Decimal)):
        return _fmt_number(v), False
    if isinstance(v, _dt.datetime):
        return _fmt_datetime(v), False
    if isinstance(v, _dt.date):
        return _fmt_date(v), False
    return str(v), True  # متن — نیاز به reshape/bidi


def sync_pdf_response(qs, columns, total, filename='report.pdf', report_name='گزارش'):
    """تولید PDF افقی A4 با جدول RTL. سقف‌ها اینجا اعمال می‌شوند (ReportError → 4xx فارسی)."""
    if total > PDF_ROW_LIMIT:
        raise ReportError(
            f'خروجی PDF حداکثر برای {PDF_ROW_LIMIT:,} ردیف ممکن است '
            f'(نتیجه فعلی {total:,} ردیف). برای نتایج بزرگ از خروجی Excel استفاده کنید.'
        )
    if len(columns) > PDF_MAX_COLUMNS:
        raise ReportError(
            f'تعداد ستون برای PDF زیاد است (حداکثر {PDF_MAX_COLUMNS}). فیلدهای کمتری انتخاب کنید.'
        )
    if not columns:
        raise ReportError('ستونی برای خروجی PDF وجود ندارد.')

    _register_fonts()

    cell_style = ParagraphStyle(
        'cell', fontName=_FONT_NAME, fontSize=8, leading=11,
        alignment=TA_CENTER, wordWrap='RTL',
    )
    header_style = ParagraphStyle(
        'header', fontName=_FONT_BOLD_NAME, fontSize=9, leading=12,
        alignment=TA_CENTER, wordWrap='RTL', textColor=colors.white,
    )
    title_style = ParagraphStyle(
        'title', fontName=_FONT_BOLD_NAME, fontSize=13, leading=18,
        alignment=TA_CENTER,
    )
    subtitle_style = ParagraphStyle(
        'subtitle', fontName=_FONT_NAME, fontSize=9, leading=13,
        alignment=TA_CENTER, textColor=colors.HexColor('#64748B'),
    )

    # RTL: اولین ستون سمت راست → ترتیب ستون‌ها معکوس می‌شود
    cols = list(reversed(columns))
    header = [Paragraph(_rtl(c['label']), header_style) for c in cols]

    data = [header]
    for row in qs.iterator(chunk_size=500):
        cells = []
        for c in cols:
            source_key = c.get('source') or c['key']
            text, needs_rtl = _cell_text(row.get(source_key))
            cells.append(Paragraph(_rtl(text) if needs_rtl else text, cell_style))
        data.append(cells)

    row_count = len(data) - 1
    if row_count == 0:
        empty_text = Paragraph(_rtl('هیچ داده‌ای برای این گزارش یافت نشد.'), cell_style)
        empty_cells = [empty_text] + ['' for _ in range(len(cols) - 1)]
        data.append(empty_cells)

    page_size = landscape(A4)
    margin = 12 * mm
    avail = page_size[0] - 2 * margin
    col_w = avail / len(cols)

    table = LongTable(data, colWidths=[col_w] * len(cols), repeatRows=1)
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
    ]
    if row_count > 0:
        style_commands.append(
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F1F5F9')])
        )
    else:
        style_commands.append(('SPAN', (0, 1), (-1, 1)))
        style_commands.append(('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#F8FAFC')))
    table.setStyle(TableStyle(style_commands))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=page_size,
        leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=margin,
        title=report_name,
    )
    doc.build([
        Paragraph(_rtl(report_name), title_style),
        Paragraph(_rtl(f'{_jalali_now_str()} — {row_count:,} ردیف'), subtitle_style),
        Spacer(1, 6),
        table,
    ])

    from urllib.parse import quote
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    encoded_filename = quote(filename.encode('utf-8'))
    response['Content-Disposition'] = f"attachment; filename=\"report.pdf\"; filename*=UTF-8''{encoded_filename}"
    return response
