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

from platform_core.registry import record_entity_view

from . import access
from .services import lifecycle
from .links import link_kinds, validate_link
from .models import (
    LETTER_ENTITY, Letter, LetterDraftCopy, LetterEditor, LetterLink, LetterRecipient, LetterSigner, Secretariat,
)
from .parties import can_create_party, get_or_create_party, parties_for, party_payload
from .permissions import LettersPermission
from .serializers import (
    LetterDetailSerializer, LetterListSerializer, LetterWriteSerializer, register_row, validate_body,
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
    lifecycle.audit(user, letter, action, **details)


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
              .prefetch_related('recipients__party', 'recipients__user', 'signers__user', 'editors__user', 'links',
                                'draft_copies')
              .get(pk=letter.pk))
    data = LetterDetailSerializer(letter, context={'viewer': user, 'can_edit': access.is_editor(user, letter)}).data
    data['actions'] = allowed_actions(user, letter)
    data.update(extra)
    return data


def allowed_actions(user, letter):
    """
    کنش‌هایی که همین الان برای کاربر مجازند (ل-ز، فقط برای نمایش دکمه‌ها). همان قاعده‌های `lifecycle` و `referral`؛
    خود کنش‌ها همهٔ قاعده‌ها را دوباره در تراکنش می‌سنجند. مدیر کل فقط می‌خواند (بی‌کنش).
    """
    from .referral import REFERABLE_STATUSES, may_root_refer, referral_instance
    if not access._live(user) or user.is_superuser:
        return []
    out = []
    st = letter.status
    editor = access.is_editor(user, letter)
    secretariat = lifecycle._is_secretariat(user, letter)
    if editor and st in access.EDITABLE_STATUSES:
        out.append('edit')
    if editor and st == Letter.STATUS_DRAFT and letter.kind in lifecycle.SIGNABLE_KINDS:
        out.append('submit')
    if st == Letter.STATUS_SIGNING:
        engine, key = lifecycle._workflow()
        task = engine.open_task(key, letter.pk)
        if task is not None and engine.can_act(user, task):
            out += ['sign', 'return']
    if (letter.kind == Letter.KIND_INCOMING and st == Letter.STATUS_RECEIVED and secretariat
            and not letter.issued_number_id):
        out.append('register')
    if letter.kind == Letter.KIND_OUTGOING and st == Letter.STATUS_REGISTERED and secretariat:
        out.append('send')
    if lifecycle._can_archive(user, letter):
        if st in lifecycle.ARCHIVABLE:
            out.append('archive')
        elif st == Letter.STATUS_ARCHIVED:
            out.append('unarchive')
    if st != Letter.STATUS_VOID:
        if st in lifecycle.VOIDABLE_REGISTERED or letter.issued_number_id:
            may_void = secretariat
        elif st in access.EDITABLE_STATUSES:
            may_void = secretariat or (letter.author_id == user.pk
                                       and letter.company_id in access.member_company_ids(user))
        else:
            may_void = False
        if may_void:
            out.append('void')
    if letter.registered_at and st in REFERABLE_STATUSES:
        from workflow.models import WorkflowTask
        instance = referral_instance(letter)
        mine = instance is not None and WorkflowTask.objects.filter(
            instance=instance, track=WorkflowTask.TRACK_REFERRAL, is_open=True, target_user_id=user.pk).exists()
        if mine or may_root_refer(user, letter.pk):
            out.append('refer')
    return out


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

def _date(value, name):
    from django.utils.dateparse import parse_date
    if value in (None, ''):
        return None
    try:
        parsed = parse_date(str(value).strip()[:10])
    except ValueError:
        parsed = None
    if parsed is None:
        raise ValidationError({name: 'تاریخ نامعتبر است (YYYY-MM-DD).'})
    return parsed


