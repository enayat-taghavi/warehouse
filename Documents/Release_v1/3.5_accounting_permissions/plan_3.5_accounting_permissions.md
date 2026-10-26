<div dir="rtl" align="right">

# طرح جزئی ۳.۵ — فهرست نهایی مجوزهای ریز حسابداری و بسته‌های نقش

- **تاریخ:** ۵ آبان ۱۴۰۵ (۲۷ اکتبر ۲۰۲۶)
- **طرح مادر:** `Documents/Release_v1/release_v1_master_plan.md`، مرحلهٔ ۳، ردیف ۳.۵ و قانون ق۶؛ پایه: طرح ۲.۲ (`Documents/Release_v1/2.2_permissions/plan_2.2_permissions.md`، ت۱ تا ت۱۳، به‌ویژه ت۵)
- **وضعیت:** طرح نوشته شد (زیرمرحلهٔ ۳.۵-الف، زنجیرهٔ خودکار مرحلهٔ ۳). طبق تصمیم کاربر بدون انتظار برای تأیید اجرا می‌شود.

## ۰. قانون‌های مرتبط

- ق۶: برای هر کار اصلی یک مجوز ریز و فقط یک تیک؛ پنج نقش انتساب (کارمند، سرپرست، حسابدار، مدیر، خزانه‌دار) هر کدام یک بستهٔ آماده‌اند؛ «چه کاری» از مجوز، «کجا» از انتساب.
- ت۵ طرح ۲.۲: مجوز جداگانهٔ منو لازم نیست؛ منو با داشتن دست‌کم یک مجوز همان دسته دیده می‌شود. حذف مجوزهای منوی حسابداری کار همین مرحله است.
- ق۱ و گام ۷ ماژول‌سازی: مجوزها فقط در `modules/accounting/module.py` اعلام می‌شوند؛ هسته نام مجوز ماژول را نمی‌برد (نگهبان‌های 29 و 57، `module_coupling_scan.py`). ماژول دیگر (انبار) فقط از راه `permission_aliases` به مجوز حسابداری اشاره می‌کند.
- ردیف مجوز فقط ساخته می‌شود و هرگز حذف نمی‌شود (`accounts/module_permissions.py`).
- ق۲ و حافظهٔ «دادهٔ فعلی ارزشی ندارد»: کار ساده می‌ماند؛ با این حال هیچ انتسابی نباید بی‌جانشین از کار بیفتد (ص۶).

## ۱. وضع فعلی (بررسی کد، ۵ آبان ۱۴۰۵)

- **ک۱:** `ACCOUNTING_PERMISSIONS` (`backend/modules/accounting/module.py:97-123`) ۲۳ مجوز بخشی در ۸ دسته دارد (`:79-88`). سهم بسته‌ها در همین اعلام است (`defaults`) و `default_bundles()` در `core/accounts/scoped_permissions.py:79` آن را می‌خواند؛ تفاوت بسته‌ها در `RoleBundleOverride` و تفاوت کاربر در `UserPermissionOverride` (هر دو FK به `Permission`).
- **ک۲ — مجوزهای منو یا نشانهٔ نقش (کار مستقلی ندارند):**
  - دستهٔ `work_roles`: `can_act_as_operator`، `can_act_as_workshop_supervisor`، `can_act_as_accountant`، `can_act_as_company_manager`. هر جا خوانده می‌شوند، کنار یک مجوز کار واقعی به‌شکل «یا» می‌آیند (`lifecycle_services.py:405-409`، `fleet_lifecycle_services.py:59-74`، `permissions.py:30`، `serializers_domains/helpers.py:40-43`، `role_resolver.py:14-24`)؛ یا فقط منو را باز می‌کنند (`frontend/.../accounting/nav-items.ts:24-29,53-59`، `route-access.ts`).
  - `view_sys_treasury`: فقط کارتابل خزانه را باز می‌کند و همیشه کنار `perm_treasury_disburse_action` است (`workflow_engine.py:135`، `permissions.py:184`، `counterparty_services.py:20`).
  - مجوزهای `view_sys_*` دیگر (کارکرد پرسنل و ناوگان، حقوق، تسویهٔ ناوگان، پرونده‌ها) هرچند نامشان «دیدن» است، در عمل همان کار اصلی آن دسته‌اند و در سرور جلوی کار را می‌گیرند؛ نامشان می‌ماند و فقط برچسب فارسی‌شان دقیق می‌شود.
