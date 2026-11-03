"""
API نامه‌ها (ل-ج): فهرست، ساخت، جزئیات، ویرایش پیش‌نویس، قفل ویرایش، کنار گذاشتن، دفتر دبیرخانه،
طرف‌های بیرونی، نوع‌های قابل پیوند و پروژه‌ها.

- کاربر شرکت دیگر یا کسی که نامه را نمی‌بیند روی هر مسیر نامه 404 می‌گیرد (وجود نامه لو نمی‌رود).
- بی‌از‌دست‌رفتن داده (ن۱۱): ویرایشی که با نسخهٔ سرور برخورد کند (revision کهنه، قفل دیگری، نامهٔ دیگر پیش‌نویس
  نیست) رد نمی‌شود: متن رسیده در LetterDraftCopy نگه داشته می‌شود و پاسخ 200 با conflict است. در هر 4xx دیگرِ
  ویرایش نامهٔ موجود هم متن رسیده نگه داشته می‌شود. هیچ نامه‌ای حذف واقعی نمی‌شود (کنار گذاشتن = void).
- مدیر کل فقط می‌خواند: حصار مرکزی SUPERUSER_WRITE_FENCE در module.py.
"""
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit_utils import log_audit_event
from platform_core.registry import record_entity_view

from . import access
from .links import link_kinds, validate_link
from .models import (
    LETTER_ENTITY, Letter, LetterDraftCopy, LetterEditor, LetterLink, LetterRecipient, LetterSigner, Secretariat,
)
from .parties import can_create_party, get_or_create_party, parties_for, party_payload
from .permissions import LettersPermission
from .serializers import (
    LetterDetailSerializer, LetterListSerializer, LetterWriteSerializer, register_row,
)

EDIT_LOCK_MINUTES = 15
TEXT_FIELDS = ('subject', 'body')
# از ثبت به بعد (و در امضا) قفل‌اند (ن۳)؛ فقط پروژه (بایگانی) پس از ثبت عوض می‌شود
LOCKED_FIELDS = ('kind', 'subject', 'body', 'confidentiality', 'sign_mode', 'recipients', 'signers', 'editors',
                 'links', 'external_number', 'external_date', 'sender_party', 'follow_up_of', 'reply_to',
                 'response_due_at')
SCALAR_FIELDS = ('subject', 'body', 'confidentiality', 'sign_mode', 'external_number', 'external_date',
                 'response_due_at')
FK_FIELDS = ('sender_party', 'follow_up_of', 'reply_to', 'project')
MAX_COPY_JSON = 400_000


def _audit(user, letter, action, **details):
    log_audit_event(
        module='letters', action=action, target_model='Letter', target_object_id=str(letter.pk),
        target_repr=letter.number_display or f'نامه #{letter.pk}', user=user, company_id=letter.company_id,
        details={'entity_kind': LETTER_ENTITY, 'status': letter.status, **details},
    )


def _int(value):
    try:
        value = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _visible_or_404(user, pk, for_update=False):
    """نامهٔ دیدنی؛ وگرنه 404 (کاربر شرکت دیگر هم 404 می‌گیرد)."""
    qs = access.visible_letters(user, Letter.objects.filter(pk=pk))
    if not qs.exists():
        from django.http import Http404
        raise Http404
    return Letter.objects.select_for_update().get(pk=pk) if for_update else Letter.objects.get(pk=pk)


def _detail(letter, user, **extra):
    letter = (Letter.objects.select_related('author', 'project', 'edit_locked_by')
              .prefetch_related('recipients__party', 'signers__user', 'editors__user', 'links', 'draft_copies')
              .get(pk=letter.pk))
    data = LetterDetailSerializer(letter, context={'viewer': user, 'can_edit': access.is_editor(user, letter)}).data
    data.update(extra)
    return data


# ─── هم‌شرکتی بودن ارجاع‌ها (ن۲، ن۱۳) ──────────────────────────────────────────────────────────

