<div dir="rtl" align="right">

# طرح فاز ۴ ماژولارسازی — اصلاح دور ۱۹ مهر و حذف اتصال‌های باقی‌مانده

- **تاریخ:** ۲۸ مهر ۱۴۰۵ (۱۹ اکتبر ۲۰۲۶)
- **مبنا:** بازبینی Claude روی تغییرات commit‌نشدهٔ Antigravity، و توافق نهایی با Antigravity (۱۰۰٪ موافق).
- **اجرا:** Antigravity با `scripts/automation/run_tasks_agy.py`؛ متن کامل صف در `tasks.md` است (انگلیسی). Claude نظارت می‌کند و کد اپ را خودش ویرایش نمی‌کند.

## ۰. وضعیت پایه

- `ef99e43`: پیش از دور ماژولارسازی ۱۹ مهر. مبنای مقایسهٔ تست‌های فرانت در گام‌های ۰ و ۳.
- `b00b604`: کار پوش چت (پیش از دور ماژولار، ۰۱:۳۹ تا ۱۴:۵۶)، جدا commit شد.
- `30648fb`: دور ماژولار Antigravity (۲۱:۰۷ تا ۲۱:۳۸)، بدون بخش `offline-db.ts`. آن بخش به HEAD برگشت و نسخهٔ پشتیبانش در `scratch/offline-db-modular-attempt-2026-10-19.patch` است.
- `74df67b`: دفترچهٔ runner فازهای موبایل.
- اسکرین‌شات `screen_5556_chat.png` از ریشه به `scratch/` رفت.

**ایراد شناخته‌شده روی `30648fb`:** حلقهٔ عمومی `AuthGuard` پوستهٔ `operations` را ماژول حساب می‌کند و کاربر غیرادمین با `view_sys_users` به `/app/operations/users` نمی‌رسد (۴ تست `route-access.characterization.spec.ts` قرمز). گام ۰ آن را اصلاح می‌کند.

## ۱. تصمیم‌های توافق‌شده

| موضوع | تصمیم |
| :--- | :--- |
| `app.routes.ts` و `admin_all` | ادعای تغییر مقصد ورود پس گرفته شد؛ `isSuper` پیش از شمارش ماژول‌ها برمی‌گردد. فقط متغیرهای بی‌استفاده حذف می‌شوند. |
| اولویت ماژول پیش‌فرض | یک فیلد واحد ممکن نیست (تست `test_resolve_default_active_app`). دو فیلد: `active_priority` برای انتخاب میان قلمروهای مجاز، و `default_priority` (موجود) برای حالت بدون قلمرو و `default_module()`. |
| نگاشت‌های قدیمی `registry.py` | حذف می‌شوند؛ `MODULE_CATALOG` همهٔ ماژول‌های روی دیسک را دارد و fallback به آن از قبل در کد هست. |
| فیلد گزارش «تعداد انبار» | خواندن تنبل contributionها داخل موتور گزارش (`EntityConfig.get_fields()`)، نه فقط `reports/registry.py`؛ مسیر خروجی اکسل (`reports/excel.py`) از `get_registry()` نمی‌گذرد. |
| نوع‌ها | `scopeKind` در قرارداد ماژول: `'warehouse' \| 'finance' \| 'operations' \| (string & {})`. `AppScope` در `offline-db.ts` و `deepSyncScope` بسته می‌مانند (دو دیتابیس قفل‌شده). |
| کار پوش چت | جدا commit شد؛ هدرهای CORS برای APKهای نصب‌شده می‌مانند. |

## ۲. گام‌ها و نشست‌ها

### گام ۰ — اصلاح پس‌رفت‌ها (فرانت)
- **نشست ۱:** حلقهٔ عمومی گارد فقط ماژول‌های دارای `routeAccess`؛ حذف `whMarkers`/`acctMarkers` در `app.routes.ts`؛ نوع `scopeKind` با `(string & {})` و `deepSyncScope` بسته. معیار: هیچ شکست تازه نسبت به `ef99e43`.
- **نشست ۲ (ایمنی داده):** گیت بازگردانی و rollback در `settings-backup-tab.ts` هر دو صف (`warehouseOfflineDb` و `financeOfflineDb`) را بشمارد. اشکال ازپیش‌موجود بود.

### گام ۱ — رجیستری و احراز هویت (بک‌اند)
- **نشست ۳:** حذف نگاشت‌های قدیمی؛ `active_priority`؛ `resolve_default_active_app` بی‌نام ماژول؛ پیش‌فرض قلمرو فعال در `middleware.py` و `permissions.py` از `default_module()`.
- **نشست ۴:** فیلدهای `public_read_prefixes` و `reports_fallback` در `ModuleSpec` جای سخت‌کدهای `authentication.py`.
- **نشست ۵:** فیلدهای اضافهٔ موجودیت کاربران با خواندن تنبل در `EntityConfig`؛ حذف فراخوانی تابع خصوصی گزارش‌ساز از `warehouses/apps.py`.

