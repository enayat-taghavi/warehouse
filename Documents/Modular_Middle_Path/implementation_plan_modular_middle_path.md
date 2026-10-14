# طرح: راه میانهٔ ماژولار (هستهٔ تمیز + ماژول انبار + ماژول مالی)

<div dir="rtl" align="right">

تاریخ: ۲۳ مهر ۱۴۰۵ (2026-10-14) — وضعیت: **طرح؛ اجرا فقط پس از تأیید تایپی کاربر**

## ۱. هدف

- همه‌چیز در یک مخزن می‌ماند: یک هستهٔ تمیز و دو ماژول (انبار و مالی). هر ماژول خودش را به هسته معرفی می‌کند و هسته نام هیچ ماژولی را نمی‌داند.
- هر محصول (فقط انبار، فقط مالی، هر دو) بیلد و استقرار جدای خودش را دارد.
- برای افزودن ماژول تازه، هسته دست نمی‌خورد: یک پوشه اضافه می‌شود و کد آن در `WH_MODULES` می‌آید.

## ۲. تصمیم‌ها

| موضوع | تصمیم |
|---|---|
| دادهٔ فعلی | اهمیت ندارد (کاربر، ۲۳ مهر). طرح هیچ سازوکاری برای حفظ داده نمی‌سازد. چون `label` و `db_table` اپ‌ها عوض نمی‌شوند، هیچ گامی به مایگریشن یا بازسازی پایگاه‌داده نیاز ندارد. |
| پوشهٔ فرانت | زیر `src/app/modules/` موجود: `common/`، `warehouse/`، `accounting/` (کاربر). `platform-shell/` در `common/` ادغام می‌شود. |
| پوشهٔ بک‌اند | «فقط پوشه»: پوشه‌ها به مسیر پایتون اضافه می‌شوند و ایمپورت‌ها مثل امروز `from accounts...` می‌مانند (کاربر). |
| جای پوشه‌های بک‌اند | `core/`، و برای ماژول‌ها `modules/warehouse/` و `modules/accounting/` (تصمیم Claude: کشف خودکار ماژول‌های آینده فقط با پویش `modules/*` ممکن است، چون ریشهٔ بک‌اند پوشه‌های غیرکدی زیادی دارد). |
| اجراکننده | Antigravity با صف `run_tasks.py`، هر گام یک یا چند نشست (کاربر، ۲۳ مهر؛ جای تصمیم قبلیِ «Claude»). Claude ناظر است: طرح و `tasks.md` با خط‌های verify، بازبینی پس از صف، release روی `app` و هر کار روی `soft`. |
| تغییرهای کامیت‌نشدهٔ `deploy.ps1` و `warehouse-deploy.sh` | پیش از هر کاری، همان‌طور که هستند، در یک کامیت جدا ثبت می‌شوند (کاربر). |
| استقرار روی `soft` | فقط با تأیید جداگانهٔ کاربر. |

## ۳. وضع موجود (بررسی ۲۳ مهر)

**بک‌اند**
- `platform_core/registry.py` کلاس `ModuleSpec` و تابع‌های `register_module` و `is_module_installed` را دارد. ولی `platform_core/module_catalog.py` مشخصات هر دو ماژول (`WAREHOUSE_SPEC`، `ACCOUNTING_SPEC`) را خودش تعریف می‌کند، یعنی ماژول‌ها هنوز خودشان را معرفی نمی‌کنند.
- `config/settings.py` فهرست `INSTALLED_APPS` را با `WH_MODULES` از همین کاتالوگ می‌سازد.
- `companies/access.py` نقطهٔ توسعهٔ `register_derived_company_source` را دارد و `reports/registry.py` تابع‌های `register_entity` و `register_joins` را.
- نگهبان ۲۹ رد می‌شود. شمار نقض‌ها از ۲۸ به ۴۱ رسیده و ۱۳ نقض اضافه **غیرتولیدی** است (تست/seed). شمار تولیدی همان ۱۰ است، ولی یال‌ها نیمی عوض شده‌اند: ۵ یال قدیمی `communications` رفع شده و ۵ یال تازه در `personnel`، `warehouses` و `reports` آمده است (جدول زیر وضع امروز است). «ریشهٔ ترکیب» هم ۴ سطر نام ماژول دارد (`config/settings.py` سطرهای ۶۴، ۶۵ و ۱۱۵، و `config/urls.py` سطر ۲۱).
- ۱۰ یال تولیدی:

| یال | چه می‌کند |
|---|---|
| `warehouses/signals.py:35` → `personnel.models` | با حذف انبار، `warehouse_id` را در ۵ مدل مالی خالی می‌کند (داده حذف نمی‌شود) |
| `personnel/models.py:2296` → `warehouses.models` | شرکت را از روی انبار پر می‌کند |
| `personnel/views.py:4973` → `warehouses.models` | شرکت را برای اعلان از روی انبار پیدا می‌کند |
| `accounts/serializers.py:13` → `warehouses.models` | انبارهای تخصیص‌یافتهٔ کاربر |
| `accounts/excel_utils.py:27` → `warehouses.models` | ستون انبار در اکسل کاربران |
| `accounts/serializers.py:449` → `personnel.models` | دسترسی شرکت از راه عضویت بخش |
| `accounts/rollback_service.py:155، 160، 168` → `inventory`/`warehouses` | مدل‌های قابل بازگردانی |
| `reports/registry.py:314` → `personnel.models` | موجودیت‌های گزارش مالی (موجودیت‌های انبار هم با `is_installed` در همین فایل‌اند) |