def _check_refs(user, company_id, data):
    """همهٔ شناسه‌های ورودی باید از همان شرکت نامه باشند؛ خطا = 400 با پیام فارسی."""
    from companies.models import Project, ProjectSection
    from contacts.models import ExternalParty
    from workflow.recipients import company_member_pairs

    errors = {}
    if data.get('project') and not Project.objects.filter(pk=data['project'], company_id=company_id).exists():
        errors['project'] = 'پروژه از شرکت این نامه نیست.'
    if data.get('sender_party') and not ExternalParty.objects.filter(
            pk=data['sender_party'], company_id=company_id).exists():
        errors['sender_party'] = 'فرستنده از طرف‌های بیرونی این شرکت نیست.'
    for field in ('follow_up_of', 'reply_to'):
        if data.get(field) and not access.visible_letters(user).filter(
                pk=data[field], company_id=company_id, registered_at__isnull=False).exists():
            errors[field] = 'فقط نامهٔ ثبت‌شدهٔ همین شرکت که می‌بینید پذیرفته است.'

    recipients = data.get('recipients') or []
    party_ids = {r['party'] for r in recipients if r['target_type'] == LetterRecipient.TARGET_PARTY}
    if party_ids and ExternalParty.objects.filter(pk__in=party_ids, company_id=company_id).count() != len(party_ids):
        errors['recipients'] = 'طرف بیرونی گیرنده از این شرکت نیست.'
    section_ids = {r['section_id'] for r in recipients if r['target_type'] == LetterRecipient.TARGET_SECTION}
    if section_ids and ProjectSection.objects.filter(
            pk__in=section_ids, project__company_id=company_id).count() != len(section_ids):
        errors['recipients'] = 'بخش گیرنده از این شرکت نیست.'

    people = {r['user'] for r in recipients if r['target_type'] == LetterRecipient.TARGET_USER}
    people |= {s['user'] for s in data.get('signers') or []}
    people |= set(data.get('editors') or [])
    if people:
        active = set(get_user_model().objects.filter(pk__in=people, is_active=True).values_list('pk', flat=True))
        members = {uid for uid, _c in company_member_pairs(list(active), [company_id])}
        if members != people:
            errors['users'] = 'هر کاربر گیرنده، امضاکننده یا هم‌نویسنده باید عضو فعال همین شرکت باشد.'

    links = []
    for link in data.get('links') or []:
        try:
            links.append(validate_link(user, company_id, link['entity_kind'], link['entity_id']))
        except ValueError as exc:
            errors['links'] = str(exc)
            break
    if errors:
        raise ValidationError(errors)
    return links


def _apply(letter, data, user, links):
    for field in SCALAR_FIELDS:
        if field in data:
            setattr(letter, field, data[field])
    for field in FK_FIELDS:
        if field in data:
            setattr(letter, f'{field}_id', data[field])
    letter.save()
    # فهرست‌های پیش‌نویس با ویرایش صریح کاربر جایگزین می‌شوند (فقط در پیش‌نویس؛ نامهٔ ثبت‌شده قفل است)
    if 'recipients' in data:
        LetterRecipient.objects.filter(letter=letter).delete()
        LetterRecipient.objects.bulk_create([
            LetterRecipient(letter=letter, order=i, role=r['role'], target_type=r['target_type'],
                            user_id=r.get('user') if r['target_type'] == 'user' else None,
                            section_id=r.get('section_id') if r['target_type'] == 'section' else None,
                            party_id=r.get('party') if r['target_type'] == 'party' else None,
                            name_text=r.get('name_text', ''), title_text=r.get('title_text', ''))
            for i, r in enumerate(data['recipients'])])
    if 'signers' in data:
        if LetterSigner.objects.filter(letter=letter).exclude(status=LetterSigner.STATUS_PENDING).exists():
            raise ValidationError({'signers': 'امضاکننده‌ای که اقدام کرده است عوض نمی‌شود.'})
        LetterSigner.objects.filter(letter=letter).delete()
        LetterSigner.objects.bulk_create([
            LetterSigner(letter=letter, user_id=s['user'], order=i, title_text=s.get('title_text', ''))
            for i, s in enumerate(data['signers'])])
    if 'editors' in data:
        if letter.author_id != user.pk:
            raise PermissionDenied('فقط نویسنده هم‌نویسنده‌ها را تعیین می‌کند.')
        wanted = set(data['editors']) - {letter.author_id}
        LetterEditor.objects.filter(letter=letter).exclude(user_id__in=wanted).delete()
        have = set(LetterEditor.objects.filter(letter=letter).values_list('user_id', flat=True))
        LetterEditor.objects.bulk_create([LetterEditor(letter=letter, user_id=u) for u in wanted - have])
    if 'links' in data:
        keep = {(k, i) for k, i, _t in links}
        for link in LetterLink.objects.filter(letter=letter):
            if (link.entity_kind, link.entity_id) not in keep:
                link.delete()
        have = set(LetterLink.objects.filter(letter=letter).values_list('entity_kind', 'entity_id'))
        LetterLink.objects.bulk_create([
            LetterLink(letter=letter, entity_kind=k, entity_id=i, title_snapshot=t, created_by=user)
            for k, i, t in links if (k, i) not in have])


