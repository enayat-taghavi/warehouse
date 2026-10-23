import { IconName } from '../../shared/icons/icon-registry';

/**
 * فرهنگ آیکون موجودیت‌های ماژول حسابداری، پرسنلی، خزانه و مدیریت مالی
 * مرجع: جدول ۳-۳ در طرح جامع ارگونومی واکنش‌گرا
 * فقط توسط ماژول accounting مصرف می‌شود (جداسازی وابستگی‌ها).
 */
export const ACCOUNTING_ENTITY_ICONS = {
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
  /** گروه شغلی، احکام و قرارداد پرسنل */
  jobGrades: 'star',
  /** بیمه و تامین اجتماعی */
  insurance: 'shield-plus',
  /** مالیات و سامانه مالیاتی */
  tax: 'globe-alt',
  /** مجوزها و پروانه‌ها */
  licenses: 'badge',
  /** مشخصات فردی و شناسنامه‌ای */
  identity: 'info',
  /** قراردادها و اجاره‌نامه‌های شرکت */
  contractsAndLeases: 'home',
  /** طرف‌حساب تعمیرگاه */
  repairShop: 'tool',
  /** طرف‌حساب جایگاه سوخت */
  fuelStation: 'droplet',
  /** طرف‌حساب پیمانکار */
  contractor: 'users-2',
  /** سایر طرف‌حساب‌ها */
  otherCounterparty: 'help-circle',
  /** درخواست‌های تغییرات پرونده پرسنل و ناوگان */
  changeRequests: 'file-pen',
} as const satisfies Record<string, IconName>;

export type AccountingEntityIconKey = keyof typeof ACCOUNTING_ENTITY_ICONS;
