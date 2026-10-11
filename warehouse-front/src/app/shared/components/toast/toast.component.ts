import { Component, Injectable, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { IconName } from '../../icons/icon-registry';

// ══════════════════════════════════════════════════
//  Toast Service — Signal-based (جایگزین DOM manipulation)
// ══════════════════════════════════════════════════

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  private readonly _toasts = signal<ToastItem[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(type: ToastType, message: string, durationMs = 4000): void {
    const id = this.nextId++;
    this._toasts.update((list) => [...list, { id, type, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  success(message: string): void { this.show('success', message); }
  error(message: string): void { this.show('error', message); }
  warning(message: string): void { this.show('warning', message); }
  info(message: string): void { this.show('info', message); }

  showSuccess(message: string): void { this.success(message); }
  showError(message: string): void { this.error(message); }
  showWarning(message: string): void { this.warning(message); }
  showInfo(message: string): void { this.info(message); }
}

// ══════════════════════════════════════════════════
//  Toast Component — نمایش Toast‌ها
// ══════════════════════════════════════════════════

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] flex flex-col gap-2 max-w-sm w-full px-4 select-none" id="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast group relative flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-xl text-xs font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          [ngClass]="toastClasses[toast.type]"
          (click)="copyToast(toast)"
          role="alert"
          title="برای کپی کردن متن کلیک کنید"
        >
          @if (copiedToastIds().has(toast.id)) {
            <span class="shrink-0 text-emerald-400 animate-bounce">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="check"></svg>
            </span>
          } @else {
            <span class="shrink-0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" [appIcon]="toastIcons[toast.type]"></svg></span>
          }

          <p class="flex-1 leading-relaxed select-text">{{ toast.message }}</p>

          @if (copiedToastIds().has(toast.id)) {
            <span class="shrink-0 bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md text-[10px] font-extrabold border border-emerald-500/40 animate-pulse">
              کپی شد ✓
            </span>
          }

          <button
            type="button"
            class="shrink-0 opacity-60 hover:opacity-100 hover:bg-white/10 p-1 rounded-lg transition-all min-w-[32px] min-h-[32px] flex items-center justify-center tap-target"
            (click)="dismissToast($event, toast.id)"
            aria-label="بستن پیام"
            title="بستن پیام"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast {
      animation: toastSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes toastSlideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `],
})
export class ToastContainerComponent {
  copiedToastIds = signal<Set<number>>(new Set());

  constructor(public toastService: ToastService) {}

  copyToast(toast: ToastItem): void {
    const text = toast.message;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => this.fallbackCopy(text));
    } else {
      this.fallbackCopy(text);
    }

    this.copiedToastIds.update((set) => {
      const next = new Set(set);
      next.add(toast.id);
      return next;
    });

    setTimeout(() => {
      this.copiedToastIds.update((set) => {
        const next = new Set(set);
        next.delete(toast.id);
        return next;
      });
    }, 1500);
  }

  private fallbackCopy(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(textArea);
  }

  dismissToast(event: Event, id: number): void {
    event.stopPropagation();
    this.toastService.dismiss(id);
  }

  toastClasses: Record<ToastType, string> = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  };

  /** آیکن هر نوع پیام از رجیستری مشترک (پیش‌تر رشتهٔ svg بود که sanitizer آن را حذف می‌کرد). */
  toastIcons: Record<ToastType, IconName> = {
    success: 'check-circle',
    error: 'x-circle',
    warning: 'alert-triangle',
    info: 'info',
  };
}
