from django.apps import AppConfig


class LettersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'letters'
    verbose_name = 'نامه‌های شرکت'

    def ready(self):
        from platform_core.module_catalog import MODULE_CATALOG
        from platform_core.registry import contribute, register_module
        if 'letters' in MODULE_CATALOG:
            register_module(MODULE_CATALOG['letters'])

        from .hooks import (
            letter_company_id, letter_is_confidential, letter_is_locked, resolve_letter,
        )
        from .models import LETTER_ENTITY
        from .numbering import LETTER_NUMBER_SERIES
        from .settings_spec import LETTER_COMPANY_SETTINGS

        # قلاب‌های سند نامه (ن۱)؛ can_view، can_attach و گردش‌ها در ل-ج و ل-د
        contribute(f'entity_resolver:{LETTER_ENTITY}', resolve_letter)
        contribute(f'company_of:{LETTER_ENTITY}', letter_company_id)
        contribute(f'is_locked:{LETTER_ENTITY}', letter_is_locked)
        contribute(f'is_confidential:{LETTER_ENTITY}', letter_is_confidential)
        contribute('audit_entity_kinds', ('Letter', LETTER_ENTITY))
        # پنج سری شماره (ن۵) و کلیدهای تنظیم شرکت (ن۱۲)
        for _series in LETTER_NUMBER_SERIES:
            contribute('numbering_series', _series)
        for _setting in LETTER_COMPANY_SETTINGS:
            contribute('company_settings', _setting)
