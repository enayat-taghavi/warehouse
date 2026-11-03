"""
گردش امضای خطی نامه (ن۶ فاز ۱، س۱ = «الف») روی موتور گردش کار هسته.

- یک مرحلهٔ «تأیید» با قلاب `assignees` (ل-۰): امضاکننده‌های انتخاب‌شده به ترتیب، هر نفر یک کار با `target_user`.
  «امضا» همان «تأیید» موتور است و «عودت» همان «عودت برای اصلاح»؛ پس از API «کارهای من» هم کار می‌کنند.
- `fixed_missing_action='wait'`: امضای کسی هرگز خودکار رد نمی‌شود (یادداشت ل-۰).
- پایان گردش (`completed`) در همان تراکنش اقدام آخرین امضاکننده نامه را ثبت می‌کند و شماره می‌گیرد (ن۳، ن۴).
- `on_state_change(obj, 'sign')` برای کار هر امضاکننده دوباره صدا زده می‌شود؛ بی‌اثرِ تکراری است.
"""
from workflow.registry import ACT, APPROVE, CANCELLED, COMPLETED, RETURN, RETURNED, WAIT, StepSpec, WorkflowSpec

from .models import LETTER_ENTITY, Letter, LetterSigner

LETTER_SIGN_WORKFLOW = 'letters.sign'
SIGN_STEP = 'sign'
SIGNATURE_LABEL = 'signature'  # پیوست کاربر (entity_kind='user') که PDF هسته هم همان را می‌خواند


def signer_ids(letter) -> list:
    """امضاکننده‌های نامه به ترتیب انتخاب نویسنده (قلاب assignees)."""
    return list(LetterSigner.objects.filter(letter_id=letter.pk).order_by('order', 'id')
                .values_list('user_id', flat=True))


def letter_summary(letter) -> dict:
    """خلاصهٔ کار در «کارهای من»؛ موضوع نامهٔ محرمانه و سری هرگز در خلاصه نمی‌آید."""
    kind = dict(Letter.KIND_CHOICES).get(letter.kind, 'نامه')
    if letter.is_confidential:
        return {'title': f'{kind} محرمانه', 'confidential': True}
    return {'title': f'{kind}: {letter.subject}'[:300] if letter.subject else kind}


def _sync_signers(letter, instance):
    """
    امضاکننده‌هایی که در دور جاری امضا کرده‌اند (کار مرحلهٔ sign با نتیجهٔ acted از submitted_at) signed می‌شوند.
    خروجی [(LetterSigner, actor_id)] تازه امضاشده‌ها برای سابقه. بی‌اثرِ تکراری.
    """
    from workflow.models import WorkflowTask
    tasks = WorkflowTask.objects.filter(
        instance=instance, track=WorkflowTask.TRACK_STEP, step_key=SIGN_STEP, outcome=WorkflowTask.ACTED,
        target_user_id__isnull=False,
    )
    if instance.submitted_at is not None:
        tasks = tasks.filter(opened_at__gte=instance.submitted_at)
    acted = {t.target_user_id: t for t in tasks}
    fresh = []
    for signer in LetterSigner.objects.select_for_update().filter(letter_id=letter.pk, user_id__in=acted):
        if signer.status == LetterSigner.STATUS_SIGNED:
            continue
        task = acted[signer.user_id]
        signer.status = LetterSigner.STATUS_SIGNED
        signer.signed_at = task.closed_at
        signer.save(update_fields=['status', 'signed_at'])
        fresh.append((signer, task.closed_by_id))
    return fresh


def _last_closed(instance, outcome):
    from workflow.models import WorkflowTask
    return (WorkflowTask.objects.filter(instance=instance, track=WorkflowTask.TRACK_STEP, outcome=outcome)
            .order_by('-closed_at', '-pk').first())


def _user(user_id):
    if not user_id:
        return None
    from django.contrib.auth import get_user_model
    return get_user_model().objects.filter(pk=user_id).first()


