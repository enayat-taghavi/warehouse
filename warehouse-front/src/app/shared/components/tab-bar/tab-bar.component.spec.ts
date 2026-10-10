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

  it('در حالت mobile="icon" باید title برابر label و aria-label برابر label به‌همراه شمارنده دیده‌شده باشد', () => {
    host.mobileMode.set('icon');
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute('aria-label')).toBe('نیازمند بررسی 12');
    expect(tabs[0].getAttribute('title')).toBe('نیازمند بررسی');
    expect(tabs[1].getAttribute('aria-label')).toBe('تایید شده 5');
    expect(tabs[2].getAttribute('aria-label')).toBe('رد شده');
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

  it('در حالت mobile="icon" با fullLabelFrom="xl" باید کلاس hidden xl:inline اعمال شده و aria-label و title درست بمانند', () => {
    host.mobileMode.set('icon');
    host.fullLabelFrom.set('xl');
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    const firstTab = tabs[0];

    // در حالت icon فقط اسپن برچسب دسکتاپ با کلاس xl وجود دارد و اسپن برچسب کوتاه وجود ندارد
    const desktopSpan = firstTab.querySelector('.hidden.xl\\:inline');
    expect(desktopSpan).not.toBeNull();
    expect(firstTab.querySelector('.xl\\:hidden')).toBeNull();

    // نام دسترس‌پذیر و title
    expect(firstTab.getAttribute('aria-label')).toBe('نیازمند بررسی 12');
    expect(firstTab.getAttribute('title')).toBe('نیازمند بررسی');
  });
});