- در `.importlinter`، `reports` هنوز در لایهٔ ماژول‌هاست، ولی در این طرح جزو هسته است.
- `pyproject.toml` مسیر `warehouse-backend` و فهرست اپ‌های هر بسته را دارد. `deploy.ps1` در `Get-BackendWhitelist` اپ‌ها را با الگوی `warehouse-backend/<app>/__init__.py` پیدا می‌کند.

**فرانت**
- `src/app/components/` تخت نیست: `finance/`، `operations/`، `organization/` و `personnel/` زیرپوشه دارند.
- `src/app/modules/{warehouse,accounting}` از قبل `*.routes.ts`، `nav-items.ts`، `entity-icons.ts` و پرچم‌ها را با نسخهٔ `stub` دارند. پروفایل‌های `accounting-only` و `warehouse-only` در `angular.json` همین stubها را جایگزین می‌کنند.
- `FrontendModuleSpec` و `KNOWN_MODULE_CATALOG` در `core/modules/module-registry.service.ts` هستند، یعنی هسته هر سه ماژول را می‌شناسد.
- `isModuleInstalled` در ۲۴ فایل غیرتست به‌کار رفته است (۳۲ فایل با تست‌ها).

**استقرار**
- `deploy.ps1` کلید `Modules` و `WH_MODULES` و `-AddModule` را دارد، ولی همیشه `npm run build` کامل را اجرا می‌کند.

## ۴. ساختار هدف

```
warehouse-backend/
  manage.py, config/             ریشهٔ ترکیب (جایش عوض نمی‌شود)
  core/                          accounts, common, companies, communications,
                                 notifications, reports, settings_core, platform_core
  modules/
    warehouse/   module.py       warehouses, inventory
    accounting/  module.py       personnel

warehouse-front/src/app/
  core/, shared/                 هسته (جایش عوض نمی‌شود)
  modules/
    common/                      پوستهٔ مشترک و صفحه‌های مشترک (جای platform-shell)
    warehouse/   module.ts       routes, nav, components/
    accounting/  module.ts       routes, nav, components/
    installed-modules.ts         تنها فهرست ماژول‌های نصب‌شده (ساخته‌شده در بیلد)
```

**قاعدهٔ وابستگی (هر دو طرف):** هسته هیچ ماژولی را ایمپورت نمی‌کند. ماژول‌ها فقط هسته را ایمپورت می‌کنند و هرگز همدیگر را. ارتباط فقط از راه نقطه‌های توسعه یا رویدادهای هسته است. تنها استثنا ریشهٔ ترکیب است: `config/` در بک‌اند، و `app.routes.ts`، `app.config.ts` و `installed-modules.ts` در فرانت. این‌ها هم فهرست ماژول‌ها را فقط از رجیستری یا فایل ساخته‌شده می‌گیرند.

## ۵. گام‌ها

### گام پیش‌نیاز — ثبت تغییرهای استقرار (حدود ۱۰ دقیقه؛ Claude، پیش از شروع صف)
- `git diff` فایل‌های `deploy.ps1` و `scripts/deploy/warehouse-deploy.sh` (قابلیت `-RollbackRelease`) بازبینی و بی‌تغییر در یک کامیت جدا ثبت می‌شود. فایل‌های ردیابی‌نشده (`tasks - Copy.md` و `tasks_history.md`) دست نمی‌خورند.
- **ریسک:** خیلی کم. **راستی‌آزمایی:** `git status` نشان دهد آن دو فایل دیگر تغییر کامیت‌نشده ندارند و diff کامیت عیناً همان diff قبلی باشد.

### گام ۰-الف — پوشه‌های بک‌اند (یک نشست، حدود ۳ تا ۴ ساعت)
- **هماهنگی:** تا پایان صف، Claude روی مخزن کاری نمی‌کند و هیچ صف یا نشست دیگری هم‌زمان اجرا نمی‌شود.
- اپ‌ها با `git mv` به `core/` و `modules/<x>/` منتقل می‌شوند. `name` و `label` هیچ `AppConfig`ی عوض نمی‌شود.
- **کمکی مسیر:** فایل تازهٔ `warehouse-backend/backend_paths.py` (در ریشهٔ بک‌اند، که همیشه روی مسیر است):
  - تابع `paths()` فهرست `core` و هر `modules/*` را برمی‌گرداند و `install()` آن‌ها را یک بار به `sys.path` اضافه می‌کند.
  - `config/__init__.py` آن را صدا می‌زند، پس هر ورودی Django (`manage.py`، `asgi`، `wsgi`، daphne) پوشش داده می‌شود.
  - ابزارهای بیرون از Django همین کمکی را به‌کار می‌برند:
    - نگهبان ۲۹ مقدار `PYTHONPATH` را برای `lint-imports` از `paths()` می‌سازد (`guardian_modularization.py:266`). علتش این است که `lint-imports` هیچ‌وقت `config` را بارگذاری نمی‌کند.
    - هر اسکریپتی که پس از `sys.path.insert(..warehouse-backend..)` اپ‌ها را مستقیم ایمپورت می‌کند، بلافاصله `import backend_paths; backend_paths.install()` می‌گیرد. فهرست امروز:
      - `scripts/e2e/guardian_30`، `31`، `36`، `41`، `43`، `49`، `50`، `54`، `guardian_modularization.py` و `guardian_phase1` تا `5`.
      - `scripts/setup_e2e_data.py`.
    - اسکریپت‌های داخل اپ‌ها که مسیر بک‌اند را نسبت به `__file__` می‌سازند، با جابه‌جایی یک پوشه عمیق‌تر می‌شوند و باید اصلاح شوند. فهرست امروز:
      - `accounts/concurrency_stress_test.py`.
      - در `personnel/`: `guardian_menu_redesign.py`، `phase_guardian.py`، `phase_guardian_approval.py`، `section_guardian.py`، `timesheet_phase_guardian.py` و `verify_build_and_suite.py`.
