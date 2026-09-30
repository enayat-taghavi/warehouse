# قوانین و معماری پروژه

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER add a `Co-Authored-By` trailer to user commits
- Validate input at system boundaries

## مجوزها و حالت کاری

- مجوزها **bypass** هستند: در `.claude/settings.local.json` پروژه و در `~/.claude/settings.json` سراسری، `permissions.defaultMode` برابر `bypassPermissions` است (`skipDangerousModePermissionPrompt: true`). برای دستورها و ویرایش‌ها تأیید اضافه از کاربر نخواه.
- تنها استثنا که عمداً حفظ شده: ردِ خواندن `.env` / `.env.*` در `.claude/settings.json`. این quiet است (اعلان نمی‌سازد) و برای جلوگیری از درزِ کلیدهاست. فقط با درخواست صریح کاربر حذف شود.
- کار فقط روی شاخهٔ `main` در پوشهٔ اصلی `E:/warehouse project`. بدون اجازهٔ کاربر شاخه یا worktree جدید نساز؛ حتی اگر سشن داخل worktree باز شد، ویرایش‌ها را با مسیر مطلق روی main انجام بده.

## ساختار مخزن (monorepo)

- `warehouse-backend/` — بک‌اند Django (با `venv/`). پیکربندی در `warehouse-backend/config/` (`settings.py`, `urls.py`, `asgi.py`, `wsgi.py`).
- `warehouse-front/` — فرانت Angular (`src/app/`). سرویس‌های کلیدی در `src/app/core/services/`.
- `scripts/` — اسکریپت‌های نگهبان/آزمون (`scripts/e2e/`).
- `Documents/Modular_Split_Warehouse_Accounting/` — مستندات و چک‌لیست جداسازی ماژول‌ها.
- `pyproject.toml` — بستهٔ چتر توسعه‌ای `wh-suite` (فقط dev؛ `import-linter==2.3` dev).

### اپ‌های بک‌اند (Django)

`accounts`, `common`, `communications`, `config`, `inventory`, `notifications`, `personnel`, `reports`, `settings_core`, `warehouses`.

- `config` — تنظیمات و بوت سیستم. `AUTH_USER_MODEL` موضوعِ جداسازی است؛ در نگهبان‌ها گاه `auth.User`.
- `settings_core` — اپ پلتفرمی که از `warehouses` جدا شد؛ مدل `SystemSetting` با `db_table='warehouses_systemsetting'`. توابع تنظیمات در `settings_core/services.py`؛ shim در `warehouses/services.py`؛ Viewsetها در `settings_core/views.py`. کلید `installed_modules` در `/api/public/config/`.
- `warehouses` — هستهٔ انبار. `Warehouse.assigned_users` (M2M، `db_table='accounts_customuser_assigned_warehouses'`). `management/commands/setup_project.py`.
- `accounts` — کاربران و حسابداری. `AuditLog.warehouse_id` عددی (IntegerField) با همان ستون/ایندکس قبلی؛ رجیستری `AUDIT_MODULES` در `accounts/models.py`.
- `personnel` — ماژول‌های حسابداری (attendance/fleet/payroll/treasury/projects/invoices) که در `personnel/apps.py` ثبت می‌شوند.
- `communications` — چت.
- `reports` — موتور گزارش‌ساز (در `reports/`؛ فایل‌های `engine.py`, `registry.py`, `views.py`, `pdf.py`).

## معماری فرانت (Angular)

- سرویس‌های حیاتی در `src/app/core/services/`: `offline-db.ts`, `offline-sync.service.ts`, `server-reachability.ts`, `sync-pull.service.ts`, `network-status.service.ts`, `photo-upload-queue.service.ts`, `session-tab.service.ts`, `system-health.service.ts`, `import.service.ts`, `communication.service.ts`.
- آفلاین/PWA: Service Worker انگولار با وصلهٔ پس از build در `tools/patch-ngsw-530.js` که در `npm run build` اجرا می‌شود (build مستقیم `ng build` وصله را جا می‌اندازد — همیشه `npm run build`).

