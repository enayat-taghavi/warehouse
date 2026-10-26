"""
دریافت‌کنندگان کار (ت۳ و ت۱۰ طرح ۲.۳). همه چیز به بخش نمونه محدود است: دریافت‌کنندهٔ اصلی کسی است که در
همان بخش (با ارث‌بری شرکت و پروژه) نقش مرحله را دارد **و** مجوز بخشی مرحله را در همان بخش، به‌جز ثبت‌کننده
و مدیر کل. جانشین فقط برای دریافت‌کنندهٔ اصلی گسترش می‌یابد (بی‌زنجیره)، هرگز ثبت‌کنندهٔ سند نیست و باید عضو
شرکت نمونه باشد (ق۱۶).

یک قاعده برای هر دو مسیر: `compute_recipients_batch` هم برای یک کار (موتور) و هم برای هزاران کار (محاسبهٔ
دوبارهٔ ت۴ و ت۷) به کار می‌رود، با شمار پرس‌وجوی ثابت.

ردیف «معتبر امروز»: ردیف اصلی همیشه؛ ردیف جانشین فقط اگر بازه‌اش امروز را دارد. رویدادهای «رسید» و «برداشته شد»
فقط برای ردیف‌های معتبر امروز صادر می‌شوند؛ ردیف جانشینِ بازهٔ آینده رویدادش را هنگام شروع بازه از زمان‌بند
(۲.۳-ب) می‌گیرد.

سند «سطح شرکت» (ص۷ طرح ۳.۶، نمونه با section=None): زنجیره (None, None, company_id) است و دریافت‌کننده فقط
انتساب فعال سطح همان شرکت با نقش مرحله و مجوز مرحله در سطح شرکت؛ انتساب پروژه یا بخش آن را نمی‌گیرد.
"""
from django.db.models import Q
from django.utils import timezone

from accounts.scoped_permissions import _split_code, effective_bundles, section_permission_holders
from companies.models import SectionAssignment, section_role_ranks
from companies.org_roles import (
    CoveringIndex, _section_chain, assignments_covering_section, company_level_key, covering_assignment_rows,
)

from .models import WorkflowSubstitute, WorkflowTaskRecipient


def scope_triplet(section, company_id=None):
    """
    (section_id, project_id, company_id) دامنهٔ نمونه: بخش با پروژهٔ بارشده (بی‌پرس‌وجو)، یا برای سند سطح شرکت
    (section=None) زنجیرهٔ (None, None, company_id).
    """
    if section is not None:
        return section.pk, section.project_id, section.project.company_id
    return None, None, company_id


def scope_chain_key(section_id, company_id):
    """کلید زنجیرهٔ covering_assignment_rows برای این دامنه؛ None اگر نه بخش دارد نه شرکت."""
    if section_id is not None:
        return section_id
    return company_level_key(company_id) if company_id else None


def creator_rank(user_id, section, ranks=None, company_id=None) -> int:
    """
    بالاترین رتبهٔ نقش‌های انتساب فعال کاربر در این بخش؛ بی‌نقش (مثل مدیر کل بی‌انتساب) ۰ (ت۵).
    section=None (سند سطح شرکت): فقط انتساب‌های فعال سطح شرکت company_id.
    """
    if not user_id:
        return 0
    if ranks is None:
        ranks = section_role_ranks()
    if section is None:
        if not company_id:
            return 0
        rows = SectionAssignment.objects.filter(company_id=company_id, is_active=True)
    else:
        rows = assignments_covering_section(section)
    roles = rows.filter(user_id=user_id).values_list('role', flat=True)
    return max((ranks.get(role) or 0 for role in roles), default=0)


def row_valid_on(on_behalf_of_id, start, end, today) -> bool:
    """ردیف اصلی همیشه معتبر است؛ ردیف جانشین فقط در بازه‌اش."""
    if on_behalf_of_id is None:
        return True
    return start is not None and end is not None and start <= today <= end


def valid_rows_q(today, prefix='') -> Q:
    """شرط ردیف‌های معتبر امروز (برای فیلتر WorkflowTaskRecipient یا از راه prefix)."""
    return (Q(**{f'{prefix}on_behalf_of__isnull': True})
            | Q(**{f'{prefix}valid_from__lte': today, f'{prefix}valid_to__gte': today}))


