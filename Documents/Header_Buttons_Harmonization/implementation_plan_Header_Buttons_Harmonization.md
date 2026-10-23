<div dir="rtl" align="right">

# طرح هماهنگ‌سازی و بهینه‌سازی دکمه‌های هدر و فیلترها (Header & Filter Optimization)

این طرح بر اساس بازخوردهای جدید به‌روزرسانی شده و شامل ۳ محور کلیدی زیر است:

---

## 🎯 محورهای اجرایی (Key Execution Areas)

### ۱. تبدیل دکمه «نمایش پایان‌یافته» به دکمه آیکونی مربعی «تأیید نهایی»
* تغییر نام و مفهوم «پایان‌یافته» به «تأیید نهایی» (Final Approved).
* تبدیل دکمه متنی به دکمه آیکونی مربعی (`p-2 rounded-xl border transition-all shadow-sm`) هماهنگ با سایر دکمه‌های هدر.
* تولتیپ‌های پویا: «مخفی کردن اقلام تأیید نهایی» / «نمایش اقلام تأیید نهایی».
* استایل فعال بنفش (`bg-indigo-50 text-indigo-700 border-indigo-200`) و غیرفعال خنثی (`bg-slate-50 text-slate-600 border-slate-200`).

### ۲. لاجیک بازگشت هوشمند وضعیت نمایش تأیید نهایی (Smart State Restoration)
* هنگام کلیک کاربر روی کارت شاخص «تأیید نهایی» (`setDiscrepancyFilter('approved')`):
  - وضعیت قبلی نمایش (`savedShowCompletedState`) ذخیره می‌شود.
  - حتی اگر نمایش تأیید نهایی خاموش بود، به صورت خودکار روشن می‌شود تا کاربر اقلام تاییدشده را ببیند.
* با خروج از تب تأیید نهایی و انتخاب سایر فیلترها (مانند «کل اقلام»، «شمرده شده»، «مغایرت‌ها» و...):
  - وضعیت `showCompleted` دقیقاً به حالت قبلی خود (`savedShowCompletedState`) بازمی‌گردد.

### ۳. اصلاح کامل نمایش تقویم جلالی در فیلتر تاریخ جدول (Persian Datepicker Fix)
* رفع مشکل کات شدن و اسکرول نامناسب پاپ‌آپ تقویم داخل دراپ‌داون جدول (`overflow-visible` و عرض استاندارد `w-64`).
* اعمال استایل‌های سراسری مدرن برای `.datepicker-outer-container` در `styles.css` (سایه نرم، پدینگ مناسب، فونت فارسی یکدست و `z-index: 9999`).

---

## 📑 فایل‌های هدف (Target Files)

| فایل | نوع تغییر | شرح تغییرات |
|---|:---:|---|
| [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts) | اصلاح کد | افزودن متغیر `savedShowCompletedState` و لاجیک بازگشت هوشمند وضعیت در `setDiscrepancyFilter` |
| [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html) | اصلاح قالب | تبدیل دکمه وضعیت به آیکون مربعی «تأیید نهایی» با وکتور SVG و تولتیپ‌های اختصاصی |
| [data-table.component.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/data-table/data-table.component.ts) | اصلاح قالب | بهینه‌سازی دراپ‌داون فیلتر تاریخ به `w-64 overflow-visible z-[70]` |
| [styles.css](file:///e:/warehouse%20project/frontend/src/styles.css) | اصلاح استایل | تعریف استایل‌های جامع و زیبای تقویم جلالی `ng-persian-datepicker` در سطح سراسری |

---

## 🧪 طرح اعتبارسنجی (Verification Plan)

1. **ارزیابی ایجنت مستقل نگهبان:** اجرای اسکریپت بازرسی و اخذ تاییدیه ۱۰۰٪.
2. **بررسی بیلد فرانت‌اند:** اجرای `npm run build` بدون هیچ خطای کامپایل.
3. **تست زنده مرورگر:**
   - تست کلیک روی دکمه آیکونی تأیید نهایی در هدر و مشاهده تغییر وضعیت و آیکون.
   - تست ورود به کارت فیلتر «تأیید نهایی» و خروج از آن و بررسی بازگشت هوشمند به حالت اولیه.
   - تست باز کردن فیلتر تاریخ در جدول و باز شدن روان و بدون برش تقویم جلالی.

</div>
