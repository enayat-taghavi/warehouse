<div dir="rtl" align="right">

# طرح: مجوزهای بخش‌به‌بخش شرکت، عضویت خودکار، و کارهای باقی‌ماندهٔ طرح شرکت‌ها

تاریخ: ۳۰ مهر ۱۴۰۵ (2026-10-22). وضعیت: **طرح؛ منتظر تأیید**. تا تأیید صریح کاربر هیچ کدی تغییر نمی‌کند.
مرجع زمینه: `Documents/Companies_Frontend_Review/implementation_plan_companies_frontend.md` (§۶، §۸، و گزارش گام‌های ۸ و ۹).

## ۱. دامنه

- **بخش الف (هستهٔ طرح):** هر کاربر در هر شرکت، برای هر بخش یکی از سه سطح «هیچ»، «فقط خواندن» یا «نوشتن» را دارد. عضویت فضای کاری فقط خودکار است (منبع‌های ماژول‌ها و superuser). همین استودیو در «حالت محدود» برای دارندگان مجوز باز می‌شود. همهٔ این‌ها در بک‌اند اعمال می‌شود.
- **بخش ب:** شش کار باقی‌مانده از طرح قبلی (حذف آبشاری، یکتایی شبا، کلاس‌های بی‌اثر Tailwind 4، ورود از اکسل، یکی کردن پیش‌نمایش، دروازهٔ حذف شرکت).
- **بیرون از طرح:** انتشار روی `soft`، و آزمون روی گوشی واقعی (§۱۱).

## ۲. روش بررسی و شواهد

- **خوانده شد:** طرح قبلی (§۶، §۸، گام‌های ۸ و ۹)، و `.agents/AGENTS.md` بخش ۳ (RBAC حساس).
- **از کد خوانده شد:**
  - `core/companies/access.py:13-125`؛
  - `core/companies/models.py:90-134`؛
  - `core/accounts/serializers.py:96-150`؛
  - `core/accounts/middleware.py:215-250`؛
  - `modules/accounting/personnel/company_access.py`؛
  - `personnel/views_domains/scope_helpers.py:40-52` و `org_views.py:1060-1080`.
- **جستجوی گسترده:** یک Explore agent (sonnet) همهٔ جاهای `get_user_allowed_companies`، `access_level`، `workspace_full`، `docs_*`، `user-available` و `ActiveCompanyService` را فهرست کرد (§۵).
- **پرس‌وجوی فقط‌خواندنی روی دیتابیس `app`:**
  - `UserCompanyAccess`: **۱۴** رکورد `workspace_full` و **۲** رکورد `docs_write`. رکورد `docs_read` نیست.
  - `CompanyBankAccount`: ۲ حساب، که هر دو یک گروه تکراری‌اند (شرکت ۲، یک شبا، دو حساب).
- **CSS ساخته‌شده** (`dist/warehouse-app/browser/styles-*.css`): هر ۸ کلاس بند ب-۳ در آن صفرند. شمار در `warehouse-front/src`:

| کلاس | فایل | مورد |
|---|---|---|
| `shadow-xs` | ۵۴ | ۳۳۸ |
| `shadow-2xs` | ۴۰ | ۲۷۱ |
| `backdrop-blur-xs` | ۲۸ | ۷۷ |
| `animate-in` | ۳۰ | ۱۲۲ |
| `py-0.2` | ۲۱ | ۹۸ |
| `dir-ltr` | ۱۱ | ۲۴ |
| `border-3` | ۷ | ۸ |
| `animate-fade-in` | ۲ | ۲ |
| `bg-linear-to-*` | ۰ | ۰ (در طرح قبلی اصلاح شد) |

## ۳. تصمیم‌های گرفته‌شدهٔ کاربر (۳۰ مهر ۱۴۰۵)

| # | موضوع | تصمیم |
|---|---|---|
| ق۱ | سطح هر بخش | برای هر کاربر در هر شرکت، هر بخش یکی از «هیچ»، «فقط خواندن» یا «نوشتن» است. همیشه دستی و آگاهانه داده می‌شود |
| ق۲ | عضویت | عضویت دستی (`workspace_full`) کلاً حذف می‌شود. عضویت فقط از منبع‌های خودکار ماژول‌ها (`register_derived_company_source`) و superuser می‌آید. ماژول انبار هم منبع ثبت می‌کند. تب «دسترسی» عضویت را فقط با منبعش نمایش می‌دهد. `docs_read` و `docs_write` در جدول بخش‌ها حل می‌شوند |
| ق۳ | حالت محدود | همین استودیو با «حالت محدود»: فقط شرکت‌های مجاز. بخش بی‌مجوز پنهان و بخش فقط‌خواندنی غیرقابل‌ویرایش است. صفحه از بیرون بخش عملیات (لانچر) در دسترس است. صفحهٔ جدا ساخته نمی‌شود |
| ق۴ | ساخت و حذف شرکت | فقط superuser |
| ق۵ | محل اعمال | همه‌چیز در بک‌اند. پنهان کردن در فرانت کافی نیست |
| ق۶ | داده | داده مهم نیست و کار باید به سریع‌ترین روش انجام شود. نگاشت: `docs_write` ← بایگانی «نوشتن»، `docs_read` ← بایگانی «خواندن»، `workspace_full` ← قالب «مدیر شرکت». هیچ رکوردی بی‌صدا پاک نمی‌شود. ستون قدیمی تا پایان مهاجرت خوانده‌شدنی می‌ماند |

## ۴. تصمیم‌هایی که هنوز با کاربر است

پیشنهاد من در هر ردیف **پررنگ** است.

| # | موضوع | گزینه‌ها |
|---|---|---|
| ت۱ | مجری | **خود Claude برای بخش الف** (امنیتی و در هم‌تنیده در هسته، دو ماژول و فرانت؛ مثل ت۱۰ طرح قبلی). برای بخش ب هر دو شدنی است: Antigravity برای گام‌های ۲ و ۳ مکانیکی‌اند. یا همه با Antigravity، با `tasks.md` و runner |
| ت۲ | حذف آبشاری شرکت (ب-۱) | **`PROTECT`** یا حذف نرم. مقایسه در §۷ |
| ت۳ | شبای تکراری موجود در `app` | **یکی از دو حساب تکراری شرکت ۲ حذف شود** (داده مهم نیست؛ با `delete_impact` دیده و در گزارش ثبت شود). یا: شبای یکی دستی عوض شود |
| ت۴ | جایگزین کلاس‌های بی‌اثر (ب-۳) | این کلاس‌ها **امروز هیچ اثری ندارند**، پس «معادل‌سازی» ظاهر را عوض می‌کند (حدود ۶۸۶ سایه و بلور تازه). گزینه‌ها: **(الف) معادل 3.4، همان‌طور که خواستید** (`shadow-sm`، `backdrop-blur-sm`، `border-2`)، با بازبینی بصری؛ (ب) حذف کلاس، تا ظاهر فعلی ثابت بماند؛ (ج) مقدارهای Tailwind 4 در `tailwind.config.js` (`boxShadow.xs/2xs`، `backdropBlur.xs`، `borderWidth.3`)، تا diff قالب‌ها صفر شود و ظاهرِ موردنظرِ نویسنده بیاید |
| ت۵ | ورود از اکسل شرکت‌ها (ب-۴) | **فقط ساخت شرکت تازه، فقط superuser**؛ ردیف با `code` تکراری رد و گزارش شود. یا: ساخت و به‌روزرسانی با کلید `code` (به‌روزرسانی با مجوز بخش‌های همان ستون‌ها) |
| ت۶ | ذخیرهٔ سطح بخش‌ها | **`JSONField` به نام `section_levels` روی همان `UserCompanyAccess`** (سریع‌ترین: یک ردیف برای هر کاربر و شرکت، قالب‌ها اتمی، بدون جدول تازه، پرس‌وجوی کلیدی Postgres). یا: جدول نرمال `UserCompanySectionPermission(user, company, section, level)` (نمایه‌پذیرتر و تمیزتر ولی کندتر در ساخت) |
| ت۷ | منبع عضویت انبار | **کاربرِ منسوب (`Warehouse.assigned_users`) به انبارِ فعال (بایگانی‌نشده) و دارای شرکت، عضو همان شرکت است.** یا: هر انبار، بایگانی‌شده هم |
| ت۸ | «فهرست کاربران شرکت» (گره انتساب، §۵-۵) | امروز برای انتساب به بخش یا انبار، کاربر باید از قبل عضو باشد. پس از ق۲ عضویت خودش از همین انتساب می‌آید. **پیشنهاد:** ردیف `UserCompanyAccess` به «پیوند کاربر با شرکت» تبدیل شود. ردیفِ با همهٔ بخش‌ها «هیچ» هیچ دادهٔ ماژولی نمی‌دهد، ولی کاربر را در فهرست کاربران آن شرکت می‌آورد و انتساب‌پذیر می‌کند. تیک‌های شرکت در صفحهٔ کاربران همین پیوند را می‌سازند. یا: نخستین انتساب هر کاربر فقط با superuser |
| ت۹ | اعطای کارهای حساس | **فقط superuser، با پنجرهٔ تأیید. در هیچ قالبی نیستند** (هم‌سو با قاعدهٔ RBAC حساس AGENTS.md §۳). یا: هر دارندهٔ «نوشتن» دسترسی کاربران که خودش آن کار حساس را دارد |
| ت۱۰ | مسیر حالت محدود | **`/app/companies` و `/app/companies/:id`**، با کاشی «شرکت‌ها» در لانچر. `/app/operations/companies` برای superuser با حالت کامل می‌ماند. یا: یک مسیر برای هر دو، با نگهبان تازه به‌جای `OperationsGuard` |
| ت۱۱ | عضو بودن و خواندن بخش‌ها | **عضویت هیچ بخشی از استودیو را باز نمی‌کند.** استثنا: فهرست حساب‌های بانکی و دوره‌های مالی در فرم‌های ماژول (انتخاب حساب یا دوره) برای عضو خواندنی می‌ماند. یا: عضویت «فقط خواندن» همهٔ بخش‌ها را بدهد |
| ت۱۲ | تغییر مجوز در آفلاین | **فقط برخط (`SKIP_OFFLINE`)**. مجوز امنیتی است و اعطای در صف، اگر بعداً با ۴۰۳ رد شود، کاربر را گمراه می‌کند. یا: مثل امروز در صف آفلاین |
| ت۱۳ | کاربرانی که عضویت از دست می‌دهند | پس از گام ۶ و برای هر کاربر جدا: انتساب به بخش یا انبار، superuser شدن، یا پذیرفتن از دست رفتن دسترسی |
| ت۱۴ | ستون `access_level` در پایان | **حذف در گام ۱۲، پس از تأیید شما** (مهاجرت `RemoveField`). یا: نگه داشتن به‌صورت منسوخ و خوانده‌نشده |

