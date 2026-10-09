import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef, HostListener, inject } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';
import { PwaInstallService } from '../../../core/services/pwa-install.service';
import { AccountsHttpService } from '../../../core/http/accounts-http.service';
import { WarehouseHttpService } from '../../../core/http/warehouse-http.service';
import { StateService } from '../../../services/state.service';
import { ModuleRegistryService } from '../../../core/modules/module-registry.service';
import { ToastService } from '../toast/toast.component';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { AvatarCropperModal } from '../avatar-cropper-modal/avatar-cropper-modal';
import { DeepSyncContextMode, DeepSyncModalComponent } from '../deep-sync-modal/deep-sync-modal.component';
import { AppPersonaService } from '../../../core/services/app-persona.service';
import { PersonnelApiService } from '../../../core/api/personnel-api.service';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { Company } from '../../../core/models/company.model';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { BRANDING } from '../../../core/branding';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    FormsModule,
    AvatarCropperModal,
    DeepSyncModalComponent,
    SvgIconDirective
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
  private whService = inject(WarehouseHttpService);
  private moduleRegistry = inject(ModuleRegistryService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  public pwaUpdate = inject(PwaUpdateService);
  public pwaInstall = inject(PwaInstallService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private personaService = inject(AppPersonaService, { optional: true });
  private personnelApi = inject(PersonnelApiService, { optional: true });
  public activeCompanyService = inject(ActiveCompanyService, { optional: true });
  public readonly BRANDING = BRANDING;

  public isUserMenuOpen = false;
  public isAvatarModalOpen = false;
  public isSavingAvatar = false;
  public get isCheckingAppUpdate(): boolean {
    return this.pwaUpdate.isChecking();
  }

  public isOffline = false;
  public isSyncing = false;
  public pendingCount = 0;
  public isDeepSyncModalOpen = false;
  public deepSyncWarehouses: any[] = [];
  public deepSyncProjects: any[] = [];
  public deepSyncPreselectWarehouseId: number | null = null;
  public deepSyncPreselectProjectId: number | null = null;

  public get deepSyncPreselectId(): number | null {
    return this.currentScopeContext === 'finance' ? this.deepSyncPreselectProjectId : this.deepSyncPreselectWarehouseId;
  }
  public set deepSyncPreselectId(val: number | null) {
    this.deepSyncPreselectWarehouseId = val;
    this.deepSyncPreselectProjectId = val;
  }

  public get currentScopeContext(): DeepSyncContextMode {
    const rawUrl = (this.router?.url && this.router.url !== '/')
      ? this.router.url
      : (typeof window !== 'undefined' && window.location ? window.location.pathname : '');
    const url = (rawUrl || '').split('?')[0];

    // ۱. بررسی بر اساس مسیر جاری ناوبری کاربر
    if (url.startsWith('/app/operations')) {
      return 'operations';
    }
    if (
      url.startsWith('/app/finance') ||
      url.startsWith('/app/personnel') ||
      url.startsWith('/app/payroll') ||
      url.startsWith('/app/treasury') ||
      url.startsWith('/app/projects')
    ) {
      return 'finance';
    }
    if (
      url.startsWith('/app/warehouse') ||
      url.startsWith('/app/inventory') ||
      url.startsWith('/app/counting') ||
      url.startsWith('/app/items') ||
      url.startsWith('/app/tag-templates')
    ) {
      return 'warehouse';
    }

    // ۲. بررسی بر اساس پرسونا / ماژول فعال در تب جاری
    const activeApp = this.personaService?.activeApp?.();
    if (activeApp === 'operations') {
      return 'operations';
    }
    if (activeApp === 'personnel' || activeApp === 'accounting' || activeApp === 'finance') {
      return 'finance';
    }
    if (activeApp === 'warehouse') {
      return 'warehouse';
    }

    // ۳. بررسی بر اساس ماژول‌های فعال نصب‌شده
    const hasWarehouse = this.moduleRegistry.isModuleInstalled('warehouse');
    const hasPersonnel = this.moduleRegistry.isModuleInstalled('accounting') || this.moduleRegistry.isModuleInstalled('personnel');

    if (hasWarehouse && !hasPersonnel) {
      return 'warehouse';
    }
    if (!hasWarehouse && hasPersonnel) {
      return 'finance';
    }

    return 'warehouse';
  }

  private subs: Subscription[] = [];

  // Shortcuts modal
  public isShortcutsHelpOpen = false;
  public shortcutsSearchQuery = '';
  public shortcutsActiveCategory = 'all';

  public get isWarehouseInstalled(): boolean {
    return this.moduleRegistry.isModuleInstalled('warehouse');
  }

  public get shortcutsCategories() {
    return [
      { id: 'all', label: 'همه کلیدها', count: this.allShortcuts.length },
      { id: 'global', label: 'عمومی و منو', count: 5 },
      ...(this.isWarehouseInstalled ? [{ id: 'counting', label: 'انبارگردانی و اسکنر', count: 5 }] : []),
      { id: 'table', label: 'جدول اطلاعات و فرم‌ها', count: 5 },
      { id: 'design', label: 'طراحی لیبل و کارت', count: 5 },
    ];
  }

  public get allShortcuts() {
    return this.RAW_SHORTCUTS.filter(s => {
      if (s.category === 'counting' && !this.isWarehouseInstalled) return false;
      return true;
    });
  }

  private RAW_SHORTCUTS = [
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
      categoryLabel: 'کپی و جایگذاری المان',
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

  public get filteredShortcuts() {
    return this.allShortcuts.filter(item => {
      const matchCat = this.shortcutsActiveCategory === 'all' || item.category === this.shortcutsActiveCategory;
      if (!matchCat) return false;
      if (!this.shortcutsSearchQuery.trim()) return true;
      const q = this.shortcutsSearchQuery.toLowerCase().trim();
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.categoryLabel && item.categoryLabel.toLowerCase().includes(q)) ||
        item.keys.some(k => k.toLowerCase().includes(q)) ||
        (item.altKeys && item.altKeys.some(k => k.toLowerCase().includes(q)))
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
    const currentWhId = this.store.activeWarehouseId();
    this.deepSyncPreselectWarehouseId = currentWhId && currentWhId !== 'ALL' ? Number(currentWhId) : null;
    this.deepSyncPreselectProjectId = null;

    // ۱. آماده‌سازی لیست‌های پیش‌فرض
    if (context === 'warehouse' || context === 'operations') {
      this.deepSyncWarehouses = this.state.appState.projects || [];
    } else {
      this.deepSyncWarehouses = [];
    }
    this.deepSyncProjects = [];

    // ۲. باز کردن فوری مودال برای پاسخ‌دهی سریع رابط کاربری
    this.isDeepSyncModalOpen = true;
    this.cdr.detectChanges();

    // ۳. واکشی داده‌های زنده و تازه‌سازی فهرست‌ها متناسب با قلمرو فعال
    const fetchPromises: Promise<any>[] = [];

    if ((context === 'warehouse' || context === 'operations') && this.moduleRegistry.isModuleInstalled('warehouse')) {
      fetchPromises.push(
        firstValueFrom(this.whService.getAll())
          .then((data) => {
            this.deepSyncWarehouses = data || [];
            const refreshedId = this.store.activeWarehouseId();
            this.deepSyncPreselectWarehouseId = refreshedId && refreshedId !== 'ALL' ? Number(refreshedId) : null;
            this.cdr.detectChanges();
          })
          .catch((err) => {
            console.warn('[UserMenu] خطا در دریافت لیست انبارها برای بروزرسانی عمیق:', err);
          })
      );
    }

    if ((context === 'finance' || context === 'operations') && this.personnelApi) {
      fetchPromises.push(
        firstValueFrom(this.personnelApi.getFinancialProjects({ is_active: true }))
          .then((projects) => {
            this.deepSyncProjects = projects || [];
            this.cdr.detectChanges();
          })
          .catch((err) => {
            console.warn('[UserMenu] خطا در دریافت لیست پروژه‌های مالی برای بروزرسانی عمیق:', err);
          })
      );
    }

    await Promise.allSettled(fetchPromises);
    this.cdr.detectChanges();
  }

  public async startDeepSync(payload: any): Promise<void> {
    if (this.isSyncing) return;
    this.isDeepSyncModalOpen = false;

    let targetWarehouseIds: number[] = [];
    let targetProjectIds: number[] = [];

    if (Array.isArray(payload)) {
      if (this.currentScopeContext === 'finance') {
        targetProjectIds = payload;
      } else {
        targetWarehouseIds = payload;
      }
    } else if (payload && typeof payload === 'object') {
      targetWarehouseIds = Array.isArray(payload.warehouseIds) ? payload.warehouseIds : [];
      targetProjectIds = Array.isArray(payload.projectIds) ? payload.projectIds : [];
    }

    if (targetWarehouseIds.length === 0 && targetProjectIds.length === 0) {
      return;
    }

    try {
      this.isSyncing = true;
      this.cdr.detectChanges();

      const syncService = OfflineSyncService.getInstance();
      const warehousesMap: Record<number, string> = {};
      this.deepSyncWarehouses.forEach(w => warehousesMap[w.id] = w.name);

      const projectsMap: Record<number, string> = {};
      this.deepSyncProjects.forEach(p => projectsMap[p.id] = p.name);

      interface SummaryItem {
        scopeKind: 'warehouse' | 'finance';
        name: string;
        records: number;
        bytes: number;
      }

      const allSummaries: SummaryItem[] = [];

      // ۱. اجرای بروزرسانی عمیق انبارها (در صورت وجود شناسه‌های هدف)
      if (targetWarehouseIds.length > 0) {
        const whSummaries = await syncService.performDeepUpdate(targetWarehouseIds, warehousesMap, 'warehouse');
        whSummaries.forEach(s => {
          allSummaries.push({
            scopeKind: 'warehouse',
            name: s.warehouseName,
            records: s.records,
            bytes: s.bytes
          });
        });
      }

      // ۲. اجرای بروزرسانی عمیق پروژه‌ها و کارگاه‌های مالی (در صورت وجود شناسه‌های هدف)
      if (targetProjectIds.length > 0) {
        const finSummaries = await syncService.performDeepUpdate(targetProjectIds, projectsMap, 'finance');
        finSummaries.forEach(s => {
          allSummaries.push({
            scopeKind: 'finance',
            name: s.warehouseName,
            records: s.records,
            bytes: s.bytes
          });
        });
      }

      let totalRecords = 0;
      let totalBytes = 0;
      let tableRows = '';

      const isOperationsContext = this.currentScopeContext === 'operations' || (targetWarehouseIds.length > 0 && targetProjectIds.length > 0);

      allSummaries.forEach(s => {
        totalRecords += s.records;
        totalBytes += s.bytes;
        const safeName = (s.name || '').replace(/[&<>"']/g, (m) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[m] || m));

        const badgeHtml = s.scopeKind === 'warehouse'
          ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">📦 انبارداری</span>'
          : '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">💳 مالی</span>';

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
            <th class="py-2.5 px-3 text-right font-black">${this.currentScopeContext === 'finance' ? 'پروژه / کارگاه' : 'انبار'}</th>
            <th class="py-2.5 px-3 text-center font-black">رکوردها</th>
            <th class="py-2.5 px-3 text-left font-black">حجم</th>
          </tr>
        `;

      const colspanTotal = isOperationsContext ? 2 : 1;

      const htmlContent = `
        <div class="mt-4 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-2xs">
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
      if (this.isUserMenuOpen) {
        this.isUserMenuOpen = false;
        this.cdr.detectChanges();
      }
    }
  }

  public goToChangePassword(): void {
    this.router.navigate(['/app/change-password']);
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

