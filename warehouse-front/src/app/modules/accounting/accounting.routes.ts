import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AppPersonaService } from '../../core/services/app-persona.service';
import { ActiveCompanyService } from '../../core/services/active-company.service';
import { ManagerApprovals } from './components/personnel/manager-approvals/manager-approvals';
import { PersonnelProfilesHub } from './components/personnel/personnel-profiles/personnel-profiles';
import { BaseSettings } from './components/personnel/base-settings/base-settings';
import { ProjectsAndSectionsComponent } from './components/organization/projects-and-sections/projects-and-sections';
import { CounterpartiesComponent } from './components/finance/counterparties/counterparties';
import { EmployeeAttendanceHubComponent } from './components/finance/employee/employee-attendance/employee-attendance';
import { EmployeeFleetHubComponent } from './components/finance/employee/employee-fleet/employee-fleet';
import { EmployeeInvoicesHubComponent } from './components/finance/employee/employee-invoices/employee-invoices';
import { EmployeePettyCashHubComponent } from './components/finance/employee/employee-petty-cash/employee-petty-cash';
import { EmployeeNewVehicleHubComponent } from './components/finance/employee/employee-new-vehicle/employee-new-vehicle';
import { EmployeeNewPersonnelHubComponent } from './components/finance/employee/employee-new-personnel/employee-new-personnel';
import { SupervisorAttendanceHubComponent } from './components/finance/supervisor/supervisor-attendance/supervisor-attendance';
import { SupervisorFleetHubComponent } from './components/finance/supervisor/supervisor-fleet/supervisor-fleet';
import { SupervisorInvoicesHubComponent } from './components/finance/supervisor/supervisor-invoices/supervisor-invoices';
import { SupervisorPettyCashHubComponent } from './components/finance/supervisor/supervisor-petty-cash/supervisor-petty-cash';
import { SupervisorNewProfilesHubComponent } from './components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles';
import { SupervisorPersonnelHubComponent } from './components/finance/supervisor/supervisor-personnel/supervisor-personnel';
import { SupervisorPeriodLockHubComponent } from './components/finance/supervisor/supervisor-period-lock/supervisor-period-lock';
import { AccountantPayrollHubComponent } from './components/finance/accountant/accountant-payroll/accountant-payroll';
import { AccountantFleetHubComponent } from './components/finance/accountant/accountant-fleet/accountant-fleet';
import { AccountantPersonnelHubComponent } from './components/finance/accountant/accountant-personnel/accountant-personnel';
import { AccountantInvoicesHubComponent } from './components/finance/accountant/accountant-invoices/accountant-invoices';
import { AccountantPettyCashHubComponent } from './components/finance/accountant/accountant-petty-cash/accountant-petty-cash';
import { AccountantDiskettesHubComponent } from './components/finance/accountant/accountant-diskettes/accountant-diskettes';
import { AccountantNewProfilesHubComponent } from './components/finance/accountant/accountant-new-profiles/accountant-new-profiles';
import { ManagerDashboardComponent } from './components/finance/manager/manager-dashboard/manager-dashboard';
import { ManagerPersonnelHubComponent } from './components/finance/manager/manager-personnel/manager-personnel';
import { ManagerFleetHubComponent } from './components/finance/manager/manager-fleet/manager-fleet';
import { ManagerBudgetComponent } from './components/finance/manager/manager-budget/manager-budget';
import { ManagerContractsComponent } from './components/finance/manager/manager-contracts/manager-contracts';
import { ManagerReportsComponent } from './components/finance/manager/manager-reports/manager-reports';
import { TreasurerDisbursementsComponent } from './components/finance/treasurer/treasurer-disbursements/treasurer-disbursements';
import { TreasurerInvoicesComponent } from './components/finance/treasurer/treasurer-invoices/treasurer-invoices';
import { TreasurerBankAccountsComponent } from './components/finance/treasurer/treasurer-bank-accounts/treasurer-bank-accounts';
import { TreasurerChequesComponent } from './components/finance/treasurer/treasurer-cheques/treasurer-cheques';
import { TreasurerReconciliationComponent } from './components/finance/treasurer/treasurer-reconciliation/treasurer-reconciliation';
import { Audit } from '../common/components/audit/audit';
import { HealthDashboardComponent } from '../common/components/health-dashboard/health-dashboard';
import { CompanyDocumentsArchiveComponent } from './components/finance/company-documents-archive/company-documents-archive';