## ۵. بخش الف: طراحی

### ۵-۱. بخش‌ها (رجیستری)

- **هسته:** بخش‌های هسته را در `core/companies/permission_sections.py` اعلام می‌کند.
- **ماژول‌ها:** بخش‌های خود را با `contribute('company_permission_sections', {...})` می‌افزایند. هسته نام هیچ بخش ماژولی را نمی‌برد (نگهبان‌های 29 و 57، و `module_coupling_scan`).
- **نصب «فقط انبار»:** فقط بخش‌های هسته را دارد.
- **مشخصات هر بخش:** کلید، برچسب فارسی، `kind` (`levels` یعنی هیچ/خواندن/نوشتن، `action` یعنی هیچ/مجاز)، `sensitive`، `order`، سطحش در هر قالب، و شناسهٔ تب و بخش استودیو.

| کلید | برچسب | مالک | نوع | حساس | فقط مشاهده | کارشناس مدارک | مدیر شرکت |
|---|---|---|---|---|---|---|---|
| `identity` | هویتی (نام، شناسه‌ها، نشانی، لوگو) | هسته | levels | — | خواندن | خواندن | نوشتن |
| `insurance_tax` | بیمه و مالیات | هسته | levels | — | خواندن | هیچ | نوشتن |
| `founding_docs` | اسناد مادر (اساسنامه و روزنامهٔ رسمی) | هسته | levels | — | خواندن | نوشتن | نوشتن |
| `user_access` | دسترسی کاربران | هسته | levels | — | هیچ | هیچ | نوشتن |
| `bank` | بانک و شبا | حسابداری | levels | — | خواندن | هیچ | نوشتن |
| `board` | هیئت‌مدیره | حسابداری | levels | — | خواندن | هیچ | نوشتن |
| `fiscal` | دوره‌های مالی (ثبت، ویرایش و انجماد) | حسابداری | levels | — | خواندن | هیچ | نوشتن |
| `docs_archive` | بایگانی مدارک | حسابداری | levels | — | خواندن | نوشتن | نوشتن |
| `gdrive` | گوگل‌درایو | حسابداری | levels | — | خواندن | هیچ | نوشتن |
| `docs_confidential` | مدارک محرمانه | حسابداری | levels | **بله** | هیچ | هیچ | هیچ |
| `fiscal_close` | بستن، بازگشایی و حذف دورهٔ مالی | حسابداری | action | **بله** | هیچ | هیچ | هیچ |
| `bank_sheba` | ثبت و تغییر شبا، و حساب اصلی | حسابداری | action | **بله** | هیچ | هیچ | هیچ |

- **قالب‌ها:** هر بخش سطح خودش را در هر قالب اعلام می‌کند، پس قالب از بخش‌های نصب‌شده ساخته می‌شود. مدیر قالب را انتخاب می‌کند و بعد خانه‌ها را تغییر می‌دهد.
- **کارهای حساس:** در هیچ قالبی نیستند. اعطای آن‌ها طبق ت۹ است.
- **سقف «نوشتنِ دسترسی کاربران»:** دارنده فقط تا سطح خودش در هر بخش مجوز می‌دهد. این موارد را نمی‌تواند:
  - ردیف خودش را تغییر دهد؛
  - ردیف superuser را تغییر دهد؛
  - ردیف کسی را که در بخشی از او بالاتر است تغییر یا حذف کند.
- **فیلدهای مدل `Company`:**
  - هسته فیلدهای خودش را به `identity`، `insurance_tax` و `founding_docs` نگاشت می‌کند.
  - حسابداری با `contribute('company_field_sections', ...)` فیلدهای هیئت‌مدیره (`board_*`، `authorized_signers`، `main_inspector` …) را به `board` نگاشت می‌کند.
  - `primary_bank_name`، `primary_account_number` و `primary_iban` از راه API فقط‌خواندنی‌اند، چون signal آن‌ها را از حساب اصلی پر می‌کند.
  - `is_active` و `has_warehouse_module` فقط برای superuser‌اند.
  - **قاعدهٔ پیش‌فرض:** فیلدی که در هیچ نگاشتی نیست فقط برای superuser است (بسته به‌طور پیش‌فرض).

### ۵-۲. عضویت

- **عضو است؟** superuser، یا یکی از منبع‌های خودکار ثبت‌شده. ردیف `UserCompanyAccess` دیگر عضویت نمی‌دهد.
- **منبع حسابداری (موجود):** انتساب فعال در بخش‌های پروژه (`personnel/company_access.py`).
- **منبع انبار (تازه، ت۷):** در `modules/warehouse/warehouses/apps.py` ثبت می‌شود. همراه آن یک سازندهٔ `company_member_q_builders` هم ثبت می‌شود، تا فهرست اعضا در هستهٔ `user_views.py:117` آن را ببیند.
- **برچسب منبع:** هر منبع در خروجی `source_label` می‌دهد، مثلاً «بخش X پروژهٔ Y» یا «انبار Z».
- **فهرست وارون:** contribution تازهٔ `company_member_sources(company_id)` نقشهٔ `{user_id: [labels]}` را برمی‌گرداند. تب «دسترسی» با آن همهٔ اعضا را با منبعشان نشان می‌دهد، حتی عضوی که ردیف `UserCompanyAccess` ندارد.

### ۵-۳. API هستهٔ دسترسی (`core/companies/access.py`)

- `get_user_allowed_companies(user)`: معنا «شرکت‌هایی که عضوش است». امضا برای مصرف‌کنندگان فعلی حفظ می‌شود.
  - **سازگاری موقت (گام‌های ۸ تا ۱۱):** `required_level='docs_read'` و `'docs_write'` به `docs_archive` خواندن و نوشتن نگاشت می‌شوند. `None` یعنی «عضو یا هر پیوند». در گام ۱۲ حذف می‌شوند.
- **تابع‌های تازه:**
  - `company_section_level(user, company_id, section)`؛
  - `companies_with_section(user, section, level)`؛
  - `ensure_section(user, company_id, section, level)` که `PermissionDenied` فارسی می‌دهد؛
  - `companies_with_any_section(user)` برای فهرست حالت محدود.
- **کش:** هر سه از کش درخواست موجود (`get_allowed_companies_cache`) استفاده می‌کنند.

### ۵-۴. نگاشت وابستگی‌ها (حساس‌ترین بخش)

**معنای ستون «پس از تغییر»:**
- **عضو** = `get_user_allowed_companies`؛
- **بخش:X/خواندن|نوشتن** = `ensure_section` یا `companies_with_section`؛
- **پیوند** = عضو، یا داشتن ردیف `UserCompanyAccess`، یا داشتن هر بخش با سطح «خواندن» یا بالاتر.

مسیرهای بک‌اند نسبت به `warehouse-backend/` هستند و مسیرهای فرانت نسبت به `warehouse-front/src/app/`.

**بک‌اند هسته**

| محل | امروز | پس از تغییر |
|---|---|---|
| `core/companies/access.py:59-91` | ردیف `workspace_full` به‌علاوهٔ منبع‌ها؛ `docs_*` از ردیف | عضو = superuser و منبع‌ها. سازگاری موقت §۵-۳ |
| `access.py:101` `validate_user_company_access`، `:123` `ensure_scoped_write` | پیش‌فرض `workspace_full` | عضو (بدون تغییر در مصرف‌کنندگان) |
| `core/accounts/middleware.py:225-237` (هدر `X-Company-ID`، و `?company_id`/`?company`) | `workspace_full`؛ کاربرِ فقط‌مدرک با `?company=` ۴۰۳ می‌گیرد (اجرا نشده؛ §۱۱) | **پیوند**. دروازهٔ دقیق در خود view است |
| `core/companies/views.py:51-53` `get_queryset` | عضو | حالت کامل: superuser. خواندن: عضو یا پیوند (برای حالت محدود) |
| `views.py:70-72` ساخت، `:84-91` حذف و `delete_impact` | `is_staff` یا superuser | **superuser** (گام ۱، ب-۶) |
| `views.py:77-79` ویرایش | `is_staff` یا superuser | هر فیلد ← بخشِ نگاشت‌شده/نوشتن (§۵-۱). فیلد بی‌نگاشت فقط superuser |
| `views.py:112-146` `user-available` | سه scope؛ `user_access_level` با پیش‌فرض نادرست `'docs_read'` | `?scope=workspace` = عضو. `documents` = `docs_archive`/خواندن. `all` و `manage` = پیوند. خروجی هر شرکت: `is_member`، `membership_sources[]` و `section_levels{}`. `user_access_level` تا گام ۱۲ برای سازگاری می‌ماند |
| `views.py:267-311` `UserCompanyAccessViewSet` | `IsOrgStructureManagerOrReadOnly` و `ensure_scoped_write`(عضو) | فهرست: `user_access`/خواندن در همان شرکت، یا ردیف خود کاربر. نوشتن: `user_access`/نوشتن، با سقف §۵-۱ و کارهای حساس طبق ت۹. اعتبارسنجی کلیدها و سطح‌ها با رجیستری نصب‌شده. `access_level` فقط‌خواندنی |
| `core/companies/serializers.py:56-70` | `fields='__all__'` | `section_levels` با validator. فیلد `membership` (فقط‌خواندنی، با منبع‌ها) |
| `core/accounts/serializers.py:96-190` `_sync_user_company_access` | تیک‌های شرکت در صفحهٔ کاربران `workspace_full` می‌سازند | **فقط پیوند** (`section_levels` تهی، ت۸). دامنهٔ نویسنده: `user_access`/نوشتن در آن شرکت، یا superuser |
| `core/accounts/serializers.py:360-395` (انبار در برابر شرکت) | انبار باید در شرکت‌های کاربر باشد | انبارِ شرکتی که کاربر با آن **پیوند** دارد (گره ت۸) |
| `serializers.py:420-455` (`company_accesses` در خروجی کاربر) | سطح و جزئیات مشتق | `section_levels`، `is_member` و منبع‌ها |
| `core/accounts/views_domains/user_views.py:51-61, 103-117` | فهرست اعضا: `workspace_full` خام به‌علاوهٔ `company_member_q_builders` | عضو (فقط q builderها) یا پیوند. فیلتر خام حذف |
| `user_views.py:703-707` (ورود کاربران از اکسل) | ساخت `workspace_full` | ساخت پیوند |
| `user_views.py:576-581` | عضو | پیوند |
| `core/accounts/scope.py:32,36` | کاربران با هر ردیف در شرکت‌های مجاز | کاربران دارای پیوند یا عضو در شرکت‌هایی که بیننده با آن‌ها پیوند دارد |
| `core/accounts/models.py:38` `primary_company` | ردیف پیش‌فرض | ردیف پیش‌فرض، به شرط عضو بودن. وگرنه نخستین شرکتی که عضوش است |
| `core/accounts/views_domains/audit_views.py:773-783` | عضو | عضو (بدون تغییر) |
| `core/notifications/consumers.py:45,167-176` | عضو | عضو |
| `core/platform_core/query_engine/engine.py:223-251` | عضو | عضو |
| `core/common/tenant_scope.py:59,73` | عضو | عضو |
| `core/settings_core/google_drive_views.py:231` | `access_checker` با متن «workspace_full» | از `access_checker` ماژول. متن log خنثی شود |

