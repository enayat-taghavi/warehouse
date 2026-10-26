import { Injector } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';

/** بیشترین تعداد بخش که پیش‌خوانی می‌شود (پیش‌فرض صفحه‌ها بخش اول است) */
export const WARM_SECTION_LIMIT = 5;

/**
 * پیش‌خوانی کش حسابداری (ص۵ طرح ۲.۵).
 * همان GETهای بار اول صفحه‌های سرپرست، مدیر و حسابدار با همان آدرس و همان ترتیب پارامترها
 * (کلید کش رهگیر = urlWithParams + شرکت). هر خطا بی‌صدا نادیده گرفته می‌شود.
 * آدرس‌ها باید با `OrgStructureApiService.getMySections/getSections`، `HrApiService`، `FleetApiService`
 * و `AttendanceApiService` یکی بمانند.
 */
export async function warmAccountingCache(injector: Injector): Promise<void> {
  const api = injector.get(ApiService);
  const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
  const fetch = <T>(endpoint: string, params?: Record<string, unknown>): Promise<T | null> =>
    firstValueFrom(api.get<T>(endpoint, params, { context })).catch(() => null);

  const [mySections, activeSections] = await Promise.all([
    fetch<Array<{ id: number; company_id?: number }>>('org/section-assignments/my-sections/'),
    fetch<Array<{ id: number; company_id?: number }>>('org/project-sections', { is_active: true })
  ]);
  // مثل صفحه‌ها: اگر کاربر بخشی ندارد، بخش‌های فعال
  const sections = (mySections && mySections.length > 0 ? mySections : activeSections) || [];
  const sectionIds = sections
    .map(s => s?.id)
    .filter((id): id is number => typeof id === 'number')
    .slice(0, WARM_SECTION_LIMIT);

  // سرفصل‌های فعال شرکت هر بخش برای فرم فاکتور و تنخواه (۳.۴ ص۷)؛ همان پارامترهای `TreasuryOrgApiService.getExpenseHeads(id, true)`
  const companyIds = [...new Set(sections
    .filter(s => sectionIds.includes(s?.id))
    .map(s => s?.company_id)
    .filter((id): id is number => typeof id === 'number'))];
  await Promise.all(companyIds.map(companyId => fetch('personnel/expense-heads', { company_id: companyId, active: 1 })));

  for (const sectionId of sectionIds) {
    const base = { section_id: sectionId };
    await Promise.all([
      fetch('personnel/profiles', { ...base, approval_status: 'pending_supervisor' }),
      fetch('personnel/profiles', base),
      fetch('personnel/personnel-change-requests', base),
      fetch('personnel/attendance', base),
      fetch('personnel/vehicles', { ...base, approval_status: 'pending_supervisor' }),
      fetch('personnel/vehicles', base),
      fetch('personnel/vehicle-change-requests', base)
    ]);
  }
}