def _personal_filters(user, qs, params):
    """
    فیلترهای ل-ز روی همان queryset دیدنی (هرگز دیدن را گسترده نمی‌کنند): mine (نویسنده یا هم‌نویسنده)، to_me
    (گیرندهٔ کاربری یا در درخت ارجاع نامه)، date_from/date_to (تاریخ ثبت) و party (طرف بیرونی فرستنده یا گیرنده).
    """
    if params.get('mine') in ('1', 'true'):
        qs = qs.filter(Q(author_id=user.pk)
                       | Q(pk__in=LetterEditor.objects.filter(user_id=user.pk).values('letter_id')))
    if params.get('to_me') in ('1', 'true'):
        _open, referrals, _acted = access._workflow_letter_ids(user)
        qs = qs.filter(Q(pk__in=LetterRecipient.objects.filter(target_type=LetterRecipient.TARGET_USER,
                                                              user_id=user.pk).values('letter_id'))
                       | Q(pk__in=referrals))
    date_from = _date(params.get('date_from'), 'date_from')
    date_to = _date(params.get('date_to'), 'date_to')
    if date_from:
        qs = qs.filter(registered_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(registered_at__date__lte=date_to)
    if params.get('party'):
        party = _int(params['party']) or 0
        qs = qs.filter(Q(sender_party_id=party)
                       | Q(pk__in=LetterRecipient.objects.filter(party_id=party).values('letter_id')))
    return qs


class LetterListCreateView(ListAPIView):
    permission_classes = (IsAuthenticated, LettersPermission)
    serializer_class = LetterListSerializer

    def get_queryset(self):
        from django.db.models import Prefetch
        qs = (access.visible_letters(self.request.user).select_related('author', 'project', 'edit_locked_by')
              .prefetch_related(Prefetch('recipients',
                                         queryset=LetterRecipient.objects.select_related('user', 'party'))))
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
        qs = _personal_filters(self.request.user, qs, params)
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
                return _replay_create(user, existing, raw)

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
            return _replay_create(user, existing, raw)
        _audit(user, letter, 'CREATE', kind=kind)
        return Response(_detail(letter, user), status=status.HTTP_201_CREATED)


CREATE_BASE_REVISION = 1


def _same_text(letter, raw):
    try:
        body = validate_body(raw.get('body')) if 'body' in raw else (letter.body or [])
    except ValidationError:
        return False
    subject = raw['subject'] if 'subject' in raw else letter.subject
    return subject == letter.subject and body == (letter.body or [])


def _replay_create(user, existing, raw):
    """
    POST دوباره با همان client_temp_id (پخش دوبارهٔ صف، ل-ز): بدنه مثل PATCH اعمال می‌شود تا متن تازه‌تری که در صف
    جایگزین شده گم نشود. پایهٔ نسخه، نسخهٔ ساخت (۱) است؛ اگر نامه از آن پس عوض شده، متن رسیده نسخهٔ ناهمگام
    می‌شود (conflict). پخش دوبارهٔ همان متن بی‌تغییر و بی‌نسخهٔ ناهمگام برمی‌گردد.
    """
    base = _int(raw.get('revision')) or CREATE_BASE_REVISION
    if base != existing.revision and _same_text(existing, raw):
        return Response(_detail(existing, user, duplicate=True), status=status.HTTP_200_OK)
    payload = {k: v for k, v in raw.items() if k not in ('company', 'client_temp_id')}
    if base != existing.revision:
        # پروژه در نامهٔ قفل‌شده بی‌بررسی نسخه نوشته می‌شود؛ پخش کهنه نباید پروژهٔ تازه‌تر را برگرداند
        payload.pop('project', None)
    payload['revision'] = base
    response = LetterDetailView().patch_raw(user, existing.pk, payload)
    response.data['duplicate'] = True
    return response


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
        # «چه کسی دید»: نامهٔ محرمانه (ن۹) و بخشنامه برای خوانده/نخوانده (ن۱۸)
        if letter.is_confidential or (letter.kind == Letter.KIND_CIRCULAR and letter.registered_at):
            record_entity_view(request.user, LETTER_ENTITY, letter.pk, letter.company_id)
        return Response(_detail(letter, request.user))

    def patch(self, request, pk):
        raw = request.data if isinstance(request.data, dict) else {}
        return self.patch_raw(request.user, pk, raw)

    def patch_raw(self, user, pk, raw):
        """ویرایش پیش‌نویس؛ در هر رد متن رسیده نسخهٔ ناهمگام می‌شود (ن۱۱). مشترک PATCH و پخش دوبارهٔ ساخت (ل-ز)."""
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
        return Response(register_rows(request))


def register_rows(request):
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
    return [register_row(r, r.pk in full) for r in rows]


class SecretariatRegisterExportView(APIView):
    """GET /api/letters/register/export/?company= — خروجی اکسل دفتر (ل-ز، AGENTS §3): دو ردیف سربرگ، تاریخ شمسی."""
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request):
        from .register_excel import register_workbook_response
        return register_workbook_response(register_rows(request))


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


