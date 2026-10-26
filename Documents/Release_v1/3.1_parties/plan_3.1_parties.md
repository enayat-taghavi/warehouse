<div dir="rtl" align="right">

# طرح جزئی ۳.۱ — طرف بیرونی در هسته و طرف حساب‌های حسابداری

- **تاریخ:** ۴ آبان ۱۴۰۵ (۲۶ اکتبر ۲۰۲۶)
- **طرح مادر:** `Documents/Release_v1/release_v1_master_plan.md`، مرحلهٔ ۳، بند «طرف حساب‌ها روی طرف بیرونی هسته»
- **ورودی:** `Documents/Release_v1/letters_prerequisites/letters_core_requirements.md` بند ۳-ی
- **وضعیت:** طرح نوشته شد (گفتگوی «۳-الف»). طبق تصمیم کاربر (زنجیرهٔ خودکار مرحلهٔ ۳) بدون انتظار برای تأیید طرح اجرا می‌شود.

## ۰. قانون‌های مرتبط از طرح مادر

- ق۱: هسته نام حسابداری را نمی‌برد. وابستگی یک‌طرفه است: حسابداری به `contacts` هسته. نامه‌ها بعداً بی‌تغییر هسته از همین دفترچه استفاده می‌کنند.
- ق۲: داده ارزشی ندارد؛ `Counterparty` بازسازی می‌شود. انتقال سادهٔ ردیف‌های موجود فقط برای این است که فاکتور و تنخواه‌های `app` (با `PROTECT`) migration را نشکنند، نه برای حفظ داده.
- ق۶ و ق۱۶: هر طرف بیرونی فقط به یک شرکت تعلق دارد؛ کاربر فقط طرف‌های شرکت‌های خودش را می‌بیند و می‌سازد. شبا و شماره‌حساب داده‌های حساس‌اند.
- ق۸: ساخت، ویرایش و غیرفعال کردن طرف و حساب بانکی در سابقه ثبت می‌شود (`AuditLog` موجود).
- ق۹: اصطلاح‌ها در واژه‌نامه: «طرف بیرونی»، «طرف حساب»، «حساب بانکی طرف حساب».
- ق۱۱ و ق۱۲: فرم بانک و شبا طبق استاندارد `.agents/AGENTS.md` §7 (مودال ناوگان)؛ ۳۶۰ پیکسل.
- ق۱۸: فهرست‌ها صفحه‌بندی و جست‌وجو در سرور؛ بی N+1.

## ۱. وضع فعلی (بررسی کد، ۴ آبان ۱۴۰۵)

- **ک۱ (بالا):** `Counterparty` (`backend/modules/accounting/personnel/models_domains/treasury_audit.py:8-52`) هویت، تماس و بانک را در یک جدول حسابداری دارد: `name`، `counterparty_type` (راننده، تعمیرگاه، جایگاه سوخت، پیمانکار، سایر)، `national_id`، `phone`، `bank_name`، `account_number`، `sheba_number`، `account_code`، `is_active`. فقط یک حساب بانکی برای هر طرف. نشانی، نوع حقیقی/حقوقی، کد اقتصادی و موبایل ندارد.
- **ک۲ (بالا، دامنه):** `company` اختیاری است و طرف «سراسری» (بی‌شرکت) برای همهٔ شرکت‌ها دیده می‌شود (`views_domains/treasury_views.py:108-150`، `Q(company_id=cid) | Q(company__isnull=True)`). `create` برای هر کاربر واردشده باز است (`get_permissions`). `validate_counterparty_company` (`serializers_domains/treasury_audit.py:26-40`) طرف بی‌شرکت را برای هر بخش می‌پذیرد.
- **ک۳:** استفاده‌کننده‌ها: `ExpenseInvoice.counterparty` (`PROTECT`) و `PettyCashTransaction.counterparty` (`SET_NULL`) در همان فایل؛ `workflows.py` (خلاصه و `resolve_invoice` با `select_related('counterparty')`)؛ `cartable_views.py:123`؛ `org_excel_engine.py` (خروجی و ورود اکسل طرف حساب‌ها، خط‌های ۱۸، ۷۰-۱۰۱، ۲۳۶-۲۹۰)؛ `admin.py:21-31`؛ `section_guardian.py` (چک فیلدها، خط ۱۳۷-۱۴۱ و ساخت نمونه ۶۲۲-۶۶۴)؛ `to_journal_lines` فاکتور (`account_code` طرف).
- **ک۴ (فرانت):** صفحهٔ `frontend/src/app/modules/accounting/components/finance/counterparties/counterparties.ts` (۷۳۴ خط، مسیر `accountant-counterparties`)؛ API در `api/treasury-org-api.service.ts:155-168` و `290`؛ انتخاب طرف حساب در `employee-invoices` و `employee-petty-cash`.
- **ک۵ (الگوهای آماده):** حساب بانکی شرکت `CompanyBankAccount` (`organization.py:78-126`: یکسان‌سازی شبا در `save`، یکتایی شبا در شرکت، یک حساب اصلی، جایگزینی اصلی پس از حذف در `personnel/signals.py:7`)؛ اعتبارسنجی شبا در `personnel/sheba_utils.py:163` (`validate_sheba`)؛ اپ کوچک هسته با رجیستری مثل `core/numbering` (۲.۸).
- **ک۶:** هسته هیچ مدل «مخاطب» ندارد. `Company` (`core/companies/models.py:9-49`) فیلدهای هویتی خود شرکت را دارد و دست نمی‌خورد.