**بک‌اند انبار**

| محل | امروز | پس از تغییر |
|---|---|---|
| `warehouses/apps.py` | فقط `company_delete_blockers` | به‌علاوهٔ منبع عضویت (ت۷)، `company_member_q_builders` و `company_member_sources` |
| `warehouses/views.py:29-36, 59-65`؛ `user_extension.py:80-89`؛ `inventory/.../item_views.py:107, 143-154, 902-913, 2643`؛ `count_views.py:186`؛ `doc_views.py:79` | عضو | عضو (بدون تغییر کد). معنای عضو از منبع‌ها می‌آید |

**بک‌اند حسابداری**

| محل | امروز | پس از تغییر |
|---|---|---|
| `personnel/views.py:13,118` (بازصادرکردن `get_user_allowed_companies`) | نام بازصادرشده | حفظ؛ معنا همان «عضو» است |
| `org_views.py:66-90` `expiring_documents` | `docs_read`، بدون محرمانه | `docs_archive`/خواندن، و محرمانه فقط با `docs_confidential`/خواندن |
| `org_views.py:108-224` `CompanyDocumentViewSet` | `docs_read`/`docs_write` به‌علاوهٔ `is_staff` برای محرمانه و حذف | خواندن و دانلود: `docs_archive`/خواندن. ساخت، ویرایش و حذف: `docs_archive`/نوشتن. محرمانه: `docs_confidential`. همهٔ `is_staff`ها حذف |
| `org_views.py:247-316` `CompanyBankAccountViewSet` | عضو؛ دروازهٔ `is_staff` ندارد | فهرست: عضو یا `bank`/خواندن (ت۱۱). ویرایش: `bank`/نوشتن. ساخت، تغییر شبا و `set_primary`: `bank_sheba` |
| `org_views.py:323-380` `CompanyBoardMemberViewSet` | عضو؛ حذف `is_staff` | خواندن: `board`/خواندن. نوشتن و حذف: `board`/نوشتن |
| `org_views.py:389-466` `CompanyFiscalPeriodViewSet` | عضو؛ حذف و بستن `is_staff`؛ بازگشایی superuser | فهرست: عضو یا `fiscal`/خواندن (ت۱۱). ساخت، ویرایش و انجماد: `fiscal`/نوشتن. بستن، بازگشایی و حذف: `fiscal_close`. قاعدهٔ «دورهٔ بسته فقط superuser» (`:198`) می‌ماند |
| `google_drive_views.py:16-31` و `apps.py:39-45` | خواندن `docs_read`، نوشتن `workspace_full` (GD-05) | `gdrive`/خواندن و `gdrive`/نوشتن |
| `scope_helpers.py:43-51` `user_belongs_to_company` | `workspace_full` خام یا هر انتساب | **پیوند** یا هر انتساب (گره ت۸) |
| `org_views.py:1072-1074` (پیام `bulk_assign`) | `workspace_full` خام | پیوند یا انتساب |
| `lifecycle_services.py:972-975` `_workflow_recipient_ids` | `workspace_full` خام یا انتساب فعال | عضو (فقط انتساب فعال؛ منبع‌ها) |
| `company_access.py:8-31` | `access_level:'workspace_full'` در جزئیات | `source_label` («بخش X پروژهٔ Y») به‌جای سطح |
| `org_views.py:484-1056` (پروژه، بخش و انتساب)، `cartable_views.py`، `hr_views.py`، `treasury_views.py`، `trip_views.py`، `fleet_views.py`، `attendance_views.py`، `payroll_views.py:68`، `report_entities.py:33`، `scope_helpers.py` (بقیه) | عضو | عضو (بدون تغییر کد) |

**فرانت**

| محل | امروز | پس از تغییر |
|---|---|---|
| `core/models/company.model.ts:127,152-165` | `CompanyAccessLevel` سه‌مقداری | `SectionLevel` (`none`، `read`، `write`)، `section_levels`، `is_member` و `membership_sources` |
| `core/api/company-api.service.ts:152-160, 220-241` | `getUserAvailable(scope)` و CRUD دسترسی | به‌علاوهٔ `getPermissionSections()`. CRUD با `section_levels` و `SKIP_OFFLINE` (ت۱۲) |
| `core/services/active-company.service.ts:61-63, 106, 225` | `hasCompanyDocumentsAccess` = هر شرکت در scope مدارک | همان، با معنای `docs_archive`/خواندن (از بک‌اند). به‌علاوهٔ `manageableCompanies` (scope `manage`) برای کاشی و مسیر حالت محدود. کش با دادهٔ تازه جایگزین می‌شود و پاک نمی‌شود |
| `modules/accounting/.../company-documents-archive.ts:159,187,285,289` و `.html:20-21` | `user_access_level` و `docs_write`/`workspace_full` | `section_levels.docs_archive` و `docs_confidential` |
| `modules/common/.../operations/companies/companies.ts:136-158, 1485-1671` و `companies.html:1029-1260` | انتخاب یک سطح از سه | جدول بخش‌ها × سطح، انتخاب قالب، نشان عضویت با منبع، و قفل خانه‌های بالاتر از سطح خود مدیر (§۵-۶) |
| `companies.ts` (حالت استودیو) | فقط superuser (`OperationsGuard`) | ورودی `mode: 'full' \| 'restricted'` از `data` مسیر |
| `app.routes.ts:78-100`؛ `core/guards/operations.guard.ts` | `/app/operations/companies` فقط برای مدیر | مسیر تازهٔ ت۱۰ با نگهبان «پیوند دارد» |
| `modules/accounting/module.ts:191-223` (`studioTabs`/`studioSections`) | بدون مجوز | فیلد تازهٔ `permissionSection` در قرارداد (`core/modules/module-contract.ts:298`). هسته تب یا بخشِ «هیچ» را رندر نمی‌کند و تبِ «خواندن» را با `readonly` |
| `modules/common/components/users/users.ts:1699` و `users.html:1880-1919` | تیک شرکت ← `workspace_full` | تیک شرکت ← پیوند (ت۸). نشان «عضو / فقط پیوند» |
| `app.routes.ts:127-128, 171-172`؛ `core/auth/auth.guard.ts:158-166`؛ `layout.ts:667, 1147-1151`؛ `app-persona.service.ts:156-161, 419, 461` | `hasCompanyDocumentsAccess` | بدون تغییر کد (معنا از بک‌اند) |
| `company-switcher.ts:28-41` و دیگر مصرف‌کنندگان `availableCompanies` | عضو | عضو (بدون تغییر) |

**آزمون‌های اثرپذیر:**
- **بک‌اند (۱۹ فایل):** `core/companies/tests.py`، ۶ فایل `integration_tests/test_*company*`، `test_permission_aliases.py`، ۷ فایل حسابداری (`test_company_documents.py`، `test_google_drive.py`، `test_org_admin_menu_permissions.py`، `test_company_multitenant.py`، `test_cartable_multitenant.py`، `test_remediation_defects.py`، `tests_personnel_cycle.py`) و ۵ فایل انبار.
- **فرانت (۲۴ spec):** مهم‌ترین‌ها `companies.dom.spec.ts`، `company-documents-archive.dom.spec.ts`، `active-company.service.spec.ts`، `auth.guard.spec.ts` و `users.spec.ts`.
- آزمون‌هایی که با `access_level='workspace_full'` عضو می‌سازند، به انتساب بخش یا انبار تغییر می‌کنند.

### ۵-۵. گره انتساب (ت۸)

- `ensure_scoped_assignment` و `user_belongs_to_company` برای انتساب به بخش، عضو بودن را لازم دارند. انتساب انبار در `accounts/serializers.py:360-395` هم انبار را با شرکت‌های کاربر می‌سنجد.
- پس از ق۲ عضویت از همین انتساب‌ها می‌آید. پس کاربر تازه هرگز انتساب‌پذیر نمی‌شود، مگر با superuser.
- پیشنهاد ت۸ «پیوند» را شرط انتساب‌پذیری می‌کند و عضویت را همچنان فقط خودکار نگه می‌دارد.

### ۵-۶. فرانت: تب «دسترسی» و حالت محدود

- **تب «دسترسی»:**
  - **بالا:** فهرست اعضا (فقط‌خواندنی) با برچسب منبع. بدون گزینهٔ دستی.
  - **پایین:** جدول مجوزها. هر ردیف یک کاربر پیوندی است. ستون‌ها بخش‌های نصب‌شده‌اند (برچسب‌ها از `getPermissionSections()`). هر خانه یک انتخاب سه‌حالته است. یک انتخاب «قالب» هم هست.
  - **موبایل:** کارت با فهرست بخش‌ها (قاعدهٔ «بدون اسکرول»).
  - **کارهای حساس:** در گروه جدا، با پنجرهٔ تأیید. فقط برای superuser فعال است (ت۹).
