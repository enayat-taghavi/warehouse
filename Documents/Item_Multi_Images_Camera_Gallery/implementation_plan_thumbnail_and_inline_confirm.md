<div dir="rtl" align="right">

# طرح پیاده‌سازی بندانگشتی آخرین تصویر کالا و دیالوگ تایید حذف داخلی (Inline Confirmation)

این طرح بر اساس توافقات انجام‌شده در مصاحبه طراحی (`/grill-me`) جهت ارتقای تجربه کاربری سیستم چندعکسی تدوین شده است:
۱. **بندانگشتی تصویری زنده (Live 40x40 Thumbnail Avatar):** جایگزینی دکمه‌های متنی با یک تامب‌نیل ۴۰×۴۰ مربعی از آخرین/شاخص‌ترین تصویر کالا همراه با بج تعداد و حالت پیش‌فرض عکاسی (Placeholder).
۲. **دیالوگ تایید حذف داخلی (Custom Inline Deletion Confirmation):** حذف کامل دیالوگ پیش‌فرض مرورگر (`window.confirm`) و ایجاد نوار تایید دو مرحله‌ای داخلی در مودال گالری.

---

## بررسی کاربر مورد نیاز (User Review Required)

> [!IMPORTANT]
> - در صورت وجود تصویر برای کالا، عکس بندانگشتی واقعی (WebP Thumbnail) با ابعاد ۴۰×۴۰ و گوشه‌های گرد نمایش می‌یابد و تعداد کل عکس‌ها در گوشه آن نشان داده می‌شود.
> - در صورت عدم وجود تصویر، یک باکس شیک با خط‌چین و آیکون دوربین قرار می‌گیرد که با یک کلیک دوربین یا گالری را باز می‌کند.
> - عملیات حذف تصویر بدون باز شدن پنجره‌های پیش‌فرض مرورگر، مستقیماً با یک نوار تایید داخلی شیک با دکمه‌های «بله، حذف شود» و «انصراف» اجرا خواهد شد.

---

## تغییرات پیشنهادی (Proposed Changes)

### ۱. کامپوننت گالری تصاویر (`ItemPhotoGalleryComponent`)

#### [MODIFY] [`item-photo-gallery.component.ts`](file:///e:/warehouse%20project/frontend/src/app/shared/components/item-photo-gallery/item-photo-gallery.component.ts)
- افزودن سیگنال reactive `confirmDeletePhotoId = signal<number | null>(null)` برای مدیریت وضعیت تایید حذف داخلی.
- پیاده‌سازی متدهای `requestDelete(photo)`, `confirmDelete()`, `cancelDelete()`.
- حذف کامل فراخوانی `window.confirm()`.

#### [MODIFY] [`item-photo-gallery.component.html`](file:///e:/warehouse%20project/frontend/src/app/shared/components/item-photo-gallery/item-photo-gallery.component.html)
- افزودن نوار تایید حذف داخلی متحرک با تم هشدار (Rose/Red) در زیر پیش‌نمایش عکس فعال شامل متن فارسی، دکمه تایید حذف و دکمه لغو.

---

### ۲. کارتابل شمارشگر (`CounterDashboard`)

#### [MODIFY] [`counter-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html)
- در کارت‌های لیست: جایگزینی دکمه متنی `📷 عکس` با کامپوننت/باکس بندانگشتی ۴۰×۴۰ (تصویر `task.item_details?.primary_thumbnail` با بج `photos_count` یا آیکون دوربین در صورت نبود عکس).
- در دراور جزییات کالا: نمایش بندانگشتی در کنار کد یکتا و عنوان کالا.

---

### ۳. کارتابل‌های سرپرست و مدیر (`Supervisor` & `Manager`)

#### [MODIFY] [`supervisor-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html)
- در مودال جزییات: جایگزینی دکمه متنی با تامب‌نیل ۴۰×۴۰ کالا و بج تعداد عکس‌ها.

#### [MODIFY] [`manager-review.html`](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.html)
- در مودال بررسی مدیر: جایگزینی دکمه متنی با تامب‌نیل ۴۰×۴۰ کالا و بج تعداد عکس‌ها.

---

### ۴. جدول اصلی کالاها (`Dispatch`)

#### [MODIFY] [`dispatch.html`](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.html)
- در ستون `fa_unic_code`: نمایش بندانگشتی ۴۰×۴۰ از عکس اصلی کالا کنار کد یکتا با افکت hover و زوم سریع هنگام کلیک.

---

## برنامه راستی‌آزمایی (Verification Plan)

### Automated Tests
- اجرای `npm run build` در `frontend` برای تضمین عدم وجود خطای کامپایلری یا تایپ‌اسکریپت.
- اجرای `python manage.py check` در `backend`.

### Manual Verification
- تست کلیک روی تامب‌نیل دارای عکس و باز شدن گالری با فوکوس روی همان عکس.
- تست کلیک روی تامب‌نیل بدون عکس (حالت Placeholder) و آماده بودن دوربین/گالری.
- تست کلیک روی دکمه حذف تصویر در گالری و بررسی نمایش نوار تایید داخلی بدون پرتاب پاپ‌آپ مرورگر.

</div>
