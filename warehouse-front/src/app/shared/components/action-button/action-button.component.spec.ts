// @vitest-environment jsdom
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActionButtonComponent } from './action-button.component';
import { OVERFLOW_MENU_CONTEXT, OverflowMenuContext } from '../overflow-menu/overflow-menu.token';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  standalone: true,
  imports: [ActionButtonComponent],
  template: `
    <!-- دکمه پیش‌فرض با کاتالوگ -->
    <button id="btn-edit" type="button" appAction="edit"></button>

    <!-- دکمه با عنوان سفارشی -->
    <button id="btn-custom-label" type="button" appAction="create" label="کاربر جدید"></button>

    <!-- کار حساس با display="icon" (باید عنوان‌دار بماند) -->
    <button id="btn-sensitive-delete" type="button" appAction="delete" display="icon"></button>
    <button id="btn-sensitive-reject" type="button" appAction="reject" display="icon"></button>
    <button id="btn-sensitive-restore" type="button" appAction="restore" display="icon"></button>
    <button id="btn-sensitive-lock" type="button" appAction="lock" display="icon"></button>
    <button id="btn-sensitive-unlock" type="button" appAction="unlock" display="icon"></button>

    <!-- دکمه‌های ۳گانه سربرگ با display="auto" (پیش‌فرض فقط‌آیکون) -->
    <button id="btn-header-export" type="button" appAction="export-excel"></button>
    <button id="btn-header-import" type="button" appAction="import-excel"></button>
    <button id="btn-header-refresh" type="button" appAction="refresh"></button>

    <!-- دکمه سربرگ با اجبار عنوان -->
    <button id="btn-header-export-forced" type="button" appAction="export-excel" display="label"></button>

    <!-- نوع submit بومی و کلیک -->
    <button id="btn-submit" type="submit" appAction="save" (click)="onSaveClicked()"></button>

    <!-- حالت busy و ترکیب با disabled -->
    <button id="btn-busy-test" type="button" appAction="save" [busy]="isBusy()" [disabled]="isDisabled()"></button>

    <!-- دکمه با اندازه lg -->
    <button id="btn-lg" type="button" appAction="save" size="lg"></button>
  `,
})
class TestHostComponent {
  isBusy = signal(false);
  isDisabled = signal(false);
  saveClicked = false;

  onSaveClicked(): void {
    this.saveClicked = true;
  }
}

