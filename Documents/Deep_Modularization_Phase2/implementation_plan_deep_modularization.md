<div dir="rtl" align="right">

# طرح جامع ماژولارسازی عمیق و تکمیل ایزولاسیون هسته (نسخه بازبینی‌شده بر اساس آخرین کامیت مخزن — ویژه اجرا در Antigravity)

**تاریخ بازبینی عمیق:** ۲۴ مهر ۱۴۰۵ (2026-10-15) — منطبق با آخرین وضعیت مخزن پس از پایان صف ۱۰ نشستی «راه میانهٔ ماژولار»، صف ۳ نشستی «پیگیری‌های ناظر» (`Supervisor_Followups`) و کامیت `86399d8`  
**وضعیت سند:** طرح اجرایی کامل (`implementation_plan` + صف اجرایی ۱۲ نشستی `tasks.md` برای `run_tasks.py`) — **اجرا فقط پس از تأیید تایپی کاربر («تایید» یا «شروع»)**

## ۱. گزارش کالبدشکافی عمیق آخرین وضعیت مخزن (چرا بازبینی عمیق ضروری بود)

بررسی خط‌به‌خط آخرین وضعیت مخزن شما (شامل `tasks_history.md`، گزارش پایانی ناظر در `Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md` تا کامیت `86399d8`، اسکریپت‌های `guardian_modularization.py`، `guardian_57_front_module_fence.py` و `verify_tools.py`) نشان می‌دهد که در گام‌های اخیر:
1. اپ‌های بک‌اند به `core/` و `modules/{warehouse,accounting}/` منتقل شده‌اند و مانیفست‌های `module.py` و `module.ts` ساخته شده‌اند.
2. در فرانت‌اند، کامپوننت‌ها به `src/app/modules/{common,warehouse,accounting}/components/` منتقل شده‌اند و لانچر، سایدبار و پیوند سریع عملیات در نشست‌های ۲ و ۳ «پیگیری‌های ناظر» به اکستنشن‌ها متصل شده‌اند.
3. نگهبان ۲۹ (`guardian_modularization.py`) و نگهبان ۵۷ (`guardian_57_front_module_fence.py`) روی HEAD سبز هستند.

**اما چرا نگهبان‌های ۲۹ و ۵۷ سبز هستند در حالی که هسته هنوز به شدت به ماژول‌ها وابسته است و کدبیس پر از بخش‌های مونولیتیک است:**
نگهبان ۲۹ فقط دستورهای `import` پایتون و ۳ فایل `config/` را می‌شمارد، و نگهبان ۵۷ فقط دستورهای `import` تایپ‌اسکریپت از `core_common` به پوشه `modules/*` و فراخوانی متنی `isModuleInstalled('...')` را رصد می‌کند. به همین دلیل، در جریان جابه‌جایی‌های قبلی، **ده‌ها وابستگی رشته‌ای، منطق اختصاصی ماژول در هسته، فایل‌های غول‌پیکر ۱۱٬۰۰۰ خطی و ۵ تله پنهان** باقی مانده‌اند که اگر بدون شناخت دقیقشان دست به ماژولارسازی بزنید، نگهبان‌های ۵۷، ۴۹، ۳۸ یا اسکریپت‌های درون‌برنامه‌ای (`section_guardian.py` و `phase_guardian_approval.py`) خواهند شکست.

### فهرست ۶ یافته و گلوگاه کلیدی کشف‌شده در بررسی عمیق کدبیس

| ردیف | محور کشف‌شده در کدبیس واقعی (HEAD) | شواهد دقیق فایل و شماره خط در مخزن فعلی | چرا در طرح قبلی پنهان بود و چگونه در این نسخه حل شده است |
|---|---|---|---|
| **۱** | **موارد باز فوری در انتهای `Supervisor_Followups` (کامیت `86399d8`)** | در کامیت `86399d8` فقط `VehicleTripViewSet.get_queryset` اصلاح شد، اما **۸ اکشن سفارشی همان کلاس** در `modules/accounting/personnel/views.py` (`get_matrix` خ۶۷۹۰، `bulk_save` خ۶۸۸۳، `get_monthly_summary` خ۷۰۲۳، `get_monthly_grid` خ۷۰۷۹، `update_day_trip` خ۷۲۶۶، `bulk_save_monthly_grid` خ۷۴۶۰، `export_monthly_excel` خ۷۵۸۳، `import_monthly_excel` خ۷۶۰۶) مستقیماً روی `VehicleDriverProfile.objects` و `VehicleTripLog.objects` بدون دامنه شرکت کوئری می‌زنند! همچنین **۶۹ خطای تست در ۶ فایل تست `personnel`** (`NameError: Warehouse` و `AttributeError: warehouse`) و **۳ خطای تست شناخته‌شده** در `test_reports_integration.py` و `test_company_warehouse_isolation.py` باز مانده‌اند. | این دو مورد دقیقاً آخرین «اقدام بعدی» ثبت‌شده توسط ناظر (Claude) پیش از انتشار روی `soft` هستند و در **نشست ۱ و ۲** این طرح در اولویت اول قرار گرفتند. |
| **۲** | **هاردکدهای سنگین نام و منطق ماژول‌ها درون هسته بک‌اند (`warehouse-backend/core/`)** | ۱) `core/accounts/sod_cache_service.py:17-180`: ۱۶ قانون SoD با `'app_module': 'personnel'` و `'warehouse'` هاردکد شده‌اند.<br>۲) `core/accounts/middleware.py:105-166`: تابع `get_user_valid_roles_for_app` با `if module_code == 'accounting': ... elif module_code == 'warehouse':` هاردکد شده است.<br>۳) `core/accounts/serializers.py:618-626, 744-749` و `core/accounts/views.py:2828` (`SwitchAppScopeView`): فقط `'warehouse'` و `'finance'` را می‌پذیرند و ماژول سوم را رد می‌کنند!<br>۴) `core/accounts/views.py:1930-2173` (`AuditLogViewSet`): لیست زیرماژول‌های انبار و مالی را ۳ بار به صورت دستی هاردکد کرده، در حالی که `ModuleSpec.audit_modules` در رجیستری موجود است!<br>۵) `core/settings_core/google_drive_views.py:273` و `core/communications/models.py:60,271`: فراخوانی مستقیم `apps.get_model('personnel', ...)` و `apps.get_model('warehouses', ...)`. | نگهبان ۲۹ فقط `import` را می‌دید و رشته‌های هاردکدشده را نمی‌دید. در **نشست ۳**، تمام این موارد از طریق `ModuleSpec` و `contribute()` در `platform_core/registry.py` کاملاً پویا و ماژولار می‌شوند. |
| **۳** | **موارد انجام‌نشده نشست ۸ و ۹ طرح قبلی در هسته فرانت‌اند (`core/services/` و `core/auth/`)** | طبق یادداشت ناظر در خط ۵۳۲ `implementation_plan_modular_middle_path.md`، فایل‌های زیر در نشست ۹ دست نخوردند:<br>۱) `core/services/sync-pull.service.ts:131-221`: هاردکد `'/personnel/sync/pull/'` و `'/inventory/sync/pull/'` و جداول `warehouseOfflineDb`.<br>۲) `core/services/photo-upload-queue.service.ts:344-358`: هاردکد کامل مسیر `'/inventory/items/${entry.itemId}/photos/'` و توکن انبار درون `core/services/`!<br>۳) `core/services/offline-sync.service.ts:487-953` و `offline-db.ts:151-212`: هاردکد دوتایی `'warehouse' \| 'finance'` و `warehouseOfflineDb` / `financeOfflineDb`.<br>۴) `core/services/app-persona.service.ts` (۴۳ هاردکد)، `session-tab.service.ts` (۱۳ هاردکد) و `core/auth/auth.service.ts:257`. | در **نشست ۷ و ۸**، این سرویس‌های هسته به کمک نقطه توسعه جدید `offlineSync` و `scopeConfig` در `module-contract.ts` از هاردکد نام ماژول‌ها پاکسازی می‌شوند. |
| **۴** | **تله خطرناک نگهبان ۵۷ و `section_guardian.py` هنگام انتقال `core/api/*`** | در `src/app/core/api/`، سرویس `personnel-api.service.ts` (۱٬۳۰۵ خط) و ۹ سرویس انبار قرار دارند. **اما بررسی عمیق نشان داد ۵ فایل در `core/common/shared` آن‌ها را ایمپورت کرده‌اند:**<br>- `modules/common/components/users/users.ts:808` (`personnelApi.getFinancialProjects`)<br>- `shared/components/user-menu/user-menu.component.ts:542` (`personnelApi.getFinancialProjects`)<br>- `modules/common/components/settings/settings.ts:120` (`dynamicFieldApi.getFields`)<br>- `core/services/import.service.ts:3` (`ItemApiService`)<br>- `shared/components/item-photo-gallery/item-photo-gallery.component.ts:6` (`ItemPhotoService`)<br>علاوه بر این، `personnel/section_guardian.py:278` مستقیماً فایل `src/app/core/api/personnel-api.service.ts` را از دیسک می‌خواند! | اگر بدون قطع این ۵ وابستگی، سرویس‌ها به `modules/*/api/` بروند، **نگهبان ۵۷ فوراً با خطای `core_to_module_imports` می‌شکند!** در **نشست ۸**، ابتدا این ۵ نقطه از طریق نقطه توسعه و انتقال `import.service` / `item-photo-gallery` به ماژول انبار حل شده و یک شیم/رجیستری تمیز جایگزین می‌شود. |
| **۵** | **تله اسکریپت‌های نگهبان داخلی هنگام شکستن فایل‌های غول‌پیکر بک‌اند (`views.py`، `models.py`، `serializers.py`)** | ۱) فایل‌های `personnel/views.py` (**۱۱٬۰۶۸ خط**)، `personnel/models.py` (**۳٬۶۱۳ خط**)، `personnel/serializers.py` (**۱٬۶۲۰ خط**)، `inventory/views.py` (**۵٬۱۴۶ خط**) و `accounts/views.py` (**۳٬۳۳۰ خط**) مونولیت هستند.<br>۲) **تله کشف‌شده:** اسکریپت `personnel/section_guardian.py:484` فایل `personnel/views.py` را با `open()` می‌خواند و `personnel/phase_guardian_approval.py:2460,3529` فایل `accounts/views.py` را با `open()` می‌خواند! | به جای حذف فایل‌های `views.py`، `models.py` و `serializers.py`، کدهای آن‌ها به پوشه‌های دامنه (`views_domains/`، `models_domains/`، `serializers_domains/`) منتقل می‌شوند و خود فایل‌های `views.py`، `models.py` و `serializers.py` به عنوان **Barrel ظریف Re-export (زیر ۱۲۰ خط)** باقی می‌مانند و تابع کمکی خواندن پوشه در ۲ اسکریپت نگهبان نیز به‌روز می‌شود (**نشست‌های ۴، ۵ و ۶**). |
| **۶** | **کامپوننت‌های غول‌پیکر فرانت‌اند (`God Components`)، پوشه‌های منسوخ و باگ `dev-manager-modular.bat`** | ۱) ۱۰ کامپوننت فرانت‌اند بین ۱٬۶۰۰ تا ۲٬۸۱۱ خط در یک فایل `.ts` دارند.<br>۲) پوشه‌های منسوخ `src/app/services/` و `src/app/guards/` هنوز در کنار `src/app/core/` وجود دارند.<br>۳) فایل `dev-manager-modular.bat` در خطوط ۵۸ و ۶۷ فرمان‌های `npm run start:accounting` و `npm run start:warehouse` را صدا می‌زند که در نشست ۸ طرح قبلی از `package.json` پاک شدند! | در **نشست ۷** اسکریپت‌های `package.json` و پوشه‌های منسوخ اصلاح می‌شوند و در **نشست‌های ۹، ۱۰ و ۱۱**، هر ۱۰ کامپوننت غول‌پیکر با الگوی `*.facade.ts` (بدون حذف تگ‌های HTML جهت عبور ۱۰۰٪ از نگهبان ۵۶) ماژولار می‌شوند. |

## ۲. معماری هدف و اصول طلایی اجرا در Antigravity

### الف) چهار قانون تغییرناپذیر در تمام ۱۲ نشست
1. **قانون صفر مایگریشن (`Zero Migration`):** هیچ مدل جنگو تغییر نام یا تغییر `app_label` / `db_table` نمی‌دهد. در هر نشست بک‌اند، دروازه `python scripts/automation/verify_tools.py migrations-unchanged` باید `No model change needs a migration` برگرداند.
2. **قانون Barrel Re-export در بک‌اند:** هنگام شکستن `models.py`، `serializers.py` و `views.py` در `personnel`، `inventory` و `accounts`، فایل‌های اصلی (`models.py`، `serializers.py`، `views.py`) حذف نمی‌شوند؛ بلکه به یک فایل Barrel زیر ۱۲۰ خط تبدیل می‌شوند که تمام کلاس‌ها و توابع را از پوشه‌های دامنه (`models_domains/`، `serializers_domains/`، `views_domains/`) با `from .views_domains.hr_views import *` بازصادر (Re-export) می‌کنند. این الگو تضمین می‌کند:
   - هیچ ایمپورت خارجی در کل مخزن، تست‌ها و مایگریشن‌ها نشکند.
   - گراف `grimp` / `lint-imports` در نگهبان ۲۹ بدون هیچ خطایی تحلیل شود.
   - اسکریپت‌هایی که وجود فایل `views.py` را چک می‌کنند نشکنند.