## قواعد سخت و تصمیم‌های پذیرفته‌شده

- **هیچ داده‌ای نباید از بین برود.** کش منقضی‌شده پاک نمی‌شود، فقط `isStale` گزارش می‌شود. رکورد صف همگام‌سازی فقط با پذیرش صریح سرور (2xx) یا رد صریح (4xx) حذف می‌شود؛ 5xx یعنی retry، نه حذف. هر تغییری که مسیر از-دست-رفتن داده باز کند قبل از اعمال باید مطرح شود.
- **پشت Cloudflare Tunnel** (`app.farsalish.ir`): کدهای ۵۲۰–۵۳۰ یعنی origin در دسترس نیست، نه خطای بک‌اند. جای دیباگ خطای عملیاتی، اول بررسی کن خطا از Cloudflare است یا Django. تفسیر وضعیت HTTP باید از `isServerUnreachable()` در `core/services/server-reachability.ts` استفاده کند، نه `status >= 500` یا `status === 0`.
- **تصمیم‌های آگاهانهٔ کاربر (در ممیزی به‌عنوان ایراد گزارش نشوند):** فهرست مخاطبین چت (`ChatContactsListView` در `communications/views.py`) عمداً همهٔ کاربران فعال را برمی‌گرداند و به انبار محدود نمی‌شود؛ و کاربران احراز هویت‌شده سقف نرخ کلی ندارند (فقط `AnonRateThrottle` و `ScopedRateThrottle` فعال‌اند) تا پشت تونل قفل نشوند.
- **جستجوی متن فارسی هرگز با `grep` در Bash** — Git Bash ویندوز UTF-8 را مخدوش می‌کند؛ از ابزار Grep استفاده کن.
- **گذرواژه/صفحات پشت ورود را خودم نمی‌بینم** — تأیید نهایی هر چیزی پشت صفحهٔ ورود (داشبورد، انبارها، شمارش) با کاربر است. تا جایی که ممکن است با شبیه‌سازی سمت سرور یا روی صفحهٔ لاگین تأیید کن و صریح بگو چه چیزی تأییدنشده مانده و کاربر چطور خودش بیازماید.
- **همهٔ کارها را خودت انجام بده** (از ۳۰ سپتامبر ۲۰۲۶): کاربر هیچ دستوری اجرا نمی‌کند، حتی بیلد، ری‌استارت، git و نصب. برای اجرای کاربر دستور آماده نده.
  - فقط پیش از کاری که مستقیم روی محیط عملیاتی اثر دارد (بند بعد) یا مسیر از دست رفتن داده باز می‌کند، یک سؤال کوتاه بله/خیر بپرس.
  - پاسخ‌ها کوتاه و فارسی بمانند.
- **همین ماشین محیط عملیاتی است.** `cloudflared`، بک‌اند daphne (پورت 8000) و فرانت express (پورت 4200، سروِ `warehouse-front/dist/`) همین‌جا اجرا می‌شوند. دیتابیس محلی هم همان دیتابیس عملیاتی است. پس بیلد فرانت، ری‌استارت بک‌اند و `migrate` مستقیماً روی کاربران واقعی اثر دارند.

## جداسازی ماژول‌ها (modular split)

طرح «انبارگردانی و حسابداری به دو ماژول نصب‌شدنی مستقل». مرجع: `Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md`؛ چک‌لیست `task_modular_split.md`؛ walkthrough هر فاز `walkthrough_phaseN.md`.

