import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMessage, CommunicationService, Conversation } from '../../../../../core/services/communication.service';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ToastService } from '../../../../../shared/components/toast/toast.component';

@Component({
  selector: 'app-chat-forward-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  template: `
    <div *ngIf="isOpen()"
         class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none"
         role="dialog"
         aria-modal="true"
         aria-labelledby="forward-modal-title"
         data-testid="forward-modal"
         (click)="onBackdropClick($event)"
         (keydown.escape)="onClose()">

      <div class="bg-surface w-full max-w-md rounded-3xl border border-line shadow-2xl flex flex-col overflow-hidden max-h-[85vh]"
           (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="px-4 py-3.5 border-b border-line flex items-center justify-between shrink-0 bg-surface-muted/30">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="share" aria-hidden="true"></svg>
            </div>
            <div>
              <h2 id="forward-modal-title" class="text-sm font-black text-fg">
                بازارسال پیام
              </h2>
              <p class="text-[11px] text-fg-muted font-bold">
                {{ messages().length.toLocaleString('fa-IR') }} پیام انتخاب‌شده
              </p>
            </div>
          </div>
          <button type="button"
                  data-testid="forward-modal-close"
                  (click)="onClose()"
                  title="بستن"
                  aria-label="بستن"
                  class="min-w-[40px] min-h-[40px] rounded-xl text-fg-muted hover:text-fg hover:bg-surface-muted flex items-center justify-center cursor-pointer tap-target">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="x" aria-hidden="true"></svg>
          </button>
        </div>

        <!-- Search Bar -->
        <div class="p-3 border-b border-line shrink-0 bg-surface">
          <div class="relative">
            <svg class="w-4 h-4 text-fg-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="search" aria-hidden="true"></svg>
            <input type="text"
                   [(ngModel)]="searchQuery"
                   data-testid="forward-search-input"
                   placeholder="جستجوی مقصد..."
                   class="w-full h-10 ps-9 pe-8 rounded-xl bg-surface-muted/60 border border-line text-xs font-bold text-fg placeholder:text-fg-muted/70 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button *ngIf="searchQuery"
                    type="button"
                    (click)="searchQuery = ''"
                    class="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-fg-muted hover:text-fg"
                    title="پاک کردن جستجو"
                    aria-label="پاک کردن جستجو">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="x" aria-hidden="true"></svg>
            </button>
          </div>
        </div>

        <!-- Conversation Destination List -->
        <div class="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-line/30" data-testid="forward-dest-list">
          <div *ngIf="filteredConversations().length === 0"
               class="py-10 text-center text-xs font-bold text-fg-muted">
            گفتگویی یافت نشد
          </div>

          <label *ngFor="let conv of filteredConversations()"
                 data-testid="forward-dest-item"
                 [attr.data-conv-id]="conv.id"
                 [class.opacity-50]="isRowDisabled(conv.id)"
                 [class.cursor-not-allowed]="isRowDisabled(conv.id)"
                 [class.cursor-pointer]="!isRowDisabled(conv.id)"
                 [class.bg-indigo-50/50]="isSelected(conv.id)"
                 [class.dark:bg-indigo-950/30]="isSelected(conv.id)"
                 class="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface-muted transition-colors min-h-[48px] tap-target">
            <input type="checkbox"
                   [checked]="isSelected(conv.id)"
                   [disabled]="isRowDisabled(conv.id)"
                   (change)="toggleDestination(conv.id)"
                   data-testid="forward-dest-checkbox"
                   class="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-line cursor-pointer shrink-0" />

            <!-- Conv Avatar -->
            <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
              <svg *ngIf="conv.conv_type === 'group'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="users" aria-hidden="true"></svg>
              <ng-container *ngIf="conv.conv_type !== 'group'">{{ getTitle(conv).charAt(0) }}</ng-container>
            </div>

            <!-- Conv Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold text-fg truncate">{{ getTitle(conv) }}</span>
                <span *ngIf="conv.conv_type === 'group'" class="text-[10px] font-bold text-fg-muted shrink-0 bg-surface-muted px-1.5 py-0.5 rounded-md">گروه</span>
              </div>
              <p class="text-[11px] text-fg-muted truncate mt-0.5">
                {{ conv.last_message?.text || 'بدون پیام' }}
              </p>
            </div>
          </label>
        </div>

        <!-- Footer / Action Bar -->
        <div class="p-3 border-t border-line bg-surface-muted/30 shrink-0 flex items-center justify-between gap-3">
          <div class="flex items-center gap-1.5" data-testid="forward-counter">
            <span class="text-xs font-bold text-fg">انتخاب:</span>
            <span class="px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums"
                  [class.bg-indigo-100]="selectedCount() > 0"
                  [class.text-indigo-700]="selectedCount() > 0"
                  [class.dark:bg-indigo-900/50]="selectedCount() > 0"
                  [class.dark:text-indigo-300]="selectedCount() > 0"
                  [class.bg-surface-muted]="selectedCount() === 0"
                  [class.text-fg-muted]="selectedCount() === 0">
              {{ selectedCount().toLocaleString('fa-IR') }} / ۵
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button type="button"
                    (click)="onClose()"
                    data-testid="forward-cancel-btn"
                    class="min-h-[40px] px-3.5 rounded-xl border border-line text-xs font-bold text-fg hover:bg-surface-muted cursor-pointer tap-target">
              انصراف
            </button>
            <button type="button"
                    [disabled]="selectedCount() === 0 || isSubmitting()"
                    (click)="onConfirmForward()"
                    data-testid="forward-confirm-btn"
                    class="min-h-[40px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer tap-target shadow-sm">
              <svg *ngIf="isSubmitting()" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="refresh-cw" aria-hidden="true"></svg>
              <svg *ngIf="!isSubmitting()" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" appIcon="share" aria-hidden="true"></svg>
              <span>بازارسال</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `
})
export class ChatForwardModalComponent {
  private commService = inject(CommunicationService);
  private toast = inject(ToastService);

  public readonly isOpen = input<boolean>(false);
  public readonly messages = input<ChatMessage[]>([]);
  public readonly conversations = input<Conversation[]>([]);

  public readonly close = output<void>();
  public readonly forwarded = output<{ count: number; conversationIds: (string | number)[] }>();

  public searchQuery = '';
  public selectedDestIds = signal<Set<string>>(new Set<string>());
  public isSubmitting = signal<boolean>(false);

  public selectedCount = computed(() => this.selectedDestIds().size);

  public filteredConversations = computed(() => {
    const all = this.conversations().filter(c => c.can_post !== false && c.is_active !== false);
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(c => {
      const title = this.getTitle(c).toLowerCase();
      return title.includes(q);
    });
  });

  public isSelected(convId: string): boolean {
    return this.selectedDestIds().has(String(convId));
  }

  public isRowDisabled(convId: string): boolean {
    const idStr = String(convId);
    return !this.isSelected(idStr) && this.selectedCount() >= 5;
  }

  public toggleDestination(convId: string): void {
    const idStr = String(convId);
    const current = new Set(this.selectedDestIds());
    if (current.has(idStr)) {
      current.delete(idStr);
    } else {
      if (current.size >= 5) {
        this.toast.show('warning', 'حداکثر ۵ مقصد می‌توانید انتخاب کنید');
        return;
      }
      current.add(idStr);
    }
    this.selectedDestIds.set(current);
  }

  public getTitle(conv: Conversation): string {
    if (conv.title) return conv.title;
    if (conv.conv_type === 'direct' && conv.participants_details?.length) {
      const myId = (this.commService as any).getCurrentUserId?.() ?? null;
      const other = conv.participants_details.find(p => p.id !== myId);
      if (other) return other.full_name || other.username;
    }
    return conv.conv_type === 'group' ? 'گروه بدون نام' : 'گفتگو';
  }

  public onClose(): void {
    this.selectedDestIds.set(new Set());
    this.searchQuery = '';
    this.close.emit();
  }

  public onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  public onConfirmForward(): void {
    const msgIds = this.messages().map(m => m.id);
    const destIds = Array.from(this.selectedDestIds());

    if (!msgIds.length || !destIds.length) return;
    if (destIds.length > 5) {
      this.toast.show('warning', 'حداکثر ۵ مقصد می‌توانید انتخاب کنید');
      return;
    }

    this.isSubmitting.set(true);
    this.commService.forwardMessages(msgIds, destIds).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.toast.show('success', 'پیام با موفقیت بازارسال شد');
        this.forwarded.emit({ count: res.count, conversationIds: destIds });
        this.onClose();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const errDetail = err?.error?.error || err?.error?.detail || 'بازارسال پیام انجام نشد';
        this.toast.show('error', errDetail);
      }
    });
  }
}
