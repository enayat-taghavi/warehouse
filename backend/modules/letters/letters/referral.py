"""
فاز ۲ نامه‌ها (ل-ه، ن۷ و ن۸ طرح plan_letters.md): درخت ارجاع روی موتور گردش کار هسته، مهلت پاسخ و رویداد زنده.

- هر نامهٔ ثبت‌شده یک نمونهٔ «فقط ارجاع» دارد (`letters.referral`، `engine.open_for_referral`، تکرار امن). ارجاع،
  «انجام شد»، «رؤیت شد»، سقف ۲۰ گیرنده، عضو فعال همان شرکت، منع ارجاع مدیر کل و یادآوری سررسید همه کار هسته‌اند.
- ارجاع ریشه با قلاب `can_refer:letters_letter`: دبیرخانه (نامهٔ عادی)، نویسنده و امضاکننده‌ها؛ بقیه فقط از کار
  ارجاع باز خودشان (شاخهٔ خودشان) ارجاع می‌دهند. نامهٔ بایگانی یا باطل ارجاع تازه نمی‌گیرد.
- نامهٔ محرمانه و سری: نمونهٔ ارجاع بی‌جانشین است (پیش از نخستین کار).
- نامهٔ داخلی و صورت‌جلسه پس از ثبت، در همان تراکنش ثبت، خودکار به گیرنده‌های کاربری‌اش ارجاع می‌شود (گیرنده
  «ارجاع»، رونوشت «برای اطلاع»)؛ تکرار امن. بخشنامه کار نمی‌سازد (circulars.py).
- مهلت پیش‌فرض ارجاع ریشه: `response_due_at` نامه، وگرنه تنظیم شرکت `default_due_days`؛ یادآوری و خبر سررسید را
  زمان‌بند هسته از روی `due_at` کار می‌فرستد.
- بایگانی و ابطال کارهای ارجاع باز را با نتیجهٔ «لغو» می‌بندند؛ هیچ کاری حذف نمی‌شود.
"""
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from workflow.registry import INFORM, REFER, WorkflowSpec

from . import access
from .models import LETTER_ENTITY, Letter, LetterEditor, LetterRecipient, LetterSigner

logger = logging.getLogger(__name__)

LETTER_REFERRAL_WORKFLOW = 'letters.referral'
# وضعیت‌هایی که ارجاع تازه می‌پذیرند (ن۳)
REFERABLE_STATUSES = (Letter.STATUS_REGISTERED, Letter.STATUS_SENT)
AUTO_REFER_KINDS = (Letter.KIND_INTERNAL, Letter.KIND_MINUTES)


def _referral_state_change(obj, state, instance):
    """نمونهٔ فقط‌ارجاع مرحله ندارد؛ وضعیت نامه از ارجاع عوض نمی‌شود."""
    return None


def _summary(letter):
    from .workflows import letter_summary
    return letter_summary(letter)


LETTER_REFERRAL_WORKFLOW_SPEC = WorkflowSpec(
    key=LETTER_REFERRAL_WORKFLOW,
    version=1,
    entity_kind=LETTER_ENTITY,
    title_fa='ارجاع نامه',
    steps=(),
    on_state_change=_referral_state_change,
    summary=_summary,
    route='/app/letters/{id}',
    section_field=None,
    company_field='company',
    referral_only=True,
)


def _engine():
    from workflow import engine
    return engine


# ─── قلاب ارجاع ریشه ─────────────────────────────────────────────────────────────────────────────

