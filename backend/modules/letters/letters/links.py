"""
پیوند نامه به سند دیگر (ن۱۳). ماژول نام هیچ نوع سند ماژول دیگری را نمی‌آورد (نگهبان 57):
نوع از کاربر می‌آید و فهرست نوع‌های قابل پیوند از رجیستری هسته (`audit_entity_kinds` + `entity_resolver` + `can_view`).
"""
from platform_core.registry import can_view, company_of, contributions, resolve_entity, verify_summary

NO_ACCESS_TITLE_FA = 'سند پیوندشده (بی‌دسترسی)'


def link_kinds() -> list:
    """نوع‌هایی که هم شیء‌یاب دارند و هم قلاب دیدن؛ بی‌تکرار و به ترتیب ثبت."""
    seen, out = set(), []
    for item in contributions('audit_entity_kinds'):
        try:
            model_name, kind = item
        except (TypeError, ValueError):
            continue
        kind = str(kind)
        if kind in seen or not contributions(f'entity_resolver:{kind}') or not contributions(f'can_view:{kind}'):
            continue
        seen.add(kind)
        out.append({'kind': kind, 'model': str(model_name)})
    return out


def _title_for(kind, entity_id) -> str:
    summary = verify_summary(kind, entity_id) or {}
    number = str(summary.get('number') or '').strip()
    if number:
        return number[:300]
    obj = resolve_entity(kind, entity_id)
    return (str(obj) if obj is not None else f'{kind}#{entity_id}')[:300]


def validate_link(user, company_id, kind, entity_id):
    """
    پیوند پذیرفتنی: نوع ثبت‌شده، سند موجود از همان شرکت نامه، و دیدنی برای کاربر.
    خروجی (kind, entity_id, title) یا ValueError با پیام فارسی.
    """
    kind = str(kind or '').strip()
    entity_id = str(entity_id or '').strip()
    allowed = {k['kind'] for k in link_kinds()}
    if kind not in allowed or not entity_id:
        raise ValueError('نوع سند پیوند پشتیبانی نمی‌شود.')
    if company_of(kind, entity_id) != company_id or not can_view(user, kind, entity_id):
        # سند شرکت دیگر و سند نادیدنی یک پاسخ دارند (چیزی دربارهٔ وجودش لو نمی‌رود)
        raise ValueError('سند پیوند پیدا نشد یا در دسترس نیست.')
    return kind, entity_id, _title_for(kind, entity_id)


def link_payload(viewer, link) -> dict:
    visible = viewer is not None and can_view(viewer, link.entity_kind, link.entity_id)
    return {
        'id': link.pk,
        'entity_kind': link.entity_kind,
        'entity_id': link.entity_id if visible else None,
        'title': link.title_snapshot if visible else NO_ACCESS_TITLE_FA,
        'accessible': visible,
        'created_at': link.created_at,
    }
