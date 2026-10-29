// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { WhatsNewComponent } from './whats-new.component';
import { APP_VERSION } from '../../../core/platform/app-version';
import {
  RELEASE_NOTES,
  LAST_SEEN_VERSION_KEY,
  formatVersionFa,
  releaseNotesToShow,
} from '../../../core/platform/release-notes';
import { liveUpdateReady } from '../../../core/platform/live-update';

let localStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => localStore[key] ?? null,
  setItem: (key: string, val: string) => { localStore[key] = String(val); },
  removeItem: (key: string) => { delete localStore[key]; },
  clear: () => { localStore = {}; },
  get length() { return Object.keys(localStore).length; },
  key: (i: number) => Object.keys(localStore)[i] ?? null,
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
}
if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
}

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe("WhatsNewComponent (Release v1 step 5-b)", () => {
  beforeEach(async () => {
    localStorage.clear();
    liveUpdateReady.set(null);
    await TestBed.configureTestingModule({
      imports: [WhatsNewComponent],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
    liveUpdateReady.set(null);
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('a) fresh install: no app.lastSeenVersion -> after detectChanges no dialog and key equals APP_VERSION', () => {
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]');
    expect(dialog).toBeNull();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);
  });

  it('b) upgrade: app.lastSeenVersion = 0.9.0 -> dialog is shown with items and key is unchanged', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.9.0');
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]');
    expect(dialog).not.toBeNull();
    const items = fixture.nativeElement.querySelectorAll('[data-testid="whats-new-dialog"] li');
    expect(items.length).toBe(RELEASE_NOTES[APP_VERSION].length);
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('0.9.0');
  });

  it('c) close: in state of (b) click whats-new-close -> dialog gone and key equals APP_VERSION; new instance shows no dialog', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.9.0');
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    const closeBtn = fixture.nativeElement.querySelector('[data-testid="whats-new-close"]') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]')).toBeNull();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);

    const newFixture = TestBed.createComponent(WhatsNewComponent);
    newFixture.detectChanges();
    expect(newFixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]')).toBeNull();
  });

  it('d) Escape: in state of (b) dispatch Escape on document -> dialog gone and key equals APP_VERSION', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.9.0');
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]')).toBeNull();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(APP_VERSION);
  });

  it('g) focus and backdrop: confirm button gets focus, backdrop click keeps the dialog, close returns focus', async () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.9.0');
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const fixture = TestBed.createComponent(WhatsNewComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const confirm = fixture.nativeElement.querySelector('[data-testid="whats-new-close"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(confirm);

    const dialog = fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]') as HTMLElement;
    (dialog.parentElement as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]')).not.toBeNull();
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe('0.9.0');

    confirm.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('e) same version: key = APP_VERSION -> no dialog', () => {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="whats-new-dialog"]')).toBeNull();
  });

  it('f) pure function: releaseNotesToShow and formatVersionFa behavior', () => {
    expect(releaseNotesToShow('0.9.0', '7.7.7')).toBeNull();
    expect(releaseNotesToShow(null, APP_VERSION)).toBeNull();
    expect(releaseNotesToShow('bad', APP_VERSION)).toBeNull();
    const fa = formatVersionFa('1.0.0');
    expect(/\d/.test(fa)).toBe(false);
  });
});
