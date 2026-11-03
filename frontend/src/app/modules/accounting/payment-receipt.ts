import { PersianDatePipe } from '../../shared/pipes/persian-date.pipe';

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
    return 'نوع فایل سند واریز مجاز نیست (PDF، تصویر، Word، Excel یا فایل فشرده).';
  }
  if (file.size > MAX_RECEIPT_BYTES) return 'حجم فایل سند واریز نباید بیشتر از ۲۵ مگابایت باشد.';
  return '';
}

/** عنوان کوتاه وضعیت در ردیف فهرست رسیدهای پرداخت؛ عنوان کامل در راهنمای نشانگر می‌ماند */
const INVOICE_STATUS_SHORT: Record<string, string> = {
  draft: 'پیش‌نویس',
  pending_supervisor: 'نزد سرپرست',
  pending_accountant: 'نزد حسابدار',
  pending_manager: 'نزد مدیر',
  ready_to_pay: 'آماده پرداخت',
  pending_payment: 'آماده پرداخت',
  partially_paid: 'پرداخت ناقص',
  paid: 'پرداخت‌شده',
  settled_outside: 'پرداخت بیرونی',
  revision_required: 'بازنگری',
  rejected: 'رد شده',
};

export function invoiceStatusShort(status?: string | null, fallback?: string | null): string {
  return (status && INVOICE_STATUS_SHORT[status]) || fallback || status || 'نامشخص';
}

const DATE_PIPE = new PersianDatePipe();

/** راهنمای نشانگر ایجادکننده: تاریخ دقیق ثبت و آخرین تغییر */
export function invoiceCreatorHint(row: {
  created_at?: string | null;
  updated_by_name?: string | null;
  updated_at?: string | null;
}): string {
  const parts = [`تاریخ ثبت: ${DATE_PIPE.transform(row.created_at, 'short-time')}`];
  if (row.updated_by_name || row.updated_at) {
    parts.push(`آخرین تغییر: ${row.updated_by_name || '—'} (${DATE_PIPE.transform(row.updated_at, 'short-time')})`);
  }
  return parts.join(' — ');
}

function faNum(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? String(v ?? '') : n.toLocaleString('fa-IR');
}

/** راهنمای نشانگر مبلغ: جزئیاتی که در ردیف یک‌خطی دیده نمی‌شود */
export function invoiceAmountHint(row: {
  lines?: unknown[] | null;
  subtotal?: unknown;
  discount_amount?: unknown;
  vat_amount?: unknown;
  paid_amount?: unknown;
  remaining?: unknown;
}): string {
  const parts: string[] = [];
  if (row.lines?.length) parts.push(`${faNum(row.lines.length)} ردیف · جمع ردیف‌ها ${faNum(row.subtotal)}`);
  if (row.discount_amount && +row.discount_amount > 0) parts.push(`تخفیف ${faNum(row.discount_amount)}`);
  if (row.vat_amount && +row.vat_amount > 0) parts.push(`مالیات ${faNum(row.vat_amount)}`);
  if (row.paid_amount && +row.paid_amount > 0) parts.push(`پرداخت‌شده ${faNum(row.paid_amount)} · مانده ${faNum(row.remaining)}`);
  return parts.join(' — ');
}
