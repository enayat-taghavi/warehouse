<div dir="rtl" align="right">

# فهرست وظایف فازبندی‌شده استقرار معماری چندشرکتی (Multi-Tenant Company Architecture Tasklist)

این چک‌لیست وظایف، مراحل اجرای گام‌به‌گام و تست‌های فنی افزودن لایه شرکت را بدون ریسک تخریب داده‌های فعلی مشخص می‌سازد.

---

### 🔴 فاز ۱: زیرساخت بک‌اند و دیتابیس (Database Models & Safe Migration)
- [x] <!-- id: 1.1 --> تعریف مدل `Company` با مشخصات کامل حقوقی (نام، کد، شناسه ملی، کد اقتصادی، شماره ثبت، تلفن، آدرس، مدیرعامل، لوگو) در [models.py](file:///e:/warehouse%20project/backend/personnel/models.py) <!-- priority: High -->
- [x] <!-- id: 1.2 --> اضافه کردن کلید خارجی نال‌پذیر `company` به مدل [FinancialProject](file:///e:/warehouse%20project/backend/personnel/models.py#L86) <!-- priority: High -->
- [x] <!-- id: 1.3 --> تعریف مدل انتساب دسترسی کاربر به شرکت `UserCompanyAccess` با کلیدهای خارجی به User و Company <!-- priority: High -->
- [x] <!-- id: 1.4 --> تولید و اعمال مایگریشن اسکیمای جنگو (`makemigrations` و `migrate`) <!-- priority: High -->
- [x] <!-- id: 1.5 --> ایجاد و اجرای مایگریشن داده خودکار (`RunPython`) جهت ایجاد دو شرکت «پاینده توان ساینا» و «فارس عالیش» و اتصال ۳ پروژه بدون تغییر شناسه <!-- priority: Critical -->
- [x] <!-- id: 1.6 --> اعتبارسنجی یکپارچگی داده و اتصال موفقیت‌آمیز پروژه‌های دالان، پارسیان و انبارداری در دیتابیس <!-- priority: Critical -->

---

### 🟠 فاز ۲: لایه وب‌سرویس و تفکیک دسترسی (REST APIs & RBAC)
- [x] <!-- id: 2.1 --> ایجاد `CompanySerializer` و متدهای اعتبارسنجی شناسه ملی ۱۱ رقمی در [serializers.py](file:///e:/warehouse%20project/backend/personnel/serializers.py) <!-- priority: High -->
- [x] <!-- id: 2.2 --> پیاده‌سازی `CompanyViewSet` در [views.py](file:///e:/warehouse%20project/backend/personnel/views.py) با اکشن‌های کامل CRUD و اکشن `user_available` <!-- priority: High -->
- [x] <!-- id: 2.3 --> ثبت مسیرهای API در [urls.py](file:///e:/warehouse%20project/backend/personnel/urls.py) (`/api/personnel/companies/`) <!-- priority: High -->
- [x] <!-- id: 2.4 --> به‌روزرسانی کوئری‌های `FinancialProjectViewSet` جهت پذیرش و فیلتر کردن بر اساس `company_id` و هدر `X-Company-ID` <!-- priority: High -->
- [x] <!-- id: 2.5 --> پیاده‌سازی فیلتر امنیتی دسترسی ترکیبی (Hybrid RBAC) برای تضمین عدم دسترسی کاربر غیرمجاز به شرکت‌های دیگر <!-- priority: High -->

---

### 🟡 فاز ۳: سرویس فرانت‌اند و کانتکست کاری ورود (Frontend Context & Login Switcher)
- [x] <!-- id: 3.1 --> ایجاد تایپ‌ها و اینترفیس‌های `Company` و `UserCompanyAccess` در فرانت‌اند <!-- priority: High -->
- [x] <!-- id: 3.2 --> ایجاد سرویس مرکزی `ActiveCompanyService` جهت مدیریت شرکت فعال و ذخیره در LocalStorage <!-- priority: High -->
- [x] <!-- id: 3.3 --> افزودن اینترسپتور جهت ارسال خودکار هدر `X-Company-ID` در ریکوئست‌های HTTP <!-- priority: High -->
- [x] <!-- id: 3.4 --> پیاده‌سازی کامپوننت مودال انتخاب شرکت در زمان لاگین (`CompanySelectionModal`) ویژه کاربران چندشرکتی و ادمین <!-- priority: High -->
- [x] <!-- id: 3.5 --> پیاده‌سازی کامپوننت تعویض سریع شرکت در هدر اصلی سیستم (`HeaderCompanySwitcher`) <!-- priority: High -->

---

### 🟢 فاز ۴: پورتال اختصاصی مدیریت شرکت‌ها (Company Management Hub)
- [x] <!-- id: 4.1 --> ایجاد کامپوننت مستقل `CompaniesManagementComponent` در مسیر `src/app/components/finance/companies/` <!-- priority: High -->
- [x] <!-- id: 4.2 --> پیاده‌سازی هدر استیکی بلور (`sticky top-0 z-30`)، دکمه‌های ۳ گانه آیکونی (اکسل خروجی/ورودی، رفرش) و بج شمارنده <!-- priority: High -->
- [x] <!-- id: 4.3 --> طراحی جدول داده‌های ثبتی شرکت‌ها با جستجوی سریع زنده و استایل‌های متراکم <!-- priority: High -->
- [x] <!-- id: 4.4 --> پیاده‌سازی مودال ثبت و ویرایش شرکت شامل آپلود لوگو و اعتبارسنجی فیلدها <!-- priority: High -->
- [x] <!-- id: 4.5 --> ثبت مسیر `/app/finance/companies` در [accounting.routes.ts](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/accounting.routes.ts) و افزودن لینک به سایدبار در بخش تنظیمات پایه <!-- priority: High -->
- [x] <!-- id: 4.6 --> اتصال فیلترهای فرم‌های ثبت پرسنل و ناوگان به شرکت فعال هدر (فیلتر شدن خودکار پروژه‌ها) <!-- priority: Medium -->

---

### 🔵 فاز ۵: آزمون‌های یکپارچگی و صحه‌گذاری نهایی (Testing & Verification)
- [x] <!-- id: 5.1 --> اجرای تست‌های واحد بک‌اند برای اعتبارسنجی مایگریشن داده و عایق‌سازی امنیتی <!-- priority: High -->
- [x] <!-- id: 5.2 --> اجرای مجدد آزمون‌های دیسکت‌های بیمه [test_project_exports.py](file:///e:/warehouse%20project/backend/personnel/test_project_exports.py) جهت تضمین خروجی بدون تغییر <!-- priority: Critical -->
- [x] <!-- id: 5.3 --> اجرای تست‌های واحد DOM نوع ۱ بر پایه Vitest برای کامپوننت‌های فرانت‌اند <!-- priority: High -->
- [x] <!-- id: 5.4 --> بررسی کامل عدم وجود خطای کامپایل فرانت‌اند (`npx tsc --noEmit`) <!-- priority: High -->
- [x] <!-- id: 5.5 --> تهیه سند نهایی گزارش انجام کار (`walkthrough`) طبق پروتکل DUAL-SAVE <!-- priority: Medium -->

</div>