### گام ۲ — باقی‌ماندهٔ هسته (حساس به قلمرو؛ `tenant-scope-reviewer` پس از صف)
- **نشست ۶:** تست مشخصه‌نگار قلمرو لاگ‌های ممیزی (فهرست، آمار، خروجی اکسل) روی کد فعلی.
- **نشست ۷:** فیلتر قلمرو ممیزی و محدودیت انبارهای کاربر از مسیر contribution ماژول‌ها؛ تست نشست ۶ بدون تغییر سبز.
- **نشست ۸:** `ALLOWED_COMMENT_MODELS` به contribution با نام `comment_target_models`؛ `document` و `financialdocument` مدل ندارند و حذف می‌شوند.
- **نشست ۹:** `assigned_warehouses` در `accounts/serializers.py` و `user_views.py` فقط از مسیر `WarehouseUserExtension`.
- **نشست ۱۰:** شاخه‌های `scope_kind == 'warehouse'` موتور گزارش به contribution ماژول انبار (`report_scope_handlers`).

### گام ۳ — فرانت
- **نشست ۱۱:** یک حلقهٔ واحد در `AuthGuard` به‌جای بلوک‌های سخت‌کد انبار/مالی؛ رفتار با تست‌های مشخصه‌نگار قفل است.
- **نشست ۱۲:** مسیر اسناد شرکت از extension با نام `layoutNav` (`companyDocumentsRoute`).
- **نشست ۱۳:** تعویض اپ بر اساس پیشوند مسیر در `app-persona.service.ts` از رجیستری؛ spec مشخصه‌نگار پرسونا قفل است.

### گام ۴ — صف آفلاین N-قلمرویی (معوق؛ صف جدا)
پرخطر و حساس به داده. طرح اولیه:
- extension تازه با نام `offlineSync` در هر ماژول: الگوهای URL (جای `resolveScopeFromUrl`) و نام دیتابیس. نام دو دیتابیس فعلی هرگز عوض نمی‌شود.
- حلقهٔ تخلیهٔ `offline-queue-runner` همهٔ دیتابیس‌ها را بخواند، نه فقط «جاری و دیگری».
- `user-menu` و `deep-sync-modal` و `session-tab` از همین extension بخوانند.

#### ۴.۱ طرح تفصیلی (۲۹ مهر ۱۴۰۵)

**درس تلاش ناموفق** (`scratch/offline-db-modular-attempt-2026-10-19.patch`، اعمال نمی‌شود):
- `normalizeScope` هر نام ناشناخته را خودش برمی‌گرداند. مسیر `/app/operations` و هر کد ماژول دیگر دیتابیس تازه می‌ساخت و رکوردها میان دو دیتابیس پخش می‌شد.
- رجیستری ماژول‌ها در خود `getCurrentActiveAppScope` و هنگام ساخت نمونه‌ها خوانده می‌شد. خطر import چرخه‌ای در زمان بارگذاری.
- هدف `Proxy` عوض شد و رفتار `offlineDb` بی‌تست تغییر کرد.