def company_member_pairs(user_ids, company_ids) -> set:
    """
    {(user_id, company_id)} عضویت فعال: فقط انتساب فعال در شرکت، پروژه یا بخش آن (قاعدهٔ سکو در
    companies/models.py و companies/access.py)؛ ردیف تنهای UserCompanyAccess عضویت نیست.
    یک پرس‌وجو (یا هیچ، اگر ورودی خالی باشد).
    """
    user_ids, company_ids = list(set(user_ids)), set(company_ids)
    if not user_ids or not company_ids:
        return set()
    out = set()
    for uid, c, pc, sc in SectionAssignment.objects.filter(
        Q(company_id__in=list(company_ids)) | Q(project__company_id__in=list(company_ids))
        | Q(section__project__company_id__in=list(company_ids)),
        user_id__in=user_ids, is_active=True,
    ).values_list('user_id', 'company_id', 'project__company_id', 'section__project__company_id'):
        out.add((uid, c or pc or sc))
    return {(u, c) for u, c in out if c in company_ids}


def _substitute_candidates(principal_ids, company_ids, today) -> list:
    """جانشینی‌های لغونشده و تمام‌نشدهٔ این صاحبان کار با جانشین فعال و غیر مدیر کل؛ یک پرس‌وجو."""
    if not principal_ids:
        return []
    return list(
        WorkflowSubstitute.objects.filter(
            principal_id__in=list(principal_ids), revoked_at__isnull=True, end_date__gte=today,
            substitute__is_active=True, substitute__is_superuser=False,
        )
        .filter(Q(company__isnull=True) | Q(company_id__in=list(company_ids)))
        .order_by('start_date', 'id')
        .values_list('substitute_id', 'principal_id', 'company_id', 'start_date', 'end_date')
    )


def _choose_substitutes(candidates, principals, company_id, creator_id, today, members) -> list:
    """
    ردیف‌های جانشین یک کار از نامزدها: [(substitute_id, principal_id, start, end)]. برای هر (جانشین، صاحب کار)
    یک ردیف: بازه‌ای که امروز را دارد، وگرنه زودترین بازهٔ آینده. جانشینی که خودش دریافت‌کنندهٔ اصلی یا ثبت‌کننده
    است یا عضو شرکت نمونه نیست کنار می‌رود.
    """
    chosen = {}
    for sub_id, principal_id, sub_company, start, end in candidates:
        if principal_id not in principals or sub_id in principals or sub_id == creator_id:
            continue
        if sub_company is not None and sub_company != company_id:
            continue
        if (sub_id, company_id) not in members:
            continue
        key = (sub_id, principal_id)
        current = chosen.get(key)
        if current is None or (current[0] > today and start <= today):
            chosen[key] = (start, end)
    return [(s, p, start, end) for (s, p), (start, end) in chosen.items()]


