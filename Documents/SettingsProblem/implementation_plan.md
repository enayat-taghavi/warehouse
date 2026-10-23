# برنامهٔ پیاده‌سازی مرحله‌بندی‌شده — رفع ایرادات صفحه تنظیمات

**مرجع ایرادات:** [settings_page_audit.md](settings_page_audit.md) — شماره‌گذاری ایرادات در این سند دقیقاً همان شماره‌های گزارش است (مثلاً «۲-۳» یعنی بند ۲-۳ گزارش).

**قواعد حاکم بر این طرح**

- هر فاز مستقلاً قابل استقرار است؛ هیچ فازی نصفه‌کاره روی main نمی‌ماند.
- هر فاز **قبل** از کد، تست شکست‌خورده دارد (تست اول، اصلاح بعد). تستی که پیش از اصلاح سبز شود، تست غلط است.
- هیچ اصلاحی مجاز نیست دادهٔ موجود کاربر را قربانی کند — نه ردیف‌های `SystemSetting` فعلی، نه صف آفلاین، نه فایل نجات.
- ترتیب فازها بر اساس «شدت ریسک از دست رفتن داده» است، نه سهولت کار.
- بیلد و ری‌استارت و اجرای تست‌ها به عهدهٔ توسعه‌دهنده است؛ دستورها در هر فاز آمده.

---

## تصحیح گزارش پیش از شروع

بند ۴ گزارش گفته بود `chat_enabled` / `chat_file_sharing` «هیچ مصرف‌کننده‌ای ندارند». این ادعا با توجه به پیاده‌سازی اخیر ماژول ارتباطات کاملاً اصلاح شده است:

- در بک‌اند در [warehouses/services.py:26-27](../../backend/warehouses/services.py:26) هر دو کلید به صورت `True` در `DEFAULT_SETTINGS` ثبت هستند و در [warehouses/views.py:338](../../backend/warehouses/views.py:338) در endpoint عمومی `public/config` منتشر می‌شوند.
- در فرانت‌اند اینترسفیس `PublicConfig` در [config-api.service.ts](../../frontend/src/app/core/api/config-api.service.ts) این کلیدها را دارد و [communication.service.ts](../../frontend/src/app/core/services/communication.service.ts) مقدار `chat_enabled` را مستقیماً دریافت و اعمال می‌کند.
- زنجیره بک‌اند تا کلاینت سالم است؛ صرفاً در [settings.html](../../frontend/src/app/components/settings/settings.html) منطق نمایشی سوئیچ‌ها نیازمند اتصال استاندارد دوطرفه است.

---

## تصمیم‌هایی که به نظر شما نیاز دارد

طرح روی هر دو مورد یک پیش‌فرض گذاشته تا کار متوقف نشود؛ اگر نظر دیگری دارید در فاز ۶ عوض می‌شود.

| # | موضوع | پیش‌فرض طرح |
|---|---|---|
| ت-۱ | `manager_approval_mode` هیچ مصرف‌کننده‌ای ندارد | **حذف از UI** (پیاده‌سازی منطق «فقط مدیر ارجاع‌دهنده» یک کار محصولی جداست، نه رفع باگ) |
| ت-۲ | بلوک «کیفیت پیش‌فرض دوربین» | **وصل‌کردن** به اسکنر (زیرساخت `@Input() serverPreset` و override انباری از قبل موجود است؛ حذفش اتلاف کار انجام‌شده است) |

---

## نقشهٔ فازها

| فاز | موضوع | ایرادات پوشش‌داده‌شده | ریسک تغییر | وابستگی |
|---|---|---|---|---|
| ۰ | زیرساخت تست | — | ناچیز | — |
| ۱ | ایمن‌سازی بازیابی دیتابیس | ۲-۳، ۲-۴، ۱-۶، ۱-۷، ۱-۸، ۱-۹ | متوسط | ۰ |
| ۲ | آفلاین و PWA | ۳-۱ تا ۳-۵ | کم | ۰ |
| ۳ | محافظت از داده در ذخیرهٔ تنظیمات | ۲-۱، ۲-۲، ۲-۵، ۲-۶ | کم | ۰ |
| ۴ | مجوزها و اعتبارسنجی ورودی | ۱-۱، ۱-۲، ۱-۳، ۱-۴ | متوسط | ۰ |
| ۵ | اجرای سمت سرور مجوز فیلدها | ۱-۵ | **بالا** | ۴ |
| ۶ | تنظیمات بی‌اثر | ۴، ۴-۱، ۴-۲ | کم | ۰ |
| ۷ | دسترس‌پذیری و UX | ۵-۱ تا ۵-۷ | کم | ۱ (بخش دیالوگ) |
| ۸ | کیفیت کد و تفکیک قالب | ۵-۸ تا ۵-۱۳ | کم | ۷ |

---

## فاز ۰ — زیرساخت تست

**هدف:** الان برای هیچ‌یک از این مسیرها تستی وجود ندارد. تا این فاز تمام نشود، هیچ فاز دیگری قابل اعتبارسنجی نیست.

### کارها

