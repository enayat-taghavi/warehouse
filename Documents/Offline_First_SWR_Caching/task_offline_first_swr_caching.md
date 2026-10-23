<div dir="rtl" align="right">

# چک‌لیست وظایف فازبندی‌شده معماری SWR آفلاین-اول

- [x] **فاز ۱: هسته سرویس‌های آفلاین و رهگیر SWR (تکمیل و راستی‌آزمایی شد)** <!-- id: phase1_core_services -->
  - [x] افزودن جریان `liveDataUpdates$` و متد `notifyDataUpdated` در [offline-sync.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/offline-sync.service.ts)
  - [x] بازنویسی منطق GET در [offline.interceptor.ts](file:///e:/warehouse%20project/frontend/src/app/core/interceptors/offline.interceptor.ts) برای الگوی SWR (کش فوری + استعلام آرام پس‌زمینه)
  - [x] بیلد آزمایشی و راستی‌آزمایی مستقل فاز ۱ و ارائه گزارش جهت تایید کاربر
- [x] **فاز ۲: یکپارچه‌سازی میزکار انبارگردان و کارتابل پیگیری (تکمیل و راستی‌آزمایی شد)** <!-- id: phase2_counter_and_tracking -->
  - [x] اشتراک [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts) در رویدادهای پس‌زمینه و اعمال افکت `.status-updated-flash`
  - [x] اتصال [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts) به جریان بروزرسانی زنده
  - [x] راستی‌آزمایی عملکردی فاز ۲ و ارائه گزارش جهت تایید کاربر
- [x] **فاز ۳: یکپارچه‌سازی کارتابل‌های سرپرست و مدیر (تکمیل و راستی‌آزمایی شد)** <!-- id: phase3_supervisor_and_manager -->
  - [x] اتصال تب‌های [supervisor-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts) به بروزرسانی خودکار پس‌زمینه
  - [x] اتصال [manager-review.ts](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts) به جریان SWR و هایلایت تغییرات
  - [x] راستی‌آزمایی فاز ۳ و ارائه گزارش جهت تایید کاربر
- [x] **فاز ۴: کارتابل مالی، تست‌های سرتاسری و مستندسازی نهایی (تکمیل و راستی‌آزمایی شد)** <!-- id: phase4_customs_and_e2e -->
  - [x] اتصال [customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts) به جریان SWR
  - [x] تست‌های مقاومت در برابر خطای ۵۰۲ و قطعی کامل سرور
  - [x] بیلد نهایی با `npm run build` و ثبت مستندات کامل DUAL-SAVE

</div>
