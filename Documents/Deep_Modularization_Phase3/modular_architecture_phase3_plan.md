<div dir="rtl" align="right">

# طرح فاز ۳ ماژولارسازی عمیق — نسخهٔ ۲ (بازبینی‌شده با کد واقعی)

**مبنا:** کامیت `303dbe8` روی `main`، بازبینی ۲۵ مهر ۱۴۰۵ (۱۶ اکتبر ۲۰۲۶).
**نسخهٔ ۱:** در `scratch/plans/modular_architecture_phase3_plan.v1.md` نگه داشته شده است.

## ۰. تفاوت با نسخهٔ ۱

| مورد | نسخهٔ ۱ | ایراد | نسخهٔ ۲ |
| :--- | :--- | :--- | :--- |
| نگهبان‌ها | ادعا می‌کرد فقط نگهبان ۲۹ و ۵۷ وجود دارند. | نگهبان‌های ۳۰ تا ۵۷ و `guardian_all.py` همه هستند. | خطوط verify با نگهبان‌هایی ساخته شدند که روی HEAD سبزند (بخش ۱). |
| وب‌سوکت | `operations` را به گروه `app_operations` می‌برد. | تب عملیات امروز در هیچ گروهی نیست و همهٔ رویدادها را می‌گیرد. با این تغییر، فید زندهٔ کاکپیت قطع می‌شد. | `operations` و کدهای ناشناخته مثل امروز `None` می‌مانند. |
| کلاس‌های Permission | انتقال با `__getattr__` به سبک PEP 562 در هسته. | فقط ۶ فایل این کلاس‌ها را import می‌کنند. ثبت در `ready()` به ترتیب بارگذاری اپ‌ها وابسته می‌شد. | import همان ۶ فایل مستقیم به فایل جدید ماژول اصلاح می‌شود. هسته هیچ شیمی ندارد. |
| استنتاج مسیر SoD | هر resolver با `page_route` خودش `action_code` را می‌ساخت. | منطق امروز با `page_route` نهایی کار می‌کند (پس از پیش‌فرض `/attendance`)، و ترتیب قاعده‌ها به ترتیب اپ‌ها وابسته می‌شد. | دو مرحله: اول تست مشخصه‌نگار روی کد فعلی، بعد انتقال قاعده‌ها با اولویت عددی صریح. |
| مانع حذف شرکت | ثبت در `ready()` بدون تست. | شکست بی‌صدای ثبت یعنی حذف شرکت همراه با داده‌هایش. | ترتیب صریح، ثبت بیرون از `try`، و تست یکپارچه‌ای که هر ۶ مانع و رد شدن حذف را بسنجد. |
| آدرس‌های شرکت | فالبک `/org/company-...` | این آدرس‌ها در بک‌اند وجود ندارند (`core/companies/urls.py` فقط `companies` و `user-company-access` دارد). | بدون فالبک ساختگی. اگر ماژول نصب نباشد، خطای روشن برمی‌گردد. تب‌ها از قبل با `isAccountingInstalled` پنهان‌اند. |
| ورود و پرسونا (گام‌های ۵ و ۶ نسخهٔ ۱) | انتقال به مانیفست ماژول‌ها. | `permissionMarkers` ماژول‌ها از فهرست‌های `login.ts` بزرگ‌ترند و مقصد ورود کاربران عوض می‌شد. `ALL_APP_ROLES` به عکسی ثابت از کش localStorage تبدیل می‌شد. کامنتی در `auth.guard.ts` فقط برای سبز ماندن یک نگهبان نگه داشته می‌شد. | **معوق** (بخش ۴)، با پیش‌نیاز تست مشخصه‌نگار. |
| `ws_routes` در `asgi.py` | حلقهٔ بارگذاری پویا. | هیچ ماژولی `ws_routes` ندارد و این کد فعلاً بی‌اثر است. | معوق تا وقتی ماژولی واقعاً به آن نیاز پیدا کند. |
| حصار معنایی | regex فرانت آدرس‌های دارای `?` را نمی‌گرفت (`offline-sync.service.ts:625`). شمارندهٔ بک‌اند فقط `personnel` را می‌شمرد. | حصار سوراخ داشت. | regex هر literal شامل `/personnel/` یا `/inventory/` را می‌گیرد. شمارندهٔ بک‌اند هر سه اپ ماژولی را می‌شمرد و با قانون «افزایش ممنوع» قفل می‌شود. |
| بازبینی | هیچ بازبینی پیش‌بینی نشده بود. | — | بازبین‌های لازم هر نشست در بخش ۵ آمده‌اند. |

**اصلاح یک نکته از بازبینی شفاهی:** `SoDPolicyPermission` امروز به هیچ ویوی زنده‌ای وصل نیست و در `DEFAULT_PERMISSION_CLASSES` هم نیست. فقط `phase_guardian_approval.py` آن را صدا می‌زند. پس خطر دور زدن SoD در نسخهٔ ۱ نظری بود، نه عملیاتی. با این حال تست مشخصه‌نگار نگه داشته شد تا اگر روزی این کلاس به ویویی وصل شد، رفتارش همان رفتار امروز باشد.

## ۱. وضعیت پایه روی HEAD (`303dbe8`)

| نگهبان | نتیجه | استفاده در verify |
| :--- | :---: | :--- |
| ۲۹ `guardian_modularization.py` | سبز | نشست‌های بک‌اند و نشست ۹ |
| ۳۱ `guardian_31_install_profiles.py` | سبز | نشست‌های بک‌اند |
| ۳۳ `guardian_33_bundle_isolation.py` | **قرمز** (۲ خطای ازپیش‌موجود) | استفاده نمی‌شود |
| ۳۴ `guardian_34_offline_continuity.py` | سبز | نشست ۶ |
| ۳۵ `guardian_35_route_matching.py` | **قرمز** (ازپیش‌موجود) | استفاده نمی‌شود |
| ۵۲، ۵۵، ۵۶ | سبز | همهٔ نشست‌های فرانت |
| ۵۴ `guardian_54_module_independence.py` | سبز | نشست‌های بک‌اند |
| ۵۷ `guardian_57_front_module_fence.py` | سبز | همهٔ نشست‌های فرانت و نشست ۹ |

**دیگر واقعیت‌های بررسی‌شده:**
- **کلید `scopes` توکن:** نه فرانت آن را می‌خواند و نه بک‌اند؛ فقط نوشته می‌شود. با این حال کلیدهای `finance` و `warehouse` عیناً حفظ می‌شوند.
- **کلاس‌های Permission منتقل‌شونده:** فقط این ۶ فایل import‌شان می‌کنند (دو فایل `views_domains` را Antigravity در بازبینی پیدا کرد):
  - `personnel/cartable_views.py` (۷ کلاس مالی)
  - `personnel/phase_guardian_approval.py` (۹ کلاس مالی)
  - `personnel/views_domains/hr_views.py:17` (`CanApprovePersonnelManager` و `CanApprovePersonnelFinance`)
  - `personnel/views_domains/fleet_views.py:18` (`CanApproveFleetManager` و `CanApproveFleetFinance`)
  - `inventory/views_photos.py:33` (`CanManageItemPhotos`)
  - `inventory/views_domains/item_views.py:357` (`CanManageItemPhotos`)

  `CanApproveDocuments`، `CanApproveFeeds` و `CanFinalizeInventory` هیچ مصرف‌کننده‌ای ندارند.
- **related_name مانع‌های حذف شرکت:** `warehouses` در `warehouses/models.py`، و بقیه در مدل‌های `personnel`.
- **تب‌های شرکت:** تب‌های مالی شرکت (اسناد، حساب بانکی، هیئت‌مدیره و گوگل‌درایو) در `companies.ts:661-676` با `isAccountingInstalled` پنهان می‌شوند.
- **ایمنی import رجیستری:** `sync-pull.service.ts` همین حالا با `getModuleRegistry()` از `syncConfig` می‌خواند. پس import رجیستری در سرویس‌های آفلاین هسته سابقه دارد و ایمن است.

## ۲. اصول این فاز

1. **رفتار برابر:** هر جابه‌جایی باید خروجی امروز را عیناً حفظ کند. هر جا رفتار در خطر است، اول تست مشخصه‌نگار روی کد فعلی نوشته می‌شود و بعد کد منتقل می‌شود.
2. **ایمنی داده بر پاکی معماری مقدم است:** فالبک‌هایی که صف آفلاین را زنده نگه می‌دارند (مثلاً هدرهای `buildScopedHeaders`) حتی اگر نام ماژول داشته باشند، می‌مانند.
3. **فالبک ساختگی ممنوع:** هیچ آدرس API‌ای که در بک‌اند وجود ندارد، به‌عنوان جایگزین نوشته نمی‌شود.
4. **دور زدن نگهبان ممنوع:** اگر نگهبانی متنی قدیمی را چک می‌کند، خود نگهبان به‌روز می‌شود. کامنت یا کد ساختگی برای سبز ماندن آن گذاشته نمی‌شود.
5. **یک نشست، یک حوزه:** هر نشست فقط فایل‌های فهرست‌شدهٔ خودش را تغییر می‌دهد و خط verify محدودهٔ تغییرها را می‌سنجد.

