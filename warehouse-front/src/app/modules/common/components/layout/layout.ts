import { Component, OnInit, OnDestroy, computed, ChangeDetectorRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { StateService } from '../../../../services/state.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { WarehouseHttpService } from '../../../../core/http/warehouse-http.service';
import { NetworkStatusService, ConnectionState } from '../../../../core/services/network-status.service';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { SyncErrorEntry } from '../../../../core/services/offline-db';
import { ConfigApiService } from '../../../../core/api/config-api.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { UserMenuComponent } from '../../../../shared/components/user-menu/user-menu.component';
import { AccountsHttpService } from '../../../../core/http/accounts-http.service';
import { NavigationHistoryService } from '../../../../core/services/navigation-history.service';
import { OfflinePendingBadgeComponent } from '../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { ChatDrawerComponent } from '../communications/chat-drawer/chat-drawer.component';
import { CommunicationService } from '../../../../core/services/communication.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { AppRoleSwitcherComponent } from '../../../../shared/components/app-role-switcher/app-role-switcher.component';
import { CompanySwitcherComponent } from '../organization/company-switcher/company-switcher';
import { CompanySelectionModalComponent } from '../organization/company-selection-modal/company-selection-modal';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { FirstBootWizardComponent } from '../operations/first-boot-wizard/first-boot-wizard';
import { environment } from '../../../../../environments/environment';
import { hasRoutePermission } from '../../../../core/auth/auth.guard';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { ModuleNavItem } from '../../../../core/modules/module-contract';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { IconName } from '../../../../shared/icons/icon-registry';
import { NotificationCenterComponent } from '../../../../shared/components/notification-center/notification-center.component';

@Component({
  selector: 'app-layout',
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    UserMenuComponent,
    OfflinePendingBadgeComponent,
    NotificationCenterComponent,
    ChatDrawerComponent,
    AppRoleSwitcherComponent,
    CompanySwitcherComponent,
    CompanySelectionModalComponent,
    FirstBootWizardComponent,
    SvgIconDirective
  ],
  templateUrl: './layout.html',
  styleUrl: './layout.css'
})
export class Layout implements OnInit, OnDestroy {
  public commService = inject(CommunicationService);
  public wsService = inject(WebSocketService);
  public personaService = inject(AppPersonaService);
  public moduleRegistry = inject(ModuleRegistryService);
  public activeCompanyService = inject(ActiveCompanyService);

  get appTitle(): string {
    if (this.personaService.activeApp() === 'personnel') {
      return 'سامانه مالی و پرسنلی';
    }
    if (this.personaService.activeApp() === 'operations') {
      return 'مرکز عملیات و پدافند';
    }
    return 'اتوماسیون انبارداری';
  }

  currentTitle = 'داشبورد مانیتورینگ';
  isUserMenuOpen = false;
  isShortcutsHelpOpen = false;
  shortcutsSearchQuery = '';
  shortcutsActiveCategory: string = 'all';
  isDesktopSidebarCollapsed = typeof localStorage !== 'undefined' ? localStorage.getItem('desktopSidebarCollapsed') === 'true' : false;

  shortcutsCategories = [
    { id: 'all', label: 'همه کلیدها', count: 20 },
    { id: 'global', label: 'عمومی و منو', count: 5 },
    { id: 'counting', label: 'انبارگردانی و اسکنر', count: 5 },
    { id: 'table', label: 'جدول اطلاعات و فرم‌ها', count: 5 },
    { id: 'design', label: 'طراحی لیبل و کارت', count: 5 },
  ];

  allShortcuts = [
    // Global & Navigation
    {
      category: 'global',
      categoryLabel: 'عمومی',
      categoryColor: 'indigo',
      title: 'صفحه قبل (Back)',
      description: 'بازگشت به صفحه قبلی در تاریخچه ناوبری',
      keys: ['Alt', '→'],
      altKeys: null,
    },
    {
      category: 'global',
      categoryLabel: 'عمومی',
      categoryColor: 'indigo',
      title: 'صفحه بعد (Forward)',
      description: 'حرکت به صفحه بعدی در تاریخچه ناوبری',
      keys: ['Alt', '←'],
      altKeys: null,
    },
    {
      category: 'global',
      categoryLabel: 'عمومی',
      categoryColor: 'indigo',
      title: 'جمع / باز کردن منو',
      description: 'تغییر وضعیت نمایش نوار کناری (Sidebar)',
      keys: ['Ctrl', 'B'],
      altKeys: null,
    },
    {
      category: 'global',
      categoryLabel: 'عمومی',
      categoryColor: 'indigo',
      title: 'بستن پنجره / انصراف',
      description: 'بستن تمام مودال‌ها، پنجره‌ها و منوهای باز',
      keys: ['Esc'],
      altKeys: null,
    },
    {
      category: 'global',
      categoryLabel: 'عمومی',
      categoryColor: 'indigo',
      title: 'راهنمای کلیدها',
      description: 'نمایش پنجره راهنمای کلیدهای میانبر',
      keys: ['Shift', '?'],
      altKeys: ['F1'],
    },

    // Counting & Scanner
    {
      category: 'counting',
      categoryLabel: 'انبارگردانی',
      categoryColor: 'emerald',
      title: 'ثبت فوری شمارش',
      description: 'ثبت مقدار وارد شده در کادر و ذخیره پیش‌نویس',
      keys: ['Enter'],
      altKeys: ['Ctrl', 'Enter'],
    },
    {
      category: 'counting',
      categoryLabel: 'انبارگردانی',
      categoryColor: 'emerald',
      title: 'فوکوس روی بارکدخوان',
      description: 'انتقال سریع مکان‌نما به کادر اسکنر بارکد',
      keys: ['F2'],
      altKeys: ['Alt', 'B'],
    },
    {
      category: 'counting',
      categoryLabel: 'انبارگردانی',
      categoryColor: 'emerald',
      title: 'تب تسک‌های من',
      description: 'سوئیچ سریع به فهرست کالاهای تخصیص‌یافته',
      keys: ['Alt', '1'],
      altKeys: null,
    },
    {
      category: 'counting',
      categoryLabel: 'انبارگردانی',
      categoryColor: 'emerald',
      title: 'تب مخزن کالاها',
      description: 'سوئیچ سریع به فهرست مخزن آزاد کالاها',
      keys: ['Alt', '2'],
      altKeys: null,
    },
    {
      category: 'counting',
      categoryLabel: 'انبارگردانی',
      categoryColor: 'emerald',
      title: 'تایید سریع کالاها (Approve)',
      description: 'تایید کالاهای انتخاب‌شده در کارتابل سرپرست و مدیر',
      keys: ['A'],
      altKeys: null,
    },

    // Table & Dialogs
    {
      category: 'table',
      categoryLabel: 'جدول اطلاعات',
      categoryColor: 'blue',
      title: 'ذخیره تغییرات جدول',
      description: 'ثبت و اعمال نهایی تمامی ویرایش‌های انجام‌شده در سلول‌ها',
      keys: ['Ctrl', 'S'],
      altKeys: null,
    },
    {
      category: 'table',
      categoryLabel: 'جدول اطلاعات',
      categoryColor: 'blue',
      title: 'لغو آخرین تغییر (Undo)',
      description: 'بازگردانی آخرین ویرایش سلول جدول به مقدار قبل',
      keys: ['Ctrl', 'Z'],
      altKeys: null,
    },
    {
      category: 'table',
      categoryLabel: 'جدول اطلاعات',
      categoryColor: 'blue',
      title: 'تکرار تغییر (Redo)',
      description: 'اعمال مجدد تغییری که لغو شده بود',
      keys: ['Ctrl', 'Y'],
      altKeys: null,
    },
    {
      category: 'table',
      categoryLabel: 'جدول اطلاعات',
      categoryColor: 'blue',
      title: 'انتخاب همه سطرها',
      description: 'انتخاب یا لغو انتخاب تمامی ردیف‌های جدول',
      keys: ['Ctrl', 'A'],
      altKeys: null,
    },
    {
      category: 'table',
      categoryLabel: 'دیالوگ‌ها',
      categoryColor: 'blue',
      title: 'تایید در دیالوگ‌ها',
      description: 'تایید عملیات در پنجره‌های حذف، خروج و پیام‌ها',
      keys: ['Enter'],
      altKeys: null,
    },

    // Design & Canvas
    {
      category: 'design',
      categoryLabel: 'طراحی',
      categoryColor: 'purple',
      title: 'جابجایی دقیق المان (Nudge)',
      description: 'حرکت دادن المان روی بوم به اندازه ۱ میلی‌متر',
      keys: ['↑', '↓', '←', '→'],
      altKeys: null,
    },
    {
      category: 'design',
      categoryLabel: 'طراحی',
      categoryColor: 'purple',
      title: 'جابجایی سریع المان',
      description: 'حرکت دادن سریع المان روی بوم به اندازه ۵ میلی‌متر',
      keys: ['Shift', '↑↓←→'],
      altKeys: null,
    },
    {
      category: 'design',
      categoryLabel: 'طراحی',
      categoryColor: 'purple',
      title: 'کپی و جایگذاری المان',
      description: 'تکثیر و کپی کردن المان انتخاب‌شده روی بوم',
      keys: ['Ctrl', 'C'],
      altKeys: ['Ctrl', 'V'],
    },
    {
      category: 'design',
      categoryLabel: 'کارت پرسنلی',
      categoryColor: 'purple',
      title: 'چرخش سه‌بعدی کارت',
      description: 'چرخش کارت بین نمای رو (Front) و پشت (Back)',
      keys: ['Space'],
      altKeys: ['F'],
    },
    {
      category: 'design',
      categoryLabel: 'چاپ',
      categoryColor: 'purple',
      title: 'چاپ شیت / کارت',
      description: 'ارسال مستقیم شیت آماده یا کارت به پرینتر',
      keys: ['Ctrl', 'P'],
      altKeys: null,
    },
  ];

