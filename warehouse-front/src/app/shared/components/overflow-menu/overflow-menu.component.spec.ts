// @vitest-environment jsdom
import '@angular/compiler';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OverflowMenuComponent } from './overflow-menu.component';
import { ActionButtonComponent } from '../action-button/action-button.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  standalone: true,
  imports: [OverflowMenuComponent, ActionButtonComponent],
  template: `
    <app-overflow-menu>
      <button id="menu-opt-import" type="button" appAction="import-excel"></button>
      <button id="menu-opt-export" type="button" appAction="export-excel"></button>
    </app-overflow-menu>
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
    menuComponent = fixture.debugElement.children[0].componentInstance as OverflowMenuComponent;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('دکمه trigger باید appAction="more"، aria-expanded و aria-controls (الگوی disclosure، بدون role="menu") داشته باشد', () => {
    const trigger = fixture.nativeElement.querySelector('button[appAction="more"]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
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

  it('با کلیک روی backdrop خارج از منو، منو باید بسته شود', () => {
    const trigger = fixture.nativeElement.querySelector('button[appAction="more"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(menuComponent.isOpen()).toBe(true);

    const backdrop = fixture.nativeElement.querySelector('.fixed.inset-0') as HTMLDivElement;
    expect(backdrop).not.toBeNull();

    backdrop.click();
    fixture.detectChanges();

    expect(menuComponent.isOpen()).toBe(false);
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
