<div dir="rtl" align="right">

# لیست وظایف پیاده‌سازی وضعیت «شمارش اولیه» (Initial Count Task List)

<!-- id: initial_count_workflow -->
### فاز ۱: زیرساخت داده و بک‌اند (Backend Foundation & Migrations)
- [x] <!-- id: 10 --> ۱.۱. افزودن گزینه `INITIAL_COUNT` به `STATUS_CHOICES` در [models.py](file:///e:/warehouse%20project/backend/inventory/models.py)
- [x] <!-- id: 11 --> ۱.۲. ایجاد و اعمال مایگریشن جنگو با `makemigrations` و `migrate` (`0024_alter_counttask_status.py`)
- [x] <!-- id: 12 --> ۱.۳. به‌روزرسانی کوئری‌های فیلتر و متد `bulk_submit` و `bulk_cancel` در [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
- [x] <!-- id: 13 --> ۱.۴. ثبت اکشن و لاگ در `CountTaskHistory` و به‌روزرسانی [registry.py](file:///e:/warehouse%20project/backend/reports/registry.py)

### فاز ۲: لایه داده محلی و همگام‌سازی آفلاین فرانت‌اند (Dexie & Store Layer)
- [x] <!-- id: 20 --> ۲.۱. افزودن تایپ `INITIAL_COUNT` به `CountTaskStatus` در [count-task.model.ts](file:///e:/warehouse%20project/frontend/src/app/core/models/count-task.model.ts)
- [x] <!-- id: 21 --> ۲.۲. به‌روزرسانی متد `saveDraft` در [count-task-store.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/count-task-store.ts) جهت ارتقای وضعیت خوش‌بینانه
- [x] <!-- id: 22 --> ۲.۳. به‌روزرسانی متد `submitTasks` و تطابق با صف آفلاین

### فاز ۳: ارتقای رابط کاربری داشبورد انبارگردان (Counter Dashboard UI/UX)
- [x] <!-- id: 30 --> ۳.۱. تفکیک ۴ وضعیت در محاسبات `statusCounts` و فیلترهای [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
- [x] <!-- id: 31 --> ۳.۲. افزودن چیپ فیلتر «شمارش اولیه» و طراحی بج بنفش/نیلی اختصاصی در [counter-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html)
- [x] <!-- id: 32 --> ۳.۳. تنظیم منطق دسترسی ویرایش (`isReadOnly`) و لیبل‌های تاریخچه اقدامات

### فاز ۴: مانیتورینگ زنده و گزارش‌ساز (Count Tracking & Reports)
- [x] <!-- id: 40 --> ۴.۱. افزودن برچسب و استایل `INITIAL_COUNT` به جدول [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts) و [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
- [x] <!-- id: 41 --> ۴.۲. تنظیم فیلترها و وضعیت در خروجی‌های اکسل

### فاز ۵: تست جامع، بیلد و راستی‌آزمایی (Verification & Build Check)
- [x] <!-- id: 50 --> ۵.۱. تست بیلد بدون خطای فرانت‌اند و بک‌اند (`python manage.py check` و `npm run build`)
- [x] <!-- id: 51 --> ۵.۲. راستی‌آزمایی چرخه کامل آفلاین و آنلاین ثبت شمارش و ارسال به سرپرست

</div>
