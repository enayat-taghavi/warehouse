"""
چرخهٔ نامه (ن۳، ن۴، ن۶ طرح plan_letters.md): ارسال برای امضا، امضا و عودت (موتور هسته)، ثبت با شماره، ارسال
صادره، بایگانی و ابطال.

- شماره فقط در `register_in_tx` و داخل تراکنش ثبت با `numbering.allocate` صادر می‌شود؛ برگشت تراکنش شماره را هم
  برمی‌گرداند و شمارندهٔ قفل‌شده نمی‌گذارد دو ثبت هم‌زمان یک شماره بگیرند. ثبت تکراری همان شماره را می‌دهد.
- هیچ ردیفی حذف نمی‌شود؛ ابطال شماره را با `numbering.void` باطل نگه می‌دارد و دوباره داده نمی‌شود.
- ترتیب قفل همیشه «نمونهٔ گردش ← نامه» است (موتور نمونه را قفل می‌کند و قلاب نامه را)؛ پس امضا و عودت پیش از
  موتور نامه را قفل نمی‌کنند. کنش‌های بیرون از گردش (ثبت وارده، ارسال، بایگانی، ابطال) فقط نامه را قفل می‌کنند.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from accounts.audit_utils import log_audit_event

from .. import access
from ..models import LETTER_ENTITY, Letter, LetterSigner

MAX_SIGNERS = 10
MAX_REASON = 500  # سقف دلیل ابطال شماره در هسته
SIGNABLE_KINDS = (Letter.KIND_INTERNAL, Letter.KIND_OUTGOING, Letter.KIND_MINUTES, Letter.KIND_CIRCULAR)
ARCHIVABLE = (Letter.STATUS_REGISTERED, Letter.STATUS_SENT)
VOIDABLE_REGISTERED = (Letter.STATUS_REGISTERED, Letter.STATUS_SENT, Letter.STATUS_ARCHIVED)


class Conflict(APIException):
    status_code = 409
    default_detail = 'وضعیت نامه اجازهٔ این کار را نمی‌دهد.'
    default_code = 'invalid_state'


def audit(user, letter, action, **details):
    """سابقهٔ هر کنش نامه؛ موضوع نامه هرگز در target_repr نمی‌آید (فقط شماره یا شناسه)."""
    log_audit_event(
        module='letters', action=action, target_model='Letter', target_object_id=str(letter.pk),
        target_repr=letter.number_display or f'نامه #{letter.pk}', user=user, company_id=letter.company_id,
        details={'entity_kind': LETTER_ENTITY, 'status': letter.status, **details},
    )
    # ل-ه: هر تغییر نامه رویداد زندهٔ «سند تغییر کرد» را پس از commit می‌فرستد (پایان ن۱۶)
    from ..referral import emit_letter_changed
    emit_letter_changed(letter, str(details.get('event') or action).lower())


def _reason(value, required=True):
    text = str(value or '').strip()
    if required and not text:
        raise ValidationError({'reason': 'دلیل لازم است.'})
    if len(text) > MAX_REASON:
        raise ValidationError({'reason': f'دلیل حداکثر {MAX_REASON} نویسه است.'})
    return text


def _is_secretariat(user, letter) -> bool:
    return (not access.is_live_superuser(user) and letter.company_id in access.member_company_ids(user)
            and access.has_company_perm(user, letter.company_id, access.SECRETARIAT_PERM))


def _clear_edit_lock(letter):
    letter.edit_locked_by = None
    letter.edit_locked_until = None


# ─── قلاب‌های گردش (داخل تراکنش موتور) ─────────────────────────────────────────────────────────

def mark_signing(letter):
    letter.status = Letter.STATUS_SIGNING
    _clear_edit_lock(letter)
    letter.revision += 1
    letter.save(update_fields=['status', 'edit_locked_by', 'edit_locked_until', 'revision', 'updated_at'])


def back_to_draft(letter, actor, *, event):
    """عودت (یا لغو گردش): پیش‌نویس دوباره ویرایش‌پذیر؛ امضاهای قبلی pending می‌شوند (سابقه در گردش می‌ماند)."""
    if letter.status != Letter.STATUS_SIGNING:
        return
    LetterSigner.objects.filter(letter_id=letter.pk).update(status=LetterSigner.STATUS_PENDING, signed_at=None)
    letter.status = Letter.STATUS_DRAFT
    letter.revision += 1
    letter.save(update_fields=['status', 'revision', 'updated_at'])
    audit(actor, letter, 'REJECT' if event == 'return' else 'UPDATE', event=event)


def register_in_tx(letter, user, now=None):
    """
    ثبت با شماره (ن۴)، فقط داخل تراکنش فراخوان. نامهٔ قفل‌شده (select_for_update) لازم است. تکرار امن: نامهٔ
    ثبت‌شده همان شماره را نگه می‌دارد.
    """
    from numbering.services import allocate

    from ..numbering import series_key_for
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError('register_in_tx must run inside the registration transaction')
    if letter.issued_number_id:
        return letter
    now = now or timezone.now()
    issued = allocate(letter.company_id, series_key_for(letter.kind), LETTER_ENTITY, letter.pk, user, at=now)
    letter.issued_number = issued
    letter.number_display = issued.display
    letter.registered_at = now
    letter.registered_by = user if getattr(user, 'pk', None) else None
    letter.status = Letter.STATUS_REGISTERED
    _clear_edit_lock(letter)
    letter.revision += 1
    letter.save()
    audit(user, letter, 'APPROVE', event='register', number=issued.display)
    # ل-ه (ن۷، ن۱۸): داخلی و صورت‌جلسه در همین تراکنش به گیرنده‌ها ارجاع می‌شوند؛ بخشنامه فقط اعلان یک‌باره
    from .. import circulars, referral
    referral.auto_refer_in_tx(letter, user)
    circulars.notify_on_register(letter)
    return letter


# ─── کنش‌های کاربر ─────────────────────────────────────────────────────────────────────────────

def _workflow():
    from workflow import engine

    from ..workflows import LETTER_SIGN_WORKFLOW
    return engine, LETTER_SIGN_WORKFLOW


def submit_for_signing(user, letter):
    """پیش‌نویس ← در امضا (نامه قفل‌شده). نویسنده یا هم‌نویسنده؛ ۱ تا ۱۰ امضاکننده (ن۶)."""
    engine, key = _workflow()
    if letter.kind not in SIGNABLE_KINDS:
        raise ValidationError({'kind': 'نامهٔ وارده امضا نمی‌خواهد؛ دبیرخانه آن را ثبت می‌کند.'})
    if not access.is_editor(user, letter):
        raise PermissionDenied('فقط نویسنده و هم‌نویسنده‌ها نامه را برای امضا می‌فرستند.')
    if letter.status != Letter.STATUS_DRAFT:
        raise Conflict('فقط پیش‌نویس برای امضا فرستاده می‌شود.')
    if letter.edit_locked_by_id and letter.edit_locked_by_id != user.pk and letter.edit_locked_until \
            and letter.edit_locked_until > timezone.now():
        raise Conflict('نامه در حال ویرایش به دست نفر دیگری است.')
    count = LetterSigner.objects.filter(letter_id=letter.pk).count()
    if not 1 <= count <= MAX_SIGNERS:
        raise ValidationError({'signers': f'نامه باید ۱ تا {MAX_SIGNERS} امضاکننده داشته باشد.'})
    # پرچم جانشین پیش از باز شدن نخستین کار امضا، حتی در نخستین ارسال: جانشینِ امضاکنندهٔ نامهٔ محرمانه هیچ کار
    # یا اعلانی نمی‌گیرد (یافتهٔ بازبینی ل-د)
    engine.submit(key, letter, user, allow_substitute=not letter.is_confidential)
    letter.refresh_from_db()
    audit(user, letter, 'UPDATE', event='submit')
    return letter


def _open_sign_task(letter):
    engine, key = _workflow()
    task = engine.open_task(key, letter.pk)
    if task is None or letter.status != Letter.STATUS_SIGNING:
        raise Conflict('این نامه کار امضای بازی ندارد.')
    return engine, task


def sign(user, letter, *, reason='', revision=None):
    engine, task = _open_sign_task(letter)
    engine.act(user, task, reason=str(reason or '')[:1000], revision=revision, obj=letter)
    letter.refresh_from_db()
    return letter


def return_for_fix(user, letter, reason, *, revision=None):
    engine, task = _open_sign_task(letter)
    engine.return_for_fix(user, task, _reason(reason), obj=letter, revision=revision)
    letter.refresh_from_db()
    return letter


def register_incoming(user, letter):
    """وارده: دریافت‌شده ← ثبت‌شده با شماره، فقط دبیرخانه (نامه قفل‌شده). ثبت دوباره همان شماره را می‌دهد."""
    if letter.kind != Letter.KIND_INCOMING:
        raise ValidationError({'kind': 'این نامه با امضای آخرین امضاکننده خودکار ثبت می‌شود.'})
    if not _is_secretariat(user, letter):
        raise PermissionDenied('ثبت نامهٔ وارده کار دبیرخانه است.')
    if letter.issued_number_id:
        return letter
    if letter.status != Letter.STATUS_RECEIVED:
        raise Conflict('فقط نامهٔ دریافت‌شده ثبت می‌شود.')
    return register_in_tx(letter, user)


def send(user, letter, method, sent_at=None):
    """صادره: ثبت‌شده ← ارسال‌شده با روش و زمان (س۹)، فقط دبیرخانه."""
    if letter.kind != Letter.KIND_OUTGOING:
        raise ValidationError({'kind': 'فقط نامهٔ صادره ارسال می‌شود.'})
    if not _is_secretariat(user, letter):
        raise PermissionDenied('ارسال نامهٔ صادره کار دبیرخانه است.')
    if method not in dict(Letter.SEND_METHOD_CHOICES):
        raise ValidationError({'method': 'روش ارسال نامعتبر است.'})
    if letter.status == Letter.STATUS_SENT and letter.sent_method == method:
        return letter
    if letter.status != Letter.STATUS_REGISTERED:
        raise Conflict('فقط نامهٔ ثبت‌شده و ارسال‌نشده فرستاده می‌شود.')
    now = timezone.now()
    if sent_at is not None and sent_at > now:
        raise ValidationError({'sent_at': 'زمان ارسال نمی‌تواند در آینده باشد.'})
    letter.sent_method = method
    letter.sent_at = sent_at or now
    letter.status = Letter.STATUS_SENT
    letter.revision += 1
    letter.save(update_fields=['sent_method', 'sent_at', 'status', 'revision', 'updated_at'])
    audit(user, letter, 'UPDATE', event='send', method=method)
    return letter


def _can_archive(user, letter) -> bool:
    return _is_secretariat(user, letter) or (letter.author_id == user.pk
                                             and letter.company_id in access.member_company_ids(user))


def archive(user, letter):
    if not _can_archive(user, letter):
        raise PermissionDenied('بایگانی این نامه برای شما مجاز نیست.')
    if letter.status == Letter.STATUS_ARCHIVED:
        return letter
    if letter.status not in ARCHIVABLE:
        raise Conflict('فقط نامهٔ ثبت‌شده یا ارسال‌شده بایگانی می‌شود.')
    letter.status = Letter.STATUS_ARCHIVED
    letter.revision += 1
    letter.save(update_fields=['status', 'revision', 'updated_at'])
    from ..referral import close_open_referrals
    closed = close_open_referrals(letter, user)
    audit(user, letter, 'UPDATE', event='archive', closed_referrals=closed)
    return letter


def unarchive(user, letter):
    """بازگشت از بایگانی به وضعیت قبل (ن۳): ارسال‌شده اگر زمان ارسال دارد، وگرنه ثبت‌شده."""
    if not _can_archive(user, letter):
        raise PermissionDenied('بازگرداندن این نامه برای شما مجاز نیست.')
    if letter.status != Letter.STATUS_ARCHIVED:
        return letter
    letter.status = Letter.STATUS_SENT if letter.sent_at else Letter.STATUS_REGISTERED
    letter.revision += 1
    letter.save(update_fields=['status', 'revision', 'updated_at'])
    audit(user, letter, 'UPDATE', event='unarchive')
    return letter


def void(user, letter, reason):
    """
    ابطال (ن۳) با دلیل اجباری. نامهٔ ثبت‌شده فقط با مجوز دبیرخانه؛ شماره باطل می‌ماند و دوباره داده نمی‌شود.
    پیش‌نویس (و وارده‌ای که هنوز ثبت نشده) با نویسنده یا دبیرخانه؛ نامهٔ در امضا نخست عودت یا لغو می‌شود.
    """
    reason = _reason(reason)
    if letter.status == Letter.STATUS_VOID:
        return letter
    if letter.status in VOIDABLE_REGISTERED or letter.issued_number_id:
        if not _is_secretariat(user, letter):
            raise PermissionDenied('ابطال نامهٔ ثبت‌شده فقط کار دبیرخانه است.')
        if letter.issued_number_id:
            from numbering.models import IssuedNumber
            from numbering.services import void as void_number
            issued = IssuedNumber.objects.get(pk=letter.issued_number_id)
            if issued.status != IssuedNumber.STATUS_VOID:
                void_number(issued, reason, user)
    elif letter.status in access.EDITABLE_STATUSES:
        if not (letter.author_id == user.pk and letter.company_id in access.member_company_ids(user)) \
                and not _is_secretariat(user, letter):
            raise PermissionDenied('فقط نویسنده یا دبیرخانه این پیش‌نویس را باطل می‌کند.')
    else:
        raise Conflict('نامهٔ در امضا را نخست عودت دهید یا گردش را لغو کنید.')
    letter.status = Letter.STATUS_VOID
    letter.void_reason = reason
    letter.voided_at = timezone.now()
    letter.voided_by = user
    _clear_edit_lock(letter)
    letter.revision += 1
    letter.save()
    from ..referral import close_open_referrals
    closed = close_open_referrals(letter, user)
    audit(user, letter, 'UPDATE', event='void', closed_referrals=closed)
    return letter
