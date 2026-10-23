# پیاده‌سازی حذف شرطی با اکسل و بهبود ناوبری

هدف از این تغییرات، افزودن قابلیت حذف گروهی از طریق فایل اکسل، افزودن لایه امنیتی (تایمر ۱۰ ثانیه‌ای) برای حذف کل انبار، و همچنین ذخیره موقعیت کاربر (Tab) در هنگام تغییر انبار است.

## تغییرات پیشنهادی (Proposed Changes)

---

### بخش بک‌اند (Backend)

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
- افزودن یک API Endpoint جدید به نام `delete_from_excel`:
  - این تابع یک فایل اکسل و شناسه انبار (warehouse_id) را دریافت می‌کند.
  - مشابه تابع آپلود، فایل را می‌خواند و به دنبال ستون `fa_unic_code` می‌گردد.
  - تمامی کدهای یافت شده را لیست کرده و با یک کوئری `Item.objects.filter(warehouse_id=..., fa_unic_code__in=...).delete()` آنها را حذف می‌کند.
  - تعداد رکوردهای حذف شده را در قالب پاسخ JSON به فرانت‌اند ارسال می‌کند.

---

### بخش فرانت‌اند (Frontend)

#### [MODIFY] [item-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/item-api.service.ts)
- افزودن متد `deleteFromExcel(file: File, warehouseId: number)` جهت ارسال فایل اکسل به Endpoint جدید بک‌اند.

#### [MODIFY] [docs.ts](file:///e:/warehouse%20project/frontend/src/app/components/docs/docs.ts)
- افزودن منطق تایمر ۱۰ ثانیه‌ای (استفاده از `setInterval`) برای دکمه حذف کل اطلاعات انبار.
- افزودن تابع و حالت‌های تایید برای "حذف بر اساس فایل اکسل".
- افزودن متغیرهای مدیریت Modal‌های هشدار (مانند باز بودن مدال، زمان باقیمانده، متن هشدار).

#### [MODIFY] [docs.html](file:///e:/warehouse%20project/frontend/src/app/components/docs/docs.html)
- اضافه کردن دکمه "حذف رکوردهای این فایل از انبار" در کنار دکمه‌های آپلود. این دکمه فقط در صورتی فعال است که فایل انتخاب شده باشد و حاوی ستون `fa_unic_code` باشد.
- طراحی و پیاده‌سازی دو Modal (پنجره پاپ‌آپ) با گرافیک هماهنگ با سیستم:
  1. **مدال حذف کلی:** دارای تایمر شمارش معکوس ۱۰ ثانیه‌ای قبل از فعال شدن دکمه تایید.
  2. **مدال حذف بر اساس اکسل:** برای تایید نهایی قبل از ارسال فایل برای حذف.

#### [MODIFY] [auth.store.ts](file:///e:/warehouse%20project/frontend/src/app/core/stores/auth.store.ts)
- اضافه کردن فیلد `lastWarehouseTab` به State.

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
- در تابع `exitWarehouseMode`، تب فعلی (currentTab) را در State یا localStorage ذخیره می‌کنیم تا بدانیم کاربر از کدام صفحه خارج شده است.

#### [MODIFY] [projects.ts](file:///e:/warehouse%20project/frontend/src/app/components/projects/projects.ts)
- در تابع `goToDispatch`، به جای هدایت (navigate) اجباری به مسیر `/dashboard`، کاربر را به `lastWarehouseTab` (مثلا `/docs` یا `/users` و ...) هدایت می‌کنیم تا تجربه کاربری حفظ شود.

## Verification Plan

### Manual Verification
- **تست ذخیره تب (Tab Persistence):** به صفحه "آپلود و تنظیمات" می‌رویم، انبار را از منو عوض می‌کنیم، بررسی می‌کنیم که آیا دوباره وارد صفحه "آپلود و تنظیمات" انبار جدید می‌شویم یا خیر.
- **تست حذف کلی (Global Delete):** روی دکمه حذف انبار کلیک می‌کنیم، بررسی می‌کنیم مدال باز شود، دکمه تایید تا ۱۰ ثانیه غیرفعال باشد، و سپس عملیات با موفقیت انجام شود.
- **تست حذف اکسلی:** فایلی را بارگذاری می‌کنیم، روی دکمه "حذف از طریق اکسل" کلیک می‌کنیم و صحت پاک شدن آیتم‌های درون فایل از انبار جاری را بررسی می‌کنیم.
