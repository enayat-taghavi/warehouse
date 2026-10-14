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
- فایل تازهٔ `warehouse-backend/integration_tests/test_company_scope_reports_import.py`، با دو شرکت، دو کاربر غیرسوپریوزر (یکی در هر شرکت) و یک سوپریوزر. دست‌کم این‌ها را بیازماید:
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
    - `warehouse-backend/core/accounts/scope.py`: تابع کمکی مشترک `get_visible_users_for_user(user, qs=None)` با منطق همسان `UserViewSet.get_queryset` (کاربران شرکت‌های مجاز، خود کاربر، حذف سوپریوزرها برای کاربر غیرسوپریوزر، distinct).
    - `warehouse-backend/core/accounts/permissions.py`: صادر کردن مجدد `get_visible_users_for_user`.
    - `warehouse-backend/core/accounts/views.py`: استفادهٔ `UserViewSet.get_queryset` از تابع کمکی مشترک؛ پاس دادن `actor` در `download_template`؛ اعتبارسنجی شرکت فعال و دامنهٔ انبارها و کاربران در `import_excel` و ایجاد رکورد `UserCompanyAccess` با سطح `workspace_full` برای کاربر جدید در شرکت فعال سازنده.
    - `warehouse-backend/core/accounts/excel_utils.py`: فیلتر کردن گزینه‌های قالب اکسل در `generate_users_template(actor=None)`؛ پشتیبانی از پارامترهای اختیاری `actor=None` و `active_company_id=None` در `parse_users_excel`؛ اعتبارسنجی الزام شرکت فعال سازنده در پیش‌نمایش و ثبت؛ تشخیص تکرار دو منبعی (کل پایگاه داده برای جلوگیری از تصادم، و کاربران در دامنه برای `update_existing`)؛ صدور خطای شفاف ردیف برای فیلدهای خارج از قلمرو.
    - `warehouse-backend/core/platform_core/query_engine/definitions.py`: افزودن فیلد اختیاری `scope_resolver` به `EntityConfig`.
    - `warehouse-backend/core/platform_core/query_engine/engine.py`: اعمال قلاب `scope_resolver(qs, user)` با اولویت اول در `_scope_queryset`؛ پشتیبانی از `scope_kind='company'` با فیلتر `{scope_path}__in` شرکت‌های مجاز کاربر در `_check_scope_access` و `_scope_queryset` (نتیجهٔ خالی برای کاربر بی‌شرکت، بدون محدودیت برای سوپریوزر). مسیرهای run و export هر دو از این دامنه عبور می‌کنند.
    - `warehouse-backend/core/reports/registry.py`: افزودن `scope_resolver=lambda qs, user: get_visible_users_for_user(user, qs)` به موجودیت `users`.
    - `warehouse-backend/modules/accounting/personnel/report_entities.py`: تعریف سه resolver دامنه‌ساز ماژولار (`resolve_personnel_profiles_scope`, `resolve_monthly_payrolls_scope`, `resolve_fleet_trips_scope`) با بازاستفاده از قواعد `scope_personnel_queryset` و `VehicleTripViewSet.get_queryset`، و اتصال آن‌ها به `EntityConfig` سه موجودیت `personnel_profiles`، `monthly_payrolls` و `fleet_trips`.
    - `warehouse-backend/modules/warehouse/warehouses/user_extension.py`: افزودن متد کمکی `_get_scoped_warehouses_qs` و پارامتر اختیاری `user=None` به متدهای `get_template_warehouse_names`, `get_all_warehouses`, `build_warehouses_lookup` جهت محدودسازی انبارها به شرکت‌های مجاز کاربر بدون وابستگی مستقیم هسته به ماژول.
    - `warehouse-backend/integration_tests/test_company_scope_reports_import.py`: ایجاد ۱۳ متد آزمون جامع و یکپارچه بدون هیچ skip در پروفایل کامل، با پوشش ۱۰۰٪ موارد بند ۳ پرامپت (اجرای موفق با وضعیت OK در ۲۰.۶۷ ثانیه).
  - **فهرست سفید موجودیت‌های سراسری بدون دامنه (GLOBAL_WHITELIST):**
    - دیکشنری `GLOBAL_WHITELIST` در آزمون خالی است؛ زیرا کلیهٔ موجودیت‌های ثبت‌شده فعلی در موتور گزارش‌ساز یا دارای `scope_path` معتبر (انبار/شرکت) هستند یا دارای `scope_resolver` اختصاصی. در صورت افزودن موجودیت کاملاً عمومی و فاقد شرکت (مانند تقویم تعطیلات رسمی کشوری)، باید با ذکر دلیل در این دیکشنری ثبت شود.
  - **تصمیم‌ها و انحراف‌ها:**
    - عدم تغییر در مدل‌ها، مایگریشن‌ها و فرانت‌ند دقیقاً طبق قیود طرح حفظ شد.
    - هیچ import مستقیمی از هسته به ماژول‌ها انجام نشد و ارتباط انبار از طریق اکستنشن موجود در رجیستری پیاده‌سازی گردید.
    - در `MonthlyPayrollRecord` آزمون، با توجه به الزامی بودن کلید خارجی `period`، رکورد `MonthlyWorkPeriod` متناظر با شرکت مربوطه ساخته شد تا یکپارچگی ارجاعی حفظ شود.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۲ (لانچر، سایدبار و پیوند سریع از نقطه‌های توسعه در فرانت):**
  - **فهرست فایل‌های تغییریافته و ایجادشده:**
    - `warehouse-front/src/app/core/modules/module-contract.ts`: افزودن ویژگی اختیاری `route?: string;` به `ModuleNavItem`؛ توسعهٔ تایپ `themeColor` در کاشی‌های لانچر (`launcherTile`).
    - `warehouse-front/src/app/core/modules/module-registry.service.ts`: تزریق خودکار فیلد `moduleCode` در اشیاء خروجی `getExtensions` جهت انتساب صحیح اکستنشن به ماژول صاحبش؛ افزودن متد `registerModule` برای تسهیل تست‌های پویا.
    - `warehouse-front/src/app/modules/common/components/app-launcher/app-launcher.ts` و `app-launcher.html`: ایجاد سیگنال `extraCards()` جهت شناسایی ماژول‌های ثالث نصب‌شده بر اساس ویژگی‌های خود کارت (نه هاردکد نام ماژول در هسته)؛ ایجاد نگاشت کلاس‌های ثابت `LAUNCHER_THEMES` سازگار با Tailwind JIT؛ تنظیم تطابق ۱:۱ سنجه‌های `visibleCardsCount`، `isSingleAppMode` و `gridContainerClass` با تعداد واقعی کاشی‌های رندرشده؛ رندر کاشی‌های ماژول‌های نصب‌شده با `@for (card of extraCards(); track card.code)` همراه قفل دسترسی و آیکون معتبر رجیستری.
    - `warehouse-front/src/app/modules/common/components/layout/layout.ts` و `layout.html`: حذف پیشوندهای ثابت و هاردکدشدهٔ `'/app/warehouse/'` و `'/app/finance/'` در `switchTab` و حل پویا بر پایهٔ `routePrefix` ماژول و فیلد اختیاری `route`؛ حفظ امضای `switchTab(tabId: string)`؛ حل پویا و وابسته به ماژول فعال برای شناسه‌های مشترک نظیر `audit` و `health`؛ حفظ کلیهٔ مسیرها و ریدایرکت‌های موجود از جمله `companies`؛ تفکیک ماژول‌های بدون انبار (`showWarehouseSwitcher === false`) در بخش مجزای «سامانه‌های دیگر» در سایدبار مشروط به مجوز آیتم.
    - `warehouse-front/src/app/modules/common/components/operations/operations-layout/operations-layout.ts` و `operations-layout.html`: استخراج و نمایش پیوندهای سریع ماژول‌های نصب‌شده از طریق اکستنشن `operations.quickLink` در نوار کناری و کشوی موبایل عملیات، ضمن حفظ پیوندهای ثابت انبار و مالی.
    - `scripts/module-template/frontend/nav-items.ts`: بازنویسی برای استفاده مستقیم از `ModuleNavItem` برگرفته از `module-contract.ts` و حذف اینترفیس جداگانهٔ `NavItem`.
    - `scripts/module-template/frontend/module.ts`: تصحیح نام آیکون به آیکون معتبر رجیستری (`'box'`)؛ افزودن اکستنشن واقعی `extensions.layoutNav` و حذف بلوک زائد `navItems`.
    - `warehouse-front/src/app/modules/common/components/app-launcher/app-launcher.dom.spec.ts`: آزمون‌های DOM جامع برای اعتبارسنجی ۳ پروفایل ماژولی (کامل، فقط انبار، فقط مالی) به همراه ماژول ساختگی `sample` و مطابقت کامل شمارندهٔ کاشی‌ها با `visibleCardsCount`.
    - `warehouse-front/src/app/modules/common/components/layout/layout-modular.dom.spec.ts`: آزمون‌های DOM جامع برای ناوبری به ماژول `sample` (`/app/sample/...`)، پایداری مسیرهای انبار و مالی، حل صحیح شناسه‌های مشترک و بخش «سامانه‌های دیگر».
    - `warehouse-front/src/app/modules/common/components/operations/operations-layout/operations-layout.dom.spec.ts`: آزمون‌های DOM برای نمایش پیوند سریع ماژول ساختگی `sample` در نوار عملیات و تداوم پیوندهای موجود.
    - `warehouse-front/tsconfig.test21.spec.json`: افزودن `operations-layout.dom.spec.ts` به لیست فایل‌های تحت آزمون مستقل.
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
    - `warehouse-front/src/app/core/modules/module-contract.ts`: افزودن پرچم صریح `providesTreasury?: boolean;` به بخش `companies` و پرچم `hasCompanyDocumentsArchive?: boolean;` به بخش `layoutNav`؛ حذف فیلدهای بی‌مصرف `tableColumns` و `gdriveSupported` از بخش `companies` و `rolePresetCategories` از بخش `users`.
    - `warehouse-front/src/app/modules/accounting/module.ts`: فعال‌سازی `providesTreasury: true` در اکستنشن `companies` و `hasCompanyDocumentsArchive: true` در اکستنشن `layoutNav`؛ حذف فیلدهای منسوخ `tableColumns` و `rolePresetCategories`.
    - `warehouse-front/src/app/modules/warehouse/module.ts`: حذف فیلد منسوخ `rolePresetCategories` از اکستنشن `users`.
    - `warehouse-front/src/app/modules/common/components/operations/companies/companies.ts`: بازنویسی `isAccountingInstalled` جهت استعلام انحصاری از پرچم صریح `providesTreasury` و حذف استنتاج سست از `extension.tabs?.length`.
    - `warehouse-front/src/app/shared/components/user-menu/user-menu.component.ts`: جایگزینی عدد ثابت ۱۵ با محاسبهٔ پویای تعداد کلیدها از روی مجموع آیتم‌های دسته‌بندی‌های پایه (`RAW_SHORTCUTS`) و اکستنشن‌های ماژولار (`userMenu`).
    - `warehouse-front/src/app/modules/common/components/layout/layout.ts` و `layout.html`: تعریف ویژگی `isCompanyDocumentsArchiveSupported` بر مبنای نقطه توسعهٔ `hasCompanyDocumentsArchive` و مشروط کردن نمایش پیوند بایگانی اسناد شرکت‌ها برای سوپریوزر به این پرچم.
    - `Documents/Modular_Middle_Path/guide_new_module.md`: حذف یادداشت «محدودیت فعلی» در بخش `## ۳.` و به‌روزرسانی کامل جدول نقاط توسعه متناسب با دستاوردهای نشست‌های ۲ و ۳.
    - `warehouse-front/src/app/modules/common/components/layout/layout-modular.dom.spec.ts`: افزودن تست‌های اعتبارسنجی نمایش پیوند بایگانی اسناد در نسخه کامل برای سوپریوزر و پنهان بودن کامل آن در پروفایل فقط‌انبار.
    - `warehouse-front/src/app/modules/common/components/operations/companies/companies.dom.spec.ts`: افزودن آزمون DOM برای جداسازی قطعی `isAccountingInstalled` از آرایهٔ `tabs` و اتکا به `providesTreasury`.
    - `warehouse-front/src/app/shared/components/user-menu/user-menu.component.spec.ts`: افزودن آزمون اعتبارسنجی شمارش پویای کلیدهای میانبر در منوی کاربر.
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
  - **تغییر روال (تصمیم کاربر، ۲۴ مهر):** از این پس همهٔ کار اجرایی با Antigravity است و Claude فقط ناظر است. پس اقدام بعدی به‌صورت یک تسک `tasks.md` با کامنت runner نوشته و با runner اجرا می‌شود؛ Claude خودش کد را ویرایش نمی‌کند.

</div>

