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
from django.dispatch import Signal

logger = logging.getLogger(__name__)

# permissions_changed.send(sender=None, user_ids=frozenset, company_ids=frozenset, reason=str)
# وابستگی یک‌طرفه: accounts چیزی از گیرنده‌ها (مثل workflow) نمی‌شناسد.
permissions_changed = Signal()

EVENT_TYPE = 'permissions_updated'
REASONS = ('bundle', 'role', 'override', 'assignment', 'user')
# reason='user' (طرح ۲.۹): «فهرست کاربران عوض شد» (ساخت، ویرایش، حذف، فعال/غیرفعال، اکسل)؛ نوع جدا و
# فقط کانال شرکت‌ها، چون مجوز کسی عوض نشده و کانال شخصی نباید مجوزها را دوباره بخواند.
USERS_EVENT_TYPE = 'users_changed'
_FORBIDDEN_GROUPS = frozenset({'global_notifications'})


def permission_event_messages(user_ids, company_ids, reason):
    """[(group, payload)] رویدادهای ارسالی؛ تابع خالص برای تست (هیچ گروه عمومی در آن نیست)."""
    if reason not in REASONS:
        raise ValueError(f'reason نامعتبر: {reason!r}')
    user_ids = sorted({int(u) for u in user_ids if u})
    company_ids = sorted({int(c) for c in company_ids if c})
    single = user_ids[0] if len(user_ids) == 1 else None
    event_type = USERS_EVENT_TYPE if reason == 'user' else EVENT_TYPE
    out = []
    for uid in (() if reason == 'user' else user_ids):
        out.append((f'user_{uid}', {
            'type': 'send_notification', 'type_str': EVENT_TYPE,
            'user_id': uid, 'reason': reason, 'message': '',
        }))
    for cid in company_ids:
        out.append((f'company_{cid}_notifications', {
            'type': 'send_notification', 'type_str': event_type,
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
    """
    ارسال رویداد پس از commit تراکنش جاری (یا بی‌درنگ اگر تراکنشی باز نیست)، و سیگنال هستهٔ
    `permissions_changed` همان لحظه و درون تراکنش فراخوان (برای محاسبهٔ دوبارهٔ کارهای گردش کار، ت۴ طرح ۲.۳).
    گیرنده‌ها خطای خودشان را می‌گیرند؛ send_robust هم خطای گیرنده را به فراخوان نمی‌رساند.
    """
    user_ids = {int(u) for u in user_ids if u}
    company_ids = {int(c) for c in company_ids if c}
    messages = permission_event_messages(user_ids, company_ids, reason)
    if messages:
        transaction.on_commit(lambda: _send(messages))
    for _receiver, result in permissions_changed.send_robust(
            sender=None, user_ids=frozenset(user_ids), company_ids=frozenset(company_ids), reason=reason):
        if isinstance(result, Exception):
            logger.error('[permissions_changed] receiver failed: %r', result)
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


def notify_users_changed(user_ids, company_ids=None):
    """
    رویداد users_changed پس از commit، فقط روی کانال شرکت‌های اثرپذیرفته (هرگز global_notifications).
    company_ids=None یعنی شرکت‌های کنونی همین کاربران؛ برای حذف، شرکت‌ها را پیش از حذف بدهید.
    سیگنال permissions_changed فرستاده نمی‌شود (مجوزی عوض نشده است).
    """
    user_ids = {int(u) for u in user_ids if u}
    if company_ids is None:
        company_ids = companies_of_users(user_ids)
    company_ids = {int(c) for c in company_ids if c}
    messages = permission_event_messages(user_ids, company_ids, 'user')
    if messages:
        transaction.on_commit(lambda: _send(messages))
    return messages
