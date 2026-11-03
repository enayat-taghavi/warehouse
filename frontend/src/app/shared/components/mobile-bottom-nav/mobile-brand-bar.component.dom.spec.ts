// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MobileBrandBarComponent } from './mobile-brand-bar.component';

describe('MobileBrandBarComponent (DOM specs)', () => {
  let fixture: ComponentFixture<MobileBrandBarComponent>;
  let component: MobileBrandBarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MobileBrandBarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileBrandBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders "اتوماسیون شرکت" text in mobile brand bar', () => {
    const bar = fixture.nativeElement.querySelector('[data-testid="mobile-brand-bar"]') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('اتوماسیون شرکت');
  });

  it('renders no badge by default', () => {
    const badge = fixture.nativeElement.querySelector('[data-testid="mobile-brand-badge"]');
    expect(badge).toBeNull();
  });

  it('renders the badge with text when badge input is set', () => {
    fixture.componentRef.setInput('badge', 'انبار مرکزی');
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-testid="mobile-brand-badge"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim()).toBe('انبار مرکزی');
  });
});
