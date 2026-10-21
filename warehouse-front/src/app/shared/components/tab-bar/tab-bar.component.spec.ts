// @vitest-environment jsdom
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TabBarComponent, TabDef } from './tab-bar.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  standalone: true,
  imports: [TabBarComponent],
  template: `
    <app-tab-bar
      [tabs]="tabs"
      [active]="activeTab()"
      [mobile]="mobileMode()"
      [fullLabelFrom]="fullLabelFrom()"
      [idPrefix]="idPrefix()"
      (activeChange)="onTabChange($event)"
    />
  `,
})
class TestHostComponent {
  tabs: TabDef[] = [
    { id: 'pending', label: 'نیازمند بررسی', shortLabel: 'بررسی', count: 12, icon: 'status-pending' },
    { id: 'approved', label: 'تایید شده', shortLabel: 'تایید', count: 5, icon: 'status-approved' },
    { id: 'rejected', label: 'رد شده', shortLabel: 'رد', icon: 'status-rejected' },
  ];

  activeTab = signal('pending');
  mobileMode = signal<'short' | 'icon'>('short');
  fullLabelFrom = signal<'sm' | 'md' | 'lg' | 'xl'>('sm');
  idPrefix = signal<string | undefined>(undefined);
  lastEmittedTab: string | null = null;

  onTabChange(tabId: string): void {
    this.lastEmittedTab = tabId;
    this.activeTab.set(tabId);
  }
}

