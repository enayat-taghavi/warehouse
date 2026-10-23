<div dir="rtl" align="right">

# چک‌لیست وظایف مدیریت هوشمند خطاهای حالت آفلاین (Graceful Offline Degradation)

- [x] **فاز ۱: اصلاح تب رهگیری تغییرات (Audit Trail)**
  - [x] افزودن `SKIP_GLOBAL_ERROR_TOAST: true` به `getAuditStats` و `getLoginStats` در [audit-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/audit-api.service.ts)
  - [x] محافظت از خطاهای لود لاگ‌ها در [audit.ts](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts) در وضعیت آفلاین

- [x] **فاز ۲: اصلاح تب گزارش‌ساز پویا (Report Builder)**
  - [x] اعمال `SKIP_GLOBAL_ERROR_TOAST: true` به ساختار پیش‌فرض کانتکست در [report-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/report-api.service.ts)
  - [x] عدم ایجاد خطای سرور در [report-store.ts](file:///e:/warehouse%20project/frontend/src/app/components/reports/report-store.ts) در زمان آفلاین و اتکا به بنر اختصاصی

- [x] **فاز ۳: اصلاح کارتابل مدیر و سرپرست (Manager & Supervisor Review)**
  - [x] شرطی‌سازی نمایش `toast.error` در [manager-review.ts](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts) بر اساس وضعیت آنلاین بودن
  - [x] شرطی‌سازی نمایش `toast.error` در [supervisor-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts) در وضعیت آفلاین

- [x] **فاز ۴: اعتبارسنجی و تست کامل فرانت‌اند**
  - [x] بیلد و کامپایل فرانت‌اند بدون هیچ‌گونه خطای تایپ یا سینتکس (`npm run build` با کد 0)
  - [x] راستی‌آزمایی رفتار آفلاین در ماژول‌های ممیزی، گزارش‌ها و کارتابل‌ها

</div>
