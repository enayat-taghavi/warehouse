import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthStore } from './core/stores/auth.store';
import { AuthService } from './core/auth/auth.service';
import { Login } from './modules/common/components/login/login';
import { Layout } from './modules/common/components/layout/layout';
import { AppLauncherComponent } from './modules/common/components/app-launcher/app-launcher';
import { ChangePassword } from './modules/common/components/change-password/change-password';
import { VerifyCard } from './modules/common/components/verify-card/verify-card';
import { AuthGuard, AuthGuardChild, WarehouseCompanyGuard } from './core/auth/auth.guard';
import { OperationsGuard, OperationsGuardChild } from './core/guards/operations.guard';
import { OperationsLayoutComponent } from './modules/common/components/operations/operations-layout/operations-layout';
import { OperationsCockpitComponent } from './modules/common/components/operations/operations-cockpit/operations-cockpit';
import { SettingsBackupTabComponent } from './modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab';
import { OperationsSyncMonitorComponent } from './modules/common/components/operations/operations-sync-monitor/operations-sync-monitor';
import { OperationsRbacGovernanceComponent } from './modules/common/components/operations/operations-rbac-governance/operations-rbac-governance';
import { Users } from './modules/common/components/users/users';
import { CompaniesManagementComponent } from './modules/common/components/operations/companies/companies';
import { companiesLeaveGuard } from './modules/common/components/operations/companies/companies-leave.guard';
import { Audit } from './modules/common/components/audit/audit';
import { HealthDashboardComponent } from './modules/common/components/health-dashboard/health-dashboard';
import { ModuleRegistryService, getModuleRegistry } from './core/modules/module-registry.service';
import { findCompanyDocumentsRoute } from './core/modules/documents-archive-route';
import { ActiveCompanyService } from './core/services/active-company.service';

import { INSTALLED_MODULES } from './modules/installed-modules';