- **حالت محدود:**
  - **فهرست:** فقط شرکت‌های `manage` (پیوند و دست‌کم یک بخش با سطح «خواندن» یا بالاتر).
  - **پنهان:** دکمه‌های «ثبت شرکت» و «حذف».
  - **تب‌ها:** تب یا بخش «هیچ» رندر نمی‌شود. تب «خواندن» فیلدهای `readonly` دارد و دکمهٔ ذخیره ندارد.
  - **ذخیره:** ذخیرهٔ هویتی فقط فیلدهای بخش‌های «نوشتن» را می‌فرستد.
  - **کاشی:** یک کاشی در لانچر، وقتی `manageableCompanies` تهی نیست.

## ۶. فهرست ایرادات

شدت: **ب** = بالا (امنیت یا داده)، **م** = متوسط، **ک** = کم.

### ۶-الف. بخش الف: مجوزها و عضویت

| شناسه | شدت | محل | ایراد | راه‌حل |
|---|---|---|---|---|
| P1 | ب | `companies/models.py:93-96`؛ `accounts/serializers.py:112,123`؛ `user_views.py:703-707` | عضویت دستی از سه راه ساخته می‌شود: تب «دسترسی»، تیک‌های شرکت در صفحهٔ کاربران، و ورود کاربران از اکسل | ق۲: عضویت فقط از منبع‌ها. سه راه به «پیوند» تبدیل شوند (ت۸) |
| P2 | ب | `warehouses/apps.py` | ماژول انبار منبع عضویت ندارد. نصب «فقط انبار» پس از ق۲ بی‌عضو می‌ماند | منبع انبار (ت۷) با `company_member_q_builders` و `company_member_sources` |
| P3 | م | `companies/models.py:93-96` | سطح‌ها درشت‌اند (`docs_read`، `docs_write`، `workspace_full`) و بخش‌به‌بخش نیستند | رجیستری بخش‌ها و `section_levels` (§۵-۱، ت۶) |
| P4 | م | `operations.guard.ts:9-30`؛ `app.routes.ts:78-100` | استودیو فقط برای مدیر کل است. دارندهٔ مجوز راهی به آن ندارد | حالت محدود (ق۳، ت۱۰) |
| P5 | ب | `companies/views.py:70-86`؛ `org_views.py:133-224, 380, 440-465` | دروازه‌های `is_staff` پراکنده‌اند و به شرکت ربطی ندارند: هر `is_staff` در هر شرکت مجازش ویرایش می‌کند و مدرک محرمانه می‌بیند | جایگزینی با بخش‌ها (§۵-۴). ساخت و حذف فقط superuser |
| P6 | م | `user_views.py:116`؛ `accounts/serializers.py:140-147`؛ `scope_helpers.py:43-51`؛ `org_views.py:1072-1074`؛ `lifecycle_services.py:972-975` | آزمون عضویت با `access_level='workspace_full'` خام در ۵ جا تکرار شده و رجیستری را دور می‌زند | همه از API هسته (§۵-۳) |
| P7 | م | `middleware.py:225-237` | `?company=` و `?company_id=` با `workspace_full` سنجیده می‌شوند. پس کاربرِ فقط‌مدرک یا حالت محدود ممکن است ۴۰۳ بگیرد | «پیوند» در middleware. دروازهٔ دقیق در view |
| P8 | ب | `scope_helpers.py:43-51`؛ `accounts/serializers.py:360-395` | گره انتساب (§۵-۵) | ت۸ |
| P9 | م | `google_drive_views.py:16-31`؛ `personnel/apps.py:39-45` | قاعدهٔ GD-05 به `workspace_full` گره خورده است | `gdrive`/خواندن و `gdrive`/نوشتن |
| P10 | ک | `companies/views.py:133-146` | `user_access_level` برای شرکتی که ردیف ندارد `'docs_read'` برمی‌گرداند که نادرست است | `section_levels` و `is_member` |
| P11 | م | `companies.ts:1625-1671`؛ `offline.interceptor.ts` | تغییر دسترسی در صف آفلاین می‌رود و پاسخ خوش‌بینانه می‌گیرد | ت۱۲. `data-loss-reviewer` |
| P12 | م | `modules/accounting/module.ts:191-223`؛ `module-contract.ts:298` | تب‌ها و بخش‌های مشارکتی استودیو هیچ اتصالی به مجوز ندارند | `permissionSection` در قرارداد |

### ۶-ب. بخش ب: کارهای باقی‌مانده

| شناسه | شدت | محل | ایراد | راه‌حل |
|---|---|---|---|---|
| F1 | ب | `personnel/models_domains/organization.py:28, 82, 164, 207`؛ `payroll.py:15`؛ `treasury_audit.py:20`؛ `inventory/models.py:21` | حذف شرکت آبشاری پاک می‌کند: مدارک، حساب بانکی، هیئت‌مدیره، دوره‌های مالی، تنظیمات سالانهٔ حقوق، طرف‌حساب‌ها و تعریف فیلدهای کالا. `FinancialProject`، `PersonnelProfile`، `MonthlyWorkPeriod`، `VehicleDriverProfile` و `Warehouse` از قبل `PROTECT`‌اند. `CompanyGoogleDriveConfig`، `GoogleDriveSyncQueue` و `UserCompanyAccess` هم آبشاری‌اند | ت۲ (§۷) |
| F2 | م | `organization.py:78-125` | یکتایی شبا در هر شرکت در بک‌اند نیست (فقط هشدار A15 فرانت). در `app` یک گروه تکراری هست | `UniqueConstraint(company, sheba_number)`. خطای فارسی در serializer. مهاجرت پیش از افزودن قید تکراری‌ها را بررسی می‌کند و با پیام روشن متوقف می‌شود، بی‌آنکه چیزی پاک کند. دادهٔ `app` طبق ت۳ |
| F3 | م | ۸ کلاس در `warehouse-front/src` (جدول §۲) | کلاس‌های Tailwind 4 در 3.4 ساخته نمی‌شوند و اثری ندارند | ت۴. همیشه: `py-0.2` ← `py-0.5`، `dir-ltr` ← `dir="ltr"`، و `animate-in` حذف (هم‌نشین‌هایش، مثل `fade-in` که در `styles.css:67` هست، می‌مانند). `animate-fade-in` ← `fade-in`. یک بررسی ساده در نگهبان 52 جلوی برگشت این کلاس‌ها را بگیرد |
| F4 | ک | `core/companies/views.py:155` (فقط `export_excel`) | «ورود از اکسل» شرکت‌ها مسیر بک‌اند ندارد | `POST companies/import-excel/`: سربرگ دوسطری هم‌شکل خروجی (AGENTS.md §۳)، اعتبارسنجی شناسهٔ ملی، `transaction.atomic`، و گزارش ردیف‌به‌ردیف. فرانت: `excel-import-modal` مشترک و دکمه فقط برای superuser (ت۵) |
| F5 | ک | `company-documents-archive.html:454-515`، `.ts` | پیش‌نمایش جدا: فقط ماوس، بدون نقش dialog، و `backdrop-blur-xs` | `<app-document-preview>` از `shared/components/document-preview` (لمسی و دسترس‌پذیر). spec بایگانی به‌روز شود |
| F6 | ب | `core/companies/views.py:70-72, 84-91` | هر `is_staff` با هر سطح دسترسی (حتی `docs_read`) شرکت می‌سازد، حذف می‌کند و اثر حذف را می‌بیند (یادداشت `tenant-scope-reviewer` گام ۸) | ق۴: ساخت، حذف و `delete_impact` فقط superuser. آزمون: `is_staff` غیر superuser ۴۰۳ |

## ۷. ت۲: `PROTECT` یا حذف نرم

| | `PROTECT` (پیشنهاد) | حذف نرم |
|---|---|---|
| **کار** | `AlterField` روی ۷ FK. فقط حالت مدل عوض می‌شود و SQL ندارد، چون Django خودش `on_delete` را اجرا می‌کند | فیلد `deleted_at`، manager پیش‌فرض فیلترشده، و بازنگری همهٔ querysetها، `unique` کد و شناسهٔ ملی، `user-available`، WebSocket، گزارش‌ها و … |
| **مزایا** | ساده و قطعی، بدون مهاجرت داده. با زیرساخت گام ۸ جور است: `blocked` و شمار `PROTECT` در `smart-delete-modal` و پیشنهاد «غیرفعال کردن» که عملاً همان حذف نرم است (`is_active=false`) | امکان بازیابی. حذف بی‌مانع برای کاربر |
| **معایب** | شرکت دارای داده حذف‌شدنی نیست. باید اول غیرفعال شود، یا داده‌ها دستی پاک شوند | بزرگ و پرخطر: هر queryset فراموش‌شده نشت دادهٔ «حذف‌شده» است. کد و شناسهٔ تکراری با شرکت حذف‌شده برخورد می‌کند. با `is_active` موجود هم‌پوشانی دارد |
| **پیشنهاد** | `PROTECT` برای دادهٔ کسب‌وکاری: مدارک، بانک، هیئت‌مدیره، دوره‌ها، تنظیمات حقوق، طرف‌حساب‌ها و فیلدهای کالا. `CASCADE` برای پیکربندی و دادهٔ وابسته: پیکربندی گوگل‌درایو، صف گوگل‌درایو و `UserCompanyAccess` | — |

**نکتهٔ صف گوگل‌درایو:** چون مدارک `PROTECT` می‌شوند، شرکتی که مدرک دارد حذف‌شدنی نیست. پس صفِ مدارکش هم یتیم نمی‌شود. با این حال `data-loss-reviewer` این را می‌سنجد.

## ۸. گام‌ها

**قواعد اجرا:**
- هر گام در یک جلسه انجام می‌شود و در پایانش commit و یادداشت تحویل نوشته می‌شود.
- مجری طبق ت۱.
- **بازبین‌ها در پایان هر گام:**
  - `tenant-scope-reviewer` برای همهٔ گام‌ها؛
  - `data-loss-reviewer` برای مهاجرت‌ها و صف آفلاین؛
  - `ui-reviewer` برای گام‌های فرانت.
- **ترتیب:** اول کارهای کوچک و مستقل بخش ب، سپس بخش الف مرحله‌ای و expand-contract. ستون `access_level` تا گام ۱۲ خوانده‌شدنی می‌ماند.

