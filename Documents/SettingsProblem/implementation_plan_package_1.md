<div dir="rtl" align="right">

# برنامهٔ فنی و اجرایی بسته ۱: زیرساخت تست و ایمن‌سازی دیتابیس و بکاپ (Database & Backup Armor)

این سند طرح تفصیلی پیاده‌سازی **بسته ۱** (شامل **فاز ۰: زیرساخت تست‌های واحد** و **فاز ۱: ایمن‌سازی بازیابی دیتابیس و بکاپ**) بر پایه اسناد مرجع معماری سامانه است.

---

## 🎯 اهداف بسته ۱ و ایرادات تحت پوشش

| شناسه ایراد | عنوان نقص فنی | راهکار اجرایی در بسته ۱ |
|---|---|---|
| **۲-۳** | باگ پایتون ۳ در حذف ناخواسته فایل نجات (`rollback_path`) در بلوک `finally` | تعریف فلگ صریح `restore_failed` و نگهداری فایل نجات در صورت شکست رول‌بک |
| **۲-۴** | ادعای کاذب و غیردقیق بازگردانی سیستم در پیام‌های خطای سرور | تفکیک دقیق حالات در `rollback_state` با مقادیر `restored`، `unavailable` و `failed` |
| **۱-۶** | عدم الزام تأییدیه صریح امنیتی هنگام اجرای عملیات حساس بازیابی | الزام تطابق دقیق عبارت `RESTORE_DATABASE_CONFIRM` در بک‌اند و فرانت‌اند |
| **۱-۷** | عدم ثبت وقایع ممیزی برای ایجاد و بازیابی پایگاه‌داده | ثبت لاگ `AuditLog` رتبه `warning` در ساخت بکاپ، و دو لاگ `critical` در بازیابی |
| **۱-۸** | نبود اعتبارسنجی حداقل طول رمز عبور فایل‌های پشتیبان | الزام حداقل ۱۲ کاراکتر در زمان **ایجاد** بکاپ بدون ممانعت از بازیابی فایل‌های قدیمی |
| **۱-۹** | ریسک خطای کمبود حافظه (OOM) با خواندن کل فایل آپلودی در رم | اعتبارسنجی سقف حجم آپلود `BACKUP_MAX_UPLOAD_MB` پیش از `.read()` در رم |
| **۵-۷** | پشتیبانی دیالوگ‌های تاییدیه از ورودی متنی و Escape | ارتقای `ConfirmDialogComponent` با فیلدهای `requireText` و `requireTextLabel` |

---

## 🏗️ جزئیات تغییرات و فایل‌های هدف

### ۱. فاز ۰ — برپایی زیرساخت تست‌های واحد (Test Infrastructure)

#### ۱.۱ ساخت `backend/warehouses/tests_settings.py`
- ایجاد کلاس تست پایه برای endpoint تنظیمات سراسری `GET /api/settings/global/`.
- ساخت توابع کمکی ساخت کاربر با و بدون مجوز `perm_sys_settings` و کاربر سوپریوزر.
- تست اولیه دسترس‌پذیری endpoint برای کاربران احراز هویت شده (Smoke Test).

#### ۱.۲ ساخت `backend/config/tests_backup.py`
- شبیه‌سازی کامل (Mock) برای توابع حساس `subprocess.run`، `config.views_backup._find_pg_tool` و بستن دسترسی به دیتابیس واقعی در طول تست‌ها.
- تست‌های دود رد درخواست‌های کاربران احراز هویت‌نشده (Anonymous) با خطای ۴۰۱/۴۰۳.

#### ۱.۳ سبزسازی تست‌های کامپوننت فرانت‌اند `frontend/src/app/components/settings/settings.spec.ts`
- افزودن Providerهای `provideHttpClient()` و `provideHttpClientTesting()`.
- پیاده‌سازی Stubها و Mockهای مورد نیاز برای `ActivatedRoute`، `ToastService`، `AuthService` و `SettingsService`.

---

### ۲. فاز ۱ — ایمن‌سازی دیتابیس و بکاپ (Database & Backup Armor)