## ۲. تصمیم‌ها

- **ص۱ — اپ تازهٔ هسته `core/contacts`** (برچسب `contacts`)، در `PLATFORM_APPS` پس از `companies` (`backend/config/settings.py:96`). مدل `ExternalParty`:
  - `company` (`PROTECT`، اجباری)؛ `kind` ∈ {`person` حقیقی، `legal` حقوقی}؛ `name`؛ `national_id` (کد ملی ۱۰ رقم یا شناسهٔ ملی ۱۱ رقم، اختیاری، فقط رقم لاتین پس از یکسان‌سازی)؛ `economic_code`؛ `registration_number`؛ `phone`؛ `mobile`؛ `email`؛ `address`؛ `postal_code`؛ `notes`؛ `is_active`؛ `created_by`؛ `created_at`؛ `updated_at`.
  - قید یکتای شرطی `(company, national_id)` وقتی شناسه خالی نیست؛ شاخص `(company, name)`.
  - نوع کاری طرف (راننده، تعمیرگاه …) در هسته نیست؛ مال حسابداری است.
  - سرویس `contacts/services.py`: `create_party(company, data, user)`، `update_party(party, data, user)` با یکسان‌سازی رقم‌ها و پیام تکراری فارسی همراه شناسهٔ ردیف موجود (`duplicate_party`)؛ تابع دامنه `parties_for_user(user)` بر پایهٔ `get_user_allowed_companies`.
  - API خواندنی هسته: `GET /api/contacts/parties/?company=&search=&kind=` (صفحه‌بندی سرور، فقط شرکت‌های مجاز کاربر) و `GET /api/contacts/parties/<id>/`. نوشتن عمومی در هسته در این مرحله نیست؛ هر ماژول از راه سرویس و API خودش می‌نویسد (نامه‌ها بعداً API خود را می‌سازند). سابقه از `AuditLog` با `module` هسته‌ای `contacts`.
  - حذف: طرفی که ماژولی به آن وصل است با `PROTECT` حذف نمی‌شود؛ هسته فقط غیرفعال می‌کند.
- **ص۲ — بازسازی `Counterparty` در حسابداری:** `Counterparty(party OneToOne → contacts.ExternalParty PROTECT، counterparty_type، account_code، is_active، created_at، updated_at)`.
  - فیلدهای `company`، `name`، `national_id`، `phone`، `bank_name`، `account_number`، `sheba_number` از جدول حذف می‌شوند. `company_id` و `name` به‌صورت property از `party` خوانده می‌شوند تا کدهای خوانندهٔ فعلی (`validate_counterparty_company`، خلاصهٔ گردش، اکسل) کم عوض شوند؛ فیلترهای queryset به `party__company_id` و `party__name` می‌روند.
  - **طرف سراسری حذف می‌شود:** هر طرف حساب یک شرکت دارد (ق۶). `validate_counterparty_company` دیگر طرف بی‌شرکت را نمی‌پذیرد.
  - `ExpenseInvoice.counterparty` و `PettyCashTransaction.counterparty` همان کلید به `Counterparty` می‌مانند (نقش مالی).
- **ص۳ — حساب‌های بانکی طرف:** جدول حسابداری `PartyBankAccount(party FK → contacts.ExternalParty با PROTECT؛ bank_name، account_number، sheba_number، card_number، owner_name، is_primary، is_active، created_at، updated_at)`.
  - به `ExternalParty` وصل است، نه به `Counterparty`، تا بانکِ همان طرف برای هر نقش مالی یکی باشد؛ وابستگی یک‌طرفه (حسابداری → هسته).
  - یکتایی `(party, sheba_number)`؛ یک حساب اصلی برای هر طرف (همان الگوی `CompanyBankAccount.save`)؛ جایگزینی اصلی پس از حذف با سیگنال `post_delete` مثل `handle_bank_account_deleted`.
  - یکسان‌سازی شبا در یک تابع مشترک داخل `personnel/sheba_utils.py` (`normalize_sheba`) که `CompanyBankAccount` هم از آن استفاده می‌کند؛ اعتبارسنجی با `validate_sheba` موجود.
  - شبا و شماره‌حساب در پاسخ API برای کسی که مجوز دیدن دادهٔ بانکی ندارد پوشیده می‌شوند (ق۱۶؛ مجوز موقت: همان `IsCounterpartyManagerOrReadOnly`/حسابدار؛ مجوز ریز نهایی در ۳.۵).
