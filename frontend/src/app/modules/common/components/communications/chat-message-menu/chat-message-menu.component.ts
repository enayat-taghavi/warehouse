import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage } from '../../../../../core/services/communication.service';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-chat-message-menu',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  styles: [':host { display: block; position: absolute; inset: 0; pointer-events: none; }'],
  template: `
    <div data-testid="msg-menu"
         data-back-closes
         [class.top-full]="!menuPlacement().up"
         [class.mt-1]="!menuPlacement().up"
         [class.bottom-full]="menuPlacement().up"
         [class.mb-1]="menuPlacement().up"
         [class.end-0]="!menuPlacement().flipX"
         [class.start-0]="menuPlacement().flipX"
         class="pointer-events-auto absolute z-30 w-48 max-h-[min(380px,70vh)] overflow-y-auto bg-surface border border-line rounded-2xl shadow-xl p-1.5 select-none"
         (click)="$event.stopPropagation()">
      <!-- ردیف واکنش‌های سریع (۶ ایموجی ثابت تلگرام) -->
      <div class="flex items-center justify-between px-1 py-1 bg-surface-muted/60 rounded-xl mb-1 border border-line/40"
           data-testid="menu-reactions">
        <button *ngFor="let emo of reactionEmojis"
                type="button"
                [disabled]="!isOnline()"
                (click)="onReactionClick(emo, $event)"
                [title]="isOnline() ? 'واکنش ' + emo : 'در حالت آفلاین در دسترس نیست'"
                [attr.aria-label]="isOnline() ? 'واکنش ' + emo : 'در حالت آفلاین در دسترس نیست'"
                class="w-7 h-7 text-base rounded-full hover:bg-surface hover:scale-125 active:scale-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent transition-all flex items-center justify-center cursor-pointer">
          {{ emo }}
        </button>
      </div>

      <!-- گزینه‌های منو -->
      <div class="space-y-0.5">
        <button *ngIf="canReply()"
                type="button"
                data-testid="menu-reply"
                (click)="reply.emit()"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-fg hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="hero-reply" aria-hidden="true"></svg>
          <span>پاسخ</span>
        </button>

        <button *ngIf="msg().text"
                type="button"
                data-testid="menu-copy"
                (click)="copy.emit()"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-fg hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="copy" aria-hidden="true"></svg>
          <span>کپی متن</span>
        </button>

        <button type="button"
                data-testid="menu-forward"
                (click)="forward.emit()"
                [disabled]="!isOnline()"
                [title]="isOnline() ? 'بازارسال' : 'در حالت آفلاین در دسترس نیست'"
                [attr.aria-label]="isOnline() ? 'بازارسال' : 'در حالت آفلاین در دسترس نیست'"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-fg hover:bg-surface-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="share" aria-hidden="true"></svg>
          <span>بازارسال</span>
        </button>

        <button *ngIf="canPin()"
                type="button"
                data-testid="menu-pin"
                (click)="pin.emit()"
                [disabled]="!isOnline()"
                [title]="isOnline() ? (msg().is_pinned ? 'برداشتن سنجاق' : 'سنجاق پیام') : 'در حالت آفلاین در دسترس نیست'"
                [attr.aria-label]="isOnline() ? (msg().is_pinned ? 'برداشتن سنجاق' : 'سنجاق پیام') : 'در حالت آفلاین در دسترس نیست'"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-fg hover:bg-surface-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="pin" aria-hidden="true"></svg>
          <span>{{ msg().is_pinned ? 'برداشتن سنجاق' : 'سنجاق پیام' }}</span>
        </button>

        <button *ngIf="canEdit()"
                type="button"
                data-testid="menu-edit"
                (click)="edit.emit()"
                [disabled]="!isOnline()"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-fg hover:bg-surface-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="edit" aria-hidden="true"></svg>
          <span>ویرایش</span>
        </button>

        <button type="button"
                data-testid="menu-select"
                (click)="select.emit()"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-fg hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="check-square" aria-hidden="true"></svg>
          <span>انتخاب</span>
        </button>

        <button *ngIf="isGroup() && msg().is_me"
                type="button"
                data-testid="menu-read-receipts"
                (click)="readReceipts.emit()"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-fg hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="eye" aria-hidden="true"></svg>
          <span>وضعیت مطالعه</span>
        </button>

        <button *ngIf="canDelete()"
                type="button"
                data-testid="menu-delete"
                (click)="delete.emit()"
                [disabled]="!isOnline()"
                class="w-full min-h-[40px] px-2.5 rounded-lg flex items-center gap-2 text-xs font-bold text-rose-600 hover:bg-surface-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 cursor-pointer tap-target">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="action-delete" aria-hidden="true"></svg>
          <span>حذف</span>
        </button>
      </div>
    </div>
  `
})
export class ChatMessageMenuComponent {
  public readonly msg = input.required<ChatMessage>();
  public readonly isGroup = input<boolean>(false);
  public readonly canReply = input<boolean>(true);
  public readonly canEdit = input<boolean>(false);
  public readonly canDelete = input<boolean>(false);
  public readonly canPin = input<boolean>(false);
  public readonly isOnline = input<boolean>(true);
  public readonly menuPlacement = input<{ up: boolean; flipX: boolean }>({ up: false, flipX: false });

  public readonly reaction = output<string>();
  public readonly reply = output<void>();
  public readonly forward = output<void>();
  public readonly pin = output<void>();
  public readonly edit = output<void>();
  public readonly copy = output<void>();
  public readonly select = output<void>();
  public readonly readReceipts = output<void>();
  public readonly delete = output<void>();
  public readonly close = output<void>();

  public readonly reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  public onReactionClick(emoji: string, ev: MouseEvent): void {
    ev.stopPropagation();
    this.reaction.emit(emoji);
  }
}