# ─── چرخهٔ نامه (ل-د): ارسال برای امضا، امضا، عودت، ثبت، ارسال، بایگانی و ابطال ─────────────────

class _LifecycleView(APIView):
    """
    کنش چرخه. نامهٔ نادیدنی 404. خطای موتور گردش با همان کد و وضعیت موتور برمی‌گردد.
    lock_letter=False برای امضا و عودت: ترتیب قفل «نمونهٔ گردش ← نامه» است (قلاب موتور نامه را قفل می‌کند).
    """
    permission_classes = (IsAuthenticated, LettersPermission)
    lock_letter = True

    def post(self, request, pk):
        from workflow.errors import WorkflowError
        raw = request.data if isinstance(request.data, dict) else {}
        try:
            with transaction.atomic():
                letter = _visible_or_404(request.user, pk, for_update=self.lock_letter)
                letter = self.act(request.user, letter, raw)
        except WorkflowError as exc:
            return Response(exc.as_dict(), status=exc.status)
        return Response(_detail(letter, request.user))


class LetterSubmitView(_LifecycleView):
    def act(self, user, letter, raw):
        return lifecycle.submit_for_signing(user, letter)


class LetterSignView(_LifecycleView):
    lock_letter = False

    def act(self, user, letter, raw):
        return lifecycle.sign(user, letter, reason=raw.get('reason', ''), revision=_int(raw.get('task_revision')))


class LetterReturnView(_LifecycleView):
    lock_letter = False

    def act(self, user, letter, raw):
        return lifecycle.return_for_fix(user, letter, raw.get('reason'), revision=_int(raw.get('task_revision')))


class LetterRegisterView(_LifecycleView):
    def act(self, user, letter, raw):
        return lifecycle.register_incoming(user, letter)


class LetterSendView(_LifecycleView):
    def act(self, user, letter, raw):
        sent_at = None
        if raw.get('sent_at'):
            from django.utils.dateparse import parse_datetime
            sent_at = parse_datetime(str(raw['sent_at']))
            if sent_at is None:
                raise ValidationError({'sent_at': 'زمان ارسال نامعتبر است.'})
            if timezone.is_naive(sent_at):
                sent_at = timezone.make_aware(sent_at)
        return lifecycle.send(user, letter, str(raw.get('method') or ''), sent_at)


class LetterArchiveView(_LifecycleView):
    def act(self, user, letter, raw):
        return lifecycle.archive(user, letter)


class LetterUnarchiveView(_LifecycleView):
    def act(self, user, letter, raw):
        return lifecycle.unarchive(user, letter)


class LetterVoidView(_LifecycleView):
    def act(self, user, letter, raw):
        return lifecycle.void(user, letter, raw.get('reason'))


# ─── ل-ه: ارجاع، بخشنامه و «چه کسی دید» ───────────────────────────────────────────────────────────

class LetterReferView(APIView):
    """
    POST /api/letters/<id>/refer/ {targets, kind=refer|inform, instruction, due_at, parent_task} (ن۷).
    نامهٔ نادیدنی 404؛ بی‌اجازهٔ ارجاع 403 (نامه را می‌بیند، پس وجودش لو نمی‌رود). ارجاع ریشه مهلت پیش‌فرض ن۸ دارد.
    """
    permission_classes = (IsAuthenticated, LettersPermission)

    def post(self, request, pk):
        from workflow.errors import WorkflowError
        from workflow.views import _parse_due_at

        from .referral import refer_letter
        raw = request.data if isinstance(request.data, dict) else {}
        targets = raw.get('targets')
        if not isinstance(targets, (list, tuple)):
            raise ValidationError({'targets': 'گیرندگان ارجاع نامعتبرند.'})
        instruction = raw.get('instruction') or ''
        if not isinstance(instruction, str):
            raise ValidationError({'instruction': 'دستور ارجاع نامعتبر است.'})
        parent = raw.get('parent_task')
        if parent not in (None, '') and _int(parent) is None:
            raise ValidationError({'parent_task': 'کار والد نامعتبر است.'})
        try:
            due_at = _parse_due_at(raw.get('due_at'))
            with transaction.atomic():
                letter = _visible_or_404(request.user, pk, for_update=True)
                created = refer_letter(request.user, letter, targets, kind=str(raw.get('kind') or 'refer'),
                                       instruction=instruction, due_at=due_at, parent_task=_int(parent))
        except WorkflowError as exc:
            return Response(exc.as_dict(), status=exc.status)
        return Response({'created': [t.pk for t in created], **_referral_tree(letter, request.user)},
                        status=status.HTTP_201_CREATED)


