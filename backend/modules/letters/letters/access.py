"""
دسترسی نامه‌ها (ن۹ طرح plan_letters.md): چه کسی نامه را می‌بیند، چه کسی پیوست می‌گذارد و چه کسی ویرایش می‌کند.

- دیدن نامه همیشه یک queryset است (`visible_letters`) تا فهرست‌ها بی‌حلقه برای هر ردیف بمانند (ق۱۸).
  قلاب `can_view:letters.letter` همان queryset را برای یک نامه می‌پرسد؛ پس فهرست، صفحهٔ نامه، پیوست و سابقه یک قاعده دارند.
- عضو فعال شرکت نامه نبودن = منع صریح (False). مدیر کل فعال را هسته پیش از قلاب «می‌بیند» می‌کند (س۵).
- گیرنده، رونوشت و مخاطب بخشنامه فقط نامهٔ ثبت‌شده را می‌بینند؛ پیش‌نویس مال نویسنده‌ها و امضاکننده‌هاست.
- دبیرخانه فقط نامهٔ «عادی» را کامل می‌بیند: نامهٔ ثبت‌شده یا وارده. محرمانه و سری در دفتر دبیرخانه فقط با پوشش.
"""
from django.db.models import Q

from .settings_spec import SETTINGS_PERM
from .models import (
    LETTER_ENTITY, CircularAudience, Letter, LetterEditor, LetterRecipient, LetterSigner,
)

SECRETARIAT_PERM = 'perm_letters_secretariat'
COMPOSE_PERM = 'perm_letters_compose'
CIRCULAR_PERM = 'perm_letters_circular'
HUB_PERM = 'view_letters_hub'

# پیش‌نویس و وارده‌ای که هنوز ثبت نشده ویرایش‌پذیرند؛ «در امضا» فقط با عودت به پیش‌نویس (ل-د)
EDITABLE_STATUSES = (Letter.STATUS_DRAFT, Letter.STATUS_RECEIVED)


def _live(user) -> bool:
    return bool(user) and getattr(user, 'is_authenticated', False) and getattr(user, 'is_active', False)


def is_live_superuser(user) -> bool:
    return _live(user) and bool(getattr(user, 'is_superuser', False))


def member_company_ids(user) -> set:
    """شرکت‌های فعالی که کاربر عضو آن‌هاست (قاعدهٔ سکو؛ شرکتی که ماژول در آن خاموش است در مسیر ماژول کنار می‌رود)."""
    if not _live(user):
        return set()
    from companies.access import get_user_allowed_companies
    return set(get_user_allowed_companies(user).values_list('id', flat=True))


def company_codes(user, company_id) -> frozenset:
    """مجوزهای بخشی کاربر در شرکت (همان شرکت، codes_in_company)."""
    if not _live(user) or not company_id:
        return frozenset()
    from accounts.scoped_permissions import codes_in_company
    return codes_in_company(user, company_id)


def has_company_perm(user, company_id, code) -> bool:
    if is_live_superuser(user):
        return True
    return code in company_codes(user, company_id)


def secretariat_company_ids(user, company_ids=None) -> set:
    """شرکت‌هایی (از میان عضویت‌ها) که کاربر در آن‌ها مجوز دبیرخانه دارد؛ بی‌پرس‌وجوی اضافه پس از ساخت وضعیت مجوز."""
    ids = member_company_ids(user) if company_ids is None else set(company_ids)
    return {cid for cid in ids if SECRETARIAT_PERM in company_codes(user, cid)}


