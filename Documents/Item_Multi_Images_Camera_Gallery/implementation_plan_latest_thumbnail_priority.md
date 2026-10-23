<div dir="rtl" align="right">

# طرح پیاده‌سازی نمایش دقیق تصویر شاخص / آخرین عکس کالا و همگام‌سازی آنی بندانگشتی‌ها

این طرح بر اساس مصاحبه با کاربر تدوین گردیده و متضمن دو بخش حیاتی است:
۱. **اولویت‌بندی صحیح در بک‌اند (`Backend Serialization Priority`):** در صورت وجود عکسی با علامت شاخص (`is_primary=True`)، تصویر شاخص به عنوان تامب‌نیل انتخاب می‌شود. در غیر این صورت، جدیدترین و آخرین عکس آپلودشده (`order_by('-created_at', '-id')`) انتخاب خواهد شد. همچنین در صورت وجود `request`، آدرس‌ها به صورت Absolute URL استاندارد تولید می‌شوند.
۲. **به‌روزرسانی بلادرنگ در فرانت‌اند (`Real-time UI Sync`):** به محض آپلود عکس جدید، حذف عکس یا تغییر عکس شاخص در گالری، رویداد `photosChanged` بلافاصله فیلدهای `primary_thumbnail` و `photos_count` را در حافظه کارت‌ها، دراور و جدول‌ها آپدیت می‌کند تا تصویر آخرین عکس بدون نیاز به رفرش صفحه فوراً در بندانگشتی ظاهر گردد.

---

## بررسی کاربر مورد نیاز (User Review Required)

> [!IMPORTANT]
> - منطق اولویت نمایش تامب‌نیل:
>   1. عکس شاخص فعال (`is_primary=True`)
>   2. در صورت نبود شاخص، جدیدترین و آخرین عکس ثبت‌شده (`order_by('-created_at', '-id')`)
> - فرانت‌اند بلافاصله پس از تغییرات عکس در مودال، تامب‌نیل روی کارت‌ها و جداول را بلادرنگ آپدیت خواهد کرد.

---

## تغییرات پیشنهادی (Proposed Changes)

### ۱. بک‌اند (`backend`)

#### [MODIFY] [`serializers.py`](file:///e:/warehouse%20project/backend/inventory/serializers.py)
- بازنویسی متد `get_primary_thumbnail` در `ItemSerializer` با رعایت دقیق اولویت شاخص و سپس آخرین عکس ثبت‌شده (`-created_at`, `-id`).
- پشتیبانی کامل از تولید آدرس Absolute در صورت وجود `request context`.

---

### ۲. فرانت‌اند (`frontend`)

#### [MODIFY] [`counter-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
- به‌روزرسانی متد `onPhotosChanged` برای استخراج آدرس تامب‌نیل شاخص یا آخرین عکس و تزریق فوری آن به `task.item_details.primary_thumbnail` و `selectedTask.item_details.primary_thumbnail`.

#### [MODIFY] [`supervisor-dashboard.ts`](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts)
- پیاده‌سازی متد `onPhotosChanged` برای به‌روزرسانی فوری تامب‌نیل در تسک باز شده سرپرست.

#### [MODIFY] [`manager-review.ts`](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts)
- پیاده‌سازی متد `onPhotosChanged` برای به‌روزرسانی فوری تامب‌نیل در تسک باز شده مدیر.

#### [MODIFY] [`dispatch.ts`](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts)
- پیاده‌سازی متد `onPhotosChanged` برای آپدیت ردیف مربوطه در جدول کالاها.

---

## برنامه راستی‌آزمایی (Verification Plan)

### Automated Tests
- اجرای `python manage.py check` در بک‌اند.
- اجرای `npm run build` در فرانت‌اند جهت اطمینان از صحت انواع و توابع.

### Manual Verification
- آپلود یک عکس جدید برای کالا و مشاهده تغییر فوری آواتار بندانگشتی در کارت به آخرین عکس آپلود شده بدون بستن صفحه.
- ستاره‌دار کردن (شاخص کردن) عکس دیگر و مشاهده تغییر تامب‌نیل به عکس شاخص جدید.
- حذف عکس‌ها و بازگشت آواتار به حالت پیش‌فرض دوربین در صورت حذف همه عکس‌ها.

</div>
