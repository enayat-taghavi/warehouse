export interface DiffItem {
  key: string;
  label?: string;
  oldValue: any;
  newValue: any;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface WordDiffToken {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
}

export const AUDIT_FIELD_LABELS_MAP: Record<string, string> = {
  // کالاها و موجودی
  fa_unic_code: 'کد یکتا',
  tag: 'شماره تگ کالا',
  pl: 'پکینگ لیست (PL)',
  po: 'سفارش خرید (PO)',
  pk_number: 'شماره پکیج',
  request_number_of_table: 'شماره درخواست جدول',
  size: 'سایز اصلی',
  description: 'شرح کالا',
  unit: 'واحد سنجش',
  scope_discipline: 'دیسیپلین کاری',
  inventory: 'موجودی فیزیکی',
  bal4miv: 'موجودی مجاز (Bal4MIV)',
  new_location: 'لوکیشن جدید',
  hov_no: 'شماره HOV',
  hov_date: 'تاریخ HOV',
  msr_status: 'وضعیت MSR',
  vendor: 'سازنده',
  supplier: 'تامین کننده',
  irn_no: 'شماره IRN',
  indent: 'تقاضای خرید',
  remark: 'ملاحظات',
  price_amount: 'قیمت واحد',
  similar_unit_price: 'قیمت کالای مشابه',
  total_value: 'ارزش کل',
  currency: 'ارز',
  invoice_type: 'نوع فاکتور',
  invoice_date: 'تاریخ فاکتور',
  inv_rti_number: 'شماره RTI فاکتور',
  added_rti_no: 'شماره RTI افزوده‌شده',
  page_row: 'ردیف در فاکتور',
  invoice_page: 'صفحه فاکتور',
  doc_supplier: 'تامین‌کننده فاکتور',
  folder_address: 'مسیر پوشه اسناد',
  hyperlink: 'هایپرلینک اسناد',
  tag_status: 'وضعیت لیبل',
  field_status: 'وضعیت میدانی',
  doc_status: 'وضعیت مستندات',
  desc_from_standard_system: 'شرح در سامانه یکنواخت',
  unit_from_standard_system: 'واحد در سامانه یکنواخت',
  stamp: 'وضعیت مهر اسناد',
  signature: 'وضعیت امضای اسناد',
  has_conflict: 'مغایرت دارد',
  my_tag: 'تگ‌ها',
  dynamic_data: 'اطلاعات متغیر (پویا)',
  field_assignee: 'محول شده به میدانی',
  doc_assignee: 'محول شده به مدارک',
  is_deleted: 'حذف‌شده (نرم)',
  
  // کاربران و نقش‌ها
  username: 'نام کاربری',
  first_name: 'نام',
  last_name: 'نام خانوادگی',
  email: 'ایمیل',
  national_code: 'کد ملی',
  phone_number: 'شماره تماس',
  is_active: 'فعال بودن حساب',
  is_staff: 'دسترسی کارمندی',
  is_superuser: 'مدیر ارشد',
  roles: 'نقش‌های کاربر',
  groups: 'گروه‌های کاربری',
  user_permissions: 'دسترسی‌های مستقیم',
  operational_zone: 'منطقه عملیاتی',
  supervisor_id: 'شناسه سرپرست',
  title: 'عنوان نقش',
  name: 'نام سیستمی',
  permissions: 'دسترسی‌ها',
  
  // انبارها و تنظیمات
  warehouse: 'انبار مرتبط',
  code: 'کد انبار',
  location: 'موقعیت مکانی',
  status: 'وضعیت'
};

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '۰ بایت';
  const k = 1024;
  const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
