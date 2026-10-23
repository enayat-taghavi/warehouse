import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * گارد مبتنی بر نقش — فقط نقش‌های مشخص اجازه ورود دارند
 *
 * استفاده:
 * { path: 'admin', canActivate: [RoleGuard('admin')] }
 * { path: 'users', canActivate: [RoleGuard('admin', 'management')] }
 */
export function RoleGuard(...allowedDepartments: string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) {
      return router.parseUrl('/login');
    }

    const userDept = auth.userDepartment();
    if (allowedDepartments.includes(userDept)) {
      return true;
    }

    // کاربر لاگین‌شده ولی دسترسی ندارد → بازگشت به داشبورد
    return router.parseUrl('/dashboard');
  };
}
