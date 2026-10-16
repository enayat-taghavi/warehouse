[DONE] نشست 1 از 11 — ماژولارسازی عمیق: پاکسازی هسته بکاند از نام و منطق ماژولها با نقاط توسعه رجیستری و همگامسازی pyproject بستهها

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; c=pathlib.Path('warehouse-backend/core'); r=lambda p:(c/p).read_text(encoding='utf-8'); sod=r('accounts/sod_cache_service.py'); v=r('accounts/views.py'); mw=r('accounts/middleware.py'); gd=r('settings_core/google_drive_views.py'); bad={'sod_personnel':chr(39)+'app_module'+chr(39)+': '+chr(39)+'personnel'+chr(39) in sod,'sod_warehouse':chr(39)+'app_module'+chr(39)+': '+chr(39)+'warehouse'+chr(39) in sod,'switch_scope':'target_app not in ('+chr(39)+'warehouse'+chr(39) in v,'audit_lists':chr(39)+'payroll'+chr(39)+', '+chr(39)+'attendance'+chr(39) in v or chr(39)+'docs'+chr(39)+', '+chr(39)+'dispatch'+chr(39) in v,'middleware_branches':'module_code == '+chr(39)+'accounting'+chr(39) in mw or 'module_code == '+chr(39)+'warehouse'+chr(39) in mw,'gdrive_get_model':'get_model('+chr(39)+'personnel'+chr(39) in gd}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import pathlib,sys; p=pathlib.Path('packages'); w=(p/'wh-warehouse/pyproject.toml').read_text(encoding='utf-8'); pl=(p/'wh-platform/pyproject.toml').read_text(encoding='utf-8'); a=(p/'wh-accounting/pyproject.toml').read_text(encoding='utf-8'); ok={'wh_no_reports':'reports*' not in w,'platform_core_dir':'warehouse-backend/core' in pl,'platform_reports':'reports*' in pl and 'companies*' in pl,'wh_modules_dir':'warehouse-backend/modules/warehouse' in w,'acc_modules_dir':'warehouse-backend/modules/accounting' in a}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(core): move module-specific rules out of the backend core into registry contributions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- `manage.py test` را فقط با برچسب اپ اجرا کن.
- هیچ مدل، مایگریشن، `db_table` یا `app_label` را تغییر نده.
- رفتار برنامه در پروفایل کامل باید دقیقاً همان بماند؛ این نشست فقط جای کد را عوض می‌کند.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md` را بخوان. نقطه‌های توسعه در `warehouse-backend/core/platform_core/registry.py` هستند: `contribute`، `contributions`، `ModuleSpec`، `app_code_to_module`، `module_allowed_app_code` و `app_code_for_sod`. مانیفست ماژول‌ها: `warehouse-backend/modules/warehouse/module.py` و `warehouse-backend/modules/accounting/module.py`.

۳. تعریف‌ها:
- «هسته» یعنی هر فایل زیر `warehouse-backend/core/`.
- «نام ماژول در هسته» یعنی رشتهٔ ثابت `'personnel'`، `'warehouse'` یا فهرست زیرماژول‌های یک ماژول که منطق هسته را برای همان ماژول شاخه‌بندی می‌کند.
- «فهرست کاتالوگ» یعنی همهٔ ماژول‌های `MODULE_CATALOG` در `platform_core/module_catalog.py`، نصب‌شده یا نه.

۴. کار:
- الف) قوانین SoD در `core/accounts/sod_cache_service.py` (`DEFAULT_SOD_RULES`):
  - قوانینی که `'app_module': 'personnel'` دارند را به فایل تازهٔ `warehouse-backend/modules/accounting/personnel/sod_rules.py` ببر.
  - قوانینی که `'app_module': 'warehouse'` دارند را به فایل تازهٔ `warehouse-backend/modules/warehouse/warehouses/sod_rules.py` ببر.
  - هر ماژول قوانینش را در `ready()` اپ خودش با `contribute('sod_rules', rule)` ثبت کند (هر قانون یک مشارکت).
  - `DEFAULT_SOD_RULES` در هسته به فهرستی تبدیل شود که از `contributions('sod_rules')` ساخته می‌شود؛ محتوا و ترتیب قوانین در پروفایل کامل همان بماند.
- ب) `SwitchAppScopeView` در `core/accounts/views.py`: شرط `target_app not in ('warehouse', 'finance')` با مجموعهٔ `module_allowed_app_code(code)` برای همهٔ ماژول‌های فهرست کاتالوگ جایگزین شود. برای دو ماژول فعلی همان دو مقدار `'warehouse'` و `'finance'` پذیرفته می‌شود.
- ج) `get_user_valid_roles_for_app` در `core/accounts/middleware.py`: بدنهٔ شاخه‌های `module_code == 'accounting'` و `module_code == 'warehouse'` را به دو تابع در ماژول‌ها ببر (`personnel/role_resolver.py` و `warehouses/role_resolver.py`) و در `ready()` با `contribute('role_resolver', (module_code, func))` ثبت کن. هسته تابع ثبت‌شده برای `module_code` را صدا بزند و اگر چیزی ثبت نشده بود همان مقدار پیش‌فرض فعلی شاخهٔ آخر را برگرداند.
- د) `AuditLogViewSet` در `core/accounts/views.py`: سه بار تکرار فهرست‌های ثابت زیرماژول‌ها را حذف کن.
  - به `ModuleSpec` فیلد تازهٔ `audit_scope_keys: tuple[str, ...] = ()` اضافه کن.
  - در `modules/warehouse/module.py` مقدار آن دقیقاً `('docs', 'dispatch', 'customs', 'feeding', 'labels', 'counter', 'supervisor', 'manager', 'warehouses')` باشد.
  - در `modules/accounting/module.py` مقدار آن دقیقاً `('personnel', 'payroll', 'attendance', 'fleet', 'treasury', 'finance')` باشد.
  - این دو فهرست با `audit_modules` فعلی یکی نیستند؛ از `audit_modules` استفاده نکن تا نتیجهٔ فیلتر عوض نشود.
  - یک تابع کمکی `audit_scope_keys(module_code)` در `registry.py` بنویس که فهرست ماژول را برگرداند (برای ماژول نصب‌نشده فهرست خالی) و هر سه جای `AuditLogViewSet` از آن استفاده کنند.
- ه) در `core/settings_core/google_drive_views.py`، `apps.get_model('personnel', 'CompanyGoogleDriveConfig')` حذف شود: اپ personnel در `ready()` مدل را با `contribute('company_gdrive_config_model', CompanyGoogleDriveConfig)` ثبت کند و هسته آن را از `contributions('company_gdrive_config_model')` بخواند؛ اگر چیزی ثبت نشده بود همان رفتار فعلی شاخهٔ «اپ نصب نیست» اجرا شود.
- و) `packages/*/pyproject.toml`: مسیرهای `package-dir` و `where` را با ساختار فعلی تطبیق بده: `wh-platform` از `warehouse-backend/core` (و شامل `companies*` و `reports*`)، `wh-warehouse` از `warehouse-backend/modules/warehouse` (بدون `reports*`)، `wh-accounting` از `warehouse-backend/modules/accounting`.
- بیرون از دامنه: `apps.get_model('warehouses', 'Warehouse')` هایی که پشت `apps.is_installed('warehouses')` هستند، منطق `active_app` در `core/accounts/serializers.py`، و فایل‌های `personnel/section_guardian.py` و `personnel/phase_guardian_approval.py`.

۵. فرمان‌های مجاز: `python scripts/automation/verify_tools.py django-check` حداکثر سه بار و `warehouse-backend\venv\Scripts\python.exe manage.py test accounts --noinput` در پوشهٔ `warehouse-backend` با `PYTHONUTF8=1` حداکثر دو بار. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین و مطمئن شو هیچ فایل مایگریشن یا قالب فرانت تغییر نکرده است.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(core): move module-specific rules out of the backend core into registry contributions
- گزارش کوتاه: فایل‌های تغییریافته، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 2 از 11 — ماژولارسازی عمیق: تفکیک models.py و serializers.py در personnel به پکیجهای دامنه با Barrel نامبهنام

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; p=pathlib.Path('warehouse-backend/modules/accounting/personnel'); n=lambda f:len(f.read_text(encoding='utf-8').splitlines()); md=sorted((p/'models_domains').glob('*.py')) if (p/'models_domains').is_dir() else []; sd=sorted((p/'serializers_domains').glob('*.py')) if (p/'serializers_domains').is_dir() else []; big=[f.name+':'+str(n(f)) for f in md+sd if n(f)>900]; star=[f.name for f in [p/'models.py',p/'serializers.py'] if 'import *' in f.read_text(encoding='utf-8')]; print('models.py',n(p/'models.py'),'serializers.py',n(p/'serializers.py'),'md',len(md),'sd',len(sd),'big',big,'star',star); sys.exit(0 if n(p/'models.py')<250 and n(p/'serializers.py')<250 and len(md)>=7 and len(sd)>=7 and not big and not star else 1)"
verify: python scripts/automation/verify_tools.py module-names --base {base} --file warehouse-backend/modules/accounting/personnel/models.py warehouse-backend/modules/accounting/personnel/serializers.py
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(personnel): split models and serializers into domain packages with explicit barrels"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- `manage.py test` را فقط با برچسب اپ اجرا کن.
- هیچ فیلد، `Meta`، `db_table`، `app_label` یا مایگریشنی تغییر نکند و هیچ مایگریشن تازه‌ای ساخته نشود.
- بدنهٔ کلاس‌ها و توابع را دوباره تایپ نکن؛ فقط جابه‌جا کن.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها: `warehouse-backend/modules/accounting/personnel/models.py` و `warehouse-backend/modules/accounting/personnel/serializers.py`.

۳. تعریف‌ها:
- «Barrel» یعنی همان `models.py` یا `serializers.py` که فقط با import صریح نام‌به‌نام (`from .models_domains.hr import PersonnelProfile, PersonnelBankAccount`) همهٔ نام‌ها را دوباره در دسترس می‌گذارد. `import *` ممنوع است، چون نام‌های آغازشده با `_` را صادر نمی‌کند.
- «نام‌های لازم» یعنی هر نامی که این دو فایل روی کامیت پایه در سطح بالا تعریف کرده‌اند، به‌علاوهٔ هر نامی که فایل‌های دیگر بک‌اند امروز از آن‌ها import می‌کنند. خط verify `module-names` همین را می‌سنجد.

۴. کار:
- الف) ابتدا یک اسکریپت یک‌بارمصرف در `scratch/split_personnel_models.py` بنویس که با ماژول `ast` بازهٔ خط دقیق هر کلاس و تابع سطح بالا (همراه decoratorها و توضیح بالای آن) را پیدا کند و متن آن را بایت‌به‌بایت به فایل دامنه منتقل کند. اسکریپت در `scratch/` می‌ماند و commit نمی‌شود.
- ب) پوشهٔ `personnel/models_domains/` با `__init__.py` خالی و این ۷ فایل:
  1. `base.py`: `_WarehouseCompatQuerySet`، `_WarehouseCompatManager`، `_WarehouseCompatMixin` و کمکی‌های سطح بالای مشترک.
  2. `organization.py`: `CompanyDocument`، `CompanyBankAccount`، `CompanyBoardMember`، `CompanyFiscalPeriod`، `FinancialProject`، `ProjectSection`، `UserSectionAssignment`.
  3. `hr.py`: `InsuranceJobTitle`، `PersonnelProfile`، `PersonnelBankAccount`، `PersonnelDocument`، `PersonnelSectionAssignment`، `PersonnelChangeRequest`.
  4. `fleet.py`: `VehicleDriverProfile`، `VehicleBankAccount`، `VehicleDocument`، `VehicleChangeRequest`.
  5. `attendance.py`: `MonthlyWorkPeriod`، `DailyAttendance`، `AttendanceAuditLog`، `VehicleTripLog`، `VehicleTripAuditLog`.
  6. `payroll.py`: `PayrollYearlySettings`، `JobGradeTier`، `WorkshopInsuranceSettings`، `TaxRuleSettings`، `BankExportSettings`، `MonthlyPayrollRecord`.
  7. `treasury_audit.py`: `Counterparty`، `ExpenseInvoice`، `PettyCashAccount`، `PettyCashTransaction`، `AccountingEvent`، `emit_accounting_event`، `WorkflowAuditLog`، `CompanyGoogleDriveConfig`، `GoogleDriveSyncQueue`.
  - هر نماد سطح بالای دیگری که در این فهرست نیست، در فایل دامنه‌ای برود که بیشترین استفاده را دارد.
  - کلید خارجی به مدلی که در فایل دامنهٔ دیگری است، به شکل رشته نوشته شود (`'personnel.PersonnelProfile'`) تا import حلقوی پیش نیاید. این تغییر در state مایگریشن اثری ندارد؛ خط verify `migrations-unchanged` آن را می‌سنجد.
  - نیازی به افزودن `app_label` نیست، چون جنگو اپ را از مسیر بستهٔ `personnel` پیدا می‌کند. اگر `migrations-unchanged` چیزی گزارش کرد، علت را پیدا کن و رفع کن، مایگریشن نساز.
- ج) پوشهٔ `personnel/serializers_domains/` با `__init__.py` خالی و ۷ فایل: `helpers.py` (`normalize_iranian_phone`، `normalize_plate`، `user_can_view_fleet_rates` و کمکی‌های مشترک)، و `organization.py`، `hr.py`، `fleet.py`، `attendance.py`، `payroll.py`، `treasury_audit.py` با سریالایزرهای همان دامنه.
- د) `models.py` و `serializers.py` به Barrel صریح تبدیل شوند (هر کدام زیر ۲۵۰ خط). هر فایل دامنه حداکثر ۹۰۰ خط.
- بیرون از دامنه: هر تغییر منطق، نام‌گذاری تازه، و فایل‌های دیگر personnel.

۵. فرمان‌های مجاز: اجرای اسکریپت خودت با `python scratch/split_personnel_models.py`، `python scripts/automation/verify_tools.py django-check` حداکثر سه بار، `python scripts/automation/verify_tools.py migrations-unchanged` حداکثر سه بار، و `python scripts/automation/verify_tools.py module-names --base <پایه> --file warehouse-backend/modules/accounting/personnel/models.py warehouse-backend/modules/accounting/personnel/serializers.py` حداکثر سه بار. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین و مطمئن شو هیچ فایلی در `migrations/` تغییر نکرده است.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(personnel): split models and serializers into domain packages with explicit barrels
- گزارش کوتاه: فایل‌های تازه با شمار خط، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 3 از 11 — ماژولارسازی عمیق: تفکیک personnel/views.py به پکیج views_domains با Barrel نامبهنام

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; p=pathlib.Path('warehouse-backend/modules/accounting/personnel'); n=lambda f:len(f.read_text(encoding='utf-8').splitlines()); vd=sorted((p/'views_domains').glob('*.py')) if (p/'views_domains').is_dir() else []; names=[f.name for f in vd]; star='import *' in (p/'views.py').read_text(encoding='utf-8'); big=[f.name+':'+str(n(f)) for f in vd if n(f)>2600]; print('views.py',n(p/'views.py'),'domains',names,'big',big,'star',star); sys.exit(0 if n(p/'views.py')<300 and len(vd)>=8 and 'scope_helpers.py' in names and not big and not star else 1)"
verify: python scripts/automation/verify_tools.py module-names --base {base} --file warehouse-backend/modules/accounting/personnel/views.py
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(personnel): split views into domain modules with an explicit barrel"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- `manage.py test` را فقط با برچسب اپ اجرا کن.
- بدنهٔ کلاس‌ها و توابع را دوباره تایپ نکن؛ فقط جابه‌جا کن. هیچ منطق دامنهٔ شرکت، دسترسی یا اعتبارسنجی نباید عوض شود.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل: `warehouse-backend/modules/accounting/personnel/views.py` (حدود ۱۱ هزار خط، ۲۲ ViewSet).

۳. تعریف‌ها:
- «Barrel» یعنی `views.py` که فقط با import صریح نام‌به‌نام همهٔ نام‌ها را دوباره در دسترس می‌گذارد. `import *` ممنوع است.
- «کمکی مشترک» یعنی هر تابع یا ثابت سطح بالا که در بیش از یک فایل دامنه به کار می‌رود.

۴. کار:
- الف) یک اسکریپت یک‌بارمصرف در `scratch/split_personnel_views.py` بنویس که با `ast` بازهٔ خط دقیق هر کلاس و تابع سطح بالا (همراه decoratorها و توضیح بالای آن) را پیدا کند و متن آن را بایت‌به‌بایت به فایل دامنه منتقل کند. اسکریپت commit نمی‌شود.
- ب) پوشهٔ `personnel/views_domains/` با `__init__.py` خالی و این فایل‌ها:
  1. `scope_helpers.py`: همهٔ کمکی‌های مشترک، از جمله `user_belongs_to_company`، `ensure_scoped_assignment`، `resolve_write_company`، `resolve_import_company`، `readable_company_ids`، `is_personnel_global_auditor`، `scope_personnel_queryset`، `scope_personnel_for_user`، `ensure_record_write_scope`، `ensure_personnel_write_scope`، `is_vehicle_global_auditor`، `scope_vehicle_queryset`، `scope_trips_for_user`، `broadcast_personnel_update`، `broadcast_vehicle_update`، `log_vehicle_audit`، `normalize_attendance_date`، `validate_attendance_date_window`، `is_date_shamsi_friday`، `broadcast_attendance_updated`، `safe_int`، `_copy_payroll_submodels`، `broadcast_org_structure_updated`. فایل‌های دامنه فقط از `scope_helpers.py` و ماژول‌های بیرونی import کنند، نه از یکدیگر.
  2. `org_views.py`: `CompanyViewSet`، `CompanyDocumentViewSet`، `CompanyBankAccountViewSet`، `CompanyBoardMemberViewSet`، `CompanyFiscalPeriodViewSet`، `FinancialProjectViewSet`، `ProjectSectionViewSet`، `UserSectionAssignmentViewSet`.
  3. `treasury_views.py`: `CounterpartyViewSet`، `ExpenseInvoiceViewSet`، `PettyCashAccountViewSet`، `PettyCashTransactionViewSet`، `WorkflowAuditLogViewSet`.
  4. `payroll_views.py`: `PayrollYearlySettingsViewSet`، `MonthlyPayrollViewSet`، `FleetSettlementViewSet`.
  5. `attendance_views.py`: `DailyAttendanceViewSet`، `MonthlyWorkPeriodViewSet`.
  6. `trip_views.py`: `VehicleTripViewSet`.
  7. `hr_views.py`: `PersonnelProfileViewSet`، `PersonnelChangeRequestViewSet`.
  8. `fleet_views.py`: `VehicleDriverProfileViewSet`، `VehicleChangeRequestViewSet`.
  - هر کلاس یا تابع دیگری که در فهرست نیست، در فایل دامنه‌ای برود که بیشترین استفاده را دارد. هر فایل دامنه حداکثر ۲۶۰۰ خط.
- ج) `views.py` به Barrel صریح زیر ۳۰۰ خط تبدیل شود. `urls.py` و بقیهٔ فایل‌ها بدون تغییر کار کنند.
- د) اگر تابعی در فایل دیگری از personnel با `views.` صدا زده یا patch می‌شود، همان نام در Barrel بماند. خط verify `module-names` این را می‌سنجد.
- بیرون از دامنه: `section_guardian.py`، `phase_guardian_approval.py`، `urls.py` و هر تغییر منطق.

۵. فرمان‌های مجاز: اجرای اسکریپت خودت، `python scripts/automation/verify_tools.py django-check` حداکثر سه بار، `python scripts/automation/verify_tools.py module-names --base <پایه> --file warehouse-backend/modules/accounting/personnel/views.py` حداکثر سه بار، و `warehouse-backend\venv\Scripts\python.exe manage.py test personnel --noinput` در پوشهٔ `warehouse-backend` با `PYTHONUTF8=1` یک بار. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین؛ جز `views.py` و پوشهٔ تازه نباید فایلی تغییر کرده باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(personnel): split views into domain modules with an explicit barrel
- گزارش کوتاه: فایل‌های تازه با شمار خط، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 4 از 11 — ماژولارسازی عمیق: تفکیک inventory/views.py و accounts/views.py به پکیج views_domains با Barrel نامبهنام

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; inv=pathlib.Path('warehouse-backend/modules/warehouse/inventory'); acc=pathlib.Path('warehouse-backend/core/accounts'); n=lambda f:len(f.read_text(encoding='utf-8').splitlines()); d=lambda p:sorted((p/'views_domains').glob('*.py')) if (p/'views_domains').is_dir() else []; star=[str(f) for f in [inv/'views.py',acc/'views.py'] if 'import *' in f.read_text(encoding='utf-8')]; big=[f.name+':'+str(n(f)) for f in d(inv)+d(acc) if n(f)>2800]; print('inv',n(inv/'views.py'),'acc',n(acc/'views.py'),'inv_dom',len(d(inv)),'acc_dom',len(d(acc)),'big',big,'star',star); sys.exit(0 if n(inv/'views.py')<200 and n(acc/'views.py')<200 and len(d(inv))>=6 and len(d(acc))>=7 and not big and not star else 1)"
verify: python scripts/automation/verify_tools.py module-names --base {base} --file warehouse-backend/modules/warehouse/inventory/views.py warehouse-backend/core/accounts/views.py
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_30_settings_core.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(backend): split inventory and accounts views into domain modules with explicit barrels"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- `manage.py test` را فقط با برچسب اپ اجرا کن.
- بدنهٔ کلاس‌ها و توابع را دوباره تایپ نکن؛ فقط جابه‌جا کن. هیچ منطق تغییر نکند.
- ۳۲ آزمون `inventory` و ۱ آزمون `warehouses` از پیش شکسته‌اند و در `scripts/automation/known_backend_failures.txt` فهرست شده‌اند. آن‌ها را درست نکن و آن فایل را تغییر نده.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها: `warehouse-backend/modules/warehouse/inventory/views.py` و `warehouse-backend/core/accounts/views.py`.

۳. تعریف‌ها: «Barrel» یعنی `views.py` که فقط با import صریح نام‌به‌نام همهٔ نام‌ها را دوباره در دسترس می‌گذارد. `import *` ممنوع است.

۴. کار:
- الف) یک اسکریپت یک‌بارمصرف در `scratch/split_backend_views.py` بنویس که با `ast` بازهٔ خط دقیق هر کلاس و تابع سطح بالا (همراه decoratorها و توضیح بالای آن) را بایت‌به‌بایت به فایل دامنه منتقل کند. اسکریپت commit نمی‌شود.
- ب) `inventory/views_domains/` با `__init__.py` خالی و این فایل‌ها:
  1. `helpers.py`: `_parse_decimal`، `_parse_date_flexible`، `_parse_positive_int`، `_clean_currency`، `_clean_invoice_type`، `_create_doc_task_snapshot`، `_soft_delete_items_cascade`، `_restore_item_photos_cascade`، `_cleanup_old_import_logs`، `ItemPagination`، `PriorityOrderingFilter` و کمکی‌های مشترک دیگر.
  2. `field_views.py`: `ItemFieldDefinitionViewSet`.
  3. `item_views.py`: `ItemViewSet`.
  4. `count_views.py`: `CountTaskViewSet`.
  5. `doc_views.py`: `DocTaskViewSet`.
  - هر کلاس دیگری در فایل دامنه‌ای برود که بیشترین ارتباط را دارد.
- ج) `accounts/views_domains/` با `__init__.py` خالی و این فایل‌ها:
  1. `helpers.py`: کمکی‌های مشترک سطح بالا.
  2. `auth_views.py`: `OptionalPageNumberPagination`، `CustomTokenObtainPairView`، `LogoutView`، `SwitchAppScopeView`.
  3. `user_views.py`: `UserViewSet`، `UserTableViewStateViewSet`.
  4. `role_views.py`: `CustomRoleViewSet`، `PermissionViewSet`.
  5. `audit_views.py`: `_parse_query_date`، `StandardLogPagination`، `get_db_total_storage_info`، `get_table_storage_info`، `format_bytes_to_human`، `build_log_storage_payload`، `format_shamsi_datetime`، `UserLoginLogViewSet`، `AuditLogViewSet`.
  6. `backup_views.py`: `DatabaseBackupViewSet`، `SystemHealthView`، `ConcurrencyStressTestView`.
  7. `session_views.py`: `DeviceHeartbeatView`، `FleetSessionsListView`، `RevokeDeviceSessionView`.
  - فایل‌های دامنه فقط از `helpers.py` همان پکیج و ماژول‌های بیرونی import کنند، نه از یکدیگر.
- د) هر دو `views.py` به Barrel صریح زیر ۲۰۰ خط تبدیل شوند. هر فایل دامنه حداکثر ۲۸۰۰ خط. `urls.py`، `views_photos.py` و آزمون‌ها بدون تغییر کار کنند.
- بیرون از دامنه: `phase_guardian_approval.py`، `urls.py` و هر تغییر منطق.

۵. فرمان‌های مجاز: اجرای اسکریپت خودت، `python scripts/automation/verify_tools.py django-check` حداکثر سه بار و `python scripts/automation/verify_tools.py module-names --base <پایه> --file warehouse-backend/modules/warehouse/inventory/views.py warehouse-backend/core/accounts/views.py` حداکثر سه بار. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین؛ جز دو `views.py` و دو پوشهٔ تازه نباید فایلی تغییر کرده باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(backend): split inventory and accounts views into domain modules with explicit barrels
- گزارش کوتاه: فایل‌های تازه با شمار خط، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 5 از 11 — ماژولارسازی عمیق: نقطه توسعه syncConfig برای sync-pull، حذف پوشههای منسوخ services و guards و اصلاح dev-manager-modular.bat

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); sp=(app/'core/services/sync-pull.service.ts').read_text(encoding='utf-8'); ct=(app/'core/modules/module-contract.ts').read_text(encoding='utf-8'); bat=pathlib.Path('dev-manager-modular.bat').read_text(encoding='utf-8',errors='replace'); ok={'old_dirs_gone':not (app/'services').exists() and not (app/'guards').exists(),'no_pull_paths':'/personnel/sync/pull/' not in sp and '/inventory/sync/pull/' not in sp,'contract':'syncConfig' in ct,'bat_fixed':'start:accounting' not in bat and 'start:warehouse' not in bat}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
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
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(front-core): sync-pull endpoints from module contract and remove deprecated folders"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- قانون از دست نرفتن داده: در `sync-pull.service.ts` فقط منبع آدرس و نام پارامتر عوض می‌شود. ترتیب درخواست‌ها، شرط پاک‌کردن یا جایگزینی کش محلی، و رفتار خطا (از جمله `isServerUnreachable()`) دقیقاً همان بماند. کش منقضی هرگز حذف نمی‌شود.
- هیچ فایل در `core/`، `shared/` یا `modules/common/` چیزی از `modules/warehouse/` یا `modules/accounting/` import نکند.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها: `warehouse-front/src/app/core/modules/module-contract.ts` (`ExtensionMap`، الگوی `companyApiEndpoints`)، `core/modules/module-registry.service.ts` (`getExtensions`)، `core/services/sync-pull.service.ts`، `modules/warehouse/module.ts`، `modules/accounting/module.ts`، `dev-manager-modular.bat`.

۳. تعریف‌ها: «نقطهٔ توسعه» یعنی فیلد اختیاری در `ExtensionMap` که ماژول در `module.ts` پر می‌کند و هسته با `moduleRegistry.getExtensions('<نام>')` می‌خواند، همان الگوی `companyApiEndpoints` در `core/api/company-api.service.ts`.

۴. کار:
- الف) به `ExtensionMap` فیلد `syncConfig?: { scopeKind: string; pullEndpoint: string; scopeParamKey: string; }` اضافه کن. در `modules/warehouse/module.ts` مقدار `{ scopeKind: 'warehouse', pullEndpoint: '/inventory/sync/pull/', scopeParamKey: 'warehouse_id' }` و در `modules/accounting/module.ts` مقدار `{ scopeKind: 'finance', pullEndpoint: '/personnel/sync/pull/', scopeParamKey: 'project_id' }` را ثبت کن (پیش از نوشتن، مقدار واقعی امروز هر دو را از `sync-pull.service.ts` بخوان و همان را بگذار). در `sync-pull.service.ts` آدرس‌ها و نام پارامترها را از `syncConfig` ماژولی بخوان که `scopeKind` آن با قلمرو جاری یکی است. اگر چنین ماژولی نصب نبود، pull آن قلمرو انجام نشود.
- ب) پوشه‌های منسوخ `src/app/services/` و `src/app/guards/`:
  - هر import به `app/services/...` یا `app/guards/...` را به فایل اصلی در `core/` یا `shared/` تغییر بده.
  - اگر `services/settings.ts`، `settings.spec.ts` یا `state.service.ts` نسخهٔ اصلی در `core/` ندارند و هنوز مصرف دارند، با `git mv` به `core/services/` ببر.
  - سپس هر دو پوشه را با `git rm` حذف کن.
- ج) در `dev-manager-modular.bat`، فرمان‌های `npm run start:accounting -- --port 4300` و `npm run start:warehouse -- --port 4300` را با `npm start -- --port 4300` جایگزین کن. یک خط توضیح `rem` بگذار که سرور توسعه همیشه همهٔ ماژول‌ها را نشان می‌دهد و بیلد تک‌ماژول با `npm run build:modules` است. `package.json` تغییر نکند.
- بیرون از دامنه: `offline-sync.service.ts`، `photo-upload-queue.service.ts`، `app-persona.service.ts`، `session-tab.service.ts`، `auth.service.ts` و هر فایل قالب `.html`.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front` و یک بار `python scripts/e2e/guardian_57_front_module_fence.py`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین و بررسی کن در `sync-pull.service.ts` جز منبع آدرس و پارامتر چیزی عوض نشده باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(front-core): sync-pull endpoints from module contract and remove deprecated folders
- گزارش کوتاه: فایل‌های تغییریافته، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 6 از 11 — ماژولارسازی عمیق: قطع وابستگیهای common و shared به سرویسهای ماژول و انتقال سرویسهای انبار به modules/warehouse

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); wh=app/'modules/warehouse'; names=['count-task-api','doc-task-api','item-api','dynamic-field-api','feeding-api','label-api','project-api','tag-api','dashboard-api']; moved=[n for n in names if (wh/'api'/(n+'.service.ts')).exists() and not (app/'core/api'/(n+'.service.ts')).exists()]; svc=all((wh/'services'/f).exists() for f in ['import.service.ts','item-photo.service.ts','count-task-store.ts','doc-task-store.ts']); gal=(wh/'components/item-photo-gallery').is_dir() and not (app/'shared/components/item-photo-gallery').exists(); queue=(app/'core/services/photo-upload-queue.service.ts').exists(); users=(app/'modules/common/components/users/users.ts').read_text(encoding='utf-8'); menu=(app/'shared/components/user-menu/user-menu.component.ts').read_text(encoding='utf-8'); st=(app/'modules/common/components/settings/settings.ts').read_text(encoding='utf-8'); dec='PersonnelApiService' not in users and 'PersonnelApiService' not in menu and 'DynamicFieldApiService' not in st; print('moved',len(moved),'services',svc,'gallery',gal,'queue_in_core',queue,'decoupled',dec); sys.exit(0 if len(moved)==9 and svc and gal and queue and dec else 1)"
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
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(front-warehouse): move warehouse services into the module and decouple common consumers"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- هیچ فایل در `core/`، `shared/` یا `modules/common/` چیزی از `modules/warehouse/` یا `modules/accounting/` import نکند.
- هسته آدرس API ماژول‌ها را هاردکد نکند؛ آدرس از نقطهٔ توسعهٔ ماژول می‌آید.
- `core/services/photo-upload-queue.service.ts` در هسته می‌ماند و در این نشست تغییر نمی‌کند، چون `offline-sync.service.ts` و `domain-migration.service.ts` از آن استفاده می‌کنند.
- فایل‌ها با `git mv` منتقل شوند تا تاریخچه بماند. منطق هیچ سرویسی عوض نشود.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها: `warehouse-front/src/app/core/modules/module-contract.ts` (الگوی `companyApiEndpoints`)، `core/api/index.ts`، `shared/index.ts`، `modules/warehouse/module.ts`، `modules/accounting/module.ts`.

۳. تعریف‌ها: «نقطهٔ توسعه» یعنی فیلد اختیاری در `ExtensionMap` که ماژول در `module.ts` پر می‌کند و هسته با `moduleRegistry.getExtensions('<نام>')` می‌خواند.

۴. کار:
- الف) فهرست پروژه‌های مالی در `modules/common/components/users/users.ts` و `shared/components/user-menu/user-menu.component.ts`:
  - به `ExtensionMap` فیلد `projectLookup?: { financialProjectsEndpoint: string }` اضافه کن.
  - در `modules/accounting/module.ts` آن را با همان آدرسی پر کن که امروز `PersonnelApiService.getFinancialProjects` صدا می‌زند.
  - در `users.ts` و `user-menu.component.ts`، به‌جای `PersonnelApiService` با `ApiService` هسته و همان پارامترهای امروز (`is_active: true`) آن آدرس را بخوان. اگر نقطهٔ توسعه ثبت نشده بود، فهرست خالی بگذار و درخواستی نفرست.
  - specهای همین دو فایل (`users.spec.ts` و `user-menu.component.spec.ts`) را با همین تغییر هماهنگ کن، بدون حذف هیچ آزمون.
- ب) فیلدهای پویا در `modules/common/components/settings/settings.ts`: به `ExtensionMap` فیلد `dynamicFields?: { fieldsEndpoint: string }` اضافه کن، در `modules/warehouse/module.ts` با آدرس امروز `DynamicFieldApiService.getFields` پر کن، و `settings.ts` از راه `ApiService` و این نقطهٔ توسعه بخواند. اگر ثبت نشده بود، درخواستی نفرستد. `settings.spec.ts` هماهنگ شود.
- ج) با `git mv` به `modules/warehouse/` ببر و همهٔ importها را به‌روز کن:
  - ۹ سرویس `count-task-api`، `doc-task-api`، `item-api`، `dynamic-field-api`، `feeding-api`، `label-api`، `project-api`، `tag-api`، `dashboard-api` (`*.service.ts`) از `core/api/` به `modules/warehouse/api/`، و حذف آن‌ها از `core/api/index.ts`.
  - `core/services/import.service.ts` و `core/guards/import-leave.guard.ts` به `modules/warehouse/services/` و `modules/warehouse/guards/`.
  - `core/services/item-photo.service.ts`، `core/services/count-task-store.ts` و `core/services/doc-task-store.ts` به `modules/warehouse/services/`.
  - `shared/components/item-photo-gallery/` به `modules/warehouse/components/item-photo-gallery/`، و حذف export آن از `shared/index.ts`.
  - specهای کنار هر فایل همراه آن منتقل شوند.
- د) پیش از هر انتقال، با grep مطمئن شو هیچ فایل `core/`، `shared/` یا `modules/common/` از فایل منتقل‌شده استفاده نمی‌کند. اگر استفاده می‌کند، آن فایل را منتقل نکن و در گزارش بنویس.
- بیرون از دامنه: `personnel-api.service.ts` (نشست بعد)، `offline-sync.service.ts`، `photo-upload-queue.service.ts` و فایل‌های قالب `.html`، به‌جز تغییر مسیر import یا selector که لازم باشد.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front` و حداکثر دو بار `python scripts/e2e/guardian_57_front_module_fence.py`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat -M` را ببین و بررسی کن انتقال‌ها rename ثبت شده‌اند.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(front-warehouse): move warehouse services into the module and decouple common consumers
- گزارش کوتاه: فایل‌های منتقل‌شده، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 7 از 11 — ماژولارسازی عمیق: تفکیک personnel-api.service.ts به ۵ سرویس دامنه در modules/accounting/api

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); api=app/'modules/accounting/api'; need=['hr-api.service.ts','fleet-api.service.ts','attendance-api.service.ts','payroll-api.service.ts','treasury-org-api.service.ts','personnel-api.service.ts']; have=[f for f in need if (api/f).exists()]; core_gone=not (app/'core/api/personnel-api.service.ts').exists(); n=lambda f:len(f.read_text(encoding='utf-8').splitlines()); facade=n(api/'personnel-api.service.ts') if (api/'personnel-api.service.ts').exists() else 9999; refs=[str(p) for p in list((app/'core').rglob('*.ts'))+list((app/'shared').rglob('*.ts'))+list((app/'modules/common').rglob('*.ts')) if 'PersonnelApiService' in p.read_text(encoding='utf-8')]; print('have',len(have),'core_gone',core_gone,'facade_lines',facade,'common_refs',refs); sys.exit(0 if len(have)==6 and core_gone and facade<400 and not refs else 1)"
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
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(front-accounting): split personnel api into domain services inside the accounting module"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- هیچ فایل در `core/`، `shared/` یا `modules/common/` چیزی از `modules/accounting/` import نکند.
- امضا، آدرس، پارامتر و نوع خروجی هیچ متد API عوض نشود. هیچ شیمی در `core/api/` ساخته نشود.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل: `warehouse-front/src/app/core/api/personnel-api.service.ts` و spec کنار آن `core/api/personnel-fleet.spec.ts`.

۳. تعریف‌ها: «Facade» یعنی کلاس `PersonnelApiService` که همهٔ متدهای عمومی فعلی را با همان امضا نگه می‌دارد و هر متد فقط یک خط به سرویس دامنه می‌سپارد.

۴. کار:
- الف) `core/api/personnel-api.service.ts` را با `git mv` به `modules/accounting/api/personnel-api.service.ts` ببر و `core/api/personnel-fleet.spec.ts` را به `modules/accounting/api/` ببر.
- ب) بدنهٔ متدها را در ۵ سرویس `@Injectable({ providedIn: 'root' })` در همان پوشه بگذار:
  1. `hr-api.service.ts`: پروفایل پرسنل، حساب بانکی، مدارک، درخواست تغییرات پرسنل.
  2. `fleet-api.service.ts`: خودرو و راننده، حساب بانکی، مدارک، درخواست تغییرات خودرو، تسویهٔ ناوگان.
  3. `attendance-api.service.ts`: کارکرد روزانه و ماهانه، دورهٔ کارکرد، سفرهای ناوگان.
  4. `payroll-api.service.ts`: تنظیمات سالانه، محاسبهٔ حقوق، فیش، خروجی بیمه و مالیات و بانک.
  5. `treasury-org-api.service.ts`: پروژه، بخش، انتساب بخش، طرف‌حساب، فاکتور هزینه، تنخواه، گوگل‌درایو شرکت.
- ج) `PersonnelApiService` به Facade تبدیل شود و همهٔ interfaceها و typeهای export‌شدهٔ امروز را دوباره export کند (interfaceها می‌توانند در فایل `personnel-api.models.ts` همان پوشه باشند).
- د) importهای همهٔ مصرف‌کننده‌ها در `modules/accounting/` به مسیر تازه به‌روز شود و `core/api/index.ts` دیگر آن را export نکند.
- بیرون از دامنه: فایل‌های قالب `.html` و `section_guardian.py`.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front` و یک بار `python scripts/e2e/guardian_57_front_module_fence.py`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat -M` را ببین؛ شمار متدهای عمومی `PersonnelApiService` باید با کامیت پایه برابر باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(front-accounting): split personnel api into domain services inside the accounting module
- گزارش کوتاه: فایل‌های تازه با شمار خط، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 8 از 11 — ماژولارسازی عمیق: تفکیک offline-sync.service.ts به زیرماژولهای core/services/offline بدون تغییر منطق و آدرس آپلود عکس از نقطه توسعه

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); f=app/'core/services/offline-sync.service.ts'; n=len(f.read_text(encoding='utf-8').splitlines()); h=sorted(p.name for p in (app/'core/services/offline').glob('*.ts')) if (app/'core/services/offline').is_dir() else []; q=(app/'core/services/photo-upload-queue.service.ts').read_text(encoding='utf-8'); ct=(app/'core/modules/module-contract.ts').read_text(encoding='utf-8'); ok={'lines':n<800,'helpers':len([x for x in h if not x.endswith('.spec.ts')])>=3,'no_photo_path':'/inventory/items/' not in q,'contract':'photoUpload' in ct}; print('offline-sync',n,'helpers',h,ok); sys.exit(0 if all(ok.values()) else 1)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(offline): split offline sync service into focused helpers without behaviour change"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- قانون از دست نرفتن داده:
  - رکورد صف همگام‌سازی فقط با پذیرش صریح سرور (2xx) یا رد صریح (4xx) حذف می‌شود.
  - 5xx و قطع اتصال یعنی تلاش دوباره، نه حذف. تشخیص قطع اتصال فقط با `isServerUnreachable()` از `core/services/server-reachability.ts` است.
  - کش منقضی هرگز حذف نمی‌شود؛ فقط `isStale` گزارش می‌شود.
- این نشست فقط کد را جابه‌جا می‌کند. هیچ شرط، ترتیب، await، try/catch، کلید IndexedDB یا نام جدول عوض نشود.
- هیچ فایل در `core/` چیزی از `modules/` import نکند.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها: `warehouse-front/src/app/core/services/offline-sync.service.ts`، `core/services/photo-upload-queue.service.ts`، `core/modules/module-contract.ts`، `modules/warehouse/module.ts` و specهای این دو سرویس.

۳. تعریف‌ها: «جابه‌جایی بدون تغییر منطق» یعنی بدنهٔ هر متد بدون تغییر به تابع یا کلاس کمکی منتقل شود و متد اصلی همان امضا را نگه دارد و فقط آن را صدا بزند.

۴. کار:
- الف) پوشهٔ `core/services/offline/` با این فایل‌ها:
  1. `offline-sync.models.ts`: interfaceها، typeها و ثابت‌ها.
  2. `offline-local-patcher.ts`: اعمال خوش‌بینانهٔ تغییر روی جدول‌های محلی و ادغام رکوردهای `_offlinePending`.
  3. `offline-conflict-manager.ts`: تشخیص تداخل ۴۰۹ و ۴۰۰، ساخت رکورد `syncErrors`، `retry` و `resolveConflict`.
  4. `offline-queue-runner.ts`: پردازش ترتیبی صف، هدرها و توکن قلمرو.
- ب) `OfflineSyncService` همهٔ متدها، signalها و Observableهای عمومی فعلی را با همان امضا نگه دارد و حجم آن زیر ۸۰۰ خط برسد.
- ج) آدرس آپلود عکس: به `ExtensionMap` فیلد `photoUpload?: { itemPhotosEndpoint: (itemId: number | string) => string }` اضافه کن، در `modules/warehouse/module.ts` با همان آدرس امروز `photo-upload-queue.service.ts` پر کن، و در `photo-upload-queue.service.ts` آدرس را از این نقطهٔ توسعه بخوان. اگر ثبت نشده بود، رکورد در صف بماند و حذف نشود.
- د) specهای موجود دست نخورند، مگر برای اصلاح مسیر import.
- بیرون از دامنه: `sync-pull.service.ts`، `offline-db.ts`، `domain-migration.service.ts`، Service Worker و هر فایل قالب.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front` و یک بار `python scripts/e2e/guardian_57_front_module_fence.py`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: diff `offline-sync.service.ts` را متد به متد با فایل‌های تازه مقایسه کن و مطمئن شو هیچ شرط حذف رکورد صف عوض نشده است.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(offline): split offline sync service into focused helpers without behaviour change
- گزارش کوتاه: فایل‌های تازه با شمار خط، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 9 از 11 — ماژولارسازی عمیق: استخراج Facade برای ۴ کامپوننت بزرگ ماژول مالی بدون تغییر قالب

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; acc=pathlib.Path('warehouse-front/src/app/modules/accounting/components'); files=[acc/'finance/employee/employee-new-personnel/employee-new-personnel.ts',acc/'finance/employee/employee-new-vehicle/employee-new-vehicle.ts',acc/'finance/employee/employee-attendance/employee-attendance.ts',acc/'organization/projects-and-sections/projects-and-sections.ts']; lines=[len(f.read_text(encoding='utf-8').splitlines()) for f in files]; fac=[f.with_name(f.stem+'.facade.ts') for f in files]; ex=[x.exists() for x in fac]; root=[x.name for x in fac if x.exists() and 'providedIn' in x.read_text(encoding='utf-8')]; print('lines',lines,'facades',ex,'providedIn_root',root); sys.exit(0 if all(l<1500 for l in lines) and all(ex) and not root else 1)"
verify: python scripts/automation/verify_tools.py diff-free --base {base} --pattern "." --path warehouse-front/src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel.html warehouse-front/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html warehouse-front/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.html warehouse-front/src/app/modules/accounting/components/organization/projects-and-sections/projects-and-sections.html
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(accounting-ui): extract facades for four large accounting components"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۶، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- فایل‌های قالب `.html` این چهار کامپوننت تغییر نکنند.
- هر متد، property، signal، `@Input` و `@Output` که قالب یا spec از آن استفاده می‌کند، روی کلاس کامپوننت با همان نام و امضا بماند و فقط به Facade بسپارد.
- رفتار، اعتبارسنجی شبا و بانک، تاریخ شمسی و خروجی Excel تغییر نکند.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها در `warehouse-front/src/app/modules/accounting/components/`: `finance/employee/employee-new-personnel/employee-new-personnel.ts`، `finance/employee/employee-new-vehicle/employee-new-vehicle.ts`، `finance/employee/employee-attendance/employee-attendance.ts` و `organization/projects-and-sections/projects-and-sections.ts`.

۳. تعریف‌ها:
- «Facade» یعنی کلاس `@Injectable()` بدون `providedIn` در فایل `<نام>.facade.ts` کنار کامپوننت، که در آرایهٔ `providers` همان کامپوننت ثبت می‌شود و منطق محاسبه، نگاشت، فیلتر و فراخوانی API را نگه می‌دارد.
- «Helpers» یعنی توابع خالص بدون وضعیت در `<نام>.helpers.ts`.

۴. کار:
- پیش از ویرایش هر کامپوننت، specهای کنار آن (از جمله `*.dom.spec.ts`) را بخوان. هر عبارتی که spec با `readFileSync` یا regex در متن فایل `.ts` جست‌وجو می‌کند، در همان فایل `.ts` بماند.
- برای هر کامپوننت یک Facade (و در صورت نیاز Helpers) بساز تا فایل `.ts` کامپوننت زیر ۱۵۰۰ خط برسد:
  1. `employee-new-personnel`: پردازش Excel، نگاشت و اعتبارسنجی شبا و بانک، تبدیل تاریخ شمسی، ساخت FormData و مدیریت مدارک.
  2. `employee-new-vehicle`: پلاک، شبا و بانک، Excel و فیلترها.
  3. `employee-attendance`: محاسبهٔ ماتریس کارکرد، تقویم شمسی، تعطیلی و جمعه‌کاری، عملیات گروهی.
  4. `projects-and-sections`: درخت پروژه و بخش، تنظیمات مؤثر حقوق پروژه، انتساب کاربران، Excel.
- بیرون از دامنه: قالب‌های `.html`، فایل‌های استایل و هر کامپوننت دیگر.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front` و یک بار `python scripts/e2e/guardian_56_change_integrity.py --base <پایه>`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین؛ هیچ فایل `.html` نباید در آن باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(accounting-ui): extract facades for four large accounting components
- گزارش کوتاه: شمار خط هر فایل پیش و پس، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 10 از 11 — ماژولارسازی عمیق: استخراج Facade برای ۴ کارتابل بزرگ ماژول انبار بدون تغییر قالب

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; wh=pathlib.Path('warehouse-front/src/app/modules/warehouse/components'); files=[wh/'customs/customs.ts',wh/'counter/counter-dashboard/counter-dashboard.ts',wh/'supervisor/supervisor-dashboard/supervisor-dashboard.ts',wh/'manager-review/manager-review.ts']; lines=[len(f.read_text(encoding='utf-8').splitlines()) for f in files]; fac=[f.with_name(f.stem+'.facade.ts') for f in files]; ex=[x.exists() for x in fac]; root=[x.name for x in fac if x.exists() and 'providedIn' in x.read_text(encoding='utf-8')]; print('lines',lines,'facades',ex,'providedIn_root',root); sys.exit(0 if all(l<1500 for l in lines) and all(ex) and not root else 1)"
verify: python scripts/automation/verify_tools.py diff-free --base {base} --pattern "." --path warehouse-front/src/app/modules/warehouse/components/customs/customs.html warehouse-front/src/app/modules/warehouse/components/counter/counter-dashboard/counter-dashboard.html warehouse-front/src/app/modules/warehouse/components/supervisor/supervisor-dashboard/supervisor-dashboard.html warehouse-front/src/app/modules/warehouse/components/manager-review/manager-review.html
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(warehouse-ui): extract facades for four large warehouse cartables"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- فایل‌های قالب `.html` این چهار کامپوننت تغییر نکنند.
- هر متد، property، signal، `@Input` و `@Output` که قالب یا spec از آن استفاده می‌کند، روی کلاس کامپوننت با همان نام و امضا بماند و فقط به Facade بسپارد.
- قانون از دست نرفتن داده: ادغام رکوردهای `_offlinePending` و patch درجای WebSocket دقیقاً همان رفتار را داشته باشند؛ هیچ رکورد محلی در حال انتظار نادیده گرفته یا حذف نشود.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها در `warehouse-front/src/app/modules/warehouse/components/`: `customs/customs.ts`، `counter/counter-dashboard/counter-dashboard.ts`، `supervisor/supervisor-dashboard/supervisor-dashboard.ts` و `manager-review/manager-review.ts`.

۳. تعریف‌ها:
- «Facade» یعنی کلاس `@Injectable()` بدون `providedIn` در فایل `<نام>.facade.ts` کنار کامپوننت، که در آرایهٔ `providers` همان کامپوننت ثبت می‌شود.
- «Helpers» یعنی توابع خالص بدون وضعیت در `<نام>.helpers.ts`.

۴. کار:
- پیش از ویرایش هر کامپوننت، specهای کنار آن را بخوان. هر عبارتی که spec با `readFileSync` یا regex در متن فایل `.ts` جست‌وجو می‌کند، در همان فایل `.ts` بماند.
- برای هر کامپوننت یک Facade (و در صورت نیاز Helpers) بساز تا فایل `.ts` کامپوننت زیر ۱۵۰۰ خط برسد:
  1. `customs`: فیلترها، اعتبارسنجی و نگاشت فیلدهای اسناد مالی و گمرکی، عملیات گروهی، اسکن بارکد.
  2. `counter-dashboard`: مرتب‌سازی بازشماری (`recount_first`)، جست‌وجوی OmniSearch.
  3. `supervisor-dashboard`: فیلتر مغایرت، تأیید و رد گروهی، ستون‌های پویا.
  4. `manager-review`: بررسی نهایی مدیر، ارجاع بازشماری، خروجی Excel، آمار لحظه‌ای.
  - منطق ادغام `_offlinePending` و WebSocket فقط اگر لازم بود و بدون تغییر منتقل شود.
- بیرون از دامنه: قالب‌های `.html`، فایل‌های استایل، سرویس‌های هسته و هر کامپوننت دیگر.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front` و یک بار `python scripts/e2e/guardian_56_change_integrity.py --base <پایه>`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین؛ هیچ فایل `.html` نباید در آن باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(warehouse-ui): extract facades for four large warehouse cartables
- گزارش کوتاه: شمار خط هر فایل پیش و پس، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 11 از 11 — ماژولارسازی عمیق: استخراج Facade برای ۴ کامپوننت بزرگ پلتفرم، سقف اندازه فایل در نگهبانهای ۲۹ و ۵۷ و بهروزرسانی نقشه معماری

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; cm=pathlib.Path('warehouse-front/src/app/modules/common/components'); files=[cm/'operations/companies/companies.ts',cm/'users/users.ts',cm/'audit/audit.ts',cm/'id-cards/id-cards.ts']; lines=[len(f.read_text(encoding='utf-8').splitlines()) for f in files]; fac=[f.with_name(f.stem+'.facade.ts') for f in files]; ex=[x.exists() for x in fac]; root=[x.name for x in fac if x.exists() and 'providedIn' in x.read_text(encoding='utf-8')]; amap='facade' in pathlib.Path('.agents/PROJECT_ARCHITECTURE_MAP.md').read_text(encoding='utf-8'); print('lines',lines,'facades',ex,'providedIn_root',root,'arch_map',amap); sys.exit(0 if all(ex) and not root and amap else 1)"
verify: python scripts/automation/verify_tools.py diff-free --base {base} --pattern "." --path warehouse-front/src/app/modules/common/components/operations/companies/companies.html warehouse-front/src/app/modules/common/components/users/users.html warehouse-front/src/app/modules/common/components/audit/audit.html warehouse-front/src/app/modules/common/components/id-cards/id-cards.html CLAUDE.md
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

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۸، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن. `CLAUDE.md` را تغییر نده.
- فایل‌های قالب `.html` این چهار کامپوننت تغییر نکنند.
- هر متد، property، signal، `@Input` و `@Output` که قالب یا spec از آن استفاده می‌کند، روی کلاس کامپوننت با همان نام و امضا بماند و فقط به Facade بسپارد.
- نگهبان‌ها هرگز ضعیف‌تر نشوند: هیچ بررسی موجود حذف یا شل نشود.

۲. زمینه: بخش `## ۵.` سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. فایل‌ها در `warehouse-front/src/app/modules/common/components/`: `operations/companies/companies.ts`، `users/users.ts`، `audit/audit.ts` و `id-cards/id-cards.ts`. نگهبان‌ها: `scripts/e2e/guardian_modularization.py` و `scripts/e2e/guardian_57_front_module_fence.py`.

۳. تعریف‌ها:
- «Facade» یعنی کلاس `@Injectable()` بدون `providedIn` در فایل `<نام>.facade.ts` کنار کامپوننت، که در آرایهٔ `providers` همان کامپوننت ثبت می‌شود.
- هیچ سقف شمار خطی وجود ندارد. هدف فقط جدا کردن منطق از کامپوننت است، نه کم کردن خطوط.

۴. کار:
- الف) پیش از ویرایش هر کامپوننت، specهای کنارش (از جمله `companies.dom.spec.ts` و `users.spec.ts`) را بخوان. هر عبارتی که spec با `readFileSync` یا regex در متن فایل `.ts` جست‌وجو می‌کند (مثل `providesTreasury`، `isAccountingInstalled`، `isWarehouseInstalled`، `tableColspan`)، در همان فایل `.ts` بماند.
- ب) برای هر کامپوننت یک Facade (و در صورت نیاز Helpers) بساز و منطق تجاری زیر را به آن ببر؛ هر جا جدا کردن منطقی ریسک تغییر رفتار دارد، آن را در کامپوننت نگه دار:
  1. `companies`: حساب‌های بانکی شرکت، اعضای هیئت‌مدیره، دوره‌های مالی، اسناد حقوقی، اعتبارسنجی شبا.
  2. `users`: ماتریس مجوزها، درخت نقش‌ها، پیش‌تنظیم‌های دسترسی، ورود و خروج Excel، فیلترها.
  3. `audit`: فیلتر تاریخ شمسی، پیش‌نمایش بازگردانی، آمار حجم پایگاه داده، خروجی لاگ.
  4. `id-cards`: رندر Canvas، پیش‌تنظیم ابعاد چاپ، QR Code، قالب‌های کارت.
- ج) نگهبان‌ها (`guardian_modularization.py` و `guardian_57_front_module_fence.py`) در این نشست تغییر نکنند و هیچ فایل مبنای اندازه ساخته نشود.
- د) در `.agents/PROJECT_ARCHITECTURE_MAP.md` ساختار تازه را ثبت کن: پکیج‌های `models_domains/`، `serializers_domains/` و `views_domains/` در بک‌اند، `modules/warehouse/api/`، `modules/warehouse/services/`، `modules/accounting/api/`، `core/services/offline/`، نقطه‌های توسعهٔ `syncConfig`، `projectLookup`، `dynamicFields` و `photoUpload`، و الگوی `*.facade.ts`.
- بیرون از دامنه: قالب‌های `.html`، `CLAUDE.md` و هر کامپوننت دیگر.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front`، یک بار `python scripts/e2e/guardian_56_change_integrity.py --base <پایه>`، و حداکثر دو بار هر کدام از `python scripts/e2e/guardian_modularization.py`، `python scripts/e2e/guardian_57_front_module_fence.py` و `python scripts/e2e/guardian_57_front_module_fence.py --self-test`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین؛ هیچ فایل `.html` و `CLAUDE.md` نباید در آن باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
refactor(platform-ui): extract facades for common components and update architecture map
- گزارش کوتاه: منطق‌هایی که به Facade رفتند، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 12 از 12 — ماژولارسازی عمیق: رفع یافتههای ناظر (ممیزی تکماژول، رجیستری ماژول در سرویسهای آفلاین، runQueue، فایل bat، نقشه معماری)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); reg=pathlib.Path('warehouse-backend/core/platform_core/registry.py').read_text(encoding='utf-8'); fn=reg[reg.find('def audit_scope_keys'):][:900]; sp=(app/'core/services/sync-pull.service.ts').read_text(encoding='utf-8'); pq=(app/'core/services/photo-upload-queue.service.ts').read_text(encoding='utf-8'); bat=pathlib.Path('dev-manager-modular.bat').read_bytes(); amap=pathlib.Path('.agents/PROJECT_ARCHITECTURE_MAP.md').read_text(encoding='utf-8'); ok={'audit_catalog':'MODULE_CATALOG' in fn,'no_second_registry':'getModuleRegistry' not in sp and 'getModuleRegistry' not in pq,'bat_ascii':all(b<128 for b in bat),'map_no_reverted_facades':'(مالی، انبار و پلتفرم مشترک' not in amap}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 771
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(modular): resolve supervisor findings of the deep modularization queue"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- `manage.py test` را فقط با برچسب اپ اجرا کن.
- قانون از دست نرفتن داده: رکورد صف همگام‌سازی فقط با 2xx یا 4xx صریح حذف می‌شود؛ 5xx و قطع اتصال یعنی تلاش دوباره. تشخیص قطع اتصال فقط با `isServerUnreachable()`.
- فقط پنج بند زیر را انجام بده. هیچ فایل دیگری را تغییر نده.

۲. زمینه: بخش `## ۵.` و «گزارش پیشرفت» سند `Documents/Deep_Modularization_Phase2/implementation_plan_deep_modularization.md`. ناظر Facadeهای نشست ۹ و ۱۰ را با `git revert` برگرداند (کامیت‌های `633c22c` و `cc2aecf`)؛ آن‌ها را دوباره نساز.

۳. تعریف‌ها: «کاتالوگ» یعنی `MODULE_CATALOG` در `warehouse-backend/core/platform_core/module_catalog.py` که همهٔ ماژول‌های کشف‌شده را دارد، نصب‌شده یا نه. «رجیستری ریشه» یعنی نمونهٔ `ModuleRegistryService` که Angular با `inject()` می‌دهد و `config-api.service.ts` روی آن `setInstalledModules()` را صدا می‌زند.

۴. کار:
- الف) `audit_scope_keys(module_code)` در `warehouse-backend/core/platform_core/registry.py` به‌جای `_REGISTRY` از `MODULE_CATALOG` بخواند تا در پروفایل تک‌ماژول هم کلیدهای ماژول نصب‌نشده برگردد و `.exclude(...)` در `AuditLogViewSet` خالی نشود. import کاتالوگ را درون تابع بگذار تا import حلقوی پیش نیاید. یک آزمون در `warehouse-backend/core/platform_core/tests.py` (یا فایل آزمون موجود همان اپ) اضافه کن که با `unittest.mock.patch.dict` روی `_REGISTRY` و حذف `'accounting'` از آن، همچنان شش کلید `('personnel', 'payroll', 'attendance', 'fleet', 'treasury', 'finance')` برگردد.
- ب) در `warehouse-front/src/app/core/services/sync-pull.service.ts` و `warehouse-front/src/app/core/services/photo-upload-queue.service.ts`، `getModuleRegistry()` را با `inject(ModuleRegistryService)` (رجیستری ریشه) جایگزین کن. هر دو سرویس `@Injectable` هستند. اگر یکی از آن‌ها بیرون از injection context ساخته می‌شود (مثلاً `getInstance()` ایستا)، رجیستری را از همان جایی بگیر که نمونهٔ Angular آن ساخته می‌شود و در گزارش بنویس. specهای همین دو سرویس را هماهنگ کن.
- ج) `runQueue` در `warehouse-front/src/app/core/services/offline-sync.service.ts`: نسخهٔ کامیت `de01d8e` همین متد را بخوان و دو رفتار را دقیقاً برگردان: (۱) `_lastSyncTime$.next(Date.now())` در همان شرایط قبلی (از جمله وقتی هر دو صف در نخستین دور خالی‌اند)؛ (۲) در خطای پیش‌بینی‌نشده، همان محاسبهٔ نتیجهٔ قبلی، نه `server-unreachable` ثابت. تابع `runQueueSequential` در `core/services/offline/offline-queue-runner.ts` را برای این کار فقط در حد لازم تغییر بده و شرط حذف رکورد صف را دست نزن.
- د) در `dev-manager-modular.bat` دو خط `rem` فارسی را با این خط انگلیسی جایگزین کن: `rem The dev server always shows all modules; single-module builds use npm run build:modules`. فایل باید فقط نویسهٔ ASCII داشته باشد.
- ه) در `.agents/PROJECT_ARCHITECTURE_MAP.md` زیر عنوان «الگوی معماری فکاد»، متن را اصلاح کن: الگوی Facade فقط در چهار کامپوننت پلتفرم مشترک (`companies`، `users`، `audit`، `id-cards`) به کار رفته است؛ Facadeهای کامپوننت‌های مالی و انبار برگردانده شدند، چون جابه‌جایی منطقشان رفتار را عوض کرده بود.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front`، حداکثر دو بار `warehouse-backend\venv\Scripts\python.exe manage.py test platform_core accounts --noinput` در پوشهٔ `warehouse-backend` با `PYTHONUTF8=1`، و یک بار `python scripts/e2e/guardian_57_front_module_fence.py`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین؛ جز فایل‌های همین پنج بند و specها و آزمون‌های مربوط نباید فایلی تغییر کرده باشد.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
fix(modular): resolve supervisor findings of the deep modularization queue
- گزارش کوتاه: برای هر بند الف تا ه، فایل و تغییر؛ فرمان‌هایی که واقعاً اجرا کردی با نتیجه؛ و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] نشست 13 از 13 — ماژولارسازی عمیق: یک نمونهٔ واحد ModuleRegistryService برای DI و دسترسی ایستا و رفع NG0203 در SyncPullService.getInstance

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; app=pathlib.Path('warehouse-front/src/app/core'); reg=(app/'modules/module-registry.service.ts').read_text(encoding='utf-8'); sp=(app/'services/sync-pull.service.ts').read_text(encoding='utf-8'); pq=(app/'services/photo-upload-queue.service.ts').read_text(encoding='utf-8'); gi=sp[sp.find('static getInstance'):][:400]; ok={'shared_factory':'useFactory' in reg and 'getModuleRegistry' in reg[reg.find('@Injectable'):reg.find('@Injectable')+200],'getinstance_no_inject':'inject(' not in gi,'no_inject_registry':'inject(ModuleRegistryService)' not in sp and 'inject(ModuleRegistryService)' not in pq}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(front-core): single shared module registry instance and safe SyncPullService.getInstance"
verify: python scripts/automation/verify_tools.py clean-tree
-->

۱. قواعد سخت:
- `.agents/AGENTS.md` بخش‌های ۳، ۵، ۷، ۹ و ۱۰ برقرارند.
- push نکن. فقط فایل‌هایی را که خودت تغییر دادی stage کن. `tasks.md`، `tasks_history.md`، `run_tasks.py` و `run_tasks.bat` را هرگز stage نکن.
- قانون از دست نرفتن داده: هیچ شرط حذف رکورد صف، کش یا عکس تغییر نکند.
- فقط سه فایل زیر و specهای آن‌ها تغییر کنند.

۲. زمینه: در کامیت `09fd3f7`، `SyncPullService.getInstance()` در `warehouse-front/src/app/core/services/sync-pull.service.ts` به `inject(SyncPullService)` تغییر کرد. `layout.ts` در `ngOnInit` از راه `OfflineSyncService.getInstance().pullProgress$` آن را بیرون از injection context صدا می‌زند و خطای NG0203 می‌گیرد. ریشهٔ مشکل این بود که `getModuleRegistry()` در `core/modules/module-registry.service.ts` نمونهٔ دومی جدا از نمونهٔ ریشهٔ Angular می‌ساخت.

۳. تعریف: «نمونهٔ واحد» یعنی `getModuleRegistry()` و `inject(ModuleRegistryService)` همیشه یک شیء را برگردانند.

۴. کار:
- الف) در `core/modules/module-registry.service.ts` دکوراتور را به `@Injectable({ providedIn: 'root', useFactory: () => getModuleRegistry() })` تغییر بده تا DI همان نمونهٔ ایستای `getModuleRegistry()` را بدهد. سازندهٔ کلاس نباید `inject()` داشته باشد؛ اگر دارد، در گزارش بنویس.
- ب) در `core/services/sync-pull.service.ts` و `core/services/photo-upload-queue.service.ts`، رجیستری را با `getModuleRegistry()` بگیر (نه `inject(ModuleRegistryService)`). `SyncPullService.getInstance()` مثل کامیت `1b1dac8` با `new SyncPullService()` نمونه بسازد و هیچ `inject()` نداشته باشد. اگر سازندهٔ `SyncPullService` یا فیلدهایش `inject()` دیگری دارند، آن را هم با معادل ایستا جایگزین کن.
- ج) در spec ماژول رجیستری یا `sync-pull.service.spec.ts` دو آزمون اضافه کن: (۱) `TestBed.inject(ModuleRegistryService) === getModuleRegistry()`؛ (۲) `SyncPullService.getInstance()` بیرون از `TestBed.runInInjectionContext` بدون خطا نمونه برمی‌گرداند.

۵. فرمان‌های مجاز: حداکثر دو بار `npx ng build --output-path ../scratch/ng-build-agent` در `warehouse-front`. اگر فرمانی شکست خورد، همان را تکرار نکن؛ علت را از خروجی بخوان و رویکرد را عوض کن.

۶. پیش از پایان: `git diff --stat` را ببین؛ فقط همین سه فایل و specها باید تغییر کرده باشند.

۷. خروجی و پایان:
- فقط فایل‌های تغییریافتهٔ خودت را stage کن و با این پیام commit کن، بدون push:
fix(front-core): single shared module registry instance and safe SyncPullService.getInstance
- گزارش کوتاه: تغییر هر فایل، فرمان‌هایی که واقعاً اجرا کردی با نتیجه، و ابهام‌های مانده. پس از commit نوبت را تمام کن.

===

[DONE] Session 14 — Release the current main branch on the local app environment (app.farsalish.ir): backup, patched frontend build, Daphne and GDrive worker restart, health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- This session is a release only. Do not edit, create, stage or commit any file. Do not run `git` commands that change the working tree or history.
- Never touch the untracked files under `warehouse-front/src/` (four `*.dom.spec.ts` files). Leave them exactly as they are.
- Only the local `app` environment on this Windows machine is in scope. Do not connect to, deploy to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `warehouse-backend/backups/`.
- Do not stop the Express server on port 4200, PostgreSQL on port 5432 or `cloudflared`.

2. Context: read `.agents/AGENTS.md` section 8, the "Local Test Deployment Protocol (`app.farsalish.ir`, no yes/no needed)" list. It has the exact commands for every step below. Your terminal commands may run in PowerShell; if so, drop the `MSYS_NO_PATHCONV=1 ` prefix from the `wt.exe` commands and set environment variables with `$env:NAME='value';`.

3. Definitions:
- "Daphne processes" means every process whose command line contains `-m daphne -b 0.0.0.0 -p 8000`: the process listening on port 8000 and its `venv\Scripts\python.exe` launcher.
- "Worker processes" means every python process whose command line contains `run_gdrive_sync_worker`. There may be none.

4. Task, in this order:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app'); print(m['filename'], m['size'])"`
  Stop the session and report if it fails or prints a size of 0. Do not continue to step b without a successful backup.
- b) Frontend build. In `warehouse-front`, run `npx ng build --delete-output-path=false`, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- c) Daphne restart. List the Daphne processes with their PIDs, end them with `taskkill /PID <pid> /F`, confirm port 8000 is free, then launch Daphne with the `wt.exe ... --title "Backend Daphne" ...` command from section 8 step 3. Wait until port 8000 listens again (up to 60 seconds).
- d) GDrive worker. If worker processes exist, end them with `taskkill /PID <pid> /F`; the auto-restart loop in their tab starts a fresh worker within about 10 seconds. If no worker process exists, launch the worker tab with the `wt.exe ... --title "GDrive Sync Worker" ...` command from section 8 step 4. Then wait until a worker process is running.
- e) Health checks. Confirm HTTP 200 for `https://app.farsalish.ir/` and `https://app.farsalish.ir/api/public/config/`. Wait about 30 seconds after step d, then confirm the worker heartbeat is fresh: in `warehouse-backend` run
  `.\venv\Scripts\python.exe manage.py shell -c "from django.utils import timezone; from settings_core.models import SystemGoogleDriveConfig as C; c = C.objects.get(id=1); print((timezone.now() - c.worker_heartbeat_at).total_seconds())"`
  The printed age must be below 180.

5. Tool policy:
- Allowed: the commands above, `netstat -ano`, `Get-NetTCPConnection`, `Get-CimInstance Win32_Process` (or `wmic process`) to find PIDs and command lines, `taskkill /PID <pid> /F` for Daphne and worker processes only, `Invoke-WebRequest`/`curl.exe` for the health checks, and short sleeps.
- Run the build at most twice. If a command fails, read its output, do not repeat the same command unchanged, and change approach.
- If a step cannot be completed, stop and report the exact error; do not try workarounds that touch files or other services.

6. Before finishing: run `git status --short` and confirm it shows only the four untracked `*.dom.spec.ts` files and runner files.

7. Output and stop condition: write a short English report: backup filename and size, build result and the patch script line, old and new Daphne PIDs, worker PIDs, both HTTP status codes, the heartbeat age, and anything unexpected. No commit in this session. End the turn after the report.

===

[DONE] Session 15 — Fix stale fixtures in 32 known-failing backend tests (inventory and warehouses): company and warehouse scope for test users, missing permission row, broken assertion

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; ok={'warehouse-backend/modules/warehouse/inventory/tests.py','warehouse-backend/modules/warehouse/inventory/tests_docs.py','warehouse-backend/modules/warehouse/inventory/tests_offline_system.py','warehouse-backend/modules/warehouse/warehouses/test_company_warehouse_isolation.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch)); print('outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python -c "import subprocess,sys,re; d=subprocess.run(['git','diff','-U0','{base}','HEAD','--','warehouse-backend'],capture_output=True,text=True,encoding='utf-8').stdout; rm=[l for l in d.splitlines() if l.startswith('-') and not l.startswith('---') and re.search(r'assert',l)]; print(len(rm),'removed or changed assert lines:'); [print(' ',l[:160]) for l in rm]; sys.exit(1 if len(rm)>1 else 0)"
verify: python scripts/automation/verify_tools.py django-tests --labels inventory warehouses --known scratch/runner-cache/known_s15.txt --min-tests 90
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(inventory): company and warehouse scope in stale test fixtures"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Change only these four test files: `warehouse-backend/modules/warehouse/inventory/tests.py`, `warehouse-backend/modules/warehouse/inventory/tests_docs.py`, `warehouse-backend/modules/warehouse/inventory/tests_offline_system.py`, `warehouse-backend/modules/warehouse/warehouses/test_company_warehouse_isolation.py`. No app code, no models, no migrations, no other file.
- Do not weaken any test: do not change expected status codes, expected counts, expected values, or remove assertions. The only assertion line you may rewrite is line 83 of `test_company_warehouse_isolation.py` (described in 4d).
- Do not touch `test_idempotent_creation_with_sync_id` in `tests_offline_system.py`. It fails because of a real app bug that is out of scope; it must keep failing.
- Do not push. Stage only the four files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.
- Run `manage.py test` only with app or module labels, never without a label.

2. Context:
- Non-superuser API access is scoped by company and warehouse. `scope_tenant_queryset` in `warehouse-backend/core/common/tenant_scope.py` returns nothing for a non-superuser without company access (`get_user_allowed_companies` in `warehouse-backend/core/companies/access.py` reads `UserCompanyAccess` rows with `access_level='workspace_full'`). Warehouse-level scope uses `Warehouse.assigned_users`.
- The failing test fixtures were written before this scoping. Their warehouses have no company, and their users have no `UserCompanyAccess` row and no warehouse assignment, so the API answers 403, 404 or empty lists.
- A working fixture pattern is in `setUp` of `warehouse-backend/modules/warehouse/warehouses/test_company_warehouse_isolation.py` (`Company.objects.get_or_create(code=..., defaults={'name': ..., 'has_warehouse_module': True})`, `Warehouse.objects.create(..., company_id=..., company_name=...)`, `UserCompanyAccess.objects.create(user=..., company=..., access_level='workspace_full', is_default=True)`).
- The permission `view_wh_stocktaking` is not created by any migration. `BaseInventoryTestCase._assign_perms` in `inventory/tests.py` already creates missing permissions with `Permission.objects.get_or_create(content_type=<User content type>, codename=code, defaults={'name': code})`.

3. Definitions:
- "Scoped user" means a non-superuser test user that has a `UserCompanyAccess` row with `access_level='workspace_full'` and `is_default=True` for the test company, and is in `assigned_users` of the warehouse it works in.
- "Unauthorized user" means `simple_guest` in `inventory/tests.py`. It must stay without company access and without warehouse assignment.

4. Task:
- a) `inventory/tests.py`, `BaseInventoryTestCase.setUp`: create one test company, give both `self.warehouse` and `self.warehouse2` that company (`company_id` and `company_name`), and make `self.manager`, `self.supervisor`, `self.counter` and `self.counter2` scoped users of `self.warehouse`. In `test_06_multi_warehouse_dispatch_isolation`, before the request, also add `self.manager` and `self.counter` to `self.warehouse2.assigned_users`, because that test dispatches an item of `warehouse2`.
- b) `inventory/tests_docs.py`, `FinancialDocsCycleTests.setUp`: same pattern. Give the test warehouse(s) a test company and make every non-superuser user created in `setUp` a scoped user of the warehouse it works in.
- c) `inventory/tests_offline_system.py`, `OfflineSystemRemediationTests.setUp`: replace the three `Permission.objects.get(codename=...)` calls with `get_or_create` on the user model content type, as `_assign_perms` does. Give the test warehouse a test company and make `self.counter` a scoped user of it.
- d) `warehouses/test_company_warehouse_isolation.py`: add `from rest_framework import status` to the imports and change line 83 to `self.assertEqual(response.status_code, status.HTTP_200_OK)`.
- After the changes, all tests in these four files must pass except `test_idempotent_creation_with_sync_id`. If another test still fails, first check whether a scope row or assignment is missing for the user in that test. If the failure is not a fixture problem, do not change its assertions; list the test and the reason in your report.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test inventory.tests inventory.tests_docs inventory.tests_offline_system warehouses.test_company_warehouse_isolation --noinput`, and at most one run of `.\venv\Scripts\python.exe manage.py test inventory warehouses --noinput`. If a command fails, read the output, do not repeat it unchanged, and change approach.

6. Before finishing: run `git diff --stat`; only the four files may be changed. Check that no assertion line was removed or changed except line 83 of the isolation test.

7. Output and stop condition:
- Stage only the four files and commit with this message, without push:
test(inventory): company and warehouse scope in stale test fixtures
- Short English report: what changed in each file, the test commands you actually ran with their pass/fail counts, and any test that still fails with its reason. End the turn after the commit and report.

===

[DONE] Session 16 — Make the four new DOM spec files compile and pass, remove the tests that only check their own mocks, and commit them

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; base='warehouse-front/src/app/modules/'; ok={base+'accounting/components/finance/finance-pages-workflow.dom.spec.ts',base+'accounting/components/finance/finance-operations-workflow.dom.spec.ts',base+'common/components/layout/login-and-app-switching.dom.spec.ts',base+'warehouse/components/counter/counter-offline-workflow.dom.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); print('changed:',sorted(ch)); bad=sorted(ch-ok); miss=sorted(ok-ch); print('outside scope:',bad,'not committed:',miss); sys.exit(1 if bad or miss else 0)"
verify: python -c "import pathlib,sys; b=pathlib.Path('warehouse-front/src/app/modules'); lg=(b/'common/components/layout/login-and-app-switching.dom.spec.ts').read_text(encoding='utf-8'); ct=(b/'warehouse/components/counter/counter-offline-workflow.dom.spec.ts').read_text(encoding='utf-8'); bad={'logout_tautology':'mockAuth.logout();' in lg,'canaccess_override':'personaSvc.canAccessApp = ' in lg,'photo_flush_mock':chr(39)+'flush'+chr(39)+')' in ct,'processqueue_mock':chr(39)+'processQueue'+chr(39)+')' in ct,'uploadphotos_fake':'itemPhotoSvc.uploadPhotos = ' in ct}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(front): workflow DOM specs for finance pages, login and app switching, counter offline"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 9 and 10 apply.
- Change only these four untracked files. Do not change any app file (`*.ts` that is not a spec, `*.html`, `*.css`), any other spec, `tsconfig*.json`, `angular.json` or `package.json`:
  - `warehouse-front/src/app/modules/accounting/components/finance/finance-pages-workflow.dom.spec.ts`
  - `warehouse-front/src/app/modules/accounting/components/finance/finance-operations-workflow.dom.spec.ts`
  - `warehouse-front/src/app/modules/common/components/layout/login-and-app-switching.dom.spec.ts`
  - `warehouse-front/src/app/modules/warehouse/components/counter/counter-offline-workflow.dom.spec.ts`
- A test must exercise real component or service code. Do not replace the method under test with `vi.spyOn(...).mockImplementation`, a hand-written function or `Object.defineProperty`, and do not assert on values that only a mock produced.
- Do not push. Stage only the four files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context: the Angular unit-test builder type-checks every spec, so a spec with a type error breaks the whole suite. Current type errors:
- `finance-operations-workflow.dom.spec.ts` line 469: `'approved'` is not an `InvoiceStatusTab`.
- `finance-pages-workflow.dom.spec.ts` line 93: `vehicle_model` is not in `VehicleDriverProfile`; line 368: `selectedBankCode` does not exist on `EmployeeNewPersonnelHubComponent`.
- `counter-offline-workflow.dom.spec.ts` line 101: `warehouse` is not in `CountTask` (use `warehouse_id`); line 203: `dynamic_data` is possibly undefined and `batch_no` must be read with `['batch_no']`; line 348: the `OfflinePendingBadgeComponent` constructor needs a third argument `state: StateService`.

3. Definitions: a "self-mock test" is a test or a part of a test whose assertions only check what a mock defined in the same test returned or recorded.

4. Task:
- a) Fix every type error above using the real types and members of the component or model. For `selectedBankCode`, read `EmployeeNewPersonnelHubComponent` and assert the member that really holds the detected bank; if no such member exists, delete only that assertion and say so in the report. Use the real union value of `InvoiceStatusTab` that matches the intent of the test.
- b) Remove these self-mock tests and parts:
  - `login-and-app-switching.dom.spec.ts`: the two logout `it` blocks (they call `mockAuth.logout()` and then assert that it was called), and the line `personaSvc.canAccessApp = (app: string) => true;` in the superuser test. After removing that line, keep the three `canAccessApp` assertions only if they pass with the real `AppPersonaService.canAccessApp`; otherwise delete them.
  - `counter-offline-workflow.dom.spec.ts`: the whole second `describe` block (offline photo upload; it fakes `uploadPhotos`, `enqueue` and `flush`), and in the first test everything from the comment that starts with `// ۳.` to the end of that test (it asserts the result of a mocked `processQueue`). Also remove the `vi.spyOn(offlineSync, 'processQueue')` mock in that test. Keep the assertions about the task state and the enqueued mutations after `counterDashboard.saveDraft()`.
- c) Every remaining test in the four files must pass. If a remaining test fails because the expectation is wrong for the real code, fix the setup or delete that single test and list it in the report; do not change app code to make it pass.

5. Tool policy: to run only these specs, create a temporary tsconfig in `warehouse-front` that extends `tsconfig.spec.json` and includes `src/**/*.d.ts` plus the four files, and run `npx ng test --watch=false --ts-config <that file> --include <each file>` at most four times. Delete the temporary tsconfig before committing. If a command fails, read the output, do not repeat it unchanged, and change approach.

6. Before finishing: `git status --short` must show no change outside the four files except runner files.

7. Output and stop condition:
- Stage only the four files and commit with this message, without push:
test(front): workflow DOM specs for finance pages, login and app switching, counter offline
- Short English report: per file, what you fixed and removed, and the pass/fail counts you actually saw. End the turn after the commit and report.

===

[DONE] Session 17 — Close the sync-queue data-loss path in the offline badge: remove clear-all, current-user entries only, no cancel while sending, confirm dialog for single cancel

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,subprocess; app=pathlib.Path('warehouse-front/src/app'); bd=(app/'shared/components/offline-pending-badge/offline-pending-badge.component.ts').read_text(encoding='utf-8'); sv=(app/'core/services/offline-sync.service.ts').read_text(encoding='utf-8'); rn=(app/'core/services/offline/offline-queue-runner.ts').read_text(encoding='utf-8'); g=lambda t,s: t[t.find(s):][:1500]; cq=g(rn,'export async function cancelQueueEntry'); oc=g(bd,'async onCancelQueueItem'); lq=g(bd,'async loadQueueEntries'); base=subprocess.run(['git','show','{base}:warehouse-front/src/app/core/services/offline/offline-queue-runner.ts'],capture_output=True,text=True,encoding='utf-8').stdout; gq=lambda t: t[t.find('export async function getQueueEntries'):][:900]; ic=subprocess.run(['git','diff','--name-only','{base}','HEAD','--','warehouse-front/src/app/core/interceptors'],capture_output=True,text=True).stdout.strip(); ok={'no_clear_all_button':'onClearAllQueue' not in bd,'no_clearQueue_service':'clearQueue(' not in sv,'cancel_blocks_sending':chr(39)+'sending'+chr(39) in cq,'cancel_checks_user':'getStoredCurrentUserId' in cq,'badge_confirm_dialog':'ConfirmDialogService' in bd and '.open(' in oc,'badge_user_filter':'getStoredCurrentUserId' in lq,'getQueueEntries_unchanged':gq(rn)==gq(base),'interceptors_unchanged':ic==''}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; s=subprocess.run(['git','grep','-n','clearQueue(','--','warehouse-front/src'],capture_output=True,text=True).stdout; print(s or 'no clearQueue( left'); sys.exit(1 if s.strip() else 0)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(offline): no clear-all, own entries only and confirmed single cancel in the sync badge"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7, 9 and 10 apply.
- Data-loss rule of this project: a sync-queue record is deleted only on explicit server acceptance (2xx) or explicit rejection (4xx). The only user-initiated exception kept after this session is a confirmed cancel of one record of the current user that is not being sent.
- Change only `warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.ts`, `warehouse-front/src/app/core/services/offline-sync.service.ts`, `warehouse-front/src/app/core/services/offline/offline-queue-runner.ts`, and spec files for them. Do not change `getQueueEntries` in `offline-queue-runner.ts` (the offline interceptor uses it to merge queued changes into cached reads) and do not change anything under `core/interceptors/`.
- Do not change how records are sent, retried, marked failed or deleted after a server response.
- User-facing text stays Persian. Use `<svg appIcon="...">` for any icon; no new inline svg.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- `OfflinePendingBadgeComponent` (header sync badge, used on many pages) has a queue tab. It lists `this.sync.getQueueEntries()`, which returns `pending` and `failed` records of both IndexedDB queues for all users on the device. A "لغو همه موارد" button calls `onClearAllQueue()`, which after a native `confirm()` calls `OfflineSyncService.clearQueue()`. That empties both queues completely, including records in `sending` state and records of other users, and it does not call `invalidateCache` for them. Each row also has a "لغو" button that calls `onCancelQueueItem(id)` with no confirmation.
- `cancelQueueEntry` in `core/services/offline/offline-queue-runner.ts` deletes one record and calls `invalidateCacheFn`. `OfflineSyncService.cancelQueueEntry` wraps it.
- The sender skips records of other users: in `processQueue` of `offline-queue-runner.ts`, `if (entry.userId && currentUserId && entry.userId !== currentUserId) continue;` with `currentUserId = getStoredCurrentUserId()` from `core/services/sync-pull.service.ts`.
- The app confirm dialog: `ConfirmDialogService.open({ title, message, confirmText, cancelText, type: 'danger' })` in `shared/components/confirm-dialog/confirm-dialog.component.ts`; it resolves `true` on confirm.

3. Definitions:
- "Own record" means a queue record whose `userId` is empty or equals `getStoredCurrentUserId()`. This is the same rule the sender uses.
- "Being sent" means `status === 'sending'`.

4. Task:
- a) Remove the "لغو همه موارد" button from the badge template, remove `onClearAllQueue()`, and remove `OfflineSyncService.clearQueue()`. Nothing else may call `clearQueue(`.
- b) In the badge `loadQueueEntries()`, keep calling `this.sync.getQueueEntries()` and then keep only own records in `queueEntries`. Do not change `getQueueEntries` itself.
- c) In `cancelQueueEntry` of `offline-queue-runner.ts`: read the record first; if it does not exist, is being sent, or is not an own record, do not delete it and return `false`; otherwise delete it, call `invalidateCacheFn` as today, and return `true`. Make `OfflineSyncService.cancelQueueEntry` return that boolean.
- d) In the badge `onCancelQueueItem(id)`: first open the app confirm dialog with `type: 'danger'`, title «لغو این درخواست», message «این تغییر هنوز به سرور ارسال نشده است. با لغو، برای همیشه از این دستگاه حذف می‌شود و قابل بازگشت نیست.», `confirmText` «لغو درخواست» and `cancelText` «انصراف». Only when it resolves `true`, call `cancelQueueEntry`; remove the row from `queueEntries` only when that returns `true`; otherwise reload the list. Inject `ConfirmDialogService` with `inject()` as the component already does for other services; keep the constructor parameters unchanged.
- e) Add spec tests (Vitest, real code, IndexedDB access mocked only at the Dexie table level if needed): `cancelQueueEntry` returns `false` and keeps the record for a `sending` record and for a record of another user, and returns `true` and deletes an own `pending` record; the badge does not call `cancelQueueEntry` when the dialog resolves `false`; the badge lists only own records.

5. Tool policy: at most two runs of `npx ng build --output-path ../scratch/ng-build-agent` in `warehouse-front`, and at most three targeted `npx ng test --watch=false` runs for your new specs (with a temporary tsconfig that you delete before committing). If a command fails, read the output, do not repeat it unchanged, and change approach.

6. Before finishing: run `git diff --stat`; only the files allowed in section 1 may be changed. Confirm `git grep -n "clearQueue(" -- warehouse-front/src` prints nothing.

7. Output and stop condition:
- Stage only your changed files and commit with this message, without push:
fix(offline): no clear-all, own entries only and confirmed single cancel in the sync badge
- Short English report: the change in each file, the commands you actually ran with results, and remaining doubts. End the turn after the commit and report.

===

[DONE] Session 18 — Single cancel in the sync badge must target the right queue database: pass appScope, refuse ambiguous ids, read and delete in one transaction

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,subprocess; app=pathlib.Path('warehouse-front/src/app'); bd=(app/'shared/components/offline-pending-badge/offline-pending-badge.component.ts').read_text(encoding='utf-8'); rn=(app/'core/services/offline/offline-queue-runner.ts').read_text(encoding='utf-8'); g=lambda t,s: t[t.find(s):][:2500]; cq=g(rn,'export async function cancelQueueEntry'); oc=g(bd,'async onCancelQueueItem'); base=subprocess.run(['git','show','{base}:warehouse-front/src/app/core/services/offline/offline-queue-runner.ts'],capture_output=True,text=True,encoding='utf-8').stdout; gq=lambda t: t[t.find('export async function getQueueEntries'):][:900]; ok={'badge_passes_scope':'appScope' in oc,'template_passes_item':'onCancelQueueItem(item)' in bd,'cancel_in_transaction':'.transaction(' in cq,'cancel_checks_both_dbs':'warehouseOfflineDb' in cq and 'financeOfflineDb' in cq,'still_blocks_sending':chr(39)+'sending'+chr(39) in cq,'still_checks_user':'getStoredCurrentUserId' in cq,'confirm_fail_closed':'if (this.confirmDialog) {' not in oc and 'confirmDialog' in oc,'getQueueEntries_unchanged':gq(rn)==gq(base)}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.ts','warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.spec.ts','warehouse-front/src/app/core/services/offline/offline-queue-runner.ts','warehouse-front/src/app/core/services/offline/offline-queue-runner.spec.ts','warehouse-front/src/app/core/services/offline-sync.service.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(offline): single cancel targets the record's own queue database"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 9 and 10 apply.
- Data-loss rule: a sync-queue record is deleted only on explicit server acceptance (2xx), explicit rejection (4xx), or a confirmed user cancel of that exact record when it is an own record and not being sent. Never delete a record the user did not choose.
- Change only `warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.ts`, `warehouse-front/src/app/core/services/offline/offline-queue-runner.ts`, `warehouse-front/src/app/core/services/offline-sync.service.ts` (only if its `cancelQueueEntry` signature must follow), and the two spec files next to the first two. Do not change `getQueueEntries`, the send/retry logic of `processQueue`, or anything under `core/interceptors/`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- The warehouse and finance sync queues are two separate Dexie databases (`warehouseOfflineDb` and `financeOfflineDb` in `core/services/offline-db.ts`), each with its own auto-increment `++id`. The same `id` can exist in both.
- `getQueueEntries()` merges both lists. Each record has `appScope` (`'warehouse'` or `'finance'`), except possibly old records written before that field existed.
- The badge template calls `onCancelQueueItem(item.id!)`, and the badge calls `this.sync.cancelQueueEntry(id)` with no scope. `cancelQueueEntry` in `offline-queue-runner.ts` then looks in the warehouse database first. So confirming the cancel of finance record 5 deletes warehouse record 5 if it exists: the wrong record is lost, and the chosen one stays.
- Also, `cancelQueueEntry` reads the record and deletes it in two separate steps, so the record can turn to `sending` in between.

3. Definitions:
- "Own record" and "being sent" keep the meaning from session 17: `userId` empty or equal to `getStoredCurrentUserId()`, and `status === 'sending'`.
- "Ambiguous id" means a call without a scope where the id exists in both databases.

4. Task:
- a) Badge: change the template call to `onCancelQueueItem(item)`, make `onCancelQueueItem` take the `SyncQueueEntry`, keep the confirm dialog exactly as it is, and call `this.sync.cancelQueueEntry(item.id!, item.appScope)`. Remove the row only when the call returns `true`; otherwise reload the list, as today.
- b) `cancelQueueEntry` in `offline-queue-runner.ts`:
  - With a scope: use only that database.
  - Without a scope: look up the id in both `warehouseOfflineDb` and `financeOfflineDb`. If it exists in both (ambiguous id), return `false` and delete nothing. If it exists in exactly one, use that one.
  - Inside the chosen database, do the read, the guards (missing, being sent, not own record) and the delete in one `db.transaction('rw', db.syncQueue, ...)`. Call `invalidateCacheFn` after the transaction, only when the record was deleted. Return `true` only when it was deleted.
- c) Keep `OfflineSyncService.cancelQueueEntry(id, scope)` passing the scope through and returning the boolean.
- c2) The badge now injects `ConfirmDialogService` with `{ optional: true }` and, when it is missing, cancels without asking. Make it fail closed: when `this.confirmDialog` is missing, do not cancel and return. Keep the optional injection. In the dialog message, write «می‌شود» with a zero-width non-joiner (U+200C) between «می» and «شود».
- d) Specs: add tests with real code (mock only at the Dexie table level if needed) for: finance record and warehouse record with the same id, a cancel with `scope 'finance'` deletes only the finance record; the same cancel without a scope returns `false` and deletes nothing; the badge passes `appScope` of the chosen row; the badge cancels nothing when no confirm dialog service is available. Keep the session 17 tests passing.

5. Tool policy: at most two runs of `npx ng build --output-path ../scratch/ng-build-agent` in `warehouse-front`, and at most three targeted `npx ng test --watch=false` runs for the two spec files (with a temporary tsconfig that you delete before committing). If a command fails, read the output, do not repeat it unchanged, and change approach.

6. Before finishing: run `git diff --stat`; only the allowed files may be changed, and the temporary tsconfig must be deleted.

7. Output and stop condition:
- Stage only your changed files and commit with this message, without push:
fix(offline): single cancel targets the record's own queue database
- Short English report: the change in each file, the commands you actually ran with results, and remaining doubts. End the turn after the commit and report.

===

[DONE] Session 19 — Harden single cancel in the sync queue: unscoped read errors refuse the cancel, no numeric-id branch in the badge, success flag only after the transaction commits

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,subprocess; app=pathlib.Path('warehouse-front/src/app'); bd=(app/'shared/components/offline-pending-badge/offline-pending-badge.component.ts').read_text(encoding='utf-8'); rn=(app/'core/services/offline/offline-queue-runner.ts').read_text(encoding='utf-8'); g=lambda t,s: t[t.find(s):][:3000]; cq=g(rn,'export async function cancelQueueEntry'); oc=g(bd,'async onCancelQueueItem')[:1800]; base=subprocess.run(['git','show','{base}:warehouse-front/src/app/core/services/offline/offline-queue-runner.ts'],capture_output=True,text=True,encoding='utf-8').stdout; gq=lambda t: t[t.find('export async function getQueueEntries'):][:900]; ok={'no_swallowed_reads':'.catch(() => undefined)' not in cq,'no_numeric_branch':'typeof (item as any)' not in oc and chr(39)+'number'+chr(39) not in oc,'still_transaction':'.transaction(' in cq,'still_blocks_sending':chr(39)+'sending'+chr(39) in cq,'still_fail_closed':'if (!this.confirmDialog)' in oc,'getQueueEntries_unchanged':gq(rn)==gq(base)}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.ts','warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.spec.ts','warehouse-front/src/app/core/services/offline/offline-queue-runner.ts','warehouse-front/src/app/core/services/offline/offline-queue-runner.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(offline): harden single cancel against read errors and stale ids"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 9 and 10 apply.
- Data-loss rule: never delete a sync-queue record the user did not choose. When in doubt, refuse the cancel and keep the record.
- Change only `warehouse-front/src/app/core/services/offline/offline-queue-runner.ts`, `warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.ts` and the spec files next to them. Do not change `getQueueEntries`, `processQueue`, send/retry/delete-after-response logic, or anything under `core/interceptors/`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context: read the current `cancelQueueEntry` in `offline-queue-runner.ts` and `onCancelQueueItem` in the badge (both changed in commit `a82e6f6`). A review found three remaining weak points:
- In the call without a scope, both database reads use `.catch(() => undefined)`. If the finance read fails and the same id exists in the warehouse database, the warehouse record is deleted although the user chose the finance one.
- `onCancelQueueItem` still accepts a number id (`typeof (item as any) === 'number'`), looks up the first row with that id and can pick the row of the other database. The template now always passes the row object, so this branch has no caller.
- `deletedEntry` is set inside the transaction callback. If the transaction aborts and the fallback path then exits on a guard, the function can still return `true`.

3. Definitions: "refuse" means return `false` and delete nothing.

4. Task:
- a) In the call without a scope: if either database read throws, refuse. Do not catch read errors to `undefined`.
- b) Remove the numeric-id branch from `onCancelQueueItem`; it takes only a `SyncQueueEntry`. Keep the fail-closed check, the confirm dialog text and the `confirmed !== true` check unchanged.
- c) In `cancelQueueEntry`, decide success only from the attempt that actually completed: reset the deleted-record variable before each attempt (transaction and fallback), and return `true` only when the attempt that finished without error deleted the record. Keep the read, the guards and the delete inside one transaction as today; keep `invalidateCacheFn` after a successful delete only.
- d) Specs: a read error on one database in an unscoped call refuses and keeps both records; the badge has no numeric-id path (update or remove any spec that called it with a number). Keep all existing cancel tests passing.

5. Tool policy: at most two runs of `npx ng build --output-path ../scratch/ng-build-agent` in `warehouse-front`, and at most three targeted `npx ng test --watch=false` runs for the two spec files (with a temporary tsconfig that you delete before committing). If a command fails, read the output, do not repeat it unchanged, and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files; the temporary tsconfig is deleted.

7. Output and stop condition:
- Stage only your changed files and commit with this message, without push:
fix(offline): harden single cancel against read errors and stale ids
- Short English report: the change in each file, the commands you actually ran with results, and remaining doubts. End the turn after the commit and report.

===

[DONE] Session 20 — Frontend-only release on the local app environment (app.farsalish.ir): backup, patched frontend build, health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py release-check --frontend-only
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- This session is a frontend release only. Do not edit, create, stage or commit any file. Do not run `git` commands that change the working tree or history.
- Do not stop, restart or start Daphne, the GDrive sync worker, the Express server on port 4200, PostgreSQL or `cloudflared`. Do not run `taskkill`. The backend code has not changed since the last release, so Daphne keeps running.
- Only the local `app` environment is in scope. Do not connect to or deploy to `soft.farsalish.ir`; do not run `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `warehouse-backend/backups/`.

2. Context: `.agents/AGENTS.md` section 8, "Local Test Deployment Protocol (`app.farsalish.ir`, no yes/no needed)", steps 1, 2 and 5. Your commands may run in PowerShell; set environment variables there with `$env:NAME='value';`.

3. Task, in this order:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app frontend'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Frontend build. In `warehouse-front`, run `npx ng build --delete-output-path=false`, wait until it has finished completely, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build` and do not delete `dist`. Run the build in the foreground; do not end your turn while it runs.
- c) Health checks. Confirm HTTP 200 for `https://app.farsalish.ir/` and `https://app.farsalish.ir/api/public/config/`.

