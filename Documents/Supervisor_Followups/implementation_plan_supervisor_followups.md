<div dir="rtl" align="right">

# طرح: پیگیری‌های بازبینی ناظر صف «راه میانهٔ ماژولار» (۲۳ مهر ۱۴۰۵)

## ۱. هدف

بازبینی ناظر پس از صف ۱۰ نشستی (`Documents/Modular_Middle_Path/implementation_plan_modular_middle_path.md`، بند ناظر در «گزارش پیشرفت») دو کار باز گذاشت. این کارها در سه نشست صف Antigravity انجام می‌شوند و Claude ناظر است (تقسیم به سه نشست: تصمیم کاربر، ۲۳ مهر):

- **نشست ۱ (امنیتی، اولویت بالا):** بستن دو نشت داده بین شرکت‌ها که پیش از commit `8b05086` هم بودند.
- **نشست ۲ (ماژولار، هسته):** وصل کردن لانچر، سایدبار و پیوند سریع مرکز عملیات به نقطه‌های توسعهٔ ماژول، به‌علاوهٔ قالب ماژول. هدف این است که ماژولی که با `scripts/new_module.py` ساخته می‌شود، بدون ویرایش هسته دیده شود.
- **نشست ۳ (ماژولار، حاشیه):** بندهای `### ۳.۳.` (پرچم مالی شرکت‌ها، شمارندهٔ منوی کاربر، پیوند بایگانی اسناد، فیلدهای بی‌مصرف قرارداد و راهنما).

ترتیب ثابت است: نشست ۱ پیش از هر release روی `soft`، چون همین نشت روی `soft` هم هست.

## ۲. نشست ۱ — دامنهٔ شرکت در گزارش‌ساز و ورود کاربران از Excel (بک‌اند)

### ۲.۱. نشت گزارش‌ساز
- **وضع فعلی:**
  - `core/platform_core/query_engine/engine.py` در `_scope_queryset` فقط `scope_kind == 'warehouse'` را محدود می‌کند. وقتی `scope_path` خالی است، queryset بی‌فیلتر برمی‌گردد.
  - چهار موجودیت `scope_path=None` دارند:
    - `personnel_profiles`، `monthly_payrolls` و `fleet_trips` در `modules/accounting/personnel/report_entities.py`.
    - `users` در `core/reports/registry.py`.
- **سناریوی نشت:**
  - حسابدار شرکت الف با `view_sys_reports` و `view_sys_personnel` (یا `view_sys_payroll`) درخواست `POST /api/reports/run/` یا `/api/reports/export/` را با `entity=personnel_profiles` یا `monthly_payrolls` می‌فرستد. کد ملی و حقوق همهٔ شرکت‌ها را می‌گیرد.
  - با `entity=users`، شمارهٔ تلفن همهٔ کاربران، حتی سوپریوزرها، را می‌گیرد.
- **طراحی:**
  - در `EntityConfig` (و `JoinDef` اگر لازم شد) نوع تازهٔ `scope_kind='company'` اضافه می‌شود. `_scope_queryset` برای کاربر غیرسوپریوزر فیلتر `{scope_path}__in` را روی شناسه‌های `companies.access.get_user_allowed_companies(user)` اعمال می‌کند.
  - سوپریوزر بی‌محدودیت می‌ماند. کاربر بی‌شرکت نتیجهٔ خالی می‌گیرد، نه همه‌چیز.
  - مسیرها (اصلاح‌شده پس از بازبینی Antigravity). شرکت در این مدل‌ها از دو راه می‌آید، پس یک `scope_path` ساده کافی نیست. resolverها در سمت ماژول (`report_entities.py`) تعریف می‌شوند، نه در هسته:
    - `PersonnelProfile`: همان قاعدهٔ موجود `scope_personnel_queryset` در `modules/accounting/personnel/views.py` بازاستفاده شود (`company_id` یا `section__project__company_id`، و پیش‌نویس بی‌شرکت فقط برای ثبت‌کننده).
    - `MonthlyPayrollRecord`: همان قاعده از راه `personnel__`.
    - `VehicleTripLog`: همان شرط `VehicleTripViewSet.get_queryset`، یعنی `section__project__company_id` یا `vehicle__section__project__company_id`، روی شناسه‌های شرکت‌های مجاز.
  - `users` با یک قلاب سفارشی (مثلاً `scope_resolver(qs, user)` در `EntityConfig`) دقیقاً همان قاعدهٔ `UserViewSet.get_queryset` را می‌گیرد:
    - کاربران شرکت‌های مجاز به‌علاوهٔ خود کاربر.
    - حذف سوپریوزرها برای غیرسوپریوزر.
    - `distinct()`.
  - قاعدهٔ مشترک این دو در یک تابع کمکی در `core/accounts` قرار می‌گیرد، تا view، گزارش‌ساز و ورود Excel یک منبع داشته باشند و منطق تکرار نشود.
- **جلوگیری از تکرار:**
  - آزمونی همهٔ موجودیت‌های ثبت‌شدهٔ موتور را پیمایش می‌کند. هر موجودیت باید یا `scope_path` داشته باشد، یا `scope_resolver`، یا صریحاً در فهرست سفید «سراسری» باشد. فهرست سفید با دلیل هر مورد در خود آزمون نوشته می‌شود.
  - هدف این است که موجودیت تازه بی‌دامنه نماند.

### ۲.۲. نشت ورود کاربران از Excel
- **وضع فعلی:**
  - `core/accounts/excel_utils.py` در `parse_users_excel(file, update_existing)` کاربر انجام‌دهنده را نمی‌گیرد. کاربران موجود را از `CustomUser.objects.all()` و انبارها را از همهٔ انبارها (با نام مستعار «همهٔ انبارها») تطبیق می‌دهد.
  - مسیر ثبت در `core/accounts/views.py` (`UserViewSet.import_excel`) کاربر را با `CustomUser.objects.filter(id=user_id)` می‌گیرد. سپس `groups.set(...)` و `assigned_warehouses.set(...)` را بی‌بررسی شرکتی می‌زند که `UserSerializer.validate` انجام می‌دهد.
  - `download_template` (`generate_users_template`) نام انبارها و شرکت‌های همهٔ شرکت‌ها را در فایل می‌گذارد.
- **سناریوی نشت:** کاربر شرکت الف با `perm_usr_add` یا `view_sys_users` فایلی با `update_existing=1` بالا می‌برد که نام کاربران شرکت ب یا یک سوپریوزر در آن است. وضعیت فعال، تلفن، کد ملی و نقش‌های آن‌ها بازنویسی می‌شود. انبارهای شرکت ب هم به کاربران شرکت الف داده می‌شود.
- **طراحی:**
  - `parse_users_excel` پارامتر `actor` می‌گیرد. تطبیق کاربر موجود فقط در queryset قابل‌مشاهدهٔ همان تابع کمکی بند ۲.۱ انجام می‌شود.
  - ردیفی که به کاربر بیرون از دامنه یا سوپریوزر (برای غیرسوپریوزر) اشاره کند، خطای ردیف با پیام فارسی می‌گیرد. نباید بی‌صدا «کاربر تازه» تلقی شود.
  - تشخیص تکرار دو منبع دارد:
    - مجموعهٔ نام‌های کاربری و کدهای ملی کل سیستم، فقط برای تشخیص تکرار و بی‌بازگرداندن شیء کاربر.
    - queryset قابل‌مشاهده، برای `update_existing`.
  - تکرار با کاربر بیرون از دامنه خطای ردیف با پیام فارسی است. نه کاربر تکراری ساخته می‌شود و نه `IntegrityError` و خطای ۵۰۰ کل فایل را رد می‌کند.
  - تابع‌های افزونهٔ انبار در `modules/warehouse/warehouses/user_extension.py` (`get_template_warehouse_names`، `get_all_warehouses`، `build_warehouses_lookup`) پارامتر اختیاری `user=None` می‌گیرند. `parse_users_excel` و `generate_users_template` هم پارامتر اختیاری `actor=None` می‌گیرند، تا فراخوان‌های فعلی نشکنند.
    - برای غیرسوپریوزر فقط انبارهای شرکت‌های مجاز برمی‌گردد، به‌علاوهٔ انبارهای قدیمی بی‌شرکت که مستقیم به خود او منتسب‌اند (`assigned_warehouses`).
    - «همهٔ انبارها» یعنی همهٔ انبارهای مجاز.
  - کاربر تازه‌ای که از Excel ساخته می‌شود، رکورد `UserCompanyAccess` با سطح `workspace_full` برای شرکت فعال سازنده می‌گیرد (تصمیم کاربر، ۲۳ مهر).
    - شرکت فعال از `get_request_company_id(request)` می‌آید و با `validate_user_company_access` سنجیده می‌شود.
    - اگر سازنده شرکت فعال ندارد: سوپریوزر رفتار امروز را دارد (بی‌دسترسی شرکت)، و غیرسوپریوزر خطای روشن فارسی می‌گیرد و کاربری ساخته نمی‌شود.
    - امروز این رکورد اصلاً ساخته نمی‌شود و حتی سازنده هم کاربر تازه را نمی‌بیند.
  - مسیر ثبت در `import_excel` دوباره در زمان ثبت می‌سنجد و به نتیجهٔ dry-run اعتماد نمی‌کند. هر کاربر هدف باید در queryset قابل‌مشاهده باشد و هر انبار در انبارهای مجاز.
  - `download_template` فقط نام‌های دامنهٔ کاربر را می‌گذارد.
