import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';
import { STATUS_ICONS } from '../../../../../shared/icons/semantic-icons';
import { TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';

/**
 * صفحهٔ مشترک تن‌خواه (طرح بازطراحی تن‌خواه ت۱): یک کامپوننت برای حسابدار، مدیر و خزانه‌دار؛
 * هر نقش فقط تفاوت‌هایش (زبانه‌ها، دکمه‌ها، اقدام ردیف) را اینجا می‌دهد.
 * شناسهٔ زبانه‌ها همان شناسه‌های قدیمی است تا پیوندهای ?tab= کار کنند.
 */
export type PettyRole = 'accountant' | 'manager' | 'treasurer';
export type PettyTabId = 'all' | 'pending_review' | 'settled' | 'accounts';

export interface PettyTabSpec extends TabDef {
  id: PettyTabId;
  /** وضعیت‌های ردیف این زبانه؛ خالی یعنی همهٔ ردیف‌های صفحه */
  statuses?: string[];
}

export interface PettyPageConfig {
  role: PettyRole;
  /** «همه» همیشه اول و پیش‌فرض است */
  tabs: PettyTabSpec[];
  /** ردیف‌های قدیمی که این صفحه نشان می‌دهد (زبانهٔ «همه») */
  listStatuses: string[];
  /** فیلتر نوع ردیف در درخواست به سرور (خزانه‌دار فقط شارژها) */
  transactionType?: 'allocation';
  /** اقدام ردیف‌های زبانهٔ «بررسی/واریز»: تایید و عودت حسابدار، واریز خزانه‌دار، یا هیچ */
  rowAction: 'review' | 'deposit' | null;
  /** دکمهٔ «حساب جدید» و ورود اکسل (بک‌اند: perm_petty_cash_manage یا perm_manager_payment_authorize) */
  canManageAccounts: boolean;
  /** خروج اکسل */
  canExport: boolean;
}

const LEGACY_STATUSES = ['pending_supervisor', 'pending_accountant', 'pending_manager'];

const allTab = (title: string): PettyTabSpec => ({
  id: 'all', label: 'همه', shortLabel: 'همه', title, icon: STATUS_ICONS.all, tone: 'slate'
});
const reviewTab = (label: string, title: string, statuses: string[]): PettyTabSpec => ({
  id: 'pending_review', label, shortLabel: label, title, icon: STATUS_ICONS.pending, tone: 'amber', statuses
});
const paidTab = (statuses: string[]): PettyTabSpec => ({
  id: 'settled', label: 'پرداخت‌شده', shortLabel: 'پرداخت‌شده', title: 'شارژ و تسویه شده',
  icon: STATUS_ICONS.approved, tone: 'emerald', statuses
});
const accountsTab: PettyTabSpec = {
  id: 'accounts', label: 'حساب‌ها', shortLabel: 'حساب‌ها', title: 'حساب‌های تنخواه',
  icon: ACCOUNTING_ENTITY_ICONS.pettyCash, tone: 'indigo'
};

export const PETTY_PAGE_CONFIGS: Record<PettyRole, PettyPageConfig> = {
  accountant: {
    role: 'accountant',
    tabs: [
      allTab('کل دفاتر تنخواه'),
      reviewTab('بررسی', 'نیازمند ممیزی', ['pending_accountant']),
      paidTab(['pending_manager']),
      accountsTab
    ],
    listStatuses: LEGACY_STATUSES,
    rowAction: 'review',
    canManageAccounts: true,
    canExport: true
  },
  manager: {
    role: 'manager',
    tabs: [
      allTab('کل دفاتر تنخواه'),
      reviewTab('بررسی', 'در انتظار تایید مدیر', ['pending_manager']),
      accountsTab
    ],
    listStatuses: LEGACY_STATUSES,
    // تایید مدیر از کارتابل است؛ سرور ردیف قدیمی pending_manager را با approve نمی‌پذیرد
    rowAction: null,
    canManageAccounts: true,
    canExport: true
  },
  treasurer: {
    role: 'treasurer',
    tabs: [
      allTab('همهٔ شارژهای تنخواه'),
      reviewTab('واریز', 'در انتظار واریز شارژ', ['pending_supervisor', 'pending_accountant']),
      paidTab(['approved'])
    ],
    listStatuses: ['pending_supervisor', 'pending_accountant', 'approved'],
    transactionType: 'allocation',
    rowAction: 'deposit',
    canManageAccounts: false,
    canExport: false
  }
};

export function pettyPageConfig(role: unknown): PettyPageConfig {
  return PETTY_PAGE_CONFIGS[(role as PettyRole)] ?? PETTY_PAGE_CONFIGS.accountant;
}
