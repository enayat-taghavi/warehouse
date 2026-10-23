<div dir="rtl" align="right">

# برنامه پیاده‌سازی (نسخه بازبینی شده): رفع باگ‌ها و بهبود تب پیگیری شمارش

پس از بازبینی طرح قبلی، نواقص آن برطرف شده و طرح جدید به صورت فازبندی شده و دقیق‌تر ارائه می‌گردد.

## نیازمند بررسی کاربر (User Review Required)

> [!WARNING]
> **اعتبارسنجی بک‌اند:** در فاز ۱ به اعتبارسنجی بک‌اند اشاره شده است. اگر ترجیح می‌دهید فعلاً فقط فرانت‌اند اصلاح شود، لطفاً اعلام کنید تا فاز ۱ را نادیده بگیریم.
> **قانون لغو تخصیص:** فقط رکوردهای `PENDING_COUNT` و `SUPERVISOR_REJECTED` مجاز به لغو تخصیص در نظر گرفته شده‌اند.

---

## فازبندی اجرا (Phased Execution)

### فاز ۱: تضمین امنیت داده‌ها در بک‌اند (Backend Security)
**هدف:** جلوگیری از خرابکاری داده‌ها در صورت دور زدن فرانت‌اند.
*   **بررسی و اصلاح API بک‌اند:** متد مربوط به لغو تخصیص در بک‌اند (احتمالاً در فایل‌های `views.py` یا `services.py` بخش شمارش) باید بررسی شود تا مطمئن شویم فقط رکوردهای مجاز (PENDING_COUNT) لغو تخصیص می‌شوند و رکوردهای نهایی شده یا شمرده شده با خطای 400 (Bad Request) رد می‌شوند.

### فاز ۲: هماهنگ‌سازی وضعیت (State Sync)
**هدف:** رفع مشکل باقی‌ماندن تیک چک‌باکس‌ها در جدول هنگام رفرش.
*   **[MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)**
    *   در متدهای `loadTasks` و `toggleCompleted`، بلافاصله `this.selectedTaskIds.clear()` فراخوانی می‌شود.
*   **[MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)**
    *   ویژگی `[selectedIds]="selectedTaskIds"` به کامپوننت `<app-data-table>` پاس داده می‌شود. (در طرح قبلی این موضوع فراموش شده بود؛ بدون پاس دادن این متغیر، کامپوننت جدول از پاک شدن State بی‌خبر می‌ماند و تیک‌ها در UI باقی می‌ماندند).

### فاز ۳: اصلاحات منطق عملیاتی (Operational Logic)
**هدف:** بهبود تجربه کاربری هنگام خطاها و جستجو.
*   **[MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)**
    *   **مدیریت لغو تخصیص هوشمند:** در متد `cancelAllocation`، به جای مسدود کردن کل عملیات در صورت وجود یک انتخاب نامعتبر، رکوردهای مجاز فیلتر می‌شوند. اگر رکورد مجازی وجود نداشت اخطار می‌دهد، اما اگر ترکیبی از مجاز و غیرمجاز بود، فقط مجازها را به سرور می‌فرستد (همراه با پیام مناسب).
    *   **جستجوی بدون حساسیت به حروف:** در `applyFilters`، ورودی‌ها قبل از اجرای `.includes` با `.toLowerCase()` یکسان‌سازی می‌شوند.
    *   **دقت نمایش زمان:** در `formatDuration`، بلوک مربوط به بالای ۲۴ ساعت تغییر می‌کند تا به صورت دقیق‌تر (مثلاً `1 روز و 2 ساعت`) بازگردانده شود.

### فاز ۴: اصلاحات ظاهری و UI
**هدف:** استانداردسازی نمایش وضعیت‌ها و فیلترها.
*   **[MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)**
    *   اضافه شدن گزینه‌های جا افتاده (`SUPERVISOR_REJECTED`، `MANAGER_REJECTED`، `FINAL_APPROVED`) به فیلتر `<select>`.
    *   اصلاح تداخل CSS در `<span class="...">`: کلاس‌های استاتیک حذف شده و تنظیم ظاهر به طور کامل به خروجی `getStatusClass` سپرده می‌شود تا استایل کپسولی (`rounded-full`) به درستی اعمال شود.
    *   تغییر متن ثابت دکمه با اینترپولیشن: `{{ showCompleted ? 'مخفی کردن پایان‌یافته' : 'نمایش پایان‌یافته' }}`.
    *   اصلاح `[title]` در بخش توضیحات کالا با اضافه کردن `|| ''`.