- **بیرون از دامنه:** پذیرفته‌های کاربر عوض نمی‌شوند و گزارش نمی‌شوند: فهرست مخاطبان چت همهٔ کاربران فعال است، محدودیت نرخ سراسری برای کاربر واردشده نیست، و عضویت فعال بخش دسترسی شرکت می‌دهد.

### ۲.۳. آزمون‌ها
- فایل تازهٔ `backend/integration_tests/test_company_scope_reports_import.py`، با دو شرکت، دو کاربر غیرسوپریوزر (یکی در هر شرکت) و یک سوپریوزر. دست‌کم این‌ها را بیازماید:
  - `POST /api/reports/run/` برای `personnel_profiles`، `monthly_payrolls`، `fleet_trips` و `users`: کاربر شرکت الف فقط ردیف‌های شرکت الف را می‌گیرد، سوپریوزر هر دو را، و کاربر بی‌شرکت هیچ.
  - مسیر `export` همان دامنه را دارد.
  - پیمایش موجودیت‌ها (بند «جلوگیری از تکرار»).
  - ورود Excel با `update_existing=1` و ردیفی برای کاربر شرکت ب یا سوپریوزر: خطای ردیف، و کاربر هدف دست‌نخورده می‌ماند (از دیتابیس دوباره خوانده شود).
  - ورود Excel با انبار شرکت ب: خطای ردیف.
  - قالب Excel نام انبار شرکت ب را ندارد.
  - رفتار درست کاربر مجاز (ورود موفق در دامنهٔ خودش) نشکند.
- آزمون‌های موجود `integration_tests` و آزمون‌های گزارش‌ساز و کاربران سبز بمانند.
- اگر موجودیتی در پروفایل تک‌ماژول ثبت نمی‌شود، آزمون آن با `skipTest` و پیام روشن رد می‌شود، مثل `test_companies_cross_module.py`.

### ۲.۴. محدودیت‌ها
- بی‌مایگریشن. هیچ مدلی عوض نمی‌شود.
- فرانت عوض نمی‌شود، مگر نمایش پیام خطای ردیف تازه در مودال ورود اگر لازم شد.
- نگهبان‌های حصار (۲۹ و ۵۷) نباید شمارندهٔ تازه بگیرند. هسته به ماژول import مستقیم نمی‌گیرد و دامنهٔ انبار از راه همان افزونهٔ موجود می‌رود.

## ۳. نشست ۲ — لانچر، سایدبار و پیوند سریع از نقطه‌های توسعه (فرانت)

### ۳.۱. لانچر
- **وضع فعلی:**
  - `modules/common/components/app-launcher/app-launcher.html` سه کاشی انبار، مالی و عملیات را ثابت دارد. `appCards()` در `app-launcher.ts` در قالب استفاده نمی‌شود.
  - پس `extensions.launcherTile` ماژول دیگر هیچ کارتی نمی‌سازد.
- **طراحی:**
  - کاشی‌های غنی موجود برای ماژول‌های فعلی دست‌نخورده می‌مانند.
  - برای هر ماژول نصب‌شدهٔ دیگر یک کاشی عمومی با `@for (card of extraCards(); track card.code)` ساخته می‌شود. «دیگر» یعنی کدش جزو سه کاشی ثابت نیست، و این از روی خود کارت تعیین شود، نه با نام ماژول در هسته.
  - کاشی عمومی:
    - عنوان، توضیح، برچسب‌ها و آیکون از `module.ts`.
    - نقشهٔ ثابت کلاس برای هر `themeColor`، چون Tailwind JIT کلاس درون‌یابی‌شده را نمی‌بیند.
    - توکن‌های معنایی، `appIcon` و قفل بی‌دسترسی مثل کاشی‌های موجود.
  - `visibleCardsCount`، `isSingleAppMode` و `gridContainerClass` باید دقیقاً با تعداد کاشی‌های رندرشده برابر باشند.

### ۳.۲. سایدبار
- **وضع فعلی:**
  - `modules/common/components/layout/layout.ts` فقط `extensions.layoutNav` را می‌خواند. `primaryNavItems` جز وقتی ماژولی `showWarehouseSwitcher` دارد خالی است.
  - `switchTab` مسیر را با `/app/warehouse/` یا `/app/finance/` ثابت می‌سازد.
  - `scripts/module-template/frontend/module.ts` بلوک قدیمی `navItems` را دارد که خوانده نمی‌شود و `layoutNav` ندارد. `nav-items.ts` قالب هم نوع `NavItem` جدا تعریف کرده است.
- **طراحی:**
  - مسیر هر آیتم از ماژول صاحبش ساخته می‌شود: `routePrefix` ماژول به‌علاوهٔ شناسهٔ آیتم، یا فیلد اختیاری `route` در `ModuleNavItem`.
  - `switchTab` دیگر نام انبار و مالی را ثابت ندارد. رفتار فعلی انبار و مالی (همهٔ مسیرهای امروز) باید عیناً بماند.
  - امضای `switchTab(tabId: string)` عوض نمی‌شود، چون قالب‌ها آن را با رشته صدا می‌زنند. شناسه‌های مشترک بین ماژول‌ها (مثل `audit` و `health` در انبار و مالی) باید از روی ماژول فعال (persona یا بافت انبار) حل شوند، نه از روی نخستین تطابق.
  - مسیرهای ریدایرکتی امروز، مثل `companies` که به `/app/finance/companies` و سپس `/app/operations/companies` می‌رود، باید بمانند.
  - آیتم‌های ماژولی که `showWarehouseSwitcher` ندارد در یک بخش جدا (مثلاً «سامانه‌های دیگر») دیده شوند، فقط اگر کاربر مجوز آیتم را دارد.
  - قالب ماژول یک `extensions.layoutNav` واقعی و `nav-items.ts` با نوع `ModuleNavItem` می‌گیرد. بلوک خوانده‌نشدهٔ `navItems` در قالب حذف یا به `layoutNav` وصل می‌شود.

### ۳.۲-ب. پیوند سریع مرکز عملیات (نشست ۲)
- `operations.quickLink` در نوار کناری پوستهٔ عملیات خوانده و نمایش داده شود: `modules/common/components/operations/operations-layout/operations-layout.html` و `.ts`، جایی که امروز `showWarehouseLink` و `showAccountingLink` ثابت‌اند. پیوندهای امروز انبار و مالی بمانند.

### ۳.۳. جفت‌شدگی‌های سست (نشست ۳)
- `modules/common/components/operations/companies/companies.ts`: `isAccountingInstalled` از «هر ماژولی که `companies.tabs` دارد» نتیجه گرفته می‌شود. با پرچم صریح (مثلاً `companies.providesTreasury`) جایگزین شود، تا ماژول سوم با `tabs` تب‌ها و APIهای ویژهٔ مالی را باز نکند.
- `shared/components/user-menu/user-menu.component.ts`: عدد ثابت `15 + extraCount` از روی خود داده شمرده شود.
- `modules/common/components/layout/layout.html`: پیوند «بایگانی اسناد شرکت‌ها» برای سوپریوزر فقط وقتی نشان داده شود که ماژول صاحب آن نصب است. امروز در نسخهٔ فقط‌انبار به مسیر ناموجود می‌رود.
- فیلدهای extension بی‌مصرف (`tableColumns`، `gdriveSupported`، `rolePresetCategories`): یا مصرف شوند یا از قرارداد و `module.ts`ها حذف شوند. ایجنت تصمیم و دلیل را در گزارش بنویسد.
- پس از پایان، بخش «محدودیت فعلی» در `## ۳.` فایل `Documents/Modular_Middle_Path/guide_new_module.md` حذف و جدول نقطه‌ها به‌روز می‌شود.

### ۳.۴. آزمون‌ها
- تست DOM (Vitest + jsdom) برای لانچر و پوسته، با سه فهرست ماژول (کامل، فقط انبار، فقط مالی) و یک ماژول ساختگی سوم:
  - کاشی ماژول سوم رندر می‌شود و تعداد کاشی‌ها با `visibleCardsCount` برابر است.
  - آیتم سایدبار ماژول سوم به `routePrefix` خودش می‌رود.
  - مسیرهای امروز انبار و مالی عوض نمی‌شوند.
  - پیوند بایگانی اسناد در نسخهٔ فقط‌انبار نیست.
- `verify_tools.py sample-module`: ماژول `sample` ساخته‌شده از قالب، `build:modules` و نگهبان ۵۷ را پاس کند.

### ۳.۵. محدودیت‌ها
- بک‌اند عوض نمی‌شود.
- زبان طراحی (`design-system`) و `.agents/AGENTS.md` بخش ۷ برقرارند:
  - icon و برچسب کوتاه روی دسکتاپ، فقط icon روی موبایل.
  - هدف لمسی دست‌کم ۴۰×۴۰.
  - `title` و `aria-label` فارسی.
  - svg درون‌خطی ممنوع.

## ۴. قواعد مشترک
- همان قواعد `## ۷.` طرح راه میانهٔ ماژولار:
  - هر نشست فقط کار خودش را می‌کند و فقط فایل‌های خودش را stage می‌کند.
  - با پیام داده‌شده commit می‌کند، push نمی‌کند و بند کوتاهی در «گزارش پیشرفت» همین طرح می‌نویسد.
  - بیلد، نگهبان و آزمون را runner اجرا می‌کند.
