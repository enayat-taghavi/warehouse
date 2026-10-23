import { WhFrontendModule } from '../../core/modules/module-contract';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../core/stores/auth.store';
import { StateService } from '../../core/services/state.service';
import { WAREHOUSE_SYSTEM_NAV_ITEMS, WAREHOUSE_CONTEXT_NAV_ITEMS } from './nav-items';
import { WAREHOUSE_ENTITY_ICONS } from './entity-icons';
import { WAREHOUSE_PERSONAS } from './personas';
import { WAREHOUSE_ROUTE_ACCESS } from './route-access';
import { WAREHOUSE_ROLE_PRESETS } from './role-presets';
import { WAREHOUSE_PERMISSION_CODENAMES, WAREHOUSE_SHORT_PERMISSION_NAMES } from './permissions';
import { WAREHOUSE_DIRECTORY_ENDPOINT } from './warehouse-endpoints';

/**
 * مانیفست رسمی و مستقل ماژول انبارداری و ره‌گیری کالا (Front-End Module Manifest)
 */
export const MODULE: WhFrontendModule = {
  code: 'warehouse',
  aliases: ['wh'],
  titleFa: 'سامانه انبارداری و ره‌گیری کالا',
  titleShortFa: 'انبارداری',
  descriptionFa: 'مدیریت فرآیند شمارش کور انبار، کارتابل سرپرست، تخصیص کالا و صدور MT26/49، ثبت مغایرت‌ها، داشبورد ره‌گیری و ممیزی موجودی کالا.',
  icon: '📦',
  routePrefix: '/app/warehouse',
  defaultRoute: '/app/warehouse/dashboard',
  scopeKind: 'warehouse',
  permissionMarkers: [
    'view_sys_dashboard', 'view_wh_dashboard', 'view_sys_counter',
    'view_sys_supervisor', 'view_sys_manager_review', 'view_wh_docs',
    'view_wh_dispatch', 'view_wh_customs', 'view_wh_doc_approvals',
    'view_wh_feeding', 'view_wh_feed_approvals', 'view_wh_labels',
    'view_wh_label_designer', 'view_wh_audit', 'view_wh_settings',
    'view_sys_recounts', 'view_sys_export', 'view_sys_reports',
    'perm_doc_approve_action', 'perm_feed_approve_action', 'perm_inventory_finalize',
    'perm_rec_import', 'perm_rec_recount', 'perm_rec_dispatch',
    'perm_wh_create', 'perm_wh_edit', 'perm_wh_freeze'
  ],
  roles: ['counter', 'warehouse_supervisor', 'docs_specialist', 'manager_review'],
  personas: WAREHOUSE_PERSONAS,
  routeAccess: WAREHOUSE_ROUTE_ACCESS,
  /** مسیرهای قدیمی ریشه که به صفحه‌های انبار می‌روند */
  legacyRedirects: [
    { path: 'dashboard', redirectTo: 'app/warehouse/dashboard', pathMatch: 'full' },
    { path: 'projects', redirectTo: 'app/warehouse/projects', pathMatch: 'full' },
    { path: 'dispatch', redirectTo: 'app/warehouse/dispatch', pathMatch: 'full' },
    { path: 'docs', redirectTo: 'app/warehouse/docs', pathMatch: 'full' },
    { path: 'users', redirectTo: 'app/warehouse/users', pathMatch: 'full' },
    { path: 'settings', redirectTo: 'app/warehouse/settings', pathMatch: 'full' },
    { path: 'wh-settings', redirectTo: 'app/warehouse/wh-settings', pathMatch: 'full' },
    { path: 'audit', redirectTo: 'app/warehouse/audit', pathMatch: 'full' },
    { path: 'feeding', redirectTo: 'app/warehouse/feeding', pathMatch: 'full' },
    { path: 'counter', redirectTo: 'app/warehouse/counter', pathMatch: 'full' },
    { path: 'supervisor', redirectTo: 'app/warehouse/supervisor', pathMatch: 'full' },
    { path: 'manager-review', redirectTo: 'app/warehouse/manager-review', pathMatch: 'full' },
    { path: 'count-tracking', redirectTo: 'app/warehouse/count-tracking', pathMatch: 'full' },
    { path: 'reports', redirectTo: 'app/warehouse/reports', pathMatch: 'full' },
    { path: 'customs', redirectTo: 'app/warehouse/customs', pathMatch: 'full' },
    { path: 'tasks', redirectTo: 'app/warehouse/tasks', pathMatch: 'full' },
    { path: 'labels', redirectTo: 'app/warehouse/labels', pathMatch: 'full' },
    { path: 'approvals', redirectTo: 'app/warehouse/approvals', pathMatch: 'full' },
    { path: 'doc_approvals', redirectTo: 'app/warehouse/doc_approvals', pathMatch: 'full' },
    { path: 'feed_approvals', redirectTo: 'app/warehouse/feed_approvals', pathMatch: 'full' }
  ],
  routes: () => import('./warehouse.routes').then(m => m.WAREHOUSE_ROUTES),
  navItems: {
    systemNavItems: WAREHOUSE_SYSTEM_NAV_ITEMS,
    contextNavItems: WAREHOUSE_CONTEXT_NAV_ITEMS,
  },
  entityIcons: WAREHOUSE_ENTITY_ICONS,
  extensions: {
    launcherTile: {
      themeColor: 'indigo',
      tags: ['کارتابل انبارگردان', 'مدیریت کالا'],
      appKey: 'warehouse',
      enterLabelFa: 'ورود به انبارگردانی',
      cardTitleFa: 'سامانه انبارگردانی و ره‌گیری کالا',
      switcher: {
        order: 10,
        labelFa: 'انبارگردانی',
        descriptionFa: 'مدیریت و شمارش موجودی انبار',
        icon: 'package',
        accent: 'indigo',
        onlyAccessTitleFa: 'شما صرفاً به ماژول انبارگردانی دسترسی دارید'
      }
    },
    userMenu: {
      shortcutsCategory: {
        id: 'counting',
        label: 'انبارگردانی و اسکنر',
        count: 5
      },
      deepSyncScope: 'warehouse',
      deepSync: {
        scope: 'warehouse',
        order: 10,
        tabLabel: 'انبارداری',
        icon: 'package',
        sectionTitle: 'لیست انبارها',
        opsSectionTitle: 'انبارهای فعال سازمان',
        bannerTitle: 'انتخاب انبارهای هدف',
        bannerDescription: 'با بروزرسانی عمیق، اطلاعات آفلاین ذخیره‌شده برای انبارهای انتخاب‌شده کاملاً پاک شده و از نو دریافت می‌شود.',
        emptyText: 'انباری برای بروزرسانی یافت نشد.',
        selectAllLabel: 'انتخاب همه انبارها',
        clearAllLabel: 'لغو انتخاب انبارها',
        itemLabel: 'انبار',
        summaryLabel: '📦 انبارداری',
        accent: 'indigo',
        initialItems: (injector) => injector.get(StateService, null)?.appState?.projects || [],
        preselectId: (injector) => {
          const id = injector.get(AuthStore, null)?.activeWarehouseId();
          return id && id !== 'ALL' ? Number(id) : null;
        },
        loadItems: async (injector) => {
          // ایمپورت تنبل: سرویس انبار گراف آفلاین را می‌کشد و نباید هنگام ساخت INSTALLED_MODULES بارگذاری شود
          const { WarehouseHttpService } = await import('./api/warehouse-http.service');
          const whService = injector.get(WarehouseHttpService, null);
          if (!whService) return [];
          return (await firstValueFrom(whService.getAll())) || [];
        }
      }
    },
    layoutNav: {
      primaryItems: WAREHOUSE_SYSTEM_NAV_ITEMS,
      contextItems: WAREHOUSE_CONTEXT_NAV_ITEMS,
      showWarehouseSwitcher: true,
      appTitleFa: 'اتوماسیون انبارداری',
      defaultExitRoute: '/app/warehouse/projects'
    },
    operations: {
      quickLink: { title: 'سامانه انبارداری', route: '/app/warehouse' },
      shellLink: { labelFa: 'انبارداری', mobileLabelFa: 'ورود به انبارداری', route: '/app/warehouse/dashboard', icon: 'package', accent: 'indigo' },
      sourceSettings: { labelFa: 'تنظیمات منبع (انبار)', route: '/app/warehouse/wh-settings' },
      monitorLabelFa: 'انبارداری',
      syncMonitorScope: 'warehouse',
      queueLabelFa: 'انبارداری',
      queueOrder: 10,
      conflictSimulation: () => ({
        method: 'PATCH',
        url: '/api/counting/tasks/101/',
        body: {
          quantity: 45,
          reason: 'شمارش ردیف A-04',
          notes: 'شمارش انجام‌شده توسط انباردار تبلت ۱'
        },
        statusCode: 409,
        serverMessage: 'تداخل نسخه سرور (409 Conflict): رکورد هم‌زمان توسط کاربر دیگری در سرور تغییر یافته است.',
        entityType: 'count_task',
        serverResponse: {
          error: 'CONFLICT',
          server_record: {
            id: 101,
            quantity: 50,
            reason: 'ثبت مغایرت توسط سرپرست',
            notes: 'تطبیق نهایی فیزیکی قفسه',
            updated_at: new Date().toISOString()
          }
        }
      })
    },
    users: {
      permissionGroup: { key: 'WH_AUDIT', titleFa: 'انبارگردانی 📦', order: 10, codenames: WAREHOUSE_PERMISSION_CODENAMES },
      shortPermissionNames: WAREHOUSE_SHORT_PERMISSION_NAMES,
      structureWritePermissions: ['can_act_as_manager'],
      assignmentScope: {
        priority: 10,
        labels: {
          singular: 'انبار',
          plural: 'انبارها',
          pluralAttributive: 'انبارهای',
          allOption: 'همه انبارها',
          noneOption: 'بدون انبار',
          listPrefix: 'انبارها:',
          column: 'دسترسی انبارها',
          roleTitlePlaceholder: 'مثال: سرپرست انبار',
          presetsHint: 'تخصیص یکپارچه نقش‌های انبارگردانی و حسابداری با ۱ کلیک',
          companiesTab: 'شرکت‌ها و انبارها',
          nextStep: 'انبارها و پروژه‌ها',
          allowedTitle: 'شرکت‌ها و انبارهای مجاز',
          assignTitle: 'تخصیص انبارهای عملیاتی مجاز',
          emptyText: 'هیچ انباری برای شرکت‌های انتخاب‌شده یافت نشد.',
          sensitiveRecords: 'انبار'
        },
        loadItems: async (injector) => {
          // ایمپورت تنبل: سرویس فهرست، رجیستری ماژول‌ها را می‌کشد و نباید هنگام ساخت INSTALLED_MODULES بارگذاری شود
          const { ScopeDirectoryService } = await import('../../core/http/scope-directory.service');
          return (await firstValueFrom(injector.get(ScopeDirectoryService).getAll())) || [];
        }
      },
      rolePresets: WAREHOUSE_ROLE_PRESETS,
      presetCategory: { key: 'inventory', labelFa: 'انبارگردانی', icon: 'package', tone: 'sky' },
      roleScope: {
        key: 'warehouse', order: 10,
        tabLabelFa: '📦 سامانه انبارداری', badgeLabelFa: 'سامانه انبارداری', shortLabelFa: 'انبارداری', tinyLabelFa: 'انبار',
        icon: '📦', tone: 'sky', countsWarehouses: true,
        nameHints: ['warehouse'], titleHints: ['انبار', 'شمارش']
      }
    },
    healthDashboard: {
      panelScopes: ['warehouse'],
      panel: {
        order: 10,
        scopeLabelFa: 'انبارداری و لجستیک',
        tone: 'blue',
        storageLabelFa: 'انبار',
        dbLabelEn: 'Warehouse IndexedDB',
        dbShortEn: 'Warehouse',
        overview: true,
        stressScenario: {
          value: 'warehouse',
          order: 20,
          optionLabelFa: 'فقط انبارداری (کسر اتمیک موجودی)',
          shortLabelFa: 'انبارداری',
          verdictLabelFa: 'تمامیت اتمیک موجودی انبار:',
          verdictValueFa: 'تایید شد (کسر دقیق بدون افت تراکنش)'
        }
      }
    },
    audit: {
      appScopes: ['warehouse'],
      order: 10,
      scopeLabelFa: 'انبارداری',
      scopeChipLabelFa: 'سامانه انبارداری',
      blockedAppLabelFa: 'سامانه انبارداری',
      hasWarehouseSelector: true,
      logModules: [
        { value: 'docs', labelFa: 'مدیریت کالا' },
        { value: 'dispatch', labelFa: 'تخصیص کالا' },
        { value: 'customs', labelFa: 'مالی و گمرکی' },
        { value: 'feeding', labelFa: 'تغذیه سامانه‌ها (MT)' },
        { value: 'labels', labelFa: 'لیبلینگ و بارکد' },
        { value: 'counter', labelFa: 'میزکار شمارش' },
        { value: 'supervisor', labelFa: 'کارتابل سرپرست' },
        { value: 'manager', labelFa: 'بررسی مدیر' },
        { value: 'warehouses', labelFa: 'مدیریت انبارها' },
        { value: 'settings', labelFa: 'تنظیمات انبار و سیستم' }
      ]
    },
    idCards: {
      supported: true
    },
    scopeDirectory: {
      endpoint: WAREHOUSE_DIRECTORY_ENDPOINT,
      offersScopeFilter: true
    },
    syncConfig: {
      scopeKind: 'warehouse',
      pullEndpoint: '/inventory/sync/pull/',
      scopeParamKey: 'warehouse_id',
      activeAppHeader: 'warehouse',
      defaultOfflineRole: 'counter',
      tokenScopeKey: 'warehouse',
      targetLabelFa: 'انبار',
      legacyCursorKey: true,
      purgeBeforeDeepUpdate: async (id, userId) => {
        const { warehouseOfflineDb } = await import('../../core/services/offline-db');
        const { buildCursorKey } = await import('../../core/services/sync-pull.service');
        await Promise.all([
          warehouseOfflineDb.items.where('warehouse_id').equals(id).delete(),
          warehouseOfflineDb.docTasks.where('warehouse_id').equals(id).delete(),
          warehouseOfflineDb.countTasks.where('warehouse_id').equals(id).delete(),
          warehouseOfflineDb.dynamicFields.where('warehouse_id').equals(id).delete(),
          warehouseOfflineDb.syncCursors.where('warehouseId').equals(id).delete(),
          userId ? warehouseOfflineDb.syncCursors.delete(buildCursorKey(userId, id, 'warehouse')) : Promise.resolve(),
          userId ? warehouseOfflineDb.syncCursors.delete(`${userId}:${id}`) : Promise.resolve()
        ]);
        try {
          await warehouseOfflineDb.apiCache.filter((entry) => entry.url.includes(`warehouse_id=${id}`)).delete();
        } catch {}
      },
      purgeOnAccessRevoked: async (id) => {
        const { warehouseOfflineDb } = await import('../../core/services/offline-db');
        await Promise.all([
          warehouseOfflineDb.items.where('warehouse_id').equals(id).delete(),
          warehouseOfflineDb.countTasks.where('warehouse_id').equals(id).delete(),
          warehouseOfflineDb.docTasks.where('warehouse_id').equals(id).delete(),
          warehouseOfflineDb.dynamicFields.where('warehouse_id').equals(id).delete(),
        ]);
      }
    },
    offlineSync: {
      scopeKind: 'warehouse',
      dbName: 'WarehouseOfflineDB_warehouse',
      queueUrlPatterns: [],
      activePathPatterns: [
        '/app/warehouse',
        '/warehouse'
      ],
      entityTypeUrlPatterns: [
        { urlPart: '/items/', entityType: 'item' },
        { urlPart: '/count-tasks/', entityType: 'count_task' },
        { urlPart: '/tasks/', entityType: 'count_task' },
        { urlPart: '/doc-tasks/', entityType: 'doc_task' },
        { urlPart: '/dynamic-fields/', entityType: 'dynamic_field' }
      ],
      appRoutePrefixes: [
        '/app/warehouse',
        '/app/inventory',
        '/app/counting',
        '/app/items',
        '/app/tag-templates'
      ]
    },
    dynamicFields: {
      fieldsEndpoint: '/inventory/dynamic-fields/'
    },
    photoUpload: {
      itemPhotosEndpoint: (itemId: number | string) => `/inventory/items/${itemId}/photos/`
    },
    permissionAliases: {
      manager_approver: ['can_act_as_manager'],
      supervisor_approver: ['view_sys_supervisor'],
      attendance_entry: ['view_wh_attendance'],
      attendance_supervisor: ['can_act_as_supervisor']
    },
    loadLabelDesigner: () => import('./components/label-designer/label-designer').then(m => m.LabelDesigner)
  }
};
