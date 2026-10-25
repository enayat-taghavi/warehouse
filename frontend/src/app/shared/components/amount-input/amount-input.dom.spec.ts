// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

import { AmountInputComponent } from './amount-input.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('AmountInputComponent DOM Spec', () => {
  let fixture: ComponentFixture<AmountInputComponent>;
  let component: AmountInputComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AmountInputComponent],
    });

    fixture = TestBed.createComponent(AmountInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persian digits become plain rial string', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const faDigits = '1250000'.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
    inputEl.value = faDigits;
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(onChange).toHaveBeenCalledWith('1250000');
    expect(inputEl.value).toBe('1,250,000');
  });

  it('arabic digits accepted', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const arDigits = '1250000'.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
    inputEl.value = arDigits;
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(onChange).toHaveBeenCalledWith('1250000');
  });

  it('empty gives null', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = '';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(onChange).toHaveBeenCalledWith(null);
    expect(fixture.nativeElement.textContent).not.toContain('تومان');
  });

  it('toman text shown', () => {
    component.writeValue(1250000);
    fixture.detectChanges();

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(inputEl.value).toBe('1,250,000');

    const expectedToman = new Intl.NumberFormat('fa-IR').format(125000);
    expect(fixture.nativeElement.textContent).toContain('تومان');
    expect(fixture.nativeElement.textContent).toContain(expectedToman);
  });

  it('leading zeros stripped', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    inputEl.value = '00012';
    inputEl.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(onChange).toHaveBeenCalledWith('12');
  });

  it('disabled state', () => {
    component.setDisabledState(true);
    fixture.detectChanges();

    const inputEl = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(inputEl.disabled).toBe(true);
  });
});
