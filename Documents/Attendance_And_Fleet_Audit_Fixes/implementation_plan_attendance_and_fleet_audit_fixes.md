<div dir="rtl" align="right">

# طرح جامع اصلاح و بهینه‌سازی سامانه ثبت کارکرد و ناوگان (Attendance & Fleet Architecture Remediation)

این طرح بر مبنای ممیزی عمیق و راستی‌آزمایی ۱۹ ایراد ساختاری، محاسباتی، وب‌سوکتی و همگام‌سازی دیتابیس تدوین شده است تا بدون تخریب کدهای موجود، پایداری، عملکرد زنده (Real-time)، یکپارچگی داده‌ها و ارگونومی رابط کاربری را به بالاترین سطح استاندارد برساند.

---

## ۱. اهداف کلیدی طرح (Key Objectives)

1. **یکپارچگی و سلامت داده‌ها (Data & Schema Integrity):**
   - اصلاح انتساب خودکار انبار در ثبت سراسری و رفع باگ نال شدن `warehouse_id`.
   - قطع سرایت وضعیت‌های جمعه‌کاری (`is_friday_work`) به روزهای عادی هفته در پیش‌فرض‌ها.
   - پاکسازی و ریست خودکار ساعت موثر و اضافه‌کار برای وضعیت‌های غایب (`ABSENT`) و مرخصی (`LEAVE`) در سطح دیتابیس و اعتبارسنجی بک‌اند.
   - اصلاح تطبیق دیکشنری رکوردها در ویوی ماتریس بدون رونویسی تصادفی سوابق انبارها.
   - هماهنگ‌سازی فرمول محاسبه روزهای حضور (`present_days`) میان بک‌اند و فرانت‌اند.
   - پشتیبانی از ذخیره سراسری در ناوگان بدون پرتاب خطای ۴۰۰ برای `warehouse_id`.

2. **زیرساخت بلادرنگ وب‌سوکت (WebSocket Real-Time Infrastructure):**
   - ارسال شناسه کاربر فرستنده (`sender_id`) جهت جلوگیری از اکوی رویداد و نمایش توست هشدار به خود کاربر ثبت‌کننده.
   - اضافه کردن برودکست وب‌سوکت به ذخیره سرویس‌های ناوگان (`VehicleDailyTripViewSet.bulk_save`) و بارگذاری اکسل شیت ماهانه (`import_monthly_excel`).
   - ارسال پارامتر `date_shamsi` و `year_month` در تمامی پیام‌های تغییر کارکرد.

3. **ارگونومی و به‌روزرسانی زنده فرانت‌اند (Frontend Real-Time & Live Ergonomics):**
   - فیلتر دقیق بر اساس `warehouse_id` برای جلوگیری از تداخل انبارها (Warehouse Bleed).
   - پیاده‌سازی پچ درجا (In-Place Row Update) بدون رفرش کل صفحه، بدون لودینگ مخرب و بدون از بین رفتن ردیف‌های انتخاب‌شده (`selectedPersonnelIds`).
   - جلوگیری از ثبت خوش‌بینانه و زودرس `r.is_existing = true` قبل از تایید سرور.
   - هوشمندسازی `applyBulkHours` و `autoFillWorkingDays` منطبق با پنجره زمانی مجاز و وضعیت واقعی پرسنل.
   - نمایش نشانگر شفاف «پیش‌نویس / نیازمند ذخیره» برای رکوردهایی که هنوز در دیتابیس ثبت نشده‌اند (Ghost Defaults Remediation).
   - افزودن پشتیبانی زنده وب‌سوکت به تب تردد ناوگان (`fleet`).

4. **ایجنت نگهبان کد و آزمون‌های جامع (Guardian Agent & Comprehensive Verification):**
   - بازبینی سختگیرانه `git diff` جهت اطمینان از حفظ کامل ساختارها و عدم تخریب کدهای نامربوط.
   - آزمون‌های خودکار بک‌اند (Django Unit Tests) و تست بیلد و تایپ‌چک فرانت‌اند (Angular Build Verification).

---

## ۲. فازبندی اجرایی (Phased Execution Plan)

