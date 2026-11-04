"""
سریالایزرهای نامه (ل-ج): اعتبارسنجی متن بلوکی (ن۱۴)، هم‌شرکتی بودن همهٔ ارجاع‌ها (ن۲، ن۱۳) و خروجی فهرست و جزئیات.
"""
from django.utils import timezone
from rest_framework import serializers

from .models import Letter, LetterRecipient

# ─── متن بلوکی (ن۱۴) ─────────────────────────────────────────────────────────────────────────
MAX_BLOCKS = 200
MAX_CHARS = 100_000
MAX_RUNS = 200
MAX_LIST_ITEMS = 200
MAX_TABLE_ROWS = 100
MAX_TABLE_COLS = 12
ALIGNS = ('right', 'center', 'justify')
LIST_STYLES = ('ordered', 'bullet')


class _Budget:
    def __init__(self):
        self.chars = 0

    def take(self, text):
        self.chars += len(text)
        if self.chars > MAX_CHARS:
            raise serializers.ValidationError(f'متن نامه بیش از {MAX_CHARS} نویسه است.')


def _text(value, budget, where):
    if not isinstance(value, str):
        raise serializers.ValidationError(f'{where}: متن باید رشته باشد.')
    budget.take(value)
    return value


def _runs(value, budget, where):
    """تکه‌های یک پاراگراف یا بند فهرست: فقط متن ساده و «پررنگ» (س۷)."""
    if isinstance(value, str):
        value = [{'text': value}]
    if not isinstance(value, list) or len(value) > MAX_RUNS:
        raise serializers.ValidationError(f'{where}: تکه‌های متن نادرست است.')
    out = []
    for run in value:
        if not isinstance(run, dict) or set(run) - {'text', 'bold'}:
            raise serializers.ValidationError(f'{where}: تکهٔ متن فقط «text» و «bold» دارد.')
        item = {'text': _text(run.get('text', ''), budget, where)}
        if run.get('bold'):
            item['bold'] = True
        out.append(item)
    return out


def validate_body(value):
    """ساختار متن بلوکی را می‌سنجد و نسخهٔ پاک (فقط کلیدهای مجاز) برمی‌گرداند."""
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError('متن نامه باید فهرستی از بلوک‌ها باشد.')
    if len(value) > MAX_BLOCKS:
        raise serializers.ValidationError(f'متن نامه بیش از {MAX_BLOCKS} بلوک دارد.')
    budget = _Budget()
    out = []
    for i, block in enumerate(value, start=1):
        where = f'بلوک {i}'
        if not isinstance(block, dict):
            raise serializers.ValidationError(f'{where}: ساختار نادرست است.')
        kind = block.get('type')
        if kind == 'paragraph':
            align = block.get('align') or 'right'
            if align not in ALIGNS:
                raise serializers.ValidationError(f'{where}: تراز نادرست است.')
            out.append({'type': 'paragraph', 'align': align, 'runs': _runs(block.get('runs', []), budget, where)})
        elif kind == 'list':
            style = block.get('style') or 'bullet'
            items = block.get('items', [])
            if style not in LIST_STYLES or not isinstance(items, list) or len(items) > MAX_LIST_ITEMS:
                raise serializers.ValidationError(f'{where}: فهرست نادرست است.')
            out.append({'type': 'list', 'style': style, 'items': [_runs(it, budget, where) for it in items]})
        elif kind == 'table':
            rows = block.get('rows', [])
            if not isinstance(rows, list) or len(rows) > MAX_TABLE_ROWS:
                raise serializers.ValidationError(f'{where}: جدول نادرست است.')
            clean = []
            for row in rows:
                if not isinstance(row, list) or len(row) > MAX_TABLE_COLS:
                    raise serializers.ValidationError(f'{where}: ردیف جدول نادرست است.')
                clean.append([_text(cell, budget, where) for cell in row])
            out.append({'type': 'table', 'header': bool(block.get('header')), 'rows': clean})
        else:
            raise serializers.ValidationError(f'{where}: نوع بلوک پشتیبانی نمی‌شود.')
    return out


# ─── ورودی ────────────────────────────────────────────────────────────────────────────────────

class RecipientInputSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=LetterRecipient.ROLE_CHOICES, default=LetterRecipient.ROLE_TO)
    target_type = serializers.ChoiceField(choices=LetterRecipient.TARGET_CHOICES)
    user = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    section_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    party = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    name_text = serializers.CharField(required=False, allow_blank=True, max_length=200, default='')
    title_text = serializers.CharField(required=False, allow_blank=True, max_length=200, default='')

    def validate(self, attrs):
        field = {'user': 'user', 'section': 'section_id', 'party': 'party', 'text': 'name_text'}[attrs['target_type']]
        if not attrs.get(field):
            raise serializers.ValidationError('گیرنده کامل نیست.')
        return attrs


class SignerInputSerializer(serializers.Serializer):
    user = serializers.IntegerField(min_value=1)
    title_text = serializers.CharField(required=False, allow_blank=True, max_length=200, default='')


class LinkInputSerializer(serializers.Serializer):
    entity_kind = serializers.CharField(max_length=64)
    entity_id = serializers.CharField(max_length=64)


class LetterWriteSerializer(serializers.Serializer):
    """ورودی ساخت و ویرایش؛ هم‌شرکتی بودن را views با `validate_refs` می‌سنجد (به شرکت نامه نیاز دارد)."""
    kind = serializers.ChoiceField(choices=Letter.KIND_CHOICES, required=False)
    company = serializers.IntegerField(required=False, min_value=1)
    client_temp_id = serializers.UUIDField(required=False, allow_null=True)
    revision = serializers.IntegerField(required=False, min_value=1)
    subject = serializers.CharField(required=False, allow_blank=True, max_length=500)
    body = serializers.JSONField(required=False)
    confidentiality = serializers.ChoiceField(choices=Letter.CONFIDENTIALITY_CHOICES, required=False)
    sign_mode = serializers.ChoiceField(choices=Letter.SIGN_MODE_CHOICES, required=False)
    external_number = serializers.CharField(required=False, allow_blank=True, max_length=64)
    external_date = serializers.DateField(required=False, allow_null=True)
    sender_party = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    follow_up_of = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    reply_to = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    response_due_at = serializers.DateTimeField(required=False, allow_null=True)
    project = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    recipients = RecipientInputSerializer(many=True, required=False)
    signers = SignerInputSerializer(many=True, required=False)
    editors = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, max_length=20)
    links = LinkInputSerializer(many=True, required=False)

    def validate_body(self, value):
        return validate_body(value)

    def validate_recipients(self, value):
        if len(value) > 100:
            raise serializers.ValidationError('بیش از ۱۰۰ گیرنده مجاز نیست.')
        return value

    def validate_signers(self, value):
        if len(value) > 10:
            raise serializers.ValidationError('امضاکننده‌ها حداکثر ۱۰ نفرند.')
        if len({s['user'] for s in value}) != len(value):
            raise serializers.ValidationError('امضاکنندهٔ تکراری مجاز نیست.')
        return value

    def validate_links(self, value):
        if len(value) > 50:
            raise serializers.ValidationError('بیش از ۵۰ پیوند مجاز نیست.')
        return value


# ─── خروجی ────────────────────────────────────────────────────────────────────────────────────

def _user_brief(user):
    if user is None:
        return None
    name = (user.get_full_name() or '').strip() if hasattr(user, 'get_full_name') else ''
    return {'id': user.pk, 'name': name or user.get_username()}


def recipient_name(r):
    if r.target_type == LetterRecipient.TARGET_USER:
        brief = _user_brief(r.user)
        return brief['name'] if brief else ''
    if r.target_type == LetterRecipient.TARGET_PARTY:
        return r.party.name if r.party_id else ''
    return r.name_text or ''


def lock_info(letter):
    now = timezone.now()
    active = bool(letter.edit_locked_by_id and letter.edit_locked_until and letter.edit_locked_until > now)
    return {
        'locked': active,
        'by': _user_brief(letter.edit_locked_by) if active else None,
        'until': letter.edit_locked_until if active else None,
    }


