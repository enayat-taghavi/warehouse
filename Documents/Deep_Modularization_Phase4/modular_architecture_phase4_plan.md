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

### گام ۷ — بستن وابستگی‌های بی‌نام (۳۰ مهر ۱۴۰۵)

به درخواست صریح کاربر، **اجرا با خود Claude** است (نه Antigravity) و پرونده باید کامل بسته شود. مبنا: `scratch/modular_closeout_handoff.md`.

**هدف:** هسته و پوسته نه‌تنها نام ماژول، بلکه **مفهوم ماژول** را هم نشناسند: کدهای مجوز، سرویس دامنهٔ انبار، و نماهای دوقلمرویی. یک ماژول سوم واقعی آمادگی N-ماژولی را اثبات کند.

**اندازه‌گیری پایه (۳۰ مهر، با `scratch/step7/scan_perm_codes.py`):**
- ۵۶ کد مجوز متعلق به ماژول‌ها، ۲۵۲ بار در هسته و پوسته:
  - بک‌اند: `accounts/models.py` (۵۶)، `seed_permissions.py` (۵۱)، `user_views.py` (۷)، `audit_views.py` (۲)، `companies/permissions.py` (۱)، `query_engine/definitions.py` (۱).
  - فرانت: `users.ts` (۵۸)، `users.helpers.ts` (۵۵)، `auth.service.ts` (۱۱، دادهٔ mock)، `layout.ts` (۷)، `auth.guard.ts` (۲)، `permission.directive.ts` (۱، توضیح).
- این عدد از عدد handoff بیشتر است، چون `can_act_as_*` و `perm_rec_*` و `perm_wh_*` هم شمرده شدند.

**تصمیم‌ها:**

| موضوع | تصمیم |
| :--- | :--- |
| منبع کدهای مجوز | هر ماژول در `modules/<m>/module.py` فهرست `PERMISSIONS` (کد و نام فارسی) و `PERMISSION_CODENAMES` کامل را اعلام می‌کند. فرانت همان کدها را در `users.permissionGroup` ماژول دارد و نگهبان برابری دو فهرست را می‌سنجد. |
| ساخت ردیف‌های مجوز | از `CustomUser.Meta.permissions` فقط مجوزهای پلتفرم می‌ماند. ردیف‌های مجوز ماژول‌های نصب‌شده را یک گیرندهٔ `post_migrate` می‌سازد: فقط `get_or_create`، هیچ حذف یا تغییر نامی. migration فقط `AlterModelOptions` است (بدون SQL). هیچ ردیف `Permission` یا انتساب نقشی حذف نمی‌شود. |
| مصرف مجوز در هستهٔ بک‌اند | از راه `contribute`/`contributions`: `audit_view_perms`، `key_role_permissions`، `user_directory_perms`، `org_structure_write_perms` (موجود)، `sensitive_field_bypass_perms`. |
| مصرف مجوز در پوسته | فیلدهای تازهٔ قرارداد: `users.permissionGroup` (جای `permissionGroupKeys`)، `users.shortPermissionNames`، `users.standalonePermissionTooltips`، `users.structureWritePermissions`، و `ModuleNavItem.anyPermissions`. |
| `WarehouseHttpService` | دو تکه می‌شود: سرویس کامل CRUD به `modules/warehouse/api/` می‌رود و فقط ماژول انبار آن را دارد. هسته سرویس فقط‌خواندنی و عمومی `ScopeDirectoryService` را دارد که اندپوینتش را extension تازهٔ `scopeDirectory` ماژول صاحب آن می‌دهد. |
| برچسب «انبار/پروژه» صفحهٔ کاربران | extension تازهٔ `users.assignmentScope` با `priority`، بارگذار فهرست و برچسب‌های فارسی. نخستین ماژول در دسترس برچسب را می‌دهد. خطای بارگذاری به ماژول بعدی می‌رود، مثل امروز. |
| نماهای سلامت و پایش همگام‌سازی | N-قلمرویی از روی `healthDashboard.panels` و `operations.syncMonitor` ماژول‌ها. برای دو ماژول فعلی متن و ظاهر عیناً همان می‌ماند. نام و کلید دیتابیس‌های آفلاین قفل می‌مانند (قاعدهٔ داده). `syncCursors` و `photoQueue` انبارمحور می‌مانند (بخش ۴.۱). |
| ماژول سوم | ماژول واقعی `showcase` با بک‌اند (`modules/showcase/`، بدون مدل و migration) و فرانت (`modules/showcase/module.ts`، یک صفحه). **opt-in** است: فقط وقتی صریحاً در `WH_MODULES` یا `--modules` بیاید نصب می‌شود. پس روی `app` و `soft` نه نصب می‌شود، نه جدولی می‌سازد. به‌عنوان الگوی ماژول تازه و اثبات زنده در مخزن می‌ماند. |

