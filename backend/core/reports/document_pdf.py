"""
قالب PDF سند تک‌برگی (ص۱، ص۴، ص۵ و ص۶ طرح ۲.۷).

ماژول دادهٔ سند را با `contribute('printable:<kind>', fn)` می‌دهد؛ `fn(user, entity_id)` یک `PrintableDocument`
یا `None` برمی‌گرداند (رجیستری `printable_document`). هسته نام هیچ ماژولی را نمی‌داند.

- سربرگ: تصویر سربرگ کامل اگر ماژول بدهد، وگرنه لوگو و نام شرکت؛ کادر شماره، تاریخ و پیوست در بالا-چپ.
- امضا و مهر: تصویر فقط وقتی کشیده می‌شود که `signer.signed` صریحاً True باشد و پیوست فعال
  (`entity_kind='user'`، برچسب `signature`/`stamp`) وجود داشته باشد؛ فایل روی سرور خوانده می‌شود و نشانی‌اش
  هرگز به کاربر داده نمی‌شود. بقیه = کادر خالی برای امضای زنده.
- QR: نشانی `/verify/<token>`؛ توکن با `django.core.signing` (بی‌انقضا) امضا می‌شود. امضا رمزنگاری نیست، پس
  عنوان سند محرمانه در توکن نمی‌آید.
"""
import datetime as _dt
import io
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from xml.sax.saxutils import escape

import arabic_reshaper
from django.core import signing
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib import colors

from . import pdf as _pdf

logger = logging.getLogger(__name__)

VERIFY_SALT = 'document-verify'
SIGNER_IMAGE_LABELS = ('signature', 'stamp')
MAX_IMAGE_BYTES = 5 * 1024 * 1024
_FA_DIGITS = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


@dataclass
class Signer:
    name: str
    role: str = ''
    user_id: int | None = None
    signed: bool = False  # ماژول از سابقهٔ گردش کار همین سند می‌دهد


@dataclass
class DocTable:
    title: str = ''
    headers: list = field(default_factory=list)
    rows: list = field(default_factory=list)
    col_widths: list = field(default_factory=list)
    center_cols: list = field(default_factory=list)

    def __post_init__(self):
        if not self.col_widths and self.headers == ['ردیف', 'تاریخ', 'مبلغ', 'روش', 'شمارهٔ پیگیری']:
            self.col_widths = [0.6, 1.4, 2, 1.6, 2]
            self.center_cols = [0, 1]


@dataclass
class PrintableDocument:
    company_id: int | None
    title: str
    number: str = ''
    date: object = None  # date/datetime (شمسی می‌شود) یا متن آماده
    attachments_count: int = 0
    size: str = 'A4'
    paragraphs: list = field(default_factory=list)
    table_headers: list = field(default_factory=list)
    table_rows: list = field(default_factory=list)
    signers: list = field(default_factory=list)
    letterhead_image: bytes | None = None
    verify_url: str = ''  # خالی بماند تا API چاپ توکن را بسازد؛ ماژولی که خودش می‌دهد، محرمانگی را خودش رعایت کند
    info_pairs: list = field(default_factory=list)
    totals: list = field(default_factory=list)
    extra_tables: list = field(default_factory=list)
    table_col_widths: list = field(default_factory=list)
    table_center_cols: list = field(default_factory=list)

    def __post_init__(self):
        if not self.table_col_widths and self.table_headers == ['ردیف', 'شرح', 'سرفصل هزینه', 'تعداد', 'واحد', 'فی', 'مبلغ']:
            self.table_col_widths = [0.6, 3.2, 1.7, 0.8, 0.9, 1.6, 1.8]
            self.table_center_cols = [0, 3, 4]


def fa_digits(value) -> str:
    return str(value).translate(_FA_DIGITS)


def format_doc_date(value) -> str:
    if value in (None, ''):
        return ''
    if isinstance(value, _dt.datetime):
        return fa_digits(_pdf._fmt_datetime(value).split(' ')[0])
    if isinstance(value, _dt.date):
        return fa_digits(_pdf._fmt_date(value))
    return fa_digits(value)


# ─── توکن صحت‌سنجی ─────────────────────────────────────────────────────────────────────────────

