"""
چاپ و صحت‌سنجی نامه (ن۱۷ طرح plan_letters.md، ل-ح) با قلاب‌های هسته؛ هسته عوض نمی‌شود.

- `printable:letters_letter`: فقط نامهٔ ثبت‌شده، ارسال‌شده یا بایگانی (نه پیش‌نویس، نه باطل، نه وارده که متنش اسکن است)
  و فقط برای کسی که نامه را می‌بیند؛ وگرنه None (= 404 بی‌نشت).
- عنوان برگ نوع نامه است، نه موضوع: عنوان در توکن QR خواناست و صفحهٔ صحت‌سنجی بی‌ورود است.
- امضاکننده فقط وقتی `signed=True` است که واقعاً امضا کرده و روش امضا الکترونیکی است؛ امضای زنده کادر خالی می‌گیرد.
- سربرگ A4/A5 از تنظیم شرکت. API چاپ اندازه را پس از قلاب با `dataclasses.replace` عوض می‌کند (که `__post_init__`
  را دوباره صدا می‌زند)؛ پس زیرکلاس `_LetterDocument` هر دو تصویر را نگه می‌دارد و برای اندازهٔ نهایی یکی را برمی‌دارد.
- مهر دبیرخانه: هسته جای مهر جدا ندارد؛ پس از ثبت، مهر روی تصویر سربرگ (زیر کادر شماره) نشانده می‌شود. بی‌سربرگ = بی‌مهر.
- پررنگ و تراز پاراگراف در قالب هسته پشتیبانی نمی‌شود و جدول‌ها پس از متن می‌آیند (چیدمان هسته).
"""
import io
import logging
from dataclasses import dataclass

from reports.document_pdf import DocTable, PrintableDocument, Signer, fa_digits

from .models import LETTER_ENTITY, SECRETARIAT_ENTITY, Letter, LetterRecipient, LetterSigner
from .settings_spec import (
    LETTERHEAD_A4_SETTING, LETTERHEAD_A5_SETTING, SECRETARIAT_STAMP_SETTING, SETTINGS_MODULE,
)

logger = logging.getLogger(__name__)

