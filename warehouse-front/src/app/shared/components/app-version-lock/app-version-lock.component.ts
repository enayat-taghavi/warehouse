import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { AppVersionService } from '../../../core/platform/app-version.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { openExternal } from '../../../core/platform/external-link';

const faNumber = new Intl.NumberFormat('fa-IR');

@Component({
  selector: 'app-version-lock',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    @if (versionService.state() === 'locked') {
      <div
        role="dialog"
        aria-modal="true"
        aria-label="قفل نسخه اپلیکیشن"
        class="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div class="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center my-auto animate-fade-in">
          <!-- آیکون وضعیت قفل -->
          <div class="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mb-4 shadow-xs">
            <svg
              appIcon="lock"
              class="w-8 h-8 text-rose-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"></svg>
          </div>

          <!-- عنوان اخطار -->
          <h2 class="text-lg font-black text-slate-800 mb-2">
            نسخهٔ اپ قدیمی است و باید به‌روز شود
          </h2>

          <!-- تعداد رکوردهای ارسال‌نشده -->
          <div class="w-full bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3.5 mb-4 text-right">
            <div class="flex items-start gap-2.5">
              <span class="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg
                  appIcon="alert-triangle"
                  class="w-4 h-4 text-amber-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"></svg>
              </span>
              <div class="text-xs text-amber-900 leading-relaxed font-bold">
                @if (unsentCount() > 0) {
                  <span>شما دارای {{ fa(unsentCount()) }} رکورد ذخیره‌نشده در صف محلی هستید.</span>
                } @else {
                  <span>تمام اطلاعات محلی قبلاً به سرور منتقل شده است.</span>
                }
              </div>
            </div>
          </div>

          <!-- پیام هشدار عدم حذف برنامه -->
          <p class="text-xs text-slate-600 leading-relaxed mb-6 font-medium bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-right w-full">
            اپ را حذف نکنید؛ نسخهٔ جدید را روی همین نصب کنید تا داده‌های ارسال‌نشده حفظ شوند
          </p>

          <!-- دکمه‌ها -->
          <div class="w-full flex flex-col gap-2.5">
            <button
              type="button"
              (click)="onUpdate()"
              title="دریافت و نصب نسخه جدید برنامه"
              aria-label="به‌روزرسانی برنامه"
              class="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer">
              <svg
                appIcon="cloud-upload"
                class="w-4 h-4 text-white rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"></svg>
              <span>به‌روزرسانی</span>
            </button>

            <button
              type="button"
              (click)="onEmergencySend()"
              [disabled]="isSendingEmergency()"
              title="تلاش برای ارسال رکوردهای باقیمانده به سرور"
              aria-label="ارسال اضطراری اطلاعات به سرور"
              class="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60 disabled:cursor-wait">
              <svg
                appIcon="cloud-upload"
                class="w-4 h-4 text-slate-600"
                [class.animate-bounce]="isSendingEmergency()"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"></svg>
              <span>ارسال اضطراری</span>
            </button>
          </div>

          <!-- پیام وضعیت ارسال اضطراری -->
          @if (emergencyStatusMessage()) {
            <div
              role="status"
              aria-live="polite"
              class="mt-3.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 w-full animate-fade-in">
              {{ emergencyStatusMessage() }}
            </div>
          }
        </div>
      </div>
    } @else if (versionService.state() === 'recommend' && !isDismissed()) {
      <!-- نوار اعلان ارتقای پیشنهادی -->
      <section
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="اعلان نسخه جدید"
        class="w-full bg-indigo-50 border-b border-indigo-200 text-indigo-950 px-3.5 py-2 text-xs">
        <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
              <svg
                appIcon="alert-circle"
                class="w-4 h-4 text-indigo-700"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"></svg>
            </span>
            <p class="leading-relaxed font-medium">
              نسخه جدیدتری از اپلیکیشن موجود است. برای بهره‌مندی از آخرین امکانات، برنامه را به‌روزرسانی کنید.
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              (click)="onUpdate()"
              title="دریافت نسخه جدید"
              aria-label="به‌روزرسانی برنامه"
              class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-900 shadow-2xs">
              <svg
                appIcon="cloud-upload"
                class="w-3.5 h-3.5 text-white rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"></svg>
              <span>به‌روزرسانی</span>
            </button>

            <button
              type="button"
              (click)="dismissRecommend()"
              title="بستن اعلان"
              aria-label="بستن اعلان به‌روزرسانی"
              class="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:bg-indigo-100 text-indigo-700 cursor-pointer transition">
              <svg
                appIcon="x"
                class="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"></svg>
            </button>
          </div>
        </div>
      </section>
    }
  `,
})
export class AppVersionLockComponent implements OnInit, OnDestroy {
  protected readonly versionService = inject(AppVersionService);
  private readonly offlineSync = inject(OfflineSyncService, { optional: true });

  protected readonly unsentCount = signal(0);
  protected readonly isDismissed = signal(false);
  protected readonly isSendingEmergency = signal(false);
  protected readonly emergencyStatusMessage = signal<string | null>(null);

  private sub: Subscription | null = null;

  ngOnInit(): void {
    // بررسی وضعیت رد شدن در نشست فعلی
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('wh_app_version_recommend_dismissed') === 'true') {
        this.isDismissed.set(true);
      }
    } catch {}

    // گوش دادن به شمارنده صف‌های همگام‌سازی
    if (this.offlineSync) {
      this.sub = this.offlineSync.pendingCount$.subscribe((count) => {
        this.unsentCount.set(count);
      });
      this.updateUnsentCount();
    }
  }

  protected fa(n: number): string {
    return faNumber.format(n);
  }

  protected async updateUnsentCount(): Promise<void> {
    if (this.offlineSync) {
      try {
        const count = await this.offlineSync.getUnsentCountStrict();
        this.unsentCount.set(count);
      } catch {
        // نادیده گرفتن خطا
      }
    }
  }

  protected onUpdate(): void {
    const url = this.versionService.downloadUrl;
    if (url) {
      openExternal(url);
    }
  }

  protected async onEmergencySend(): Promise<void> {
    if (this.isSendingEmergency()) return;
    this.isSendingEmergency.set(true);
    this.emergencyStatusMessage.set('در حال ارسال داده‌ها به سرور...');

    try {
      const outcome = await this.versionService.emergencySend();
      if (outcome?.status === 'completed' || outcome?.status === 'nothing-to-sync') {
        this.emergencyStatusMessage.set('ارسال با موفقیت انجام شد.');
      } else if (outcome?.status === 'offline') {
        this.emergencyStatusMessage.set('دستگاه آفلاین است. لطفاً اتصال اینترنت را بررسی کنید.');
      } else if (outcome?.status === 'server-unreachable') {
        this.emergencyStatusMessage.set('سرور موقتاً در دسترس نیست. بعداً مجدداً تلاش کنید.');
      } else if (outcome?.status === 'partial') {
        this.emergencyStatusMessage.set(`بخشی از داده‌ها ارسال شد (${outcome.synced || 0} ارسال‌شده).`);
      } else {
        this.emergencyStatusMessage.set('عملیات ارسال انجام شد.');
      }
      await this.updateUnsentCount();
    } catch (err: any) {
      this.emergencyStatusMessage.set('خطا در ارسال: ' + (err?.message || 'مشکل ارتباطی'));
    } finally {
      this.isSendingEmergency.set(false);
    }
  }

  protected dismissRecommend(): void {
    this.isDismissed.set(true);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('wh_app_version_recommend_dismissed', 'true');
      }
    } catch {}
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
