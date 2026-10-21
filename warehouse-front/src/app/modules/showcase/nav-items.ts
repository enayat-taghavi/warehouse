import { PLATFORM_ENTITY_ICONS } from '../../shared/icons/semantic-icons';
import { ModuleNavItem } from '../../core/modules/module-contract';

export const SHOWCASE_SYSTEM_NAV_ITEMS: ModuleNavItem[] = [
  { id: 'sample', label: 'ماژول نمایشی', icon: PLATFORM_ENTITY_ICONS.dashboard, permission: 'view_showcase_hub', module: 'showcase' },
];

export const SHOWCASE_CONTEXT_NAV_ITEMS: ModuleNavItem[] = [
  { id: 'sample', label: 'صفحه نمونه', icon: PLATFORM_ENTITY_ICONS.dashboard, permission: 'view_showcase_hub', module: 'showcase' },
];