4. Tool policy: only the commands above, `Invoke-WebRequest` or `curl.exe` for the checks, and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing: `git status --short` shows only runner files.

6. Output and stop condition: a short English report with the backup filename and size, the build result and the patch script line, and both HTTP status codes. No commit in this session. End the turn after the report.

===

[DONE] Session 21 — Idempotent item creation: a retried POST with the same sync_id returns the existing item instead of 400, only inside the user's scope

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; v=pathlib.Path('warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py').read_text(encoding='utf-8'); s=v.find('class ItemViewSet'); c=v.find('    def create(', s); body=v[c:c+3500] if c>0 else ''; ok={'create_override':c>0,'uses_tenant_scope':'scope_tenant_queryset' in body,'uses_warehouse_scope':'scope_queryset' in body,'uses_all_objects':'all_objects' in body}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py','warehouse-backend/modules/warehouse/inventory/tests_offline_system.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels inventory warehouses --known scratch/runner-cache/known_empty.txt --min-tests 136
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(inventory): idempotent item POST by sync_id within the user's scope"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Change only `warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py` and `warehouse-backend/modules/warehouse/inventory/tests_offline_system.py`. No models, serializers, migrations or other files.
- Tenant isolation: a user may never read, change or restore an item outside their company and warehouse scope through this path, and the response must not reveal whether such an item exists.
- Do not change behaviour for a POST without `sync_id` or with a `sync_id` that no item has.
- Do not push. Stage only the two files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- The offline queue in the frontend retries a POST when the first response was lost. A 4xx is treated as an explicit rejection and moves the record out of the queue.
- `ItemViewSet.perform_create` in `views_domains/item_views.py` already has an idempotent branch: if an item with the same `sync_id` exists in `Item.all_objects`, it saves onto that item (restoring it and its photos if it was soft-deleted).
- That branch is never reached on a retry: `ItemSerializer` (model `Item` has `unique_together = ('warehouse', 'fa_unic_code')`) runs DRF's unique-together validator in `is_valid()` first and answers 400 `The fields warehouse, fa_unic_code must make a unique set.`
- Test `test_idempotent_creation_with_sync_id` in `tests_offline_system.py` shows the bug: the second POST must return 200 or 201 with the same `id`.
- `ItemViewSet.get_queryset` scopes with `scope_tenant_queryset(queryset, self.request.user, company_field='warehouse__company_id', request=self.request)` from `common.tenant_scope` and then `scope_queryset(queryset, self.request.user)`.

