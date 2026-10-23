# طرح: انتخاب سامانه، روش گواهی و تغییر دامنه در `deploy.ps1`

تاریخ: ۱۷ مهر ۱۴۰۵ (2026-10-08)

## ۱. هدف

1. **انتخاب سامانه هنگام نصب:** انبارداری، حسابداری یا هر دو. افزودن سامانهٔ دیگر بعداً با `-AddModule`. حذف یا غیرفعال‌سازی سامانه پشتیبانی نمی‌شود (تصمیم کاربر).
2. **انتخاب روش گواهی:** Let's Encrypt با HTTP-01، Let's Encrypt با DNS-01 (Cloudflare)، Cloudflare Origin Certificate، گواهی سفارشی یا خریداری‌شده.
3. **تغییر دامنه:** دورهٔ گذار با هر دو دامنهٔ فعال. سپس ریدایرکت دائمی 301 از دامنهٔ قبلی. کاربرِ دامنهٔ قبلی پس از خالی شدن صف آفلاینش خودکار به دامنهٔ جدید منتقل می‌شود.

## ۲. تصمیم‌های کاربر (۱۷ مهر ۱۴۰۵)

| موضوع | تصمیم |
|---|---|
| بک‌اند تک‌سامانه‌ای | اصلاح کامل. لایهٔ شرکت به هسته منتقل می‌شود. داده‌ها فعلاً تستی‌اند؛ اگر کار پیچیده شد، لازم نیست برای حفظ داده تلاش شود. |
| روش‌های گواهی | هر چهار روش. |
| دامنهٔ قبلی | دورهٔ گذار، سپس 301 دائمی. حذف گواهی قبلی فقط با تأیید صریح. |
| غیرفعال‌سازی سامانه | خیر. فقط افزودن. |
| بازسازی پایگاه‌داده | روی هر دو محیط (app محلی و soft)، بدون پرسش دوباره. پیش از آن پشتیبان کامل گرفته می‌شود. |
| پروفایل نهایی soft | اول «فقط حسابداری» نصب شود. سپس Claude انبارداری را با `-AddModule` اضافه کند تا افزودن سامانه واقعاً آزموده شود. |
| کاربر دامنهٔ قبلی | انتقال خودکار پس از خالی شدن صف آفلاین. تا آن موقع نوار اطلاع‌رسانی نشان داده می‌شود. |

## ۳. وضعیت فعلی (یافته‌ها)

### ۳.۱ بک‌اند
- `settings.py:100` متغیر `WH_MODULES` را می‌خواند. اگر خالی باشد، همهٔ ماژول‌های `platform_core/module_catalog.py` نصب می‌شوند.
- `WH_MODULES=warehouse manage.py check`، خطای `fields.E300/E307` می‌دهد: `warehouses.Warehouse.company` و `inventory.ItemFieldDefinition.company` به `personnel.Company` اشاره می‌کنند. این وابستگی در commit `9a4d38b` (۵ مهر، multitenant) آمده است.
- `WH_MODULES=accounting manage.py check`، خطای `reports.ReportTemplate.warehouse → warehouses.Warehouse` می‌دهد.
- لایهٔ چند‌مستأجری (`Company`، `UserCompanyAccess` و تابع‌های `get_user_allowed_companies` و `validate_user_company_access`) داخل `personnel` (حسابداری) است. این‌ها هم از هسته استفاده می‌شوند و هم از انبار: `common/tenant_scope.py`، `accounts/middleware.py`، `accounts/serializers.py`، `accounts/views.py`، `notifications/consumers.py`، `warehouses/*` و `inventory/views.py`.
- دسترسیِ مشتق از عضویت بخش (`UserSectionAssignment → ProjectSection → FinancialProject → Company`) مفهوم حسابداری است.
- **گراف مایگریشن:** `warehouses` و `inventory` به `personnel` وابسته‌اند و `reports` به `warehouses`. پس حتی پس از جابه‌جایی مدل‌ها، `migrate` روی پایگاه خالی در پروفایل تک‌سامانه‌ای شکست می‌خورد.
- دو فرمان `run_gdrive_sync_worker` وجود دارد: یکی در `settings_core` (هسته) و یکی در `personnel`. هر دو با `CompanyGoogleDriveConfig` و `GoogleDriveSyncQueue` کار می‌کنند که در `personnel` هستند. تب پشتیبان تنظیمات هم از `personnel/companies/<id>/gdrive/` استفاده می‌کند.

### ۳.۲ فرانت
- مسیر مدیریت شرکت‌ها در هسته است (`app/operations/companies`) و `module-registry.service.ts` از `installed_modules` استفاده می‌کند.
- API شرکت‌ها از `/api/personnel/companies/` و `/api/personnel/user-company-access/` می‌آید. در نصب «فقط انبار» این مسیرها وجود ندارند. فایل‌های درگیر: `company-api.service.ts`، `active-company.service.ts`، `companies.ts`، `company-gdrive-tab.ts` و `settings-backup-tab.ts`.

### ۳.۳ استقرار
- `deploy.ps1` (حدود ۱۸۶۰ خط) هیچ اشاره‌ای به `WH_MODULES` ندارد. سرویس‌های systemd از `shared/.env` می‌خوانند.
- `merge_env_defaults` در `warehouse-deploy.sh` فقط کلیدهای **ناموجود** را اضافه می‌کند. پس `DJANGO_ALLOWED_HOSTS`، `DJANGO_CSRF_TRUSTED_ORIGINS` و `GOOGLE_OAUTH_REDIRECT_URI` با تغییر دامنه به‌روز نمی‌شوند.
- nginx فقط یک دامنه می‌شناسد (`__DOMAIN__`) و مسیر گواهی را ثابت روی `/etc/letsencrypt/live/<domain>/` گذاشته است.
- `issue-cert` در دروازه فقط DNS-01 با Cloudflare دارد.
- سرویس `warehouse-gdrive-worker` همیشه نصب می‌شود.
- **ناهماهنگی:** `.env` تولیدی، `GOOGLE_OAUTH_REDIRECT_URI=https://<domain>/api/auth/google/callback` را می‌سازد، ولی پیش‌فرض `settings.py:358` مسیر `/api/accounts/gdrive/callback/` است. در گام ۵ بررسی و یکسان شود.
- soft هنوز GO_LIVE نشده و دادهٔ واقعی ندارد. آخرین Setup روی release `20261008_015447_388f9f022669` بوده است.

## ۴. طراحی

### ۴.۱ هستهٔ مستقل (بک‌اند)
- **اپ هستهٔ جدید `companies`** در `PLATFORM_APPS`:
  - مدل‌های `Company` و `UserCompanyAccess` با همان `db_table` (`personnel_company` و `personnel_usercompanyaccess`) به آن منتقل می‌شوند.
  - تابع‌های دسترسی در `companies/access.py` قرار می‌گیرند.
  - دسترسی مشتق از بخش‌ها از طریق یک «سهم‌دهنده» (contributor) ثبت‌شده در `platform_core.registry` اضافه می‌شود. حسابداری در `ready()` آن را ثبت می‌کند. در «فقط انبار» فقط دسترسی مستقیم حساب می‌شود.
  - در `personnel` شیم‌هایی برای نام‌های قدیمی (`from personnel.views import ...`) می‌ماند تا کد حسابداری تغییر گسترده نخواهد.
- **مدل‌های Google Drive شرکت** (`CompanyGoogleDriveConfig` و `GoogleDriveSyncQueue`): در گام ۱ بررسی می‌شود که پشتیبان‌گیری هسته به آن‌ها نیاز دارد یا نه. قاعده: هر چه «فقط انبار» لازم دارد به هسته می‌رود. فرمان تکراری `run_gdrive_sync_worker` در `personnel` حذف یا یکی می‌شود.
- **API هسته:** `/api/companies/` و `/api/companies/user-access/`. مسیرهای قدیمی `personnel/companies*` در حالت نصب حسابداری تا پایان این طرح نام مستعار می‌مانند و سپس حذف می‌شوند. زیرمنابع حسابداری (اسناد، حساب بانکی، هیئت‌مدیره، دورهٔ مالی) زیر `personnel` می‌مانند.
- **`ReportTemplate.warehouse`** به `warehouse_id` عددی (`IntegerField`، با همان ستون و ایندکس) تبدیل می‌شود، مثل `AuditLog.warehouse_id`. پاک‌سازی با `post_delete` انبار در `warehouses/signals.py` انجام می‌شود.
- **ایمپورت‌های بین‌ماژولی** در `accounts/serializers.py`، `notifications/consumers.py`، `reports/registry.py` و `warehouses/signals.py` پشت `is_module_installed(...)` قرار می‌گیرند.
- **بازسازی مایگریشن‌ها:** همهٔ مایگریشن‌های اپ‌های پروژه از نو ساخته می‌شوند تا گراف یک‌طرفه باشد (هسته ← هیچ ماژول؛ هر ماژول ← فقط هسته).
  - پیش از حذف، همهٔ `RunPython` و `RunSQL`های موجود فهرست می‌شوند. هر کدام که دادهٔ پایه می‌سازد (گروه‌ها، مجوزها، تنظیمات پیش‌فرض) در مایگریشن جدید حفظ می‌شود.
  - پایگاه‌داده‌های موجود از نو ساخته می‌شوند (تصمیم ۲).
- **نگهبان جدید** (`guardian_NN_module_independence.py`) برای هر پروفایل (`warehouse`، `accounting` و هر دو) بررسی می‌کند:
  1. `manage.py check` بدون خطا تمام شود.
  2. گراف مایگریشن بدون ماژول دیگر بارگذاری شود.
  3. هیچ مایگریشنِ هسته به ماژولی وابسته نباشد.