- **ک۳ — جاهای نادرست:**
  - گردش فاکتور (`personnel/workflows.py:62-66`) تأیید سرپرست را با `can_act_as_workshop_supervisor` و بررسی حسابدار را با `can_act_as_accountant` می‌سنجد، یعنی یک نشانهٔ نقش جای مجوز کار نشسته است.
  - منوی «تأیید فاکتورها» و «تأیید تنخواه» سرپرست و صفحه‌های ممیزی فاکتور و تنخواه حسابدار با `view_sys_payroll` باز می‌شوند (`nav-items.ts:35-36,44-45`، `route-access.ts:49-50`).
  - طرف‌حساب‌ها با `can_act_as_accountant`، `view_sys_treasury` یا `perm_treasury_disburse_action` کامل دیده می‌شوند (`counterparty_services.py:20`) و صفحه‌شان با `view_sys_payroll` (`route-access.ts:33,52`).
- **ک۴ — داده‌ای که کد مجوز را نگه می‌دارد:** `core/workflow/models.py:101` (`permission`، متن) برای هر مرحلهٔ گردش؛ `RoleBundleOverride` و `UserPermissionOverride` (FK).
- **ک۵ — اشاره‌های بیرونی:** `contribute('permission_aliases:count_supervisor_exclusion', 'can_act_as_workshop_supervisor')` (`personnel/apps.py:121`) و `permissionAliases` در `frontend/src/app/modules/accounting/module.ts:443-446`؛ تست `integration_tests/test_permission_aliases.py`. نشانه‌های ماژول: `permission_markers` (`module.py:11-31`) و `permissionMarkers` و `guardAccessPermissions`/`loginPermissions` فرانت (`module.ts:41-48`، `route-access.ts:6-13,63-68`).
- **ک۶ — حوزه‌های لایهٔ شرکت** (دوره‌های مالی، حساب بانکی شرکت، سرفصل‌های هزینه، بیمه و مالیات) مجوز بخشی ماژول نیستند و با بخش‌های مجوز شرکت (`COMPANY_PERMISSION_SECTIONS` در `personnel/company_access.py:23-49`) و سطح خواندن و نوشتن کار می‌کنند. این‌ها در ۳.۱ تا ۳.۴ تازه ساخته شده‌اند و در ۳.۵ دست نمی‌خورند.

## ۲. تصمیم‌ها

- **ص۱ — کدها عوض نمی‌شوند، فقط حذف یا افزوده می‌شوند.** نام کدهای مانده (حتی `view_sys_*`) ثابت می‌ماند تا ردیف‌ها، تفاوت‌ها، تست‌ها و نشانه‌ها نشکنند؛ برچسب فارسی نشان می‌دهد هر کد چه کاری را باز می‌کند.
- **ص۲ — حذف پنج مجوز منو و نشانهٔ نقش** (ک۲): `can_act_as_operator`، `can_act_as_workshop_supervisor`، `can_act_as_accountant`، `can_act_as_company_manager`، `view_sys_treasury`. از `ACCOUNTING_PERMISSIONS`، `ACCOUNTING_PERMISSION_CODENAMES`، `permission_markers` و دستهٔ `work_roles` برداشته می‌شوند و در یک ثابت تازهٔ `REMOVED_PERMISSION_CODENAMES` با جانشینشان (ص۶) می‌مانند. ردیف `Permission` آن‌ها در پایگاه داده می‌ماند (قاعدهٔ فقط‌ساختن) ولی دیگر در فهرست مجوزها، بسته‌ها و منوها نیست. هر جای کد که آن‌ها را می‌خواند به جانشین می‌رود؛ «یا»های دوتایی یک‌تایی می‌شوند.
- **ص۳ — سه مجوز تازه** (بخشی، دستهٔ خودشان):
  - `perm_invoice_approve` «تأیید سرپرست برای فاکتور و تنخواه» (دستهٔ `invoices`)؛
  - `perm_invoice_review` «بررسی حسابدار برای فاکتور و تنخواه» (دستهٔ `invoices`)؛
  - `perm_counterparty_manage` «مدیریت و دیدن کامل طرف‌حساب‌ها» (دستهٔ تازهٔ `counterparties`، منوی `accountant-counterparties`).
  - گردش فاکتور: `supervisor_ok` → `perm_invoice_approve`، `accountant_review` → `perm_invoice_review`؛ `manager_ok` و `treasury_pay` همان `perm_manager_payment_authorize` و `perm_treasury_disburse_action` می‌مانند. تأیید و بررسی تنخواه هر جا با همان نشانه‌های نقش سنجیده می‌شود، به همین دو مجوز می‌رود.
  - `FULL_VIEW_SECTION_PERMS` = `('perm_counterparty_manage',)`. اجراکننده پیش از تغییر `counterparty_services.py` را می‌خواند؛ اگر نوشتن طرف‌حساب سنجش دیگری دارد، با همین مجوز یکی می‌شود.
