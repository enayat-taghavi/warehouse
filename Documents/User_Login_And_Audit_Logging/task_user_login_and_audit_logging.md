<div dir="rtl" align="right">

# چک‌لیست وظایف اجرایی: سیستم جامع رهگیری ورود کاربران و لاگ ممیزی (Multi-Agent Audit Tasks)

- [x] **فاز ۱: مدل‌های دیتابیس و مایگریشن فوروارد (Database Models & Forward Migrations)** <!-- id: phase1 -->
  - [x] ۱.۱: طراحی مدل بهینه `UserLoginLog` با ایندکس‌های کامپوزیت در `accounts/models.py` <!-- id: 1_1 -->
  - [x] ۱.۲: طراحی مدل جامع `AuditLog` با فیلدهای Before/After JSON و انبار در `accounts/models.py` <!-- id: 1_2 -->
  - [x] ۱.۳: ایجاد مایگریشن فوروارد (`makemigrations accounts`) و اعمال امن با `migrate` <!-- id: 1_3 -->
  - [x] ۱.۴: 🔍 **گیت بازبینی و تایید ایجنت بازبین برای فاز ۱** (بررسی یکپارچگی مدل‌ها، روابط ForeignKey و سلامت ایندکس‌ها - تایید شد ✅) <!-- id: 1_gate -->

- [x] **فاز ۲: میان‌افزار کانتکست ایزوله و هوک‌های احراز هویت (Middleware, Context & Auth Hooks)** <!-- id: phase2 -->
  - [x] ۲.۱: پیاده‌سازی میان‌افزار `AuditContextMiddleware` با `contextvars` در `accounts/middleware.py` <!-- id: 2_1 -->
  - [x] ۲.۲: ثبت میان‌افزار در لیست `MIDDLEWARE` فایل `config/settings.py` <!-- id: 2_2 -->
  - [x] ۲.۳: ایجاد ماژول کمکی `accounts/audit_utils.py` با توابع `log_audit_event` و ماسک‌سازی فیلدهای حساس <!-- id: 2_3 -->
  - [x] ۲.۴: اتصال هوک ثبت ورود موفق (`SUCCESS`) و ناموفق (`FAILED_CREDENTIALS`, `FAILED_LOCKED`, `FAILED_INACTIVE`) در `CustomTokenObtainPairSerializer` <!-- id: 2_4 -->
  - [x] ۲.۵: پیاده‌سازی هوک خروج (`LOGOUT`) در اندپوینت خروج <!-- id: 2_5 -->
  - [x] ۲.۶: 🔍 **گیت بازبینی و تایید ایجنت بازبین برای فاز ۲** (بررسی ثبت دقیق لاگین ناموفق/موفق و ماسک بودن داده‌های محرمانه - تایید شد ✅) <!-- id: 2_gate -->

- [x] **فاز ۳: اندپوینت‌های امن REST API، فیلترها و سرویس خروجی (APIs, RBAC & Export)** <!-- id: phase3 -->
  - [x] ۳.۱: پیاده‌سازی سریالایزرهای `UserLoginLogSerializer` و `AuditLogSerializer` در `accounts/serializers.py` <!-- id: 3_1 -->
  - [x] ۳.۲: پیاده‌سازی `UserLoginLogViewSet` و `AuditLogViewSet` فقط‌خواندنی (`ReadOnlyModelViewSet`) در `accounts/views.py` <!-- id: 3_2 -->
  - [x] ۳.۳: ایجاد اکشن‌های آماری (`stats`) و خروجی CSV با انکودینگ UTF-8-SIG برای نمایش بی‌نقص فارسی <!-- id: 3_3 -->
  - [x] ۳.۴: ثبت مسیرهای امن API در `accounts/urls.py` و تنظیم مجوزهای RBAC <!-- id: 3_4 -->
  - [x] ۳.۵: 🔍 **گیت بازبینی و تایید ایجنت بازبین برای فاز ۳** (بررسی کوئری‌های بهینه، تست بلاک بودن متدهای مخرب و تست خروجی CSV - تایید شد ✅) <!-- id: 3_gate -->

- [x] **فاز ۴: اتصال سرویس و بازطراحی داشبورد ممیزی در فرانت‌اند (Angular Audit Dashboard)** <!-- id: phase4 -->
  - [x] ۴.۱: ایجاد سرویس `AuditService` در `frontend/src/app/services/audit.service.ts` <!-- id: 4_1 -->
  - [x] ۴.۲: بازطراحی کامپوننت `app-audit` با ساختار دو تبه (Audit Trail + Login History) در `audit.html` و `audit.ts` <!-- id: 4_2 -->
  - [x] ۴.۳: پیاده‌سازی کارت‌های شاخص عملکرد (KPI Cards) و فیلترهای بلادرنگ ماژول، شدت و تقویم <!-- id: 4_3 -->
  - [x] ۴.۴: پیاده‌سازی مدال پیشرفته تفاضل (Visual JSON Diff Modal) با هایلایت رنگی قبل و بعد <!-- id: 4_4 -->
  - [x] ۴.۵: اتصال دانلود CSV و صفحه‌بندی کامل سرورساید <!-- id: 4_5 -->
  - [x] ۴.۶: 🔍 **گیت بازبینی و تایید ایجنت بازبین برای فاز ۴** (بررسی کامپایل بدون خطای Angular، تست مدال Diff و ریسپانسیو بودن UI - تایید شد ✅) <!-- id: 4_gate -->

- [x] **فاز ۵: تست‌های جامع یکپارچگی، سناریوهای مرزی و مستندسازی (End-to-End Testing & DUAL-SAVE Walkthrough)** <!-- id: phase5 -->
  - [x] ۵.۱: اجرای تست‌های نفوذ تستی، ورودهای ناموفق و مسدودسازی تستی با Axes <!-- id: 5_1 -->
  - [x] ۵.۲: اجرای تست ممیزی تغییرات روی کالاها و مشاهده بازتاب در تب Audit Trail <!-- id: 5_2 -->
  - [x] ۵.۳: تدوین سند نهایی `walkthrough_user_login_and_audit_logging.md` در پوشه Documents و سیستم <!-- id: 5_3 -->
  - [x] ۵.۴: به‌روزرسانی نهایی `Master_Log.md` <!-- id: 5_4 -->
  - [x] ۵.۵: 🔍 **گیت بازبینی نهایی و تایید کلی پروژه** (تایید جامع پایداری، عملکرد و صحت خروجی‌ها - تایید شد ✅) <!-- id: 5_gate -->

</div>
