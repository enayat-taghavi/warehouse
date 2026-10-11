import { Component, Injectable, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { IconName } from '../../icons/icon-registry';

// ══════════════════════════════════════════════════
//  ConfirmDialog Service — جایگزین confirm() مرورگر
// ══════════════════════════════════════════════════

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  extraText?: string;
  type?: 'danger' | 'warning' | 'info';
  showCancel?: boolean;
  requireText?: string;
  requireTextLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly _config = signal<ConfirmDialogConfig | null>(null);
  private resolveRef: ((result: boolean | string) => void) | null = null;

  readonly config = this._config.asReadonly();
  readonly isOpen = () => this._config() !== null;

  /**
   * نمایش دیالوگ تایید — Promise برمی‌گرداند
   *
   * const confirmed = await this.confirm.open({
   *   title: 'حذف نقش',
   *   message: 'آیا مطمئنید؟',
   *   type: 'danger'
   * });
   */
  open(config: ConfirmDialogConfig): Promise<boolean | string> {
    this._config.set({
      confirmText: 'تایید',
      cancelText: 'انصراف',
      type: 'warning',
      showCancel: true,
      ...config,
    });
    return new Promise((resolve) => {
      this.resolveRef = resolve;
    });
  }

  confirm(): void {
    this.resolveRef?.(true);
    this.close();
  }

  cancel(): void {
    this.resolveRef?.(false);
    this.close();
  }

  extra(): void {
    this.resolveRef?.('extra');
    this.close();
  }

  private close(): void {
    this._config.set(null);
    this.resolveRef = null;
  }
}

// ══════════════════════════════════════════════════
//  ConfirmDialog Component
// ══════════════════════════════════════════════════

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    @if (dialog.isOpen()) {
      <div class="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" (click)="cancel()"></div>
        <div class="confirm-panel relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <!-- Icon -->
          <div class="pt-6 flex justify-center">
            <div
              class="w-14 h-14 rounded-full flex items-center justify-center"
              [ngClass]="iconBgClass"
            >
              <span><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" [appIcon]="iconName"></svg></span>
            </div>
          </div>

          <!-- Content -->
          <div class="px-6 pt-4 pb-2 text-center">
            <h3 class="text-sm font-black text-slate-800 mb-2">{{ config()?.title }}</h3>
            <p class="text-xs text-slate-500 leading-relaxed" [innerHTML]="config()?.message"></p>
          </div>

          <!-- Required Text Confirmation Input -->
          @if (config()?.requireText) {
            <div class="px-6 pb-2 text-right">
              <label class="block text-[11px] font-bold text-slate-600 mb-1.5">
                {{ config()?.requireTextLabel || 'جهت تأیید، عبارت زیر را دقیقاً وارد کنید:' }}
              </label>
              <div class="bg-slate-50 border border-slate-200 rounded-xl p-2 mb-2 text-center select-all font-mono font-bold text-xs text-rose-600 tracking-wider">
                {{ config()?.requireText }}
              </div>
              <input
                type="text"
                [value]="inputText()"
                (input)="onInputTextChange($event)"
                class="w-full text-center font-mono text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-white"
                placeholder="عبارت تأییدیه را اینجا وارد کنید..."
              />
            </div>
          }

          <!-- Actions -->
          <div class="px-6 pb-6 pt-4 flex flex-col sm:flex-row items-center gap-2">
            @if (config()?.showCancel) {
              <button
                (click)="cancel()"
                [attr.title]="config()?.cancelText"
                [attr.aria-label]="config()?.cancelText"
                class="w-full sm:flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer tap-target flex items-center justify-center"
              >
                {{ config()?.cancelText }}
              </button>
            }
            
            @if (config()?.extraText) {
              <button
                (click)="dialog.extra()"
                [attr.title]="config()?.extraText"
                [attr.aria-label]="config()?.extraText"
                class="w-full sm:flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer tap-target flex items-center justify-center"
              >
                {{ config()?.extraText }}
              </button>
            }

            <button
              (click)="confirm()"
              [disabled]="isConfirmDisabled"
              [attr.title]="config()?.confirmText"
              [attr.aria-label]="config()?.confirmText"
              class="w-full sm:flex-1 py-2.5 px-4 min-h-[44px] rounded-xl text-xs font-bold text-white transition-all cursor-pointer tap-target flex items-center justify-center"
              [class.opacity-40]="isConfirmDisabled"
              [class.cursor-not-allowed]="isConfirmDisabled"
              [ngClass]="confirmBtnClass"
            >
              {{ config()?.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-panel {
      animation: confirmIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes confirmIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
  `],
})
export class ConfirmDialogComponent {
  inputText = signal('');

  constructor(public dialog: ConfirmDialogService) {}

  onInputTextChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.inputText.set(input?.value ?? '');
  }

  get isConfirmDisabled(): boolean {
    const req = this.config()?.requireText;
    if (!req) return false;
    return this.inputText().trim() !== req.trim();
  }

  confirm(): void {
    if (this.isConfirmDisabled) return;
    this.inputText.set('');
    this.dialog.confirm();
  }

  cancel(): void {
    this.inputText.set('');
    this.dialog.cancel();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialog.isOpen()) {
      this.cancel();
    }
  }

  @HostListener('document:keydown.enter')
  onEnter(): void {
    if (this.dialog.isOpen() && !this.isConfirmDisabled) {
      this.confirm();
    }
  }

  get config() { return this.dialog.config; }

  get iconBgClass(): string {
    const type = this.config()?.type ?? 'warning';
    return {
      danger: 'bg-rose-100 text-rose-500',
      warning: 'bg-amber-100 text-amber-500',
      info: 'bg-blue-100 text-blue-500',
    }[type];
  }

  get confirmBtnClass(): string {
    const type = this.config()?.type ?? 'warning';
    return {
      danger: 'bg-rose-500 hover:bg-rose-600',
      warning: 'bg-amber-500 hover:bg-amber-600',
      info: 'bg-blue-500 hover:bg-blue-600',
    }[type];
  }

  /** آیکن هر نوع دیالوگ از رجیستری مشترک (پیش‌تر رشتهٔ svg بود که sanitizer آن را حذف می‌کرد). */
  get iconName(): IconName {
    const type = this.config()?.type ?? 'warning';
    const icons: Record<'danger' | 'warning' | 'info', IconName> = {
      danger: 'x-circle',
      warning: 'alert-triangle',
      info: 'info',
    };
    return icons[type];
  }
}
