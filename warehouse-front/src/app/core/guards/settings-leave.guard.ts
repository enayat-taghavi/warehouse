import { CanDeactivateFn } from '@angular/router';
import { Settings } from '../../modules/common/components/settings/settings';

export const settingsLeaveGuard: CanDeactivateFn<Settings> = (component: Settings) => {
  if (component.hasChanges()) {
    return confirm('شما تغییرات ذخیره نشده‌ای دارید. آیا مطمئن هستید که می‌خواهید صفحه را ترک کنید؟');
  }
  return true;
};