1. ساخت `backend/warehouses/tests_settings.py` — فایل `tests.py` این اپ فقط boilerplate خالی است.
2. ساخت `backend/config/tests_backup.py`.
   **الزام ایمنی:** این تست‌ها هرگز نباید `pg_dump` / `pg_restore` واقعی اجرا کنند. `subprocess.run` و `_find_pg_tool` باید با `unittest.mock.patch` جایگزین شوند. یک تست بکاپ که واقعاً restore کند، دیتابیس توسعه را نابود می‌کند.
3. بازبینی [settings.spec.ts](../../frontend/src/app/components/settings/settings.spec.ts): تست فعلی `Settings` را بدون هیچ provider می‌سازد در حالی که کامپوننت `HttpClient` و `ActivatedRoute` می‌خواهد. **اول تأیید کنید که این تست واقعاً سبز می‌شود**؛ اگر نه، `provideHttpClient` + `provideHttpClientTesting` + stub برای `ActivatedRoute`/`ToastService`/`AuthStore` اضافه شود. بعیدبودنِ سبزشدنِ فعلی، خودش یک یافته است.
4. یک helper مشترک تست در `backend/warehouses/tests_settings.py` برای ساخت کاربر با/بدون `perm_sys_settings`.

### تست‌های این فاز

فقط «تست‌های دود» که ثابت کنند بستر کار می‌کند:

- `test_settings_endpoint_reachable_for_authenticated_user` → GET `/api/settings/global/` = ۲۰۰
- `test_backup_endpoints_reject_anonymous` → POST به هر دو endpoint بکاپ برای کاربر ناشناس = ۴۰۱/۴۰۳
- فرانت: تست `should create` موجود سبز باشد.

### دستورها

```bash
cd "E:/warehouse project/backend" && python manage.py test warehouses.tests_settings config.tests_backup -v 2 --keepdb
```

```bash
cd "E:/warehouse project/frontend" && npx ng test --watch=false --browsers=ChromeHeadless
```

### معیار پذیرش

هر دو مجموعه سبز؛ هیچ تستی به دیتابیس یا فایل‌سیستم واقعی دست نزند.

---

## فاز ۱ — ایمن‌سازی بازیابی دیتابیس

**چرا اول:** فقط این فاز است که می‌تواند «کل دیتابیس از دست رفت و راه بازگشتی نماند» را جلوگیری کند.

### ۱.۱ رفع باگ نابودی فایل نجات (ایراد ۲-۳)

در [views_backup.py:430-445](../../backend/config/views_backup.py:430) عبارت `'exc' not in dir()` همیشه `True` است، چون پایتون `exc` را پیش از اجرای `finally` بیرونی حذف می‌کند. با یک flag صریح جایگزین شود:

```python
restore_failed = False          # کنار rollback_succeeded تعریف شود (خط ~۳۲۸)
...
except Exception as exc:
    restore_failed = True
    ...
finally:
    _safe_remove(restore_path)
    if rollback_path:
        if restore_failed and not rollback_succeeded:
            logger.warning("Keeping rollback file for manual recovery: %s", rollback_path)
        else:
            _safe_remove(rollback_path)
```

### ۱.۲ صادق‌کردن پاسخ خطا (ایراد ۲-۴)

خط ۴۲۴ همیشه ادعا می‌کند «سیستم به حالت قبل بازگردانده شد». پاسخ باید سه حالت را از هم تفکیک کند و یک فیلد ماشین‌خوان داشته باشد:

| وضعیت | `rollback_state` | پیام |
|---|---|---|
| rollback موفق | `restored` | «بازیابی شکست خورد؛ سیستم به حالت قبل بازگردانده شد.» |
| نسخهٔ اضطراری گرفته نشده بود | `unavailable` | «بازیابی شکست خورد و نسخهٔ اضطراری در دسترس نبود. وضعیت دیتابیس نامشخص است — فوراً با پشتیبانی تماس بگیرید.» |
| rollback هم شکست خورد | `failed` | «بازیابی و بازگردانی هر دو شکست خوردند. فایل نجات نگه داشته شد: `<path>`» |

مسیر فایل نجات در پاسخ برگردانده شود (تنها فراخوان این endpoint دارندهٔ `perm_sys_backup_restore` است).

### ۱.۳ الزام تأیید متنی (ایراد ۱-۶)

`BackupRestoreView.post` مقدار `confirm_text == 'RESTORE_DATABASE_CONFIRM'` را الزامی کند — همان قراردادی که `DatabaseBackupViewSet` در [accounts/views.py:2101](../../backend/accounts/views.py:2101) دارد. بدون آن ۴۰۰ با پیام روشن.

### ۱.۴ لاگ حسابرسی (ایراد ۱-۷)

`log_audit_event` در `views_backup.py` هرگز صدا زده نمی‌شود. اضافه شود:

- `BackupCreateView`: یک رکورد `severity='warning'`, `action='EXPORT'` با نام فایل و حجم.
- `BackupRestoreView`: **دو** رکورد — یکی قبل از شروع (`severity='critical'`, `action='RESTORE_START'`) و یکی بعد از نتیجه با `rollback_state`. رکورد اول حیاتی است: اگر عملیات نیمه‌کاره سرور را از پا بیندازد، تنها ردِ باقی‌مانده همان است.

### ۱.۵ سقف حجم آپلود (ایراد ۱-۹)

