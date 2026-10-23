<div dir="rtl" align="right">

# 📋 طرح جامع یکسان‌سازی نوار ابزار، زیباسازی آیکون‌های عملیاتی و نشانگر پویای شبکه (Header Icons Harmonization & Dynamic Network Sync)

این طرح بر اساس گفتگوها و مصاحبه چت قبلی و به منظور تحقق کامل و واقعی **سناریوی شماره ۲ (نشانگر چندحالته هوشمند شبکه و همگام‌سازی)**، **یکسان‌سازی محل و استایل دکمه‌های ابزار (اسکنر، اکسل، رفرش، نشانگر وضعیت)** و **زیباسازی دکمه‌های عملیاتی اصلی (ثبت، پاکسازی، بازگردانی، خروجی‌ها و گزارشات)** در تمامی تب‌های سامانه تدوین شده است.

---

## 🎯 ۱. اهداف کلیدی و معماری تغییرات

### الف) نشانگر پویای شبکه و همگام‌سازی (`OfflinePendingBadgeComponent`)
1. **استقرار کامل در دو حالت (`Dual-Mode`):**
   - **حالت درون‌خطی (`mode="inline"`):** نشان فشرده آبی آسمانی روی رکوردهایی از جدول که آفلاین ایجاد یا ویرایش شده‌اند (`_offlinePending`).
   - **حالت هدر (`mode="header"`):** استقرار در نوار بالای سراسری کل سیستم (`Top Navbar`) و در گوشه چپ نوار ابزار تمام صفحات و تب‌ها.
2. **سه وضعیت بصری هوشمند در هدر:**
   - **🟢 متصل و همگام (`Connected & Synced`):** تم سبز زمردی (`bg-emerald-50 text-emerald-700 border-emerald-200`) با آیکون ابر تیک‌دار و متن «متصل».
   - **🔄 در حال ارسال (`Syncing`):** تم آبی آسمانی (`bg-sky-50 text-sky-700 border-sky-200`) با انیمیشن چرخش و متن «در حال ارسال (تعداد)».
   - **📴 آفلاین / صف انتظار (`Offline & Pending`):** تم کهربایی (`bg-amber-50 text-amber-700 border-amber-200`) با آیکون ابر خط‌خورده و نمایش تعداد داده‌های در صف.
3. **پاپ‌آپ تعاملی پیشرفته (Interactive Popover):**
   - باز شدن با کلیک کاربر و بستن هوشمند با کلیک در بیرون (Click-Outside).
   - نمایش وضعیت اینترنت و سرور، تعداد رکوردهای در صف، زمان آخرین همگام‌سازی موفق، و دکمه تعاملی **«همگام‌سازی دستی (Sync Now)»**.

---

### ب) یکسان‌سازی و استانداردسازی نوار ابزار هدر در تمام صفحات
طبق الگوی کارتابل سرپرست و مدیر، ترتیب و استایل دکمه‌های ابزار در سمت چپ هدر (در چیدمان راست‌به‌چپ) به شکل زیر یکپارچه می‌شود:

| ردیف | نام ابزار / دکمه | استایل و ظاهر | رنگ‌بندی تم | عملکرد |
|:---:|---|---|---|---|
| **۱** | **بارکدخوان دوربین** | دکمه مربعی گوشه‌گرد (`p-2 rounded-xl`) با آیکون بارکد | 🟣 بنفش/نیلی (`bg-indigo-50 text-indigo-600 hover:bg-indigo-100`) | باز کردن اسکنر دوربین (`scanner?.openCamera()`) |
| **۲** | **خروجی / دانلود اکسل** | دکمه مربعی گوشه‌گرد (`p-2 rounded-xl`) با آیکون شیت/دانلود | 🟢 سبز زمردی (`bg-emerald-50 text-emerald-600 hover:bg-emerald-100`) | دانلود فایل اکسل یا باز کردن مدال خروجی |
| **۳** | **ورودی / آپلود اکسل** | دکمه مربعی گوشه‌گرد (`p-2 rounded-xl`) با آیکون آپلود | 🔵 آبی آسمانی (`bg-blue-50 text-blue-600 hover:bg-blue-100`) | باز کردن مدال بارگذاری فایل اکسل |
| **۴** | **بروزرسانی داده‌ها** | دکمه مربعی گوشه‌گرد (`p-2 rounded-xl`) با آیکون رفرش | 🟣 بنفش/نیلی (`bg-indigo-50 text-indigo-600 hover:bg-indigo-100`) | دریافت مجدد داده‌ها با اسپینر هنگام بارگذاری |
| **۵** | **نشانگر پویای شبکه** | بج گوشه‌گرد تعاملی (`OfflinePendingBadgeComponent`) | پویا (سبز / آبی / کهربایی) | نمایش وضعیت شبکه، صف آفلاین و پاپ‌آپ همگام‌سازی |

---

