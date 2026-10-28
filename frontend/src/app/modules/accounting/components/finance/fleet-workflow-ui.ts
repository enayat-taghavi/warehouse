/** ثابت‌ها و کمک‌های مشترک رابط گردش کار ناوگان (۴.۶-ج) */

export const FLEET_OFFLINE_HINT_FA = 'برای این کار باید آنلاین باشید';
export const FLEET_NOT_APPROVED_FA = 'دورهٔ ناوگان هنوز تایید مدیر نشده است؛ بعد از تایید مدیر می‌توانید فایل بانکی بگیرید';
export const FLEET_LOCKED_FA = 'دورهٔ ناوگان قفل شده است و ثبت سفر در آن ممکن نیست';
export const WRONG_STEP_FA = 'این کار در مرحلهٔ دیگری است؛ از کارهای من پیگیری کنید';
export const MY_TASKS_LINK_LABEL_FA = 'سابقه و پیگیری در کارهای من';

export const VEHICLE_FIELD_LABELS_FA: Record<string, string> = {
  plate_number: 'شماره پلاک',
  model_name: 'مدل / برند',
  driver_name: 'نام راننده',
  driver_mobile: 'موبایل راننده',
  owner_name: 'مالک خودرو',
  sheba_number: 'شماره شبا',
  bank_name: 'نام بانک',
  account_number: 'شماره حساب',
  default_service_rate: 'نرخ هر سرویس',
  national_code: 'کد ملی'
};

/** وضعیت گردش کار دورهٔ ناوگان به فارسی */
export function fleetWorkflowStatusFa(status?: string | null, approved?: boolean | null): string {
  if (approved) return 'تایید شده';
  switch (status) {
    case 'in_progress':
    case 'pending': return 'در جریان تایید';
    case 'approved': return 'تایید شده';
    case 'rejected': return 'رد شده';
    case 'returned': return 'عودت شده';
    case 'cancelled': return 'لغو شده';
    default: return 'هنوز ارسال نشده';
  }
}

/** پیام فارسی خطای گردش کار؛ missing_fields با برچسب فارسی */
export function fleetWorkflowErrorText(err: any, fallback: string, labels: Record<string, string> = VEHICLE_FIELD_LABELS_FA): string {
  const body = err?.error || {};
  if (body.code === 'wrong_step') return WRONG_STEP_FA;
  if (body.code === 'fleet_not_approved') return FLEET_NOT_APPROVED_FA;
  if (body.code === 'fleet_locked') return FLEET_LOCKED_FA;
  let msg: string = body.error || body.detail || fallback;
  if (body.code === 'action_blocked' && Array.isArray(body.missing_fields) && body.missing_fields.length) {
    const names = body.missing_fields.map((m: any) => {
      if (typeof m === 'string') return labels[m] || m;
      return m.label || labels[m.field] || m.field;
    });
    msg += ': ' + names.join('، ');
  }
  return msg;
}
