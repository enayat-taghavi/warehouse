# طرح پیاده‌سازی دکمه بروزرسانی دستی نسخه برنامه (Manual Frontend App Update)

<div dir="rtl" align="right">

این سند به تشریح جزئیات فنی و مراحل پیاده‌سازی دکمه بروزرسانی دستی برنامه (PWA) در منوی کاربری هدر می‌پردازد تا توسعه‌دهنده و کاربران بتوانند بدون نیاز به انتظار برای تایمرهای دوره‌ای انگولار، آخرین تغییرات بیلد شده فرانت‌اند را با یک لمس روی گوشی دریافت و فعال کنند.

---

## ۱. مرور نیازمندی و اهداف

> [!NOTE]
> در معماری فعلی، سرویس‌ورکر انگولار نسخه‌های استاتیک را در حافظه گوشی کش می‌کند و بررسی نسخه جدید را در فواصل طولانی انجام می‌دهد. با اضافه کردن این دکمه در منوی کاربری:
> ۱. استعلام فوری نسخه از سرور انجام می‌شود (`swUpdate.checkForUpdate()`).
> ۲. نسخه جدید بلافاصله اکتیو شده (`swUpdate.activateUpdate()`) و صفحه ریفرش می‌گردد.
> ۳. بازخورد متنی شفاف (پیام‌های Toast) در طول فرآیند به کاربر نمایش داده می‌شود.

---

## ۲. تغییرات پیشنهادی

| فایل | بخش تغییر | هدف تغییر |
| :--- | :--- | :--- |
| [`layout.ts`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts) | منطق کامپوننت | تزریق `SwUpdate` و افزودن متد `onManualAppUpdate()` همراه با کنترل حالت در حال بارگذاری |
| [`layout.html`](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html) | منوی کاربری (خطوط ۱۰۰ تا ۱۱۵) | قرار دادن دکمه «بروزرسانی نسخه برنامه» با آیکون بروزرسانی و استایل هماهنگ با قالب |

---

## ۳. جزئیات فنی پیاده‌سازی

### الف) منطق در `layout.ts`:
```typescript
import { SwUpdate } from '@angular/service-worker';

// در کلاس Layout:
private swUpdate = inject(SwUpdate);
isCheckingAppUpdate = false;

async onManualAppUpdate() {
  if (this.isCheckingAppUpdate) return;
  this.isCheckingAppUpdate = true;
  this.cdr.detectChanges();

  try {
    this.toast.show('info', 'در حال استعلام آخرین نسخه از سرور...');
    
    if (this.swUpdate.isEnabled) {
      const updateFound = await this.swUpdate.checkForUpdate();
      if (updateFound) {
        this.toast.show('success', 'نسخه جدید دریافت شد! در حال اعمال...');
        await this.swUpdate.activateUpdate();
        setTimeout(() => window.location.reload(), 600);
        return;
      }
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.update();
      }
    }

    this.toast.show('success', 'برنامه به آخرین نسخه بروزرسانی شد.');
    setTimeout(() => window.location.reload(), 600);
  } catch (err: any) {
    console.error('App update failed', err);
    this.toast.show('error', 'خطا در بررسی بروزرسانی: ' + (err?.message || 'سرور در دسترس نیست'));
    setTimeout(() => window.location.reload(), 1000);
  } finally {
    this.isCheckingAppUpdate = false;
    this.cdr.detectChanges();
  }
}
```

### ب) ساختار بصری در منوی کاربری (`layout.html`):
```html
<button (click)="onManualAppUpdate(); closeUserMenu()" [disabled]="isCheckingAppUpdate" class="w-full text-right py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 text-emerald-600 hover:bg-emerald-50 active:scale-95 cursor-pointer">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" [class.animate-spin]="isCheckingAppUpdate">
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
  <span class="flex-1">بروزرسانی نسخه برنامه</span>
  <span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold font-mono">PWA</span>
</button>
```

---

## ۴. برنامه راستی‌آزمایی و تست

1. **بررسی عدم خطای کامپایل فرانت‌اند:** اجرای چک بیلد و ساختار تایپ‌اسکریپت بدون اختلال در سرویس‌های دیگر.
2. **بررسی واکنش‌گرایی در موبایل و دسکتاپ:** اطمینان از قرارگیری دقیق و زیبای دکمه داخل پاپ‌آپ منوی کاربری.
3. **بررسی رفتار دکمه:** لمس دکمه، نمایش پیام در حال بررسی، استعلام از سرویس‌ورکر و ریلود تمیز صفحه.

</div>