3. Definitions: "in scope" means the existing item is returned when `Item.all_objects.filter(pk=existing.pk)` is passed through exactly the same two scoping calls that `get_queryset` uses.

4. Task:
- a) Override `create(self, request, *args, **kwargs)` in `ItemViewSet`. If `request.data` has a non-empty `sync_id` and `Item.all_objects` has an item with that `sync_id`:
  - If that item is not in scope, return 403 with the same Persian message style the view already uses for out-of-scope items (for example «دسترسی غیرمجاز: یک یا چند قلم کالا خارج از انبار مجاز شماست.»). Do not modify it.
  - If it is in scope, build the serializer with `instance=existing` and `data=request.data`, call `is_valid(raise_exception=True)`, call `self.perform_create(serializer)` so the existing idempotent branch (restore, photos, audit) runs, and return the serialized item with status 200.
  - Otherwise (no `sync_id`, or no item has it) call `super().create(...)` unchanged.
- b) In `tests_offline_system.py`, keep `test_idempotent_creation_with_sync_id` unchanged, and add one test: a non-superuser scoped to the test company and warehouse POSTs a `sync_id` that belongs to an item of a different company's warehouse; the response is 403 and that item is unchanged (description and `is_deleted`).

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test inventory.tests_offline_system --noinput` and at most one run of `.\venv\Scripts\python.exe manage.py test inventory warehouses --noinput`. If a command fails, read the output, do not repeat it unchanged, and change approach.

6. Before finishing: `git diff --stat` shows only the two files.

7. Output and stop condition:
- Stage only the two files and commit with this message, without push:
fix(inventory): idempotent item POST by sync_id within the user's scope
- Short English report: the change, the commands you actually ran with pass/fail counts, and remaining doubts. End the turn after the commit and report.

===

[DONE] Session 22 — Create the missing view_wh_stocktaking permission through the model and an additive migration, and apply it on the local app database

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/accounts/models.py','warehouse-backend/core/accounts/migrations/0002_view_wh_stocktaking_permission.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); miss=sorted(ok-ch); print('changed:',sorted(ch),'outside scope:',bad,'missing:',miss); sys.exit(1 if bad or miss else 0)"
verify: python -c "import pathlib,sys,re; m=pathlib.Path('warehouse-backend/core/accounts/migrations/0002_view_wh_stocktaking_permission.py').read_text(encoding='utf-8'); md=pathlib.Path('warehouse-backend/core/accounts/models.py').read_text(encoding='utf-8'); bad=[op for op in ('RemoveField','DeleteModel','AlterField','RenameField','RenameModel','RunSQL','AlterUniqueTogether','AddConstraint','SeparateDatabaseAndState','.delete(') if op in m]; ok={'no_destructive_ops':not bad,'alter_options':'AlterModelOptions' in m,'dep_0001':'0001_initial' in m,'runpython_reversible':('RunPython' not in m) or ('reverse_code' in m or 'RunPython.noop' in m),'model_has_perm':'view_wh_stocktaking' in md}; print(ok, bad); sys.exit(0 if all(ok.values()) else 1)"
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-check
verify: python scratch/runner-cache/probe_s22.py
verify: python scripts/automation/verify_tools.py django-tests --labels accounts inventory warehouses --known scratch/runner-cache/known_empty.txt --min-tests 136
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(accounts): view_wh_stocktaking permission created by the model"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 8 and 10 apply. Read the skill file `.claude/skills/safe-migration/SKILL.md` and follow its steps 1, 2, 2-b, 3, 5 and 6.
- No data may be lost. The migration must be additive only: `AlterModelOptions` plus, optionally, a `RunPython` that only renames an existing permission row, with `reverse_code=migrations.RunPython.noop`. No delete, no column change, no `RunSQL`.
- Change only `warehouse-backend/core/accounts/models.py` and the new file `warehouse-backend/core/accounts/migrations/0002_view_wh_stocktaking_permission.py`.
- Migrate only the local `app` database on this machine. Never touch `soft.farsalish.ir`; do not run `deploy.ps1`.
- Do not run `run_auto_backup`. Do not push. Stage only the two files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- The permission codename `view_wh_stocktaking` is used by `modules/warehouse/inventory/views_domains/count_views.py`, `modules/warehouse/module.py` and the frontend, but no migration or model creates it. On a fresh database nobody can be given it. The local `app` database has one row for it (content type `accounts.customuser`) whose name is the raw codename, created earlier by a script.
- All other warehouse menu permissions are declared in `CustomUser.Meta.permissions` in `warehouse-backend/core/accounts/models.py` (section "Warehouse Tabs"). Django's `post_migrate` handler creates missing declared permissions and does not rename existing ones.
- The `accounts` app has only `0001_initial`. The `django_migrations` table of this database has no other `accounts` record, so the name `0002_view_wh_stocktaking_permission` is free; still run the collision check of skill step 2-b.

3. Definitions: "additive" means the migration only adds state or permission rows and renames the one existing row's display name; it never removes or rewrites user data.

4. Task:
- a) In `CustomUser.Meta.permissions`, add `("view_wh_stocktaking", "انبارگردانی و پیگیری شمارش (انبار)")` in the "Warehouse Tabs" group, after `view_wh_settings`. Change nothing else in the model.
- b) Create the migration with `.\venv\Scripts\python.exe manage.py makemigrations accounts --name view_wh_stocktaking_permission`. It must contain only `AlterModelOptions` for `customuser`. Then add one `RunPython` operation that sets the name to «انبارگردانی و پیگیری شمارش (انبار)» only for `Permission` rows with `codename='view_wh_stocktaking'` whose name equals the codename, with `reverse_code=migrations.RunPython.noop`. Use `apps.get_model('auth', 'Permission')` inside the function and add `('auth', '0012_alter_user_first_name_max_length')` or the latest existing `auth` migration as a dependency only if Django requires it.
- c) Run `makemigrations --check --dry-run`: it must print "No changes detected".
- d) Follow the skill: check unapplied migrations and the name collision (step 2 and 2-b), read the SQL with `sqlmigrate accounts 0002_view_wh_stocktaking_permission`, take a backup with `create_database_backup` (step 5), run `.\venv\Scripts\python.exe manage.py migrate accounts`, then step 6 checks.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`: the commands named in section 4 and in the skill, at most one `migrate accounts`, and at most one run of `.\venv\Scripts\python.exe manage.py test accounts inventory warehouses --noinput`. If a command fails, read the output, do not repeat it unchanged, and change approach. If `migrate` fails, stop and report; do not edit the database by hand.

