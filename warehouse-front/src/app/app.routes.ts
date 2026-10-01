import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthStore } from './core/stores/auth.store';
import { AuthService } from './core/auth/auth.service';
import { Login } from './components/login/login';
import { Layout } from './components/layout/layout';
import { AppLauncherComponent } from './components/app-launcher/app-launcher';
import { ChangePassword } from './components/change-password/change-password';
import { VerifyCard } from './components/verify-card/verify-card';
import { AuthGuard, AuthGuardChild, WarehouseModuleMatchGuard, WarehouseCompanyGuard, AccountingModuleMatchGuard } from './core/auth/auth.guard';
import { OperationsGuard, OperationsGuardChild } from './core/guards/operations.guard';
import { OperationsLayoutComponent } from './components/operations/operations-layout/operations-layout';
import { OperationsCockpitComponent } from './components/operations/operations-cockpit/operations-cockpit';
import { SettingsBackupTabComponent } from './components/settings/tabs/settings-backup-tab/settings-backup-tab';
import { OperationsSyncMonitorComponent } from './components/operations/operations-sync-monitor/operations-sync-monitor';
import { OperationsRbacGovernanceComponent } from './components/operations/operations-rbac-governance/operations-rbac-governance';
import { Users } from './components/users/users';
import { CompaniesManagementComponent } from './components/operations/companies/companies';
import { Audit } from './components/audit/audit';
import { HealthDashboardComponent } from './components/health-dashboard/health-dashboard';
import { ModuleRegistryService } from './core/modules/module-registry.service';
import { ActiveCompanyService } from './core/services/active-company.service';

