<div dir="rtl" align="right">

# برنامه‌ریزی: توسعه چرخه کاری ارجاع اسناد (مشابه شمارش میدانی)

بر اساس بررسی‌های انجام شده و پاسخ‌های شما، فاز «بررسی اسناد» دقیقاً همانند فاز «شمارش میدانی» دارای نقش‌ها، مراحل و تاریخچه مستقل خواهد بود. این تغییرات سیستم را برای ردیابی دقیق و ارجاع اسناد مالی آماده می‌کند.

## هدف و تغییرات اصلی
۱. **تفکیک کامل مدل داده:** ایجاد مدل `DocTask` برای اسناد (جدا از `CountTask`).
۲. **تعریف نقش‌های جدید:** اضافه کردن دو نقش مجزا به نام‌های «بررسی‌کننده اسناد» (`doc_worker`) و «سرپرست اسناد» (`doc_supervisor`).
۳. **تطبیق کامل گردش کار:** اعمال تمام تنظیمات (مانند تایید سرپرست اسناد) و وضعیت‌های چندمرحله‌ای برای ارجاع، تایید سرپرست و بررسی مدیر.

---

## جزئیات اجرایی (تغییرات کد)

### ۱. معماری مدل‌ها در بک‌اند (Database Models)
#### [NEW/MODIFY] [models.py](file:///e:/warehouse%20project/backend/inventory/models.py)
مدل‌های جدید برای تاریخچه و پیگیری وضعیت اسناد ایجاد می‌شوند.
- ایجاد مدل `DocTask` با فیلدهای زیر:
  - `item` (ارتباط با کالا)
  - `doc_worker` (ارتباط با بررسی‌کننده)
  - `doc_supervisor` (ارتباط با سرپرست اسناد)
  - `assigned_manager` (ارتباط با مدیر ارجاع‌دهنده)
  - `status`: با وضعیت‌های تخصصی (`PENDING_DOC`, `DOC_PROCESSED`, `DOC_SUPERVISOR_REJECTED`, `DOC_MANAGER_REVIEW`, `DOC_MANAGER_REJECTED`, `DOC_FINAL_APPROVED`).
  - فیلد `skip_supervisor` (برای استثنای سرپرست، دقیقاً مشابه شمارش).
  - یادداشت‌های بررسی‌کننده، سرپرست و مدیر (`worker_note`, `supervisor_note`, `manager_note`).
- ایجاد مدل `DocTaskHistory` برای نگهداری لاگ تغییرات اسناد.

### ۲. تعریف نقش‌های سیستمی و تنظیمات (Roles & Settings)
#### [MODIFY] [init_roles.py](file:///e:/warehouse%20project/backend/accounts/management/commands/init_roles.py)
- افزودن نقش‌های `doc_worker` و `doc_supervisor` به لیست نقش‌های سیستمی تا با اجرای دستور `init_roles` در پایگاه داده ثبت شوند.

#### [MODIFY] [services.py](file:///e:/warehouse%20project/backend/warehouses/services.py)
- اضافه کردن متغیر `require_doc_supervisor_approval: True` به تنظیمات پیش‌فرض سیستم تا انبارها بتوانند تایید سرپرست اسناد را فعال یا غیرفعال کنند.

### ۳. رابط برنامه‌نویسی و API (Views)
#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
- **ارجاع گروهی (`bulk_assign`):** اضافه شدن منطق ساخت نمونه‌های `DocTask` به همراه انتخاب بررسی‌کننده و سرپرست.
- **تایید گروهی (`bulk_submit_docs`):** (یا ساخت متد جدید) برای پردازش تایید اسناد توسط کاربر با در نظر گرفتن گزینه «بدون نیاز به سرپرست» (دقیقاً مشابه متد شمارش).

### ۴. تغییرات رابط کاربری و فرانت‌اند (UI & Frontend)
#### [MODIFY] [wh-settings.html](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html)
- اضافه کردن سویچ و تنظیمات جدید با عنوان «تایید سرپرست اسناد» (Require Document Supervisor Approval) در بخش تنظیمات انبار.

#### [MODIFY] [dispatch.ts](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts) و [dispatch.html](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.html)
- تغییر باکس «ارجاع اسناد» به ساختاری مشابه «ارجاع شمارش». 
- واکشی کاربرانی که نقش `doc_worker` و `doc_supervisor` دارند و نمایش آنها در لیست کشویی.
- مدیریت وضعیت `skip_supervisor` برای اسناد (در صورت خاموش بودن تنظیم انبار، گزینه پیش‌فرض برای سرپرست اسناد به «بدون نیاز به سرپرست» تغییر یابد).

## فرآیند تایید (Verification)
پس از انجام این تغییرات، `makemigrations` و `migrate` اجرا خواهند شد و همچنین نقش‌های جدید ساخته می‌شوند. 

> [!IMPORTANT]
> آیا با این برنامه پیاده‌سازی موافقید تا کار ویرایش کدها و دیتابیس را آغاز کنم؟

</div>