## ۳. گام‌ها

### گام ۱ — scope توکن و نرمال‌سازی قلمرو وب‌سوکت (بک‌اند)

- **توابع جدید رجیستری:** سه تابع به بخش «پل سازگاری» در `core/platform_core/registry.py` اضافه می‌شوند:
  - `build_user_token_scopes(user)`: روی **همهٔ** کلیدهای `MODULE_CATALOG` (نه فقط ماژول‌های نصب‌شده) می‌چرخد و `scopes[module_allowed_app_code(code)] = get_user_valid_roles_for_app(user, code)` می‌سازد. نتیجه همان دو کلید `finance` و `warehouse` امروز است، حتی در پروفایل تک‌ماژولی.
  - `resolve_default_active_app(allowed_apps)`: اولویت امروز عیناً حفظ می‌شود. اگر فقط `finance` مجاز باشد، `finance`؛ اگر `warehouse` مجاز باشد، `warehouse`؛ در غیر این صورت `finance`.
  - `normalize_ws_app_scope(code)`: برای کدی که `app_code_to_module` آن را می‌شناسد، `module_allowed_app_code` را برمی‌گرداند و برای بقیه `None` (از جمله `operations` و `None`). مقایسه مثل امروز حساس به حروف و بدون `strip` است.
- **جایگزینی کد دستی:** سه محل ساخت دستی scope این توابع را صدا می‌زنند: `serializers.py:617`، `serializers.py:743` و `auth_views.py:128`. در `consumers.py` هم سه محل (`connect`، `switch_app` و `send_notification`) از `normalize_ws_app_scope` استفاده می‌کنند. در `send_notification`، عبارت `normalize_ws_app_scope(event_app) or event_app` همان رفتار امروز را می‌دهد.
- **تست:** در `platform_core/tests.py` جدول ورودی و خروجی هر سه تابع نوشته می‌شود، از جمله این‌که `operations` نتیجهٔ `None` بدهد.
- **فایل‌ها:** `registry.py`، `platform_core/tests.py`، `serializers.py`، `auth_views.py` و `consumers.py`.

### گام ۲ — تست مشخصه‌نگار SoD (بک‌اند، بازسازی خالص)

- **استخراج تابع:** در `core/accounts/permissions.py`، استنتاج `page_route` و `action_code` بدون هیچ تغییر منطقی به تابع سطح ماژول `resolve_sod_context(request, view) -> tuple[str, str]` منتقل می‌شود و `has_permission` آن را صدا می‌زند.
- **تست جدولی:** `integration_tests/test_sod_context_resolution.py` با دست‌کم ۱۴ مورد نوشته می‌شود. ورودی‌ها `SimpleNamespace(path, method, data)` و ویو با `action` هستند. موردها شامل این‌ها است: مسیر پیش‌فرض `/attendance` همراه با `create` و `approve_period`، اولویت `manager` بر `customs`، اولویت `profiles` بر `finance`، قاعدهٔ `wage`، `action=None`، و اولویت `sod_page_route` و `sod_action_code` روی خود ویو.
- **فایل‌ها:** `permissions.py` و فایل تست جدید.

### گام ۳ — انتقال کلاس‌های Permission و قاعده‌های SoD به ماژول‌ها (بک‌اند)

- **کلاس‌ها:**
  - ۹ کلاس مالی به انتهای `personnel/permissions.py` (فایل موجود) منتقل می‌شوند.
  - ۴ کلاس انبار به فایل جدید `inventory/permissions.py` منتقل می‌شوند.
  - import در ۶ فایل مصرف‌کننده مستقیم به فایل جدید تغییر می‌کند.
  - هیچ `__getattr__` یا شیمی در هسته ساخته نمی‌شود.
- **قاعده‌های مسیر:** هر قاعده با `contribute('sod_route_rules', (priority, keywords, route))` ثبت می‌شود.
  - حسابداری، در `personnel/sod_rules.py` و ثبت در `PersonnelConfig.ready()`: `attendance` با اولویت ۱۰، `profiles` با ۲۰، `finance` و `monthly-payroll` با ۳۰، `treasury` با ۴۰ و `manager` با ۵۰.
  - انبار، در `warehouses/sod_rules.py` و ثبت در `WarehousesConfig.ready()`: `customs` با اولویت ۶۰.
  - هسته قاعده‌ها را بر اساس اولویت مرتب می‌کند و اولین تطبیق را برمی‌دارد. اگر هیچ قاعده‌ای تطبیق نداشت، پیش‌فرض `'/attendance'` در هسته می‌ماند تا رفتار نصب تک‌ماژولی عوض نشود.
- **قاعده‌های عملیات:** حسابداری `contribute('sod_action_resolvers', fn)` ثبت می‌کند.
  - امضای تابع: `fn(request, view, action_name, method, page_route) -> str | None`. هر پنج قاعدهٔ امروز را با همان ترتیب دارد و `page_route` **نهایی** را می‌گیرد.
  - هسته اولین مقدار غیر `None` را برمی‌دارد. اگر هیچ resolverی مقداری نداد، `action_name or method.lower()` به کار می‌رود.
- **تغییر نگهبان قدیمی:** `phase_guardian_approval.py` کلاس‌ها را از `personnel.permissions` import می‌کند.
- **قید:** فایل تست گام ۲ نباید هیچ تغییری کند و باید همچنان سبز بماند.

### گام ۴ — مانع حذف شرکت، مجوز نوشتن ساختار و پرس‌وجوهای `UserViewSet` (بک‌اند، حساس به داده و قلمرو)

- **مانع‌های حذف:** با `contribute('company_delete_blockers', (order, related_name, message))` ثبت می‌شوند. ترتیب‌ها همان ترتیب تاپل امروز است: `projects` ۱۰، `warehouses` ۲۰، `personnel_profiles` ۳۰، `monthly_work_periods` ۴۰، `counterparties` ۵۰ و `fiscal_periods` ۶۰. پیام‌های فارسی عیناً همان پیام‌های امروز هستند.
  - هسته در `perform_destroy` مانع‌ها را بر اساس `order` مرتب می‌کند و منطق `hasattr` و `.exists()` را نگه می‌دارد.
  - **قید ایمنی:** فراخوانی‌های `contribute` برای این نقطه‌ها نباید داخل هیچ `try` باشند.
- **مجوز نوشتن ساختار:** `has_structure_write_permission` فهرست پایهٔ پلتفرم را به‌علاوهٔ `contributions('org_structure_write_perms')` بررسی می‌کند. حسابداری `'accounts.perm_approve_personnel_manager'` را ثبت می‌کند.
- **`UserViewSet`:**
  - `get_queryset` فیلد `user_prefetch_related` را از `contributions('user_extensions')` می‌خواند و `WarehouseUserExtension` مقدار `('assigned_warehouses',)` را تعریف می‌کند.
  - `_org_admin_directory_queryset` روی `contributions('company_member_q_builders')` می‌چرخد. حسابداری `build_section_member_q(allowed_cids)` را در `personnel/company_access.py` تعریف و ثبت می‌کند و همان `Q` امروز را برمی‌گرداند.
- **تست:** `integration_tests/test_company_extension_points.py` این‌ها را می‌سنجد:
  - هر ۶ مانع با همین ترتیب و همین پیام‌ها ثبت شده‌اند.
  - حذف شرکتی که انبار دارد ۴۰۰ می‌دهد و شرکت باقی می‌ماند.
  - حذف شرکتی که پروژه دارد هم ۴۰۰ می‌دهد.
  - کاربری که فقط `perm_approve_personnel_manager` دارد، اجازهٔ نوشتن ساختار دارد.
  - عضو بخشِ پروژه‌های شرکت در فهرست کاربران مدیر سازمان دیده می‌شود و عضو شرکت دیگر دیده نمی‌شود.

### گام ۵ — آدرس‌های شرکت و گوگل‌درایو در فرانت

