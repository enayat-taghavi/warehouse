"""
ابزار تست: دادن مجوزهای بخشی حسابداری به کاربر تست از راه درست (طرح ۲.۲، ت۱ و ت۴).

از ۲.۲ مجوز بخشی فقط از بستهٔ نقش انتساب (+ تفاوت کاربر برای همان شرکت) می‌آید؛ تیک مستقیم `user_permissions`
یا نقش سامانه‌ای آن را نمی‌دهد. تست‌هایی که پیش‌تر «کاربر X مجوز Y دارد» را با تیک مستقیم می‌ساختند، این‌جا
یک انتساب فعال (در سطح دلخواه) و تفاوت «افزوده» برای همان شرکت می‌گیرند. با exact=True مجوزهای بستهٔ پیش‌فرض نقش
که خواسته نشده‌اند با تفاوت «برداشته» حذف می‌شوند، تا کاربر در آن شرکت دقیقاً همان مجوزهای خواسته‌شده را داشته باشد
(همان معنای تیک مستقیم پیشین، ولی محدود به «کجا»ی انتساب).
"""
import tempfile

from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from accounts.models import UserPermissionOverride
from accounts.scoped_permissions import clear_scoped_permission_cache, effective_bundles
from companies.models import SectionAssignment


def _permission(code):
    perm = Permission.objects.filter(content_type__app_label='accounts', codename=code).first()
    if perm is None:
        ct, _ = ContentType.objects.get_or_create(app_label='accounts', model='customuser')
        perm = Permission.objects.create(codename=code, name=code, content_type=ct)
    return perm


def grant_section_perms(user, codes, *, section=None, project=None, company=None, role='employee', exact=True):
    """
    یک انتساب فعال (بخش، پروژه یا شرکت؛ دقیقاً یکی) با نقش role برای کاربر می‌سازد (اگر نباشد) و مجوزهای codes را
    برای شرکت همان هدف به‌صورت تفاوت «افزوده» می‌دهد. خروجی: انتساب.
    """
    targets = [t for t in (section, project, company) if t is not None]
    assert len(targets) == 1, 'دقیقاً یکی از section، project یا company'
    if section is not None:
        lookup, company_id = {'section': section}, section.project.company_id
    elif project is not None:
        lookup, company_id = {'project': project}, project.company_id
    else:
        lookup, company_id = {'company': company}, company.pk
    assignment = SectionAssignment.objects.filter(user=user, role=role, **lookup).first()
    if assignment is None:
        assignment = SectionAssignment.objects.create(user=user, role=role, is_active=True, **lookup)
    elif not assignment.is_active:
        assignment.is_active = True
        assignment.save(update_fields=['is_active'])
    codes = set(codes)
    for code in codes:
        UserPermissionOverride.objects.update_or_create(
            user=user, permission=_permission(code), company_id=company_id, defaults={'mode': 'add'},
        )
    if exact:
        for code in effective_bundles().get(role, frozenset()) - codes:
            UserPermissionOverride.objects.get_or_create(
                user=user, permission=_permission(code), company_id=company_id, defaults={'mode': 'remove'},
            )
    clear_scoped_permission_cache(user)
    return assignment


def expense_head_id(section, code='9001'):
    """شناسهٔ یک سرفصل پیش‌فرض شرکتِ بخش (طرح ۳.۴)؛ شرکت تازه با سیگنال فهرست پیش‌فرض را دارد."""
    from personnel.expense_heads import seed_default_expense_heads
    from personnel.models import ExpenseHead, ProjectSection
    sec = section if hasattr(section, 'project') else ProjectSection.objects.select_related('project').get(pk=section)
    seed_default_expense_heads(sec.project.company_id)
    return ExpenseHead.objects.get(company_id=sec.project.company_id, code=code).pk


# رسید پرداخت (از ۹ آبان ۱۴۰۵ در هر پرداخت اجباری): فایل‌های تست در پوشهٔ موقت، نه media واقعی
TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix='wh_test_media_')
temp_media = override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)


def receipt_file(name='receipt.pdf'):
    """یک رسید کوچک و معتبر برای درخواست پرداخت (فیلد multipart به نام receipt)."""
    return SimpleUploadedFile(name, b'%PDF-1.4 test receipt', content_type='application/pdf')


PAY_ACTIONS = ('payments', 'pay', 'pay-charge')


def pay_request(action_or_url, data):
    """
    (بدنه، قالب) برای APIClient: درخواست پرداخت multipart با رسید (اگر تست receipt=None ندهد)، بقیه json.
    مقدار None در multipart فرستاده نمی‌شود.
    """
    key = str(action_or_url).rstrip('/').rsplit('/', 1)[-1]
    if key not in PAY_ACTIONS or not isinstance(data, dict):
        return data, 'json'
    out = {k: v for k, v in data.items() if v is not None}
    if 'receipt' not in data:
        out['receipt'] = receipt_file()
    return out, 'multipart'


VALID_TEST_SHEBA = 'IR450120000000101111111001'


def give_valid_sheba(counterparty, sheba=VALID_TEST_SHEBA):
    """ارسال فاکتور به گردش شبای معتبر طرف‌حساب را لازم دارد؛ فیکسچرها با این تابع حساب فعال می‌گیرند."""
    from personnel.models import PartyBankAccount
    return PartyBankAccount.objects.create(party=counterparty.party, bank_name='test', sheba_number=sheba)
