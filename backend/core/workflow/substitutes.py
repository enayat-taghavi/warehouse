"""
سرویس جانشین موقت (ت۱۰ طرح ۲.۳). نماها فقط از این توابع استفاده می‌کنند؛ هر تغییر با save() است (نه update()
گروهی) تا قلاب‌های محاسبهٔ دوبارهٔ کارهای باز (hooks.py) اجرا شوند.

قاعده‌ها:
- تعیین‌کننده: خود صاحب کار، یا مدیر کاربران = مدیر کل فعال، یا دارندهٔ perm_usr_role برای کاربری در دامنهٔ
  دیدش (get_visible_users_for_user)، هرگز برای مدیر کل، و فقط اگر خودش عضو شرکت (یا همهٔ شرکت‌های اعمال) باشد.
- جانشین: فعال، غیر مدیر کل، جز صاحب کار، و عضو فعال (انتساب فعال) شرکت داده‌شده یا همهٔ شرکت‌های صاحب کار.
- بازه: تاریخ شمسی یا میلادی؛ پایان ≥ شروع و ≥ امروز؛ بازهٔ هم‌پوشان فعال برای همان سه‌تایی پذیرفته نیست.
- زنجیره نمی‌شود: موتور فقط ردیف‌های جانشینی صاحبان اصلی کار را می‌خواند (recipients.compute_recipients_batch)،
  پس اگر الف→ب و ب→ج باشد، ج کار الف را نمی‌گیرد.
- لغو ردیف را پاک نمی‌کند (revoked_at و revoked_by)؛ تعیین و لغو هر دو در AuditLog ثبت می‌شوند.
"""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.audit_utils import log_audit_event
from accounts.models import CustomUser
from accounts.permission_admin import can_manage_permissions, member_company_ids
from accounts.scope import get_visible_users_for_user
from common.date_utils import format_to_shamsi_str, parse_date_smart
from companies.models import SectionAssignment

from .errors import WorkflowError, WorkflowPermissionDenied, WorkflowStateError
from .models import WorkflowSubstitute
from .recipients import company_member_pairs

AUDIT_MODULE = 'workflow'


def _bad(code, message_fa):
    return WorkflowError(code, message_fa, 400)


def _not_found():
    return WorkflowError('not_found', 'جانشینی یافت نشد', 404)


def is_live_superuser(user) -> bool:
    return bool(user) and getattr(user, 'is_active', False) and getattr(user, 'is_superuser', False)


def person(user):
    """{id, name} یا None."""
    if user is None:
        return None
    return {'id': user.pk, 'name': (user.get_full_name() or '').strip() or user.username}


def companies_of_user(user_id) -> set:
    """شرکت‌های انتساب‌های فعال کاربر (عضویت فعال، مثل recipients.company_member_pairs)؛ یک پرس‌وجو."""
    out = set()
    for c, pc, sc in SectionAssignment.objects.filter(user_id=user_id, is_active=True).values_list(
            'company_id', 'project__company_id', 'section__project__company_id'):
        cid = c or pc or sc
        if cid:
            out.add(cid)
    return out


def parse_day(value, label_fa):
    """تاریخ شمسی (YYYY/MM/DD با رقم فارسی یا لاتین) یا ISO؛ نامعتبر = خطای 400."""
    if value in (None, ''):
        raise _bad('invalid_date', f'{label_fa} الزامی است')
    try:
        day = parse_date_smart(value, strict=False)
    except Exception:
        day = None
    if day is None:
        raise _bad('invalid_date', f'{label_fa} نامعتبر است')
    return day


def _target_companies(principal_id, company_id) -> set:
    return {company_id} if company_id else companies_of_user(principal_id)


def manager_can_handle(editor, principal, company_ids) -> bool:
    """قاعدهٔ مدیر کاربران برای صاحب کار دیگر: مدیر کل فعال، یا perm_usr_role + دامنهٔ دید + عضویت در همهٔ شرکت‌ها."""
    if getattr(principal, 'is_superuser', False):
        return False
    if is_live_superuser(editor):
        return True
    if not getattr(editor, 'is_active', False) or not can_manage_permissions(editor):
        return False
    if not get_visible_users_for_user(editor).filter(pk=principal.pk).exists():
        return False
    return bool(company_ids) and set(company_ids) <= member_company_ids(editor)