- **قرارداد ماژول:** در `module-contract.ts` این فیلدها به `companyApiEndpoints` اضافه می‌شوند: `documentsEndpoint`، `bankAccountsEndpoint`، `boardMembersEndpoint`، `fiscalPeriodsEndpoint` (مصرف‌کننده: `getFiscalPeriods` در `company-api.service.ts:207`) و `companyGdriveBaseEndpoint(companyId)`. `accounting/module.ts` مقدار این فیلدها را می‌دهد.
- **`CompanyApiService`:** آدرس‌ها را از افزونهٔ ماژول می‌خواند. اگر افزونه نباشد، متد `throwError(() => new Error('accounting-module-not-installed'))` برمی‌گرداند و هیچ آدرس جایگزینی نمی‌سازد. دو متد هم اضافه می‌شود:
  - `getCompanyGdriveUrl(companyId, subPath)`
  - `matchesCompanyUrl(url, kind)`، که `/org/companies/` را مثل امروز می‌پذیرد.
- **مصرف‌کننده‌ها:**
  - `companies.ts` از `matchesCompanyUrl` استفاده می‌کند.
  - `company-gdrive-tab.ts` (۹ محل) و `settings-backup-tab.ts:599` از `getCompanyGdriveUrl` استفاده می‌کنند.
- **تست:** `company-api-endpoints.spec.ts` گسترش پیدا می‌کند.

### گام ۶ — هدرهای صف آفلاین، probe همگام‌سازی عمیق و تشخیص قلمرو تب (فرانت، حساس به داده)

- **`syncConfig`:** فیلدهای اختیاری `activeAppHeader`، `defaultOfflineRole` و `tokenScopeKey` به آن اضافه می‌شوند.
  - انبار: `'warehouse'`، `'counter'` و `'warehouse'`.
  - حسابداری: `'personnel'`، `'operator'` و `'finance'`.
- **`buildScopedHeaders`:** این مقادیر را از `syncConfig` می‌خواند و **فالبک امروز را عیناً نگه می‌دارد**. صف آفلاینِ قلمرویی که ماژولش در کش نیست، باید همچنان هدر درست بگیرد. تست مشخصه‌نگار به `offline-queue-runner.spec.ts` اضافه می‌شود و هر دو قلمرو را با رجیستری و بدون افزونه می‌سنجد.
- **probe در `offline-sync.service.ts:625`:** آدرس از `pullEndpoint` و `scopeParamKey` همان `syncConfig` ساخته می‌شود و URL نهایی عیناً همان URL امروز است. اگر `syncConfig` آن قلمرو نباشد، `[]` برمی‌گردد، مثل `SyncPullService.pull`. هیچ داده یا صفی پاک نمی‌شود.
- **`session-tab.service.ts`:** `getActiveApp()` پس از بررسی صریح `operations` روی `getInstalledModules()` می‌چرخد. شرط تطبیق `path.includes(mod.routePrefix)` است، مثل `includes` امروز، و مقدار برگشتی `extensions.launcherTile.appKey` است (`'warehouse'` یا `'personnel'`). تست جدید `session-tab.service.spec.ts` نوشته می‌شود.
- **قید:** `offline-db.ts` دست نمی‌خورد.

### گام ۷ — هندلرهای ناوبری اعلان‌ها (فرانت)

همان طرح گام ۸ نسخهٔ ۱، با سه تفاوت:
- منطق `fleet_change_request`، `VehicleDriverProfile` و `PersonnelProfile` به همراه چهار متد کمکی، بدون تغییر منطقی به `modules/accounting/notification-handlers.ts` منتقل می‌شود.
- context شامل `item`، `http`، `router`، `userPerms` و `isSuperuser` است.
- برای هندلرها تست جدید `notification-handlers.spec.ts` نوشته می‌شود: مقصد هر نقش و رفتار خطای HTTP.

### گام ۸ — انتقال مدل‌های تک‌ماژولی و حذف کد مرده (فرانت)

همان گام ۹ نسخهٔ ۱ است و بررسی شد که درست است:
- `personnel.model.ts` فقط در `modules/accounting` مصرف می‌شود.
- `count-task.model.ts` و `doc-task.model.ts` فقط در `modules/warehouse` و barrel `core/models/index.ts` مصرف می‌شوند.
- `record-http.service.ts` هیچ مصرف‌کننده‌ای ندارد.
- `item.model.ts` و `field-config.model.ts` در جای خود می‌مانند.

### گام ۹ — حصار معنایی در نگهبان‌های ۲۹ و ۵۷

- **نگهبان ۲۹:** شمارندهٔ `core_module_app_refs` اضافه می‌شود.
  - الگوهایی که می‌شمارد:
    - `apps.is_installed('<app>')`
    - `apps.get_model('<app>'`
    - `get_user_valid_roles_for_app(user, '<code>')`

    در اینجا `<app>` یکی از `personnel`، `warehouses` و `inventory` است و `<code>` یکی از `personnel` و `warehouse`.
  - محدوده: فایل‌های `.py` در `warehouse-backend/core/`، به‌جز تست‌ها و مایگریشن‌ها.
  - مقدار مورد انتظار پس از گام‌های ۱ و ۴: **۱۴**. این‌ها اتصال‌های نرم و مجاز `warehouses` هستند در `admin.py`، `accounts/models.py`، `audit_views.py`، `communications`، `reports/registry.py` و `settings_core`. قانون «افزایش ممنوع» آن‌ها را قفل می‌کند.