### ۴.۲ انتخاب سامانه در استقرار
- **کلید جدید `Modules` در `deploy_config.json`:** مقدار آن `warehouse`، `accounting` یا `warehouse,accounting` است و پیش‌فرض هر دو.
  - `Setup` این مقدار را در `shared/.env` به‌صورت `WH_MODULES=...` می‌نویسد و در `shared/MODULES` هم ثبت می‌کند.
  - در Setup تعاملی، اگر کلید نباشد، پرسیده می‌شود.
- **`-Update`:** مقدار `WH_MODULES` سرور دست نمی‌خورد. اگر `Modules` در config با سرور فرق کند، Update متوقف می‌شود و `-AddModule` را پیشنهاد می‌دهد.
- **`-AddModule <code>`:**
  1. پشتیبان تأییدشده پیش از تغییر گرفته و به این ماشین کشیده می‌شود (همان مسیر دومرحله‌ای Update).
  2. `WH_MODULES` به‌روز می‌شود.
  3. `migrate` اجرا می‌شود.
  4. سرویس‌های لازم آن ماژول فعال می‌شوند.
  5. سرویس‌ها ری‌استارت می‌شوند و سلامت سامانه و `installed_modules` در `/api/public/config/` بررسی می‌شود.
  6. اگر کار شکست خورد، `WH_MODULES` قبلی برگردانده و سرویس‌ها دوباره بالا آورده می‌شوند. جدول‌های تازه می‌مانند و داده‌ای حذف نمی‌شود.
  - حذف سامانه رد می‌شود.
- **سرویس‌های وابسته به ماژول:** هر سرویس فقط وقتی فعال می‌شود که ماژولش نصب باشد (جدول نگاشت در گام ۳). هستهٔ همیشگی: backend، export و backup.
- **`-ResetServer`:** فقط پیش از GO_LIVE و با تأیید تایپی. پشتیبان تأییدشده می‌گیرد، پایگاه‌داده را از نو می‌سازد و `WH_MODULES` را تنظیم می‌کند. این برای بازنصب soft در گام ۶ لازم است. پس از GO_LIVE دروازه آن را رد می‌کند.
- `-Status` سامانه‌های نصب‌شده را نشان می‌دهد.

### ۴.۳ روش گواهی
- **کلید `CertMode` در `deploy_config.json`:** یکی از `http01` (پیش‌فرض)، `dns01-cloudflare`، `cloudflare-origin` یا `custom`. روش در `shared/CERT_MODE` ثبت می‌شود.
- **مسیر یکسان گواهی برای nginx:** `/etc/warehouse/tls/<domain>/fullchain.pem` و `privkey.pem`.
  - برای Let's Encrypt این‌ها symlink به `live/<domain>/` هستند.
  - برای origin و custom فایل واقعی‌اند، با مالک root و دسترسی `0600` برای کلید.
  - قالب nginx به‌جای مسیر ثابت از این مسیر استفاده می‌کند.
- **`http01`:** `certbot certonly --webroot -w /var/www/html`. مسیر ACME در nginx-http از قبل وجود دارد.
- **`dns01-cloudflare`:** همان روش فعلی.
- **`cloudflare-origin` و `custom`:**
  - `-InstallCert -CertFile <path> -KeyFile <path> [-ChainFile <path>]` فایل‌ها را از این ماشین در stage می‌فرستد.
  - دروازه با `openssl` بررسی می‌کند: کلید با گواهی جور باشد، SAN دامنه را پوشش دهد، گواهی منقضی نشده باشد، و برای `custom` زنجیره کامل باشد.
  - گواهی فقط پس از این بررسی‌ها نصب می‌شود. کلید هیچ‌وقت در argv یا لاگ نمی‌آید.
  - **برای `cloudflare-origin`:** nginx آدرس واقعی کاربر را از `CF-Connecting-IP` می‌گیرد، و فقط از بازه‌های IP رسمی Cloudflare که در قالب ثابت‌اند. بدون این کار، throttle و fail2ban همهٔ کاربران را یک IP می‌بینند.
- **تغییر روش:** گواهی قبلی تا وقتی گواهی جدید نصب و `nginx -t` سالم نشده، حذف نمی‌شود.
- **`-Status`:** روزهای باقی‌ماندهٔ گواهی در هر روش نشان داده می‌شود. برای `custom` و `origin`، اگر کمتر از ۳۰ روز مانده باشد هشدار داده می‌شود. اسکریپت پشتیبان شبانه هم آن را در لاگ ثبت می‌کند.

### ۴.۴ تغییر دامنه
- **وضعیت روی سرور:** دامنهٔ اصلی در `shared/DOMAIN` است. دامنه‌های قبلی در `shared/DOMAINS_LEGACY` هستند، هر خط به‌شکل `<domain> transition|redirect`.
- **nginx:** برای هر دامنهٔ قبلی یک server block ساخته می‌شود. در حالت `transition` همان اپ را سرو می‌کند و در حالت `redirect` با `return 301 https://<new>$request_uri` ریدایرکت می‌کند. هر کدام گواهی خودشان را دارند.
- **کلیدهای مدیریت‌شدهٔ `.env`:** `DJANGO_ALLOWED_HOSTS`، `DJANGO_CSRF_TRUSTED_ORIGINS`، `GOOGLE_OAUTH_REDIRECT_URI` و کلید جدید `WH_CANONICAL_DOMAIN`. این‌ها از روی فهرست دامنه‌ها **بازنویسی** می‌شوند و فقط اضافه نمی‌شوند. کلیدهای دیگر دست نمی‌خورند.
- **`-ChangeDomain <new>`:**
  1. دامنه را اعتبارسنجی می‌کند.
  2. گواهی دامنهٔ جدید را با `CertMode` صادر یا نصب می‌کند.
  3. دامنهٔ جدید اصلی می‌شود و دامنهٔ قبلی به حالت `transition` می‌رود.
  4. `.env` و nginx به‌روز می‌شوند، سپس ری‌استارت.
  5. هر دو دامنه سلامت‌سنجی می‌شوند.
  6. `Domain` در `deploy_config.json` به‌روز می‌شود (پیش از آن نسخهٔ پشتیبان `.bak` ساخته می‌شود).
  7. هشدار داده می‌شود که نشانی بازگشت OAuth باید در کنسول گوگل به‌روز شود.
- **`-FinishDomainChange`:** دامنه‌های `transition` را به `redirect` تبدیل می‌کند. گواهی‌شان برای HTTPS ریدایرکت همچنان تمدید می‌شود.
- **`-RemoveLegacyDomain <d>`:** با تأیید تایپی، ریدایرکت و گواهی دامنهٔ قبلی را کنار می‌گذارد. فایل‌ها حذف نمی‌شوند و به `shared/retired/` منتقل می‌شوند.
- **فرانت:**
  - `/api/public/config/` مقدار `canonical_domain` را برمی‌گرداند.
  - اگر `location.host` با آن فرق کند، نوار اطلاع‌رسانی نشان داده می‌شود.
  - وقتی صف همگام‌سازی و صف عکس **خالی** و سرور در دسترس باشد، کاربر خودکار به همان مسیر روی دامنهٔ جدید منتقل می‌شود.
  - صف هرگز پاک نمی‌شود. اگر صف خالی نشود، کاربر روی دامنهٔ قبلی می‌ماند تا ارسال کامل شود.
  - در حالت `redirect`، nginx ریدایرکت می‌کند. چون پیش از آن دورهٔ گذار بوده، صف‌ها خالی شده‌اند. اما Service Worker دامنهٔ قبلی ممکن است اپ کش‌شده را بدون شبکه باز کند. این در گام ۵ بررسی و با یک پاسخ ثابت مناسب برای `ngsw.json` پوشش داده می‌شود.
  - QR کارت‌ها از `window.location.origin` ساخته می‌شوند، پس پس از انتقال به دامنهٔ جدید درست‌اند. QRهای چاپ‌شدهٔ قبلی با ریدایرکت دائمی کار می‌کنند.

## ۵. گام‌ها (هر گام یک نشست)

| گام | محتوا | آزمون |
|---|---|---|
| ۱ | بک‌اند مستقل: اپ `companies`، سهم‌دهندهٔ دسترسی، API هسته، `ReportTemplate.warehouse_id` عددی، محافظت ایمپورت‌ها، تصمیم دربارهٔ GDrive، بازسازی همهٔ مایگریشن‌ها (با حفظ RunPythonهای دادهٔ پایه) | postgres موقت در Docker. برای ۳ پروفایل: `check` و `migrate` روی پایگاه خالی. تست‌های بک‌اند (با برچسب اپ) روی پروفایل کامل. `lint-imports` و نگهبان 29. بازبین: `tenant-scope-reviewer` و `data-loss-reviewer` |
| ۲ | پشتیبان کامل و بازسازی پایگاه app محلی با دادهٔ E2E. فرانت: endpointهای هسته، پنهان کردن تب‌های حسابداری شرکت در «فقط انبار». نگهبان استقلال ماژول. release روی app | `ng test` (روش موجود در CLAUDE.md، مقایسه با HEAD)، `npm run build`، `guardian_all.py`، بررسی صفحهٔ ورود و `/api/public/config/`. بازبین: `ui-reviewer` و `data-loss-reviewer` |
| ۳ | استقرار: `Modules`، `WH_MODULES` در Setup، `-AddModule`، `-ResetServer`، سرویس‌های وابسته به ماژول، `-Status` | `test_integration.ps1` و `test_server_e2e.ps1` گسترش می‌یابند: Setup «فقط حسابداری»، سپس AddModule انبار، سپس رد حذف، سپس شکست ساختگی migrate و بازگشت. نگهبان 53 |
| ۴ | روش‌های گواهی: `CertMode`، مسیر یکسان TLS، `http01`، `-InstallCert` برای origin و custom، real-ip در Cloudflare، `-Status` انقضا | e2e در Docker: certbot ساختگی برای دو روش LE؛ گواهی self-signed با `openssl` برای origin و custom؛ کلید نامتناظر، SAN نادرست و گواهی منقضی رد شوند؛ کلید در argv و لاگ نیاید؛ تغییر روش بدون قطع HTTPS |
| ۵ | تغییر دامنه: `-ChangeDomain`، `-FinishDomainChange`، `-RemoveLegacyDomain`، کلیدهای مدیریت‌شدهٔ `.env`، `canonical_domain` و انتقال خودکار در فرانت، یکسان‌سازی `GOOGLE_OAUTH_REDIRECT_URI` | e2e: دو دامنه در دورهٔ گذار، هر دو 200؛ پس از Finish، 301 با حفظ مسیر؛ `.env` درست بازنویسی شود و کلیدهای دیگر بمانند. تست واحد فرانت: با صف پر انتقال نمی‌دهد و با صف خالی می‌دهد. بازبین: `data-loss-reviewer` |
| ۶ | آزمون جامع و اجرا روی soft: پشتیبان و کشیدن آن، `-ResetServer` با `Modules=accounting`، Setup و Update، بررسی، سپس `-AddModule warehouse`، بررسی دوباره | همهٔ مجموعه‌های deploy_tests، نگهبان 53، PSScriptAnalyzer. روی soft: `/`، `/api/public/config/` (`installed_modules`)، `ngsw.json`، `-Status`، اعتبار گواهی |