def can_refer_letter(user, entity_id) -> bool:
    """
    قلاب can_refer:letters_letter (ن۷): ارجاع ریشهٔ نامهٔ ثبت‌شده و بایگانی‌نشده. نویسنده، امضاکننده‌ها و دبیرخانهٔ
    همان شرکت (دبیرخانه فقط نامهٔ عادی، همان قاعدهٔ دیدن ل-ج)؛ همیشه با دیدن نامه. مدیر کل هرگز.
    """
    pk = access._letter_pk(entity_id)
    if pk is None or not access._live(user) or user.is_superuser:
        return False
    letter = access.visible_letters(user, Letter.objects.filter(pk=pk)).only(
        'id', 'company_id', 'author_id', 'status', 'registered_at', 'confidentiality').first()
    if letter is None or letter.registered_at is None or letter.status not in REFERABLE_STATUSES:
        return False
    if letter.author_id == user.pk or LetterSigner.objects.filter(letter_id=pk, user_id=user.pk).exists():
        return True
    return (not letter.is_confidential
            and access.has_company_perm(user, letter.company_id, access.SECRETARIAT_PERM))


# ─── نمونهٔ ارجاع و مهلت ───────────────────────────────────────────────────────────────────────────

def referral_instance(letter):
    return _engine().instance_of(LETTER_REFERRAL_WORKFLOW, letter.pk)


def open_referrals(letter, user):
    """نمونهٔ فقط‌ارجاع نامه (تکرار امن). نامهٔ محرمانه: بی‌جانشین، پیش از نخستین کار ارجاع."""
    from workflow.models import WorkflowInstance, WorkflowTask
    engine = _engine()
    instance = engine.open_for_referral(LETTER_REFERRAL_WORKFLOW, letter, user)
    if letter.is_confidential and instance.allow_substitute:
        if WorkflowTask.objects.filter(instance=instance).exists():
            # کار ارجاعی هست: ردیف‌های جانشین با محاسبهٔ دوبارهٔ هسته برداشته می‌شوند
            instance = engine.set_allow_substitute(instance, False)
        else:
            # نمونهٔ تازه بی‌کار: ردیفی برای محاسبهٔ دوباره نیست
            WorkflowInstance.objects.filter(pk=instance.pk).update(allow_substitute=False)
            instance.allow_substitute = False
    return instance


def default_due_at(letter, now=None):
    """ن۸: مهلت پاسخ نامه اگر در آینده است، وگرنه «اکنون + default_due_days» تنظیم شرکت (۰ = بی‌مهلت)."""
    now = now or timezone.now()
    if letter.response_due_at and letter.response_due_at > now:
        return letter.response_due_at
    from settings_core.company_settings import get_company_setting

    from .settings_spec import DEFAULT_DUE_DAYS_SETTING
    try:
        days = int(get_company_setting(letter.company_id, DEFAULT_DUE_DAYS_SETTING.module,
                                       DEFAULT_DUE_DAYS_SETTING.key) or 0)
    except (TypeError, ValueError):
        days = 0
    return now + timedelta(days=days) if days > 0 else None


def _ensure_referable(letter):
    from .services.lifecycle import Conflict
    if letter.registered_at is None or letter.status not in REFERABLE_STATUSES:
        raise Conflict('فقط نامهٔ ثبت‌شده و بایگانی‌نشده ارجاع می‌شود.')


def refer_letter(user, letter, targets, *, kind, instruction='', due_at=None, parent_task=None):
    """
    ارجاع نامه (ن۷). بی parent_task و بی کار باز در این نامه = ارجاع ریشه (قلاب can_refer)؛ مهلت پیش‌فرض ن۸.
    نمونهٔ ارجاع فقط برای کسی ساخته می‌شود که ارجاع ریشه برایش مجاز است. خطاهای اجازه و گیرنده را موتور می‌دهد.
    """
    from workflow.errors import WorkflowPermissionDenied
    from workflow.models import WorkflowTask
    engine = _engine()
    _ensure_referable(letter)
    instance = referral_instance(letter)
    root = parent_task is None and (instance is None or not WorkflowTask.objects.filter(
        instance=instance, track=WorkflowTask.TRACK_REFERRAL, is_open=True,
        recipients__user_id=user.pk).exists())
    if instance is None:
        if not can_refer_letter(user, letter.pk):
            raise WorkflowPermissionDenied('refer_not_allowed', 'شما اجازهٔ ارجاع این نامه را ندارید', 403)
        instance = open_referrals(letter, user)
    if due_at is None and root:
        due_at = default_due_at(letter)
    created = engine.refer(user, instance.pk, targets, kind=kind, instruction=instruction, due_at=due_at,
                           parent_task=parent_task)
    from .services.lifecycle import audit
    audit(user, letter, 'UPDATE', event='refer', kind=kind, targets=[t.target_user_id for t in created])
    return created


