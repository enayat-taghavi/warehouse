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

نشست 13 از 13 — ماژولارسازی عمیق: یک نمونهٔ واحد ModuleRegistryService برای DI و دسترسی ایستا و رفع NG0203 در SyncPullService.getInstance

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