def verify_token(kind, entity_id, number, *, company_id=None, title='', date='', confidential=False) -> str:
    """توکن بی‌انقضای QR. عنوان سند محرمانه در آن نمی‌آید (محتوای توکن خواناست، فقط امضا دارد)."""
    payload = {'k': str(kind), 'i': str(entity_id), 'n': str(number or '')}
    if company_id is not None:
        payload['c'] = int(company_id)
    if not confidential:
        payload['t'] = str(title or '')[:200]
        payload['d'] = str(date or '')[:20]
    return signing.dumps(payload, salt=VERIFY_SALT, compress=True)


def read_verify_token(token):
    """خروجی dict یا None (توکن نامعتبر یا دست‌کاری‌شده)."""
    if not token or len(token) > 2048:
        return None
    try:
        data = signing.loads(token, salt=VERIFY_SALT)
    except (signing.BadSignature, ValueError, TypeError):
        return None
    if not isinstance(data, dict) or not data.get('k') or not data.get('i'):
        return None
    return data


# ─── متن راست‌به‌چپ ────────────────────────────────────────────────────────────────────────────

def _reshape(text):
    try:
        return arabic_reshaper.reshape(str(text))
    except Exception:
        return str(text)


def _rtl_lines(text, font, size, width):
    """شکستن سطر روی متن منطقی (پیش از bidi) تا ترتیب سطرهای چندخطی درست بماند؛ خروجی سطرهای دیداری."""
    out = []
    for raw in str(text).splitlines() or ['']:
        line = ''
        for word in raw.split():
            candidate = f'{line} {word}' if line else word
            if not line or stringWidth(_reshape(candidate), font, size) <= width:
                line = candidate
            else:
                out.append(line)
                line = word
        out.append(line)
    return [_pdf._rtl(line) if line else '' for line in out]


def _rtl_para(text, style, width):
    lines = _rtl_lines(text, style.fontName, style.fontSize, width)
    return Paragraph('<br/>'.join(escape(line) for line in lines) or '&nbsp;', style)


def _cell_text(value):
    if value is None or value == '':
        return '—'
    if isinstance(value, bool):
        return 'بله' if value else 'خیر'
    if isinstance(value, (int, float, Decimal)):
        return fa_digits(_pdf._fmt_number(value))
    if isinstance(value, (_dt.date, _dt.datetime)):
        return format_doc_date(value)
    return str(value)


# ─── تصویرها (فقط روی سرور خوانده می‌شوند) ─────────────────────────────────────────────────────

def _read_field_bytes(file_field):
    try:
        if not file_field or not file_field.name:
            return None
        if getattr(file_field, 'size', 0) and file_field.size > MAX_IMAGE_BYTES:
            return None
        with file_field.open('rb') as f:
            data = f.read(MAX_IMAGE_BYTES + 1)
        return data if data and len(data) <= MAX_IMAGE_BYTES else None
    except Exception:
        return None


def _image_reader(data):
    if not data:
        return None
    try:
        reader = ImageReader(io.BytesIO(data))
        reader.getSize()
        return reader
    except Exception:
        return None


def signer_images(signer) -> list:
    """تصویر امضا و مهر یک امضاکننده؛ فقط وقتی همین سند را تأیید کرده (signed صریحاً True)."""
    if signer.signed is not True or not signer.user_id:
        return []
    from attachments.models import Attachment
    images = []
    for label in SIGNER_IMAGE_LABELS:
        att = (Attachment.objects
               .filter(entity_kind='user', entity_id=str(signer.user_id), label=label,
                       archived_at__isnull=True, status=Attachment.STATUS_ACCEPTED)
               .order_by('-id').first())
        if att is None:
            continue
        data = _read_field_bytes(att.file)
        if _image_reader(data) is not None:
            images.append(data)
    return images


def _company(company_id):
    if not company_id:
        return None
    from companies.models import Company
    return Company.objects.filter(pk=company_id).only('id', 'name', 'logo').first()


# ─── رندر ──────────────────────────────────────────────────────────────────────────────────────

def _qr_image(url):
    import qrcode
    qr = qrcode.QRCode(border=1, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(url)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color='black', back_color='white').save(buf, format='PNG')
    return ImageReader(io.BytesIO(buf.getvalue()))


def _fit_image(data, max_w, max_h):
    reader = _image_reader(data)
    if reader is None:
        return None
    w, h = reader.getSize()
    scale = min(max_w / w, max_h / h)
    return Image(io.BytesIO(data), width=w * scale, height=h * scale)