**زیرگام‌ها** (هر کدام commit جدا):
- **۷.۱ — مالکیت مجوز در بک‌اند:**
  - `PERMISSIONS` و `PERMISSION_CODENAMES` کامل در `module.py` دو ماژول (۴ کد حسابداری و ۲ کد انبار که فقط فرانت داشت، اضافه می‌شوند).
  - `module_catalog`: `MODULE_PERMISSIONS` و `installed_module_permissions()`.
  - `accounts`: `Meta.permissions` فقط پلتفرم، migration فقط-وضعیت، گیرندهٔ `post_migrate`، و `seed_permissions` = پلتفرم + اعلام ماژول‌ها.
  - جایگزینی کدهای ماژول در `audit_views`، `user_views`، `companies/permissions.py` و `query_engine/definitions.py` با contributionها.
  - بازبین: `tenant-scope-reviewer`. مهارت `safe-migration` پیش از migration.
- **۷.۲ — مالکیت مجوز در فرانت:** گروه‌بندی مجوزهای `users.ts`، `SHORT_PERMISSION_NAMES`، راهنمای مجوزها، `STRUCTURE_WRITE_PERMS`، فیلتر منوی `audit` و `count-tracking` در `layout.ts`، و مثال `permission.directive.ts` از اعلام ماژول‌ها خوانده می‌شوند. دادهٔ mock `auth.service.ts` با دستهٔ ابزار توسعه در فهرست مجاز می‌ماند.
- **۷.۳ — فهرست قلمرو:**
  - `ScopeDirectoryService` در هسته و جابه‌جایی CRUD انبار به ماژول.
  - ۱۱ مصرف‌کنندهٔ بیرون از انبار (حسابداری ۷، پوسته ۳، `user-menu`) به سرویس عمومی می‌روند.
  - `users.assignmentScope` جای `hasInventoryModule`/`hasAccountingModule`.
  - بازبین: `ui-reviewer`.
- **۷.۴ — نماهای N-قلمرویی:**
  - `health-dashboard`، `operations-sync-monitor`، شمارش رکوردهای `system-health.service` (`recordsByScope`)، `id-cards` و شیم‌های قدیمی `LOCKED_OFFLINE_SCOPES` در `deep-sync-modal`/`user-menu` اگر مصرف‌کننده‌ای ندارند.
  - شبیه‌ساز تداخل پایش همگام‌سازی و سناریوهای تست فشار به اعلام ماژول می‌روند.
  - بازبین‌ها: `data-loss-reviewer` و `ui-reviewer`.
- **۷.۵ — ماژول سوم `showcase`:**
  - پرچم `opt_in` در `ModuleSpec` و `optIn` در قرارداد فرانت. پروفایل پیش‌فرض بک‌اند و `gen-installed-modules.js` ماژول opt-in را فقط با نام صریح نصب می‌کنند.
  - بک‌اند: اپ `showcase` با یک API فقط‌خواندنی و مجوز خودش.
  - فرانت: یک صفحه، منو، گروه مجوز، پنل سلامت و قلمرو آفلاین خودش.
  - اثبات: نگهبان ۳۱ با پروفایل‌های `showcase` و `accounting,showcase,warehouse`؛ بیلد تک‌ماژولی `showcase`؛ آزمون‌های واحد نماهای N-قلمرویی با قلمرو سوم.
- **۷.۶ — نگهبان‌ها:**
  - شمارندهٔ `module_permission_literals` در ۲۹ (بک‌اند) و ۵۷ (فرانت)، برگرفته از اعلام‌های `module.py` (نه فهرست دستی). باید صفر یا در فهرست مجاز دقیق باشد.
  - `cross_module_permission_literals` = ۰.
  - برابری کدهای گروه فرانت و بک‌اند هر ماژول.
  - شمارندهٔ `locked_scope_refs` (`LOCKED_OFFLINE_SCOPES`، `warehouseOfflineDb`، `financeOfflineDb`) بیرون از سرویس‌های آفلاین هسته و ماژول صاحب.
  - `--self-test` هر سه.
- **۷.۷ — راستی‌آزمایی و انتشار:**
  - `ng-test-compare` کامل، آزمون‌های بک‌اند (حداقل ۹۰۰)، نگهبان‌های ۲۹، ۳۰، ۳۱، ۳۳ تا ۳۶، ۵۲، ۵۵، ۵۶، ۵۷ و نگهبان تازه.
  - بررسی دیداری روی `localhost:4300` با حساب موقت `qa_*`.
  - انتشار روی `app` و گزارش پیشرفت. `soft` فقط با تأیید صریح کاربر.

**معیار بستن:**
- کد مجوز ماژول، سرویس دامنهٔ ماژول و فرض «دقیقاً دو قلمرو» در هسته و پوسته صفر است، جز فهرست مجاز دقیق.
- ماژول سوم بی‌تغییر هسته نصب، بیلد و آزموده می‌شود.
- هیچ داده‌ای (ردیف مجوز، انتساب نقش، صف آفلاین، کش) حذف نمی‌شود.

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

