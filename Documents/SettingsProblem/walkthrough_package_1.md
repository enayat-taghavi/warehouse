<div dir="rtl" align="right">

# گزارش جامع پیاده‌سازی بسته ۱: زیرساخت تست و ایمن‌سازی دیتابیس و بکاپ (Database & Backup Armor)

این سند گزارش کامل اقدامات انجام‌شده، تست‌های واحد پیاده‌سازی‌شده و نتایج راستی‌آزمایی **بسته ۱** از ماژول تنظیمات است.

---

## 🎯 دستاوردهای کلیدی و نتایج اصلاحات

### ۱. رفع باگ حذف فایل نجات در پایتون ۳ (ایراد ۲-۳)
- متغیرهای `restore_failed = False` و `rollback_succeeded = False` در ابتدای متد `BackupRestoreView.post` مقداردهی اولیه شدند.
- در بلوک `except Exception as exc:` مقدار `restore_failed = True` تنظیم می‌شود.
- در بلوک `finally`، در صورتی که بازیابی اولیه شکست خورده باشد و رول‌بک نیز ناموفق باشد (`restore_failed and not rollback_succeeded`)، فایل نجات (`rollback_path`) روی دیسک نگه داشته شده و لاگ هشدار با مسیر دقیق فایل جهت مداخله و بازیابی دستی ثبت می‌گردد.

### ۲. گزارش صادقانه و وضعیت ساختاریافته رول‌بک (ایراد ۲-۴)
- فیلد `rollback_state` با مقادیر صریح و ماشین‌خوان به پاسخ خطای سرور افزوده شد:
  - `'restored'`: بازیابی اولیه ناموفق بود ولی رول‌بک با موفقیت وضعیت دیتابیس را به حالت اولیه بازگرداند.
  - `'unavailable'`: امکان تهیه نسخه اضطراری قبل از بازیابی وجود نداشته و وضعیت دیتابیس نامشخص است.
  - `'failed'`: هم بازیابی اولیه و هم رول‌بک شکست خوردند و مسیر فایل نجات در فیلد `rollback_file` بازگردانده می‌شود.

### ۳. الزام تأییدیه صریح متنی (ایراد ۱-۶)
- در بک‌اند (`BackupRestoreView`): ارسال و تطابق دقیق فیلد `confirm_text == 'RESTORE_DATABASE_CONFIRM'` الزامی شد و در غیر این صورت درخواست بلافاصله با خطای ۴۰۰ رد می‌شود.
- در فرانت‌اند: مدال تأیید بازیابی در `settings.html` و کامپوننت مشترک `ConfirmDialogComponent` ارتقا یافته و تا زمان تایپ دقیق عبارت، دکمه تأیید غیرفعال باقی می‌ماند.

### ۴. ثبت رکوردهای ممیزی و حسابرسی `AuditLog` (ایراد ۱-۷)
- **در `BackupCreateView`:** ثبت یک لاگ حسابرسی رتبه `warning` با اکشن `EXPORT` شامل نام و حجم فایل دانلودشده.
- **در `BackupRestoreView`:** ثبت دو لاگ حسابرسی: اولی پیش از اجرای هرگونه عملیات دیتابیسی با رتبه `critical` و اکشن `RESTORE_START` و دومی پس از اتمام عملیات با اکشن `RESTORE_COMPLETE` یا `RESTORE_FAILED` همراه با فیلد `rollback_state`.

### ۵. کنترل سقف حجم آپلود و حداقل طول رمز عبور (ایرادات ۱-۸ و ۱-۹)
- **سقف حجم در رم:** بررسی `uploaded_file.size` در برابر `BACKUP_MAX_UPLOAD_MB` (پیش‌فرض ۲ گیگابایت) پیش از فراخوانی `.read()` در رم و بازگرداندن خطای ۴۱۳ در صورت تخطی.
- **طول رمز عبور:** الزام حداقل ۱۲ کاراکتر برای ساخت بکاپ در کلاینت و سرور بدون ایجاد محدودیت برای بازیابی فایل‌های قدیمی با رمزهای کوتاه.

---

## 🧪 نتایج تست‌های خودکار و راستی‌آزمایی (Verification Results)

### ۱. تست‌های بک‌اند (Django Test Runner)
دستور اجرا:
```bash
python manage.py test warehouses.tests_settings config.tests_backup -v 2 --keepdb
```