export const routes: Routes = [
  // ─── احراز هویت و صفحات عمومی ─────────────────────────
  { path: 'login', component: Login },
  { path: 'verify-card/:code', component: VerifyCard },
  { path: 'verify-card', component: VerifyCard },
  { path: 'change-password', component: ChangePassword, canActivate: [AuthGuard] },

  // ─── پورتال لانچر برنامه‌ها (App Launcher) ──────────────
  { path: 'app/launcher', component: AppLauncherComponent, canActivate: [AuthGuard] },

  // ─── ماژول ۱: سامانه انبارگردانی (/app/warehouse/...) با بارگذاری تنبل (Lazy Loading) ──
  {
    path: 'app/warehouse',
    component: Layout,
    canMatch: [WarehouseModuleMatchGuard],
    canActivate: [AuthGuard, WarehouseCompanyGuard],
    canActivateChild: [AuthGuardChild],
    loadChildren: () => import('./modules/warehouse/warehouse.routes').then(m => m.WAREHOUSE_ROUTES)
  },

  // ─── ماژول ۲: سامانه مالی و پرسنلی (/app/finance/...) با بارگذاری تنبل (Lazy Loading) ───
  {
    path: 'app/finance',
    component: Layout,
    canMatch: [AccountingModuleMatchGuard],
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuardChild],
    loadChildren: () => import('./modules/accounting/accounting.routes').then(m => m.ACCOUNTING_ROUTES)
  },

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

      const whMarkers = registry.permissionMarkers('warehouse');
      const acctMarkers = registry.permissionMarkers('accounting');

      const hasWh = registry.isModuleInstalled('warehouse') && whMarkers.some(p => perms.includes(p));
      const hasFin = registry.isModuleInstalled('accounting') && acctMarkers.some(p => perms.includes(p));

      if (hasWh && hasFin) {
        return 'app/launcher';
      }
      if (hasWh && !hasFin) {
        return 'app/warehouse/dashboard';
      }
      if (!hasWh && hasFin) {
        // خانهٔ نقش را ریشهٔ سامانه مالی بر اساس پرسونای فعال تعیین می‌کند (accounting.routes)
        return 'app/finance';
      }
      if (!hasWh && !hasFin) {
        const activeCompanyService = inject(ActiveCompanyService);
        if (activeCompanyService.hasCompanyDocumentsAccess()) {
          return 'app/finance/company-documents';
        }
      }
      return 'app/launcher';
    },
    pathMatch: 'full'
  },

  // ─── سازگاری کامل با مسیرهای قبلی (Legacy Route Redirects) ─
  { path: 'dashboard', redirectTo: 'app/warehouse/dashboard', pathMatch: 'full' },
  { path: 'projects', redirectTo: 'app/warehouse/projects', pathMatch: 'full' },
  { path: 'dispatch', redirectTo: 'app/warehouse/dispatch', pathMatch: 'full' },
  { path: 'docs', redirectTo: 'app/warehouse/docs', pathMatch: 'full' },
  { path: 'users', redirectTo: 'app/warehouse/users', pathMatch: 'full' },
  { path: 'settings', redirectTo: 'app/warehouse/settings', pathMatch: 'full' },
  { path: 'wh-settings', redirectTo: 'app/warehouse/wh-settings', pathMatch: 'full' },
  { path: 'audit', redirectTo: 'app/warehouse/audit', pathMatch: 'full' },
  { path: 'feeding', redirectTo: 'app/warehouse/feeding', pathMatch: 'full' },
  { path: 'counter', redirectTo: 'app/warehouse/counter', pathMatch: 'full' },
  { path: 'supervisor', redirectTo: 'app/warehouse/supervisor', pathMatch: 'full' },
  { path: 'manager-review', redirectTo: 'app/warehouse/manager-review', pathMatch: 'full' },
  { path: 'count-tracking', redirectTo: 'app/warehouse/count-tracking', pathMatch: 'full' },
  { path: 'reports', redirectTo: 'app/warehouse/reports', pathMatch: 'full' },
  { path: 'customs', redirectTo: 'app/warehouse/customs', pathMatch: 'full' },
  { path: 'tasks', redirectTo: 'app/warehouse/tasks', pathMatch: 'full' },
  { path: 'labels', redirectTo: 'app/warehouse/labels', pathMatch: 'full' },
  { path: 'approvals', redirectTo: 'app/warehouse/approvals', pathMatch: 'full' },
  { path: 'doc_approvals', redirectTo: 'app/warehouse/doc_approvals', pathMatch: 'full' },
  { path: 'feed_approvals', redirectTo: 'app/warehouse/feed_approvals', pathMatch: 'full' },

  // صفحه‌های بازنشسته مستقیم به هاب جانشین می‌روند تا ریدایرکت زنجیره‌ای نسازند
  { path: 'finance-cartable', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
  { path: 'attendance', redirectTo: 'app/finance/employee-attendance', pathMatch: 'full' },
  { path: 'fleet', redirectTo: 'app/finance/employee-fleet', pathMatch: 'full' },
  { path: 'fleet-attendance', redirectTo: 'app/finance/employee-fleet', pathMatch: 'full' },
  { path: 'manager-approvals', redirectTo: 'app/finance/manager-approvals', pathMatch: 'full' },
  { path: 'treasury-cartable', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
  { path: 'treasury', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
  { path: 'profiles', redirectTo: 'app/finance/profiles', pathMatch: 'full' },
  { path: 'personnel-profiles', redirectTo: 'app/finance/personnel-profiles', pathMatch: 'full' },
  { path: 'base-settings', redirectTo: 'app/finance/base-settings', pathMatch: 'full' },
  { path: 'projects-and-sections', redirectTo: 'app/finance/projects-and-sections', pathMatch: 'full' },
  { path: 'company-documents', redirectTo: 'app/finance/company-documents', pathMatch: 'full' },
  { path: 'documents', redirectTo: 'app/finance/company-documents', pathMatch: 'full' },
  { path: 'employee-portal', redirectTo: 'app/finance/employee-attendance', pathMatch: 'full' },
  { path: 'employee-attendance', redirectTo: 'app/finance/employee-attendance', pathMatch: 'full' },
  { path: 'employee-fleet', redirectTo: 'app/finance/employee-fleet', pathMatch: 'full' },
  { path: 'employee-invoices', redirectTo: 'app/finance/employee-invoices', pathMatch: 'full' },
  { path: 'employee-petty-cash', redirectTo: 'app/finance/employee-petty-cash', pathMatch: 'full' },
  { path: 'employee-new-vehicle', redirectTo: 'app/finance/employee-new-vehicle', pathMatch: 'full' },
  { path: 'employee-new-personnel', redirectTo: 'app/finance/employee-new-personnel', pathMatch: 'full' },
  { path: 'supervisor-personnel', redirectTo: 'app/finance/supervisor-personnel', pathMatch: 'full' },
  { path: 'supervisor-attendance', redirectTo: 'app/finance/supervisor-attendance', pathMatch: 'full' },
  { path: 'supervisor-fleet', redirectTo: 'app/finance/supervisor-fleet', pathMatch: 'full' },
  { path: 'supervisor-invoices', redirectTo: 'app/finance/supervisor-invoices', pathMatch: 'full' },
  { path: 'supervisor-petty-cash', redirectTo: 'app/finance/supervisor-petty-cash', pathMatch: 'full' },
  { path: 'supervisor-new-profiles', redirectTo: 'app/finance/supervisor-personnel', pathMatch: 'full' },
  { path: 'supervisor-period-lock', redirectTo: 'app/finance/supervisor-period-lock', pathMatch: 'full' },
  { path: 'accountant', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
  { path: 'accountant-personnel', redirectTo: 'app/finance/accountant-personnel', pathMatch: 'full' },
  { path: 'accountant-payroll', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
  { path: 'accountant-fleet', redirectTo: 'app/finance/accountant-fleet', pathMatch: 'full' },
  { path: 'accountant-invoices', redirectTo: 'app/finance/accountant-invoices', pathMatch: 'full' },
  { path: 'accountant-petty-cash', redirectTo: 'app/finance/accountant-petty-cash', pathMatch: 'full' },
  { path: 'accountant-new-profiles', redirectTo: 'app/finance/accountant-personnel', pathMatch: 'full' },
  { path: 'accountant-diskettes', redirectTo: 'app/finance/accountant-diskettes', pathMatch: 'full' },
  { path: 'accountant-counterparties', redirectTo: 'app/finance/accountant-counterparties', pathMatch: 'full' },
  { path: 'manager', redirectTo: 'app/finance/manager-dashboard', pathMatch: 'full' },
  { path: 'manager-personnel', redirectTo: 'app/finance/manager-personnel', pathMatch: 'full' },
  { path: 'manager-fleet', redirectTo: 'app/finance/manager-fleet', pathMatch: 'full' },
  { path: 'manager-dashboard', redirectTo: 'app/finance/manager-dashboard', pathMatch: 'full' },
  { path: 'manager-budget', redirectTo: 'app/finance/manager-budget', pathMatch: 'full' },
  { path: 'manager-contracts', redirectTo: 'app/finance/manager-contracts', pathMatch: 'full' },
  { path: 'manager-reports', redirectTo: 'app/finance/manager-reports', pathMatch: 'full' },
  { path: 'treasurer', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
  { path: 'treasurer-disbursements', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
  { path: 'treasurer-invoices', redirectTo: 'app/finance/treasurer-invoices', pathMatch: 'full' },
  { path: 'treasurer-bank-accounts', redirectTo: 'app/finance/treasurer-bank-accounts', pathMatch: 'full' },
  { path: 'treasurer-cheques', redirectTo: 'app/finance/treasurer-cheques', pathMatch: 'full' },
  { path: 'treasurer-reconciliation', redirectTo: 'app/finance/treasurer-reconciliation', pathMatch: 'full' },
  { path: 'personnel', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
  { path: 'payroll', redirectTo: 'app/finance/accountant-payroll', pathMatch: 'full' },
  { path: 'fleet-settlement', redirectTo: 'app/finance/treasurer-disbursements', pathMatch: 'full' },
  { path: 'finance-audit', redirectTo: 'app/finance/audit', pathMatch: 'full' },
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

      const whMarkers = registry.permissionMarkers('warehouse');
      const acctMarkers = registry.permissionMarkers('accounting');

      const hasWh = registry.isModuleInstalled('warehouse') && whMarkers.some(p => perms.includes(p));
      const hasFin = registry.isModuleInstalled('accounting') && acctMarkers.some(p => perms.includes(p));

      if (hasWh && hasFin) {
        return 'app/launcher';
      }
      if (hasWh && !hasFin) {
        return 'app/warehouse/dashboard';
      }
      if (!hasWh && hasFin) {
        return 'app/finance';
      }
      if (!hasWh && !hasFin) {
        const activeCompanyService = inject(ActiveCompanyService);
        if (activeCompanyService.hasCompanyDocumentsAccess()) {
          return 'app/finance/company-documents';
        }
      }
      return 'app/launcher';
    },
    pathMatch: 'full'
  },
  { path: '**', redirectTo: 'login' }
];