- **گام ۶ — نشست‌های ۲۵ تا ۲۸ (۲۹–۳۰ مهر ۱۴۰۵):**
  - **روند:** runner نشست ۲۵ را با Antigravity اجرا کرد (`c42e3f3`). به درخواست کاربر، Claude نشست‌های ۲۶ تا ۲۸ را خودش انجام داد تا کار سریع‌تر پیش برود. runner درست پس از `[DONE]` نشست ۲۵ متوقف شد. نشست‌های ۲۶ تا ۲۸ در `tasks.md` با دست `[DONE]` شدند.
  - **۲۵ (بک‌اند):** `tenant-scope-reviewer` دو یافته داشت:
    - **تأییدشده و اصلاح‌شده (`978050c`):** شاخهٔ POST در `get_queryset` مشترک بود، پس `revert` و `bulk_revert` هم `app_scope` را از بدنه می‌خواندند و محدودیت کاربر غیرسوپریوزر شُل می‌شد. حالا فقط `export_excel` قلمرو بدنه را صریح می‌دهد. یک تست رگرسیون اضافه شد که روی کد قبلی شکست می‌خورد.
    - **انحراف آگاهانه:** در پروفایل کامل `default_module()` برابر `accounting` است، نه `warehouse`. اثرش فقط دو چیز است: اعتبارسنجی بی‌معنای `scope_id` انبار روی گزارش‌های مالی و `users` حذف شد (داده همان است، چون `scope_resolver` دارند)، و fallback قلمرو در heartbeat و system-health از active app درخواست پیروی می‌کند (کلاینت همیشه `app_scope` می‌فرستد).
  - **۲۶ (`c5551da`):**
    - ۲۰ ریدایرکت انبار و ۵۱ ریدایرکت مالی، به‌اضافهٔ `app/warehouse/attendance`، به `legacyRedirects` ماژول‌ها رفتند. `finance-audit` به `pagePermissions` حسابداری رفت. `isGenericModuleApp` حالا بر پایهٔ `syncConfig` و دیتابیس قفل‌شده است.
    - **انحراف:** `CORE_SUPERUSER.app` همان `'personnel'` ماند، چون spec مشخصه‌نگار پرسونا آن را قفل کرده است.
    - spec در `src/app/app.legacy-redirects.spec.ts` است (ریشهٔ ترکیب)، چون نگهبان ۵۷ ایمپورت از `core/` به ماژول را حتی در spec رد می‌کند. یک تست هم ثابت می‌کند Angular پس از ناکامی فرزندان ماژول انبار به ریدایرکت ریشه برمی‌گردد.
  - **۲۷ (`32bbee9`، اصلاح بازبینی `1e769c0`):**
    - `getScopeSyncProfile` و `DEFAULT_OFFLINE_SCOPE`: دو قلمرو قفل از جدول ثابت می‌آیند و ماژول نمی‌تواند کلید توکن قفل را بگیرد. drain و شمارنده‌ها با `allSettled` کار می‌کنند و `getUnsentCountStrict` بسته-در-خطا ماند.
    - `data-loss-reviewer` هیچ مسیر داده‌سوزی پیدا نکرد. یک یافتهٔ متوسط داشت: با یک دیتابیس ناخوانا، نتیجهٔ drain «کامل» گزارش می‌شد. اصلاح شد: نتیجه `partial` با `unreadableDbs` است و پیام هشدار در layout نشان داده می‌شود.
  - **۲۸ (`21626d9`):**
    - `DeepSyncSectionSpec` در `userMenu.deepSync` اضافه شد. هر ماژول متن‌ها، رنگ، `initialItems`، `preselectId` و `loadItems` خودش را دارد. `WarehouseHttpService` تنبل ایمپورت می‌شود تا چرخهٔ ایمپورت ساخته نشود.
    - دیالوگ و منوی کاربر عمومی شدند. API قدیمی (`warehouses`، `projects`، `selectedWarehouseIds`، `warehouseIds`/`projectIds`) روی `LOCKED_OFFLINE_SCOPES` تازهٔ `offline-db.ts` ماند تا specهای موجود فقط در setup عوض شوند (`tests-kept`: ۱۴ و ۱۷ تست، بدون کاهش). `idsByScope` فقط وقتی قلمرو سومی انتخاب شده باشد فرستاده می‌شود.
    - spec تازه `deep-sync-sections.spec.ts` پنج تست دارد.
  - **آزمون‌ها:** `ng-test-compare` روی core، shared، offline و layout بدون پس‌رفت بود. build و نگهبان‌های ۳۴، ۵۶ و ۵۷ سبز بودند. تست‌های بک‌اند audit (۱۶) هم سبز بودند. شمارندهٔ لیترال فرانت از ۱۸۹ به ۵۶ رسید.
  - **باز:**
    - `ui-reviewer` روی `21626d9` و بررسی دیداری دیالوگ روی `localhost:4300` (با حساب موقت `qa_*`) هنوز انجام نشده است.
    - معیار بستن پرونده هنوز برآورده نیست. ۵۶ لیترال فرانت باقی مانده است: بخشی قفل داده یا پروتکل‌اند (`offline-db.ts`، مقدار ذخیره‌شدهٔ `active_app_module` در `session-tab`، نام پارامتر `warehouse_id`) و بقیه ارجاع سادهٔ ماژول‌اند. ارجاع‌های ساده: union نوع در `auth.service` و `session-tab` و `audit-log.model`، پیش‌فرض در `websocket` و `client-telemetry` و `offline-conflict-manager` و `offline-local-patcher` و `auth.interceptor`، `canAccessApp('warehouse'|'accounting')` در `app-persona`، `scopeKind === 'warehouse'` در `warehouse-http.service`، شاخه‌های قلمرو در `performDeepUpdate` و `sync-pull` (۲۰۸ و ۲۲۹)، و `conflict-resolution-modal`. فهرست کامل با خط در `scratch/s28_literals2.txt` است. ۵۵ لیترال بک‌اند همه فیلد داده، مقدار ذخیره‌شده، پروتکل یا ابزار توسعه‌اند.
  - **اقدام بعدی:**
    1. `ui-reviewer` روی `21626d9` و بررسی دیداری.
    2. یک نشست پاک‌سازی برای ارجاع‌های سادهٔ باقی‌مانده در فرانت.
    3. نشست ۲۹ (فهرست مجاز دقیق؛ متن آن در `tasks.md` باید با فهرست نهایی هم‌خوان شود).
    4. انتشار روی `app` و بستن پرونده.

