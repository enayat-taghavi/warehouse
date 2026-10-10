// @vitest-environment jsdom
import '@angular/compiler';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OverflowMenuComponent } from './overflow-menu.component';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { CommandCenterComponent } from '../command-center/command-center.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  standalone: true,
  imports: [OverflowMenuComponent, ActionButtonComponent, CommandCenterComponent],
  template: `
    <div id="outside-area">محتوای بیرون سربرگ</div>
    <app-command-center>
      <div cc-actions>
        <app-overflow-menu>
          <button id="menu-opt-import" type="button" appAction="import-excel"></button>
          <button id="menu-opt-export" type="button" appAction="export-excel"></button>
        </app-overflow-menu>
      </div>
    </app-command-center>
  `,
})
class TestHostComponent {}

describe('OverflowMenuComponent (app-overflow-menu)', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let menuComponent: OverflowMenuComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    const menuDebug = fixture.debugElement.query(By.directive(OverflowMenuComponent));
    menuComponent = menuDebug.componentInstance as OverflowMenuComponent;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('دکمه trigger باید فقط‌آیکون ۴۰×۴۰ با aria-label «کارهای بیشتر» باشد و توکن منو را نگیرد', () => {
    const trigger = fixture.nativeElement.querySelector('button[appAction="more"]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-label')).toBe('کارهای بیشتر');
    expect(trigger.getAttribute('title')).toBe('کارهای بیشتر');

    // تریگر نباید عنوان دیده‌شده یا کلاس‌های تمام‌عرض پاپ‌اوور بگیرد
    const span = trigger.querySelector('span');
    expect(span).toBeNull();
    expect(trigger.className).not.toContain('max-sm:w-full');
    expect(trigger.className).toContain('min-w-[40px]');
    expect(trigger.className).toContain('min-h-[40px]');

    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toMatch(/^overflow-menu-\d+$/);
    const container = fixture.nativeElement.querySelector(`#${controlsId}`) as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.hasAttribute('role')).toBe(false);
    expect(container.querySelector('#menu-opt-import')).not.toBeNull();
  });

  it('با کلیک روی دکمه بیشتر، منو باید باز و بسته شود و aria-expanded به‌روز گردد', () => {
    const trigger = fixture.nativeElement.querySelector('button[appAction="more"]') as HTMLButtonElement;

    // باز کردن منو
    trigger.click();
    fixture.detectChanges();

    expect(menuComponent.isOpen()).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const container = fixture.nativeElement.querySelector(`#${trigger.getAttribute('aria-controls')}`);
    expect(container.className).toContain('absolute');

    // بستن منو با کلیک دوباره
    trigger.click();
    fixture.detectChanges();

    expect(menuComponent.isOpen()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('با فشردن کلید Escape، منو باید بسته شده و فوکوس به دکمه بیشتر بازگردد', () => {
    const trigger = fixture.nativeElement.querySelector('button[appAction="more"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(menuComponent.isOpen()).toBe(true);

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    trigger.dispatchEvent(escapeEvent);
    fixture.detectChanges();

    expect(menuComponent.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('درون app-command-center لمس/کلیک بیرون از سربرگ باید منو را ببندد (document:pointerdown)', () => {
    const trigger = fixture.nativeElement.querySelector('button[appAction="more"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(menuComponent.isOpen()).toBe(true);

    // لمس عنصری کاملاً خارج از سربرگ چسبان command-center
    const outsideArea = fixture.nativeElement.querySelector('#outside-area') as HTMLDivElement;
    expect(outsideArea).not.toBeNull();

    const focusSpy = vi.spyOn(trigger, 'focus');
    const pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    outsideArea.dispatchEvent(pointerEvent);
    fixture.detectChanges();

    expect(menuComponent.isOpen()).toBe(false);
    // لمس بیرون فوکوس را به تریگر برنمی‌گرداند (صفحه به عقب نمی‌پرد)
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('با کلیک روی یکی از دکمه‌های درون منو، منو باید به‌طور خودکار بسته شود', () => {
    const trigger = fixture.nativeElement.querySelector('button[appAction="more"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(menuComponent.isOpen()).toBe(true);

    const opt = fixture.nativeElement.querySelector('#menu-opt-import') as HTMLButtonElement;
    expect(opt).not.toBeNull();

    opt.click();
    fixture.detectChanges();

    expect(menuComponent.isOpen()).toBe(false);
  });
});

