"""
اعلام سری‌های شماره از ماژول‌ها (ص۲ طرح ۲.۸).

هر ماژول با contribute('numbering_series', NumberSeriesSpec(...)) سری‌اش را اعلام می‌کند و هسته نام هیچ ماژولی را
نمی‌داند. اعلام بدشکل یا کلید تکراری نادیده گرفته و در لاگ ثبت می‌شود (اعلام نخست می‌ماند).
"""
import logging
import re
from dataclasses import dataclass
from typing import Callable, Optional

import jdatetime
from django.utils import timezone

from platform_core.registry import contributions

logger = logging.getLogger(__name__)

NUMBERING_POINT = 'numbering_series'
DEFAULT_TEMPLATE = '{period}/{seq}'
SERIES_KEY_RE = re.compile(r'^[a-z][a-z0-9_]*\.[a-z0-9_.]+$')  # پیشوند ماژول اجباری، مثل accounting.invoice


def shamsi_year(company_id, at) -> str:
    """کلید دورهٔ پیش‌فرض: سال خورشیدی زمان صدور به وقت محلی، مثل '1405'."""
    local = timezone.localtime(at) if timezone.is_aware(at) else at
    return str(jdatetime.date.fromgregorian(date=local.date()).year)


@dataclass(frozen=True)
class NumberSeriesSpec:
    key: str
    title_fa: str
    default_template: str = DEFAULT_TEMPLATE
    period_key: Optional[Callable] = None  # (company_id, at) -> str؛ خالی = shamsi_year
    manage_perm: str = ''  # مجوز تنظیم سری در همان شرکت؛ خالی = فقط مدیر کل

    def period_for(self, company_id, at) -> str:
        return str((self.period_key or shamsi_year)(company_id, at))


def series_specs() -> dict:
    """{key: spec} از همهٔ اعلام‌ها؛ بی‌کش تا تست و بارگذاری ماژول همیشه تازه دیده شود."""
    out = {}
    for spec in contributions(NUMBERING_POINT):
        if not (isinstance(spec, NumberSeriesSpec) and isinstance(spec.key, str) and SERIES_KEY_RE.match(spec.key)
                and spec.title_fa and '{seq}' in (spec.default_template or '')
                and (spec.period_key is None or callable(spec.period_key))):
            logger.warning('numbering: malformed series spec ignored: %r', spec)
            continue
        if spec.key in out:
            logger.warning('numbering: duplicate series key ignored: %s', spec.key)
            continue
        out[spec.key] = spec
    return out


def get_series_spec(series_key):
    """سری اعلام‌شده یا ValueError (سری اعلام‌نشده هرگز شماره نمی‌گیرد)."""
    spec = series_specs().get(series_key)
    if spec is None:
        raise ValueError(f'unknown numbering series: {series_key}')
    return spec


def can_manage_series(user, spec, company_id) -> bool:
    """همان منطق مجوز تنظیمات شرکت (can_write_company_setting) با manage_perm سری."""
    from settings_core.company_settings import has_company_perm
    return has_company_perm(user, spec.manage_perm, company_id)