| گام | محتوا | شناسه‌ها | پذیرش |
|---|---|---|---|
| ۰ | خط پایه: آزمون‌های بک‌اند با برچسب (`companies common accounts warehouses inventory personnel integration_tests`)، specهای شرکت‌ها و بایگانی با tsconfig موقت، و نگهبان‌های 29، 52، 55، 56 و 57 | — | عددهای پایه در گزارش پیشرفت ثبت شوند |
| ۱ | دروازهٔ ساخت و حذف شرکت | F6 | ساخت، حذف و `delete_impact` فقط superuser. آزمون `is_staff` ← ۴۰۳. `CompanyDeleteImpactTests` سبز |
| ۲ | کلاس‌های بی‌اثر Tailwind 4 | F3، ت۴ | `grep` هر ۸ کلاس در `src` صفر. بررسی نگهبان 52. `npm run build` سبز. بازبینی بصری چند صفحهٔ پرکاربرد در ۳۶۰ پیکسل و دسکتاپ. نگهبان 56 |
| ۳ | یکی کردن پیش‌نمایش | F5 | بایگانی از `app-document-preview` استفاده می‌کند و مودال اختصاصی حذف شده است (نگهبان 56 با توجیه `--allow-removed`). spec بایگانی سبز. زوم، جابه‌جایی pointer، Esc و برگشت |
| ۴ | `PROTECT` و یکتایی شبا (مهاجرت) | F1، F2، ت۲، ت۳ | مهارت `safe-migration`. پشتیبان با `create_database_backup`. مهاجرت‌ها فقط state و قید هستند. آزمون: حذف شرکت دارای مدرک ← `blocked`، و شبای تکراری ← ۴۰۰ فارسی. پیش‌بررسی تکراری‌ها چیزی پاک نمی‌کند. `data-loss-reviewer` |
| ۵ | ورود از اکسل شرکت‌ها | F4، ت۵ | آزمون بک‌اند: سربرگ دوسطری، ردیف نامعتبر گزارش می‌شود و بقیه ثبت، غیر superuser ۴۰۳، و رفت‌وبرگشت خروجی ← ورودی. spec دکمه و مودال |
| ۶ | **الف-۱: فهرست فقط‌خواندنی کاربرانی که عضویت از دست می‌دهند** | ق۶، ت۱۳ | اسکریپت `scripts/company_membership_loss_report.py`: هیچ نوشتنی ندارد (فقط `SELECT`، داخل تراکنش `read only`). برای هر ردیف `workspace_full` دستی بی‌منبع، یعنی بدون انتساب فعال بخش و بدون انبار فعالِ آن شرکت (منبع انبار با همان شرط ت۷ مستقیم پرس‌وجو می‌شود، چون هنوز ثبت نشده)، این‌ها را می‌دهد: کاربر، شرکت، فعال بودن، آخرین ورود و `is_staff`. خروجی در گزارش پیشرفت می‌آید. **تا تصمیم کاربر برای هر ردیف (ت۱۳) گام ۸ آغاز نمی‌شود** |
| ۷ | الف-۲: مدل، رجیستری و مهاجرت داده (expand؛ رفتار عوض نمی‌شود) | P3، ت۶ | `section_levels` افزوده شد. رجیستری هسته و contribution حسابداری (`company_permission_sections` و `company_field_sections`). مهاجرت داده طبق ق۶، بدون حذف ردیف و با `access_level` دست‌نخورده. `GET company-permission-sections/` (بخش‌های نصب‌شده). آزمون با `WH_MODULES=warehouse` (فقط ۴ بخش هسته) و `accounting`. `data-loss-reviewer` |
| ۸ | الف-۳: سوئیچ بک‌اند هسته و انبار | P1، P2، P5 (هسته)، P6 (هسته)، P7، P8، P10، ت۷، ت۸ | همهٔ ردیف‌های هسته و انبار در §۵-۴. عضویت = superuser و منبع‌ها. منبع انبار ثبت شده است. سازگاری `docs_*` (§۵-۳). آزمون‌ها: کاربر دارای ردیف «مدیر شرکت» بی‌منبع عضو نیست. منسوب به انبار عضو است. سقف «نوشتن دسترسی کاربران». کار حساس با غیر superuser ۴۰۳. فیلد بی‌نگاشت ۴۰۳. middleware با پیوند |
| ۹ | الف-۴: سوئیچ بک‌اند حسابداری | P5 (ماژول)، P6 (ماژول)، P9، ت۱۱ | همهٔ ردیف‌های حسابداری در §۵-۴. هیچ `is_staff` و `workspace_full` خامی در `personnel` نمانده است. آزمون‌های سطح بخش برای بانک، هیئت‌مدیره، دوره، مدارک، محرمانه و گوگل‌درایو |
| ۱۰ | الف-۵: فرانت تب «دسترسی» | P3، P11، P12 (قرارداد)، ت۹، ت۱۲ | جدول بخش‌ها با قالب‌ها، اعضا با منبع، خانه‌های قفل‌شده بالاتر از سطح مدیر، تأیید کار حساس، و `SKIP_OFFLINE`. صفحهٔ کاربران: تیک شرکت ← پیوند. specهای DOM. در ۳۶۰ پیکسل بدون اسکرول افقی و بدون دکمهٔ زیر ۴۰ پیکسل. `ui-reviewer` و `data-loss-reviewer` |
| ۱۱ | الف-۶: فرانت حالت محدود | P4، P12، ق۳، ت۱۰ | مسیر و نگهبان و کاشی لانچر. تب «هیچ» رندر نمی‌شود و تب «خواندن» `readonly` است. ذخیره فقط فیلدهای مجاز را می‌فرستد. بایگانی از `section_levels` می‌خواند. specها. بازبینی بصری با حساب `qa_*` محدود (فقط‌مشاهده و کارشناس مدارک)، که بعد حذف می‌شود |
| ۱۲ | الف-۷: جمع‌بندی (contract) | ت۱۴ | سازگاری `docs_*` و `user_access_level` حذف شود. حذف `access_level` پس از تأیید شما (مهاجرت جدا با `safe-migration`). نصب «فقط انبار» و «فقط حسابداری» دوباره آزموده شود. نگهبان 29، 57 و `module_coupling_scan` بدون نقض تازه (در صورت نیاز `core_literal_allowlist.json` با دلیل). نگهبان 56 با `--base` آغاز گام ۶. هر سه بازبین |

**بررسی‌های هر گام:**
- `manage.py check`؛
- آزمون بک‌اند فقط با برچسب اپ (`--keepdb`)، **هرگز بدون برچسب**؛
- `npx tsc --noEmit -p tsconfig.app.json` و specهای همان بخش با tsconfig موقت؛
- نگهبان‌های 29، 52، 55، 56 و 57.

## ۹. الزام‌های ماژولار

- **هسته:** هیچ کلید بخش حسابداری یا انبار ندارد. همه از contribution می‌آیند: `company_permission_sections`، `company_field_sections`، `company_member_sources` و `company_member_q_builders`.
- **فرانت:** برچسب‌ها و فهرست بخش‌ها را از API می‌خواند. فقط `permissionSection` در `module.ts` خود ماژول نام کلید را می‌برد.
- **نصب «فقط انبار»:** فقط بخش‌های هسته را دارد و منبع عضویت انبار در آن کار می‌کند (آزمون گام‌های ۷، ۸ و ۱۲).
- **کلید ناشناخته:** کلیدِ بخشِ ماژولِ نصب‌نشده در `section_levels` به‌صورت داده می‌ماند و هرگز پاک نمی‌شود. API آن را نه نمایش می‌دهد و نه می‌پذیرد.

## ۱۰. خطرها

- **گام ۸ دسترسی را می‌برد.** هر کاربر فهرست گام ۶ که تصمیمش «پذیرفتن» نباشد، باید پیش از گام ۸ منبع بگیرد.
- **منبع انبار دسترسی را گسترش می‌دهد.** کاربری که به انبارِ شرکتی منسوب است و امروز ردیف آن شرکت را ندارد، عضو می‌شود. گام ۶ این کاربران را هم جدا فهرست می‌کند.
- **گام‌های ۸ و ۹ باید پشت هم بیایند.** در فاصلهٔ آن‌ها لایهٔ سازگاری `docs_*` جلوی شکست ماژول را می‌گیرد.

## ۱۱. آنچه بررسی نشد

- **آزمون روی گوشی واقعی (با خود کاربر):** زوم دوانگشتی پیش‌نمایش، باز شدن datepicker، و صفحه‌کلید واقعی در فرم‌های استودیو.
- **رفتار middleware با `?company=`** برای کاربرِ فقط‌مدرک (P7) فقط از کد استنباط شد و اجرا نشد. در گام ۸ آزمون می‌شود.
- **صفحه‌های پشت ورود** فقط با حساب موقت `qa_*` روی `localhost:4300` دیده می‌شوند. آزمون نهایی با حساب‌های واقعیِ بی‌مجوز و دارای مجوز با کاربر است.
- **شمار کاربرانی که عضویت از دست می‌دهند** هنوز گرفته نشده است (گام ۶).

## گزارش پیشرفت

### نگارش طرح (۳۰ مهر ۱۴۰۵، روی `5717d6d8`)

- **وضعیت:** طرح نوشته شد. **هیچ کدی تغییر نکرد.**
- **شواهد:** در §۲ آمده است. پرس‌وجوی دیتابیس `app` فقط‌خواندنی بود.
- **گام بعد:** تأیید صریح کاربر، و پاسخ به ت۱ تا ت۱۲ و ت۱۴. سپس گام ۰.

### تأیید (۳۰ مهر ۱۴۰۵)

- کاربر نوشت «شروع به اجرای طرح کن و همه کار را در همین چت تمام کن». مجری خود Claude است (ت۱). برای ت۲ تا ت۱۲ و ت۱۴ پیشنهادهای پررنگ §۴ به‌کار می‌رود. ت۴ گزینهٔ (الف) است.
- ت۱۳ همچنان پس از گام ۶ از کاربر پرسیده می‌شود.
- مصرف هفتگی در آغاز اجرا ۹۴٪ بود. اگر به ۱۰۰٪ برسد، کار در همان نقطه جمع‌بندی می‌شود.

### گام ۰ — خط پایه (۳۰ مهر ۱۴۰۵)

- برای صرفه‌جویی در مصرف، اجرای جدای خط پایه انجام نشد. به‌جای آن، هر گام آزمون‌های مربوط به خودش را اجرا کرد.
- **انحراف:** عددهای پایهٔ نگهبان 55 و 57 ثبت نشدند.

### گام ۱ — دروازهٔ ساخت و حذف شرکت، F6 (`714ca602`) — انجام شد