- **گام ۶ — پاک‌سازی، نشست ۲۹، انتشار و بستن پرونده (۳۰ مهر ۱۴۰۵):** همه را Claude در یک نشست انجام داد. runner و Antigravity به کار گرفته نشدند.
  - **بازبینی `21626d9` (نشست ۲۸):**
    - `ui-reviewer` در سه زمینهٔ انبار، مالی و مرکز عملیات پس‌رفتی پیدا نکرد.
    - تنها یافتهٔ دیدنی این بود که وقتی دریافت فهرست شکست می‌خورد، متن «یافت نشد» نشان داده می‌شد. حالا دیالوگ در حین دریافت «در حال دریافت فهرست…» نشان می‌دهد. در صورت شکست، پیام خطا و دکمهٔ «تلاش دوباره» می‌آید و دکمه هنگام تلاش دوباره غیرفعال می‌ماند تا فوکوس گم نشود.
    - برچسب گزارش پایانی escape می‌شود و `accent` نوع `ModuleAccent` دارد.
    - بازبینی دوم UI روی این اصلاح‌ها فقط چهار مورد کم‌اهمیت دسترس‌پذیری داشت که همه اصلاح شدند.
    - بررسی دیداری روی `localhost:4300` با حساب موقت `qa_admin` انجام شد. دیالوگ در هر سه زمینه همان بخش‌ها، متن‌ها و ترتیب قبلی را دارد، و منوی تعویض سامانه همان ظاهر را. حساب‌های `qa_*` پس از پیش‌نمایش آبشاری حذف شدند.
  - **پاک‌سازی ارجاع‌های ساده (`2620fbf`):** لیترال‌های هستهٔ فرانت از ۵۶ به ۱۰ رسیدند.
    - `syncConfig` چهار نقطهٔ توسعهٔ تازه گرفت: `targetLabelFa`، `legacyCursorKey`، `purgeBeforeDeepUpdate` و `purgeOnAccessRevoked`. کد پاک‌سازی بی‌کم‌وکاست از `performDeepUpdate` و `sync-pull` به ماژول‌ها رفت و با import پویا بارگذاری می‌شود تا چرخهٔ ایمپورت ساخته نشود.
    - قلمروی بدون hook دیگر پاک‌سازی انبار را اجرا نمی‌کند. پیش‌تر هر قلمرو غیرمالی به شاخهٔ انبار می‌افتاد.
    - منوی تعویض سامانه از `launcherTile.switcher` ساخته می‌شود. `hasWarehouseAccess` و `hasPersonnelAccess` از هسته حذف شدند و لانچر به `canAccessApp` رفت.
    - حساس بودن تداخل (تفکیک وظایف) از `offlineSync.sensitiveConflicts` و تابع `isSensitiveConflictScope` می‌آید.
    - `DEFAULT_ACTIVE_APP_MODULE`، `DEFAULT_OFFLINE_SCOPE` و ثابت‌های قلمرو جای پیش‌فرض‌ها و unionهای نوع را گرفتند. `isWarehouseAvailable` حالا از `crossModuleFilters.warehouseScopeFilter` خوانده می‌شود.
    - **انحراف:** `CORE_SUPERUSER.app` حالا `DEFAULT_ACTIVE_APP_MODULE` است. مقدارش همان `'personnel'` است و spec مشخصه‌نگار سبز ماند.
    - `data-loss-reviewer` یافته‌ای نداشت.
  - **نشست ۲۹ (`5067245`):**
    - `scripts/e2e/core_literal_allowlist.json` و کمکی `core_literal_allowlist.py` هر لیترال باقی‌مانده را با فایل، متن خط، دسته و دلیل ثبت می‌کنند: ۵۵ مورد بک‌اند و ۱۰ مورد فرانت.
    - دسته‌ها `data_field`، `stored_value`، `protocol`، `offline_db_lock` و `dev_tooling` هستند. `dev_tooling` فقط برای فایل‌های `concurrency_stress_*` پذیرفته می‌شود.
    - نگهبان‌های ۲۹ و ۵۷ به‌جای آچار مبنا، با این فهرست می‌سنجند. لیترال بیرون از فهرست، ورودی کهنه، دستهٔ ناشناخته و دلیل خالی همه شکست‌اند.
    - شمارندهٔ تازهٔ `core_module_route_paths` در نگهبان ۵۷ پیشوند مسیر ماژول‌ها را از `module.ts` کشف می‌کند. این شمارنده در هسته، shared و ریشهٔ ترکیب باید صفر باشد و صفر است.
    - `--self-test` هر دو نگهبان سبز است.
  - **پیش‌شرط‌های ماژول سوم بخش ۴.۱ (`a922d71`):**
    - `refreshAccessToken(scope)` توکن تازه را در کلید قلمرو رکورد هم می‌نویسد. سرور با `allowed_apps` کاربر مجوز می‌دهد، نه با ادعای `active_app` توکن.
    - ۴۰۱ پس از refresh فقط صف همان دیتابیس را نگه می‌دارد و قلمروهای دیگر تخلیه می‌شوند. نتیجه همچنان `auth-required` است.
    - شمارش‌های `system-health` (`otherRecords`) و heartbeat روی همهٔ دیتابیس‌ها انجام می‌شوند.
    - `data-loss-reviewer` یافته‌ای نداشت. دو نکتهٔ جزئی آگاهانه رها شدند: اولویت `auth-required` بر `server-unreachable` در یک اجرای مختلط، و ثبت زمان آخرین همگام‌سازی وقتی بخشی از صف ارسال شده است.
    - پیش‌شرط‌ها بسته‌اند، جز `syncCursors` و `photoQueue` که دادهٔ دامنهٔ انبارند.
  - **آزمون‌ها:**
    - `ng-test-compare` کامل نسبت به `c25ffd5` پس‌رفتی نداشت (۱۵۵۳ قبول؛ ۲ شکست پیشین `employee-new-vehicle`).
    - اجراهای محدود پس از هر تغییر هم سبز بودند: ۱۷۳ و ۲۷۹ قبول، بدون شکست. ۹ آزمون تازه اضافه شد.
    - مجموعهٔ کامل بک‌اند: ۹۰۶ آزمون، فقط ۱ شکست شناخته‌شده و هیچ شکست تازه‌ای.
    - نگهبان‌های ۲۹، ۵۲، ۵۵، ۵۶ و ۵۷ سبز بودند. بیلد dev و production قالب‌ها را بی‌خطا کامپایل کرد.
  - **انتشار روی `app` (نشست ۳۰):**
    - پشتیبان `backup_20261021_010526.dump` گرفته شد. مهاجرت اعمال‌نشده‌ای نبود.
    - بیلد patch‌شده ساخته شد. Daphne و ورکر GDrive دوباره راه‌اندازی شدند، چون Daphne پیش از کامیت‌های بک‌اند نشست ۲۵ بالا آمده بود.
    - هر دو آدرس `app.farsalish.ir/` و `/api/public/config/` پاسخ ۲۰۰ دادند. heartbeat ورکر تازه بود و `ngsw.json` سرو‌شده با بیلد تازه یکی بود.
  - **وضعیت:** پرونده بسته است. معیار بستن برقرار است و نگهبان‌ها آن را نگه می‌دارند.
  - **بیرون از پرونده:**
    - انتشار روی `soft` تأیید صریح کاربر را لازم دارد.
    - بررسی صف آفلاین روی دستگاه واقعی پشت ورود است و کار کاربر است.

