import { inject } from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { getModuleRegistry } from '../modules/module-registry.service';
import { resolveLoginLanding } from '../modules/login-landing';

/**
 * گارد ورود (LoginGuard) — جلوگیری از بازگشت یا دسترسی کاربر لاگین‌شده به صفحهٔ لاگین (/login)
 * در صورتی که کاربر قبلاً لاگین کرده باشد، مستقیماً به صفحهٔ لانچر یا مقصد مجاز هدایت می‌شود.
 */
export const LoginGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    const user = auth.user();
    if (user?.requires_password_change) {
      return router.createUrlTree(['/change-password']);
    }
    const perms = auth.userPermissions();
    const isSuper = perms.includes('admin_all') || user?.is_superuser;
    const landing = resolveLoginLanding(getModuleRegistry(), perms, !!isSuper);
    return router.createUrlTree([landing.route]);
  }

  return true;
};