- اصلاح هر جایی که اپ‌ها را با مسیر پیدا می‌کند:
  - `pyproject.toml` (`package-dir` و `where`، سطرهای ۴۸ تا ۵۲) و توضیح بالای `.importlinter`.
  - در `deploy.ps1`: `Get-BackendWhitelist` (سطر ۱۲۸۸، الگوی `^warehouse-backend/([^/]+)/__init__\.py$`) و `Test-BundleStage` (حدود سطر ۱۳۱۵). همچنین `scripts/deploy_tests/test_bundle.ps1` (سطرهای ۵۳ تا ۸۸). اگر این‌ها اصلاح نشوند، بستهٔ استقرار بی‌اپ ساخته می‌شود.
  - `warehouse-backend/docker-compose.yml`، اگر مسیر اپ دارد.
  - الگوهای مسیر در `.claude/hooks/guard.py`، مهارت `safe-migration` و بازبین‌ها.
  - بخش ساختار در `CLAUDE.md` و `.agents/AGENTS.md`.
- **ریسک: متوسط.** تغییر گسترده ولی مکانیکی است. خطر اصلی ابزاری است که اپ را با مسیر پیدا می‌کند، مثلاً یک اپ در بستهٔ استقرار جا بماند و سرور نیاید.
- **راستی‌آزمایی:**
  - `manage.py check` برای سه پروفایل (`WH_MODULES=warehouse`، `accounting` و خالی).
  - `makemigrations --check --dry-run` بگوید «No changes» (اثبات اینکه طرح پایگاه‌داده عوض نشده است).
  - تست‌های بک‌اند با برچسب اپ، با همان نتیجهٔ پیش از جابه‌جایی.
  - عددهای نگهبان ۲۹ عیناً همان پیش از جابه‌جایی باشند (اثبات بی‌اثر بودن جابه‌جایی). تا پیش از گام ۲، این با `verify_tools.py guardian29-max` و خروجی `--json` نگهبان سنجیده می‌شود، چون خود نگهبان روی HEAD رد می‌شود.
  - `deploy_tests/test_bundle.ps1` و یک بررسی تازه: فهرست اپ‌های بستهٔ استقرار با `INSTALLED_APPS` پروفایل کامل برابر باشد.
  - release روی `app`: `/` و `/api/public/config/` پاسخ 200 بدهند.

### گام ۰-ب — پوشه‌های فرانت (دو نشست، حدود ۴ ساعت)
- **نگاشت پوشه‌ها** با یک اسکریپت یک‌بارمصرف از روی گراف ایمپورت و فایل‌های route قطعی می‌شود: هر پوشه‌ای که فقط یک ماژول به آن می‌رسد به همان ماژول می‌رود، و پوشه‌ای که هر دو یا `app.routes.ts` به آن می‌رسند به `common/`. پیش‌نویس:

| مقصد | پوشه‌های `components/` |
|---|---|
| `modules/common/components/` | `app-launcher`، `audit`، `change-password`، `communications`، `health-dashboard`، `layout`، `login`، `operations`، `reports`، `settings`، `users`، `verify-card` |
| `modules/warehouse/components/` | `count-tracking`، `counter`، `customs`، `dashboard`، `dispatch`، `docs`، `feeding`، `manager-review`، `supervisor`، `wh-settings` |
| `modules/accounting/components/` | `finance`، `organization`، `personnel` |
| با اسکریپت قطعی می‌شود | `dynamic-fields`، `field`، `id-cards`، `label-designer`، `placeholders`، `projects` |

- **روش جابه‌جایی:**
  - با `git mv`. مسیرهای نسبی ایمپورت (هم در فایل‌های جابه‌جاشده و هم در هر فایلی که به آن‌ها ایمپورت دارد، از جمله `modules/*/…routes.ts`) با یک اسکریپت Node یک‌بارمصرف بازنویسی می‌شوند: `scripts/refactor/move_front_components.mjs`، با API کامپایلر TypeScript.
  - اسکریپت همهٔ `*.ts` را می‌خواند، از جمله `*.spec.ts` و `*.dom.spec.ts`. نام فایل‌های این پروژه بیشتر بدون پسوند `.component` است (مثل `login/login.ts`)، پس روی پسوند فیلتر نمی‌کند.
  - `templateUrl` و `styleUrl` چون همراه پوشه جابه‌جا می‌شوند، دست نمی‌خورند. مسیرهای رشته‌ای `import()` پویا هم بازنویسی می‌شوند.
  - اسکریپت در پایان نشست ۰-ب-۲ حذف می‌شود.
- **مسیرهای ثابتی که باید اصلاح شوند:**
  - مبنای نگهبان ۵۵ `scripts/e2e/clickable_ergonomics_baseline.json` (۹۰ مسیر `components/`). مسیرها با همان نگاشت بازنویسی می‌شوند، بدون اجرای `--update-baseline`، تا شمارش‌ها عوض نشوند.
  - نگهبان‌های `scripts/e2e/guardian_38` تا `40`، `42`، `44` تا `48`، `50`، `51` و `guardian_header_harmonization.py`، به‌علاوهٔ `scripts/test_guard_hooks.py`.
  - `warehouse-front/tools/dom-verify.js`.
  - `warehouse-front/tsconfig.spec.json` (سطر ۱۷) و `tsconfig.test21.spec.json`.
  - specهایی که با `__dirname` فایل می‌خوانند.
  - `.agents/PROJECT_ARCHITECTURE_MAP.md`، مهارت `design-system`، `ui-reviewer`، `CLAUDE.md` و `.agents/AGENTS.md`.