class LetterListSerializer(serializers.ModelSerializer):
    """ردیف فهرست: بی‌متن؛ همهٔ داده از select_related (بی N+1)."""
    author = serializers.SerializerMethodField()
    recipients_brief = serializers.SerializerMethodField()
    project_title = serializers.SerializerMethodField()
    edit_lock = serializers.SerializerMethodField()

    class Meta:
        model = Letter
        fields = ('id', 'company', 'kind', 'subject', 'status', 'confidentiality', 'number_display', 'registered_at',
                  'created_at', 'updated_at', 'revision', 'response_due_at', 'project', 'project_title', 'author',
                  'edit_lock', 'follow_up_of', 'reply_to', 'recipients_brief')

    def get_author(self, obj):
        return _user_brief(obj.author)

    def get_recipients_brief(self, obj):
        """نام گیرنده‌ها و رونوشت‌ها برای فهرست (ل-ز)؛ از prefetch `recipients` با user و party (بی N+1)."""
        return [{'role': r.role, 'name': recipient_name(r)} for r in obj.recipients.all()]

    def get_project_title(self, obj):
        project = obj.project
        return getattr(project, 'name', None) or getattr(project, 'title', None) if project else None

    def get_edit_lock(self, obj):
        return lock_info(obj)


class LetterDetailSerializer(LetterListSerializer):
    recipients = serializers.SerializerMethodField()
    signers = serializers.SerializerMethodField()
    editors = serializers.SerializerMethodField()
    links = serializers.SerializerMethodField()
    draft_copies = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta(LetterListSerializer.Meta):
        fields = LetterListSerializer.Meta.fields + (
            'body', 'sign_mode', 'external_number', 'external_date', 'sender_party', 'source', 'is_locked',
            'void_reason', 'voided_at', 'recipients', 'signers', 'editors', 'links', 'draft_copies', 'can_edit')

    def get_recipients(self, obj):
        return [{'id': r.pk, 'role': r.role, 'target_type': r.target_type, 'user': r.user_id,
                 'section_id': r.section_id, 'party': r.party_id,
                 'user_name': recipient_name(r) if r.target_type == LetterRecipient.TARGET_USER else '', 'party_name': r.party.name if r.party_id else '',
                 'name_text': r.name_text, 'title_text': r.title_text, 'order': r.order}
                for r in obj.recipients.all()]

    def get_signers(self, obj):
        return [{'id': s.pk, 'user': _user_brief(s.user), 'order': s.order, 'title_text': s.title_text,
                 'status': s.status, 'signed_at': s.signed_at} for s in obj.signers.all()]

    def get_editors(self, obj):
        return [_user_brief(e.user) for e in obj.editors.all()]

    def get_links(self, obj):
        from .links import link_payload
        viewer = self.context.get('viewer')
        return [link_payload(viewer, link) for link in obj.links.all()]

    def get_draft_copies(self, obj):
        # نسخه‌های ناهمگام فقط برای فرستندهٔ خودشان (و نویسنده) دیده می‌شوند
        viewer = self.context.get('viewer')
        uid = getattr(viewer, 'pk', None)
        return [{'id': c.pk, 'subject': c.subject, 'body': c.body, 'reason': c.reason, 'created_at': c.created_at,
                 'created_by': c.created_by_id}
                for c in obj.draft_copies.all() if uid and (c.created_by_id == uid or obj.author_id == uid)]

    def get_can_edit(self, obj):
        return bool(self.context.get('can_edit'))


CONFIDENTIAL_COVER_FA = 'نامهٔ محرمانه'


def register_row(letter, full_view: bool):
    """ردیف دفتر دبیرخانه؛ نامه‌ای که کاربر کامل نمی‌بیند فقط با شماره، تاریخ و «نامهٔ محرمانه» (ن۹)."""
    row = {
        'id': letter.pk, 'kind': letter.kind, 'status': letter.status, 'number_display': letter.number_display,
        'registered_at': letter.registered_at, 'confidentiality': letter.confidentiality,
        'external_number': letter.external_number, 'covered': not full_view,
    }
    if full_view:
        row.update(subject=letter.subject, author=_user_brief(letter.author))
    else:
        row.update(subject=CONFIDENTIAL_COVER_FA, author=None)
    return row