# ─── ارجاع خودکار پس از ثبت ────────────────────────────────────────────────────────────────────

def _eligible_referrer(letter, actor):
    """ارجاع‌دهندهٔ خودکار: نویسنده اگر هنوز عضو فعال شرکت است، وگرنه ثبت‌کننده (آخرین امضاکننده)."""
    from workflow.recipients import company_member_pairs
    for user in (letter.author, actor):
        if user is None or not getattr(user, 'is_active', False) or user.is_superuser:
            continue
        if company_member_pairs([user.pk], [letter.company_id]):
            return user
    return None


def auto_refer_in_tx(letter, actor):
    """
    ن۷: نامهٔ داخلی و صورت‌جلسه پس از ثبت به گیرنده‌های کاربری‌اش ارجاع می‌شود؛ فقط داخل تراکنش ثبت. تکرار امن
    (کسی که ارجاع ریشه دارد دوباره نمی‌گیرد). گیرندهٔ غیرعضو یا غیرفعال کنار می‌رود (او از راه قاعدهٔ دیدن هم
    نامه را نمی‌بیند). خطای موتور ثبت را برنمی‌گرداند (savepoint)؛ گیرنده‌ها از قاعدهٔ «گیرنده» نامه را می‌بینند.
    """
    from workflow.errors import WorkflowError
    from workflow.models import WorkflowTask
    from workflow.recipients import company_member_pairs
    if letter.kind not in AUTO_REFER_KINDS or letter.registered_at is None:
        return []
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError('auto_refer_in_tx must run inside the registration transaction')
    referrer = _eligible_referrer(letter, actor)
    if referrer is None:
        return []
    by_role = {LetterRecipient.ROLE_TO: [], LetterRecipient.ROLE_CC: []}
    for uid, role in (LetterRecipient.objects.filter(letter_id=letter.pk, target_type=LetterRecipient.TARGET_USER)
                      .order_by('id').values_list('user_id', 'role')):
        if uid and uid != referrer.pk and uid not in by_role[LetterRecipient.ROLE_TO] + by_role[LetterRecipient.ROLE_CC]:
            by_role.setdefault(role, []).append(uid)
    wanted = by_role[LetterRecipient.ROLE_TO] + by_role[LetterRecipient.ROLE_CC]
    if not wanted:
        return []
    members = {u for u, _c in company_member_pairs(wanted, [letter.company_id])}
    from django.contrib.auth import get_user_model
    active = set(get_user_model().objects.filter(pk__in=members, is_active=True).values_list('pk', flat=True))
    instance = open_referrals(letter, referrer)
    already = set(WorkflowTask.objects.filter(
        instance=instance, track=WorkflowTask.TRACK_REFERRAL, parent_task__isnull=True,
    ).values_list('target_user_id', flat=True))
    due_at = default_due_at(letter)
    created = []
    for role, kind in ((LetterRecipient.ROLE_TO, REFER), (LetterRecipient.ROLE_CC, INFORM)):
        ids = [u for u in by_role.get(role, []) if u in active and u not in already]
        for start in range(0, len(ids), _engine().MAX_REFERRAL_TARGETS):
            chunk = ids[start:start + _engine().MAX_REFERRAL_TARGETS]
            try:
                with transaction.atomic():
                    created += _engine().refer(referrer, instance.pk, chunk, kind=kind, due_at=due_at)
            except WorkflowError:
                logger.warning('letters auto-referral skipped for letter %s', letter.pk, exc_info=True)
    return created