- **پس از بستن — پوستهٔ مشترک و ارجاع بین‌ماژولی (۳۰ مهر ۱۴۰۵، به درخواست کاربر «تا حل کامل»):**
  - **یافته:** معیار بستن فقط `core/` و `shared/` (ts) را می‌شمرد. بیرون از آن هنوز نام ماژول بود:
    - پوستهٔ مشترک `modules/common`: ۱۶۷ لیترال و ۳۰ مسیر ماژول.
    - قالب‌های html در `shared/`.
    - ارجاع حسابداری به اپ‌های انبار در بک‌اند: GDrive، seed و نگهبان فاز.
  - **فرانت (`0fc5721`):** همهٔ این بخش‌ها حالا از extension ماژول‌ها ساخته می‌شوند:
    - کارت‌های غنی لانچر، دکمه و منوی تعویض سامانه، پیوندهای پوستهٔ عملیات، تنظیمات منبع اتاق فرماندهی، نشان پایش همگام‌سازی و داشبورد سلامت.
    - ممیزی: قلمروها، برچسب‌ها، سربرگ و ماژول‌های لاگ.
    - کاربران: قلمرو نقش‌ها، نشان‌ها و قالب‌های آمادهٔ نقش. قالب‌ها به `modules/*/role-presets.ts` رفتند.
    - layout: عنوان، منوها و مسیر تب‌ها (`appTitleFa`، `extraRouteTabs`).
    - ورود و تغییر رمز: تابع مشترک `resolveLoginLanding`.
    - اندپوینت فهرست انبارها و نوع موجودیت صف بر اساس URL را ماژول صاحب آن اعلام می‌کند.
    - ظاهر برای دو ماژول فعلی همان است؛ تنها تفاوت، شمار درست قالب‌های حسابداری است (۶ به‌جای ۵ ثابت).
  - **بک‌اند (`0fc5721`):**
    - GDrive منبع فایل‌ها را از رجیستری پلتفرم می‌خواند. انبار `ItemPhoto` را با `file_sync_sources` ثبت می‌کند و به `file_sync_sinks` خبر می‌دهد.
    - حسابداری دیگر اپ انبار را ایمپورت یا `get_model` نمی‌کند؛ به‌جایش `resolve_entity` و `default_entity:warehouse` به کار می‌رود.
    - آزمون برابری حقوق نگهبان فاز حالا به یک شرکت آزمون اختصاصی محدود است. این یافتهٔ `tenant-scope-reviewer` بود: بدون آن، آزمون حقوق همهٔ شرکت‌ها را محاسبه می‌کرد.
  - **نگهبان‌ها (`442dd47`):**
    - ۵۷: فهرست مجاز حالا `modules/common` و قالب‌های html را هم می‌پوشاند. شمارندهٔ مسیر هم `modules/common` را می‌شمارد. شمارندهٔ تازهٔ `cross_module_literals` (نام ماژول دیگر در کد یک ماژول) باید صفر باشد.
    - ۲۹: شمارندهٔ تازهٔ `cross_module_app_refs` (ایمپورت یا `get_model` اپ ماژول دیگر) باید صفر باشد.
    - فهرست مجاز: ۵۵ مورد بک‌اند و ۱۳ مورد فرانت.
  - **آزمون‌ها و بازبین‌ها:**
    - `ng-test-compare` کامل: ۱۵۶۲ قبول. فقط ۲ شکست پیشین `employee-new-vehicle` ماند. یک شکست وابسته به ترتیب در اجرای اول، در اجرای دوم و اجرای تکی سبز بود.
    - بک‌اند: ۹۰۶ آزمون، بدون شکست تازه.
    - نگهبان‌های ۲۹، ۵۲، ۵۵، ۵۶ و ۵۷ و `--self-test` هر دو سبز بودند.
    - `ui-reviewer`: دو `trackBy` و یک برچسب پیش‌فرض اصلاح شد.
    - `tenant-scope-reviewer`: یک یافته (نگهبان فاز) اصلاح شد.
    - بررسی دیداری روی `localhost:4300` با حساب موقت `qa_admin` انجام شد. لانچر، ممیزی انبار و مالی، کاربران و پوستهٔ عملیات همان متن‌ها را دارند. حساب‌ها حذف شدند.
  - **انتشار روی `app`:**
    - پشتیبان `backup_20261021_055327.dump` گرفته شد و بیلد patch‌شده ساخته شد.
    - Daphne دوباره راه‌اندازی شد. ورکر GDrive خاموش بود و راه‌اندازی شد.
    - هر دو آدرس پاسخ ۲۰۰ دادند. heartbeat تازه بود و منبع `ItemPhoto` در رجیستری زنده است.
  - **وضعیت:**
    - ارجاع بین‌ماژولی در کد ماژول‌ها و پوستهٔ مشترک صفر است.
    - لیترال‌های باقی‌مانده فقط قفل داده، پروتکل، دیتابیس آفلاین یا ابزار توسعه‌اند.
    - انتشار روی `soft` جدا و منوط به تأیید صریح کاربر است.