def _keep_copy(letter, user, raw, reason):
    """متن رسیده را در LetterDraftCopy نگه می‌دارد (ن۱۱)؛ اگر متنی نیامده باشد None.

    فقط برای نویسنده و هم‌نویسنده: بیننده‌ای که حق ویرایش ندارد نسخه در دید نویسنده نمی‌گذارد (403 می‌گیرد).
    """
    if not isinstance(raw, dict) or not any(f in raw for f in TEXT_FIELDS) or not access.is_editor(user, letter):
        return None
    subject = raw.get('subject', letter.subject)
    body = raw.get('body', letter.body)
    try:
        if len(json.dumps(body, ensure_ascii=False)) > MAX_COPY_JSON:
            body = []
    except (TypeError, ValueError):
        body = []
    copy = LetterDraftCopy.objects.create(letter=letter, subject=str(subject or '')[:500], body=body,
                                          created_by=user, reason=reason[:64])
    return copy.pk


def _conflict(letter, user, raw, reason):
    copy_id = _keep_copy(letter, user, raw, reason)
    _audit(user, letter, 'UPDATE', event='conflict', reason=reason, draft_copy_id=copy_id)
    return Response(_detail(letter, user, conflict=True, conflict_reason=reason, draft_copy_id=copy_id))


def _lock_active(letter, now=None):
    now = now or timezone.now()
    return bool(letter.edit_locked_by_id and letter.edit_locked_until and letter.edit_locked_until > now)


# ─── فهرست و ساخت ────────────────────────────────────────────────────────────────────────────

class LetterListCreateView(ListAPIView):
    permission_classes = (IsAuthenticated, LettersPermission)
    serializer_class = LetterListSerializer

    def get_queryset(self):
        qs = access.visible_letters(self.request.user).select_related('author', 'project', 'edit_locked_by')
        params = self.request.query_params
        for key in ('kind', 'status', 'confidentiality'):
            if params.get(key):
                qs = qs.filter(**{key: params[key]})
        for key in ('company', 'project'):
            if params.get(key):
                qs = qs.filter(**{f'{key}_id': _int(params[key]) or 0})
        term = str(params.get('q') or '').strip()
        if term:
            qs = qs.filter(Q(subject__icontains=term) | Q(number_display__icontains=term)
                           | Q(external_number__icontains=term))
        due = params.get('due')
        if due in ('overdue', 'today'):
            now = timezone.now()
            if due == 'overdue':
                qs = qs.filter(response_due_at__lt=now)
            else:
                qs = qs.filter(response_due_at__date=timezone.localdate())
        return qs.order_by('-created_at', '-id')

    def post(self, request):
        user = request.user
        raw = request.data if isinstance(request.data, dict) else {}
        temp_id = raw.get('client_temp_id')
        if temp_id:
            existing = Letter.objects.filter(author_id=user.pk, client_temp_id=_uuid(temp_id)).first()
            if existing is not None:
                if not access.visible_letters(user).filter(pk=existing.pk).exists():
                    raise PermissionDenied('دسترسی شما به این نامه برداشته شده است.')
                return Response(_detail(existing, user, duplicate=True), status=status.HTTP_200_OK)

        ser = LetterWriteSerializer(data=raw)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        kind = data.get('kind')
        if not kind:
            raise ValidationError({'kind': 'نوع نامه لازم است.'})
        from companies.access import get_request_company_id
        company_id = data.get('company') or _int(get_request_company_id(request))
        if not company_id or company_id not in access.member_company_ids(user):
            raise PermissionDenied('شما عضو این شرکت نیستید.')
        perm = {Letter.KIND_INCOMING: access.SECRETARIAT_PERM,
                Letter.KIND_CIRCULAR: access.CIRCULAR_PERM}.get(kind, access.COMPOSE_PERM)
        if not access.has_company_perm(user, company_id, perm):
            raise PermissionDenied('مجوز نوشتن این نوع نامه را در این شرکت ندارید.')
        links = _check_refs(user, company_id, data)
        try:
            with transaction.atomic():
                if kind == Letter.KIND_INCOMING:
                    Secretariat.objects.get_or_create(company_id=company_id)
                letter = Letter.objects.create(
                    company_id=company_id, kind=kind, author=user, client_temp_id=data.get('client_temp_id'),
                    status=Letter.STATUS_RECEIVED if kind == Letter.KIND_INCOMING else Letter.STATUS_DRAFT)
                _apply(letter, data, user, links)
        except IntegrityError:
            existing = Letter.objects.filter(author_id=user.pk, client_temp_id=data.get('client_temp_id')).first()
            if existing is None or not data.get('client_temp_id'):
                raise
            return Response(_detail(existing, user, duplicate=True), status=status.HTTP_200_OK)
        _audit(user, letter, 'CREATE', kind=kind)
        return Response(_detail(letter, user), status=status.HTTP_201_CREATED)


