import { WhFrontendModule } from '../../core/modules/module-contract';
import { LETTERS_SYSTEM_NAV_ITEMS, LETTERS_CONTEXT_NAV_ITEMS } from './nav-items';

/**
 * مانیفست ماژول نامه‌های شرکت (ل-و، طرح Documents/Release_v1/letters_module/plan_letters.md).
 * opt-in است (س۸): فقط با نام صریح در --modules / WH_MODULES در باندل می‌آید؛ installed-modules.ts commit‌شده آن را ندارد.
 * همهٔ رفتارش از نقطه‌های توسعهٔ پلتفرم است؛ هیچ فایل هسته یا پوسته برایش تغییر نکرده است.
 */
export const MODULE: WhFrontendModule = {
  code: 'letters',
  aliases: [],
  titleFa: 'نامه‌های شرکت',
  titleShortFa: 'نامه‌ها',
  descriptionFa: 'نامهٔ داخلی، صادره، وارده، صورت‌جلسه و بخشنامه با امضا، ثبت و ارجاع.',
  icon: 'file-text',
  routePrefix: '/app/letters',
  defaultRoute: '/app/letters',
  scopeKind: 'letters',
  optIn: true,
  permissionMarkers: [
    'view_letters_hub'
  ],
  roles: ['operator', 'supervisor', 'accountant', 'manager', 'treasury'],
  routes: () => import('./letters.routes').then(m => m.LETTERS_ROUTES),
  entityIcons: {},
  extensions: {
    launcherTile: {
      themeColor: 'sky',
      tags: ['نامه', 'دبیرخانه'],
      appKey: 'letters'
    },
    layoutNav: {
      primaryItems: LETTERS_SYSTEM_NAV_ITEMS,
      contextItems: LETTERS_CONTEXT_NAV_ITEMS,
      showWarehouseSwitcher: false,
      defaultExitRoute: '/app/letters'
    },
    operations: {
      quickLink: { title: 'نامه‌های شرکت', route: '/app/letters' },
      syncMonitorScope: 'letters',
      queueLabelFa: 'نامه‌ها',
      queueOrder: 40
    },
    users: {
      permissionGroup: {
        key: 'LETTERS',
        titleFa: 'نامه‌های شرکت',
        order: 40,
        codenames: [
          'view_letters_hub',
          'perm_letters_compose',
          'perm_letters_circular',
          'perm_letters_secretariat',
          'perm_letters_settings',
        ]
      },
      shortPermissionNames: {
        view_letters_hub: 'ورود به نامه‌ها',
        perm_letters_compose: 'نوشتن نامه',
        perm_letters_circular: 'نوشتن بخشنامه',
        perm_letters_secretariat: 'دبیرخانه',
        perm_letters_settings: 'تنظیمات نامه',
      }
    },
    healthDashboard: {
      panelScopes: ['letters'],
      panel: {
        order: 40,
        scopeLabelFa: 'نامه‌های شرکت',
        tone: 'blue',
        storageLabelFa: 'نامه‌ها',
        dbLabelEn: 'Letters IndexedDB',
        dbShortEn: 'Letters'
      }
    },
    offlineSync: {
      scopeKind: 'letters',
      dbName: 'WarehouseOfflineDB_letters',
      queueUrlPatterns: ['/letters/'],
      activePathPatterns: ['/app/letters'],
      appRoutePrefixes: ['/app/letters'],
      entityTypeUrlPatterns: [{ urlPart: '/letters/', entityType: 'letters_draft' }]
    }
  }
};
