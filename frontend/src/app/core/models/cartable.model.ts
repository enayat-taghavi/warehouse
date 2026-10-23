/**
 * Core types, interfaces, and constants for unified Cartables (Counter, Customs, Supervisor, Manager)
 */

export type CartableDomain = 'counting' | 'financial';

export type CartableWorkflowTab = 'my-tasks' | 'pool';

export type CartableStatusFilter = 'pending' | 'recount' | 'initial' | 'completed' | 'all';

export type CartableDateFilter = 'all' | 'today' | 'yesterday' | 'week';

export interface CartableStatusCounts {
  all: number;
  pending: number;
  recount: number;
  initial: number;
  completed: number;
}

export interface CartableMetrics {
  totalCount: number;
  completedCount: number;
  remainingCount: number;
  matchedCount?: number;
  mismatchedCount?: number;
}

export interface CartableSortOption {
  field: string;
  label: string;
  direction?: 'asc' | 'desc';
}

export const CARTABLE_STATUS_LABELS: Record<CartableStatusFilter, string> = {
  pending: 'در انتظار',
  recount: 'بررسی مجدد',
  initial: 'آماده ارسال',
  completed: 'ارسال شده',
  all: 'همه موارد',
};

export const CARTABLE_STATUS_SUPERVISOR_LABELS: Record<CartableStatusFilter, string> = {
  pending: 'در انتظار',
  recount: 'بررسی مجدد',
  initial: 'آماده بررسی',
  completed: 'تایید شده',
  all: 'همه موارد',
};

export const CARTABLE_DATE_LABELS: Record<CartableDateFilter, string> = {
  all: 'کل زمان‌ها',
  today: 'امروز',
  yesterday: 'دیروز',
  week: 'این هفته',
};

export const CARTABLE_TAB_LABELS: Record<CartableDomain, Record<CartableWorkflowTab, string>> = {
  counting: {
    'my-tasks': 'تسک‌های من',
    'pool': 'مخزن کالاها',
  },
  financial: {
    'my-tasks': 'تسک‌های من',
    'pool': 'مخزن اسناد',
  },
};