#### ۲.۱ اصلاح و ارتقای `backend/config/views_backup.py`
- **رفع باگ متغیر حذف فایل نجات (ایراد ۲-۳):**
  - در متد `BackupRestoreView.post` متغیرهای `restore_failed = False` و `rollback_succeeded = False` در ابتدا مقداردهی می‌شوند.
  - در بلوک `except Exception as exc:` مقدار `restore_failed = True` تنظیم می‌شود.
  - در بلوک `finally` عبارت ناقص `'exc' not in dir()` حذف شده و در صورت `restore_failed and not rollback_succeeded` فایل `rollback_path` حذف **نمی‌شود** تا امکان بازیابی دستی برای مدیر سرور فراهم بماند.
- **تفکیک سه وضعیت رول‌بک و ارسال وضعیت واقعی (ایراد ۲-۴):**
  - بازگرداندن فیلد `rollback_state` با مقادیر:
    - `'restored'`: بازیابی اولیه شکست خورده اما رول‌بک با موفقیت دیتابیس را بازگردانده است.
    - `'unavailable'`: تهیه نسخه اضطراری اولیه شکست خورده بوده و رول‌بک ممکن نبوده است.
    - `'failed'`: هم بازیابی اولیه و هم رول‌بک شکست خورده‌اند؛ مسیر فایل نجات در فیلد `rollback_file` بازگردانده می‌شود.
- **الزام متن تأیید متنی صریح (ایراد ۱-۶):**
  - بررسی پارامتر `confirm_text == 'RESTORE_DATABASE_CONFIRM'` در `BackupRestoreView`؛ در صورت عدم ارسال یا تطابق نداشتن، خطای ۴۰۰ بازگردانده می‌شود.
- **ثبت لاگ‌های ممیزی `AuditLog` (ایراد ۱-۷):**
  - در `BackupCreateView`: ثبت لاگ با `severity='warning'`, `action='EXPORT'` شامل نام فایل و حجم.
  - در `BackupRestoreView`: ثبت لاگ اول پیش از شروع عملیات با `severity='critical'`, `action='RESTORE_START'` و ثبت لاگ دوم پس از مشخص شدن نتیجه نهایی با وضعیت `rollback_state`.
- **اعمال سقف حجم فایل آپلودی (ایراد ۱-۹):**
  - کنترل `uploaded_file.size` در برابر `BACKUP_MAX_UPLOAD_MB` (پیش‌فرض ۲ گیگابایت) پیش از فراخوانی `.read()`. در صورت تخطی، خطای ۴۱۳ برگردانده می‌شود.
- **الزام حداقل ۱۲ کاراکتر برای رمز عبور ساخت بکاپ (ایراد ۱-۸):**
  - در `BackupCreateView`: بررسی `len(password) >= 12` و رد رمزهای کوتاه با خطای ۴۰۰.
  - در `BackupRestoreView`: بررسی طول انجام **نمی‌شود** تا فایل‌های قدیمی با رمزهای کوتاه همچنان قابل بازیابی باشند.

#### ۲.۲ ارتقای دیالوگ تاییدیه در `frontend/src/app/shared/components/confirm-dialog/`
- افزودن `requireText?: string;` و `requireTextLabel?: string;` به اینترفیس `ConfirmDialogConfig`.
- افزودن ورودی متنی در قالب دیالوگ در صورت تعریف بودن `requireText`.
- غیرفعال ماندن دکمه تأیید تا زمان تایپ دقیق عبارت توسط کاربر.

#### ۲.۳ به‌روزرسانی سرویس و کامپوننت فرانت‌اند
- **در `frontend/src/app/services/settings.ts`:**
  - ارسال پارامتر `confirm_text: 'RESTORE_DATABASE_CONFIRM'` به عنوان پارامتر فرم در `restoreBackup()`.
