import { Routes } from '@angular/router';
import { Dashboard } from './components/dashboard/dashboard';
import { Projects } from './components/projects/projects';
import { Dispatch } from './components/dispatch/dispatch';
import { Docs } from './components/docs/docs';
import { Users } from '../common/components/users/users';
import { Settings } from '../common/components/settings/settings';
import { WhSettings } from './components/wh-settings/wh-settings';
import { Audit } from '../common/components/audit/audit';
import { HealthDashboardComponent } from '../common/components/health-dashboard/health-dashboard';
import { Feeding } from './components/feeding/feeding';
import { Placeholders } from './components/placeholders/placeholders';
import { CounterDashboard } from './components/counter/counter-dashboard/counter-dashboard';
import { SupervisorDashboard } from './components/supervisor/supervisor-dashboard/supervisor-dashboard';
import { ManagerReview } from './components/manager-review/manager-review';
import { CountTracking } from './components/count-tracking/count-tracking';
import { Reports } from './components/reports/reports';
import { Customs } from './components/customs/customs';
import { importLeaveGuard } from './guards/import-leave.guard';
import { settingsLeaveGuard } from '../../core/guards/settings-leave.guard';


export const WAREHOUSE_ROUTES: Routes = [
  { path: 'dashboard', component: Dashboard },
  { path: 'projects', component: Projects },
  {
    path: 'dispatch',
    component: Dispatch,
    canDeactivate: [importLeaveGuard],
    data: { reuse: true }
  },
  {
    path: 'docs',
    component: Docs,
    canDeactivate: [importLeaveGuard]
  },
  { path: 'users', component: Users },
  {
    path: 'settings',
    component: Settings,
    canDeactivate: [settingsLeaveGuard]
  },
  { path: 'wh-settings', component: WhSettings },
  { path: 'audit', component: Audit, data: { appScope: 'warehouse' } },
  { path: 'health', component: HealthDashboardComponent, data: { appScope: 'warehouse', reuse: false } },
  { path: 'feeding', component: Feeding },
  { path: 'field', redirectTo: 'counter', pathMatch: 'full' },
  { path: 'placeholders', component: Placeholders },
  { path: 'counter', component: CounterDashboard, data: { reuse: true } },
  { path: 'supervisor', component: SupervisorDashboard, data: { reuse: true } },
  { path: 'manager-review', component: ManagerReview, data: { reuse: true } },
  { path: 'count-tracking', component: CountTracking, data: { reuse: true } },
  { path: 'reports', component: Reports },
  { path: 'customs', component: Customs },
  { path: 'tasks', component: Placeholders },
  { path: 'labels', component: Placeholders },
  { path: 'approvals', component: Placeholders },
  { path: 'doc_approvals', component: Placeholders },
  { path: 'feed_approvals', component: Placeholders },
  { path: 'attendance', redirectTo: '/app/finance/employee-attendance', pathMatch: 'full' },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
];