- **اثبات سرتاسری نصب مستقل (۳۰ مهر ۱۴۰۵):**
  - **بک‌اند:** نگهبان ۳۱ هر سه پروفایل نصب را با `WH_MODULES` سنجید و قبول شد: فقط حسابداری، فقط انبار و کامل.
    - در هر پروفایل `manage.py check` سبز بود و سیم‌کشی رجیستری درست بود:
      - حسابداری‌تنها: منبع فایلی ثبت نیست و مقصد GDrive ثبت است.
      - انبارداری‌تنها: منبع `ItemPhoto` ثبت است و مقصدی نیست؛ خبر به مقصد بی‌اثر می‌ماند.
      - کامل: هر دو ثبت‌اند.
    - `resolve_entity('warehouse', id)` شیء انبار واقعی را برمی‌گرداند.
  - **فرانت:** `npm run build:modules` برای `accounting` و `warehouse` جداگانه کامپایل شد.
    - هر باندل فقط چانک روت ماژول خودش را دارد.
    - endpoint همگام‌سازی ماژول دیگر در هیچ فایل JS آن نیست، ولی در بیلد کامل هست.
  - **نگهبان‌ها:** ۳۰، ۳۴ و ۳۶ سبز بودند.
    - ۳۳ و ۳۵ از نشست ۲۶ کهنه مانده بودند و اصلاح شدند (`e8c3e84`).
    - ۳۵ حالا ریدایرکت‌های legacy را در `legacyRedirects` ماژول‌ها هم می‌شمارد.
    - ۳۳ دیگر specها را جزو باندل نمی‌شمارد.

- **آزمون سرتاسری صف آفلاین در مرورگر واقعی (۳۰ مهر ۱۴۰۵):**
  - **محیط:** `localhost:4300` با حساب موقت `qa_admin` و انبار آزمون `QA-OFFLINE`.
  - **آفلاین:** با رویداد `offline` مرورگر، ویرایش انبار از سرویس واقعی برنامه انجام شد. رکورد `PATCH` با وضعیت `pending` و قلمرو `warehouse` در IndexedDB نشست. سرور بی‌تغییر ماند و عنوان صفحه حالت آفلاین را نشان داد.
  - **آنلاین:** با رویداد `online`، صف بی‌دخالت تخلیه شد. سرور نام تازه را گرفت و AuditLog رویداد `UPDATE` را به نام `qa_admin` ثبت کرد.
  - **پاک‌سازی:** انبار و حساب‌های آزمون پس از پیش‌نمایش آبشاری حذف شدند.
  - **`soft`:** کاربر در این تاریخ تصمیم گرفت فعلاً منتشر نشود. هیچ push یا انتشاری انجام نشد.