قبل از `uploaded_file.read()` در خط ۲۸۷، `uploaded_file.size` بررسی شود در برابر `getattr(settings, 'BACKUP_MAX_UPLOAD_MB', 2048)`؛ در تخطی ۴۱۳ برگردد.
یادداشت صریح: Fernet برای رمزگشایی به کل payload نیاز دارد، پس خواندن جریانی بدون تغییر فرمت `.wbak` ممکن نیست. سقف حجم، کاهش ریسک است نه رفع کامل؛ اصلاح فرمت خارج از دامنهٔ این طرح است.

### ۱.۶ حداقل قدرت رمز (ایراد ۱-۸)

فقط روی **ساخت** بکاپ اعمال شود (حداقل ۱۲ کاراکتر، هم کلاینت هم سرور). روی **بازیابی** هرگز اعمال نشود — فایل‌های قدیمی با رمز کوتاه باید همچنان قابل بازیابی بمانند، وگرنه خودِ اعتبارسنجی به از دست رفتن داده تبدیل می‌شود.

### ۱.۷ پیش‌نیاز فرانت: ورودی متنی در دیالوگ تأیید

`ConfirmDialogConfig` در [confirm-dialog.component.ts:8](../../frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts:8) هیچ فیلد ورودی متنی ندارد، پس بند ۱.۳ بدون توسعهٔ آن قابل استفاده نیست. اضافه شود:

```ts
requireText?: string;        // دکمه تأیید تا تطابق دقیق، غیرفعال بماند
requireTextLabel?: string;
```

`ConfirmDialogComponent` هم‌اکنون `@HostListener` دارد؛ پس Escape از همان مسیر تأمین می‌شود (بخشی از ایراد ۵-۷ هم اینجا بسته می‌شود).

### تست‌های فاز ۱ — `config/tests_backup.py`

با `mock.patch('subprocess.run')` و `mock.patch('config.views_backup._find_pg_tool')`:

| تست | ادعا |
|---|---|
| `test_restore_requires_confirm_text` | بدون `confirm_text` → ۴۰۰ و هیچ فراخوانی `subprocess.run` |
| `test_restore_rejects_wrong_confirm_text` | متن غلط → ۴۰۰ |
| `test_restore_rejects_oversized_upload` | حجم > سقف → ۴۱۳ و `read()` صدا زده نشود |
| `test_restore_rejects_bad_magic` | payload بدون `WBAK_V1:` → ۴۰۰ |
| `test_restore_wrong_password` | `InvalidToken` → ۴۰۰ |
| `test_rollback_file_retained_when_both_fail` | **تست ضدرگرسیون ۲-۳**: restore با خطای مرگ‌آور + rollback ناموفق → فایل نجات روی دیسک باقی است و `rollback_state == 'failed'` |
| `test_rollback_file_removed_on_success` | مسیر موفق → فایل نجات پاک شده |
| `test_rollback_file_removed_when_rollback_succeeds` | restore ناموفق + rollback موفق → فایل پاک، `rollback_state == 'restored'` |
| `test_reports_unavailable_when_no_rollback_taken` | `pg_dump` اضطراری شکست خورده → `rollback_state == 'unavailable'` و پیام مدعی بازگردانی **نباشد** |
| `test_restore_writes_start_and_outcome_audit_logs` | دو رکورد AuditLog، اولی `critical` |
| `test_restore_forbidden_without_perm` | کاربر بدون `perm_sys_backup_restore` → ۴۰۳ |
| `test_backup_create_rejects_short_password` | رمز ۵ کاراکتری → ۴۰۰ |
| `test_backup_create_writes_audit_log` | یک رکورد EXPORT |

فرانت (`settings.spec.ts`):

- `should keep restore button disabled until confirm text matches`
- `should send confirm_text with restore request`
- `should surface rollback_state failed message verbatim to the operator`

### معیار پذیرش

همهٔ تست‌های بالا سبز. `test_rollback_file_retained_when_both_fail` باید **قبل** از اصلاح ۱.۱ قرمز باشد — اگر از ابتدا سبز بود، تست اشتباه نوشته شده.

### ریسک و بازگشت

تغییرات محدود به `views_backup.py` و دیالوگ تأیید است. الزام `confirm_text` یک breaking change هم‌زمان فرانت و بک‌اند است — هر دو در یک commit بروند، وگرنه دکمهٔ بازیابی ۴۰۰ می‌گیرد.

---

## فاز ۲ — آفلاین و PWA

**هدف:** هر پنج ایراد این دسته یک ریشه دارند: سه درخواست [services/settings.ts](../../frontend/src/app/services/settings.ts) توکن `SKIP_OFFLINE` ندارند.

### ۲.۱ افزودن `SKIP_OFFLINE` (ایرادات ۳-۱، ۳-۲، ۳-۳)

الگوی موجود پروژه در [audit-api.service.ts:59](../../frontend/src/app/core/api/audit-api.service.ts:59) است:

```ts
context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
```

روی این سه متد اعمال شود: `saveGlobalSettings`، `downloadBackup`، `restoreBackup`.
`getGlobalSettings` **دست نخورد** — کش SWR آن یک قابلیت است، نه باگ.