- **نگهبان ۵۷:** شمارندهٔ `core_hardcoded_module_api_paths` اضافه می‌شود.
  - regex: ``['"`][^'"`\n]*/(?:personnel|inventory)/`` در ناحیهٔ `core_common`.
  - مستثناها: فایل‌های spec، خطوط کامنت و خطوط `import`/`export … from`.
  - مقدار مورد انتظار پس از گام‌های ۵ تا ۷: **۰**.
  - خودآزمایی با یک literal دارای query string (`?project_id=`) انجام می‌شود.

## ۴. موارد معوق (خارج از این فاز)

| مورد | چرا معوق | پیش‌نیاز شروع |
| :--- | :--- | :--- |
| پرسونا در `app-persona.service.ts` (گام ۵ نسخهٔ ۱) | ریسک بالا و سود فقط برای ماژول سومی که هنوز وجود ندارد. `ALL_APP_ROLES` نباید به عکسی ثابت در لحظهٔ بارگذاری تبدیل شود. | تست مشخصه‌نگار `availableRoles` برای همهٔ نقش‌ها، و طراحی‌ای که فهرست نقش‌ها را در زمان اجرا از رجیستری بخواند. |
| `ROUTE_PERMISSIONS`، ریدایرکت‌های legacy و مقصد ورود (گام ۶ نسخهٔ ۱) | `permissionMarkers` ماژول‌ها با فهرست‌های `login.ts` برابر نیستند و مقصد ورود کاربران عوض می‌شد. | جدول مشخصه‌نگار مقصد ورود بر اساس مجوزها، و به‌روزرسانی بررسی `phase_guardian_approval.py:1376` تا `accounting/module.ts` را بخواند. |
| `ws_routes` در `asgi.py` | هیچ ماژولی آن را ندارد. | اولین ماژولی که مسیر وب‌سوکت اختصاصی لازم داشته باشد. |
| probe همگام‌سازی عمیق (`offline-sync.service.ts:630`) | هر پاسخ غیر ۲xx را «سرور در دسترس نیست» تفسیر می‌کند و از `isServerUnreachable()` استفاده نمی‌کند (خلاف قانون پروژه). این اشکال ازپیش‌موجود است و به ماژولارسازی ربطی ندارد. | تسک جداگانهٔ اصلاح باگ. |
| نگهبان‌های ۳۳ و ۳۵ | روی HEAD قرمزند (ازپیش‌موجود). | بررسی جداگانه. |

## ۵. روند اجرا و نظارت

- **مجری:** Antigravity صف را با `run_tasks.py` اجرا می‌کند. متن تسک‌ها در بخش ۶ است و Claude آن را پس از تأیید کاربر در `tasks.md` می‌گذارد.
- **بازبینی پس از هر نشست:** Claude پیش از شروع نشست بعد، diff همان نشست را بازبینی می‌کند:

| نشست | بازبین |
| :--- | :--- |
| ۱ | `tenant-scope-reviewer` (scope توکن و ایزولاسیون رویدادهای وب‌سوکت) |
| ۲ و ۳ | `tenant-scope-reviewer` |
| ۴ | `tenant-scope-reviewer` و `data-loss-reviewer` |
| ۵ | `data-loss-reviewer` (رویدادهای کش SWR در `companies.ts`) |
| ۶ | `data-loss-reviewer` |
| ۷ و ۸ | بازبینی diff توسط Claude |
| ۹ | اجرای `--self-test` و مقایسهٔ baseline |

  یافته‌های تأییدشده به‌صورت نشست اصلاحی به صف اضافه می‌شوند.
- **انتشار:** انتشار روی `app` پس از نشست ۹ و جدا از این صف است. انتشار روی `soft` تأیید صریح کاربر را لازم دارد.
- **گزارش پیشرفت:** در پایان هر نشست، بخش «گزارش پیشرفت» همین سند به‌روز می‌شود. این کار پس از پایان صف انجام می‌شود، چون ویرایش فایل‌های رهگیری‌شده در حین اجرای runner، `clean-tree` را می‌شکند.

## ۶. متن صف برای `tasks.md`

</div>

```markdown
Session 1 of 9 — Phase 3: registry helpers for JWT token scopes and WebSocket app-scope normalization (behavior unchanged)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; c=pathlib.Path('warehouse-backend/core'); s=(c/'accounts/serializers.py').read_text(encoding='utf-8'); av=(c/'accounts/views_domains/auth_views.py').read_text(encoding='utf-8'); nc=(c/'notifications/consumers.py').read_text(encoding='utf-8'); rg=(c/'platform_core/registry.py').read_text(encoding='utf-8'); q=chr(39); bad={'ser_hardcoded':'get_user_valid_roles_for_app(user, '+q+'personnel'+q in s,'auth_hardcoded':'get_user_valid_roles_for_app(user, '+q+'personnel'+q in av,'ws_hardcoded':q+'personnel'+q in nc,'helpers_missing':not all(f in rg for f in ('def build_user_token_scopes','def resolve_default_active_app','def normalize_ws_app_scope')),'ser_not_using_helper':s.count('build_user_token_scopes(user)')<2 or s.count('resolve_default_active_app(')<2,'auth_not_using_helper':'build_user_token_scopes(user)' not in av,'ws_not_using_helper':nc.count('normalize_ws_app_scope(')<3}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/platform_core/registry.py','warehouse-backend/core/platform_core/tests.py','warehouse-backend/core/accounts/serializers.py','warehouse-backend/core/accounts/views_domains/auth_views.py','warehouse-backend/core/notifications/consumers.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(core): build token scopes and websocket app groups from the module registry"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behavior must stay identical: the token `scopes` dict keeps exactly the keys `finance` and `warehouse` with the same role lists, `active_app` keeps the same priority, and the WebSocket consumer joins exactly the same groups as today. In particular `app=operations` must still join no app group (`app_group_name` stays None), because the operations cockpit relies on receiving every event.
- Change only: `warehouse-backend/core/platform_core/registry.py`, `warehouse-backend/core/platform_core/tests.py`, `warehouse-backend/core/accounts/serializers.py`, `warehouse-backend/core/accounts/views_domains/auth_views.py`, `warehouse-backend/core/notifications/consumers.py`. Do not touch `config/asgi.py`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan: `Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md`, heading `### گام ۱`.
- `registry.py` already has the compatibility bridge `app_code_to_module`, `module_allowed_app_code` and `_MODULE_TO_ALLOWED_APP` (accounting appears as `finance` in tokens).
- Hardcoded scope dicts today: `CustomTokenObtainPairSerializer.get_token` and `CustomTokenObtainPairSerializer.validate` in `serializers.py`, and `SwitchAppScopeView` in `auth_views.py`. `consumers.py` checks `in ('warehouse', 'finance', 'personnel')` in `connect` and in the `switch_app` branch of `receive`, and maps `personnel` to `finance` in `send_notification`.

3. Definitions: "catalog modules" means the keys of `MODULE_CATALOG` from `platform_core.module_catalog` (all known modules, installed or not).

4. Task:
- a) In `registry.py`, next to the compatibility bridge, add:
  - `build_user_token_scopes(user) -> dict[str, list[str]]`: for each catalog module code, `scopes[module_allowed_app_code(code)] = get_user_valid_roles_for_app(user, code)` (import `get_user_valid_roles_for_app` inside the function from `accounts.middleware`).
  - `resolve_default_active_app(allowed_apps) -> str`: start with `allowed = set(allowed_apps or ())`; return `'finance'` if `'finance'` is allowed and `'warehouse'` is not; else `'warehouse'` if `'warehouse'` is allowed; else `'finance'`.
  - `normalize_ws_app_scope(code) -> str | None`: return None for a falsy value; `module = app_code_to_module(code)`; return `module_allowed_app_code(module)` if `module` else None. No `.strip()` or `.lower()`.
- b) Use `build_user_token_scopes(user)` and `resolve_default_active_app(allowed_apps)` in `get_token` and `validate`, and `build_user_token_scopes(user)` in `SwitchAppScopeView` (keep `refresh['active_app'] = target_app`).
- c) In `consumers.py`, use `normalize_ws_app_scope(...)` in `connect`, in `switch_app`, and in `send_notification` as `normalize_ws_app_scope(event_app) or event_app`. Keep everything else in those methods unchanged.
- d) Tests in `platform_core/tests.py` (plain `SimpleTestCase` or `TestCase`): `normalize_ws_app_scope` for `'warehouse'`, `'finance'`, `'personnel'`, `'accounting'`, `'operations'`, `None`, `'Warehouse'`, `'unknown'` (expected `'warehouse'`, `'finance'`, `'finance'`, `'finance'`, None, None, None, None); `resolve_default_active_app` for `['finance']`, `['warehouse']`, `['warehouse','finance']`, `[]`; `build_user_token_scopes` for a normal user returns exactly the keys `{'finance','warehouse'}` and values equal to `get_user_valid_roles_for_app(user, 'personnel')` and `get_user_valid_roles_for_app(user, 'warehouse')`.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test platform_core accounts notifications --noinput`, and `python scripts/e2e/guardian_modularization.py` at most twice. If a command fails, read the output and change approach; do not repeat it unchanged.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(core): build token scopes and websocket app groups from the module registry
- Short English report: changed files, tests added, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

Session 2 of 9 — Phase 3: characterization test for SoD page-route and action-code inference (pure refactor)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; p=pathlib.Path('warehouse-backend/core/accounts/permissions.py').read_text(encoding='utf-8'); t=pathlib.Path('warehouse-backend/integration_tests/test_sod_context_resolution.py'); tt=t.read_text(encoding='utf-8') if t.is_file() else ''; hp=p[p.find('class SoDPolicyPermission'):]; ok={'func':'def resolve_sod_context(request, view)' in p,'used':'resolve_sod_context(request, view)' in hp,'inline_removed':'monthly-payroll' not in hp,'test_file':t.is_file(),'cases':len(re.findall(r'expected_route|assertEqual', tt))>=14}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/accounts/permissions.py','warehouse-backend/integration_tests/test_sod_context_resolution.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts personnel --known scripts/automation/known_backend_failures.txt --min-tests 300
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(sod): extract resolve_sod_context and pin its behavior"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Pure refactor: the resolved `(page_route, action_code)` for every request must stay exactly as today. Do not reorder, merge or simplify any condition.
- Change only `warehouse-backend/core/accounts/permissions.py` and the new file `warehouse-backend/integration_tests/test_sod_context_resolution.py`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan heading `### گام ۲`. In `SoDPolicyPermission.has_permission`, the block from `page_route = getattr(view, 'sod_page_route', None)` to the final `action_code = action_name or method.lower()` infers the page route from `request.path` (with the `'/attendance'` default) and then the action code, using the final page route.

3. Definitions: "characterization test" means a test whose expected values are what the current code returns, written before the logic is moved, so a later move can prove it changed nothing.