- **فاز ۰:** حصار C1–C4 در `.importlinter`، چتر dev `wh-suite`، نگهبان ۲۹ (`scripts/e2e/guardian_modularization.py`)، baseline `modularization_baseline.json`.
- **فاز ۱:** اپ `settings_core`؛ `SystemSetting` منتقل شد (صفر مهاجرت داده)؛ ستون `warehouse_id` عددی؛ رفتار CASCADE با سیگنال `post_delete` در `warehouses/signals.py`.
- **فاز ۲:** بریدن یال‌های هسته → انبار (expand-contract صفر مهاجرت داده): M2M `assigned_warehouses` به `warehouses`؛ `AuditLog.warehouse_id` عددی؛ رجیستری `AUDIT_MODULES`؛ `setup_project.py` به `warehouses/management/commands/`. مهاجرت‌ها در ۹ سپتامبر ۲۰۲۶ ادغام (squash) شدند (commit `4247d0c`)، پس شماره‌های قدیمی مثل `accounts/0035` دیگر وجود ندارند.
- **فاز ۳ به بعد** اجرا شده‌اند: `INSTALLED_APPS` از رجیستری `platform_core/module_catalog.py` ساخته می‌شود و متغیر `WH_MODULES` پروفایل تک‌ماژولی می‌سازد.

## دستورها و ابزارها

- اجرای `lint-imports` نیازمند `PYTHONUTF8=1` است (فارسی در فایل‌های config). حالت خروجی `lint-imports` عمداً report-only با کد ۱ است؛ دروازهٔ واقعی نگهبان ۲۹ است که شمار نقض‌ها را با baseline مقایسه می‌کند و فقط در صورت *افزایش* شکست می‌خورد.
- نگهبان‌ها: `python scripts/e2e/guardian_all.py` همه را اجرا می‌کند: فاز ۱ تا ۵، نگهبان ۲۹ (`guardian_modularization.py`) و هر `guardian_NN_*.py`، که خودکار پیدا می‌شوند. نگهبان ۳۲ در commit `2f9855b` حذف شد. نگهبان‌های فاز ۱ تا ۵ دادهٔ E2E (مثل `E2E-ITEM-01`) لازم دارند و روی دیتابیس عملیاتی رد می‌شوند؛ برای پاس شدنشان هرگز دادهٔ آزمایشی در دیتابیس عملیاتی نساز.
- تست: `./venv/Scripts/python.exe manage.py test ...`. دیتابیس تست postgres در دسترس نیست؛ اگر تستی اجرا نشد، صریح گزارش بده.
- چک: `./venv/Scripts/python.exe manage.py check`.
- تنظیمات محرمانهٔ بک‌اند (`DJANGO_SECRET_KEY`، `DJANGO_DEBUG`) در `warehouse-backend/.env` است. این فایل بیرون از git است و `settings.py` آن را می‌خواند؛ متغیر محیط سیستم بر آن مقدم است. آن را نخوان.
- **انتشار روی همین ماشین** (پیش از آن یک بله/خیر از کاربر بگیر):
  1. پشتیبان بگیر با `create_database_backup` از `accounts/backup_service.py`. `run_auto_backup` را اجرا نکن، چون پشتیبان‌های قدیمی را پاک می‌کند.
  2. بیلد فرانت در `warehouse-front`: `npx ng build --delete-output-path=false && node tools/patch-ngsw-530.js`. این فلگ نمی‌گذارد فایل‌هایی که همین حالا سرو می‌شوند وسط بیلد پاک شوند.
  3. ری‌استارت بک‌اند: پروسهٔ daphne پورت 8000 و لانچر venv آن را با `taskkill` ببند. بعد در یک تب Windows Terminal دوباره اجرا کن تا به جلسهٔ Claude وابسته نباشد:
     `MSYS_NO_PATHCONV=1 wt.exe -w 0 new-tab -d "E:\warehouse project\warehouse-backend" --title "Backend Daphne" cmd /k ".\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application"`
  4. بررسی کن: `https://app.farsalish.ir/` و `https://app.farsalish.ir/api/public/config/` باید 200 بدهند.
- اتوماسیون Claude Code:
  - هوک‌ها در `.claude/settings.json` با اسکریپت `.claude/hooks/guard.py`
  - ساب‌ایجنت‌های `data-loss-reviewer` و `tenant-scope-reviewer` در `.claude/agents/`
  - اسکیل `safe-migration` در `.claude/skills/`
