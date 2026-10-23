<div dir="rtl" align="right">

# چک‌لیست وظایف طرح بازمهندسی دسترسی چندشرکتی و کارتابل بایگانی مدارک

---

### 🔹 فاز ۱: پایگاه‌داده و مدل دسترسی چندشرکتی (Backend Schema & Migration)
- [x] <!-- id: MT-1.1 --> گسترش مدل `UserCompanyAccess` با افزودن فیلدهای `access_level` (`docs_read`, `docs_write`, `workspace_full`) و `role_in_company` در [personnel/models.py](file:///e:/warehouse%20project/backend/personnel/models.py) <!-- priority: Critical -->
- [x] <!-- id: MT-1.2 --> تولید و اجرای مایگریشن جدید پایگاه داده (`python manage.py makemigrations personnel` و `migrate`) <!-- priority: Critical -->
- [x] <!-- id: MT-1.3 --> به‌روزرسانی `UserCompanyAccessSerializer` در [personnel/serializers.py](file:///e:/warehouse%20project/backend/personnel/serializers.py) برای پشتیبانی از فیلدهای جدید <!-- priority: High -->

---

### 🔹 فاز ۲: انزوای امنیتی و رفع باگ نشت داده‌های انبارداری (Security & Isolation)
- [x] <!-- id: MT-2.1 --> به‌روزرسانی توابع `get_user_allowed_companies` و اکشن `user_available` در [personnel/views.py](file:///e:/warehouse%20project/backend/personnel/views.py) جهت فیلتر شرکت‌های دارای `workspace_full` برای سوئیچر هدر <!-- priority: Critical -->
- [x] <!-- id: MT-2.2 --> اصلاح متد `dashboard_stats` در [inventory/views.py](file:///e:/warehouse%20project/backend/inventory/views.py) برای اعمال فیلتر شرکتی (`warehouse__company_id`) و جلوگیری قطعی از نشت آمار سایر شرکت‌ها <!-- priority: Critical -->
- [x] <!-- id: MT-2.3 --> بازنگری در گارد ریدایرکت پیش‌فرض در [auth.guard.ts](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.guard.ts) و [app.routes.ts](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts) جهت ممانعت از سقوط کاربران خزانه‌داری/مالی به داشبورد انبار <!-- priority: High -->

---

### 🔹 فاز ۳: استودیوی شرکت و مدیریت سطوح دسترسی (Company Studio UI)
- [x] <!-- id: MT-3.1 --> ارتقای تب مدیریت دسترسی کاربران در [companies.html](file:///e:/warehouse%20project/frontend/src/app/components/operations/companies/companies.html) و [companies.ts](file:///e:/warehouse%20project/frontend/src/app/components/operations/companies/companies.ts) با افزودن انتخابگر سطح دسترسی (فقط مشاهده مدارک / مشاهده و بارگذاری / عضویت کامل) <!-- priority: High -->
- [x] <!-- id: MT-3.2 --> اصلاح رفتار سوئیچر هدر بالای صفحه در [active-company.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/active-company.service.ts) به طوری که فقط شرکت‌های با دسترسی `workspace_full` در دراپ‌داون ظاهر شوند <!-- priority: High -->

---

### 🔹 فاز ۴: کارتابل مستقل بایگانی مدارک حقوقی شرکت‌ها (Dedicated Document Archive)
- [x] <!-- id: MT-4.1 --> ایجاد کامپوننت مستقل `CompanyDocumentsArchiveComponent` با هدر چسبان، کارت‌های شرکت‌های مجاز، جدول مدارک با پیش‌نمایش درجا و دانلود امن <!-- priority: High -->
- [x] <!-- id: MT-4.2 --> ثبت روت `/app/finance/company-documents` (و ریدایرکت `/app/documents`) در [accounting.routes.ts](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/accounting.routes.ts) <!-- priority: High -->
- [x] <!-- id: MT-4.3 --> افزودن منوی «📑 بایگانی مدارک شرکت‌ها» به سایدبار در [nav-items.ts](file:///e:/warehouse%20project/frontend/src/app/modules/accounting/nav-items.ts) و [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts) <!-- priority: Medium -->

---

### 🔹 فاز ۵: تست‌های جامع، صحه‌گذاری و داکیومنت نهایی (Testing & Verification)
- [x] <!-- id: MT-5.1 --> نگارش تست‌های جدید بک‌اند در `personnel/test_company_documents.py` (تست تفکیک سطوح دسترسی و تست رفع نشت داشبورد انبار) <!-- priority: Critical -->
- [x] <!-- id: MT-5.2 --> اجرای تست‌های DOM ویتست در فرانت‌اند <!-- priority: High -->
- [x] <!-- id: MT-5.3 --> بررسی عدم خطای تایپ‌اسکریپت (`npx tsc --noEmit`) و موفقیت بیلد پروداکشن (`npm run build`) <!-- priority: Critical -->
- [x] <!-- id: MT-5.4 --> ثبت سند گزارش نهایی طبق استاندارد DUAL-SAVE <!-- priority: Medium -->

</div>