- **نشست ۰-ب-۱:** نگاشت قطعی، ساخت اسکریپت، جابه‌جایی پوشه‌های `common` و ادغام `platform-shell` در `modules/common/`. بیلد باید سبز بماند.
- **نشست ۰-ب-۲:** جابه‌جایی پوشه‌های `warehouse` و `accounting` با همان اسکریپت، اصلاح همهٔ مسیرهای ثابت بالا و حذف اسکریپت.
- **ریسک: متوسط.** یک ایمپورت شکسته بیلد را می‌شکند، پس خطا پنهان نمی‌ماند. خطر واقعی در مسیرهای رشته‌ای و مبناهای نگهبان است.
- **راستی‌آزمایی (هر دو نشست):**
  - `npm run build` و دو بیلد `build:accounting` و `build:warehouse`.
  - `ng test` با `ng-test-compare` در برابر پایهٔ نشست.
  - نگهبان‌های ۵۲، ۵۵ و ۵۶.
  - `git diff -M --stat` فقط تغییر نام و سطرهای ایمپورت را نشان دهد.
  - ناظر: بررسی صفحهٔ ورود روی 4300 و release روی `app`. صفحه‌های پشت ورود را کاربر بررسی می‌کند.

### گام ۱ — بیلد و استقرار جدا (یک نشست، حدود ۲ تا ۳ ساعت)
- **درز ثابت:** اسکریپت تازهٔ `warehouse-front/tools/build-for-modules.js` (با `npm run build:modules`) فهرست ماژول‌ها را از `WH_MODULES` می‌خواند و بیلد درست را می‌سازد:
  - `warehouse` → پروفایل `warehouse-only`.
  - `accounting` → پروفایل `accounting-only`.
  - هر دو یا خالی → بیلد کامل.
  - گزینهٔ `--output-path` به `ng build` می‌رسد و همان مسیر به `patch-ngsw-530.js` (آرگومان اختیاری تازه؛ بی‌آرگومان رفتار امروز می‌ماند).
  - پس از بیلد، `<output-path>/browser/build-modules.txt` نوشته می‌شود: کدها به ترتیب الفبا، جداشده با ویرگول (`accounting`، `warehouse` یا `accounting,warehouse`).
  - `deploy.ps1` از این به بعد فقط همین فرمان را با `WH_MODULES` سرور صدا می‌زند. پس در گام ۴ و برای ماژول‌های آینده دیگر عوض نمی‌شود.
- `deploy.ps1`:
  - نشانگر بیلد (`.build-complete`) شامل `MODULES=` می‌شود تا `-SkipBuild` بیلدِ پروفایل دیگر را دوباره استفاده نکند.
  - بررسی بسته: `build-modules.txt` باید با `Modules` سرور برابر باشد.
  - `-AddModule` پیش از تغییر `WH_MODULES`، فرانت را با فهرست جدید بیلد و release می‌کند. بقیهٔ مسیر (migrate، ری‌استارت، بازگشت در شکست) مثل امروز است.
- **فهرست ماژول‌های شناخته‌شده از روی پوشه‌ها:**
  - امروز در `deploy.ps1` (`$KnownModules`، سطر ۸۵) و در `warehouse-deploy.sh` (`KNOWN_MODULES`، سطر ۲۷) ثابت نوشته شده است.
  - `deploy.ps1` آن را از `git ls-tree` کامیت استقرار (`warehouse-backend/modules/*/module.py`) می‌سازد. `warehouse-deploy.sh` آن را از پوشهٔ `modules/` همان release می‌سازد. ترتیب بر اساس نام پوشه است.
  - `MODULE_SERVICES` در `warehouse-deploy.sh` برای ماژول ناشناخته مقدار خالی می‌گیرد.
- **ریسک: کم تا متوسط.** اگر پروفایل اشتباه روی سرور برود، منوها ناقص می‌شوند. بررسی `build-modules.txt` جلوی آن را می‌گیرد.
- **راستی‌آزمایی:**
  - سه بیلد: خروجی «فقط مالی» نباید هیچ chunk از مسیرهای انبار داشته باشد، و برعکس (جستجوی چند مسیر نشانه در `dist`).
  - `test_bundle.ps1`، `test_integration.ps1` (با سناریوی AddModule) و `test_exit_codes.ps1`.
  - نگهبان ۵۳ و PSScriptAnalyzer.
  - استقرار روی `soft` فقط پس از تأیید جداگانه.

### گام ۲ — حصارها (یک نشست، حدود ۳ ساعت)
- **بک‌اند (نگهبان ۲۹ سبز):**
  1. `.importlinter` با پوشه‌ها هم‌تراز می‌شود: لایه‌ها `config` → ماژول‌ها → هسته؛ `reports` در هسته؛ C2 دوطرفه؛ C3 = هسته هیچ ماژولی را ایمپورت نکند.
  2. ۴ سطر ریشهٔ ترکیب حذف می‌شوند: `_PROJECT_LOGGERS` از `INSTALLED_APPS` ساخته می‌شود. سطر ۲۱ `urls.py` (`api/reports/`) احتمالاً با رفتن `reports` به هسته در بند ۱ خودبه‌خود حل می‌شود. اول همین بررسی می‌شود.
  3. ۳۱ یال غیرتولیدی فهرست و رفع می‌شوند. تست‌هایی که ذاتاً بین‌ماژولی‌اند به `warehouse-backend/integration_tests/` می‌روند. این پوشه جزو هیچ لایه‌ای نیست، فقط با برچسب و روی پروفایل کامل اجرا می‌شود و اسکریپت ریشه ندارد.
  4. چون تعریف قراردادها عوض شده، مبنا **یک بار** با ثبت عددهای قبل و بعد در گزارش پیشرفت دوباره گرفته می‌شود. از آن به بعد فقط کاهش مجاز است.