- تست بک‌اند روی این ماشین اجرا می‌شود: `PYTHONUTF8=1` و `PYTHONIOENCODING=utf-8`، فقط با برچسب اپ، هرگز `manage.py test` بی‌برچسب. در ۲۳ مهر `integration_tests.test_companies_cross_module` با ۳ آزمون OK شد.
- کار ناظر (Claude):
  - بازبین `tenant-scope-reviewer` روی نشست ۱ و `ui-reviewer` روی نشست‌های ۲ و ۳.
  - بررسی صفحهٔ ورود روی 4300، release روی `app` و بررسی ۲۰۰.
  - هر کار روی `soft` فقط با تأیید صریح کاربر است.

## ۵. راستی‌آزمایی runner
- **نشست ۱:**
  - `django-check`.
  - `manage.py test integration_tests accounts warehouses reports platform_core --noinput` با دو متغیر بالا، شامل فایل تازه.
  - `migrations-unchanged`، نگهبان ۲۹ (`guardian_modularization.py`، در ۲۳ مهر روی HEAD سبز) و نگهبان ۵۷.
  - `commit-exists` و `clean-tree`.
- **نشست ۲ و ۳:**
  - `build:modules` با `WH_MODULES=accounting` و `WH_MODULES=warehouse` با `dist-free`، و `ng build` کامل.
  - نگهبان‌های ۵۲، ۵۵، ۵۶ و ۵۷.
  - `ng-test-compare --base {base}`. تست‌های DOM هدف (`app-launcher.dom.spec.ts`، `layout-modular.dom.spec.ts` و `operations-layout.dom.spec.ts`) جزو آن‌اند و رد شدنشان پس‌رفت است.
  - `sample-module`.
  - `commit-exists` و `clean-tree`.

## ۶. ریسک‌ها
- **نشست ۱ (متوسط):** فیلتر شرکت ممکن است گزارش‌های امروزِ کاربر مجاز را خالی کند، اگر مسیر شرکت غلط باشد. پاسخ: آزمون «کاربر مجاز داده‌اش را می‌بیند» برای هر موجودیت.
- **نشست ۲ (متوسط):** خطای منو و لانچر پشت صفحهٔ ورود است. پاسخ: تست DOM با سه فهرست ماژول و ماژول ساختگی. بررسی نهایی پشت ورود با کاربر است.

## ۷. بازبینی Antigravity

- **چت:** `02592c68-9178-4994-ad87-647ef8c03547`، مدل Gemini 3.8 Flash (High)، فقط مشاهده و جستجو. Claude ادعاهای اصلی را در کد تأیید کرد.
- **پذیرفته‌شده (با تأیید کاربر، ۲۳ مهر):**
  - شرکت پرسنل و سفر از دو مسیر می‌آید. پس resolver با بازاستفادهٔ قاعده‌های موجود `scope_personnel_queryset` و `VehicleTripViewSet` به کار می‌رود.
  - کاربر تازهٔ Excel امروز `UserCompanyAccess` نمی‌گیرد. تصمیم کاربر: شرکت فعال سازنده.
  - تشخیص تکرار از دو منبع، تا `IntegrityError` و خطای ۵۰۰ رخ ندهد.
  - انبارهای قدیمی بی‌شرکت که مستقیم منتسب‌اند.
  - پارامترهای تازه اختیاری‌اند.
  - شناسه‌های مشترک `audit` و `health` در سایدبار.
  - جای پیوند سریع در `operations-layout`.
  - تقسیم کار فرانت به دو نشست (تصمیم کاربر).
  - افزودن آزمون‌های `accounts` و `warehouses`، `clean-tree` و نگهبان ۲۹ به نشست ۱.

## گزارش پیشرفت

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Claude:**
  - طرح نوشته شد و با Antigravity بازبینی شد (`## ۷.`). کاربر سه تصمیم گرفت: شرکت فعال سازنده برای کاربر Excel، سه نشست، و اعمال همهٔ اصلاح‌های فنی. هر سه در طرح اعمال شد.
  - کارت‌های پیشنهادی جلسه برداشته شد.
  - **اقدام بعدی:**
    1. چت توافق مراحل با Antigravity در یک چت تازه (`run_tasks.py ask --new`، فقط مشاهده و جستجو).
    2. نوشتن سه نشست در `tasks.md` با کامنت runner (`require`/`verify` طبق `## ۵.`)، بدون `?` در متن تسک.
    3. صبر برای «شروع» کاربر.
    4. اجرای صف در تب Windows Terminal با `.\run_tasks.bat`.
    5. بازبینی ناظر.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Claude — توافق مراحل و صف:**
  - سه نشست با کامنت runner در `tasks.md` نوشته شد. همهٔ خط‌های `python -c` روی HEAD (`ddc3ea1`) بی‌خطای نحوی اجرا شدند و، چون کار انجام نشده بود، درست رد شدند.
  - روی HEAD: نگهبان ۲۹ و ۵۷ سبز. آزمون‌های بک‌اند نشست ۱ (۲۱۹ آزمون) سه خطای از پیش موجود در خود فایل‌های آزمون دارند: دو `ExportWorkerTests` در `integration_tests/test_reports_integration.py` (import نسبی ناموجود `integration_tests.management`) و `NameError` برای `status` در `modules/warehouse/warehouses/test_company_warehouse_isolation.py`. خط verify فقط همین سه را می‌پذیرد. رفع این سه بیرون از دامنهٔ این طرح است.
  - چت توافق Antigravity: `35c27e73` (Gemini 3.8 Flash (High)، دو دور، «توافق دارم»).
    - پذیرفته: بررسی پیشوندهای ثابت `switchTab` در نشست ۲ کوتیشن دوتایی و template literal را هم می‌گیرد؛ در نشست ۱ شرکت فعال در صورت نیاز به پیش‌نمایش Excel هم می‌رسد.
    - رد: ادعای «باگ regex» در خط verify آزمون‌های نشست ۱. Python 3.12 نام متد را داخل پرانتز می‌آورد و همان regex روی لاگ واقعی HEAD هر سه خطا را درست شناخت.
  - کاربر گفت صف را بی‌انتظار شروع کن (۲۳ مهر). صف در تب Windows Terminal اجرا شد.
- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۱ (دامنهٔ شرکت در گزارش‌ساز و ورود کاربران از Excel):**
  - **فهرست فایل‌های تغییریافته و ایجادشده:**
    - `backend/core/accounts/scope.py`: تابع کمکی مشترک `get_visible_users_for_user(user, qs=None)` با منطق همسان `UserViewSet.get_queryset` (کاربران شرکت‌های مجاز، خود کاربر، حذف سوپریوزرها برای کاربر غیرسوپریوزر، distinct).
    - `backend/core/accounts/permissions.py`: صادر کردن مجدد `get_visible_users_for_user`.
    - `backend/core/accounts/views.py`: استفادهٔ `UserViewSet.get_queryset` از تابع کمکی مشترک؛ پاس دادن `actor` در `download_template`؛ اعتبارسنجی شرکت فعال و دامنهٔ انبارها و کاربران در `import_excel` و ایجاد رکورد `UserCompanyAccess` با سطح `workspace_full` برای کاربر جدید در شرکت فعال سازنده.
    - `backend/core/accounts/excel_utils.py`: فیلتر کردن گزینه‌های قالب اکسل در `generate_users_template(actor=None)`؛ پشتیبانی از پارامترهای اختیاری `actor=None` و `active_company_id=None` در `parse_users_excel`؛ اعتبارسنجی الزام شرکت فعال سازنده در پیش‌نمایش و ثبت؛ تشخیص تکرار دو منبعی (کل پایگاه داده برای جلوگیری از تصادم، و کاربران در دامنه برای `update_existing`)؛ صدور خطای شفاف ردیف برای فیلدهای خارج از قلمرو.
    - `backend/core/platform_core/query_engine/definitions.py`: افزودن فیلد اختیاری `scope_resolver` به `EntityConfig`.
    - `backend/core/platform_core/query_engine/engine.py`: اعمال قلاب `scope_resolver(qs, user)` با اولویت اول در `_scope_queryset`؛ پشتیبانی از `scope_kind='company'` با فیلتر `{scope_path}__in` شرکت‌های مجاز کاربر در `_check_scope_access` و `_scope_queryset` (نتیجهٔ خالی برای کاربر بی‌شرکت، بدون محدودیت برای سوپریوزر). مسیرهای run و export هر دو از این دامنه عبور می‌کنند.
    - `backend/core/reports/registry.py`: افزودن `scope_resolver=lambda qs, user: get_visible_users_for_user(user, qs)` به موجودیت `users`.
    - `backend/modules/accounting/personnel/report_entities.py`: تعریف سه resolver دامنه‌ساز ماژولار (`resolve_personnel_profiles_scope`, `resolve_monthly_payrolls_scope`, `resolve_fleet_trips_scope`) با بازاستفاده از قواعد `scope_personnel_queryset` و `VehicleTripViewSet.get_queryset`، و اتصال آن‌ها به `EntityConfig` سه موجودیت `personnel_profiles`، `monthly_payrolls` و `fleet_trips`.
    - `backend/modules/warehouse/warehouses/user_extension.py`: افزودن متد کمکی `_get_scoped_warehouses_qs` و پارامتر اختیاری `user=None` به متدهای `get_template_warehouse_names`, `get_all_warehouses`, `build_warehouses_lookup` جهت محدودسازی انبارها به شرکت‌های مجاز کاربر بدون وابستگی مستقیم هسته به ماژول.
    - `backend/integration_tests/test_company_scope_reports_import.py`: ایجاد ۱۳ متد آزمون جامع و یکپارچه بدون هیچ skip در پروفایل کامل، با پوشش ۱۰۰٪ موارد بند ۳ پرامپت (اجرای موفق با وضعیت OK در ۲۰.۶۷ ثانیه).
  - **فهرست سفید موجودیت‌های سراسری بدون دامنه (GLOBAL_WHITELIST):**
    - دیکشنری `GLOBAL_WHITELIST` در آزمون خالی است؛ زیرا کلیهٔ موجودیت‌های ثبت‌شده فعلی در موتور گزارش‌ساز یا دارای `scope_path` معتبر (انبار/شرکت) هستند یا دارای `scope_resolver` اختصاصی. در صورت افزودن موجودیت کاملاً عمومی و فاقد شرکت (مانند تقویم تعطیلات رسمی کشوری)، باید با ذکر دلیل در این دیکشنری ثبت شود.
  - **تصمیم‌ها و انحراف‌ها:**
    - عدم تغییر در مدل‌ها، مایگریشن‌ها و فرانت‌ند دقیقاً طبق قیود طرح حفظ شد.
    - هیچ import مستقیمی از هسته به ماژول‌ها انجام نشد و ارتباط انبار از طریق اکستنشن موجود در رجیستری پیاده‌سازی گردید.
    - در `MonthlyPayrollRecord` آزمون، با توجه به الزامی بودن کلید خارجی `period`، رکورد `MonthlyWorkPeriod` متناظر با شرکت مربوطه ساخته شد تا یکپارچگی ارجاعی حفظ شود.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۲ (لانچر، سایدبار و پیوند سریع از نقطه‌های توسعه در فرانت):**
  - **فهرست فایل‌های تغییریافته و ایجادشده:**
    - `frontend/src/app/core/modules/module-contract.ts`: افزودن ویژگی اختیاری `route?: string;` به `ModuleNavItem`؛ توسعهٔ تایپ `themeColor` در کاشی‌های لانچر (`launcherTile`).
    - `frontend/src/app/core/modules/module-registry.service.ts`: تزریق خودکار فیلد `moduleCode` در اشیاء خروجی `getExtensions` جهت انتساب صحیح اکستنشن به ماژول صاحبش؛ افزودن متد `registerModule` برای تسهیل تست‌های پویا.
    - `frontend/src/app/modules/common/components/app-launcher/app-launcher.ts` و `app-launcher.html`: ایجاد سیگنال `extraCards()` جهت شناسایی ماژول‌های ثالث نصب‌شده بر اساس ویژگی‌های خود کارت (نه هاردکد نام ماژول در هسته)؛ ایجاد نگاشت کلاس‌های ثابت `LAUNCHER_THEMES` سازگار با Tailwind JIT؛ تنظیم تطابق ۱:۱ سنجه‌های `visibleCardsCount`، `isSingleAppMode` و `gridContainerClass` با تعداد واقعی کاشی‌های رندرشده؛ رندر کاشی‌های ماژول‌های نصب‌شده با `@for (card of extraCards(); track card.code)` همراه قفل دسترسی و آیکون معتبر رجیستری.
    - `frontend/src/app/modules/common/components/layout/layout.ts` و `layout.html`: حذف پیشوندهای ثابت و هاردکدشدهٔ `'/app/warehouse/'` و `'/app/finance/'` در `switchTab` و حل پویا بر پایهٔ `routePrefix` ماژول و فیلد اختیاری `route`؛ حفظ امضای `switchTab(tabId: string)`؛ حل پویا و وابسته به ماژول فعال برای شناسه‌های مشترک نظیر `audit` و `health`؛ حفظ کلیهٔ مسیرها و ریدایرکت‌های موجود از جمله `companies`؛ تفکیک ماژول‌های بدون انبار (`showWarehouseSwitcher === false`) در بخش مجزای «سامانه‌های دیگر» در سایدبار مشروط به مجوز آیتم.
    - `frontend/src/app/modules/common/components/operations/operations-layout/operations-layout.ts` و `operations-layout.html`: استخراج و نمایش پیوندهای سریع ماژول‌های نصب‌شده از طریق اکستنشن `operations.quickLink` در نوار کناری و کشوی موبایل عملیات، ضمن حفظ پیوندهای ثابت انبار و مالی.
    - `scripts/module-template/frontend/nav-items.ts`: بازنویسی برای استفاده مستقیم از `ModuleNavItem` برگرفته از `module-contract.ts` و حذف اینترفیس جداگانهٔ `NavItem`.
    - `scripts/module-template/frontend/module.ts`: تصحیح نام آیکون به آیکون معتبر رجیستری (`'box'`)؛ افزودن اکستنشن واقعی `extensions.layoutNav` و حذف بلوک زائد `navItems`.
    - `frontend/src/app/modules/common/components/app-launcher/app-launcher.dom.spec.ts`: آزمون‌های DOM جامع برای اعتبارسنجی ۳ پروفایل ماژولی (کامل، فقط انبار، فقط مالی) به همراه ماژول ساختگی `sample` و مطابقت کامل شمارندهٔ کاشی‌ها با `visibleCardsCount`.
    - `frontend/src/app/modules/common/components/layout/layout-modular.dom.spec.ts`: آزمون‌های DOM جامع برای ناوبری به ماژول `sample` (`/app/sample/...`)، پایداری مسیرهای انبار و مالی، حل صحیح شناسه‌های مشترک و بخش «سامانه‌های دیگر».
    - `frontend/src/app/modules/common/components/operations/operations-layout/operations-layout.dom.spec.ts`: آزمون‌های DOM برای نمایش پیوند سریع ماژول ساختگی `sample` در نوار عملیات و تداوم پیوندهای موجود.
    - `frontend/tsconfig.test21.spec.json`: افزودن `operations-layout.dom.spec.ts` به لیست فایل‌های تحت آزمون مستقل.
  - **تصمیم‌ها و انحراف‌ها:**
    - ظاهر و رفتار موجود در پروفایل کامل (انبار و مالی) دقیقاً دست‌نخورده باقی ماند.
    - از هرگونه هاردکد کردن نام ماژول‌ها در مؤلفه‌های هسته خودداری شد و کلیه اکستنشن‌ها از رجیستری ماژولار استخراج شدند.
    - آزمون‌های DOM هر سه کامپوننت با متدولوژی سبک (Type 1: jsdom + Vitest) با موفقیت کامل و بدون وابستگی به مرورگر سنگین اجرا شدند.
  - **فهرست چک ۳۶۰px برای کاربر (موارد پشت صفحهٔ ورود):**
    - [ ] **صفحه لانچر در ۳۶۰px (`/app/launcher`):** بررسی نمایش گرید تک‌ستونه بدون هیچ‌گونه اسکرول افقی ناخواسته؛ بررسی تناسب ابعاد کارت‌ها و عنوان‌ها در عرض ۳۶۰ پیکسل.
    - [ ] **کارت‌های دارای دسترسی/فاقد دسترسی در لانچر:** بررسی رفتار کاشی‌های ماژول‌های متصل در صورت عدم برخورداری کاربر از دسترسی (نمایش برچسب قفل دسترسی و غیرفعال بودن رویداد کلیک).
    - [ ] **کشوی منوی سایدبار (Mobile Drawer) در ۳۶۰px:** باز کردن منوی کناری موبایل و بررسی تفکیک صحیح بخش «سامانه‌های دیگر» برای ماژول‌های مستقل از انبار بدون بیرون‌زدگی تگ‌ها یا متون دکمه‌ها.
    - [ ] **ناوبری گزینه‌های سایدبار:** لمس گزینه‌های منوی ناوبری و هدایت موفق به آدرس‌های تعریف‌شده در ماژول بدون شکست مسیر یا ارجاع اشتباه به روت انبار/مالی.
    - [ ] **مسیرهای مشترک `audit` و `health`:** بررسی رفتار این دو گزینه در ماژول انبار و ماژول مالی در هر دو حالت دسکتاپ و ۳۶۰px موبایل.
    - [ ] **نوار کناری کنترل عملیات (Operations Sidebar):** باز کردن منوی عملیات در ۳۶۰px و بررسی قرارگیری درست دکمه‌های پیوند سریع ماژول‌ها در کنار پیوندهای اصلی.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۳ (جفت‌شدگی‌های سست در شرکت‌ها، منوی کاربری و بایگانی اسناد):**
  - **فهرست فایل‌های تغییریافته:**
    - `frontend/src/app/core/modules/module-contract.ts`: افزودن پرچم صریح `providesTreasury?: boolean;` به بخش `companies` و پرچم `hasCompanyDocumentsArchive?: boolean;` به بخش `layoutNav`؛ حذف فیلدهای بی‌مصرف `tableColumns` و `gdriveSupported` از بخش `companies` و `rolePresetCategories` از بخش `users`.
    - `frontend/src/app/modules/accounting/module.ts`: فعال‌سازی `providesTreasury: true` در اکستنشن `companies` و `hasCompanyDocumentsArchive: true` در اکستنشن `layoutNav`؛ حذف فیلدهای منسوخ `tableColumns` و `rolePresetCategories`.
    - `frontend/src/app/modules/warehouse/module.ts`: حذف فیلد منسوخ `rolePresetCategories` از اکستنشن `users`.
    - `frontend/src/app/modules/common/components/operations/companies/companies.ts`: بازنویسی `isAccountingInstalled` جهت استعلام انحصاری از پرچم صریح `providesTreasury` و حذف استنتاج سست از `extension.tabs?.length`.
    - `frontend/src/app/shared/components/user-menu/user-menu.component.ts`: جایگزینی عدد ثابت ۱۵ با محاسبهٔ پویای تعداد کلیدها از روی مجموع آیتم‌های دسته‌بندی‌های پایه (`RAW_SHORTCUTS`) و اکستنشن‌های ماژولار (`userMenu`).
    - `frontend/src/app/modules/common/components/layout/layout.ts` و `layout.html`: تعریف ویژگی `isCompanyDocumentsArchiveSupported` بر مبنای نقطه توسعهٔ `hasCompanyDocumentsArchive` و مشروط کردن نمایش پیوند بایگانی اسناد شرکت‌ها برای سوپریوزر به این پرچم.
    - `Documents/Modular_Middle_Path/guide_new_module.md`: حذف یادداشت «محدودیت فعلی» در بخش `## ۳.` و به‌روزرسانی کامل جدول نقاط توسعه متناسب با دستاوردهای نشست‌های ۲ و ۳.
    - `frontend/src/app/modules/common/components/layout/layout-modular.dom.spec.ts`: افزودن تست‌های اعتبارسنجی نمایش پیوند بایگانی اسناد در نسخه کامل برای سوپریوزر و پنهان بودن کامل آن در پروفایل فقط‌انبار.
    - `frontend/src/app/modules/common/components/operations/companies/companies.dom.spec.ts`: افزودن آزمون DOM برای جداسازی قطعی `isAccountingInstalled` از آرایهٔ `tabs` و اتکا به `providesTreasury`.
    - `frontend/src/app/shared/components/user-menu/user-menu.component.spec.ts`: افزودن آزمون اعتبارسنجی شمارش پویای کلیدهای میانبر در منوی کاربر.
  - **تصمیم‌ها و دلایل حذف فیلدهای بی‌مصرف قرارداد:**
    - `companies.tableColumns`: حذف شد؛ چیدمان و ستون‌های جدول شرکت‌ها در قالب ایستا (`companies.html`) با ستون‌های معنایی و `tableColspan` بر پایهٔ `providesTreasury` و `hasWarehouseModuleToggle` مدیریت می‌شود و آرایهٔ رشته‌ای ستون‌ها در هیچ بخشی استفاده نمی‌شد.
    - `companies.gdriveSupported`: حذف شد؛ این قابلیت در هیچ ماژولی پیاده‌سازی نشده بود و تب گوگل‌درایو از طریق آرایهٔ عمومی `tabs` مدیریت می‌شود.
    - `users.rolePresetCategories`: حذف شد؛ دسته‌بندی پیش‌تنظیم‌های نقش در `users.ts` به صورت پویا تفکیک نشده و ارائهٔ گروه‌های دسترسی ماژول از طریق `permissionGroupKeys` به صورت پاک انجام می‌گیرد.
  - **نتایج آزمون‌ها و بیلد:**
    - `layout-modular.dom.spec.ts`: پاس شدن ۸ آزمون (۸ passed).
    - `user-menu.component.spec.ts`: پاس شدن ۱۶ آزمون (۱۶ passed).
    - `companies.dom.spec.ts`: پاس شدن ۶۵ آزمون (۶۵ passed).
    - بیلد فرانت‌اند (`npx ng build --output-path ../scratch/ng-build-agent`): موفقیت کامل بدون خطای کامپایل.
    - نگهبان‌های ۵۲، ۵۵، ۵۶ و ۵۷: پاس قطعی همهٔ نگهبان‌ها.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Claude — بازبینی ناظر صف:**
  - **runner:** هر سه نشست `[DONE]` شدند. نشست ۱ (`ed25982`) در ۴۶ دقیقه و ۹ بررسی سبز: ۱۳ آزمون تازه، کل مجموعه ۲۳۲ آزمون بی شکست تازه. نشست ۲ (`30386e2`) در ۵۵ دقیقه و ۱۴ بررسی سبز. نشست ۳ (`82d4074`) در ۴۷ دقیقه و یک دور اصلاح: در دور اول ایجنت پیش از commit نوبت را بست و `sample-module` قفل گذرای فایل ویندوز خورد.
  - **`tenant-scope-reviewer` روی نشست ۱:** چهار یافتهٔ تأییدشده، رفع شد:
    - (بالا) به‌روزرسانی کاربر از Excel همهٔ انبارهای منتسب را جایگزین می‌کرد و انبارهای بیرون از دامنهٔ سازنده پاک می‌شد. حالا فقط بخش درون دامنهٔ سازنده جایگزین می‌شود (`core/accounts/views.py`، `import_excel`).
    - (متوسط) انبار با شرکت خود کاربر هدف سنجیده نمی‌شد (برخلاف `UserSerializer.validate`). حالا انبار شرکت دیگر خطای ردیف است، هم در پیش‌نمایش و هم در ثبت، و «همه انبارها» فقط انبارهای شرکت کاربر را می‌دهد (`target_company_ids_for_warehouses` و `warehouses_outside_companies` در `excel_utils.py`).
    - (متوسط) گزارش گروه‌بندی‌شدهٔ کاربران کاربر چندشرکتی را چند بار می‌شمرد (join چندمقداری). حالا `get_visible_users_for_user` با زیرپرس‌وجوی `UserCompanyAccess` فیلتر می‌کند.
    - (متوسط) resolver پرسنل محدودیت بخش‌های منتسب را نداشت؛ ایجنت قاعده را رونوشت کرده بود، نه بازاستفاده. قاعده در `scope_personnel_for_user(user, qs, company_id)` در `personnel/views.py` جدا شد و هم `scope_personnel_queryset` و هم resolver گزارش از آن استفاده می‌کنند.
    - پذیرفته بی‌تغییر: resolver حقوق همان قاعدهٔ طرح (`personnel__`) است و برای کاربر بی‌شرکت پیش‌نویس خودش را می‌دهد؛ کم‌اهمیت.
    - **بیرون از دامنه، از پیش موجود:** `VehicleTripViewSet.get_queryset` بی سربرگ شرکت، سفرهای همهٔ شرکت‌ها را برمی‌گرداند. به کاربر گزارش شد.
  - **`ui-reviewer` روی نشست ۲:** رفع شد:
    - (بالا) ماژولی که در ترتیب الفبایی پیش از `warehouse` بیاید، منوی اصلی و بافت انبار را می‌گرفت. getterهای `systemNavItems` و `warehouseNavItems` فقط ماژول صاحب سوییچر انبار را می‌خوانند.
    - (بالا) کاشی و پیوند سریع ماژول سوم به مسیر مالی می‌رفت. `switchApp` برای ماژول عمومی به `defaultRoute` خودش می‌رود و تبادل قلمرو توکن و کانال انجام نمی‌دهد؛ `syncScopeFromUrl` و `sanitizeActiveRole` ماژول عمومی را می‌شناسند (`isGenericModuleApp`).
    - (متوسط) کنتراست دکمهٔ کاشی عمومی: همهٔ رنگ‌ها `-700` با hover `-800`.
    - (متوسط) `trackBy` برای پیوندهای سریع عملیات.
    - (کم) بخش «سامانه‌های دیگر»: مسیر آیتم از ماژول صاحبش (`openModuleNavItem`)، فعال بودن با مسیر، عنوان هر ماژول وقتی بیش از یکی است، `min-h-[40px]`، نشان `text-[10px]` با ارقام فارسی.
  - **`ui-reviewer` روی نشست ۳:** فیلد `companies.tabs` بی‌مصرف شده بود؛ از قرارداد و `accounting/module.ts` حذف شد. سطر راهنما درست شد و سطر `companyApiEndpoints` افزوده شد. پذیرفته بی‌تغییر (کم): شمارندهٔ هر دستهٔ منوی کاربر هنوز در `module.ts` ثابت است، و پیوند بایگانی آزمون در سطح قالب ندارد.
  - **آزمون‌ها پس از رفع:**
    - `integration_tests.test_company_scope_reports_import`: ۱۷ آزمون OK (۴ آزمون تازه برای یافته‌های بالا).
    - `manage.py test integration_tests accounts warehouses reports platform_core personnel`: ۵۸۹ آزمون. خطاها همه از پیش موجود در خود فایل‌های آزمون‌اند: همان ۳ خطای شناخته‌شده، و ۶۹ خطای `personnel` (۵۸ `NameError: Warehouse` و ۱۱ `AttributeError: warehouse`؛ import انبار پس از جداسازی ماژول‌ها از این فایل‌های آزمون جا مانده است).
    - `django-check` سه پروفایل، `migrations-unchanged`، نگهبان ۲۹ و ۵۷: سبز.
    - `ng build` کامل و دو بیلد تک‌ماژولی، نگهبان‌های ۵۲، ۵۵، ۵۶ و ۵۷، `sample-module`: سبز.
    - `ng-test-compare --base 82d4074`: بی پس‌رفت؛ ۸۹۰ پاس در برابر ۸۸۶ پایه (۴ آزمون تازه)، همان ۱۱ شکست قدیمی.
  - **مانده برای کاربر (پشت ورود):** فهرست چک ۳۶۰px نشست ۲ در بالا.
  - **اقدام بعدی:** release روی `app`. بعد، با تأیید کاربر: نشت `VehicleTripViewSet`، آزمون‌های خراب `personnel` و سه آزمون شکستهٔ شناخته‌شده؛ و release روی `soft` (نشست ۱ پیش از هر release روی `soft`).

