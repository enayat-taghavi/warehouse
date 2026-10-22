<div dir="rtl" align="right">

# طرح: انتقال «پروژه و بخش» از ماژول حسابداری به هسته

## ۱. هدف

پروژه و بخش ساختار سازمانیِ زیر شرکت هستند (شرکت ← پروژه ← بخش). ممکن است ماژول‌های دیگر، مثلاً انبار کارگاهی، هم به آن‌ها نیاز پیدا کنند. پس به هسته منتقل می‌شوند و تعریفشان به یک تب «پروژه‌ها و بخش‌ها» در استودیوی شرکت می‌رود.

ماژول حسابداری مصرف‌کنندهٔ آن‌ها می‌ماند، مثلاً در حضور و غیاب، حقوق، ناوگان و خزانه. اکنون بهترین زمان این کار است، چون داده‌ها فعلاً اهمیتی ندارند (تصمیم کاربر، ۲۲ مهر ۱۴۰۵).

## ۲. وضع فعلی (شواهد)

- **مدل‌ها:** در `modules/accounting/personnel/models_domains/organization.py`:
  - `FinancialProject` با `company` (PROTECT، nullable) و یکتایی کد در هر شرکت؛
  - `ProjectSection` با `project` (CASCADE)؛
  - `UserSectionAssignment` با نقش‌های حسابداری: `employee`، `supervisor`، `accountant`، `manager` و `treasury`.
- **وابسته‌ها:** حدود ۱۶ کلید خارجی رشته‌ای `'personnel.FinancialProject'` و `'personnel.ProjectSection'` در `attendance.py`، `fleet.py`، `hr.py`، `payroll.py` و `treasury_audit.py`.
- **API:** `financial-projects`، `project-sections` و `user-section-assignments` زیر `/api/personnel/`، در `views_domains/org_views.py` (حدود ۱۱۰۰ سطر). مجوزشان `IsProjectStructureManagerOrReadOnly` و `perm_manage_projects_sections` است. ورود و خروج اکسل در `org_excel_engine.py` (۸۶۸ سطر) است.
- **عضویت در شرکت:** انتساب فعال به بخش، کاربر را عضو شرکت می‌کند. این منبع با `section_derived_company_source` و `build_section_member_q` در `personnel/company_access.py` به هسته داده می‌شود.
- **فرانت:**
  - صفحهٔ `/app/finance/projects-and-sections` با کامپوننت `projects-and-sections` (حدود ۱۶۰۰ سطر ts و ۹۸۰ سطر html) در منوی «راهبر تشکیلات»؛
  - API در `accounting/api/treasury-org-api.service.ts`؛
  - `FINANCIAL_PROJECTS_ENDPOINT` در `loadItems` افزونه‌های `assignmentScope` و `syncConfig`؛
  - `perm_manage_projects_sections` در `permissions.ts`، `nav-items.ts`، `personas.ts`، `role-presets.ts` و `route-access.ts`.

## ۳. طراحی

### ۳-۱. بک‌اند

- **جای مدل‌ها:** مدل‌ها به اپ هستهٔ `core/companies` منتقل می‌شوند و نامشان می‌شود `Project`، `ProjectSection` و (طبق ت۱) `SectionAssignment`.
- **روش انتقال:** فقط state جابه‌جا می‌شود (`SeparateDatabaseAndState`) و `db_table` همان جدول‌های فعلی می‌ماند، مثل انتقال `SystemSetting` در فاز ۱. این ساده‌ترین روش است: نه داده‌ای کپی می‌شود و نه کلید خارجی وابسته‌ها می‌شکند.
- **وابسته‌ها:** کلیدهای خارجی حسابداری به `'companies.Project'` و `'companies.ProjectSection'` تغییر می‌کنند. اشاره از ماژول به هسته مجاز است.
- **API:** به `/api/org/projects/`، `/api/org/project-sections/` و `/api/org/section-assignments/` می‌رود.
  - ورود و خروج اکسل پروژه و بخش هم به هسته می‌آید.
  - مسیرهای قدیمی `/api/personnel/...` حذف می‌شوند و نام مستعار نمی‌گیرند.
- **مجوز (ت۲):** بخش تازهٔ هستهٔ `projects` («پروژه‌ها و بخش‌ها»، نوع levels) در `CORE_SECTIONS`، با قالب «مدیر شرکت» = نوشتن و «فقط مشاهده» = خواندن. نوشتن پروژه و بخش با `ensure_section(..., 'projects', 'write')` سنجیده می‌شود. `perm_manage_projects_sections` حذف می‌شود.
- **نقش‌های انتساب (اگر ت۱=الف):** هسته نقش‌ها را نمی‌شناسد. هر ماژول نقش‌هایش را با `contribute('section_roles', [...])` اعلام می‌کند (حسابداری همان پنج نقش فعلی را). منبع عضویت «انتساب فعال به بخش» از حسابداری به هسته می‌آید و در نصب «فقط انبار» هم کار می‌کند.
- **ماندنی در حسابداری:** `section_guardian.py`، موتور حقوق و کارتابل‌ها. فقط import آن‌ها به هسته تغییر می‌کند.

