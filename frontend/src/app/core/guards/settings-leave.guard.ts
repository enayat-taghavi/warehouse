import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Settings } from '../../modules/common/components/settings/settings';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';

export const settingsLeaveGuard: CanDeactivateFn<Settings> = async (component: Settings) => {
  if (!component.hasChanges()) return true;
  const result = await inject(ConfirmDialogService).open({
    title: 'تغییرات ذخیره نشده',
    message: 'شما تغییرات ذخیره نشده‌ای دارید. آیا مطمئن هستید که می‌خواهید صفحه را ترک کنید؟',
    type: 'warning',
    confirmText: 'ترک صفحه',
    cancelText: 'ماندن',
  });
  return result === true;
};