def _doc_table(headers, rows, content_w, col_widths=None, center_cols=None, cell_style=None, head_style=None):
    if not headers:
        return Table([[]])
    ncols = len(headers)
    col_widths = list(col_widths or [])
    center_cols = set(center_cols or [])

    if not col_widths or len(col_widths) != ncols or sum(col_widths) <= 0:
        logical_widths = [content_w / ncols] * ncols
    else:
        total_w = sum(col_widths)
        logical_widths = [content_w * (w / total_w) for w in col_widths]

    col_widths_rev = list(reversed(logical_widths))

    if cell_style is None:
        _pdf._register_fonts()
        font = _pdf._FONT_NAME
        cell_style = ParagraphStyle('c_default', fontName=font, fontSize=9, leading=14.4, alignment=TA_RIGHT)
    if head_style is None:
        _pdf._register_fonts()
        bold = _pdf._FONT_BOLD_NAME
        head_style = ParagraphStyle('h_default', parent=cell_style, fontName=bold, alignment=TA_CENTER)

    center_style = ParagraphStyle('c_center', parent=cell_style, alignment=TA_CENTER)

    pad_h = 4
    header_cells = [
        _rtl_para(h, head_style, max(1, logical_widths[j] - 2 * pad_h))
        for j, h in enumerate(headers)
    ]

    body_cells = []
    for row in rows or []:
        row_list = list(row)
        r_cells = []
        for j in range(ncols):
            if j < len(row_list):
                val = row_list[j]
                st = center_style if j in center_cols else cell_style
                w = max(1, logical_widths[j] - 2 * pad_h)
                r_cells.append(_rtl_para(_cell_text(val), st, w))
            else:
                r_cells.append('')
        body_cells.append(r_cells)

    data = [list(reversed(r)) for r in [header_cells] + body_cells]
    table = Table(data, colWidths=col_widths_rev, repeatRows=1)

    table_style = [
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), pad_h),
        ('RIGHTPADDING', (0, 0), (-1, -1), pad_h),
    ]
    for r in range(2, len(data), 2):
        table_style.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor('#f8fafc')))

    table.setStyle(TableStyle(table_style))
    return table


def _info_box(pairs, content_w, base, font, bold):
    w0 = content_w * (1.1 / 6.0)
    w1 = content_w * (1.9 / 6.0)
    w2 = content_w * (1.1 / 6.0)
    w3 = content_w * (1.9 / 6.0)
    col_widths = [w3, w2, w1, w0]

    pad_h = 4
    info_label_style = ParagraphStyle(
        'info_lbl',
        fontName=bold,
        fontSize=base - 1,
        leading=(base - 1) * 1.5,
        textColor=colors.HexColor('#475569'),
        alignment=TA_RIGHT,
    )
    info_val_style = ParagraphStyle(
        'info_val',
        fontName=font,
        fontSize=base - 1,
        leading=(base - 1) * 1.5,
        alignment=TA_RIGHT,
    )

    table_rows = []
    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]

    for row_idx, i in enumerate(range(0, len(pairs), 2)):
        p1 = pairs[i]
        p2 = pairs[i + 1] if i + 1 < len(pairs) else None

        p1_label = _rtl_para(str(p1[0] or ''), info_label_style, max(1, w0 - 2 * pad_h))
        p1_val = _rtl_para(_cell_text(p1[1]), info_val_style, max(1, w1 - 2 * pad_h))
        style_cmds.append(('BACKGROUND', (3, row_idx), (3, row_idx), colors.HexColor('#f1f5f9')))

        if p2 is not None:
            p2_label = _rtl_para(str(p2[0] or ''), info_label_style, max(1, w2 - 2 * pad_h))
            p2_val = _rtl_para(_cell_text(p2[1]), info_val_style, max(1, w3 - 2 * pad_h))
            style_cmds.append(('BACKGROUND', (1, row_idx), (1, row_idx), colors.HexColor('#f1f5f9')))
        else:
            p2_label = ''
            p2_val = ''

        table_rows.append([p2_val, p2_label, p1_val, p1_label])

    table = Table(table_rows, colWidths=col_widths)
    table.setStyle(TableStyle(style_cmds))
    return table