**ناوردایی‌ها (نقض هر کدام یعنی مسیر از دست رفتن داده):**
- **ن۱. قفل نام و نسخه:** `WarehouseOfflineDB_warehouse` و `WarehouseOfflineDB_finance` و زنجیرهٔ `version()` هر دو دست نمی‌خورند. هیچ نمونهٔ دومی از `OfflineDatabase` با یکی از این دو نام ساخته نمی‌شود.
- **ن۲. قفل قلمروهای موجود مستقل از ماژول‌های نصب‌شده:** `warehouse` و `finance` و نام‌های مستعار `personnel`/`accounting` همیشه به همان دو نمونهٔ قفل‌شده می‌رسند، حتی در بیلد تک‌ماژولی. جدول `SCOPED_DB_NAMES` در هسته می‌ماند. دلیل: در بیلد فقط‌انبار، رکورد `appScope: 'finance'` اگر به دیتابیس انبار برسد، `markSent`/`handleRetry` با همان `id` روی رکورد دیگری از دیتابیس انبار کار می‌کنند.
- **ن۳. پیش‌فرض:** قلمرو ناشناخته یا ثبت‌نشده (مثل `operations`) همان `warehouse` می‌ماند، مثل امروز. فقط قلمرویی دیتابیس تازه می‌گیرد که ماژولی آن را با `offlineSync` ثبت کرده باشد.
- **ن۴. هم‌ارزی:** با هر دو ماژول نصب‌شده، خروجی `normalizeScope`، `getScopedDbName`، `resolveScopeFromUrl`، `getCurrentActiveAppScope` و `getOfflineDb` برای همهٔ ورودی‌های جدول مشخصه‌نگار عیناً همان HEAD است.
- **ن۵. خواندن تنبل رجیستری:** رجیستری فقط داخل توابع و در زمان اجرا خوانده می‌شود، داخل `try/catch`. بازگشت به دو دیتابیس قفل‌شده و پیش‌فرض `warehouse` هنگام خطا فقط برای خواندن فهرست و مسیریابی رکورد تازه مجاز است، نه برای نوشتن روی رکورد موجود (ن۹).
- **ن۶. تخلیه و شمارش:** تخلیه، شمارش‌ها، گیت بازگردانی و مجموعه‌های محافظت (`pendingSyncIds`، `protectedIds`) همیشه دو دیتابیس قفل‌شده را می‌خوانند، به‌علاوهٔ دیتابیس‌های ثبت‌شده. ترتیب ارسال همان مرتب‌سازی سراسری امروز است (سقف تلاش، سپس `createdAt`).
- **ن۷. شناسهٔ مبهم:** `id` در هر دیتابیس جدا شمرده می‌شود. لغو بدون قلمرو اگر شناسه در بیش از یک دیتابیس باشد، رد می‌شود (مثل امروز). جست‌وجوی خطاها در `offline-conflict-manager` همان ترتیب «اولین یافته» امروز را نگه می‌دارد: انبار، مالی، سپس بقیه.
- **ن۸. مهاجرت دیتابیس قدیمی:** `migrateLegacyDatabaseIfNeeded` تابع ثابت `resolveLegacyScopeFromUrl` (رونوشت منطق امروز) را به‌کار می‌برد، نه الگوهای رجیستری. وگرنه در بیلد تک‌ماژولی رکورد قدیمی‌ای که قبلاً به مالی رفته، دوباره به انبار اضافه و دوبار ارسال می‌شود.
- **ن۹. نوشتن با شناسه:** هر نوشتن یا حذف با `id` (لغو، `handleRetry`، `markTransportFailure`، `reconcileRejected`، به‌روزرسانی خوش‌بینانه، API خطاها) یا دستهٔ دیتابیس منبع را دارد، یا قلمرو را با تابع سخت‌گیر `resolveOfflineDbStrict(scope)` حل می‌کند. این تابع برای قلمرو غیرتهیِ ناشناخته `null` می‌دهد و نوشتن انجام نمی‌شود. هرگز به `warehouse` نمی‌افتد. امروز همهٔ رکوردهای ذخیره‌شده `appScope` برابر `warehouse`، `finance` یا تهی دارند، پس رفتار فعلی عوض نمی‌شود.
- **ن۱۰. منبع ثابت بیلد:** الگوها و فهرست دیتابیس‌ها از `getModuleRegistry().getAllModules()` خوانده می‌شوند (ماژول‌های داخل بیلد)، نه `getExtensions`/`getInstalledModules`. دلیل: فهرست «نصب‌شده» را سرور و کش localStorage تعیین می‌کنند و قطعی سرور یا خاموش کردن ماژول نباید دیتابیس مقصد را وسط کار عوض کند. جدول قفل همیشه پیش از رجیستری خوانده می‌شود. اعتبارسنجی `dbName` فقط جدول قفل و الگوی `WarehouseOfflineDB_<scopeKind>` را می‌خواند، نه رجیستری (بدون بازگشت حلقوی). `scopeKind` باید با `^[a-z][a-z0-9_]*$` جور باشد.
- **ن۱۱. گیت بسته‌شونده:** گیت بازگردانی (`server-restore-gate.ts`) علاوه بر `getAllOfflineDbs()`، دیتابیس‌های روی دستگاه با پیشوند `WarehouseOfflineDB_` را از `Dexie.getDatabaseNames()` هم می‌شمارد. خطای خواندن یعنی گیت بسته.
- **ن۱۲. بدون حذف تازه با الگوی URL:** `purgeEphemeralQueueEntries` و رها کردن رکورد گذرا در `enqueue` همان دو دیتابیس قفل‌شده و همان الگوها را نگه می‌دارند و به دیتابیس‌های تازه گسترش نمی‌یابند.

**قرارداد `offlineSync`** (در `module-contract.ts`):

| فیلد | معنا | انبار | حسابداری |
| :--- | :--- | :--- | :--- |
| `scopeKind` | قلمرو صف | `warehouse` | `finance` |
| `dbName` | باید برابر `getScopedDbName(scopeKind)` باشد؛ ناهمخوان یعنی extension نادیده گرفته و خطا در کنسول | `WarehouseOfflineDB_warehouse` | `WarehouseOfflineDB_finance` |
| `scopeAliases` | نام‌های مستعار | — | `personnel`، `accounting` |
| `queueUrlPatterns` | زیررشته‌های URL اندپوینت (جای `resolveScopeFromUrl`) | `[]` (پیش‌فرض است) | هشت الگوی امروز |
| `activePathPatterns` | زیررشته‌های مسیر صفحه (گام ۲ `getCurrentActiveAppScope`) | `/app/warehouse`، `/warehouse` | `/app/finance`، `/finance`، `/personnel`، `/payroll` |
| `appRoutePrefixes` | پیشوند مسیر برای `currentScopeContext` در `user-menu` (`startsWith`) | پنج پیشوند امروز | پنج پیشوند امروز |

- ترتیب تطبیق: قلمروهای غیرپیش‌فرض به ترتیب رجیستری، سپس `warehouse`. این همان ترتیب امروز است (مالی پیش از انبار).
- `AppScope` به `'warehouse' | 'finance' | (string & {})` باز می‌شود، مثل `scopeKind`. این تصمیم جدول ۱ را برای این گام عوض می‌کند. ایمنی آن از ن۲ و ن۳ می‌آید، نه از نوع بسته.
- `getAllOfflineDbs()`: دو نمونهٔ قفل‌شده، سپس دیتابیس قلمروهای ثبت‌شدهٔ غیرقفل.
- `offlineSync.scopeKind` با `syncConfig.scopeKind` همان ماژول برابر است (spec این را می‌سنجد).