def _audit(editor, action, row, before=None, after=None):
    # جانشینی بی‌شرکت در همهٔ شرکت‌های صاحب کار اعمال می‌شود: یک ردیف سابقه برای هر شرکت، تا ردیف بی‌شرکت
    # (که همهٔ شرکت‌ها می‌بینند) ساخته نشود
    company_ids = sorted(_target_companies(row.principal_id, row.company_id))
    for company_id in company_ids:
        log_audit_event(
            AUDIT_MODULE, action, target_model='WorkflowSubstitute', target_object_id=row.pk,
            target_repr=f'جانشینی {row.substitute_id} به جای {row.principal_id}', severity='warning', user=editor,
            before_state=before, after_state=after, company_id=company_id,
            details={'principal_id': row.principal_id, 'substitute_id': row.substitute_id,
                     'company_ids': company_ids},
        )


def _state(row) -> dict:
    return {
        'principal_id': row.principal_id, 'substitute_id': row.substitute_id, 'company_id': row.company_id,
        'start_date': row.start_date.isoformat(), 'end_date': row.end_date.isoformat(),
        'revoked_at': row.revoked_at.isoformat() if row.revoked_at else None,
    }


def create_substitute(editor, *, substitute_id, start_date, end_date, principal_id=None, company_id=None):
    """تعیین جانشین (ت۱۰). خطاها: 403 بیرون از دامنه، 400 اعتبارسنجی. خروجی ردیف ذخیره‌شده."""
    if not getattr(editor, 'is_active', False) or not editor.pk:
        raise WorkflowPermissionDenied('not_allowed', 'اجازهٔ تعیین جانشین ندارید', 403)
    try:
        principal_id = int(principal_id) if principal_id not in (None, '') else editor.pk
        substitute_id = int(substitute_id)
        company_id = int(company_id) if company_id not in (None, '') else None
    except (TypeError, ValueError):
        raise _bad('invalid_input', 'شناسهٔ کاربر یا شرکت نامعتبر است')

    if principal_id == editor.pk:
        principal = editor
        if getattr(principal, 'is_superuser', False):
            raise _bad('principal_superuser', 'مدیر کل سامانه دریافت‌کنندهٔ کار نیست و جانشین نمی‌خواهد')
    else:
        principal = CustomUser.objects.filter(pk=principal_id).first()
        # صاحب کار ناموجود و بیرون از دامنه یک پاسخ دارند تا وجود کاربر لو نرود
        if principal is None or not manager_can_handle(editor, principal, _target_companies(principal_id, company_id)):
            raise WorkflowPermissionDenied('out_of_scope', 'این کاربر در دامنهٔ مدیریت شما نیست', 403)

    companies = _target_companies(principal.pk, company_id)
    if company_id and (principal.pk, company_id) not in company_member_pairs([principal.pk], [company_id]):
        raise _bad('principal_not_member', 'صاحب کار عضو این شرکت نیست')
    if not companies:
        raise _bad('principal_no_company', 'صاحب کار در هیچ شرکتی انتساب فعال ندارد')

    # کاربر ناموجود، غیرفعال، مدیر کل و غیرعضو یک پاسخ دارند تا وجود کاربر شرکت‌های دیگر لو نرود
    substitute = CustomUser.objects.filter(pk=substitute_id).first()
    valid = (substitute is not None and substitute.is_active and not substitute.is_superuser
             and substitute.pk != principal.pk
             and {c for u, c in company_member_pairs([substitute.pk], companies)} == companies)
    if not valid:
        raise _bad('invalid_substitute', 'جانشین باید کاربری فعال، غیر از صاحب کار و غیر از مدیر کل سامانه، '
                                         'و عضو همهٔ شرکت‌هایی باشد که جانشینی در آن‌ها اعمال می‌شود')

    start = parse_day(start_date, 'تاریخ شروع')
    end = parse_day(end_date, 'تاریخ پایان')
    if end < start:
        raise _bad('invalid_range', 'تاریخ پایان نباید پیش از تاریخ شروع باشد')
    if end < timezone.localdate():
        raise _bad('invalid_range', 'تاریخ پایان نباید گذشته باشد')

    with transaction.atomic():
        # قفل صاحب کار تا دو درخواست هم‌زمان بازهٔ هم‌پوشان نسازند
        CustomUser.objects.select_for_update().filter(pk=principal.pk).first()
        overlap = WorkflowSubstitute.objects.filter(
            principal_id=principal.pk, substitute_id=substitute.pk, revoked_at__isnull=True,
            start_date__lte=end, end_date__gte=start,
        ).filter(Q(company_id=company_id) if company_id else Q(company__isnull=True))
        if overlap.exists():
            raise _bad('overlap', 'برای همین جانشین در این بازه جانشینی فعال دیگری ثبت شده است')
        row = WorkflowSubstitute(principal=principal, substitute=substitute, company_id=company_id,
                                 start_date=start, end_date=end, created_by=editor)
        row.save()
        _audit(editor, 'CREATE', row, after=_state(row))
    return row


