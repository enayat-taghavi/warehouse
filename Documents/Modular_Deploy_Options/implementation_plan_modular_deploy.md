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