### ۳-۲. فرانت

- **تب استودیو:** تب هستهٔ «پروژه‌ها و بخش‌ها» در استودیوی شرکت، که فقط پروژه‌های همان شرکت را نشان می‌دهد.
  - کامپوننت از `accounting/components/organization/projects-and-sections` به هسته منتقل و بر یک `companyId` محدود می‌شود. فهرست سراسری همهٔ شرکت‌ها کنار می‌رود.
  - API آن به یک سرویس هسته می‌رود.
- **مسیر قدیمی:** `/app/finance/projects-and-sections` به `/app/companies/<شرکت>?tab=projects` هدایت می‌شود. ورود به منو و خانهٔ پرسونای `org_admin` هم به‌روز می‌شود.
- **مصرف‌کنندگان حسابداری** (`treasury-org-api.service.ts`، `loadItems` در `assignmentScope` و `syncConfig`، و فرم‌هایی که پروژه یا بخش انتخاب می‌کنند): به endpoint هسته اشاره می‌کنند.
- **هم‌خوانی مجوز با بک‌اند:** `perm_manage_projects_sections` از `permissions.ts` و `role-presets` حذف می‌شود و دسترسی با `section_levels` می‌آید.

## ۴. تصمیم‌هایی که پیش از شروع با کاربر است

پیشنهاد من در هر ردیف **پررنگ** است.

| # | موضوع | گزینه‌ها |
|---|---|---|
| ت۱ | انتساب کاربر به بخش | **(الف) به هسته برود، با نقش‌هایی که ماژول‌ها اعلام می‌کنند.** ماژول آینده می‌تواند نیروی خودش را به بخش منتسب کند. یا (ب) در حسابداری بماند و فقط پروژه و بخش به هسته بروند |
| ت۲ | مجوز تعریف پروژه و بخش | **بخش تازهٔ `projects` در سطح‌های شرکت (استودیو)، و حذف `perm_manage_projects_sections`.** یا: نگه داشتن مجوز فعلی |
| ت۳ | صفحهٔ سراسری فعلی (همهٔ شرکت‌ها) | **حذف، و هدایت به تب استودیو.** یا: ماندن کنار تب |
| ت۴ | مجری | **خود Claude** (معماری و درهم‌تنیده در هسته، حسابداری و فرانت). یا: Antigravity با `tasks.md` |

## ۵. گام‌ها

| گام | محتوا | پذیرش |
|---|---|---|
| ۱ | **بک‌اند: انتقال مدل‌ها (فقط state).** `Project`، `ProjectSection` و (ت۱) `SectionAssignment` در `core/companies` با `db_table` قبلی. کلیدهای خارجی حسابداری تغییر می‌کنند. مهاجرت‌ها با `safe-migration` ساخته می‌شوند | `makemigrations --check` بدون تغییر. `migrate` روی `app` بی‌خطا و جدول‌ها همان. آزمون‌های `companies personnel accounts` سبز |
| ۲ | **بک‌اند: API و مجوز در هسته.** ViewSetها، سریالایزرها و اکسل به هسته می‌روند. بخش `projects`، `section_roles` و منبع عضویت در هسته (ت۱). مسیرهای قدیمی و `perm_manage_projects_sections` حذف می‌شوند | آزمون سطح بخش (خواندن و نوشتن، کاربر بی‌سطح ۴۰۳)، نصب «فقط انبار» و «فقط حسابداری»، نگهبان 29 و `module_coupling_scan`. `tenant-scope-reviewer` |
| ۳ | **فرانت: تب استودیو.** کامپوننت منتقل و به یک شرکت محدود می‌شود. سرویس API هسته. هدایت مسیر قدیمی، منو و پرسونا. مصرف‌کنندگان حسابداری به endpoint هسته | `tsc`، specهای تب و استودیو، نگهبان‌های 52، 56 و 57. بازبینی بصری در ۳۶۰ پیکسل و دسکتاپ با حساب `qa_*`. `ui-reviewer` |
| ۴ | **جمع‌بندی** | حذف کد مرده و ورودی‌های کهنهٔ `core_literal_allowlist.json`، انتشار روی `app`، و گزارش پیشرفت |

**بررسی‌های هر گام:** `manage.py check`، آزمون‌های بک‌اند فقط با برچسب اپ، `tsc`، specهای همان بخش، و نگهبان‌های 29 و 57.

## ۶. خطرها

- **بیشترین ریسک** در گام ۱ است: ارجاع‌های رشته‌ای و `apps.get_model('personnel', ...)` که از دید می‌افتند. پیش از مهاجرت، با Grep همهٔ نام‌های قدیمی شمرده و به صفر رسانده شوند.
- **حذف مسیرهای قدیمی:** رکوردهای صف آفلاینِ قدیمی که به `/api/personnel/financial-projects` می‌روند ۴۰۴ می‌گیرند و صریحاً رد می‌شوند. داده فعلاً اهمیتی ندارد.

