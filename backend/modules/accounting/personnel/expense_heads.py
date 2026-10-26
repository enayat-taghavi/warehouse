"""
سرفصل‌های هزینهٔ شرکت (طرح ۳.۴): فهرست پیش‌فرض (ص۵) و سنجش سرفصل روی فاکتور و سند تنخواه (ص۲).
"""
from django.db import transaction
from rest_framework import serializers

# (کد گروه، عنوان گروه، [(کد سرفصل، عنوان)])؛ migration 0012 نسخهٔ ثابت همین فهرست را دارد
DEFAULT_EXPENSE_HEADS = (
    ('10', 'هزینه‌های عملیاتی و کارگاه', (
        ('1001', 'تعمیرات و نگهداری'),
        ('1002', 'سوخت و روغن'),
        ('1003', 'کرایه و حمل'),
        ('1004', 'قطعات یدکی'),
        ('1005', 'ابزارآلات و قطعات خرد'),
        ('1006', 'ملزومات و مصرفی کارگاه'),
    )),
    ('20', 'هزینه‌های اداری', (
        ('2001', 'پذیرایی و آبدارخانه'),
        ('2002', 'تجهیزات و ملزومات اداری'),
        ('2003', 'ایاب و ذهاب'),
    )),
    ('90', 'سایر', (
        ('9001', 'متفرقه'),
    )),
)

# متن ثابت category برای سند تنخواهِ غیر هزینه (شارژ دوباره متن خودش را در treasury_views می‌نویسد)
PETTY_CASH_FIXED_CATEGORY = {
    'allocation': 'شارژ تنخواه',
    'refund': 'عودت تنخواه',
}

MSG_REQUIRED = "سرفصل هزینه الزامی است."
MSG_NOT_ALLOWED = "شارژ و عودت تنخواه سرفصل هزینه نمی‌گیرد."
MSG_GROUP = "گروه سرفصل قابل انتخاب نیست؛ یکی از سرفصل‌های زیر آن را انتخاب کنید."
MSG_OTHER_COMPANY = "سرفصل انتخاب‌شده متعلق به شرکت این بخش نیست."
MSG_INACTIVE = "سرفصل انتخاب‌شده غیرفعال است."


def seed_default_expense_heads(company):
    """فهرست پیش‌فرض را فقط برای شرکتی که هیچ سرفصلی ندارد می‌سازد؛ تکرار بی‌اثر است. شمار ردیف‌های ساخته‌شده."""
    from .models import ExpenseHead
    company_id = getattr(company, 'pk', company)
    created = 0
    with transaction.atomic():
        if ExpenseHead.objects.filter(company_id=company_id).exists():
            return 0
        for g_order, (g_code, g_title, heads) in enumerate(DEFAULT_EXPENSE_HEADS, start=1):
            group = ExpenseHead.objects.create(company_id=company_id, code=g_code, title=g_title, order=g_order)
            created += 1
            for h_order, (h_code, h_title) in enumerate(heads, start=1):
                ExpenseHead.objects.create(company_id=company_id, parent=group, code=h_code, title=h_title,
                                           order=h_order)
                created += 1
    return created


def _section_company_id(section):
    project = getattr(section, 'project', None) if section is not None else None
    return getattr(project, 'company_id', None)


def validate_expense_head_for_section(head, section, previous_head_id=None):
    """پیام خطا یا None. سرفصلِ بدون تغییرِ سند، اگر بعداً غیرفعال شده باشد، رد نمی‌شود (ص۲)."""
    if head.parent_id is None:
        return MSG_GROUP
    if section is not None and head.company_id != _section_company_id(section):
        return MSG_OTHER_COMPANY
    if head.pk != previous_head_id and not (head.is_active and head.parent.is_active):
        return MSG_INACTIVE
    return None


def apply_expense_head(serializer, attrs, needs_head, fixed_category=None):
    """
    قاعدهٔ سرفصل روی attrs سند (ص۲): needs_head یعنی فاکتور یا تنخواه هزینه. category فقط‌خواندنی است و
    از عنوان سرفصل یا متن ثابت fixed_category پر می‌شود.
    """
    instance = getattr(serializer, 'instance', None)
    previous_id = getattr(instance, 'expense_head_id', None)
    head = attrs['expense_head'] if 'expense_head' in attrs else getattr(instance, 'expense_head', None)
    if not needs_head:
        if attrs.get('expense_head') is not None:
            raise serializers.ValidationError({'expense_head': MSG_NOT_ALLOWED})
        # ویرایشِ همان شارژ یا عودت متن قبلی را نگه می‌دارد (مثلاً «شارژ مجدد تنخواه»)
        type_changed = (instance is not None and 'transaction_type' in attrs
                        and attrs['transaction_type'] != instance.transaction_type)
        if instance is None or type_changed or previous_id is not None:
            attrs['expense_head'] = None
            if fixed_category:
                attrs['category'] = fixed_category
        return attrs
    if head is None:
        raise serializers.ValidationError({'expense_head': MSG_REQUIRED})
    section = attrs['section'] if 'section' in attrs else getattr(instance, 'section', None)
    if 'expense_head' in attrs or 'section' in attrs or instance is None:
        error = validate_expense_head_for_section(head, section, previous_id)
        if error:
            raise serializers.ValidationError({'expense_head': error})
    if instance is None or head.pk != previous_id or instance.category != head.title:
        attrs['category'] = head.title
    return attrs
