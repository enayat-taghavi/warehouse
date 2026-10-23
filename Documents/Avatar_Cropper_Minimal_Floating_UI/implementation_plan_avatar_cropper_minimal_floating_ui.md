<div dir="rtl" align="right">

# طرح مینیمال‌سازی نهایی و دکمه شناور چرخش در فرم ویرایش تصویر پرسنلی (Ultra-Minimal Avatar Cropper)

این طرح فنی، تغییرات لازم برای رسیدن به نهایت سادگی، حذف پنل‌های اضافه (بزرگ‌نمایی، بازنشانی، انتخاب کادر ۱:۱ و ۳:۴) و انتقال دکمه چرخش به صورت یک آیکون شناور شیشه‌ای (Glassmorphism Floating Button) در گوشه بالا راست تصویر را مشخص می‌کند.

---

## ۱. تصمیمات طراحی تاییدشده با کاربر (Design Decisions)

1. **حذف کادر کنترل بزرگ‌نمایی و بازنشانی:** بخش پایین کادر عکس که شامل اسلایدر زوم و دکمه‌های ریست بود به طور کامل حذف می‌شود؛ بزرگ‌نمایی تماماً با اسکرول ماوس روی دسکتاپ و ژست دو انگشتی (Pinch) روی گوشی انجام می‌شود.
2. **حذف انتخاب‌گر نسبت ابعاد (۱:۱ و ۳:۴):** نوار کادر بالای عکس حذف شده و نسبت ابعاد به صورت استاندارد و ثابت روی **۱:۱ مربعی (با ماسک دایره‌ای شیک)** تنظیم می‌گردد.
3. **دکمه شناور چرخش ۹۰ درجه (↻):** به گوشه **بالا-راست** محفظه پیش‌نمایش تصویر منتقل می‌شود (با افکت شیشه‌ای نیمه‌شفاف بلور، سایه ملایم و هاور بنفش-نیلی).

---

## ۲. تغییرات فایل‌ها (Proposed Changes)

### الف) منطق کامپوننت مودال برش (Component Logic)
#### [MODIFY] [avatar-cropper-modal.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.ts)
- تثبیت نسبت ابعاد `aspectRatio = '1:1'`.
- حذف وابستگی‌های مربوط به متد `setAspectRatio`.

---

### ب) قالب HTML و استایل‌های مدرن CSS (Template & Aesthetics)
#### [MODIFY] [avatar-cropper-modal.html](file:///e:/warehouse%20project/frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.html)
- حذف بخش `aspect-ratio-group` از نوار ابزار بالا.
- حذف کامل بخش `controls-section` (اسلایدر زوم و دکمه‌های بازنشانی و چرخش قبلی) از پایین.
- اضافه کردن دکمه شناور چرخش (`floating-rotate-btn`) داخل کادر پیش‌نمایش عکس (`canvas-box`) در گوشه بالا-راست.

#### [MODIFY] [avatar-cropper-modal.css](file:///e:/warehouse%20project/frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.css)
- تعریف استایل `floating-rotate-btn`:
  - موقعیت `position: absolute; top: 12px; right: 12px; z-index: 10;`.
  - افکت شیشه‌ای مدرن `background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.25); color: #ffffff;`.
  - ابعاد ۳۶×۳۶px دایره‌ای با انیمیشن هاور جذاب و گردش نرم آیکون.
- حذف استایل‌های کلاس‌های حذف‌شده (`controls-section`, `pan-controls-group`, `aspect-ratio-group`).

---

## ۳. طرح آزمون و راستی‌آزمایی (Verification Plan)

### ۱. بررسی ظاهری (Visual Check)
- تایید خلوت شدن کامل کادر مودال و عدم وجود دکمه‌های اضافه در بالا و پایین.
- تایید موقعیت دقیق و زیبای دکمه شناور چرخش در گوشه بالا راست کادر عکس.

### ۲. تست عملکردی (Functional Test)
- تست کلیک روی دکمه شناور چرخش و اطمینان از چرخش ۹۰ درجه ساعتگرد تصویر.
- تست زوم با اسکرول ماوس و زوم لمسی ۲ انگشتی.
- تست جابه‌جایی عکس با درگ ماوس و لمس ۱ انگشتی.
- تست دکمه «ذخیره و اعمال تصویر» و ثبت نهایی عکس WebP.

### ۳. تست بیلد فرانت‌اند (Angular Build Test)
- اجرای `npx ng build --configuration=development` و اطمینان از خروجی ۰ خطا.

</div>