- **در `frontend/src/app/components/settings/settings.ts` و `settings.html`:**
  - اعتبارسنجی حداقل ۱۲ کاراکتر برای رمز عبور در متد `downloadBackup()`.
  - الزام تایپ عبارت تأییدیه در مدال تایید بازیابی دیتابیس.
  - نمایش پیام‌های متناسب با پاسخ سرور بر اساس فیلد `rollback_state`.

---

## 🧪 برنامه راستی‌آزمایی و تست‌های خودکار (Verification Plan)

### ۱. تست‌های بک‌اند (`backend`)

| نام تست | هدف و ادعای تست |
|---|---|
| `test_settings_endpoint_reachable_for_authenticated_user` | بررسی پاسخ ۲۰۰ برای GET `/api/settings/global/` |
| `test_backup_endpoints_reject_anonymous` | بررسی رد دسترسی کاربران ناشناس با ۴۰۱/۴۰۳ |
| `test_restore_requires_confirm_text` | ارسال درخواست ریستور بدون `confirm_text` منجر به خطای ۴۰۰ می‌شود |
| `test_restore_rejects_wrong_confirm_text` | ارسال متن تأیید اشتباه منجر به خطای ۴۰۰ می‌شود |
| `test_restore_rejects_oversized_upload` | فایل حجیم‌تر از سقف مجاز منجر به ۴۱۳ می‌شود و `read()` فراخوانی نمی‌شود |
| `test_restore_rejects_bad_magic` | فایل بدون هدر معتبر `WBAK_V1:` منجر به خطای ۴۰۰ می‌شود |
| `test_restore_wrong_password` | رمز عبور نادرست منجر به خطای ۴۰۰ با پیام مناسب می‌شود |
| `test_rollback_file_retained_when_both_fail` | **تست ضدرگرسیون ایراد ۲-۳**: در صورت شکست همزمان ریستور و رول‌بک، فایل نجات حفظ شده و `rollback_state == 'failed'` است |
| `test_rollback_file_removed_on_success` | در ریستور موفقیت‌آمیز فایل نجات پاک می‌شود |
| `test_rollback_file_removed_when_rollback_succeeds` | در صورت شکست ریستور اما موفقیت رول‌بک، فایل نجات پاک شده و `rollback_state == 'restored'` است |
| `test_reports_unavailable_when_no_rollback_taken` | در صورت شکست ایجاد بکاپ اضطراری، وضعیت `rollback_state == 'unavailable'` گزارش می‌شود |
| `test_restore_writes_start_and_outcome_audit_logs` | ثبت دقیق دو رکورد لاگ ممیزی قبل و بعد از ریستور |
| `test_backup_create_rejects_short_password` | رمز عبور کمتر از ۱۲ کاراکتر در ساخت بکاپ منجر به خطای ۴۰۰ می‌شود |
| `test_backup_create_writes_audit_log` | ساخت بکاپ موفق منجر به ثبت یک لاگ ممیزی `EXPORT` می‌شود |

### دستور اجرای تست‌های بک‌اند:
```bash
cd "E:/warehouse project/backend"
python manage.py test warehouses.tests_settings config.tests_backup -v 2 --keepdb
```

### ۲. تست‌های فرانت‌اند (`frontend`)
- اجرای تست‌های کامپوننت با Karma/Jasmine:
```bash
cd "E:/warehouse project/frontend"
npx ng test --watch=false --browsers=ChromeHeadless
```

---

> [!IMPORTANT]
> **قاعده ایمنی تست‌های بکاپ:** تمام فراخوانی‌های دستورات سیستمی (`pg_dump` و `pg_restore`) در فایل‌های تست با استفاده از `@mock.patch` شبیه‌سازی می‌شوند و هیچ دستوری روی پایگاه‌داده واقعی اجرا نخواهد شد.

> [!TIP]
> **انطباق فرانت و بک‌اند:** ارسال فیلد `confirm_text` در فرانت‌اند و بررسی آن در بک‌اند به صورت هم‌زمان پیاده‌سازی و مستقر می‌شوند تا هیچ اختلالی در عملکرد دکمه بازیابی پایگاه‌داده ایجاد نگردد.

</div>
