<div dir="rtl" align="right">

# 📑 طرح فنی هماهنگ‌سازی تجربه لمسی (Long-Press)، نمایش نام انبار و لغو سریع پیش‌نویس

این طرح بر اساس انتخاب گزینه‌های ۱، ۲ و ۳ برای هماهنگ‌سازی کامل تجربه کاربری بین دو کارتابل تدوین گردیده است.

---

## 🎯 اهداف طرح:
1. **کارتابل انبارگردان:** افزودن نام انبار (`warehouse_name`) به سطر اطلاعات و لوکیشن کارت‌های تسک دقیقاً مانند کارتابل مالی.
2. **کارتابل مالی:** پیاده‌سازی سیستم نگه داشتن دست (Long-Press لمسی) با فیدبک لرزشی و جلوگیری از لغو حین اسکرول + رفتار هوشمند کلیک در حالت انتخاب چندگانه.
3. **کارتابل مالی:** تعبیه دکمه لغو سریع پیش‌نویس (Revert Icon) روی کارت‌های مالی برای پاکسازی و بازگردانی سریع کالا به وضعیت پیشین بدون ورود به فرم جزئیات.

---

## 🏗️ جزئیات تغییرات پیشنهادی

### 📦 ۱. کارتابل انبارگردان (Counter Dashboard)
- **فایل هدف:** [counter-dashboard.html](file:///e:/warehouse%20project/frontend/src/app/components/counter/counter-dashboard/counter-dashboard.html#L477)
- **تغییر:**
  نمایش نام انبار در سطر لوکیشن کارت‌های تسک:
  ```html
  <div class="flex items-center gap-2 mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-400 shrink-0">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
    <span class="font-bold text-slate-700 truncate">
      انبار: {{ task.item_details?.warehouse_name || 'نامشخص' }}
      <span *ngIf="task.item_details?.new_location || task.item_details?.old_location" class="font-normal text-slate-400 mr-1">| لوکیشن: {{ task.item_details?.new_location || task.item_details?.old_location }}</span>
    </span>
  </div>
  ```

---

### 📑 ۲. کارتابل مالی (Financial Cartable / Customs)
- **فایل‌های هدف:** [customs.ts](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.ts) و [customs.html](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html)
- **تغییرات:**
  1. پیاده‌سازی متغیرها و متدهای Long-Press در `customs.ts`:
     - `onTaskPressStart`, `onTaskPressMove`, `onTaskPressEnd`, `onTaskClick`
     - با تایم‌آوت ۴۵۰ms و لرزش ۵۰ms ویبراتور لمسی موبایل (`navigator.vibrate(50)`).
  2. اتصال رویدادهای `(pointerdown)`, `(pointerup)`, `(pointercancel)`, `(pointerleave)`, `(pointermove)` و `(click)` روی کارت‌های [customs.html](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html#L407).
  3. پیاده‌سازی متد `revertTaskStatus(task: DocTask, event?: Event)` در `customs.ts` همراه با دیالوگ تاییدیه (`ConfirmDialogService`) برای پاکسازی پیش‌نویس‌های ذخیره‌شده و بازگشت به وضعیت اصلی.
  4. افزودن دکمه لغو سریع پیش‌نویس (Revert Icon) در کنار بج وضعیت در [customs.html](file:///e:/warehouse%20project/frontend/src/app/components/customs/customs.html#L435) برای کارت‌هایی که دارای داده پیش‌نویس هستند.

---

## 🧪 برنامه راستی‌آزمایی (Verification Plan)
- اجرای `npm run build` برای تضمین عدم وجود هرگونه خطای تایپ‌اسکریپت و قالب فرانت‌اند.
- اجرای تست‌های بک‌اند `python manage.py test inventory.tests_docs --keepdb`.

</div>
