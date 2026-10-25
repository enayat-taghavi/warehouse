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
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
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
    head_style = ParagraphStyle('h', parent=cell_style, fontName=bold, alignment=TA_CENTER)
    sign_style = ParagraphStyle('s', fontName=font, fontSize=base - 1, leading=(base - 1) * 1.6, alignment=TA_CENTER)

    story = [_rtl_para(doc.title, title_style, content_w), Spacer(1, 4 * mm)]
    for text in doc.paragraphs or []:
        story.append(_rtl_para(text, body_style, content_w))
        story.append(Spacer(1, 2 * mm))

    if doc.table_headers:
        ncols = len(doc.table_headers)
        col_w = content_w / ncols
        pad = 4
        header = [_rtl_para(h, head_style, col_w - 2 * pad) for h in doc.table_headers]
        body = [[_rtl_para(_cell_text(v), cell_style, col_w - 2 * pad) for v in list(row)[:ncols]]
                + [''] * max(0, ncols - len(row)) for row in doc.table_rows or []]
        data = [list(reversed(r)) for r in [header] + body]  # ستون اول در راست
        table = Table(data, colWidths=[col_w] * ncols, repeatRows=1)
        table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), pad), ('RIGHTPADDING', (0, 0), (-1, -1), pad),
        ]))
        story += [Spacer(1, 2 * mm), table]

    if doc.signers:
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
        story += [Spacer(1, 8 * mm), sign_table]

    buf = io.BytesIO()
    bottom = margin + ((20 if small else 24) * mm if qr is not None else 0)
    template = SimpleDocTemplate(buf, pagesize=pagesize, rightMargin=margin, leftMargin=margin,
                                 topMargin=margin + header_h, bottomMargin=bottom,
                                 title=doc.number or 'document')
    template.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
