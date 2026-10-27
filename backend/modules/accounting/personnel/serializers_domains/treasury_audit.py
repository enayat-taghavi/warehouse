from decimal import Decimal
from rest_framework import serializers
from common.date_utils import normalize_digits, parse_date_smart, format_to_shamsi_str
from common.media_urls import signed_media_url
from common.serializer_fields import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_SIZE_BYTES,
    validate_uploaded_document,
    ShamsiDateField,
)
from companies.models import Company
from contacts.models import ExternalParty
from contacts.services import infer_kind, national_id_error, normalize_national_id
from ..sheba_utils import normalize_sheba, validate_sheba
from .helpers import normalize_iranian_phone
from django.db import transaction
from ..expense_heads import PETTY_CASH_FIXED_CATEGORY, apply_expense_head, validate_expense_head_for_section
from ..invoice_services import MAX_LINES, MIN_LINES, company_vat_rate, refresh_duplicate_flag, suggested_vat
from ..counterparty_services import ROLE_FIELDS, can_view_sensitive, is_masked, mask_tail
from ..models import (
    Counterparty,
    PartyBankAccount,
    ExpenseHead,
    ExpenseInvoice,
    ExpenseInvoiceLine,
    InvoicePayment,
    compute_line_amount,
    PettyCashAccount,
    PettyCashStatement,
    PettyCashDebtSettlement,
    PettyCashReconciliation,
    PettyCashTransaction,
    WorkflowAuditLog,
)

PARTY_INPUT_FIELDS = ('kind', 'name', 'national_id', 'economic_code', 'registration_number', 'phone', 'mobile',
                      'email', 'address', 'postal_code', 'notes')
MASKABLE_BANK_FIELDS = ('sheba_number', 'account_number', 'card_number')


def _head_value(obj, key):
    head = getattr(obj, 'expense_head', None)
    if head is None:
        return None
    if key == 'group_title':
        return head.parent.title if head.parent_id else None
    return getattr(head, key)


def _section_company_id(section):
    project = getattr(section, 'project', None) if section is not None else None
    return getattr(project, 'company_id', None)


def validate_counterparty_company(serializer, attrs):
    """
    طرف‌حساب فاکتور/تنخواه باید از شرکت همان بخش باشد (ص۲ طرح ۳.۱: طرف حساب سراسری دیگر نیست)؛
    وگرنه ردیف شرکت دیگری ارجاع و نامش در پاسخ نمایش داده می‌شود.
    """
    if 'counterparty' not in attrs and 'section' not in attrs:
        return
    instance = getattr(serializer, 'instance', None)
    section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
    counterparty = attrs['counterparty'] if 'counterparty' in attrs else getattr(instance, 'counterparty', None)
    if counterparty is None or section is None:
        return
    if counterparty.company_id != _section_company_id(section):
        raise serializers.ValidationError({'counterparty': "طرف‌حساب انتخاب‌شده متعلق به شرکت این بخش نیست."})


def _clean_sheba(value):
    """شبا به شکل IR و ۲۴ رقم، با اعتبارسنجی Mod 97؛ خالی همان خالی."""
    if not value:
        return ""
    cleaned = normalize_sheba(normalize_digits(str(value)))
    if not cleaned:
        return ""
    if len(cleaned) != 26 or not cleaned[2:].isdigit():
        raise serializers.ValidationError("ارقام شماره شبا باید دقیقاً ۲۴ رقم (بدون احتساب IR) باشد.")
    is_valid, err_msg, _ = validate_sheba(cleaned)
    if not is_valid:
        raise serializers.ValidationError(err_msg or "ساختار شماره شبا نامعتبر است (خطای الگوریتم Mod 97).")
    return cleaned


def _sensitive_cache(serializer):
    root = serializer.root if serializer.root is not None else serializer
    return root.context.setdefault('_sensitive_cache', {})


def _can_view_full(serializer, party):
    request = serializer.context.get('request')
    user = getattr(request, 'user', None)
    return can_view_sensitive(user, party, _sensitive_cache(serializer))