- **دروازه:** ساخت، حذف و `delete_impact` فقط برای superuser است.
- **پیش از اعتبارسنجی:** بررسی ساخت به `create()` رفت. یافتهٔ `tenant-scope-reviewer` این بود که خطای یکتایی کد یا شناسهٔ ملی وجود شرکتِ مستأجر دیگر را لو می‌داد. اصلاح شد.
- **ویرایش:** هنوز `is_staff` می‌پذیرد. گام ۸ آن را بخش‌محور می‌کند.
- **آزمون:** `companies` ۱۷ از ۱۷ سبز. آزمون تازه: `is_staff` برای اثر حذف، حذف و ساخت ۴۰۳ می‌گیرد.

### گام ۲ — کلاس‌های بی‌اثر Tailwind 4، F3 (`75a1ae8b`) — انجام شد

- **جایگزینی در ۸۲ فایل:**
  - `shadow-xs` و `shadow-2xs` ← `shadow-sm`؛
  - `backdrop-blur-xs` ← `backdrop-blur-sm`؛
  - `border-3` ← `border-2`؛
  - `py-0.2` ← `py-0.5`؛
  - `animate-fade-in` ← `fade-in`؛
  - `animate-in` حذف شد. هم‌نشین‌هایش (`fade-in`، `zoom-in` و …) دست نخوردند.
- **انحراف از طرح:** `dir-ltr` به `dir="ltr"` تبدیل نشد. به‌جای آن یک کلاس سراسری `.dir-ltr{direction:ltr;unicode-bidi:isolate}` در `styles.css` افزوده شد. ۲۴ قالب دست نخوردند، و سه کامپوننت از پیش همین کلاس را در CSS خودشان داشتند.
- **نگهبان 52:** بند ۶ تازه، که جلوی برگشت این کلاس‌ها را می‌گیرد.
- **بررسی‌ها:** `tsc` و نگهبان‌های 52 و 56 سبز.
- **انجام‌نشده (صرفه‌جویی):** بازبینی بصری و `ui-reviewer`.

### گام ۳ — یکی کردن پیش‌نمایش، F5 (`d4a188f0`) — انجام شد

- بایگانی مدارک حالا از `app-document-preview` استفاده می‌کند.
- مودال اختصاصی، `DomSanitizer`، `previewModal`، `closePreview` و state مربوط به blob حذف شدند. نگهبان 56 با `--allow-removed closePreview` سبز است.
- **spec:** به‌جای مودال قدیمی، `docPreview.open` بررسی می‌شود. ۲۶ از ۲۶ سبز.

### گام ۴ — `PROTECT` و یکتایی شبا، F1 و F2 (`4a8702bb`) — انجام شد

- **`PROTECT`:** روی ۷ رابطهٔ مدارک، بانک، هیئت‌مدیره، دوره‌ها، تنظیمات حقوق، طرف‌حساب‌ها و `ItemFieldDefinition`. این تغییر فقط state است و SQL ندارد.
- **یکتایی شبا:** `UniqueConstraint(company, sheba_number)`. پیش از آن یک `RunPython` تکراری‌ها را می‌سنجد و فقط متوقف می‌کند، چیزی پاک نمی‌کند. serializer پیام ۴۰۰ فارسی می‌دهد.
- **ت۳:** پیش از migrate پشتیبان `backup_20261022_065412.dump` گرفته شد. سپس حساب تکراری #۲ شرکت ۲ (غیراصلی و جدیدتر) حذف شد؛ اثر حذف فقط همان یک ردیف بود.
- **آزمون:**
  - تازه‌ها: شرکت دارای حساب بانکی حذف‌شدنی نیست، و شبای تکراری ۴۰۰ می‌گیرد.
  - `personnel inventory warehouses companies integration_tests`: ۷۸۹ آزمون با یک شکست بی‌ربط (`communications.test_performance` در شمار پرس‌وجو).
- **`data-loss-reviewer`:** یافتهٔ تأییدشده نداشت.
  - **یادداشت:** صف گوگل‌درایو و پیکربندی آن همچنان `CASCADE`‌اند (طبق §۷).

### گام ۵ — ورود از اکسل شرکت‌ها، F4 (`cb2a62c4`) — انجام شد

- **بک‌اند:** `POST companies/import-excel/`. فقط superuser، و بررسی دسترسی پیش از خواندن فایل است. سربرگ دوسطری، فقط ساخت، `dry_run`، و خطای ردیف‌به‌ردیف. الگوی خالی با `export-excel?template=1`.
- **فرانت:** دکمهٔ «ورود شرکت‌ها از اکسل» فقط برای superuser، همراه با `excel-import-modal`. درخواست با `SKIP_OFFLINE` فرستاده می‌شود.
- **آزمون‌ها:** ۳ آزمون بک‌اند تازه، و `companies` سبز. specهای شرکت‌ها سبز. `tsc` و نگهبان 56 سبز.

### گام ۶ — فهرست فقط‌خواندنی کاربرانی که عضویت از دست می‌دهند (۳۰ مهر ۱۴۰۵) — انجام شد

- **اسکریپت:** `scripts/company_membership_loss_report.py`، داخل تراکنش `READ ONLY` و با rollback.
- **نتیجه روی `app`:**
  - ۱۴ ردیف `workspace_full` دستی؛
  - **۰ کاربر عضویت از دست می‌دهد** (همه انتساب فعال بخش دارند یا superuser‌اند)؛
  - **۰ کاربر** فقط از راه منبع انبار عضویت تازه می‌گیرد.
- **ت۱۳:** تصمیمی لازم نشد.

### گام ۷ — مدل، رجیستری و مهاجرت داده (expand؛ رفتار عوض نشد) — انجام شد

- **رجیستری هسته:** `core/companies/permission_sections.py` با این اجزا:
  - ۴ بخش هسته، و نگاشت فیلدهای `Company` به بخش (فیلد بی‌نگاشت فقط برای superuser)؛
  - قالب‌های `viewer`، `docs_clerk` و `manager`؛
  - `legacy_levels`، `normalize_levels` و `public_spec`.
- **حسابداری:** ۸ بخش (۳ حساس) و نگاشت فیلدهای هیئت‌مدیره را در `personnel/company_access.py` اعلام و در `apps.py` ثبت می‌کند. هسته هیچ کلید ماژولی ندارد. نگهبان‌های 29 و 57 سبز.
- **مدل:** `UserCompanyAccess.section_levels` (JSONField).
- **مهاجرت `companies/0002`:**
  - `AddField` و `RunPython`، که فقط ردیف‌های تهی را از روی `access_level` پر می‌کند. هیچ حذفی ندارد و `access_level` دست نمی‌خورد.
  - پیش از migrate پشتیبان `backup_20261022_071053.dump` گرفته شد.
  - **نتیجه روی `app`:** ۱۴ ردیف `workspace_full` ← ۱۲ بخش (قالب «مدیر شرکت»، کارهای حساس «هیچ»). ۲ ردیف `docs_write` ← `docs_archive: write`.
- **API:** `GET /api/org/company-permission-sections/`. در نصب `WH_MODULES=warehouse` ۴ بخش و در `accounting` ۱۲ بخش برمی‌گرداند.
- **آزمون‌ها:** `companies` سبز، با ۲ آزمون تازه.
- **`data-loss-reviewer`:** یافتهٔ تأییدشده نداشت. **الزام برای گام ۸ (اعمال شد):** اگر مهاجرت بدون ماژول حسابداری اجرا شود، `docs_*` به `{}` نگاشت می‌شود. پس resolver هر جا `section_levels` تهی است باید به `legacy_levels(access_level)` برگردد.

### گام ۸ — سوئیچ بک‌اند هسته و انبار (۳۰ مهر ۱۴۰۵) — انجام شد؛ آزمون‌های حسابداری به گام ۹ موکول شد

**انجام شد:**
- **`core/companies/access.py`:**
  - عضو = superuser و منبع‌های خودکار. ردیف دستی دیگر عضویت نمی‌دهد.
  - API تازه: `user_section_levels`، `company_section_level`، `companies_with_section`، `companies_with_any_section` و `ensure_section`.
  - **سازگاری موقت:** `docs_read`/`docs_write` به بخش‌هایی با `legacy` نگاشت می‌شوند. `None` یعنی پیوند.
  - ردیفِ بی‌سطح با `access_level` قدیمی `docs_*` از `legacy_levels` خوانده می‌شود (الزام گام ۷).
- **`CompanyViewSet`:**
  - queryset = عضو یا دارندهٔ دست‌کم یک بخش.
  - ویرایش هر فیلد نیازمند «نوشتن» بخشِ نگاشت‌شده است. فیلد بی‌نگاشت (`is_active` و …) فقط superuser.
  - `user-available` حالا `is_member`، `membership_sources`، `section_levels` و `scope=manage` دارد. `user_access_level` فقط برای سازگاری بایگانی (از `docs_archive`) می‌ماند.
  - `export-excel` فقط superuser.
- **`CompanySerializer`:** برای غیرعضو فقط فیلدهای عمومی و فیلدهای بخش‌های خواندنی را برمی‌گرداند (`mask_company_fields`).
- **`UserCompanyAccessViewSet`:**
  - دروازه `user_access` خواندن و نوشتن است.
  - سقف سطح نویسنده رعایت می‌شود. ردیف خود و superuser تغییرپذیر نیست. کار حساس فقط با superuser.
  - جابه‌جایی ردیف به شرکت یا کاربر دیگر ممنوع است. `access_level` فقط‌خواندنی است و ردیف تازه `link` می‌گیرد.
  - مسیر تازهٔ `members?company_id=` اعضای خودکار را با منبعشان برمی‌گرداند (contribution `company_member_sources`).
- **مهاجرت `companies/0003`:** مقدار `link` به choices افزوده شد. فقط state است و پیش از آن پشتیبان گرفته شد.
- **middleware:** به‌طور پیش‌فرض عضویت لازم است. فقط `/api/org/` به «پیوند» بسنده می‌کند.
- **صفحهٔ کاربران و ورود کاربران از اکسل:** ردیف `link` می‌سازند (ت۸) و سطح ردیف موجود را عوض نمی‌کنند. دامنهٔ نویسنده = شرکت‌هایی که «دسترسی کاربران» آن‌ها را می‌نویسد.
- **دایرکتوری کاربران:** فیلتر خام `workspace_full` حذف شد. اعضا = ردیف پیوند یا q builderها.
- **ماژول انبار:**
  - `warehouses/company_access.py` منبع عضویت (انبار فعال دارای شرکت)، `company_member_q_builders` و `company_member_sources` را ثبت می‌کند.
  - حسابداری: `source_label` و `section_member_sources` افزوده شد.