4. Task:
- a) Move that block verbatim into a module-level function `resolve_sod_context(request, view) -> tuple[str, str]` placed above `SoDPolicyPermission`, and call `page_route, action_code = resolve_sod_context(request, view)` from `has_permission`. Nothing else in `has_permission` changes.
- b) Create `integration_tests/test_sod_context_resolution.py` with a `SimpleTestCase` and a table of at least 14 cases, each with `path`, `method`, `data`, `action`, optional view attributes, `expected_route` and `expected_action`, checked with `assertEqual`. Requests are `types.SimpleNamespace(path=..., method=..., data=...)`; views are `types.SimpleNamespace(action=...)`. Compute every expected value by reading the current code. Cover: `attendance` + `create`; `attendance` + `lock_period`; a path without any keyword + `create` (fallback route `/attendance`, action `create_daily_attendance_entry`); a path without any keyword + `approve_period`; `profiles` + `approve_manager`; a path containing both `profiles` and `finance`; `monthly-payroll` + `disburse_period`; `treasury` + `list`; `manager` + `action=None` with GET; a path containing both `customs` and `manager`; `customs` + `create`; PATCH with `data={'base_wage': 1}` on a path without keywords; an uppercase path such as `/API/Personnel/Attendance/`; a view with `sod_page_route='/x'` and `sod_action_code='y'`.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_sod_context_resolution --noinput` and one run of `.\venv\Scripts\python.exe manage.py test integration_tests accounts --noinput`. If a case fails, fix the expected value only if your reading of the current code was wrong; never change the logic to fit a test.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
test(sod): extract resolve_sod_context and pin its behavior
- Short English report: the case table, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

Session 3 of 9 — Phase 3: move module permission classes and SoD inference rules out of core/accounts/permissions.py

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; names={'CanApproveDocuments','CanApproveFeeds','CanFinalizeInventory','CanManageItemPhotos','CanApprovePersonnelManager','CanApprovePersonnelFinance','CanApproveFleetManager','CanApproveFleetFinance','CanApprovePersonnelSupervisor','CanApproveFleetSupervisor','CanAuthorizePaymentManager','CanDisburseTreasury','CanViewTreasury'}; rx=re.compile(r'from\s+accounts\.permissions\s+import\s+(\([^)]*\)|[^\n]*)'); files=[f for d in ('core','modules','integration_tests') for f in pathlib.Path('warehouse-backend',d).rglob('*.py')]; imp=sorted({str(f) for f in files for m in rx.finditer(f.read_text(encoding='utf-8',errors='replace')) if set(re.findall(r'\w+', m.group(1))) & names}); core=pathlib.Path('warehouse-backend/core/accounts/permissions.py').read_text(encoding='utf-8'); left=sorted(n for n in names if 'class '+n in core); lit=[w for w in ('monthly-payroll','treasury-cartable','manager-approvals','/customs','wage','approve_attendance_period','disburse_treasury_payment') if w in core]; mods=[w for w in ('import personnel','from personnel','import inventory','from inventory','import warehouses','from warehouses') if w in core]; print('importers_of_moved_names',imp,'classes_left',left,'literals_left',lit,'module_imports',mods); sys.exit(1 if imp or left or lit or mods else 0)"
verify: python -c "import pathlib,sys; p=pathlib.Path('warehouse-backend'); inv=p/'modules/warehouse/inventory/permissions.py'; acc=(p/'modules/accounting/personnel/permissions.py').read_text(encoding='utf-8'); core=(p/'core/accounts/permissions.py').read_text(encoding='utf-8'); ok={'inv_file':inv.is_file() and 'class CanManageItemPhotos' in inv.read_text(encoding='utf-8'),'acc_classes':'class CanApprovePersonnelManager' in acc and 'class CanViewTreasury' in acc,'route_rules':'sod_route_rules' in core and 'sod_action_resolvers' in core,'no_pep562':'def __getattr__' not in core}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; r=subprocess.run(['git','diff','--quiet','{base}','HEAD','--','warehouse-backend/integration_tests/test_sod_context_resolution.py']); print('sod test unchanged:',r.returncode==0); sys.exit(r.returncode)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/accounts/permissions.py','warehouse-backend/modules/accounting/personnel/permissions.py','warehouse-backend/modules/accounting/personnel/sod_rules.py','warehouse-backend/modules/accounting/personnel/apps.py','warehouse-backend/modules/accounting/personnel/cartable_views.py','warehouse-backend/modules/accounting/personnel/phase_guardian_approval.py','warehouse-backend/modules/accounting/personnel/views_domains/hr_views.py','warehouse-backend/modules/accounting/personnel/views_domains/fleet_views.py','warehouse-backend/modules/warehouse/inventory/permissions.py','warehouse-backend/modules/warehouse/inventory/views_photos.py','warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py','warehouse-backend/modules/warehouse/warehouses/sod_rules.py','warehouse-backend/modules/warehouse/warehouses/apps.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(permissions): move module permission classes and SoD inference rules into modules"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behavior must stay identical. `integration_tests/test_sod_context_resolution.py` must not change and must still pass.
- `core/accounts/permissions.py` must not import from `personnel`, `inventory` or `warehouses`, and must not define a module-level `__getattr__`.
- Change only the 13 files listed in the scope verify line of this session.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan heading `### گام ۳`. The function `resolve_sod_context` was added in the previous session.
- The only importers of the moved classes (6 files): `personnel/cartable_views.py`, `personnel/phase_guardian_approval.py` (inside a function), `personnel/views_domains/hr_views.py` (multi-line import at the top), `personnel/views_domains/fleet_views.py` (multi-line import at the top), `inventory/views_photos.py` (module level) and `inventory/views_domains/item_views.py` (inside a method).
- `personnel/permissions.py` already exists (it re-exports `companies.permissions` helpers). `inventory/permissions.py` does not exist.
- Both apps already register SoD rules in `ready()` with `contribute('sod_rules', rule)`; follow that style.

3. Definitions:
- "route rule" is a tuple `(priority: int, keywords: tuple[str, ...], route: str)`. A rule matches when any keyword is a substring of `request.path.lower()`.
- "action resolver" is a callable `(request, view, action_name, method, page_route) -> str | None`, where `method` is `request.method.upper()` and `page_route` is the final page route.

4. Task:
- a) Move the 9 accounting classes (`CanApprovePersonnelManager`, `CanApprovePersonnelFinance`, `CanApproveFleetManager`, `CanApproveFleetFinance`, `CanApprovePersonnelSupervisor`, `CanApproveFleetSupervisor`, `CanAuthorizePaymentManager`, `CanDisburseTreasury`, `CanViewTreasury`) verbatim to the end of `personnel/permissions.py`, and the 4 warehouse classes (`CanApproveDocuments`, `CanApproveFeeds`, `CanFinalizeInventory`, `CanManageItemPhotos`) verbatim to a new `inventory/permissions.py`. Update the 6 importers to import from `personnel.permissions` or `inventory.permissions`.
- b) Rewrite `resolve_sod_context` in core: keep the `sod_page_route` and `sod_action_code` view attributes first. Page route: sort `contributions('sod_route_rules')` by priority and take the route of the first matching rule; if none matches, use `'/attendance'`. Action code: call each of `contributions('sod_action_resolvers')` in order and take the first non-None result; if none, `action_name or method.lower()`.
- c) In `personnel/sod_rules.py`, define and in `PersonnelConfig.ready()` register the route rules `(10, ('attendance',), '/attendance')`, `(20, ('profiles',), '/profiles')`, `(30, ('finance', 'monthly-payroll'), '/finance-cartable')`, `(40, ('treasury',), '/treasury-cartable')`, `(50, ('manager',), '/manager-approvals')` and one action resolver containing today's five action rules in the same order. In `warehouses/sod_rules.py`, define and in `WarehousesConfig.ready()` register `(60, ('customs',), '/customs')`. Register outside any `try` block.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests accounts --noinput` and one run of `.\venv\Scripts\python.exe manage.py test personnel inventory warehouses --noinput`; `python scripts/e2e/guardian_modularization.py` at most twice. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files, and `test_sod_context_resolution.py` is unchanged.

7. Output and stop condition:
- Commit with this message, without push:
refactor(permissions): move module permission classes and SoD inference rules into modules
- Short English report: moved classes, updated importers, registered rules, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

