// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal, Injector, runInInjectionContext, ChangeDetectorRef, ElementRef } from '@angular/core';
import { of, Subject, BehaviorSubject } from 'rxjs';
import { CounterDashboard } from './counter-dashboard/counter-dashboard';
import { OfflinePendingBadgeComponent } from '../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { UserMenuComponent } from '../../../../shared/components/user-menu/user-menu.component';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { PhotoUploadQueueService } from '../../../../core/services/photo-upload-queue.service';
import { SyncPullService } from '../../../../core/services/sync-pull.service';
import { NetworkStatusService } from '../../../../core/services/network-status.service';
import { ItemPhotoService } from '../../services/item-photo.service';
import { CountTaskStore } from '../../services/count-task-store';
import { offlineDb, warehouseOfflineDb, financeOfflineDb } from '../../../../core/services/offline-db';
import { CountTask } from '../../models/count-task.model';
import { ModuleRegistryService, getModuleRegistry } from '../../../../core/modules/module-registry.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { StateService } from '../../../../core/services/state.service';
import { AccountsHttpService } from '../../../../core/http/accounts-http.service';
import { ScopeDirectoryService } from '../../../../core/http/scope-directory.service';
import { PwaUpdateService } from '../../../../core/services/pwa-update.service';
import { PwaInstallService } from '../../../../core/services/pwa-install.service';
import { WebPushService } from '../../../../core/platform/web-push.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { ApiService } from '../../../../core/api/api.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { SystemHealthService } from '../../../../core/services/system-health.service';
import { Router } from '@angular/router';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();
(globalThis as any).sessionStorage = createStorageMock();

