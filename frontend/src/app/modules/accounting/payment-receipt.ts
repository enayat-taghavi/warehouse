/**
 * رسید پرداخت (۹ آبان ۱۴۰۵): در هر پرداخت فاکتور و تنخواه اجباری است و پیوست هستهٔ همان سند با برچسب
 * payment_receipt می‌شود؛ همهٔ شرکت‌کنندگان گردش و مدیران و حسابداران دامنه آن را می‌بینند.
 */
export const PAYMENT_RECEIPT_LABEL = 'payment_receipt';
/** همان پسوندهای مجاز سرور برای مدرک (common/serializer_fields.py) */
export const PAYMENT_RECEIPT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.zip,.rar,.xlsx,.xls,.docx,.doc';
const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;

/** خطای فارسی فایل رسید پیش از فرستادن؛ رشتهٔ خالی یعنی فایل پذیرفتنی است */
export function receiptFileError(file: File): string {
  const ext = (file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
  if (!ext || !PAYMENT_RECEIPT_ACCEPT.split(',').includes(ext)) {
    return 'نوع فایل رسید مجاز نیست (PDF، تصویر، Word، Excel یا فایل فشرده).';
  }
  if (file.size > MAX_RECEIPT_BYTES) return 'حجم فایل رسید نباید بیشتر از ۲۵ مگابایت باشد.';
  return '';
}
