import { WhFrontendModule } from '../../core/modules/module-contract';
import { SHOWCASE_SYSTEM_NAV_ITEMS, SHOWCASE_CONTEXT_NAV_ITEMS } from './nav-items';

/**
 * مانیفست ماژول نمایشی — اثبات زندهٔ آمادگی N-ماژولی (گام ۷ ماژولارسازی).
 * opt-in است: فقط با نام صریح در --modules / WH_MODULES در باندل می‌آید؛ بیلد پیش‌فرض آن را ندارد.
 * همهٔ رفتارش از نقطه‌های توسعهٔ پلتفرم است و هیچ فایل هسته یا پوسته برایش تغییر نکرده است.
 */
export const MODULE: WhFrontendModule = {
  code: 'showcase',
  aliases: [],
  titleFa: 'ماژول نمایشی',
  titleShortFa: 'نمایشی',
  descriptionFa: 'ماژول نمونهٔ پلتفرم برای اثبات نصب مستقل ماژول سوم.',
  icon: 'box',
  routePrefix: '/app/showcase',
  defaultRoute: '/app/showcase/overview',
  scopeKind: 'showcase',
  optIn: true,
  permissionMarkers: [
    'view_showcase_hub'
  ],
  roles: ['operator', 'supervisor', 'manager'],
  routes: () => import('./showcase.routes').then(m => m.SHOWCASE_ROUTES),
  entityIcons: {},
  extensions: {
    launcherTile: {
      themeColor: 'indigo',
      tags: ['ماژول نمایشی'],
      appKey: 'showcase'
    },
    layoutNav: {
      primaryItems: SHOWCASE_SYSTEM_NAV_ITEMS,
      contextItems: SHOWCASE_CONTEXT_NAV_ITEMS,
      showWarehouseSwitcher: false,
      defaultExitRoute: '/app/showcase'
    },
    operations: {
      quickLink: { title: 'ماژول نمایشی', route: '/app/showcase' },
      syncMonitorScope: 'showcase',
      queueLabelFa: 'نمایشی',
      queueOrder: 30
    },
    users: {
      permissionGroup: { key: 'SHOWCASE', titleFa: 'نمایشی 🧪', order: 30, codenames: ['view_showcase_hub'] },
      shortPermissionNames: { view_showcase_hub: 'پیشخوان نمایشی' }
    },
    healthDashboard: {
      panelScopes: ['showcase'],
      panel: {
        order: 30,
        scopeLabelFa: 'ماژول نمایشی',
        tone: 'blue',
        storageLabelFa: 'نمایشی',
        dbLabelEn: 'Showcase IndexedDB',
        dbShortEn: 'Showcase'
      }
    },
    offlineSync: {
      scopeKind: 'showcase',
      dbName: 'WarehouseOfflineDB_showcase',
      queueUrlPatterns: ['/showcase/'],
      activePathPatterns: ['/app/showcase'],
      appRoutePrefixes: ['/app/showcase']
    }
  }
};
