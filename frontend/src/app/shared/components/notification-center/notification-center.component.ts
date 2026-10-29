import { Component, OnInit, OnDestroy, ElementRef, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';
import { WebSocketService } from '../../../core/http/websocket.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ModuleRegistryService } from '../../../core/modules/module-registry.service';
import { NotificationNavigationContext } from '../../../core/modules/module-contract';
import { CommunicationService } from '../../../core/services/communication.service';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { getPermissionAliases } from '../../../core/modules/permission-aliases';

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  target_model: string | null;
  target_id: string | null;
  url?: string | null;
  is_read: boolean;
  created_at: string;
}

/** فقط مسیرهای درون برنامه (`/app/...`)؛ آدرس بیرونی یا `//host` پذیرفته نمی‌شود. */
export function isInAppUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/app/') && !url.startsWith('//');
}

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    <div class="relative inline-block text-right select-none" dir="rtl" id="notification-center-root">
      <!-- Bell Icon Button with Badge -->
      <button
        type="button"
        (click)="toggleDropdown($event)"
        class="relative w-10 h-10 rounded-xl hover:bg-surface-muted dark:hover:bg-slate-800 text-fg-muted dark:text-slate-300 transition-all active:scale-95 cursor-pointer shrink-0 flex items-center justify-center tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        [ngClass]="{'bg-surface-muted dark:bg-slate-800 text-brand-600': isOpen()}"
        [attr.aria-expanded]="isOpen()"
        aria-controls="notification-center-panel"
        aria-haspopup="true"
        title="مرکز اعلان‌های سامانه"
        aria-label="مرکز اعلان‌های سامانه"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="bell"></svg>
        <span
          *ngIf="unreadCount() > 0"
          class="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 border-2 border-surface dark:border-slate-900 shadow-sm transition-all"
          [ngClass]="hasNewPulse() ? 'animate-bounce bg-rose-600 ring-2 ring-rose-300' : 'bg-brand-600'"
        >
          {{ unreadCount() > 99 ? '+99' : unreadCount() }}
        </span>
      </button>

      <!-- Dropdown Popover: در موبایل ثابت و تمام‌عرض تا از صفحه بیرون نزند -->
      <div
        *ngIf="isOpen()"
        id="notification-center-panel"
        data-back-closes
        class="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:left-0 mt-2 sm:w-96 bg-surface dark:bg-slate-900 rounded-2xl shadow-2xl border border-line dark:border-slate-800 overflow-hidden z-50 transition-all fade-in slide-in-from-top-2 duration-150"
      >
        <!-- Header -->
        <div class="px-4 py-1 min-h-10 bg-surface-muted/90 dark:bg-slate-800/80 border-b border-line dark:border-slate-700/80 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-black text-fg dark:text-white">مرکز اعلان‌ها</span>
            <span *ngIf="unreadCount() > 0" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
              {{ unreadCount() }} جدید
            </span>
          </div>
          <button
            *ngIf="unreadCount() > 0"
            type="button"
            (click)="markAllAsRead($event)"
            class="min-h-10 px-2 shrink-0 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 cursor-pointer transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            title="علامت‌گذاری همهٔ اعلان‌ها به عنوان خوانده‌شده"
          >
            خواندم همه
          </button>
        </div>

        <!-- Body: Notification List -->
        <div class="max-h-80 overflow-y-auto overflow-x-hidden divide-y divide-line-subtle dark:divide-slate-800/60">
          <div *ngIf="isLoading()" class="p-6 text-center text-xs text-fg-muted">
            در حال بارگذاری اعلان‌ها...
          </div>

          <div *ngIf="!isLoading() && notifications().length === 0" class="p-8 text-center text-fg-muted">
            <div class="w-10 h-10 mx-auto mb-2 text-fg-subtle dark:text-slate-600 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="bell"></svg>
            </div>
            <p class="text-xs font-medium">هیچ اعلانی یافت نشد.</p>
          </div>

          <div
            *ngFor="let item of notifications()"
            (click)="onNotificationClick(item)"
            (keydown.enter)="onRowKey($event, item)"
            (keydown.space)="onRowKey($event, item)"
            role="button"
            tabindex="0"
            class="notification-item p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 hover:bg-surface-muted/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex items-start gap-3"
            [ngClass]="{'bg-brand-50/40 dark:bg-brand-950/20': !item.is_read}"
          >
            <div
              class="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs shadow-sm mt-0.5"
              [ngClass]="item.is_read ? 'bg-surface-muted text-fg-muted dark:bg-slate-800 dark:text-slate-400' : 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300'"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="bell"></svg>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1 mb-1">
                <span class="text-xs font-bold text-fg dark:text-slate-200 truncate">{{ item.title }}</span>
                <span class="text-[10px] text-fg-muted shrink-0">{{ formatTimeAgo(item.created_at) }}</span>
              </div>
              <p class="text-[11px] text-fg-muted dark:text-slate-300 line-clamp-2 leading-relaxed break-words">{{ item.message }}</p>
            </div>

            <button
              *ngIf="!item.is_read"
              type="button"
              (click)="markAsRead(item, $event)"
              class="shrink-0 w-10 h-10 flex items-center justify-center text-fg-subtle hover:text-brand-600 dark:hover:text-brand-400 transition-colors rounded-lg hover:bg-surface dark:hover:bg-slate-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title="علامت‌گذاری به عنوان خوانده‌شده"
              aria-label="علامت‌گذاری به عنوان خوانده‌شده"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="check"></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private auth = inject(AuthService);
  private ws = inject(WebSocketService);
  private el = inject(ElementRef);
  private moduleRegistry = inject(ModuleRegistryService);
  private commService = inject(CommunicationService, { optional: true });

  isOpen = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  unreadCount = signal<number>(0);
  hasNewPulse = signal<boolean>(false);
  notifications = signal<NotificationItem[]>([]);

  static readonly REFRESH_DEBOUNCE_MS = 500;

  private sub: Subscription | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadUnreadCount();
    this.listenToWebSocket();
  }

  ngOnDestroy(): void {
    if (this.sub) {
      this.sub.unsubscribe();
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    if (this.isOpen() && !this.el.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    const nextState = !this.isOpen();
    this.isOpen.set(nextState);
    if (nextState) {
      this.hasNewPulse.set(false);
      this.loadNotifications();
    }
  }

  loadUnreadCount(): void {
    const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
    this.http.get<{ unread_count: number }>(`${environment.apiUrl}/notifications/unread-count/`, { context }).subscribe({
      next: (res) => {
        this.unreadCount.set(res.unread_count || 0);
      },
      error: () => {}
    });
  }

  loadNotifications(): void {
    this.isLoading.set(true);
    const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
    // اندپوینت صفحه‌بندی‌شده است و {count, results} برمی‌گرداند (DEF-12)
    this.http.get<NotificationItem[] | { results: NotificationItem[] }>(`${environment.apiUrl}/notifications/`, { context }).subscribe({
      next: (res) => {
        const items = Array.isArray(res) ? res : (res?.results ?? []);
        this.notifications.set(items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  markAsRead(item: NotificationItem, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (item.is_read) return;

    item.is_read = true;
    this.unreadCount.update((cnt) => Math.max(0, cnt - 1));

    const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
    this.http.post(`${environment.apiUrl}/notifications/${item.id}/mark-read/`, {}, { context }).subscribe({
      error: () => {}
    });
  }

  markAllAsRead(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const currentItems = this.notifications();
    currentItems.forEach((i) => (i.is_read = true));
    this.notifications.set([...currentItems]);
    this.unreadCount.set(0);

    const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
    this.http.post(`${environment.apiUrl}/notifications/mark-all-read/`, {}, { context }).subscribe({
      error: () => {}
    });
  }

  /** Enter/Space روی ردیف؛ کلیدی که از دکمهٔ «خوانده شد» درون ردیف بالا آمده نادیده گرفته می‌شود. */
  onRowKey(event: Event, item: NotificationItem): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.onNotificationClick(item);
  }

  onNotificationClick(item: NotificationItem): void {
    this.markAsRead(item);
    this.isOpen.set(false);

    // اگر آدرس مستقیم درون برنامه در پی‌لود اعلان وجود داشته باشد
    if (isInAppUrl(item.url)) {
      this.router.navigateByUrl(item.url);
      return;
    }

    // اعلان گفتگو / چت: باز کردن کشوی گفتگو
    if (item.target_model === 'Conversation' || item.notification_type === 'chat_message') {
      this.commService?.isChatDrawerOpen.set(true);
      return;
    }

    const { perms, isSuper } = this.userPerms();
    const context: NotificationNavigationContext = {
      item,
      http: this.http,
      router: this.router,
      userPerms: perms,
      isSuperuser: isSuper,
      permissionAliases: (capability: string) => getPermissionAliases(capability, this.moduleRegistry)
    };

    for (const entry of this.moduleRegistry.getExtensions('notificationHandlers')) {
      for (const handler of entry.extension) {
        if (handler.canHandle(item)) {
          handler.navigate(context);
          return;
        }
      }
    }
  }

  private userPerms(): { perms: string[]; isSuper: boolean } {
    const user = this.auth.user();
    return { perms: user?.permissions || [], isSuper: !!user?.is_superuser };
  }

  formatTimeAgo(isoString: string): string {
    if (!isoString) return '';
    try {
      const now = new Date().getTime();
      const date = new Date(isoString).getTime();
      const diffSec = Math.floor((now - date) / 1000);

      if (diffSec < 60) return 'هم‌اکنون';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} دقیقه پیش`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} ساعت پیش`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay} روز پیش`;
    } catch {
      return '';
    }
  }

  private listenToWebSocket(): void {
    this.sub = this.ws.notifications$.subscribe((msg) => {
      if (msg?.title || msg?.notification_id || msg?.type_str === 'personnel_workflow' || msg?.type_str === 'fleet_workflow') {
        this.hasNewPulse.set(true);
        this.scheduleRefresh();
      }
    });
  }

  /** شمارنده از سرور خوانده می‌شود (نه +۱ محلی)؛ پیام‌های پشت‌سرهم یک درخواست می‌سازند. */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.loadUnreadCount();
      if (this.isOpen()) {
        this.loadNotifications();
      }
    }, NotificationCenterComponent.REFRESH_DEBOUNCE_MS);
  }
}