### فاز ۵: فیلترهای پیشرفته و تجمیع رابط کاربری
**هدف:** امکان جستجوی متنی و انتخاب چندگانه در ستون‌ها به صورت همزمان.
*   **[MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)**
    *   اضافه کردن مدیریت مقادیر خالی به نام‌های مشخص («ندارد»، «نامشخص»، «استخر مشترک») تا فیلترهای چک‌باکسی دچار باگ نشوند.
    *   ترکیب منطق "AND" برای فیلترهای متنی (`_search`) و چک‌باکسی تا رکوردهای نهایی با دقت بالا فیلتر شوند.
*   **[MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)**
    *   حذف نوار جستجو و وضعیت از بالای صفحه برای خلوت‌سازی.
    *   تبدیل ستون‌های "انبار"، "انبارگردان"، "سرپرست"، "مدیریت" و "وضعیت فعلی" به فیلتر `checkbox_text`.

### فاز ۶: بهینه‌سازی عملکرد (Performance Optimization) و رفع فریز شدن UI
**هدف:** جلوگیری از قفل شدن مرورگر در رکوردهای زیاد، رفع خطاهای جستجو و ناپدید شدن جدول.

*   **[MODIFY] [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)**
    *   **محاسبه قبلی (Pre-calculation):** اضافه کردن یک نگاشت (Mapping) در تابع `loadTasks` روی آرایه `this.tasks` برای محاسبه و ذخیره‌ی مقادیری مانند نام مدیر و زمان توقف مراحل در متغیرهای موقت (مثلاً `_computed_manager_name` و `_computed_counter_dur`). با این کار پردازش سنگین Sort روی تاریخچه فقط یک بار هنگام لود دیتا انجام می‌شود و مرورگر آزاد می‌گردد.
    *   **صفحه‌بندی سمت کلاینت (Client-Side Pagination):** تعریف متغیرهای `currentPage` و `pageSize` و نوشتن متد `get paginatedTasks()` برای ارسال تنها دیتای یک صفحه (مثلاً ۲۰ رکورد) به کامپوننت `app-data-table` در هر لحظه. اضافه کردن متد `onPageChange` برای تغییر صفحات.
    *   **تبدیل داده در فیلتر (`toString`):** اصلاح جستجوی کد کالا در `applyFilters` با افزودن `.toString()` قبل از `.toLowerCase()` برای جلوگیری از خطای TypeError در زمان ارسال اعداد از سرور.

*   **[MODIFY] [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)**
    *   **تغییر متغیرهای ارسالی به جدول:** تغییر `[data]="filteredTasks"` به `[data]="paginatedTasks"` و اضافه کردن ویژگی‌های صفحه‌بندی مانند `[totalCount]="filteredTasks.length"`, `[currentPage]="currentPage"`, `[pageSize]="pageSize"` و `(pageChanged)="onPageChange($event)"` به تگ `<app-data-table>`.
    *   **سبک‌سازی (Refactoring) ردیف‌ها:** جایگزینی توابع سنگین `getManagerName(row)` و `getStageDuration(row)` با ویژگی‌های محاسبه شده‌ی `row._computed...` که در مرحله قبل به آبجکت اضافه شدیم.
    *   **رفع باگ ناپدید شدن (Empty State):** حذف شرط `*ngIf="!isLoading && filteredTasks.length > 0"` از روی جدول تا ساختار هدر و کادرهای جستجوی آن حتی در صورت خالی بودن نتایج حفظ شود.
    *   حذف تگ جداگانه‌ی `Empty State` که پیام «موردی یافت نشد» را نشان می‌داد، زیرا کامپوننت جدول خود دارای یک قالب جایگزین (Fallback) بسیار زیباست و فقط باید پیام `[emptyMessage]="'با این فیلترها کالایی برای پیگیری وجود ندارد.'"` را به آن پاس داد.

</div>
