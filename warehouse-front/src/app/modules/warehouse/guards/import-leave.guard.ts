import { CanDeactivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { ImportService } from '../services/import.service';

export const importLeaveGuard: CanDeactivateFn<any> = (component) => {
  if (component && typeof component.confirmLeave === 'function') {
    return component.confirmLeave();
  }
  return true;
};
