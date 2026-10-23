<div dir="rtl" align="right">

# طرح جامع یکپارچه‌سازی رفتار تصاویر و بندانگشتی‌ها در تمامی بخش‌ها (مشابه منوی انبارگردان)

این طرح بر اساس توافقات انجام‌شده در مصاحبه طراحی (`/grill-me`) جهت استانداردسازی و همسان‌سازی کامل رفتار تصاویر کالا در تمامی بخش‌های سیستم تدوین شده است.

---

## بررسی کاربر مورد نیاز (User Review Required)

> [!IMPORTANT]
> - در تمامی کارتابل‌ها (سرپرست، مدیر، پیگیری شمارش، گمرک/ترخیص و جدول کالاها)، بندانگشتی ۴۰×۴۰ مستقیماً روی **کارت‌های وظایف و ردیف‌های جداول** قرار می‌گیرد.
> - کلیک روی بندانگشتی مستقیماً پنجره گالری و عکاسی را با دسترسی کامل (دوربین، گالری، حذف و انتخاب شاخص) باز می‌کند بدون آنکه کلیک روی کارت باعث تغییر وضعیت کارت شود (`stopPropagation`).
> - در تمام بخش‌ها همگام‌سازی بلادرنگ (`Real-time Sync`) فعال خواهد بود تا بلافاصله پس از ثبت عکس، تصویر کارت تغییر کند.

---

## بخش‌های تحت پوشش و تغییرات پیشنهادی (Proposed Changes)

### ۱. کارتابل سرپرست (`SupervisorDashboard`)

#### [MODIFY] [`supervisor-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های وظایف شمارش (`filteredTasks`)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های استخر شمارش (`filteredPoolTasks`)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های وظایف اسناد مالی (`filteredDocTasks`)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های استخر اسناد مالی (`filteredDocPoolTasks`)

---

### ۲. کارتابل بررسی مدیر (`ManagerReview`)

#### [MODIFY] [`manager-review.html`](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.html)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های وظایف شمارش مدیر (`filteredTasks`)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های استخر شمارش مدیر (`filteredPoolTasks`)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های وظایف اسناد مالی مدیر (`filteredDocTasks`)
- افزودن باکس بندانگشتی ۴۰×۴۰ به کارت‌های استخر اسناد مالی مدیر (`filteredDocPoolTasks`)

---

### ۳. ماژول پیگیری شمارش و مغایرت‌ها (`CountTracking`)

#### [MODIFY] [`count-tracking.ts`](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
- ایمپورت `ItemPhotoGalleryComponent` و افزودن متدهای `openPhotoGallery`, `closePhotoGallery`, `onPhotosChanged`.

#### [MODIFY] [`count-tracking.html`](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
- قرار دادن آواتار بندانگشتی ۴۰×۴۰ در کنار کد یکتا در جدول پیگیری و افزودن تگ `<app-item-photo-gallery>`.

---

### ۴. ماژول گمرک و ترخیص (`Customs`)

#### [MODIFY] [`customs.ts`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts)
- ایمپورت `ItemPhotoGalleryComponent` و افزودن متدهای `openPhotoGallery`, `closePhotoGallery`, `onPhotosChanged`.

#### [MODIFY] [`customs.html`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html)
- قرار دادن آواتار بندانگشتی ۴۰×۴۰ در جدول اقلام گمرکی و افزودن تگ `<app-item-photo-gallery>`.

---

## برنامه راستی‌آزمایی (Verification Plan)

### Automated Tests
- اجرای `npm run build` برای تأیید کامپایل ۱۰۰٪ تمامی ماژول‌ها و عدم وجود خطای Type یا تمپلت.
- اجرای `python manage.py check` در بک‌اند.

### Manual Verification
- ورود به کارتابل سرپرست و کلیک مستقیم روی آواتار عکس یک کارت شمارش و مشاهده باز شدن سریع گالری.
- ثبت یک عکس با دوربین یا گالری و مشاهده تغییر آنی بندانگشتی روی کارت سرپرست.
- تست همین سناریو در کارتابل مدیر، پیگیری شمارش و گمرک.

</div>
