<div dir="rtl" align="right">

# طرح پیاده‌سازی اصلاح جامع صفحات تنظیمات سیستم و تنظیمات اختصاصی انبار

این سند فنی شامل جزئیات معماری، تغییرات مورد نیاز فایل‌ها، رفع باگ‌های تعاملی و یکپارچه‌سازی فرانت‌اند و بک‌اند برای صفحات تنظیمات کلان (`/settings`) و تنظیمات اختصاصی انبار (`/wh-settings`) می‌باشد.

---

## بررسی و مرور تغییرات مورد نیاز (User Review Required)

> [!IMPORTANT]
> **نکات کلیدی تغییرات:**
> ۱. **افزودن فیلد جاافتاده «تایید سرپرست اسناد» (`require_doc_supervisor_approval`):** به صفحه تنظیمات کلان اضافه می‌شود تا مدیر سیستم بتواند مقدار پیش‌فرض آن را تغییر دهد.
> ۲. **اصلاح باگ تاگل‌سوئیچ در تنظیمات انبار:** رفتار متناقض کلیک روی سوئیچ‌ها برطرف شده و تعامل بصری آن روان و مستقل خواهد شد.
> ۳. **واکنش‌پذیری به تغییر انبار فعال:** با اتصال به `AuthStore.activeWarehouseId`، تغییر انبار فعال در هدر برنامه بلافاصله تنظیمات انبار جدید را بدون نیاز به رفرش بارگذاری می‌کند.
> ۴. **بهبود فرآیند بازیابی بک‌آپ:** کاربر پس از ریستور موفقیت‌آمیز به جای ریلود صفحه، به صفحه لاگین هدایت می‌شود تا ریسک تداخل سشن‌های منقضی رخ ندهد.

---

## فایل‌ها و بخش‌های تحت تاثیر (Affected Files & Scope)

| ردیف | مسیر فایل | نوع تغییر | شرح تغییرات |
| :--- | :--- | :--- | :--- |
| ۱ | [`warehouses/services.py`](file:///e:/warehouse%20project/backend/warehouses/services.py) | `MODIFY` | افزودن `manager_approval_mode` به `DEFAULT_SETTINGS` |
| ۲ | [`settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.html) | `MODIFY` | افزودن تایید سرپرست اسناد، بهبود دسترسی‌پذیری و ارتقای UI |
| ۳ | [`settings.ts`](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.ts) | `MODIFY` | حذف تاخیر مصنوعی، اصلاح هندلینگ خطای بلاب بک‌آپ و هدایت به لاگین پس از ریستور |
| ۴ | [`wh-settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html) | `MODIFY` | رفع باگ تاگل‌ها، افزودن تنظیمات آفلاین، افزودن Empty State |
| ۵ | [`wh-settings.ts`](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.ts) | `MODIFY` | اتصال به سیگنال `AuthStore.activeWarehouseId` جهت رفرش خودکار با تغییر انبار |
| ۶ | [`dynamic-fields.ts`](file:///e:/warehouse%20project/frontend/src/app/components/dynamic-fields/dynamic-fields.ts) | `MODIFY` | اصلاح خواندن انبار از `AuthStore` به جای `StateService` قدیمی |
| ۷ | [`label-designer.ts`](file:///e:/warehouse%20project/frontend/src/app/components/label-designer/label-designer.ts) | `MODIFY` | افزودن لیسنر تغییر `warehouseId` در `ngOnChanges` |

---

## شرح گام‌به‌گام پیاده‌سازی (Proposed Implementation Steps)

### گام ۱: اصلاح لایه بک‌اند (`warehouses/services.py`)
- اضافه کردن کلید `manager_approval_mode: 'any_manager'` به `DEFAULT_SETTINGS`.
- اطمینان از خروجی معتبر برای تمام درخواست‌های `get_all_settings(None)` و جلوگیری از بازگرداندن مقادیر `undefined`.

### گام ۲: بهینه‌سازی صفحه تنظیمات کلان (`Settings`)
- **`settings.html`**:
  - اضافه کردن کارت تنظیمی «تایید سرپرست اسناد» با توضیح کامل و تاگل سوئیچ استاندارد.
  - اصلاح استایل و تعامل تاگل‌سوئیچ‌ها با قابلیت کلیک استاندارد و پشتیبانی از صفحه‌کلید.
  - تفکیک مناسب بخش پشتیبان‌گیری و شفاف‌سازی شرط دسترسی سوپریوزر.
- **`settings.ts`**:
  - حذف `setTimeout`های ۶۰۰ میلی‌ثانیه‌ای در فراخوانی‌های `loadSettings`.
  - خواندن پیام خطا از `Blob` در متد `downloadBackup()` در صورت بروز خطای بک‌اند.
  - ریستور دیتابیس: خروج کاربر (`authService.logout()`) و هدایت به لاگین با پیام موفقیت.

### گام ۳: اصلاح و ارتقای صفحه تنظیمات انبار (`WhSettings`)
- **`wh-settings.html`**:
  - حذف کلاس `pointer-events-none` از تاگل‌سوئیچ‌ها و فعال‌سازی کلیک مستقیم روی سوئیچ فارغ از وضعیت اورراید.
  - افزودن تنظیمات «بازه همگام‌سازی خودکار داده‌های آفلاین» و «مدت اعتبار کش آفلاین».
  - طراحی بخش Empty State زیبا برای زمانی که هیچ انباری انتخاب نشده است یا روی `ALL` قرار دارد.
- **`wh-settings.ts`**:
  - استفاده از `toObservable` یا `effect` بر روی `this.authStore.activeWarehouseId` برای تشخیص آنی تعویض انبار در هدر و لود تنظیمات انبار جدید.

### گام ۴: یکپارچه‌سازی کامپوننت‌های مرتبط
- در `DynamicFields`: خواندن `activeWarehouseId` مستقیماً از `AuthStore`.
- در `LabelDesigner`: لود مجدد تمپلیت‌های لیبل در صورت تغییر ورودی `warehouseId`.

---

## برنامه اعتبارسنجی و تست (Verification Plan)

### تست‌های خودکار و اعتبارسنجی بیلد
- اجرای تست بیلد فرانت‌اند برای اطمینان از عدم وجود هرگونه خطای تایپ یا تمپلیت:
  ```powershell
  cd "frontend"
  npx ng build --configuration development
  ```
- بررسی خطاهای جنگو و چک سلامت سرور:
  ```powershell
  cd "backend"
  python manage.py check
  ```

### تست‌های دستی
۱. ورود به صفحه `/settings` و بررسی حضور تمامی فیلدها شامل «تایید نهایی توسط مدیریت»، «تایید اجباری سرپرست»، «تایید سرپرست اسناد»، «شمارش کور»، «بازه همگام‌سازی» و...
۲. تغییر مقادیر در صفحه کلان و ذخیره آن‌ها و تایید بازخوانی صحیح.
۳. ورود به صفحه `/wh-settings`، کلیک مستقیم روی تاگل‌ها و بررسی تغییر بدون باگ.
۴. تغییر انبار در هدر اصلی و مشاهده تغییر بلادرنگ اطلاعات تنظیمات و طراح لیبل بدون نیاز به رفرش کل صفحه.
۵. خروج و بررسی حالت عدم انتخاب انبار و نمایش Empty State.

</div>
