import { Routes } from '@angular/router';
import { __MODULE_PASCAL__SamplePage } from './components/sample-page/sample-page';

export const __MODULE_UPPER___ROUTES: Routes = [
  { path: '', redirectTo: 'sample', pathMatch: 'full' },
  { path: 'sample', component: __MODULE_PASCAL__SamplePage },
];
