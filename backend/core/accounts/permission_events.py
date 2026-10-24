"""
رویداد بلادرنگ «مجوزهای کاربر عوض شد» (طرح ۲.۲، ق۴ و درس ا۱).

شکل رویداد (همان قرارداد NotificationConsumer.send_notification):
    {'type': 'send_notification', 'type_str': 'permissions_updated',
     'user_id': <شناسهٔ کاربر یا None>, 'reason': 'bundle'|'role'|'override'|'assignment', 'message': ''}
- به کانال شخصی `user_{id}` هر کاربر اثرپذیرفته، با user_id همان کاربر (فرانت مجوزهایش را دوباره می‌خواند)؛
- به کانال `company_{cid}_notifications` شرکت‌های اثرپذیرفته برای صفحهٔ کاربران، با company_id همان شرکت
  (و user_id اگر فقط یک کاربر اثر پذیرفته، وگرنه None).
- هرگز به کانال عمومی `global_notifications` نمی‌رود.
مجموعهٔ کاربران و شرکت‌ها را فراخوان با تعداد ثابتی پرس‌وجو می‌سازد (توابع *_targets)؛ ارسال پس از commit است.
"""
import logging

from django.db import transaction

logger = logging.getLogger(__name__)

EVENT_TYPE = 'permissions_updated'
REASONS = ('bundle', 'role', 'override', 'assignment')
_FORBIDDEN_GROUPS = frozenset({'global_notifications'})


def permission_event_messages(user_ids, company_ids, reason):
    """[(group, payload)] رویدادهای ارسالی؛ تابع خالص برای تست (هیچ گروه عمومی در آن نیست)."""
    if reason not in REASONS:
        raise ValueError(f'reason نامعتبر: {reason!r}')
    user_ids = sorted({int(u) for u in user_ids if u})
    company_ids = sorted({int(c) for c in company_ids if c})
    single = user_ids[0] if len(user_ids) == 1 else None
    out = []
    for uid in user_ids:
        out.append((f'user_{uid}', {
            'type': 'send_notification', 'type_str': EVENT_TYPE,
            'user_id': uid, 'reason': reason, 'message': '',
        }))
    for cid in company_ids:
        out.append((f'company_{cid}_notifications', {
            'type': 'send_notification', 'type_str': EVENT_TYPE,
            'user_id': single, 'reason': reason, 'company_id': cid, 'message': '',
        }))
    assert not any(group in _FORBIDDEN_GROUPS for group, _ in out)
    return out


def _send(messages):
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        for group, payload in messages:
            async_to_sync(channel_layer.group_send)(group, payload)
    except Exception as exc:  # رویداد بلادرنگ نباید ذخیرهٔ اصلی را بشکند
        logger.warning(f'[WebSocket] Error broadcasting permissions_updated: {exc}')


def notify_permissions_updated(user_ids, company_ids, reason):
    """ارسال رویداد پس از commit تراکنش جاری (یا بی‌درنگ اگر تراکنشی باز نیست)."""
    messages = permission_event_messages(user_ids, company_ids, reason)
    if messages:
        transaction.on_commit(lambda: _send(messages))
    return messages


# ─── مجموعهٔ کاربران و شرکت‌های اثرپذیرفته، با تعداد ثابت پرس‌وجو ─────────────────────

def _assignment_company(row):
    company_id, project_company_id, section_company_id = row
    return company_id or project_company_id or section_company_id


def companies_of_users(user_ids):
    """شرکت‌های کاربران (انتساب‌های فعال و پیوند UserCompanyAccess)؛ دو پرس‌وجو."""
    from companies.models import SectionAssignment, UserCompanyAccess
    user_ids = list(user_ids)
    if not user_ids:
        return set()
    out = {
        _assignment_company(row) for row in SectionAssignment.objects.filter(
            user_id__in=user_ids, is_active=True
        ).values_list('company_id', 'project__company_id', 'section__project__company_id')
    }
    out |= set(UserCompanyAccess.objects.filter(user_id__in=user_ids).values_list('company_id', flat=True))
    out.discard(None)
    return out


def bundle_targets(role_key):
    """(کاربران دارای انتساب فعال با این نقش، شرکت‌های همان انتساب‌ها)؛ یک پرس‌وجو."""
    from companies.models import SectionAssignment
    users, companies = set(), set()
    for uid, *chain in SectionAssignment.objects.filter(role=role_key, is_active=True).values_list(
            'user_id', 'company_id', 'project__company_id', 'section__project__company_id'):
        users.add(uid)
        companies.add(_assignment_company(chain))
    companies.discard(None)
    return users, companies


def notify_bundle_changed(role_key):
    users, companies = bundle_targets(role_key)
    return notify_permissions_updated(users, companies, 'bundle')


def notify_role_changed(user_ids):
    user_ids = set(user_ids)
    return notify_permissions_updated(user_ids, companies_of_users(user_ids), 'role')


def notify_override_changed(user_id, company_id=None):
    companies = {company_id} if company_id else companies_of_users([user_id])
    return notify_permissions_updated([user_id], companies, 'override')


def notify_assignment_changed(user_ids):
    """تغییر انتساب‌های کاربر (ایجاد، ویرایش، حذف) مجوزهایش را عوض می‌کند؛ فقط کانال شخصی."""
    return notify_permissions_updated(user_ids, (), 'assignment')
