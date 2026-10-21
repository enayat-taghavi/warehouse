import { Routes } from '@angular/router';
import { ShowcaseSamplePage } from './components/sample-page/sample-page';

export const SHOWCASE_ROUTES: Routes = [
  { path: '', redirectTo: 'sample', pathMatch: 'full' },
  { path: 'sample', component: ShowcaseSamplePage },
];
