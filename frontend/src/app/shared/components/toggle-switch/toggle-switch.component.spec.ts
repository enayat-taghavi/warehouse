// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToggleSwitchComponent } from './toggle-switch.component';

describe('ToggleSwitchComponent', () => {
  let component: ToggleSwitchComponent;

  beforeEach(() => {
    component = new ToggleSwitchComponent();
  });

  it('should create component with default false checked', () => {
    expect(component).toBeTruthy();
    expect(component.checked).toBe(false);
  });

  it('should toggle checked state and emit value on toggle()', () => {
    let emitted: boolean | undefined;
    component.checkedChange.subscribe((val) => emitted = val);

    component.toggle();

    expect(component.checked).toBe(true);
    expect(emitted).toBe(true);

    component.toggle();
    expect(component.checked).toBe(false);
    expect(emitted).toBe(false);
  });

  it('should stop propagation when event is passed to toggle() (Issue 1)', () => {
    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as Event;

    component.toggle(mockEvent);

    expect(component.checked).toBe(true);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });

  it('should stop propagation and prevent default on onKeydown() (Space / Enter)', () => {
    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as Event;

    component.onKeydown(mockEvent);

    expect(component.checked).toBe(true);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });
});