def _can_revoke(editor, row) -> bool:
    if is_live_superuser(editor):
        return True
    if editor.pk == row.principal_id:
        return True
    # سازندهٔ مدیر فقط تا وقتی که هنوز مدیر کاربران این صاحب کار است (همان قاعدهٔ تعیین)
    return manager_can_handle(editor, row.principal, _target_companies(row.principal_id, row.company_id))


def revoke_substitute(editor, substitute_row_id):
    """لغو جانشینی (ردیف می‌ماند). ناپیدا یا نادیدنی 404؛ جانشین خودش 403؛ لغوشده 409."""
    row = (WorkflowSubstitute.objects.select_related('principal', 'substitute', 'company')
           .filter(pk=substitute_row_id).first())
    if row is None or not getattr(editor, 'is_active', False):
        raise _not_found()
    if not _can_revoke(editor, row):
        if editor.pk == row.substitute_id:
            raise WorkflowPermissionDenied('not_allowed', 'جانشین نمی‌تواند جانشینی را لغو کند', 403)
        raise _not_found()
    with transaction.atomic():
        row = WorkflowSubstitute.objects.select_for_update().get(pk=row.pk)
        if row.revoked_at is not None:
            raise WorkflowStateError('already_revoked', 'این جانشینی پیش‌تر لغو شده است', 409)
        before = _state(row)
        row.revoked_at = timezone.now()
        row.revoked_by = editor
        row.save()
        _audit(editor, 'DELETE', row, before=before, after=_state(row))
    return row


def list_substitutes(editor, principal_id=None):
    """
    ردیف‌هایی که کاربر صاحب کار یا جانشین آن است؛ با principal_id ردیف‌های آن کاربر (برای مدیر، با همان قاعده).
    خروجی (queryset, manager_mode).
    """
    qs = WorkflowSubstitute.objects.select_related('principal', 'substitute', 'company', 'created_by', 'revoked_by')
    if principal_id in (None, '') or str(principal_id) == str(editor.pk):
        return qs.filter(Q(principal_id=editor.pk) | Q(substitute_id=editor.pk)).order_by('-start_date', '-id'), False
    try:
        principal_id = int(principal_id)
    except (TypeError, ValueError):
        raise _bad('invalid_input', 'شناسهٔ کاربر نامعتبر است')
    principal = CustomUser.objects.filter(pk=principal_id).first()
    if principal is None or not manager_can_handle(editor, principal, companies_of_user(principal_id)):
        raise WorkflowPermissionDenied('out_of_scope', 'این کاربر در دامنهٔ مدیریت شما نیست', 403)
    qs = qs.filter(principal_id=principal_id)
    if not is_live_superuser(editor):
        # ردیف محدود به شرکتی که مدیر عضوش نیست دیده نمی‌شود (نام شرکت دیگر لو نرود)
        qs = qs.filter(Q(company__isnull=True) | Q(company_id__in=member_company_ids(editor)))
    return qs.order_by('-start_date', '-id'), True


def serialize_substitute(row, editor, manager_mode=False, today=None) -> dict:
    today = today or timezone.localdate()
    return {
        'id': row.pk,
        'principal': person(row.principal),
        'substitute': person(row.substitute),
        'company': {'id': row.company.pk, 'name': row.company.name} if row.company_id else None,
        'start_date': row.start_date.isoformat(),
        'end_date': row.end_date.isoformat(),
        'start_date_shamsi': format_to_shamsi_str(row.start_date),
        'end_date_shamsi': format_to_shamsi_str(row.end_date),
        'created_by': person(row.created_by) if row.created_by_id else None,
        'created_at': row.created_at.isoformat() if row.created_at else None,
        'revoked_at': row.revoked_at.isoformat() if row.revoked_at else None,
        'revoked_by': person(row.revoked_by) if row.revoked_by_id else None,
        'is_active': row.revoked_at is None and row.end_date >= today,
        'is_current': row.revoked_at is None and row.start_date <= today <= row.end_date,
        'can_revoke': row.revoked_at is None and (
            manager_mode or is_live_superuser(editor) or editor.pk in (row.principal_id, row.created_by_id)),
    }
