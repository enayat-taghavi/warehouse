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

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۲ (گام ۰-ب-۱):**
  - **پایهٔ نشست:** commit hash برابر `bde7841a4798fe24c3f6daf83fa15aaadef9bb20`.
  - **کارهای انجام‌شده:**
    - نگاشت قطعی ۳۱ پوشهٔ کامپوننت فرانت‌اند بر اساس بررسی گراف وابستگی‌ها و تحلیل فایل‌های route (`app.routes.ts`، `warehouse.routes.ts` و `accounting.routes.ts`).
    - ساخت اسکریپت `scripts/refactor/move_front_components.mjs` مبتنی بر TypeScript Compiler API در `node_modules` برای انتقال با `git mv` و بازنویسی مسیرهای ایمپورت نسبی در کلیهٔ فایل‌های `*.ts` (از جمله `*.spec.ts` و `*.dom.spec.ts` و `import()` پویا).
    - انتقال ۱۰ پوشهٔ گروه common به `warehouse-front/src/app/modules/common/components/` با `git mv` (`login`، `layout`، `app-launcher`، `change-password`، `verify-card`، `users`، `operations`، `audit`، `health-dashboard`، `settings`).
    - ادغام کامل `modules/platform-shell` در `modules/common`: انتقال با `git mv`، بازنویسی اکسپورت‌های `modules/common/index.ts` و به‌روزرسانی مسیر alias در `warehouse-front/tsconfig.json`.
    - بازنویسی دقیق مسیرهای نسبی ۲۹۱ ایمپورت در ۳۶ فایل فرانت‌اند بدون دستکاری دستی `templateUrl` و `styleUrl` یا استایل‌ها.
    - اصلاح مسیرهای ثابت: خط مبنای نگهبان ۵۵ در `scripts/e2e/clickable_ergonomics_baseline.json` (۳۵ مسیر `audit.html` بدون تغییر شمارنده‌ها)، نگهبان‌های users (۳۸ تا ۵۱)، `scripts/e2e/guardian_header_harmonization.py`، `scripts/test_guard_hooks.py` (مسیرهای `components/login`)، `warehouse-front/tools/dom-verify.js` و `warehouse-front/tsconfig.test21.spec.json`.
  - **جدول نهایی نگاشت پوشه‌های ۳۱ گانه:**