Session 4 of 9 — Phase 3: company delete blockers, org-structure write permissions and UserViewSet module queries via registry contributions

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; c=pathlib.Path('warehouse-backend/core'); cv=(c/'companies/views.py').read_text(encoding='utf-8'); cp=(c/'companies/permissions.py').read_text(encoding='utf-8'); uv=(c/'accounts/views_domains/user_views.py').read_text(encoding='utf-8'); q=chr(39); bad={'blockers_hardcoded':'personnel_profiles' in cv or 'monthly_work_periods' in cv or q+'warehouses'+q in cv,'perm_hardcoded':'perm_approve_personnel_manager' in cp,'uv_is_installed':'is_installed(' in uv,'uv_section_q':'section_assignments' in uv,'no_contrib':'company_delete_blockers' not in cv or 'org_structure_write_perms' not in cp or 'company_member_q_builders' not in uv}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import ast,pathlib,sys; pts=('company_delete_blockers','org_structure_write_perms','company_member_q_builders'); fs=[pathlib.Path('warehouse-backend/modules/accounting/personnel/apps.py'),pathlib.Path('warehouse-backend/modules/warehouse/warehouses/apps.py')]; bad=[(f.name,n.lineno) for f in fs for t in ast.walk(ast.parse(f.read_text(encoding='utf-8'))) if isinstance(t,ast.Try) for n in ast.walk(t) if isinstance(n,ast.Call) and getattr(n.func,'id','')=='contribute' and n.args and isinstance(n.args[0],ast.Constant) and n.args[0].value in pts]; print('contribute inside try:',bad); sys.exit(1 if bad else 0)"
verify: python -c "import pathlib,sys; t=pathlib.Path('warehouse-backend/integration_tests/test_company_extension_points.py'); s=t.read_text(encoding='utf-8') if t.is_file() else ''; ok={'file':t.is_file(),'blockers':'company_delete_blockers' in s,'delete_400':'400' in s,'q_builder':'section' in s}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/companies/views.py','warehouse-backend/core/companies/permissions.py','warehouse-backend/core/accounts/views_domains/user_views.py','warehouse-backend/modules/warehouse/warehouses/apps.py','warehouse-backend/modules/warehouse/warehouses/user_extension.py','warehouse-backend/modules/accounting/personnel/apps.py','warehouse-backend/modules/accounting/personnel/company_access.py','warehouse-backend/integration_tests/test_company_extension_points.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(core): company delete blockers and user directory queries via registry contributions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may be lost: a company that has any of the six related records must still be impossible to delete, with the same Persian message as today. Register these contributions outside any `try` block, so a registration failure fails loudly instead of silently removing a blocker.
- Tenant isolation: the org-admin user directory must return exactly the same users as today.
- Change only the 8 files listed in the scope verify line of this session.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan heading `### گام ۴`.
- `core/companies/views.py` has `COMPANY_DELETE_BLOCKERS` (6 tuples) used in `perform_destroy` with `hasattr` and `.exists()`.
- `core/companies/permissions.py` `has_structure_write_permission` has a hardcoded list including `'accounts.perm_approve_personnel_manager'`.
- `core/accounts/views_domains/user_views.py` uses `apps.is_installed('warehouses')` in `get_queryset` (prefetch `assigned_warehouses`) and `apps.is_installed('personnel')` in `_org_admin_directory_queryset` (section-assignment `Q`).
- `warehouses/user_extension.py` already registers `WarehouseUserExtension()` with `contribute('user_extensions', ...)`.

3. Definitions: "blocker" is a tuple `(order: int, related_name: str, message: str)`.

4. Task:
- a) Replace `COMPANY_DELETE_BLOCKERS` with `contributions('company_delete_blockers')` sorted by `order`, keeping the `hasattr` and `.exists()` logic. Register in `PersonnelConfig.ready()`: `(10,'projects',...)`, `(30,'personnel_profiles',...)`, `(40,'monthly_work_periods',...)`, `(50,'counterparties',...)`, `(60,'fiscal_periods',...)`; and in `WarehousesConfig.ready()`: `(20,'warehouses',...)`. Copy each Persian message exactly from the current tuple.
- b) In `has_structure_write_permission`, remove `'accounts.perm_approve_personnel_manager'` from the core list and add `*contributions('org_structure_write_perms')`; register that permission string in `PersonnelConfig.ready()`.
- c) In `get_queryset`, extend `prefetch_items` with `getattr(ext, 'user_prefetch_related', ())` for each `contributions('user_extensions')`, keeping the order `groups__customrole`, `user_permissions`, module items, `company_accesses__company`; add `user_prefetch_related = ('assigned_warehouses',)` to `WarehouseUserExtension`.
- d) In `_org_admin_directory_queryset`, OR in the result of each `contributions('company_member_q_builders')` builder called with `allowed_cids` (skip None). In `personnel/company_access.py`, add `build_section_member_q(allowed_cids)` that returns today's `Q(section_assignments__is_active=True, section_assignments__section__project__company_id__in=allowed_cids)`, and register it in `PersonnelConfig.ready()`.
- e) New `integration_tests/test_company_extension_points.py` (`TestCase`): the sorted `company_delete_blockers` related names equal `['projects','warehouses','personnel_profiles','monthly_work_periods','counterparties','fiscal_periods']`; a superuser DELETE on a company that has a warehouse returns 400 and the company still exists; the same for a company that has a project; a user with only `accounts.perm_approve_personnel_manager` passes `has_structure_write_permission`; in the org-admin directory, an active section member of a project of an allowed company is listed and a user of another company is not.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_company_extension_points --noinput`, one run of `.\venv\Scripts\python.exe manage.py test integration_tests companies accounts --noinput`, and `python scripts/e2e/guardian_modularization.py` at most twice. If an existing test fails, report it; do not weaken any check.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(core): company delete blockers and user directory queries via registry contributions
- Short English report: each contribution point and where it is registered, tests added, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

Session 5 of 9 — Phase 3: company sub-resource and Google Drive endpoints from the accounting module extension

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); files=[app/'core/api/company-api.service.ts',app/'modules/common/components/operations/companies/companies.ts',app/'modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.ts',app/'modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts']; bad={f.name:('/personnel/' in f.read_text(encoding='utf-8')) for f in files}; api=files[0].read_text(encoding='utf-8'); bad['fake_org_fallback']='/org/company-' in api; bad['no_gdrive_helper']='getCompanyGdriveUrl(' not in api; bad['no_matcher']='matchesCompanyUrl(' not in api; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'modules/accounting/module.ts',p+'core/api/company-api.service.ts',p+'modules/common/components/operations/companies/companies.ts',p+'modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.ts',p+'modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts',p+'modules/common/components/operations/companies/company-api-endpoints.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/operations/companies/*.spec.ts" --include "src/app/modules/common/components/settings/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(company-api): company sub-resource and gdrive endpoints from the accounting module extension"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Every URL sent to the server must stay byte-for-byte the same as today when the accounting module is installed. Do not invent fallback endpoints: `/org/` has only `companies` and `user-company-access` on the backend.
- Change only the 7 files listed in the scope verify line of this session. No `.html` template changes.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۵`.
- `company-api.service.ts` already resolves `companiesEndpoint` and `accessEndpoint` from `this.moduleRegistry.getExtensions('companyApiEndpoints')[0]?.extension` with `/org/...` fallbacks (those two fallbacks are real and stay). `documentsEndpoint`, `bankAccountsEndpoint`, `boardMembersEndpoint` (top of the class) and `fiscalPeriodsEndpoint` (above `getFiscalPeriods`) are hardcoded `/personnel/...`.
- `companies.ts` (subscription to `offlineSync.liveDataUpdates$`) matches URLs with `url.includes('/personnel/...')`. The accounting tabs are shown only when `isAccountingInstalled` is true.
- `company-gdrive-tab.ts` has 9 hardcoded `${environment.apiUrl}/personnel/companies/${cid}/gdrive...` URLs; `settings-backup-tab.ts` has one in `toggleCompanyBackupSync`.

3. Definitions: "missing extension" means `getExtensions('companyApiEndpoints')` returns no entry or the needed field is empty.

4. Task:
- a) In `module-contract.ts`, add optional `documentsEndpoint`, `bankAccountsEndpoint`, `boardMembersEndpoint`, `fiscalPeriodsEndpoint` (strings) and `companyGdriveBaseEndpoint?: (companyId: number | string) => string` to `companyApiEndpoints`. In `accounting/module.ts`, set them to `'/personnel/company-documents'`, `'/personnel/company-bank-accounts'`, `'/personnel/company-board-members'`, `'/personnel/company-fiscal-periods'` and `(cid) => '/personnel/companies/' + cid + '/gdrive'`.
- b) In `company-api.service.ts`, resolve those four endpoints from the extension. When the extension is missing, each public method that needs one returns `throwError(() => new Error('accounting-module-not-installed'))` and sends no request. Add `getCompanyGdriveUrl(companyId: number | string, subPath = ''): string | null` (null when missing) and `matchesCompanyUrl(url: string, kind: 'companies' | 'bankAccounts' | 'boardMembers' | 'documents'): boolean`, where `'companies'` also accepts `/org/companies/` as today.
- c) In `companies.ts`, replace the four `url.includes('/personnel/...')` checks with `this.companyApi.matchesCompanyUrl(url, ...)`; keep the branch order and bodies.
- d) In `company-gdrive-tab.ts` and `settings-backup-tab.ts`, inject `CompanyApiService` where missing and build every gdrive URL with `getCompanyGdriveUrl(cid, '<same subpath and query as today>')`; if it returns null, show the existing error handling path for that call and send nothing.
- e) In `company-api-endpoints.spec.ts`, add tests: with the accounting extension the four endpoints and `getCompanyGdriveUrl(5, '/queue/')` equal today's URLs; without it the methods error and no HTTP request is issued (the existing spec mocks `HttpClient` with `vi.fn()`; assert with `expect(http.get).not.toHaveBeenCalled()` and the same for the other verbs); `matchesCompanyUrl` for each kind.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent` and one run of `python scripts/e2e/guardian_57_front_module_fence.py` from the repo root. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(company-api): company sub-resource and gdrive endpoints from the accounting module extension
- Short English report: replaced call sites with their old and new URL expressions, tests added, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