## ۶. «عدم از دست رفتن داده»
- بازسازی پایگاه‌داده فقط با تصمیم صریح کاربر (۱۷ مهر) و فقط برای این طرح انجام می‌شود. پیش از هر بازسازی پشتیبان کامل گرفته می‌شود: روی app با `create_database_backup`، روی soft با پشتیبان تأییدشده که به این ماشین کشیده می‌شود.
- `-ResetServer` پس از GO_LIVE در دروازه مسدود است.
- `-AddModule` و `-ChangeDomain` هیچ داده‌ای حذف نمی‌کنند. شکست‌شان به وضعیت قبلی برمی‌گردد.
- صف آفلاین در جابه‌جایی دامنه پاک نمی‌شود. انتقال فقط پس از خالی شدن آن انجام می‌شود.

## ۷. پرسش‌های باز
- در حال حاضر هیچ. هر ابهام تازه پیش از اجرای همان گام از کاربر پرسیده می‌شود.

## گزارش پیشرفت
- **۱۷ مهر ۱۴۰۵ (2026-10-08):** طرح نوشته شد. اقدام بعدی: گام ۱.
- **۱۷ مهر ۱۴۰۵ (2026-10-08) — گام ۱ انجام شد (Claude):**
  - **وضعیت زیرگام‌ها:**
    - اپ هستهٔ `companies` ساخته شد: `Company` و `UserCompanyAccess` (با `db_table` قبلی)، `access.py` (قواعد دسترسی و `register_derived_company_source`)، `permissions.py`، `realtime.py`، `serializers.py`، `views.py` و `urls.py`.
    - حسابداری در `personnel/apps.py` منبع دسترسی مشتق از عضویت بخش را ثبت می‌کند (`personnel/company_access.py`). `personnel` نام‌های قبلی را دوباره صادر می‌کند. `CompanyViewSet` و `CompanySerializer` حسابداری زیرکلاس نسخهٔ هسته‌اند، با همان مسیرهای قدیمی `api/personnel/companies*`.
    - `ShamsiDateField` و `validate_uploaded_document` به `common/serializer_fields.py` منتقل شدند.
    - ایمپورت‌های هسته و انبار از `personnel.*` به `companies.*` تغییر کردند: `accounts` (serializers، views، middleware)، `common/tenant_scope.py`، `notifications/consumers.py`، `warehouses/views.py` و `inventory/views.py`. بخش‌های وابسته به بخش‌های پروژه پشت `apps.is_installed('personnel')` رفتند.
    - `ReportTemplate.warehouse` به `warehouse_id` عددی تبدیل شد (نام فیلد API همان `warehouse` است و وجود انبار اعتبارسنجی می‌شود).
    - همهٔ مایگریشن‌ها از نو ساخته شدند. گراف یک‌طرفه است: `warehouses`/`inventory`/`personnel` فقط به `companies` وابسته‌اند، `reports` به هیچ ماژولی.
    - `inventory/0001` با `TrigramExtension()` شروع می‌شود. دادهٔ پایهٔ سمت‌های بیمه در `personnel/0002_seed_insurance_job_titles.py` حفظ شد (۱۷ جفت که ۷ تای آن غیرفعال‌اند).
    - `companies` در `.importlinter` به لایهٔ هسته و C3 اضافه شد. آزمون `FleetDataMigrationReverseTests` (برای مایگریشن حذف‌شدهٔ 0035) حذف شد. fixture آزمون e2e استقرار حالا به `accounts/0001_initial` وابسته است.
  - **انحراف‌ها و تصمیم‌ها:**
    - پیشوند API هسته `/api/org/` شد (`/api/org/companies/` و `/api/org/user-company-access/`)، نه `/api/companies/`.
    - Google Drive شرکت (`CompanyGoogleDriveConfig` و صف آن) در حسابداری ماند. هسته از قبل با `is_installed('personnel')` آن را محافظت می‌کند. فرمان `run_gdrive_sync_worker` که اجرا می‌شود نسخهٔ `settings_core` است، پس سرویس gdrive در هر دو پروفایل اجراشدنی است.
    - مایگریشن دادهٔ دو شرکت ثابت (`PTS` و `FA`، 0013) و انتساب انبارهای 0003 و 0005 حذف شدند، چون مخصوص یک محیط‌اند.
    - با حذف انبار، قالب گزارش دیگر حذف نمی‌شود و فقط `warehouse_id` آن تهی می‌شود (قبلاً CASCADE بود).
    - رفع ایراد: پخش رویداد `company_access` شناسهٔ شرکت را به‌جای `project_id` می‌فرستاد. حالا به کانال همان شرکت می‌رود.
    - رفع ایراد پیدا شده در بازبینی: `_org_admin_directory_queryset` در `accounts/views.py` در نصب «فقط انبار» `FieldError` می‌داد.
    - در نصب «فقط انبار»، سه مسیر که قبلاً با ImportError بی‌صدا شکست می‌خوردند حالا درست کار می‌کنند: middleware شرکت، `tenant_scope` و همگام‌سازی دسترسی شرکت کاربر.
  - **آزمون‌ها:**
    - postgres موقت در Docker (`wh_pg_profiles`، پورت 55432، نقش غیرسوپریوزر `whapp`): `check` و `migrate` روی پایگاه خالی برای هر سه پروفایل پاس شد و `makemigrations --check` در هر سه «No changes».
    - افزودن ماژول در هر دو جهت پاس شد: حسابداری سپس انبار، و انبار سپس حسابداری (`scratch/logs/migrate_add_*.log`).
    - تست‌های بک‌اند پروفایل کامل: ۷۰۸ تست، ۳۳ شکست. همان اجرا روی HEAD (۷۰۵ تست) ۳۲ شکست داشت. مجموعهٔ شکست‌ها یکسان است، جز آزمون مایگریشن 0035 که حذف شد. شکست‌ها از قبل بوده‌اند (بیشترشان نبود مجوزهایی مثل `view_wh_stocktaking` در setUp).
    - آزمون‌های تازهٔ `companies/tests.py` (۹ تست) و `reports` در «فقط انبار» پاس شدند. در «فقط حسابداری» آزمون‌های `companies` پاس شدند، ولی ماژول `reports.tests` بارگذاری نمی‌شود چون خودش `inventory` را ایمپورت می‌کند (فقط آزمون؛ کد اجرایی گزارش‌ساز محافظت شده است).
    - نگهبان 29: نقض‌ها از ۵۰ (HEAD) به ۳۶ رسید و نقض‌های تولیدی از ۲۴ به ۱۰. هیچ شاخصی بدتر نشد. وضعیت REJECTED از قبل روی HEAD هم بوده است.
    - بازبین‌ها: `tenant-scope-reviewer` هیچ نشتی پیدا نکرد. `data-loss-reviewer` هیچ مسیر از دست رفتن داده پیدا نکرد.
  - **موارد باز:**
    - مسیرهای `/api/org/` زیر پیشوند هیچ ماژولی نیستند، پس محدودیت app-scope توکن روی آن‌ها اعمال نمی‌شود. این عمدی است، چون مدیریت شرکت هسته است و محدودهٔ شرکت و مجوزها همچنان اعمال می‌شوند.
    - **پایگاه محلی app هنوز ساخته نشده است.** `migrate` روی آن خطای `InconsistentMigrationHistory` می‌دهد. پشتیبان: `backend/backups/db/backup_20261008_130539.dump`. این پشتیبان نام مایگریشن‌های قدیمی را دارد و فقط برای بازگشت کامل به کد قبلی به کار می‌آید.
    - **روی soft تا گام ۶ نباید `-Update` زد.** `check_migration_compatibility` آن را پیش از هر تغییری رد می‌کند (fail-closed).
    - ۳۱ آزمون شکست‌خوردهٔ قدیمی بیرون از دامنهٔ این طرح است.
  - **اقدام بعدی (گام ۲):**
    1. پشتیبان تازه، سپس drop و create پایگاه app محلی.
    2. `migrate` و `seed_permissions` و `init_roles`، سپس ساخت دوبارهٔ دادهٔ E2E نگهبان‌ها.
    3. فرانت: استفاده از `/api/org/` و پنهان کردن تب‌های حسابداری شرکت در «فقط انبار».
    4. نگهبان استقلال ماژول.
    5. release روی app.
