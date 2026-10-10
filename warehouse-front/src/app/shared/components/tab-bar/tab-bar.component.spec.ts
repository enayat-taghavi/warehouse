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

  it('در حالت mobile="icon" باید aria-label و title برابر با label تب باشند', () => {
    host.mobileMode.set('icon');
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute('aria-label')).toBe('نیازمند بررسی');
    expect(tabs[0].getAttribute('title')).toBe('نیازمند بررسی');
    expect(tabs[1].getAttribute('aria-label')).toBe('تایید شده');
    expect(tabs[2].getAttribute('aria-label')).toBe('رد شده');
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

  it('شمارنده عددی باید با کلاس tabular-nums رندر شود', () => {
    const tabWithCount = fixture.nativeElement.querySelectorAll('[role="tab"]')[0];
    const badge = tabWithCount.querySelector('.tabular-nums');
    expect(badge).not.toBeNull();
    expect(badge.textContent.trim()).toBe('12');
  });
});