def _uuid(value):
    import uuid
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise ValidationError({'client_temp_id': 'شناسهٔ موقت نادرست است.'})


# ─── جزئیات و ویرایش ─────────────────────────────────────────────────────────────────────────

class LetterDetailView(APIView):
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request, pk):
        letter = _visible_or_404(request.user, pk)
        if letter.is_confidential:
            record_entity_view(request.user, LETTER_ENTITY, letter.pk, letter.company_id)
        return Response(_detail(letter, request.user))

    def patch(self, request, pk):
        user = request.user
        raw = request.data if isinstance(request.data, dict) else {}
        with transaction.atomic():
            letter = _visible_or_404(user, pk, for_update=True)
            try:
                # savepoint: تغییرِ نیمه‌کارهٔ ویرایشِ ردشده برمی‌گردد، ولی نسخهٔ ناهمگامِ پایین می‌ماند
                with transaction.atomic():
                    return self._patch(user, letter, raw)
            except (ValidationError, PermissionDenied) as exc:
                error = exc
            letter.refresh_from_db()
            # متن رسیده هرگز گم نمی‌شود، حتی وقتی ویرایش رد می‌شود (ن۱۱)
            copy_id = _keep_copy(letter, user, raw, 'refused')
        if copy_id:
            error.detail = ({**error.detail, 'draft_copy_id': copy_id} if isinstance(error.detail, dict)
                            else {'detail': error.detail, 'draft_copy_id': copy_id})
        raise error

    def _patch(self, user, letter, raw):
        ser = LetterWriteSerializer(data=raw, partial=True)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        data.pop('company', None)
        data.pop('client_temp_id', None)
        if 'kind' in data and data['kind'] != letter.kind:
            raise ValidationError({'kind': 'نوع نامه پس از ساخت عوض نمی‌شود.'})
        data.pop('kind', None)
        revision = data.pop('revision', None)

        editor = access.is_editor(user, letter)
        if letter.status not in access.EDITABLE_STATUSES:
            return self._patch_locked_letter(user, letter, raw, data, editor)
        if not editor:
            raise PermissionDenied('فقط نویسنده و هم‌نویسنده‌ها پیش‌نویس را ویرایش می‌کنند.')
        now = timezone.now()
        if _lock_active(letter, now) and letter.edit_locked_by_id != user.pk:
            return _conflict(letter, user, raw, 'edit_locked')
        if revision is None:
            raise ValidationError({'revision': 'نسخهٔ نامه (revision) لازم است.'})
        if revision != letter.revision:
            return _conflict(letter, user, raw, 'stale_revision')
        links = _check_refs(user, letter.company_id, data)
        _apply(letter, data, user, links)
        letter.revision += 1
        fields = ['revision', 'updated_at']
        if letter.edit_locked_by_id == user.pk:
            letter.edit_locked_until = now + timedelta(minutes=EDIT_LOCK_MINUTES)
            fields.append('edit_locked_until')
        letter.save(update_fields=fields)
        _audit(user, letter, 'UPDATE', fields=sorted(data), revision=letter.revision)
        return Response(_detail(letter, user, conflict=False))

    def _patch_locked_letter(self, user, letter, raw, data, editor):
        """نامهٔ در امضا، ثبت‌شده یا باطل: متن رسیده نسخهٔ ناهمگام می‌شود؛ بقیهٔ فیلدهای قفل 400؛ فقط پروژه آزاد."""
        locked = [f for f in data if f in LOCKED_FIELDS]
        if locked and set(locked) <= set(TEXT_FIELDS):
            if not editor:
                raise PermissionDenied('فقط نویسنده و هم‌نویسنده‌ها متن نامه را ویرایش می‌کنند.')
            return _conflict(letter, user, raw, 'not_draft')
        if locked:
            raise ValidationError({f: 'این نامه دیگر پیش‌نویس نیست و این بخش قفل است.' for f in locked})
        if 'project' not in data:
            return Response(_detail(letter, user, conflict=False))
        if letter.status == Letter.STATUS_VOID or not (
                editor or access.has_company_perm(user, letter.company_id, access.SECRETARIAT_PERM)):
            raise PermissionDenied('تغییر پروژهٔ این نامه برای شما مجاز نیست.')
        _check_refs(user, letter.company_id, {'project': data['project']})
        letter.project_id = data['project']
        letter.revision += 1
        letter.save(update_fields=['project', 'revision', 'updated_at'])
        _audit(user, letter, 'UPDATE', fields=['project'], revision=letter.revision)
        return Response(_detail(letter, user, conflict=False))


