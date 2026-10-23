<div dir="rtl" align="right">

# گزارش انجام تغییرات (UI Improvements)

تمامی موارد درخواستی برای اصلاح دکمه‌های بروزرسانی و وضعیت Loading در تب‌ها با موفقیت اعمال و تست شد:

## ۱. رفع مشکل بارگذاری (Loading) در تب‌ها
- فایل‌های ویرایش شده:
  - [`settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.html)
  - [`wh-settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html)
- **تغییرات:** شرط `*ngIf="!isLoading"` از کانتینرهای تب‌ها حذف شد تا در هنگام بروزرسانی صفحه، ساختار تب‌ها و اطلاعات درون آن‌ها از بین نرود. بجای آن دکمه‌های بروزرسانی (تک‌کلیکی) حالت `disabled` گرفته و یک افکت Loading (چرخشی / Spinner) نمایش می‌دهند. همچنین دکمه‌ها برای جلوگیری از ارسال ناخواسته‌ی فرم‌ها به `type="button"` تغییر یافتند.

## ۲. انتقال دکمه‌های بروزرسانی (هم‌ترازی با هدر اصلی)
- فایل‌های ویرایش شده:
  - [`projects.html`](file:///e:/warehouse%20project/frontend/src/app/components/projects/projects.html) (صفحه انبارها)
  - [`users.html`](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html) (صفحه کاربران و نقش‌ها)
- **تغییرات:** در هر دو صفحه، دکمه‌ی بروزرسانی از مکان‌های پراکنده جمع‌آوری شده و دقیقاً کنار عنوان اصلی صفحه در سمت راست بالا قرار داده شد. این تغییر منجر به هماهنگی بیشتر رابط کاربری با دیگر صفحات شد.

### گزارش‌ساز پویا (`reports`)
- تغییر مکان دکمه: اضافه شدن به دکمه‌های کنترلر صفحه
- افزودن `isRefreshing` و متد `refreshAll` به `report-store.ts` برای هندل کردن وضعیت لودینگ هر دو لیست به صورت همزمان.

### کارتابل مالی (`customs`)
- تغییر مکان دکمه: خروج از کنار عنوان و قرار گرفتن در سمت چپ (کنار نماد آفلاین).
- استفاده از وضعیت `isLoading` برای نمایش افکت اسپینر.

### داشبورد مانیتورینگ (`dashboard`)
- اضافه کردن فیلد `isDashboardRefreshing` و اعمال افکت اسپینر بر روی دکمه‌ی سمت چپ.

## نتایج تست
دستور `npm run build` با موفقیت و بدون خطا اجرا شد و تمام کدها کامپایل شدند.

## ۳. افزودن دکمه‌های بروزرسانی به سایر تب‌ها
- فایل‌های ویرایش شده:
  - [`dispatch.html`](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.html) (تخصیص کالا)
  - [`count-tracking.html`](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html) (پیگیری وضعیت شمارش)
  - [`reports.html`](file:///e:/warehouse%20project/frontend/src/app/components/reports/reports.html) (گزارش‌ساز پویا)
  - [`customs.html`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html) (کارتابل مالی و مدارک)
- **تغییرات:** دکمه‌ی بروزرسانی با طراحی یکپارچه‌ی سیستم در کنار عنوان این صفحات اضافه شد و مستقیماً به متدهای بارگذاری مربوطه (مانند `loadItems()`، `loadTasks()` و `store.loadEntities()`) متصل گردید.

## ۴. تست و ارزیابی (Verification)
- دستور `npm run build` با موفقیت روی سورس فرانت‌اند اجرا شد.
- هیچ خطای ساختاری و Syntax Error در تمپلیت‌های HTML گزارش نشد.

> [!TIP]
> اکنون کاربر به راحتی در هر صفحه می‌تواند با فشردن آیکون رفرش کنار عنوان صفحه، داده‌ها را مجدداً و بدون از دست رفتن وضعیت تب‌ها، واکشی کند.

</div>