- **فرانت (نگهبان تازهٔ ۵۷، `guardian_57_front_module_fence.py`):**
  - ایمپورت‌های `src/app/**/*.ts` را می‌خواند و می‌شمارد:
    - (الف) `core/`، `shared/` یا `modules/common/` → `modules/warehouse|accounting`.
    - (ب) انبار ↔ مالی.
    - (ج) `isModuleInstalled('<کد ماژول>')` بیرون از پوشهٔ همان ماژول.
  - ریشهٔ ترکیب مستثناست. مبنای آچاری در `scripts/e2e/front_fence_baseline.json` نگه داشته می‌شود. ابزار npm تازه‌ای اضافه نمی‌شود.
- **ریسک: کم.** رفتار برنامه عوض نمی‌شود. فقط جای چند تست عوض می‌شود.
- **راستی‌آزمایی:**
  - نگهبان ۲۹ با PASS.
  - نگهبان ۵۷ روی HEAD با PASS، و با `--self-test` روی یک نمونهٔ نقض ساختگی (در `scratch/`) با FAIL.
  - تست‌های جابه‌جاشده با برچسب، با همان نتیجهٔ قبل.
  - `guardian_all.py` بدون شکست تازه (شکست‌های قدیمی فاز ۱ تا ۵ ثبت می‌شوند).

### گام ۳ — بک‌اند: برعکس کردن وابستگی‌ها و معرفی ماژول‌ها (یک تا دو نشست، حدود ۵ ساعت)
- **معرفی خودکار ماژول:**
  - `WAREHOUSE_SPEC` و `ACCOUNTING_SPEC` و فهرست مجوزهای هر ماژول از `module_catalog.py` به `modules/<x>/module.py` منتقل می‌شوند.
  - `module_catalog.py` فقط `modules/*/module.py` را پویش می‌کند (با `spec_from_file_location` و نام یکتا). شرط: `code` با نام پوشه برابر باشد.
  - `modules/` و `modules/<x>/` عمداً `__init__.py` ندارند. اگر بسته باشند، یک اپ با دو نام (`warehouses` و `modules.warehouse.warehouses`) قابل ایمپورت می‌شود و Django مدل‌ها را دو بار ثبت می‌کند.
- **ابزار هسته:**
  - در `platform_core/registry.py`: `contribute(point, item)`، `contributions(point)` و `company_of(kind, id)`.
  - در `platform_core/events.py`: رویداد `scope_deleted(kind, id)`.
  - نقطه‌های موجود (`register_derived_company_source` و `register_entity`) دوباره استفاده می‌شوند.
- برای هر یال:

| یال | جهت تازه |
|---|---|
| `warehouses/signals.py` → `personnel` | انبار `scope_deleted('warehouse', id)` را می‌فرستد. `personnel/signals.py` گوش می‌دهد و همان ۵ مدل را خالی می‌کند. رفتار عیناً همان است. |
| `personnel/models.py` و `personnel/views.py` → `warehouses` | انبار تابع «شرکتِ این انبار» را `contribute` می‌کند. مالی `company_of('warehouse', id)` را صدا می‌زند و اگر انبار نصب نباشد `None` می‌گیرد. |
| `accounts/serializers.py:449` → `personnel` | مالی در `ready()` با `register_derived_company_source` ثبت می‌شود. |
| `accounts/serializers.py:13` و `accounts/excel_utils.py` → `warehouses` | نقطهٔ `user_extensions`: انبار فیلد و ستون اکسل «انبارهای کاربر» را می‌دهد. |
| `accounts/rollback_service.py` → `inventory`/`warehouses` | نقطهٔ `rollback_models`: ماژول نگاشت نام به مدل را می‌دهد. |
| `reports/registry.py` → `personnel` (و بخش انبار همین فایل) | موجودیت‌ها به `modules/<x>/.../report_entities.py` می‌روند و در `ready()` با `register_entity` ثبت می‌شوند. |

- **ریسک: متوسط.** سیگنال حذف انبار و دسترسی شرکت حساس‌اند.
- **راستی‌آزمایی:**
  - نگهبان ۲۹: نقض تولیدی صفر و مبنا کاهش‌یافته. قراردادهای C2 و C3 در `lint-imports` برای مسیر تولیدی برقرار باشند.
  - `manage.py check` برای سه پروفایل، و `migrate` روی پایگاه خالی برای هر سه (`verify_tools.py migrate-empty`، با یک کانتینر postgres موقت جدا از پایگاه `app`).
  - تست تازه: حذف انبار همان ۵ مدل مالی را خالی کند. پس از ثبت، گزارش‌ساز همان فهرست موجودیت‌های قبل را بدهد.
  - تست‌های بک‌اند با برچسب.
  - بازبین‌ها: `data-loss-reviewer` و `tenant-scope-reviewer`.
  - release روی `app`.