Session 6 of 9 — Phase 3: offline queue headers, deep-sync probe and tab scope detection from module sync config

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); qr=(app/'core/services/offline/offline-queue-runner.ts').read_text(encoding='utf-8'); os_=(app/'core/services/offline-sync.service.ts').read_text(encoding='utf-8'); st=(app/'core/services/session-tab.service.ts').read_text(encoding='utf-8'); q=chr(39); ok={'qr_registry':'getExtensions('+q+'syncConfig'+q+')' in qr,'qr_fallback_kept':'wh_access_token_' in qr and q+'counter'+q in qr,'probe_clean':'/personnel/' not in os_ and '/inventory/' not in os_,'st_registry':'getInstalledModules()' in st and 'launcherTile' in st,'st_no_finance_path':'/app/finance' not in st and '/app/warehouse' not in st,'st_spec':(app/'core/services/session-tab.service.spec.ts').is_file()}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; r=subprocess.run(['git','diff','--quiet','{base}','HEAD','--','warehouse-front/src/app/core/services/offline-db.ts']); print('offline-db unchanged:',r.returncode==0); sys.exit(r.returncode)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'modules/warehouse/module.ts',p+'modules/accounting/module.ts',p+'core/services/offline/offline-queue-runner.ts',p+'core/services/offline/offline-queue-runner.spec.ts',p+'core/services/offline-sync.service.ts',p+'core/services/session-tab.service.ts',p+'core/services/session-tab.service.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/core/services/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(offline-core): offline headers, deep-sync probe and tab scope from module sync config"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may be lost. Queued offline records must be replayed with exactly the same headers as today, including when a module is missing from the cached installed list, so keep today's values as fallbacks. Never delete, clear or skip queue records, cache entries or IndexedDB stores. Do not modify `core/services/offline-db.ts`.
- Change only the 8 files listed in the scope verify line of this session.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۶`.
- `buildScopedHeaders(appScope)` in `offline-queue-runner.ts` hardcodes the token key suffix, default role and `X-Active-App` per scope.
- `offline-sync.service.ts` (deep update, around line 625) builds a probe URL with hardcoded `/personnel/sync/pull/?project_id=` and `/inventory/sync/pull/?warehouse_id=`. `sync-pull.service.ts` already finds `syncConfig` with `getModuleRegistry().getExtensions('syncConfig').find(e => e.extension.scopeKind === scopeKind)`; reuse that lookup pattern.
- `syncConfig` today: warehouse `{scopeKind:'warehouse', pullEndpoint:'/inventory/sync/pull/', scopeParamKey:'warehouse_id'}`, accounting `{scopeKind:'finance', pullEndpoint:'/personnel/sync/pull/', scopeParamKey:'project_id'}`. `launcherTile.appKey` is `'warehouse'` and `'personnel'`.
- `SessionTabService.getActiveApp()` checks `path.includes('/app/operations')`, `'/app/warehouse'` and `'/app/finance'`.

3. Definitions: "same URL" means the probe URL string is identical to today's for both scopes, including the trailing slash and the `&limit=1` query.

4. Task:
- a) Add optional `activeAppHeader`, `defaultOfflineRole` and `tokenScopeKey` to `syncConfig` in `module-contract.ts`; set them in `warehouse/module.ts` (`'warehouse'`, `'counter'`, `'warehouse'`) and `accounting/module.ts` (`'personnel'`, `'operator'`, `'finance'`).
- b) In `buildScopedHeaders`, read those three values from the matching `syncConfig`, falling back to today's expressions when absent.
- c) In `offline-sync.service.ts`, build the probe URL as `${environment.apiUrl}${syncConfig.pullEndpoint}?${syncConfig.scopeParamKey}=${testId}&limit=1`; if no `syncConfig` matches the scope, return `[]` before the probe. Do not change the error handling around the probe.
- d) In `getActiveApp()`, keep the `/app/operations` check first, then loop over `getModuleRegistry().getInstalledModules()` and, when `path.includes(mod.routePrefix)` and `mod.extensions?.launcherTile?.appKey` exists, call `setActiveApp(appKey)` and return it. Keep the session-storage and local-storage fallbacks.
- e) Tests: in `offline-queue-runner.spec.ts`, assert the exact headers for `'warehouse'` and `'finance'` with the real registry and with a registry whose `getExtensions` returns `[]`. New `session-tab.service.spec.ts`: `/app/warehouse/counter` gives `'warehouse'`, `/app/finance/x` gives `'personnel'`, `/app/operations/cockpit` gives `'operations'`.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, one run of `python scripts/e2e/guardian_34_offline_continuity.py` and one of `python scripts/e2e/guardian_57_front_module_fence.py`. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(offline-core): offline headers, deep-sync probe and tab scope from module sync config
- Short English report: before and after expressions for each header and URL, tests added, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

Session 7 of 9 — Phase 3: accounting notification navigation moved out of the shared NotificationCenterComponent

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); nc=(app/'shared/components/notification-center/notification-center.component.ts').read_text(encoding='utf-8'); nh=app/'modules/accounting/notification-handlers.ts'; sp=app/'modules/accounting/notification-handlers.spec.ts'; am=(app/'modules/accounting/module.ts').read_text(encoding='utf-8'); bad={'personnel_url_in_nc':'/personnel/' in nc,'finance_route_in_nc':'/app/finance' in nc,'missing_handler_file':not nh.is_file(),'missing_spec':not sp.is_file(),'not_registered':'notificationHandlers' not in am,'nc_not_delegating':'notificationHandlers' not in nc}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'modules/accounting/notification-handlers.ts',p+'modules/accounting/notification-handlers.spec.ts',p+'modules/accounting/module.ts',p+'shared/components/notification-center/notification-center.component.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer|employee-new-vehicle"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/accounting/notification-handlers.spec.ts" --include "src/app/modules/common/components/layout/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(notifications): accounting notification navigation via module notificationHandlers"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Navigation must stay identical: same target route, same query params, same HTTP lookups with the `SKIP_GLOBAL_ERROR_TOAST` header, same fallbacks on error, for every permission combination.
- Change only the 5 files listed in the scope verify line of this session. The component template is inline in the `.ts` file; do not change it.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۷`.
- `NotificationCenterComponent.onNotificationClick` handles `item.url`, then `notification_type === 'fleet_change_request'`, `target_model === 'VehicleDriverProfile'` and `target_model === 'PersonnelProfile'`, using the private helpers `userPerms`, `navigateToFleet`, `navigateByRoleForFleet`, `navigateToPersonnel` and `navigateByRole`.

3. Definitions: "handler" is `{ canHandle: (item) => boolean; navigate: (ctx: NotificationNavigationContext) => void }`, where the context is `{ item, http: HttpClient, router: Router, userPerms: string[], isSuperuser: boolean }`.

4. Task:
- a) Add `NotificationNavigationContext` and `notificationHandlers?: Array<handler>` to `ExtensionMap` in `module-contract.ts`.
- b) Create `modules/accounting/notification-handlers.ts` exporting `ACCOUNTING_NOTIFICATION_HANDLERS` (three handlers in today's order). Move the fleet and personnel navigation logic and the four helpers into it with identical conditions, using the context instead of `this`. Register it as `extensions.notificationHandlers` in `accounting/module.ts`.
- c) In `onNotificationClick`, keep `markAsRead`, closing the panel and the `item.url` branch; then compute `userPerms()` once, iterate over `this.moduleRegistry.getExtensions('notificationHandlers')`, and for each entry iterate over `entry.extension` (an array of handlers); call `navigate(context)` on the first handler whose `canHandle(item)` is true and return. Inject `ModuleRegistryService` with `inject()`. Remove the moved private helpers and any now-unused imports.
- d) `notification-handlers.spec.ts`: for each handler, the route and query params for the manager, accountant, supervisor and plain-employee permission sets, the invalid `target_id` fallback, and the HTTP-error fallback (mock `HttpClient` with `vi.fn()` returning `of(...)` or `throwError(...)`, and spy on `Router.navigate`).

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; one run of `python scripts/e2e/guardian_57_front_module_fence.py` from the repo root. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(notifications): accounting notification navigation via module notificationHandlers
- Short English report: moved logic, tests added, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

