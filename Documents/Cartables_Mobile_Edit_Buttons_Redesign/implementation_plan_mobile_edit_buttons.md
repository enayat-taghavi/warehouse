# <div dir="rtl" align="right">طرح اجرایی تفکیک کامل دکمه‌های صفحه ویرایش کالا (گزینه ۱)</div>

<div dir="rtl" align="right">

این سند شامل طرح دقیق، فازبندی‌شده و خط‌به‌خط پیاده‌سازی **گزینه ۱ (تفکیک کامل دسکتاپ و موبایل)** جهت حذف قطعی تکرار دکمه‌ها در دو کارتابل **انبارگردان** و **مالی** به همراه مراحل تست و اعتبارسنجی است.

---

### ۱. معماری و منطق تفکیک (`Responsive Isolation Architecture`)

در این طرح، در هر دستگاه دقیقاً **یک نسخه** از دکمه‌ها فعال و قابل مشاهده خواهد بود:

- **در موبایل (عرض صفحه کمتر از ۷۶۸ پیکسل / `< md`):**
  - بلوک دکمه‌های انتهای فرم با کلاس `hidden md:flex` مخفی می‌شود.
  - کاربر منحصراً **نوار شناور چسبان تک‌ردیفه در پایین صفحه** (`md:hidden`) را مشاهده می‌کند.
- **در دسکتاپ (عرض صفحه ۷۶۸ پیکسل و بیشتر / `≥ md`):**
  - نوار شناور پایین با کلاس `md:hidden` کاملاً مخفی می‌شود.
  - کاربر منحصراً **بلوک دکمه‌های کامل در انتهای فرم** (`hidden md:flex`) را مشاهده می‌کند.

---

### ۲. جزئیات دقیق خطوط کد و تغییرات فازبندی‌شده

#### فاز ۱: اصلاح کارتابل انبارگردان ([`counter-dashboard.html`](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html))

1. **تغییر کلاس کانتینر دکمه‌های فعال (خط ۷۹۴):**
```diff
- <div *ngIf="!isReadOnly(selectedTask)" class="mt-8 pt-5 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2.5">
+ <div *ngIf="!isReadOnly(selectedTask)" class="hidden md:flex mt-8 pt-5 border-t border-slate-200 flex-col sm:flex-row items-center gap-2.5">
```

2. **تغییر کلاس کانتینر دکمه حالت فقط‌خواندنی (خط ۸۳۸):**
```diff
- <div *ngIf="isReadOnly(selectedTask)" class="mt-8 pt-5 border-t border-slate-200">
+ <div *ngIf="isReadOnly(selectedTask)" class="hidden md:block mt-8 pt-5 border-t border-slate-200">
```

---

#### فاز ۲: اصلاح کارتابل مالی ([`customs.html`](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html))

1. **تغییر کلاس کانتینر دکمه‌های فعال (خط ۸۳۸):**
```diff
- <div *ngIf="!isReadOnly(selectedTask)" class="mt-8 pt-5 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2.5">
+ <div *ngIf="!isReadOnly(selectedTask)" class="hidden md:flex mt-8 pt-5 border-t border-slate-200 flex-col sm:flex-row items-center gap-2.5">
```

2. **تغییر کلاس کانتینر دکمه حالت فقط‌خواندنی (خط ۸۸۲):**
```diff
- <div *ngIf="isReadOnly(selectedTask)" class="mt-8 pt-5 border-t border-slate-200">
+ <div *ngIf="isReadOnly(selectedTask)" class="hidden md:block mt-8 pt-5 border-t border-slate-200">
```

---

### ۳. بررسی عدم خرابی و ایزولاسیون سایر بلاک‌ها (`Safety Audit`)

> [!IMPORTANT]
> - تغییرات فوق صرفاً شامل افزودن کلاس‌های ریسپانسیو Tailwind (`hidden md:flex` و `hidden md:block`) به کانتینر دکمه‌های انتهای فرم است.
> - هیچ تگ HTML دیگری، هیچ ایونت کلیکی، هیچ استایل ورودی، و هیچ بلاک لاجیک یا استخری دستکاری نخواهد شد.
> - ساختار نوار شناور پایینی دست‌نخورده باقی می‌ماند و کدهای تایپ‌اسکریپت و سرویس‌ها ۱۰۰٪ ایزوله هستند.

---

### ۴. برنامه تست و اعتبارسنجی پس از تغییر (`Verification & Quality Gate`)

1. **تست کامپایل Angular:**
   - اجرای `npm run build` در پوشه فرانت‌اند و بررسی `Exit Code 0` بدون هیچ‌گونه خطای سینتکس یا تایپ.
2. **بررسی تغییرات با `git diff`:**
   - استعلام دقیق خطوط تغییر یافته برای حصول اطمینان از اینکه دقیقاً ۴ خط تغییر کرده و هیچ کاراکتر اضافه‌ای در فایل‌ها جابجا نشده است.
3. **تست رفتاری در ویوپورت‌های مختلف:**
   - **ویوپورت موبایل (عرض ۳۷۵px تا ۶۴۰px):** عدم وجود دکمه‌های تکراری در انتهای فرم، اسکرول آزادانه فیلدها و وجود فقط نوار تک‌ردیفه پایین.
   - **ویوپورت دسکتاپ (عرض ۱۰۲۴px به بالا):** عدم وجود نوار شناور پایین و نمایش فقط دکمه‌های انتهای فرم.

</div>