### گام ۴ — فرانت: قرارداد ماژول و نقطه‌های توسعه (دو نشست، حدود ۶ تا ۸ ساعت)
- **قرارداد** در `core/modules/module-contract.ts`، هم‌تراز `ModuleSpec`:
  - `WhFrontendModule` شامل مشخصات (فیلدهای فعلی `FrontendModuleSpec`)، `routes` (lazy)، `navItems`، `entityIcons` و `extensions`.
  - نوع `ExtensionMap` در هسته تعریف می‌شود: فهرست بسته و نوع‌دار نقطه‌ها. نام‌های نهایی پس از خواندن هر ۲۴ فایل قطعی می‌شوند، مثلاً کاشی لانچر، آیتم منوی کاربر، کارت و تب مرکز عملیات، پنل سلامت، تب شرکت، بخش فرم کاربر، مسیر پیش‌فرض و مراحل راه‌اندازی اول.
  - هر ماژول `modules/<x>/module.ts` را با `export const MODULE` دارد.
- **فهرست نصب‌شده:**
  - `tools/gen-installed-modules.js` فایل `modules/installed-modules.ts` را از `WH_MODULES` می‌سازد. نسخهٔ commitشده همهٔ ماژول‌ها را دارد. `build:modules` فقط در snapshot استقرار آن را بازنویسی می‌کند.
  - فایل‌های `*.stub.ts`، پرچم‌ها و پروفایل‌های `accounting-only` و `warehouse-only` (و نسخه‌های dev آن‌ها) حذف می‌شوند. `build-for-modules.js` به‌جای انتخاب پروفایل، مولد را صدا می‌زند و `deploy.ps1` عوض نمی‌شود.
- `ModuleRegistryService` فهرست را از `installed-modules.ts` می‌سازد و `KNOWN_MODULE_CATALOG` از هسته حذف می‌شود. `isModuleInstalled` (بررسی زمان اجرا با `installed_modules` بک‌اند) می‌ماند، ولی نام ماژول دیگر بیرون از پوشهٔ خودش نوشته نمی‌شود.
- ۲۴ فایل به خواندن `extensions` تبدیل می‌شوند. اگر ماژولی به قابلیت ماژول دیگر نیاز دارد، آن هم از راه نقطهٔ توسعه است.
- **نگهبان ۵۷ گسترش می‌یابد و سخت‌گیر می‌شود (مبنا = ۰):**
  - هر `modules/<x>` (جز `common`) فایل `module.ts` دارد.
  - `code` با نام پوشه و با `modules/<x>/module.py` بک‌اند برابر است.
  - `installed-modules.ts` commitشده همهٔ پوشه‌ها را دارد.
  - هیچ نقض حصار نمانده است.
- **نشست ۴-الف:**
  - قرارداد، `module.ts` دو ماژول، مولد و `installed-modules.ts`، اتصال `ModuleRegistryService` و پوسته (`layout`، `app-launcher`، `user-menu`).
  - حذف stubها و پروفایل‌ها، و وصل کردن `build-for-modules.js` به مولد.
  - تست‌های DOM پوسته با سه فهرست ماژول.
- **نشست ۴-ب:**
  - تبدیل بقیهٔ ۲۴ فایل به `extensions` و تست DOM مرکز عملیات.
  - سخت‌گیر کردن نگهبان ۵۷ (مبنا = ۰).
- **ریسک: متوسط تا زیاد.** خطای منو، لانچر یا مسیر پشت صفحهٔ ورود است و Claude آن را نمی‌بیند. پاسخ: تست DOM برای `layout`، `app-launcher`، `user-menu` و مرکز عملیات با سه فهرست ماژول.
- **راستی‌آزمایی (هر دو نشست):**
  - `ng-test-compare` در برابر پایهٔ نشست، به‌علاوهٔ تست‌های DOM تازه.
  - سه بیلد `build:modules` با `dist-free` (نبودن کد ماژول دیگر).
  - نگهبان‌های ۵۲، ۵۵، ۵۶ و ۵۷.
  - ناظر: بررسی صفحهٔ ورود روی 4300، بازبین `ui-reviewer` و release روی `app`. کاربر منوها و لانچر را پشت ورود بررسی می‌کند.

### گام ۵ — ماژول‌های آینده (یک نشست، حدود ۲ تا ۳ ساعت)
- **قالب خالی** در `scripts/module-template/`:
  - بک‌اند: `module.py` و یک اپ با `apps.py` (ثبت در `ready()`)، `models.py`، `urls.py`، `migrations/__init__.py` و `tests.py`.
  - فرانت: `module.ts`، `<code>.routes.ts`، `nav-items.ts` و یک صفحهٔ نمونه.
  - اسکریپت کوچک `scripts/new_module.py --code <code> --title-fa "..." [--root <مسیر مخزن>]` قالب را با نام تازه در `warehouse-backend/modules/<code>` و `warehouse-front/src/app/modules/<code>` کپی می‌کند و `installed-modules.ts` را با مولد به‌روز می‌کند. پیش‌فرض `--root` همین مخزن است.
- **حصار خودکار ماژول تازه:**
  - نگهبان ۲۹ بسته‌های ماژول‌ها را از `modules/*/*/__init__.py` کشف می‌کند. اگر در `.importlinter` نباشند، یک پیکربندی موقت در `scratch/` می‌سازد که لایهٔ ماژول و قرارداد استقلال هر دو ماژول را دارد.
  - نگهبان ۵۷ هم پوشه‌های ماژول را خودش کشف می‌کند.
  - پس ماژول تازه بدون ویرایش هسته حصار می‌گیرد.
- **راهنما:** `Documents/Modular_Middle_Path/guide_new_module.md` (فارسی و کوتاه) برای سازندهٔ بیرونی، شامل:
  - ساختار پوشه و فیلدهای قرارداد بک‌اند و فرانت.
  - جدول نقطه‌های توسعه و رویدادها.
  - قاعدهٔ وابستگی: فقط هسته؛ مایگریشن فقط به هسته وابسته باشد.
  - افزودن به `WH_MODULES` و `-AddModule`.
  - بررسی‌های لازم: نگهبان ۲۹ و ۵۷، `check` و `build:modules`.
