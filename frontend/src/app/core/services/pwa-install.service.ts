import { Injectable, signal, computed, inject } from '@angular/core';
import { ToastService } from '../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class PwaInstallService {
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);

  /** نگهداری رویداد استاندارد مرورگر برای نصب برنامه */
  public deferredPrompt = signal<any>(null);

  /** آیا برنامه هم‌اکنون در محیط نصب‌شده (Standalone) اجرا شده است؟ */
  public isInstalled = signal<boolean>(false);

  /** آیا دستگاه کاربر سیستم‌عامل iOS (آیفون / آیپد) است؟ */
  public isIos = signal<boolean>(false);

  /** آیا هم‌اکنون امکان نصب مستقیم با کلیک وجود دارد؟ */
  public canInstall = computed(() => !!this.deferredPrompt());

  constructor() {
    this.initPwaListeners();
  }

  /**
   * راه‌اندازی و ثبت شنوندگان رویدادهای نصب PWA در پنجره مرورگر
   */
  public initPwaListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // ۱. بررسی وضعیت اجرای برنامه در پنجره مجزای نصب‌شده (Standalone Mode)
    const isStandalone =
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as any)?.standalone === true ||
      (typeof document !== 'undefined' && document.referrer?.includes('android-app://'));

    this.isInstalled.set(Boolean(isStandalone));

    // ۲. تشخیص سیستم‌عامل iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    this.isIos.set(isIosDevice);

    // ۳. گوش دادن به رویداد قبل از نصب مرورگر
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt.set(e);
    });

    // ۴. گوش دادن به اتمام نصب برنامه
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt.set(null);
      this.isInstalled.set(true);
      this.toast.show('success', 'سامانه انبار و حسابداری با موفقیت روی دستگاه شما نصب گردید.');
    });
  }

  /**
   * درخواست نصب برنامه با فراخوانی متد مرورگر یا نمایش راهنمای iOS
   */
  public async installApp(): Promise<void> {
    if (this.isInstalled()) {
      this.toast.show('info', 'سامانه هم‌اکنون به صورت برنامه روی دستگاه شما نصب و در حال اجرا است.');
      return;
    }

    const promptEvent = this.deferredPrompt();
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choiceResult = await promptEvent.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          this.toast.show('success', 'درخواست نصب برنامه تایید گردید.');
        } else {
          this.toast.show('info', 'نصب برنامه توسط شما لغو شد.');
        }
      } catch (err) {
        console.warn('[PwaInstallService] خطا در اجرای prompt نصب:', err);
      } finally {
        this.deferredPrompt.set(null);
      }
      return;
    }

    // اگر در آیفون/آیپد است
    if (this.isIos()) {
      await this.showIosInstallGuide();
      return;
    }

    // در صورتی که رویداد مرورگر هنوز فعال نشده باشد (مثلاً مرورگرهای دسکتاپ غیرکرومی یا شرایط کش)
    await this.confirmDialog.open({
      title: 'نصب برنامه روی دستگاه',
      message:
        'برای نصب سامانه روی کامپیوتر یا موبایل:\n\n' +
        '۱. در مرورگرهای کروم یا اج (کامپیوتر)، روی آیکون نصب (Install App ⊕) در سمت راست نوار آدرس کلیک کنید.\n' +
        '۲. در مرورگرهای اندروید، از منوی سه نقطه مرورگر گزینه «نصب برنامه» یا «Add to Home screen» را انتخاب نمایید.',
      confirmText: 'متوجه شدم',
      showCancel: false,
      type: 'info'
    });
  }

  /**
   * راهنمای اختصاصی نصب روی گوشی‌های آیفون و آیپد (سافاری)
   */
  public async showIosInstallGuide(): Promise<void> {
    await this.confirmDialog.open({
      title: 'راهنمای نصب در آیفون و آیپد (iOS)',
      message:
        'برای افزودن سامانه به صفحه اصلی آیفون/آیپد:\n\n' +
        '۱. در نوار پایین مرورگر سافاری، روی دکمه اشتراک‌گذاری (Share) بزنید.\n' +
        '۲. صفحه را کمی به بالا کشیده و گزینه «Add to Home Screen» (افزودن به صفحه اصلی) را انتخاب فرمایید.\n' +
        '۳. در گوشه بالای صفحه دکمه «Add» را لمس کنید.',
      confirmText: 'متوجه شدم',
      showCancel: false,
      type: 'info'
    });
  }
}