export const ACCOUNTING_ROUTES: Routes = [
  // مسیرهای بازنشسته (پنل تجمیعی کارمند، کارکرد مشترک، کارتابل مالی و خزانه) مستقیم به هاب جانشین می‌روند
  { path: 'employee-portal', redirectTo: 'employee-attendance', pathMatch: 'full' },
  { path: 'employee-attendance', component: EmployeeAttendanceHubComponent, data: { reuse: true } },
  { path: 'employee-fleet', component: EmployeeFleetHubComponent, data: { reuse: true } },
  { path: 'employee-invoices', component: EmployeeInvoicesHubComponent, data: { reuse: true } },
  { path: 'employee-petty-cash', component: EmployeePettyCashHubComponent, data: { reuse: true } },
  { path: 'employee-new-vehicle', component: EmployeeNewVehicleHubComponent, data: { reuse: true } },
  { path: 'employee-new-personnel', component: EmployeeNewPersonnelHubComponent, data: { reuse: true } },
  { path: 'employee/attendance', redirectTo: 'employee-attendance', pathMatch: 'full' },
  { path: 'employee/fleet', redirectTo: 'employee-fleet', pathMatch: 'full' },
  { path: 'employee/invoices', redirectTo: 'employee-invoices', pathMatch: 'full' },
  { path: 'employee/petty-cash', redirectTo: 'employee-petty-cash', pathMatch: 'full' },
  { path: 'employee/new-vehicle', redirectTo: 'employee-new-vehicle', pathMatch: 'full' },
  { path: 'employee/new-personnel', redirectTo: 'employee-new-personnel', pathMatch: 'full' },
  { path: 'supervisor', redirectTo: 'supervisor-attendance', pathMatch: 'full' },
  { path: 'supervisor-personnel', component: SupervisorPersonnelHubComponent, data: { reuse: true } },
  { path: 'supervisor-attendance', component: SupervisorAttendanceHubComponent, data: { reuse: true } },
  { path: 'supervisor-fleet', component: SupervisorFleetHubComponent, data: { reuse: true } },
  { path: 'supervisor-invoices', component: SupervisorInvoicesHubComponent, data: { reuse: true } },
  { path: 'supervisor-petty-cash', component: SupervisorPettyCashHubComponent, data: { reuse: true } },
  { path: 'supervisor-new-profiles', redirectTo: 'supervisor-personnel', pathMatch: 'full' },
  { path: 'supervisor-period-lock', component: SupervisorPeriodLockHubComponent, data: { reuse: true } },
  { path: 'supervisor/personnel', redirectTo: 'supervisor-personnel', pathMatch: 'full' },
  { path: 'supervisor/attendance', redirectTo: 'supervisor-attendance', pathMatch: 'full' },
  { path: 'supervisor/fleet', redirectTo: 'supervisor-fleet', pathMatch: 'full' },
  { path: 'supervisor/invoices', redirectTo: 'supervisor-invoices', pathMatch: 'full' },
  { path: 'supervisor/petty-cash', redirectTo: 'supervisor-petty-cash', pathMatch: 'full' },
  { path: 'supervisor/new-profiles', redirectTo: 'supervisor-personnel', pathMatch: 'full' },
  { path: 'supervisor/period-lock', redirectTo: 'supervisor-period-lock', pathMatch: 'full' },
  { path: 'accountant', redirectTo: 'accountant-payroll', pathMatch: 'full' },
  { path: 'accountant-personnel', component: AccountantPersonnelHubComponent, data: { reuse: true } },
  { path: 'accountant-payroll', component: AccountantPayrollHubComponent, data: { reuse: true } },
  { path: 'accountant-fleet', component: AccountantFleetHubComponent, data: { reuse: true } },
  { path: 'accountant-invoices', component: AccountantInvoicesHubComponent, data: { reuse: true } },
  { path: 'accountant-petty-cash', component: AccountantPettyCashHubComponent, data: { reuse: true } },
  { path: 'accountant-diskettes', component: AccountantDiskettesHubComponent, data: { reuse: true } },
  { path: 'accountant-counterparties', component: CounterpartiesComponent, data: { reuse: true } },
  { path: 'accountant-new-profiles', redirectTo: 'accountant-personnel', pathMatch: 'full' },
  { path: 'accountant/personnel', redirectTo: 'accountant-personnel', pathMatch: 'full' },
  { path: 'accountant/payroll', redirectTo: 'accountant-payroll', pathMatch: 'full' },
  { path: 'accountant/fleet', redirectTo: 'accountant-fleet', pathMatch: 'full' },
  { path: 'accountant/invoices', redirectTo: 'accountant-invoices', pathMatch: 'full' },
  { path: 'accountant/petty-cash', redirectTo: 'accountant-petty-cash', pathMatch: 'full' },
  { path: 'accountant/diskettes', redirectTo: 'accountant-diskettes', pathMatch: 'full' },
  { path: 'accountant/counterparties', redirectTo: 'accountant-counterparties', pathMatch: 'full' },
  { path: 'accountant/new-profiles', redirectTo: 'accountant-personnel', pathMatch: 'full' },
  { path: 'manager', redirectTo: 'manager-dashboard', pathMatch: 'full' },
  { path: 'manager-personnel', component: ManagerPersonnelHubComponent, data: { reuse: true } },
  { path: 'manager-fleet', component: ManagerFleetHubComponent, data: { reuse: true } },
  { path: 'manager-dashboard', component: ManagerDashboardComponent, data: { reuse: true } },
  { path: 'manager/personnel', redirectTo: 'manager-personnel', pathMatch: 'full' },
  { path: 'manager/fleet', redirectTo: 'manager-fleet', pathMatch: 'full' },
  { path: 'manager/dashboard', redirectTo: 'manager-dashboard', pathMatch: 'full' },
  { path: 'manager/approvals', redirectTo: 'manager-approvals', pathMatch: 'full' },
  { path: 'manager-budget', component: ManagerBudgetComponent, data: { reuse: true } },
  { path: 'manager/budget', redirectTo: 'manager-budget', pathMatch: 'full' },
  { path: 'manager-contracts', component: ManagerContractsComponent, data: { reuse: true } },
  { path: 'manager/contracts', redirectTo: 'manager-contracts', pathMatch: 'full' },
  { path: 'manager-reports', component: ManagerReportsComponent, data: { reuse: true } },
  { path: 'manager/reports', redirectTo: 'manager-reports', pathMatch: 'full' },
  { path: 'treasurer', redirectTo: 'treasurer-disbursements', pathMatch: 'full' },
  { path: 'treasurer-disbursements', component: TreasurerDisbursementsComponent, data: { reuse: true } },
  { path: 'treasurer/disbursements', redirectTo: 'treasurer-disbursements', pathMatch: 'full' },
  { path: 'treasurer-invoices', component: TreasurerInvoicesComponent, data: { reuse: true } },
  { path: 'treasurer/invoices', redirectTo: 'treasurer-invoices', pathMatch: 'full' },
  { path: 'treasurer-bank-accounts', component: TreasurerBankAccountsComponent, data: { reuse: true } },
  { path: 'treasurer/bank-accounts', redirectTo: 'treasurer-bank-accounts', pathMatch: 'full' },
  { path: 'treasurer-cheques', component: TreasurerChequesComponent, data: { reuse: true } },
  { path: 'treasurer/cheques', redirectTo: 'treasurer-cheques', pathMatch: 'full' },
  { path: 'treasurer-reconciliation', component: TreasurerReconciliationComponent, data: { reuse: true } },
  { path: 'treasurer/reconciliation', redirectTo: 'treasurer-reconciliation', pathMatch: 'full' },
  { path: 'finance-cartable', redirectTo: 'accountant-payroll', pathMatch: 'full' },
  { path: 'attendance', redirectTo: 'employee-attendance', pathMatch: 'full' },
  { path: 'timesheet', redirectTo: 'employee-attendance', pathMatch: 'full' },
  { path: 'fleet', redirectTo: 'employee-fleet', pathMatch: 'full' },
  { path: 'fleet-attendance', redirectTo: 'employee-fleet', pathMatch: 'full' },
  { path: 'manager-approvals', component: ManagerApprovals, data: { reuse: true } },
  { path: 'treasury-cartable', redirectTo: 'treasurer-disbursements', pathMatch: 'full' },
  { path: 'treasury', redirectTo: 'treasurer-disbursements', pathMatch: 'full' },
  { path: 'profiles', component: PersonnelProfilesHub, data: { reuse: true } },
  { path: 'personnel-profiles', component: PersonnelProfilesHub, data: { reuse: true } },
  { path: 'companies', redirectTo: '/app/operations/companies', pathMatch: 'full' },
  { path: 'base-settings', component: BaseSettings, data: { reuse: true } },
  { path: 'projects-and-sections', component: ProjectsAndSectionsComponent, data: { reuse: true } },
  { path: 'counterparties', redirectTo: 'accountant-counterparties', pathMatch: 'full' },
  { path: 'company-documents', component: CompanyDocumentsArchiveComponent, data: { reuse: true } },
  { path: 'company-documents-archive', redirectTo: 'company-documents', pathMatch: 'full' },
  { path: 'documents', redirectTo: 'company-documents', pathMatch: 'full' },
  { path: 'audit', component: Audit, data: { appScope: 'finance', reuse: true } },
  { path: 'health', component: HealthDashboardComponent, data: { appScope: 'finance', reuse: false } },
  { path: 'finance-audit', redirectTo: 'audit', pathMatch: 'full' },
  { path: 'personnel', redirectTo: 'accountant-payroll', pathMatch: 'full' },
  { path: 'payroll', redirectTo: 'accountant-payroll', pathMatch: 'full' },
  { path: 'fleet-settlement', redirectTo: 'treasurer-disbursements', pathMatch: 'full' },
  {
    path: '',
    redirectTo: () => {
      // صفحهٔ آغاز سامانه مالی همان خانهٔ پرسونای نقش فعال است تا با منو و گارد یکی باشد
      const persona = inject(AppPersonaService);
      persona.syncScopeFromUrl('/app/finance');
      persona.sanitizeActiveRole();
      if (persona.isSuperuser()) {
        // جانشین کارتابل مالی قدیمی برای مدیر ارشد
        return 'accountant-payroll';
      }
      if (persona.availableRoles().length > 0) {
        return persona.getDefaultRouteForRole();
      }

      // کاربر مالی بدون پرسونای نقش
      const auth = inject(AuthService);
      const perms = auth.userPermissions() || [];
      if (perms.includes('perm_manage_projects_sections')) {
        return 'projects-and-sections';
      }
      if (inject(ActiveCompanyService).hasCompanyDocumentsAccess()) {
        return 'company-documents';
      }
      return 'employee-attendance';
    },
    pathMatch: 'full'
  }
];