### ۲.۲ پاکسازی کش پس از بازیابی (ایراد ۳-۴)

یک helper در [offline-db.ts](../../frontend/src/app/core/services/offline-db.ts) اضافه شود (این فایل هیچ helper پاکسازی ندارد):

```ts
export async function clearServerDerivedCaches(): Promise<void>
```

فقط جداول قابل بازتولید از سرور: `apiCache`, `countTasks`, `docTasks`, `items`, `dynamicFields`, `syncCursors`.
**هرگز** `syncQueue`, `photoQueue`, `syncErrors` — این‌ها دادهٔ خودِ کاربر هستند که به سرور نرسیده.

### ۲.۳ پیش‌شرط بازیابی: صف آفلاین باید خالی باشد

طراحی بدون از دست رفتن داده: پیش از باز کردن دیالوگ بازیابی، اگر `syncQueue` رکورد pending دارد، عملیات **رد شود** با پیامی که تعداد رکوردها را می‌گوید و اپراتور را به همگام‌سازی هدایت می‌کند. مسیر فرار: دکمهٔ «دانلود صف به‌صورت JSON و ادامه» — نه پاک‌کردن بی‌سروصدا.

### ۲.۴ رفع اسپینر گیرکرده و کش شدن تنظیمات (ایرادات ۳-۱، ۳-۵)

- `isBackupLoading` در `finalize()` صفر شود، نه در `next`/`error`.
- `clearServerDerivedCaches()` روی logout هم صدا زده شود تا تنظیمات سراسری روی دستگاه مشترک باقی نماند (بند ۳-۵). صف دست‌نخورده می‌ماند.

### تست‌های فاز ۲ — `services/settings.spec.ts` و `settings.spec.ts`

| تست | ادعا |
|---|---|
| `should set SKIP_OFFLINE on saveGlobalSettings` | `req.request.context.get(SKIP_OFFLINE) === true` |
| `should set SKIP_OFFLINE on downloadBackup` | همان |
| `should set SKIP_OFFLINE on restoreBackup` | همان |
| `should not set SKIP_OFFLINE on getGlobalSettings` | تثبیت عمدی رفتار کش GET |
| `should clear loading flag when backup request errors` | `isBackupLoading === false` |
| `should refuse restore when offline queue has pending entries` | هیچ درخواست HTTP ارسال نشود |
| `should clear server-derived caches after successful restore` | spy روی helper |
| `should NOT clear syncQueue after restore` | **تست ضدرگرسیون قاعدهٔ «داده کاربر هرگز از بین نرود»** |

### معیار پذیرش

هشت تست بالا سبز؛ آزمون دستی: با DevTools در حالت Offline، کلیک روی «ساخت نسخه پشتیبان» باید توست خطای روشن بدهد و اسپینر متوقف شود.

---

## فاز ۳ — محافظت از داده در ذخیرهٔ تنظیمات

### ۳.۱ مسدودکردن ذخیره وقتی فیلدهای داینامیک بار نشده‌اند (ایراد ۲-۱، بحرانی)

در [settings.ts:105](../../frontend/src/app/components/settings/settings.ts:105) خطای بارگذاری فیلدها به `dynamicFieldsList = []` تبدیل می‌شود و ذخیرهٔ بعدی همهٔ کلیدهای `dyn_*` را نابود می‌کند.

- یک flag `dynamicFieldsLoadFailed` اضافه شود.
- دکمهٔ ذخیره در حالت flag غیرفعال + بنر قرمز با دکمهٔ «تلاش مجدد».
- ذخیره حتی با فراخوانی برنامه‌نویسی هم رد شود (نه فقط UI).

### ۳.۲ حفظ کلیدهای ناشناس (ایراد ۲-۲)

- نقشهٔ خامِ بارگذاری‌شده در `rawFieldPermsCounter` / `rawFieldPermsDoc` نگه داشته شود.
- در `saveGlobalSettings` ([settings.ts:264](../../frontend/src/app/components/settings/settings.ts:264)) `configMap` از کپی نقشهٔ خام شروع شود و بعد کلیدهای حاضر بازنویسی شوند — به‌جای ساختن از صفر.

### ۳.۳ ارسال دلتا (ایراد ۲-۵)

- بعد از بارگذاری، `originalSettings = structuredClone(this.settings)`.
- در ذخیره فقط کلیدهای تغییریافته POST شوند.
این هم‌زمان تصادم دو ادمین را به «فقط کلیدهایی که واقعاً دست زدم» محدود می‌کند و عارضهٔ ۲-۷ (تبدیل همهٔ پیش‌فرض‌ها به ردیف دیتابیس) را هم می‌بندد.
اختیاری در همین فاز: کلید `settings_revision` و رد ۴۰۹ روی revision کهنه.

### ۳.۴ محافظ dirty-state (ایراد ۲-۶)

- getter `isDirty` بر پایهٔ مقایسه با `originalSettings`.
- گارد `settingsLeaveGuard` هم‌الگوی [importLeaveGuard](../../frontend/src/app/core/guards/import-leave.guard.ts) و افزودنش به مسیر در [app.routes.ts:52](../../frontend/src/app/app.routes.ts:52).
- `@HostListener('window:beforeunload')` و تأیید روی دکمهٔ بارگذاری مجدد و تعویض تب.