- **ص۴ — فهرست نهایی (۲۱ مجوز، همه بخشی، هیچ‌کدام حساس نیست):**

| دسته (کلید، منو) | مجوز | برچسب فارسی تازه | بسته‌ها |
|---|---|---|---|
| `attendance` (`employee-attendance`) | `view_sys_personnel_attendance` | ثبت کارکرد و تعریف پرسنل | کارمند، سرپرست |
| | `view_sys_fleet_attendance` | ثبت تردد ناوگان و تعریف خودرو | کارمند، سرپرست |
| `personnel` (`profiles`) | `view_sys_personnel` | مدیریت پرونده‌های پرسنل و ناوگان | مدیر |
| | `perm_delete_personnel_nomovement` | حذف پرسنل بی سابقهٔ کارکرد و مالی | مدیر |
| | `perm_delete_vehicle_nomovement` | حذف خودروی بی سابقهٔ کارکرد و مالی | مدیر |
| `approvals` (`manager-approvals`) | `perm_approve_personnel_supervisor` | تأیید سرپرست برای کارکرد و پروندهٔ پرسنل | سرپرست |
| | `perm_approve_fleet_supervisor` | تأیید سرپرست برای تردد و پروندهٔ ناوگان | سرپرست |
| | `perm_approve_personnel_finance` | تأیید مالی پرسنل | حسابدار |
| | `perm_approve_fleet_finance` | تأیید مالی ناوگان | حسابدار |
| | `perm_approve_personnel_manager` | تأیید مدیر برای پرسنل | مدیر |
| | `perm_approve_fleet_manager` | تأیید مدیر برای ناوگان | مدیر |
| | `perm_lock_work_period` | بستن دورهٔ کارکرد ماهانه | سرپرست، مدیر |
| `payroll` (`accountant-payroll`) | `view_sys_payroll` | محاسبهٔ حقوق، دیسکت بیمه و مالیات و تنظیمات پایهٔ حقوق | حسابدار، مدیر |
| | `view_sys_fleet_settlement` | تسویهٔ مالی ناوگان | حسابدار، مدیر |
| `treasury` (`treasurer-disbursements`) | `perm_manager_payment_authorize` | صدور مجوز پرداخت (مدیر) | مدیر |
| | `perm_treasury_disburse_action` | پرداخت و تسویهٔ خزانه‌داری | خزانه‌دار |
| `invoices` (`employee-invoices`) | `perm_invoice_record` | ثبت و دیدن فاکتور | هر پنج نقش |
| | `perm_invoice_approve` (تازه) | تأیید سرپرست برای فاکتور و تنخواه | سرپرست |
| | `perm_invoice_review` (تازه) | بررسی حسابدار برای فاکتور و تنخواه | حسابدار |
| `petty_cash` (`supervisor-petty-cash`) | `perm_petty_cash_manage` | مدیریت تنخواه | سرپرست، حسابدار، مدیر، خزانه‌دار |
| `counterparties` (`accountant-counterparties`، تازه) | `perm_counterparty_manage` (تازه) | مدیریت و دیدن کامل طرف‌حساب‌ها | حسابدار، خزانه‌دار |

  - بسته‌ها رفتار امروز را نگه می‌دارند: هر نقش جانشین نشانهٔ نقش قبلی‌اش را دارد. مدیر امروز طرف‌حساب را کامل نمی‌بیند و همین می‌ماند (مدیر کل سامانه می‌تواند بسته را تغییر دهد).
  - برچسب دقیق نهایی و توضیح هر دسته را اجراکنندهٔ ۳.۵-ب می‌نویسد؛ معنای جدول ثابت است.