6. Before finishing: `git diff --stat` and `git status --short` show only the two files.

7. Output and stop condition:
- Stage only the two files and commit with this message, without push:
fix(accounts): view_wh_stocktaking permission created by the model
- Short English report: the migration operations, the `sqlmigrate` output summary, the backup filename, the migrate result, the test counts, and remaining doubts. End the turn after the commit and report.

===

[DONE] Session 23 — Backend release on the local app environment: backup, Daphne restart by the runner, health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check --backend-only
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Do not edit, create, stage or commit any file. Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill`. The runner restarts Daphne itself after your turn.
- Only the local `app` environment is in scope; never `soft.farsalish.ir`, never `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush` or any `manage.py test`.

2. Task:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app backend'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Confirm nothing is left to migrate: `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. Report any `[ ]` line; do not migrate.

3. Tool policy: only these two commands and `git status --short`. If a command fails, read the output, do not repeat it unchanged.

4. Output and stop condition: a short English report with the backup filename and size and the `showmigrations` result. No commit. End the turn after the report.

===

[DONE] Session 24 — Item writes: a create retry by sync_id returns the existing item unchanged, and every item create or update must target a warehouse inside the user's scope

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; v=pathlib.Path('warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py').read_text(encoding='utf-8'); s=v.find('class ItemViewSet'); c=v.find('    def create(', s); body=v[c:v.find('    def perform_create', c)] if c>0 else ''; pc=v.find('    def perform_create', s); pcb=v[pc:pc+2500]; pu=v.find('    def perform_update', s); pub=v[pu:pu+1500]; ok={'retry_no_save':'perform_create' not in body and '.save(' not in body and 'is_valid' not in body,'retry_200':'HTTP_200_OK' in body,'helper':'def _ensure_target_warehouse_in_scope' in v,'create_checks':'_ensure_target_warehouse_in_scope' in pcb,'update_checks':'_ensure_target_warehouse_in_scope' in pub,'helper_tenant':'scope_tenant_queryset' in v[v.find('def _ensure_target_warehouse_in_scope'):][:1500],'helper_wh':'can_access_warehouse' in v[v.find('def _ensure_target_warehouse_in_scope'):][:1500]}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py','warehouse-backend/modules/warehouse/inventory/tests_offline_system.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels accounts inventory warehouses --known scratch/runner-cache/known_empty.txt --min-tests 139
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(inventory): no-op sync_id retry and target warehouse scope on item writes"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may be lost: a retried create must never overwrite, revive or move an existing item.
- Tenant isolation: a user may never create an item in, or move an item into, a warehouse outside their company and warehouse scope.
- Change only `warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py` and `warehouse-backend/modules/warehouse/inventory/tests_offline_system.py`. No models, serializers, migrations or other files.
- Do not push. Stage only the two files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Commit `2a63d96` added `ItemViewSet.create`: for a POST whose `sync_id` matches an existing in-scope item it validates `ItemSerializer(instance=existing, data=request.data)` and calls `perform_create`, whose idempotent branch saves the body onto the item with `is_deleted=False`. A review found:
  - A stale offline retry overwrites newer edits by other users, revives a soft-deleted item, skips the `base_updated_at` conflict check of `update`, and writes no audit event.
  - The body's `warehouse` is never checked, so the retry can move an in-scope item into another company's warehouse.
