import { Component, ElementRef, HostListener, afterNextRender, input, output, viewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import type { MobileBottomNavItem } from './mobile-bottom-nav.component';

/**
 * پنل آیکونی «بیشتر» در موبایل: گزینه‌های منو که در نوار پایین جا نشده‌اند، در شبکهٔ چهارستونی.
 * از پایین باز می‌شود و تقریباً کل صفحه (زیر نوار بالا تا بالای نوار پایین) را می‌گیرد.
 * با انتخاب گزینه، Escape (و دکمهٔ برگشت اندروید)، لمس پس‌زمینه یا دکمهٔ بستن بسته می‌شود.
 */
@Component({
  selector: 'app-mobile-more-sheet',
  standalone: true,
  imports: [NgClass, SvgIconDirective],
  template: `
    <div class="fixed inset-x-0 top-0 bottom-[var(--mobile-bottom-nav-height)] z-50 bg-slate-900/60 fade-in"
         (click)="closed.emit()" aria-hidden="true" data-testid="mobile-more-backdrop"></div>
    <div class="fixed inset-x-0 top-[calc(var(--mobile-top-chrome-height)+0.5rem)] bottom-[var(--mobile-bottom-nav-height)] z-50 flex flex-col bg-surface rounded-t-2xl border-t border-line shadow-2xl animate-[slideInUp_0.25s_cubic-bezier(0.16,1,0.3,1)]"
         #panel dir="rtl" role="dialog" aria-modal="true" aria-labelledby="mobile-more-sheet-title" data-back-closes data-testid="mobile-more-sheet"
         (keydown.tab)="trapFocus($event)" (keydown.shift.tab)="trapFocus($event)">
      <div class="shrink-0 flex items-center justify-between gap-2 ps-4 pe-1 pt-1">
        <h2 id="mobile-more-sheet-title" class="text-sm font-black text-fg">همهٔ بخش‌ها</h2>
        <button #closeBtn type="button" (click)="closed.emit()"
                class="tap-target w-10 h-10 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="بستن" aria-label="بستن" data-testid="mobile-more-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" appIcon="x"></svg>
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-2 pb-4">
        @if (items().length) {
          <ul class="grid grid-cols-4 gap-x-1 gap-y-4" role="list" data-testid="mobile-more-grid">
            @for (it of items(); track it.id) {
              <li>
                <button type="button" (click)="itemSelect.emit(it.id)"
                        class="w-full min-h-[72px] flex flex-col items-center gap-1 rounded-xl p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        [title]="it.title" [attr.aria-label]="it.title"
                        [attr.aria-current]="it.active ? 'page' : null"
                        [attr.data-testid]="'mobile-more-item-' + it.id">
                  <span class="w-12 h-12 flex items-center justify-center rounded-2xl transition-colors"
                        [ngClass]="it.active ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' : 'bg-surface-muted text-fg-muted'">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" [appIcon]="it.icon"></svg>
                  </span>
                  <span class="w-full text-[11px] leading-tight text-center line-clamp-2"
                        [ngClass]="it.active ? 'font-black text-indigo-700' : 'font-bold text-fg'">{{ it.label }}</span>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="py-10 text-center text-xs font-bold text-fg-muted" data-testid="mobile-more-empty">گزینهٔ دیگری نیست</p>
        }
      </div>
    </div>
  `
})
export class MobileMoreSheetComponent {
  /** گزینه‌هایی که در نوار پایین نیامده‌اند */
  readonly items = input<MobileBottomNavItem[]>([]);

  readonly itemSelect = output<string>();
  readonly closed = output<void>();

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    afterNextRender(() => this.closeBtn()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  /** فوکوس صفحه‌کلید درون پنل می‌چرخد (aria-modal) */
  trapFocus(event: Event): void {
    const buttons = Array.from(this.panel()?.nativeElement.querySelectorAll<HTMLButtonElement>('button') ?? []);
    if (!buttons.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    const back = (event as KeyboardEvent).shiftKey;
    if (back && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!back && document.activeElement === last) { first.focus(); event.preventDefault(); }
  }
}
