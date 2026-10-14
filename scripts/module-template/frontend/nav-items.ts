import { PLATFORM_ENTITY_ICONS } from '../../shared/icons/semantic-icons';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  permission: string;
  module?: string;
  isAccounting?: boolean;
}

export const __MODULE_UPPER___SYSTEM_NAV_ITEMS: NavItem[] = [
  { id: 'sample', label: '__MODULE_TITLE_FA__', icon: PLATFORM_ENTITY_ICONS.dashboard, permission: 'view_sys___MODULE_CODE__', module: '__MODULE_CODE__' },
];

export const __MODULE_UPPER___CONTEXT_NAV_ITEMS: NavItem[] = [
  { id: 'sample', label: 'صفحه نمونه', icon: PLATFORM_ENTITY_ICONS.dashboard, permission: 'view_sys___MODULE_CODE__', module: '__MODULE_CODE__' },
];