- **باز — وابستگی‌های بی‌نام (۳۰ مهر ۱۴۰۵):** نگهبان‌ها نام ماژول را می‌شمارند، نه مفهوم ماژول را. بازبینی دوباره چهار مورد باز پیدا کرد که کاربر خواست در گفت‌وگوی تازه، با طرح «گام ۷»، کامل بسته شوند:
  1. کدهای مجوز ماژول‌ها در هسته و پوسته:
     - فرانت: ۵۶ مورد، به‌اضافهٔ ۶ مورد کلید گروه `WH_AUDIT`/`ACCOUNTING_FINANCE`.
     - بک‌اند `core/accounts`: حدود ۵۲ مورد.
  2. `WarehouseHttpService` در `core/`.
  3. نماهای دوقلمرویی داشبورد سلامت و پایش همگام‌سازی.
  4. ساخته‌نشدن هیچ ماژول سوم واقعی برای اثبات.
  - جزئیات، اندازه‌ها و روش راستی‌آزمایی در `scratch/modular_closeout_handoff.md` است.

- **گام ۷ — اجرا با Claude (۳۰ مهر ۱۴۰۵):**
  - **۷.۱ تا ۷.۳ (`8bf5093`):**
    - مجوزهای سفارشی ماژول‌ها در `module.py` هر ماژول (`PERMISSIONS`) اعلام می‌شوند. گیرندهٔ `post_migrate` (`accounts/module_permissions.py`) فقط ردیف نبوده را می‌سازد. migration `accounts/0003_module_permissions_declared_by_modules` فقط وضعیت است.
    - روی دیتابیس `app`: پشتیبان `backup_20261021_094444.dump`، migrate انجام شد، hash جدول `Permission` (۴۱۱ ردیف) پیش و پس یکسان بود و `seed_permissions` صفر ردیف ساخت یا تغییر داد.
    - نام دو مجوز `can_act_as_supervisor` و `can_act_as_manager` از نام فعلی دیتابیس (نام seed) گرفته شد، نه از `Meta`.
    - هسته مجوز ماژول را از contributionها می‌خواند: `audit_view_perms`، `user_directory_perms`، `key_role_permissions`، `org_structure_write_perms` و `sensitive_field_bypass_perms`.
    - فرانت: گروه مجوز، نام کوتاه، راهنمای تنها، مجوز نوشتن ساختار و `anyPermissions` منو از manifest ماژول. برچسب «انبار/پروژه» صفحهٔ کاربران از `users.assignmentScope`.
    - `ScopeDirectoryService` فقط‌خواندنی در هسته؛ CRUD انبار به `modules/warehouse/api/` رفت.
    - آزمون‌ها: بک‌اند ۹۱۲ بدون شکست تازه (دیتابیس آزمون تازه، پس مسیر `post_migrate` هم آزموده شد). specهای فرانت مرتبط بدون پس‌رفت.
    - بازبین‌ها: `tenant-scope-reviewer` بی یافته. `ui-reviewer` یک یافته (برچسب عمومی پیش از رسیدن گروه‌های مجوز) که اصلاح شد.
  - **۷.۴ (`72757ef`):**
    - داشبورد سلامت و پایش همگام‌سازی N-قلمرویی شدند (`healthDashboard.panel`، `operations.queueLabelFa/queueOrder/conflictSimulation`). `system-health` حالا `recordsByScope` می‌دهد.
    - دو انحراف عمدی: در نصب فقط‌انبار، توضیح تست فشار دیگر خزانه‌داری را نام نمی‌برد. با سناریوی «فقط انبارداری» سطر نتیجهٔ خزانه‌داری نشان داده نمی‌شود.
    - شیم `warehouseIds/projectIds` در `deep-sync-modal`/`user-menu` پروتکل زندهٔ بروزرسانی عمیق است و می‌ماند (در ۷.۶ در فهرست مجاز).
    - بازبین‌ها: `data-loss-reviewer` بی مسیر از دست رفتن داده؛ دو یافتهٔ نمایشی اصلاح شد. یک یافتهٔ پیشین (`syncErrors.delete` در پذیرش نسخهٔ سرور) به تسک جدا سپرده شد. `ui-reviewer` بی یافتهٔ جدی؛ دو مورد کم‌اهمیت اصلاح شد.
  - **۷.۵ و ۷.۶ (`dd39e57`، `57a22bb`، `d56f8e0`):**
    - ماژول opt-in به نام `showcase` (نه `sample`، چون فرمان `verify_tools.py sample-module` ماژول `sample` را در کپی می‌سازد).
    - پرچم `opt_in`/`optIn`، `default_module_codes()` و `runtime_catalog_codes()`: پروفایل پیش‌فرض، قلمروهای توکن و فهرست تعویض قلمرو همان قبل است.
    - `showcase` فقط از نقطه‌های توسعه استفاده می‌کند: ردیف مجوز خودش، گروه مجوز، پنل سلامت، قلمرو آفلاین و صف پایش. هیچ فایل هسته یا پوسته برایش تغییر نکرد.
    - اثبات: نگهبان ۳۱ با پنج پروفایل قبول شد (`accounting`، `warehouse`، کامل، `showcase`، سه‌ماژولی). آزمون‌های `showcase` در پروفایل سه‌ماژولی ۱۰ از ۱۰ قبول شد. بیلد تک‌ماژولی `showcase` فقط کد خودش را دارد و بیلد سه‌ماژولی هر سه را.
    - `verify_tools.py sample-module` قبول شد: ماژول چهارم ساخته‌شده از قالب کنار `showcase` بیلد شد و نگهبان‌های ۲۹ و ۵۷ را گذراند.
    - دو اشکال قالب ماژول پیدا و اصلاح شد: `scopeKind: 'operations'` (نام اپ پوسته) و نبودن ردیف مجوز. شناسهٔ صفحهٔ `showcase` به `overview` تغییر کرد تا با ماژولی به نام `sample` برخورد نکند.
    - `.gitattributes` فایل‌های کمکی نگهبان‌ها (`core_literal_allowlist.*` و `module_coupling_scan.py`) را از `git archive` بیرون می‌گذاشت. این اشکال از پیش از گام ۷ بود و فرمان `sample-module` را می‌شکست. اصلاح شد.
    - `scripts/e2e/module_coupling_scan.py` در نگهبان‌های ۲۹ و ۵۷ (با `--self-test`): کد مجوز ماژول در هسته و پوسته، ارجاع بین‌ماژولی مجوز، ارجاع به دیتابیس آفلاین قفل‌شده و برابری گروه مجوز فرانت و بک‌اند. کدها از اعلام خود ماژول‌ها خوانده می‌شوند.
  - **یافتهٔ تازه — ارجاع بین‌ماژولی مجوز:**
    - شمارندهٔ تازه ۴۱ ارجاع در ۱۷ فایل پیدا کرد که هیچ نگهبانی نمی‌دید. بیشترش حسابداری است که نقش سازگاری `can_act_as_manager` انبار را در تاییدهای مالی می‌پذیرد. بقیه چند دسترسی کارکرد، ممیزی و سرپرست بین دو ماژول است.
    - **تصمیم:** این‌ها قاعده‌های کسب‌وکار پیشین در جریان تاییدهای مالی‌اند. بازنویسی‌شان بیرون از دامنهٔ گام ۷ و پرخطر است. در `module_coupling_scan.py` دقیق تا سطح «فایل|کد» با دلیل منجمد شدند، پس هر ارجاع تازه شکست است. سازوکار جایگزین (capability/alias) به تسک جدا سپرده شد.
  - **۷.۷ — راستی‌آزمایی و انتشار:**
    - بک‌اند: ۹۱۲ آزمون، بدون شکست تازه (پس از ۷.۵ هم).
    - فرانت (`ng-test-compare` کامل در برابر `12713e0`): پایه ۱۵۶۱ قبول و ۳ شکست، HEAD ۱۵۶۹ قبول و ۲ شکست (همان دو شکست پیشین `employee-new-vehicle`).
    - نگهبان‌ها: ۲۹، ۳۰، ۳۱، ۳۳، ۳۴، ۳۵، ۳۶، ۵۲، ۵۶ و ۵۷ قبول، و `--self-test` نگهبان‌های ۲۹، ۳۳ و ۵۷ قبول.
    - نگهبان ۵۵ با «+۴ دکمهٔ بی‌برچسب» رد می‌شود. همین ۱۰۵ مورد روی `12713e0` (پیش از گام ۷) هم هست، پس مبنای ۱۰۱ از پیش کهنه بوده و پس‌رفت گام ۷ نیست.
    - بازبین‌ها: `tenant-scope-reviewer` روی ۷.۱ و ۷.۵ بی یافتهٔ متوسط یا بالاتر. `ui-reviewer` و `data-loss-reviewer` روی ۷.۲ تا ۷.۴، یافته‌ها اصلاح شد.
    - بررسی دیداری روی `localhost:4300` با حساب‌های موقت `qa_*`: گروه‌ها و نام‌های کوتاه مجوز، راهنمای مجوزها، برچسب‌های «انبار» کاربران، داشبورد سلامت روی مسیر انبار و مالی، و خلاصهٔ صف و دکمهٔ شبیه‌سازی پایش همگام‌سازی همان متن‌های قبل‌اند. حساب‌ها پس از پیش‌نمایش آبشاری حذف شدند.
    - انتشار روی `app`: پشتیبان `backup_20261021_110841.dump`، بیلد patch‌شده، Daphne و ورکر GDrive دوباره راه‌اندازی شدند. هر دو آدرس ۲۰۰ دادند، heartbeat ورکر تازه بود و `installed_modules` فقط `accounting` و `warehouse` است.
  - **وضعیت پرونده:** هر چهار مورد باز بسته شد. ارجاع‌های بین‌ماژولی مجوز منجمد و مستند است و تسک جدا دارد. انتشار روی `soft` جدا و منوط به تأیید صریح کاربر است.

</div>
