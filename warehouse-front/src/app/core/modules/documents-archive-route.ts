import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { ActiveCompanyService } from '../services/active-company.service';

/** تب «مدارک» استودیوی شرکت (هسته)؛ بایگانی مدارک ماژول‌ها بخش مشارکتی همین تب است */
export const COMPANY_DOCUMENTS_TAB = 'documents';

/** تب «پروژه‌ها و بخش‌ها» استودیوی شرکت (هسته) و بخش مجوز همان تب */
export const COMPANY_PROJECTS_TAB = 'projects';

/**
 * نشانی یک تب استودیو. حالت محدود (/app/companies) است؛ CompaniesManageGuard مدیر کل را
 * با همان شناسه و query به حالت کامل (/app/operations/companies) می‌فرستد. بی شرکت: فهرست شرکت‌ها.
 */
export function companyStudioTabUrlTree(router: Router, companyId: number | null | undefined, tab: string): UrlTree {
  return companyId
    ? router.createUrlTree(['/app/companies', companyId], { queryParams: { tab } })
    : router.createUrlTree(['/app/companies']);
}

export function companyDocumentsUrlTree(router: Router, companyId: number | null | undefined): UrlTree {
  return companyStudioTabUrlTree(router, companyId, COMPANY_DOCUMENTS_TAB);
}

/** هدایت نشانی‌های قدیمی بایگانی اسناد شرکت به تب مدارک (شرکت مقصد: companyDocumentsTargetId) */
export function redirectToCompanyDocuments(): UrlTree {
  const companies = inject(ActiveCompanyService, { optional: true });
  return companyDocumentsUrlTree(inject(Router), companies?.companyDocumentsTargetId());
}

/** هدایت صفحهٔ سراسری قدیمی «پروژه‌ها و بخش‌ها» به تب همین نام در استودیوی شرکت فعال (یا نخستین شرکت قابل خواندن) */
export function redirectToCompanyProjects(): UrlTree {
  const companies = inject(ActiveCompanyService, { optional: true });
  return companyStudioTabUrlTree(inject(Router), companies?.companySectionTargetId(COMPANY_PROJECTS_TAB), COMPANY_PROJECTS_TAB);
}
