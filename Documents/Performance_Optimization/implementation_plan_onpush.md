<div dir="rtl" align="right">

# برنامه‌ریزی: پیاده‌سازی استراتژی OnPush در پنل انبارگردان

هدف از این تغییر، بهینه‌سازی حداکثری عملکرد رابط کاربری (UI) پنل انبارگردان موبایل است. با این تغییر، مشکل فریز شدن و تاخیر ۲۰ ثانیه‌ای در دکمه‌های فیلتر به طور کامل برطرف شده و سرعت رندر مرورگر به شدت افزایش می‌یابد. کاربر در پیام قبلی صراحتاً اجرای این طرح را تایید کرده است.

## تغییرات پیشنهادی

### فایل‌های مربوط به کامپوننت Counter Dashboard
تغییرات زیر در کامپوننت اصلی پنل اعمال خواهد شد:

#### [MODIFY] [counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
- افزودن `ChangeDetectionStrategy` به لیست ایمپورت‌ها از `@angular/core`
- تنظیم `changeDetection: ChangeDetectionStrategy.OnPush` در دکوراتور `@Component`
- افزودن دستور `this.cdr.detectChanges()` به پایان توابع زیر برای اعمال آپدیت گرافیکی:
  - `setFilter`
  - `toggleProfileMenu`
  - `openPasswordModal`
  - `closePasswordModal`
  - `togglePasswordVisibility`
  - `toggleSelection`
  - `toggleAll`

## برنامه راستی‌آزمایی (Verification Plan)
پس از اعمال تغییرات، هیچ خطایی نباید در ترمینال (`npm start`) وجود داشته باشد و دکمه‌های فیلتر باید به صورت کاملاً آنی عمل کنند.

</div>