### ج) استانداردسازی دکمه‌های عملیاتی اصلی (Primary Action Buttons)
* دکمه‌های اصلی ایجاد و ثبت جدید (مانند «ثبت پرسنل»، «تعریف نقش»، «انبار جدید») دارای گرادیانت بنفش/نیلی (`linear-gradient(135deg, #4f46e5, #7c3aed)`), گوشه‌های کاملاً گرد (`rounded-xl`)، سایه ملایم و آیکون بارز و متناسب خواهند شد.
* دکمه‌های عملیات حساس مدیریتی (پاکسازی با تم رز/سطل، بازگردانی با تم بنفش/تایم‌لاین) در مرکز ممیزی (`audit.html`) دارای استایل هماهنگ و آیکون اختصاصی می‌شوند.
* دکمه‌های گزارش‌ساز (`reports.html`): تفکیک رنگی دقیق دکمه‌های خروجی PDF (قرمز)، خروجی اکسل (سبز)، ذخیره قالب (سفید/خاکستری) و اجرای گزارش (نیلی).

---

## 🗂️ فازبندی اجرایی و تغییرات به تفکیک فایل‌ها

### فاز ۱: بازبینی و نهایی‌سازی کامپوننت نشانگر پویای وضعیت
* **فایل هدف:** [`offline-pending-badge.component.ts`](file:///e:/warehouse%20project/frontend/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.ts)
* **اقدامات:** اطمینان از عملکرد بدون باگ در هر دو حالت هدر و اینلاین، صحت عملکرد پاپ‌آپ و بستن کلیک‌خارجی، اتصال تمیز به `NetworkStatusService` و `OfflineSyncService`.

### فاز ۲: هدر سراسری بالای سامانه (Top Navbar)
* **فایل‌های هدف:** [`layout.html`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html) و [`layout.ts`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
* **اقدامات:** استقرار کامپوننت نشانگر وضعیت در کنار آواتار کاربر و کلیدهای ناوبری تاریخچه با چیدمان تراز و ریسپانسیو.

### فاز ۳: تب‌های پنج‌گانه عملیات شمارش و انبارگردانی
* **فایل‌های هدف:**
  1. [`counter-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html) (کارتابل شمارشگر)
  2. [`supervisor-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html) (کارتابل سرپرست)
  3. [`manager-review.html`](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.html) (کارتابل مدیر و ناظر)
  4. [`count-tracking.html`](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html) (پیگیری وضعیت شمارش)
  5. [`customs.html`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html) (استخر ترخیص و گمرک)
* **اقدامات:** هماهنگ‌سازی نوار ابزار آیکونی، قرارگیری دکمه اسکنر، خروجی اکسل، رفرش و نشانگر پویای هدر در تمامی این ۵ صفحه در یک راستا و با استایل واحد.

### فاز ۴: تب‌های مدیریتی، لاجستیک و تعریف پایه
* **فایل‌های هدف:**
  1. [`projects.html`](file:///e:/warehouse%20project/frontend/src/app/components/projects/projects.html) (انبارها/پروژه‌ها: دکمه انبار جدید با آیکون اختصاصی، دانلود اکسل، آپلود اکسل و رفرش)
  2. [`users.html`](file:///e:/warehouse%20project/frontend/src/app/components/users/users.html) (کاربران و نقش‌ها: دکمه‌های ثبت پرسنل، تعریف نقش، اکسل‌ها و رفرش)
  3. [`dispatch.html`](file:///e:/warehouse%20project/frontend/src/app/components/dispatch/dispatch.html) (تخصیص کالا: نوار ابزار هماهنگ هدر)
  4. [`feeding.html`](file:///e:/warehouse%20project/frontend/src/app/components/feeding/feeding.html) (تغذیه خط و اطلاعات: دکمه آپلود و پردازش با آیکون)

### فاز ۵: تب‌های مانیتورینگ، اسناد، ممیزی و گزارش‌ساز
* **فایل‌های هدف:**
  1. [`dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/dashboard/dashboard.html) (داشبورد: دکمه رفرش مربعی و نشانگر هدر)
  2. [`docs.html`](file:///e:/warehouse%20project/frontend/src/app/components/docs/docs.html) (اسناد و تزریق داده: دانلود قالب نمونه و نشانگر هدر)
  3. [`audit.html`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.html) (مرکز ممیزی: دکمه‌های پاکسازی، بازگردانی، اکسل و نشانگر هدر)
  4. [`reports.html`](file:///e:/warehouse%20project/frontend/src/app/components/reports/reports.html) (گزارش‌ساز: دکمه‌های PDF، اکسل، ذخیره قالب و اجرای گزارش)

### فاز ۶: کامپایل، بیلد نهایی و راستی‌آزمایی
* **اقدامات:** اجرای کامپایل کامل Angular با دستور `npm run build`، بررسی نبود هرگونه خطای تایپ‌اسکریپت یا تمپلیت، و بررسی سلامت رندر عناصر در خروجی.

</div>