class PartyBankAccountSerializer(serializers.ModelSerializer):
    """
    حساب بانکی طرف بیرونی (ص۳ و ص۵ طرح ۳.۱). مقدار پوشیده (دارای *) هرگز روی مقدار واقعی ذخیره نمی‌شود؛
    خروجی برای کسی که دید کامل ندارد شبا، شماره‌حساب و کارت را جز چهار رقم آخر می‌پوشاند (ص۴).
    """
    class Meta:
        model = PartyBankAccount
        fields = ['id', 'party', 'bank_name', 'account_number', 'sheba_number', 'card_number', 'owner_name',
                  'is_primary', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']
        extra_kwargs = {'party': {'required': False}, 'sheba_number': {'required': False}}

    def validate(self, attrs):
        for key in MASKABLE_BANK_FIELDS:
            if is_masked(attrs.get(key)):
                attrs.pop(key)
        if 'sheba_number' in attrs:
            attrs['sheba_number'] = _clean_sheba(attrs['sheba_number'])
        if not (attrs.get('sheba_number') or getattr(self.instance, 'sheba_number', None)):
            raise serializers.ValidationError({'sheba_number': "شماره شبا الزامی است."})
        for key in ('account_number', 'card_number'):
            if key in attrs:
                attrs[key] = normalize_digits(str(attrs[key] or '')).replace('-', '').replace(' ', '')
        party = attrs.get('party') or getattr(self.instance, 'party', None)
        sheba = attrs.get('sheba_number')
        if party is not None and sheba:
            dup = PartyBankAccount.objects.filter(party=party, sheba_number=sheba)
            if self.instance is not None:
                dup = dup.exclude(pk=self.instance.pk)
            if dup.exists():
                raise serializers.ValidationError({'sheba_number': "این شبا برای همین طرف حساب ثبت شده است."})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _can_view_full(self, instance.party):
            for key in MASKABLE_BANK_FIELDS:
                data[key] = mask_tail(data.get(key))
        return data


class CounterpartySerializer(serializers.ModelSerializer):
    """
    طرف حساب مالی روی طرف بیرونی هسته (ص۵ طرح ۳.۱). نوشتن: فیلدهای هویتی به سرویس contacts و فیلدهای مالی
    روی Counterparty، در counterparty_services. برای سازگاری با فرانت پیش از ۳.۱-ج و رکوردهای صف آفلاین،
    فیلدهای تخت قدیمی بانک (bank_name، account_number، sheba_number) هم پذیرفته و از حساب اصلی برگردانده می‌شوند.
    """
    kind = serializers.ChoiceField(choices=ExternalParty.KIND_CHOICES, required=False)
    name = serializers.CharField(max_length=200)
    national_id = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    economic_code = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    registration_number = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    mobile = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    postal_code = serializers.CharField(max_length=10, required=False, allow_blank=True, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all(), required=False, allow_null=True)
    bank_accounts = PartyBankAccountSerializer(many=True, required=False)
    bank_name = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    account_number = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    sheba_number = serializers.CharField(max_length=40, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Counterparty
        fields = ['id', 'party', 'company', 'kind', 'name', 'national_id', 'economic_code', 'registration_number',
                  'phone', 'mobile', 'email', 'address', 'postal_code', 'notes', 'counterparty_type', 'account_code',
                  'is_active', 'bank_accounts', 'bank_name', 'account_number', 'sheba_number',
                  'created_by', 'created_at', 'updated_at']
        read_only_fields = ['party', 'created_by', 'created_at', 'updated_at']

    def validate_national_id(self, value):
        if is_masked(value):
            return value  # در validate کنار گذاشته می‌شود
        cleaned = normalize_national_id(value)
        if cleaned and not cleaned.isdigit():
            raise serializers.ValidationError("شناسه/کد ملی باید فقط شامل ارقام عددی باشد.")
        if cleaned and len(cleaned) not in (10, 11):
            raise serializers.ValidationError("کد ملی اشخاص حقیقی ۱۰ رقم و شناسه ملی اشخاص حقوقی ۱۱ رقم است.")
        return cleaned

    def validate_sheba_number(self, value):
        if is_masked(value):
            return value
        return _clean_sheba(value)

    def validate(self, attrs):
        # ص۴: مقدار پوشیده هرگز روی مقدار واقعی ذخیره نمی‌شود
        for key in ('national_id', *MASKABLE_BANK_FIELDS):
            if is_masked(attrs.get(key)):
                attrs.pop(key)
        if 'national_id' in attrs:
            kind = infer_kind(attrs['national_id'], attrs.get('kind'))
            error = national_id_error(kind, attrs['national_id'])
            if error:
                raise serializers.ValidationError({'national_id': error})
        if 'account_number' in attrs:
            attrs['account_number'] = normalize_digits(str(attrs['account_number'] or '')).replace('-', '').replace(' ', '')
        return attrs

    def split_validated(self):
        """(party_data, role_data, flat_bank, bank_rows) از validated_data."""
        data = dict(self.validated_data)
        party_data = {k: ('' if data[k] is None and k != 'national_id' else data[k]) for k in PARTY_INPUT_FIELDS if k in data}
        role_data = {k: data[k] for k in ROLE_FIELDS if k in data}
        flat_bank = {k: data[k] or '' for k in ('bank_name', 'account_number', 'sheba_number') if k in data}
        bank_rows = [dict(row) for row in data.get('bank_accounts') or []]
        if not bank_rows and flat_bank.get('sheba_number'):
            bank_rows = [{**flat_bank, 'is_primary': True}]
        return party_data, role_data, flat_bank, bank_rows

    def to_representation(self, instance):
        party = instance.party
        full = _can_view_full(self, party)
        accounts = list(party.bank_accounts.all())
        primary = next((a for a in accounts if a.is_primary), None)

        def guard(value):
            return value if full else mask_tail(value)

        national_id = party.national_id
        if party.kind == ExternalParty.KIND_PERSON:
            national_id = guard(national_id)
        stamp = serializers.DateTimeField()
        primary_sheba = primary.sheba_number if primary else None
        return {
            'id': instance.id,
            'party': party.id,
            'company': party.company_id,
            'company_name': party.company.name if party.company_id else None,
            'kind': party.kind,
            'kind_display': party.get_kind_display(),
            'name': party.name,
            'national_id': national_id,
            'economic_code': party.economic_code,
            'registration_number': party.registration_number,
            'phone': party.phone,
            'mobile': party.mobile,
            'email': party.email,
            'address': party.address,
            'postal_code': party.postal_code,
            'notes': party.notes,
            'counterparty_type': instance.counterparty_type,
            'counterparty_type_display': instance.get_counterparty_type_display(),
            'account_code': instance.account_code,
            'is_active': instance.is_active,
            'bank_accounts': PartyBankAccountSerializer(accounts, many=True, context=self.context).data,
            'bank_masked': not full,
            # سازگاری با فرانت پیش از ۳.۱-ج: حساب اصلی، شبا بی «IR» مثل شکل پیشین
            'bank_name': primary.bank_name if primary else None,
            'account_number': guard(primary.account_number) if primary else None,
            'sheba_number': guard(primary_sheba[2:] if primary_sheba and primary_sheba.startswith('IR') else primary_sheba),
            'created_by': instance.created_by_id,
            'created_at': stamp.to_representation(instance.created_at) if instance.created_at else None,
            'updated_at': stamp.to_representation(instance.updated_at) if instance.updated_at else None,
        }


class ExpenseInvoiceLineSerializer(serializers.ModelSerializer):
    """ردیف فاکتور (د۱ طرح ۴.۱): سرفصل لازم؛ مبلغ ردیف را سرور حساب می‌کند. شناسه فقط‌خواندنی است
    (ویرایش = جایگزینی کامل ردیف‌ها)، پس ردیف هیچ فاکتور دیگری با شناسه پیوند نمی‌خورد."""
    expense_head = serializers.PrimaryKeyRelatedField(queryset=ExpenseHead.objects.select_related('parent'),
                                                      required=True, allow_null=False)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, default=Decimal('1'))
    unit_price = serializers.DecimalField(max_digits=15, decimal_places=0)
    expense_head_code = serializers.SerializerMethodField()
    expense_head_title = serializers.SerializerMethodField()
    expense_head_group_title = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseInvoiceLine
        fields = ['id', 'position', 'description', 'quantity', 'unit', 'unit_price', 'line_amount', 'expense_head',
                  'expense_head_code', 'expense_head_title', 'expense_head_group_title']
        read_only_fields = ['id', 'position', 'line_amount']

    def validate_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("تعداد باید بزرگ‌تر از صفر باشد.")
        return value

    def validate_unit_price(self, value):
        if value is None or value < 0:
            raise serializers.ValidationError("فی نمی‌تواند منفی باشد.")
        return value

    get_expense_head_code = staticmethod(lambda obj: _head_value(obj, 'code'))
    get_expense_head_title = staticmethod(lambda obj: _head_value(obj, 'title'))
    get_expense_head_group_title = staticmethod(lambda obj: _head_value(obj, 'group_title'))


def _invoice_lines_input(data, instance=None):
    """
    ردیف‌ها در JSON به‌صورت فهرست، در multipart (پیوست فاکتور) به‌صورت رشتهٔ JSON می‌آیند. درخواست کهنهٔ صف آفلاین
    (پیش از ۴.۱: expense_head + amount بی ردیف) به یک ردیف تبدیل می‌شود تا رد (4xx) و از صف حذف نشود.
    """
    import json
    if not hasattr(data, 'keys'):
        return data
    raw = data.get('lines') if 'lines' in data else None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raise serializers.ValidationError({'lines': "فهرست ردیف‌ها نامعتبر است."})
    else:
        has_head = data.get('expense_head') not in (None, '')
        has_amount = data.get('amount') not in (None, '')
        if raw is not None or not (has_head or (has_amount and instance is not None)):
            return data
        line0 = None
        if instance is not None:
            existing = list(instance.lines.all()[:2])
            if len(existing) > 1:
                # ویرایش کهنه روی فاکتور چندردیفی نباید ردیف‌ها را به یکی فرو بریزد؛ خطا به کاربر نشان داده می‌شود
                raise serializers.ValidationError(
                    {'lines': "این فاکتور چند ردیف دارد؛ برای ویرایش، ردیف‌ها را بفرستید."})
            line0 = existing[0] if existing else None
        if has_amount:
            quantity, unit_price = '1', data.get('amount')
        elif line0 is not None:
            quantity, unit_price = line0.quantity, line0.unit_price
        else:
            quantity, unit_price = '1', getattr(instance, 'subtotal', None) or '0'
        raw = [{
            'description': (data.get('description') or getattr(line0, 'description', None)
                            or getattr(instance, 'description', None) or '-'),
            'quantity': quantity,
            'unit': getattr(line0, 'unit', '') or '',
            'unit_price': unit_price,
            'expense_head': data.get('expense_head') if has_head else getattr(line0, 'expense_head_id', None),
        }]
    out = {key: data.get(key) for key in data.keys() if key not in ('lines', 'expense_head', 'category')}
    out['lines'] = raw
    return out


def _user_full_name(user):
    if user is None:
        return None
    return f"{user.first_name} {user.last_name}".strip() or user.username


class InvoicePaymentSerializer(serializers.ModelSerializer):
    """
    قسط پرداخت فاکتور (د۵ طرح ۴.۱)؛ فقط خواندنی (ثبت و ابطال از invoice_payments). شبا و شماره‌حساب طرف برای
    کسی که دید کامل ندارد جز چهار رقم آخر پوشیده است (ق۱۶). از حساب بانکی شرکت فقط نام و عنوان می‌آید.
    """
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    company_bank_name = serializers.SerializerMethodField()
    party_bank_name = serializers.SerializerMethodField()
    party_sheba_number = serializers.SerializerMethodField()
    party_account_number = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()
    is_voided = serializers.BooleanField(read_only=True)

    class Meta:
        model = InvoicePayment
        fields = ['id', 'invoice', 'amount', 'payment_date_shamsi', 'tracking_code', 'method', 'method_display',
                  'company_bank_account', 'company_bank_name', 'party_bank_account', 'party_bank_name',
                  'party_sheba_number', 'party_account_number', 'notes', 'created_by', 'created_by_name',
                  'created_at', 'is_voided', 'voided_at', 'voided_by', 'voided_by_name', 'void_reason']
        read_only_fields = fields

    def get_company_bank_name(self, obj):
        bank = obj.company_bank_account
        if bank is None:
            return None
        return f"{bank.bank_name} - {bank.account_title}" if bank.account_title else bank.bank_name

    def get_party_bank_name(self, obj):
        bank = obj.party_bank_account
        return bank.bank_name if bank is not None else None

    def _party_field(self, obj, key):
        bank = obj.party_bank_account
        if bank is None:
            return None
        value = getattr(bank, key)
        return value if _can_view_full(self, bank.party) else mask_tail(value)

    def get_party_sheba_number(self, obj):
        return self._party_field(obj, 'sheba_number')

    def get_party_account_number(self, obj):
        return self._party_field(obj, 'account_number')

    def get_created_by_name(self, obj):
        return _user_full_name(obj.created_by)

    def get_voided_by_name(self, obj):
        return _user_full_name(obj.voided_by)


class ExpenseInvoiceSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    project_id = serializers.IntegerField(source='section.project.id', read_only=True)
    project_name = serializers.CharField(source='section.project.name', read_only=True)
    counterparty_name = serializers.CharField(source='counterparty.party.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    paid_by_name = serializers.SerializerMethodField()
    lines = ExpenseInvoiceLineSerializer(many=True, required=False)
    # د۵ طرح ۴.۱: مانده و قسط‌ها (فقط خواندنی؛ ثبت از اکشن payments)
    remaining = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    # مبلغ دستی مالیات (اختیاری)؛ بی آن مبلغ پیشنهادی سرور
    vat_amount = serializers.DecimalField(max_digits=15, decimal_places=0, required=False, allow_null=True)
    discount_amount = serializers.DecimalField(max_digits=15, decimal_places=0, required=False, default=Decimal('0'))

    class Meta:
        model = ExpenseInvoice
        fields = '__all__'
        # فیلدهای پرداخت و رد فقط از اکشن‌های گردش کار نوشته می‌شوند (ت۲ طرح ۲.۳)؛
        # جمع‌ها، شمارهٔ داخلی و پرچم تکراری را سرور می‌نویسد (د۱ تا د۴ طرح ۴.۱)
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'payment_ref', 'paid_at', 'paid_by',
                            'rejection_reason', 'amount', 'subtotal', 'vat_rate', 'vat_manual',
                            'invoice_number_norm', 'possible_duplicate', 'duplicate_reason', 'number',
                            'issued_number', 'paid_amount']

    def to_internal_value(self, data):
        return super().to_internal_value(_invoice_lines_input(data, self.instance))

    def validate_discount_amount(self, value):
        if value is None:
            return Decimal('0')
        if value < 0:
            raise serializers.ValidationError("تخفیف نمی‌تواند منفی باشد.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validate_counterparty_company(self, attrs)
        instance = self.instance
        section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
        if (instance is not None and instance.issued_number_id and 'section' in attrs
                and _section_company_id(section) != _section_company_id(instance.section)):
            # شمارهٔ داخلی از سری شرکت فعلی صادر شده است (د۴)؛ فاکتور شماره‌دار به شرکت دیگر نمی‌رود
            raise serializers.ValidationError({'section': "فاکتور شماره‌دار را نمی‌توان به بخشی از شرکت دیگر برد."})
        lines = attrs.get('lines')
        if lines is None:
            if instance is None:
                raise serializers.ValidationError({'lines': "فاکتور دست‌کم یک ردیف لازم دارد."})
            amounts = [Decimal(str(line.line_amount or 0)) for line in instance.lines.all()]
            if 'section' in attrs and attrs['section'] != instance.section:
                # جابه‌جایی بخش: سرفصل ردیف‌های موجود هم باید از شرکت بخش تازه باشد
                for line in instance.lines.select_related('expense_head__parent'):
                    if line.expense_head is not None:
                        error = validate_expense_head_for_section(line.expense_head, section, line.expense_head_id)
                        if error:
                            raise serializers.ValidationError({'lines': error})
        else:
            if not (MIN_LINES <= len(lines) <= MAX_LINES):
                raise serializers.ValidationError(
                    {'lines': f"فاکتور باید بین {MIN_LINES} تا {MAX_LINES} ردیف داشته باشد."})
            previous_heads = set(instance.lines.values_list('expense_head_id', flat=True)) if instance else set()
            for idx, line in enumerate(lines):
                head = line['expense_head']
                error = validate_expense_head_for_section(head, section,
                                                          head.pk if head.pk in previous_heads else None)
                if error:
                    raise serializers.ValidationError({'lines': {idx: {'expense_head': [error]}}})
            amounts = [compute_line_amount(line.get('quantity', Decimal('1')), line['unit_price']) for line in lines]
        subtotal = sum(amounts, Decimal('0'))
        discount = attrs.get('discount_amount', getattr(instance, 'discount_amount', Decimal('0')))
        discount = Decimal(str(discount or 0))
        if discount > subtotal:
            raise serializers.ValidationError({'discount_amount': "تخفیف نمی‌تواند از جمع ردیف‌ها بیشتر باشد."})
        base = subtotal - discount
        vat_applicable = attrs.get('vat_applicable', getattr(instance, 'vat_applicable', False))
        sent_vat = attrs.pop('vat_amount', None)
        if vat_applicable:
            rate = company_vat_rate(_section_company_id(section))
            suggested = suggested_vat(rate, base)
            if sent_vat is None and instance is not None and instance.vat_manual and instance.vat_applicable:
                sent_vat = instance.vat_amount  # ویرایش بی مبلغ مالیات: اصلاح دستی قبلی می‌ماند
            if sent_vat is not None and not (0 <= sent_vat <= base):
                raise serializers.ValidationError({'vat_amount': "مبلغ مالیات باید بین صفر و مبلغ پس از تخفیف باشد."})
            vat = Decimal(str(sent_vat)) if sent_vat is not None else suggested
            attrs.update(vat_rate=rate, vat_amount=vat, vat_manual=(vat != suggested))
        else:
            vat = Decimal('0')
            attrs.update(vat_rate=None, vat_amount=vat, vat_manual=False)
        attrs.update(subtotal=subtotal, discount_amount=discount, amount=base + vat)
        return attrs

    @staticmethod
    def _write_lines(invoice, lines):
        """جایگزینی کامل ردیف‌ها؛ line_amount صریح، چون bulk_create آن را حساب نمی‌کند."""
        invoice.lines.all().delete()
        ExpenseInvoiceLine.objects.bulk_create([
            ExpenseInvoiceLine(
                invoice=invoice, position=idx, description=line.get('description') or '',
                quantity=line.get('quantity', Decimal('1')), unit=line.get('unit') or '',
                unit_price=line['unit_price'], expense_head=line['expense_head'],
                line_amount=compute_line_amount(line.get('quantity', Decimal('1')), line['unit_price']),
            )
            for idx, line in enumerate(lines, start=1)
        ])

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        with transaction.atomic():
            invoice = super().create(validated_data)
            self._write_lines(invoice, lines)
            refresh_duplicate_flag(invoice)
        return invoice

    def update(self, instance, validated_data):
        lines = validated_data.pop('lines', None)
        with transaction.atomic():
            invoice = super().update(instance, validated_data)
            if lines is not None:
                self._write_lines(invoice, lines)
                if hasattr(invoice, '_prefetched_objects_cache'):
                    invoice._prefetched_objects_cache.pop('lines', None)
            refresh_duplicate_flag(invoice)
        return invoice

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_paid_by_name(self, obj):
        if obj.paid_by:
            return f"{obj.paid_by.first_name} {obj.paid_by.last_name}".strip() or obj.paid_by.username
        return None

    def get_remaining(self, obj):
        from ..invoice_payments import invoice_remaining
        return str(invoice_remaining(obj))

    def get_payments(self, obj):
        # از prefetch ویوست (بی پرس‌وجوی تازه در فهرست)؛ باطل‌شده‌ها هم با is_voided می‌آیند
        rows = sorted(obj.payments.all(), key=lambda p: (p.created_at, p.pk))
        return InvoicePaymentSerializer(rows, many=True, context=self.context).data

def _section_value(obj, path):
    """مقدار از بخش (یا پروژهٔ بخش)؛ بخش در حساب و ردیف تنخواه اختیاری است (ص۹ طرح ۳.۶)."""
    value = obj
    for attr in path:
        value = getattr(value, attr, None)
        if value is None:
            return None
    return value


def _petty_locked(serializer, company_id, day):
    """قفل دورهٔ مالی بسته (ص۱۱ طرح ۳.۶) با کش هر پاسخ تا فهرست برای هر ردیف پرس‌وجو نزند."""
    from personnel.fiscal import closed_period_for
    cache = serializer.context.setdefault('_petty_lock_cache', {})
    key = (company_id, day)
    if key not in cache:
        cache[key] = closed_period_for(company_id, day) is not None
    return cache[key]


def petty_bank_full_view(user, company_id) -> bool:
    """د۱۱: خزانه‌دار یا مدیریت تنخواه در سطح شرکت (بی‌توجه به تنخواه‌گردان بودن)."""
    from accounts.scoped_permissions import can_at_company_level
    if user.is_superuser:
        return True
    return any(can_at_company_level(user, code, company_id)
               for code in ('perm_treasury_disburse_action', 'perm_petty_cash_manage'))


class PettyCashAccountSerializer(serializers.ModelSerializer):
    section_name = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    custodian_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source='company.name', read_only=True, default=None)
    # بدهی = جمع ردیف‌های ردشده (ص۵)؛ queryset با PettyCashAccount.annotate_debt یک کوئری کمتر می‌زند
    debt = serializers.DecimalField(max_digits=15, decimal_places=0, read_only=True)
    # د۲: تغییر موجودی اولیه پس از اولین گردش دلیل می‌خواهد (فقط ورودی؛ در ممیزی می‌ماند)
    reason = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = PettyCashAccount
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'company', 'closed_at', 'closed_by',
                            'handover_from', 'handover_to']
        extra_kwargs = {'opening_balance': {'required': False, 'min_value': Decimal('0')}}

    get_section_name = staticmethod(lambda obj: _section_value(obj, ('section', 'name')))
    get_project_id = staticmethod(lambda obj: _section_value(obj, ('section', 'project', 'id')))
    get_project_name = staticmethod(lambda obj: _section_value(obj, ('section', 'project', 'name')))

    def validate_sheba_number(self, value):
        """د۱۱ طرح ۴.۲: اختیاری؛ با همان اعتبارسنج پرسنل. مقدار پوشیده (برگشت همان نمایش) یعنی بی‌تغییر."""
        if value is None or not str(value).strip():
            return None
        if is_masked(value) or str(value).strip() == (getattr(self.instance, 'sheba_number', None) or ''):
            return getattr(self.instance, 'sheba_number', None)  # unchanged (masked echo or legacy value)
        from ..sheba_utils import clean_sheba
        cleaned = clean_sheba(value)
        is_valid, err_msg, _ = validate_sheba(cleaned)
        if not is_valid:
            raise serializers.ValidationError(err_msg or "شماره شبا نامعتبر است.")
        return cleaned

    def validate_card_or_account_number(self, value):
        """د۱۱: کارت ۱۶ رقمی (ارقام فارسی و عربی به لاتین، فاصله و خط تیره حذف)؛ اختیاری."""
        if value is None or not str(value).strip():
            return None
        if is_masked(value) or str(value).strip() == (getattr(self.instance, 'card_or_account_number', None) or ''):
            return getattr(self.instance, 'card_or_account_number', None)  # unchanged (masked echo or legacy value)
        digits = normalize_digits(str(value)).replace(' ', '').replace('-', '')
        if not digits.isdigit() or len(digits) != 16:
            raise serializers.ValidationError("شماره کارت باید ۱۶ رقم باشد.")
        return digits

    def _full_bank_view(self, obj):
        """کارت و شبای کامل: خود تنخواه‌گردان، خزانه‌دار یا مدیریت تنخواه در سطح همان شرکت؛ بقیه پوشیده."""
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return False
        if user.is_superuser or obj.custodian_id == user.pk:
            return True
        cache = self.context.setdefault('_petty_bank_view_cache', {})
        if obj.company_id not in cache:
            cache[obj.company_id] = petty_bank_full_view(user, obj.company_id)
        return cache[obj.company_id]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._full_bank_view(instance):
            for name in ('card_or_account_number', 'sheba_number'):
                data[name] = mask_tail(data.get(name))
        data['is_closed'] = instance.closed_at is not None
        return data

    def validate_opening_balance_date(self, value):
        if value in (None, ''):
            return None
        from ..fiscal import to_shamsi_str
        day = to_shamsi_str(value)
        if not day:
            raise serializers.ValidationError("تاریخ نامعتبر است.")
        return day

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.pop('reason', None)
        # د۲: تاریخ موجودی اولیه وقتی مبلغ > ۰ است الزامی است
        instance = getattr(self, 'instance', None)
        opening = attrs['opening_balance'] if 'opening_balance' in attrs else getattr(instance, 'opening_balance', 0)
        opening_date = attrs['opening_balance_date'] if 'opening_balance_date' in attrs \
            else getattr(instance, 'opening_balance_date', None)
        if opening and not opening_date:
            raise serializers.ValidationError({'opening_balance_date': "تاریخ موجودی اولیه الزامی است."})
        # یک حساب فعال برای هر (شرکت، تنخواه‌گردان) — همان قید پایگاه داده با پیام فارسی
        instance = getattr(self, 'instance', None)
        section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
        company_id = getattr(instance, 'company_id', None) or (section.project.company_id if section else None)
        custodian = attrs['custodian'] if 'custodian' in attrs else getattr(instance, 'custodian', None)
        is_active = attrs['is_active'] if 'is_active' in attrs else getattr(instance, 'is_active', True)
        if company_id and custodian is not None and is_active:
            clash = PettyCashAccount.objects.filter(company_id=company_id, custodian=custodian, is_active=True)
            if instance is not None:
                clash = clash.exclude(pk=instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {'custodian': "این شخص در این شرکت از قبل یک حساب تنخواه فعال دارد."})
        return attrs

    def get_custodian_name(self, obj):
        if obj.custodian:
            return f"{obj.custodian.first_name} {obj.custodian.last_name}".strip() or obj.custodian.username
        return None