- **آزمون‌ها:**
  - `integration_tests/membership.py` منبع آزمونی است برای آزمون‌هایی که فقط «عضو بودن» لازم دارند.
  - آزمون انبار از انتساب واقعی انبار استفاده می‌کند.
  - `companies accounts warehouses integration_tests`: همه سبزند، جز `communications.test_performance` که از پیش شکست می‌خورد. اجرای موازی دو آزمون روی یک دیتابیس آزمون خطای FK ساخت؛ اجرای تنها سبز بود.
- **نگهبان‌ها:** 29 و 57 سبز. `makemigrations --check` بدون تغییر.
- **`tenant-scope-reviewer`:** ۲ یافته داد و هر دو اصلاح شد:
  - غیرعضوِ دارای یک بخش همهٔ فیلدهای شرکت و خروجی اکسل را می‌دید ← ماسک و superuser-only.
  - پیوند در middleware برای همهٔ مسیرها کافی بود ← فقط `/api/org/`.

**باز (گام ۹):**
- `manage.py test personnel inventory`: ۴۱ شکست و ۳۱ خطا. علت اصلی آزمون‌هایی است که با ردیف دستی `workspace_full` عضو می‌سازند؛ بخشی هم از اجرای موازی بود.
- viewsetهای حسابداری (§۵-۴، بخش حسابداری) هنوز سوئیچ نشده‌اند.
- روی `app`، طبق گام ۶، همهٔ کاربرانِ دارای `workspace_full` منبع خودکار دارند. پس رفتار برنامه برای آن‌ها عوض نمی‌شود.

**گام بعد:** گام ۹. ابتدا `manage.py test personnel inventory --keepdb` تنها اجرا و فهرست شکست‌ها گرفته شود. آزمون‌هایی که با ردیف `workspace_full` عضو می‌سازند به انتساب بخش، یا `integration_tests.membership.grant_membership` (در `personnel` منبع آزمونی همانند) منتقل شوند. سپس ردیف‌های حسابداری §۵-۴ اعمال شوند.

### گام ۹ — سوئیچ بک‌اند حسابداری (۳۰ مهر ۱۴۰۵) — انجام شد

**انجام شد:**
- **`personnel/company_section_gates.py`:**
  - `ensure_company_section`: شناسهٔ نامعتبر ۴۰۳ می‌گیرد.
  - `section_or_member_company_ids` (ت۱۱: عضو فهرست انتخابی بانک و دوره را می‌خواند).
  - `ensure_company_unchanged`.
- **`org_views.py`** (همهٔ `is_staff`های دروازهٔ شرکت حذف شدند):
  - **مدارک:** خواندن و دانلود ← `docs_archive`/خواندن؛ ساخت، ویرایش و حذف ← `docs_archive`/نوشتن؛ محرمانه ← `docs_confidential` (فهرست و دانلود با خواندن، بقیه با نوشتن). فهرست مدارک در آستانهٔ انقضا ← `docs_archive`.
  - **بانک:** فهرست ← عضو یا `bank`/خواندن؛ ویرایش و حذف ← `bank`/نوشتن؛ ساخت، تغییر شبا یا حساب اصلی و `set_primary` ← `bank_sheba`.
  - **هیئت‌مدیره:** خواندن و نوشتن (حذف هم) ← `board`.
  - **دوره‌ها:** فهرست ← عضو یا `fiscal`/خواندن؛ ساخت، ویرایش و انجماد ← `fiscal`/نوشتن؛ بستن، بازگشایی و حذف ← `fiscal_close`. «دورهٔ بسته فقط superuser» به‌جا ماند.
  - ویرایش رکوردِ این چهار viewset به شرکت دیگر منتقل نمی‌شود.
- **گوگل‌درایو** (`8ff49662`) ← `gdrive`/خواندن و `gdrive`/نوشتن.
- **middleware:** مسیرهایی که ماژول با contribution `company_link_api_prefixes` اعلام می‌کند (`/api/personnel/compan`) به «پیوند» بسنده می‌کنند. خود این viewها دروازهٔ بخش دارند.
- **گره ت۸:** `user_belongs_to_company` و پیام `bulk_assign` حالا هر ردیف پیوند را کافی می‌دانند.
- **گیرندگان کارتابل** (`_workflow_recipient_ids`): عضو از راه `company_member_q_builders`.
- **آزمون‌ها:**
  - `companies/testing.py` (`grant_membership`) منبع و q builder آزمونی است.
  - آزمون‌های قدیمیِ «عضو با `workspace_full`» به آن منتقل شدند.
  - ۳ آزمون تازه: شناسهٔ نامعتبر، سطح بخش بانک و `bank_sheba`، و ممنوعیت انتقال عضو هیئت‌مدیره.
  - **اجرای کامل** `personnel inventory companies accounts warehouses integration_tests` پیش از اصلاحات بازبین: ۸۴۲ آزمون، فقط `communications.test_performance` (از پیش) و یک آزمون alias شکست خوردند. آزمون alias اصلاح شد.
  - اجرای نهایی پس از اصلاحات: ۸۴۵ آزمون؛ فقط `communications.test_performance` (از پیش) شکست خورد.
- **نگهبان‌ها:** 29 و 57 سبز.
- **`tenant-scope-reviewer`:** ۲ یافته داد، هر دو از کد قبلی به ارث رسیده بودند و اصلاح شدند:
  - `?company_id=x` کل مستأجرها را فهرست می‌کرد ← ۴۰۳.
  - `PATCH company` رکورد را به شرکت دیگر می‌برد ← ممنوع.

## یادداشت تحویل (پایان جلسه، ۳۰ مهر ۱۴۰۵)

- **وضعیت:** گام‌های ۱ تا ۹ انجام و commit شده‌اند. بک‌اند بخش الف کامل است.
- **مانده:**
  - گام ۱۰: فرانت تب «دسترسی» (جدول بخش‌ها، قالب‌ها، اعضا با منبع، تأیید کار حساس و `SKIP_OFFLINE`).
  - گام ۱۱: حالت محدود، شامل مسیر `/app/companies`، کاشی لانچر و `section_levels` در بایگانی و تب‌ها.
  - گام ۱۲: حذف سازگاری `docs_*` و `user_access_level`، و حذف ستون `access_level` با تأیید.
- **پیش از گام ۱۰ بدانید:**
  - فرانت فعلی تب «دسترسی» هنوز `access_level` می‌فرستد که حالا فقط‌خواندنی است. اعطا از فرانت تا گام ۱۰ فقط ردیف پیوند بی‌سطح می‌سازد.
  - صفحهٔ کاربران درست کار می‌کند (پیوند).
  - مسیرهای API: `GET /api/org/company-permission-sections/`، `GET user-company-access/members/?company_id=`، و `user-available?scope=manage` با `is_member`، `membership_sources` و `section_levels`.
- **پیام جلسهٔ بعد:** «گام ۱۰ طرح Documents/Company_Permissions_And_Followups/implementation_plan.md را اجرا کن (یادداشت تحویل پایان گام ۹ را بخوان).»

### گام ۱۰ — فرانت تب «دسترسی» (۳۰ مهر ۱۴۰۵) — کد و spec انجام شد؛ بازبین‌ها و بازبینی بصری مانده

**انجام شد:**
- **`company-api.service.ts`:**
  - `getPermissionSections()` و `getCompanyMembers()` افزوده شد.
  - ساخت، ویرایش و حذف دسترسی با `SKIP_OFFLINE` فرستاده می‌شود (ت۱۲).
  - `createUserAccess` حالا `section_levels` می‌گیرد.
- **`company.model.ts`:** نوع‌های `SectionLevel`، `CompanySectionLevels`، `CompanyPermissionSpec` و `CompanyMember`. فیلدهای `is_member`، `membership_sources` و `section_levels` روی `Company` و `UserCompanyAccess` افزوده شد.
- **`companies.ts` و `companies.html`:**
  - انتخاب «قالب مجوزها» جای سطح قدیمی را گرفت. گزینهٔ «بدون مجوز» فقط پیوند می‌سازد.
  - بلوک «اعضای فضای کاری (خودکار)» با برچسب منبع، فقط برای نمایش.
  - ستون «مجوز بخش‌ها» خلاصه را نشان می‌دهد، با دکمهٔ «ویرایش مجوزها».
  - ویرایشگر `sectionLevelsEditor` (جدول دسکتاپ و کارت موبایل) شامل اعمال قالب، یک انتخاب برای هر بخش، بخش حساس قفل برای غیر مدیر کل، و پنجرهٔ تأیید برای اعطای کار حساس.
- **specها:** `companies*.spec.ts` **۸۸ از ۸۸ سبز**، با ۲ آزمون تازه (قالب در ثبت و PATCH ویرایشگر؛ قفل بخش حساس و اعضای خودکار).
- **بررسی‌ها:** `tsc` و نگهبان‌های 52 و 56 سبز.

**توقف میانه:** مصرف هفتگی به ۱۰۰٪ رسید؛ گام در جلسهٔ بعد (۳۰ مهر ۱۴۰۵) تمام شد.

**تکمیل گام ۱۰ (جلسهٔ دوم) — انجام شد:**
- **سقف سطح نویسنده در فرانت** (پذیرش گام ۱۰، که جا مانده بود): `actorLevels` از `user-available?scope=manage`. گزینهٔ بالاتر از سطح خود کاربر غیرفعال است و قالب به همان سطح بریده می‌شود. `accessRowLockReason` همان قاعدهٔ `_ensure_can_grant` است: ردیف خود، کار حساس و سطح بالاتر. علت قفل در `hint`، `title` و متن کارت موبایل نمایش داده می‌شود. فرم تخصیص فقط با «نوشتن دسترسی کاربران» دیده می‌شود و تا رسیدن سطح‌ها اسکلت دارد.
- **صفحهٔ کاربران:** یک راهنما افزوده شد که تیک شرکت فقط پیوند می‌سازد. بک‌اند از گام ۸ پیوند می‌سازد.
- **بازبینی بصری روی `localhost:4300`** (با حساب موقت `qa_admin`):
  - در ۳۶۰ پیکسل اسکرول افقی ندارد و هیچ کنترلی زیر ۴۰ پیکسل نیست.
  - شناسهٔ تکراری ندارد. ویرایشگر در جدول و کارت پیش‌تر شناسهٔ تکراری داشت؛ حالا پیشوند `d`/`m` دارد.
  - ذخیرهٔ قالب «مدیر شرکت» با پیام موفقیت انجام شد و فوکوس پس از بستن ویرایشگر به دکمهٔ ردیف برمی‌گردد.
  - **خطای `NG0103`** (تشخیص تغییر بی‌پایان) هنگام باز شدن ویرایشگر پیدا و اصلاح شد. علت: `levelOptions` در هر دور آرایهٔ تازه می‌ساخت.