def _workflow_letter_ids(user):
    """زیرکوئری شناسهٔ نامه‌هایی که کاربر در گردش آن‌ها کار باز یا ارجاع دارد (ت۱۱ و ر۱۱ موتور)."""
    from django.utils import timezone
    from workflow.models import WorkflowStep, WorkflowTask, WorkflowTaskRecipient

    from .referral import LETTER_REFERRAL_WORKFLOW
    today = timezone.localdate()
    # ارجاع فقط از درخت ارجاع نامه (letters.referral) دیدن می‌دهد؛ ارجاع از مسیر عمومی روی نمونهٔ امضا نه
    # (یافتهٔ بازبینی ل-ه: آن کارها با بایگانی و ابطال بسته نمی‌شدند و در درخت هم نبودند)
    open_tasks = WorkflowTaskRecipient.objects.filter(
        user_id=user.pk, task__is_open=True, task__instance__entity_kind=LETTER_ENTITY,
    ).filter(Q(task__track=WorkflowTask.TRACK_STEP) | Q(task__instance__workflow_key=LETTER_REFERRAL_WORKFLOW)
             ).filter(Q(on_behalf_of__isnull=True) | Q(valid_from__lte=today, valid_to__gte=today)
                      ).values('task__instance__entity_id')
    # ر۱۱ (referral_grants_view): گیرندهٔ کار ارجاع (باز یا بسته)، یا کسی که به جانشینی روی کار ارجاع اقدام کرده
    acted_for = WorkflowStep.objects.filter(
        actor_id=user.pk, on_behalf_of__isnull=False, task__track=WorkflowTask.TRACK_REFERRAL,
        instance__entity_kind=LETTER_ENTITY, instance__workflow_key=LETTER_REFERRAL_WORKFLOW,
    ).values('instance__entity_id')
    referrals = WorkflowTask.objects.filter(
        track=WorkflowTask.TRACK_REFERRAL, instance__entity_kind=LETTER_ENTITY, target_user_id=user.pk,
        instance__workflow_key=LETTER_REFERRAL_WORKFLOW,
    ).values('instance__entity_id')
    return open_tasks, referrals, acted_for


def visible_letters(user, base=None):
    """
    queryset نامه‌هایی که کاربر کامل می‌بیند (ن۹). بی‌تکرار ردیف: هر شرط زیرکوئری `pk__in` است، نه join.
    """
    qs = Letter.objects.all() if base is None else base
    if not _live(user):
        return qs.none()
    if user.is_superuser:
        return qs
    companies = member_company_ids(user)
    if not companies:
        return qs.none()
    from companies.org_roles import user_sections
    sections = user_sections(user, include_inactive=True).values('id')
    registered = Q(registered_at__isnull=False)

    personal = (
        Q(author_id=user.pk)
        | Q(pk__in=LetterEditor.objects.filter(user_id=user.pk).values('letter_id'))
        | Q(pk__in=LetterSigner.objects.filter(user_id=user.pk).values('letter_id'))
    )
    recipient = registered & (
        Q(pk__in=LetterRecipient.objects.filter(target_type=LetterRecipient.TARGET_USER, user_id=user.pk)
          .values('letter_id'))
        | Q(pk__in=LetterRecipient.objects.filter(target_type=LetterRecipient.TARGET_SECTION,
                                                  section_id__in=sections).values('letter_id'))
    )
    audience = registered & Q(kind=Letter.KIND_CIRCULAR) & (
        Q(pk__in=CircularAudience.objects.filter(scope=CircularAudience.SCOPE_COMPANY).values('letter_id'))
        | Q(pk__in=CircularAudience.objects.filter(scope=CircularAudience.SCOPE_SECTION,
                                                   section_id__in=sections).values('letter_id'))
    )
    open_tasks, referrals, acted_for = _workflow_letter_ids(user)
    workflow = Q(pk__in=open_tasks) | Q(pk__in=referrals) | Q(pk__in=acted_for)

    cond = personal | recipient | audience | workflow
    sec_companies = secretariat_company_ids(user, companies)
    if sec_companies:
        cond |= (Q(company_id__in=sec_companies, confidentiality=Letter.CONF_NORMAL)
                 & (registered | Q(kind=Letter.KIND_INCOMING)))
    return qs.filter(company_id__in=companies).filter(cond)


def _letter_pk(entity_id):
    try:
        value = int(str(entity_id).strip())
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def can_view_letter(user, entity_id):
    """قلاب can_view:letters.letter — True یا False صریح (هرگز «بی‌نظر»، تا سابقه و پیوست نامهٔ منع‌شده پنهان بماند)."""
    pk = _letter_pk(entity_id)
    if pk is None or not _live(user):
        return False
    if user.is_superuser:
        return True
    return visible_letters(user).filter(pk=pk).exists()