class _LetterActionView(APIView):
    permission_classes = (IsAuthenticated, LettersPermission)

    def post(self, request, pk):
        with transaction.atomic():
            letter = _visible_or_404(request.user, pk, for_update=True)
            return self.act(request, letter)


class LetterLockView(_LetterActionView):
    """قفل ویرایش نوبتی ۱۵ دقیقه‌ای (ن۱۰، س۲)؛ گرفتن دوباره تمدید است."""

    def act(self, request, letter):
        user = request.user
        if letter.status not in access.EDITABLE_STATUSES or not access.is_editor(user, letter):
            raise PermissionDenied('این نامه برای شما ویرایش‌پذیر نیست.')
        now = timezone.now()
        if _lock_active(letter, now) and letter.edit_locked_by_id != user.pk:
            return Response(_detail(letter, user, locked_by_other=True), status=status.HTTP_409_CONFLICT)
        letter.edit_locked_by = user
        letter.edit_locked_until = now + timedelta(minutes=EDIT_LOCK_MINUTES)
        letter.save(update_fields=['edit_locked_by', 'edit_locked_until'])
        return Response(_detail(letter, user))


class LetterUnlockView(_LetterActionView):
    def act(self, request, letter):
        user = request.user
        if _lock_active(letter) and letter.edit_locked_by_id != user.pk:
            return Response(_detail(letter, user, locked_by_other=True), status=status.HTTP_409_CONFLICT)
        if letter.edit_locked_by_id:
            letter.edit_locked_by = None
            letter.edit_locked_until = None
            letter.save(update_fields=['edit_locked_by', 'edit_locked_until'])
        return Response(_detail(letter, user))


