// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { LettersOfflineChipComponent } from './letters-offline-chip';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('LettersOfflineChipComponent', () => {
  it('متن پیش‌فرض «آفلاین» و متن سفارشی را نشان می‌دهد', () => {
    const f = TestBed.createComponent(LettersOfflineChipComponent);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('آفلاین');
    expect(f.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    f.componentRef.setInput('text', 'آفلاین؛ قدیمی');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('آفلاین؛ قدیمی');
  });
});