- **ص۵ — نقشهٔ جانشین در کد:**
  - `can_act_as_operator` → `view_sys_personnel_attendance` (صفحه‌های تعریف خودرو → `view_sys_fleet_attendance`)؛
  - `can_act_as_workshop_supervisor` → `perm_approve_personnel_supervisor` در کارکرد و پرونده، `perm_approve_fleet_supervisor` در ناوگان، `perm_invoice_approve` در فاکتور و تنخواه؛
  - `can_act_as_accountant` → `perm_approve_personnel_finance` (و `perm_approve_fleet_finance` در ناوگان)، `perm_invoice_review` در فاکتور و تنخواه، `perm_counterparty_manage` در طرف‌حساب؛
  - `can_act_as_company_manager` → `perm_approve_personnel_manager` (و `perm_approve_fleet_manager` در ناوگان؛ داشبورد، بودجه و گزارش مدیر با `perm_manager_payment_authorize`)؛
  - `view_sys_treasury` → `perm_treasury_disburse_action`؛ صفحهٔ حساب‌های بانکی خزانه با `perm_treasury_disburse_action` یا سطح خواندن `bank` شرکت.
  - نام مستعار `count_supervisor_exclusion` (انبار) → `perm_approve_personnel_supervisor`، هم در `apps.py` و هم در `module.ts`؛ نام‌های مستعار دیگری که کد حذف‌شده را دارند (مثل `manager_approver`) هم پاک‌سازی می‌شوند.
  - `role_resolver.py` (نقش فعال از روی مجوزها) با همین جانشین‌ها بازنویسی می‌شود.
- **ص۶ — انتقال تفاوت‌ها بی از دست رفتن دسترسی:** migration دادهٔ افزودنی تازه در `personnel` (شمارهٔ بعدی پس از `0012`) با `RunPython` (معکوس `noop`):
  - ردیف `Permission` سه مجوز تازه را با `get_or_create` روی نوع محتوای `accounts.customuser` می‌سازد (چون `post_migrate` بعد از migrationها اجرا می‌شود).
  - برای هر ردیف `RoleBundleOverride` و `UserPermissionOverride` روی کد حذف‌شده، همان ردیف را با همان `mode` (و همان شرکت در تفاوت کاربر) برای **همهٔ** جانشین‌هایش در ص۵ می‌سازد، اگر نبود (`get_or_create`). ردیف قدیمی **پاک نمی‌شود**؛ فقط بی‌اثر است.
  - `permission` مرحله‌های باز گردش (`core/workflow/models.py:101`) که کد حذف‌شده دارند به کد تازهٔ همان مرحله (ص۳) به‌روز می‌شود؛ این تغییر متن است، نه حذف.
  - پس هیچ مسیر از دست رفتن داده یا دسترسی باز نمی‌شود و پرسش از کاربر لازم نیست؛ `safe-migration` و `data-loss-reviewer` روی diff ۳.۵-ب آن را تأیید می‌کنند. اعمال روی `app` با بررسی سنگین مرحلهٔ ۳.
