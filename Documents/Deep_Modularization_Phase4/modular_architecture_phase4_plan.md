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
پرخطر و حساس به داده. پس از بازبینی نتیجهٔ این صف، طراحی آن جدا با `data-loss-reviewer` بررسی می‌شود و در صف بعدی اجرا می‌شود:
- extension تازه با نام `offlineSync` در هر ماژول: الگوهای URL (جای `resolveScopeFromUrl`) و نام دیتابیس. نام دو دیتابیس فعلی هرگز عوض نمی‌شود.
- حلقهٔ تخلیهٔ `offline-queue-runner` همهٔ دیتابیس‌ها را بخواند، نه فقط «جاری و دیگری».
- `user-menu` و `deep-sync-modal` و `session-tab` از همین extension بخوانند.

### گام ۵ — نگهبان‌ها و انتشار
- **نشست ۱۴:** شمارندهٔ `core_module_literals` در نگهبان ۲۹ (بک‌اند) و ۵۷ (فرانت) با قانون «افزایش ممنوع».
- **نشست ۱۵:** انتشار روی `app` (پشتیبان، بررسی مایگریشن، بیلد وصله‌شده؛ runner ری‌استارت می‌کند).

## ۳. روند نظارت

- runner از `run_tasks_agy.bat` در تب Windows Terminal اجرا می‌شود.
- پس از صف: `git status --untracked-files=all`، اجرای دوبارهٔ بررسی‌های کلیدی، و بازبین‌ها روی diff (`tenant-scope-reviewer` برای گام‌های ۱ و ۲، `data-loss-reviewer` برای نشست ۲، `ui-reviewer` لازم نیست چون قالب تغییر نمی‌کند).
- یافته‌های تأییدشده به تسک اصلاحی در `tasks.md` تبدیل می‌شوند.

## گزارش پیشرفت

- **۲۸ مهر ۱۴۰۵:** تغییرات commit‌نشده به سه commit جدا تقسیم شد (`b00b604`، `30648fb`، `74df67b`)؛ `offline-db.ts` به HEAD برگشت. صف نشست‌های ۱ تا ۱۵ نوشته و اجرا شد.

</div>