**نشست‌ها (هر کدام یک commit؛ انتشار فقط پس از همه، نه پس از نشست ۱۸ به تنهایی):**
- **نشست ۱۶ — تست مشخصه‌نگار، بدون تغییر کد:** spec تازهٔ `core/services/offline/offline-scope.characterization.spec.ts` که روی HEAD سبز است و این‌ها را قفل می‌کند:
  - جدول `normalizeScope`/`getScopedDbName` و جدول دست‌کم ۲۰ URL برای `resolveScopeFromUrl` (هر الگوی مالی، `doc-tasks`، `inventory`، `warehouses`، چت، اعلان، `null`).
  - حالت‌های `getCurrentActiveAppScope` (کلید سشن، مسیر، localStorage) و هویت نمونه‌ها (`toBe`) در `getOfflineDb`. هر ردیف یک بار با فهرست نصب‌شدهٔ سرور برابر «هر دو»، «فقط انبار» و «فقط حسابداری» اجرا می‌شود (ن۴ و ن۱۰).
  - مسیریابی `enqueue` (دیتابیس مقصد و `appScope`)، رها کردن رکورد گذرا، و `purgeEphemeralQueueEntries`.
  - `runQueueSequential` رکوردهای هر دو دیتابیس را با دیتابیس خودشان و به ترتیب `createdAt` می‌فرستد. شمارش‌ها و `getQueueEntries('all')` هر دو را جمع می‌کنند.
  - `buildScopedHeaders` و کلیدهای توکن `refreshAccessToken`.
  - API خطاها (`dismissError`، `deleteError`، `retryError`) با شناسهٔ تکراری در دو دیتابیس: رفتار «اولین یافته» امروز ثبت می‌شود.
  - ردیف‌های `currentScopeContext` در `user-menu` و کلید توکن `session-tab`، اگر specهای موجود ندارند.
- **نشست ۱۷ — دو مسیر ازدست‌رفتن داده که از قبل بوده است (یافتهٔ `data-loss-reviewer`):**
  - **`migrateLegacyDatabaseIfNeeded`:** `where('url')` روی ستون بی‌ایندکس خطای Schema می‌دهد، پس صف قدیمی هرگز منتقل نمی‌شود. `docTasks.bulkPut` هم در هر بار باز شدن برنامه نسخهٔ قدیمی را روی ویرایش‌های محلی تازه می‌نویسد.
    - اصلاح: مهاجرت تکرارپذیر. `docTasks` فقط کلیدهای نبوده اضافه می‌شوند و رکورد موجود هرگز بازنویسی نمی‌شود.
    - تکراری بودن رکورد صف با `filter` روی `url` و `method` و `createdAt` سنجیده می‌شود.
    - دیتابیس قدیمی حذف نمی‌شود.
    - قلمرو با `resolveLegacyScopeFromUrl` (ن۸) تعیین می‌شود.
  - **`operations-sync-monitor.ts`:** «نادیده گرفتن» و «حذف» خطا با همان `id` در هر دو دیتابیس اجرا می‌شوند و خطای بی‌ربط دیتابیس دیگر را پاک می‌کنند؛ این خطا تنها نسخهٔ بدنهٔ ردشده است.
    - اصلاح: هنگام بارگذاری، دیتابیس منبع هر خطا ثبت و فقط روی همان نوشته می‌شود.
- **نشست ۱۸ — قرارداد، ثبت و حل‌کننده:**
  - فیلد `offlineSync`، و ثبت آن در `modules/warehouse/module.ts` و `modules/accounting/module.ts`.
  - بازنویسی `normalizeScope`، `resolveScopeFromUrl`، `getCurrentActiveAppScope` و `getOfflineDb` با منبع `getAllModules()` (ن۱۰).
  - توابع تازهٔ `getAllOfflineDbs()`، `resolveOfflineDbStrict()` و `resolveLegacyScopeFromUrl`.
  - spec نشست ۱۶ بدون تغییر سبز می‌ماند.
  - spec تازه با ماژول ساختگی سوم (`registerModule`) این‌ها را می‌سنجد:
    - ماژول سوم دیتابیس خودش را می‌گیرد.
    - `dbName` ناهمخوان یا `scopeKind` نامعتبر نادیده گرفته می‌شود.
    - ماژولی که `finance` یا یکی از نام‌های قفل‌شده را با نام دیگری ادعا کند، نادیده گرفته می‌شود.
    - رکورد `finance` بدون ماژول حسابداری همچنان به `financeOfflineDb` می‌رسد.
    - `resolveOfflineDbStrict('xyz')` مقدار `null` می‌دهد.