- **ص۴ — API حسابداری (شکل پاسخ تا جای ممکن همان):** `/api/personnel/counterparties/` همچنان مسیر اصلی نوشتن است.
  - پاسخ: `id`، `party` (شناسه)، `company`، `company_name`، `kind`، `name`، `national_id`، `economic_code`، `phone`، `mobile`، `email`، `address`، `postal_code`، `counterparty_type` و نمایش آن، `account_code`، `is_active`، `bank_accounts` (فهرست تو در تو)، `primary_sheba` (برای فهرست و انتخابگر).
  - ساخت و ویرایش: فیلدهای هویتی از راه سرویس `contacts` و فیلدهای مالی روی `Counterparty`، در یک تراکنش. `company` اجباری و باید جزو شرکت‌های مجاز کاربر باشد؛ اگر طرف با همان شناسه در شرکت هست، `Counterparty` روی همان `party` ساخته می‌شود (یا پیام تکراری اگر نقش مالی هم دارد).
  - حساب بانکی: `/api/personnel/party-bank-accounts/` (فهرست با `?party=`، ساخت، ویرایش، حذف) با بررسی شرکت طرف در دامنهٔ کاربر.
  - `create` طرف حساب برای هر عضو شرکت باز می‌ماند (کارمند هنگام ثبت فاکتور طرف تازه می‌سازد)؛ ویرایش و حذف با `IsCounterpartyManagerOrReadOnly`. مجوز ریز در ۳.۵.
  - فهرست صفحه‌بندی‌شده با `select_related('party')` و `prefetch_related('party__bank_accounts')`.
- **ص۵ — migration (با `safe-migration`):** اپ `contacts` با `0001_initial`. در حسابداری یک migration سه‌قدمی در یک فایل یا دو فایل پشت‌سرهم: افزودن `party` نال‌پذیر و جدول `PartyBankAccount` → `RunPython` ساده که برای هر `Counterparty` یک `ExternalParty` (شرکت = شرکت خودش، یا برای طرف سراسری شرکت بخش اولین فاکتور یا تنخواهش؛ طرف سراسری بی‌استفاده پاک می‌شود) و در صورت داشتن شبا یک `PartyBankAccount` اصلی می‌سازد → `party` اجباری و حذف ستون‌های قدیمی. معکوس: `noop` (ق۲). این migration روی `app` با انتشار بعدی (آنتی‌گرویتی) اعمال می‌شود.
- **ص۶ — اکسل:** خروجی و ورود طرف حساب‌ها (`org_excel_engine.py`) با ستون‌های تازه (نوع حقیقی/حقوقی، کد اقتصادی، موبایل، نشانی) و یک حساب بانکی اصلی در هر ردیف؛ ورود از راه همان سرویس و همان بررسی شرکت. سربرگ دو ردیفی و `freeze_panes='A3'` می‌ماند (ق۱۰).
- **ص۷ — فرانت:** صفحهٔ طرف حساب‌ها فیلدهای تازه و یک زیرفهرست «حساب‌های بانکی» در مودال می‌گیرد؛ فرم حساب بانکی دقیقاً طبق استاندارد §7 (`onShebaInput`، `validateSheba`، `generateShebaFromAccount`، کامبوباکس بانک، کپی) و تا جای ممکن با استفادهٔ دوباره از همان کمک‌کننده‌های موجود. انتخابگر طرف حساب در فاکتور و تنخواه فقط با `name` و `primary_sheba` کار می‌کند و تغییر رفتاری نمی‌خواهد. چهار حالت صفحه و ۳۶۰ پیکسل.
- **ص۸ — نگهبان‌ها:** `section_guardian.py` با فیلدهای تازه هماهنگ می‌شود. هسته (`core/contacts`) نام حسابداری را نمی‌برد؛ نگهبان‌های 29 و 57 و `module_coupling_scan.py` سبز. اگر `contacts` در فهرست اپ‌های هسته به allowlist نیاز داشت، با دلیل اضافه می‌شود.
- **ص۹ — واژه‌نامه:** «طرف بیرونی» (`ExternalParty`؛ نگویید: مخاطب بیرونی، شخص ثالث)، «طرف حساب» (`Counterparty`؛ نقش مالی یک طرف بیرونی)، «حساب بانکی طرف حساب» (`PartyBankAccount`)، «حقیقی / حقوقی» (`kind`).

