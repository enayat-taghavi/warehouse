<div dir="rtl" align="right">

# برنامه اجرایی: تنظیمات کنترل دسترسی انبارگردان به تاریخچه و یادداشت‌های قبلی کالا (Counter History & Notes Visibility Settings)

این طرح به منظور افزودن دو تنظیم کلیدی جدید به بخش تنظیمات کلان (Global Settings) و تنظیمات اختصاصی انبار (Warehouse Settings) جهت مدیریت دسترسی کاربران با نقش انبارگردان به تاریخچه و یادداشت‌های بررسی کالا تدوین شده است.

---

## ۱. مرور نیازمندی‌ها و تصمیمات فنی (Requirements & Technical Decisions)

| ردیف | شرح تنظیم | کلید سیستمی (Key) | نوع داده | مقدار پیش‌فرض | رفتار عملیاتی |
| :---: | :--- | :--- | :---: | :---: | :--- |
| ۱ | امکان مشاهده تاریخچه توسط انبارگردان | `counter_can_view_history` | `Boolean` | `True` | در صورت خاموش بودن، بخش تاریخچه بررسی‌ها در پنجره شمارش مخفی می‌شود. |
| ۲ | امکان مشاهده یادداشت‌های قبلی در تاریخچه | `counter_can_view_previous_notes` | `Boolean` | `True` | در صورت خاموش بودن، در لیست تاریخچه صرفاً آخرین پیام/یادداشت ارجاع دیده می‌شود و یادداشت‌های قدیمی‌تر مخفی می‌مانند. |

> [!IMPORTANT]
> **نکته کلیدی:** بر اساس تایید کاربر در پرسش‌نامه Grill-Me:
> 1. در حالتی که مشاهده تاریخچه فعال است، همواره **آخرین پیام/یادداشت** برای انبارگردان نمایش داده خواهد شد (حتی اگر دیدن یادداشت‌های قبلی خاموش باشد).
> 2. آخرین یادداشت ارجاع سرپرست یا مدیر روی کارت کالا در لیست اصلی همواره نمایش داده می‌شود تا انبارگردان دلیل اقدام را فوراً بداند.

---

## ۲. تغییرات پیشنهادی به تفکیک فایل‌ها (Proposed Changes)

### لایه بک‌اند (Backend Django)
#### [MODIFY] [warehouses/services.py](file:///e:/warehouse%20project/backend/warehouses/services.py)
* اضافه کردن مقادیر پیش‌فرض `counter_can_view_history: True` و `counter_can_view_previous_notes: True` به دیکشنری `DEFAULT_SETTINGS`.

---

### لایه مدیریت تنظیمات فرانت‌اند (Frontend Settings UI)
#### [MODIFY] [src/app/components/settings/settings.html](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.html)
* افزودن دو تاگل سوئیچ مدرن در تب «قوانین عملیاتی» برای تنظیمات سراسری سیستم (Global Settings).

#### [MODIFY] [src/app/components/wh-settings/wh-settings.html](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html)
* افزودن دو تاگل سوئیچ با برچسب‌های وضعیت اورراید (`is_override`) در تب «قوانین عملیاتی» تنظیمات اختصاصی انبار (Warehouse Settings).

---

### لایه کارتابل انبارگردان (Frontend Counter Dashboard)
#### [MODIFY] [src/app/components/counter/counter-dashboard/counter-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts)
* تعریف فیلدهای وضعیتی `counterCanViewHistory: boolean = true` و `counterCanViewPreviousNotes: boolean = true`.
* استخراج این دو تنظیم از پاسخ سرویس تنظیمات انبار/سراسری در متد `fetchFieldSettings`.
* پیاده‌سازی متد کمکی `canViewRecordNote(index: number): boolean` جهت تشخیص مجاز بودن نمایش یادداشت بر اساس ترتیب زمانی (شاخص 0 = جدیدترین رکورد).

#### [MODIFY] [src/app/components/counter/counter-dashboard/counter-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html)
* شرطی کردن نمایش کادر آکاردئون تاریخچه با `*ngIf="counterCanViewHistory && selectedTask.history && selectedTask.history.length > 0"`.
* کنترل نمایش متن یادداشت در تاریخچه با استفاده از شرط `canViewRecordNote(i)`.

---

## ۳. برنامه اعتبارسنجی و تست‌ها (Verification Plan)

### تست‌های خودکار و سلامت کد
* اجرای `manage.py check` در محیط پایتون جهت تایید سلامت سرویس تنظیمات بک‌اند.
* اجرای بیلد کامل فرانت‌اند (`npm run build`) برای اطمینان از عدم وجود خطای کامپایل انگیولار و تایپ‌اسکریپت.

### تست‌های عملکردی
1. تست ذخیره و بازخوانی تنظیمات در صفحه تنظیمات کلان و تنظیمات اختصاصی انبار.
2. تست ورود انبارگردان و باز کردن کالای دارای چند رکورد تاریخچه در حالات:
   - تاریخچه فعال + تمام یادداشت‌ها فعال: نمایش کامل تاریخچه و همه یادداشت‌ها.
   - تاریخچه فعال + یادداشت‌های قبلی غیرفعال: نمایش تاریخچه با نمایش یادداشت فقط برای آخرین رکورد.
   - تاریخچه غیرفعال: پنهان شدن کامل باکس تاریخچه از پنجره ثبت شمارش.

</div>