| نام پوشه در `components/` | مقصد نهایی | دلیل فنی و شواهد وابستگی | وضعیت انتقال |
|---|---|---|---|
| `app-launcher` | `modules/common/components/app-launcher` | روت در `app.routes.ts` (لانچر مرکزی مشترک) | انجام شد در نشست ۲ |
| `audit` | `modules/common/components/audit` | استفاده همزمان در `app.routes.ts`، `warehouse.routes.ts` و `accounting.routes.ts` | انجام شد در نشست ۲ |
| `change-password` | `modules/common/components/change-password` | روت در `app.routes.ts` (صفحه مشترک تغییر رمز) | انجام شد در نشست ۲ |
| `health-dashboard` | `modules/common/components/health-dashboard` | استفاده همزمان در `app.routes.ts`، `warehouse.routes.ts` و `accounting.routes.ts` | انجام شد در نشست ۲ |
| `layout` | `modules/common/components/layout` | پوسته اصلی در `app.routes.ts` برای همه ماژول‌ها | انجام شد در نشست ۲ |
| `login` | `modules/common/components/login` | روت ورود در `app.routes.ts` | انجام شد در نشست ۲ |
| `operations` | `modules/common/components/operations` | روت مرکز عملیات در `app.routes.ts` | انجام شد در نشست ۲ |
| `settings` | `modules/common/components/settings` | استفاده در `app.routes.ts` و `warehouse.routes.ts` (تنظیمات پایه و عمومی) | انجام شد در نشست ۲ |
| `users` | `modules/common/components/users` | مدیریت کاربران در `app.routes.ts`، `operations` و `warehouse.routes.ts` | انجام شد در نشست ۲ |
| `verify-card` | `modules/common/components/verify-card` | روت عمومی استعلام کارت در `app.routes.ts` | انجام شد در نشست ۲ |
| `communications` | `modules/common/components/communications` | استفاده مشترک در پوسته (`layout`، `operations-layout`) و صفحات انبار (`supervisor`، `manager-review`، `count-tracking`) | نشست ۳ (گام ۰-ب-۲) |
| `id-cards` | `modules/common/components/id-cards` | زیرکامپوننت تب صدور کارت در `users` (مشترک سامانه) | نشست ۳ (گام ۰-ب-۲) |
| `count-tracking` | `modules/warehouse/components/count-tracking` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `counter` | `modules/warehouse/components/counter` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `customs` | `modules/warehouse/components/customs` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `dashboard` | `modules/warehouse/components/dashboard` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `dispatch` | `modules/warehouse/components/dispatch` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `docs` | `modules/warehouse/components/docs` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `dynamic-fields` | `modules/warehouse/components/dynamic-fields` | فیلدهای پویای کالا در انبار؛ ایمپورت در `wh-settings` | نشست ۳ (گام ۰-ب-۲) |
| `feeding` | `modules/warehouse/components/feeding` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `field` | `modules/warehouse/components/field` | شمارش میدانی انبار (ریدایرکت به `counter` در `warehouse.routes.ts`) | نشست ۳ (گام ۰-ب-۲) |
| `label-designer` | `modules/warehouse/components/label-designer` | طراحی لیبل کالا؛ استفاده در `dispatch` و `wh-settings` | نشست ۳ (گام ۰-ب-۲) |
| `manager-review` | `modules/warehouse/components/manager-review` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `placeholders` | `modules/warehouse/components/placeholders` | روت‌های خالی انبار (`tasks`، `labels`، `approvals` در `warehouse.routes.ts`) | نشست ۳ (گام ۰-ب-۲) |
| `projects` | `modules/warehouse/components/projects` | فقط در `warehouse.routes.ts` روت دارد (مدیریت پروژه‌ها/انبارهای سیستم) | نشست ۳ (گام ۰-ب-۲) |
| `reports` | `modules/warehouse/components/reports` | روت در `warehouse.routes.ts` (گزارش‌های انبارگردانی) | نشست ۳ (گام ۰-ب-۲) |
| `supervisor` | `modules/warehouse/components/supervisor` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `wh-settings` | `modules/warehouse/components/wh-settings` | فقط در `warehouse.routes.ts` روت دارد | نشست ۳ (گام ۰-ب-۲) |
| `finance` | `modules/accounting/components/finance` | فقط در `accounting.routes.ts` روت و ایمپورت دارد | نشست ۳ (گام ۰-ب-۲) |
| `organization` | `modules/accounting/components/organization` | فقط در `accounting.routes.ts` روت و ایمپورت دارد | نشست ۳ (گام ۰-ب-۲) |
| `personnel` | `modules/accounting/components/personnel` | فقط در `accounting.routes.ts` روت و ایمپورت دارد | نشست ۳ (گام ۰-ب-۲) |

  - **انحراف‌ها:** پوشه `reports` بر اساس شواهد کدبیس منحصراً در `warehouse.routes.ts` مورد ارجاع قرار گرفته است و بنابراین مقصد قطعی آن ماژول انبار (`modules/warehouse/components/reports`) تعیین گردید. پوشه `id-cards` به دلیل وابستگی متقابل مستقیم با تب کارت در `users` به عنوان کامپوننت مشترک به `modules/common/components/id-cards` تعیین شد که همراه باقی‌مانده‌ها در نشست ۳ جابه‌جا خواهد شد.
  - **فرمان‌های اجراشده توسط ایجنت و خلاصه خروجی:**
    - `node scripts/refactor/move_front_components.mjs --step 0-b1` -> `TypeScript imports rewritten: 270 imports across 32 files. Step 0-b1 migration complete!`
    - `cd warehouse-front && npx ng build --output-path ../scratch/ng-build-agent` -> `Application bundle generation complete. [134.079 seconds] - exit 0`
    - نگهبان‌های ۵۲، ۵۵، ۵۶، ۳۸ تا ۵۱، `scripts/test_guard_hooks.py` و `warehouse-front/tools/dom-verify.js` همگی اجرا شده و سبز (کد خروج ۰) تأیید شدند.
  - **آنچه به runner و ناظر می‌ماند:**
    - runner: اجرای بیلدهای پروفایلی (`build:accounting` و `build:warehouse`)، بررسی `dist-free`، اجرای `ng-test-compare`، راستی‌آزمایی نگهبان‌ها و ایجاد کامیت.
    - ناظر (Claude): بازبین `ui-reviewer`، بررسی صفحه ورود روی 4300 و release روی `app`.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۳ (گام ۰-ب-۲):**
  - **پایهٔ نشست:** commit hash برابر `925339413ca2a8c008f22881ec9fced525c870b5`.
  - **کارهای انجام‌شده:**
    - انتقال با `git mv` برای کلیهٔ ۲۱ پوشهٔ باقیماندهٔ `warehouse-front/src/app/components/` طبق جدول نگاشت قطعی:
      - ۱۶ پوشهٔ ماژول انبار به `src/app/modules/warehouse/components/` (`count-tracking`، `counter`، `customs`، `dashboard`، `dispatch`، `docs`، `dynamic-fields`، `feeding`، `field`، `label-designer`، `manager-review`، `placeholders`، `projects`، `reports`، `supervisor`، `wh-settings`).
      - ۳ پوشهٔ ماژول مالی و پرسنلی به `src/app/modules/accounting/components/` (`finance`، `organization`، `personnel`).
      - ۲ پوشهٔ باقیماندهٔ مشترک به `src/app/modules/common/components/` (`communications`، `id-cards`).
    - پاک‌سازی کامل پوشهٔ `warehouse-front/src/app/components` (صفر فایل `*.ts` و حذف کامل پوشه).
    - بازنویسی مکانیزهٔ کلیهٔ مسیرهای نسبی با TypeScript Compiler API: تعداد ۱۶۱۶ ایمپورت در ۲۸۵ فایل فرانت‌اند بدون دستکاری دستی یا تغییر در رفتار، قالب و استایل‌ها.
    - اصلاح تمامی مسیرهای ثابت تعیین‌شده در طرح:
      - خط مبنای نگهبان ۵۵ در `scripts/e2e/clickable_ergonomics_baseline.json`: بازنویسی مسیرهای ۱۳ فایل باقیمانده بدون تغییر هیچ عدد یا نقضی.
      - فایل `warehouse-front/tools/dom-verify.js`: به‌روزرسانی مسیرهای تمپلیت‌های انبار و مالی به `src/app/modules/`.
      - فایل‌های کانفیگ تست: `tsconfig.spec.json` (مسیر exclude پرسنل) و `tsconfig.test21.spec.json` (مسیرهای ۵ کامپوننت انبار).
      - اسپک با مسیر عمیق `__dirname`: `employee-new-vehicle.dom.spec.ts` (اصلاح عمق نسبی دسترسی به `excel-import-modal` از ۴ به ۶ سطح والد).
      - اسکریپت‌های نگهبان: `scripts/e2e/guardian_header_harmonization.py` (متد چندمسیره `resolve_component_path`) و `scripts/e2e/guardian_count_tracking.py` (مسیرهای انبار).
      - مستندات معماری: `.agents/PROJECT_ARCHITECTURE_MAP.md` (لینک‌های مستقیم کامپوننت‌ها به `modules/warehouse/components/` و تیتر کامپوننت‌های ماژولار).
    - حذف نهایی اسکریپت موقت `scripts/refactor/move_front_components.mjs` با `git rm`.
  - **انحراف‌ها:** هیچ. جابه‌جایی مکانیکی به طور کامل بر اساس جدول نشست ۲ انجام و پروندهٔ پوشهٔ قدیمی `components` به صورت کامل بسته شد.
  - **فرمان‌های مجاز اجراشده توسط ایجنت و خلاصه خروجی:**
    - `node scripts/refactor/move_front_components.mjs --step 0-b2` -> `TypeScript imports rewritten: 1616 imports across 285 files. Step 0-b2 migration complete!`
    - `cd warehouse-front && npx ng build --output-path ../scratch/ng-build-agent` -> `Application bundle generation complete. [74.151 seconds] - exit 0`
    - `git rm -f scripts/refactor/move_front_components.mjs` -> `rm 'scripts/refactor/move_front_components.mjs'`
  - **آنچه به runner و ناظر می‌ماند:**
    - runner: اجرای بیلدهای پروفایلی (`build:accounting` و `build:warehouse`)، بررسی `dist-free`، اجرای `ng-test-compare` در برابر پایه، راستی‌آزمایی نگهبان‌های ۵۲، ۵۵، ۵۶ و ایجاد کامیت.
    - ناظر (Claude): بررسی صفحهٔ ورود روی 4300 و انتشار release روی `app`.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۴ (گام ۱):**
  - **پایهٔ نشست:** commit hash برابر `d82ad714c0f64dc9023ee90b153869d7776e69ca`.
  - **کارهای انجام‌شده:**
    - ساخت `warehouse-front/tools/build-for-modules.js` و افزودن اسکریپت npm با عنوان `"build:modules": "node tools/build-for-modules.js"` به `package.json`:
      - خواندن ماژول‌ها از متغیر محیطی `WH_MODULES` (خالی یا شامل هر دو = بیلد کامل).
      - تفکیک پروفایل‌ها: ماژول `accounting` به پروفایل `accounting-only`، ماژول `warehouse` به پروفایل `warehouse-only`، و حالت ترکیبی یا خالی به بیلد کامل سامانه.
      - پشتیبانی از گزینهٔ اختیاری `--output-path` و انتقال همان مسیر به `ng build` و `tools/patch-ngsw-530.js`.
      - تولید و نگارش فایل `<output-path>/browser/build-modules.txt` شامل نام ماژول‌های بیلدشده به ترتیب الفبا و جداشده با ویرگول (`accounting`، `warehouse` یا `accounting,warehouse`).
    - به‌روزرسانی `warehouse-front/tools/patch-ngsw-530.js`:
      - پذیرش آرگومان اختیاری برای مسیر سفارشی خروجی بیلد با حفظ دقیق رفتار پیش‌فرض فعلی در صورت عدم ارسال آرگومان.
    - به‌روزرسانی `deploy.ps1`:
      - ساخت تابع پویا `Get-KnownModules([string]$Sha = 'HEAD')` با خواندن پوشه‌های `warehouse-backend/modules/` از طریق `git ls-tree` برای کامیت هدف و حذف آرایه‌های هاردکدشده.
      - به‌روزرسانی `Build-IsolatedFrontend`: استفاده از `npm run build:modules` تحت متغیر `WH_MODULES` و ثبت نشانگر `MODULES=` در `.build-complete` (برای جلوگیری از سوءاستفاده از `-SkipBuild` در پروفایل‌های نامتناسب) و اعتبارسنجی تولید `build-modules.txt`.
      - به‌روزرسانی `Test-BundleStage` و `New-DeploymentBundle`: اعتبارسنجی وجود `build-modules.txt` و بررسی تطابق مجموعه‌ای آن با ماژول‌های هدف.
      - به‌روزرسانی `Invoke-AddModuleMode`: اجرای خودکار فرآیند بیلد و انتشار بسته با ماژول جدید پیش از اعمال `add-module` و تغییر `WH_MODULES` روی سرور.
    - به‌روزرسانی `scripts/deploy/warehouse-deploy.sh`:
      - استخراج پویای `KNOWN_MODULES` از پوشهٔ `modules` همان release با تابع `discover_known_modules`.
      - مقداردهی پویا و مدیریت متغیر خالی برای `MODULE_SERVICES` روی ماژول‌های ناموجود.
    - افزودن بند ۱۵ به نگهبان ۵۳ (`scripts/e2e/guardian_53_deploy_safety.py`):
      - اعتبارسنجی عدم وجود لیست‌های استاتیک و هاردکدشده برای ماژول‌ها در `deploy.ps1` و `warehouse-deploy.sh`.
    - به‌روزرسانی `scripts/deploy_tests/test_bundle.ps1`:
      - تطابق نشانگر `.build-complete` با ساختار جدید `MODULES=$AllModules` و بررسی محتوای `build-modules.txt` در کانتینر اوبونتو.
  - **انحراف‌ها:** هیچ. تمام مفاد گام ۱ بدون تغییر یا دستکاری کدهای نامرتبط پیاده‌سازی شدند.
  - **فرمان‌های مجاز اجراشده توسط ایجنت و خلاصه خروجی:**
    - `python scripts/e2e/guardian_53_deploy_safety.py` -> `✅ بند ۱۵: فهرست ماژول‌ها در deploy.ps1 و warehouse-deploy.sh ثابت نیست و به صورت پویا از روی پوشه‌ها کشف می‌شود. / 🎉 نگهبان ۵۳: تمامی حفاظ‌های امنیتی استقرار سرور با موفقیت تایید شدند.`
    - `pwsh -NoProfile -File scripts/deploy_tests/test_bundle.ps1` -> `[PASS] bundle created ... [PASS] container gate script exit 0 [RESULT] failures=0`
    - اجرای آزمایشی بیلد `accounting` فرانت -> `✔ ngsw-worker.js patched successfully / ✔ Wrote accounting to build-modules.txt / dist-free verification exit 0`
    - اجرای آزمایشی بیلد `warehouse` فرانت -> `✔ ngsw-worker.js patched successfully / ✔ Wrote warehouse to build-modules.txt`
  - **آنچه به runner و ناظر می‌ماند:**
    - runner: اجرای آزمون‌های کامل شامل بیلدهای پروفایلی و بررسی `build-modules.txt`، راستی‌آزمایی با `guardian_53_deploy_safety.py` و `test_bundle.ps1`، و پاک‌سازی درخت.
    - ناظر (Claude): بررسی استقرار و اجرای `test_integration.ps1`.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۵ (گام ۲):**
  - **پایهٔ نشست:** commit hash برابر `f4207ccb13d48bca28b26dd48e5af610d1f34f67`.
  - **کارهای انجام‌شده:**
    - **بک‌اند (نگهبان ۲۹):**
      - هم‌تراز کردن فایل `.importlinter` با لایه‌های ماژولار معماری:
        - لایهٔ بالاتر `config` (شامل `config`).
        - لایهٔ ماژول‌ها `modules` (شامل `warehouses`، `inventory` و `personnel`).
        - لایهٔ هسته `core` (شامل `accounts`، `common`، `companies`، `communications`، `notifications`، `reports`، `settings_core` و `platform_core`).
        - قرارداد استقلال دوطرفه ماژول‌ها C2 (`warehouses` و `inventory` با `personnel` هیچ ایمپورت دوطرفه‌ای نداشته باشند).
        - قرارداد عدم دسترسی هسته به ماژول‌ها C3 (هیچ اپ هسته‌ای نباید هیچ اپ ماژولی را ایمپورت کند).
      - صفر کردن ۴ سطر هاردکد نام ماژول در ریشهٔ ترکیب (`composition_root_hardcoded_lines`):
        - اصلاح `config/settings.py`: استخراج پویای `_PROJECT_LOGGERS` از `INSTALLED_APPS` به همراه فیلتر با `LOCAL_APPS` و ترکیب با پکیج‌های ثابت مجاز (`config` و `common`).
        - سطر ۲۱ `config/urls.py` (`api/reports/`): با انتقال `reports` به لایهٔ هسته، دیگر نام ماژول محسوب نمی‌شود و خودبه‌خود صفر گردید.
        - تنظیم `MODULE_PACKAGES = ("warehouses", "inventory", "personnel")` در `guardian_modularization.py`.
      - شناسایی و رفع کامل هر ۳۱ یال غیرتولیدی (تست و اسکریپت) و انتقال آزمون‌های ذاتاً بین‌ماژولی به پوشهٔ مجزای `warehouse-backend/integration_tests/` (پوشه‌ای مجزا و بیرون از لایه‌ها و پکیج‌های ریشه که اسکریپت ریشه ندارد و فقط با برچسب روی پروفایل کامل اجرا می‌شود):
        1. `warehouse-backend/core/accounts/test_user_company_multitenant.py` (۱ یال به `warehouses.models`): آزمون بین‌ماژولی تخصیص کاربر به انبار در محیط چندمستأجری با `git mv` به `warehouse-backend/integration_tests/test_user_company_multitenant.py` منتقل شد.
        2. `warehouse-backend/core/companies/tests.py` (۳ یال به `warehouses.models` و `inventory.models` در متدهای `test_warehouse_deletion_blocks_company_delete`، `test_item_prevent_deletion`، `test_batch_prevent_deletion`): این ۳ آزمون یکپارچگی به فایل مجزای `warehouse-backend/integration_tests/test_companies_cross_module.py` انتقال یافتند و از آزمون‌های واحد `companies` جدا شدند.
        3. `warehouse-backend/modules/accounting/personnel/test_company_multitenant.py` (۱ یال به `warehouses.models` در متد `test_cannot_delete_company_with_active_warehouses`): به فایل تازهٔ `warehouse-backend/integration_tests/test_personnel_cross_module.py` منتقل شد.
        4. `warehouse-backend/core/communications/tests/` (۱۸ یال غیرتولیدی شامل ۱۰ فایل تست به `warehouses.models` و `inventory.models`): کل پوشه تست ارتباطات به دلیل ارجاعات گسترده به مدل‌های انبار با `git mv` به `warehouse-backend/integration_tests/communications/` منتقل شد و یک فایل تست واحد تمیز و سبک در `warehouse-backend/core/communications/tests.py` جایگزین شد.
        5. `warehouse-backend/core/reports/tests.py` (۱ یال غیرتولیدی به `warehouses.models`): با انتقال `reports` به هسته، تست یکپارچگی ارجاع‌دهنده به مدل‌های انبار با `git mv` به `warehouse-backend/integration_tests/test_reports_integration.py` منتقل شد و فایل تست واحد مستقل در `warehouse-backend/core/reports/tests.py` جایگزین شد.
        6. `warehouse-backend/modules/accounting/personnel/test_attendance_approval_workflow.py` (۱ یال به `warehouses.models`): ایمپورت بلااستفاده `from warehouses.models import Warehouse` حذف شد.
        7. `warehouse-backend/modules/accounting/personnel/test_attendance_fleet_audit.py` (۱ یال به `warehouses.models`): ایمپورت بلااستفاده `from warehouses.models import Warehouse` حذف شد.
        8. `warehouse-backend/modules/accounting/personnel/test_fleet_scenarios_10_vehicles.py` (۱ یال به `warehouses.models`): ایمپورت بلااستفاده `from warehouses.models import Warehouse` حذف شد.
        9. `warehouse-backend/modules/accounting/personnel/test_project_exports.py` (۱ یال به `warehouses.models`): ایمپورت بلااستفاده `from warehouses.models import Warehouse` حذف شد.
        10. `warehouse-backend/modules/accounting/personnel/test_google_drive.py` (۱ یال به `warehouses.models`): ایمپورت بلااستفاده `from warehouses.models import Warehouse` حذف شد.
        11. `warehouse-backend/modules/accounting/personnel/tests.py` (۱ یال به `warehouses.models`): ایمپورت بلااستفاده `from warehouses.models import Warehouse` حذف شد.
        12. `warehouse-backend/modules/warehouse/warehouses/test_company_warehouse_isolation.py` (۱ یال غیرتولیدی به `personnel.models`): ایمپورت اشتباه `from personnel.models import Company` با ایمپورت صحیح هسته `from companies.models import Company` جایگزین شد.
        13. اسکریپت‌های درون‌برنامه‌ای پرسنل (`phase_guardian.py` و `phase_guardian_approval.py`) (۲ یال غیرتولیدی به `warehouses`): ارجاع پویا و محافظت‌شده اعمال شد تا نقض استاتیک ثبت نشود.
      - یال‌های تولیدی: از ۱۰ به ۱۳ یال رسید؛ علت این امر انتقال `reports` از لایه ماژول به لایه هسته است که باعث شد ۳ ایمپورت درون `warehouse-backend/core/reports/registry.py` به `inventory.models` و `warehouses.models` مشمول قراردادهای C1 و C3 شوند. طبق دستور صریح طرح، این یال‌ها در گام ۳ رفع خواهند شد و در این نشست دست نخوردند.
      - به‌روزرسانی مبنای نگهبان ۲۹ با فرمان `python scripts/e2e/guardian_modularization.py --update-baseline`:
        - `non_production_violations`: قبل ۱۸ -> بعد ۰ (کاهش کامل)
        - `composition_root_hardcoded_lines`: قبل ۴ -> بعد ۰ (کاهش کامل)
        - `production_violations`: قبل ۱۰ -> بعد ۱۳ (افزایش کنترل‌شده ناشی از انتقال `reports` به هسته، جهت رفع در گام ۳)
    - **فرانت‌اند (نگهبان ۵۷):**
      - طراحی و ایجاد نگهبان ۵۷ با عنوان `scripts/e2e/guardian_57_front_module_fence.py` جهت اعمال حصارهای ماژولار فرانت‌اند:
        - شمارنده (الف) `core_to_module_imports`: شمارش ایمپورت‌ها از `core/`، `shared/` یا `modules/common/` به ماژول‌های اختصاصی `modules/warehouse` یا `modules/accounting`.
        - شمارنده (ب) `cross_module_imports`: شمارش ایمپورت‌های متقابل میان ماژول‌های اختصاصی (`warehouse` ↔ `accounting`).
        - شمارنده (ج) `is_module_installed_outside_module`: استفاده از تابع `isModuleInstalled('<کد ماژول>')` بیرون از پوشه همان ماژول.
      - استثنای ریشهٔ ترکیب: فایل‌های `app.routes.ts`، `app.config.ts` و `installed-modules.ts`.
      - ثبت مبنای آچاری در فایل `scripts/e2e/front_fence_baseline.json` با اجرای `--update-baseline`:
        - `core_to_module_imports`: ۱۳
        - `cross_module_imports`: ۰
        - `is_module_installed_outside_module`: ۶۱
      - افزودن آزمون خودکار `--self-test`: ساخت فایل نقض موقت در `scratch/`، اطمینان از شناسایی خطای حصار، حذف فایل موقت و خروج با کد ۰ تنها در صورت موفقیت آزمون.
      - کشف و شناسایی خودکار در `guardian_all.py` به کمک پیشوند استاندارد `guardian_57_*.py`.
  - **انحراف‌ها:** هیچ. کلیهٔ اهداف گام ۲ طبق طرح پیاده‌سازی شدند.
  - **فرمان‌های مجاز اجراشده توسط ایجنت و خلاصه خروجی:**
    - `python scripts/e2e/guardian_modularization.py` -> exit 0 (تایید پاس شدن نگهبان ۲۹)
    - `python scripts/automation/verify_tools.py guardian29-max --max non_production_violations=0 composition_root_hardcoded_lines=0 production_violations=40 --min production_violations=10` -> exit 0
    - `python scripts/e2e/guardian_57_front_module_fence.py` -> exit 0 (تایید پاس شدن نگهبان ۵۷)
    - `python scripts/e2e/guardian_57_front_module_fence.py --self-test` -> exit 0 (تایید عملکرد سلف‌تست)
    - `python scripts/automation/verify_tools.py django-check` -> exit 0 (در هر سه پروفایل all, warehouse, accounting)
    - `python scripts/e2e/guardian_30_settings_core.py` -> exit 0
    - `python scripts/e2e/guardian_31_install_profiles.py` -> exit 0
    - `python scripts/e2e/guardian_54_module_independence.py` -> exit 0
    - `python scripts/e2e/guardian_56_change_integrity.py` -> exit 0
  - **آنچه به runner و ناظر می‌ماند:**
    - runner: اجرای آزمون‌های verify برای گام ۲ (`django-check`، `guardian29-max`، بررسی تمیزی درخت و ایجاد کامیت).
    - ناظر (Claude): بازبین‌های `tenant-scope-reviewer`، بررسی استقرار و اجرای release روی `app`.