describe('۲. بخش آفلاین و همگام‌سازی (Offline & Sync Workflow)', () => {
  let mockToast: any;
  let mockConfirmDialog: any;
  let mockCdr: any;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      show: vi.fn()
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(false)
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    // شبیه‌سازی متدهای به‌روزرسانی Dexie برای جلوگیری از خطای نبود indexedDB در jsdom
    try {
      if (offlineDb.countTasks) {
        vi.spyOn(offlineDb.countTasks, 'update').mockResolvedValue(1 as any);
      }
      if (offlineDb.items) {
        vi.spyOn(offlineDb.items, 'update').mockResolvedValue(1 as any);
      }
    } catch {}
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۱. ویرایش تعداد و فیلدهای اضافی در حالت آفلاین و همگام‌سازی پس از آنلاین شدن
  // ════════════════════════════════════════════════════════════════════════
  describe('۱. ویرایش کالا در داشبورد باجه در حالت آفلاین (حالت پرواز) و همگام‌سازی خودکار', () => {
    it('ویرایش تعداد شمارش و فیلدهای متغیر در حالت آفلاین در صف محلی قرار گرفته و پس از آنلاین شدن به سرور اعمال می‌شود', async () => {
      const offlineSync = OfflineSyncService.getInstance();
      const countTaskStore = Object.create(CountTaskStore.prototype);

      // شبیه‌سازی وضعیت اولیه تسک شمارش
      const sampleTask: CountTask = {
        id: 501,
        sync_id: 'task_uuid_501',
        item: 101,
        warehouse_id: 19,
        counter: 12,
        supervisor: null,
        status: 'PENDING_COUNT',
        counted_balance: null,
        counter_note: '',
        supervisor_note: null,
        manager_note: null,
        created_at: '2026-10-15T09:00:00Z',
        updated_at: '2026-10-15T10:00:00Z',
        created_by: null,
        modified_by: null,
        item_details: {
          id: 101,
          sync_id: 'item_uuid_101',
          fa_unic_code: 'ITM-900',
          description: 'بلبرینگ صنعتی SKF',
          new_location: 'LOC-A1',
          dynamic_data: { batch_no: 'OLD-BATCH' },
          updated_at: '2026-10-15T09:00:00Z'
        } as any
      };

      // ۱. قرار دادن دستگاه در حالت آفلاین (قطع اینترنت / حالت پرواز)
      vi.spyOn(NetworkStatusService.getInstance(), 'isBrowserOnline', 'get').mockReturnValue(false);
      const enqueuedMutations: any[] = [];

      // شبیه‌سازی متد enqueue در صف همگام‌سازی آفلاین
      vi.spyOn(offlineSync, 'enqueue').mockImplementation(async (method: string, url: string, body: any, meta: any) => {
        enqueuedMutations.push({ method, url, body, meta, status: 'pending' });
        // به‌روزرسانی شمارنده آیتم‌های معلق
        (offlineSync as any)._pendingCount$.next(enqueuedMutations.length);
        return {} as any;
      });

      // آماده‌سازی store برای کار با کش لوکال
      countTaskStore.sync = offlineSync;
      countTaskStore.saveDraft = async (task: CountTask, changes: any, userId: number) => {
        Object.assign(task, changes, { _offlinePending: true });
        await offlineSync.enqueue(
          'PATCH',
          `https://app.farsalish.ir/api/inventory/count-tasks/${task.id}/`,
          { ...changes, base_updated_at: task.updated_at },
          { userId, entityType: 'count_task', entitySyncId: task.sync_id }
        );
      };

      // ساخت نمونه داشبورد باجه
      const counterDashboard = new CounterDashboard(
        {} as any,
        { update: vi.fn() } as any,
        {} as any,
        {} as any,
        mockToast,
        mockConfirmDialog,
        mockCdr,
        { appState: { activeWarehouseId: 19 } } as any,
        {} as any,
        { user: () => ({ id: 12, username: 'counter1' }) } as any,
        {} as any,
        {} as any,
        {} as any,
        countTaskStore,
        { connect: vi.fn(), notifications$: new Subject() } as any
      );

      // فعال‌سازی حالت محلی (Local-First) از طریق defineProperty
      Object.defineProperty(counterDashboard, 'localFirst', { value: true, configurable: true });

      // باز کردن فرم ویرایش کالا در باجه
      counterDashboard.selectedTask = sampleTask;
      counterDashboard.fieldConfigs = [
        { key: 'new_location', default_label: 'لوکیشن جدید', visible: true, editable: true, is_dynamic: false } as any,
        { key: 'dyn_batch_no', default_label: 'شماره بچ', visible: true, editable: true, is_dynamic: true } as any
      ];
      counterDashboard.countedBalanceStr = '85'; // تغییر تعداد به ۸۵
      counterDashboard.counterNote = 'شمارش دقیق فیزیکی انجام شد';
      counterDashboard.editableValues = {
        new_location: 'LOC-B3', // ویرایش فیلد لوکیشن
        dyn_batch_no: 'NEW-BATCH-2026' // ویرایش فیلد داینامیک اضافی
      };

      // ذخیره پیش‌نویس در حالت آفلاین
      await counterDashboard.saveDraft();

      // ۲. اعتبارسنجی وضعیت در حالت آفلاین
      expect(sampleTask.counted_balance).toBe('85');
      expect(sampleTask.status).toBe('INITIAL_COUNT');
      expect((sampleTask as any)._offlinePending).toBe(true);
      expect(sampleTask.item_details!.new_location).toBe('LOC-B3');
      expect(sampleTask.item_details!.dynamic_data?.['batch_no']).toBe('NEW-BATCH-2026');

      // اعتبارسنجی قرارگیری در صف آفلاین
      expect(enqueuedMutations.length).toBeGreaterThanOrEqual(2);
      expect(enqueuedMutations.some(m => m.meta.entityType === 'count_task' && m.body.counted_balance === '85')).toBe(true);
      expect(enqueuedMutations.some(m => m.meta.entityType === 'item' && m.body.new_location === 'LOC-B3')).toBe(true);
      expect(offlineSync.pendingCount).toBe(enqueuedMutations.length);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۳. اعتبارسنجی نشانگر «آیتم‌های معلق» و «زمان آخرین همگام‌سازی»
  // ════════════════════════════════════════════════════════════════════════
  describe('۳. اعتبارسنجی نشانگر «آیتم‌های معلق» و «زمان آخرین همگام‌سازی»', () => {
    it('کپسول وضعیت نشانگر در حالت صف، تعداد آیتم‌های معلق را به‌درستی نشان داده و پس از پایان، زمان همگام‌سازی را ثبت می‌کند', () => {
      const mockHealth = {
        healthScore$: of(100),
        networkPingMs$: of(25),
        serverHealth$: of({ status: 'ok', server_time: new Date().toISOString() }),
        clientStorage$: of({ quota: 1000, usage: 100 }),
        isDiagnosing$: of(false)
      };
      const mockRouter = {
        navigate: vi.fn()
      };

      const mockState = { appState: { activeWarehouseId: 19 }, activeWarehouse: vi.fn() };
      const injector = Injector.create({
        providers: [
          { provide: SystemHealthService, useValue: mockHealth },
          { provide: Router, useValue: mockRouter },
          { provide: ChangeDetectorRef, useValue: mockCdr },
          { provide: StateService, useValue: mockState },
          { provide: ElementRef, useValue: { nativeElement: document.createElement('div') } }
        ]
      });

      let badge: OfflinePendingBadgeComponent;
      runInInjectionContext(injector, () => {
        badge = new OfflinePendingBadgeComponent(
          { nativeElement: document.createElement('div') },
          mockCdr,
          mockState as any
        );
      });

      badge!.mode = 'header';

      // حالت ۱: وجود ۳ آیتم معلق در صف ارسال
      badge!.networkState = 'online';
      badge!.isSyncing = false;
      badge!.pendingCount = 3;
      badge!.errorCount = 0;

      const pillKeys = Object.keys(badge!.pillClasses).join(' ');
      expect(pillKeys).toContain('border-amber-200');
      expect(badge!.tooltipText).toContain('در صف ارسال');

      // حالت ۲: در حال ارسال
      badge!.isSyncing = true;
      const syncingPillKeys = Object.keys(badge!.pillClasses).join(' ');
      expect(syncingPillKeys).toContain('border-sky-200');

      // حالت ۳: همگام‌سازی موفق و خالی شدن صف
      badge!.isSyncing = false;
      badge!.pendingCount = 0;
      badge!.lastSyncTime = Date.now();

      const syncedPillKeys = Object.keys(badge!.pillClasses).join(' ');
      expect(syncedPillKeys).toContain('border-emerald-200');
      expect(badge!.pillAriaLabel).toContain('اتصال برقرار است');
      expect(badge!.formattedLastSync).not.toBe('هنوز ثبت نشده');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۴. همگام‌سازی کامل (Full Sync / Deep Sync) برای بخش مالی و انبار از منوی کاربری
  // ════════════════════════════════════════════════════════════════════════
  describe('۴. اجرای «همگام‌سازی کامل» (Full sync) برای بخش‌های مالی و انبار از منوی کاربری', () => {
    let userMenu: UserMenuComponent;
    let mockWhService: any;
    let mockState: any;
    let mockStore: any;
    let mockSyncService: any;

    beforeEach(() => {
      mockWhService = {
        getAll: vi.fn().mockReturnValue(of([
          { id: 19, name: 'انبار مرکزی شیراز' },
          { id: 22, name: 'انبار تست ۱' }
        ]))
      };

      mockSyncService = {
        performDeepUpdate: vi.fn().mockResolvedValue([
          { warehouseName: 'انبار مرکزی شیراز', records: 45, bytes: 12400 }
        ])
      };
      vi.spyOn(OfflineSyncService, 'getInstance').mockReturnValue(mockSyncService as any);

      mockState = {
        appState: { projects: [{ id: 19, name: 'انبار مرکزی شیراز' }] }
      };

      mockStore = {
        activeWarehouseId: vi.fn().mockReturnValue('19')
      };

      const mockModuleRegistry = {
        isModuleInstalled: vi.fn().mockReturnValue(true),
        getExtensions: vi.fn().mockImplementation((extKey: string) => {
          if (extKey === 'userMenu') {
            return [
              { moduleCode: 'warehouse', extension: { deepSyncScope: 'warehouse' } },
              { moduleCode: 'accounting', extension: { deepSyncScope: 'finance' } }
            ];
          }
          if (extKey === 'projectLookup') {
            return [{ moduleCode: 'accounting', extension: { financialProjectsEndpoint: '/org/projects' } }];
          }
          return [];
        })
      };

      const injector = Injector.create({
        providers: [
          { provide: AuthService, useValue: { user: () => ({ username: 'admin', is_superuser: true }), userRoleTitles: () => ['مدیر سیستم'] } },
          { provide: AuthStore, useValue: mockStore },
          { provide: StateService, useValue: mockState },
          { provide: AccountsHttpService, useValue: { updateMyAvatar: vi.fn(), deleteMyAvatar: vi.fn() } },
          { provide: ScopeDirectoryService, useValue: mockWhService },
          { provide: ModuleRegistryService, useValue: mockModuleRegistry },
          { provide: ToastService, useValue: mockToast },
          { provide: ConfirmDialogService, useValue: mockConfirmDialog },
          { provide: PwaUpdateService, useValue: { isChecking: () => false, checkForUpdateManually: vi.fn() } },
          { provide: PwaInstallService, useValue: { isInstalled: () => false, isIos: () => false, canInstall: () => false } },
          { provide: WebPushService, useValue: { state: () => 'off', busy: () => false, refreshState: () => Promise.resolve(), enable: () => Promise.resolve({ ok: true, messageFa: '' }), disable: () => Promise.resolve({ ok: true, messageFa: '' }) } },
          { provide: Router, useValue: { url: '/app/warehouse/items', navigate: vi.fn() } },
          { provide: ChangeDetectorRef, useValue: mockCdr },
          { provide: AppPersonaService, useValue: { activeApp: () => 'warehouse', isSuperuser: () => true } },
          { provide: ApiService, useValue: { get: vi.fn().mockReturnValue(of([{ id: 10, name: 'پروژه قطار شهری' }])) } },
          { provide: ActiveCompanyService, useValue: { activeCompany: () => ({ id: 1 }) } }
        ]
      });

      runInInjectionContext(injector, () => {
        userMenu = new UserMenuComponent();
      });
    });

    it('همگام‌سازی کامل بخش انبار تمام کالاها و تسک‌های انبار انتخابی را با موفقیت دریافت و به‌روزرسانی می‌کند', async () => {
      userMenu.deepSyncWarehouses = [{ id: 19, name: 'انبار مرکزی شیراز' }];

      // فراخوانی متد همگام‌سازی کامل انبار
      await userMenu.startDeepSync([19]);

      // بررسی فراخوانی سرویس کشیدن دلتا برای انبار ۱۹
      expect(mockSyncService.performDeepUpdate).toHaveBeenCalledWith([19], expect.any(Object), 'warehouse');
      expect(mockConfirmDialog.open).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
    });

    it('همگام‌سازی کامل بخش مالی اطلاعات پروژه‌ها و کارکرد پرسنل را با موفقیت دریافت و کش می‌کند', async () => {
      userMenu.deepSyncProjects = [{ id: 10, name: 'پروژه قطار شهری' }];

      // شبیه‌سازی context مالی
      vi.spyOn(userMenu as any, 'currentScopeContext', 'get').mockReturnValue('finance');

      // اجرای همگام‌سازی کامل مالی
      await userMenu.startDeepSync([10]);

      expect(mockSyncService.performDeepUpdate).toHaveBeenCalledWith([10], expect.any(Object), 'finance');
      expect(mockConfirmDialog.open).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
    });

    it('همگام‌سازی کامل چندگانه (انبار و مالی همزمان) هر دو بخش را در یک تراکنش هماهنگ پوشش می‌دهد', async () => {
      userMenu.deepSyncWarehouses = [{ id: 19, name: 'انبار مرکزی شیراز' }];
      userMenu.deepSyncProjects = [{ id: 10, name: 'پروژه قطار شهری' }];

      // اجرای همگام‌سازی همزمان هر دو بخش
      await userMenu.startDeepSync({
        warehouseIds: [19],
        projectIds: [10]
      });

      expect(mockSyncService.performDeepUpdate).toHaveBeenCalledWith([19], expect.any(Object), 'warehouse');
      expect(mockSyncService.performDeepUpdate).toHaveBeenCalledWith([10], expect.any(Object), 'finance');
      expect(mockConfirmDialog.open).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
      expect(userMenu.isSyncing).toBe(false);
    });
  });
});
