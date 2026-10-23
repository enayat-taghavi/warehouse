<div dir="rtl" align="right">

# طرح پیاده‌سازی: صدور اکسل در صفحه تخصیص کالا

## هدف (Goal Description)
اضافه کردن قابلیت دانلود داده‌ها با فرمت اکسل (Excel) در صفحه «تخصیص کالا» (Dispatch).
این قابلیت شامل یک دکمه دانلود است که یک مودال اختصاصی باز می‌کند تا کاربر بتواند تعیین کند:
۱. آیا همه رکوردهای فیلتر شده دانلود شوند یا فقط رکوردهای انتخاب شده؟
۲. آیا تمام ستون‌های دیتابیس در فایل اکسل قرار بگیرند، فقط ستون‌های نمایشی جدول، یا کاربر به صورت دستی ستون‌های مد نظر را انتخاب کند؟

## نیاز به تایید کاربر (User Review Required)
> [!IMPORTANT]
> <div dir="rtl" align="right">
> به منظور تولید فایل اکسل در بک‌اند (Backend) برای رفع مشکلات پرفورمنس در داده‌های سنگین، نیاز به نصب پکیج `openpyxl` در بک‌اند داریم. آیا با اضافه شدن این پکیج موافق هستید؟
> </div>

## تغییرات پیشنهادی (Proposed Changes)

### Backend (بک‌اند)
#### [MODIFY] [requirements.txt](file:///e:/warehouse%20project/backend/requirements.txt)
- اضافه کردن `openpyxl` برای تولید فایل خروجی `.xlsx`

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/inventory/views.py)
- اضافه کردن متد `@action(detail=False, methods=['post'])` با نام `export_excel` به `ItemViewSet`.
- اعمال کردن منطق فیلترها (مشابه متد `getAll`) و گرفتن رکوردهای مربوطه.
- تولید فایل اکسل با استفاده از `openpyxl` بر اساس ستون‌های درخواستی کاربر و بازگرداندن فایل در Response.

### Frontend (فرانت‌اند)
#### [MODIFY] [item-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/item-api.service.ts)
- اضافه کردن متد `exportExcel(payload)` برای ارسال درخواست به سرور و دانلود فایل `Blob` دریافتی.

#### [MODIFY] [dispatch.ts](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.ts)
- افزودن state ها و متدهای مربوط به Modal دانلود (مثلا `isExportModalOpen`, `exportDataScope`, `exportColumnScope`, `selectedExportColumns`).
- استخراج لیست تمام ستون‌های موجود برای فرم انتخاب دستی ستون‌ها.

#### [MODIFY] [dispatch.html](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.html)
- افزودن دکمه «دانلود داده‌ها» در نوار ابزار بالای صفحه یا در کنار دکمه‌های لیبلینگ.
- طراحی و پیاده‌سازی Modal دانلود با گزینه‌های Radio Button و لیست Checkbox برای انتخاب ستون‌ها.

## برنامه تست و اعتبارسنجی (Verification Plan)
- اجرای اپلیکیشن و کلیک روی دکمه دانلود.
- تست حالت‌های مختلف (همه رکوردها / رکوردهای انتخاب شده).
- تست حالت‌های ستون‌ها (همه ستون‌های دیتابیس / ستون‌های جدول / ستون‌های دلخواه).
- تایید فرمت فایل اکسل و درستی اطلاعات تولید شده.

</div>