  get filteredShortcuts() {
    return this.allShortcuts.filter(item => {
      const matchCat = this.shortcutsActiveCategory === 'all' || item.category === this.shortcutsActiveCategory;
      if (!matchCat) return false;
      if (!this.shortcutsSearchQuery.trim()) return true;
      const q = this.shortcutsSearchQuery.toLowerCase().trim();
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.keys.some(k => k.toLowerCase().includes(q)) ||
        (item.altKeys && item.altKeys.some((k: string) => k.toLowerCase().includes(q)))
      );
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    // Escape: close shortcuts modal, user menu, sync errors
    if (event.key === 'Escape') {
      if (this.isShortcutsHelpOpen) {
        event.preventDefault();
        this.isShortcutsHelpOpen = false;
        this.cdr.detectChanges();
        return;
      }
      if (this.isUserMenuOpen) {
        event.preventDefault();
        this.isUserMenuOpen = false;
        this.cdr.detectChanges();
        return;
      }
      if (this.isSyncErrorsOpen) {
        event.preventDefault();
        this.isSyncErrorsOpen = false;
        this.cdr.detectChanges();
        return;
      }
    }

    // Ctrl+B: Toggle desktop sidebar
    if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'B')) {
      event.preventDefault();
      this.toggleDesktopSidebar();
      return;
    }