- The same gap exists on normal writes: `perform_create` and `perform_update` never check that `serializer.validated_data['warehouse']` is inside the user's scope. The serializer field accepts any warehouse id.
- Scope helpers: `can_access_warehouse(user, warehouse_id)` from `common.warehouse_scope` (already imported in this file) and `scope_tenant_queryset(queryset, user, company_field=..., request=...)` from `common.tenant_scope`. `can_access_warehouse` returns True for users with no warehouse restriction, so the company check is needed as well.

3. Definitions: "target warehouse in scope" means `can_access_warehouse(request.user, warehouse.id)` is true AND `scope_tenant_queryset(Warehouse.objects.filter(pk=warehouse.pk), request.user, company_field='company_id', request=request).exists()` is true.

4. Task:
- a) In `ItemViewSet.create`, keep the lookup by `sync_id` in `Item.all_objects` and the out-of-scope 403. When the existing item is in scope, do not validate or save the body: return `Response(self.get_serializer(existing).data, status=200)` unchanged. Remove the serializer validation and the `perform_create` call from this branch.
- b) Add a method `_ensure_target_warehouse_in_scope(self, warehouse)` on `ItemViewSet` that raises `rest_framework.exceptions.PermissionDenied` with «دسترسی غیرمجاز: انبار انتخاب‌شده خارج از محدودهٔ مجاز شماست.» when the warehouse is not in scope (a `None` warehouse passes only if `can_access_warehouse(request.user, None)` is true). Import `Warehouse` locally inside the method (`from warehouses.models import Warehouse`).
- c) Call it at the start of `perform_create` with `serializer.validated_data.get('warehouse')`, and at the start of `perform_update` when `'warehouse' in serializer.validated_data`. Change nothing else in these methods.
- d) Tests in `tests_offline_system.py` (keep all existing tests):
  - A retry with the same `sync_id` but a different `description` returns 200 with the same id, and the stored description is still the first one.
  - A retry for a soft-deleted item returns 200 and the item stays soft-deleted.
  - A scoped non-superuser cannot POST a new item into a warehouse of another company (403, no item created), and cannot PATCH an own item's `warehouse` to that warehouse (403, warehouse unchanged).
  - `test_idempotent_creation_with_sync_id` must still pass unchanged.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test inventory.tests_offline_system --noinput` and at most one run of `.\venv\Scripts\python.exe manage.py test accounts inventory warehouses --noinput`. If a command fails, read the output, do not repeat it unchanged, and change approach. If an existing test fails because it relied on writing into an out-of-scope warehouse, report it; do not weaken the new check.

6. Before finishing: `git diff --stat` shows only the two files.

7. Output and stop condition:
- Stage only the two files and commit with this message, without push:
fix(inventory): no-op sync_id retry and target warehouse scope on item writes
- Short English report: the change, the commands you actually ran with pass/fail counts, and remaining doubts. End the turn after the commit and report.

===

[DONE] Session 25 — Backend release on the local app environment after the item write fix: backup, Daphne restart by the runner, health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check --backend-only
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Do not edit, create, stage or commit any file. Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill`. The runner restarts Daphne itself after your turn.
- Only the local `app` environment is in scope; never `soft.farsalish.ir`, never `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush` or any `manage.py test`.