def _totals_box(totals, content_w, base, font, bold):
    box_w = content_w * 0.5
    w_col = box_w / 2.0
    pad_h = 4
    w_text = max(1, w_col - 2 * pad_h)

    lbl_style_normal = ParagraphStyle(
        'tot_lbl_n', fontName=font, fontSize=base - 1, leading=(base - 1) * 1.5, alignment=TA_RIGHT
    )
    val_style_normal = ParagraphStyle(
        'tot_val_n', fontName=font, fontSize=base - 1, leading=(base - 1) * 1.5, alignment=TA_RIGHT
    )
    lbl_style_emp = ParagraphStyle(
        'tot_lbl_e', fontName=bold, fontSize=base - 1, leading=(base - 1) * 1.5, alignment=TA_RIGHT
    )
    val_style_emp = ParagraphStyle(
        'tot_val_e', fontName=bold, fontSize=base - 1, leading=(base - 1) * 1.5, alignment=TA_RIGHT
    )

    rows = []
    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]

    for r_idx, item in enumerate(totals):
        label = item[0]
        val = item[1]
        emp = bool(item[2]) if len(item) > 2 else False

        lbl_st = lbl_style_emp if emp else lbl_style_normal
        val_st = val_style_emp if emp else val_style_normal

        lbl_para = _rtl_para(str(label or ''), lbl_st, w_text)
        val_para = _rtl_para(_cell_text(val), val_st, w_text)

        rows.append([val_para, lbl_para])

        if emp:
            style_cmds.append(('BACKGROUND', (0, r_idx), (1, r_idx), colors.HexColor('#e2e8f0')))
        else:
            style_cmds.append(('BACKGROUND', (1, r_idx), (1, r_idx), colors.HexColor('#f1f5f9')))

    table = Table(rows, colWidths=[w_col, w_col], hAlign='LEFT')
    table.setStyle(TableStyle(style_cmds))
    return table


