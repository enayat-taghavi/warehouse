import { Injectable, inject, signal, NgZone, OnDestroy } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { Subscription, interval, fromEvent } from 'rxjs';
import { ToastService } from '../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { NetworkStatusService } from './network-status.service';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService implements OnDestroy {
  private swUpdate = inject(SwUpdate);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  private ngZone = inject(NgZone);

  /** نشان‌دهنده وضعیت در حال استعلام دستی نسخه */
  public isChecking = signal(false);

  /** پرچم جلوگیری از باز شدن همزمان مدال تایید در جریان بروزرسانی دستی (حل Race Condition) */
  private isManualUpdateInProgress = false;

  private subs: Subscription[] = [];
  private periodicTimer: any = null;

  /**
   * مقداردهی اولیه و رجیستر کردن شنوندگان سراسری PWA
   */
  public init(): void {
    if (!this.swUpdate.isEnabled) {
      console.log('[PwaUpdate] سرویس‌ورکر فعال نیست (محیط توسعه یا مرورگر پشتیبانی نمی‌کند).');
      return;
    }

    // ۱. گوش دادن به رویداد آماده بودن نسخه جدید برای اعلان به کاربر
    const versionSub = this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(async (evt) => {
        // اگر بروزرسانی دستی در جریان است، مدال مزاحم را باز نکن (چون خودش هندل می‌کند)
        if (this.isManualUpdateInProgress) {
          return;
        }

        const confirmed = await this.confirmDialog.open({
          title: 'بروزرسانی برنامه',
          message: 'نسخه جدیدی از سامانه دریافت شده است. آیا مایلید برنامه برای اعمال تغییرات هم‌اکنون نوسازی شود؟',
          confirmText: 'بروزرسانی',
          cancelText: 'بعداً',
          type: 'info'
        });

        if (confirmed) {
          try {
            await this.swUpdate.activateUpdate();
            window.location.reload();
          } catch (err) {
            console.error('[PwaUpdate] خطا در فعال‌سازی نسخه:', err);
            window.location.reload();
          }
        }
      });
    this.subs.push(versionSub);

    // ۲. مدیریت وضعیت غیرقابل بازیابی (Unrecoverable State) جهت جلوگیری از صفحه سفید مرگ
    const unrecSub = this.swUpdate.unrecoverable.subscribe(async (evt) => {
      console.error('[PwaUpdate] 🚨 وضعیت غیرقابل بازیابی کش شناسایی شد:', evt.reason);
      const confirmed = await this.confirmDialog.open({
        title: 'نیاز به نوسازی کش سامانه',
        message: 'به دلیل انتشار نسخه جدید سرور، کش محلی با اختلال مواجه شده است. لطفاً برای عملکرد صحیح، کش برنامه را بازنشانی فرمایید.',
        confirmText: 'بازنشانی و بارگذاری مجدد',
        type: 'danger'
      });

      if (confirmed) {
        await this.hardResetCache();
      }
    });
    this.subs.push(unrecSub);

    // ۳. بررسی دوره‌ای هر یک ساعت (با تایمر خارج از زون جهت جلوگیری از مسدود شدن پایداری انگولار)
    this.ngZone.runOutsideAngular(() => {
      // بررسی اولیه پس از ۱۰ ثانیه از لود اولیه برنامه
      setTimeout(() => this.backgroundCheck(), 10000);

      // استعلام پس‌زمینه هر ۶۰ دقیقه
      this.periodicTimer = setInterval(() => {
        this.backgroundCheck();
      }, 60 * 60 * 1000);
    });

    // ۴. بررسی استعلام به هنگام برگشت آنلاین بودن مرورگر
    if (typeof window !== 'undefined') {
      const onlineSub = fromEvent(window, 'online').subscribe(() => {
        this.backgroundCheck();
      });
      this.subs.push(onlineSub);
    }
  }

  /**
   * استعلام آرام در پس‌زمینه بدون ایجاد مزاحمت برای کاربر
   */
  private async backgroundCheck(): Promise<void> {
    try {
      if (!this.swUpdate.isEnabled) return;
      const net = NetworkStatusService.getInstance();
      if (net.isBrowserOnline && !net.isServerUnreachable) {
        await this.swUpdate.checkForUpdate();
      }
    } catch (err) {
      console.warn('[PwaUpdate] Background check failed:', err);
    }
  }

  /**
   * استعلام و اعمال دستی آخرین نسخه برنامه (فراخوانی از منوی کاربری)
   */
  public async checkAndApplyManualUpdate(options?: { pendingCount?: number }): Promise<void> {
    if (this.isChecking()) {
      return;
    }

    const network = NetworkStatusService.getInstance();
    if (!network.isBrowserOnline || network.isServerUnreachable) {
      this.toast.show(
        'warning',
        'سامانه در حالت آفلاین / عدم دسترسی به سرور است. امکان دریافت بروزرسانی در این وضعیت وجود ندارد.'
      );
      return;
    }

    // هشدار در صورت وجود رکوردهای آفلاین ذخیره‌نشده برای پیشگیری از تخریب اطلاعات
    if (options?.pendingCount && options.pendingCount > 0) {
      const proceed = await this.confirmDialog.open({
        title: 'تغییرات همگام‌سازی‌نشده آفلاین',
        message: `شما دارای ${options.pendingCount} رکورد ذخیره‌نشده در صف محلی هستید. رفرش صفحه ممکن است ثبت تغییرات را به تعویق بیندازد. آیا مایل به ادامه بروزرسانی هستید؟`,
        confirmText: 'ادامه و بروزرسانی',
        cancelText: 'انصراف',
        type: 'warning'
      });
      if (!proceed) {
        return;
      }
    }

    // در صورت غیرفعال بودن ورکر (محیط توسعه یا عدم پشتیبانی مرورگر)
    if (!this.swUpdate.isEnabled) {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              this.toast.show('success', 'نسخه جدید در انتظار فعال شد. در حال راه‌اندازی مجدد...');
              setTimeout(() => window.location.reload(), 1000);
              return;
            }
            await reg.update();
          }
        } catch {}
      }
      this.toast.show(
        'info',
        'سرویس‌ورکر در محیط توسعه فعال نیست؛ آخرین نسخه مستقیماً از وب‌سرور بارگذاری می‌شود.'
      );
      return;
    }

    this.isChecking.set(true);
    this.isManualUpdateInProgress = true;

    // سقف زمانی ۱۰ ثانیه جهت پیشگیری از انجماد در شرایط قطعی نیمه‌کاره شبکه (Lie-Fi)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT_SERVER_UNRESPONSIVE')), 10000)
    );

    try {
      this.toast.show('info', 'در حال استعلام آخرین نسخه برنامه از سرور...');

      const updateFound = await Promise.race([
        this.swUpdate.checkForUpdate(),
        timeoutPromise
      ]);

      if (updateFound) {
        this.toast.show('info', 'نسخه جدید دریافت شد! در حال فعال‌سازی دارایی‌ها...');
        try {
          await this.swUpdate.activateUpdate();
        } catch (actErr) {
          console.warn('[PwaUpdate] activateUpdate warning:', actErr);
        }
        this.toast.show('success', 'سامانه با موفقیت به آخرین نسخه بروزرسانی شد. در حال بازنشانی...');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
        return;
      }

      this.toast.show('success', 'شما هم‌اکنون در حال استفاده از آخرین نسخه برنامه هستید.');
    } catch (err: any) {
      console.warn('[PwaUpdate] خطا در بررسی دستی نسخه:', err);
      const errMsg = String(err?.message || err || '');
      const isCloudflareOrNetErr =
        /50[234]|52[0-9]|530|Failed to fetch|NetworkError|TIMEOUT|Failed to update a ServiceWorker|bad HTTP response/i.test(
          errMsg
        );

      if (isCloudflareOrNetErr) {
        network.reportServerUnreachable();
        this.toast.show(
          'warning',
          'سرور اصلی موقتاً در دسترس نیست (کد ۵xx یا خطای شبکه). نسخه محلی برنامه فعال و پایدار است.'
        );
      } else {
        this.toast.show('error', 'عدم امکان بررسی نسخه جدید: ' + (err?.message || 'پاسخی از سرور دریافت نشد'));
      }
    } finally {
      this.isChecking.set(false);
      this.isManualUpdateInProgress = false;
    }
  }

  /**
   * بازنشانی کامل و اجباری کش‌های محلی و رهایی از خطاهای پایدار
   */
  public async hardResetCache(): Promise<void> {
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
      this.toast.show('success', 'کش محلی سامانه پاکسازی شد. در حال بارگذاری مجدد...');
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      this.toast.show('error', 'خطا در پاکسازی کش: ' + (err?.message || 'مشکل ناشناخته'));
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((sub) => sub.unsubscribe());
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
    }
  }
}