- **ص۷ — جلوگیری از بازگشت:** تست تازه در `personnel` همهٔ فایل‌های `.py` ماژول حسابداری (بی migrationها و خود `REMOVED_PERMISSION_CODENAMES`) و `ts`/`html` فرانت حسابداری (بی spec) را برای کدهای حذف‌شده می‌گردد و باید صفر بیابد؛ بستهٔ پیش‌فرض هر نقش با جدول ص۴ برابر است؛ هیچ مجوز اعلام‌شده بی دسته نیست و هر دسته منو دارد یا عمداً ندارد. شمار نگهبان 58 (`has_perm` روی مجوز بخشی) فقط کم می‌شود؛ اگر کم شد، مبنا پایین می‌آید.
- **ص۸ — فرانت (۳.۵-ج):**
  - `nav-items.ts`: `permission` هر آیتم مجوز کار همان صفحه می‌شود (ص۵؛ مثلاً «تأیید فاکتورها» → `perm_invoice_approve`، «ممیزی فاکتورها» و «رسیدگی تنخواه» → `perm_invoice_review`، «طرف‌حساب‌های مالی» → `perm_counterparty_manage`، صفحه‌های خزانه → `perm_treasury_disburse_action`). `*_ROLE_MARKERS` (`nav-items.ts:72-75`) بی کدهای حذف‌شده.
  - `route-access.ts`: `guardAccessPermissions`، `pagePermissions` و `loginPermissions` فقط کدهای فهرست ص۴ (و مجوزهای هسته و نام‌های مستعار موجود).
  - `module.ts`: `permissionMarkers` برابر `permission_markers` بک‌اند (نگهبان 57 برابری را می‌سنجد)، `permissionAliases` (ص۵).
  - `personas.ts`، `notification-handlers.ts` و کامپوننت‌هایی که کد حذف‌شده را می‌خوانند (`counterparties.ts`، `manager-fleet.ts`، `manager-personnel.ts`، `personnel-profiles.ts`) به جانشین می‌روند.
  - صفحهٔ «نقش‌های انتساب» و تب «مجوزها» از فهرست سرور ساخته می‌شوند (ت۶ طرح ۲.۲)؛ کار تازه‌ای ندارند جز اینکه دستهٔ «نقش‌های کاری» دیگر نمی‌آید و دستهٔ «طرف‌حساب‌ها» می‌آید.
  - نگه‌داری آفلاین مجوزها (`PermissionService`) دست نمی‌خورد: نقشهٔ کاربر با پاسخ تازهٔ سرور جایگزین می‌شود.
- **ص۹ — بیرون از ۳.۵:** تبدیل باقی بررسی‌های `has_perm` به `can()` (مرحلهٔ ۴، ت۸ طرح ۲.۲)؛ بخش‌های مجوز شرکت (ک۶) و قالب‌های `_MANAGER`؛ مجوزهای انبار؛ واژه‌نامه فقط «مجوز منو (حذف‌شده)» و «طرف‌حساب: مدیریت کامل» را می‌گیرد.

## ۳. کارها

- **۳.۵-الف:** همین طرح.
- **۳.۵-ب (سرور؛ Claude یا اجراکنندهٔ Opus + high، چون مجوز، دامنه و migration است):** ص۱ تا ص۷.
  - `modules/accounting/module.py` (فهرست، دسته‌ها، نشانه‌ها، `REMOVED_PERMISSION_CODENAMES`)؛ `personnel/workflows.py`؛ `personnel/apps.py:121`؛ `counterparty_services.py:20`؛ `lifecycle_services.py:405-409,679,1027-1029`؛ `fleet_lifecycle_services.py:59-74`؛ `permissions.py:15-30,184`؛ `serializers_domains/helpers.py:40-43`؛ `role_resolver.py`؛ `workflow_engine.py:135-141`؛ `views_domains/hr_views.py:1075`؛ `views_domains/scope_helpers.py:82-89`؛ `phase_guardian_approval.py` (فقط اگر کد حذف‌شده دارد)؛ `core/companies/management/commands/seed_scenario.py:22` (متن راهنما)؛ migration داده (ص۶)؛ تست‌هایی که کد حذف‌شده را می‌دهند به جانشین می‌روند (`test_permission_aliases.py`، `test_counterparty_parties.py`، `test_org_admin_menu_permissions.py`، `test_cartable_*`، `test_lifecycle_reengineered_phase10.py`، `test_scoped_access.py`، `integration_tests/*`).
  - تست تازه: `personnel/test_permissions_35.py` (ص۷، و انتقال ص۶ روی دادهٔ نمونه با فراخوانی مستقیم تابع migration).
  - بازبین‌ها: `tenant-scope-reviewer` و `data-loss-reviewer` (migration ص۶).
  - **بخش کم‌خطر آنتی‌گرویتی:** تست‌های سناریوی API در فایل جدا `personnel/test_permissions_api_35.py`: برای هر پنج نقش با انتساب در بخش الف، کنش‌های اصلی (ثبت فاکتور، تأیید سرپرست، بررسی حسابدار، مجوز پرداخت، پرداخت خزانه، دیدن کامل طرف‌حساب) مجاز یا ۴۰۳ طبق جدول ص۴؛ همان کاربر در بخش ب بی انتساب ۴۰۳.