2. Task:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app backend'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Confirm nothing is left to migrate: `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. Report any `[ ]` line; do not migrate.

3. Tool policy: only these two commands and `git status --short`. If a command fails, read the output, do not repeat it unchanged.

4. Output and stop condition: a short English report with the backup filename and size and the `showmigrations` result. No commit. End the turn after the report.

===

[DONE] Session 26 — Company scope on every ItemViewSet write path: bulk_update protected fields, Excel import, clear and delete by Excel, import cancel and revert

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; v=pathlib.Path('warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py').read_text(encoding='utf-8'); s=v.find('class ItemViewSet'); cls=v[s:]; calls=[m.start() for m in re.finditer(r'can_access_warehouse\(', cls)]; helper=cls.find('def _can_write_warehouse'); hb=cls[helper:helper+1500] if helper>0 else ''; outside=[c for c in calls if not (helper>0 and helper<=c<helper+1500)]; bu=cls[cls.find('    def bulk_update'):][:6000]; imp=cls[cls.find('    def import_excel'):][:20000]; ok={'helper_allowed_ids':'def _allowed_warehouse_ids' in cls,'helper_write':helper>0,'helper_tenant':'scope_tenant_queryset' in cls[cls.find('def _allowed_warehouse_ids'):][:2000],'no_direct_checks':not outside,'bulk_protected':'BULK_UPDATE_PROTECTED_FIELDS' in bu and 'is_deleted' in v[v.find('BULK_UPDATE_PROTECTED_FIELDS ='):][:300],'import_name_lookup_scoped':'Warehouse.objects.filter(Q(name__iexact' not in imp}; print(ok,'direct can_access_warehouse calls outside helper:',len(outside)); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py','warehouse-backend/modules/warehouse/inventory/tests_offline_system.py','warehouse-backend/modules/warehouse/inventory/tests_item_write_scope.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels accounts inventory warehouses --known scripts/automation/known_backend_failures.txt --min-tests 180
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(inventory): company scope on all item write paths"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Tenant isolation: a user may never write, import into, soft-delete, cancel or revert anything in a warehouse outside their company and warehouse scope. No data may be lost: do not change what a permitted user can do inside their own scope.
- Change only `warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py`, plus tests in `warehouse-backend/modules/warehouse/inventory/tests_offline_system.py` or a new file `warehouse-backend/modules/warehouse/inventory/tests_item_write_scope.py`. No models, serializers, migrations or other files.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- `can_access_warehouse(user, warehouse_id)` in `core/common/warehouse_scope.py` only checks assigned warehouses and returns True for users without warehouse assignments (`user_warehouse_ids` returns None). It never checks the company. So a company-A user without assignments can act on a company-B warehouse.
- `ItemViewSet` uses it alone in `cancel_import`, `import_excel` (top-level `warehouse_id`, per-row target warehouse, existing item by id), `revert_import`, `clear_warehouse_data`, the import-log action that calls it with `warehouse_id_val` before listing `ImportLog`, and `delete_from_excel`. Commit `59d5e3d` added `_ensure_target_warehouse_in_scope` (company + warehouse check) for create and update only.
- `import_excel` resolves a warehouse name from a row with the unscoped `Warehouse.objects.filter(Q(name__iexact=...) | Q(code__iexact=...)).first()`, which can pick a same-named warehouse of another company. Its work runs in a background thread that streams the response, so request-scoped caches may be gone inside the worker.
- `bulk_update` applies every key of `Item._meta.fields` from the body, including `warehouse` (moves the item anywhere), `created_by`, `modified_by`, `sync_id` and `is_deleted` (soft-delete or revive without the delete/restore paths).