- **۲۳–۲۴ مهر ۱۴۰۵ (2026-10-14/15)، Claude — release و نشت سفرها (تحویل):**
  - **release روی `app`:** پشتیبان `backup_20261014_232344.dump`، بیلد فرانت با `patch-ngsw-530`، بازراه‌اندازی daphne و worker گوگل‌درایو. هر دو نشانی ۲۰۰ و heartbeat تازه. صفحهٔ ورود روی 4300 بی‌خطای کنسول.
  - **نشت `VehicleTripViewSet` (درخواست کاربر):** `get_queryset` بی سربرگ شرکت حالا برای غیرسوپریوزر به شرکت‌های مجاز محدود است (`section__project__company` یا `vehicle__section__project__company`، همان دو مسیر شاخهٔ سربرگ). commit `86399d8`. آزمون تازهٔ `test_trips_endpoint_without_company_header_is_company_scoped` (فهرست و دسترسی با شناسه). `test_company_scope_reports_import` ۱۸ OK؛ `integration_tests personnel` ۵۳۰ آزمون با همان ۷۱ خطای از پیش موجود و بی خطای تازه. پشتیبان `backup_20261015_000721.dump` و بازراه‌اندازی daphne روی `app`، هر دو نشانی ۲۰۰.
  - **باز:**
    - actionهای سفارشی همین ViewSet (`matrix`، `bulk-save`، `monthly-summary`، `monthly-grid` و بقیه) پرس‌وجوی خودشان را دارند و از `get_queryset` نمی‌گذرند؛ دامنهٔ شرکتشان بازبینی نشده است.
    - ۶۹ آزمون خراب `personnel` (import انبار جامانده) و ۳ آزمون شکستهٔ شناخته‌شده.
    - release روی `soft` با تأیید صریح کاربر؛ نشست ۱ و این رفع پیش از هر release روی `soft`.
    - فهرست چک ۳۶۰px نشست ۲ با کاربر.
  - **اقدام بعدی:** بازبینی دامنهٔ شرکت در actionهای سفارشی `VehicleTripViewSet` (`modules/accounting/personnel/views.py`، از `class VehicleTripViewSet`) سپس پرسش از کاربر برای release روی `soft`.