- **۳.۵-ج (فرانت؛ اجراکنندهٔ Sonnet + medium یا Claude، چون جایگزینی مکانیکی است):** ص۸.
  - تست‌های DOM با آنتی‌گرویتی: منوی هر نقش با مجوزهای بستهٔ ص۴ فقط آیتم‌های خودش را نشان می‌دهد؛ صفحهٔ «نقش‌های انتساب» دستهٔ «نقش‌های کاری» ندارد.
  - نگهبان‌های 52، 56، 57؛ `ui-reviewer` و بررسی دیداری منوی پنج نقش با بررسی سنگین مرحلهٔ ۳ (کار پشت ورود روی `app` با آنتی‌گرویتی).

## ۴. تست‌ها

- فقط تست‌های سریع: `manage.py test personnel.test_permissions_35 personnel.test_permissions_api_35` و تست‌های به‌روزشدهٔ ۳.۵-ب (فهرست در بریف) با `PYTHONUTF8=1` و همیشه با برچسب اپ؛ `manage.py check`؛ `makemigrations --check`؛ نگهبان‌های 29، 52، 56، 57، 58.
- فرانت: specهای منو و route-access؛ `npx ngc -p tsconfig.app.json --noEmit`.
- مجموعهٔ کامل، دو پروفایل ساخت، اعمال migration روی `app` و منوی اندروید در بررسی سنگین مرحلهٔ ۳.

## ۵. معیار پذیرش

- فهرست مجوزهای حسابداری دقیقاً ۲۱ مجوز ص۴ است؛ دستهٔ «نقش‌های کاری» و `view_sys_treasury` در فهرست، بسته‌ها و منوها نیستند.
- هر کار اصلی یک تیک دارد؛ هیچ منو یا صفحهٔ حسابداری کد حذف‌شده نمی‌خواهد (تست ص۷ صفر).
- کاربری که امروز با نقش انتساب یا تفاوت کاربر کاری را می‌کند، بعد از migration همان کار را می‌کند (ص۶)؛ هیچ ردیفی حذف نمی‌شود.
- گردش فاکتور مرحلهٔ سرپرست و حسابدار را با `perm_invoice_approve` و `perm_invoice_review` می‌سنجد؛ مرحله‌های باز به‌روز شده‌اند.
- نگهبان‌های 29، 57 و 58 سبز؛ هسته نام مجوز حسابداری را نمی‌برد.

## ۶. نکته‌های باز

- برچسب منوی «تنظیمات پایهٔ حقوق» برای مدیر و حسابدار با `view_sys_payroll` (هر دو دارند)؛ اگر لازم شد مجوز جدا در ۴.۴ حقوق.
- اگر اجراکننده جای دیگری یافت که نشانهٔ نقش حذف‌شده کاری را باز می‌کند و جانشین روشن ندارد، نزدیک‌ترین مجوز کار همان دسته را می‌گذارد و در گزارش پیشرفت می‌نویسد.
- پیش از هر انتشار روی `soft`، صف‌های آفلاین خالی شوند (نکته‌های باز ۳.۱ تا ۳.۴).

## ۷. گزارش پیشرفت