3. Definitions: "allowed warehouse ids" means the ids of `scope_tenant_queryset(Warehouse.objects.all(), user, company_field='company_id', request=request)`, further limited to `user_warehouse_ids(user)` when that is not None.

4. Task:
- a) Add `_allowed_warehouse_ids(self)` on `ItemViewSet` that computes the allowed warehouse ids once per request (cache it on `self`) and returns a `set` of ints. Add `_can_write_warehouse(self, warehouse_id)`: for `None` return `can_access_warehouse(self.request.user, None)`; otherwise return whether `int(warehouse_id)` is in the allowed set (invalid ids return False). Make `_ensure_target_warehouse_in_scope` use `_can_write_warehouse` and keep its message.
- b) Replace every direct `can_access_warehouse(...)` call inside `ItemViewSet` with `self._can_write_warehouse(...)` (same argument), keeping each branch's current response and message. The only remaining direct call may be inside `_can_write_warehouse`.
- c) `import_excel`: call `self._allowed_warehouse_ids()` in the request thread before the worker starts, and inside the worker use only that precomputed set (no request-scoped call). Resolve a row warehouse name or code with `Warehouse.objects.filter(id__in=<allowed set>).filter(Q(name__iexact=...) | Q(code__iexact=...)).first()`; a name that matches no allowed warehouse is the same row error as an unknown name.
- d) `bulk_update`: add a module-level constant `BULK_UPDATE_PROTECTED_FIELDS = {'id', 'warehouse', 'created_by', 'modified_by', 'created_at', 'updated_at', 'sync_id', 'is_deleted'}` and skip these keys in the apply loop (ignore them silently, so rows that echo unchanged values keep working). Keep the existing field-permission validation as it is.
- e) Tests (Django `TestCase`, two companies each with one warehouse, a non-superuser with `workspace_full` access to company A only and no warehouse assignment, and the permissions each action needs, created with `Permission.objects.get_or_create` on the user content type): for company B's warehouse, `clear_warehouse_data` and `delete_from_excel` (if it needs a file, build a small xlsx with openpyxl in memory) return 403 and soft-delete nothing; `import_excel` with company B's `warehouse_id` returns 403; `bulk_update` with `warehouse` set to company B's warehouse leaves the item's warehouse unchanged, and with `is_deleted: true` leaves the item active; the same user can still `clear_warehouse_data` in company A's warehouse.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most four runs of targeted `manage.py test inventory.<module> --noinput` and at most one run of `.\venv\Scripts\python.exe manage.py test accounts inventory warehouses --noinput`. If a command fails, read the output, do not repeat it unchanged, and change approach. If an existing test fails because it relied on writing outside the user's company, report it; do not weaken the check.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Stage only your changed files and commit with this message, without push:
fix(inventory): company scope on all item write paths
- Short English report: each replaced check, the bulk_update change, the tests added, the commands you actually ran with pass/fail counts, and remaining doubts. End the turn after the commit and report.