### تست‌های فاز ۳

| تست | ادعا |
|---|---|
| `should block save when dynamic fields failed to load` | هیچ POST؛ بنر خطا موجود |
| `should preserve dyn_* keys missing from the current list` | **ضدرگرسیون ۲-۱** — payload شامل `dyn_old_field` باشد |
| `should preserve unknown saved keys on save` | **ضدرگرسیون ۲-۲** |
| `should send only changed keys` | تک‌کلید در بدنهٔ POST |
| `should not send anything when nothing changed` | دکمه غیرفعال یا POST خالی |
| `should report dirty after a toggle and clean after save` | — |
| `settingsLeaveGuard should block navigation when dirty` | spec جدا برای گارد |

### معیار پذیرش

هفت تست سبز. آزمون دستی: با قطع شبکهٔ endpoint فیلدهای داینامیک، ذخیره باید غیرممکن شود.

---

## فاز ۴ — مجوزها و اعتبارسنجی ورودی

### ۴.۱ گیت‌کردن دکمهٔ ذخیره (ایراد ۱-۱)

`canEditSettings = computed(() => is_superuser || has_perm('perm_sys_settings'))` و `[disabled]` روی دکمهٔ ذخیره + بنر «حالت فقط‌خواندنی». همین‌جا `isSuperUser` مردهٔ [settings.ts:46](../../frontend/src/app/components/settings/settings.ts:46) جای درست خودش را پیدا می‌کند.

### ۴.۲ نمایش پیام واقعی سرور (ایراد ۱-۲)

هندلر [settings.ts:296](../../frontend/src/app/components/settings/settings.ts:296) پارامتر خطا بگیرد: `error: (err) => this.toast.show('error', err?.error?.error || 'خطا در ذخیره تنظیمات سیستم.')`.

### ۴.۳ محدودکردن GET با projection (ایراد ۱-۳)

⚠ **بستن کامل GET کارتابل انبارگردان را می‌شکند:** [counter-dashboard.ts:1127](../../frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts:1127) وقتی انبار انتخاب نشده همین endpoint را صدا می‌زند.

پس در [warehouses/views.py:189](../../backend/warehouses/views.py:189):

- دارندهٔ `view_sys_settings` یا `perm_sys_settings` یا superuser → نقشهٔ کامل.
- بقیهٔ کاربران احراز هویت‌شده → فقط کلیدهای لازم برای کارتابل: `field_permissions_counter`, `field_permissions_doc`, `blind_counting`, `counter_can_view_*`, `financial_can_view_*`, `scanner_*_delimiter`.

گزینهٔ تمیزتر ولی پرریسک‌تر (خارج از این فاز): انتقال کارتابل به یک endpoint اسکوپ‌دار و بستن کامل GET.

### ۴.۴ whitelist و اعتبارسنجی نوع (ایراد ۱-۴)

حلقهٔ [views.py:204-209](../../backend/warehouses/views.py:204) هر کلیدی را می‌پذیرد. اضافه شود:

- whitelist = کلیدهای `DEFAULT_SETTINGS` (که بعد از فاز ۶ شامل کلیدهای چت هم می‌شود).
- اعتبارسنجی نوع/بازه به‌ازای کلید: `offline_sync_interval_minutes` عدد ۱..۱۴۴۰، `blind_counting` عضو `{'blind','visible'}`، `field_permissions_*` دیکشنری با شکل `{visible, editable, custom_label}`.
- کلید ناشناس یا نوع نامعتبر → ۴۰۰ با **فهرست** کلیدهای مردود (نه پذیرش خاموش).
- تراکنش اتمیک است، پس یک کلید بد کل ذخیره را برمی‌گرداند — رفتار درست.

### تست‌های فاز ۴ — `warehouses/tests_settings.py`

| تست | ادعا |
|---|---|
| `test_post_rejects_unknown_key` | ۴۰۰ و نام کلید در پاسخ؛ هیچ ردیفی ساخته نشود |
| `test_post_rejects_out_of_range_int` | `offline_sync_interval_minutes=99999` → ۴۰۰ |
| `test_post_rejects_non_numeric_int` | `"abc"` → ۴۰۰ |
| `test_post_rejects_invalid_blind_counting_value` | ۴۰۰ |
| `test_post_rejects_malformed_field_permissions` | ۴۰۰ |
| `test_post_forbidden_without_perm` | ۴۰۳ — تثبیت رفتار موجود |
| `test_post_atomic_rollback_on_invalid_key` | یک کلید معتبر + یک نامعتبر → هیچ‌کدام ذخیره نشوند |
| `test_get_returns_full_map_for_admin` | حضور `system_version` |
| `test_get_returns_projection_for_counter` | `field_permissions_counter` حاضر، `system_version` غایب |
| `test_get_projection_still_serves_counter_dashboard_keys` | همهٔ کلیدهای مصرفی کارتابل حاضر |

فرانت:

- `should disable save button without perm_sys_settings`
- `should show read-only banner without permission`
- `should show server error message on 403 save`

### معیار پذیرش

سیزده تست سبز. آزمون دستی: ورود با کاربری که فقط `view_sys_settings` دارد → صفحه باز، دکمهٔ ذخیره غیرفعال، بنر نمایش داده شود.