# ─── بستن ارجاع‌های باز (بایگانی و ابطال) ────────────────────────────────────────────────────────

def close_open_referrals(letter, user):
    """
    بایگانی و ابطال (ن۳): کارهای ارجاع باز نامه با نتیجهٔ «لغو» بسته می‌شوند، همان رفتار هسته برای رد قطعی و لغو
    (ر۹)؛ کار و سابقه می‌مانند. ترتیب قفل «نامه ← نمونهٔ ارجاع» است (نامه پیش‌تر قفل شده). خروجی شمار کارها.
    """
    from workflow.models import WorkflowTask
    instance = referral_instance(letter)
    if instance is None:
        return 0
    engine = _engine()
    with transaction.atomic():
        locked = engine._lock_instance(instance.pk)
        count = WorkflowTask.objects.filter(instance=locked, is_open=True, track=WorkflowTask.TRACK_REFERRAL).count()
        if count:
            engine._close_referrals(locked, user, timezone.now())
    return count


# ─── رویداد زنده (پایان ن۱۶) ─────────────────────────────────────────────────────────────────────

def involved_user_ids(letter) -> set:
    """کاربران درگیر نامه: نویسنده، هم‌نویسنده‌ها، امضاکننده‌ها، گیرنده‌های کاربری و طرف‌های درخت ارجاع."""
    from workflow.models import WorkflowTask
    ids = {letter.author_id}
    ids |= set(LetterEditor.objects.filter(letter_id=letter.pk).values_list('user_id', flat=True))
    ids |= set(LetterSigner.objects.filter(letter_id=letter.pk).values_list('user_id', flat=True))
    ids |= set(LetterRecipient.objects.filter(letter_id=letter.pk, target_type=LetterRecipient.TARGET_USER)
               .values_list('user_id', flat=True))
    for target, by in WorkflowTask.objects.filter(
            track=WorkflowTask.TRACK_REFERRAL, instance__entity_kind=LETTER_ENTITY,
            instance__entity_id=letter.pk).values_list('target_user_id', 'referred_by_id'):
        ids |= {target, by}
    ids.discard(None)
    return ids


def emit_letter_changed(letter, action='updated'):
    """
    رویداد «سند تغییر کرد» موجود (۲.۵) پس از commit: نامهٔ عادی از کانال شرکت (`broadcast_document_changed`؛ پی‌لود
    فقط شناسه و وضعیت)؛ نامهٔ محرمانه و سری فقط به کانال شخصی کاربران درگیر با همان پی‌لود، تا وجودش به بقیهٔ
    شرکت نرسد. خطا هرگز به فراخوان نمی‌رسد.
    """
    if letter.is_confidential:
        user_ids = involved_user_ids(letter)
        from accounts.middleware import get_current_client_tab_id
        payload = {
            'type': 'send_notification', 'type_str': 'document_changed', 'doc_type': LETTER_ENTITY,
            'doc_id': letter.pk, 'action': action, 'status': letter.status, 'company_id': letter.company_id,
            'section_id': None, 'client_tab_id': get_current_client_tab_id(), 'sender_id': None,
        }

        def _send():
            try:
                from asgiref.sync import async_to_sync
                from channels.layers import get_channel_layer
                layer = get_channel_layer()
                if layer is None:
                    return
                for uid in sorted(user_ids):
                    async_to_sync(layer.group_send)(f'user_{uid}', payload)
            except Exception:
                logger.warning('letters live event failed for letter %s', letter.pk, exc_info=True)

        transaction.on_commit(_send)
        return
    from companies.realtime import broadcast_document_changed
    broadcast_document_changed(LETTER_ENTITY, letter.pk, company_id=letter.company_id, status=letter.status,
                               action=action)
