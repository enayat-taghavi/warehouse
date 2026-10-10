import { IconName } from '../../shared/icons/icon-registry';

/**
 * فرهنگ آیکون موجودیت‌های ماژول حسابداری، پرسنلی، خزانه و مدیریت مالی
 * مرجع: جدول ۳-۳ در طرح جامع ارگونومی واکنش‌گرا
 * فقط توسط ماژول accounting مصرف می‌شود (جداسازی وابستگی‌ها).
 */
export const ACCOUNTING_ENTITY_ICONS = {
  projectsAndSections: 'folder',
  attendance: 'calendar',
  fleet: 'truck',
  personnel: 'users',
  newPersonnel: 'user-plus',
  invoices: 'file-text',
  pettyCash: 'credit-card',
  payroll: 'dollar-sign',
  diskettes: 'file-check',
  counterparties: 'briefcase',
  profilesArchive: 'id-card',
  budget: 'calculator',
  approvals: 'check-circle',
  periodLock: 'lock',
  bankAccounts: 'database',
  cheques: 'clipboard-check',
  reconciliation: 'columns',
  companyDocumentsArchive: 'book',
} as const satisfies Record<string, IconName>;

export type AccountingEntityIconKey = keyof typeof ACCOUNTING_ENTITY_ICONS;