## گزارش پیشرفت

### نگارش طرح (۳۰ مهر ۱۴۰۵)

- **وضعیت:** طرح نوشته شد و **هیچ کدی تغییر نکرد**.
- **گام بعد:** پاسخ کاربر به ت۱ تا ت۴ و تأیید صریح. سپس گام ۱ در جلسهٔ تازه.

### گام ۱ (۱ آبان ۱۴۰۵): انجام شد

- **تصمیم‌های کاربر:** ت۱=الف، ت۲=بخش تازهٔ `projects` و حذف `perm_manage_projects_sections`، ت۳=حذف صفحهٔ سراسری و هدایت به تب استودیو، ت۴=Claude.
- **مدل‌ها:** `Project`، `ProjectSection` و `SectionAssignment` در `core/companies/models.py` با همان `db_table`ها.
  - `personnel/models.py` آن‌ها را از هسته بازصادر می‌کند. همهٔ ارجاع‌ها (کد، آزمون‌ها، `integration_tests` و نگهبان 36) به نام تازه و `'companies.Project'`/`'companies.ProjectSection'` رفتند.
  - نام serializerها و ViewSetها (`FinancialProjectSerializer`، `UserSectionAssignmentViewSet` و…) عمداً دست نخورد؛ در گام ۲ به هسته می‌روند.
- **نقش‌ها (جلوتر از طرح، از گام ۲):** `role` در هسته `choices` ندارد. `section_role_choices()` در `companies/models.py` نقش‌ها را از `contribute('section_roles', ...)` می‌خواند. حسابداری `SECTION_ROLES` (همان پنج نقش) را در `personnel/company_access.py` اعلام می‌کند.
  - `get_role_display()` روی مدل تعریف شد و `validate_role` به serializer انتساب اضافه شد.
  - `default='employee'` روی مدل هسته ماند تا رفتار عوض نشود.
- **مهاجرت‌ها:**
  - `companies/0005_project_sections`: فقط state، به‌اضافهٔ `create_missing_tables`، که جدول‌ها را فقط در نصب بدون حسابداری می‌سازد.
  - `personnel/0004_move_project_sections_to_core`: AlterField و DeleteModel فقط در state، به‌اضافهٔ `move_content_types`. این تابع content type و مجوزها را به `companies` می‌برد. اگر post_migrate زودتر نوع تازه را ساخته باشد، grantها را روی مجوز تازه کپی می‌کند. هیچ چیز حذف نمی‌شود.
  - `personnel/0001_initial` ویرایش شد: عملیات سه مدل در `UnlessCoreOrgTables` پیچیده شدند تا حسابداری را بتوان پس از نصب «فقط انبار» نصب کرد. روی پایگاه‌های موجود اثری ندارد، چون 0001 پیش‌تر اجرا شده است.
- **آزمون و بررسی:**
  - `makemigrations --check`: بدون تغییر. نام مهاجرت‌ها با `django_migrations` برخورد ندارد.
  - پشتیبان `backup_20261023_003532.dump` گرفته شد. `migrate` روی `app` بی‌خطا بود و ردیف‌ها همان ماندند (۴، ۶ و ۳۰). content type و مجوزها به `companies` منتقل شدند.
  - آزمون‌های `companies personnel accounts`: ۴۳۲ مورد سبز.
  - `integration_tests`: ۲۶۷ مورد، با یک شکست در `test_broadcast_query_count_independent_of_participants` (۲۴ کوئری). این شکست روی HEAD هم عیناً هست، پس پیش‌موجود است.
  - شبیه‌سازی نصب: «فقط انبار» و سپس افزودن حسابداری روی پایگاه آزمون با `--keepdb` بی‌خطا بود و قیدهای FK و unique برقرار بودند.
  - نگهبان‌های 29، 57 و 36 PASS شدند. فاز ۱ `section_guardian.py` هم سبز است؛ فازهای دیگرش روی مسیرهای فایل قدیمی و بی‌ربط شکست می‌خورند (پیش‌موجود).
  - `data-loss-reviewer` یک یافتهٔ متوسط داشت: از دست رفتن grantها اگر post_migrate بین دو مهاجرت اجرا شود. رفع شد و شاخهٔ کپی در تراکنشِ برگشت‌خورده آزموده شد.
- **باز:** ثبت مدل‌ها در `personnel/admin.py` و منبع عضویت (`company_access.py`) هنوز در حسابداری هستند و در گام ۲ به هسته می‌روند. انتشار روی `soft` نیاز به تأیید دارد.
- **گام بعد:** گام ۲ (API، مجوز `projects`، منبع عضویت و `section_roles` در هسته) در جلسهٔ تازه.

</div>