===

[DONE] Session 27 — Backend release on the local app environment after the item write scope fix: backup, Daphne restart by the runner, health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check --backend-only
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Do not edit, create, stage or commit any file. Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill`. The runner restarts Daphne itself after your turn.
- Only the local `app` environment is in scope; never `soft.farsalish.ir`, never `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush` or any `manage.py test`.

2. Task:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app backend'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Confirm nothing is left to migrate: `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. Report any `[ ]` line; do not migrate.

3. Tool policy: only these two commands and `git status --short`. If a command fails, read the output, do not repeat it unchanged.

4. Output and stop condition: a short English report with the backup filename and size and the `showmigrations` result. No commit. End the turn after the report.

===

[DONE] Session 28 — Import logs and bulk_assign assignees scoped to the user's company: null-warehouse logs, cancel of a running import, no cross-company warehouse name leak, assignees from the item's company only

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; v=pathlib.Path('warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py').read_text(encoding='utf-8'); cls=v[v.find('class ItemViewSet'):]; h=cls.find('def _can_manage_import_log'); ci=cls[cls.find('    def cancel_import'):][:2500]; ri=cls[cls.find('    def revert_import'):][:2500]; dl=cls[cls.find('    def download_import_log'):][:2500]; ba=cls[cls.find('    def bulk_assign'):][:9000]; ok={'helper':h>0,'cancel_uses_helper':'_can_manage_import_log' in ci,'cancel_owner_cache':'import_owner_' in ci and 'import_owner_' in cls[cls.find('    def import_excel'):],'revert_uses_helper':'_can_manage_import_log' in ri,'download_uses_helper':'_can_manage_import_log' in dl,'no_conflicting_wh_leak':'conflicting_wh' not in cls,'assignee_company_check':'get_user_allowed_companies' in ba}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py','warehouse-backend/modules/warehouse/inventory/tests_item_write_scope.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels accounts inventory warehouses --known scripts/automation/known_backend_failures.txt --min-tests 189
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(inventory): company scope for import logs and bulk_assign assignees"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Tenant isolation: a user may never cancel, revert or download another company's import, learn another company's warehouse names, or assign another company's user to tasks. Do not change what a permitted user can do inside their own company.
- Change only `warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py` and `warehouse-backend/modules/warehouse/inventory/tests_item_write_scope.py`. No models, serializers, migrations or other files.
- Do not push. Stage only the two files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context (all in `ItemViewSet`, commit `8589eee` added `_allowed_warehouse_ids` and `_can_write_warehouse`):
- `_can_write_warehouse(None)` only asks whether the user is unrestricted. An `ImportLog` with `warehouse_id=None` (an import without `warehouse_id` that updates rows by item id) therefore passes this check for any unrestricted user of any company in `cancel_import`, `download_import_log` and `revert_import`. `revert_import` then rewrites or soft-deletes that log's items.
- `ImportLog` is created only at the end of the import worker. While an import runs there is no log, so `cancel_import` sets `cancel_import_<id>` in the cache for anyone.
- In `import_excel`, when a row warehouse is not in the allowed set and `warehouse_id` is given, the code runs an unscoped `Warehouse.objects.filter(name__iexact=...)` / `filter(code__iexact=...)` into `conflicting_wh` and puts `conflicting_wh.name` into the error. This reveals other companies' warehouse names.
- `bulk_assign` resolves `field_assignee`, `supervisor_assignee`, `manager_assignee`, `doc_assignee`, `doc_supervisor_assignee` and `doc_manager_assignee` with `_get_user_or_none` (unscoped `User.objects.get`), so a user of another company can be made counter or manager of this company's items.
- `get_user_allowed_companies(user)` in `core/companies/access.py` returns the companies a user may work in (superuser: all active).

3. Definitions: "manage an import log" means: the request user is a superuser; or the log's `warehouse_id` is None and `log.imported_by_id == request.user.id`; or the log's `warehouse_id` is not None and `self._can_write_warehouse(log.warehouse_id)` is true.

4. Task:
- a) Add `_can_manage_import_log(self, import_log)` implementing the definition. Use it in `revert_import` and `cancel_import` instead of `_can_write_warehouse(import_log.warehouse_id)`. In `download_import_log` keep the owner rule and replace the warehouse part with the helper (superuser or owner or helper).
- b) In `import_excel`, in the request thread before the worker starts, store `cache.set(f"import_owner_{import_id}", request.user.id, timeout=3600)` when `import_id` is present. In `cancel_import`, when no `ImportLog` exists yet, allow the cancel only for a superuser or when that cache value equals `request.user.id`; otherwise 403 with «شما دسترسی لازم برای لغو این فرآیند را ندارید.».
- c) In `import_excel`, delete the `conflicting_wh` block; a row warehouse outside the allowed set gets the existing generic «انبار با نام یا کد ... یافت نشد.» row error.
- d) In `bulk_assign`, after resolving the items, reject the request with 400 «کاربر انتخاب‌شده عضو شرکت این کالاها نیست.» when any given assignee is not a superuser and `get_user_allowed_companies(assignee)` does not contain the company of every selected item's warehouse (items whose warehouse has no company are checked only against the assignee being active). Check before any write.
- e) Tests in `tests_item_write_scope.py` (reuse its two-company setup): another company's unrestricted user cannot revert, cancel or download a null-warehouse import log of the first user (403, items unchanged); cancel of a running import with no log works for the owner and is 403 for another user; an import row naming company B's warehouse code returns the generic not-found row error and the response body does not contain company B's warehouse name; `bulk_assign` with a company-B user as `field_assignee` on company-A items returns 400 and creates no `CountTask`; a company-A assignee still works.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most four runs of `.\venv\Scripts\python.exe manage.py test inventory.tests_item_write_scope --noinput` and at most one run of `.\venv\Scripts\python.exe manage.py test accounts inventory warehouses --noinput`. If a command fails, read the output, do not repeat it unchanged, and change approach. If an existing test fails because it relied on cross-company behaviour, report it; do not weaken the check.

6. Before finishing: `git diff --stat` shows only the two files.

7. Output and stop condition:
- Stage only the two files and commit with this message, without push:
fix(inventory): company scope for import logs and bulk_assign assignees
- Short English report: each change, the tests added, the commands you actually ran with pass/fail counts, and remaining doubts. End the turn after the commit and report.

===

Session 29 — Backend release on the local app environment after the import-log scope fix: backup, Daphne restart by the runner, health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check --backend-only
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Do not edit, create, stage or commit any file. Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill`. The runner restarts Daphne itself after your turn.
- Only the local `app` environment is in scope; never `soft.farsalish.ir`, never `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush` or any `manage.py test`.

2. Task:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app backend'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Confirm nothing is left to migrate: `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. Report any `[ ]` line; do not migrate.

3. Tool policy: only these two commands and `git status --short`. If a command fails, read the output, do not repeat it unchanged.

4. Output and stop condition: a short English report with the backup filename and size and the `showmigrations` result. No commit. End the turn after the report.
