import { Routes } from '@angular/router';
import { ShowcaseSamplePage } from './components/sample-page/sample-page';

export const SHOWCASE_ROUTES: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: 'overview', component: ShowcaseSamplePage },
];
