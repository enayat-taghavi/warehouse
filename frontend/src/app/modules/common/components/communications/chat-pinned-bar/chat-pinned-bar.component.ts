import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PinnedMessageItem } from '../../../../../core/services/communication.service';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-chat-pinned-bar',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    <div *ngIf="pinnedMessages().length > 0"
         data-testid="chat-pinned-bar"
         role="button"
         tabindex="0"
         (click)="onBarClick()"
         (keydown.enter)="onBarClick()"
         (keydown.space)="onBarClick(); $event.preventDefault()"
         class="px-3 py-1.5 bg-surface/95 backdrop-blur border-b border-line cursor-pointer select-none hover:bg-surface-muted/50 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      <div class="w-full max-w-[760px] mx-auto flex items-center justify-between">
      
      <!-- Right side (RTL start): Segmented vertical indicator + Pinned Text Preview -->
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <!-- Segmented vertical indicator bar (1 segment per pinned message, up to 5) -->
        <div class="flex flex-col gap-0.5 h-7 w-1 shrink-0 rounded-full overflow-hidden bg-slate-200">
          <div *ngFor="let msg of displaySegments(); let idx = index"
               class="flex-1 transition-colors duration-150"
               [class.bg-indigo-600]="idx === safeIndex()"
               [class.bg-indigo-200]="idx !== safeIndex()">
          </div>
        </div>

        <!-- Title and message preview -->
        <div class="min-w-0 flex-1 text-right">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-bold text-indigo-600">
              {{ pinnedMessages().length > 1 ? ('پیام سنجاق‌شده #' + (safeIndex() + 1)) : 'پیام سنجاق‌شده' }}
            </span>
            <span *ngIf="currentMessage()?.sender_name" class="text-[10px] text-fg-muted truncate">
              ({{ currentMessage()?.sender_name }})
            </span>
          </div>
          <p class="text-xs text-fg truncate">
            {{ currentPreviewText() }}
          </p>
        </div>
      </div>

      <!-- Left side (RTL end): Unpin button (if allowed) + Pin icon -->
      <div class="flex items-center gap-1 shrink-0 ms-2">
        <button *ngIf="canUnpin()"
                type="button"
                data-testid="unpin-button"
                (click)="onUnpinClick($event)"
                [disabled]="!isOnline()"
                [title]="isOnline() ? 'برداشتن سنجاق این پیام' : 'در حالت آفلاین در دسترس نیست'"
                [attr.aria-label]="isOnline() ? 'برداشتن سنجاق این پیام' : 'در حالت آفلاین در دسترس نیست'"
                class="w-8 h-8 rounded-lg text-fg-muted hover:text-rose-600 hover:bg-surface-muted disabled:opacity-40 flex items-center justify-center cursor-pointer tap-target">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="x" aria-hidden="true"></svg>
        </button>
        <div class="w-8 h-8 flex items-center justify-center text-indigo-600 pointer-events-none">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="pin" aria-hidden="true"></svg>
        </div>
      </div>
      </div>
    </div>
  `
})
export class ChatPinnedBarComponent {
  public readonly pinnedMessages = input<PinnedMessageItem[]>([]);
  public readonly canUnpin = input<boolean>(false);
  public readonly isOnline = input<boolean>(true);

  public readonly messageClick = output<string | number>();
  public readonly unpinClick = output<string | number>();

  public readonly currentIndex = signal<number>(0);

  public readonly safeIndex = computed(() => {
    const len = this.pinnedMessages().length;
    if (len === 0) return 0;
    return this.currentIndex() % len;
  });

  public readonly displaySegments = computed(() => {
    return this.pinnedMessages().slice(0, 5);
  });

  public readonly currentMessage = computed(() => {
    const msgs = this.pinnedMessages();
    if (msgs.length === 0) return null;
    return msgs[this.safeIndex()] || null;
  });

  public readonly currentPreviewText = computed(() => {
    const msg = this.currentMessage();
    if (!msg) return '';
    if (msg.text && msg.text.trim()) {
      return msg.text.trim();
    }
    if (msg.has_attachment) {
      return '[فایل ضمیمه]';
    }
    return '[پیام]';
  });

  public onBarClick(): void {
    const msgs = this.pinnedMessages();
    if (msgs.length === 0) return;
    const cur = this.currentMessage();
    if (cur) {
      this.messageClick.emit(cur.id);
    }
    // گردش به پیام سنجاق‌شده بعدی در کلیک‌های پیاپی
    this.currentIndex.set((this.safeIndex() + 1) % msgs.length);
  }

  public onUnpinClick(ev: MouseEvent): void {
    ev.stopPropagation();
    const cur = this.currentMessage();
    if (cur) {
      this.unpinClick.emit(cur.id);
    }
  }
}