3. **قانون حفظ کامل حصار نگهبان ۵۷ در فرانت‌اند:** هیچ فایلی در `core/`، `shared/` یا `modules/common/` هرگز نباید چیزی را از `modules/warehouse/` یا `modules/accounting/` ایمپورت کند (`core_to_module_imports = 0`). پیش از انتقال هر سرویس از `core/api/` به داخل ماژول، ابتدا مصرف‌کننده‌های آن در `common` و `shared` باید از طریق `ExtensionMap` در `module-contract.ts` یا انتقال خود کامپوننت اختصاصی به ماژول مربوطه decoupled شوند.
4. **قانون ایمنی قالب در نگهبان ۵۶ (`No Template Amputation`):** در نشست‌های ۹، ۱۰ و ۱۱ که کامپوننت‌های بالای ۲٬۰۰۰ خط فرانت‌اند شکسته می‌شوند، فایل‌های قالب `.html` دست‌نخورده می‌مانند و منطق تجاری، محاسبات، فیلترها، وضعیت‌ها و فراخوانی‌های API به سرویس‌های محلی `*.facade.ts` و `*.helpers.ts` در کنار همان کامپوننت استخراج می‌شوند.

### ب) نقشه معماری هدف پس از اجرای ۱۲ نشست

```text
warehouse-backend/
├── core/
│   ├── platform_core/
│   │   ├── registry.py               # مجهز به نقاط توسعه sod_rules, role_resolvers, audit_scopes
│   │   └── module_catalog.py         # کشف خودکار modules/*/module.py
│   ├── accounts/
│   │   ├── views.py                  # Barrel ظریف (<100 خط) Re-export از views_domains/
│   │   ├── views_domains/            # تفکیک ۳٬۳۳۰ خط به ۶ ماژول دامنه:
│   │   │   ├── auth_views.py         # CustomTokenObtainPairView, LogoutView, SwitchAppScopeView (پویا از رجیستری)
│   │   │   ├── user_views.py         # UserViewSet, UserTableViewStateViewSet
│   │   │   ├── role_views.py         # CustomRoleViewSet, PermissionViewSet
│   │   │   ├── audit_views.py        # UserLoginLogViewSet, AuditLogViewSet (پویا از AUDIT_MODULES رجیستری)
│   │   │   ├── backup_views.py       # DatabaseBackupViewSet, SystemHealthView, ConcurrencyStressTestView
│   │   │   └── session_views.py      # DeviceHeartbeatView, FleetSessionsListView, RevokeDeviceSessionView
│   │   └── sod_cache_service.py      # خواندن پویای قوانین SoD از contribute('sod_rules', ...)
│   └── (common, companies, communications, notifications, reports, settings_core — بدون apps.get_model سخت‌کد به ماژول‌ها)
│
└── modules/
    ├── warehouse/
    │   ├── module.py                 # ثبت sod_rules و audit_modules و role_resolvers انبار
    │   ├── warehouses/
    │   └── inventory/
    │       ├── views.py              # Barrel ظریف (<80 خط) Re-export از views_domains/
    │       └── views_domains/        # تفکیک ۵٬۱۴۶ خط به ۵ ماژول دامنه:
    │           ├── helpers.py        # توابع پارس، اسنپ‌شات، حذف نرم و فیلترها
    │           ├── field_views.py    # ItemFieldDefinitionViewSet
    │           ├── item_views.py     # ItemViewSet
    │           ├── count_views.py    # CountTaskViewSet
    │           └── doc_views.py      # DocTaskViewSet
    │
    └── accounting/
        ├── module.py                 # ثبت sod_rules و audit_modules و role_resolvers مالی
        └── personnel/
            ├── models.py             # Barrel ظریف (<120 خط) Re-export از models_domains/
            ├── models_domains/       # تفکیک ۳٬۶۱۳ خط (۳۴ مدل) به ۷ فایل دامنه (<650 خط):
            │   ├── base.py           # _WarehouseCompatQuerySet, _WarehouseCompatManager, _WarehouseCompatMixin
            │   ├── organization.py   # CompanyDocument, CompanyBankAccount, CompanyBoardMember, CompanyFiscalPeriod, FinancialProject, ProjectSection, UserSectionAssignment
            │   ├── hr.py             # InsuranceJobTitle, PersonnelProfile, PersonnelBankAccount, PersonnelDocument, PersonnelSectionAssignment, PersonnelChangeRequest
            │   ├── fleet.py          # VehicleDriverProfile, VehicleBankAccount, VehicleDocument, VehicleChangeRequest
            │   ├── attendance.py     # MonthlyWorkPeriod, DailyAttendance, AttendanceAuditLog, VehicleTripLog, VehicleTripAuditLog
            │   ├── payroll.py        # PayrollYearlySettings, JobGradeTier, WorkshopInsuranceSettings, TaxRuleSettings, BankExportSettings, MonthlyPayrollRecord
            │   └── treasury_audit.py # Counterparty, ExpenseInvoice, PettyCashAccount, PettyCashTransaction, AccountingEvent, emit_accounting_event, WorkflowAuditLog, CompanyGoogleDriveConfig, GoogleDriveSyncQueue
            ├── serializers.py        # Barrel ظریف (<120 خط) Re-export از serializers_domains/
            ├── serializers_domains/  # تفکیک ۱٬۶۲۰ خط (۳۵ سریالایزر) به ۷ فایل متناظر
            ├── views.py              # Barrel ظریف (<120 خط) Re-export از views_domains/
            └── views_domains/        # تفکیک ۱۱٬۰۶۸ خط (۲۲ ViewSet) به ۷ ماژول دامنه:
                ├── scope_helpers.py  # توابع دامنه شرکت، دسترسی و broadcast (خطوط ۱۳۵ تا ۴۳۹ + ۴۸۶۹ تا ۵۰۱۱)
                ├── org_views.py      # Company*ViewSet, FinancialProjectViewSet, ProjectSectionViewSet, UserSectionAssignmentViewSet
                ├── treasury_views.py # CounterpartyViewSet, ExpenseInvoiceViewSet, PettyCash*ViewSet, WorkflowAuditLogViewSet
                ├── payroll_views.py  # PayrollYearlySettingsViewSet, MonthlyPayrollViewSet, FleetSettlementViewSet
                ├── attendance_views.py # DailyAttendanceViewSet, VehicleTripViewSet (با دامنه شرکت کامل در هر ۸ اکشن), MonthlyWorkPeriodViewSet
                ├── hr_views.py       # PersonnelProfileViewSet, PersonnelChangeRequestViewSet
                └── fleet_views.py    # VehicleDriverProfileViewSet, VehicleChangeRequestViewSet
```

```text
warehouse-front/src/app/
├── core/                             # هسته ۱۰۰٪ خالص (صفر سرویس اختصاصی ماژول، صفر مسیر API هاردکدشده ماژول)
│   ├── api/                          # فقط APIهای پلتفرم: api, audit-api, backup-api, company-api, config-api, report-api, role-api, table-view-api, user-api
│   ├── modules/
│   │   ├── module-contract.ts        # مجهز به syncConfig, projectLookup, dynamicFieldsProvider در ExtensionMap
│   │   └── module-registry.service.ts
│   └── services/
│       ├── offline-db.ts             # دیتابیس محلی با رجیستری پویا برای قلمروها
│       ├── offline-sync.service.ts   # شکسته به زیرماژول‌های core/services/offline/ (<650 خط)
│       └── sync-pull.service.ts      # خواندن پویای pullEndpoint و scopeParam از ExtensionMap.syncConfig
│
└── modules/
    ├── common/
    │   └── components/
    │       ├── operations/companies/ # companies.ts (<1500 خط) + companies.facade.ts
    │       ├── users/                # users.ts (<1500 خط) + users.facade.ts (دریافت پروژه‌ها از اکستنشن بدون ایمپورت PersonnelApiService)
    │       └── audit/                # audit.ts (<1500 خط) + audit.facade.ts
    ├── warehouse/
    │   ├── module.ts                 # ثبت syncConfig, dynamicFieldsProvider و غیره
    │   ├── api/                      # count-task-api, doc-task-api, item-api, dynamic-field-api, feeding-api, label-api, project-api, tag-api, dashboard-api
    │   ├── services/                 # count-task-store, doc-task-store, import.service, item-photo.service, photo-upload-queue.service
    │   └── components/               # customs, counter-dashboard, supervisor-dashboard, manager-review (مجهز به *.facade.ts)
    └── accounting/
        ├── module.ts                 # ثبت syncConfig و projectLookup
        ├── api/                      # personnel-api.service.ts (Facade) + 5 سرویس دامنه: hr-api, fleet-api, attendance-api, payroll-api, treasury-org-api
        └── components/               # employee-new-personnel, employee-new-vehicle, employee-attendance, projects-and-sections (مجهز به *.facade.ts)
```

## ۳. جدول خلاصه ۱۲ نشست اجرایی در Antigravity

| نشست | عنوان و هدف نشست | لایه | ریسک | دروازه‌های راستی‌آزمایی خودکار (`verify`) |
|---|---|---|---|---|
| **نشست ۱** | بستن نشت دامنهٔ شرکت در ۸ اکشن سفارشی `VehicleTripViewSet` (آخرین اقدام باز در `Supervisor_Followups`) + آزمون‌های یکپارچگی | بک‌اند | کم | `test_company_scope_reports_import` (۲۰+ تست OK)، `django-check`، نگهبان ۲۹ و ۵۷ |
| **نشست ۲** | رفع کامل ۶۹ خطای تست در ۶ فایل تست `personnel` (`Warehouse` / `.warehouse`) و ۳ خطای تست در `integration_tests` و `warehouses` + اصلاح `packages/*/pyproject.toml` | بک‌اند | کم | اجرای ۱۰۰٪ سبز `manage.py test integration_tests accounts warehouses reports platform_core personnel` با **۰ خطا و ۰ شکست تازه** |
| **نشست ۳** | پاکسازی هسته بک‌اند (`core/`) از هاردکدهای نام و منطق ماژول‌ها (`sod_cache_service`، `middleware`، `SwitchAppScopeView`، `AuditLogViewSet`، `settings_core`، `communications`) با `contribute()` | بک‌اند | متوسط | پاس شدن تست‌های `accounts`، `companies`، `communications`، `integration_tests`، نگهبان ۲۹، ۳۰، ۳۱، ۴۹ و ۵۴ |
| **نشست ۴** | ماژولار کردن مدل‌ها و سریالایزرهای `personnel` (`models.py` ۳٬۶۱۳ خط و `serializers.py` ۱٬۶۲۰ خط) به پوشه‌های `models_domains/` و `serializers_domains/` با حفظ Barrel | بک‌اند | کم | `migrations-unchanged`، `django-check` در ۳ پروفایل، سقف هر فایل دامنه زیر ۶۵۰ خط، پاس شدن تمام تست‌های `personnel` |
| **نشست ۵** | شکستن مونولیت ۱۱٬۰۶۸ خطی `personnel/views.py` به ۷ ماژول در `views_domains/` با حفظ Barrel در `views.py` و به‌روزرسانی `section_guardian.py` | بک‌اند | متوسط | کاهش `views.py` به زیر ۱۵۰ خط، پاس شدن تمام تست‌های `personnel` و `integration_tests`، نگهبان ۲۹ و ۴۹ |
| **نشست ۶** | شکستن مونولیت‌های `inventory/views.py` (۵٬۱۴۶ خط) و `accounts/views.py` (۳٬۳۳۰ خط) به `views_domains/` با حفظ Barrel و به‌روزرسانی `phase_guardian_approval.py` | بک‌اند | کم تا متوسط | کاهش `inventory/views.py` و `accounts/views.py` به زیر ۱۵۰ خط، پاس شدن تست‌های `inventory` و `accounts`، نگهبان ۲۹، ۳۰، ۳۱، ۵۴ |
| **نشست ۷** | پاکسازی هسته فرانت‌اند (`sync-pull`، `app-persona`، `session-tab`، `auth.guard`)، حذف پوشه‌های منسوخ `app/services` و `app/guards` و همگام‌سازی `dev-manager-modular.bat` / `package.json` | فرانت‌اند | کم تا متوسط | بیلد هر ۳ پروفایل (`full`، `accounting`، `warehouse`)، `dist-free`، نگهبان ۵۲، ۵۵، ۵۶، ۵۷ و `ng-test-compare` |
| **نشست ۸** | قطع ۵ وابستگی متقاطع در `common/shared` و انتقال سرویس‌های API و آفلاین اختصاصی انبار و مالی از `core/api` و `core/services` به داخل `modules/{warehouse,accounting}/` | فرانت‌اند | متوسط | تفکیک `personnel-api` به ۵ سرویس دامنه، انتقال ۹ سرویس API انبار به `modules/warehouse/api/`، نگهبان ۵۷ با ۰ نقض (`core_to_module_imports = 0`) |
| **نشست ۹** | ماژولار کردن `offline-sync.service.ts` (۱٬۴۷۸ خط) به زیرماژول‌های `core/services/offline/` و اتصال به نقطه توسعه `ExtensionMap.syncConfig` | فرانت‌اند | متوسط | کاهش `offline-sync.service.ts` به زیر ۶۵۰ خط، پاس شدن تست‌های آفلاین و `ng-test-compare`، نگهبان ۵۶ و ۵۷ |
| **نشست ۱۰** | شکستن کامپوننت‌های غول‌پیکر ماژول مالی (`employee-new-personnel` ۲٬۸۱۱ خط، `employee-new-vehicle` ۲٬۶۱۹ خط، `employee-attendance` ۱٬۷۷۲ خط، `projects-and-sections` ۱٬۶۰۲ خط) با الگوی `*.facade.ts` | فرانت‌اند | کم تا متوسط | کاهش هر ۴ فایل `.ts` به زیر ۱٬۵۰۰ خط، بدون حذف هیچ تگ HTML، سبز بودن نگهبان ۵۲، ۵۵، ۵۶، ۵۷ و `ng-test-compare` |
| **نشست ۱۱** | شکستن کامپوننت‌های غول‌پیکر ماژول انبار (`customs` ۲٬۵۵۷ خط، `counter-dashboard` ۲٬۲۱۰ خط، `supervisor-dashboard` ۲٬۱۵۲ خط، `manager-review` ۲٬۱۹۶ خط) با الگوی `*.facade.ts` | فرانت‌اند | کم تا متوسط | کاهش هر ۴ فایل `.ts` به زیر ۱٬۴۵۰ خط، سبز بودن نگهبان ۵۲، ۵۵، ۵۶، ۵۷ و `ng-test-compare` |
| **نشست ۱۲** | شکستن کامپوننت‌های غول‌پیکر پلتفرم (`companies` ۲٬۶۹۱ خط، `users` ۲٬۶۶۸ خط، `audit` ۲٬۴۱۵ خط، `id-cards` ۱٬۶۳۴ خط)، ارتقای نگهبان‌های ۲۹ و ۵۷ به سقف اندازه فایل و اجرای `sample-module` | فول‌استک | کم تا متوسط | کاهش هر ۴ فایل `.ts` به زیر ۱٬۵۰۰ خط، پاس شدن نگهبان‌های ۲۹، ۳۸، ۵۲، ۵۵، ۵۶، ۵۷ (`--self-test`)، `sample-module` و بیلد ۳ پروفایل |

