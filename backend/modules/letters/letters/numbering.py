"""
پنج سری شمارهٔ نامه (ن۵ طرح plan_letters.md).

قالب پیش‌فرض «سال شمسی/پیشوند/ردیف»، مثل ۱۴۰۵/ص/۱۲۳. پیشوند پیش‌فرض داخل قالب است، چون هسته برای سری
بی‌تنظیم پیشوند خالی می‌گذارد؛ مدیر شرکت در «شماره‌گذاری اسناد» می‌تواند قالب را به {period}/{prefix}/{seq}
و پیشوند دلخواه عوض کند. کلید دوره خالی = سال شمسی (shamsi_year هسته).
"""
from numbering.registry import NumberSeriesSpec

from .models import Letter

SETTINGS_PERM = 'perm_letters_settings'

# (نوع نامه، عنوان سری، پیشوند پیش‌فرض)
_SERIES = (
    (Letter.KIND_INTERNAL, 'نامهٔ داخلی', 'د'),
    (Letter.KIND_OUTGOING, 'نامهٔ صادره', 'ص'),
    (Letter.KIND_INCOMING, 'نامهٔ وارده', 'و'),
    (Letter.KIND_MINUTES, 'صورت‌جلسه', 'صج'),
    (Letter.KIND_CIRCULAR, 'بخشنامه', 'ب'),
)


def series_key_for(kind: str) -> str:
    """کلید سری شمارهٔ یک نوع نامه، مثل letters.outgoing."""
    if kind not in dict(Letter.KIND_CHOICES):
        raise ValueError(f'نوع نامهٔ ناشناخته: {kind!r}')
    return f'letters.{kind}'


LETTER_NUMBER_SERIES = tuple(
    NumberSeriesSpec(
        key=series_key_for(kind), title_fa=title_fa, default_template=f'{{period}}/{prefix}/{{seq}}',
        manage_perm=SETTINGS_PERM,
    )
    for kind, title_fa, prefix in _SERIES
)