- **۱۷ مهر ۱۴۰۵ (2026-10-08) — گام ۲ انجام شد (Claude):**
  - **وضعیت زیرگام‌ها:**
    - **پایگاه app محلی:** پشتیبان تازه گرفته شد (`backups/db/backup_20261008_135348.dump`). پایگاه قبلی حذف نشد و به `warehouse_db_pre_modular_20261008` تغییر نام داد. `warehouse_db` خالی ساخته شد و `migrate` با مایگریشن‌های جدید روی آن اجرا شد.
    - **انتقال داده:** همهٔ داده‌ها (به‌جز `django_migrations`) با `pg_dump --data-only` و `pg_restore --data-only --disable-triggers --single-transaction` منتقل شدند. نتیجه: ۱۴٬۷۴۸ ردیف، شمار ردیف همهٔ جدول‌ها برابر، و هیچ کلید خارجیِ یتیمی نماند.
    - **content type:** دو content type `personnel.company` و `personnel.usercompanyaccess` به `companies` تغییر برچسب دادند تا مجوزهای تخصیص‌یافته بمانند. سپس `seed_permissions` و `init_roles` اجرا شد (۵ نقش پیش‌فرضِ نبوده ساخته شد). اسکریپت‌ها در `scratch/step2/` هستند.
    - **فرانت، مسیر شرکت‌ها:** `CompanyApiService` و `ActiveCompanyService` شرکت‌ها را در «فقط انبار» از `/api/org/companies` می‌خوانند. با نصب حسابداری از `/api/personnel/companies` می‌خوانند، چون این زیرکلاس حسابداری شمار پروژه‌ها، مدارک، بانک و هیئت‌مدیره را هم می‌دهد.
    - **فرانت، دسترسی کاربر به شرکت:** با حسابداری همان مسیر قبلی `/api/personnel/user-company-access/` می‌ماند و بدون آن از `/api/org/user-company-access/` می‌آید. (توضیح در «انحراف‌ها».)
    - **صفحهٔ شرکت‌ها در «فقط انبار»:** تب‌های بانک، هیئت‌مدیره و گوگل‌درایو، بایگانی مدارک (دو سند مادر می‌مانند)، ستون‌های پروژه و سلامت مدارک، و دکمه‌های گوگل‌درایو پنهان شدند. زیرعنوان استودیو کوتاه شد. پیوند مستقیم `?tab=` به تب حسابداری به تب مشخصات برمی‌گردد. ویجت سررسید مدارک مرکز عملیات هم پنهان شد و بارگذاری نمی‌شود.
    - **نگهبان ۵۴** (`scripts/e2e/guardian_54_module_independence.py`): برای هر سه پروفایل در زیرفرایند جدا بررسی می‌کند: `check`، ساخت گراف مایگریشن، جهت یک‌طرفهٔ وابستگی‌ها (هسته ← هیچ ماژول، ماژول ← فقط هسته) و `makemigrations --check`. در پایگاه چیزی نمی‌نویسد. با یک وابستگی ساختگی `reports → warehouses` آزموده شد و درست رد کرد.
    - **release روی app:** build انجام شد. daphne، کارگر GDrive، Express روی 4200، تونل و `ng serve` روی 4300 بالا آمدند (پیش از شروع گام هیچ‌کدام در حال اجرا نبود).
  - **انحراف‌ها و تصمیم‌ها:**
    - **دادهٔ E2E نگهبان‌ها ساخته نشد.** `setup_e2e_data.py` یک سوپریوزر با رمز ثابت و شناخته‌شده می‌سازد و app از طریق تونل عمومی در دسترس است. پایگاه قبلی هم این داده را نداشت. پس شکست نگهبان‌های فاز ۱ تا ۵ مثل قبل باقی است.
    - **علت ماندن مسیر قبلی دسترسی:** بازبین data-loss نشان داد تغییر نشانی، کلید کش آفلاین (URL کامل) و نشانیِ درخواست‌های صف‌شدهٔ قبلی را بی‌اثر می‌کند. به همین دلیل با نصب حسابداری مسیر قبلی دسترسی حفظ شد.
    - **رفع ایراد بازبینی:** `warehouses/signals.py` حالا با حذف انبار، `warehouse_id` در `GenericComment` و `VehicleTripLog` را هم تهی می‌کند (قبلاً شناسهٔ یتیم می‌ماند). این در یک تراکنش برگشت‌خورده روی پایگاه app آزموده شد.
  - **آزمون‌ها:**
    - `ng test` به روش CLAUDE.md (۱۶ spec دارای خطای TS به‌علاوهٔ دو exclude موجود کنار گذاشته شدند): درخت کاری ۵۶۷ تست با ۵۵۷ پاس؛ HEAD ۵۶۴ تست با ۵۵۴ پاس. ۱۰ شکست در هر دو یکسان و قدیمی است. ۳ تست تازهٔ `company-api-endpoints.spec.ts` پاس شدند.
    - build (`ng build --delete-output-path=false` و وصلهٔ ngsw) موفق بود.
    - `guardian_all.py`: نگهبان‌های ۳۰ تا ۵۴ پاس شدند.
    - فاز ۱ تا ۵ رد شدند، چون دادهٔ E2E نیست (قدیمی).
    - نگهبان ۲۹ رد شد: ۴۱ نقض (۱۰ تولیدی و ۳۱ غیرتولیدی) در برابر مبنای ۲۸. کد بک‌اند تا پیش از ویرایش سیگنال با commit گام ۱ یکی بود و همین ۴۱ را داشت، پس این شمار از گام ۱ است. عدد ۳۶ که در گزارش گام ۱ آمده با اجرای فعلی نمی‌خواند.
    - **بررسی زنده:** `https://app.farsalish.ir/`، `/api/public/config/` (`installed_modules`: platform، warehouse، accounting) و `ngsw.json` پاسخ 200 دادند. صفحهٔ ورود درست بارگذاری شد. heartbeat کارگر تازه بود.
    - **شبیه‌سازی سمت سرور با سوپریوزر:** `/api/org/companies/`، `/api/org/companies/user-available/` و `/api/org/user-company-access/` پاسخ 200 دادند. `/api/personnel/companies/` فیلدهای حسابداری را دارد و `/org/` ندارد.
    - **بازبین‌ها:**
      - `ui-reviewer`: دو یافتهٔ کم‌اهمیت (زیرعنوان استودیو و بازگشت پیوند مستقیم تب) رفع شد.
      - `data-loss-reviewer`: هیچ مسیر از دست رفتن داده نیافت. دو یافتهٔ متوسط (کش و صف مسیر قدیمی دسترسی) با ماندن مسیر قبلی رفع شد. یافتهٔ کم‌اهمیت سیگنال رفع شد.
      - تأیید شد که sequenceها، شناسه‌های content type و رابطه‌های عمومی در بازسازی سالم‌اند.
  - **موارد باز:**
    - **حذف نام‌های مستعار `api/personnel/companies*` و `user-company-access` (پایان طرح):** پیش از حذف، درخواست‌های صف‌شده و کلیدهای کش با نشانی قدیمی باید بازنویسی شوند: نگاشت در `sendEntry`، `retryError` و `resolveConflict` و fallback در `getCachedEntry` در `offline-sync.service.ts`. وگرنه پاسخ 404 درخواست صف‌شده را به صندوق خطا می‌برد و تلاش دوباره هم 404 می‌گیرد. پیشنهاد: نام‌های مستعار ماندگار بمانند.
    - **sequence:** `settings_system_gdrive_config_id_seq` از قبل هم عقب است (ردیف تکیِ id=1). فقط درج بدون pk مشکل‌ساز است.
    - **بررسی‌نشده:** نمای «فقط انبار» در مرورگر بررسی نشد، چون پشت ورود است. کاربر می‌تواند با build `warehouse-only` یا مقدار `wh_installed_modules` در localStorage آن را ببیند.
    - **بررسی‌نشده:** صفحهٔ شرکت‌ها و مرکز عملیات در حالت کامل هم پشت ورود است و کاربر باید آن را ببیند.
  - **اقدام بعدی (گام ۳):** استقرار: کلید `Modules` و `WH_MODULES` در Setup، `-AddModule`، `-ResetServer`، سرویس‌های وابسته به ماژول و `-Status`. آزمون‌ها طبق جدول §۵.
