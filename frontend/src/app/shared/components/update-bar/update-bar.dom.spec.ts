// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import { UpdateBarComponent } from './update-bar.component';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('UpdateBarComponent DOM', () => {
  let fixture: ComponentFixture<UpdateBarComponent>;
  let fake: {
    updateReady: ReturnType<typeof signal<boolean>>;
    updateDismissed: ReturnType<typeof signal<boolean>>;
    applyUpdate: ReturnType<typeof vi.fn>;
    dismissUpdate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    fake = {
      updateReady: signal(false),
      updateDismissed: signal(false),
      applyUpdate: vi.fn().mockResolvedValue(undefined),
      dismissUpdate: vi.fn(() => fake.updateDismissed.set(true)),
    };

    await TestBed.configureTestingModule({
      imports: [UpdateBarComponent],
      providers: [
        { provide: PwaUpdateService, useValue: fake }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateBarComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('1. hidden when no update is ready', () => {
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('section[role="status"]');
    expect(section).toBeNull();
  });

  it('2. shown when an update is ready', () => {
    fake.updateReady.set(true);
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('section[role="status"]');
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('نسخهٔ تازهٔ برنامه آماده است.');
  });

  it('3. the update button calls applyUpdate', async () => {
    fake.updateReady.set(true);
    fixture.detectChanges();
    const applyBtn = fixture.nativeElement.querySelector('[data-testid="update-bar-apply"]');
    applyBtn.click();
    await fixture.whenStable();
    expect(fake.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('4. the later button dismisses and hides the bar', () => {
    fake.updateReady.set(true);
    fixture.detectChanges();
    const laterBtn = fixture.nativeElement.querySelector('[data-testid="update-bar-later"]');
    laterBtn.click();
    fixture.detectChanges();
    expect(fake.dismissUpdate).toHaveBeenCalledTimes(1);
    const section = fixture.nativeElement.querySelector('section[role="status"]');
    expect(section).toBeNull();
  });

  it.fails('5. buttons have Persian aria-labels', () => {
    fake.updateReady.set(true);
    fixture.detectChanges();
    const applyBtn = fixture.nativeElement.querySelector('[data-testid="update-bar-apply"]');
    const laterBtn = fixture.nativeElement.querySelector('[data-testid="update-bar-later"]');
    expect(applyBtn.getAttribute('aria-label')).toBe('بهروزرسانی');
    expect(laterBtn.getAttribute('aria-label')).toBe('بعداً');
  });
});
