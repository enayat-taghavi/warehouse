import { fiscalPeriodClosedMessage } from './fiscal-period-error';

/** پیام یکسان قفل دورهٔ کارکرد (۴.۴ د۴، د۹). */
export const ATTENDANCE_PERIOD_LOCKED_FA = 'دوره قفل است؛ با مسئول دوره هماهنگ کنید.';

/**
 * پیام خطاهای شناخته‌شدهٔ نوشتن کارکرد از پاسخ 400 سرور (۴.۴-ب):
 * - `attendance_period_locked`: دورهٔ ارسال‌شده یا قفل؛
 * - `fiscal_period_closed`: تاریخ در دورهٔ مالی بسته (بدنه `{date_shamsi: [پیام], code}`)؛
 * - `override_reason_required`: دور زدن قفل بی دلیل؛
 * - `attendance_duplicate_day` و `personnel_section_mismatch`.
 * اگر خطا از این نوع‌ها نباشد `null` برمی‌گرداند تا فراخوان پیام همیشگی خود را نشان دهد.
 */
export function attendanceWriteErrorMessage(err: any): string | null {
  const body = err?.error;
  if (!body || typeof body !== 'object') return null;
  switch (body.code) {
    case 'attendance_period_locked':
      return ATTENDANCE_PERIOD_LOCKED_FA;
    case 'fiscal_period_closed':
      return fiscalPeriodClosedMessage(err, 'date_shamsi');
    case 'override_reason_required':
      return 'برای ثبت در دورهٔ قفل، نوشتن دلیل الزامی است.';
    case 'attendance_duplicate_day':
      return 'برای این پرسنل در این روز کارکرد دیگری ثبت شده است.';
    case 'personnel_section_mismatch':
      return 'این پرسنل در بخش انتخاب‌شده نیست.';
    default:
      return null;
  }
}

/** پیام عمومی خطای اقدام گردش کارکرد: پیام شناخته‌شده، سپس `error`/`detail` سرور، سپس پیش‌فرض. */
export function attendanceActionErrorMessage(err: any, fallback: string): string {
  const known = attendanceWriteErrorMessage(err);
  if (known) return known;
  const body = err?.error;
  if (err?.status === 403) return body?.error || body?.detail || 'شما مجوز این اقدام را ندارید.';
  if (err?.status === 404) return 'مورد پیدا نشد یا به آن دسترسی ندارید.';
  if (body && typeof body === 'object') {
    const msg = body.error || body.detail || body.message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}