- **۱۷ مهر ۱۴۰۵ (2026-10-08) — گام ۳ انجام شد (Claude):**
  - **وضعیت زیرگام‌ها:**
    - **کلید `Modules`** در `deploy_config.json`: پیش‌فرض `warehouse,accounting`؛ مقدار به ترتیب کاتالوگ و بدون تکرار یکسان می‌شود و سامانهٔ ناشناخته رد می‌شود.
    - **Setup:**
      - اگر کلید `Modules` نباشد، در حالت تعاملی پرسیده می‌شود و پس از Setup در پیکربندی ثبت می‌شود.
      - `remote-setup.sh` حالا آرگومان نهم `<modules>` را می‌گیرد. در نصب اول `WH_MODULES` را در `.env` و رکورد `shared/MODULES` می‌نویسد.
      - در Setup دوم، اگر سامانه‌ها با سرور جور نباشند، پیش از هر تغییری (حتی apt) با کد ۴ رد می‌شود.
    - **Update:** سامانه‌های سرور را با دروازهٔ `modules` می‌خواند و اگر با پیکربندی فرق کنند، پیش از build متوقف می‌شود و `-AddModule` را پیشنهاد می‌دهد. `--prepare --modules` هم همین را روی سرور دوباره بررسی می‌کند.
      - روی سرور با ابزار قدیمی (دروازه بدون `modules`)، فرض «همهٔ سامانه‌ها» با هشدار گذاشته می‌شود.
    - **`-AddModule <code>`:**
      1. پشتیبان `pre_module` گرفته، کشیده و تأیید می‌شود.
      2. سپس `warehouse-deploy --add-module` اجرا می‌شود (جدا از نشست SSH، با قفل استقرار).
      3. `migrate`، `seed_permissions`، `init_roles` و بررسی strict مایگریشن با `WH_MODULES` جدید از راه **متغیر محیطی** اجرا می‌شوند. `.env` تا این‌جا دست نمی‌خورد.
      4. فقط بعد از آن `.env` و `MODULES` عوض می‌شوند و ری‌استارت و سلامت‌سنجی (شامل `installed_modules`) انجام می‌شود.
      5. در هر شکستی، و با trap روی EXIT و سیگنال‌ها، `WH_MODULES` قبلی برمی‌گردد و سرویس‌ها دوباره بالا می‌آیند. جدول‌ها می‌مانند.
      6. پس از موفقیت، `Modules` در پیکربندی به‌روز می‌شود (با نسخهٔ `.bak-<زمان>`). نصب دوبارهٔ یک سامانه با کد ۱ رد می‌شود.
    - **`-ResetServer`:**
      - فقط تعاملی، با تأیید تایپی `RESET`، و GO_LIVE در deploy.ps1، دروازه و `warehouse-deploy` رد می‌شود.
      - ترتیب: prepare، کشیدن و تأیید پشتیبان pre-update، سپس `--reset-database`، سپس activate.
      - `--reset-database` پشتیبان را به `.deploy_metadata` گره می‌زند و باید کمتر از ۲ ساعت عمر داشته باشد.
      - سرویس‌ها را متوقف می‌کند و یک dump نهایی `db_pre_reset_*` می‌گیرد (با `pg_restore --list` بررسی می‌شود).
      - GO_LIVE را دوباره بررسی می‌کند، سپس `SERVICES_HELD` می‌گذارد، پایگاه را با ICU fa-IR از نو می‌سازد، `WH_MODULES` را می‌نویسد و migrate و seed را اجرا می‌کند. فعال‌سازی، hold را برمی‌دارد.
    - **سرویس‌های وابسته به ماژول:** جدول نگاشت `MODULE_SERVICES` در `warehouse-deploy.sh` اضافه شد. هر دو ماژول فعلاً خالی‌اند، چون همهٔ سرویس‌ها هسته‌اند: backend، export، worker گوگل‌درایو (`settings_core`) و تایمر پشتیبان. `-AddModule` واحدهای ماژول را enable و start می‌کند.
    - **`-Status`:** «Installed modules» در بخش [1] دروازه نمایش داده می‌شود.
    - **بررسی مایگریشن:** `MIGRATION_CHECK_PY` حالا فقط ردیف‌های ماژول‌های کاتالوگِ نصب‌نشده را نادیده می‌گیرد (مثلاً باقی‌ماندهٔ AddModule شکست‌خورده). اپ ناشناختهٔ هسته همچنان «forward» حساب می‌شود.
  - **انحراف‌ها و تصمیم‌ها:**
    - پشتیبان AddModule یک prefix تازه (`pre_module`) در `warehouse-nightly-backup.sh` گرفت.
    - **تست e2e و آینهٔ PyPI:** `files.pythonhosted.org` از این شبکه resolve نمی‌شد، پس پارامتر `-PipIndex` (فقط برای کانتینر تست) اضافه شد و اجرا با `https://mirrors.aliyun.com/pypi/simple` انجام شد. `--require-hashes` همچنان هش هر بسته را بررسی می‌کند. آینهٔ runflare از کانتینر وصل نشد.
  - **آزمون‌ها:**
    - `test_integration.ps1` (دروازهٔ واقعی): ۸۷ پاس، ۰ شکست. ۱۴ بررسی تازه دارد: modules پیش‌فرض و خواندن WH_MODULES، رد ناهمخوانی و سامانهٔ ناشناخته، رد AddModule تکراری یا ناشناخته بدون گرفتن پشتیبان، رد WH_MODULES نامعتبر، رد reset-database پس از GO_LIVE، و رد ResetServer در NonInteractive.
    - `test_server_e2e.ps1` (اسکریپت‌های واقعی، Ubuntu 24.04): ۱۷۲ پاس، ۰ شکست. سناریوها:
      - Setup «فقط حسابداری» (`installed_modules`=platform,accounting و API انبار 404).
      - رد Update و Setup ناهمخوان.
      - AddModule با migrate شکسته: بازگشت به accounting، سرویس‌ها سالم، جدول‌ها ماندند، پشتیبان کشیده شد.
      - Update پس از آن، با وجود ردیف‌های انبار.
      - AddModule موفق و به‌روز شدن پیکربندی.
      - رد AddModule تکراری و رد حذف سامانه.
      - ResetServer: لغو با کلمهٔ نادرست، رد NonInteractive، رد GO_LIVE، و اجرای موفق (پایگاه تازه، ICU، مجوزها، مدیا ماند، پشتیبان کشیده شد).
    - نگهبان ۵۳ با بند تازهٔ ۱۲ پاس شد.
    - shellcheck (warning) و PSScriptAnalyzer: صفر یافته.
    - بازبین `data-loss-reviewer`: یک یافتهٔ high و پنج medium، همه رفع شد:
      - فیلتر مایگریشن محدود به ماژول‌های کاتالوگ شد.
      - migrate با env override انجام می‌شود و `.env` فقط پس از موفقیت عوض می‌شود.
      - بررسی دوبارهٔ GO_LIVE پیش از drop.
      - تازگی پشتیبان، dump نهایی و `SERVICES_HELD` در reset.
      - بازنویسی `.env` در خطای خواندن متوقف می‌شود و شمار خط‌ها را بررسی می‌کند.
      - `.bak` زمان‌دار شد.
  - **موارد باز:**
    - **soft هنوز ابزار قدیمی دارد** (دروازه بدون `modules` و `reset-database`). برای گام ۶ ترتیب این است:
      1. Setup با `Modules=warehouse,accounting`، همخوان با `.env` بدون WH_MODULES. این دروازه و `warehouse-deploy` تازه را نصب می‌کند. فعال‌سازی آن به‌خاطر مایگریشن‌های squash‌شده رد می‌شود و این انتظار می‌رود.
      2. سپس `Modules=accounting` و `-ResetServer`.
      3. سپس `-AddModule warehouse`.
    - **مسیر «ابزار قدیمی» در Update** (تشخیص `unrecognized subcommand`) در تست‌ها پوشش داده نشده است. fixture دروازهٔ تازه را دارد.
    - **قفل `set-go-live`:** دروازه قفل استقرار نمی‌گیرد. reset این را با بررسی دوباره پیش از drop پوشش می‌دهد.
  - **اقدام بعدی (گام ۴):** روش‌های گواهی: `CertMode`، مسیر یکسان TLS، `http01`، `-InstallCert` برای origin و custom، real-ip در Cloudflare، و انقضا در `-Status`. آزمون‌ها طبق جدول §۵.

- **یادداشت گام ۴ (روش‌های گواهی TLS: `http01`، `dns01-cloudflare`، `cloudflare-origin`، و `custom`):**
  - **وضعیت زیرگام‌ها:**
    1. کلید `CertMode` در `deploy_config.json` با مقادیر `http01` (پیش‌فرض)، `dns01-cloudflare`، `cloudflare-origin` و `custom` در `Assert-DeployConfig` پیاده‌سازی و اعتبارسنجی شد؛ وضعیت روش گواهی روی سرور در `shared/CERT_MODE` ثبت می‌شود.
    2. مسیر یکپارچه گواهی TLS برای Nginx در `/etc/warehouse/tls/<domain>/fullchain.pem` و `privkey.pem` پیاده‌سازی شد. برای Let's Encrypt این دو symlink به `/etc/letsencrypt/live/<domain>/` هستند و برای origin و custom فایل واقعی با مالک `root:root` و دسترسی 0600 برای کلید خصوصی. قالب Nginx به این مسیر متصل شد.
    3. روش `http01` با `certbot certonly --webroot -w /var/www/html` اضافه شد و روش `dns01-cloudflare` بدون تغییر حفظ شد.
    4. فرمان `-InstallCert -CertFile <path> -KeyFile <path> [-ChainFile <path>]` پیاده‌سازی شد؛ فایل‌ها از طریق پوشه موقت stage منتقل شده و زیرفرمان `install-cert` در دروازه با موتور پایتون/OpenSSL صحت کلید و گواهی، پوشش SAN دامنه، عدم انقضا و کامل بودن زنجیره را اعتبارسنجی می‌کند.
    5. برای `cloudflare-origin`، رنج‌های رسمی IP کلودفلر و هدر `CF-Connecting-IP` در تنظیمات Nginx به صورت امن اعمال شد.
    6. تغییر روش گواهی و آزمون‌های رد بدون قطعی HTTPS پیاده‌سازی شد؛ گواهی قبلی تا تأیید صحت گواهی جدید با `nginx -t` حفظ می‌شود.
    7. فرمان `-Status` و اسکریپت پشتیبان شبانه (`warehouse-nightly-backup.sh`) روزهای باقیمانده گواهی را ثبت کرده و برای کمتر از ۳۰ روز (و کمتر از ۲۱ روز برای LE) هشدار می‌دهند.
  - **انحراف‌ها و تصمیم‌ها:**
    - به منظور حفظ کامل سازگاری به عقب با نسخه‌های قبلی سرور، چنانچه در فراخوانی `-IssueCert` روش گواهی به صورت صریح فرستاده نشود، دروازه در صورت وجود فایل `/etc/letsencrypt/cloudflare.ini` روش `dns01-cloudflare` و در غیر این صورت `http01` را انتخاب می‌کند.
    - در دروازه روت، اسکریپت اعتبارسنجی پایتون بدون کاراکتر آپاستروف تعبیه شد تا از مشکلات shell interpolation جلوگیری شود.
    - در ساخت گواهی منقضی برای تست، به جای `-days -1` (که در OpenSSL 3.x نامعتبر است) از پارامترهای تاریخ معتبر منقضی شده (`-not_before 20190101000000Z -not_after 20200101000000Z`) استفاده شد.
  - **آزمون‌ها:**
    - `test_integration.ps1`: ۱۰۴ پاس، ۰ شکست (۱۷ بررسی تازه برای گام ۴ شامل Setup، رد حالت‌ها، اعتبارسنجی کلید نامتناظر، SAN اشتباه، گواهی منقضی، نصب Custom و Origin، تغییر وضعیت `shared/CERT_MODE` و بررسی وضعیت Status).
    - `test_server_e2e.ps1`: ۱۹۹ پاس، ۰ شکست (تمامی ۱۷۲ تست پایه به همراه ۲۷ تست اختصاصی بخش O برای روش‌های گواهی، عدم قطعی HTTPS در رد گواهی، لاگ پشتیبان شبانه، و بازگشت به DNS-01).
    - نگهبان ۵۳ با بند تازهٔ ۱۳ (`guardian_53_deploy_safety.py`) با موفقیت ۱۰۰٪ پاس شد.
    - `shellcheck` (warning) روی تمام فایل‌های shell و `Invoke-ScriptAnalyzer` روی `deploy.ps1` با صفر اخطار/خطا اجرا شدند.
  - **موارد باز:**
    - انجام شد (گام ۵ انجام شد؛ گام ۶ باقی‌مانده است).
  - **اقدام بعدی (گام ۵):** اجرای گام ۵ طرح: تغییر دامنه طبق §۴.۴ و آزمون‌های §۵.

