/** رویداد انتخاب تاریخ `ng-persian-datepicker` (فقط فیلد میلادی لازم است) */
export interface DatePickEvent { gregorian?: string | Date | null }

/** تاریخ میلادی انتخاب‌شده به‌صورت `YYYY-MM-DD`؛ بدون انتخاب: null */
export function gregorianDay(ev: DatePickEvent | null | undefined): string | null {
  return ev?.gregorian ? String(ev.gregorian).slice(0, 10) : null;
}
