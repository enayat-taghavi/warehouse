// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowReasonDialogComponent } from './workflow-reason-dialog.component';

describe('WorkflowReasonDialogComponent', () => {
  let component: WorkflowReasonDialogComponent;

  beforeEach(() => {
    component = new WorkflowReasonDialogComponent();
    component.open = true;
  });

  it('fails validation on empty reason and displays persian required error without emitting', () => {
    let emittedReason: string | undefined;
    component.confirmed.subscribe((r) => (emittedReason = r));

    component.reason = '   ';
    component.onConfirm();

    expect(emittedReason).toBeUndefined();
    expect(component.clientError).toBe('نوشتن دلیل الزامی است');
    expect(component.errorMessage).toBe('نوشتن دلیل الزامی است');
    expect(component.hasError).toBe(true);
  });

  it('emits trimmed reason on valid input confirmation', () => {
    let emittedReason: string | undefined;
    component.confirmed.subscribe((r) => (emittedReason = r));

    component.reason = '   عدم انطباق فاکتور با دستور کار   ';
    component.onConfirm();

    expect(emittedReason).toBe('عدم انطباق فاکتور با دستور کار');
    expect(component.clientError).toBe('');
    expect(component.hasError).toBe(false);
  });

  it('emits cancelled event when onCancel is called or escape is pressed', () => {
    let cancelCalled = false;
    component.cancelled.subscribe(() => (cancelCalled = true));

    component.onCancel();
    expect(cancelCalled).toBe(true);

    cancelCalled = false;
    component.onEscape();
    expect(cancelCalled).toBe(true);
  });

  it('displays serverError when provided', () => {
    component.serverError = 'خطای اعتبارسنجی سرور: دلیل باید حداقل ۱۰ حرف باشد';

    expect(component.hasError).toBe(true);
    expect(component.errorMessage).toBe('خطای اعتبارسنجی سرور: دلیل باید حداقل ۱۰ حرف باشد');
  });
});