const dynamicModuleRoutes: Routes = INSTALLED_MODULES.filter(m => typeof m.routes === 'function').map(m => {
  const cleanPrefix = m.routePrefix.replace(/^\//, '');
  const hasWarehouseToggle = Boolean(m.extensions?.companies?.hasWarehouseModuleToggle);
  return {
    path: cleanPrefix,
    component: Layout,
    canMatch: [
      () => {
        const reg = inject(ModuleRegistryService);
        if (!reg.isModuleInstalled(m.code)) return false;
        if (hasWarehouseToggle) {
          const activeCompany = inject(ActiveCompanyService, { optional: true });
          if (activeCompany?.activeCompany && activeCompany.activeCompany.has_warehouse_module === false) {
            return false;
          }
        }
        return true;
      }
    ],
    canActivate: [
      AuthGuard,
      ...(hasWarehouseToggle ? [WarehouseCompanyGuard] : [])
    ],
    canActivateChild: [AuthGuardChild],
    loadChildren: m.routes!
  };
});

export function getCompanyDocumentsRedirect(): string {
  const registry = inject(ModuleRegistryService, { optional: true }) ?? getModuleRegistry();
  const route = findCompanyDocumentsRoute(registry);
  return route ? route.replace(/^\//, '') : 'app/launcher';
}

export const routes: Routes = [
  // ─── احراز هویت و صفحات عمومی ─────────────────────────
  { path: 'login', component: Login },
  {
    path: 'download',
    loadComponent: () => import('./modules/common/components/app-download/app-download.component').then(m => m.AppDownloadComponent),
  },
  { path: 'verify-card/:code', component: VerifyCard },
  { path: 'verify-card', component: VerifyCard },
  { path: 'change-password', component: ChangePassword, canActivate: [AuthGuard] },
  // ─── پورتال لانچر برنامه‌ها (App Launcher) ──────────────
  { path: 'app/launcher', component: AppLauncherComponent, canActivate: [AuthGuard] },

  // ─── روت‌های ماژول‌های نصب‌شده (بارگذاری تنبل و پویا) ───────
  ...dynamicModuleRoutes,

  // ─── ماژول ۳: مرکز عملیات و زیرساخت سازمان (/app/operations/...) ───
  {
    path: 'app/operations',
    component: OperationsLayoutComponent,
    canActivate: [AuthGuard, OperationsGuard],
    canActivateChild: [AuthGuardChild, OperationsGuardChild],
    children: [
      { path: 'cockpit', component: OperationsCockpitComponent, data: { reuse: true } },
      { path: 'snapshots', component: SettingsBackupTabComponent, data: { reuse: true } },
      { path: 'backup', redirectTo: 'snapshots', pathMatch: 'full' },
      { path: 'users', component: Users, data: { reuse: true } },
      { path: 'companies', component: CompaniesManagementComponent, data: { reuse: true } },
      { path: 'companies/new', component: CompaniesManagementComponent, canDeactivate: [companiesLeaveGuard], data: { reuse: false } },
      { path: 'companies/:id', component: CompaniesManagementComponent, canDeactivate: [companiesLeaveGuard], data: { reuse: false } },
      { path: 'health', component: HealthDashboardComponent, data: { appScope: 'operations', reuse: false } },
      { path: 'audit', component: Audit, data: { appScope: 'security', reuse: true } },
      { path: 'sync-monitor', component: OperationsSyncMonitorComponent, data: { reuse: true } },
      { path: 'rbac-governance', component: OperationsRbacGovernanceComponent, data: { reuse: true } },
      { path: '', redirectTo: 'cockpit', pathMatch: 'full' }
    ]
  },

  // ─── هدایت هوشمند ریشه ماژولار (/app) — فاز ۶ (تسک ۵۳) ───────────────────
  {
    path: 'app',
    redirectTo: () => {
      inject(AuthStore).setWarehouseContext(false);
      const auth = inject(AuthService);
      const registry = inject(ModuleRegistryService);
      const perms = auth.userPermissions() || [];
      const isSuper = perms.includes('admin_all') || auth.user()?.is_superuser;

      if (isSuper) {
        return 'app/launcher';
      }

      const installed = registry.getInstalledModules();
      const accessibleModules = installed.filter(mod => {
        const markers = registry.permissionMarkers(mod.code);
        return registry.isModuleInstalled(mod.code) && markers.some(p => perms.includes(p));
      });

      if (accessibleModules.length > 1) {
        return 'app/launcher';
      }
      if (accessibleModules.length === 1) {
        return accessibleModules[0].defaultRoute.replace(/^\//, '');
      }

      const activeCompanyService = inject(ActiveCompanyService);
      if (activeCompanyService.hasCompanyDocumentsAccess()) {
        return getCompanyDocumentsRedirect();
      }
      return 'app/launcher';
    },
    pathMatch: 'full'
  },

  // ─── سازگاری کامل با مسیرهای قبلی (Legacy Route Redirects) ─
  // ریدایرکت‌های ویژهٔ هر ماژول در legacyRedirects مانیفست همان ماژول است
  ...INSTALLED_MODULES.flatMap(m => m.legacyRedirects ?? []),
  { path: 'company-documents', redirectTo: getCompanyDocumentsRedirect, pathMatch: 'full' },
  { path: 'documents', redirectTo: getCompanyDocumentsRedirect, pathMatch: 'full' },
  { path: 'operations', redirectTo: 'app/operations/cockpit', pathMatch: 'full' },
  { path: 'cockpit', redirectTo: 'app/operations/cockpit', pathMatch: 'full' },

  // ─── هدایت ریشه اصلی به پورتال هوشمند — فاز ۶ (تسک ۵۳) ─────────────────
  {
    path: '',
    redirectTo: () => {
      inject(AuthStore).setWarehouseContext(false);
      const auth = inject(AuthService);
      const registry = inject(ModuleRegistryService);
      const perms = auth.userPermissions() || [];
      const isSuper = perms.includes('admin_all') || auth.user()?.is_superuser;

      if (isSuper) {
        return 'app/launcher';
      }

      const installed = registry.getInstalledModules();
      const accessibleModules = installed.filter(mod => {
        const markers = registry.permissionMarkers(mod.code);
        return registry.isModuleInstalled(mod.code) && markers.some(p => perms.includes(p));
      });

      if (accessibleModules.length > 1) {
        return 'app/launcher';
      }
      if (accessibleModules.length === 1) {
        return accessibleModules[0].defaultRoute.replace(/^\//, '');
      }

      const activeCompanyService = inject(ActiveCompanyService);
      if (activeCompanyService.hasCompanyDocumentsAccess()) {
        return getCompanyDocumentsRedirect();
      }
      return 'app/launcher';
    },
    pathMatch: 'full'
  },
  { path: '**', redirectTo: 'login' }
];
