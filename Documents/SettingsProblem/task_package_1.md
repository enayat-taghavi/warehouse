<div dir="rtl" align="right">

# چک‌لیست وظایف: بسته ۱ — زیرساخت تست و ایمن‌سازی دیتابیس و بکاپ (Database & Backup Armor)

## 📋 وضعیت فازها و گام‌های اجرایی

- [x] **فاز ۰: راه‌اندازی زیرساخت تست‌های واحد (Test Infrastructure)**
  - [x] ساخت `backend/warehouses/tests_settings.py` و Mock helper کاربر دارای/فاقد مجوز <!-- id: 0.1 -->
  - [x] ساخت `backend/config/tests_backup.py` و شبیه‌سازی امن Mock برای `pg_dump`/`pg_restore` <!-- id: 0.2 -->
  - [x] پیکربندی و سبزسازی تست‌های فرانت‌اند `settings.spec.ts` با Providerهای HTTP Testing و Stubها <!-- id: 0.3 -->

- [x] **فاز ۱: ایمن‌سازی بک‌اند و فرانت‌اند بازیابی دیتابیس و بکاپ (Database & Backup Armor)**
  - [x] اصلاح باگ حذف فایل نجات در پایتون ۳ با متغیر صریح `restore_failed` در `config/views_backup.py` (ایراد ۲-۳) <!-- id: 1.1 -->
  - [x] پاسخ ساختاریافته وضعیت رول‌بک `rollback_state` به تفکیک سه حالت `restored`، `unavailable` و `failed` (ایراد ۲-۴) <!-- id: 1.2 -->
  - [x] الزام بررسی متن تأیید صریح `RESTORE_DATABASE_CONFIRM` در بک‌اند (ایراد ۱-۶) <!-- id: 1.3 -->
  - [x] ثبت لاگ‌های ممیزی `AuditLog` رتبه Critical و Warning برای شروع و نتیجه بازیابی و ایجاد بکاپ (ایراد ۱-۷) <!-- id: 1.4 -->
  - [x] بررسی سقف حجم آپلود `BACKUP_MAX_UPLOAD_MB` پیش از خواندن فایل در حافظه (ایراد ۱-۹) <!-- id: 1.5 -->
  - [x] الزام حداقل طول رمز عبور (۱۲ کاراکتر) در زمان ساخت بکاپ بدون محدودسازی بازیابی فایل‌های قدیمی (ایراد ۱-۸) <!-- id: 1.6 -->
  - [x] توسعه `ConfirmDialogComponent` جهت پشتیبانی از الزام تایپ متن تاییدیه `requireText` (ایرادات ۱-۶ و ۵-۷) <!-- id: 1.7 -->
  - [x] به‌روزرسانی متدهای بکاپ و بازیابی در `services/settings.ts` و `components/settings/settings.ts` و `settings.html` <!-- id: 1.8 -->

- [x] **راستی‌آزمایی، اجرای تست‌ها و اعتبارسنجی نهایی (Verification & Audit)**
  - [x] اجرای تست‌های بک‌اند `warehouses.tests_settings` و `config.tests_backup` و کسب نتیجه سبز (۲۰ تست) <!-- id: 2.1 -->
  - [x] اجرای تست‌های فرانت‌اند `settings.spec.ts`، `settings.service.spec.ts` و `confirm-dialog.component.spec.ts` (۱۵ تست سبز) <!-- id: 2.2 -->
  - [x] ممیزی عدم آسیب به سایر بخش‌ها و بیلد موفق پروژه و به‌روزرسانی مستندات DUAL-SAVE <!-- id: 2.3 -->

</div>
