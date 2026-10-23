<div dir="rtl" align="right">

# 📋 طرح پیاده‌سازی اصلاحات صفحه ورود و اعلان‌ها (Login & Toast Changes)

این طرح شامل تغییرات ظاهری و منطقی در صفحه ورود کاربران و همچنین بهبود موقعیت بصری اعلان‌ها (Toast) در سیستم می‌باشد. در سناریوی فراموشی رمز عبور، راهکار ساده نمایش مودال "تماس با مدیریت" پیاده‌سازی می‌شود.

---

## 👥 بررسی نیاز به بازبینی کاربر (User Review Required)

> [!IMPORTANT]
> <div dir="rtl" align="right">
> این طرح آماده بررسی است. لطفاً جزئیات تغییرات و سناریوی فراموشی رمز را بررسی کرده و جهت شروع پیاده‌سازی کلمه **"شروع"** یا **"تایید"** را تایپ نمایید. تا زمان تایید شما، هیچ تغییری در کدهای منبع داده نخواهد شد.
> </div>

---

## 🛠️ تغییرات پیشنهادی (Proposed Changes)

### ۱. کامپوننت ورود (Login Component)

#### [MODIFY] [login.ts](file:///e:/warehouse%20project/frontend/src/app/components/login/login.ts)
- افزودن متغیر کنترل‌کننده مودال فراموشی رمز: `showForgotModal = false;`
- افزودن متد بازیابی رمز: `showForgotPasswordDialog(event: Event)` برای جلوگیری از رفتار پیش‌فرض لینک و باز کردن مودال.
- ترجمه پیام خطای سرور در بلاک `error`:
  ```typescript
  const detail = err?.error?.detail || err?.detail;
  if (detail === 'No active account found with the given credentials') {
    this.loginErrorMessage = 'نام کاربری یا رمز عبور اشتباه است.';
  } else {
    this.loginErrorMessage = detail || 'نام کاربری یا رمز عبور نادرست است.';
  }
  ```

#### [MODIFY] [login.html](file:///e:/warehouse%20project/frontend/src/app/components/login/login.html)
- تغییر متن هدر از "سامانه یکپارچه مدیریت انبارگردانی شیراز" به **"سامانه یکپارچه مدیریت انبارگردانی فارس عالیش"** در خط ۲۳.
- تغییر متن فوتر از "سامان تقوی سوق · مدیریت پروژه انبارگردانی شیراز" به **"شرکت فارس عالیش"** در خط ۹۱.
- حذف تگ `div` حاوی نام کاربری و رمزهای تستی (خطوط ۸۰ تا ۸۷).
- تغییر تگ فراموشی رمز عبور جهت باز کردن مودال:
  ```html
  <a href="#" (click)="showForgotPasswordDialog($event)" class="text-indigo-400 hover:text-indigo-300 transition-colors">فراموشی رمز عبور</a>
  ```
- اضافه کردن بخش مودال زیبا در انتهای فایل (طراحی شیشه‌ای / Glassmorphic سازگار با تم تیره صفحه ورود):
  ```html
  <!-- فراموشی رمز عبور مودال -->
  <div *ngIf="showForgotModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div class="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl relative">
      <div class="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </div>
      <h3 class="text-white text-base font-bold mb-2">بازیابی رمز عبور</h3>
      <p class="text-slate-300 text-xs leading-relaxed mb-6">جهت بازیابی یا تغییر رمز عبور خود، لطفا با مدیر سیستم یا پشتیبانی فناوری اطلاعات تماس بگیرید.</p>
      <button (click)="showForgotModal = false" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors">متوجه شدم</button>
    </div>
  </div>
  ```

---

### ۲. کامپوننت اعلان‌ها (Toast Component)

#### [MODIFY] [toast.component.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/toast/toast.component.ts)
- تغییر کلاس موقعیت‌دهی کانتینر توست (خط ۴۷) به صورت زیر جهت قرارگیری در پایین-وسط صفحه:
  ```html
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse gap-2 max-w-sm w-full px-4" id="toast-container">
  ```
- اصلاح انیمیشن ورودی (خطوط ۷۲ تا ۷۵) برای هماهنگی با وسط‌چین بودن عنصر:
  ```css
  @keyframes toastSlideIn {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  ```

---

## 🧪 برنامه تأیید و تست (Verification Plan)

### تست دستی
1. وارد کردن مشخصات اشتباه و بررسی نمایش خطای فارسی.
2. کلیک روی دکمه "فراموشی رمز عبور" و اطمینان از باز شدن مودال تماس با پشتیبانی و دکمه بستن آن.
3. تایید عدم وجود باکس تستی اکانت‌ها زیر فرم ورود.
4. تایید صحت تغییر نام‌های هدر و فوتر به شرکت فارس عالیش.
5. تلاش برای ورود موفق و تایید نمایش Toast در پایین-وسط صفحه با افکت انیمیشن مناسب.

</div>