- **۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — دامنهٔ شرکت در actionهای سفارشی VehicleTripViewSet:**
  - **علت ریشه‌ای:**
    اکشن‌های سفارشی `VehicleTripViewSet` (`matrix`، `bulk-save`، `monthly-summary`، `monthly-grid`، `update-day-trip`، `bulk-save-monthly-grid`، `audit-logs`، `export-monthly-excel`، `import-monthly-excel`) پرس‌وجوهای مستقیم و بدون فیلتر شرکتی روی `VehicleDriverProfile.objects` و `VehicleTripLog.objects` اجرا می‌کردند و از فیلترهای تفکیک شرکت در `get_queryset` عبور نمی‌کردند. همچنین توابع ورود و خروج اکسل ناوگان در `fleet_excel_engine.py` فاقد امکان دریافت کوئری‌های فیلترشده بودند و تمام رکوردهای فعال سیستم را بررسی می‌کردند. در اکشن‌های تغییر داده نیز `section_id` ورودی با شرکت‌های مجاز کاربر تطبیق داده نمی‌شد.
  - **فهرست فایل‌های تغییریافته:**
    - `backend/modules/accounting/personnel/views.py`: تعریف متدهای کمکی `_scoped_vehicles` (مبتنی بر تابع امنیتی استاندارد `scope_vehicle_queryset`) و `_scoped_trips` (انتقال قاعده شرکتی `get_queryset`)؛ اتصال `get_queryset` به `_scoped_trips`؛ جایگزینی کوئری‌های خام خودرو و سفر با متدهای کمکی در تمام اکشن‌های ViewSet؛ بررسی دسترسی شرکت کاربر به `section_id` ارسالی در اکشن‌های نوشتنی و صدور خطای ۴۰۳ در صورت عدم دسترسی؛ انتقال querysetهای در دامنه به توابع اکسل.
    - `backend/modules/accounting/personnel/fleet_excel_engine.py`: افزودن پارامترهای اختیاری `vehicles_qs=None` و `trips_qs=None` به تابع `export_fleet_monthly_excel` و پارامتر اختیاری `vehicles_qs=None` به تابع `import_fleet_monthly_excel` با حفظ کامل رفتار پیش‌فرض در صورت عدم ارسال (None).
    - `backend/integration_tests/test_vehicle_trip_actions_scope.py`: ایجاد فایل آزمون یکپارچگی مستقل شامل ۱۳ متد آزمون مجزا جهت آزمودن تک‌تک اکشن‌های خواندنی، نوشتنی، اکسل، سربرگ غیرمجاز شرکت، ممیزی، مسیر مثبت و کاربر فاقد شرکت.
    - `Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md`: ثبت این گزارش در بخش گزارش پیشرفت طرح.
  - **رفتار هر action پس از تغییر:**
    - `get_queryset`: بازاستفاده مستقیم از متد کمکی `_scoped_trips` با حفظ ۱۰۰٪ رفتار قبلی.
    - `matrix (get_matrix)`: واکشی خودروها از `_scoped_vehicles()` و سفرهای ثبت‌شده از `_scoped_trips(...)`؛ کاربر شرکت الف فقط خودرو و سفر شرکت الف را مشاهده می‌کند؛ سوپریوزر هر دو شرکت را می‌بیند؛ ارسال سربرگ شرکت ب برای کاربر الف با خطای ۴۰۳ مسدود می‌شود؛ کاربر بدون شرکت هیچ رکوردی دریافت نمی‌کند.
    - `monthly-summary`: واکشی خودروها و سفرهای ماهانه صرفاً در قلمرو شرکت‌های مجاز کاربر درخواست‌دهنده.
    - `monthly-grid`: ساخت ماتریس ۳۱ روزه بر پایه خودروها و سفرهای فیلترشده در دامنه، بدون افشای تردد سایر شرکت‌ها.
    - `audit-logs`: اعمال فیلتر `trip__in=self._scoped_trips(VehicleTripLog.objects.all())` روی `VehicleTripAuditLog`؛ عدم دسترسی به تاریخچه تغییرات ترددهای سایر شرکت‌ها.
    - `bulk-save`: اعتبارسنجی شناسه خودرو فقط در دامنه `_scoped_vehicles()`؛ نادیده گرفتن خودروهای خارج از دامنه بدون ایجاد یا تغییر سفر؛ ارزیابی تعلق `section_id` به شرکت‌های مجاز کاربر و بازگرداندن پاسخ ۴۰۳ در صورت مغایرت.
    - `update-day-trip`: جستجوی خودرو در `_scoped_vehicles()` و بازگرداندن پاسخ ۴۰۴ در صورت خارج از قلمرو بودن؛ بررسی شرکت `section_id` با خطای ۴۰۳؛ تضمین عدم تغییر رکوردهای شرکت‌های دیگر.
    - `bulk-save-monthly-grid`: جلوگیری از ثبت یا دستکاری تردد برای خودروهای خارج از دامنه؛ بررسی شرکت `section_id` با خطای ۴۰۳.
    - `export-monthly-excel`: ارسال `vehicles_qs` و `trips_qs` فیلترشده به موتور اکسل؛ عدم درج پلاک یا تردد شرکت‌های غیرمجاز در شیت خروجی.
    - `import-monthly-excel`: ارسال `vehicles_qs` به موتور ایمپورت و نادیده گرفتن ردیف‌های خارج از دامنه مشابه رفتار خودروهای ناموجود.
  - **آزمون‌هایی که واقعاً اجرا شد با نتیجه:**
    - `integration_tests.test_vehicle_trip_actions_scope`: اجرای ۱۳ آزمون در ۱۴.۷۵۹ ثانیه با وضعیت OK (۱۳ پاس، ۰ شکست، ۰ خطا، ۰ پرش).
    - `AST verification`: اعتبارسنجی نحوی ast برای کلاس `VehicleTripViewSet` و کلیه متدهای اکشن و کمکی با خروجی `failed: []` و کد خروج ۰.
    - `django-check`: اجرای موفق در هر سه پروفایل `all`، `warehouse` و `accounting` با کد خروج ۰.
    - `migrations-unchanged`: عدم وجود تغییر در مدل‌ها نیازمند مایگریشن با کد خروج ۰.
    - `personnel.test_attendance_fleet_audit`: اجرای ۱۷ آزمون با خطای از پیش موجود `NameError: name 'Warehouse' is not defined` ناشی از فایل آزمون (مطابق لاگ `known_failures_trip_actions.txt`).
  - **ابهام‌های مانده:**
    - خطاهای از پیش موجود در فایل‌های آزمون ماژول `personnel` (مانند جا ماندن ایمپورت `Warehouse` در برخی تست‌های قدیمی) خارج از دامنه این نشست بوده و طبق الزامات طرح تغییر نیافتند.