---

## فاز ۵ — اجرای سمت سرور مجوز فیلدها

**پرریسک‌ترین فاز.** جدا نگه داشته شده تا اگر لازم شد بدون به‌هم‌ریختن بقیه برگردانده شود.

### ۵.۱ شناسایی دقیق نقطهٔ اعمال

نقطهٔ هدف در کلاینت متد `saveExtraEditedFields` در [counter-dashboard.ts:1869](../../frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts:1869) است که درخواست `PATCH /api/inventory/items/{id}/` را (از طریق `OfflineSyncService` و `itemApi.update`) ارسال می‌کند.
در سمت بک‌اند، نقطهٔ اعمال کلاس `ItemViewSet.partial_update` در [inventory/views.py](../../backend/inventory/views.py) و اعتبارسنجی در [inventory/serializers.py](../../backend/inventory/serializers.py) است.

### ۵.۲ منبع حقیقت سمت سرور

در [warehouses/services.py](../../backend/warehouses/services.py):

```python
def get_editable_item_fields(role: str, warehouse_id=None) -> set[str]
```

`field_permissions_counter` / `field_permissions_doc` را بخواند و مجموعهٔ کلیدهای `editable=True` را برگرداند. کلید غایب = غیرقابل‌ویرایش (پیش‌فرض بسته).

### ۵.۳ اعمال در مسیر نوشتن

- تلاش برای نوشتن فیلد غیرمجاز → **۴۰۰ با فهرست فیلدهای مردود**، نه حذف خاموش. حذف خاموش یعنی کاربر فکر می‌کند ذخیره شد.
- مدیر/سرپرست/superuser مستثنا.
- هر تلاش مردود یک `log_audit_event` با `severity='warning'` بگیرد.

### تست‌های فاز ۵

| تست | ادعا |
|---|---|
| `test_counter_cannot_patch_non_editable_field` | `price_amount` با `editable=False` → ۴۰۰ و مقدار در DB بدون تغییر |
| `test_counter_can_patch_editable_field` | ۲۰۰ و مقدار تغییر کرده |
| `test_hidden_field_is_also_not_editable` | `visible=False` → ۴۰۰ |
| `test_key_absent_from_map_defaults_to_locked` | ۴۰۰ |
| `test_manager_bypasses_field_restrictions` | ۲۰۰ |
| `test_warehouse_override_takes_precedence_over_global` | override انباری اعمال شود |
| `test_rejected_field_attempt_is_audited` | یک رکورد AuditLog |
| `test_dynamic_field_permission_is_enforced` | کلید `dyn_*` |

### معیار پذیرش

هشت تست سبز **و** مجموعهٔ کامل `inventory` بدون رگرسیون:

```bash
cd "E:/warehouse project/backend" && python manage.py test inventory -v 2 --keepdb
```

### ریسک

اگر نقشهٔ ذخیره‌شدهٔ فعلی ناقص باشد، این فاز می‌تواند کارتابل‌های در حال کار را قفل کند. **الزام:** پیش از استقرار، محتوای فعلی `field_permissions_counter` روی محیط عملیاتی بازبینی شود و در صورت نیاز یک migration داده‌ای فیلدهای عملاً درحال‌استفاده را `editable=True` کند.

---

## فاز ۶ — تنظیمات بی‌اثر

### ۶.۱ پاکسازی و اعتبارسنجی سوئیچ‌های چت (ایراد ۴، وضعیت فعلی)

تنظیمات `chat_enabled` و `chat_file_sharing` هم‌اکنون در `DEFAULT_SETTINGS` و `PublicConfig` و `communication.service.ts` فعال هستند. در این فاز:
1. الگوی شکنندهٔ `!== false` در [settings.html](../../frontend/src/app/components/settings/settings.html) به بایندینگ استاندارد دوطرفه تبدیل شود.
2. تست‌های خودکار برای اطمینان از اعمال دقیق تغییر فلگ‌های چت و انعکاس در `public/config` افزوده شوند.

### ۶.۲ جداکننده‌های اسکنر (ایراد ۴-۱)

[settings.ts:139](../../frontend/src/app/components/settings/settings.ts:139) توکن خوانا ذخیره می‌کند (`'Chr(30)'`، `'\\n'`) ولی پارسر آن‌ها را متن خام مقایسه می‌کند ([customs-scanner-parser.ts:54](../../frontend/src/app/components/customs/customs-scanner-parser.ts:54)).

- `onScannerPresetChange` کاراکتر واقعی ذخیره کند (`'\x1E'`, `'\x1F'`, `'\n'`, `'\t'`).
- **بدون از دست رفتن داده:** یک `decodeDelimiter(stored: string): string` که مقادیر قدیمی (`'Chr(30)'`, `'Chr(30) & ";"'`, `'\\n'`) را به کاراکتر واقعی نگاشت کند، در نقطهٔ مصرف ([customs.ts:1045](../../frontend/src/app/components/customs/customs.ts:1045)). ردیف‌های موجود دیتابیس دست‌نخورده کار کنند.
- `detectScannerPreset` هم با هر دو شکل کار کند تا UI پیش‌تنظیم را درست نشان دهد.

