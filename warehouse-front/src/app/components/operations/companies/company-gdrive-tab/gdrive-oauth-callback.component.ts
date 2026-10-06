import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-gdrive-oauth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div dir="rtl" class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div class="bg-white max-w-md w-full p-8 rounded-2xl shadow-md border border-slate-200 text-center">
        <div *ngIf="loading" class="space-y-4">
          <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <h2 class="text-lg font-bold text-slate-800">در حال تکمیل اتصال گوگل‌درایو...</h2>
          <p class="text-sm text-slate-500">لطفاً چند لحظه شکیبا باشید.</p>
        </div>

        <div *ngIf="success" class="space-y-4">
          <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">✓</div>
          <h2 class="text-lg font-bold text-emerald-700">اتصال گوگل‌درایو با موفقیت برقرار شد</h2>
          <p class="text-sm text-slate-600">این پنجره به صورت خودکار بسته می‌شود...</p>
          <button (click)="closeWindow()" class="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-xs hover:bg-indigo-700 cursor-pointer">بستن پنجره</button>
        </div>

        <div *ngIf="errorMessage" class="space-y-4">
          <div class="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">✕</div>
          <h2 class="text-lg font-bold text-rose-700">خطا در اتصال به گوگل‌درایو</h2>
          <p class="text-sm text-slate-600">{{ errorMessage }}</p>
          <button (click)="closeWindow()" class="px-5 py-2 bg-slate-600 text-white rounded-xl text-sm font-bold shadow-xs hover:bg-slate-700 cursor-pointer">بستن پنجره</button>
        </div>
      </div>
    </div>
  `
})
export class GDriveOAuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);

  loading = true;
  success = false;
  errorMessage = '';

  ngOnInit(): void {
    const code = this.route.snapshot.queryParams['code'];
    const state = this.route.snapshot.queryParams['state'];
    const error = this.route.snapshot.queryParams['error'];

    if (error) {
      this.loading = false;
      this.errorMessage = 'کاربر دسترسی را تایید نکرد یا خطایی رخ داد: ' + error;
      return;
    }

    if (!code || !state) {
      this.loading = false;
      this.errorMessage = 'کد یا وضعیت احراز هویت دریافت نشد.';
      return;
    }

    const callbackUrl = `${environment.apiUrl}/accounts/gdrive/callback/?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    this.http.get(callbackUrl, { responseType: 'text' }).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.notifyParentAndClose();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error || 'خطا در برقراری ارتباط با سرور';
      }
    });
  }

  notifyParentAndClose(): void {
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'GDRIVE_OAUTH_SUCCESS' }, '*');
      }
    } catch (e) {
      console.warn('Could not postMessage to opener:', e);
    }
    setTimeout(() => {
      this.closeWindow();
    }, 1800);
  }

  closeWindow(): void {
    try {
      window.close();
    } catch (e) {}
  }
}