class PettyCashTransactionSerializer(serializers.ModelSerializer):
    section_name = serializers.SerializerMethodField()
    # پروژهٔ ردیف: پروژهٔ اختیاری خود ردیف، وگرنه پروژهٔ بخش (ص۱ طرح ۳.۶)
    project_id = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    line_status_display = serializers.CharField(source='get_line_status_display', read_only=True)
    custodian_name = serializers.SerializerMethodField()
    counterparty_name = serializers.CharField(source='counterparty.party.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    expense_head_code = serializers.SerializerMethodField()
    expense_head_title = serializers.SerializerMethodField()
    expense_head_group_title = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    # د۴ و د۱۰: کسر بدهی از شارژ و مبلغ خالص واریز (فقط شارژ)
    offset_total = serializers.SerializerMethodField()
    net_amount = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashTransaction
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'category',
                            'statement', 'line_status', 'line_reject_reason', 'source', 'source_statement']

    get_section_name = staticmethod(lambda obj: _section_value(obj, ('section', 'name')))

    @staticmethod
    def _offset_total(obj):
        if obj.transaction_type != 'allocation':
            return None
        annotated = getattr(obj, 'offset_total_amount', None)
        if annotated is not None:
            return annotated
        from ..workflows import petty_charge_offset_total
        return petty_charge_offset_total(obj)

    def get_offset_total(self, obj):
        total = self._offset_total(obj)
        return None if total is None else int(total)

    def get_net_amount(self, obj):
        total = self._offset_total(obj)
        return None if total is None else int(obj.amount - total)

    def get_is_locked(self, obj):
        # د۵ و د۶ طرح ۴.۲: هزینهٔ دورهٔ تطبیق‌شده و ردیف حساب بسته هم قفل است
        from ..petty_lifecycle import is_account_closed, is_period_locked
        if obj.account_id and is_account_closed(obj.account):
            return True
        cache = self.context.setdefault('_petty_period_cache', {})
        if is_period_locked(obj.account_id, obj.transaction_date_shamsi, obj.transaction_type, cache=cache):
            return True
        return _petty_locked(self, obj.wf_company_id, obj.transaction_date_shamsi)

    def get_project_id(self, obj):
        return obj.project_id or _section_value(obj, ('section', 'project', 'id'))

    def get_project_name(self, obj):
        if obj.project_id:
            return obj.project.name
        return _section_value(obj, ('section', 'project', 'name'))

    get_expense_head_code = staticmethod(lambda obj: _head_value(obj, 'code'))
    get_expense_head_title = staticmethod(lambda obj: _head_value(obj, 'title'))
    get_expense_head_group_title = staticmethod(lambda obj: _head_value(obj, 'group_title'))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validate_counterparty_company(self, attrs)
        # سرفصل فقط برای هزینه؛ شارژ و عودت متن ثابت می‌گیرند (ص۲ طرح ۳.۴)
        instance = getattr(self, 'instance', None)
        tx_type = attrs.get('transaction_type') or getattr(instance, 'transaction_type', None) or 'expense'
        apply_expense_head(self, attrs, needs_head=tx_type == 'expense',
                           fixed_category=PETTY_CASH_FIXED_CATEGORY.get(tx_type))
        # حساب تنخواه باید از همان بخش سند باشد (نه حساب بخش یا شرکت دیگر)
        if 'account' in attrs or 'section' in attrs:
            instance = getattr(self, 'instance', None)
            account = attrs['account'] if 'account' in attrs else getattr(instance, 'account', None)
            section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
            if account is not None and section is not None:
                # حساب قدیمی بخش‌دار: همان بخش؛ حساب سطح شرکت: بخش باید از همان شرکت باشد
                if account.section_id is not None and account.section_id != section.pk:
                    raise serializers.ValidationError({'account': "حساب تنخواه انتخاب‌شده متعلق به بخش این سند نیست."})
                if account.section_id is None and account.company_id != section.project.company_id:
                    raise serializers.ValidationError({'section': "بخش انتخاب‌شده از شرکت این حساب تنخواه نیست."})
        # پروژهٔ اختیاری باید با بخش و شرکت حساب جور باشد
        if 'project' in attrs and attrs['project'] is not None:
            project = attrs['project']
            account = attrs['account'] if 'account' in attrs else getattr(instance, 'account', None)
            section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
            if section is not None and section.project_id != project.pk:
                raise serializers.ValidationError({'project': "پروژهٔ انتخاب‌شده با بخش این سند جور نیست."})
            if account is not None and account.company_id and account.company_id != project.company_id:
                raise serializers.ValidationError({'project': "پروژهٔ انتخاب‌شده از شرکت این حساب تنخواه نیست."})
        # ردیف بی‌بخش: طرف‌حساب با شرکت حساب سنجیده می‌شود (validate_counterparty_company بخش می‌خواهد)
        account = attrs['account'] if 'account' in attrs else getattr(instance, 'account', None)
        section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
        counterparty = attrs['counterparty'] if 'counterparty' in attrs else getattr(instance, 'counterparty', None)
        if section is None and account is not None and counterparty is not None \
                and counterparty.company_id != account.company_id:
            raise serializers.ValidationError({'counterparty': "طرف‌حساب انتخاب‌شده متعلق به شرکت این حساب تنخواه نیست."})
        return attrs

    def get_custodian_name(self, obj):
        if obj.custodian:
            return f"{obj.custodian.first_name} {obj.custodian.last_name}".strip() or obj.custodian.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None