- **۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — اصلاح یافته‌های بازبین در actionهای نوشتنی سفر:**
  - **هر یافته و رفع آن:**
    - **یافته ۱ (عدم سنجش `project_id`):** پارامتر `project_id` در سه اکشن نوشتنی (`bulk_save`، `update_day_trip` و `bulk_save_monthly_grid`) ارزیابی نمی‌شد و کاربر می‌توانست تردد خودرو را با پروژهٔ شرکت دیگری ثبت کند.
      - *رفع:* تعریف متد متمرکز `_validate_write_target(request, section_id, project_id)` در `VehicleTripViewSet`؛ بررسی وجود پروژه در دیتابیس (۴۰۰ در صورت عدم وجود)، تطابق شرکت پروژه با شرکت فعال سربرگ (۴۰۳) یا شرکت‌های مجاز کاربر در صورت نبود سربرگ (۴۰۳)، و انطباق `section.project_id == project_id` در صورت ارسال هر دو (۴۰۰).
    - **یافته ۲ (نادیده گرفتن سربرگ شرکت فعال در سنجش `section_id`):** اعتبارسنجی قبلی بخش صرفاً عضویت در لیست کلی `get_user_allowed_companies` را بررسی می‌کرد و کاربر دارای دسترسی به دو شرکت می‌توانست با سربرگ شرکت الف، تردد را در بخش شرکت ب ثبت نماید.
      - *رفع:* بررسی شرکت بخش در `_validate_write_target` در انطباق با مقدار بازگشتی `validate_user_company_access(request.user, get_request_company_id(request))`؛ الزام تطابق شرکت بخش با `cid` فعال سربرگ (حتی برای سوپریوزر) و صدور خطای ۴۰۳ در صورت مغایرت.
    - **یکپارچه‌سازی و حذف کدهای تکراری:** جایگزینی بلوک‌های تکراری بررسی بخش در هر سه اکشن با فراخوانی متد `_validate_write_target` بلافاصله پس از دریافت پارامترها و پیش از هرگونه درج یا ویرایش.
  - **فهرست فایل‌های تغییریافته:**
    - `backend/modules/accounting/personnel/views.py`: پیاده‌سازی متد `_validate_write_target` در `VehicleTripViewSet` و اتصال آن به اکشن‌های `bulk_save`، `update_day_trip` و `bulk_save_monthly_grid`.
    - `backend/integration_tests/test_vehicle_trip_actions_scope.py`: افزودن ۱۱ متد آزمون جدید برای پوشش کامل سناریوهای یافته‌های بازبین (افزایش مجموع آزمون‌ها از ۱۳ به ۲۴ متد).
    - `Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md`: ثبت این گزارش در مستندات پیگیری ناظر.
  - **آزمون‌هایی که واقعاً اجرا شد با نتیجه:**
    - `integration_tests.test_vehicle_trip_actions_scope`: اجرای ۲۴ آزمون با خروجی دقیق: `Ran 24 tests in 18.159s` با نتیجه `OK` (۲۴ پاس، ۰ شکست، ۰ خطا، ۰ پرش).
    - اعتبارسنجی نحوی AST با `ast.parse` روی `views.py` و فایل تست با کد خروج ۰.
  - **ابهام‌های مانده:**
    - هیچ ابهامی در حوزهٔ اکشن‌های نوشتنی و اعتبارسنجی دامنهٔ شرکت باقی نمانده است. خطاهای از پیش موجود در فایل‌های قدیمی آزمون ماژول `personnel` خارج از دامنه این نشست هستند.

- **۲۴ مهر ۱۴۰۵ (2026-10-15)، Claude — نظارت بر دو نشست actionهای سفر (تحویل):**
  - گیر کردن WMI ویندوز (`platform.system()` در `jdatetime`) هر فرایند تازهٔ Django را نگه می‌داشت. پس از رفع آن روی ماشین، پایهٔ `integration_tests personnel` روی `4a47e18` گرفته شد: ۵۳۰ آزمون و ۷۱ خطای از پیش موجود. فهرست خطاها در `scratch/runner-cache/known_failures_trip_actions.txt` است.
  - **نشست ۱ (`d189c44`):** runner در دور ۰ هر ۸ بررسی را سبز کرد: ۱۳ آزمون تازه OK، و ۵۴۳ آزمون بی شکست تازه.
  - **`tenant-scope-reviewer` روی نشست ۱:** دو یافتهٔ متوسط، تأییدشده در کد. هر دو به‌صورت تسک نشست ۲ رفع شدند.
    - `project_id` درخواست در سه action نوشتنی سنجیده نمی‌شد.
    - سنجش `section_id` سربرگ شرکت را نادیده می‌گرفت.
  - **نشست ۲ (`342b305`):** runner در دور ۰ هر ۸ بررسی را سبز کرد: ۲۴ آزمون فایل تازه OK، و ۵۵۴ آزمون بی شکست تازه. ناظر diff متد `_validate_write_target` را خواند و آن را مطابق طرح یافت.
  - **باز، از پیش موجود و بیرون از دامنه:**
    - `warehouse_id` درخواست با انبارهای منتسب کاربر سنجیده نمی‌شود.
    - خودرویی که نه شرکت دارد نه بخش، سفری می‌گیرد که `_scoped_trips` نمی‌بیند.
    - ۷۱ آزمون خراب `personnel`.
- **۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — دو آزمون حقوق personnel:**
  - **علت ریشه‌ای هر آزمون:**
    - `test_import_tax_excel_flow`:
      ۱) در متد `setUp`، پرسنل ۱ با `assigned_warehouse=None` ساخته شده بود و کارکرد ثبت‌شده‌ای در دوره ۱۴۰۵/۰۴ نداشت؛ در نتیجه هنگام اجرای `calculate_period` روی انبار تست، پرسنل ۱ در فیلتر انبار دوره قرار نمی‌گرفت و فیش حقوقی (`MonthlyPayrollRecord`) برای او ایجاد نمی‌شد.
      ۲) آزمون برای بارگذاری اکسل مالیات به فایل‌های دیسک (`TaxCalculatedByTheTaxOffice.xlsx` در پوشه Documents) وابسته بود که کدملی‌های متفرقه از شرکت واقعی داشتند و شامل کدملی پرسنل آزمون نبودند؛ لذا هیچ سطری با رکوردهای دوره تطبیق نمی‌یافت (`matched_count == 0`).
    - `test_monthly_payroll_calculation_and_exports_flow`:
      اکشن `export-dsk-zip` هر دو فایل دیسکت `DSKKAR00.DBF` و `DSKWOR00.DBF` را به درستی طبق استاندارد بیمه تولید و فشرده می‌کرد؛ با وجود صحت داده و ساختار، آزمون یک شرط کهنه و وابسته به طول باینری خام زیپ (`len(res_dsk.content) > 1000`) داشت، در حالی که حجم واقعی پکیج فشرده Deflate با یک پرسنل آزمون ۹۷۲ بایت بود (`AssertionError: 972 not greater than 1000`).
  - **آیا باگ برنامه بود:**
    خیر. موتور محاسبه حقوق (`payroll_engine.py`)، اکشن صدور دیسکت‌های بیمه (`views.py` و `dbf_generator.py`) و اکشن درون‌ریزی اکسل مالیات دارایی (`import_tax_excel` در `views.py`) کاملاً سالم، معتبر و منطبق بر استانداردها عمل می‌کردند. هر دو شکست ناشی از طراحی آزمون (وابستگی به فایل اکسل بیرونی و شرط کهنه بر اندازه خام فایل فشرده) و وضعیت اولیه پرسنل تست در انتساب به انبار دوره بود.
  - **تغییرها:**
    - `backend/modules/accounting/personnel/tests.py`:
      ۱) در `test_import_tax_excel_flow`: انتساب `self.personnel1.assigned_warehouse = self.warehouse` پیش از محاسبه دوره جهت تضمین ایجاد رکورد حقوق؛ تولید فایل اکسل مالیات در حافظه (`io.BytesIO`) با `openpyxl` و ستون‌های استاندارد دارایی (`کد ملی`، `نام و نام خانوادگی`، `مالیات محاسبه شده`، `تعداد ماه اعمال شده در معافیت`، `بیش از یک کارفرما`) و مقادیر پرسنل آزمون؛ ارسال به صورت `SimpleUploadedFile` و اعتبارسنجی انطباق ۱ پرسنل و ذخیره مالیات ورودی.
      ۲) در `test_monthly_payroll_calculation_and_exports_flow`: جایگزینی شرط طول خام فایل زیپ با اعتبارسنجی ساختاری از طریق `zipfile` و `struct`؛ بررسی وجود `DSKKAR00.DBF` و `DSKWOR00.DBF`، اعتبارسنجی طول هدرهای استاندارد، سنجش تعداد ردیف‌ها از هدر باینری DBF (یک کارگاه در کارگاه و حداقل یک پرسنل در دیسکت کارکنان)، و راستی‌آزمایی حضور کدملی پرسنل بیمه‌شده در بدنه باینری `DSKWOR00.DBF`.
  - **آزمون‌هایی که واقعاً اجرا شد با نتیجه:**
    - اجرای آزمون‌های کلاس `personnel.tests.PersonnelAppTests` با فرمان `venv\Scripts\python.exe manage.py test personnel.tests.PersonnelAppTests --noinput`:
      - اجرای اول (پایه): `Ran 11 tests in 4.308s` با نتیجه `FAILED (failures=2)` روی دو متد فوق.
      - اجرای دوم (پس از اصلاح آزمون‌ها): `Ran 11 tests in 4.535s` با نتیجه `OK` (۱۱ آزمون موفق، ۰ خطا، ۰ شکست، ۰ پرش).

