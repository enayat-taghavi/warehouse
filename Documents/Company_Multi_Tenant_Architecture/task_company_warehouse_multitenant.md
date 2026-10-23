<div dir="rtl" align="right">

# فهرست وظایف تفصیلی طرح اتصال انبارها به شرکت و انتقال به مرکز عملیات
## (Company-Warehouse Multi-Tenant & Operations Migration Tasklist)

---

### 🔹 فاز ۱: بک‌اند، مدل‌های داده و مایگریشن امن (Backend & Safe Migrations)
- [x] <!-- id: W1.1 --> افزودن فیلدهای عددی ایندکس‌شده `company_id` و `company_name` به مدل `Warehouse` در [warehouses/models.py](file:///e:/warehouse%20project/backend/warehouses/models.py) <!-- priority: High -->
- [x] <!-- id: W1.2 --> افزودن فیلد بولین `has_warehouse_module = models.BooleanField(default=True)` به مدل `Company` در [personnel/models.py](file:///e:/warehouse%20project/backend/personnel/models.py) <!-- priority: High -->
- [x] <!-- id: W1.3 --> تولید و اعمال مایگریشن‌های اسکیما برای اپ‌های `warehouses` و `personnel` (`makemigrations` و `migrate`) <!-- priority: High -->
- [x] <!-- id: W1.4 --> تولید و اجرای مایگریشن داده خودکار (`RunPython`) جهت اتصال تمامی ۹ انبار موجود در سیستم به شرکت «فارس عالیش» (`company_id = 2`) <!-- priority: Critical -->
- [x] <!-- id: W1.5 --> به‌روزرسانی کوئری‌ست `WarehouseViewSet.get_queryset` بر پایه هدر `HTTP_X_COMPANY_ID` و انتساب خودکار شرکت فعال در `perform_create` در [warehouses/views.py](file:///e:/warehouse%20project/backend/warehouses/views.py) <!-- priority: High -->
- [x] <!-- id: W1.6 --> به‌روزرسانی `CompanySerializer` و `WarehouseSerializer` جهت انعکاس فیلدهای جدید در [personnel/serializers.py](file:///e:/warehouse%20project/backend/personnel/serializers.py) و [warehouses/serializers.py](file:///e:/warehouse%20project/backend/warehouses/serializers.py) <!-- priority: High -->

---

### 🔹 فاز ۲: انتقال پورتال مدیریت شرکت‌ها به مرکز عملیات (Operations Portal Refactoring)
- [x] <!-- id: W2.1 --> انتقال فیزیکی کامپوننت از `src/app/components/finance/companies/` به `src/app/components/operations/companies/` <!-- priority: High -->
- [x] <!-- id: W2.2 --> به‌روزرسانی مسیرهای روتینگ در `app.routes.ts` (ثبت `/app/operations/companies` و ایجاد ریدایرکت از مسیر قدیمی مالی) <!-- priority: High -->
- [x] <!-- id: W2.3 --> افزودن آیتم «مدیریت شرکت‌ها و هلدینگ» به منوی سایدبار مرکز عملیات در [layout.html](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html) و [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts) <!-- priority: High -->
- [x] <!-- id: W2.4 --> افزودن چک‌باکس ارگونومیک «فعال بودن سامانه انبارداری برای این شرکت» به فرم مودال ثبت/ویرایش شرکت <!-- priority: High -->

---

### 🔹 فاز ۳: ماژولار بودن انبارداری و پویایی منوی بالای صفحه (Modular App Switcher & Guards)
- [x] <!-- id: W3.1 --> پیاده‌سازی متد `hasWarehouseModule()` و سیگنال واکنشی در [active-company.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/active-company.service.ts) <!-- priority: High -->
- [x] <!-- id: W3.2 --> پنهان‌سازی مشروط تب «📦 انبارگردانی» در سوئیچر سامانه‌ها بر مبنای وضعیت شرکت فعال در [app-role-switcher.component.html](file:///e:/warehouse%20project/frontend/src/app/shared/components/app-role-switcher/app-role-switcher.component.html) <!-- priority: High -->
- [x] <!-- id: W3.3 --> پیاده‌سازی گارد امنیتی روتینگ `WarehouseModuleGuard` جهت ممانعت از ورود مستقیم با URL به شرکت‌های بدون انبار <!-- priority: High -->
- [x] <!-- id: W3.4 --> اتصال سلکتور انتخاب انبار در بالای صفحه انبارداری جهت لود منحصربه‌فرد انبارهای شرکت فعال <!-- priority: Medium -->

---

### 🔹 فاز ۴: ویزارد راه‌اندازی در اجرای اول برنامه (First-Boot Onboarding Wizard)
- [x] <!-- id: W4.1 --> ساخت کامپوننت مودال ویزارد راه‌اندازی اول (`FirstBootWizardComponent`) با استایل مدرن و هدایت‌کننده <!-- priority: High -->
- [x] <!-- id: W4.2 --> افزودن تشخیص وضعیت بدون شرکت بودن سیستم (`companies.length === 0`) در لاگین و لایه‌بندی اصلی <!-- priority: High -->
- [x] <!-- id: W4.3 --> امکان تعریف و ثبت آنی اولین شرکت حقوقی با تنظیمات اولیه انبارداری و تبدیل خودکار به شرکت فعال <!-- priority: High -->

---

### 🔹 فاز ۵: آزمون‌های یکپارچگی، تست‌های مرورگر و صحه‌گذاری (Testing & Quality Assurance)
- [x] <!-- id: W5.1 --> نگارش و اجرای آزمون‌های بک‌اند جنگو جهت تایید ایزولاسیون انبارها و عدم نشت کاردکس بین شرکت‌ها <!-- priority: Critical -->
- [x] <!-- id: W5.2 --> اجرای تست‌های سریع DOM نوع ۱ (Vitest) برای اعتبارسنجی سوئیچر و ویزارد راه‌اندازی <!-- priority: High -->
- [x] <!-- id: W5.3 --> بررسی عدم وجود هرگونه خطای کامپایل تایپ‌اسکریپت (`npx tsc --noEmit`) <!-- priority: Critical -->
- [x] <!-- id: W5.4 --> ثبت مستندات نهایی انجام کار (`walkthrough`) طبق پروتکل DUAL-SAVE <!-- priority: Medium -->

</div>
