import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef, HostListener, Injector, inject } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';
import { AppUpdateService } from '../../../core/platform/app-update.service';
import { PwaInstallService } from '../../../core/services/pwa-install.service';
import { WorkflowTasksService } from '../../../core/services/workflow-tasks.service';
import { AccountsHttpService } from '../../../core/http/accounts-http.service';
import { ScopeDirectoryService } from '../../../core/http/scope-directory.service';
import { StateService } from '../../../core/services/state.service';
import { ModuleRegistryService, getModuleRegistry } from '../../../core/modules/module-registry.service';
import { normalizeScope, DEFAULT_OFFLINE_SCOPE, LOCKED_OFFLINE_SCOPES } from '../../../core/services/offline-db';
import { DeepSyncSectionSpec } from '../../../core/modules/module-contract';
import { ToastService } from '../toast/toast.component';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { AvatarCropperModal } from '../avatar-cropper-modal/avatar-cropper-modal';
import { DeepSyncContextMode, DeepSyncModalComponent, DeepSyncSectionView } from '../deep-sync-modal/deep-sync-modal.component';
import { AppPersonaService } from '../../../core/services/app-persona.service';
import { ApiService } from '../../../core/api/api.service';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { Company } from '../../../core/models/company.model';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { WorkflowSubstitutesComponent } from '../workflow-substitutes/workflow-substitutes.component';
import { BRANDING } from '../../../core/branding';

export interface ShortcutCategory {
  id: string;
  label: string;
  count: number;
}

export interface ShortcutItem {
  category: string;
  categoryLabel: string;
  categoryColor: string;
  title: string;
  description: string;
  keys: string[];
  altKeys: string[] | null;
}

/** کلاس نشان سامانه در گزارش بروزرسانی عمیق برای هر رنگ پایهٔ بخش */
const SUMMARY_BADGE_CLASSES: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    FormsModule,
    AvatarCropperModal,
    DeepSyncModalComponent,
    WorkflowSubstitutesComponent,
    SvgIconDirective,
    ActionButtonComponent
  ],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css'
})
export class UserMenuComponent implements OnInit, OnDestroy {
  @Input() theme: 'indigo' | 'cyan' = 'indigo';

