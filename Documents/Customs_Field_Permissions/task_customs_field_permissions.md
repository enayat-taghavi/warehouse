<div dir="rtl" align="right">

# چک‌لیست وظایف پیاده‌سازی فیلدهای داینامیک کارتابل مالی

- [x] **فاز ۱: تعریف ساختار، مدل‌ها و تنظیمات پیش‌فرض کارتابل مالی** <!-- id: 0 -->
    - [x] تعریف رجیستری فیلدهای پیش‌فرض کارتابل مالی (`DEFAULT_DOC_FIELD_PERMISSIONS`) در [`field-config.model.ts`](file:///e:/warehouse%20project/frontend/src/app/core/models/field-config.model.ts) <!-- id: 1 -->
    - [x] به‌روزرسانی تابع ادغام `mergeFieldPermissions` برای پشتیبانی منعطف از انواع کارتابل‌ها (انبارگردان و مالی) <!-- id: 2 -->
    - [x] افزودن کلید پیش‌فرض `field_permissions_doc` در `DEFAULT_SETTINGS` در [`services.py`](file:///e:/warehouse%20project/backend/warehouses/services.py) <!-- id: 3 -->
- [x] **فاز ۲: طراحی و افزودن تب تنظیمات فیلدهای کارتابل مالی در Settings و WhSettings** <!-- id: 4 -->
    - [x] افزودن تب «فیلدهای کارتابل مالی» (`doc_fields`) در کامپوننت تنظیمات سراسری [`settings.ts`](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.ts) و [`settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/settings/settings.html) <!-- id: 5 -->
    - [x] پیاده‌سازی تولبار جستجو، فیلتر دسته‌بندی، تغییر عنوان نمایشی (`Custom Label`)، دکمه ریست و چک‌باکس‌های نمایش/ویرایش در صفحه تنظیمات <!-- id: 6 -->
    - [x] افزودن تب «فیلدهای کارتابل مالی» (`doc_fields`) در کامپوننت تنظیمات انبار [`wh-settings.ts`](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.ts) و [`wh-settings.html`](file:///e:/warehouse%20project/frontend/src/app/components/wh-settings/wh-settings.html) <!-- id: 7 -->
    - [x] پیاده‌سازی دکمه‌های «بازنشانی به پیش‌فرض‌ها» و انتخاب‌های گروهی (نمایش همه / مخفی‌سازی همه) <!-- id: 8 -->
- [x] **فاز ۳: یکپارچه‌سازی و رندر داینامیک فیلدها در صفحه کارتابل مالی (`Customs`)** <!-- id: 9 -->
    - [x] واکشی تنظیمات دسترسی فیلدهای مالی (`field_permissions_doc`) با اولویت انبار و فال‌بک سراسری در [`customs.ts`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts) <!-- id: 10 -->
    - [x] رندرینگ داینامیک بخش کارت اطلاعات کالا (فقط خواندنی) بر اساس فیلدهای فعال در [`customs.html`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html) <!-- id: 11 -->
    - [x] رندرینگ داینامیک بخش اینپوت‌های فرم مالی (قابل ویرایش) متناسب با نوع داده (متن، عدد، تاریخ، چک‌باکس، چندخطی، منوی انتخابی و فیلدهای پویا) <!-- id: 12 -->
    - [x] پیاده‌سازی ذخیره‌سازی همزمان فیلدهای مستقیم `DocTask` و فیلدهای اضافی `Item` / فیلدهای پویا در `saveDraft` <!-- id: 13 -->
- [x] **فاز ۴: تست جامع، اعتبارسنجی سیستم و تطبیق با استانداردهای پروژه** <!-- id: 14 -->
    - [x] تست حفظ ۱۰۰٪ رفتار و ظاهر پیش‌فرض کارتابل مالی در صورت عدم دستکاری تنظیمات <!-- id: 15 -->
    - [x] تست شخصی‌سازی نام فیلدهای مالی و بازنشانی نام <!-- id: 16 -->
    - [x] تست فعال‌سازی نمایش و ویرایش فیلدهای سفارشی/پویا در کارتابل مالی <!-- id: 17 -->
    - [x] کامپایل و بیلد موفق فرانت‌اند (`ng build`) و بررسی سلامت بک‌اند (`python manage.py check`) <!-- id: 18 -->

</div>