class PettyCashDebtSettlementSerializer(serializers.ModelSerializer):
    """تسویهٔ بدهی تنخواه (د۴ طرح ۴.۲). فقط خواندنی؛ ثبت و ابطال از راه petty_settlements."""
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    custodian_id = serializers.IntegerField(source='account.custodian_id', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashDebtSettlement
        fields = '__all__'
        read_only_fields = [f.name for f in PettyCashDebtSettlement._meta.fields]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None


class PettyCashReconciliationSerializer(serializers.ModelSerializer):
    """تطبیق تنخواه (د۵ طرح ۴.۲). فقط خواندنی؛ ثبت از راه petty_lifecycle.create_reconciliation."""
    custodian_id = serializers.IntegerField(source='account.custodian_id', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    result = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashReconciliation
        fields = '__all__'
        read_only_fields = [f.name for f in PettyCashReconciliation._meta.fields]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    @staticmethod
    def get_result(obj):
        return 'shortage' if obj.difference < 0 else ('surplus' if obj.difference > 0 else 'balanced')


class PettyCashStatementSerializer(serializers.ModelSerializer):
    """صورت‌حساب تنخواه (ص۴ و ص۹ طرح ۳.۶). وضعیت و مبلغ‌ها را فقط سرور و گردش کار عوض می‌کنند."""
    company_name = serializers.CharField(source='company.name', read_only=True, default=None)
    custodian_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    lines_count = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashStatement
        fields = '__all__'
        read_only_fields = ['company', 'custodian', 'total_amount', 'approved_amount', 'status',
                            'document_number', 'issued_number', 'created_by', 'created_at', 'updated_at']

    def get_custodian_name(self, obj):
        if obj.custodian:
            return f"{obj.custodian.first_name} {obj.custodian.last_name}".strip() or obj.custodian.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_is_locked(self, obj):
        return obj.status == 'paid' or _petty_locked(self, obj.company_id, obj.statement_date_shamsi)

    def get_lines_count(self, obj):
        annotated = getattr(obj, 'lines_count', None)
        return annotated if annotated is not None else obj.lines.count()


class WorkflowAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    created_at_shamsi = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowAuditLog
        fields = '__all__'

    def get_actor_name(self, obj):
        if obj.actor:
            return f"{obj.actor.first_name} {obj.actor.last_name}".strip() or obj.actor.username
        return "سیستم"

    def get_created_at_shamsi(self, obj):
        if obj.created_at:
            from common.date_utils import format_to_shamsi_str
            return format_to_shamsi_str(obj.created_at)
        return ""

    SNAPSHOT_SUMMARY_KEYS = (
        'id', 'full_name', 'driver_name', 'plate_number', 'vehicle_type',
        'approval_status', 'company_id', 'section_id', 'reason', 'purged_by', 'deleted_by_username'
    )

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get('request')
        if request is None:
            return ret
        from ..lifecycle_services import WAGE_FIELDS, user_can_view_wages
        from ..fleet_lifecycle_services import FLEET_RATE_FIELDS, FLEET_FINANCE_STAGE_PERMS, FLEET_MANAGER_STAGE_PERMS, user_has_any_perm
        user = getattr(request, 'user', None)
        can_view_financials = user_can_view_wages(user) or user_has_any_perm(user, FLEET_FINANCE_STAGE_PERMS + FLEET_MANAGER_STAGE_PERMS)
        if can_view_financials:
            return ret
        # DEF-19/DEF-21/SoD: نقش غیرمالی عکس کامل حذف (شبا و دستمزد/نرخ خودرو) و تغییرات مالی را در تایملاین نمی‌بیند
        sensitive_fields = set(WAGE_FIELDS) | set(FLEET_RATE_FIELDS)
        metadata = dict(ret.get('metadata') or {})
        snapshot = metadata.get('snapshot')
        if isinstance(snapshot, dict):
            metadata['snapshot'] = {k: snapshot[k] for k in self.SNAPSHOT_SUMMARY_KEYS if k in snapshot}
        for key in ('diff', 'old_diff'):
            if isinstance(metadata.get(key), dict):
                metadata[key] = {k: v for k, v in metadata[key].items() if k not in sensitive_fields}
        ret['metadata'] = metadata
        return ret
