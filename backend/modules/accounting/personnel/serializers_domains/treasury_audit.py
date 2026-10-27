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
from ..expense_heads import PETTY_CASH_FIXED_CATEGORY, apply_expense_head
from ..counterparty_services import ROLE_FIELDS, can_view_sensitive, is_masked, mask_tail
from ..models import (
    Counterparty,
    PartyBankAccount,
    ExpenseInvoice,
    PettyCashAccount,
    PettyCashStatement,
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


class ExpenseInvoiceSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    project_id = serializers.IntegerField(source='section.project.id', read_only=True)
    project_name = serializers.CharField(source='section.project.name', read_only=True)
    counterparty_name = serializers.CharField(source='counterparty.party.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    paid_by_name = serializers.SerializerMethodField()
    expense_head_code = serializers.SerializerMethodField()
    expense_head_title = serializers.SerializerMethodField()
    expense_head_group_title = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseInvoice
        fields = '__all__'
        # فیلدهای پرداخت و رد فقط از اکشن‌های گردش کار نوشته می‌شوند (ت۲ طرح ۲.۳)؛
        # category را سرور از عنوان سرفصل پر می‌کند (ص۲ طرح ۳.۴)
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'payment_ref', 'paid_at', 'paid_by',
                            'rejection_reason', 'category']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        validate_counterparty_company(self, attrs)
        apply_expense_head(self, attrs, needs_head=True)
        return attrs

    get_expense_head_code = staticmethod(lambda obj: _head_value(obj, 'code'))
    get_expense_head_title = staticmethod(lambda obj: _head_value(obj, 'title'))
    get_expense_head_group_title = staticmethod(lambda obj: _head_value(obj, 'group_title'))

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_paid_by_name(self, obj):
        if obj.paid_by:
            return f"{obj.paid_by.first_name} {obj.paid_by.last_name}".strip() or obj.paid_by.username
        return None

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


class PettyCashAccountSerializer(serializers.ModelSerializer):
    section_name = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    custodian_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source='company.name', read_only=True, default=None)
    # بدهی = جمع ردیف‌های ردشده (ص۵)؛ queryset با PettyCashAccount.annotate_debt یک کوئری کمتر می‌زند
    debt = serializers.DecimalField(max_digits=15, decimal_places=0, read_only=True)

    class Meta:
        model = PettyCashAccount
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'company']

    get_section_name = staticmethod(lambda obj: _section_value(obj, ('section', 'name')))
    get_project_id = staticmethod(lambda obj: _section_value(obj, ('section', 'project', 'id')))
    get_project_name = staticmethod(lambda obj: _section_value(obj, ('section', 'project', 'name')))

    def validate(self, attrs):
        attrs = super().validate(attrs)
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

    class Meta:
        model = PettyCashTransaction
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by', 'category',
                            'statement', 'line_status', 'line_reject_reason']

    get_section_name = staticmethod(lambda obj: _section_value(obj, ('section', 'name')))

    def get_is_locked(self, obj):
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
                            'document_number', 'created_by', 'created_at', 'updated_at']

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
