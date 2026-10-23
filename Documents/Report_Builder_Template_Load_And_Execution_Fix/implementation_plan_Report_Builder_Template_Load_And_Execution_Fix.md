<div dir="rtl" align="right">

# طرح جامع رفع خطای بارگذاری و اجرای قالب‌های گزارش‌ساز پویا

این طرح برای رفع ایراد مشاهده‌شده در بخش ۱۱ تست مرورگر (خطای بارگذاری و اجرای قالب) و ارتقای مدیریت خطاهای سرور و کلاینت در گزارش‌ساز تدوین شده است.

---

## ۱. تحلیل و ریشه‌یابی مشکل (Root Cause Analysis)

1. **مدیریت خطای عمومی در استور فرانت‌اند (`msg(e)`)**:
   متد `msg(e)` در `report-store.ts` تنها فیلدهای `e.error.error` و `e.error.detail` را بررسی می‌کرد. اگر سرور آبجکتی از اعتبارسنجی‌ها مانند `{"fields": [...]}` یا رشته خطای سفارشی برمی‌گرداند، این متد پیام پیش‌فرض و مبهم «خطای غیرمنتظره در اجرای گزارش.» را نشان می‌داد.
2. **عدم اجرای خودکار و روان پس از بارگذاری قالب (`loadTemplate`)**:
   در متد `loadTemplate` در `reports.ts`، پس از بارگذاری موفق تنظیمات قالب، پیام موفقیت‌آمیز به کاربر نمایش داده نمی‌شد و گزارش به صورت خودکار اجرا نمی‌شد تا کاربر بلافاصله خروجی قالب را ببیند.
3. **پوشش جامع‌تر استثناهای غیرمنتظره در بکند (`RunReportView` & `ExportReportView`)**:
   در `views.py`، در صورت وقوع استثناهای پیش‌بینی‌نشده، پاسخ ۵۰۰ خام بازگردانده می‌شد. با کپسوله‌سازی کلیه خطاها در قالب پاسخ استاندارد JSON (`{'error': ...}`) با کد ۴۰۰، کلاینت همواره پیام شفاف و دقیق دریافت می‌کند.

---

## ۲. تغییرات پیشنهادی به تفکیک فایل‌ها

### 🔹 لایه بکند (Backend)

#### [MODIFY] [`views.py`](file:///e:/warehouse%20project/backend/reports/views.py)
- افزودن `try...except Exception` به `RunReportView` و `ExportReportView` و `EntityFieldsView` جهت ثبت لاگ در سرور و بازگرداندن پاسخ ۴۰۰ تمیز با ساختار `{'error': '...'}` به جای خطای ۵۰۰ خام.

---

### 🔹 لایه فرانت‌اند (Frontend)

#### [MODIFY] [`report-store.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/report-store.ts)
- ارتقای متد `msg(e)` برای استخراج کامل تمام فرمت‌های خطای سرور (شامل `error`, `detail`, `message`, دیکشنری اعتبارسنجی فیلدها و رشته‌های ساده) و نمایش دقیق پیام فارسی.

#### [MODIFY] [`reports.ts`](file:///e:/warehouse%20project/frontend/src/app/components/reports/reports.ts)
- در `loadTemplate(t)`:
  - نمایش پیام Toast موفقیت‌آمیز: «قالب «نام» با موفقیت بارگذاری شد.»
  - اجرای خودکار و ایمن گزارش پس از بارگذاری با تاخیر کوتاه (Auto-Run) با اعتبارسنجی پیش‌شرط‌ها.

---

## ۳. برنامه راستی‌آزمایی و تست (Verification Plan)

### ۱. تست‌های خودکار بکند (Automated Backend Tests)
```bash
cd "backend"
venv\Scripts\python.exe manage.py test reports
```

### ۲. اعتبارسنجی کامپایل و بیلد فرانت‌اند (Frontend Build Check)
```bash
cd "frontend"
npm run build
```

### ۳. تست سریع در مرورگر (Browser Quick Verification)
- ورود به `https://app.farsalish.ir`
- مراجعه به صفحه گزارش‌ساز (`/reports`)
- تست بارگذاری قالب ذخیره‌شده «My Custom Template» و بررسی اجرای بدون خطای آن
- ثبت اسکرین‌شات و تایید صحت کامل عملکرد

</div>
