import { Component, OnInit, OnDestroy, ElementRef, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { WebSocketService } from '../../../core/http/websocket.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

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
        class="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all active:scale-95 cursor-pointer shrink-0 flex items-center justify-center"
        [ngClass]="{'bg-slate-100 dark:bg-slate-800 text-indigo-600': isOpen()}"
        title="مرکز اعلان‌های سامانه"
        aria-label="مرکز اعلان‌های سامانه"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="bell"></svg>
        <span
          *ngIf="unreadCount() > 0"
          class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 border-2 border-white dark:border-slate-900 shadow-sm transition-all"
          [ngClass]="hasNewPulse() ? 'animate-bounce bg-rose-600 ring-2 ring-rose-300' : 'bg-indigo-600'"
        >
          {{ unreadCount() > 99 ? '+99' : unreadCount() }}
        </span>
      </button>

      <!-- Dropdown Popover -->
      <div
        *ngIf="isOpen()"
        class="absolute left-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50 transition-all animate-in fade-in slide-in-from-top-2 duration-150"
      >
        <!-- Header -->
        <div class="px-4 py-3 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-slate-800 dark:text-white">مرکز اعلان‌ها</span>
            <span *ngIf="unreadCount() > 0" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              {{ unreadCount() }} جدید
            </span>
          </div>
          <button
            *ngIf="unreadCount() > 0"
            type="button"
            (click)="markAllAsRead($event)"
            class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer transition-colors"
          >
            خواندم همه
          </button>
        </div>

        <!-- Body: Notification List -->
        <div class="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          <div *ngIf="isLoading()" class="p-6 text-center text-xs text-slate-400">
            در حال بارگذاری اعلان‌ها...
          </div>

          <div *ngIf="!isLoading() && notifications().length === 0" class="p-8 text-center text-slate-400">
            <div class="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="bell"></svg>
            </div>
            <p class="text-xs font-medium">هیچ اعلانی یافت نشد.</p>
          </div>

          <div
            *ngFor="let item of notifications()"
            (click)="onNotificationClick(item)"
            class="p-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex items-start gap-3"
            [ngClass]="{'bg-indigo-50/30 dark:bg-indigo-950/20': !item.is_read}"
          >
            <div
              class="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs shadow-2xs mt-0.5"
              [ngClass]="item.is_read ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300'"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="bell"></svg>
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-1 mb-1">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{{ item.title }}</span>
                <span class="text-[10px] text-slate-400 shrink-0">{{ formatTimeAgo(item.created_at) }}</span>
              </div>
              <p class="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{{ item.message }}</p>
            </div>

            <button
              *ngIf="!item.is_read"
              type="button"
              (click)="markAsRead(item, $event)"
              class="shrink-0 p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-white dark:hover:bg-slate-700 shadow-2xs cursor-pointer"
              title="علامت‌گذاری به عنوان خوانده‌شده"
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

  isOpen = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  unreadCount = signal<number>(0);
  hasNewPulse = signal<boolean>(false);
  notifications = signal<NotificationItem[]>([]);

  private sub: Subscription | null = null;

  ngOnInit(): void {
    this.loadUnreadCount();
    this.listenToWebSocket();
  }

  ngOnDestroy(): void {
    if (this.sub) {
      this.sub.unsubscribe();
    }
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
    const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
    this.http.get<{ unread_count: number }>(`${environment.apiUrl}/notifications/unread-count/`, { headers }).subscribe({
      next: (res) => {
        this.unreadCount.set(res.unread_count || 0);
      },
      error: () => {}
    });
  }

  loadNotifications(): void {
    this.isLoading.set(true);
    const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
    // اندپوینت صفحه‌بندی‌شده است و {count, results} برمی‌گرداند (DEF-12)
    this.http.get<NotificationItem[] | { results: NotificationItem[] }>(`${environment.apiUrl}/notifications/`, { headers }).subscribe({
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

    const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
    this.http.post(`${environment.apiUrl}/notifications/${item.id}/mark-read/`, {}, { headers }).subscribe({
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

    const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
    this.http.post(`${environment.apiUrl}/notifications/mark-all-read/`, {}, { headers }).subscribe({
      error: () => {}
    });
  }

  onNotificationClick(item: NotificationItem): void {
    this.markAsRead(item);
    this.isOpen.set(false);

    // اگر آدرس مستقیم در پی‌لود اعلان وجود داشته باشد
    if (item.url) {
      this.router.navigateByUrl(item.url);
      return;
    }

    // ناوبری هوشمند برای پرونده‌های ناوگان و رانندگان (تسک ۴.۱ و ۴.۲)
    if (item.target_model === 'VehicleDriverProfile') {
      const targetId = Number(item.target_id);
      if (!item.target_id || !Number.isInteger(targetId) || targetId <= 0) {
        this.navigateByRoleForFleet();
        return;
      }
      const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
      this.http.get<any>(`${environment.apiUrl}/personnel/vehicles/${targetId}/`, { headers }).subscribe({
        next: (v) => this.navigateToFleet(v),
        error: () => this.navigateByRoleForFleet()
      });
      return;
    }

    // ناوبری هوشمند بر اساس مدل هدف و شناسهٔ آن (تسک ۴.۴، تصمیم ۶.۷ و DEF-12):
    // پرونده خوانده می‌شود و کاربر به کارتابل مرحلهٔ فعلی همان پرونده، فیلترشده روی همان پرونده، می‌رود.
    if (item.target_model !== 'PersonnelProfile') return;
    const targetId = Number(item.target_id);
    if (!item.target_id || !Number.isInteger(targetId) || targetId <= 0) {
      this.navigateByRole();
      return;
    }
    const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
    this.http.get<any>(`${environment.apiUrl}/personnel/profiles/${targetId}/`, { headers }).subscribe({
      next: (p) => this.navigateToPersonnel(p),
      // پروندهٔ پاک‌شده یا بیرون از قلمرو: فقط به کارتابل نقش کاربر برو
      error: () => this.navigateByRole()
    });
  }

  private userPerms(): { perms: string[]; isSuper: boolean } {
    const user = this.auth.user();
    return { perms: user?.permissions || [], isSuper: !!user?.is_superuser };
  }

  private navigateToFleet(v: any): void {
    const { perms, isSuper } = this.userPerms();
    const has = (...codes: string[]) => isSuper || codes.some(c => perms.includes(c));
    const q = v?.plate_number || '';
    switch (v?.approval_status) {
      case 'pending_manager':
        if (has('perm_approve_fleet_manager', 'can_act_as_manager', 'can_act_as_company_manager')) {
          this.router.navigate(['/app/finance/manager-fleet'], { queryParams: { tab: 'new', q } });
          return;
        }
        break;
      case 'pending_accountant':
        if (has('perm_approve_fleet_finance', 'can_act_as_accountant', 'view_sys_fleet_settlement')) {
          this.router.navigate(['/app/finance/accountant-fleet'], { queryParams: { tab: 'new', q } });
          return;
        }
        break;
      case 'pending_supervisor':
        if (has('perm_approve_fleet_supervisor', 'can_act_as_workshop_supervisor', 'perm_approve_fleet_manager', 'can_act_as_manager')) {
          this.router.navigate(['/app/finance/supervisor-fleet'], { queryParams: { tab: 'new', q } });
          return;
        }
        break;
    }
    if (v?.approval_status === 'approved' || v?.approval_status === 'end_collaboration') {
      this.router.navigate(['/app/finance/employee-fleet'], {
        queryParams: { ...(v?.section ? { section_id: v.section } : {}), search: q || null }
      });
      return;
    }
    this.router.navigate(['/app/finance/employee-new-vehicle'], {
      queryParams: { ...(v?.section ? { section_id: v.section } : {}), search: q || null, id: v?.id || null }
    });
  }

  private navigateByRoleForFleet(): void {
    const { perms, isSuper } = this.userPerms();
    if (isSuper || perms.includes('perm_approve_fleet_manager') || perms.includes('can_act_as_manager')) {
      this.router.navigate(['/app/finance/manager-fleet']);
    } else if (perms.includes('perm_approve_fleet_finance') || perms.includes('can_act_as_accountant') || perms.includes('view_sys_fleet_settlement')) {
      this.router.navigate(['/app/finance/accountant-fleet']);
    } else if (perms.includes('perm_approve_fleet_supervisor') || perms.includes('can_act_as_workshop_supervisor')) {
      this.router.navigate(['/app/finance/supervisor-fleet']);
    } else {
      this.router.navigate(['/app/finance/employee-new-vehicle']);
    }
  }

  private navigateToPersonnel(p: any): void {
    const { perms, isSuper } = this.userPerms();
    const has = (...codes: string[]) => isSuper || codes.some(c => perms.includes(c));
    const q = p?.national_code || '';
    switch (p?.approval_status) {
      case 'pending_manager':
        if (has('perm_approve_personnel_manager', 'can_act_as_manager', 'can_act_as_company_manager')) {
          this.router.navigate(['/app/finance/manager-personnel'], { queryParams: { tab: 'new', q } });
          return;
        }
        break;
      case 'pending_accountant':
        if (has('perm_approve_personnel_finance')) {
          this.router.navigate(['/app/finance/accountant-personnel'], { queryParams: { tab: 'new', q } });
          return;
        }
        break;
      case 'pending_supervisor':
        if (has('perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'perm_approve_personnel_manager', 'can_act_as_manager')) {
          this.router.navigate(['/app/finance/supervisor-personnel'], { queryParams: { tab: 'new', q } });
          return;
        }
        break;
    }
    // پیش‌نویس، عودت‌شده، مصوب یا ردشده: صفحهٔ بخش پرونده
    this.router.navigate(['/app/finance/employee-new-personnel'], {
      queryParams: { ...(p?.section ? { section_id: p.section } : {}), search: q || null }
    });
  }

  private navigateByRole(): void {
    const { perms, isSuper } = this.userPerms();
    if (isSuper || perms.includes('perm_approve_personnel_manager') || perms.includes('can_act_as_manager')) {
      this.router.navigate(['/app/finance/manager-personnel']);
    } else if (perms.includes('perm_approve_personnel_finance')) {
      this.router.navigate(['/app/finance/accountant-personnel']);
    } else if (perms.includes('perm_approve_personnel_supervisor') || perms.includes('can_act_as_workshop_supervisor')) {
      this.router.navigate(['/app/finance/supervisor-personnel']);
    } else {
      this.router.navigate(['/app/finance/employee-new-personnel']);
    }
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
      if (msg?.type_str === 'personnel_workflow' || msg?.type_str === 'fleet_workflow' || msg?.notification_id) {
        this.unreadCount.update((cnt) => cnt + 1);
        this.hasNewPulse.set(true);
        if (this.isOpen()) {
          this.loadNotifications();
        }
      }
    });
  }
}