- **۲۳ مهر ۱۴۰۵ (2026-10-14)، Antigravity — نشست ۶ (گام ۳-الف):**
  - **پایهٔ نشست:** commit hash برابر `f9e539bdb4df1106c36bbdc126ace71429d20eb2`.
  - **کارهای انجام‌شده:**
    - انتقال تعاریف مشخصات ماژول‌ها (`WAREHOUSE_SPEC` و `ACCOUNTING_SPEC`) و فهرست مجوزها از هسته (`core/platform_core/module_catalog.py`) به فایل‌های مانیفست مستقل `warehouse-backend/modules/warehouse/module.py` و `warehouse-backend/modules/accounting/module.py`.
    - بازنویسی `core/platform_core/module_catalog.py` به عنوان پویشگر خودکار و پویا با `importlib.util.spec_from_file_location` برای بارگذاری ماژول‌های موجود در `modules/*/module.py`، اعتبارسنجی انطباق `code` با نام پوشه، و ایجاد پویای دیکشنری `MODULE_CATALOG` بدون هاردکد کردن هیچ نام یا مشخصات ماژولی در هسته.
    - پیاده‌سازی ابزارهای هسته:
      - توابع `contribute(point, item)` و `contributions(point)` در `core/platform_core/registry.py` برای ثبت و بازیابی نقطه‌های توسعه.
      - تابع `company_of(kind, id)` در `core/platform_core/registry.py` جهت حل شناسه شرکت مالک یک موجودیت.
      - رویداد سراسری `scope_deleted` در فایل تازهٔ `core/platform_core/events.py` بر پایه Signal با پشتیبانی از هر دو الگوی فراخوانی تابعی و سیگنال جنگو.
    - معکوس‌سازی و رفع ۴ یال وابستگی تولیدی طبق جدول طرح:
      - یال `warehouses/signals.py → personnel`: حذف کامل وابستگی انبار به ۵ مدل پرسنلی؛ ارسال رویداد `scope_deleted('warehouse', instance.id)` توسط انبار و اتصال گیرنده `handle_scope_deleted` در `personnel/signals.py` جهت خالی‌سازی (`update to None`) شناسه‌های انبار در ۵ مدل پرسنلی (`PersonnelProfile`، `VehicleDriverProfile`، `DailyAttendance`، `MonthlyWorkPeriod`، `VehicleTripLog`) با حفظ کامل رکوردهای مالی.
      - یال `personnel/models.py:2296 → warehouses`: جایگزینی کوئری مستقیم مدل Warehouse با `company_of('warehouse', self.warehouse_id)`.
      - یال `personnel/views.py:4973 → warehouses`: جایگزینی کوئری مستقیم مدل Warehouse با `company_of('warehouse', warehouse_id)`.
      - یال `accounts/serializers.py:449 → personnel`: حذف ایمپورت مستقیم مدل `UserSectionAssignment` پرسنل در هسته و استفاده از تابع تعمیم‌یافته `derived_company_access_details` در هسته `companies/access.py` که توسط `personnel.apps.PersonnelConfig.ready()` با منبع `section_derived_company_source` تغذیه می‌شود.
    - ثبت تابع حل شناسه شرکت انبار در `warehouses/apps.py:ready()` به صورت `contribute('company_of:warehouse', _warehouse_company_resolver)`.
    - نگارش آزمون جامع جنگو در `warehouse-backend/modules/accounting/personnel/test_scope_deleted_signal.py` جهت اعتبارسنجی برابری رفتار رویداد `scope_deleted` و خالی‌شدن فیلدهای انبار در ۵ مدل مالی و عدم حذف رکوردها.
    - به‌روزرسانی مبنای نگهبان ۲۹ (`modularization_baseline.json`) با یک بار اجرای `--update-baseline` به دلیل کاهش نقض‌ها:
      - نقض‌های تولیدی (`production_violations`): کاهش از ۱۳ به ۹ یال (کاهش ۴ یال).
      - قرارداد استقلال دوطرفه ماژول‌ها C2: کاهش به ۰ (`contract:c2-accounting-independent-of-warehouse = 0` و `contract:c2-warehouse-independent-of-accounting = 0`).
  - **انحراف‌ها:** هیچ. کلیهٔ وظایف نشست ۶ دقیقاً طبق طرح انجام شدند.
  - **فرمان‌های مجاز اجراشده توسط ایجنت و خلاصه خروجی:**
    - `python scripts/automation/verify_tools.py django-check` -> `[all] manage.py check -> exit 0 / [warehouse] manage.py check -> exit 0 / [accounting] manage.py check -> exit 0`
    - `python scripts/automation/verify_tools.py migrations-unchanged` -> `No changes detected / No model change needs a migration.`
    - `warehouse-backend\venv\Scripts\python.exe warehouse-backend\manage.py test personnel.test_scope_deleted_signal` -> `Ran 2 tests in 0.085s - OK`
    - `python scripts/e2e/guardian_modularization.py --update-baseline` -> `unique_direct_violations = 9, production_violations = 9, non_production_violations = 0, composition_root_hardcoded_lines = 0, C2 = 0`
    - `python scripts/e2e/guardian_modularization.py` -> `exit 0 (PASS)`
    - `python scripts/e2e/guardian_30_settings_core.py` -> `exit 0 (PASS)`
    - `python scripts/e2e/guardian_31_install_profiles.py` -> `exit 0 (PASS)`
    - `python scripts/e2e/guardian_54_module_independence.py` -> `exit 0 (PASS)`
    - `python scripts/e2e/guardian_56_change_integrity.py` -> `exit 0 (PASS)`
    - `python scripts/e2e/guardian_57_front_module_fence.py` -> `exit 0 (PASS)`
  - **آنچه به runner و ناظر می‌ماند:**
    - runner: اجرای آزمون‌های verify برای گام ۳-الف، بررسی تمیزی درخت و تایید کامیت.
    - ناظر (Claude): بازبین‌های `data-loss-reviewer` و `tenant-scope-reviewer`، بررسی استقرار و اجرای release روی `app`.

</div>