Session 8 of 9 — Phase 3: move module-only front models into their modules and remove the dead RecordHttpService

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); idx=(app/'core/models/index.ts').read_text(encoding='utf-8'); bad={'personnel_in_core':(app/'core/models/personnel.model.ts').exists(),'count_in_core':(app/'core/models/count-task.model.ts').exists(),'doc_in_core':(app/'core/models/doc-task.model.ts').exists(),'record_http_exists':(app/'core/http/record-http.service.ts').exists(),'personnel_missing':not (app/'modules/accounting/models/personnel.model.ts').is_file(),'count_missing':not (app/'modules/warehouse/models/count-task.model.ts').is_file(),'doc_missing':not (app/'modules/warehouse/models/doc-task.model.ts').is_file(),'barrel_still_exports':'count-task.model' in idx or 'doc-task.model' in idx,'item_moved':not (app/'core/models/item.model.ts').is_file(),'field_config_moved':not (app/'core/models/field-config.model.ts').is_file()}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; out=subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split(); bad=[f for f in out if not (f.startswith('warehouse-front/src/app/modules/accounting/') or f.startswith('warehouse-front/src/app/modules/warehouse/') or f in ('warehouse-front/src/app/core/models/index.ts','warehouse-front/src/app/core/models/personnel.model.ts','warehouse-front/src/app/core/models/count-task.model.ts','warehouse-front/src/app/core/models/doc-task.model.ts','warehouse-front/src/app/core/http/record-http.service.ts'))]; print('outside scope:',bad); sys.exit(1 if bad or not out else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(front-models): move module-only models into their modules and remove dead RecordHttpService"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Only file moves and import path updates; no type or logic changes. Do not move `core/models/item.model.ts` or `core/models/field-config.model.ts` (core files import them).
- Changes are limited to the moved files, `core/models/index.ts`, the deleted `core/http/record-http.service.ts`, and import lines in files under `modules/accounting/` and `modules/warehouse/`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context: plan heading `### گام ۸`. `personnel.model.ts` is imported only under `modules/accounting/`. `count-task.model.ts` and `doc-task.model.ts` are imported only under `modules/warehouse/` and re-exported by `core/models/index.ts`. `record-http.service.ts` has no importer.

3. Definitions: "import update" means changing only the module specifier string of an existing import.

4. Task:
- a) `git mv` `core/models/personnel.model.ts` to `modules/accounting/models/personnel.model.ts` and update every import of it under `modules/accounting/` (components, `api/personnel-api.models.ts`, `.spec.ts` and `.dom.spec.ts` files).
- b) `git mv` `core/models/count-task.model.ts` and `core/models/doc-task.model.ts` to `modules/warehouse/models/`, fix their own relative imports (for example `Item` from `../../../core/models/item.model`), remove both lines from `core/models/index.ts`, and update every import under `modules/warehouse/`, including imports that used the `core/models` barrel for these types.
- c) `git rm` `core/http/record-http.service.ts`.

5. Tool policy: in `warehouse-front`, at most three runs of `npx ng build --output-path ../scratch/ng-build-agent`; one run of `python scripts/e2e/guardian_57_front_module_fence.py` from the repo root. Use the Grep tool to find importers. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only renames, `index.ts`, the deletion and import-line edits.

7. Output and stop condition:
- Commit with this message, without push:
refactor(front-models): move module-only models into their modules and remove dead RecordHttpService
- Short English report: moved files, number of updated imports per module, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

Session 9 of 9 — Phase 3: semantic core fences in Guardian 29 (backend) and Guardian 57 (frontend)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/e2e/guardian_57_front_module_fence.py --self-test
verify: python -c "import json,pathlib,sys; b29=json.loads(pathlib.Path('scripts/e2e/modularization_baseline.json').read_text(encoding='utf-8')).get('counters',{}); b57=json.loads(pathlib.Path('scripts/e2e/front_fence_baseline.json').read_text(encoding='utf-8')).get('counters',{}); v29=b29.get('core_module_app_refs'); v57=b57.get('core_hardcoded_module_api_paths'); ok={'b29_present':isinstance(v29,int),'b29_max':isinstance(v29,int) and v29<=14,'b57_zero':v57==0}; print(ok,'core_module_app_refs=',v29,'core_hardcoded_module_api_paths=',v57); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'scripts/e2e/guardian_modularization.py','scripts/e2e/modularization_baseline.json','scripts/e2e/guardian_57_front_module_fence.py','scripts/e2e/front_fence_baseline.json'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py sample-module
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(guardians): semantic core fences for module app references and hardcoded module API paths"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Change only the two guardian scripts and their two baseline JSON files. Do not change application code to make a counter smaller.
- Existing counters, their behavior and the existing self-test must keep working.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۹`.
- Guardian 29 (`scripts/e2e/guardian_modularization.py`) fails only when a counter in `counters` exceeds `modularization_baseline.json`; `--update-baseline` records a new snapshot.
- Guardian 57 (`scripts/e2e/guardian_57_front_module_fence.py`) classifies files with `get_file_zone(rel_posix, module_names)` (zones `composition_root`, a module name, or `core_common`; `modules/common` is `core_common`), counts in `scan_front_fences`, and has `run_self_test()` with a dummy file in zone `core_common`.

3. Definitions:
- "core module app reference" is one regex match in a non-test, non-migration `.py` file under `warehouse-backend/core/` (skip files named `tests.py`, `test_*.py` and anything under `tests/` or `migrations/`) of `apps\.(?:is_installed|get_model)\(\s*['"](?:personnel|warehouses|inventory)['"]` or `get_user_valid_roles_for_app\(\s*user\s*,\s*['"](?:personnel|warehouse)['"]`.
- "hardcoded module API path" is one match of `['"\x60][^'"\x60\n]*/(?:personnel|inventory)/` in a non-spec `.ts` file of zone `core_common`, ignoring lines whose stripped text starts with `//`, `*` or `/*`, and lines matching `^\s*(import|export)\b.*\bfrom\b`. (`\x60` is the backtick character.)

4. Task:
- a) Guardian 29: add `scan_core_module_app_refs(backend_dir)` and record its count as `counters["core_module_app_refs"]`, with the per-file list in the report output. Run `--update-baseline`. Expected count: 14 (soft `warehouses` couplings in `accounts/admin.py`, `accounts/models.py`, `accounts/views_domains/audit_views.py`, `communications/models.py`, `communications/views.py`, `reports/registry.py`, `settings_core/models.py`). If you get a different number, report the list; do not edit application code.
- b) Guardian 57: add the counter `core_hardcoded_module_api_paths` to `scan_front_fences` with file and line in `violations`. Extend `run_self_test()` so the dummy file also contains a literal with a query string, for example a template literal with `/api/personnel/sync/pull/?project_id=1`, and assert it is detected. Run `--update-baseline`; the count must be 0.

5. Tool policy: from the repo root, `python scripts/e2e/guardian_modularization.py` and `python scripts/e2e/guardian_57_front_module_fence.py` (each with or without `--update-baseline`) at most three times each, and `--self-test` at most three times. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the four allowed files.

7. Output and stop condition:
- Commit with this message, without push:
feat(guardians): semantic core fences for module app references and hardcoded module API paths
- Short English report: both counters with their values and file lists, self-test result, commands actually run with results, remaining doubts. End the turn after the commit and report.
```

<div dir="rtl" align="right">

## گزارش پیشرفت

- **۲۵ مهر ۱۴۰۵:**
  - نسخهٔ ۲ طرح نوشته شد و نسخهٔ ۱ در `scratch/plans/` بایگانی شد.
  - نگهبان‌های ۲۹، ۳۱، ۳۴، ۵۲، ۵۴، ۵۵، ۵۶ و ۵۷ روی HEAD (`303dbe8`) سبز و ۳۳ و ۳۵ قرمز بودند.
  - **شور با Antigravity** (گفتگو `44594a50-f158-43d6-b2ec-8a128cb7faac`، پیام‌ها و پاسخ‌ها در `scratch/ask/phase3_review_r*`):
    - **دور ۱:** یک ایراد مسدودکننده پیدا شد. `hr_views.py` و `fleet_views.py` هم کلاس‌های Permission را import می‌کنند و import چندخطی‌شان از grep جا مانده بود. سه بهبود هم پیشنهاد شد: `allowed_apps or ()` در گام ۱، استفاده از ماک `vi.fn()` به‌جای `HttpTestingController` در گام‌های ۵ و ۷، و حلقهٔ صریح روی آرایهٔ `extension` در گام ۷. هر چهار مورد با کد تأیید و اعمال شد.
    - **دور ۲:** `AGREED`.
  - **صف:** متن بخش ۶ در `tasks.md` گذاشته شد. صف قبلی (نشست‌های ۱ تا ۲۹) در `scratch/tasks_deep_modular_until_s29.md` بایگانی شد.
  - **وضعیت:** هنوز هیچ نشستی اجرا نشده است.
  - **اقدام بعدی:** اجرای صف با `run_tasks.bat` و نظارت پس از هر نشست طبق بخش ۵.

</div>
