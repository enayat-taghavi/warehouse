import { Component, computed, inject, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { CommunicationService } from '../../../core/services/communication.service';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ACTION_ICONS, PLATFORM_ENTITY_ICONS } from '../../icons/semantic-icons';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';

/** یک گزینهٔ منوی فعال برای تب‌های پویای نوار پایین */
export interface MobileBottomNavItem {
  id: string;
  /** نام مختصر زیر آیکون (shortLabel منو) */
  label: string;
  /** نام کامل برای title و aria-label */
  title: string;
  icon: string;
  active: boolean;
}

interface BottomTab {
  kind: 'chat' | 'notifications' | 'item' | 'more';
  id: string;
  label: string;
  title: string;
  ariaLabel: string;
  icon: string;
  active: boolean;
  badge: string | null;
  badgeClass: string;
  dot: boolean;
}

function badgeText(n: number): string | null {
  return n > 0 ? (n > 99 ? '+99' : String(n)) : null;
}

/**
 * نوار تب‌های پایین موبایل (سبک واتساپ، فقط زیر md): چت، اعلان، دو گزینهٔ اول منو و «بیشتر».
 * بدون دسترسی به چت، گزینهٔ سوم منو جای آن را می‌گیرد. داخل یک گفت‌وگوی چت پنهان می‌شود.
 * پوسته فقط گزینه‌ها و کار «بیشتر» را می‌دهد؛ چت و اعلان را خود نوار باز و بسته می‌کند.
 */
@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [NgClass, SvgIconDirective],
  host: { class: 'md:hidden shrink-0 relative z-[45]' },
  template: `
    @if (!commService.hasActiveConversation()) {
      <nav class="mobile-bottom-nav flex items-stretch pt-[3px] bg-surface border-t border-line shadow-[0_-2px_8px_rgba(15,23,42,0.06)]"
           dir="rtl" aria-label="ناوبری اصلی" data-testid="mobile-bottom-nav">
        @for (entry of tabs(); track entry.id) {
          <button type="button"
                  (click)="onTab(entry, $event)"
                  class="tap-target flex-1 min-w-0 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  [attr.data-testid]="'bottom-nav-' + entry.id"
                  [title]="entry.title"
                  [attr.aria-label]="entry.ariaLabel"
                  [attr.aria-current]="entry.kind === 'item' && entry.active ? 'page' : null"
                  [attr.aria-expanded]="entry.kind === 'item' ? null : entry.active">
            <span class="relative flex items-center justify-center w-12 h-7 rounded-full transition-colors"
                  [ngClass]="entry.active ? 'bg-indigo-50 text-indigo-600' : 'text-fg-muted'">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" [appIcon]="entry.icon"></svg>
              @if (entry.badge) {
                <span class="absolute -top-1 end-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center border-2 border-surface"
                      [ngClass]="entry.badgeClass" aria-hidden="true">{{ entry.badge }}</span>
              }
              @if (entry.dot) {
                <span class="absolute top-0 end-2 w-2 h-2 rounded-full bg-indigo-500" aria-hidden="true" data-testid="bottom-nav-more-dot"></span>
              }
            </span>
            <span class="text-[10px] leading-tight truncate max-w-[68px]"
                  [ngClass]="entry.active ? 'font-black text-indigo-700' : 'font-bold text-fg-muted'">{{ entry.label }}</span>
          </button>
        }
      </nav>
    }
  `
})
export class MobileBottomNavComponent {
  readonly commService = inject(CommunicationService);

  /** گزینه‌های منوی فعال به ترتیب؛ دو مورد اول (سه مورد بدون چت) نمایش داده می‌شوند */
  readonly items = input<MobileBottomNavItem[]>([]);
  /** مرکز اعلان هدر؛ تب «اعلان» پنل همان را باز می‌کند */
  readonly notifications = input<NotificationCenterComponent | null>(null);
  /** منوی کامل (سایدبار) باز است */
  readonly moreOpen = input(false);

  readonly itemSelect = output<string>();
  readonly moreToggle = output<void>();
  /** چت یا اعلان باز شد؛ پوسته منوی کامل را می‌بندد */
  readonly overlayOpen = output<void>();

  readonly tabs = computed<BottomTab[]>(() => {
    const tabs: BottomTab[] = [];
    const chatOn = this.commService.isChatAvailable();
    const chatOpen = this.commService.isChatDrawerOpen();
    const notif = this.notifications();
    const notifOpen = !!notif?.isOpen();
    const moreOpen = this.moreOpen();
    const overlay = chatOpen || notifOpen || moreOpen;

    if (chatOn) {
      const n = this.commService.totalUnreadCount();
      tabs.push({
        kind: 'chat', id: 'chat', label: 'چت', title: 'پیام‌رسان سازمانی',
        ariaLabel: n > 0 ? `چت — پیام‌رسان سازمانی، ${n} پیام نخوانده` : 'چت — پیام‌رسان سازمانی',
        icon: PLATFORM_ENTITY_ICONS.chat, active: chatOpen, badge: badgeText(n),
        badgeClass: this.commService.hasNewIncomingPulse() ? 'animate-bounce bg-rose-600' : 'bg-blue-600', dot: false
      });
    }
    if (notif) {
      const n = notif.unreadCount();
      tabs.push({
        kind: 'notifications', id: 'notifications', label: 'اعلان', title: 'مرکز اعلان‌های سامانه',
        ariaLabel: n > 0 ? `اعلان — مرکز اعلان‌ها، ${n} اعلان خوانده‌نشده` : 'اعلان — مرکز اعلان‌ها',
        icon: PLATFORM_ENTITY_ICONS.notifications, active: notifOpen, badge: badgeText(n),
        badgeClass: notif.hasNewPulse() ? 'animate-bounce bg-rose-600' : 'bg-brand-600', dot: false
      });
    }
    const items = this.items().slice(0, chatOn ? 2 : 3);
    for (const it of items) {
      tabs.push({
        kind: 'item', id: 'item-' + it.id, label: it.label, title: it.title, ariaLabel: it.title,
        icon: it.icon, active: !overlay && it.active, badge: null, badgeClass: '', dot: false
      });
    }
    tabs.push({
      kind: 'more', id: 'more', label: 'بیشتر', title: 'منوی کامل', ariaLabel: 'بیشتر — منوی کامل',
      icon: ACTION_ICONS.more, active: moreOpen, badge: null, badgeClass: '',
      // صفحهٔ فعلی جزو تب‌های نوار نیست: نقطه روی «بیشتر»
      dot: !overlay && !items.some(i => i.active)
    });
    return tabs;
  });

  onTab(tab: BottomTab, event: MouseEvent): void {
    switch (tab.kind) {
      case 'chat':
        this.closeNotifications();
        this.overlayOpen.emit();
        this.commService.toggleChatDrawer();
        break;
      case 'notifications':
        this.closeChat();
        this.overlayOpen.emit();
        this.notifications()?.toggleDropdown(event);
        break;
      case 'item':
        this.closeChat();
        this.closeNotifications();
        this.itemSelect.emit(tab.id.slice('item-'.length));
        break;
      case 'more':
        this.closeChat();
        this.closeNotifications();
        this.moreToggle.emit();
        break;
    }
  }

  private closeChat(): void {
    if (this.commService.isChatDrawerOpen()) this.commService.toggleChatDrawer();
  }

  private closeNotifications(): void {
    this.notifications()?.isOpen.set(false);
  }
}