- **نشست ۱۹ — خواننده‌ها:** فهرست ثابت دو دیتابیس با `getAllOfflineDbs()` جایگزین می‌شود:
  - `offline-queue-runner.ts`: حلقهٔ تخلیه، `getPendingCount`، `getUnsentCountStrict` و `getQueueEntries`.
  - `offline-sync.service.ts`: `initialize` (`sending` به `pending`) و `refreshCounts`.
  - مجموعهٔ `pendingSyncIds` در `sync-pull.service.ts` و `protectedIds` در `pruneOldLocalData`.
  - `clearAllScopedCaches`.
  - کلید تازهٔ `others` در `exportLocalDatabaseSnapshot`. کلیدهای `warehouse` و `finance` عوض نمی‌شوند.
  - `server-restore-gate.ts` طبق ن۱۱.
  - پاک‌سازی گذرا طبق ن۱۲ دست نمی‌خورد.
  - spec تازه: تخلیه، شمارش و گیت رکورد دیتابیس سوم را می‌بینند.
- **نشست ۲۰ — نویسنده‌ها (ن۹):**
  - `cancelQueueEntry`: بدون قلمرو در همهٔ دیتابیس‌ها جست‌وجو می‌کند. یافته در بیش از یکی یعنی رد.
  - `handleRetry` و `markTransportFailure` بدون `targetDb`.
  - `reconcileRejected`، `applyOptimisticUpdate`، `getCachedEntry` و `invalidateCache` در `offline-local-patcher.ts`.
  - API خطاها در `offline-conflict-manager.ts` قلمروی اختیاری می‌گیرند. بدون قلمرو، همان ترتیب «اولین یافته» نشست ۱۶ حفظ می‌شود.
  - spec نشست ۱۶ سبز؛ spec تازه: قلمرو ناشناخته هیچ نوشتنی انجام نمی‌دهد.
- **نشست ۲۱ — `user-menu` و `session-tab`:**
  - گام ۱ و ۲ `currentScopeContext` از `appRoutePrefixes` و `normalizeScope` خوانده می‌شود.
  - نرمال‌سازی قلمرو در `getScopedAccessToken`/`setScopedAccessToken` با `normalizeScope` انجام می‌شود.
  - کلیدهای `wh_access_token_finance` و `wh_access_token_warehouse` عوض نمی‌شوند.
  - specهای موجود و نشست ۱۶ سبز می‌مانند.
- **نشست ۲۲ — انتشار روی `app`:** پشتیبان و بیلد وصله‌شده؛ بدون مایگریشن.

**بیرون از این گام؛ پیش‌شرط ثبت یک ماژول واقعی سوم با `offlineSync`:**
- توکن و هدر برای قلمرو سوم:
  - `refreshAccessToken` فقط کلید توکن قلمرو فعال را می‌نویسد.
  - `resolveConflict` کلید توکن و `X-Active-App` را سخت‌کد دارد.
  - با ۴۰۱ یک قلمرو، تخلیهٔ همهٔ دیتابیس‌ها متوقف می‌شود.
- `deep-sync-modal`: دو بخش «انبارها» و «پروژه‌ها» با متن‌های خودشان، طراحی رابط است نه صف.
- `syncCursors` از راه پروکسی `offlineDb`، و `photoQueue` که به انبار سنجاق است.
- شمارش‌های نمایشی در `system-health` و `client-telemetry`.
- **محدودیت پذیرفته:** اگر ماژول سومی بعداً از بیلد حذف شود، دیتابیسش دیگر تخلیه نمی‌شود. داده حذف نمی‌شود و گیت بازگردانی (ن۱۱) آن را می‌بیند.

**بازبینی:**
- `data-loss-reviewer` روی طرح انجام شد (۲۹ مهر). یافته‌ها پذیرفته شدند: ن۹ تا ن۱۲، نشست ۱۷، و تقسیم نشست مصرف‌کننده‌ها به ۱۹ و ۲۰.
- پس از صف، `data-loss-reviewer` روی diff نشست‌های ۱۷ تا ۲۰ اجرا می‌شود.
- `ui-reviewer` لازم نیست، چون قالبی عوض نمی‌شود.

### گام ۵ — نگهبان‌ها و انتشار
- **نشست ۱۴:** شمارندهٔ `core_module_literals` در نگهبان ۲۹ (بک‌اند) و ۵۷ (فرانت) با قانون «افزایش ممنوع».
- **نشست ۱۵:** انتشار روی `app` (پشتیبان، بررسی مایگریشن، بیلد وصله‌شده؛ runner ری‌استارت می‌کند).

### گام ۶ — بستن پرونده ماژولارسازی (۲۹ مهر ۱۴۰۵)

به درخواست کاربر: همهٔ کارهای باقی‌مانده انجام شود و پرونده برای همیشه بسته شود. اجرا با Antigravity و `run_tasks.py`، نشست‌های ۲۵ تا ۳۰.

**معیار بستن پرونده:**
- لیترال نام ماژول (`warehouse`، `finance`، `personnel`، `accounting`) در هستهٔ بک‌اند (`warehouse-backend/core`) و فرانت (`core/` و `shared/`) فقط در دو حالت می‌ماند:
  - **قفل داده یا پروتکل:** نام فیلد و ستون (`warehouse`، `warehouse_id`)، مقدار ذخیره‌شده در دیتابیس (`app_module`، `app_scope`)، کلید توکن (`wh_access_token_*`)، مقدار هدر `X-Active-App`، و قفل نام دیتابیس‌های آفلاین.
  - **ابزار توسعه:** فقط `concurrency_stress_*`.
