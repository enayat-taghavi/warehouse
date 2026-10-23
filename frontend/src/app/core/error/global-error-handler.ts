import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { ToastService } from '../../shared/components/toast/toast.component';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private lastToastTime = 0;

  constructor(private injector: Injector, private zone: NgZone) {}

  handleError(error: any): void {
    // لاگ خطای مدیریت‌نشده در کنسول
    console.error('[GlobalErrorHandler] خطای پیش‌بینی‌نشده در رابط کاربری:', error);

    const now = Date.now();
    // جلوگیری از رگبار توست برای خطاهای مکرر رندرینگ
    if (now - this.lastToastTime > 5000) {
      this.lastToastTime = now;
      this.zone.run(() => {
        try {
          const toast = this.injector.get(ToastService);
          const errorMsg = error?.message || '';
          
          // نادیده‌گیری هشدارهای بی‌خطر مرورگر
          if (!errorMsg.includes('ResizeObserver') && !errorMsg.includes('ExpressionChangedAfterItHasBeenCheckedError')) {
            toast.show('error', 'خطای غیرمنتظره‌ای در نمایش رخ داد. در صورت نیاز صفحه را رفرش فرمایید.');
          }
        } catch {
          // در صورت آماده نبودن سرویس توست، خطایی پرتاب نشود
        }
      });
    }
  }
}