### 🔹 فاز ۱: اصلاحات هسته بک‌اند و اعتبارسنجی‌های دیتابیس
- **فایل‌های هدف:** [`personnel/views.py`](file:///e:/warehouse%20project/backend/personnel/views.py), [`personnel/serializers.py`](file:///e:/warehouse%20project/backend/personnel/serializers.py)
- **اقدامات:**
  1. در `bulk_save`: اگر `target_wh` نال بود، به عنوان فال‌بک از `p_obj.assigned_warehouse_id` استفاده شود تا انتساب انبار پرسنل نپرد.
  2. در `get_matrix`: پیش‌فرض انبار برای افراد بدون سابقه از `p_obj.assigned_warehouse_id` خوانده شود؛ و فیلد `def_friday` تنها در صورتی فعال شود که تاریخ روز، روز جمعه باشد (`is_friday_work = True`).
  3. در `bulk_save` و `bulk_save_monthly_grid`: در صورت `status in ['ABSENT', 'LEAVE']`، فیلدهای `effective_hours=0`، `overtime_hours=0`، `is_friday_work=False`، `is_mission=False` شوند.
  4. در `BulkVehicleTripMatrixSerializer`: فیلد `warehouse_id` به صورت `required=False, allow_null=True` تعریف شود و در ویو برای هر خودرو انبار اختصاصی آن منظور گردد.
  5. در `get_monthly_summary` و شیت ماهانه: یکسان‌سازی فرمول `present_days`.

### 🔹 فاز ۲: اصلاحات و تکمیل برودکست‌های وب‌سوکت بک‌اند
- **فایل‌های هدف:** [`personnel/views.py`](file:///e:/warehouse%20project/backend/personnel/views.py), [`notifications/consumers.py`](file:///e:/warehouse%20project/backend/notifications/consumers.py)
- **اقدامات:**
  1. در `broadcast_attendance_updated`: افزودن پارامتر `sender_id` (شناسه کاربری `request.user.id`).
  2. در `VehicleDailyTripViewSet.bulk_save`: افزودن برودکست رویداد `fleet_trips_updated`.
  3. در `import_monthly_excel`: فراخوانی `broadcast_attendance_updated` پس از اتمام موفق تراکنش.
  4. اطمینان از قرار گرفتن `sender_id` و `warehouse_id` در تمام پیلودهای وب‌سوکت.

### 🔹 فاز ۳: اصلاحات منطق و ارگونومی فرانت‌اند
- **فایل‌های هدف:** [`warehouse-attendance.ts`](file:///e:/warehouse%20project/frontend/src/app/components/personnel/warehouse-attendance/warehouse-attendance.ts), [`warehouse-attendance.html`](file:///e:/warehouse%20project/frontend/src/app/components/personnel/warehouse-attendance/warehouse-attendance.html)
- **اقدامات:**
  1. اصلاح `saveAttendanceMatrix`: انتقال `r.is_existing = true` به درون بلوک `next` و حفظ وضعیت قبلی در صورت بروز خطا.
  2. اصلاح `applyBulkHours`: نادیده گرفتن افراد با وضعیت غایب یا مرخصی در صورتی که وضعیت جدیدی برای آن‌ها انتخاب نشده باشد.
  3. اصلاح `autoFillWorkingDays`: پر کردن فقط روزهای مجاز طبق تنظیمات پنجره زمانی (`monthlyGridSettingsWindow`) جهت جلوگیری از خطای ۴۰۰ هنگام ذخیره.
  4. تمایز بصری شفاف میان سطرهای پیش‌نویس (Ghost Defaults) و سطرهای ثبت‌شده نهایی در HTML.

### 🔹 فاز ۴: بازنویسی سابسکرایب وب‌سوکت و پچ درجا در فرانت‌اند
- **فایل‌های هدف:** [`warehouse-attendance.ts`](file:///e:/warehouse%20project/frontend/src/app/components/personnel/warehouse-attendance/warehouse-attendance.ts)
- **اقدامات:**
  1. نادیده گرفتن پیام‌هایی که `notif.sender_id === this.auth.user()?.id` هستند (جلوگیری از اکو).
  2. اعتبارسنجی `warehouse_id` با انبار انتخابی صفحه (جلوگیری از تداخل انبارها).
  3. پیاده‌سازی به‌روزرسانی نقطه‌ای و درجا (In-Place Patch) بدون فراخوانی `loadAttendanceMatrix()`، بدون پرش اسکرول و بدون پاک کردن تیک چک‌باکس‌ها.
  4. افزودن سابسکرایب و به‌روزرسانی برای تب ناوگان (`activeMode === 'fleet'`).
  5. نمایش نوار آرامش‌بخش تعارض (Soft Conflict Alert) در صورت وجود تغییرات ذخیره‌نشده (`hasUnsavedChanges`).

### 🔹 فاز ۵: ایجنت نگهبان کد و آزمون‌های جامع
- **اقدامات:**
  1. بررسی کلیه فایل‌های تغییریافته با `git diff` و بازرسی دقیق جهت عدم حذف یا تغییر ناخواسته کدهای متفرقه.
  2. نوشتن و اجرای تست‌های خودکار بک‌اند در جنگو (`python manage.py test personnel`).
  3. اجرای بررسی و تست بیلد فرانت‌اند (`npm run build` / `ng build`).
  4. تهیه گزارش نهایی در `walkthrough.md`.

---

</div>
