"""
صدور و ابطال شمارهٔ سند (ص۳ تا ص۵ طرح ۲.۸).

allocate فقط داخل تراکنش ثبت نهایی ماژول صدا زده می‌شود؛ اگر آن تراکنش برگردد شماره هم برمی‌گردد و فاصله نمی‌افتد.
شمارنده با select_for_update قفل می‌شود تا دو ثبت هم‌زمان هرگز یک شماره نگیرند. شماره از کلاینت هرگز پذیرفته نمی‌شود.
"""
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import IssuedNumber, NumberCounter, NumberSeriesConfig
from .registry import get_series_spec

MAX_VOID_REASON = 500
MAX_PADDING = 12


@dataclass(frozen=True)
class SeriesSettings:
    template: str
    prefix: str
    seq_padding: int
    start_number: int


def format_display(template, period, prefix, seq, padding=0) -> str:
    """قالب با نشانه‌های {period}، {prefix} و {seq}؛ ارقام لاتین (نمایش فارسی کار فرانت و PDF است)."""
    padding = max(0, min(int(padding or 0), MAX_PADDING))
    text = str(template)
    text = text.replace('{period}', str(period)).replace('{prefix}', str(prefix or ''))
    return text.replace('{seq}', str(int(seq)).zfill(padding))


def series_settings(company_id, spec) -> SeriesSettings:
    """تنظیم ذخیره‌شدهٔ شرکت یا پیش‌فرض اعلام سری."""
    row = NumberSeriesConfig.objects.filter(company_id=company_id, series_key=spec.key).first()
    if row is None:
        return SeriesSettings(spec.default_template, '', 0, 1)
    return SeriesSettings(row.template or spec.default_template, row.prefix, row.seq_padding, max(1, row.start_number))


def _locked_counter(company_id, series_key, period):
    try:
        with transaction.atomic():
            NumberCounter.objects.get_or_create(company_id=company_id, series_key=series_key, period_key=period)
    except IntegrityError:
        pass  # ردیف را تراکنش هم‌زمان ساخت؛ همان را قفل می‌کنیم
    return NumberCounter.objects.select_for_update().get(company_id=company_id, series_key=series_key,
                                                         period_key=period)


def _entity_ref(entity_kind, entity_id):
    kind = str(entity_kind or '').strip()
    eid = str(entity_id if entity_id is not None else '').strip()
    if not kind or not eid or len(kind) > 50 or len(eid) > 64:
        raise ValueError('invalid entity reference')
    return kind, eid


def allocate(company_id, series_key, entity_kind, entity_id, user=None, at=None) -> IssuedNumber:
    """شمارهٔ بعدی سری برای سند؛ اگر سند در این سری شمارهٔ فعال دارد همان برمی‌گردد (تکرار امن صف)."""
    spec = get_series_spec(series_key)
    kind, eid = _entity_ref(entity_kind, entity_id)
    at = at or timezone.now()
    period = spec.period_for(company_id, at)
    with transaction.atomic():
        counter = _locked_counter(company_id, spec.key, period)
        # پس از قفل شمارنده: ثبت هم‌زمان همین سند پشت قفل می‌ماند و شمارهٔ فعالش را این‌جا می‌بیند
        existing = IssuedNumber.objects.filter(company_id=company_id, series_key=spec.key, entity_kind=kind, entity_id=eid,
                                               status=IssuedNumber.STATUS_ACTIVE).first()
        if existing is not None:
            return existing
        conf = series_settings(company_id, spec)
        seq = max(counter.last_seq + 1, conf.start_number)
        counter.last_seq = seq
        counter.save(update_fields=['last_seq'])
        user_id = user.pk if getattr(user, 'is_authenticated', False) else None
        return IssuedNumber.objects.create(
            company_id=company_id, series_key=spec.key, period_key=period, seq=seq,
            display=format_display(conf.template, period, conf.prefix, seq, conf.seq_padding),
            entity_kind=kind, entity_id=eid, issued_by_id=user_id,
        )


def next_preview(company_id, series_key, at=None) -> str:
    """شمارهٔ بعدی دورهٔ جاری فقط برای نمایش؛ چیزی رزرو و قفل نمی‌شود."""
    spec = get_series_spec(series_key)
    at = at or timezone.now()
    period = spec.period_for(company_id, at)
    last = (NumberCounter.objects.filter(company_id=company_id, series_key=spec.key, period_key=period)
            .values_list('last_seq', flat=True).first()) or 0
    conf = series_settings(company_id, spec)
    return format_display(conf.template, period, conf.prefix, max(last + 1, conf.start_number), conf.seq_padding)


def void(issued, reason, user=None) -> IssuedNumber:
    """ابطال با دلیل اجباری؛ ردیف هرگز پاک نمی‌شود و شمارنده کم نمی‌شود."""
    reason = str(reason or '').strip()
    if not reason or len(reason) > MAX_VOID_REASON:
        raise ValueError('void reason is required (max 500 chars)')
    with transaction.atomic():
        row = IssuedNumber.objects.select_for_update().get(pk=issued.pk)
        if row.status == IssuedNumber.STATUS_VOID:
            raise ValueError('number is already void')
        row.status = IssuedNumber.STATUS_VOID
        row.void_reason = reason
        row.voided_at = timezone.now()
        row.voided_by_id = user.pk if getattr(user, 'is_authenticated', False) else None
        row.save(update_fields=['status', 'void_reason', 'voided_at', 'voided_by'])
    return row