### ۶.۳ کیفیت دوربین (ایراد ۴، تصمیم ت-۲)

`@Input() serverPreset` در [barcode-scanner.component.ts:424](../../frontend/src/app/shared/components/barcode-scanner/barcode-scanner.component.ts:424) تعریف شده ولی هیچ قالبی به آن bind نمی‌کند. در همهٔ قالب‌های میزبان اسکنر bind شود. اولویت درست: override محلی کاربر (`localStorage`) > مقدار سرور > `'adaptive'` — یعنی همان منطق موجود [خط ۵۴۲](../../frontend/src/app/shared/components/barcode-scanner/barcode-scanner.component.ts:542) که فقط ورودی‌اش نرسیده.
`scanner_custom_*` هم به `SCANNER_PRESET_CONFIGS` وصل شود، یا اگر پیاده‌سازی‌اش سنگین است، حالت `custom` تا زمان وصل‌شدن از UI حذف شود — نگه‌داشتن یک گزینهٔ بی‌اثر بدتر از نداشتن آن است.

### ۶.۴ `manager_approval_mode` (تصمیم ت-۱)

پیش‌فرض: حذف `<select>` از [settings.html:114](../../frontend/src/app/components/settings/settings.html:114) و از فهرست کلیدهای [wh-settings.ts:357](../../frontend/src/app/components/wh-settings/wh-settings.ts:357). کلید در `DEFAULT_SETTINGS` و ردیف‌های موجود دیتابیس **حذف نشوند** تا اگر بعداً پیاده شد، مقدار انتخابی ادمین از دست نرفته باشد.

### ۶.۵ سوئیچ‌های شکنندهٔ چت (ایراد ۴-۲)

با ورود کلیدها به `DEFAULT_SETTINGS`، الگوی `!== false` و `=== false ? true : false` در [settings.html:365-382](../../frontend/src/app/components/settings/settings.html:365) با bool صریح جایگزین شود (در فاز ۷ به کامپوننت مشترک منتقل می‌شود).

### تست‌های فاز ۶

بک‌اند:

| تست | ادعا |
|---|---|
| `test_public_config_chat_enabled_true_by_default` | نصب تازه → `True` نه `False` |
| `test_public_config_reflects_saved_chat_flag` | ذخیرهٔ `False` → `False` |
| `test_default_settings_covers_every_ui_key` | **تست نگهبان**: هر کلیدی که `settings.html` می‌نویسد در `DEFAULT_SETTINGS` باشد — جلوگیری از تکرار همین دسته باگ |

فرانت:

| تست | ادعا |
|---|---|
| `should hide chat entry point when config disables chat` | `layout.html` |
| `decodeDelimiter maps legacy Chr(30) token to \x1E` | سازگاری عقب‌رو |
| `parser splits rows for control-char preset` | جریان کامل |
| `scanner uses server preset when no local override` | — |
| `scanner prefers local override over server preset` | — |

### معیار پذیرش

همه سبز. آزمون دستی: خاموش‌کردن چت در تنظیمات → پس از refresh دکمهٔ چت در layout ناپدید شود.

---

## فاز ۷ — دسترس‌پذیری و UX

### ۷.۱ کامپوننت سوئیچ مشترک (ایرادات ۵-۱، ۵-۲؛ مهم‌ترین بند این فاز)

الگوی فعلی ([settings.html:120-129](../../frontend/src/app/components/settings/settings.html:120)) با صفحه‌کلید، DOM و مدل را از هم جدا می‌کند و تغییر هرگز ذخیره نمی‌شود.

`<app-toggle-switch>` مشترک ساخته شود:

- ریشه `<button type="button" role="switch" [attr.aria-checked]>` — نه `<label>` با `role`.
- `Space`/`Enter` همان مسیر کلیک را طی کنند.
- خروجی دوطرفه (`[value]` / `(valueChange)`) تا مدل و DOM هرگز واگرا نشوند.
- `pointer-events-none` حذف؛ `<input type="checkbox">` مخفی از tab order خارج شود.

سپس تمام سوئیچ‌های `settings.html` جایگزین شوند.

### ۷.۲ بقیهٔ بندها

- **۵-۳:** دکمه‌های «نمایش همه»/«مخفی‌سازی همه» ([settings.html:416](../../frontend/src/app/components/settings/settings.html:416), [:613](../../frontend/src/app/components/settings/settings.html:613)) روی همهٔ فیلدها عمل کنند، یا برچسب به «همهٔ نتایج فیلترشده» تغییر کند. برچسب و رفتار باید یکی باشند.
- **۵-۴:** `confirm.open({type:'danger'})` قبل از `resetAllFieldsToDefault` ([:195](../../frontend/src/app/components/settings/settings.ts:195)) و `resetAllDocFieldsToDefault` ([:245](../../frontend/src/app/components/settings/settings.ts:245)) — همان الگوی [wh-settings.ts:378](../../frontend/src/app/components/wh-settings/wh-settings.ts:378).
- **۵-۵:** در [settings.ts:319](../../frontend/src/app/components/settings/settings.ts:319) انکر به DOM اضافه، بعد از `click()` حذف، و `revokeObjectURL` در `setTimeout(..., 0)`.
- **۵-۶:** `autocomplete="new-password"` روی هر دو فیلد رمز؛ پاک‌کردن `backupPassword` در مسیر خطا هم.
- **۵-۷:** بازگرداندن focus و focus trap در دیالوگ (Escape در فاز ۱ بسته شد).

