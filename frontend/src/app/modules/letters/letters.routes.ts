import { inject } from '@angular/core';
import { CanDeactivateFn, Routes } from '@angular/router';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { LetterListPage } from './components/letter-list/letter-list';
import { LetterComposePage } from './components/letter-compose/letter-compose';

/** هشدار ترک فرم نیمه‌کاره (ن۱۶، ق۱۱) */
export const lettersLeaveGuard: CanDeactivateFn<LetterComposePage> = async (page: LetterComposePage) => {
  if (!page.hasUnsavedChanges()) return true;
  const result = await inject(ConfirmDialogService).open({
    title: 'نامه ذخیره نشده',
    message: 'تغییرهای این نامه ذخیره نشده است. صفحه را ترک می‌کنید؟',
    type: 'warning',
    confirmText: 'ترک صفحه',
    cancelText: 'ماندن',
  });
  return result === true;
};

export const LETTERS_ROUTES: Routes = [
  { path: '', component: LetterListPage },
  { path: 'new', component: LetterComposePage, canDeactivate: [lettersLeaveGuard] },
  { path: ':id/edit', component: LetterComposePage, canDeactivate: [lettersLeaveGuard] },
];
