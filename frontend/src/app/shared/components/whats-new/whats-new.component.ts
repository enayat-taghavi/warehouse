import { Component, HostListener, OnInit, signal } from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { APP_VERSION } from '../../../core/platform/app-version';
import {
  LAST_SEEN_VERSION_KEY,
  formatVersionFa,
  releaseNotesToShow,
} from '../../../core/platform/release-notes';

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function storeLastSeen(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // حافظهٔ مرورگر در دسترس نیست؛ پنجره فقط در همین بار بسته می‌ماند
  }
}

/**
 * پنجرهٔ یک‌بارهٔ «چه چیزی تازه است» (طرح ۵ اندروید، د۳).
 * نصب تازه: فقط نسخه ثبت می‌شود. ارتقا با یادداشت: یک بار نشان داده می‌شود و بستن، نسخه را ثبت می‌کند.
 * Escape (و دکمهٔ برگشت اندروید که Escape می‌فرستد) پنجره را می‌بندد.
 */
@Component({
  selector: 'app-whats-new',
  standalone: true,
  imports: [SvgIconDirective],
  template: `
    @if (notes(); as items) {
      <div class="fixed inset-0 z-[95] bg-slate-900/50 flex items-center justify-center p-4" (click)="close()">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-new-title"
          data-testid="whats-new-dialog"
          class="w-full max-w-sm bg-surface border border-line rounded-2xl shadow-xl p-4 text-fg"
          (click)="$event.stopPropagation()">
          <div class="flex items-center gap-2.5 mb-3">
            <span class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <svg appIcon="star" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            </span>
            <h2 id="whats-new-title" class="flex-1 min-w-0 text-sm font-bold">چه چیزی تازه است — نسخهٔ {{ versionFa }}</h2>
            <button
              type="button"
              data-testid="whats-new-close-x"
              (click)="close()"
              title="بستن"
              aria-label="بستن"
              class="shrink-0 w-10 h-10 rounded-xl text-fg-muted hover:bg-surface-muted flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <svg appIcon="x" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            </button>
          </div>
          <ul class="list-disc ps-5 space-y-1.5 text-xs leading-relaxed text-fg">
            @for (line of items; track $index) {
              <li>{{ line }}</li>
            }
          </ul>
          <button
            type="button"
            data-testid="whats-new-close"
            (click)="close()"
            class="mt-4 w-full min-h-[40px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            متوجه شدم
          </button>
        </section>
      </div>
    }
  `,
})
export class WhatsNewComponent implements OnInit {
  public readonly notes = signal<string[] | null>(null);
  public readonly versionFa = formatVersionFa(APP_VERSION);

  ngOnInit(): void {
    const notes = releaseNotesToShow(readLastSeen(), APP_VERSION);
    if (notes) {
      this.notes.set(notes);
    } else {
      storeLastSeen(APP_VERSION);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.notes()) {
      this.close();
    }
  }

  public close(): void {
    storeLastSeen(APP_VERSION);
    this.notes.set(null);
  }
}