- بقیه از راه رجیستری و extension ماژول‌ها خوانده می‌شوند.
- نگهبان‌های ۲۹ و ۵۷ به‌جای «شمارش کمتر یا مساوی مبنا»، **فهرست مجاز دقیق** (`scripts/e2e/core_literal_allowlist.json`) را می‌سنجند:
  - هر ورودی فایل، متن خط، دسته و دلیل دارد.
  - لیترال بیرون از فهرست و ورودی کهنه هر دو شکست‌اند.
- مسیرهای ماژول (`app/finance/...`، `app/warehouse/...`) در `app.routes.ts` و هسته نمی‌مانند.
- پیش‌شرط‌های ماژول سوم بخش ۴.۱ بسته می‌شوند، جز `syncCursors` و `photoQueue` که دادهٔ دامنهٔ انبارند.

**نشست‌ها:**
- **۲۵ — بک‌اند:**
  - `export_excel` با POST، `app_scope` محدودیت کاربر را از همان بدنه بخواند.
  - پیش‌فرض‌های `'personnel'`/`'warehouse'` در `middleware.py`، `backup_views.py`، `session_views.py` و `query_engine/definitions.py` از `default_module()` رجیستری بیایند.
  - بازبین: `tenant-scope-reviewer`.
- **۲۶ — مسیرها و پرسونا (فرانت):**
  - تغییر مسیرهای قدیمی `app.routes.ts` و `warehouse.routes.ts` به فیلد تازهٔ `legacyRedirects` در قرارداد ماژول، در هر ماژول خودش.
  - `finance-audit` از `ROUTE_PERMISSIONS` هسته به `routeAccess` حسابداری.
  - `isGenericModuleApp` بدون فهرست سخت‌کد.
  - `CORE_SUPERUSER.app` از ماژول پیش‌فرض.
  - specهای مشخصه‌نگار گارد و پرسونا بدون تغییر سبز بمانند.
- **۲۷ — توکن، هدر و صف آفلاین (فرانت):**
  - تابع مشترک `getScopeSyncProfile(scope)` روی `syncConfig` (کلید توکن، `X-Active-App`، نقش پیش‌فرض) در `offline-queue-runner`، `offline-conflict-manager`، `refreshAccessToken`، `photo-upload-queue`، `auth.service`، `session-tab` و `websocket`.
  - مقادیر خروجی برای دو قلمرو فعلی عیناً همان امروز می‌ماند.
  - تخلیهٔ صف با `allSettled`: خرابی یک دیتابیس، بقیه را متوقف نمی‌کند.
  - `pendingSyncCount` خروجی پشتیبان، `others` را هم بشمارد.
  - بازبین: `data-loss-reviewer`.
- **۲۸ — بروزرسانی عمیق N-قلمرویی (فرانت، رابط):**
  - `deep-sync-modal` و بخش بروزرسانی عمیق `user-menu` بخش‌ها را از extension `userMenu` هر ماژول می‌سازند: قلمرو، عنوان‌ها و متن‌های فارسی، بارگذار فهرست.
  - ظاهر برای دو ماژول فعلی عیناً همان می‌ماند.
  - بازبین: `ui-reviewer`.
- **۲۹ — نگهبان‌ها:**
  - فهرست مجاز دقیق در نگهبان‌های ۲۹ و ۵۷، با دسته‌بندی همهٔ لیترال‌های باقی‌مانده.
  - شمارندهٔ تازهٔ مسیر ماژول در هستهٔ فرانت.
  - `--self-test` هر دو.
- **۳۰ — انتشار روی `app`.**

**بیرون از پرونده:** انتشار روی `soft` جداست و تأیید صریح کاربر را لازم دارد.

## ۳. روند نظارت

- runner از `run_tasks_agy.bat` در تب Windows Terminal اجرا می‌شود.
- پس از صف: `git status --untracked-files=all`، اجرای دوبارهٔ بررسی‌های کلیدی، و بازبین‌ها روی diff (`tenant-scope-reviewer` برای گام‌های ۱ و ۲، `data-loss-reviewer` برای نشست ۲، `ui-reviewer` لازم نیست چون قالب تغییر نمی‌کند).
- یافته‌های تأییدشده به تسک اصلاحی در `tasks.md` تبدیل می‌شوند.

## گزارش پیشرفت

