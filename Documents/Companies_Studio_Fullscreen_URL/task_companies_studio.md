# فهرست وظایف اجرایی استودیوی شناسنامه حقوقی شرکت‌ها

<div dir="rtl" align="right">

- [x] **فاز ۱: افزودن روت‌های اختصاصی در روتینگ سراسری** <!-- id: 1 -->
  - [x] افزودن مسیرهای `/app/operations/companies/:id` و `/app/operations/companies/new` در [app.routes.ts](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts)
  - [x] تنظیم `data: { reuse: false }` برای روت‌های استودیو جهت جلوگیری از تداخل حافظه کش روت با فرم‌ها

- [x] **فاز ۲: ارتقای لاجیک کامپوننت و مدیریت URL در تایپ‌اسکریپت** <!-- id: 2 -->
  - [x] تزریق `Router` و `ActivatedRoute` در [companies.ts](file:///e:/warehouse%20project/frontend/src/app/components/operations/companies/companies.ts)
  - [x] پیاده‌سازی متغیر وضعیت `viewMode: 'list' | 'studio'`
  - [x] اشتراک در `paramMap` جهت شناسایی شناسه شرکت (`id`) یا حالت ثبت جدید (`new`) و لود اتوماتیک فرم
  - [x] اشتراک در `queryParamMap` جهت همگام‌سازی ساب‌تب فعال (`?tab=...`)
  - [x] پیاده‌سازی متد بازگشت به فهرست شرکت‌ها با استفاده از `router.navigate(['/app/operations/companies'])`

- [x] **فاز ۳: بازسازی قالب HTML به نمای تمام‌صفحه و هدر استیکی** <!-- id: 3 -->
  - [x] احاطه کردن بخش جدول و کارت‌ها در شرط `*ngIf="viewMode === 'list'"` در [companies.html](file:///e:/warehouse%20project/frontend/src/app/components/operations/companies/companies.html)
  - [x] تبدیل ساختار مودال به کانتینر تمام‌صفحه کاری `*ngIf="viewMode === 'studio'"`
  - [x] پیاده‌سازی هدر چسبان فرماندهی (Sticky Command Center Header) با دکمه بازگشت به لیست، لوگو، نام شرکت و دکمه ذخیره
  - [x] قرار دادن نوار ساب‌تب‌های ۷گانه به صورت ظرف پیل محصور با شمارنده‌های عددی و انیمیشن سوئیچ

- [x] **فاز ۴: تطبیق و اجرای تست‌های Vitest DOM** <!-- id: 4 -->
  - [x] تزریق `Router` و `ActivatedRoute` شبیه‌سازی‌شده در [companies.dom.spec.ts](file:///e:/warehouse%20project/frontend/src/app/components/operations/companies/companies.dom.spec.ts)
  - [x] افزودن تست‌های ناوبری، باز شدن مستقیم از URL، و سوئیچ بین لیست و استودیو
  - [x] اجرای تست واحد دام و دریافت نتیجه ۱۰۰٪ سبز (۵۶ از ۵۶ پاس شده)

- [x] **فاز ۵: تست بیلد نهایی و بررسی کارایی بصری** <!-- id: 5 -->
  - [x] بررسی عدم وجود خطای کامپایل یا هشدار در ترمینال فرانت‌اند
  - [x] ارزیابی ظاهری راست‌به‌چپ (RTL)، واکنش‌گرایی موبایل و فونت وزیرمتن

</div>
