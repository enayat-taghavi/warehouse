/**
 * پیام ردِ «دورهٔ مالی بسته» از پاسخ 400 سرور (۳.۲ ص۵).
 * بدنه: `{ <فیلد تاریخ>: [پیام], code: 'fiscal_period_closed' }`.
 * اگر خطا از این نوع نباشد `null` برمی‌گرداند تا فرم پیام همیشگی خود را نشان دهد.
 */
export function fiscalPeriodClosedMessage(err: any, dateField: string): string | null {
  const body = err?.error;
  if (!body || typeof body !== 'object' || body.code !== 'fiscal_period_closed') return null;
  const value = body[dateField];
  const msg = Array.isArray(value) ? value[0] : value;
  return typeof msg === 'string' && msg ? msg : 'دورهٔ مالی این تاریخ بسته است؛ سند با این تاریخ ثبت، ویرایش یا حذف نمی‌شود.';
}
