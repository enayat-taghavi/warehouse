import { WhFrontendModule } from '../../core/modules/module-contract';
import { __MODULE_UPPER___SYSTEM_NAV_ITEMS, __MODULE_UPPER___CONTEXT_NAV_ITEMS } from './nav-items';

/**
 * مانیفست رسمی و مستقل ماژول __MODULE_TITLE_FA__ (Front-End Module Manifest)
 */
export const MODULE: WhFrontendModule = {
  code: '__MODULE_CODE__',
  aliases: [],
  titleFa: '__MODULE_TITLE_FA__',
  titleShortFa: '__MODULE_TITLE_FA__',
  descriptionFa: 'ماژول __MODULE_TITLE_FA__ مبتنی بر معماری ماژولار پلتفرم.',
  icon: '📦',
  routePrefix: '/app/__MODULE_CODE__',
  defaultRoute: '/app/__MODULE_CODE__/sample',
  scopeKind: 'operations',
  permissionMarkers: [
    'view_sys___MODULE_CODE__'
  ],
  roles: ['operator', 'supervisor', 'manager'],
  routes: () => import('./__MODULE_CODE__.routes').then(m => m.__MODULE_UPPER___ROUTES),
  navItems: {
    systemNavItems: __MODULE_UPPER___SYSTEM_NAV_ITEMS,
    contextNavItems: __MODULE_UPPER___CONTEXT_NAV_ITEMS,
  },
  entityIcons: {},
  extensions: {
    launcherTile: {
      themeColor: 'indigo',
      tags: ['__MODULE_TITLE_FA__'],
      appKey: '__MODULE_CODE__'
    },
    operations: {
      quickLink: { title: '__MODULE_TITLE_FA__', route: '/app/__MODULE_CODE__' },
      syncMonitorScope: '__MODULE_CODE__'
    }
  }
};