PRINTABLE_STATUSES = (Letter.STATUS_REGISTERED, Letter.STATUS_SENT, Letter.STATUS_ARCHIVED)
KIND_TITLES = {
    Letter.KIND_INTERNAL: 'نامهٔ داخلی',
    Letter.KIND_OUTGOING: 'نامهٔ صادره',
    Letter.KIND_INCOMING: 'نامهٔ وارده',
    Letter.KIND_MINUTES: 'صورت‌جلسه',
    Letter.KIND_CIRCULAR: 'بخشنامه',
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000


def is_printable(letter) -> bool:
    return letter.status in PRINTABLE_STATUSES and letter.kind != Letter.KIND_INCOMING and bool(letter.registered_at)


# ─── تصویرهای تنظیم شرکت (فقط روی سرور خوانده می‌شوند) ─────────────────────────────────────────

def _setting_attachment_bytes(company_id, spec):
    """
    بایت تصویر سربرگ یا مهر؛ فقط پیوست فعال `letters_secretariat` همان شرکت (شناسهٔ پیوست شرکت دیگر = هیچ).
    شناسهٔ کلید تنظیم اگر معتبر باشد برنده است؛ وگرنه تازه‌ترین پیوست با برچسب همان کلید (صفحهٔ تنظیمات تصویر را
    با برچسب بارگذاری یا جایگزین می‌کند و جایگزینی پیوست قبلی را بایگانی می‌کند).
    """
    from attachments.models import Attachment
    from settings_core.company_settings import get_company_setting
    own = Attachment.objects.filter(entity_kind=SECRETARIAT_ENTITY, entity_id=str(company_id),
                                    archived_at__isnull=True, status=Attachment.STATUS_ACCEPTED)
    att_id = get_company_setting(company_id, SETTINGS_MODULE, spec.key)
    att = None
    if isinstance(att_id, int) and not isinstance(att_id, bool) and att_id > 0:
        att = own.filter(pk=att_id).first()
    if att is None:
        att = own.filter(label=spec.key).order_by('-id').first()
    if att is None or not att.file:
        return None
    try:
        if getattr(att.file, 'size', 0) and att.file.size > MAX_IMAGE_BYTES:
            return None
        with att.file.open('rb') as f:
            data = f.read(MAX_IMAGE_BYTES + 1)
    except Exception:
        logger.warning('letters: setting image %s of company %s unreadable', spec.key, company_id)
        return None
    if not data or len(data) > MAX_IMAGE_BYTES:
        return None
    try:
        from PIL import Image
        width, height = Image.open(io.BytesIO(data)).size  # فقط سرآیند؛ بمب پیکسلی پیش از هر پردازش رد می‌شود
    except Exception:
        return None
    return data if width * height <= MAX_IMAGE_PIXELS else None


def _with_stamp(letterhead, stamp, size):
    """مهر دبیرخانه روی سربرگ، زیر کادر شماره در بالا-چپ؛ هر خطا = همان سربرگ بی‌مهر."""
    if not letterhead or not stamp:
        return letterhead
    try:
        from PIL import Image
        base = Image.open(io.BytesIO(letterhead)).convert('RGBA')
        mark = Image.open(io.BytesIO(stamp)).convert('RGBA')
        page_w_mm = 148 if size == 'A5' else 210
        px_per_mm = base.width / page_w_mm
        margin = (10 if size == 'A5' else 15) * px_per_mm
        box_h = (18 if size == 'A5' else 22) * px_per_mm  # کادر شماره، تاریخ و پیوست هسته
        target = (26 if size == 'A5' else 32) * px_per_mm
        mark.thumbnail((max(1, int(target)), max(1, int(target))))
        base.alpha_composite(mark, (int(margin), int(margin + box_h)))
        out = io.BytesIO()
        base.save(out, format='PNG')
        return out.getvalue()
    except Exception:
        logger.warning('letters: secretariat stamp could not be composited')
        return letterhead


@dataclass
class _LetterDocument(PrintableDocument):
    letterhead_a4: bytes | None = None
    letterhead_a5: bytes | None = None

    def __post_init__(self):
        super().__post_init__()
        if self.size == 'A5':
            self.letterhead_image = self.letterhead_a5 or self.letterhead_a4
        else:
            self.letterhead_image = self.letterhead_a4 or self.letterhead_a5


# ─── متن بلوکی (ن۱۴) ─────────────────────────────────────────────────────────────────────────

def _runs_text(runs) -> str:
    if isinstance(runs, str):
        return runs
    return ''.join(str(r.get('text') or '') for r in runs or [] if isinstance(r, dict))


def _body(blocks):
    """پاراگراف‌ها و فهرست‌ها ← paragraphs؛ جدول ساده ← DocTable (نخستین ردیف سربرگ جدول است)."""
    paragraphs, tables = [], []
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        kind = block.get('type')
        if kind == 'paragraph':
            text = _runs_text(block.get('runs'))
            if text.strip():
                paragraphs.append(text)
        elif kind == 'list':
            numbered = block.get('style') == 'ordered'
            for i, item in enumerate(block.get('items') or [], start=1):
                text = _runs_text(item)
                if text.strip():
                    paragraphs.append(f'{fa_digits(i)}. {text}' if numbered else f'• {text}')
        elif kind == 'table':
            rows = [[str(c or '') for c in row] for row in block.get('rows') or [] if isinstance(row, list)]
            cols = max((len(r) for r in rows), default=0)
            if not cols:
                continue
            rows = [r + [''] * (cols - len(r)) for r in rows]
            tables.append(DocTable(headers=rows[0], rows=rows[1:]))
    return paragraphs, tables


def _person(user) -> str:
    if user is None:
        return ''
    return (user.get_full_name() or '').strip() or user.get_username()


def _recipient_text(rcpt, sections) -> str:
    if rcpt.target_type == LetterRecipient.TARGET_USER:
        name = _person(rcpt.user)
    elif rcpt.target_type == LetterRecipient.TARGET_SECTION:
        name = sections.get(rcpt.section_id, '')
    elif rcpt.target_type == LetterRecipient.TARGET_PARTY:
        name = getattr(rcpt.party, 'name', '') or ''
    else:
        name = rcpt.name_text
    if rcpt.title_text:
        name = f'{name} ({rcpt.title_text})' if name else rcpt.title_text
    return name


def _recipients(letter):
    rows = list(letter.recipients.all())
    section_ids = {r.section_id for r in rows if r.section_id}
    sections = {}
    if section_ids:
        from companies.models import ProjectSection
        sections = dict(ProjectSection.objects.filter(pk__in=section_ids, project__company_id=letter.company_id)
                        .values_list('id', 'name'))
    to = [t for t in (_recipient_text(r, sections) for r in rows if r.role == LetterRecipient.ROLE_TO) if t]
    cc = [t for t in (_recipient_text(r, sections) for r in rows if r.role == LetterRecipient.ROLE_CC) if t]
    return to, cc


def _signers(letter):
    electronic = letter.sign_mode == Letter.SIGN_ELECTRONIC
    out = []
    for s in letter.signers.all():
        out.append(Signer(name=_person(s.user), role=s.title_text or '', user_id=s.user_id,
                          signed=electronic and s.status == LetterSigner.STATUS_SIGNED and s.signed_at is not None))
    return out


def _attachments_count(letter) -> int:
    from attachments.models import Attachment
    return Attachment.objects.filter(entity_kind=LETTER_ENTITY, entity_id=str(letter.pk),
                                     archived_at__isnull=True).count()


def printable_letter(user, entity_id):
    """قلاب printable:letters_letter؛ None = 404 (بی‌دسترسی، شرکت دیگر، ناموجود یا هنوز ثبت‌نشده)."""
    from .access import can_view_letter
    if not can_view_letter(user, entity_id):
        return None
    letter = (Letter.objects.select_related('sender_party')
              .prefetch_related('recipients__user', 'recipients__party', 'signers__user')
              .filter(pk=int(str(entity_id).strip())).first())
    if letter is None or not is_printable(letter):
        return None

    to, cc = _recipients(letter)
    info_pairs = [('موضوع', letter.subject or '—')]
    if to:
        info_pairs.append(('گیرنده', '، '.join(to)))
    if cc:
        info_pairs.append(('رونوشت', '، '.join(cc)))
    if letter.confidentiality != Letter.CONF_NORMAL:
        info_pairs.append(('محرمانگی', letter.get_confidentiality_display()))
    paragraphs, tables = _body(letter.body)

    a4 = _setting_attachment_bytes(letter.company_id, LETTERHEAD_A4_SETTING)
    a5 = _setting_attachment_bytes(letter.company_id, LETTERHEAD_A5_SETTING)
    if a4 or a5:
        stamp = _setting_attachment_bytes(letter.company_id, SECRETARIAT_STAMP_SETTING)
        a4, a5 = _with_stamp(a4, stamp, 'A4'), _with_stamp(a5, stamp, 'A5')

    return _LetterDocument(
        company_id=letter.company_id,
        title=KIND_TITLES.get(letter.kind, 'نامه'),
        number=letter.number_display,
        date=letter.registered_at,
        attachments_count=_attachments_count(letter),
        paragraphs=paragraphs,
        extra_tables=tables,
        info_pairs=info_pairs,
        signers=_signers(letter),
        letterhead_a4=a4,
        letterhead_a5=a5,
    )


# ─── صحت‌سنجی عمومی (O3) ──────────────────────────────────────────────────────────────────────

def letter_verify_summary(entity_id):
    """
    قلاب verify_summary:letters_letter. فقط شماره، تاریخ ثبت و وضعیت (نوع نامه عنوان توکن است و نام شرکت را هسته
    می‌آورد). محرمانه و سری: فقط شماره (صفحهٔ عمومی آن‌ها را اصلاً زنده نشان نمی‌دهد؛ این برای مصرف دیگر هم امن است).
    """
    from reports.document_pdf import format_doc_date
    try:
        pk = int(str(entity_id).strip())
    except (TypeError, ValueError):
        return {'exists': False}
    letter = (Letter.objects.filter(pk=pk)
              .only('id', 'company_id', 'number_display', 'registered_at', 'status', 'confidentiality').first())
    if letter is None:
        return {'exists': False}
    if letter.confidentiality != Letter.CONF_NORMAL:
        return {'exists': True, 'company_id': letter.company_id, 'number': letter.number_display}
    return {
        'exists': True,
        'company_id': letter.company_id,
        'number': letter.number_display,
        'date': format_doc_date(letter.registered_at) if letter.registered_at else '',
        'status': letter.get_status_display(),
    }