    // Shift + ? or F1: Show Shortcuts Cheatsheet Modal
    if (!isInsideInput) {
      if (event.key === '?' || event.key === '؟' || event.key === 'F1') {
        event.preventDefault();
        this.toggleShortcutsHelp();
      }
    }
  }

  toggleShortcutsHelp() {
    this.isShortcutsHelpOpen = !this.isShortcutsHelpOpen;
    this.cdr.detectChanges();
  }

  toggleChatDrawer() {
    const nextState = !this.commService.isChatDrawerOpen();
    this.commService.isChatDrawerOpen.set(nextState);
    if (nextState) {
      this.commService.hasNewIncomingPulse.set(false);
      const active = this.commService.activeConversation$.value;
      if (active) {
        this.commService.markAsRead(active.id);
      }
    } else {
      this.commService.closeActiveConversation();
    }
    this.cdr.detectChanges();
  }

  // ─── Offline / Sync UI ───
  /** وضعیت سه‌حالته اتصال: online | server-unreachable | offline */
  connectionState: ConnectionState = 'online';
  isOffline = false;
  isSyncing = false;
  pendingCount = 0;
  syncErrorCount = 0;
  syncErrors: SyncErrorEntry[] = [];
  isSyncErrorsOpen = false;
  lastSyncTime: number | null = null;
  syncSuccessMessage: string | null = null;
  pullProgress: { current: number, total: number | null, bytes: number } | null = null;
  isPulling = false;
  deepUpdateState: {
    isActive: boolean;
    mode: 'current' | 'all';
    totalWarehouses: number;
    currentIndex: number;
    currentWarehouseName: string;
  } | null = null;
  private syncSuccessTimer: any = null;
  private baseTitle = document.title;
  private offlineSubs: Subscription[] = [];

  toggleDesktopSidebar() {
    this.isDesktopSidebarCollapsed = !this.isDesktopSidebarCollapsed;
    localStorage.setItem('desktopSidebarCollapsed', String(this.isDesktopSidebarCollapsed));
    this.cdr.detectChanges();
  }

  toggleUserMenu() {
    this.isUserMenuOpen = !this.isUserMenuOpen;
    this.cdr.detectChanges();
  }

  closeUserMenu() {
    this.isUserMenuOpen = false;
    this.cdr.detectChanges();
  }

  isAvatarModalOpen = false;
  isSavingAvatar = false;

  openAvatarModal() {
    this.isAvatarModalOpen = true;
    this.closeUserMenu();
  }

  onSaveAvatar(blob: Blob) {
    this.isSavingAvatar = true;
    this.accountsService.updateMyAvatar(blob).subscribe({
      next: (res) => {
        this.isSavingAvatar = false;
        this.isAvatarModalOpen = false;
        this.auth.updateUserAvatar(res.avatar);
        this.toast.show('success', 'تصویر پروفایل شما با موفقیت بروزرسانی شد.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSavingAvatar = false;
        const msg = err.error?.error || 'خطا در بارگذاری تصویر پروفایل';
        this.toast.show('error', msg);
        this.cdr.detectChanges();
      }
    });
  }

  onRemoveAvatar() {
    this.isSavingAvatar = true;
    this.accountsService.deleteMyAvatar().subscribe({
      next: () => {
        this.isSavingAvatar = false;
        this.isAvatarModalOpen = false;
        this.auth.updateUserAvatar(null);
        this.toast.show('success', 'تصویر پروفایل حذف شد.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isSavingAvatar = false;
        this.toast.show('error', 'خطا در حذف تصویر پروفایل');
        this.cdr.detectChanges();
      }
    });
  }

  /** لیست پروژه‌ها از StateService خوانده می‌شود */

  /** آیکن‌های منوی کناری؛ محتوایشان در رجیستری مشترک است (shared/icons/icon-registry.ts). */
  private static readonly MENU_ICON_NAMES: ReadonlySet<string> = new Set([
    'grid', 'archive', 'badge', 'users', 'file-text', 'tag', 'folder', 'upload-cloud', 'settings',
    'clipboard', 'printer', 'check-circle', 'download', 'alert-triangle', 'check-square', 'database',
    'activity', 'bar-chart-2', 'truck', 'dollar-sign', 'credit-card', 'briefcase',
    'calendar', 'user-plus', 'file-check', 'id-card', 'calculator', 'lock', 'clipboard-check',
    'columns', 'book', 'package', 'barcode', 'globe', 'file-lines', 'server', 'user-circle', 'building',
  ]);

  /**
   * نام آیکن منو اگر جزو آیکن‌های منو باشد، وگرنه fallback؛ همان رفتار قبلی
   * `icons[name] || icons[fallback]` (بدون fallback یعنی بدون آیکن).
   */
  menuIcon(name: string | undefined, fallback: IconName | null = null): IconName | null {
    return name && Layout.MENU_ICON_NAMES.has(name) ? (name as IconName) : fallback;
  }

  isOrgAdminMenuOpen = localStorage.getItem('isOrgAdminMenuOpen') !== 'false';

  toggleOrgAdminMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.isOrgAdminMenuOpen = !this.isOrgAdminMenuOpen;
    localStorage.setItem('isOrgAdminMenuOpen', String(this.isOrgAdminMenuOpen));
    this.cdr.detectChanges();
  }

  isEmployeeMenuOpen = localStorage.getItem('isEmployeeMenuOpen') !== 'false';

  toggleEmployeeMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.isEmployeeMenuOpen = !this.isEmployeeMenuOpen;
    localStorage.setItem('isEmployeeMenuOpen', String(this.isEmployeeMenuOpen));
    this.cdr.detectChanges();
  }

  isSupervisorMenuOpen = localStorage.getItem('isSupervisorMenuOpen') !== 'false';

  toggleSupervisorMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.isSupervisorMenuOpen = !this.isSupervisorMenuOpen;
    localStorage.setItem('isSupervisorMenuOpen', String(this.isSupervisorMenuOpen));
    this.cdr.detectChanges();
  }

  isAccountantMenuOpen = localStorage.getItem('isAccountantMenuOpen') !== 'false';

  toggleAccountantMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.isAccountantMenuOpen = !this.isAccountantMenuOpen;
    localStorage.setItem('isAccountantMenuOpen', String(this.isAccountantMenuOpen));
    this.cdr.detectChanges();
  }

  isManagerMenuOpen = localStorage.getItem('isManagerMenuOpen') !== 'false';

  toggleManagerMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.isManagerMenuOpen = !this.isManagerMenuOpen;
    localStorage.setItem('isManagerMenuOpen', String(this.isManagerMenuOpen));
    this.cdr.detectChanges();
  }

  isTreasurerMenuOpen = localStorage.getItem('isTreasurerMenuOpen') !== 'false';

  toggleTreasurerMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.isTreasurerMenuOpen = !this.isTreasurerMenuOpen;
    localStorage.setItem('isTreasurerMenuOpen', String(this.isTreasurerMenuOpen));
    this.cdr.detectChanges();
  }

  private getRoleNavConfig(role: string): { items: ModuleNavItem[]; roleMarkers: string[] } | null {
    for (const e of this.moduleRegistry.getExtensions('layoutNav')) {
      const found = e.extension.roleMenus?.find(m => m.role === role);
      if (found) return found;
    }
    return null;
  }

  private openRoleMenusForTab(tab: string): void {
    const roleMenuTabs: { role: string; extraTabs: string[]; open: () => void }[] = [
      { role: 'org_admin', extraTabs: [], open: () => (this.isOrgAdminMenuOpen = true) },
      { role: 'operator', extraTabs: [], open: () => (this.isEmployeeMenuOpen = true) },
      { role: 'supervisor', extraTabs: ['supervisor-attendance', 'supervisor-new-profiles'], open: () => (this.isSupervisorMenuOpen = true) },
      { role: 'accountant', extraTabs: ['accountant-new-profiles'], open: () => (this.isAccountantMenuOpen = true) },
      { role: 'manager', extraTabs: ['manager-contracts'], open: () => (this.isManagerMenuOpen = true) },
      { role: 'treasury', extraTabs: [], open: () => (this.isTreasurerMenuOpen = true) },
    ];
    for (const menu of roleMenuTabs) {
      const cfg = this.getRoleNavConfig(menu.role);
      const tabs = [...(cfg?.items.map(i => i.id) || []), ...menu.extraTabs];
      if (tabs.includes(tab)) {
        menu.open();
      }
    }
  }

  private get systemNavItems(): ModuleNavItem[] {
    const ext = this.moduleRegistry.getExtensions('layoutNav').find(e => e.extension.primaryItems);
    return ext?.extension.primaryItems || [];
  }

  private get warehouseNavItems(): ModuleNavItem[] {
    const ext = this.moduleRegistry.getExtensions('layoutNav').find(e => e.extension.contextItems);
    return ext?.extension.contextItems || [];
  }

  private lastHandledCompanyId: number | null = null;

  constructor(
    public auth: AuthService,
    public store: AuthStore,
    public state: StateService,
    private confirmDialog: ConfirmDialogService,
    private router: Router,
    private whService: WarehouseHttpService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private configApi: ConfigApiService,
    private accountsService: AccountsHttpService,
    public navHistory: NavigationHistoryService
  ) {
    // Track current tab from modular URL
    const parseTabFromUrl = (url: string): string => {
      const clean = (url || '').split('?')[0];
      const segments = clean.split('/').filter(Boolean);
      if (segments[0] === 'app' && segments[2]) {
        return segments[2];
      }
      if (segments[0] && segments[0] !== 'app') {
        return segments[0];
      }
      return 'dashboard';
    };

    const initialTab = parseTabFromUrl(this.router.url);
    this.store.setCurrentTab(initialTab);
    this.openRoleMenusForTab(initialTab);

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((e) => {
      const tab = parseTabFromUrl(e.urlAfterRedirects || e.url);
      this.store.setCurrentTab(tab);
      this.updateTitle(tab);
      this.openRoleMenusForTab(tab);
    });
  }

  private handleWarehousesLoaded(data: any[]): void {
    const warehouseList = Array.isArray(data) ? data : [];
    this.state.appState.projects = warehouseList;

    // خودترمیمی انبار فعال در صورتی که انبار قبلی حذف یا نامعتبر شده باشد
    this.store.sanitizeActiveWarehouse(warehouseList);
    this.state.appState.activeWarehouseId = this.store.activeWarehouseId() as any;

    this.cdr.markForCheck();
  }

  ngOnInit() {
    // بارگذاری شرکت‌های مجاز کاربر و انتخاب خودکار / نمایش مودال انتخاب
    this.activeCompanyService.loadAvailableCompanies().subscribe();

    // شنود تغییر شرکت کاری جهت بارگذاری منحصربه‌فرد انبارهای شرکت جدید و ارزیابی دسترسی
    this.offlineSubs.push(
      this.activeCompanyService.activeCompany$.subscribe((company) => {
        if (!company) return;
        this.personaService.sanitizeActiveRole();

        const currentUrl = (this.router.url || '').split('?')[0];
        const isInitialCompanyLoad = this.lastHandledCompanyId === null;
        const hasCompanySwitched = !isInitialCompanyLoad && this.lastHandledCompanyId !== company.id;
        this.lastHandledCompanyId = company.id;

        if (currentUrl.startsWith('/app/warehouse') && company.has_warehouse_module === false) {
          this.toast.show(
            'warning',
            `شرکت «${company.name}» فاقد سامانه انبارداری است. هدایت به سامانه مالی انجام شد.`
          );
          this.router.navigate(['/app/finance']);
          return;
        }

        if (this.hasWarehouseSwitcher && company.has_warehouse_module !== false) {
          this.whService.getAll().subscribe({
            next: (data) => this.handleWarehousesLoaded(data),
            error: () => {}
          });

          // در صورت تغییر صریح شرکت توسط کاربر و حضور در صفحات عمیق انبارداری (مانند شمارشگر یا اسناد)، بازگشت به داشبورد
          if (hasCompanySwitched && currentUrl.startsWith('/app/warehouse') && currentUrl !== '/app/warehouse/dashboard' && currentUrl !== '/app/warehouse/settings') {
            this.router.navigate(['/app/warehouse/dashboard']);
          }
        }
      })
    );

    this.offlineSubs.push(
      this.activeCompanyService.documentCompanies$.subscribe(() => {
        this.cdr.markForCheck();
      })
    );

    // دریافت لیست انبارها از بک‌اند (با خودترمیمی آنی در صورت حذف یا نامعتبر شدن انبار فعال)
    if (this.hasWarehouseSwitcher) {
      this.whService.getAll().subscribe({
        next: (data) => {
          this.handleWarehousesLoaded(data);

          // راه‌اندازی سراسری وب‌سوکت پیام‌رسان و بارگذاری پیام‌های خوانده‌نشده
          const initWhId = this.store.activeWarehouseId() === 'ALL' ? undefined : Number(this.store.activeWarehouseId());
          this.commService.ensureConnected(initWhId);
          this.commService.loadConversations(initWhId);
          this.commService.requestNotificationPermission();
        },
        error: () => {}
      });
    } else {
      // در حالت حسابداری تنها یا عدم حضور ماژول انبار، پیام‌رسان بدون قفل شدن بر انبار متصل می‌شود
      this.commService.ensureConnected();
      this.commService.loadConversations();
      this.commService.requestNotificationPermission();
    }

    // ─── Subscribe to offline/sync observables ───
    const network = NetworkStatusService.getInstance();
    const syncService = OfflineSyncService.getInstance();

    // شنود پاسخ‌های پس‌زمینه SWR برای به‌روزرسانی زنده لیست انبارها بدون نیاز به رفرش
    this.offlineSubs.push(
      syncService.liveDataUpdates$.subscribe(({ url, data }) => {
        if (url && (url.includes('/warehouses/') || url.includes('/api/warehouses/'))) {
          if (Array.isArray(data)) {
            this.handleWarehousesLoaded(data);
          }
        }
      })
    );

    // نشست‌های طولانی ممکن است روزها باز بمانند و تنظیمات ادمین را از دست بدهند
    this.configApi.getPublicConfig().subscribe({
      next: (config) => syncService.applyRemoteConfig(config),
      error: () => {},
    });

    this.offlineSubs.push(
      network.state$.subscribe((state) => {
        this.connectionState = state;
        const wasOffline = this.isOffline;
        // «آفلاین» از دید کاربر یعنی «سرور در دسترس نیست» —
        // چه اینترنت قطع باشد چه سرور خاموش
        this.isOffline = state !== 'online';
        document.title = this.isOffline ? `📴 آفلاین — ${this.baseTitle}` : this.baseTitle;

        // اگر از حالت آفلاین به آنلاین برگشتیم: استعلام سبک پس‌زمینه برای جبران تغییرات زمان قطعی
        if (wasOffline && state === 'online') {
          if (this.hasWarehouseSwitcher) {
            console.log('[Layout] 🌐 اتصال مجدد شبکه — استعلام سبک پس‌زمینه...');
            this.whService.getAll().subscribe({
              next: (data) => this.handleWarehousesLoaded(data),
              error: () => {}
            });
          }
        }
        this.cdr.detectChanges();
      })
    );

    // خودترمیمی و اعلان شفاف به کاربر هنگام رد شدن درخواست از صف همگام‌سازی
    this.offlineSubs.push(
      syncService.rejected$.subscribe((err) => {
        const reason = err.serverMessage || 'تداخل یا خطای اعتبارسنجی سرور';
        this.toast.show(
          'warning',
          `تغییر شما به دلیل «${reason}» توسط سرور رد شد و داده‌ها به آخرین نسخه سرور بازگردانی شدند.`
        );
        // استعلام تازه برای اطمینان از همگامی کامل نما
        if (this.hasWarehouseSwitcher) {
          this.whService.getAll().subscribe({
            next: (data) => this.handleWarehousesLoaded(data),
            error: () => {}
          });
        }
      })
    );

    // شنود رویدادهای زنده تغییرات انبار از طریق وب‌سوکت برای همگام‌سازی بلادرنگ همه کلاینت‌ها
    this.offlineSubs.push(
      this.wsService.notifications$.subscribe(async (data: any) => {
        if (this.hasWarehouseSwitcher && data && (data.event === 'warehouse_mutation' || data.type === 'warehouse_mutation')) {
          console.log('[Layout] 🔔 دریافت رویداد تغییرات انبار از وب‌سوکت:', data);
          await syncService.invalidateCache(`${environment.apiUrl}/warehouses/`);
          this.whService.getAll().subscribe({
            next: (warehouses) => {
              this.handleWarehousesLoaded(warehouses);
              if (data.action === 'DELETE' && String(data.warehouse_id) === String(this.store.activeWarehouseId())) {
                this.toast.show(
                  'warning',
                  `انبار «${data.warehouse_name || ''}» توسط مدیر حذف شد؛ انبار فعال شما به‌روزرسانی شد.`
                );
              } else if (data.action === 'TOGGLE_FREEZE' && String(data.warehouse_id) === String(this.store.activeWarehouseId())) {
                this.toast.show(
                  'info',
                  `وضعیت فعالیت انبار «${data.warehouse_name || ''}» به‌روزرسانی شد.`
                );
              }
            }
          });
        }
      })
    );

    // بازخورد همگام‌سازی خودکار (وقتی کاربر دکمه‌ای نزده و اتصال خودش برگشته)
    this.offlineSubs.push(
      syncService.syncOutcome$.subscribe((outcome) => {
        if (outcome.status !== 'completed') return;
        this.syncSuccessMessage = `${outcome.synced} مورد با موفقیت به سرور ارسال شد.`;
        clearTimeout(this.syncSuccessTimer);
        this.syncSuccessTimer = setTimeout(() => {
          this.syncSuccessMessage = null;
          this.cdr.detectChanges();
        }, 5000);
        this.cdr.detectChanges();
      })
    );

    this.offlineSubs.push(
      syncService.isSyncing$.subscribe((syncing) => {
        this.isSyncing = syncing;
        this.cdr.detectChanges();
      })
    );

    this.offlineSubs.push(
      syncService.pendingCount$.subscribe((count) => {
        this.pendingCount = count;
        this.cdr.detectChanges();
      })
    );

    this.offlineSubs.push(
      syncService.errorCount$.subscribe((count) => {
        this.syncErrorCount = count;
        this.cdr.detectChanges();
      })
    );

    this.offlineSubs.push(
      syncService.lastSyncTime$.subscribe((time) => {
        this.lastSyncTime = time;
        this.cdr.detectChanges();
      })
    );

    this.offlineSubs.push(
      syncService.pullProgress$.subscribe((progress: any) => {
        this.pullProgress = progress;
        this.cdr.detectChanges();
      })
    );

    this.offlineSubs.push(
      syncService.isPulling$.subscribe((pulling: boolean) => {
        this.isPulling = pulling;
        this.cdr.detectChanges();
      })
    );

    this.offlineSubs.push(
      syncService.deepUpdateState$.subscribe((state) => {
        this.deepUpdateState = state;
        this.cdr.detectChanges();
      })
    );
  }

  ngOnDestroy() {
    this.offlineSubs.forEach((s) => s.unsubscribe());
    clearTimeout(this.syncSuccessTimer);
    document.title = this.baseTitle;
  }

  // ─── Sync Actions ───

  /**
   * همگام‌سازی دستی
   *
   * قانون: «شکست» فقط وقتی اعلام می‌شود که واقعاً به سرور وصل شده باشیم.
   * وقتی آفلاین هستیم، هیچ تلاشی انجام نمی‌شود و فقط به کاربر
   * اطلاع می‌دهیم که اینترنتش را بررسی کند.
   */
  async onForceSync() {
    const syncService = OfflineSyncService.getInstance();
    const outcome = await syncService.forceSync();

    switch (outcome.status) {
      case 'offline':
        this.toast.show(
          'warning',
          'اینترنت شما وصل نیست. لطفاً اتصال خود را بررسی کنید. داده‌های شما محفوظ است و به‌محض برقراری اتصال ارسال می‌شود.'
        );
        break;

      case 'server-unreachable':
        this.toast.show(
          'warning',
          outcome.synced > 0
            ? `${outcome.synced} مورد ارسال شد، اما ارتباط با سرور قطع شد. بقیه موارد محفوظ است و بعداً ارسال می‌شود.`
            : 'سرور در حال حاضر در دسترس نیست. داده‌های شما محفوظ است و به‌صورت خودکار دوباره تلاش می‌شود.'
        );
        break;

      case 'auth-required':
        this.toast.show(
          'warning',
          'نشست شما منقضی شده است. لطفاً دوباره وارد شوید تا داده‌ها ارسال شوند.'
        );
        break;

      case 'nothing-to-sync':
        this.toast.show('info', 'همه چیز به‌روز است — موردی برای ارسال وجود ندارد.');
        break;

      // 'completed' عمداً اینجا نیست — بنر سبز در layout آن را نشان می‌دهد
      // (هم برای همگام‌سازی دستی هم خودکار) تا پیام دوتایی نشود.

      case 'partial':
        if (outcome.rejected > 0) {
          this.toast.show(
            'error',
            `${outcome.synced} مورد ارسال شد، ${outcome.rejected} مورد توسط سرور رد شد — به صندوق خطاها مراجعه کنید.`
          );
        } else {
          this.toast.show(
            'warning',
            `${outcome.synced} مورد ارسال شد، ${outcome.remaining} مورد باقی ماند و دوباره تلاش می‌شود.`
          );
        }
        break;
    }
  }

  openSyncErrorsFromBadge() {
    this.isSyncErrorsOpen = true;
    this.loadSyncErrors();
    this.cdr.detectChanges();
  }

  toggleSyncErrors(event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
    }
    this.isSyncErrorsOpen = !this.isSyncErrorsOpen;
    if (this.isSyncErrorsOpen) {
      this.loadSyncErrors();
    }
    this.cdr.detectChanges();
  }

  closeSyncErrors() {
    this.isSyncErrorsOpen = false;
    this.cdr.detectChanges();
  }

  async loadSyncErrors() {
    const syncService = OfflineSyncService.getInstance();
    this.syncErrors = await syncService.getErrors();
    this.cdr.detectChanges();
  }

  async dismissSyncError(id: number) {
    const syncService = OfflineSyncService.getInstance();
    await syncService.dismissError(id);
    this.syncErrors = this.syncErrors.filter((e) => e.id !== id);
    this.cdr.detectChanges();
  }

  /** بازگرداندن درخواست ردشده به صف و پردازش فوری (اصلاح ۶ — باز شدن صف مسدود) */
  async retrySyncError(id: number) {
    const syncService = OfflineSyncService.getInstance();
    await syncService.retryError(id);
    this.syncErrors = this.syncErrors.filter((e) => e.id !== id);
    this.toast.show('info', 'درخواست به صف ارسال برگشت و دوباره تلاش می‌شود.');
    this.cdr.detectChanges();
  }

  /** باز/بستن نمایش payload یک خطا */
  expandedErrorId: number | null = null;
  toggleErrorPayload(id: number) {
    this.expandedErrorId = this.expandedErrorId === id ? null : id;
    this.cdr.detectChanges();
  }

  /** نمایش خوانای بدنهٔ درخواست ردشده — دادهٔ کاربر که سرور نپذیرفت */
  formatErrorPayload(body: any): { key: string; value: string }[] {
    if (!body || typeof body !== 'object') return [];
    return Object.entries(body)
      .filter(([k]) => !k.startsWith('_'))
      .slice(0, 12)
      .map(([k, v]) => ({
        key: k,
        value: v === null || v === undefined ? '—'
          : typeof v === 'object' ? JSON.stringify(v).slice(0, 120)
          : String(v).slice(0, 120),
      }));
  }

  async dismissAllSyncErrors() {
    const syncService = OfflineSyncService.getInstance();
    await syncService.dismissAllErrors();
    this.syncErrors = [];
    this.isSyncErrorsOpen = false;
    this.cdr.detectChanges();
  }

  formatSyncTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  }

  /** آیا ماژولی دارای قابلیت تعویض و مدیریت انبار است؟ (بر پایه اکستنشن layoutNav) */
  get hasWarehouseSwitcher(): boolean {
    return this.moduleRegistry.getExtensions('layoutNav').some(e => e.extension.showWarehouseSwitcher);
  }

  get deepSyncScopeLabel(): string {
    return this.hasWarehouseSwitcher ? 'انبار' : 'پروژه / کارگاه';
  }

  /** ──── Sidebar Navigation Signals ──── */
  readonly primaryNavItems = computed(() => {
    // اگر ماژول انبار نصب نیست یا کاربر در سامانه کارکرد و مالی است، منوهای انبارداری مخفی می‌شوند
    if (!this.hasWarehouseSwitcher || this.personaService.activeApp() === 'personnel') {
      return [];
    }

    const userPerms = this.auth.userPermissions();
    const isAdmin = userPerms.includes('admin_all');
    
    let items = this.store.isWarehouseContext() ? this.warehouseNavItems : this.systemNavItems;
    
    return items.filter(item => {
      if (item.isAccounting || item.module === 'accounting') return false;
      if (isAdmin) return true;
      if (item.id === 'audit') {
        return userPerms.includes('view_wh_audit') || userPerms.includes('perm_sys_logs');
      }
      if (item.id === 'count-tracking') {
        return userPerms.includes('view_sys_manager_review') ||
               userPerms.includes('view_sys_supervisor') ||
               userPerms.includes('view_sys_dashboard') ||
               userPerms.includes('perm_inventory_finalize') ||
               userPerms.includes('view_wh_stocktaking') ||
               userPerms.includes('can_act_as_manager') ||
               userPerms.includes('can_act_as_supervisor');
      }
      return userPerms.includes(item.permission);
    });
  });

  /**
   * منوی یک نقش مالی: فقط در سامانه مالی و فقط برای پرسونای فعال همان نقش (سوپریوزر همه را می‌بیند)؛
   * آیتمی که گارد مسیر (ROUTE_PERMISSIONS) رد می‌کند نمایش داده نمی‌شود.
   */
  private roleNavItems(role: string): ModuleNavItem[] {
    const cfg = this.getRoleNavConfig(role);
    if (!cfg || this.personaService.activeApp() === 'warehouse' || this.store.isWarehouseContext()) {
      return [];
    }
    const userPerms = this.auth.userPermissions();
    const isAdmin = userPerms.includes('admin_all');
    if (!isAdmin && this.personaService.activeRole() !== role) {
      return [];
    }
    const hasRoleMarker = cfg.roleMarkers.some(m => userPerms.includes(m));
    return cfg.items.filter(item => {
      if (isAdmin) return true;
      return (hasRoleMarker || userPerms.includes(item.permission)) && hasRoutePermission(item.id, userPerms);
    });
  }

  readonly orgAdminNavItems = computed(() => this.roleNavItems('org_admin'));
  readonly employeeNavItems = computed(() => this.roleNavItems('operator'));
  readonly supervisorNavItems = computed(() => this.roleNavItems('supervisor'));
  readonly accountantNavItems = computed(() => this.roleNavItems('accountant'));
  readonly managerNavItems = computed(() => this.roleNavItems('manager'));
  readonly treasurerNavItems = computed(() => this.roleNavItems('treasury'));

  /**
   * آیتم‌های ماژول‌های دیگر که فاقد سوییچر انبارند و جزو منوهای نقش مالی نیستند
   */
  readonly otherModuleNavSections = computed(() => {
    if (this.store.isWarehouseContext()) {
      return [];
    }
    const userPerms = this.auth.userPermissions();
    const isAdmin = userPerms.includes('admin_all');
    const sections: Array<{ module: { code: string; titleFa: string }; items: ModuleNavItem[] }> = [];

    const exts = this.moduleRegistry.getExtensions('layoutNav');
    for (const ext of exts) {
      if (ext.extension.showWarehouseSwitcher) continue;
      const modCode = (ext as any).moduleCode || ext.module?.code;
      if (modCode === 'accounting' || modCode === 'personnel' || modCode === 'finance') {
        continue;
      }
      const candidateItems = ext.extension.primaryItems || ext.extension.contextItems || [];
      if (candidateItems.length === 0) continue;

      const spec = this.moduleRegistry.getSpec(modCode) || ext.module;
      const visibleItems = candidateItems.filter(item => {
        if (isAdmin) return true;
        return userPerms.includes(item.permission);
      });

      if (visibleItems.length > 0) {
        sections.push({
          module: {
            code: modCode,
            titleFa: spec?.titleFa || modCode
          },
          items: visibleItems
        });
      }
    }
    return sections;
  });

  get otherModuleTotalItemsCount(): number {
    return this.otherModuleNavSections().reduce((sum, s) => sum + s.items.length, 0);
  }

  readonly navItems = computed(() => [
    ...this.primaryNavItems(),
    ...this.orgAdminNavItems(),
    ...this.employeeNavItems(),
    ...this.supervisorNavItems(),
    ...this.accountantNavItems(),
    ...this.managerNavItems(),
    ...this.treasurerNavItems(),
    ...this.otherModuleNavSections().flatMap(s => s.items)
  ]);
  
  get isSidebarOpen() { return this.store.isSidebarOpen(); }
  get currentTab() { return this.store.currentTab(); }
  get userAvatar() { return this.auth.userAvatar(); }
  get userName() { return this.auth.userName(); }
  get userRole() { return this.auth.userRoleTitles()[0] || ''; }
  get hasCompanyDocumentsAccess(): boolean {
    const isSuper = !!this.auth.user()?.is_superuser || this.personaService.isSuperuser();
    if (isSuper) return true;
    return this.activeCompanyService.hasCompanyDocumentsAccess();
  }

  openSidebar() { this.store.openSidebar(); }
  closeSidebar() { this.store.closeSidebar(); }

  private isRoleMenuTab(tabId: string): boolean {
    const extraTabs = ['supervisor-attendance', 'supervisor-new-profiles', 'accountant-new-profiles', 'manager-contracts'];
    if (extraTabs.includes(tabId)) return true;
    for (const e of this.moduleRegistry.getExtensions('layoutNav')) {
      if (e.extension.roleMenus?.some(m => m.items.some(i => i.id === tabId))) return true;
    }
    return false;
  }

  private resolveRouteForTab(tabId: string): string {
    const whSpec = this.moduleRegistry.getSpec('warehouse');
    const whPrefix = whSpec?.routePrefix || '/app/warehouse';
    const finSpec = this.moduleRegistry.getSpec('accounting') || this.moduleRegistry.getSpec('personnel');
    const finPrefix = finSpec?.routePrefix || '/app/finance';
    const opsSpec = this.moduleRegistry.getSpec('operations');
    const opsPrefix = opsSpec?.routePrefix || '/app/operations';

    // ۱. شناسه‌های مشترک (audit، health) بر اساس ماژول فعال حل می‌شوند
    if (tabId === 'audit' || tabId === 'health') {
      if (this.personaService.activeApp() === 'personnel') {
        return `${finPrefix}/${tabId}`;
      }
      if (this.personaService.activeApp() === 'operations') {
        return `${opsPrefix}/${tabId}`;
      }
      return `${whPrefix}/${tabId}`;
    }

    // ۲. صفحات مالی بیرون از منوهای نقش یا منوهای نقش مالی
    const isAccountingItem = ['companies', 'company-documents', 'documents'].includes(tabId) ||
      this.isRoleMenuTab(tabId);
    if (isAccountingItem) {
      return `${finPrefix}/${tabId}`;
    }

    // ۳. جستجو در کلیه ماژول‌های ثبت‌شده (شامل ماژول‌های دیگر مثل sample)
    for (const mod of this.moduleRegistry.getInstalledModules()) {
      const layoutNav = mod.extensions?.layoutNav;
      if (!layoutNav) continue;

      const allItems: ModuleNavItem[] = [
        ...(layoutNav.primaryItems || []),
        ...(layoutNav.contextItems || []),
        ...(layoutNav.roleMenus?.flatMap(m => m.items) || [])
      ];
      const found = allItems.find(i => i.id === tabId);
      if (found) {
        if (found.route) return found.route;
        const prefix = mod.routePrefix || '';
        return prefix ? `${prefix}/${found.id}` : `/${found.id}`;
      }
    }

    // ۴. پیش‌فرض در بافت انبارداری
    return `${whPrefix}/${tabId}`;
  }

  switchTab(tabId: string) {
    this.closeSidebar();
    const route = this.resolveRouteForTab(tabId);
    this.router.navigate([route]);
  }

  /** ──── Warehouse Selector ──── */
  get warehouseSwitcherValue() { return this.store.activeWarehouseId(); }

  get currentWarehouse() {
    const activeId = this.store.activeWarehouseId();
    return this.state.appState.projects.find((x: any) => x.id === Number(activeId));
  }

  onWarehouseChanged(id: number | string | null): void {
    this.store.setActiveWarehouse(id);
    this.state.appState.activeWarehouseId = id as any;
  }

  exitWarehouseMode(fromSidebarSwitch = false) {
    if (fromSidebarSwitch) {
      this.store.setLastWarehouseTab(this.currentTab);
      this.store.setIsSwitchingWarehouse(true);
    } else {
      this.store.setIsSwitchingWarehouse(false);
    }
    this.store.setWarehouseContext(false);
    const navExts = this.moduleRegistry.getExtensions('layoutNav');
    // خروج از حالت انبار به مسیر ماژول صاحب سوییچر انبار؛ فقط اگر نبود، اولین مسیر خروج دیگر
    const exitExt = navExts.find(e => e.extension.showWarehouseSwitcher && e.extension.defaultExitRoute)
      ?? navExts.find(e => e.extension.defaultExitRoute);
    const exitRoute = exitExt?.extension.defaultExitRoute;
    if (exitRoute) {
      this.router.navigate([exitRoute]);
    } else {
      this.router.navigate(['/app/launcher']);
    }
  }

  get progressStats() {
    const isWh = this.store.isWarehouseContext();
    const projects = this.state.appState.projects || [];
    
    let total = 0;
    let counted = 0;
    
    if (isWh) {
      const activeId = this.store.activeWarehouseId();
      const current = projects.find((x: any) => x.id === Number(activeId));
      if (current) {
        total = current.total_quantity || 0;
        counted = current.counted_quantity || 0;
      }
    } else {
      total = projects.reduce((sum: number, p: any) => sum + (p.total_quantity || 0), 0);
      counted = projects.reduce((sum: number, p: any) => sum + (p.counted_quantity || 0), 0);
    }
    
    const percent = total > 0 ? Math.round((counted / total) * 100) : 0;
    
    let colorClass = 'bg-indigo-600';
    if (percent === 100) colorClass = 'bg-emerald-500';
    else if (percent > 70) colorClass = 'bg-blue-500';
    else if (percent > 30) colorClass = 'bg-indigo-500';
    else if (percent > 0) colorClass = 'bg-amber-500';
    else colorClass = 'bg-slate-400';
    
    return {
      total,
      counted,
      percent,
      colorClass,
      label: isWh ? 'پیشرفت انبار:' : 'پیشرفت کل پروژه:',
      tooltip: `شمارش شده: ${counted} از ${total} ردیف`
    };
  }

  /** ──── Logout & Settings ──── */
  goToChangePassword() {
    this.closeSidebar();
    this.router.navigate(['/change-password']);
  }

  async logout() {
    // هشدار جدی وقتی تغییرات ارسال‌نشده در صف است — دادهٔ کاربر نباید بی‌خبر رها شود.
    // (Dexie در logout پاک نمی‌شود؛ پس از ورود مجددِ همان کاربر، صف ارسال می‌شود.)
    if (this.pendingCount > 0) {
      const confirmed = await this.confirmDialog.open({
        title: 'تغییرات ارسال‌نشده دارید!',
        message: `${this.pendingCount} تغییر هنوز به سرور ارسال نشده است. اگر خارج شوید، این تغییرات تا ورود مجدد شما روی همین دستگاه معلق می‌مانند و از دستگاه دیگری در دسترس نیستند. پیشنهاد می‌شود اول همگام‌سازی کنید.`,
        confirmText: 'با این حال خارج شو',
        cancelText: 'انصراف (پیشنهادی)',
        type: 'danger',
      });
      if (!confirmed) return;
      this.auth.logout();
      return;
    }

    const confirmed = await this.confirmDialog.open({
      title: 'خروج از حساب',
      message: 'آیا مطمئنید می‌خواهید از حساب کاربری خارج شوید؟',
      confirmText: 'بله، خروج',
      cancelText: 'انصراف',
      type: 'warning',
    });
    if (confirmed) {
      this.auth.logout();
    }
  }

  /** ──── Private ──── */
  private updateTitle(tab: string) {
    const titles: any = {
      dashboard: 'داشبورد مانیتورینگ',
      projects: 'انبارها',
      dispatch: 'تخصیص کالا',
      users: 'کاربران و نقش‌ها',
      tasks: 'وظایف و اسناد',
      labels: 'لیبل‌زن هوشمند',
      docs: 'انبار',
      'id-cards': 'صدور کارت پرسنلی و گیت‌پاس',
      feeding: 'مدیریت و تغذیه MT26/49 (به‌زودی)',
      settings: 'تنظیمات',
      counter: 'کارتابل انبارگردان',
      customs: 'کارتابل مالی',
      supervisor: 'کارتابل سرپرست شمارش',
      'manager-review': 'بررسی نهایی رکوردها',
      'label-designer': 'طراحی و کانفیگ لیبل/QR',
      audit: 'رهگیری تغییرات',
      'wh-settings': 'تنظیمات انبار',
      'count-tracking': 'پیگیری وضعیت شمارش',
      reports: 'گزارش‌ساز پویا',
      'manager-approvals': 'کارتابل تاییدات و بررسی مدیر',
      'profiles': 'بانک پرونده‌های پرسنل و ناوگان',
      'personnel-profiles': 'بانک پرونده‌های پرسنل و ناوگان',
      'base-settings': 'تنظیمات پایه و فرمول‌های محاسباتی',
      'employee-attendance': 'ثبت کارکرد پرسنل (پنل کارمند)',
      'employee-fleet': 'کارکرد ماشین‌آلات و تردد (پنل کارمند)',
      'employee-invoices': 'ثبت فاکتور هزینه و طرف‌حساب (پنل کارمند)',
      'employee-petty-cash': 'مدیریت و ثبت اسناد تن‌خواه (پنل کارمند)',
      'employee-new-vehicle': 'تعریف خودرو و ناوگان جدید (پنل کارمند)',
      'employee-new-personnel': 'تعریف پرسنل و همکار جدید (پنل کارمند)',
      'supervisor-personnel': 'پرسنل، کارکرد و درخواست‌های تغییر (پنل سرپرست کارگاه)',
      'supervisor-attendance': 'تایید کارکرد پرسنل (پنل سرپرست کارگاه)',
      'supervisor-fleet': 'تایید کارکرد ماشین‌آلات (پنل سرپرست کارگاه)',
      'supervisor-invoices': 'تایید فاکتورهای هزینه (پنل سرپرست کارگاه)',
      'supervisor-petty-cash': 'تایید اسناد تن‌خواه (پنل سرپرست کارگاه)',
      'supervisor-new-profiles': 'تایید پرسنل و ناوگان جدید (پنل سرپرست کارگاه)',
      'supervisor-period-lock': 'بستن دوره کارکرد ماهانه (پنل سرپرست کارگاه)',
      'accountant-personnel': 'پرسنل، احکام مالی و درخواست‌های تغییر (پنل حسابدار)',
      'accountant-new-profiles': 'تایید مالی پرونده‌های تازه و تغییرات (پنل حسابدار)',
      'accountant-payroll': 'حقوق و دستمزد ماهانه (پنل حسابدار)',
      'accountant-fleet': 'تسویه و کارکرد ناوگان (پنل حسابدار)',
      'accountant-invoices': 'ممیزی فاکتورهای هزینه (پنل حسابدار)',
      'accountant-petty-cash': 'ممیزی اسناد تن‌خواه (پنل حسابدار)',
      'accountant-diskettes': 'دیسکت‌های بیمه، مالیات و بانک (پنل حسابدار)',
      'accountant-counterparties': 'مدیریت طرف‌حساب‌های مالی (پنل حسابدار)',
      'manager-dashboard': 'داشبورد هوش مدیریتی و شاخص‌ها (پنل مدیر)',
      'manager-personnel': 'تصویب پرسنل و درخواست‌های تغییر (پنل مدیر)',
      'manager-fleet': 'تصویب ناوگان و تسویه (پنل مدیر)',
      'manager-budget': 'پایش و کنترل سقف بودجه بخش‌ها (پنل مدیر)',
      'manager-contracts': 'تصویب احکام کارگزینی و قراردادها (پنل مدیر)',
      'manager-reports': 'گزارشات جامع و تحلیلی مدیریت (پنل مدیر)',
      'treasurer-disbursements': 'پرداخت مکانیزه حقوق و کارکرد ناوگان (پنل خزانه‌دار)',
      'treasurer-invoices': 'تسویه فاکتورها و شارژ دفاتر تن‌خواه (پنل خزانه‌دار)',
      'treasurer-bank-accounts': 'مدیریت حساب‌های بانکی و صندوق‌ها (پنل خزانه‌دار)',
      'treasurer-cheques': 'مدیریت چک‌های صیادی و تقویم سررسید (پنل خزانه‌دار)',
      'treasurer-reconciliation': 'مغایرت‌گیری بانکی و تقویم نقدینگی (پنل خزانه‌دار)',
      companies: 'مدیریت شرکت‌ها و هلدینگ',
      'projects-and-sections': 'مدیریت ساختار سازمانی، پروژه‌ها و بخش‌ها',
      'company-documents': 'بایگانی اسناد و مدارک رسمی شرکت‌ها',
      documents: 'بایگانی اسناد و مدارک رسمی شرکت‌ها',
      health: 'مرکز جامع پایش سلامت و تاب‌آوری سامانه'
    };
    this.currentTitle = titles[tab] || tab;
    this.baseTitle = `${this.appTitle} — ${this.currentTitle}`;
    document.title = this.isOffline ? `📴 آفلاین — ${this.baseTitle}` : this.baseTitle;
  }
}
