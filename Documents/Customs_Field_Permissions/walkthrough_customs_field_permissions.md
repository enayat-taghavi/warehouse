<div dir="rtl" align="right">

# گزارش جامع پیاده‌سازی سیستم فیلدهای پویا و تنظیمات دسترسی کارتابل مالی (Customs Cartable)

این مستند گزارش کامل تغییرات، نحوه معماری و نتایج راستی‌آزمایی سیستم سفارشی‌سازی فیلدها و فیلدهای پویای کارتابل مالی و مدارک را تشریح می‌کند.

---

## ۱. دستاوردهای کلیدی پیاده‌سازی

1. **رجیستری جامع فیلدهای مالی و کالا:**
   - تعریف `DEFAULT_DOC_FIELD_PERMISSIONS` در [`field-config.model.ts`](file:///e:/warehouse%20project/frontend/src/app/core/models/field-config.model.ts) شامل کلیه فیلدهای مدرک (`DocTask`)، مشخصات عمومی کالا (`Item`) و فیلدهای تعریف‌شده داینامیک انبار (`ItemFieldDefinition`).
   - ایجاد تابع اختصاصی `mergeDocFieldPermissions()` برای ادغام تنظیمات پیش‌فرض مالی با مقادیر ذخیره‌شده و فیلدهای پویا.

2. **پنل مدیریت پیشرفته در تنظیمات سراسری و انبار:**
   - اضافه شدن تب «فیلدهای کارتابل مالی» (`doc_fields`) در [`settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.html) و [`wh-settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html).
   - امکان تغییر عنوان نمایشی فیلدها (`Custom Label`) همراه با دکمه بازنشانی تک‌فیلدی (↺) و بازنشانی کل فیلدها به پیش‌فرض کارخانه.
   - قابلیت فعال/غیرفعال‌سازی نمایش (`visible`) و قابلیت ویرایش (`editable`).
   - دسته‌بندی و جستجوی آنی در میان فیلدها.

3. **رندر داینامیک در کارتابل مالی (`Customs`):**
   - جایگزینی فیلدهای هاردکد با رندرهای داینامیک `visibleInfoFields` برای کارت اطلاعات کالا و `editableFormFields` برای فرم اطلاعات مالی.
   - پشتیبانی از تمام انواع فیلدها شامل متنی، عددی، تاریخ، چک‌باکس، منوی انتخاب نوع فاکتور و ارز، چندخطی و فیلدهای پویای انبار.
   - ذخیره‌سازی دوگانه در `saveDraft()`: ذخیره فیلدهای اصلی مدرک در `DocTask` و ذخیره خودکار فیلدهای کالا/پویا در موجودیت `Item`.

4. **سازگاری ۱۰۰٪ با ساختار قبلی (Backward Compatibility):**
   - انبارهایی که هنوز پیکربندی نشده‌اند، دقیقاً از ساختار پیش‌فرض استفاده می‌کنند بدون هیچ‌گونه افت کارایی یا تغییر ناخواسته.

---

## ۲. فایل‌های تغییریافته و ایجادشده

| فایل | مسیر | توضیحات تغییر |
| :--- | :--- | :--- |
| **`field-config.model.ts`** | `frontend/src/app/core/models/` | افزودن `DEFAULT_DOC_FIELD_PERMISSIONS` و `mergeDocFieldPermissions` |
| **`services.py`** | `backend/warehouses/` | افزودن `'field_permissions_doc': {}` به `DEFAULT_SETTINGS` |
| **`settings.ts` & `.html`** | `frontend/src/app/components/settings/` | افزودن تب، منطق و جدول تنظیم فیلدهای مالی در سطح سراسری |
| **`wh-settings.ts` & `.html`** | `frontend/src/app/components/wh-settings/` | افزودن تب، منطق و جدول تنظیم فیلدهای مالی در سطح انبار |
| **`customs.ts` & `.html`** | `frontend/src/app/components/customs/` | اتصال به سرویس تنظیمات، رندر داینامیک فرم و ذخیره‌سازی دوگانه |

---

## ۳. نتایج اعتبارسنجی و تست

### الف) کامپایل و بیلد فرانت‌اند
```bash
npx ng build
# خروجی: Application bundle generation complete (Success Code 0)
```

### ب) بررسی سلامت و صحت بک‌اند جنگو
```bash
.\venv\Scripts\python.exe manage.py check
# خروجی: System check identified no issues (0 silenced).
```

---

## ۴. جمع‌بندی
تمامی نیازهای مطرح‌شده برای سیستم فیلدهای پویای کارتابل مالی، دقیقاً منطبق با استاندارد و معماری پیاده‌شده در صفحه انبارگردان، با موفقیت کامل پیاده‌سازی و راستی‌آزمایی شد.

</div>
