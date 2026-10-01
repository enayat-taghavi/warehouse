import { gregorianToJalali } from '../../../core/utils/date-utils';

/** ماه‌های شمسی دورهٔ حقوق؛ نام ماه همان مقدار query param «month» در هاب‌های حسابدار است. */
export const PAYROLL_MONTHS: ReadonlyArray<{ name: string; code: string }> = [
  { name: 'فروردین', code: '01' },
  { name: 'اردیبهشت', code: '02' },
  { name: 'خرداد', code: '03' },
  { name: 'تیر', code: '04' },
  { name: 'مرداد', code: '05' },
  { name: 'شهریور', code: '06' },
  { name: 'مهر', code: '07' },
  { name: 'آبان', code: '08' },
  { name: 'آذر', code: '09' },
  { name: 'دی', code: '10' },
  { name: 'بهمن', code: '11' },
  { name: 'اسفند', code: '12' },
];

export function payrollMonthCode(monthName: string): string {
  return PAYROLL_MONTHS.find(m => m.name === monthName)?.code ?? '01';
}

export function isPayrollMonthName(value: string): boolean {
  return PAYROLL_MONTHS.some(m => m.name === value);
}

/** دورهٔ پیش‌فرض: ماه شمسیِ گذشته، چون حقوق پس از پایان ماه محاسبه می‌شود. */
export function defaultPayrollPeriod(today: Date = new Date()): { year: string; month: string } {
  const { jy, jm } = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const month = jm === 1 ? 12 : jm - 1;
  const year = jm === 1 ? jy - 1 : jy;
  return { year: String(year), month: PAYROLL_MONTHS[month - 1].name };
}

/** سال‌های قابل انتخاب: سال‌های مالی تعریف‌شده به‌علاوه سال دوره جاری، نزولی. */
export function mergeFiscalYears(serverYears: string[] | undefined, ...extra: string[]): string[] {
  const all = new Set<string>([...(serverYears || []), ...extra].filter(y => /^\d{4}$/.test(y)));
  return Array.from(all).sort((a, b) => Number(b) - Number(a));
}
