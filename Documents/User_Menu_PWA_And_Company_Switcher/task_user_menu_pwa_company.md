# لیست وظایف اجرایی بازطراحی منوی کاربری، PWA و سوئیچر شرکت

<div dir="rtl" align="right">

- [x] **فاز ۱: ایجاد سرویس اختصاصی هوشمند نصب PWA** <!-- id: phase1-pwa-service -->
  - [x] ساخت فایل `pwa-install.service.ts` و شنیدن رویداد `beforeinstallprompt` <!-- id: task-pwa-service-create -->
  - [x] تشخیص وضعیت Standalone / نصب‌شده و پلتفرم iOS <!-- id: task-pwa-standalone -->
  - [x] پیاده‌سازی متدهای نصب و راهنمای نصب <!-- id: task-pwa-methods -->

- [x] **فاز ۲: بازطراحی منوی کاربری (`app-user-menu`)** <!-- id: phase2-user-menu -->
  - [x] حذف کامل دراپ‌داون و کارت انتخاب شرکت از `user-menu.component.html` <!-- id: task-user-menu-html-clean -->
  - [x] پاکسازی متدهای زائد شرکت از `user-menu.component.ts` <!-- id: task-user-menu-ts-clean -->
  - [x] قرار دادن دکمه هوشمند «نصب برنامه» با آیکون و وضعیت در صورت نصب بودن <!-- id: task-user-menu-install-btn -->
  - [x] مرتب‌سازی و زیباسازی دسته‌بندی‌های منو و افزودن نشانگر نسخه سامانه <!-- id: task-user-menu-styling -->

- [x] **فاز ۳: هوشمندسازی سوئیچر شرکت و رفع باگ‌های عدم کارکرد** <!-- id: phase3-company-switcher-logic -->
  - [x] تزریق `AuthService` و بررسی همزمان `isSuperuser` از پروفایل لوکال، مجوزها و رول‌ها برای جلوگیری از Race Condition <!-- id: task-switcher-multicompany-logic -->
  - [x] رفع رفتار سکوت دکمه برای کاربران تک‌شرکتی با نمایش پیام راهنمای دوستانه (Toast) <!-- id: task-switcher-toast-feedback -->
  - [x] کش‌سازی درخواست‌های همزمان شبکه (In-Flight Request Caching) در `ActiveCompanyService` <!-- id: task-switcher-dedup -->
  - [x] رفع باگ قفل شدن مودال هنگام انتخاب «همه شرکت‌ها» توسط سوپریوزر <!-- id: task-switcher-modal-fix -->

- [x] **فاز ۴: بهینه‌سازی ارگونومی هدر در نسخه موبایل (Icon-Only Mode)** <!-- id: phase4-mobile-ergonomics -->
  - [x] مخفی‌سازی کامل فلش کشویی (`hidden sm:inline`) در موبایل برای حفظ دکمه مربعی بی‌نقص <!-- id: task-mobile-chevron-hide -->
  - [x] تنظیم دقیق ابعاد دکمه و نشانگر نقطه‌ای رنگی وضعیت روی آیکون 🏢 <!-- id: task-mobile-icon-only -->

- [x] **فاز ۵: یکپارچه‌سازی هدر مرکز عملیات (`operations-layout`)** <!-- id: phase5-operations-header -->
  - [x] ایمپورت `CompanySwitcherComponent` و `CompanySelectionModalComponent` <!-- id: task-ops-header-import -->
  - [x] قراردادن سوئیچر و مودال در هدر و قالب مرکز عملیات <!-- id: task-ops-header-place -->

- [x] **فاز ۶: تست، کامپایل و اعتبارسنجی کیفی** <!-- id: phase6-verification -->
  - [x] اجرای موفقیت‌آمیز ۲۹ تست واحد Vitest در سرویس‌ها و کامپوننت‌ها <!-- id: task-run-vitest -->
  - [x] تأیید ۱۰۰٪ نگهبان ۵۲ (Guardian 52) برای آیکون‌های SVG <!-- id: task-guardian-52 -->
  - [x] اجرای بیلد نهایی فرانت‌اند و پچ Service Worker (NGSW 530) <!-- id: task-run-ng-build -->

</div>