### تست‌های فاز ۷

| تست | ادعا |
|---|---|
| `toggle emits on Space keydown` | **ضدرگرسیون ۵-۱** |
| `toggle emits on Enter keydown` | — |
| `toggle aria-checked reflects value` | ۵-۲ |
| `hidden checkbox is not focusable` | ۵-۱ |
| `keyboard toggle updates the model, not just the DOM` | ادعای مرکزی ۵-۱ |
| `should confirm before resetting all counter fields` | ۵-۴ |
| `should confirm before resetting all doc fields` | ۵-۴ |
| `should clear backup password on error` | ۵-۶ |
| `should revoke object URL after download` | ۵-۵ |
| `should restore focus to trigger after dialog closes` | ۵-۷ |

### معیار پذیرش

ده تست سبز. آزمون دستی: پیمایش کل صفحه فقط با Tab و Space — هر سوئیچ باید عمل کند و پس از ذخیره مقدار پایدار بماند.

---

## فاز ۸ — کیفیت کد و تفکیک قالب

### کارها

- **۵-۸:** `takeUntilDestroyed()` روی `route.queryParams` ([settings.ts:81](../../frontend/src/app/components/settings/settings.ts:81)) و حذف `detectChanges` از مسیر `ngOnInit` ([:86](../../frontend/src/app/components/settings/settings.ts:86)).
- **۵-۹:** interface `SystemSettings` جایگزین `settings: any` ([:26](../../frontend/src/app/components/settings/settings.ts:26)) — با whitelist فاز ۴ هم‌راستا و مشتق از یک منبع مشترک.
- **۵-۱۰:** تبدیل `filteredFieldConfigs` / `filteredDocFieldConfigs` از getter به `computed()` روی سیگنال.
- **۵-۱۱:** حذف `settings.css` صفر بایتی از `styleUrl` (بعد از فاز ۴ که `isSuperUser` مصرف‌کننده پیدا کرد).
- **۵-۱۳:** تفکیک قالب ۱۰۰۸ خطی به پنج زیرکامپوننت بر اساس تب‌ها (`operations`, `label`, `counter_fields`, `doc_fields`, `backup`) تا زیر سقف ۵۰۰ خط CLAUDE.md برود.
- **۵-۱۲:** تکمیل پوشش تست تا سریال‌سازی ذخیره، گیت مجوز و جریان بکاپ همه پوشش داشته باشند.

### تست‌های فاز ۸

- همهٔ تست‌های فازهای ۱ تا ۷ **بدون تغییر** سبز بمانند — این معیار اصلی است، چون فاز ۸ بازآرایی است و نباید رفتاری عوض کند.
- `should unsubscribe from queryParams on destroy`
- `each extracted tab component renders standalone`
- بیلد تمیز:

```bash
cd "E:/warehouse project/frontend" && npx ng build
```

### معیار پذیرش

بیلد بدون خطا، تمام تست‌ها سبز، هیچ فایل بالای ۵۰۰ خط در دامنهٔ تغییر باقی نماند.

---

## پیوست الف — فایل‌های تازه‌ای که این طرح می‌سازد

| فایل | فاز |
|---|---|
| `backend/warehouses/tests_settings.py` | ۰ |
| `backend/config/tests_backup.py` | ۰ |
| `frontend/src/app/core/guards/settings-leave.guard.ts` | ۳ |
| `frontend/src/app/core/guards/settings-leave.guard.spec.ts` | ۳ |
| `frontend/src/app/shared/components/toggle-switch/*` | ۷ |
| پنج زیرکامپوننت تب‌های تنظیمات | ۸ |

## پیوست ب — دستورهای پرکاربرد

اجرای تست‌های بک‌اند مرتبط:

```bash
cd "E:/warehouse project/backend" && python manage.py test warehouses config inventory -v 2 --keepdb
```

اجرای تست‌های فرانت:

```bash
cd "E:/warehouse project/frontend" && npx ng test --watch=false --browsers=ChromeHeadless
```

بیلد فرانت:

```bash
cd "E:/warehouse project/frontend" && npx ng build
```

## پیوست ج — یادداشت ریسک کلی

- فازهای ۱ و ۵ روی محیط عملیاتی حساس‌اند: فاز ۱ چون مسیر بازیابی را عوض می‌کند، فاز ۵ چون می‌تواند کارتابل درحال‌کار را قفل کند. هر دو با بازبینی دادهٔ فعلی و در پنجرهٔ کم‌ترافیک بروند.
- فازهای ۲، ۳، ۶، ۷، ۸ کم‌ریسک و مستقلاً قابل استقرارند.
- الزام `confirm_text` در فاز ۱ تنها تغییر هم‌زمان فرانت/بک‌اند است؛ باید در یک commit باشد.
- هیچ فازی مجاز به حذف ردیف موجود `SystemSetting` نیست. حتی کلیدهای منسوخ (`manager_approval_mode`) فقط از UI حذف می‌شوند، نه از دیتابیس.