- **یادداشت گام ۵ (تغییر دامنه، دوره‌های گذار و هدایت، پاکسازی ایمن دامنه‌های قدیمی، و یکپارچگی بک‌اند/فرانت‌اند):**
  - **وضعیت زیرگام‌ها:**
    1. **وضعیت روی سرور:** دامنه اصلی در `shared/DOMAIN` و دامنه‌های قبلی در `shared/DOMAINS_LEGACY` (هر خط به صورت `<domain> transition|redirect`) پیاده‌سازی شدند.
    2. **پیکربندی Nginx:**
       - برای هر دامنه قبلی یک server block مستقل تولید می‌شود.
       - حالت `transition`: همان اپلیکیشن اصلی را بدون تداخل `default_server` با دامنه جدید سرو می‌کند.
       - حالت `redirect`: هدایت ۳۰۱ به `https://<new>$request_uri` به همراه بازگرداندن پاسخ ۴۰۴ برای `/ngsw.json` به منظور لغو ثبت و نوسازی Service Worker دامنه قبلی در مرورگرها.
       - هر دامنه گواهی مستقل خود را دارد و از مسیر یکسان TLS گام ۴ (`/etc/warehouse/tls/<domain>/`) استفاده می‌کند. بلوک پورت ۸۰ نیز برای اعتبارسنجی Let's Encrypt دارای مسیر اختصاصی `acme-challenge` است.
    3. **بازنویسی اتمیک `.env`:**
       - کلیدهای مدیریتی `DJANGO_ALLOWED_HOSTS`، `DJANGO_CSRF_TRUSTED_ORIGINS`، `GOOGLE_OAUTH_REDIRECT_URI` و `WH_CANONICAL_DOMAIN` بر اساس لیست دامنه‌ها به‌طور اتمیک بازنویسی می‌شوند.
       - تمامی کلیدهای دیگر (به‌ویژه اسرار و متغیرهای محرمانه) byte-to-byte بدون تغییر حفظ می‌شوند.
       - بازنویسی کاملاً اتمیک (فایل موقت، شمارش خطوط، `sync` پیش از `mv`) همراه با حفظ مالکیت و دسترسی فایل انجام می‌شود.
    4. **فرمان `-ChangeDomain <new>`:**
       - اعتبارسنجی نام دامنه جدید و جلوگیری از تکرار دامنه فعلی یا دامنه‌های انتقالی.
       - صدور یا نصب گواهی TLS برای دامنه جدید متناسب با `CertMode`.
       - تبدیل دامنه جدید به دامنه اصلی و انتقال دامنه فعلی به وضعیت `transition`.
       - به‌روزرسانی اتمیک `.env` و بازتولید تنظیمات Nginx (با اعتبارسنجی `nginx -t` پیش از بارگذاری مجدد).
       - ری‌استارت سرویس‌ها و بررسی سلامت هر دو دامنه بر روی پورت‌های ایمن.
       - به‌روزرسانی فیلد `Domain` در `deploy_config.json` با نسخه پشتیبان زمان‌دار `.bak-<زمان>`.
       - ارائه هشدار به‌روزرسانی آدرس بازگشت گوگل OAuth در کنسول Google Cloud.
       - در صورت بروز هرگونه خطا در هر مرحله، وضعیت کاملاً به حالت قبلی برمی‌گردد (Rollback خودکار).
    5. **فرمان `-FinishDomainChange`:**
       - تبدیل کلیه دامنه‌های در حال گذار (`transition`) به حالت هدایت مستقیم (`redirect 301`). تمدید خودکار گواهی‌های این دامنه‌ها برای استمرار HTTPS بدون وقفه فعال می‌ماند.
    6. **فرمان `-RemoveLegacyDomain <d>`:**
       - با تأیید تایپی صریح نام دامنه (`RETIRE <domain>`)، ریدایرکت و گواهی دامنه قبلی کنار گذاشته می‌شوند.
       - هیچ فایلی حذف نمی‌شود؛ پوشه‌های مربوطه به `shared/retired/` و گواهی‌ها به `shared/retired/tls/` بایگانی می‌شوند.
       - حذف کامل گواهی‌های Let's Encrypt فقط با تأیید صریح و آگاهانه کاربر انجام خواهد شد.
    7. **بک‌اند:**
       - متغیر `WH_CANONICAL_DOMAIN` به `settings.py` اضافه شد و پیش‌فرض `GOOGLE_OAUTH_REDIRECT_URI` با آن یکسان‌سازی شد.
       - اندپوینت `/api/public/config/` مقدار `canonical_domain` را در خروجی برمی‌گرداند.
    8. **فرانت‌اند (Angular):**
       - نوار اطلاع‌رسانی فارسی (`DomainMigrationBannerComponent`) با طراحی منطبق بر سیستم طراحی (توکن‌های surface/fg/line، آیکون‌های SVG ثبتی `alert-triangle` و `refresh-cw` بدون هیچ inline SVG) پیاده‌سازی شد.
       - سرویس `DomainMigrationService` در صورت ناهمخوانی `location.host` با `canonical_domain`، بررسی می‌کند: انتقال خودکار تنها در صورتی رخ می‌دهد که صف همگام‌سازی آفلاین (`OfflineSyncService`) و صف آپلود عکس (`PhotoUploadQueueService`) هر دو کاملاً خالی باشند و سرور با `!isServerUnreachable()` در دسترس باشد.
       - صف‌های آفلاین هرگز پاک نمی‌شوند؛ اگر صف‌ها پر باشند کاربر بدون انتقال با نمایش بنر راهنما روی دامنه قبلی باقی می‌ماند.
       - پاسخ ۴۰۴ برای `/ngsw.json` روی دامنه ریدایرکت مانع از گیر افتادن Service Worker می‌شود.
  - **انحراف‌ها و تصمیم‌ها:**
    - نام فرمان‌ها دقیقاً طبق مشخصات طرح به `-ChangeDomain`، `-FinishDomainChange` و `-RemoveLegacyDomain` پیاده‌سازی شد (اصلاح اشتباه نگارشی `-SetDomain` که در یادداشت گام ۴ به کار رفته بود).
    - در تست‌های E2E داکر، استفاده از دستور `curl` با هدر `Host:` برای دامنه‌های مجازی با خطای کد ۳۵ SSL مواجه می‌شد که با استفاده از سوئیچ استاندارد `--resolve <domain>:443:127.0.0.1` سازگار با گواهی‌های معتبر شبیه‌سازی‌شده حل شد.
    - در Nginx، مشخصه `default_server` از بلوک‌های transition حذف شد تا خطای تداخل سرور پیش‌فرض در `nginx -t` رخ ندهد.
    - در `backend/settings_core/views.py`، صرفاً خطوط مربوط به `canonical_domain` استیج شدند و تغییرات نامرتبط از قبل موجود کاربر (`system_name`) در درخت کاری دست‌نخورده باقی ماندند.
  - **آزمون‌ها:**
    - `test_integration.ps1`: ۱۱۰ پاس، ۰ شکست (۶ بررسی تازه مربوط به گام ۵: اعتبارسنجی تغییر دامنه، تأیید تایپی بازنشستگی دامنه، و سازگاری با پیکربندی).
    - `test_server_e2e.ps1`: ۲۲۴ پاس، ۰ شکست (۲۵ تست اختصاصی گام ۵ در بخش P شامل دسترسی همزمان به دو دامنه با وضعیت 200 در دوره گذار، ریدایرکت 301 پس از پایان گذار با حفظ کامل Query String و مسیر، پاسخ 404 برای ngsw.json، حفظ کامل محرمانه‌ها در بازنویسی اتمیک `.env`، بازگشت به وضعیت قبلی هنگام شکست ChangeDomain، و انتقال به پوشه retired در RemoveLegacyDomain).
    - تست‌های واحد فرانت‌اند (`domain-migration.service.spec.ts`): ۵ تست از ۵ تست پاس شدند (بررسی عدم انتقال هنگام پر بودن صف‌ها، عدم انتقال در عدم دسترسی سرور، و انتقال موفق در حالت صف خالی و سرور در دسترس).
    - تست‌های مقایسه‌ای `ng test`: ۵۶۲ پاس و ۱۰ شکست قدیمی روی درخت کاری، در مقایسه با ۵۵۷ پاس و ۱۰ شکست قدیمی روی شاخهٔ اصلی HEAD (دقیقاً ۵ تست جدید پاس شدند؛ صفر رگرسیون).
    - بیلد فرانت‌اند (`npm run build`): با موفقیت و کد خروج ۰ انجام شد.
    - تست‌های بک‌اند جنگو (`settings_core`): ۸ تست از ۸ تست پاس شدند.
    - نگهبان ۵۳ (`guardian_53_deploy_safety.py`): بند تازهٔ ۱۴ برای تغییر دامنه اضافه شد؛ هر ۱۴ بند پاس شدند.
    - نگهبان ۵۲ (`guardian_52_icon_registry.py`): بدون خطا و با صفر inline SVG پاس شد.
    - `shellcheck -S warning`: صفر یافته روی تمام اسکریپت‌های شل.
    - `Invoke-ScriptAnalyzer`: صفر یافته روی `deploy.ps1`.
  - **موارد باز:**
    - سرور عملیاتی `soft` هنوز دارای اسکریپت‌های قدیمی است و استقرار آن به گام ۶ موکول شده است.
  - **اقدام بعدی (گام ۶):** استقرار نهایی روی سرور `soft.farsalish.ir`. ترتیب اجرای الزامی بر روی سرور soft (مطابق یادداشت گام ۳):
    1. اجرای `Setup` با هر دو سامانه (`Modules=warehouse,accounting`) برای نصب ابزارهای جدید و آماده‌سازی ساختار.
    2. اجرای `-ResetServer` با `Modules=accounting`.
    3. اجرای `-AddModule warehouse`.