- **ریسک: کم.**
- **راستی‌آزمایی:** با فرمان runner `verify_tools.py sample-module`. این فرمان در یک کپی `scratch/` از HEAD کار می‌کند و کپی را خودش می‌سازد و پاک می‌کند:
  - ماژول نمونهٔ `sample` با `new_module.py --root <کپی>` ساخته شود.
  - `check` با `WH_MODULES=sample` و با همهٔ ماژول‌ها.
  - `build:modules` با `WH_MODULES=sample`.
  - نگهبان ۲۹ و ۵۷ با PASS.
  - **diff کپی با HEAD فقط زیر `modules/sample` باشد** (اثبات «بدون دست زدن به هسته»).

## ۶. جمع زمان و ترتیب

| گام | زمان تقریبی | ریسک |
|---|---|---|
| پیش‌نیاز | ۱۰ دقیقه | خیلی کم |
| ۰-الف | ۳–۴ ساعت | متوسط |
| ۰-ب (دو نشست) | ۴ ساعت | متوسط |
| ۱ | ۲–۳ ساعت | کم تا متوسط |
| ۲ | ۳ ساعت | کم |
| ۳ | ۵ ساعت | متوسط |
| ۴ (دو نشست) | ۶–۸ ساعت | متوسط تا زیاد |
| ۵ | ۲–۳ ساعت | کم |
| **جمع** | **حدود ۲۵ تا ۳۰ ساعت، ۹ تا ۱۰ نشست صف** | |

ترتیب همین است. گام ۱ پس از ۰ می‌آید، چون گام ۰-الف `Get-BackendWhitelist` را عوض می‌کند و گام ۱ روی آن ساخته می‌شود.

## ۷. قواعد هر گام

- **Antigravity (هر نشست صف):**
  - فقط کار همان نشست را انجام می‌دهد و به `.agents/AGENTS.md` §۵ و §۱۰ پایبند است.
  - فقط فایل‌های خودش را stage می‌کند، با پیام داده‌شده کامیت می‌کند، push نمی‌کند و یادداشت کوتاهی در «گزارش پیشرفت» همین طرح می‌نویسد.
  - بیلد، نگهبان و `ng test` را خود runner اجرا می‌کند، نه ایجنت؛ جز فرمانی که متن نشست صریحاً به ایجنت می‌سپارد (مثل `--update-baseline` یا `manage.py check`).
- **runner:** `require` تمیزی درخت کاری را می‌سنجد. `verify` بررسی‌های هر گام را اجرا می‌کند و فقط اگر همه سبز باشند `[DONE]` می‌گذارد. اگر بررسی‌ای پس از دو دور اصلاح سبز نشود، صف می‌ایستد.
- **Claude (ناظر، پس از صف یا هر توقف آن):**
  - بازبین‌های مرتبط (`data-loss-reviewer`، `tenant-scope-reviewer`، `ui-reviewer`) روی diff هر گام اجرا می‌شوند و یافته‌های تأییدشده رفع می‌شوند.
  - بررسی صفحهٔ ورود روی 4300، release روی `app` (بی‌پرسش) و بررسی 200 برای `/` و `/api/public/config/`.
  - هر کاری روی `soft` فقط با تأیید صریح کاربر است.
  - در متن گام‌ها، «بازبین‌ها»، «release» و «4300» کار ناظرند.
- پایگاه‌دادهٔ تست postgres روی این ماشین در دسترس نیست. اگر تست بک‌اند اجرا نشد، صریحاً گزارش می‌شود. دروازهٔ قطعی بک‌اند `manage.py check` در سه پروفایل، `makemigrations --check --dry-run` و نگهبان ۲۹ است.

## ۸. بازبینی Antigravity (۲۳ مهر، چت `f2b8c66f`)

- **پذیرفته (با تأیید کاربر):**
  - ۲: یال‌های تولیدی عوض شده‌اند، نه فقط شمار.
  - ۳: نام فایل‌ها بدون `.component`.
  - ۴: مسیر پایتون. به‌جای فایل `.pth`، کمکی `backend_paths.py` به‌کار می‌رود، چون `.pth` روی venv سرور و پایتون سیستمیِ نگهبان‌ها کار نمی‌کند.
  - ۵: `Test-BundleStage` و `test_bundle.ps1`.
  - ۶: فهرست مسیرهای ثابت.
  - ۹: فهرست ماژول‌های استقرار از روی پوشه‌ها.
  - ۱۱: سطر `urls.py`.
  - ۱۲ و ۱۳: شکستن گام‌های ۰-ب و ۴.
  - ۱۴: سنجش عددهای نگهبان ۲۹ تا گام ۲.
  - ۱۵: خط‌های verify، با فرمان‌های `verify_tools.py` به‌جای فرمان‌های خطی.
- **رد شده (با تأیید کاربر):**
  - ۱: `warehouse-backend/docker-compose.yml` در git هست.
  - ۷: نام مستعار `@core/*` کار و تغییر اضافه می‌آورد، در حالی که اسکریپت مسیر نسبی را دقیق حساب می‌کند.
  - ۸: یکی کردن گام ۱ و ۴. اسکریپت کوچک گام ۱ استقرار جدا را زود می‌دهد، و `deploy.ps1` در گام ۴ دوباره عوض نمی‌شود.
  - ۱۰: `modules/__init__.py` خطر ثبت دوبارهٔ اپ‌ها را دارد (بخش گام ۳).
