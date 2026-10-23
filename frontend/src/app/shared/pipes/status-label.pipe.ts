import { Pipe, PipeTransform } from '@angular/core';

/**
 * ترجمه enum وضعیت به لیبل فارسی
 *
 * استفاده:
 *   {{ record.status | statusLabel }}
 *   {{ record.field_status | statusLabel:'field' }}
 *   {{ record.label_status | statusLabel:'label' }}
 */
@Pipe({
  name: 'statusLabel',
  standalone: true,
})
export class StatusLabelPipe implements PipeTransform {
  private readonly MAPS: Record<string, Record<string, string>> = {
    // وضعیت کلی رکورد
    record: {
      defined: 'تعریف شده',
      counting: 'در حال شمارش',
      completed: 'تکمیل شده',
      feeding: 'در جریان تغذیه',
      archived: 'آرشیو نهایی',
    },
    // فاز میدانی
    field: {
      waiting: 'در انتظار',
      counting: 'در کارتابل',
      recount: 'مغایرت',
      done: 'تایید میدانی',
    },
    // فاز اسناد
    doc: {
      waiting: 'در انتظار',
      processing: 'در دست بررسی',
      done: 'تکمیل اسناد',
    },
    // وضعیت لیبل
    label: {
      pending: 'چاپ نشده',
      printed: 'چاپ شده',
      reprint: 'چاپ مجدد',
    },
    // وضعیت MT
    mt: {
      ready: 'آماده',
      exported: 'صادر شده',
      completed: 'تکمیل',
    },
    // وضعیت پروژه
    project: {
      active: 'جاری',
      configured: 'تنظیم شده',
      frozen: 'فریز شده',
      deleted: 'حذف شده',
    },
    // وضعیت کاربر
    user: {
      active: 'فعال',
      suspended: 'تعلیق‌شده',
      inactive: 'غیرفعال',
    },
    // وضعیت شرایط کالا
    condition: {
      new: 'نو',
      used: 'مستعمل',
      refurbished: 'بازسازی شده',
    },
    // عملیات Audit
    audit: {
      create: 'ایجاد',
      update: 'ویرایش',
      delete: 'حذف',
      dispatch: 'تخصیص',
      login: 'ورود',
      logout: 'خروج',
      import: 'ورود فایل',
      export: 'خروجی',
    },
    // واحد سازمانی
    department: {
      admin: 'مدیریت کل سیستم',
      management: 'مدیر پروژه',
      execution: 'واحد اجرایی',
      documents: 'واحد مدارک',
      feeding: 'واحد تغذیه MT',
    },
  };

  transform(value: string | null | undefined, domain: string = 'record'): string {
    if (!value) return '—';
    return this.MAPS[domain]?.[value] ?? value;
  }
}