def is_editor(user, letter) -> bool:
    """نویسنده یا هم‌نویسنده (ن۱۰)؛ برای وارده دبیرخانهٔ همان شرکت هم."""
    if not _live(user) or user.is_superuser:
        return False
    if letter.company_id not in member_company_ids(user):
        return False
    if letter.author_id == user.pk or LetterEditor.objects.filter(letter_id=letter.pk, user_id=user.pk).exists():
        return True
    return letter.kind == Letter.KIND_INCOMING and has_company_perm(user, letter.company_id, SECRETARIAT_PERM)


def can_attach_letter(user, entity_id):
    """
    قلاب can_attach:letters.letter (ن۹): پیش از ثبت نویسنده و هم‌نویسنده.
    بعد از ثبت API عمومی پیوست بسته است، چون قلاب هسته برچسب را نمی‌بیند: پیوست پس از ثبت فقط از مسیر ماژول
    `POST /api/letters/<id>/scan/` با برچسب `signed_scan` یا `after_register` (ل-ح، `can_upload_scan`).
    نامهٔ باطل و نامهٔ ناموجود = منع صریح.
    """
    pk = _letter_pk(entity_id)
    if pk is None or not _live(user) or user.is_superuser:
        return False
    letter = Letter.objects.filter(pk=pk).only('id', 'company_id', 'author_id', 'kind', 'status', 'registered_at').first()
    if letter is None or letter.status == Letter.STATUS_VOID or letter.registered_at is not None:
        return False
    if letter.company_id not in member_company_ids(user):
        return False
    # دبیرخانه برای هر واردهٔ شرکت ویراستار است؛ وارده‌ای که نمی‌بیند (محرمانه/سری) پیوست نمی‌گیرد (ل-ط)
    if not visible_letters(user).filter(pk=pk).exists():
        return False
    return is_editor(user, letter)


SCAN_LABELS = ('signed_scan', 'after_register')


def can_upload_scan(user, letter) -> bool:
    """پیوست پس از ثبت (ن۹، ل-ح): نامهٔ ثبت‌شدهٔ نا‌باطل؛ دبیرخانهٔ همان شرکت یا یکی از امضاکننده‌ها. دیدن را صدازننده می‌سنجد."""
    if not _live(user) or user.is_superuser:
        return False
    if letter.registered_at is None or letter.status == Letter.STATUS_VOID:
        return False
    if letter.company_id not in member_company_ids(user):
        return False
    if has_company_perm(user, letter.company_id, SECRETARIAT_PERM):
        return True
    return LetterSigner.objects.filter(letter_id=letter.pk, user_id=user.pk).exists()


# ─── تصویرهای تنظیم نامه (سربرگ و مهر، ن۱۲): پیوست `letters_secretariat` با شناسهٔ شرکت ─────────────

def _asset_company(user, entity_id):
    company_id = _letter_pk(entity_id)
    if company_id is None or not _live(user) or company_id not in member_company_ids(user):
        return None
    return company_id


def can_view_letters_asset(user, entity_id):
    """دیدن سربرگ و مهر: مجوز تنظیمات نامه یا دبیرخانه در همان شرکت (مهر را هر عضو نبیند). True یا False صریح."""
    if is_live_superuser(user):
        return True
    company_id = _asset_company(user, entity_id)
    if company_id is None:
        return False
    codes = company_codes(user, company_id)
    return SETTINGS_PERM in codes or SECRETARIAT_PERM in codes


def can_attach_letters_asset(user, entity_id):
    """بارگذاری و جایگزینی سربرگ و مهر: فقط مجوز تنظیمات نامه در همان شرکت (همان مجوز نوشتن کلید تنظیم)."""
    company_id = _asset_company(user, entity_id)
    if company_id is None:
        return False
    return SETTINGS_PERM in company_codes(user, company_id)
