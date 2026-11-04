import { ModuleNavItem } from '../../core/modules/module-contract';

export const LETTERS_SYSTEM_NAV_ITEMS: ModuleNavItem[] = [
  { id: 'letters', label: 'نامه‌های شرکت', shortLabel: 'نامه‌ها', icon: 'file-text', permission: 'view_letters_hub', module: 'letters', route: '/app/letters' },
];

export const LETTERS_CONTEXT_NAV_ITEMS: ModuleNavItem[] = [
  { id: 'letters', label: 'فهرست نامه‌ها', shortLabel: 'نامه‌ها', icon: 'file-text', permission: 'view_letters_hub', module: 'letters', route: '/app/letters' },
  { id: 'letters-new', label: 'نامهٔ تازه', shortLabel: 'تازه', icon: 'file-plus', permission: 'perm_letters_compose', module: 'letters', route: '/app/letters/new' },
  { id: 'letters-secretariat', label: 'دبیرخانه', shortLabel: 'دبیرخانه', icon: 'clipboard', permission: 'perm_letters_secretariat', module: 'letters', route: '/app/letters/secretariat' },
];