def compute_recipients_batch(items, *, bundles=None, today=None) -> dict:
    """
    دریافت‌کنندگان چند کار با شمار پرس‌وجوی ثابت (ت۳، ت۴، ت۱۰):
    یک پرس‌وجوی انتساب‌های پوشانندهٔ همهٔ بخش‌ها، effective_bundles() (اگر bundles داده نشود)، یک پرس‌وجوی
    تفاوت‌های کاربر، یک پرس‌وجوی جانشین‌ها و یک پرس‌وجوی عضویت جانشین‌ها در شرکت (فقط انتساب فعال).
    items: [(key, (section_id, project_id, company_id), role, permission, creator_id[, target_user_id
    (section_id=None و project_id=None یعنی سند سطح شرکت: فقط انتساب‌های سطح شرکت)
    [, allow_substitute]])]. target_user_id (کار ارجاع، ر۵ طرح ۲.۳-و): دریافت‌کنندهٔ اصلی فقط همین کاربر است، اگر
    فعال و عضو فعال شرکت نمونه باشد؛ نقش، مجوز و قاعدهٔ ثبت‌کننده سنجیده نمی‌شود (یک پرس‌وجوی کاربر و یک پرس‌وجوی
    عضویت برای همهٔ کارهای ارجاع). allow_substitute=False (ر۴): ردیف جانشین ساخته نمی‌شود.
    خروجی {key: (principals:set, sub_rows:list, holders:set)} که holders دارندگان فعال و غیر مدیر کل نقش‌اند
    (برای کار ارجاع همان principals).
    """
    items = [(*it[:5], it[5] if len(it) > 5 else None, it[6] if len(it) > 6 else True) for it in items]
    if not items:
        return {}
    today = today or timezone.localdate()
    step_items = [it for it in items if it[5] is None]
    out = {}
    if step_items:
        chains = {}
        for _k, (sid, pid, cid), *_rest in step_items:
            ckey = scope_chain_key(sid, cid)
            if ckey is not None:
                chains[ckey] = (pid if sid is not None else None, cid)
        rows = covering_assignment_rows(chains) if chains else []
        if rows and bundles is None:
            bundles = effective_bundles()
        perm_holders = (section_permission_holders(chains, {it[3] for it in step_items}, bundles=bundles, rows=rows)
                        if rows else {})
        index = CoveringIndex(rows)
        for key, (sid, pid, cid), role, permission, creator_id, _t, _a in step_items:
            ckey = scope_chain_key(sid, cid)
            if sid is None:
                pid = None
            holders = {uid for uid, r, *_ in index.covering(sid, pid, cid) if r == role} if ckey is not None else set()
            allowed = perm_holders.get((ckey, _split_code(permission)[1]), set()) if holders else set()
            out[key] = ((holders & allowed) - {creator_id}, [], holders)
    ref_items = [it for it in items if it[5] is not None]
    if ref_items:
        from django.contrib.auth import get_user_model
        targets = {it[5] for it in ref_items}
        active = set(get_user_model().objects.filter(pk__in=list(targets), is_active=True)
                     .values_list('pk', flat=True))
        target_members = company_member_pairs(active, {it[1][2] for it in ref_items if it[1][2]})
        for key, (_sid, _pid, cid), _role, _perm, _creator, target, _a in ref_items:
            principals = {target} if (target, cid) in target_members else set()
            out[key] = (principals, [], set(principals))
    all_principals = set().union(*(p for p, _s, _h in out.values()))
    companies = {cid for _k, (_s, _p, cid), *_r in items if cid}
    candidates = _substitute_candidates(all_principals, companies, today)
    if candidates:
        members = company_member_pairs({c[0] for c in candidates}, companies)
        for key, (_sid, _pid, cid), _role, _perm, creator_id, _target, allow in items:
            principals = out[key][0]
            if principals and allow:
                out[key][1].extend(_choose_substitutes(candidates, principals, cid, creator_id, today, members))
    return out


def role_holder_ids(section, role) -> set:
    """دارندگان فعال و غیر مدیر کل نقش role در این بخش (هر سطح)."""
    sid, pid, cid = _section_chain(section)
    if sid is None:
        return set()
    rows = covering_assignment_rows({sid: (pid, cid)})
    return {uid for uid, r, *_ in rows if r == role}


def principal_recipient_ids(section, role, permission, creator_id, *, bundles=None, holders=None) -> set:
    """
    دریافت‌کنندگان اصلی مرحله (ت۳): نقش role در بخش ∩ دارندگان مجوز بخشی permission در همان بخش − ثبت‌کننده.
    holders: خروجی role_holder_ids اگر از قبل گرفته شده باشد (فقط برای سازگاری؛ نتیجه همان است).
    """
    from accounts.scoped_permissions import section_permission_holder_ids
    if holders is None:
        holders = role_holder_ids(section, role)
    if not holders:
        return set()
    return (holders & section_permission_holder_ids(permission, section, bundles=bundles)) - {creator_id}


def substitute_rows(principal_ids, company_id, creator_id, today=None) -> list:
    """
    ردیف‌های جانشین برای این دریافت‌کنندگان اصلی: [(substitute_id, principal_id, start_date, end_date)].
    همان قاعدهٔ compute_recipients_batch (لغونشده، تمام‌نشده، شرکت نمونه یا همه، جانشین فعال، غیر مدیر کل،
    غیر ثبت‌کننده، غیر دریافت‌کنندهٔ اصلی و عضو شرکت نمونه).
    """
    principal_ids = set(principal_ids)
    today = today or timezone.localdate()
    candidates = _substitute_candidates(principal_ids, {company_id}, today)
    if not candidates:
        return []
    members = company_member_pairs({c[0] for c in candidates}, {company_id})
    return _choose_substitutes(candidates, principal_ids, company_id, creator_id, today, members)


def desired_rows(principal_ids, sub_rows) -> dict:
    """{(user_id, on_behalf_of_id): (valid_from, valid_to)} ردیف‌های مطلوب یک کار."""
    desired = {(uid, None): (None, None) for uid in principal_ids}
    for sub_id, principal_id, start, end in sub_rows:
        desired[(sub_id, principal_id)] = (start, end)
    return desired