## ۴. متن کامل صف اجرایی ۱۲ نشستی برای قرار دادن در `tasks.md` (آماده اجرا با `run_tasks.bat`)

> **منسوخ:** این صف ۱۲ نشستی روی پایهٔ کهنهٔ `86399d8` نوشته شده بود. صفی که واقعاً اجرا می‌شود ۱۱ نشست دارد و در `tasks.md` است؛ تصمیم‌ها و تفاوت‌ها در بخش `## ۵.` آمده‌اند. متن زیر فقط برای سابقه می‌ماند.

محتوای بلوک زیر را عیناً در فایل `tasks.md` ریشه مخزن قرار دهید (و این سند را نیز در `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md` ذخیره نمایید). تمامی دستورات `require` و `verify` با ابزارهای واقعی مخزن شما (`scripts/automation/verify_tools.py` و نگهبان‌های `scripts/e2e/`) تست و کالیبره شده‌اند و هیچ علامت سؤالی در متن تسک‌ها وجود ندارد:

```markdown
نشست 1 از 12 — ماژولارسازی عمیق: بستن نشت دامنه شرکت در اکشنهای سفارشی VehicleTripViewSet

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,re,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests.test_company_scope_reports_import','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; m=re.search(r'Ran (\d+) test',o); n=int(m.group(1)) if m else 0; print(o[-3000:]); sys.exit(0 if r.returncode==0 and n>=21 else 1)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(scope): enforce company scope across all VehicleTripViewSet custom actions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ و آخرین بند «اقدام بعدی» در انتهای `Documents/Supervisor_Followups/implementation_plan_supervisor_followups.md` برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، بستن نشت دامنهٔ شرکت در اکشن‌های سفارشی `VehicleTripViewSet` در `warehouse-backend/modules/accounting/personnel/views.py` (خطوط ۶۷۹۰ تا ۷۶۲۷) است که در کامیت `86399d8` به عنوان اقدام بعدی پیش از انتشار روی `soft` ثبت شد:
- یک متد کمکی مشترک در `VehicleTripViewSet` (یا تابع کمکی در کنار `scope_vehicle_queryset`) تعریف کن که هم برای کوئری‌های `VehicleTripLog` (از طریق `self.get_queryset()`) و هم برای کوئری‌های `VehicleDriverProfile` (از طریق `scope_vehicle_queryset(request.user, qs, cid)`) و `MonthlyWorkPeriod` دامنهٔ شرکت فعال (`get_request_company_id(request)` با `validate_user_company_access`) و در نبود سربرگ شرکت، شرکت‌های مجاز کاربر (`get_user_allowed_companies(request.user)`) را برای کاربران غیرسوپریوزر اعمال کند.
- هر ۸ اکشن سفارشی `VehicleTripViewSet` یعنی `get_matrix`، `bulk_save`، `get_monthly_summary`، `get_monthly_grid`، `update_day_trip`، `bulk_save_monthly_grid`، `export_monthly_excel` و `import_monthly_excel` را بررسی و اصلاح کن تا:
  1. در خواندن لیست خودروها (`VehicleDriverProfile`) و سفرها (`VehicleTripLog`) و دوره‌های کارکرد (`MonthlyWorkPeriod`)، کاربر غیرسوپریوزرِ شرکت الف هرگز نتواند خودروها یا سفرهای شرکت ب را ببیند (حتی اگر سربرگ شرکت نفرستد یا `section_id` شرکت ب را بفرستد).
  2. در نوشتن/ثبت سفر (`bulk_save`، `update_day_trip`، `bulk_save_monthly_grid`، `import_monthly_excel`)، اگر `vehicle_id` یا `section_id` متعلق به شرکتی خارج از دامنهٔ مجاز کاربر بود، با خطای ۴۰۳ یا خطای ردیف رد شود و هیچ تغییری در داده‌های شرکت دیگر ایجاد نشود.
- در فایل `warehouse-backend/integration_tests/test_company_scope_reports_import.py` دست‌کم ۳ متد آزمون جدید اضافه کن که اثبات کنند کاربر شرکت الف بدون سربرگ شرکت (یا با ارسال شناسه خودرو/بخش شرکت ب) در اکشن‌های `matrix`، `monthly-grid`، `monthly-summary` و `bulk-save` به خودروها و سفرهای شرکت ب دسترسی ندارد و نمی‌تواند برای خودروی شرکت ب سفر ثبت کند.

۳. فرمان مجاز برای بررسی در طول کار: حداکثر سه بار اجرای `warehouse-backend\venv\Scripts\python.exe manage.py test integration_tests.test_company_scope_reports_import --noinput` در پوشه `warehouse-backend` با `PYTHONUTF8=1`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
fix(scope): enforce company scope across all VehicleTripViewSet custom actions

===

نشست 2 از 12 — ماژولارسازی عمیق: رفع کامل 69 خطای تست personnel و 3 خطای تست شناختهشده و بهروزرسانی pyproject بستهها

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests','accounts','warehouses','reports','platform_core','personnel','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; print(o[-3000:]); sys.exit(0 if r.returncode==0 else 1)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(tests): resolve 69 personnel test errors and 3 known test failures without cross-module imports"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، سبز کردن کامل مجموعه آزمون‌های بک‌اند (`integration_tests`، `accounts`، `warehouses`، `reports`، `platform_core`، `personnel`) با رفع ۶۹ خطای `NameError: Warehouse` / `AttributeError: warehouse` در `personnel` و ۳ خطای شناخته‌شده دیگر، بدون ایجاد هیچ نقض مرزی در نگهبان ۲۹ است:
- **الف) رفع ۲ خطای `ExportWorkerTests` در `warehouse-backend/integration_tests/test_reports_integration.py`:**
  - ایمپورت نسبی شکسته `from .management.commands.run_export_worker import Command` را به ایمپورت مطلق `from reports.management.commands.run_export_worker import Command` اصلاح کن.
- **ب) رفع ۱ خطای `CompanyWarehouseIsolationTestCase` در `warehouse-backend/modules/warehouse/warehouses/test_company_warehouse_isolation.py`:**
  - ایمپورت جاافتاده `from rest_framework import status` را به بالای فایل اضافه کن.
- **ج) رفع ۶۹ خطای تست در ۶ فایل تست `warehouse-backend/modules/accounting/personnel/`:**
  - در فایل‌های `test_attendance_approval_workflow.py`، `test_attendance_fleet_audit.py`، `test_fleet_scenarios_10_vehicles.py`، `test_google_drive.py`، `test_project_exports.py` و `tests.py`:
  - توجه کن که مدل‌های `personnel` از `_WarehouseCompatMixin` (`models.py:42-83`) استفاده می‌کنند که هر شیء دارای صفت `.id` (مانند `types.SimpleNamespace(id=1, name='انبار مرکزی تست', code='WH-01', is_active=True)`) را در آرگومان‌های `warehouse=...` و `assigned_warehouse=...` می‌پذیرد و به ستون عددی `warehouse_id` / `assigned_warehouse_id` نگاشت می‌کند.
  - در این ۶ فایل، به جای `Warehouse.objects.create(...)` از یک تابع کمکی سبک مبتنی بر `SimpleNamespace` (با شناسه‌های یکتا مانند ۱، ۲ و غیره) استفاده کن و در `tests.py` خطایی که باعث شده بود `self.warehouse` در `PersonnelTests.setUp` تعریف نشود را با تعریف `self.warehouse = SimpleNamespace(id=1, name='انبار تست', code='WH-01')` برطرف کن.
  - اگر متد خاصی در `tests.py` یا `test_google_drive.py` واقعاً به رکورد جدول `Warehouse` در دیتابیس نیاز دارد (مثلاً کوئری مستقیم مدل `Warehouse` یا `company_of('warehouse', ...)` را تست می‌کند)، آن متد خاص را به `warehouse-backend/integration_tests/test_personnel_cross_module.py` منتقل کن تا در `modules/accounting/personnel/` هیچ ایمپورتی به `warehouses` وجود نداشته باشد و نگهبان ۲۹ با ۰ نقض سبز بماند.
- **د) همگام‌سازی فایل‌های `packages/*/pyproject.toml`:**
  - در `packages/wh-platform/pyproject.toml`، `packages/wh-warehouse/pyproject.toml` و `packages/wh-accounting/pyproject.toml`، مسیرهای `package-dir` و `where` را با ساختار جدید `warehouse-backend/core` و `warehouse-backend/modules/{warehouse,accounting}` تطبیق بده و `companies*` و `reports*` را در `wh-platform` قرار بده (و `reports*` را از `wh-warehouse` حذف کن).

۳. فرمان مجاز برای بررسی در طول کار: حداکثر سه بار اجرای `warehouse-backend\venv\Scripts\python.exe manage.py test integration_tests accounts warehouses reports platform_core personnel --noinput` در پوشه `warehouse-backend` با `PYTHONUTF8=1`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
fix(tests): resolve 69 personnel test errors and 3 known test failures without cross-module imports

===

نشست 3 از 12 — ماژولارسازی عمیق: پاکسازی هسته بکاند (core) از هاردکدهای نام و منطق ماژولها با نقاط توسعه رجیستری

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; core=pathlib.Path('warehouse-backend/core'); s1=(core/'accounts/sod_cache_service.py').read_text(encoding='utf-8'); s2=(core/'accounts/views.py').read_text(encoding='utf-8'); s3=(core/'settings_core/google_drive_views.py').read_text(encoding='utf-8'); bad={'sod_hardcoded':'\x27app_module\x27: \x27personnel\x27' in s1,'switch_scope_hardcoded':'target_app not in (\x27warehouse\x27, \x27finance\x27)' in s2,'gdrive_personnel_hardcoded':'apps.get_model(\x27personnel\x27' in s3}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','integration_tests','accounts','warehouses','reports','platform_core','personnel','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; print(o[-2500:]); sys.exit(0 if r.returncode==0 else 1)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_49_sod_enforcement.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(core): replace hardcoded module logic in backend core with registry contributions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، حذف هاردکدهای باقی‌مانده از نام و منطق ماژول‌های `warehouse` و `accounting`/`personnel` در فایل‌های تولیدی `warehouse-backend/core/` و انتقال آن‌ها به نقطه‌های توسعه در `platform_core/registry.py` است، به طوری که رفتار فعلی در هر سه پروفایل صددرصد یکسان بماند:
- **الف) قوانین تفکیک وظایف (`core/accounts/sod_cache_service.py`):**
  - قوانین هاردکدشده `'app_module': 'personnel'` (۱۳ قانون) را به `modules/accounting/personnel/` (مثلاً `personnel/sod_rules.py` و ثبت با `contribute('sod_rules', ...)` در `PersonnelConfig.ready()`) و قوانین `'app_module': 'warehouse'` (۳ قانون) را به `modules/warehouse/warehouses/` (ثبت با `contribute('sod_rules', ...)` در `WarehousesConfig.ready()`) منتقل کن.
  - `sod_cache_service.py` قوانین را به صورت پویا از `contributions('sod_rules')` بخواند (و در صورت نیاز یک فالبک سازگار داشته باشد تا نگهبان ۴۹ `guardian_49_sod_enforcement.py` صددرصد سبز بماند؛ پیش از اتمام، `guardian_49_sod_enforcement.py` را بررسی و اجرا کن).
- **ب) دامنهٔ تغییر قلمرو (`SwitchAppScopeView` در `core/accounts/views.py:2828`) و نقش‌های ماژول (`core/accounts/middleware.py` و `core/accounts/serializers.py`):**
  - در `SwitchAppScopeView`، شرط هاردکدشده `if target_app not in ('warehouse', 'finance'):` را با بررسی پویا از طریق `app_code_to_module(target_app)` در `platform_core/registry.py` جایگزین کن تا هر ماژول ثبت‌شده در رجیستری پذیرفته شود.
  - در `core/accounts/middleware.py` (`get_user_valid_roles_for_app`)، اجازه بده ماژول‌ها تابع محاسبه نقش‌های معتبر کاربر را با `contribute(f'role_resolver:{module_code}', resolver)` ثبت کنند و منطق اختصاصی پرسنل و انبار از طریق این مشارکت‌ها فراخوانی شود.
- **ج) فیلتر قلمرو لاگ‌های ممیزی (`AuditLogViewSet` در `core/accounts/views.py:1930-2173`):**
  - به جای تکرار ۳باره لیست‌های دستی `['personnel', 'payroll', 'attendance', 'fleet', 'treasury', 'finance']` و `['docs', 'dispatch', ...]`, یک تابع کمکی در `platform_core/registry.py` (یا `accounts/models.py`) بنویس که کلیدهای `audit_modules` ثبت‌شده در `ModuleSpec` هر ماژول را برگرداند و `AuditLogViewSet` از آن استفاده کند.
- **د) حذف `apps.get_model('personnel', 'CompanyGoogleDriveConfig')` از `core/settings_core/google_drive_views.py:273`:**
  - در `PersonnelConfig.ready()` مدل یا سرویس گوگل‌درایو شرکت را با `contribute('company_gdrive_config_model', CompanyGoogleDriveConfig)` ثبت کن و در `settings_core/google_drive_views.py` آن را از `contributions('company_gdrive_config_model')` بخوان تا نام `'personnel'` در `settings_core` نباشد.

۳. فرمان‌های مجاز برای بررسی: `python scripts/e2e/guardian_49_sod_enforcement.py` و `python scripts/automation/verify_tools.py django-check`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(core): replace hardcoded module logic in backend core with registry contributions

===

نشست 4 از 12 — ماژولارسازی عمیق: تفکیک models.py (3613 خط) و serializers.py (1620 خط) در personnel به پکیجهای دامنه با حفظ Barrel

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; p=pathlib.Path('warehouse-backend/modules/accounting/personnel'); m_py=p/'models.py'; s_py=p/'serializers.py'; m_dom=list((p/'models_domains').glob('*.py')) if (p/'models_domains').exists() else []; s_dom=list((p/'serializers_domains').glob('*.py')) if (p/'serializers_domains').exists() else []; m_len=len(m_py.read_text(encoding='utf-8').splitlines()) if m_py.exists() else 9999; s_len=len(s_py.read_text(encoding='utf-8').splitlines()) if s_py.exists() else 9999; big=[str(f.name) for f in m_dom+s_dom if len(f.read_text(encoding='utf-8').splitlines())>750]; print('models.py lines:',m_len,'serializers.py lines:',s_len,'m_dom:',len(m_dom),'s_dom:',len(s_dom),'big:',big); sys.exit(0 if m_len<150 and s_len<150 and len(m_dom)>=7 and len(s_dom)>=7 and not big else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','personnel','integration_tests','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; print(o[-2500:]); sys.exit(0 if r.returncode==0 else 1)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(personnel): modularize models and serializers into domain modules with barrel exports"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، شکستن فایل ۳٬۶۱۳ خطی `warehouse-backend/modules/accounting/personnel/models.py` و فایل ۱٬۶۲۰ خطی `warehouse-backend/modules/accounting/personnel/serializers.py` به ماژول‌های دامنه در پوشه‌های `models_domains/` و `serializers_domains/` است، به طوری که خود فایل‌های `models.py` و `serializers.py` به عنوان Barrel ظریف (زیر ۱۵۰ خط) باقی بمانند و تمام کلاس‌ها و توابع را Re-export کنند:
- **الف) ساخت پوشه `warehouse-backend/modules/accounting/personnel/models_domains/` با `__init__.py` و ۷ ماژول زیر (هر فایل زیر ۷۵۰ خط):**
  1. `base.py`: شامل `_WarehouseCompatQuerySet`، `_WarehouseCompatManager`، `_WarehouseCompatMixin`.
  2. `organization.py`: شامل `CompanyDocument`، `CompanyBankAccount`، `CompanyBoardMember`، `CompanyFiscalPeriod`، `FinancialProject`، `ProjectSection`، `UserSectionAssignment`.
  3. `hr.py`: شامل `InsuranceJobTitle`، `PersonnelProfile`، `PersonnelBankAccount`، `PersonnelDocument`، `PersonnelSectionAssignment`، `PersonnelChangeRequest`.
  4. `fleet.py`: شامل `VehicleDriverProfile`، `VehicleBankAccount`، `VehicleDocument`، `VehicleChangeRequest`.
  5. `attendance.py`: شامل `MonthlyWorkPeriod`، `DailyAttendance`، `AttendanceAuditLog`، `VehicleTripLog`، `VehicleTripAuditLog`.
  6. `payroll.py`: شامل `PayrollYearlySettings`، `JobGradeTier`، `WorkshopInsuranceSettings`، `TaxRuleSettings`، `BankExportSettings`، `MonthlyPayrollRecord`.
  7. `treasury_audit.py`: شامل `Counterparty`، `ExpenseInvoice`، `PettyCashAccount`، `PettyCashTransaction`، `AccountingEvent`، تابع `emit_accounting_event`، `WorkflowAuditLog`، `CompanyGoogleDriveConfig`، `GoogleDriveSyncQueue`.
  - نکته مهم برای جنگو: چون مدل‌ها از داخل زیرپکیج `personnel.models_domains.*` تعریف می‌شوند و در `personnel/models.py` ایمپورت می‌شوند، در صورتی که جنگو نیازمند `app_label = 'personnel'` در `Meta` باشد، بررسی کن که همه مدل‌ها `app_label = 'personnel'` را به درستی داشته باشند (یا در کلاس پایه/Meta تنظیم شود) تا `makemigrations --check --dry-run` دقیقاً `No changes detected` بدهد و هیچ مایگریشنی ساخته یا تغییر داده نشود.
  - در `personnel/models.py`، تمام ۳۴ مدل، کلاس‌های پایه، `emit_accounting_event` و `Company` / `UserCompanyAccess` را Re-export کن تا `models.py` زیر ۱۵۰ خط باشد.
- **ب) ساخت پوشه `warehouse-backend/modules/accounting/personnel/serializers_domains/` با `__init__.py` و ۷ ماژول متناظر:**
  1. `helpers.py`: شامل `normalize_iranian_phone`، `normalize_plate`، `user_can_view_fleet_rates`.
  2. `organization.py`، `hr.py`، `fleet.py`، `attendance.py`، `payroll.py`، `treasury_audit.py`: شامل سریالایزرهای متناظر هر دامنه.
  - در `personnel/serializers.py`، تمام ۳۵ سریالایزر و توابع کمکی را Re-export کن تا `serializers.py` زیر ۱۵۰ خط باشد.

۳. فرمان‌های مجاز برای بررسی: `python scripts/automation/verify_tools.py django-check` و `python scripts/automation/verify_tools.py migrations-unchanged`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(personnel): modularize models and serializers into domain modules with barrel exports

===

نشست 5 از 12 — ماژولارسازی عمیق: شکستن مونولیت 11068 خطی personnel/views.py به 7 ماژول دامنه با حفظ Barrel

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; p=pathlib.Path('warehouse-backend/modules/accounting/personnel'); v_py=p/'views.py'; v_dom=list((p/'views_domains').glob('*.py')) if (p/'views_domains').exists() else []; v_len=len(v_py.read_text(encoding='utf-8').splitlines()) if v_py.exists() else 9999; print('views.py lines:',v_len,'views_domains files:',[f.name for f in v_dom]); sys.exit(0 if v_len<150 and len(v_dom)>=7 else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','personnel','integration_tests','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; print(o[-2500:]); sys.exit(0 if r.returncode==0 else 1)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_49_sod_enforcement.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(personnel): split 11k-line views.py into 7 domain view modules"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، شکستن کامل فایل ۱۱٬۰۶۸ خطی `warehouse-backend/modules/accounting/personnel/views.py` به ۷ ماژول دامنه در پوشه `warehouse-backend/modules/accounting/personnel/views_domains/` و تبدیل `personnel/views.py` به یک Barrel ظریف (زیر ۱۵۰ خط) است:
- پوشه `warehouse-backend/modules/accounting/personnel/views_domains/` را با `__init__.py` و ۷ فایل زیر بساز:
  1. `scope_helpers.py`: تمام توابع کمکی دامنه، دسترسی و وب‌سوکت (`user_belongs_to_company`، `ensure_scoped_assignment`، `resolve_write_company`، `resolve_import_company`، `readable_company_ids`، `is_personnel_global_auditor`، `scope_personnel_queryset`، `scope_personnel_for_user`، `ensure_record_write_scope`، `ensure_personnel_write_scope`، `is_vehicle_global_auditor`، `scope_vehicle_queryset`، `broadcast_personnel_update`، `broadcast_vehicle_update`، `log_vehicle_audit`، `normalize_attendance_date`، `validate_attendance_date_window`، `is_date_shamsi_friday`، `broadcast_attendance_updated`، `safe_int`، `_copy_payroll_submodels`، `broadcast_org_structure_updated` و هر کمکی دیگر).
  2. `org_views.py`: شامل `CompanyViewSet`، `CompanyDocumentViewSet`، `CompanyBankAccountViewSet`، `CompanyBoardMemberViewSet`، `CompanyFiscalPeriodViewSet`، `FinancialProjectViewSet`، `ProjectSectionViewSet`، `UserSectionAssignmentViewSet`.
  3. `treasury_views.py`: شامل `CounterpartyViewSet`، `ExpenseInvoiceViewSet`، `PettyCashAccountViewSet`، `PettyCashTransactionViewSet`، `WorkflowAuditLogViewSet`.
  4. `payroll_views.py`: شامل `PayrollYearlySettingsViewSet`، `MonthlyPayrollViewSet`، `FleetSettlementViewSet`.
  5. `attendance_views.py`: شامل `DailyAttendanceViewSet`، `VehicleTripViewSet`، `MonthlyWorkPeriodViewSet`.
  6. `hr_views.py`: شامل `PersonnelProfileViewSet`، `PersonnelChangeRequestViewSet`.
  7. `fleet_views.py`: شامل `VehicleDriverProfileViewSet`، `VehicleChangeRequestViewSet`.
- در `warehouse-backend/modules/accounting/personnel/views.py`، تمام ۲۲ کلاس ViewSet و تمام توابع `scope_helpers` (و نیز ماژول‌ها یا توابعی که در تست‌ها روی `personnel.views` با `unittest.mock.patch` پچ می‌شوند، مانند `export_fleet_monthly_excel` یا `calculate_monthly_fleet_settlement` یا `validate_user_company_access`) را ایمپورت و Re-export کن تا هیچ تستی که `@patch('personnel.views....')` دارد نشکند.
- **نکته حیاتی برای نگهبان‌ها:** در `scripts/e2e/guardian_49_sod_enforcement.py` و `warehouse-backend/modules/accounting/personnel/section_guardian.py` (خط ۴۸۴) که محتوای متنی `personnel/views.py` را می‌خوانند، طوری اصلاحشان کن که علاوه بر `personnel/views.py`، محتوای تمام فایل‌های `personnel/views_domains/*.py` را هم با هم الحاق و بررسی کنند.

۳. فرمان‌های مجاز برای بررسی: `python scripts/e2e/guardian_49_sod_enforcement.py` و `python scripts/automation/verify_tools.py django-check`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(personnel): split 11k-line views.py into 7 domain view modules

===

نشست 6 از 12 — ماژولارسازی عمیق: تفکیک مونولیتهای inventory/views.py (5146 خط) و accounts/views.py (3330 خط) به پکیجهای دامنه

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; inv=pathlib.Path('warehouse-backend/modules/warehouse/inventory'); acc=pathlib.Path('warehouse-backend/core/accounts'); inv_len=len((inv/'views.py').read_text(encoding='utf-8').splitlines()); acc_len=len((acc/'views.py').read_text(encoding='utf-8').splitlines()); inv_dom=list((inv/'views_domains').glob('*.py')) if (inv/'views_domains').exists() else []; acc_dom=list((acc/'views_domains').glob('*.py')) if (acc/'views_domains').exists() else []; print('inv views.py:',inv_len,'acc views.py:',acc_len,'inv_dom:',len(inv_dom),'acc_dom:',len(acc_dom)); sys.exit(0 if inv_len<120 and acc_len<120 and len(inv_dom)>=5 and len(acc_dom)>=6 else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python -c "import os,subprocess,sys; py=os.path.abspath(r'warehouse-backend\venv\Scripts\python.exe'); r=subprocess.run([py,'manage.py','test','inventory','warehouses','accounts','integration_tests','--noinput'],cwd='warehouse-backend',capture_output=True,text=True,encoding='utf-8',errors='replace',env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8')); o=r.stdout+r.stderr; print(o[-2500:]); sys.exit(0 if r.returncode==0 else 1)"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(backend): split inventory and accounts views into domain modules with barrel exports"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، شکستن فایل ۵٬۱۴۶ خطی `warehouse-backend/modules/warehouse/inventory/views.py` و فایل ۳٬۳۳۰ خطی `warehouse-backend/core/accounts/views.py` به ماژول‌های دامنه در `views_domains/` با حفظ Barrel در `views.py` (زیر ۱۲۰ خط) است:
- **الف) ساخت پوشه `warehouse-backend/modules/warehouse/inventory/views_domains/` با `__init__.py` و ۵ ماژول زیر:**
  1. `helpers.py`: شامل `_parse_decimal`، `_parse_date_flexible`، `_parse_positive_int`، `_clean_currency`، `_clean_invoice_type`، `_create_doc_task_snapshot`، `_soft_delete_items_cascade`، `_restore_item_photos_cascade`، `_cleanup_old_import_logs`، `ItemPagination` و `PriorityOrderingFilter`.
  2. `field_views.py`: شامل `ItemFieldDefinitionViewSet`.
  3. `item_views.py`: شامل `ItemViewSet`.
  4. `count_views.py`: شامل `CountTaskViewSet`.
  5. `doc_views.py`: شامل `DocTaskViewSet`.
  - در `inventory/views.py` تمام کلاس‌ها و توابع بالا را Re-export کن تا `inventory/views.py` زیر ۱۲۰ خط شود و `views_photos.py`، `urls.py` و تست‌ها بدون تغییر کار کنند.
- **ب) ساخت پوشه `warehouse-backend/core/accounts/views_domains/` با `__init__.py` و ۶ ماژول زیر:**
  1. `auth_views.py`: شامل `OptionalPageNumberPagination`، `CustomTokenObtainPairView`، `LogoutView`، `SwitchAppScopeView`.
  2. `user_views.py`: شامل `UserViewSet`، `UserTableViewStateViewSet`.
  3. `role_views.py`: شامل `CustomRoleViewSet`، `PermissionViewSet`.
  4. `audit_views.py`: شامل `_parse_query_date`، `StandardLogPagination`، `get_db_total_storage_info`، `get_table_storage_info`، `format_bytes_to_human`، `build_log_storage_payload`، `format_shamsi_datetime`، `UserLoginLogViewSet`، `AuditLogViewSet`.
  5. `backup_views.py`: شامل `DatabaseBackupViewSet`، `SystemHealthView`، `ConcurrencyStressTestView`.
  6. `session_views.py`: شامل `DeviceHeartbeatView`، `FleetSessionsListView`، `RevokeDeviceSessionView`.
  - در `accounts/views.py` تمام کلاس‌ها، توابع و وابستگی‌های قابل patch در تست‌ها (مانند `create_database_backup` یا `restore_database_backup`) را Re-export کن تا `accounts/views.py` زیر ۱۲۰ خط شود.
- در `warehouse-backend/modules/accounting/personnel/phase_guardian_approval.py` (خطوط ۲۴۶۰ و ۳۵۲۹) که محتوای `accounts/views.py` را از دیسک می‌خواند، طوری اصلاح کن که علاوه بر `accounts/views.py`، فایل‌های `accounts/views_domains/*.py` را هم بخواند.

۳. فرمان مجاز برای بررسی: `python scripts/automation/verify_tools.py django-check`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(backend): split inventory and accounts views into domain modules with barrel exports

===

نشست 7 از 12 — ماژولارسازی عمیق: پاکسازی سرویسهای هسته فرانتاند (sync-pull، persona، auth)، حذف پوشههای منسوخ و اصلاح اسکریپتهای dev

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import json,pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); pkg=json.loads(pathlib.Path('warehouse-front/package.json').read_text(encoding='utf-8')); sp=(app/'core/services/sync-pull.service.ts').read_text(encoding='utf-8'); ct=(app/'core/modules/module-contract.ts').read_text(encoding='utf-8'); old_dirs=(app/'services').exists() or (app/'guards').exists(); has_scripts='start:accounting' in pkg.get('scripts',{}) and 'start:warehouse' in pkg.get('scripts',{}); no_hardcoded_pull='/personnel/sync/pull/' not in sp and '/inventory/sync/pull/' not in sp and 'syncConfig' in ct; print('old_dirs:',old_dirs,'has_scripts:',has_scripts,'no_hardcoded_pull:',no_hardcoded_pull); sys.exit(0 if not old_dirs and has_scripts and no_hardcoded_pull else 1)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(front-core): decouple sync-pull endpoints via module contract and remove deprecated dirs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، تکمیل موارد باقی‌مانده از نشست‌های ۸ و ۹ طرح «راه میانهٔ ماژولار» در لایه هسته فرانت‌اند، حذف پوشه‌های منسوخ `src/app/services` و `src/app/guards` و رفع باگ اسکریپت‌های `start:accounting` و `start:warehouse` در `package.json` است:
- **الف) افزودن نقطه توسعه `syncConfig` به `src/app/core/modules/module-contract.ts` و پاکسازی `sync-pull.service.ts`:**
  - در `ExtensionMap` داخل `module-contract.ts`، فیلد `syncConfig?: { scopeKind: 'warehouse' | 'finance' | string; pullEndpoint: string; scopeParamKey: string; };` را تعریف کن.
  - در `modules/warehouse/module.ts` مقدار `syncConfig: { scopeKind: 'warehouse', pullEndpoint: '/inventory/sync/pull/', scopeParamKey: 'warehouse_id' }` و در `modules/accounting/module.ts` مقدار `syncConfig: { scopeKind: 'finance', pullEndpoint: '/personnel/sync/pull/', scopeParamKey: 'project_id' }` را ثبت کن.
  - در `src/app/core/services/sync-pull.service.ts`، آدرس‌های هاردکدشده `'/personnel/sync/pull/'` و `'/inventory/sync/pull/'` و `'project_id'` / `'warehouse_id'` را حذف کن و آن‌ها را از `INSTALLED_MODULES` (از طریق `extensions?.syncConfig`) بخوان.
- **ب) حذف پوشه‌های منسوخ و تکراری `src/app/services/` و `src/app/guards/`:**
  - ابتدا بررسی کن کدام فایل‌ها در پروژه هنوز از `app/services/...` یا `app/guards/...` ایمپورت می‌کنند:
    - اگر `src/app/services/settings.ts`، `settings.spec.ts` و `state.service.ts` هنوز مصرف‌کننده دارند، آن‌ها را با `git mv` به `src/app/core/services/` منتقل کن و ایمپورت‌های مصرف‌کنندگانشان را به `core/services/...` تغییر بده.
    - ایمپورت‌های به شیم‌های منسوخ `services/auth.service.ts`، `services/audit.service.ts`، `services/toast.service.ts` و `guards/auth.guard.ts` را به مسیر اصلی در `core/auth/`، `core/api/` و `shared/components/toast/` تغییر بده و هر دو پوشه قدیمی `src/app/services/` و `src/app/guards/` را به طور کامل با `git rm` حذف کن.
- **ج) بازگرداندن اسکریپت‌های `start:accounting` و `start:warehouse` در `warehouse-front/package.json`:**
  - فایل `dev-manager-modular.bat` (خطوط ۵۸ و ۶۷) فرمان‌های `npm run start:accounting -- --port 4300` و `npm run start:warehouse -- --port 4300` را صدا می‌زند. این دو اسکریپت را به `warehouse-front/package.json` اضافه کن تا با `ng serve --proxy-config proxy.conf.json` اجرا شوند.
- **د) محاسبه پویای `shortcutsCategory.count` در `user-menu.component.ts`:**
  - مطابق یادداشت ناظر در انتهای `Supervisor_Followups` (خط ۲۸۰)، در `shared/components/user-menu/user-menu.component.ts` شمارنده هر دسته در منوی کاربر را از روی تعداد واقعی آیتم‌های همان دسته محاسبه کن تا به عدد ثابت در `module.ts` وابسته نباشد.

۳. فرمان مجاز برای بررسی: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` و یک بار `python scripts/e2e/guardian_57_front_module_fence.py`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(front-core): decouple sync-pull endpoints via module contract and remove deprecated dirs

===

نشست 8 از 12 — ماژولارسازی عمیق: قطع 5 وابستگی متقاطع در common/shared و انتقال سرویسهای API ماژولها از core/api به داخل ماژولها

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); acc_api=list((app/'modules/accounting/api').glob('*.ts')) if (app/'modules/accounting/api').exists() else []; wh_api=list((app/'modules/warehouse/api').glob('*.ts')) if (app/'modules/warehouse/api').exists() else []; p_shim=app/'core/api/personnel-api.service.ts'; p_len=len(p_shim.read_text(encoding='utf-8').splitlines()) if p_shim.exists() else 0; print('acc_api count:',len(acc_api),'wh_api count:',len(wh_api),'core personnel-api lines:',p_len); sys.exit(0 if len(acc_api)>=5 and len(wh_api)>=8 and p_len<60 else 1)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(front-api): split personnel-api into 5 domain services and move warehouse APIs into module"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، شکستن مونولیت ۱٬۳۰۵ خطی `personnel-api.service.ts` به ۵ سرویس دامنه در `src/app/modules/accounting/api/` و انتقال سرویس‌های API اختصاصی انبار به `src/app/modules/warehouse/api/`، **همراه با حل پیش‌نیاز ۵ فایل در `core/common/shared` تا نگهبان ۵۷ (`core_to_module_imports = 0`) صددرصد سبز بماند** است:
- **گام ۱ (پیش‌نیاز حیاتی برای نگهبان ۵۷ — قطع ۵ وابستگی از `core/common/shared` به سرویس‌های ماژول):**
  1. در `modules/common/components/users/users.ts` (خط ۸۰۸) و `shared/components/user-menu/user-menu.component.ts` (خط ۵۴۲) که فقط متد `getFinancialProjects({ is_active: true })` را از `PersonnelApiService` صدا می‌زنند: متد `getFinancialProjects` را به `CompanyApiService` در `core/api/company-api.service.ts` (یا از طریق آدرس تعریف‌شده در اکستنشن `companyApiEndpoints` ماژول حسابداری) منتقل کن و ایمپورت `PersonnelApiService` را از `users.ts`، `users.spec.ts`، `user-menu.component.ts` و `user-menu.component.spec.ts` حذف کن.
  2. در `modules/common/components/settings/settings.ts` (خط ۱۲۰) که فقط `dynamicFieldApi.getFields()` را صدا می‌زند: این فراخوانی را از طریق `ApiService` هسته (مشروط به حضور اکستنشن انبار) انجام بده و ایمپورت `DynamicFieldApiService` را از `settings.ts` و `settings.spec.ts` حذف کن.
  3. در `core/services/import.service.ts`: بررسی کن که `ImportService` برای ایمپورت اکسل کالاهای انبار (`ItemApiService`) است؛ `ItemApiService` را در `modules/warehouse/api/item-api.service.ts` قرار بده و در `ImportService` به جای ایمپورت مستقیم `ItemApiService` از `modules/warehouse/`، فراخوانی‌های HTTP آن را از طریق `ApiService` هسته انجام بده تا `ImportService` در `core/services/` به `modules/warehouse/` ایمپورت نزند.
- **گام ۲ (شکستن `personnel-api.service.ts` به ۵ سرویس دامنه در `src/app/modules/accounting/api/`):**
  - پوشه `src/app/modules/accounting/api/` را بساز و کدهای `personnel-api.service.ts` را به ۵ فایل زیر تفکیک کن:
    1. `hr-api.service.ts` (پروفایل پرسنل، بانک، مدارک، درخواست تغییرات پرسنل)
    2. `fleet-api.service.ts` (خودرو/راننده، بانک، مدارک، درخواست تغییرات خودرو، تسویه ناوگان)
    3. `attendance-api.service.ts` (کارکرد روزانه، کارکرد ماهانه، سفرهای ناوگان)
    4. `payroll-api.service.ts` (تنظیمات سالانه حقوق، محاسبه حقوق، فیش، دیسکت بیمه/مالیات/بانک)
    5. `treasury-org-api.service.ts` (پروژه‌ها، بخش‌ها، انتساب بخش، طرف‌حساب‌ها، فاکتورهای هزینه، تنخواه، گوگل‌درایو شرکت)
  - در `src/app/modules/accounting/api/personnel-api.service.ts`، کلاس `PersonnelApiService` را به عنوان Facade تجمیع‌کننده ۵ سرویس بالا قرار بده و تمام اینترفیس‌ها را Re-export کن.
  - تمام ۳۹ فایل داخل `src/app/modules/accounting/` و فایل تست `personnel-fleet.spec.ts` را به `modules/accounting/api/personnel-api.service` متصل کن.
  - توجه به `warehouse-backend/modules/accounting/personnel/section_guardian.py` (خط ۲۷۸): فایل `src/app/core/api/personnel-api.service.ts` را به یک شیم کوچک (زیر ۴۰ خط، بدون ایمپورت از `modules/accounting` تا نگهبان ۵۷ نقض نگیرد) تبدیل کن و در `section_guardian.py` مسیر بررسی را به پوشه `src/app/modules/accounting/api/` نیز گسترش بده.
- **گام ۳ (انتقال سرویس‌های API اختصاصی انبار به `src/app/modules/warehouse/api/`):**
  - فایل‌های `count-task-api.service.ts`، `doc-task-api.service.ts`، `item-api.service.ts`، `dynamic-field-api.service.ts`، `feeding-api.service.ts`، `label-api.service.ts`، `project-api.service.ts`، `tag-api.service.ts` و `dashboard-api.service.ts` را با `git mv` به `src/app/modules/warehouse/api/` منتقل کن، آن‌ها را از `src/app/core/api/index.ts` بردار و ایمپورت‌هایشان را در فایل‌های داخل `src/app/modules/warehouse/` به‌روز کن.

۳. فرمان مجاز برای بررسی: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` و اجرای `python scripts/e2e/guardian_57_front_module_fence.py`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(front-api): split personnel-api into 5 domain services and move warehouse APIs into module

===

نشست 9 از 12 — ماژولارسازی عمیق: تفکیک مونولیت offline-sync.service.ts (1478 خط) و استورهای تسک انبار

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); sync_f=app/'core/services/offline-sync.service.ts'; sync_len=len(sync_f.read_text(encoding='utf-8').splitlines()); helpers=list((app/'core/services/offline').glob('*.ts')) if (app/'core/services/offline').exists() else []; wh_stores=(app/'modules/warehouse/services/count-task-store.ts').exists() and (app/'modules/warehouse/services/doc-task-store.ts').exists(); print('offline-sync lines:',sync_len,'offline helpers:',[f.name for f in helpers],'wh_stores moved:',wh_stores); sys.exit(0 if sync_len<700 and len(helpers)>=3 and wh_stores else 1)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(offline): modularize offline-sync service into focused helpers and move task stores to warehouse"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، شکستن فایل ۱٬۴۷۸ خطی `src/app/core/services/offline-sync.service.ts` به ماژول‌های کمکی در `src/app/core/services/offline/` و انتقال دو استور اختصاصی انبار (`count-task-store.ts` و `doc-task-store.ts`) به `src/app/modules/warehouse/services/` است:
- **الف) انتقال `count-task-store.ts` و `doc-task-store.ts` به `src/app/modules/warehouse/services/`:**
  - بررسی کن که این دو استور فقط در کامپوننت‌های ماژول انبار (`counter-dashboard` و `customs`) استفاده می‌شوند. آن‌ها را با `git mv` به `src/app/modules/warehouse/services/` منتقل کن و ایمپورت‌هایشان را در ماژول انبار به‌روز کن.
- **ب) تفکیک `core/services/offline-sync.service.ts` (۱٬۴۷۸ خط) به زیرماژول‌های `core/services/offline/`:**
  - پوشه `src/app/core/services/offline/` را بساز و منطق‌های درونی `OfflineSyncService` را به ۳ یا ۴ ماژول تخصصی تفکیک کن:
    1. `offline-sync.models.ts`: اینترفیس‌ها، تایپ‌ها و ثوابت همگام‌سازی.
    2. `offline-local-patcher.ts`: توابع اعمال خوش‌بینانه تغییرات روی جداول محلی (`applyOptimisticUpdate`، ادغام رکوردهای `_offlinePending` و مدیریت کش محلی).
    3. `offline-conflict-manager.ts`: منطق تشخیص تداخل ۴۰۹/۴۰۰، ساخت رکوردهای `syncErrors` و بازپخش (`retry` / `resolveConflict`).
    4. `offline-queue-runner.ts`: منطق پردازش ترتیبی صف، مدیریت هدرها و توکن‌های قلمرو.
  - کلاس `OfflineSyncService` در `core/services/offline-sync.service.ts` تمام متدها، سیگنال‌ها و Observableهای عمومی فعلی خود را صددرصد حفظ کند (تا هیچ کامپوننت یا تستی نشکند) و حجم فایل `offline-sync.service.ts` به زیر ۷۰۰ خط کاهش یابد.
  - در `warehouse-backend/modules/accounting/personnel/phase_guardian_approval.py` (خطوط ۲۲۵۱ و ۲۳۴۱) که فایل `offline-sync.service.ts` را باز می‌کند، بررسی کن که اگر به دنبال عبارت خاصی در متن فایل می‌گردد، یا آن عبارت در `offline-sync.service.ts` بماند یا اسکریپت فایل‌های `core/services/offline/*.ts` را نیز بخواند.

۳. فرمان مجاز برای بررسی: یک بار `npx ng build --output-path ../scratch/ng-build-agent` و یک بار `python scripts/e2e/guardian_57_front_module_fence.py`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(offline): modularize offline-sync service into focused helpers and move task stores to warehouse

===

نشست 10 از 12 — ماژولارسازی عمیق: شکستن 4 کامپوننت غولپیکر ماژول مالی با الگوی Facade Service بدون تغییر قالب

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; acc=pathlib.Path('warehouse-front/src/app/modules/accounting/components'); files=[acc/'finance/employee/employee-new-personnel/employee-new-personnel.ts',acc/'finance/employee/employee-new-vehicle/employee-new-vehicle.ts',acc/'finance/employee/employee-attendance/employee-attendance.ts',acc/'organization/projects-and-sections/projects-and-sections.ts']; lines=[len(f.read_text(encoding='utf-8').splitlines()) for f in files]; facades=[f.with_name(f.stem+'.facade.ts').exists() for f in files]; print('lines:',lines,'facades:',facades); sys.exit(0 if all(l<1500 for l in lines) and all(facades) else 1)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(accounting-ui): extract facade services and helpers for 4 large accounting components"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵، ۶، ۷، ۹ و ۱۰ برقرارند (به‌ویژه بند ۳ درباره نگهبان ۵۶ و عدم حذف هیچ تگ یا هندلر قالب HTML). hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، شکستن ۴ کامپوننت بالای ۱٬۶۰۰ تا ۲٬۸۱۱ خط در ماژول مالی (`src/app/modules/accounting/components/`) به کمک الگوی `*.facade.ts` و `*.helpers.ts` **بدون دست زدن به فایل‌های قالب `.html`** است تا حجم هر ۴ کامپوننت به زیر ۱٬۵۰۰ خط برسد:
- **۱) `employee-new-personnel.ts` (۲٬۸۱۱ خط):**
  - ساخت `employee-new-personnel.facade.ts` (و در صورت نیاز `employee-new-personnel.helpers.ts`) در همان پوشه.
  - انتقال منطق‌های سنگین پردازش اکسل، نگاشت و اعتبارسنجی شبا و بانک، تبدیل تاریخ شمسی، ساخت فرم‌دیتا و مدیریت مدارک به Facade/Helpers و حفظ متدهای فراخوانی‌شده از قالب `.html` و تست‌های `.spec.ts` به صورت متدهای تفویضی (delegation) کوتاه در کامپوننت.
- **۲) `employee-new-vehicle.ts` (۲٬۶۱۹ خط):**
  - ساخت `employee-new-vehicle.facade.ts` و `employee-new-vehicle.helpers.ts` در همان پوشه و انتقال منطق پلاک خودرو، شبا/بانک، اکسل و فیلترها به آن.
  - توجه ویژه: ابتدا `employee-new-vehicle.dom.spec.ts` و `employee-new-vehicle.spec.ts` را بخوان تا هر عبارت متنی که با `fs.readFileSync` در خود فایل `.ts` چک می‌شود در کامپوننت حفظ گردد.
- **۳) `employee-attendance.ts` (۱٬۷۷۲ خط):**
  - ساخت `employee-attendance.facade.ts` و انتقال محاسبات ماتریس کارکرد، تقویم شمسی، تعطیلات/جمعه‌کاری و عملیات گروهی به آن.
- **۴) `projects-and-sections.ts` (۱٬۶۰۲ خط):**
  - ساخت `projects-and-sections.facade.ts` در `modules/accounting/components/organization/projects-and-sections/` و انتقال منطق مدیریت درخت پروژه/بخش، تنظیمات موثر حقوق و دستمزد پروژه، انتساب کاربران و اکسل به آن.

۳. فرمان مجاز برای بررسی: یک بار `npx ng build --output-path ../scratch/ng-build-agent` و یک بار `python scripts/e2e/guardian_56_change_integrity.py --base <پایه>`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(accounting-ui): extract facade services and helpers for 4 large accounting components

===

نشست 11 از 12 — ماژولارسازی عمیق: شکستن 4 کامپوننت غولپیکر ماژول انبار با الگوی Facade Service بدون تغییر قالب

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; wh=pathlib.Path('warehouse-front/src/app/modules/warehouse/components'); files=[wh/'customs/customs.ts',wh/'counter/counter-dashboard/counter-dashboard.ts',wh/'supervisor/supervisor-dashboard/supervisor-dashboard.ts',wh/'manager-review/manager-review.ts']; lines=[len(f.read_text(encoding='utf-8').splitlines()) for f in files]; facades=[f.with_name(f.stem+'.facade.ts').exists() for f in files]; print('lines:',lines,'facades:',facades); sys.exit(0 if all(l<1450 for l in lines) and all(facades) else 1)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(warehouse-ui): extract facade services and helpers for 4 large warehouse cartables"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست، شکستن ۴ کامپوننت بالای ۲٬۱۵۰ خط در ماژول انبار (`src/app/modules/warehouse/components/`) به کمک الگوی `*.facade.ts` و `*.helpers.ts` **بدون تغییر در فایل‌های قالب `.html`** است تا حجم هر ۴ فایل `.ts` به زیر ۱٬۴۵۰ خط کاهش یابد:
- **۱) `customs/customs.ts` (۲٬۵۵۷ خط):**
  - ساخت `customs.facade.ts` و انتقال منطق فیلترها، اعتبارسنجی و نگاشت ۱۴ فیلد اسناد مالی/گمرکی، عملیات گروهی، اسکن بارکد و ادغام کش آفلاین به آن.
- **۲) `counter/counter-dashboard/counter-dashboard.ts` (۲٬۲۱۰ خط):**
  - ساخت `counter-dashboard.facade.ts` و انتقال منطق سورت بازشماری (`recount_first`)، پچ درجای وب‌سوکت، ادغام رکوردهای `_offlinePending` و جستجوی OmniSearch به آن.
- **۳) `supervisor/supervisor-dashboard/supervisor-dashboard.ts` (۲٬۱۵۲ خط):**
  - ساخت `supervisor-dashboard.facade.ts` و استخراج منطق فیلتر مغایرت‌ها، تایید/رد گروهی، مدیریت ستون‌های پویا و وب‌سوکت به آن.
- **۴) `manager-review/manager-review.ts` (۲٬۱۹۶ خط):**
  - ساخت `manager-review.facade.ts` و استخراج منطق بررسی نهایی مدیر، ارجاع بازشماری، اکسپورت اکسل و آمارهای لحظه‌ای به آن.
- پیش از ویرایش هر فایل، `.spec.ts` کنار آن را بخوان تا هیچ متد یا پراپرتی مورد استفاده در تست یا قالب حذف نشود.

۳. فرمان مجاز برای بررسی: یک بار `npx ng build --output-path ../scratch/ng-build-agent` و یک بار `python scripts/e2e/guardian_56_change_integrity.py --base <پایه>`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(warehouse-ui): extract facade services and helpers for 4 large warehouse cartables

===

نشست 12 از 12 — ماژولارسازی عمیق: شکستن 4 کامپوننت غولپیکر پلتفرم، ثبت سقف اندازه فایل در نگهبانهای 29 و 57 و بهروزرسانی نقشه معماری

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; cm=pathlib.Path('warehouse-front/src/app/modules/common/components'); files=[cm/'operations/companies/companies.ts',cm/'users/users.ts',cm/'audit/audit.ts',cm/'id-cards/id-cards.ts']; lines=[len(f.read_text(encoding='utf-8').splitlines()) for f in files]; facades=[f.with_name(f.stem+'.facade.ts').exists() for f in files]; print('lines:',lines,'facades:',facades); sys.exit(0 if all(l<1500 for l in lines) and all(facades) else 1)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/e2e/guardian_57_front_module_fence.py --self-test
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py sample-module
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(platform-ui): extract facades for common components and update architecture map"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قوانین `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند. hash فعلی HEAD را یادداشت کن.

۲. هدف این نشست پایانی، شکستن ۴ کامپوننت بزرگ لایه مشترک پلتفرم (`companies.ts`، `users.ts`، `audit.ts`، `id-cards.ts`) به کمک الگوی `*.facade.ts` (تا زیر ۱٬۵۰۰ خط) و به‌روزرسانی مستندات معماری و نگهبان‌ها است:
- **۱) `operations/companies/companies.ts` (۲٬۶۹۱ خط):**
  - ساخت `companies.facade.ts` و انتقال منطق مدیریت حساب‌های بانکی شرکت، اعضای هیئت‌مدیره، دوره‌های مالی، اسناد حقوقی شرکت و اعتبارسنجی شبا به آن.
  - توجه ویژه: ابتدا `companies.dom.spec.ts` را بخوان و تمام گترها و الگوهای بررسی‌شده با Regex در متن `companies.ts` (مانند `providesTreasury`، `isAccountingInstalled`، `isWarehouseInstalled` و `tableColspan`) را عیناً در `companies.ts` حفظ کن تا هر ۶۵ تست DOM آن سبز بمانند.
- **۲) `users/users.ts` (۲٬۶۶۸ خط):**
  - ساخت `users.facade.ts` و استخراج منطق ماتریس مجوزها، درخت نقش‌ها، پیش‌تنظیم‌های دسترسی، ایمپورت/اکسپورت اکسل و فیلترهای کاربران به آن.
  - توجه ویژه: ابتدا `users.spec.ts` را بخوان تا تمام متدهای مورد انتظار ۵۱ تست واحد آن در کلاس `Users` حفظ شوند.
- **۳) `audit/audit.ts` (۲٬۴۱۵ خط):**
  - ساخت `audit.facade.ts` و استخراج منطق فیلترهای تاریخ شمسی، پیش‌نمایش بازگردانی (`rollback preview`)، آمار حجم دیتابیس و اکسپورت لاگ‌ها به آن.
- **۴) `id-cards/id-cards.ts` (۱٬۶۳۴ خط):**
  - ساخت `id-cards.facade.ts` و استخراج منطق رندر Canvas، پیش‌تنظیم‌های ابعاد چاپ، تولید QR Code و مدیریت قالب‌های کارت شناسایی به آن.
- **۵) به‌روزرسانی نقشه معماری:**
  - در `.agents/PROJECT_ARCHITECTURE_MAP.md` و `CLAUDE.md`، ساختار جدید پکیج‌های دامنه بک‌اند (`models_domains/`، `serializers_domains/`، `views_domains/`) و سرویس‌های ماژولار فرانت‌اند (`modules/warehouse/api/`، `modules/accounting/api/` و `*.facade.ts`) را ثبت کن.

۳. فرمان‌های مجاز برای بررسی: یک بار `npx ng build --output-path ../scratch/ng-build-agent`، یک بار `python scripts/e2e/guardian_56_change_integrity.py --base <پایه>` و یک بار `python scripts/e2e/guardian_57_front_module_fence.py --self-test`.

۴. در پایان:
- خودبازبینی با `git diff --stat <پایه>`.
- فقط فایل‌های تغییریافته خودت را stage کن و با این پیام commit کن، بدون push:
refactor(platform-ui): extract facades for common components and update architecture map
```

## ۵. بازبینی ناظر و Antigravity و صف نهایی (۲۴ مهر ۱۴۰۵)

ناظر (Claude) طرح را روی HEAD `5068a9b` بازبینی کرد. Antigravity در گفت‌وگوی `e7c8a18f` با هر ۱۴ بند موافقت کرد. کاربر سه پرسش باز را پاسخ داد. صف نهایی ۱۱ نشست است و در `tasks.md` قرار دارد.

### ۵.۱. تفاوت‌ها با بخش‌های ۱ تا ۴

- **نشست‌های ۱ و ۲ قدیم حذف شدند.** دامنهٔ شرکت در اکشن‌های `VehicleTripViewSet` پیش‌تر در `d189c44`، `342b305`، `d985774` و `844af09` بسته شده بود. آزمون‌های personnel هم در `685d22e` و `d5c206a` درست شده بودند. فقط همگام‌سازی `packages/*/pyproject.toml` باز بود و به نشست ۱ تازه رفت.
- **بدون شماره خط.** متن تسک‌ها فقط نام نماد و فایل دارد.
- **«تلهٔ» یافتهٔ ۵ وجود ندارد.** `BASE_DIR` در `personnel/section_guardian.py` و `personnel/phase_guardian_approval.py` به `warehouse-backend` می‌رسد. پس مسیرهایی که این دو می‌خوانند از پیش از جابه‌جایی ماژولار وجود ندارند. این دو فایل در این صف دست نمی‌خورند.
- **`guardian_49_sod_enforcement.py` وجود ندارد.** نگهبان ۴۹ مخزن `guardian_49_users_backend_n1.py` است. خط‌های verify آن برداشته شدند.
- **Barrel فقط با import صریح.** `import *` نام‌های آغازشده با `_` را صادر نمی‌کند. ابزار تازهٔ `verify_tools.py module-names` این را می‌سنجد: هر نامی که ماژول روی پایه تعریف کرده و هر نامی که بقیهٔ بک‌اند از آن import می‌کند، باید هنوز در دسترس باشد.
- **جابه‌جایی مکانیکی.** فایل‌های بزرگ با اسکریپت یک‌بارمصرف `ast` در `scratch/` و بایت‌به‌بایت شکسته می‌شوند، نه با بازنویسی.
- **هسته آدرس API ماژول را نمی‌شناسد.** به‌جای انتقال `getFinancialProjects` به `CompanyApiService`، نقطه‌های توسعهٔ داده‌ای `projectLookup`، `dynamicFields`، `syncConfig` و `photoUpload` در `ExtensionMap` اضافه می‌شوند (الگوی `companyApiEndpoints`).
- **`photo-upload-queue.service.ts` در هسته می‌ماند**، چون `offline-sync.service.ts` و `domain-migration.service.ts` از آن استفاده می‌کنند. فقط آدرس آپلود از نقطهٔ توسعه می‌آید (نشست ۸).
- **`import.service.ts` همراه `import-leave.guard.ts`** به ماژول انبار می‌رود، چون این guard فقط در `warehouse.routes.ts` به کار می‌رود.
- **شیم `core/api/personnel-api.service.ts` ساخته نمی‌شود.** فایل کامل به `modules/accounting/api/` می‌رود.
- **نشست ۸ قدیم دو نشست شد:** نشست ۶ برای انتقال سرویس‌های انبار (به‌همراه دو استور `count-task-store` و `doc-task-store`، به پیشنهاد Antigravity) و نشست ۷ برای شکستن `personnel-api`.
- **فیلترهای ممیزی رفتار را عوض نمی‌کنند.** فهرست‌های ثابت `AuditLogViewSet` با `audit_modules` رجیستری یکی نیستند (مثلاً `'personnel'`، `'finance'` و `'warehouses'` در رجیستری نیستند و `'projects'` و `'invoices'` در فهرست ثابت نیستند). پس فیلد تازهٔ `ModuleSpec.audit_scope_keys` دقیقاً همان فهرست‌های امروز را نگه می‌دارد.
- **Facadeها در `providers` همان کامپوننت** ثبت می‌شوند، نه `providedIn: 'root'`. قالب‌های `.html` با خط verify `diff-free` قفل‌اند.
- **`CLAUDE.md` را ناظر به‌روز می‌کند**، نه عامل.
- **اندازهٔ فایل‌های دامنه:** در `models_domains/` و `serializers_domains/` حداکثر ۹۰۰ خط و در `views_domains/` حداکثر ۲۶۰۰ خط (برای inventory ۲۸۰۰ خط). `ItemViewSet` به‌تنهایی ۲٬۵۰۳ خط و `PersonnelProfileViewSet` ۲٬۰۴۷ خط است.

### ۵.۲. تصمیم‌های کاربر

- **آزمون‌های شکستهٔ بک‌اند فعلاً می‌مانند.** روی HEAD، ۷۷۶ آزمون اجرا شد: ۲۴ شکست و ۹ خطا، که ۳۲ تا در `inventory` و یکی در `warehouses` است. فهرست کامل در `scripts/automation/known_backend_failures.txt` است. ابزار تازهٔ `verify_tools.py django-tests` فقط شکست تازه را رد می‌کند. رفع این آزمون‌ها کار جداگانه‌ای است.
- **`dev-manager-modular.bat` به `npm start` کامل** تغییر می‌کند. اسکریپت‌های `start:accounting` و `start:warehouse` برنمی‌گردند، چون `ng serve` ساده ماژول‌ها را جدا نمی‌کند.
- **سقف اندازهٔ فایل** (۱۵۰۰ خط) با فایل مبنا به نگهبان‌های ۲۹ و ۵۷ اضافه می‌شود (نشست ۱۱).

### ۵.۳. صف نهایی

| نشست | کار | لایه |
|---|---|---|
| ۱ | پاکسازی هستهٔ بک‌اند (SoD، `SwitchAppScopeView`، role resolver، فیلتر ممیزی، گوگل‌درایو) و `pyproject` بسته‌ها | بک‌اند |
| ۲ | تفکیک `models.py` و `serializers.py` در personnel | بک‌اند |
| ۳ | تفکیک `personnel/views.py` | بک‌اند |
| ۴ | تفکیک `inventory/views.py` و `accounts/views.py` | بک‌اند |
| ۵ | `syncConfig` برای `sync-pull`، حذف `app/services` و `app/guards`، اصلاح `dev-manager-modular.bat` | فرانت |
| ۶ | `projectLookup` و `dynamicFields`، انتقال سرویس‌ها، استورها و گالری عکس انبار به `modules/warehouse` | فرانت |
| ۷ | شکستن `personnel-api` به ۵ سرویس در `modules/accounting/api` | فرانت |
| ۸ | تفکیک `offline-sync.service.ts` و `photoUpload` | فرانت (دادهٔ آفلاین) |
| ۹ | Facade برای ۴ کامپوننت مالی | فرانت |
| ۱۰ | Facade برای ۴ کارتابل انبار | فرانت |
| ۱۱ | Facade برای ۴ کامپوننت پلتفرم، سقف اندازهٔ فایل، نقشهٔ معماری | فول‌استک |

**بازبین‌ها (ناظر، پس از هر نشست):** نشست ۱ تا ۴ `tenant-scope-reviewer`؛ نشست ۵ و ۸ و ۱۰ `data-loss-reviewer`؛ نشست ۹ تا ۱۱ `ui-reviewer` فقط اگر فایل قالب یا استایل تغییر کرده باشد.

## گزارش پیشرفت

- **۲۴ مهر ۱۴۰۵، Claude — بازبینی و آماده‌سازی صف:**
  - بازبینی طرح روی `5068a9b` با ۱۴ یافته؛ موافقت کامل Antigravity؛ پاسخ کاربر به ۳ پرسش.
  - ابزارهای تازهٔ `module-names` و `django-tests` در `scripts/automation/verify_tools.py` روی HEAD آزموده شدند. هر دو حالت قبول و رد کار می‌کند.
  - نگهبان‌های ۲۹، ۳۰، ۳۱، ۵۲، ۵۴، ۵۵، ۵۶ و ۵۷ (با `--self-test`) روی HEAD سبزند.
  - همهٔ خط‌های verify ایستای ۱۱ نشست روی HEAD اجرا شدند و همه، چنان‌که باید، رد شدند.
  - **اقدام بعدی:** اجرای صف با `.\run_tasks.bat` و نظارت نشست‌به‌نشست.

- **۲۴ مهر ۱۴۰۵، Claude — اجرای صف (کاربر خواب، بدون پرسش):**
  - **گیر ترمینال Antigravity:** پس از به‌روزرسانی خودکار Antigravity به ۲.۲۳.۱، فرمان‌های عامل در ترمینال IDE در وضعیت RUNNING می‌ماندند. حتی پس از راه‌اندازی دوبارهٔ IDE هم همین بود. `send_message` در `run_tasks.py` حالا `toolConfig.runCommand.forceGoTerminalExecution` را می‌فرستد و فرمان‌ها با خود language server اجرا می‌شوند (`d9a1186`).
  - **نشست‌های ۱ تا ۶ سبز شدند:** `62175ec`، `409d804`، `79d64ba` (پس از یک دور اصلاح)، `95e4581`، `4f7949c` به‌همراه `5700c1f` (پس از یک دور اصلاح)، و `83157ad`.
  - **بازبینی ناظر:**
    - در نشست‌های ۲ تا ۴، با مقایسهٔ `ast` بررسی شد که بدنهٔ همهٔ کلاس‌ها و توابع بایت‌به‌بایت منتقل شده است. تنها تفاوت‌ها کلید خارجی رشته‌ای و عمق import نسبی است.
    - در نشست ۱، ۱۶ قانون SoD با همان ترتیب ماند. `tenant-scope-reviewer` یک یافته داشت که در `scratch/deep_mod_findings.md` آمده است.
    - در نشست ۵ و ۶، `sync-pull` و فراخوانی‌های `projectLookup` و `dynamicFields` با نسخهٔ قبل هم‌ارزند (همان URL، همان پارامتر و همان رفتار خطا).
  - **یافته‌های تأییدشده برای نشست اصلاح پایانی** (`scratch/deep_mod_findings.md`):
    1. `audit_scope_keys` از `_REGISTRY` می‌خواند. پس در پروفایل تک‌ماژول انبار، استثنای لاگ‌های مالی خالی می‌شود. باید از `MODULE_CATALOG` بخواند.
    2. دو خط `rem` فارسی در `dev-manager-modular.bat` باید انگلیسی شوند.
  - **اقدام بعدی:** نظارت بر نشست‌های ۷ تا ۱۱. پس از نشست ۸ و ۱۰، `data-loss-reviewer` اجرا شود. در پایان یک نشست اصلاح برای یافته‌ها به `tasks.md` افزوده شود.

- **۲۴ مهر ۱۴۰۵، Claude — پایان صف (تحویل):**
  - **نشست‌های ۷، ۸ و ۱۱ سبز شدند:** `de01d8e`، `18b9223` و `8b98365`. هر ۱۹۲ متد عمومی `PersonnelApiService` در Facade ماند. بازبینی رفتاری نشست ۱۱ تمیز بود.
  - **نشست‌های ۹ و ۱۰ برگردانده شدند (`633c22c` و `cc2aecf`، به تصمیم کاربر):**
    - بازبین‌ها ۱۳ باگ رفتاری در Facadeهای مالی و انبار یافتند. مهم‌ترین‌ها: حذف enqueue صف آفلاین در `counter-dashboard`، پاک شدن پیش‌نویس محلی پرسنل حتی وقتی ذخیره شکست بخورد، شل شدن اعتبارسنجی شبا و کد ملی، و به‌روز نشدن SWR کارتابل سرپرست و مدیر.
    - کد آن ۸ کامپوننت دقیقاً به حالت `18b9223` برگشت (diff صفر).
  - **تصمیم کاربر:** شمار خط ربطی به ماژولار بودن ندارد. سقف ۱۵۰۰ خط و سقف اندازه در نگهبان‌ها از نشست ۱۱ حذف شد.
  - **نشست اصلاح ۱۲ (`d57b2ec` و `09fd3f7`):** `audit_scope_keys` از `MODULE_CATALOG` می‌خواند. `runQueue` دقیقاً مثل `de01d8e` رفتار می‌کند (`data-loss-reviewer` تأیید کرد). خط‌های `rem` فایل bat حالا ASCII است. نقشهٔ معماری اصلاح شد.
  - **نشست اصلاح ۱۳ (`96b3027`):**
    - در نشست ۱۲، `getInstance()` به `inject()` تغییر کرده بود و پوستهٔ برنامه را در خطر NG0203 می‌گذاشت.
    - حالا `ModuleRegistryService` با `useFactory: getModuleRegistry` فقط یک نمونه دارد، و `SyncPullService` و `PhotoUploadQueueService` دوباره با `new` ساخته می‌شوند. دو آزمون این دو حالت را پوشش می‌دهند.
  - **ابزار runner:**
    - فرمان‌ها با `forceGoTerminalExecution` اجرا می‌شوند (`d9a1186`).
    - وضعیت ۵ (گام‌های فشرده‌شده) پایان‌یافته حساب می‌شود (`f4d3502`).
  - **تصمیم کاربر:** از این به بعد گفت‌وگوی Claude و Antigravity به انگلیسی است (`.agents/AGENTS.md` §10، `5f36185`).
  - **باز:**
    - ۳۲ آزمون شکستهٔ `inventory` و یک آزمون `warehouses` از پیش وجود داشتند (`scripts/automation/known_backend_failures.txt`).
    - `clearQueue` از `offline-pending-badge` کل صف را پاک می‌کند. این مسیر قدیمی است و `data-loss-reviewer` گزارشش کرد. باید جدا بررسی شود.
  - **آزموده‌نشده:** صفحه‌های پشت ورود (پوستهٔ برنامه پس از login و کارتابل‌ها) فقط با بیلد و آزمون‌های واحد سنجیده شده‌اند. آزمون دستی پس از release روی `app` با کاربر است.
  - **اقدام بعدی:** release روی `app` با Antigravity، با تسک انگلیسی.

- **۲۴ مهر ۱۴۰۵، Claude — release، آزمون‌های کهنه، صف آفلاین (نشست‌های ۱۴ تا ۱۸):**
  - **ابزار runner:** `release-mark` و `release-check` به `verify_tools.py` افزوده شد (`6800971`). `release-check` پشتیبان تازه، بیلد وصله‌شده، daphne و worker تازه، heartbeat و ۲۰۰ را می‌سنجد.
  - **نشست ۱۴ (release روی `app`):** سبز شد. Antigravity از محیط خودش نمی‌تواند با `wt.exe` تب باز کند؛ daphne و worker را زیر language server خودش اجرا کرد. Claude آن‌ها را به تب‌های Windows Terminal منتقل کرد. درس: در release بعدی، راه‌اندازی دوباره از سمت runner انجام شود.
  - **نشست ۱۵ (`f2d8b95`):** ۳۲ آزمون کهنه با شرکت و انبار در fixture درست شدند (۱۳۵ آزمون، تنها شکست همان باگ واقعی). فهرست `known_backend_failures.txt` به یک آزمون رسید (`1ce106f`).
  - **باگ‌های واقعی گزارش‌شده به کاربر (اصلاح نشده):**
    1. POST دوبارهٔ کالا با همان `sync_id` پاسخ ۴۰۰ می‌گیرد؛ اعتبارسنج یکتایی `(warehouse, fa_unic_code)` پیش از مسیر idempotent اجرا می‌شود.
    2. مجوز `view_wh_stocktaking` در هیچ مایگریشنی ساخته نمی‌شود.
  - **نشست ۱۶ (`3223fa4`):** چهار فایل DOM آزمون کامپایل شدند و آزمون‌های خودآزما حذف شدند (۹۰۳ به ۹۳۱ آزمون سبز).
  - **نشست ۱۷ (`5636a55`):** «لغو همه موارد» و `clearQueue` حذف شد؛ فهرست فقط رکوردهای خود کاربر؛ لغو تکی با دیالوگ تأیید و بدون لغو رکورد در حال ارسال.
    - `data-loss-reviewer` یک یافتهٔ بالا داشت که تأیید شد: دو صف شناسهٔ مستقل دارند و لغو بدون scope می‌تواند رکورد هم‌شناسهٔ صف دیگر را حذف کند.
    - دور اصلاح نشست ۱۷ تزریق دیالوگ را اختیاری کرد و نبودش را بی‌تأیید رد می‌کرد.
  - **نشست ۱۸ (`a82e6f6`):** لغو تکی `appScope` را می‌فرستد. شناسهٔ موجود در هر دو صف بدون scope رد می‌شود. خواندن، شرط‌ها و حذف در یک تراکنش‌اند. نبود دیالوگ تأیید یعنی لغو نشود (fail-closed).
  - **نشست ۱۹ (`6ada043`):**
    - خطای خواندن در لغو بدون scope لغو را رد می‌کند.
    - شاخهٔ شناسهٔ عددی در badge حذف شد.
    - موفقیت فقط از تلاشی که کامل شد گزارش می‌شود.
    - `data-loss-reviewer` روی هر دو نشست ۱۸ و ۱۹ تمیز بود.
  - **نشست ۲۰:** release فقط فرانت روی `app` با `release-check --frontend-only` (`bc42807`) سبز شد. بک‌اند از نشست ۱۴ تغییری نداشت و daphne دست نخورد.
  - **آزموده‌نشده:** صفحه‌های پشت ورود (لغو تکی در صف badge و کارتابل‌ها) با کاربر است.
  - **اقدام بعدی:**
    - تصمیم کاربر دربارهٔ دو باگ واقعی.
    - بررسی گزارش‌های آزمون دستی کاربر با `systematic-debugging` و تسک اصلاح برای Antigravity.

- **۲۴ مهر ۱۴۰۵، Claude — اصلاح دو باگ واقعی (نشست‌های ۲۱ تا ۲۵، با تأیید کاربر):**
  - **ابزار runner (`5a58a55`):** `restart-backend` (بستن daphne و بالا آوردنش در تب WT از سمت runner) و `release-check --backend-only`.
  - **نشست ۲۱ (`2a63d96`) و ۲۴ (`59d5e3d`):**
    - تکرار POST کالا با همان `sync_id` حالا کالای موجود را بی‌تغییر با ۲۰۰ برمی‌گرداند. بیرون از محدوده ۴۰۳ است.
    - `tenant-scope-reviewer` در نسخهٔ ۲۱ سه مشکل یافت: بازنویسی ویرایش‌های تازه‌تر، احیای کالای حذف‌شده، و انتقال کالا به انبار شرکت دیگر. نشست ۲۴ هر سه را بست.
    - `perform_create` و `perform_update` حالا انبار مقصد را با `_ensure_target_warehouse_in_scope` می‌سنجند.
    - بازبینی دوم تمیز بود.
  - **نشست ۲۲ (`36da05f`):**
    - مجوز `view_wh_stocktaking` به `CustomUser.Meta.permissions` افزوده شد.
    - مهاجرت افزایشی `accounts/0002_view_wh_stocktaking_permission` شامل `AlterModelOptions` و تغییر نام با `RunPython.noop` است.
    - روی `app` اعمال شد و ۱۷۶ آزمون سبز شد.
    - روی `soft` هنوز اجرا نشده است؛ با release بعدی `soft` و تأیید کاربر.
  - **نشست ۲۳ و ۲۵:** release بک‌اند روی `app`. پشتیبان گرفته شد و daphne را runner دوباره راه انداخت.
  - **`known_backend_failures.txt`:** آزمون idempotency حالا سبز است. فهرست باید خالی شود (کار Claude).
  - **یافته‌های قدیمی و تأییدشده، اصلاح‌نشده (منتظر تصمیم کاربر):**
    - `bulk_update` (`item_views.py` حدود ۷۰۲) فیلد `warehouse` را بی‌بررسی می‌نویسد.
    - `import_excel`، `clear_warehouse_data` و `delete_from_excel` فقط `can_access_warehouse` دارند و بررسی شرکت ندارند. کاربرِ بدون انبار تخصیصی در شرکت A می‌تواند روی انبار شرکت B بنویسد یا آن را پاک (نرم) کند.

- **۲۴ مهر ۱۴۰۵، Claude — صف نشست‌های ۲۶ و ۲۷ (تحویل در میانهٔ اجرا):**
  - **نشست ۲۶ (`scratch/tasks_26_27.md`):** بررسی شرکت در همهٔ مسیرهای نوشتن `ItemViewSet`.
    - `_allowed_warehouse_ids` و `_can_write_warehouse` جای همهٔ فراخوانی‌های مستقیم `can_access_warehouse` را می‌گیرند.
    - نام انبار در `import_excel` فقط در انبارهای مجاز جستجو می‌شود.
    - `BULK_UPDATE_PROTECTED_FIELDS` برای `bulk_update` افزوده می‌شود.
    - آزمون‌ها با دو شرکت نوشته می‌شوند.
  - **نشست ۲۷:** release بک‌اند روی `app`؛ پشتیبان را Antigravity می‌گیرد و daphne را runner دوباره راه می‌اندازد.
  - **نتیجه:** نشست ۲۶ پس از دو دور اصلاح (`8589eee`) و نشست ۲۷ سبز شدند. diff نشست ۲۶ هنوز بازبینی نشده است.
  - **`created_by` و `modified_by` (`70ccf73`، Claude به درخواست صریح کاربر):**
    - در `ItemSerializer` فقط‌خواندنی شدند. فرانت این دو فیلد را برای کالا نمی‌فرستد.
    - یک آزمون رگرسیون افزوده شد که بدون اصلاح شکست می‌خورد.
    - ۱۸۵ آزمون سبز شد.
    - release بک‌اند روی `app` انجام شد: پشتیبان `backup_20261016_120712.dump` و daphne دوباره راه‌اندازی شد.
  - **worker GDrive:** حدود ساعت ۱۱:۵۸ تب آن بسته شده بود؛ خطایی در لاگ نبود. Claude تب را دوباره باز کرد و heartbeat تازه است.
  - **اقدام بعدی (نشست تازهٔ Claude):**
    1. وضعیت را در `scratch/logs/runner/status.json` و آخرین `run-*.log` ببین.
    2. diff کامیت `fix(inventory): company scope on all item write paths` را با `tenant-scope-reviewer` یک بار بازبینی کن و هر یافته را با خواندن هدفمند تأیید کن.
    3. یافته‌های تأییدشده را به یک تسک اصلاح انگلیسی تبدیل کن.
    4. این یادداشت را به «گزارش پیشرفت» سند طرح بیفزا و commit کن.
    5. به کاربر بگو آزمون دستی ورود اکسل، پاک‌سازی انبار و ویرایش گروهی در فهرست کالا را انجام دهد.

  - **بازبینی نشست ۲۶:** `tenant-scope-reviewer` روی مسیرهای اصلی نوشتن ایرادی نیافت.
    - چهار یافتهٔ کناری با خواندن هدفمند تأیید شد:
      - لاگ ورود بدون انبار بررسی شرکت ندارد.
      - لغو ورودِ در حال اجرا بی‌بررسی است.
      - نام انبار شرکت دیگر در خطای ورود نشت می‌کند.
      - مسئول‌های `bulk_assign` از هر شرکتی پذیرفته می‌شوند.
    - اصلاح هر چهار مورد به Antigravity سپرده شد (نشست ۲۸)، و پس از آن release بک‌اند (نشست ۲۹).

  - **نشست ۲۸ (`d1db817` و `433914d`):** هر چهار یافتهٔ کناری بسته شد و بازبین هر چهار اصلاح را تأیید کرد.
    - آخرین نشتی، یعنی نام انبارِ خارج از تخصیص در پیام مغایرت، را Claude به خواست کاربر حذف کرد (یک خط).
    - ۱۹۰ آزمون سبز شد.
  - **نشست ۲۹:** release بک‌اند در Antigravity شروع نشد، چون language server پاسخ نداد. Claude آن را انجام داد: پشتیبان `backup_20261016_132712.dump`، راه‌اندازی دوبارهٔ daphne با `restart-backend`، و `release-check` سبز.
  - **کارهای مانده:**
    - آزمون دستی کاربر.
    - release روی `soft`، فقط با تأیید صریح کاربر؛ شامل مهاجرت افزایشی `accounts/0002` است.

</div>