- **۵ آبان ۱۴۰۵ — ۳.۵-الف:** طرح نوشته شد. کد بررسی شد: ۲۳ مجوز، که پنج‌تایش فقط منو یا نشانهٔ نقش است. تصمیم: حذف آن پنج، افزودن سه مجوز (تأیید و بررسی فاکتور، مدیریت طرف‌حساب)، فهرست نهایی ۲۱ مجوز و بستهٔ پنج نقش (ص۴)، انتقال افزودنی تفاوت‌ها و مرحله‌های باز گردش بی حذف (ص۶). **اقدام بعدی:** ۳.۵-ب سرور (`scratch/brief_3_5_b.md`).
- **۵ آبان ۱۴۰۵ — ۳.۵-ب (سرور) انجام شد** (کامیت‌های `a8792521`، `06d00ff9` و کامیت گزارش):
  - `module.py`: ۲۱ مجوز و برچسب‌های تازهٔ ص۴، دستهٔ تازهٔ `counterparties`، بی دستهٔ `work_roles`؛ `permission_markers` بی پنج کد و با سه کد تازه؛ `REMOVED_PERMISSION_CODENAMES` با جانشین‌ها. `ACCOUNTING_PERMISSION_CODENAMES` حالا دقیقاً همان ۲۱ کد است (`perm_invoice_record` و `perm_petty_cash_manage` هم آمدند).
  - جاهای کد طبق ص۵ عوض شد؛ «یا»های دوتایی یک‌تایی شدند. `role_resolver`: نقش کارمند فقط از راه پیش‌فرض قبلی (بی نقش دیگر و با مجوز کارکرد یا پرونده) می‌آید، تا سرپرست که مجوز کارکرد هم دارد کارمند حساب نشود.
  - **انحراف ۱:** `is_counterparty_manager(user, company_id)` و `ensure_counterparty_manager` تازه: نوشتن طرف‌حساب و حساب بانکی آن و دید کامل دادهٔ حساس فقط با مجوز در بخشی از **همان شرکت** (پیش‌تر نشانهٔ حسابدار در هر شرکتی بس بود). ساختن طرف‌حساب مثل قبل برای همهٔ اعضا باز ماند (ثبت فاکتور آفلاین آن را لازم دارد).
  - **انحراف ۲:** مدیر طرف‌حساب را کامل می‌بیند و می‌تواند ویرایش کند، چون `perm_approve_personnel_manager` مجوز نوشتن ساختار سازمانی است (قاعدهٔ ۳.۱)؛ جملهٔ ص۴ «مدیر امروز کامل نمی‌بیند» دقیق نبود. رفتار عوض نشد.
  - **انحراف ۳ (migration `0013`):** تفاوت «افزوده» به همهٔ جانشین‌ها می‌رود، ولی تفاوت «برداشته» فقط به کدهای تازهٔ انحصاری (تأیید و بررسی فاکتور، مدیریت طرف‌حساب)، چون بقیهٔ سنجش‌ها همیشه نشانه را با جانشین «یا» می‌کردند و کپی «برداشته» دسترسی امروز را کم می‌کرد. تفاوت موجود روی جانشین برنده است؛ هیچ ردیفی حذف نمی‌شود.
  - نام مستعار `count_supervisor_exclusion` → `perm_approve_personnel_supervisor`. مبنای نگهبان 58 از ۴۰ به ۳۰ پایین آمد.
  - تست‌ها: `test_permissions_35` (فهرست، بسته‌ها، پویش کد حذف‌شده؛ نیمهٔ فرانت تا ۳.۵-ج skip؛ تابع migration) و `test_permissions_api_35` (آنتی‌گرویتی، شش تست؛ انتظار مدیر در دید کامل را Claude اصلاح کرد) و ۹ ماژول تست به‌روزشده: همه سبز (۱۷۵+ تست). `check`، `makemigrations --check`، نگهبان‌های 29، 52، 56، 57، 58 سبز. `tenant-scope-reviewer` و `data-loss-reviewer`: یافتهٔ لازم‌الاصلاح نماند.
  - **اقدام بعدی:** ۳.۵-ج فرانت (`scratch/brief_3_5_c.md`).

</div>
