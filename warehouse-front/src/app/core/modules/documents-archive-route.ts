import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { ActiveCompanyService } from '../services/active-company.service';

/** تب «مدارک» استودیوی شرکت (هسته)؛ بایگانی مدارک ماژول‌ها بخش مشارکتی همین تب است */
export const COMPANY_DOCUMENTS_TAB = 'documents';

/**
 * نشانی تب مدارک استودیو. حالت محدود (/app/companies) است؛ CompaniesManageGuard مدیر کل را
 * با همان شناسه و query به حالت کامل (/app/operations/companies) می‌فرستد.
 */
export function companyDocumentsUrlTree(router: Router, companyId: number | null | undefined): UrlTree {
  return companyId
    ? router.createUrlTree(['/app/companies', companyId], { queryParams: { tab: COMPANY_DOCUMENTS_TAB } })
    : router.createUrlTree(['/app/companies']);
}

/** هدایت نشانی‌های قدیمی بایگانی اسناد شرکت به تب مدارک (شرکت مقصد: companyDocumentsTargetId) */
export function redirectToCompanyDocuments(): UrlTree {
  const companies = inject(ActiveCompanyService, { optional: true });
  return companyDocumentsUrlTree(inject(Router), companies?.companyDocumentsTargetId());
}
