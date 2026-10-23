import { CanDeactivateFn } from '@angular/router';
import { CompaniesManagementComponent } from './companies';

/**
 * پیش از خروج از استودیوی شرکت (دکمه‌های بازگشت و بستن، برگشت مرورگر و هر ناوبری دیگر)
 * اگر تغییر ذخیره‌نشده‌ای باشد، پنجرهٔ تأیید نشان داده می‌شود (ت۳).
 */
export const companiesLeaveGuard: CanDeactivateFn<CompaniesManagementComponent> = (component) =>
  component ? component.confirmLeave() : true;