- **۲۸ مهر ۱۴۰۵:** تغییرات commit‌نشده به سه commit جدا تقسیم شد (`b00b604`، `30648fb`، `74df67b`)؛ `offline-db.ts` به HEAD برگشت. صف نشست‌های ۱ تا ۱۵ نوشته و اجرا شد.
- **۲۹ مهر ۱۴۰۵ (۲۰ اکتبر ۲۰۲۶) — گام‌های ۰ تا ۳ و ۵ انجام شد؛ گام ۴ باز است.**
  - **Antigravity (نشست ۱ تا ۱۱):** `1af2e46`، `80c6f6a`، `5ee53a4`، `d3ffa29`، `b54e7a2`، `7116a7d`، `ef37446`، `e76f7c1`، `56dd579`، `5870acf`، `946e4b6`. نشست ۱۱ (یکی‌شدن گارد) ۳.۵ ساعت طول کشید.
  - **توقف صف:** نشست ۱۲ پیش از commit با خطای API گوگل (`User location is not supported`) متوقف شد. به دستور کاربر، runner پس از آن خاموش ماند و Claude باقی کار را خودش انجام داد.
  - **Claude:**
    - `ab8a22b` نشست ۱۲: diff عامل همراه با helper مشترک `core/modules/documents-archive-route.ts`.
    - `56dc7ff` و `b4d5e5b` پس‌رفت‌های نشست ۱۱:
      - گاردهای match ماژول همیشه `true` می‌دادند. چون هیچ مسیری از آن‌ها استفاده نمی‌کرد، حذف شدند و رفتار canMatch واقعی `dynamicModuleRoutes` تست شد.
      - بررسی صفحه دوباره پس از بررسی پرسونا و فقط برای صفحه‌های دارای مجوز اجرا می‌شود.
      - `getAllModules()` جای دسترسی خصوصی به رجیستری را گرفت.
    - `19ccdf6` نشست ۱۳: فیلدهای تازه `homeIsModuleDefault` و `lastResortRoute` در `ModulePersonas`. فهرست `isGenericModuleApp` ماند، چون spec ماژول عمومی، spec انبار را بدون `routeAccess` mock می‌کند.
    - `c72c6e6` نشست ۱۴: شمارندهٔ `core_module_literals` با مقدار ۶۵ در بک‌اند و ۱۸۹ در فرانت، با قانون «افزایش ممنوع» و `--self-test`.
  - **یافته‌های بازبینی و اصلاح:**
    - **باگ ازپیش‌موجود ممیزی** (`147470d`): `exclude` روی کلید JSON `event` برای ردیف‌های بدون این کلید NULL می‌شد و فیلتر قلمرو انبار/مالی در فهرست، آمار و اکسل همیشه خالی برمی‌گشت. تست نشست ۶ مقادیر درست را قفل می‌کند.
    - **ایمنی داده تب پشتیبان** (`4976822`، `1f009f2`):
      - گیت در لحظهٔ تأیید هم اجرا می‌شود.
      - عکس‌های ارسال‌نشده هم شمرده می‌شوند.
      - خطای خواندن صف گیت را بسته نگه می‌دارد.
      - پس از بازیابی، کش هر دو قلمرو پاک و کاربر خارج می‌شود.
      - بازیابی سرور در `WhSettings` که از گیت دور می‌زد، حالا از همان گیت مشترک `core/services/server-restore-gate.ts` می‌گذرد.
    - **پاک‌سازی** (`1230b4c`): توابع تکراری `_get_user_warehouse_extension` و `get_report_scope_handler` و نام مستعار بی‌استفاده حذف شدند.
  - **بازبین‌ها:**
    - `tenant-scope-reviewer` روی نشست‌های ۳ تا ۱۰ و روی `147470d`/`1230b4c`: هیچ نشتی پیدا نشد.
    - `data-loss-reviewer` روی نشست ۲ و روی `4976822`: یافته‌ها همه اصلاح شدند.
  - **آزمون‌ها:**
    - بک‌اند: ۹۰۲ تست؛ فقط شکست شناخته‌شدهٔ پوش چت (`test_broadcast_query_count_independent_of_participants`) ماند که پیگیری کار پوش است، نه فاز ۴.
    - فرانت: `ng-test-compare` کامل نسبت به `ef99e43` بدون پس‌رفت؛ فقط ۲ شکست ازپیش‌موجود `employee-new-vehicle`.
    - نگهبان‌های ۲۹، ۳۱، ۵۶ و ۵۷ سبزند.
  - **انتشار روی `app`:**
    - پشتیبان `backup_20261020_125454.dump`.
    - بدون مایگریشن باز.
    - بیلد وصله‌شده.
    - Daphne و worker ری‌استارت شدند.
    - Express (4200) و `cloudflared` خاموش بودند و دوباره در تب WT راه افتادند.
    - `release-check` سبز شد.
  - **باز:**
    - گام ۴ (صف آفلاین N-قلمرویی): صف جدا، پس از بازبینی طراحی با `data-loss-reviewer`.
    - `export_excel` با POST، `app_scope` را از بدنه می‌خواند ولی محدودیت کاربر از query string. این نشت نیست و فقط نتیجه را سخت‌گیرانه‌تر می‌کند، ولی ناهمخوانی است.
    - ~~صفحه‌های پشت ورود را باید کاربر بررسی کند.~~ انجام شد (پایین).
  - **بررسی پشت ورود روی `localhost:4300`** (به درخواست کاربر، با سه حساب تست موقت `qa_admin`، `qa_wh` و `qa_fin` که پس از بررسی حذف شدند؛ ۱۳ ردیف، همه متعلق به خود حساب‌ها):
    - **حسابدار:** `/app/finance` به `accountant-payroll` می‌رود. `/app/warehouse/dashboard` به پیش‌فرض مالی و `/app/operations/users` به خانهٔ نقش برمی‌گردد. مسیر قدیمی `/company-documents` به `/app/finance/company-documents` می‌رود.
    - **انباردار:** صفحهٔ مالی به `/app/warehouse/counter` برمی‌گردد. اسناد شرکت با دسترسی شرکت باز می‌شود و کارتابل سرپرست هم باز است.
    - **مدیر:** `active_app_module` از روی آدرس درست عوض می‌شود (`warehouse`، `personnel`، `operations`).
    - **بازگشت سریع:** پنجره با صف خالی باز و بدون تأیید بسته شد. با یک عکس در انتظار (mock در حافظه، بدون نوشتن داده) پنجره باز نشد و پیام صف آفلاین آمد.
    - **ممیزی روی دادهٔ `app`:** فقط ۱۱ ردیف وجود دارد (۱۰ ردیف `CROSS_APP_DENIED` و یک ردیف سیستمی)، پس صفر بودن قلمروهای انبار و مالی درست است.
    - **نکتهٔ محیطی:** پنل مرورگر داخلی وقتی رسم نمی‌کند، `requestAnimationFrame` اجرا نمی‌شود و ناوبری داخل برنامه (`withViewTransitions`) معلق می‌ماند. این باگ برنامه نیست؛ بررسی با بارگذاری مستقیم آدرس انجام شد.