- **توافق روی صف `tasks.md` (چت `f8f6a31d`)، با تأیید کاربر:**
  - پذیرفته:
    - روشن بودن Docker پیش‌شرط صف است.
    - بررسی ایمپورت نشست ۶ با regex انجام می‌شود.
    - نشست ۲ مسیرهای ثابت پوشه‌های خودش را همان‌جا اصلاح و نگهبان‌هایش را اجرا می‌کند.
    - نشانگر بیلد در `test_bundle.ps1` به‌روز می‌شود.
    - بازگرداندن `installed-modules.ts` در `try/finally` است.
    - چک‌لیست نشست ۸ برای نشست ۹ نوشته می‌شود.
  - رد شده:
    - حذف `migrate-empty` از نشست ۱. این آزمون ارزان است و مایگریشن‌هایی را که با مسیر فایل کار می‌کنند می‌سنجد.
    - شل کردن کف عددهای نگهبان ۲۹ در نشست ۱. در یک جابه‌جایی خالص، برابری دقیق خودِ اثبات بی‌اثری است و کاهش ناگهانی نشانهٔ خطاست.

## ۹. پرسش‌های باز

- هیچ. ابهام تازه پیش از اجرای همان گام پرسیده می‌شود.

## گزارش پیشرفت

- **۲۳ مهر ۱۴۰۵ (2026-10-14):** طرح و چک‌لیست نوشته شد. اقدام بعدی: پس از تأیید کاربر، گام پیش‌نیاز و سپس گام ۰-الف.
- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Claude:**
  - طرح با بازبینی Antigravity نهایی شد (بخش `## ۸.`).
  - صف ۱۰ نشستی در `tasks.md` با Antigravity توافق شد.
  - فرمان‌های تازهٔ `verify_tools.py` روی HEAD آزموده شدند:
    - `django-check` و `migrations-unchanged` و `migrate-empty` در سه پروفایل سبز بودند.
    - `guardian29-max` در هر دو جهت درست کار کرد.
    - `dist-free` با نشانه‌های selector روی بیلدهای دو پروفایل درست کار کرد.
    - همهٔ `python -c`های verify زیر `cmd.exe` بی‌خطای نحوی اجرا شدند.
  - گام پیش‌نیاز انجام شد (کامیت جدای تغییرهای استقرار).
  - اقدام بعدی: اجرای صف (نشست ۱).
- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۱ (گام ۰-الف):**
  - **کارهای انجام‌شده:**
    - انتقال اپ‌ها با `git mv`: اپ‌های هسته (`accounts`، `common`، `companies`، `communications`، `notifications`، `reports`، `settings_core`، `platform_core`) به `warehouse-backend/core/`؛ اپ‌های انبار (`warehouses`، `inventory`) به `warehouse-backend/modules/warehouse/`؛ اپ مالی (`personnel`) به `warehouse-backend/modules/accounting/`.
    - پاکسازی پوشه‌های خالی قدیمی همنام اپ در ریشه بک‌اند؛ عدم ایجاد `__init__.py` در `modules/` و `modules/<x>/`.
    - ساخت `warehouse-backend/backend_paths.py` با `paths()` و `install()` و فراخوانی آن در `config/__init__.py`.
    - اصلاح مصرف‌کننده‌ها: نگهبان ۲۹ (تنظیم `PYTHONPATH` از `paths()`)، نگهبان‌های ۳۰، ۳۱، ۳۶، ۴۱، ۴۳، ۴۹ (به‌همراه مسیر `VIEWS_PY`)، ۵۰، ۵۳ (مسیر `settings_core/views.py`)، ۵۴، نگهبان‌های فاز ۱ تا ۵، `setup_e2e_data.py`، اسکریپت‌های داخل اپ‌ها (`accounts/concurrency_stress_test.py` و ۶ اسکریپت نگهبان در `personnel`)، `pyproject.toml` (`package-dir` و `where`)، کامنت بالای `.importlinter`، استثنای `backend_paths.py` در `.gitattributes`، `Get-BackendWhitelist` و `Test-BundleStage` در `deploy.ps1`، `scripts/deploy_tests/test_bundle.ps1` (بررسی برابری اپ‌های بسته با `INSTALLED_APPS` پروفایل کامل)، و مستندات ساختار در `CLAUDE.md` و اسکیل‌های `tenant-scope-reviewer`.
  - **انحراف‌ها:** هیچ. جابه‌جایی مکانیکی کاملاً منطبق بر طرح انجام شد بدون تغییر در `name` یا `label` یا ایجاد مایگریشن.
  - **فرمان‌های اجراشده توسط ایجنت و خلاصه خروجی:**
    - `python scripts/automation/verify_tools.py django-check` -> `[all] manage.py check -> exit 0` / `[warehouse] manage.py check -> exit 0` / `[accounting] manage.py check -> exit 0`
    - `python scripts/automation/verify_tools.py migrations-unchanged` -> `No changes detected` / `No model change needs a migration.`
    - `pwsh -NoProfile -File scripts/deploy_tests/test_bundle.ps1` -> `[PASS] bundle created ... [PASS] container gate script exit 0 [RESULT] failures=0`
  - **آنچه به runner و ناظر می‌ماند:**
    - runner: اجرای آزمون‌های خودکار گام ۰-الف (`django-check`، `migrations-unchanged`، `migrate-empty`، آزمون بسته‌بندی `test_bundle.ps1`، سنجش عددهای نگهبان ۲۹ با `guardian29-max`، آزمون تمیزی درخت و ایجاد کامیت).
    - ناظر (Claude): بازبین‌های `data-loss-reviewer` و `tenant-scope-reviewer`، بررسی استقرار روی `app` و فراخوانی `/` و `/api/public/config/`.

</div>

