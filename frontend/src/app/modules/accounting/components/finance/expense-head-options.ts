import { ExpenseHead } from '../../models/personnel.model';

/** یک گروه سرفصل با سرفصل‌های قابل انتخاب زیرش (برای `optgroup`) */
export interface ExpenseHeadOptionGroup {
  id: number | null;
  label: string;
  heads: ExpenseHead[];
}

const byOrder = (a: ExpenseHead, b: ExpenseHead): number =>
  (a.order ?? 0) - (b.order ?? 0) || String(a.code).localeCompare(String(b.code));

/** برچسب گزینه: «کد — عنوان» */
export function expenseHeadLabel(head: Pick<ExpenseHead, 'code' | 'title'>): string {
  return `${head.code} — ${head.title}`;
}

/** پیام 400 سرور روی فیلد `expense_head` (الزامی، گروه، غیرفعال یا شرکت دیگر) */
export function expenseHeadErrorMessage(err: any): string {
  const v = err?.error?.expense_head;
  const msg = Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : '');
  return msg ? String(msg) : '';
}

/**
 * فهرست تخت سرور را به گروه‌های انتخابگر تبدیل می‌کند (۳.۴ ص۷).
 * فقط سرفصل‌های فعال دارای والد گزینه‌اند؛ گروه بی سرفصل نمایش داده نمی‌شود.
 */
export function buildExpenseHeadOptions(heads: ExpenseHead[] | null | undefined): ExpenseHeadOptionGroup[] {
  const list = Array.isArray(heads) ? heads : [];
  const groups = list.filter(h => h.parent == null).sort(byOrder);
  const groupIds = new Set(groups.map(g => g.id));
  const leaves = list.filter(h => h.parent != null && h.is_active !== false).sort(byOrder);
  const out: ExpenseHeadOptionGroup[] = groups
    .filter(g => g.is_active !== false)
    .map(g => ({ id: g.id, label: expenseHeadLabel(g), heads: leaves.filter(h => h.parent === g.id) }))
    .filter(g => g.heads.length > 0);
  // سرفصلی که گروهش در پاسخ نیامده (نباید رخ دهد) با عنوان والد از سرور
  const orphans = leaves.filter(h => !groupIds.has(h.parent as number));
  if (orphans.length) out.push({ id: null, label: orphans[0].parent_title || 'سایر', heads: orphans });
  return out;
}