**خروجی ترمینال:**
```text
Found 20 test(s).
System check identified no issues (0 silenced).
test_settings_endpoint_reachable_for_authenticated_user ... ok
test_settings_endpoint_rejects_anonymous_user ... ok
test_settings_post_allowed_for_manager_with_perm ... ok
test_settings_post_allowed_for_superuser ... ok
test_settings_post_forbidden_without_perm ... ok
test_backup_create_forbidden_without_perm ... ok
test_backup_create_rejects_short_password ... ok
test_backup_create_success_and_writes_audit_log ... ok
test_backup_endpoints_reject_anonymous ... ok
test_reports_unavailable_when_no_rollback_taken ... ok
test_restore_forbidden_without_perm ... ok
test_restore_rejects_bad_magic ... ok
test_restore_rejects_oversized_upload ... ok
test_restore_rejects_wrong_confirm_text ... ok
test_restore_requires_confirm_text ... ok
test_restore_writes_start_and_outcome_audit_logs ... ok
test_restore_wrong_password ... ok
test_rollback_file_removed_on_success ... ok
test_rollback_file_removed_when_rollback_succeeds ... ok
test_rollback_file_retained_when_both_fail ... ok

----------------------------------------------------------------------
Ran 20 tests in 26.858s

OK
```

### ۲. تست‌های فرانت‌اند (Vitest / Angular)
دستور اجرا:
```bash
npx vitest run src/app/components/settings/settings.spec.ts src/app/shared/components/confirm-dialog/confirm-dialog.component.spec.ts src/app/services/settings.spec.ts
```

**خروجی ترمینال:**
```text
 RUN  v4.1.9 E:/warehouse project/frontend

 ✓ src/app/services/settings.spec.ts (3 tests)
 ✓ src/app/shared/components/confirm-dialog/confirm-dialog.component.spec.ts (5 tests)
 ✓ src/app/components/settings/settings.spec.ts (7 tests)

 Test Files  3 passed (3)
      Tests  15 passed (15)
   Start at  02:44:01
   Duration  1.25s
```

### ۳. بیلد نهایی پروژه فرانت‌اند
دستور اجرا:
```bash
npm run build
```
**نتیجه:** کامپایل موفق بدون خطا (`Application bundle generation complete`).

---

## 📋 جدول فایل‌های تغییریافته و ایجادشده

| نام فایل | وضعیت | خلاصه تغییرات |
|---|---|---|
| `backend/config/views_backup.py` | اصلاح | رفع باگ حذف فایل نجات، ساختاردهی `rollback_state`، الزام `RESTORE_DATABASE_CONFIRM`، ثبت `AuditLog`، کنترل سقف حجم و رمز ۱۲ کاراکتری |
| `backend/warehouses/tests_settings.py` | جدید | تست‌های دود و کنترل مجوزهای endpoint تنظیمات سراسری |
| `backend/config/tests_backup.py` | جدید | مجموعه کامل آزمون‌های شبیه‌سازی‌شده (Mock) ایجاد، اعتبارسنجی، بازیابی و رول‌بک بکاپ |
| `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts` | اصلاح | افزودن پشتیبانی از `requireText` و اعتبارسنجی تایپ عبارت تاییدیه |
| `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.spec.ts` | جدید | تست‌های واحد تاییدیه متنی صریح دیالوگ |
| `frontend/src/app/services/settings.ts` | اصلاح | افزودن ارسال پارامتر `confirm_text` در متد `restoreBackup` |
| `frontend/src/app/services/settings.spec.ts` | جدید/اصلاح | تست‌های واحد سرویس تنظیمات برای ارسال فرم‌دیتا با `confirm_text` |
| `frontend/src/app/components/settings/settings.ts` | اصلاح | اعتبارسنجی حداقل ۱۲ کاراکتر رمز در دانلود، متغیر `restoreConfirmInput` و اعتبارسنجی در بازیابی |
| `frontend/src/app/components/settings/settings.html` | اصلاح | افزودن کادر تایپ عبارت تأییدیه `RESTORE_DATABASE_CONFIRM` و غیرفعال‌سازی دکمه تأیید |
| `frontend/src/app/components/settings/settings.spec.ts` | جدید/اصلاح | آزمون‌های واحد فرانت‌اند برای اعتبارسنجی رمز و بازیابی پایگاه‌داده |

</div>
