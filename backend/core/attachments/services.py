"""سابقهٔ دیدن سند (ص۱۰ طرح ۲.۶). ماژول‌ها از `platform_core.registry.record_entity_view` صدا می‌زنند."""
from datetime import timedelta

from django.utils import timezone

from .models import EntityViewLog

VIEW_LOG_WINDOW = timedelta(minutes=10)


def record_entity_view(user, kind, entity_id, company_id=None):
    """
    یک ردیف دیدن برای (کاربر، سند)؛ اگر همین کاربر در ۱۰ دقیقهٔ گذشته همین سند را دیده باشد چیزی نمی‌نویسد.
    خروجی: True اگر ردیف تازه نوشته شد. کاربر ناشناس یا سند بی‌نشانی نادیده گرفته می‌شود.
    """
    if user is None or not getattr(user, 'is_authenticated', False) or not kind or entity_id in (None, ''):
        return False
    entity_id = str(entity_id)[:64]
    kind = str(kind)[:50]
    since = timezone.now() - VIEW_LOG_WINDOW
    if EntityViewLog.objects.filter(user=user, entity_kind=kind, entity_id=entity_id, viewed_at__gte=since).exists():
        return False
    try:
        company_id = int(company_id) if company_id not in (None, '') else None
    except (TypeError, ValueError):
        company_id = None
    EntityViewLog.objects.create(user=user, entity_kind=kind, entity_id=entity_id, company_id=company_id)
    return True