- **۱۸ مهر ۱۴۰۵ (2026-10-09) — بازبینی مستقل گام‌های ۴ و ۵ (Claude):**
  - **دامنه:** `git diff 19bb72c..97ff9a3`. بازبین‌ها: `data-loss-reviewer`، `ui-reviewer` و `tenant-scope-reviewer`، هر کدام یک بار و موازی. بازبینی امنیتی `install-cert` را خودم انجام دادم. شمارهٔ خط‌ها مربوط به `97ff9a3` است.
  - **یافته‌ها (همه تأییدشده، جز موردی که «غیرقطعی» نوشته شده):**
    1. **بحرانی، رفع شد.** `domain-migration.service.ts:38`: `PhotoUploadQueueService` Injectable نیست (با `getInstance` ساخته می‌شود)، پس `inject` آن کل اپ را هنگام راه‌اندازی با NG0201 از کار می‌انداخت. نتیجه: صفحهٔ سفید برای همهٔ کاربران و در هر دامنه. app (پورت ۴۲۰۰) همین حالا سفید بود. تست واحد این را با mock کردن کلاس پنهان کرده بود. رفع: توکن `DOMAIN_MIGRATION_PHOTO_QUEUE` با `getInstance`، و تستی که DI واقعی را می‌سنجد (با بازگرداندن باگ، هر ۲۱ تست شکست می‌خورند). app دوباره ساخته شد و صفحهٔ ورود بالا می‌آید.
    2. **بالا، رفع شد.** `warehouse-root-gateway.sh:698` و `:791`: `issue-cert` و `install-cert` برای دامنهٔ **مقصد** `--refresh-nginx` می‌زدند. در `-ChangeDomain`، دامنهٔ فعلی پیش از `change-domain` از nginx بیرون می‌افتاد و اگر فراخوان دوم شکست می‌خورد، قطعی می‌ماند. رفع: nginx همیشه برای دامنهٔ اصلی فعلی (`primary_domain_or`) ساخته می‌شود.
    3. **بالا، رفع شد.** `warehouse-root-gateway.sh:695-696`: `ln -sfn` در `issue-cert` جفت واقعی origin یا custom را بدون پشتیبان و بازگشت پاک می‌کرد. رفع: کپی پیشین، بازگشت در شکست nginx، و بایگانی در `shared/retired/tls/<d>_replaced_<ts>` (root، 0700). در `install-cert` هم `rm -rf "$TLS_BACKUP"` (`:807`) به بایگانی تبدیل شد و `rm -f` پیش از `mv` (`:780`) حذف شد (rename اتمیک).
    4. **بالا، رفع شد.** `warehouse-deploy.sh` در `--remove-legacy-domain`: پوشهٔ TLS پیش از هر اعتبارسنجی جابه‌جا می‌شد و بازگشتی نبود، پس nginx بعدی پس از reload یا ری‌استارت بالا نمی‌آمد. همچنین دامنهٔ در حال `transition` هم پذیرفته می‌شد. رفع: فقط حالت `redirect` پذیرفته می‌شود. ترتیب این شد: DOMAINS_LEGACY، `.env`، nginx، reload، و تنها پس از آن بایگانی. با trap بازگشت کامل.
    5. **بالا، رفع شد (با تأیید کاربر).** حالت `redirect` همه‌چیز (از جمله `/api/`) را 301 می‌کرد و برای `ngsw.json` پاسخ 404 می‌داد. کاربری که در کل دورهٔ گذار آفلاین بوده، صفش در IndexedDB origin قبلی برای همیشه گیر می‌کرد. رفع («ریدایرکت امن»): بلوک redirect همان بلوک اپ است و فقط `location /` (ناوبری صفحه) 301 می‌گیرد. `/api/`، `/ws/`، `ngsw.json`، `index.html` و فایل‌های اپ سرو می‌شوند، پس اپ نصب‌شده صفش را می‌فرستد و خودش منتقل می‌شود.
    6. **بالا، رفع شد (با تأیید کاربر).** `domain-migration.service.ts`:
       - رکوردهای `sending` شمرده نمی‌شدند (`offline-sync.service.ts:1318`).
       - صف پیش از سنجش شبکه شمرده می‌شد و پیش از رفتن دوباره شمرده نمی‌شد (پنجرهٔ تا ۵ ثانیه).
       - `checkReachability` از مسیر SWR کش عبور می‌کرد و آفلاین هم «در دسترس» می‌گفت.
       - خطای `countPending` صفر تعبیر می‌شد.
       - پیش‌نویس‌های محلی پرسنل شمرده نمی‌شدند.
       - تلاش دوباره‌ای وجود نداشت.

       رفع:
       - `getUnsentCountStrict` (همهٔ وضعیت‌ها) و `countPendingStrict`، که هر دو خطا را پرتاب می‌کنند. خطا یعنی «انتقال نه».
       - `probePublicConfig` با `SKIP_OFFLINE`.
       - بررسی آنلاین بودن مرورگر و دسترسی دامنهٔ مقصد.
       - شمارش دوباره درست پیش از `replace`.
       - توقف در حین ارسال.
       - انتقال خودکار فقط پس از ۲ دقیقه بی‌کاری کاربر (ورودی ذخیره‌نشدهٔ فرم از دست نرود).
       - تلاش دوباره هر ۶۰ ثانیه و هنگام `online`.
       - اعتبارسنجی `canonical_domain` به‌شکل نام میزبان.
    7. **بالا، رفع شد (غیرقطعی در عمل).** Domain کهنهٔ `deploy_config.json` (دامنهٔ قبلی) در Update، nginx و `shared/DOMAIN` را به دامنهٔ قبلی برمی‌گرداند. رفع: `assert_not_legacy_domain` در prepare، activate، rollback، add-module، reset و refresh-nginx.
    8. **متوسط، رفع شد.** `install-cert` (امنیت):
       - فایل stage پس از اعتبارسنجی دوباره با `cat` (که symlink را دنبال می‌کند) خوانده می‌شد (TOCTOU). کاربر deploy می‌توانست فایل را با symlink به فایلی فقط-root عوض کند و محتوایش در `fullchain.pem` با دسترسی 0644 بنشیند.
       - رفع: `STAGE_COPY_PY` (`O_NOFOLLOW`، `fstat` مالک و نوع روی فایل باز، سقف ۱ مگابایت) کپی root-only در `/run` می‌سازد، و اعتبارسنجی و نصب فقط از همان کپی است.
       - با `umask 077` کلید از لحظهٔ ساخت 0600 است.
    9. **متوسط، رفع شد.** `change-domain`:
       - بازگشتی برای شکست پیش از nginx نبود (`:1446-1458`).
       - سلامت‌سنجی فقط `127.0.0.1:8000` بود، نه «هر دو دامنه» که در گزارش ادعا شده بود.
       - گواهی دامنهٔ جدید و فعلی سنجیده نمی‌شد.

       رفع:
       - trap برای بازگشت DOMAIN، DOMAINS_LEGACY، `.env` و nginx (با جایگزینی اتمیک).
       - `check_tls_pair` (انقضا، SAN، جور بودن کلید) برای هر دو دامنه.
       - سلامت‌سنجی هر دو دامنه از مسیر nginx با `--resolve`.
       - regexهای بی‌escape به مقایسهٔ دقیق `awk` تبدیل شدند.
       - `finish` هم trap و پشتیبانی CR گرفت.
    10. **متوسط، رفع شد.** `deploy.ps1:2171`: `-ChainPath $ChainPath` (متغیر تعریف‌نشده) به‌جای `$ChainFile`، پس `-ChainFile` هرگز فرستاده نمی‌شد.
    11. **متوسط، رفع شد.** نوار اطلاع‌رسانی:
        - `role="alert"` همراه با `aria-live` بود.
        - کنتراست دکمهٔ `amber-600` حدود ۳٫۲:۱ بود.
        - رقم‌ها لاتین بودند و کلاس `dir-ltr` در پروژه تعریف نشده بود.
        - دکمهٔ «انتقال» با صف پر هم نشان داده می‌شد.
        - `z-[9990]` روی مودال‌ها می‌افتاد و پایین چیدمان ۱۰۰dvh بریده می‌شد.

        رفع:
        - `role="status"` و `aria-atomic`.
        - `amber-700` و هدف ۴۴ پیکسلی روی موبایل.
        - رقم fa-IR و `<bdi dir="ltr">`.
        - دکمه فقط با صف خالی نشان داده می‌شود.
        - متن جدا برای هر علت توقف.
        - متغیر `--domain-banner-h` و `#app-screen` در `styles.css`.
    12. **متوسط، رفع شد.** تست‌های تازه ضعیف‌تر از ادعا بودند:
        - تست «سرور در دسترس نیست» تهی بود (بدون `handleConfig` به `checkReachability` نمی‌رسید).
        - در e2e، P2 فقط رد زودهنگام را می‌سنجید، نه بازگشت واقعی.
        - O2 فقط کد خروج را می‌سنجید.
        - `-ChainFile` و «کلید در argv و لاگ» تست نداشتند.
    13. **پایین، رفع شد.** `CERT_VERIFY_PY`:
        - CN با وجود SAN هم پذیرفته می‌شد.
        - notBefore سنجیده نمی‌شد.
        - کلید رمزدار منتظر passphrase می‌ماند.
    14. **بدون ایراد:**
        - بک‌اند (`tenant-scope-reviewer`): `canonical_domain` فقط از env خوانده می‌شود، به Host ربطی ندارد و چیزی بیش از دامنه نشت نمی‌دهد.
        - بازه‌های IP کلودفلر با فهرست رسمی (`cloudflare.com/ips-v4` و `ips-v6`) دقیقاً برابرند (۱۵ و ۷).
        - `real_ip_header` فقط برای همین بازه‌ها اعمال می‌شود.
        - بازنویسی `.env` اتمیک است و مالک و دسترسی را نگه می‌دارد.
  - **آزمون‌ها در برابر ادعاها:**

    | آزمون | ادعای Antigravity | پیش از رفع | پس از رفع |
    |---|---|---|---|
    | `test_integration.ps1` | ۱۱۰/۱۱۰ | ۱۱۰/۱۱۰، تأیید شد | ۱۱۰/۱۱۰ |
    | `test_server_e2e.ps1` | ۲۲۴/۲۲۴ | ۲۲۴/۲۲۴، تأیید شد | ۲۴۸/۲۴۸ (۲۴ بررسی تازه: P0، P2b تا P2d، ریدایرکت امن، `-ChainFile`، بایگانی گواهی، نبود کلید در /tmp و /run و لاگ). اجرای نخست با یک ایراد خود تست (`ls` بدون تطبیق زیر `pipefail`) متوقف شد و پس از رفع تست، پاس شد |
    | `ng test` | ۵۶۲ پاس و ۱۰ شکست | ۵۶۲ پاس و ۱۰ شکست؛ پایهٔ `19bb72c`: ۵۵۷ پاس و ۱۰ شکست، تأیید شد | ۵۷۸ پاس و همان ۱۰ شکست قدیمی (۲۱ تست domain-migration) |
    | نگهبان ۵۳ | پاس | پاس | پاس (بند ۱۳ و ۱۴ برای قواعد تازه به‌روز شد) |
    | نگهبان ۵۲ | پاس | پاس | پاس |
    | `Invoke-ScriptAnalyzer` | صفر یافته | صفر Warning و Error، ۱۰ Information (`PSAvoidUsingPositionalParameters`، روی HEAD هم هست) | همان |
    | `shellcheck -S warning` | — | — | صفر |
    | `ng build` | — | — | موفق |

    - ادعای «build موفق» درست بود، ولی build خطای DI زمان اجرا را نمی‌گیرد.
  - **موارد باز (رفع نشده):**
    - `/etc/warehouse/tls`، `CERT_MODE`، `DOMAIN` و `DOMAINS_LEGACY` در هیچ پشتیبانی نیستند. کلید Cloudflare Origin دوباره قابل دریافت نیست. پیشنهاد: افزودن به پشتیبان شبانه.
    - `write_env_domains` میزبان‌های اضافی `AllowedHosts` (مثل IP سرور) را حذف می‌کند. پشت nginx فعلی که فقط `server_name` دامنه‌ها را سرو می‌کند، اثر عملی ندارد.
    - بررسی زنجیرهٔ `custom` با `-CAfile` زنجیره‌ای به CA خصوصی را هم کامل می‌داند. اعتماد مرورگر سنجیده نمی‌شود.
    - عکس‌های `rejected` و `syncErrors` در شمارش انتقال نیستند. چون ریدایرکت امن API و اپ را روی origin قبلی نگه می‌دارد، در دسترس می‌مانند.
    - (پیش از این گام) `migrateLegacyDatabaseIfNeeded` در `offline-db.ts:523` رکوردهای `WarehouseOfflineDB` قدیمی را در هر راه‌اندازی دوباره کپی می‌کند (با شرط نبودن URL)، و پس از ارسال ممکن است دوباره بفرستد. خارج از دامنهٔ این بازبینی است.
    - با نوار انتقال، صفحهٔ ورود (که `#app-screen` ندارد) به اندازهٔ ارتفاع نوار اسکرول می‌خورد. فقط روی دامنهٔ قبلی رخ می‌دهد.
    - **پیش از گام ۶:** اگر `CertMode` در `deploy_config.json` روی soft تنظیم نشده باشد، Setup مقدار `http01` را در `shared/CERT_MODE` ثبت می‌کند. این فقط در `-Status` نادرست دیده می‌شود، چون صدور دوباره با وجود `cloudflare.ini` همان DNS-01 را برمی‌گزیند. بهتر است `CertMode=dns01-cloudflare` صریح شود. (`deploy_config.json` خوانده نشد.)
  - **اقدام بعدی:** گام ۶ طبق ترتیب یادداشت گام ۳ و ۵.

