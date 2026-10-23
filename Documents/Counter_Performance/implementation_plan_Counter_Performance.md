<div dir="rtl" align="right">

# طرح اجرایی: بهبود عملکرد و رفع کندی پنل انبارگردان

این طرح به منظور رفع مشکل افت فریم و کندی شدید دکمه‌ها در تب `counter-dashboard` تهیه شده است. علت اصلی این مشکل، استفاده از توابع `Getter` برای فیلتر کردن لیست طولانی کالاها به صورت مستقیم درون فایل HTML (حلقه `*ngFor`) بوده است که باعث می‌شد Angular با هر کلیک، کل عناصر DOM را تخریب و از نو بسازد.

## User Review Required

> [!IMPORTANT]
> <div dir="rtl" align="right">
> لطفاً این طرح را بررسی کنید. اجرای این طرح نیازمند تایید شماست تا مطمئن شویم در روند کار تداخلی ایجاد نمی‌شود. این تغییرات کاملاً روی بهبود پرفورمنس تمرکز دارد و ظاهر را تغییر نمی‌دهد.
> </div>

## تغییرات پیشنهادی (Proposed Changes)

تغییرات در کامپوننت `CounterDashboard` اعمال خواهد شد:

---

### بخش منطق و کامپوننت (Component Logic)

#### [MODIFY] [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
- **حذف Getters:** متدهای `filteredTasks`، `completedTasksCount` و `remainingTasksCount` از حالت `get` خارج شده و به متغیرهای معمولی تبدیل می‌شوند.
- **ایجاد تابع `applyFilters()`:** تابعی ایجاد می‌شود که وظیفه دارد مقادیر متغیرهای فوق را محاسبه کند. این تابع فقط زمانی فراخوانی می‌شود که لیست کالاها از سرور دریافت شود یا کاربر روی دکمه‌های فیلتر کلیک کند.
- **ایجاد تابع `trackByTaskId`:** تابعی برای استفاده در دستور `*ngFor` اضافه می‌شود تا Angular بتواند کالاها را با شناسه (`id`) آن‌ها رهگیری کند و از رندر مجدد موارد تکراری جلوگیری نماید.

---

### بخش رابط کاربری (HTML Template)

#### [MODIFY] [counter-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html)
- **افزودن trackBy:** تغییر دستور `<div *ngFor="let task of filteredTasks">` به `<div *ngFor="let task of filteredTasks; trackBy: trackByTaskId">`.

## برنامه تست و راستی‌آزمایی (Verification Plan)

### تست خودکار
- پس از اعمال تغییرات، خطاهای کامپایل سیستم از طریق ترمینال بررسی می‌شود.

### تست دستی
- وارد شدن به پنل انبارگردان در مرورگر، کلیک متوالی روی فیلترها (همه، شمرده شده، باقیمانده) و بررسی روان بودن انیمیشن‌ها و عدم تاخیر در رابط کاربری.

</div>
