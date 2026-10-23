// @vitest-environment jsdom
import '@angular/compiler';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandCenterComponent } from './command-center.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  standalone: true,
  imports: [CommandCenterComponent],
  template: `
    <app-command-center>
      <div cc-tabs id="projected-tabs">محتوای تب‌ها</div>
      <div cc-actions id="projected-actions">محتوای اکشن‌ها</div>
    </app-command-center>
  `,
})
class TestHostComponent {}

describe('CommandCenterComponent (app-command-center)', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('باید تگ معنایی header چسبان استاندارد را با استایل‌های AGENTS §7 رندر کند', () => {
    const header = fixture.nativeElement.querySelector('header');
    expect(header).not.toBeNull();
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
    expect(header.className).toContain('backdrop-blur-md');
    // میزبان باید display: contents باشد تا والد header ظرف بلند صفحه شود و sticky کار کند
    const host = fixture.nativeElement.querySelector('app-command-center') as HTMLElement;
    expect(host.classList.contains('contents')).toBe(true);
  });

  it('باید هر دو جایگاه [cc-tabs] و [cc-actions] را در موقعیت صحیح رندر کند', () => {
    const tabsSlot = fixture.nativeElement.querySelector('#projected-tabs');
    const actionsSlot = fixture.nativeElement.querySelector('#projected-actions');

    expect(tabsSlot).not.toBeNull();
    expect(tabsSlot.textContent?.trim()).toBe('محتوای تب‌ها');

    expect(actionsSlot).not.toBeNull();
    expect(actionsSlot.textContent?.trim()).toBe('محتوای اکشن‌ها');
  });

  it('ظرف داخلی باید کلاس‌های پاسخگوی flex-col و md:flex-row را داشته باشد', () => {
    const container = fixture.nativeElement.querySelector('header > div');
    expect(container).not.toBeNull();
    expect(container.className).toContain('flex-col');
    expect(container.className).toContain('md:flex-row');
    expect(container.className).toContain('rounded-2xl');
  });

  it('با تنظیم rowFrom="lg" باید کلاس lg:flex-row و lg:w-auto را اعمال کند', () => {
    const hostFixture = TestBed.createComponent(CommandCenterComponent);
    hostFixture.componentRef.setInput('rowFrom', 'lg');
    hostFixture.detectChanges();

    const container = hostFixture.nativeElement.querySelector('header > div');
    expect(container).not.toBeNull();
    expect(container.className).toContain('flex-col');
    expect(container.className).toContain('lg:flex-row');

    const slotContainers = hostFixture.nativeElement.querySelectorAll('header > div > div');
    expect(slotContainers.length).toBe(2);
    expect(slotContainers[0].className).toContain('lg:w-auto');
    expect(slotContainers[1].className).toContain('lg:w-auto');
  });

  it('باید کلاس‌های md:flex-wrap روی ظرف و ms-auto روی اسلات اکشن‌ها را برای شکستن سطر داشته باشد', () => {
    const container = fixture.nativeElement.querySelector('header > div');
    expect(container).not.toBeNull();
    expect(container.className).toContain('md:flex-wrap');

    const actionsSlotContainer = fixture.nativeElement.querySelector('#projected-actions')?.parentElement;
    expect(actionsSlotContainer).not.toBeNull();
    expect(actionsSlotContainer.className).toContain('ms-auto');

    const tabsSlotContainer = fixture.nativeElement.querySelector('#projected-tabs')?.parentElement;
    expect(tabsSlotContainer).not.toBeNull();
    expect(tabsSlotContainer.className).toContain('min-w-0');
    expect(tabsSlotContainer.className).toContain('max-w-full');
  });
});
