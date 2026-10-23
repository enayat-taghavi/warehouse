// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runInInjectionContext, Injector } from '@angular/core';
import { ConfirmDialogComponent, ConfirmDialogService } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let component: ConfirmDialogComponent;
  let service: ConfirmDialogService;

  beforeEach(() => {
    service = new ConfirmDialogService();
    const injector = Injector.create({
      providers: [
        { provide: ConfirmDialogService, useValue: service }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new ConfirmDialogComponent(service);
    });
  });

  it('should create component instance', () => {
    expect(component).toBeTruthy();
  });

  it('should enable confirm button by default when requireText is not specified', () => {
    service.open({
      title: 'تأیید عملیات',
      message: 'آیا مطمئن هستید؟',
    });

    expect(component.isConfirmDisabled).toBe(false);
  });

  it('should disable confirm button when requireText is specified and input is empty or mismatch', () => {
    service.open({
      title: 'حذف دیتابیس',
      message: 'هشدار امنیتی',
      requireText: 'RESTORE_DATABASE_CONFIRM',
    });

    expect(component.isConfirmDisabled).toBe(true);

    component.inputText.set('WRONG_TEXT');
    expect(component.isConfirmDisabled).toBe(true);
  });

  it('should enable confirm button when input matches requireText exactly', () => {
    service.open({
      title: 'حذف دیتابیس',
      message: 'هشدار امنیتی',
      requireText: 'RESTORE_DATABASE_CONFIRM',
    });

    component.inputText.set('RESTORE_DATABASE_CONFIRM');
    expect(component.isConfirmDisabled).toBe(false);
  });

  it('should not call dialog.confirm if confirm() is called while isConfirmDisabled is true', () => {
    const confirmSpy = vi.spyOn(service, 'confirm');
    service.open({
      title: 'حذف دیتابیس',
      message: 'هشدار امنیتی',
      requireText: 'RESTORE_DATABASE_CONFIRM',
    });

    component.inputText.set('MISMATCH');
    component.confirm();

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