- **۲۹ مهر ۱۴۰۵ (۲۰ اکتبر ۲۰۲۶، عصر) — گام ۴ انجام و روی `app` منتشر شد.**
  - **طرح:** بخش ۴.۱ با `data-loss-reviewer` بازبینی شد. ناوردایی‌های ن۹ تا ن۱۲ و نشست ۱۷ از همان بازبینی آمدند. کاربر طرح را «تایید» کرد. اجرا با `run_tasks.py`.
  - **اجرای اول:** Gemini جواب خالی می‌داد و سرور زبانی مدام دوباره راه می‌افتاد. پس از ری‌استارت کامپیوتر درست شد.
  - **Antigravity:**
    - `ae4ce5a` نشست ۱۶: spec مشخصه‌نگار، ۱۸ تست.
    - `ed25d84` نشست ۱۷: مهاجرت دیتابیس قدیمی بدون بازنویسی `docTasks` و بدون `where('url')`؛ مانیتور همگام‌سازی فقط روی دیتابیس منبع خطا می‌نویسد.
    - `5e26a14` نشست ۱۸: `offlineSync`، `getAllOfflineDbs`، `resolveOfflineDbStrict`، `resolveLegacyScopeFromUrl`.
    - `3fba47f` نشست ۱۹: خواننده‌ها، گیت بازگردانی با `getDatabaseNames`، و کلید `others` در خروجی پشتیبان.
    - `5aae4f0` نشست ۲۰: نویسنده‌های سخت‌گیر. یک دور اصلاح لازم شد؛ دو تست `session-tab` در دور اول شکست خوردند.
    - `b9784d5` نشست ۲۱: `user-menu` و `session-tab`.
    - `382e0e3` نشست ۲۳ (اصلاح بازبینی): ثابت‌های صریح قلمرو به‌جای خواندن از ترتیب کلیدهای `SCOPED_DB_NAMES`؛ مهاجرت صف قدیمی با «ادعا پیش از افزودن» و قفل میان‌تبی `navigator.locks`.
  - **بازبین‌ها:** `data-loss-reviewer` روی `42071e5..b9784d5` هیچ یافتهٔ بحرانی یا بالایی نداشت. تنها یافتهٔ متوسط (ارسال دوبارهٔ رکورد صف در مهاجرت) در نشست ۲۳ اصلاح شد. یافته‌های کم‌اهمیت فقط با ماژول سوم رخ می‌دهند و به پیش‌شرط‌های آن افزوده شدند: تخلیه با `allSettled`، و `pendingSyncCount` خروجی پشتیبان بدون `others`.
  - **آزمون‌ها:** در هر نشست، `ng-test-compare` کامل نسبت به `64b2c17` بدون پس‌رفت بود، و نگهبان‌های ۳۴، ۵۶ و ۵۷ سبز بودند.
  - **انتشار روی `app`:**
    - نشست ۲۲: `release-check` با 530 شکست خورد، چون پس از ری‌استارت کامپیوتر Express (4200) و `cloudflared` بالا نیامده بودند. Claude هر دو را در تب WT راه انداخت.
    - نشست ۲۴: پشتیبان `backup_20261020_201732.dump` و `release-check` سبز.
  - **باز:**
    - بررسی رفتار صف آفلاین روی دستگاه واقعی (ثبت آفلاین و همگام‌سازی) پشت ورود است.
    - پیش‌شرط‌های ثبت ماژول سوم با `offlineSync` در بخش ۴.۱ آمده است.
    - کارهای کوچک باقی‌مانده: `export_excel` (POST)، فهرست `isGenericModuleApp`، `CORE_SUPERUSER.app`، تغییر مسیرهای قدیمی `app/finance`، `finance-audit` در `ROUTE_PERMISSIONS`.
    - کاهش شمارنده‌های لیترال، که فاز جداگانه است.

</div>