## ۳. کارها

- **۳.۱-الف (گفتگوی «۳-الف»):** همین طرح. واژه‌نامه در ۳.۱-ب.
- **۳.۱-ب (سرور، Claude؛ Opus + high چون migration و دامنه است):** ص۱ تا ص۶ و ص۸-ص۹: اپ `contacts` (مدل، سرویس، API خواندنی، تست‌ها)، بازسازی `Counterparty`، `PartyBankAccount` و سیگنال، `normalize_sheba`، migration با `safe-migration`، serializer و viewset حسابداری، اکسل، admin، `section_guardian.py`، واژه‌نامه.
  - تست‌ها (`contacts` و `personnel`): دامنهٔ شرکت در فهرست و ساخت (شرکت دیگر 403/خالی)، تکراری شناسه در یک شرکت و آزاد در شرکت دیگر، طرف سراسری دیگر پذیرفته نمی‌شود، فاکتور با طرف شرکت دیگر رد می‌شود، یک حساب اصلی و جایگزینی پس از حذف، یکسان‌سازی و اعتبار شبا، پوشیده بودن شبا برای بی‌مجوز، migration روی دادهٔ نمونه (طرف شرکت‌دار، سراسری با فاکتور، سراسری بی‌استفاده).
  - بازبین: `tenant-scope-reviewer` روی همین diff.
  - بخش کم‌خطر برای آنتی‌گرویتی: تست‌های سناریوهای API که بالا مشخص شده‌اند (پس از ساخت مدل‌ها، در نشست جدا روی فایل تست تازه).
- **۳.۱-ج (فرانت):** ص۷: مدل و API فرانت، صفحهٔ طرف حساب‌ها با زیرفهرست حساب‌های بانکی (اجراکنندهٔ Sonnet + medium یا آنتی‌گرویتی چون الگوی موجود است)، تست‌های DOM (آنتی‌گرویتی). نگهبان 56 و 52.
  - `ui-reviewer` و بررسی دیداری با بررسی‌های سنگین پایان مرحلهٔ ۳.

## ۴. تست‌ها

- فقط تست‌های سریع اپ‌های تغییرکرده: `manage.py test contacts personnel.<ماژول‌های تست طرف حساب و فاکتور و تنخواه>` با `PYTHONUTF8=1`؛ `manage.py check`؛ نگهبان‌های 29، 52، 56، 57، 58.
- فرانت: spec صفحهٔ طرف حساب‌ها و انتخابگرهای فاکتور و تنخواه.
- مجموعهٔ کامل و هر دو پروفایل ساخت در بررسی‌های سنگین مرحلهٔ ۳.

## ۵. معیار پذیرش

- طرف بیرونی در هسته است و هسته نام هیچ ماژولی را نمی‌برد؛ نگهبان‌های 29 و 57 سبزند (پس از ۳.۱-ب).
- هر طرف حساب یک شرکت دارد؛ کاربر شرکت دیگر آن را نمی‌بیند، نمی‌سازد و در فاکتور به کار نمی‌برد (پس از ۳.۱-ب).
- هر طرف چند حساب بانکی دارد، حداکثر یکی اصلی، و شبا پیش از ذخیره یکسان و اعتبارسنجی می‌شود (پس از ۳.۱-ب).
- migration روی پایگاه دادهٔ `app` بی‌خطا اعمال می‌شود و فاکتور و تنخواه‌های موجود نمی‌شکنند (انتشار بعدی).
- صفحهٔ طرف حساب‌ها با فرم بانک طبق §7، در ۳۶۰ پیکسل بی‌اسکرول افقی (پس از ۳.۱-ج و بررسی سنگین).

## ۶. نکته‌های باز

- مجوز ریز «مدیریت طرف حساب» و «دیدن دادهٔ بانکی» در ۳.۵ نهایی می‌شود؛ تا آن زمان قاعدهٔ موجود (`IsCounterpartyManagerOrReadOnly`) می‌ماند.
- انتخاب حساب مقصد پرداخت فاکتور (از میان حساب‌های طرف) در ۴.۱.
- API نوشتن عمومی طرف بیرونی در هسته با ماژول نامه‌ها (بعد از انتشار).

## ۷. گزارش پیشرفت

- **۴ آبان ۱۴۰۵ — ۳.۱-الف:** طرح نوشته شد (گفتگوی «۳-الف»). **اقدام بعدی:** ۳.۱-ب (سرور) طبق `scratch/brief_3_1_b.md`.

</div>
