# راهنمای اجرایی بسته ۴: دسترس‌پذیری، کارایی، تایپ‌استریکت و ماژولارسازی (UX & Refactoring)

این سند راهنمای گام‌به‌گام پیاده‌سازی **بسته ۴** از طرح پایدارسازی صفحه تنظیمات سامانه است.

---

## 🎯 اهداف بسته ۴
- ساخت کامپوننت مشترک `<app-toggle-switch>` با پشتیبانی کامل از کیبورد (Space/Enter) و استانداردهای ARIA (ایرادات ۵-۱، ۵-۲).
- رفع ابهام دکمه‌های «نمایش همه / مخفی‌سازی همه» در جداول فیلترشده (ایراد ۵-۳).
- افزودن دیالوگ تأییدیه قبل از بازنشانی کلی فیلدها جهت جلوگیری از پاک شدن ناخواسته نام‌های سفارشی (ایراد ۵-۴).
- اصلاح دانلود بلاب در مرورگرها (مانند فایرفاکس) و تعویق حذف URL (ایراد ۵-۵).
- مدیریت امن فیلدهای رمز عبور با `autocomplete="new-password"` و پاکسازی در خطا (ایراد ۵-۶).
- استانداردسازی مودال بازیابی دیتابیس با ویژگی‌های Focus Trap و لیسنر کلید Escape (ایراد ۵-۷).
- لغو اشتراک خودکار با `takeUntilDestroyed()` و حذف `detectChanges` در `ngOnInit` (ایراد ۵-۸).
- تعریف اینترفیس تایپ‌استریکت `SystemSettingsConfig` و حذف `settings: any` (ایراد ۵-۹).
- تبدیل Getterهای فیلتر جدول به سیگنال‌های محاسباتی `computed()` برای حذف محاسبات مکرر (ایراد ۵-۱۰).
- پاکسازی متغیرهای بلااستفاده و حذف مرجع به فایل استایل خالی `settings.css` (ایراد ۵-۱۱).
- تفکیک فایل ۱۰۱۹ خطی `settings.html` به ۵ زیرکامپوننت ماژولار زیر سقف ۵۰۰ خطی (ایراد ۵-۱۳).
- تکمیل تست‌های واحد فرانت‌اند و بیلد تمیز نهایی بدون خطا (ایراد ۵-۱۲).

---

## 🛠️ گام‌های اجرایی و فایل‌های هدف

### گام ۱: دسترس‌پذیری و ارتقای تعاملی (فاز ۷)
1. **ساخت کامپوننت `<app-toggle-switch>`:**
   - مسیر: `frontend/src/app/shared/components/toggle-switch/toggle-switch.component.ts`.
   - استفاده از تگ پایه `<button type="button" role="switch" [attr.aria-checked]="checked">`.
   - پشتیبانی از کلیدهای Space و Enter و برقراری اتصال دوطرفه `[(checked)]`.
   - جایگزینی تمام چک‌باکس‌های سفارشی در `settings.html` با این کامپوننت.
2. **اصلاحات UX و امنیتی:**
   - در دکمه‌های ریست فیلدها در `settings.ts`، فراخوانی `ConfirmDialog` با نوع `danger` قبل از ریست پیش‌فرض‌ها.
   - اصلاح دانلود فایل بکاپ در `settings.ts:319`:
     ```ts
     const url = window.URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = fileName;
     document.body.appendChild(a);
     a.click();
     setTimeout(() => {
       document.body.removeChild(a);
       window.URL.revokeObjectURL(url);
     }, 100);
     ```
   - افزودن `autocomplete="new-password"` روی فیلدهای ورودی پسورد بکاپ.

### گام ۲: کیفیت کد، بهینه‌سازی و تفکیک کامپوننت (فاز ۸)
1. **مدیریت مموری و تایپ‌استریکت:**
   - تبدیل اشتراک `route.queryParams` به:
     ```ts
     private destroyRef = inject(DestroyRef);
     // ...
     this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(...)
     ```
   - حذف فراخوانی نابهنگام `this.cdr.detectChanges()` از درون اشتراک روت.
   - ایجاد اینترفیس `SystemSettingsConfig` در `frontend/src/app/core/models/system-settings.model.ts` و تایپ‌گذاری دقیق `settings`.
2. **سیگنال‌های محاسباتی:**
   - تبدیل `filteredFieldConfigs` و `filteredDocFieldConfigs` به سیگنال‌های محاسباتی `computed()` وابسته به سیگنال سرچ و دسته‌بندی.
3. **تفکیک قالب `settings.html` به ۵ زیرکامپوننت:**
   - `settings-operations-tab.component.ts` (تنظیمات عمومی، انبارگردانی و اسناد)
   - `settings-label-tab.component.ts` (طراحی لیبل و بارکد)
   - `settings-counter-fields-tab.component.ts` (دسترسی فیلدهای انبارگردان)
   - `settings-doc-fields-tab.component.ts` (دسترسی فیلدهای فرم اسناد مالی)
   - `settings-backup-tab.component.ts` (پشتیبان‌گیری و بازیابی پایگاه‌داده)
   - کامپوننت مادر `Settings` صرفاً نقش هماهنگ‌کننده و تب‌بندی را ایفا خواهد کرد و حجم فایل‌ها به کمتر از ۳۰۰ خط خواهد رسید.

---

## 🧪 دستورهای راستی‌آزمایی و تست

```bash
# تست‌های فرانت‌اند
cd "E:/warehouse project/frontend"
npx ng test --watch=false --browsers=ChromeHeadless

# بیلد نهایی پروژه
npx ng build
```
