<div dir="rtl" align="right">

# طرح پیاده‌سازی: رفع بدهی فنی (Technical Debt) فیلترهای تخصیص

در این طرح، بهینه‌سازی معماری فیلترینگ بک‌اند انجام می‌شود تا وابستگی به پارامترهای هاردکد شده (`show_counted` و `show_counting`) به طور کامل حذف گردد و فیلتر لیست تخصیص تنها به استانداردترین روش یعنی استفاده از پارامتر `field_status__in` متکی باشد.

## User Review Required

> [!WARNING]
> **حذف لاجیک هاردکد شده از بک‌اند**
> اجرای این طرح باعث حذف بخش کوچکی از کدهای `views.py` می‌شود. از آنجا که ما در سمت فرانت‌اند پارامتر `field_status__in` را با موفقیت پیاده کرده‌ایم، این تغییر هیچ اثر مخربی نخواهد داشت و فقط باعث سبک‌تر شدن و استاندارد شدن API می‌شود. در صورت تایید شما این لاجیک منسوخ شده حذف می‌گردد.

## Proposed Changes

---

### Backend Components

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
- **شرح تغییر:** حذف کامل دریافت پارامترهای `show_counted` و `show_counting` و منطق `excluded_statuses` از متد `get_queryset`.
- **نتیجه:** سرور دیگر هیچ پیش‌فرضی برای حذف وضعیت‌های `done` یا `counting` اعمال نمی‌کند و تماماً بر اساس کوئری `field_status__in` (که توسط django-filter پردازش می‌شود) پاسخ می‌دهد.

---

### Frontend Components

#### [MODIFY] [dispatch.ts](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts)
- **شرح تغییر:** حذف ارسال پارامترهای بی‌فایده و منسوخ شده `show_counted` و `show_counting` در متدهای `loadItems` و `exportData`.
- **حذف کدهای اضافی:** رفع خطاهای کامپایل احتمالی مربوط به `this.showCountedItems` و `this.showCountingItems` از تابع `exportData`.

## Verification Plan

### Manual Verification
1. لود شدن صفحه تخصیص و اطمینان از صحت عملکرد فیلتر سریع (بدون حضور پارامترهای `show_counted` در درخواست‌های شبکه).
2. بررسی لاگ‌های سرور جنگو برای تایید اینکه کوئری‌های SQL با دستور `IN` برای `field_status` به درستی جنریت می‌شوند.
3. انجام یک دانلود اکسل از جدول تخصیص برای تایید سلامت تابع `exportData`.

</div>