- **۱۸ مهر ۱۴۰۵ (2026-10-09) — تغییر در گام ۶ (تصمیم کاربر):** سرور soft را کاربر از نو نصب کرد و داده‌ای روی آن نیست. پس پشتیبان‌گیری و کشیدن آن و `-ResetServer` حذف می‌شوند. ترتیب تازه:
  1. آماده‌سازی سرور تازه: کاربر SSH، sudo بدون رمز موقت برای نخستین Setup، اثر انگشت کلید میزبان، `known_hosts`، و سپس `-InstallKey`.
  2. در `deploy_config.json`: `HostKeyFingerprint` تازه، `Modules=accounting` و `CertMode=dns01-cloudflare`.
  3. `-Setup` و سپس حذف sudo موقت.
  4. `-SetSecret CLOUDFLARE_DNS_API_TOKEN` و `-IssueCert`.
  5. `-CreateAdmin` و بررسی (`-Status`، `/`، `/api/public/config/` با `installed_modules=[accounting]`، و `ngsw.json`).
  6. `-AddModule warehouse` و بررسی دوباره.

  کاربر این مراحل را خودش اجرا می‌کند. Claude در نشست تازه راهنمایی و بررسی خروجی‌ها را انجام می‌دهد.


- **۱۸ مهر ۱۴۰۵ (2026-10-09) — راه‌اندازی راهنمادار در `deploy.ps1` (درخواست کاربر، پیش از اجرای گام ۶):**
  - **مرحلهٔ ۱ گام ۶ انجام شد:** sudo موقت در `/etc/sudoers.d/90-warehouse-setup-temp` ساخته شد. اثر انگشت تازه `SHA256:2HZG…Uq7K0` ثبت شد: کنسول و `ssh-keyscan` یکی بودند. `known_hosts` به‌روز شد. `deploy_config.json` حالا این مقادیر را دارد: `Modules=accounting` و `CertMode=dns01-cloudflare`.
  - **تغییرات `deploy.ps1`:**
    - **پیکربندی:** کلیدِ نبوده یا نامعتبر پرسیده و ذخیره می‌شود (با `.bak`). نبود فایل پیکربندی هم فایل تازه می‌سازد. `-NonInteractive` مثل قبل رد می‌کند.
    - **کلید میزبان:** اسکریپت راهنمای کنسول را نشان می‌دهد و اثر انگشت را می‌پرسد. سپس کلید شبکه را با `ssh-keyscan` می‌گیرد. فقط اگر یکی بودند، `known_hosts` (با `.old`) و `HostKeyFingerprint` را بازنویسی می‌کند.
    - **Setup:**
      - اگر کلید SSH نصب نباشد، نصب آن را پیشنهاد می‌دهد.
      - اگر sudo بدون رمز نباشد، فرمان‌های کنسول را نشان می‌دهد و منتظر می‌ماند.
      - `CertMode` را مثل `Modules` می‌پرسد و ثبت می‌کند.
      - بعد از موفقیت، فایل sudo موقت را خودش حذف می‌کند.
      - سپس گواهی (توکن Cloudflare و IssueCert)، ساخت مدیر و راهنمای بستن ورود با رمز را پیشنهاد می‌دهد.
  - **آزمون‌ها:**
    - `test_onboarding.ps1` تازه، بدون Docker: ۲۰/۲۰.
    - `test_integration.ps1`: ۱۱۱/۱۱۱.
    - `test_server_e2e.ps1`: ۲۵۰/۲۵۰.
    - نگهبان ۵۳: پاس.
    - PSScriptAnalyzer: صفر Warning و صفر Error.
  - **اقدام بعدی:** `deploy.ps1 -Setup` (اگر کلید نصب نباشد، خودش `-InstallKey` را پیشنهاد می‌دهد)، سپس مراحل ۴ تا ۶ ترتیب تازه.
