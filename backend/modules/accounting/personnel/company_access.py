"""
سهم حسابداری در لایهٔ شرکت هسته: نقش‌های انتساب به بخش و بخش‌های مجوز شرکت.
حوزهٔ `board` (هیئت‌مدیره) از ۲.۱ در هسته است (ت۷).
منبع عضویتِ «انتساب فعال به بخش» از گام ۲ طرح Project_Section_To_Core در هسته (`companies.org_membership`) است.
"""


# نقش‌های انتساب به بخش که حسابداری به هسته اعلام می‌کند (contribute('section_roles', ...)): (کد، برچسب، رتبه).
# رتبه یعنی «اختیار تأیید» در موتور گردش کار (مقدار نهایی، ت۵ طرح ۲.۳): حسابدار و خزانه‌دار نقش کاری دارند،
# نه سطحی بالاتر از مدیر؛ پس ثبت‌کنندهٔ خزانه‌دار تأیید مدیر را رد نمی‌کند. رتبهٔ ثبت‌کننده = بالاترین رتبهٔ
# نقش‌هایش در همان بخش. ماژول دیگری که همین کلید را اعلام کند باید برچسب و رتبهٔ یکسان بدهد.
SECTION_ROLES = (
    ('employee', 'کارمند / اپراتور ثبت', 10),
    ('supervisor', 'سرپرست بخش', 20),
    ('accountant', 'حسابدار پروژه', 30),
    ('manager', 'مدیر پروژه', 40),
    ('treasury', 'خزانه‌دار کل', 30),
)


# ─── بخش‌های مجوز شرکت که ماژول حسابداری به رجیستری هسته می‌دهد (طرح مجوزهای بخش‌به‌بخش، §۵-۱) ───
_MANAGER = {'viewer': 'read', 'manager': 'write'}
COMPANY_PERMISSION_SECTIONS = (
    # بیمه و مالیات (دیسکت حقوق) از ۲.۱ سهم حسابداری است؛ دادهٔ آن در CompanyPayrollProfile (ت۵).
    # کلید همان کلید قبلی هسته است تا سطح‌های ذخیره‌شده در UserCompanyAccess.section_levels معتبر بمانند.
    {'key': 'insurance_tax', 'label_fa': 'بیمه و مالیات', 'order': 20, 'kind': 'levels', 'sensitive': False,
     'studio': 'fiscal_insurance', 'templates': _MANAGER},
    {'key': 'bank', 'label_fa': 'بانک و شبا', 'order': 110, 'kind': 'levels', 'sensitive': False,
     'studio': 'treasury', 'templates': _MANAGER},
    # فهرست سرفصل‌های هزینهٔ شرکت؛ خواندن برای هر عضو شرکت (ص۳ طرح ۳.۴)
    {'key': 'expense_heads', 'label_fa': 'سرفصل‌های هزینه', 'order': 120, 'kind': 'levels', 'sensitive': False,
     'studio': 'expense_heads', 'templates': _MANAGER},
    {'key': 'fiscal', 'label_fa': 'دوره‌های مالی (ثبت، ویرایش و انجماد)', 'order': 130, 'kind': 'levels',
     'sensitive': False, 'studio': 'fiscal', 'templates': _MANAGER},
    {'key': 'docs_archive', 'label_fa': 'بایگانی مدارک', 'order': 140, 'kind': 'levels', 'sensitive': False,
     'studio': 'archive', 'templates': {'viewer': 'read', 'docs_clerk': 'write', 'manager': 'write'},
     'legacy': {'docs_read': 'read', 'docs_write': 'write'}},
    {'key': 'gdrive', 'label_fa': 'گوگل‌درایو', 'order': 150, 'kind': 'levels', 'sensitive': False,
     'studio': 'gdrive', 'templates': _MANAGER},
    {'key': 'docs_confidential', 'label_fa': 'مدارک محرمانه', 'order': 210, 'kind': 'levels', 'sensitive': True,
     'studio': 'archive'},
    {'key': 'fiscal_close', 'label_fa': 'بستن، بازگشایی و حذف دورهٔ مالی', 'order': 220, 'kind': 'action',
     'sensitive': True, 'studio': 'fiscal'},
    {'key': 'bank_sheba', 'label_fa': 'ثبت و تغییر شبا، و حساب اصلی', 'order': 230, 'kind': 'action',
     'sensitive': True, 'studio': 'treasury'},
    # پس از اولین گردش حساب، تغییر موجودی اولیه این مجوز جدا را می‌خواهد (ص۴ طرح ۳.۳)
    {'key': 'bank_opening_balance', 'label_fa': 'تغییر موجودی اولیهٔ حساب بانکی پس از گردش', 'order': 240,
     'kind': 'action', 'sensitive': True, 'studio': 'treasury'},
)