def render_document_pdf(doc: PrintableDocument) -> bytes:
    _pdf._register_fonts()
    font, bold = _pdf._FONT_NAME, _pdf._FONT_BOLD_NAME
    small = doc.size == 'A5'
    pagesize = A5 if small else A4
    page_w, page_h = pagesize
    margin = (10 if small else 15) * mm
    header_h = (26 if small else 32) * mm
    base = 9 if small else 11
    content_w = page_w - 2 * margin - 12  # حاشیهٔ داخلی ۶ نقطه‌ای Frame در هر طرف
    block_space = (3 if small else 4) * mm

    company = _company(doc.company_id)
    company_name = company.name if company else ''
    logo = _image_reader(_read_field_bytes(company.logo)) if company is not None and company.logo else None
    letterhead = _image_reader(doc.letterhead_image)
    qr = _qr_image(doc.verify_url) if doc.verify_url else None

    def on_page(canvas, _doc):
        canvas.saveState()
        if letterhead is not None:
            canvas.drawImage(letterhead, 0, 0, width=page_w, height=page_h, preserveAspectRatio=False, mask='auto')
        else:
            top = page_h - margin
            x_right = page_w - margin
            logo_size = header_h - 8 * mm
            if logo is not None:
                canvas.drawImage(logo, x_right - logo_size, top - logo_size, width=logo_size, height=logo_size,
                                 preserveAspectRatio=True, anchor='ne', mask='auto')
                x_right -= logo_size + 3 * mm
            if company_name:
                canvas.setFont(bold, base + 3)
                canvas.drawRightString(x_right, top - logo_size / 2 - 2, _pdf._rtl(company_name))
            canvas.setStrokeColor(colors.HexColor('#94a3b8'))
            canvas.line(margin, page_h - margin - header_h + 3 * mm, page_w - margin, page_h - margin - header_h + 3 * mm)
        # کادر شماره، تاریخ و پیوست در بالا-چپ
        box_w, line_h = (42 if small else 52) * mm, (base + 4)
        box_x, box_top = margin, page_h - margin
        rows = [('شماره', fa_digits(doc.number or '—')), ('تاریخ', format_doc_date(doc.date) or '—'),
                ('پیوست', fa_digits(doc.attachments_count) if doc.attachments_count else _pdf._rtl('ندارد'))]
        canvas.setStrokeColor(colors.HexColor('#64748b'))
        canvas.rect(box_x, box_top - line_h * len(rows) - 4, box_w, line_h * len(rows) + 4)
        canvas.setFont(font, base)
        for i, (label, value) in enumerate(rows):
            y = box_top - (i + 1) * line_h
            label_txt = _pdf._rtl(f'{label}:')
            x = box_x + box_w - 3 * mm
            canvas.drawRightString(x, y, label_txt)
            # مقدار بی bidi کشیده می‌شود تا شماره‌ای مثل ۱۴۰۴-۱۷ وارونه نشود
            canvas.drawRightString(x - stringWidth(label_txt, font, base) - 3, y, value)
        if qr is not None:
            q = (18 if small else 22) * mm
            canvas.drawImage(qr, margin, margin - 2 * mm, width=q, height=q)
            canvas.setFont(font, base - 3)
            canvas.drawString(margin + q + 1 * mm, margin + 1 * mm, _pdf._rtl('صحت‌سنجی سند'))
        canvas.restoreState()

    title_style = ParagraphStyle('t', fontName=bold, fontSize=base + 4, leading=base + 10, alignment=TA_CENTER)
    body_style = ParagraphStyle('b', fontName=font, fontSize=base, leading=base * 1.9, alignment=TA_RIGHT)
    cell_style = ParagraphStyle('c', fontName=font, fontSize=base - 1, leading=(base - 1) * 1.6, alignment=TA_RIGHT)
    head_style = ParagraphStyle('h', parent=cell_style, fontName=bold, fontSize=base - 2, leading=(base - 2) * 1.4, alignment=TA_CENTER)
    sign_style = ParagraphStyle('s', fontName=font, fontSize=base - 1, leading=(base - 1) * 1.6, alignment=TA_CENTER)

    story = [_rtl_para(doc.title, title_style, content_w), Spacer(1, block_space)]

    if doc.info_pairs:
        story.append(_info_box(doc.info_pairs, content_w, base, font, bold))
        story.append(Spacer(1, block_space))

    if doc.paragraphs:
        for text in doc.paragraphs:
            story.append(_rtl_para(text, body_style, content_w))
            story.append(Spacer(1, 2 * mm))
        if story and isinstance(story[-1], Spacer):
            story[-1] = Spacer(1, block_space)

    if doc.table_headers:
        table = _doc_table(
            doc.table_headers,
            doc.table_rows or [],
            content_w,
            doc.table_col_widths,
            doc.table_center_cols,
            cell_style=cell_style,
            head_style=head_style,
        )
        story.append(table)
        story.append(Spacer(1, block_space))

    if doc.totals:
        totals_box = _totals_box(doc.totals, content_w, base, font, bold)
        story.append(KeepTogether([totals_box]))
        story.append(Spacer(1, block_space))

    extra_title_style = ParagraphStyle(
        'et', parent=cell_style, fontName=bold, fontSize=base, leading=base * 1.5, alignment=TA_RIGHT
    )
    for t in doc.extra_tables or []:
        if t.title:
            story.append(_rtl_para(t.title, extra_title_style, content_w))
            story.append(Spacer(1, 2 * mm))
        t_elem = _doc_table(
            t.headers,
            t.rows or [],
            content_w,
            t.col_widths,
            t.center_cols,
            cell_style=cell_style,
            head_style=head_style,
        )
        story.append(t_elem)
        story.append(Spacer(1, block_space))

    if doc.signers:
        if story and isinstance(story[-1], Spacer):
            story.pop()
        per_row = 3 if small else 4
        cell_w = content_w / per_row
        img_h = (16 if small else 22) * mm
        cells = []
        for signer in doc.signers:
            parts = []
            images = [_fit_image(d, (cell_w - 6 * mm) / 2, img_h) for d in signer_images(signer)]
            images = [img for img in images if img is not None]
            parts.append(Table([images], rowHeights=[img_h]) if images else Spacer(1, img_h))
            parts.append(_rtl_para(signer.name or '', sign_style, cell_w - 14))
            if signer.role:
                parts.append(_rtl_para(signer.role, sign_style, cell_w - 14))
            cells.append(parts)
        rows = [cells[i:i + per_row] for i in range(0, len(cells), per_row)]
        rows = [list(reversed(r + [''] * (per_row - len(r)))) for r in rows]  # نفر اول در راست
        sign_table = Table(rows, colWidths=[cell_w] * per_row)
        sign_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
        story.append(KeepTogether([Spacer(1, 8 * mm), sign_table]))

    buf = io.BytesIO()
    bottom = margin + ((20 if small else 24) * mm if qr is not None else 0)
    template = SimpleDocTemplate(buf, pagesize=pagesize, rightMargin=margin, leftMargin=margin,
                                 topMargin=margin + header_h, bottomMargin=bottom,
                                 title=doc.number or 'document')
    template.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
