import { WhFrontendModule } from '../../core/modules/module-contract';
import { WAREHOUSE_SYSTEM_NAV_ITEMS, WAREHOUSE_CONTEXT_NAV_ITEMS } from './nav-items';
import { WAREHOUSE_ENTITY_ICONS } from './entity-icons';

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
      appKey: 'warehouse'
    },
    userMenu: {
      shortcutsCategory: {
        id: 'counting',
        label: 'انبارگردانی و اسکنر',
        count: 5
      },
      deepSyncScope: 'warehouse'
    },
    layoutNav: {
      primaryItems: WAREHOUSE_SYSTEM_NAV_ITEMS,
      contextItems: WAREHOUSE_CONTEXT_NAV_ITEMS,
      showWarehouseSwitcher: true,
      defaultExitRoute: '/app/warehouse/projects'
    },
    operations: {
      quickLink: { title: 'سامانه انبارداری', route: '/app/warehouse' },
      syncMonitorScope: 'warehouse'
    },
    companies: {
      hasWarehouseModuleToggle: true
    },
    users: {
      permissionGroupKeys: ['WH_AUDIT']
    },
    healthDashboard: {
      panelScopes: ['warehouse']
    },
    audit: {
      appScopes: ['warehouse']
    },
    idCards: {
      supported: true
    },
    crossModuleFilters: {
      warehouseScopeFilter: true
    },
    syncConfig: {
      scopeKind: 'warehouse',
      pullEndpoint: '/inventory/sync/pull/',
      scopeParamKey: 'warehouse_id'
    },
    dynamicFields: {
      fieldsEndpoint: '/inventory/dynamic-fields/'
    },
    photoUpload: {
      itemPhotosEndpoint: (itemId: number | string) => `/inventory/items/${itemId}/photos/`
    },
    loadLabelDesigner: () => import('./components/label-designer/label-designer').then(m => m.LabelDesigner)
  }
};