def on_letter_state_change(obj, state, instance):
    """وضعیت نامه پیرو گردش (ت۲ موتور). داخل تراکنش اقدام موتور اجرا می‌شود؛ خطا کل اقدام را برمی‌گرداند."""
    from workflow.models import WorkflowTask

    from .services import lifecycle
    letter = Letter.objects.select_for_update().get(pk=obj.pk)
    if state == SIGN_STEP:
        for signer, actor_id in _sync_signers(letter, instance):
            lifecycle.audit(_user(actor_id), letter, 'APPROVE', event='sign', signer_id=signer.user_id)
        if letter.status != Letter.STATUS_SIGNING:
            lifecycle.mark_signing(letter)
    elif state == COMPLETED:
        fresh = _sync_signers(letter, instance)
        last = _last_closed(instance, WorkflowTask.ACTED)
        actor = _user(last.closed_by_id if last else None) or _user(instance.created_by_id)
        for signer, actor_id in fresh:
            lifecycle.audit(_user(actor_id), letter, 'APPROVE', event='sign', signer_id=signer.user_id)
        lifecycle.register_in_tx(letter, actor)
    elif state in (RETURNED, CANCELLED):
        last = _last_closed(instance, WorkflowTask.RETURNED) if state == RETURNED else None
        actor = _user(last.closed_by_id if last else instance.created_by_id)
        lifecycle.back_to_draft(letter, actor, event='return' if state == RETURNED else 'cancel')
    obj.status = letter.status


def can_act_letter(user, obj, task, action):
    """
    قلاب can_act (د۲ موتور): زیر قفل نمونه و کار، هم برای API نامه و هم «کارهای من».
    امضای الکترونیکی بی‌تصویر امضای امضاکننده = 400 (ن۶). امضای زنده (wet) تصویر نمی‌خواهد.
    """
    row = Letter.objects.filter(pk=getattr(obj, 'pk', None)).values('status', 'sign_mode').first()
    if row is None or row['status'] != Letter.STATUS_SIGNING:
        return 'این نامه در مرحلهٔ امضا نیست.'
    if action == ACT and row['sign_mode'] == Letter.SIGN_ELECTRONIC:
        signer_id = task.target_user_id or getattr(user, 'pk', None)
        if not has_signature_image(signer_id):
            return 'برای امضای الکترونیکی، نخست تصویر امضای امضاکننده را در پروفایل بارگذاری کنید.'
    return None


def has_signature_image(user_id) -> bool:
    if not user_id:
        return False
    from attachments.models import Attachment
    return Attachment.objects.filter(entity_kind='user', entity_id=str(user_id), label=SIGNATURE_LABEL,
                                     archived_at__isnull=True, status=Attachment.STATUS_ACCEPTED).exists()


# برچسب نقش کار امضا. هسته نقش را فقط از اعلام ماژول‌ها می‌شناسد؛ نامه‌ها بی‌حسابداری هم نصب می‌شوند، پس همان
# کلید را با همان برچسب و رتبه اعلام می‌کنیم (اعلام تکراری یکسان مجاز است؛ ناهمخوانی ValueError می‌دهد).
LETTER_SIGN_ROLES = (('employee', 'کارمند / اپراتور ثبت', 10),)

LETTER_SIGN_WORKFLOW_SPEC = WorkflowSpec(
    key=LETTER_SIGN_WORKFLOW,
    version=1,
    entity_kind=LETTER_ENTITY,
    title_fa='امضای نامه',
    steps=(
        # نقش و مجوز فقط برچسب کارند (ل-۰)؛ اقدام فقط با امضاکنندهٔ انتخاب‌شده یا جانشین مجازش
        StepSpec(SIGN_STEP, 'امضای نامه', 'employee', 'perm_letters_compose', APPROVE, actions=(ACT, RETURN),
                 fixed_missing_action=WAIT, assignees=signer_ids),
    ),
    on_state_change=on_letter_state_change,
    summary=letter_summary,
    route='/app/letters/{id}',
    section_field=None,
    company_field='company',
)