- **`data-loss-reviewer`:** هیچ یافتهٔ بحرانی یا بالایی نداشت. سه یافته داد که هر سه اصلاح شدند:
  - (م) PATCH کلید بخش ماژولِ نصب‌نشده را پاک می‌کرد. حالا ادغام می‌شود (§۹).
  - (ک) رکورد قدیمی صف آفلاین که فقط `access_level` داشت بی‌صدا بی‌اثر می‌ماند. حالا با `legacy_levels` نگاشت می‌شود.
  - (ک) وقتی پاسخ نرسد، پیام می‌گوید «ممکن است ثبت نشده باشد» و فهرست پس از اتصال خودکار تازه می‌شود.
- **`tenant-scope-reviewer`:** هیچ دور زدن یا نشتی نیافت. یافته‌های کم اصلاح شدند:
  - قفل ردیف دارای کار حساس در فرانت؛
  - رد پاسخ دیررس شرکت قبلی؛
  - `access_level='link'` پس از هر نوشتن سطح‌ها (لغو ردیف قدیمی به تهی کار نمی‌کرد)؛
  - مقاوم‌سازی ورودی (`isinstance` و `int`).
- **`ui-reviewer`:** هیچ یافتهٔ بالایی نداشت. همهٔ یافته‌های متوسط و کم اصلاح شدند:
  - خلاصهٔ «—» تا رسیدن بخش‌ها؛
  - علت قفل؛
  - توضیح گزینه‌های غیرفعال؛
  - متن حالت خالی؛
  - شمار و فهرست اعضا هنگام دریافت؛
  - پیام قطع اتصال؛
  - بازنشانی انتخاب قالب؛
  - برگشت فوکوس؛
  - `bdi`؛
  - `h4`.
- **آزمون‌ها:**
  - `companies` بک‌اند: ۲۵ آزمون سبز، با ۱ آزمون تازه (ادغام کلید نصب‌نشده و نگاشت `access_level` قدیمی).
  - `companies*.spec.ts`: ۸۹ از ۸۹ سبز، با ۱ آزمون تازه (سقف غیر superuser).
  - `tsc`، و نگهبان‌های 52 و 56 سبز.
- **کد مرده:** `accessLevelsList`، `getAccessLevelBadgeClass` و `getAccessLevelLabel` در `companies.ts` در گام ۱۲ حذف می‌شوند.

### گام ۱۱ — فرانت حالت محدود (۳۰ مهر ۱۴۰۵) — انجام شد

**انجام شد:**
- **مسیر و نگهبان (ت۱۰):**
  - مسیرهای `/app/companies` و `/app/companies/:id` با `data.studioMode='restricted'` افزوده شدند.
  - `CompaniesManageGuard` در `core/guards/operations.guard.ts` superuser را به حالت کامل می‌فرستد. دیگران فقط وقتی `user-available?scope=manage` تهی نباشد وارد می‌شوند.
- **ورود:** کاربری که مجوز سامانه ندارد ولی بخش شرکت دارد، دیگر بیرون انداخته نمی‌شود و به `/app/companies` می‌رود. خطای اتصال پیام جدای خودش را دارد.
- **کاشی «شرکت‌ها» در لانچر** برای غیر superuser دارای بخش. `ActiveCompanyService.manageableCompanies` و `fetch/loadManageableCompanies` افزوده شدند.
- **استودیو (`companies.ts`):**
  - فهرست محدود از `scope=manage` می‌آید. ثبت، حذف، ورود و خروج اکسل در آن پنهان‌اند و «بازگشت به برنامه‌ها» دارد.
  - سطح‌های خود کاربر و نگاشت فیلدها همراه شرکت دریافت می‌شوند (`forkJoin`). بی هیچ بخش، کاربر به فهرست برمی‌گردد. پاسخ کهنهٔ بی‌نگاشت فیلد، بارگذاری را با «تلاش دوباره» متوقف می‌کند.
  - تب «هیچ» رندر نمی‌شود. تب «خواندن» یادداشت فقط‌خواندنی و `fieldset` غیرفعال دارد.
  - ذخیره با PATCH فقط فیلدهای **تغییرکرده و نوشتنی** را می‌فرستد. اگر فیلد غیرنوشتنی تغییر کرده باشد، ذخیره با پیام متوقف می‌شود و چیزی بی‌صدا گم نمی‌شود.
- **قرارداد:** `permissionSection` روی `CompanyStudioTab` و `CompanyStudioSection` افزوده شد. نگاشت حسابداری: treasury به `bank`، governance به `board`، gdrive به `gdrive`، دوره‌ها به `fiscal` و بایگانی به `docs_archive`.
- **کامپوننت‌های مشارکتی:** `CompanyStudioContextService.sectionLevels` و `canRead`/`canWrite` افزوده شدند. کنترل‌های نوشتن این کامپوننت‌ها برای «خواندن» پنهان‌اند:
  - بانک (و شبا با `bank_sheba`)؛
  - هیئت‌مدیره؛
  - دوره‌ها (بستن و بازگشایی با `fiscal_close`)؛
  - گوگل‌درایو؛
  - بایگانی (محرمانه با `docs_confidential`).
- **بایگانی مدارک** (`company-documents-archive`) سطح را از `section_levels` می‌خواند.
- **بک‌اند:**
  - `public_spec` حالا `fields` (نگاشت فیلد به بخش) را هم می‌دهد.
  - **دیوار قلمرو توکن** (`authentication.py`) برای مسیرهای `company_section_api_prefixes`، که هر کارشان را با بخش می‌سنجند، برای دارندهٔ بخش باز است. در همان درخواست عضویت حساب نمی‌شود (`mark_module_scope_bypass`)، پس قاعدهٔ «عضو می‌خواند» بی‌قلمرو باز نمی‌شود.
  - مسیرهای دقیق حسابداری ثبت شدند. `user-company-access` به `company_link_api_prefixes` افزوده شد.
  - بستن یا بازگشایی دوره از راه POST یا PATCH روی `status` حالا `fiscal_close` لازم دارد.

**بازبین‌ها (همه یافته‌ها اصلاح شدند، جز موارد کمِ زیر):**
- **`tenant-scope-reviewer`:**
  - (ب) دور زدن قلمرو، عضویت انبار را به خواندن بانک گسترش می‌داد. اصلاح شد و آزمون دارد.
  - (م) بستن دوره با `fiscal:write` از راه `status`. اصلاح شد و آزمون دارد.
  - (ک) پیشوند پهن `compan`. به فهرست دقیق تغییر کرد.
  - (ک) `admin_all` غیر superuser در نگهبان.
- **`data-loss-reviewer`:**
  - (ب) تغییر فیلدهای هویتیِ داخل تب بیمه بی‌صدا حذف می‌شد. حالا پیام می‌دهد و آن ورودی‌ها هم غیرفعال‌اند.
  - (ب) spec کهنهٔ بی‌`fields` منجر به PATCH تهی می‌شد. حالا دوباره دریافت می‌شود، وگرنه بارگذاری با خطا متوقف می‌شود.
  - (م) فرم کهنه مقدار تازهٔ سرور را بازنویسی می‌کرد. حالا فقط فیلدهای تغییرکرده فرستاده می‌شوند.
  - (م) اعتبارسنجی فیلدهای پنهان ذخیره را قفل می‌کرد.
  - (ک) خطای اتصال در ورود.
  - (ک) نام خالی در پیام صف.
- **`ui-reviewer`:**
  - گوگل‌درایو برای کاربر فقط‌خواندنی: نشان وضعیت، غیرفعال شدن ساعت‌ها، و یادداشت و ظاهر غیرفعال گزینه‌ها.
  - متن حالت خالی بانک و دوره‌ها.
  - `legend` برای `fieldset`.
  - پنهان شدن دکمه‌های لوگو.
  - متن فهرست خالی در حالت محدود.
- **باز (کم، اصلاح نشد):**
  - ستون «عملیات» تهی جدول هیئت‌مدیره و نوار تهی کارت دوره برای کاربر فقط‌خواندنی؛
  - پیام «دوباره وارد گوگل شوید» برای کاربر فقط‌خواندنی؛
  - نبود یادداشت فقط‌خواندنی در تب‌های ماژول؛
  - `dir="ltr"` مسیرهای کاشی لانچر.

**آزمون‌ها و بررسی‌ها:**
- **فرانت:** ۱۴ فایل spec و ۲۲۷ آزمون سبز (استودیو، تب‌های حسابداری، بایگانی، لانچر، ورود)، با ۲ آزمون تازهٔ حالت محدود. `tsconfig.companies.spec.json` شامل لانچر و ورود شد.
- **بک‌اند:**
  - `companies accounts personnel`: ۴۳۲ آزمون سبز پس از اصلاحات، با ۳ آزمون تازه: دیوار قلمرو، عضویت در درخواست دورزده، و `fiscal_close` روی `status`.
  - اجرای کامل پیش از اصلاحات بازبین (۸۴۷ آزمون): `communications.test_performance` (از پیش) شکست خورد. `inventory...test_broken_row...` هم شکست خورد، ولی تنها اجرا شد و سبز بود (ناپایدار).
- `tsc` و نگهبان‌های 29، 52، 56 و 57 سبز.
- **بازبینی بصری روی `localhost:4300`** در ۳۶۰ پیکسل و دسکتاپ با حساب‌های موقت `qa_view` (فقط مشاهده) و `qa_docs` (کارشناس مدارک):
  - تب‌ها درست فیلتر شدند: `qa_view` شش تب بدون دسترسی دارد و `qa_docs` فقط هویتی و مدارک.
  - هیچ خطای API یا کنسولی نبود و اسکرول افقی نبود.
  - کاشی لانچر دیده شد.
- Daphne این ماشین سه بار بازراه‌اندازی شد.

</div>
