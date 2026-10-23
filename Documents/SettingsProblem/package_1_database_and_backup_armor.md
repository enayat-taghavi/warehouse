# راهنمای اجرایی بسته ۱: زیرساخت تست و ایمن‌سازی دیتابیس و بکاپ (Database & Backup Armor)

این سند راهنمای گام‌به‌گام پیاده‌سازی **بسته ۱** از طرح پایدارسازی صفحه تنظیمات سامانه است.

---

## 🎯 اهداف بسته ۱
- برپایی بستر تست‌های واحد در بک‌اند و فرانت‌اند برای ماژول تنظیمات و بکاپ (فاز ۰).
- رفع باگ پایتون ۳ در حذف تصادفی فایل نجات رول‌بک دیتابیس (ایراد ۲-۳).
- ارسال پیام دقیق و وضعیت واقعی رول‌بک دیتابیس به اپراتور (ایراد ۲-۴).
- الزام تأیید متنی صریح `RESTORE_DATABASE_CONFIRM` در بک‌اند و فرانت‌اند (ایراد ۱-۶).
- ثبت رکوردهای حسابرسی `AuditLog` رتبه Critical و Warning در عملیات بکاپ (ایراد ۱-۷).
- کنترل سقف حجم آپلود فایل بکاپ در رم (ایراد ۱-۹) و اعتبارسنجی حداقل طول رمز عبور (ایراد ۱-۸).
- توسعه `ConfirmDialogComponent` جهت پشتیبانی از الزام تایپ متن تأییدیه (ایراد ۱-۶، ۵-۷).

---

## 🛠️ گام‌های اجرایی و فایل‌های هدف

### گام ۱: ساخت فایل‌های تست پایه (فاز ۰)
1. ایجاد `backend/warehouses/tests_settings.py`:
   - تست اتصال پایه GET به `/api/settings/global/` برای کاربران احراز هویت شده.
   - ساخت Mock helper برای کاربران دارای/فاقد مجوز `perm_sys_settings`.
2. ایجاد `backend/config/tests_backup.py`:
   - تست رد درخواست‌های ناشناس برای ایجاد و بازیابی بکاپ.
   - **نکته حیاتی:** تمام تست‌های این فایل باید با استفاده از `@mock.patch('subprocess.run')` و `@mock.patch('config.views_backup._find_pg_tool')` شبیه‌سازی شوند تا به هیچ وجه دستورات واقعی دیتابیس اجرا نگردد.
3. بازبینی و سبزسازی `frontend/src/app/components/settings/settings.spec.ts`:
   - افزودن `provideHttpClient()` و `provideHttpClientTesting()` و Stubهای سرویس‌ها جهت پاس شدن تست اولیه.

### گام ۲: ایمن‌سازی متد بازیابی در `config/views_backup.py` (فاز ۱)
1. **اصلاح متغیر فایل نجات (ایراد ۲-۳):**
   - در `BackupRestoreView.post` متغیر `restore_failed = False` در ابتدای متد تعریف شود.
   - در بلوک `except Exception as exc:` مقدار `restore_failed = True` ست شود.
   - در بلوک `finally`، در صورتی که `restore_failed and not rollback_succeeded` برقرار باشد، فایل `rollback_path` حذف **نشود** و لاگ هشدار ثبت گردد.
2. **پاسخ ساختاریافته وضعیت رول‌بک (ایراد ۲-۴):**
   - اضافه کردن فیلد `rollback_state` با مقادیر `'restored'`، `'unavailable'` یا `'failed'` به پاسخ خطای سرور.
   - در صورت بروز خطای دوگانه، مسیر فایل نجات بازگردانده شود.
3. **الزام متن تأیید (ایراد ۱-۶):**
   - بررسی `confirm_text == 'RESTORE_DATABASE_CONFIRM'` در درخواست POST؛ در غیر این صورت بازگرداندن خطای ۴۰۰.
4. **ثبت لاگ‌های حسابرسی (ایراد ۱-۷):**
   - فراخوانی `log_audit_event` با شدت `warning` در `BackupCreateView`.
   - فراخوانی دو لاگ در `BackupRestoreView`: یکی در شروع با شدت `critical` (`RESTORE_START`) و دومی پس از اتمام با نتیجه و `rollback_state`.
5. **سقف حجم آپلود و حداقل طول رمز (ایرادات ۱-۸ و ۱-۹):**
   - بررسی `uploaded_file.size > BACKUP_MAX_UPLOAD_MB` و بازگرداندن ۴۱۳ در صورت تخطی.
   - الزام حداقل ۱۲ کاراکتر برای رمز عبور هنگام **ساخت** بکاپ (روی بازیابی فایل‌های قدیمی اعمال نشود).

### گام ۳: به‌روزرسانی کامپوننت فرانت‌اند
1. در `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts`:
   - افزودن فیلدهای اختیاری `requireText?: string` و `requireTextLabel?: string` به `ConfirmDialogConfig`.
   - غیرفعال ماندن دکمه تأیید تا زمان تایپ دقیق عبارت توسط کاربر.
2. در `frontend/src/app/components/settings/settings.ts` و `services/settings.ts`:
   - ارسال پارامتر `confirm_text: 'RESTORE_DATABASE_CONFIRM'` در متد `restoreBackup`.
   - نمایش پیام‌های تفکیک‌شده متناسب با پاسخ سرور در زمان شکست بازیابی.

---

## 🧪 دستورهای راستی‌آزمایی و تست

```bash
# اجرای تست‌های بک‌اند
cd "E:/warehouse project/backend"
python manage.py test warehouses.tests_settings config.tests_backup -v 2 --keepdb

# اجرای تست‌های فرانت‌اند
cd "E:/warehouse project/frontend"
npx ng test --watch=false --browsers=ChromeHeadless
```