  public auth = inject(AuthService);
  private store = inject(AuthStore);
  private state = inject(StateService);
  private accountsService = inject(AccountsHttpService);
  private scopeDirectory = inject(ScopeDirectoryService);
  private moduleRegistry = inject(ModuleRegistryService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  public pwaUpdate = inject(AppUpdateService, { optional: true }) ?? inject(PwaUpdateService);
  public pwaInstall = inject(PwaInstallService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private personaService = inject(AppPersonaService, { optional: true });
  private api = inject(ApiService, { optional: true });
  private injector = inject(Injector);
  public activeCompanyService = inject(ActiveCompanyService, { optional: true });
  public workflowTasks = inject(WorkflowTasksService, { optional: true });
  public readonly BRANDING = BRANDING;

  public get taskCount(): number {
    return this.workflowTasks?.count() ?? 0;
  }

  public isUserMenuOpen = false;
  public isSubstituteModalOpen = false;
  public isAvatarModalOpen = false;
  public isSavingAvatar = false;
  public get isCheckingAppUpdate(): boolean {
    return this.pwaUpdate.isChecking();
  }

  /** نسخهٔ تازه آماده است و کاربر نوار پایین را با «بعداً» بسته است */
  public get hasPendingUpdate(): boolean {
    return !!(this.pwaUpdate.updateReady?.() && this.pwaUpdate.updateDismissed?.());
  }

  public isOffline = false;
  public isSyncing = false;
  public pendingCount = 0;
  public isDeepSyncModalOpen = false;
  /** فهرست هدف‌های بروزرسانی عمیق هر قلمرو */
  public deepSyncItemsByScope: Record<string, { id: number; name: string }[]> = {};
  /** شناسهٔ پیش‌انتخاب هر قلمرو */
  public deepSyncPreselectByScope: Record<string, number | null> = {};
  /** قلمروهایی که فهرستشان در حال دریافت است */
  public deepSyncLoadingScopes: string[] = [];
  /** قلمروهایی که دریافت فهرستشان شکست خورد */
  public deepSyncFailedScopes: string[] = [];

  // سازگاری پیشین: دو قلمرو قفل‌شده با نام‌های قدیمی
  public get deepSyncWarehouses(): any[] {
    return this.deepSyncItemsByScope[LOCKED_OFFLINE_SCOPES[0]] || [];
  }
  public set deepSyncWarehouses(items: any[]) {
    this.deepSyncItemsByScope = { ...this.deepSyncItemsByScope, [LOCKED_OFFLINE_SCOPES[0]]: items || [] };
  }
  public get deepSyncProjects(): any[] {
    return this.deepSyncItemsByScope[LOCKED_OFFLINE_SCOPES[1]] || [];
  }
  public set deepSyncProjects(items: any[]) {
    this.deepSyncItemsByScope = { ...this.deepSyncItemsByScope, [LOCKED_OFFLINE_SCOPES[1]]: items || [] };
  }
  public get deepSyncPreselectWarehouseId(): number | null {
    return this.deepSyncPreselectByScope[LOCKED_OFFLINE_SCOPES[0]] ?? null;
  }
  public set deepSyncPreselectWarehouseId(val: number | null) {
    this.deepSyncPreselectByScope = { ...this.deepSyncPreselectByScope, [LOCKED_OFFLINE_SCOPES[0]]: val };
  }
  public get deepSyncPreselectProjectId(): number | null {
    return this.deepSyncPreselectByScope[LOCKED_OFFLINE_SCOPES[1]] ?? null;
  }
  public set deepSyncPreselectProjectId(val: number | null) {
    this.deepSyncPreselectByScope = { ...this.deepSyncPreselectByScope, [LOCKED_OFFLINE_SCOPES[1]]: val };
  }

  public get deepSyncPreselectId(): number | null {
    const ctx = this.currentScopeContext;
    return this.deepSyncPreselectByScope[ctx] ?? this.deepSyncPreselectWarehouseId;
  }
  public set deepSyncPreselectId(val: number | null) {
    const next: Record<string, number | null> = {};
    for (const scope of [...LOCKED_OFFLINE_SCOPES, ...this.deepSyncSectionSpecs.map(s => s.scope)]) next[scope] = val;
    this.deepSyncPreselectByScope = next;
  }

  /** بخش‌های بروزرسانی عمیق از extension منوی کاربر ماژول‌های نصب‌شده، به ترتیب order */
  public get deepSyncSectionSpecs(): DeepSyncSectionSpec[] {
    return this.moduleRegistry
      .getExtensions('userMenu')
      .map(e => e.extension.deepSync)
      .filter((d): d is DeepSyncSectionSpec => !!d && typeof d.scope === 'string')
      .sort((a, b) => a.order - b.order);
  }

  /** بخش‌های آمادهٔ نمایش برای دیالوگ (بدون تابع‌های بارگذار)؛ تا عوض نشدن فهرست‌ها همان آرایه برمی‌گردد */
  public get deepSyncSectionViews(): DeepSyncSectionView[] {
    if (this.deepSyncViewsCache?.items === this.deepSyncItemsByScope) {
      return this.deepSyncViewsCache.views;
    }
    const views = this.deepSyncSectionSpecs.map(({ loadItems, initialItems, preselectId, ...view }) => ({
      ...view,
      items: this.deepSyncItemsByScope[view.scope] || []
    }));
    this.deepSyncViewsCache = { items: this.deepSyncItemsByScope, views };
    return views;
  }
  private deepSyncViewsCache: { items: Record<string, unknown>; views: DeepSyncSectionView[] } | null = null;

  public get currentScopeContext(): DeepSyncContextMode {
    const rawUrl = (this.router?.url && this.router.url !== '/')
      ? this.router.url
      : (typeof window !== 'undefined' && window.location ? window.location.pathname : '');
    const url = (rawUrl || '').split('?')[0];

    // ۱. بررسی بر اساس مسیر جاری ناوبری کاربر
    if (url.startsWith('/app/operations')) {
      return 'operations';
    }
    const routeScope = getModuleRegistry()
      .getAllModules()
      .find(m => m.extensions?.offlineSync?.appRoutePrefixes?.some(p => url.startsWith(p)))
      ?.scopeKind;
    if (routeScope) {
      return routeScope;
    }

    // ۲. بررسی بر اساس پرسونا / ماژول فعال در تب جاری
    const activeApp = this.personaService?.activeApp?.();
    if (activeApp === 'operations') {
      return 'operations';
    }
    if (activeApp) {
      return normalizeScope(activeApp);
    }

    // ۳. بررسی بر اساس ماژول‌های فعال نصب‌شدهٔ دارای قلمرو همگام‌سازی: اگر فقط یکی هست همان
    const scopedKinds = new Set(
      this.moduleRegistry.getInstalledModules()
        .filter(m => !!m.extensions?.syncConfig)
        .map(m => m.scopeKind)
    );
    if (scopedKinds.size === 1) {
      return [...scopedKinds][0];
    }

    return DEFAULT_OFFLINE_SCOPE;
  }

  private subs: Subscription[] = [];

  // Shortcuts modal
  public isShortcutsHelpOpen = false;
  public shortcutsSearchQuery = '';
  public shortcutsActiveCategory = 'all';

  public get isWarehouseInstalled(): boolean {
    return this.moduleRegistry.getExtensions('userMenu').some(e => e.extension.shortcutsCategory?.id === 'counting');
  }

  public get shortcutsCategories(): ShortcutCategory[] {
    const extCategories = this.moduleRegistry
      .getExtensions('userMenu')
      .map(e => e.extension.shortcutsCategory)
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    const categoryList: ShortcutCategory[] = [
      { id: 'global', label: 'عمومی و منو', count: this.RAW_SHORTCUTS.filter(s => s.category === 'global').length },
      ...extCategories,
      { id: 'table', label: 'جدول اطلاعات و فرم‌ها', count: this.RAW_SHORTCUTS.filter(s => s.category === 'table').length },
      { id: 'design', label: 'طراحی لیبل و کارت', count: this.RAW_SHORTCUTS.filter(s => s.category === 'design').length },
    ];

    const totalCount = categoryList.reduce((sum, c) => sum + (c?.count || 0), 0);

    return [
      { id: 'all', label: 'همه کلیدها', count: totalCount },
      ...categoryList,
    ];
  }

  public get allShortcuts(): ShortcutItem[] {
    const supportedCategories = new Set(this.shortcutsCategories.map((c: ShortcutCategory) => c.id));
    return this.RAW_SHORTCUTS.filter((s: ShortcutItem) => supportedCategories.has(s.category));
  }

  private RAW_SHORTCUTS: ShortcutItem[] = [
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

  public get filteredShortcuts(): ShortcutItem[] {
    return this.allShortcuts.filter((item: ShortcutItem) => {
      const matchCat = this.shortcutsActiveCategory === 'all' || item.category === this.shortcutsActiveCategory;
      if (!matchCat) return false;
      if (!this.shortcutsSearchQuery.trim()) return true;
      const q = this.shortcutsSearchQuery.toLowerCase().trim();
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.categoryLabel && item.categoryLabel.toLowerCase().includes(q)) ||
        item.keys.some((k: string) => k.toLowerCase().includes(q)) ||
        (item.altKeys && item.altKeys.some((k: string) => k.toLowerCase().includes(q)))
      );
    });
  }

  public get userAvatar(): string {
    return this.auth.userAvatar();
  }

  public get userName(): string {
    return this.auth.userName();
  }

  public get userRole(): string {
    return this.auth.userRoleTitles()[0] || 'کاربر سیستم';
  }

  ngOnInit(): void {
    const network = NetworkStatusService.getInstance();
    const syncService = OfflineSyncService.getInstance();

    this.subs.push(
      network.state$.subscribe((state) => {
        this.isOffline = state !== 'online';
        this.cdr.detectChanges();
      })
    );

    this.subs.push(
      syncService.isSyncing$.subscribe((syncing) => {
        this.isSyncing = syncing;
        this.cdr.detectChanges();
      })
    );

    this.subs.push(
      syncService.pendingCount$.subscribe((count) => {
        this.pendingCount = count;
        this.cdr.detectChanges();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  public openAvatarModal(): void {
    this.isAvatarModalOpen = true;
    this.closeUserMenu();
  }

  public onSaveAvatar(blob: Blob): void {
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

  public onRemoveAvatar(): void {
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

  public async onManualAppUpdate(): Promise<void> {
    try {
      await this.pwaUpdate.checkAndApplyManualUpdate({ pendingCount: this.pendingCount });
    } finally {
      this.closeUserMenu();
      this.cdr.detectChanges();
    }
  }

  public async onDeepUpdate(): Promise<void> {
    if (this.isSyncing) return;

    if (this.isOffline) {
      this.toast.show('error', 'برای بروزرسانی عمیق باید به اینترنت متصل باشید.');
      return;
    }

    if (this.pendingCount > 0) {
      this.toast.show('error', 'ابتدا باید تغییرات ذخیره‌نشده خود را همگام‌سازی (Sync) کنید تا از دست نروند.');
      return;
    }

    const context = this.currentScopeContext;
    const sections = this.deepSyncSectionSpecs;
    // بخش‌های زمینهٔ جاری: در مرکز عملیات همه، وگرنه فقط بخش همان قلمرو
    const relevant = context === 'operations' ? sections : sections.filter(sec => sec.scope === context);

    // ۱. آماده‌سازی فهرست‌های فوری و پیش‌انتخاب هر بخش
    const items: Record<string, { id: number; name: string }[]> = {};
    const preselect: Record<string, number | null> = {};
    for (const sec of sections) {
      items[sec.scope] = relevant.includes(sec) && sec.initialItems ? (sec.initialItems(this.injector) || []) : [];
      preselect[sec.scope] = sec.preselectId ? sec.preselectId(this.injector) : null;
    }
    this.deepSyncItemsByScope = items;
    this.deepSyncPreselectByScope = preselect;
    this.deepSyncLoadingScopes = relevant.map(sec => sec.scope);
    this.deepSyncFailedScopes = [];

    // ۲. باز کردن فوری مودال برای پاسخ‌دهی سریع رابط کاربری
    this.isDeepSyncModalOpen = true;
    this.cdr.detectChanges();

    // ۳. واکشی فهرست زندهٔ هر بخش با بارگذار خود ماژول
    await Promise.allSettled(relevant.map(sec => this.loadDeepSyncSection(sec)));
    this.cdr.detectChanges();
  }

  /** واکشی فهرست زندهٔ یک بخش؛ شکست، قلمرو را در deepSyncFailedScopes می‌گذارد */
  private loadDeepSyncSection(sec: DeepSyncSectionSpec): Promise<void> {
    return sec.loadItems(this.injector)
      .then((data) => {
        this.deepSyncItemsByScope = { ...this.deepSyncItemsByScope, [sec.scope]: data || [] };
        this.deepSyncFailedScopes = this.deepSyncFailedScopes.filter(s => s !== sec.scope);
        if (sec.preselectId) {
          this.deepSyncPreselectByScope = { ...this.deepSyncPreselectByScope, [sec.scope]: sec.preselectId(this.injector) };
        }
      })
      .catch((err) => {
        console.warn(`[UserMenu] خطا در دریافت فهرست «${sec.tabLabel}» برای بروزرسانی عمیق:`, err);
        if (!this.deepSyncFailedScopes.includes(sec.scope)) {
          this.deepSyncFailedScopes = [...this.deepSyncFailedScopes, sec.scope];
        }
      })
      .finally(() => {
        this.deepSyncLoadingScopes = this.deepSyncLoadingScopes.filter(scope => scope !== sec.scope);
        this.cdr.detectChanges();
      });
  }

  /** تلاش دوباره برای دریافت فهرست یک بخش از دیالوگ بروزرسانی عمیق */
  public retryDeepSyncSection(scope: string): void {
    const sec = this.deepSyncSectionSpecs.find(s => s.scope === scope);
    if (!sec || this.deepSyncLoadingScopes.includes(scope)) return;
    // قلمرو تا پاسخ موفق در فهرست شکست می‌ماند تا دکمهٔ تلاش دوباره (و فوکوس آن) سر جایش بماند
    this.deepSyncLoadingScopes = [...this.deepSyncLoadingScopes, scope];
    this.cdr.detectChanges();
    void this.loadDeepSyncSection(sec);
  }

  public async startDeepSync(payload: any): Promise<void> {
    if (this.isSyncing) return;
    this.isDeepSyncModalOpen = false;

    // شناسه‌های هدف هر قلمرو: آرایه یعنی قلمرو زمینهٔ جاری، شیء یعنی idsByScope یا دو کلید سازگاری پیشین
    let idsByScope: Record<string, number[]> = {};
    if (Array.isArray(payload)) {
      const ctx = this.currentScopeContext;
      idsByScope[ctx === 'operations' ? LOCKED_OFFLINE_SCOPES[0] : ctx] = payload;
    } else if (payload && typeof payload === 'object') {
      if (payload.idsByScope && typeof payload.idsByScope === 'object') {
        idsByScope = { ...payload.idsByScope };
      } else {
        idsByScope[LOCKED_OFFLINE_SCOPES[0]] = Array.isArray(payload.warehouseIds) ? payload.warehouseIds : [];
        idsByScope[LOCKED_OFFLINE_SCOPES[1]] = Array.isArray(payload.projectIds) ? payload.projectIds : [];
      }
    }

    const sections = this.deepSyncSectionSpecs;
    const orderOf = (scope: string) => sections.find(sec => sec.scope === scope)?.order ?? Number.MAX_SAFE_INTEGER;
    const targetScopes = Object.keys(idsByScope)
      .filter(scope => (idsByScope[scope] || []).length > 0)
      .sort((a, b) => orderOf(a) - orderOf(b));

    if (targetScopes.length === 0) {
      return;
    }

    try {
      this.isSyncing = true;
      this.cdr.detectChanges();

      const syncService = OfflineSyncService.getInstance();

      interface SummaryItem {
        scopeKind: string;
        name: string;
        records: number;
        bytes: number;
      }

      const allSummaries: SummaryItem[] = [];

      // اجرای بروزرسانی عمیق هر قلمرو به ترتیب بخش‌ها
      for (const scope of targetScopes) {
        const namesMap: Record<number, string> = {};
        (this.deepSyncItemsByScope[scope] || []).forEach(item => namesMap[item.id] = item.name);
        const summaries = await syncService.performDeepUpdate(idsByScope[scope], namesMap, scope);
        summaries.forEach(sum => {
          allSummaries.push({
            scopeKind: scope,
            name: sum.warehouseName,
            records: sum.records,
            bytes: sum.bytes
          });
        });
      }

      let totalRecords = 0;
      let totalBytes = 0;
      let tableRows = '';

      const isOperationsContext = this.currentScopeContext === 'operations' || targetScopes.length > 1;
      const sectionOf = (scope: string) => sections.find(sec => sec.scope === scope);

      allSummaries.forEach(s => {
        totalRecords += s.records;
        totalBytes += s.bytes;
        const esc = (v: string) => v.replace(/[&<>"']/g, (m) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m] || m));
        const safeName = esc(s.name || '');

        const sec = sectionOf(s.scopeKind);
        const badgeClass = SUMMARY_BADGE_CLASSES[sec?.accent || ''] || SUMMARY_BADGE_CLASSES['indigo'];
        const badgeHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black ${badgeClass}">${esc(sec?.summaryLabel || s.scopeKind)}</span>`;

        if (isOperationsContext) {
          tableRows += `
            <tr class="border-b border-slate-200 last:border-0 hover:bg-white/60 transition-colors">
              <td class="py-2.5 px-3 text-right">${badgeHtml}</td>
              <td class="py-2.5 px-3 text-right font-medium text-slate-800">${safeName}</td>
              <td class="py-2.5 px-3 text-center font-mono font-bold" dir="ltr">${s.records.toLocaleString()}</td>
              <td class="py-2.5 px-3 text-left font-mono text-slate-600" dir="ltr">${(s.bytes / 1024).toFixed(1)} KB</td>
            </tr>
          `;
        } else {
          tableRows += `
            <tr class="border-b border-slate-200 last:border-0 hover:bg-white/60 transition-colors">
              <td class="py-2.5 px-3 text-right font-medium text-slate-800">${safeName}</td>
              <td class="py-2.5 px-3 text-center font-mono font-bold" dir="ltr">${s.records.toLocaleString()}</td>
              <td class="py-2.5 px-3 text-left font-mono text-slate-600" dir="ltr">${(s.bytes / 1024).toFixed(1)} KB</td>
            </tr>
          `;
        }
      });

      const tableHeaderHtml = isOperationsContext
        ? `
          <tr>
            <th class="py-2.5 px-3 text-right font-black">سامانه</th>
            <th class="py-2.5 px-3 text-right font-black">مجموعه هدف</th>
            <th class="py-2.5 px-3 text-center font-black">رکوردها</th>
            <th class="py-2.5 px-3 text-left font-black">حجم</th>
          </tr>
        `
        : `
          <tr>
            <th class="py-2.5 px-3 text-right font-black">${sectionOf(targetScopes[0])?.itemLabel || ''}</th>
            <th class="py-2.5 px-3 text-center font-black">رکوردها</th>
            <th class="py-2.5 px-3 text-left font-black">حجم</th>
          </tr>
        `;

      const colspanTotal = isOperationsContext ? 2 : 1;

      const htmlContent = `
        <div class="mt-4 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          <table class="w-full text-xs">
            <thead class="bg-slate-100/90 text-slate-600 border-b border-slate-200">
              ${tableHeaderHtml}
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot class="bg-slate-100/80 font-black border-t border-slate-200 text-slate-800">
              <tr>
                <td class="py-2.5 px-3 text-right" colspan="${colspanTotal}">مجموع کل</td>
                <td class="py-2.5 px-3 text-center font-mono" dir="ltr">${totalRecords.toLocaleString()}</td>
                <td class="py-2.5 px-3 text-left font-mono" dir="ltr">${(totalBytes / 1024).toFixed(1)} KB</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;

      const shouldReload = await this.confirmDialog.open({
        title: isOperationsContext ? 'گزارش بروزرسانی یکپارچه سازمان' : 'گزارش بروزرسانی عمیق',
        message: 'دریافت اطلاعات با موفقیت به پایان رسید. جزئیات همگام‌سازی به شرح زیر است:' + htmlContent,
        confirmText: 'بارگذاری مجدد و اعمال',
        cancelText: 'ادامه در همین صفحه',
        showCancel: true,
        type: 'info'
      });

      if (shouldReload) {
        window.location.reload();
      } else {
        this.toast.show('success', 'اطلاعات با موفقیت نوسازی شد.');
      }

    } catch (err: any) {
      console.error('Deep update error:', err);
      this.toast.show('error', 'خطا در بروزرسانی عمیق: ' + (err.message || 'مشکل ناشناخته'));
    } finally {
      this.isSyncing = false;
      this.cdr.detectChanges();
    }
  }

  public toggleShortcutsHelp(): void {
    this.isShortcutsHelpOpen = !this.isShortcutsHelpOpen;
    this.cdr.detectChanges();
  }

  @HostListener('window:keydown', ['$event'])
  public handleKeyboardEvent(event: KeyboardEvent): void {
    if (event.key === '?' && event.shiftKey) {
      event.preventDefault();
      this.toggleShortcutsHelp();
    } else if (event.key === 'Escape') {
      if (this.isShortcutsHelpOpen) {
        this.isShortcutsHelpOpen = false;
        this.cdr.detectChanges();
      }
      if (this.isSubstituteModalOpen) {
        this.isSubstituteModalOpen = false;
        this.cdr.detectChanges();
      }
      if (this.isUserMenuOpen) {
        this.isUserMenuOpen = false;
        this.cdr.detectChanges();
      }
    }
  }

  public goToChangePassword(): void {
    this.router.navigate(['/app/change-password']);
  }

  public goToMyTasks(): void {
    this.router.navigate(['/app/my-tasks']);
  }

  public openSubstituteModal(): void {
    this.isSubstituteModalOpen = true;
    this.closeUserMenu();
  }

  public goToLauncher(): void {
    this.router.navigate(['/app/launcher']);
  }

  public toggleUserMenu(): void {
    this.isUserMenuOpen = !this.isUserMenuOpen;
    this.cdr.detectChanges();
  }

  public closeUserMenu(): void {
    this.isUserMenuOpen = false;
    this.cdr.detectChanges();
  }

  public async onInstallApp(): Promise<void> {
    await this.pwaInstall.installApp();
  }

  public logout(): void {
    this.auth.logout();
  }
}

