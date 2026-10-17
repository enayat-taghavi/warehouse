// @vitest-environment jsdom
import '@angular/compiler';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExternalLinkDirective } from './external-link.directive';
import { externalLinkNativeBridge } from '../../core/platform/external-link';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

@Component({
  standalone: true,
  imports: [ExternalLinkDirective],
  template: `
    <a id="web-link" href="https://example.com/web" target="_blank" appExternalLink>Web Link</a>
    <a id="bound-link" [href]="customUrl" [appExternalLink]="customUrl" target="_blank">Bound Link</a>
    <a id="static-link" href="https://example.com/static" target="_blank" appExternalLink>Static Link</a>
  `
})
class TestHostComponent {
  customUrl = 'https://example.com/bound';
}

describe('ExternalLinkDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let openSpy: ReturnType<typeof vi.spyOn>;
  let bridgeOpenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    delete (globalThis as any).Capacitor;
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null as any);
    bridgeOpenSpy = vi.spyOn(externalLinkNativeBridge, 'open').mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    TestBed.resetTestingModule();
  });

  it('1. on web: click is not prevented and openExternal is not called', () => {
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('#web-link');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    link.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(bridgeOpenSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('2. on native: click is prevented and routed to openExternal', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('#web-link');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    link.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(bridgeOpenSpy).toHaveBeenCalledTimes(1);
    expect(bridgeOpenSpy).toHaveBeenCalledWith({ url: 'https://example.com/web' });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('3. on native: bound input expression is passed to openExternal', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('#bound-link');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    link.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(bridgeOpenSpy).toHaveBeenCalledTimes(1);
    expect(bridgeOpenSpy).toHaveBeenCalledWith({ url: 'https://example.com/bound' });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('4. on native: static appExternalLink falls back to anchor href', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('#static-link');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    link.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(bridgeOpenSpy).toHaveBeenCalledTimes(1);
    expect(bridgeOpenSpy).toHaveBeenCalledWith({ url: 'https://example.com/static' });
    expect(openSpy).not.toHaveBeenCalled();
  });
});
