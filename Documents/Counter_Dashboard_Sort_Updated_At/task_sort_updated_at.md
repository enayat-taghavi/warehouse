<div dir="rtl" align="right">

# لیست وظایف تغییر مرتب‌سازی پیش‌فرض داشبورد انبارگردان (Sort Updated At Task List)

<!-- id: counter_dashboard_sort_updated_at -->
### فاز ۱: منطق کامپوننت و مدیریت وضعیت (TypeScript Logic)
- [x] <!-- id: 10 --> ۱.۱. تغییر مقدار اولیه `sortField` به `'updated_at'` و `sortDirection` به `'desc'` در [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
- [x] <!-- id: 11 --> ۱.۲. به‌روزرسانی متدهای `updateUrlState` و `syncStateFromUrl` جهت تنظیم پیش‌فرض `updated_at`

### فاز ۲: ساختار قالب و منوی دراپ‌داون (HTML Template)
- [x] <!-- id: 20 --> ۲.۱. انتقال گزینه «آخرین زمان تغییر» به ردیف اول منوی کشویی مرتب‌سازی در [counter-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html)

### فاز ۳: تست و اعتبارسنجی (Verification & Build Check)
- [x] <!-- id: 30 --> ۳.۱. تست بیلد بدون خطای فرانت‌اند (`npm run build`)
- [x] <!-- id: 31 --> ۳.۲. راستی‌آزمایی مرتب‌سازی پیش‌فرض و عملکرد دکمه‌های مرتب‌سازی

</div>