- **۲۴ مهر ۱۴۰۵ (2026-10-15)، Antigravity — سفرهای خودروی یتیم و سنجش warehouse_id:**
  - **علت ریشه‌ای هر مورد:**
    ۱) **سفرهای خودروی یتیم:** خودروهای ثبت‌شده توسط کاربر بدون انتساب به شرکت و بدون انتساب به بخش (orphan vehicle)، در `scope_vehicle_queryset` برای خود کاربر سازنده (`created_by=user`) قابل مشاهده بودند؛ اما به دلیل اینکه متد `_scoped_trips` در `VehicleTripViewSet` و تابع `resolve_fleet_trips_scope` در `report_entities.py` صرفاً مسیرهای شرکتی (`section__project__company` و `vehicle__section__project__company`) را فیلتر می‌کردند، سفرهای ثبت‌شده برای این خودروها نادیده گرفته شده و در فهرست سفرها، نمای ماتریس ماهانه و گزارش‌های تجمیعی نمایش داده نمی‌شدند. همچنین منطق فیلتر سفرها بین ViewSet و گزارش‌ساز به صورت مستقل و غیرمتمرکز پیاده شده بود.
    ۲) **عدم سنجش `warehouse_id` در اکشن‌های تغییردهندهٔ سفر:** در اکشن‌های نوشتنی سفر (`bulk_save`، `update_day_trip`، `bulk_save_monthly_grid` و `import_monthly_excel`)، مقدار ورودی `warehouse_id` اعتبارسنجی نمی‌شد؛ در نتیجه کاربر می‌توانست شناسه انبار متعلق به شرکت دیگری یا شناسه ناموجود را در درخواست‌های ثبت و ویرایش ارسال نماید بدون اینکه مغایرت شرکتی یا عدم دسترسی کاربر به انبار بررسی شود.
  - **فهرست فایل‌ها:**
    - `backend/modules/accounting/personnel/views.py`: تعریف تابع مشترک ماژولار `scope_trips_for_user` با پشتیبانی از ۴ مسیر شرکتی و قاعده خودروی یتیم سازنده (`vehicle__company__isnull=True, vehicle__section__isnull=True, vehicle__created_by=user`)؛ بازاستفاده در `_scoped_trips`؛ گسترش امضای `_validate_write_target` برای دریافت و ارزیابی `warehouse_id` (بررسی وجود انبار با `contributions('validate_warehouse')`، تطابق شرکت انبار با سربرگ فعال از طریق `company_of('warehouse', id)`، و محدودسازی کاربران غیرسوپریوزر به انبارهای در دامنه از طریق `contributions('user_extensions')`)؛ اتصال سنجش انبار به هر چهار اکشن نوشتنی پیش از هرگونه درج یا ویرایش داده.
    - `backend/modules/accounting/personnel/report_entities.py`: بازنویسی `resolve_fleet_trips_scope` جهت بازاستفاده مستقیم از تابع مشترک `scope_trips_for_user(user, qs)` بدون هیچ‌گونه تکرار کد یا قاعده‌سازی جداگانه.
    - `backend/integration_tests/test_vehicle_trip_actions_scope.py`: افزودن ۱۰ متد آزمون یکپارچگی مستقل جهت پوشش کامل سناریوهای سفرهای خودروی یتیم، جداسازی دسترسی شرکت‌ها، گزارش fleet_trips، اعتبارسنجی انبارهای ناموجود و غیرمجاز در اکشن‌های چهارگانه، و مسیر مثبت ثبت با انبار معتبر (افزایش مجموع تست‌های این فایل از ۲۴ به ۳۴ آزمون).
    - `Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md`: ثبت این گزارش در مستندات پیگیری ناظر.
  - **رفتار تازه:**
    - سازنده خودروی یتیم می‌تواند ترددهای خودروی خود را با `bulk-save` ثبت کند و این ترددها در `GET /api/personnel/trips/`، ماتریس ۳۱ روزه ماهانه (`monthly-grid`) و گزارش‌های سامانه (`fleet_trips`) به درستی قابل مشاهده است.
    - سایر کاربران (چه از همان شرکت و چه از شرکت‌های دیگر) هیچ دسترسی به خودرو و سفرهای یتیم ثبت‌شده توسط کاربر دیگر ندارند.
    - سفرهای خودروهای دارای شرکت و فاقد بخش منحصراً برای کاربران همان شرکت نمایش داده می‌شوند.
    - ارسال `warehouse_id` متعلق به شرکت غیرمجاز یا خارج از دامنه دسترسی کاربر در هر یک از اکشن‌های `bulk-save`، `update-day-trip`، `bulk-save-monthly-grid` و `import-monthly-excel` با خطای ۴۰۳ مسدود می‌گردد.
    - ارسال `warehouse_id` ناموجود با خطای ۴۰۰ مسدود می‌شود.
    - ارسال `warehouse_id` مجاز و معتبر با موفقیت ثبت شده و مقدار شناسه انبار در رکورد سفر ذخیره می‌گردد.
  - **آزمون‌هایی که واقعاً اجرا شد با نتیجه:**
    - `integration_tests.test_vehicle_trip_actions_scope` و `integration_tests.test_company_scope_reports_import`: اجرای ۵۲ آزمون در ۶۲.۱۷۳ ثانیه با وضعیت `OK` (۵۲ پاس، ۰ شکست، ۰ خطا، ۰ پرش).
    - `personnel.test_attendance_fleet_audit`: اجرای ۱۷ آزمون در ۵.۷۰۱ ثانیه با وضعیت `OK` (۱۷ پاس، ۰ شکست، ۰ خطا، ۰ پرش).
    - مجموعه آزمون‌های کامل ناظر (`test_vehicle_trip_actions_scope`, `test_company_scope_reports_import`, `test_fleet_scenarios_10_vehicles`, `test_attendance_fleet_audit`): اجرای ۷۶ آزمون با نتیجه `Ran 76 tests in 69.794s - OK` و کد خروج ۰ بدون هیچ آزمون skipشده (`exit 0 ran 76 skipped False`).
  - **ابهام‌های مانده:**
    - هیچ ابهامی در حوزه سفرهای خودروهای یتیم و سنجش انبار در اکشن‌های سفر وجود ندارد؛ رفتار سیستم به طور کامل با قواعد طرح منطبق و تثبیت شده است.

- **۲۴ مهر ۱۴۰۵ (2026-10-15)، Claude — بستن سه مورد باز (تحویل):**
  - **آزمون‌های خراب، به اجازهٔ کاربر خودم رفع کردم (`685d22e`):** فقط فایل‌های آزمون تغییر کرد و ۶۹ آزمون از ۷۱ درست شد.
    - `Warehouse`، `Item` و `ItemPhoto` حالا با `apps.get_model` خوانده می‌شوند و حصار ماژول حفظ است.
    - `PersonnelAppTests` حالا انبار آزمون (`self.warehouse`) را می‌سازد.
    - import فرمان export worker از `reports` خوانده می‌شود.
    - کاربر عادی آزمون قفل دورهٔ ناوگان سازندهٔ خودروی یتیم شد، چون پس از `d189c44` خودروی بی‌شرکت فقط برای سازنده‌اش در دامنه است.
  - **دو آزمون حقوق، با Antigravity (`d5c206a`):** هر دو آزمون انتظار کهنه داشتند و باگی در برنامه نبود.
    - آزمون مالیات به‌جای فایل بیرونی، Excel خودش را در حافظه می‌سازد.
    - آزمون دیسکت به‌جای طول خام ZIP، ساختار DBF را می‌سنجد.
  - **یتیم‌ها و `warehouse_id`، با Antigravity (`d985774` و `844af09`):** runner پس از یک دور اصلاح سبز شد.
    - تابع مشترک `scope_trips_for_user` حالا هم در ViewSet و هم در گزارش‌ساز به کار می‌رود.
    - ناظر diff را خواند و آن را مطابق طرح یافت.
  - **پذیرفته بی‌تغییر (کم):** خودروی یتیم کاربر، انبار بی‌شرکتِ منتسب به آن خودرو را برای کاربر «در دامنه» می‌کند (`844af09`). پس آن انبار در ثبت هر سفرِ همین کاربر پذیرفته می‌شود. این فقط به انبارهای قدیمی بی‌شرکت مربوط است.
  - **آزمون نهایی ناظر:** `manage.py test integration_tests personnel`، ۵۶۴ آزمون، OK و بی هیچ خطا.
  - **اقدام بعدی:** release روی `app`، که با Antigravity و به‌صورت تسک انجام می‌شود. سپس پرسش از کاربر برای release روی `soft`.

</div>



