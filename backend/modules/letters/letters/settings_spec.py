"""
کلیدهای تنظیم شرکت ماژول نامه (ن۱۲ طرح plan_letters.md)؛ نوشتن فقط با perm_letters_settings در همان شرکت.

سربرگ و مهر شناسهٔ پیوست تصویرند (پیوست با entity_kind='letters_secretariat'، همیشه روی سرور)؛ ۰ یعنی «تنظیم نشده».
سنجش اینکه شناسه واقعاً پیوست همان شرکت است در ل-ح انجام می‌شود.
"""
from settings_core.company_settings import CompanySettingSpec

SETTINGS_MODULE = 'letters'
SETTINGS_PERM = 'perm_letters_settings'
DEFAULT_DUE_DAYS = 7


def _spec(key, default, type_name, title_fa):
    return CompanySettingSpec(module=SETTINGS_MODULE, key=key, default=default, type=type_name, title_fa=title_fa,
                              perm=SETTINGS_PERM)


LETTERHEAD_A4_SETTING = _spec('letterhead_a4', 0, 'int', 'تصویر سربرگ A4')
LETTERHEAD_A5_SETTING = _spec('letterhead_a5', 0, 'int', 'تصویر سربرگ A5')
SECRETARIAT_STAMP_SETTING = _spec('secretariat_stamp', 0, 'int', 'تصویر مهر دبیرخانه')
DEFAULT_DUE_DAYS_SETTING = _spec('default_due_days', DEFAULT_DUE_DAYS, 'int', 'مهلت پیش‌فرض پاسخ (روز)')

LETTER_COMPANY_SETTINGS = (
    LETTERHEAD_A4_SETTING,
    LETTERHEAD_A5_SETTING,
    SECRETARIAT_STAMP_SETTING,
    DEFAULT_DUE_DAYS_SETTING,
)