def _referral_tree(letter, user):
    """درخت ارجاع (فهرست تخت با والد)، با قاعدهٔ متن هسته: دستور و پاسخ فقط برای طرف‌های شاخه، نویسنده و مدیر کل."""
    from workflow import serializers as wser
    from workflow.models import WorkflowTask

    from .referral import may_root_refer, referral_instance
    instance = referral_instance(letter)
    can_root = may_root_refer(user, letter.pk)
    if instance is None:
        return {'instance_id': None, 'referrals': [], 'can_refer': can_root}
    tasks = list(WorkflowTask.objects.filter(instance=instance, track=WorkflowTask.TRACK_REFERRAL)
                 .select_related('target_user', 'referred_by', 'closed_by').order_by('opened_at', 'id'))
    full = access.is_live_superuser(user) or user.pk in (instance.created_by_id, letter.author_id)
    nodes = [{**wser.referral_node(t, with_text=full or user.pk in (t.target_user_id, t.referred_by_id)),
              'can_close': t.is_open and t.target_user_id == user.pk} for t in tasks]
    mine = any(t.is_open and t.target_user_id == user.pk for t in tasks)
    return {'instance_id': instance.pk, 'referrals': nodes, 'can_refer': can_root or mine}


class LetterReferralsView(APIView):
    """GET /api/letters/<id>/referrals/ — درخت ارجاع نامه (ن۷؛ جزء referral-tree در ل-ز)."""
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request, pk):
        letter = _visible_or_404(request.user, pk)
        return Response(_referral_tree(letter, request.user))


class LetterAudienceView(APIView):
    """GET/PUT /api/letters/<id>/audience/ — مخاطب بخشنامه (ن۱۸، س۴)."""
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request, pk):
        from .circulars import audience_payload
        letter = _visible_or_404(request.user, pk)
        return Response({'audience': audience_payload(letter)})

    def put(self, request, pk):
        from .circulars import audience_payload, set_audience
        raw = request.data if isinstance(request.data, dict) else {}
        with transaction.atomic():
            letter = _visible_or_404(request.user, pk, for_update=True)
            set_audience(request.user, letter, raw.get('audience'))
            _audit(request.user, letter, 'UPDATE', event='audience')
        return Response({'audience': audience_payload(letter), 'revision': letter.revision})


class LetterViewersView(APIView):
    """GET /api/letters/<id>/viewers/ — «چه کسی دید» (ن۹، ن۱۸): فقط نویسنده و دبیرخانهٔ همان شرکت."""
    permission_classes = (IsAuthenticated, LettersPermission)

    def get(self, request, pk):
        from .circulars import audience_user_ids, viewers
        user = request.user
        letter = _visible_or_404(user, pk)
        if not (access.is_live_superuser(user) or letter.author_id == user.pk
                or lifecycle._is_secretariat(user, letter)):
            raise PermissionDenied('گزارش دیدن نامه فقط برای نویسنده و دبیرخانه است.')
        data = {'viewers': viewers(letter)}
        if letter.kind == Letter.KIND_CIRCULAR:
            data['audience_count'] = len(audience_user_ids(letter))
        return Response(data)


class CircularListView(APIView):
    """GET /api/letters/circulars/?company=&unread=1 — بخشنامه‌هایی که کاربر می‌بیند، با خوانده/نخوانده (ن۱۸)."""
    permission_classes = (IsAuthenticated, LettersPermission)
    MAX_ROWS = 200

    def get(self, request):
        from .circulars import circulars_for
        qs = (circulars_for(request.user, _company_param(request, required=False))
              .select_related('author', 'project', 'edit_locked_by')
              .prefetch_related('recipients__user', 'recipients__party').order_by('-registered_at', '-id'))
        if request.query_params.get('unread') in ('1', 'true'):
            qs = qs.filter(is_read=False)
        rows = list(qs[:self.MAX_ROWS])
        data = LetterListSerializer(rows, many=True, context={'request': request}).data
        for item, row in zip(data, rows):
            item['is_read'] = bool(row.is_read)
        return Response(data)