describe('TabBarComponent (app-tab-bar)', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('fullLabelFrom="never": full label stays only as sr-only/title and the short label shows from sm', () => {
    host.mobileMode.set('icon');
    host.fullLabelFrom.set('never' as any);
    fixture.detectChanges();
    const tab = fixture.nativeElement.querySelector('[role="tab"]') as HTMLElement;
    const spans = Array.from(tab.querySelectorAll('span')) as HTMLElement[];
    const full = spans.find(s => s.textContent?.trim() === 'نیازمند بررسی')!;
    const short = spans.find(s => s.textContent?.trim() === 'بررسی')!;
    expect([...full.classList].sort()).toEqual(['sm:hidden', 'sr-only']);
    expect([...short.classList].sort()).toEqual(['hidden', 'sm:inline']);
    expect(tab.getAttribute('title')).toBe('نیازمند بررسی');
  });

  it('idPrefix: tab ids and aria-controls are rendered only when a prefix is given', () => {
    let tabs = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]')) as HTMLElement[];
    expect(tabs[0].hasAttribute('id')).toBe(false);
    expect(tabs[0].hasAttribute('aria-controls')).toBe(false);
    host.idPrefix.set('st');
    fixture.detectChanges();
    tabs = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]')) as HTMLElement[];
    expect(tabs[1].id).toBe('st-tab-approved');
    expect(tabs[1].getAttribute('aria-controls')).toBe('st-panel-approved');
  });

  it('باید role="tablist" روی ظرف و role="tab" روی هر تب قرار دهد', () => {
    const tablist = fixture.nativeElement.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
  });

  it('باید وضعیت aria-selected و tabindex چرخان (roving tabindex) را رعایت کند', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');

    // تب اول فعال است
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
    expect(tabs[2].getAttribute('aria-selected')).toBe('false');
    expect(tabs[2].getAttribute('tabindex')).toBe('-1');

    // تغییر تب فعال به تب دوم
    host.activeTab.set('approved');
    fixture.detectChanges();

    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[0].getAttribute('tabindex')).toBe('-1');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('tabindex')).toBe('0');
  });

  it('در حالت mobile="short" نباید aria-label بگذارد تا نام دسترس‌پذیر از متن دیده شده بیاید (قاعده ۷)', () => {
    host.mobileMode.set('short');
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    for (let i = 0; i < tabs.length; i++) {
      expect(tabs[i].getAttribute('aria-label')).toBeNull();
      // بررسی وجود متن کوتاه موبایل و عنوان دسکتاپ
      const desktopSpan = tabs[i].querySelector('.hidden.sm\\:inline');
      const mobileSpan = tabs[i].querySelector('.sm\\:hidden');
      expect(desktopSpan).not.toBeNull();
      expect(mobileSpan).not.toBeNull();
    }
  });

  it('در حالت mobile="icon" نام دسترس‌پذیر از عنوان کامل sr-only و شمارنده بیاید، نه aria-label؛ title برابر label', () => {
    host.mobileMode.set('icon');
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    for (let i = 0; i < tabs.length; i++) {
      expect(tabs[i].getAttribute('aria-label')).toBeNull();
      const srLabel = tabs[i].querySelector('.sr-only.sm\\:not-sr-only');
      expect(srLabel?.textContent.trim()).toBe(host.tabs[i].label);
      // با fullLabelFrom="sm" عنوان کوتاهی رندر نمی‌شود
      expect(tabs[i].querySelectorAll('span:not(.tabular-nums)').length).toBe(1);
    }
    expect(tabs[0].getAttribute('title')).toBe('نیازمند بررسی');
    expect(tabs[0].querySelector('.tabular-nums').textContent.trim()).toBe('12');
  });

  it('تب‌ها نباید id ثابت بگیرند (چند نوار تب در یک صفحه id تکراری نسازند)', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    for (let i = 0; i < tabs.length; i++) {
      expect(tabs[i].hasAttribute('id')).toBe(false);
    }
  });

  it('با کلیک روی تب، خروجی activeChange باید صادر شود', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    tabs[1].click();
    fixture.detectChanges();

    expect(host.lastEmittedTab).toBe('approved');
    expect(host.activeTab()).toBe('approved');

    // کلیک روی تب فعلی نباید دوباره تغییر ارسال کند
    host.lastEmittedTab = null;
    tabs[1].click();
    expect(host.lastEmittedTab).toBeNull();
  });

  it('ناوبری با کلیدهای جهت‌دار باید منطبق بر RTL باشد (ArrowRight = قبلی، ArrowLeft = بعدی)', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');

    // وقتی تب اول فعال است (index 0)، ArrowLeft باید به بعدی برود (index 1: approved)
    const eventLeft = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    tabs[0].dispatchEvent(eventLeft);
    fixture.detectChanges();

    expect(host.lastEmittedTab).toBe('approved');

    // حالا ArrowRight باید به قبلی برگردد (index 0: pending)
    const eventRight = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    tabs[1].dispatchEvent(eventRight);
    fixture.detectChanges();

    expect(host.lastEmittedTab).toBe('pending');

    // کلید End باید به آخرین تب برود (rejected)
    const eventEnd = new KeyboardEvent('keydown', { key: 'End', cancelable: true });
    tabs[0].dispatchEvent(eventEnd);
    fixture.detectChanges();

    expect(host.lastEmittedTab).toBe('rejected');

    // کلید Home باید به اولین تب برگردد (pending)
    const eventHome = new KeyboardEvent('keydown', { key: 'Home', cancelable: true });
    tabs[2].dispatchEvent(eventHome);
    fixture.detectChanges();

    expect(host.lastEmittedTab).toBe('pending');
  });

  it('Alt یا Ctrl همراه کلید جهت‌دار نباید تب را عوض کند یا رویداد را ببلعد', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    const altLeft = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, cancelable: true });
    tabs[0].dispatchEvent(altLeft);
    fixture.detectChanges();
    expect(host.lastEmittedTab).toBeNull();
    expect(altLeft.defaultPrevented).toBe(false);
  });

  it('اگر active با هیچ تبی نخواند، تب اول باید با Tab در دسترس بماند', () => {
    host.activeTab.set('unknown');
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
  });

  it('شمارنده عددی باید با کلاس tabular-nums رندر شود', () => {
    const tabWithCount = fixture.nativeElement.querySelectorAll('[role="tab"]')[0];
    const badge = tabWithCount.querySelector('.tabular-nums');
    expect(badge).not.toBeNull();
    expect(badge.textContent.trim()).toBe('12');
  });

  it('باید کلاس‌های پاسخگوی مناسب برای نقاط شکست مختلف fullLabelFrom را اعمال کند', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    const firstTab = tabs[0];

    // پیش‌فرض: fullLabelFrom = 'sm'
    expect(host.fullLabelFrom()).toBe('sm');
    let desktopSpan = firstTab.querySelector('.hidden.sm\\:inline');
    let mobileSpan = firstTab.querySelector('.sm\\:hidden');
    expect(desktopSpan).not.toBeNull();
    expect(mobileSpan).not.toBeNull();

    // نقطه شکست md
    host.fullLabelFrom.set('md');
    fixture.detectChanges();
    desktopSpan = firstTab.querySelector('.hidden.md\\:inline');
    mobileSpan = firstTab.querySelector('.md\\:hidden');
    expect(desktopSpan).not.toBeNull();
    expect(mobileSpan).not.toBeNull();

    // نقطه شکست lg
    host.fullLabelFrom.set('lg');
    fixture.detectChanges();
    desktopSpan = firstTab.querySelector('.hidden.lg\\:inline');
    mobileSpan = firstTab.querySelector('.lg\\:hidden');
    expect(desktopSpan).not.toBeNull();
    expect(mobileSpan).not.toBeNull();

    // نقطه شکست xl
    host.fullLabelFrom.set('xl');
    fixture.detectChanges();
    desktopSpan = firstTab.querySelector('.hidden.xl\\:inline');
    mobileSpan = firstTab.querySelector('.xl\\:hidden');
    expect(desktopSpan).not.toBeNull();
    expect(mobileSpan).not.toBeNull();
  });

  it('در حالت mobile="icon" با fullLabelFrom="xl" از sm تا xl عنوان کوتاه دیده شود، نه فقط آیکون', () => {
    host.mobileMode.set('icon');
    host.fullLabelFrom.set('xl');
    fixture.detectChanges();

    const firstTab = fixture.nativeElement.querySelectorAll('[role="tab"]')[0];

    // زیر sm: عنوان کامل sr-only؛ sm تا xl: پنهان؛ از xl: دیده‌شده
    const fullSpan = firstTab.querySelector('.sr-only.sm\\:hidden.xl\\:not-sr-only.xl\\:inline');
    expect(fullSpan?.textContent.trim()).toBe('نیازمند بررسی');

    // زیر sm: پنهان؛ sm تا xl: عنوان کوتاه دیده‌شده (در نام دسترس‌پذیر هم هست)
    const shortSpan = firstTab.querySelector('.hidden.sm\\:inline.xl\\:hidden');
    expect(shortSpan?.textContent.trim()).toBe('بررسی');
    expect(shortSpan?.getAttribute('aria-hidden')).toBeNull();

    expect(firstTab.getAttribute('aria-label')).toBeNull();
    expect(firstTab.getAttribute('title')).toBe('نیازمند بررسی');
  });
});
