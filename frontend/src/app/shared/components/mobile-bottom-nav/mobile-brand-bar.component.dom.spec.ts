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

  it('the menu button exists with title and aria-label "منوی کامل"', () => {
    const menuBtn = fixture.nativeElement.querySelector('[data-testid="mobile-brand-menu"]') as HTMLButtonElement;
    expect(menuBtn).not.toBeNull();
    expect(menuBtn.getAttribute('title')).toBe('منوی کامل');
    expect(menuBtn.getAttribute('aria-label')).toBe('منوی کامل');
  });

  it('clicking the menu button emits menuOpen', () => {
    let opened = false;
    component.menuOpen.subscribe(() => {
      opened = true;
    });

    const menuBtn = fixture.nativeElement.querySelector('[data-testid="mobile-brand-menu"]') as HTMLButtonElement;
    expect(menuBtn).not.toBeNull();
    menuBtn.click();
    expect(opened).toBe(true);
  });

  it('aria-expanded is false by default and true after setInput("menuExpanded", true)', () => {
    const menuBtn = fixture.nativeElement.querySelector('[data-testid="mobile-brand-menu"]') as HTMLButtonElement;
    expect(menuBtn).not.toBeNull();
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');

    fixture.componentRef.setInput('menuExpanded', true);
    fixture.detectChanges();
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');
  });
});
