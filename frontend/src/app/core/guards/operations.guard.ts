import { inject } from '@angular/core';
import { Router, CanActivateFn, CanActivateChildFn } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { ActiveCompanyService } from '../services/active-company.service';

/**
 * گارد اختصاصی مرکز عملیات، پدافند و زیرساخت سازمان (Strict Superuser-Only)
 * ورود و دسترسی به روت‌های /app/operations منحصراً ویژه مدیران ارشد (is_superuser=True)
 */
export const OperationsGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }

  const user = auth.user();
  const userPerms = auth.userPermissions() || [];
  const isSuper = Boolean(
    user?.is_superuser ||
    userPerms.includes('admin_all') ||
    user?.roles?.includes('admin') ||
    user?.roles?.includes('superuser')
  );

  if (isSuper) {
    return true;
  }

  // کاربر عادی اجازه دسترسی به مرکز عملیات و زیرساخت را ندارد -> بازگشت به پورتال لانچر
  return router.parseUrl('/app/launcher');
};

export const OperationsGuardChild: CanActivateChildFn = (childRoute, state) => {
  return OperationsGuard(childRoute, state);
};

/**
 * حالت محدود استودیوی شرکت‌ها (/app/companies): کاربری که دست‌کم یک بخشِ شرکتی را می‌خواند.
 * مدیر کل به همان نشانی در حالت کامل (/app/operations/companies) فرستاده می‌شود.
 */
export const CompaniesManageGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const companies = inject(ActiveCompanyService);

  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  const user = auth.user();
  if (user?.is_superuser) {
    return router.parseUrl(state.url.replace(/^\/app\/companies/, '/app/operations/companies'));
  }
  return companies.loadManageableCompanies().pipe(
    map(list => list.length > 0 ? true : router.parseUrl('/app/launcher'))
  );
};
