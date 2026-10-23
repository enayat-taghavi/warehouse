# <div dir="rtl" align="right">طرح جامع بهینه‌سازی و رفع نواقص کارتابل‌های انبارگردانی</div>

<div dir="rtl" align="right">

این طرح فنی شامل پیاده‌سازی و ارتقای تمامی بخش‌های سامانه انبارگردانی (کارتابل سرپرست، شمارشگر، مدیر، و داشبورد رهگیری) با رعایت کامل الزامات **محلی‌محور (Local-First)**، **همگام‌سازی بلادرنگ وب‌سوکت (Real-Time WebSocket)**، **صف آفلاین (Offline Queue)** و **کنترل دسترسی نقش‌محور (RBAC)** است.

> [!IMPORTANT]
> **قانون اجرای گام‌به‌گام و تایید بین فازها:**
> تمامی مراحل به ۴ فاز کاملاً مستقل و تفکیک‌شده شکسته شده‌اند. پس از پایان پیاده‌سازی و اعتبارسنجی هر فاز، فرآیند متوقف شده و تنها با تایید صریح کاربر وارد فاز بعدی خواهیم شد.

---

## 🏗️ معماری و الزامات کلیدی سیستم (Architecture & Core Rules)

1. **وب‌سوکت و رویدادهای زنده (WebSocket Live Sync):**
   - تمامی تغییرات باید از طریق سیگنال‌های `broadcast_count_task_update` و `broadcast_doc_task_update` منتشر شوند.
   - کلاینت باید رویدادها را بر اساس `warehouse_id` انبار فعال فیلتر کند تا از رفرش‌های تکراری و بی‌مورد در سایر انبارها جلوگیری شود.
   - اعمال تغییرات به صورت نقطه‌ای (`In-Place Task Update`) با انیمیشن درخشش ملایم (`status-updated-flash`) انجام می‌گیرد.

2. **محلی‌محور و آفلاین (Local-First & Offline Sync):**
   - تمامی تغییرات در شمارشگر ابتدا در دیتابیس محلی Dexie (`offlineDb`) ثبت شده و برچسب `_offlinePending` می‌گیرند.
   - ارسال به سرور از طریق صف امن `OfflineSyncService.enqueue` انجام می‌پذیرد و هیچ تغییری در صورت قطعی اینترنت از دست نمی‌رود.

3. **حفظ استقلال فازها و اعتبارسنجی (Phase Independence & Safety):**
   - هیچ فازی پیش از بیلد موفق TypeScript، بررسی ترمینال و تایید نهایی توسط کاربر بسته نخواهد شد.

---

## 📋 فازبندی تفصیلی پروژه (Detailed Phases)

### 🔹 فاز ۱: ارتقای کارتابل سرپرست شمارش و مالی (`Supervisor Dashboard Enhancement`)
تمرکز این فاز بر روی افزودن ابزارهای حیاتی جستجو، فیلتر و اسکن بارکد به کارتابل سرپرستان است.

* **تغییرات مورد نظر:**
  1. **افزودن نوار جستجوی زنده (Live Search):**
     - جستجوی سریع با `debounceTime(350)` روی فیلدهای `fa_unic_code`، `description`، `new_location`، `old_location`، `po` و `counter_name`.
  2. **فیلترهای وضعیتی و زمانی (Filter Chips):**
     - فیلتر کارهای عادی (`COUNTED`)، ارجاع‌شده‌های مدیر (`MANAGER_REJECTED`)، و فیلترهای زمانی (امروز، دیروز، هفته، همه).
  3. **اسکنر بارکد دوربین و بارکدخوان سخت‌افزاری:**
     - وارد کردن `BarcodeScannerComponent`، شنونده کیبورد سخت‌افزاری (`HostListener window:keydown`) و باز شدن خودکار کارت یا بر عهده گرفتن سریع از استخر.
  4. **فیلتر انبار در وب‌سوکت سرپرست:**
     - بررسی `warehouse_id` در پیام وب‌سوکت و نادیده گرفتن رویدادهای سایر انبارها.

* **فایل‌های تحت تغییر:**
  - `frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts`
  - `frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html`

---

### 🔹 فاز ۲: اصلاح منطق مغایرت و ارجاع در سرور (`Backend Discrepancy & Reject Logic`)
تمرکز این فاز بر دقت محاسبات مالی/موجودی و ایمن‌سازی جریان برگشت کالا است.

* **تغییرات مورد نظر:**
  1. **استانداردسازی مقایسه مغایرت با `Decimal`:**
     - جایگزینی مقایسه رشته‌ای خام `if str(task.counted_balance) != str(item.bal4miv):` با تبدیل اعشاری ایمن `Decimal` در متد `bulk_manager_approve`.
  2. **ایمن‌سازی ارجاع مدیر (`Manager Reject Fallback`):**
     - در متدهای `manager_reject` و `bulk_manager_reject`، در صورت حذف یا نامعتبر بودن سرپرست تخصیص‌یافته، وظیفه به صورت ایمن به استخر یا مستقیماً به شمارشگر منتقل شود تا در کارتابل معلق نماند.

* **فایل‌های تحت تغییر:**
  - `backend/inventory/views.py`

---

### 🔹 فاز ۳: بهینه‌سازی کارایی و رندرینگ کارتابل شمارشگر (`Counter Dashboard Optimization`)
تمرکز این فاز بر افزایش سرعت، روانی اسکرول و مدیریت پایدار فیلدهای پویا است.

* **تغییرات مورد نظر:**
  1. **بهینه‌سازی DOM و رندرینگ:**
     - تثبیت `trackByTaskId` و بهینه‌سازی رندر المان‌های پیچیده فیلدهای پویا در حالت بسته‌بودن کارت‌ها.
  2. **مدیریت تداخل زمانی فیلدهای پویا در آفلاین:**
     - اعتبارسنجی ارسال `base_updated_at` در صف همگام‌سازی فیلدهای پویای کالا برای جلوگیری از بازنویسی اشتباه داده‌ها در نوسانات شبکه.

* **فایل‌های تحت تغییر:**
  - `frontend/src/app/components/counter/counter-dashboard/counter-dashboard.ts`
  - `frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html`

---

### 🔹 فاز ۴: تکمیل داشبورد رهگیری و تفکیک کسری و مازاد (`Count Tracking & Discrepancy KPIs`)
تمرکز این فاز بر گزارش‌دهی مدیریتی و مانیتورینگ دقیق عملیات است.

* **تغییرات مورد نظر:**
  1. **تفکیک شاخص‌های کسری و مازاد:**
     - محاسبه و نمایش جداگانه `statShortage` (کسری فیزیکی) و `statSurplus` (مازاد فیزیکی) در مینی‌داشبورد بالای صفحه.
  2. **فیلتر سریع کلیکی روی کارت‌های آمار:**
     - امکان کلیک روی کارت کسری یا مازاد برای فیلتر آنی جدول ردیابی.

* **فایل‌های تحت تغییر:**
  - `frontend/src/app/components/count-tracking/count-tracking.ts`
  - `frontend/src/app/components/count-tracking/count-tracking.html`

---

## 🧪 برنامه تست و اعتبارسنجی (Verification Plan)

### تست‌های خودکار (Automated Checks):
- اجرای تست بیلد فرانت‌اند:
  ```powershell
  cd "frontend"
  npx ng build --configuration=development --no-progress
  ```
- بررسی خطاهای پایتون و تست‌های بک‌اند جنگو:
  ```powershell
  cd "backend"
  python manage.py check
  ```

</div>