class LetterDiscardView(_LetterActionView):
    """کنار گذاشتن پیش‌نویسِ هرگز ثبت‌نشده: وضعیت void، بی‌شماره؛ هیچ ردیفی حذف نمی‌شود."""

    def act(self, request, letter):
        user = request.user
        if letter.status == Letter.STATUS_VOID and letter.registered_at is None:
            return Response(_detail(letter, user))
        if letter.author_id != user.pk:
            raise PermissionDenied('فقط نویسنده پیش‌نویس را کنار می‌گذارد.')
        if letter.status not in access.EDITABLE_STATUSES or letter.registered_at or letter.issued_number_id:
            raise ValidationError({'status': 'فقط پیش‌نویسِ ثبت‌نشده کنار گذاشته می‌شود.'})
        letter.status = Letter.STATUS_VOID
        letter.voided_at = timezone.now()
        letter.voided_by = user
        letter.void_reason = str((request.data or {}).get('reason') or 'کنار گذاشته شد')[:1000]
        letter.edit_locked_by = None
        letter.edit_locked_until = None
        letter.revision += 1
        letter.save()
        _audit(user, letter, 'UPDATE', event='discard')
        return Response(_detail(letter, user))


# ─── دفتر دبیرخانه، پروژه‌ها، طرف‌ها و نوع‌های پیوند ─────────────────────────────────────────────

def _company_param(request, required=True):
    from companies.access import get_request_company_id
    company_id = _int(get_request_company_id(request))
    if required and not company_id:
        raise ValidationError({'company': 'شرکت را مشخص کنید.'})
    return company_id


class SecretariatRegisterView(APIView):
    """دفتر دبیرخانه (ن۹): نامهٔ محرمانه و سری فقط با شماره، تاریخ و «نامهٔ محرمانه»."""
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request):
        user = request.user
        company_id = _company_param(request)
        if not user.is_superuser and (company_id not in access.member_company_ids(user)
                                      or not access.has_company_perm(user, company_id, access.SECRETARIAT_PERM)):
            raise PermissionDenied('دفتر دبیرخانهٔ این شرکت برای شما باز نیست.')
        rows = list(Letter.objects.filter(company_id=company_id)
                    .filter(Q(registered_at__isnull=False) | Q(kind=Letter.KIND_INCOMING))
                    .select_related('author').order_by('-registered_at', '-id')[:500])
        full = set(access.visible_letters(user, Letter.objects.filter(pk__in=[r.pk for r in rows]))
                   .values_list('pk', flat=True))
        return Response([register_row(r, r.pk in full) for r in rows])


class LetterProjectsView(APIView):
    """پروژه‌های شرکت با شمار نامه‌هایی که کاربر می‌بیند (پروژه دسترسی نمی‌دهد)."""
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request):
        from companies.models import Project
        user = request.user
        companies = access.member_company_ids(user)
        company_id = _company_param(request, required=False)
        if company_id:
            companies = companies & {company_id} if not user.is_superuser else {company_id}
        counts = dict(access.visible_letters(user).filter(project__isnull=False, company_id__in=companies)
                      .values('project_id').annotate(n=Count('id')).values_list('project_id', 'n'))
        projects = Project.objects.filter(company_id__in=companies).order_by('company_id', 'name', 'id')
        return Response([{'id': p.pk, 'company': p.company_id, 'code': p.code, 'name': p.name,
                          'is_active': p.is_active, 'letter_count': counts.get(p.pk, 0)} for p in projects])


class LinkKindsView(APIView):
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request):
        return Response(link_kinds())


class PartiesView(APIView):
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request):
        company_id = _company_param(request)
        parties = parties_for(request.user, company_id, request.query_params.get('q'))
        return Response([party_payload(request.user, p) for p in parties])

    def post(self, request):
        user = request.user
        raw = request.data if isinstance(request.data, dict) else {}
        company_id = _int(raw.get('company')) or _company_param(request)
        if not can_create_party(user, company_id):
            raise PermissionDenied('ساخت طرف بیرونی در این شرکت برای شما مجاز نیست.')
        try:
            party, created = get_or_create_party(user, company_id, raw)
        except ValueError as exc:
            raise ValidationError({'detail': str(exc)})
        return Response(party_payload(user, party), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


__all__ = [
    'LetterListCreateView', 'LetterDetailView', 'LetterLockView', 'LetterUnlockView', 'LetterDiscardView',
    'SecretariatRegisterView', 'LetterProjectsView', 'LinkKindsView', 'PartiesView', 'get_object_or_404',
]