def row_told(behalf, rec, today) -> bool:
    """
    آیا دارندهٔ ردیف از این کار خبر دارد (رسید گرفته و برداشته شد نگرفته)؟ ردیف اصلی همیشه؛ ردیف جانشین اگر
    announced است. rec = (pk, start, end[, announced])؛ بی announced همان «معتبر امروز» (سازگاری).
    """
    if behalf is None:
        return True
    if len(rec) > 3:
        return bool(rec[3])
    return row_valid_on(behalf, rec[1], rec[2], today)


def diff_rows(task_id, existing, desired, today):
    """
    تفاوت ردیف‌های یک کار، بی‌پرس‌وجو. existing: {(uid, behalf): (pk, start, end, announced)}.
    خروجی (شناسه‌های حذفی، ردیف‌های تازه، ردیف‌های تغییر بازه یا اعلام، دریافت‌کنندگان تازه، برداشته‌شده‌ها).
    «رسید» به کسی که تازه ردیف معتبر امروز گرفت و از کار خبر نداشت؛ «برداشته شد» به کسی که خبر داشت و دیگر
    ردیف معتبر امروز ندارد (ردیف جانشینِ تمام‌شده یا رفته به بازهٔ آینده هم). announced هر ردیف جانشین مطلوب
    برابر «معتبر امروز» نوشته می‌شود؛ پس هر رسید و برداشته شد یک بار است (زمان‌بند ۲.۳-ب بقیه را می‌فرستد).
    """
    stale = [rec[0] for key, rec in existing.items() if key not in desired]
    new = [
        WorkflowTaskRecipient(task_id=task_id, user_id=uid, on_behalf_of_id=behalf, valid_from=start, valid_to=end,
                              announced=row_valid_on(behalf, start, end, today))
        for (uid, behalf), (start, end) in desired.items() if (uid, behalf) not in existing
    ]
    changed = []
    for key, (start, end) in desired.items():
        rec = existing.get(key)
        if rec is None:
            continue
        valid = row_valid_on(key[1], start, end, today)
        if tuple(rec[1:3]) != (start, end) or (key[1] is not None and row_told(key[1], rec, today) != valid):
            changed.append(WorkflowTaskRecipient(pk=rec[0], valid_from=start, valid_to=end, announced=valid))
    before = {uid for (uid, b), rec in existing.items() if row_told(b, rec, today)}
    after = {uid for (uid, b), (s, e) in desired.items() if row_valid_on(b, s, e, today)}
    return stale, new, changed, after - before, before - after


def write_row_changes(stale, new, changed) -> None:
    """نوشتن تفاوت‌ها با شمار پرس‌وجوی ثابت (حذف، افزودن، به‌روزرسانی بازه و اعلام)."""
    if stale:
        WorkflowTaskRecipient.objects.filter(pk__in=stale).delete()
    if new:
        WorkflowTaskRecipient.objects.bulk_create(new)
    if changed:
        WorkflowTaskRecipient.objects.bulk_update(changed, ['valid_from', 'valid_to', 'announced'])


EXISTING_FIELDS = ('id', 'user_id', 'on_behalf_of_id', 'valid_from', 'valid_to', 'announced')


def sync_task_recipients(task, principal_ids, sub_rows, today=None) -> tuple:
    """
    ردیف‌های دریافت‌کنندهٔ کار باز را با مجموعهٔ تازه یکی می‌کند (حذف/افزودن/به‌روزرسانی بازه) با شمار
    پرس‌وجوی ثابت. خروجی (کاربرانی که تازه کار معتبر امروز گرفتند، کاربرانی که کار اعلام‌شده‌شان برداشته شد).
    """
    today = today or timezone.localdate()
    existing = {
        (uid, behalf): (pk, start, end, announced)
        for pk, uid, behalf, start, end, announced in WorkflowTaskRecipient.objects.filter(task=task)
        .values_list(*EXISTING_FIELDS)
    }
    stale, new, changed, received, removed = diff_rows(task.pk, existing, desired_rows(principal_ids, sub_rows), today)
    write_row_changes(stale, new, changed)
    return received, removed


def clear_task_recipients(task, today=None) -> set:
    """حذف همهٔ ردیف‌های کار (هنگام بسته شدن)؛ خروجی کاربرانی که از کار خبر داشتند (ردیف اصلی یا اعلام‌شده)."""
    today = today or timezone.localdate()
    rows = WorkflowTaskRecipient.objects.filter(task=task)
    found = list(rows.values_list(*EXISTING_FIELDS))
    if found:
        rows.delete()
    return {uid for pk, uid, b, s, e, ann in found if row_told(b, (pk, s, e, ann), today)}