describe('ActionButtonComponent (button[appAction])', () => {
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

  it('باید aria-label و title را دقیقاً برابر با عنوان پیش‌فرض کاتالوگ قرار دهد (WCAG 2.5.3)', () => {
    const btn = fixture.nativeElement.querySelector('#btn-edit') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('ویرایش');
    expect(btn.getAttribute('title')).toBe('ویرایش');
    const span = btn.querySelector('span');
    expect(span?.textContent?.trim()).toBe('ویرایش');
  });

  it('باید با ورودی label، aria-label و title و متن دیده‌شده را به‌طور یکسان تغییر دهد', () => {
    const btn = fixture.nativeElement.querySelector('#btn-custom-label') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('کاربر جدید');
    expect(btn.getAttribute('title')).toBe('کاربر جدید');
    const span = btn.querySelector('span');
    expect(span?.textContent?.trim()).toBe('کاربر جدید');
  });

  it('کارهای حساس (delete, reject, restore, lock, unlock) باید با display="icon" هم عنوان‌دار بمانند', () => {
    const sensitiveButtons = [
      { id: '#btn-sensitive-delete', expectedText: 'حذف' },
      { id: '#btn-sensitive-reject', expectedText: 'رد' },
      { id: '#btn-sensitive-restore', expectedText: 'بازیابی' },
      { id: '#btn-sensitive-lock', expectedText: 'قفل' },
      { id: '#btn-sensitive-unlock', expectedText: 'بازگشایی' },
    ];

    for (const item of sensitiveButtons) {
      const btn = fixture.nativeElement.querySelector(item.id) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      const span = btn.querySelector('span');
      expect(span, `دکمه ${item.id} باید دارای تگ span عنوان باشد`).not.toBeNull();
      expect(span?.textContent?.trim()).toBe(item.expectedText);
      expect(btn.getAttribute('aria-label')).toBe(item.expectedText);
    }
  });

  it('سه دکمه استاندارد سربرگ (export-excel, import-excel, refresh) باید به‌طور پیش‌فرض فقط‌آیکون باشند', () => {
    const headerButtons = ['#btn-header-export', '#btn-header-import', '#btn-header-refresh'];
    for (const id of headerButtons) {
      const btn = fixture.nativeElement.querySelector(id) as HTMLButtonElement;
      const span = btn.querySelector('span');
      expect(span, `دکمه ${id} در حالت auto نباید span عنوان داشته باشد`).toBeNull();
      expect(btn.getAttribute('aria-label')).toBeTruthy();
      expect(btn.getAttribute('title')).toBeTruthy();
    }

    // اما اگر صریحاً display="label" داده شود، عنوان ظاهر می‌شود
    const forcedBtn = fixture.nativeElement.querySelector('#btn-header-export-forced') as HTMLButtonElement;
    expect(forcedBtn.querySelector('span')?.textContent?.trim()).toBe('خروجی اکسل');
  });

  it('باید type="submit" و رویداد کلیک بومی را حفظ کند', () => {
    const btn = fixture.nativeElement.querySelector('#btn-submit') as HTMLButtonElement;
    expect(btn.getAttribute('type')).toBe('submit');
    expect(host.saveClicked).toBe(false);

    btn.click();
    expect(host.saveClicked).toBe(true);
  });

  it('در حالت busy باید aria-busy="true"، دکمه غیرفعال و آیکون spinner باشد', () => {
    const btn = fixture.nativeElement.querySelector('#btn-busy-test') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBeNull();
    expect(btn.disabled).toBe(false);

    // فعال‌سازی busy
    host.isBusy.set(true);
    fixture.detectChanges();

    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    const svg = btn.querySelector('svg');
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });

  it('وقتی busy=false است نباید disabled صفحه را بازنویسی کند', () => {
    const btn = fixture.nativeElement.querySelector('#btn-busy-test') as HTMLButtonElement;

    // صفحه دکمه را disabled کرده است
    host.isDisabled.set(true);
    host.isBusy.set(false);
    fixture.detectChanges();

    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBeNull();

    // فعال کردن و سپس غیرفعال کردن busy نباید disabled صفحه را پاک کند
    host.isBusy.set(true);
    fixture.detectChanges();
    expect(btn.disabled).toBe(true);

    host.isBusy.set(false);
    fixture.detectChanges();
    expect(btn.disabled).toBe(true); // همچنان باید disabled بماند چون isDisabled=true است
  });

  it('دکمه اندازه lg باید دارای سطح لمسی دست‌کم ۴۴ پیکسل باشد', () => {
    const btn = fixture.nativeElement.querySelector('#btn-lg') as HTMLButtonElement;
    expect(btn.className).toContain('min-w-[44px]');
    expect(btn.className).toContain('min-h-[44px]');
  });
});

@Component({
  standalone: true,
  imports: [ActionButtonComponent],
  template: `
    <button id="btn-in-overflow" type="button" appAction="export-excel"></button>
  `,
})
class OverflowHostComponent {}

describe('ActionButtonComponent درون منوی پاپ‌اوور (OVERFLOW_MENU_CONTEXT)', () => {
  it('درون منوی پاپ‌اوور عنوان باید همیشه رندر شود و کلیک روی دکمه متد close را فراخوانی کند', async () => {
    const closeSpy = vi.fn();
    const fakeContext: OverflowMenuContext = {
      close: closeSpy,
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [OverflowHostComponent],
      providers: [
        {
          provide: OVERFLOW_MENU_CONTEXT,
          useValue: fakeContext,
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(OverflowHostComponent);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('#btn-in-overflow') as HTMLButtonElement;
    // حتی برای export-excel که پیش‌فرض فقط‌آیکون است، درون پاپ‌اوور باید عنوان نمایش داده شود
    const span = btn.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.textContent?.trim()).toBe('خروجی اکسل');

    btn.click();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
