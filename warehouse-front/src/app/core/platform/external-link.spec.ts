// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openExternal } from './external-link';
import { SERVER_ORIGIN_STORAGE_KEY } from './server-origin';
import { environment } from '../../../environments/environment';
import { Browser } from '@capacitor/browser';

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn().mockResolvedValue(undefined),
  },
}));

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

describe('openExternal', () => {
  const originalServerOrigin = environment.serverOrigin;
  let openSpy: ReturnType<typeof vi.spyOn>;
  const mockWindow = { closed: false, focus: vi.fn(), close: vi.fn() } as unknown as Window;

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    environment.serverOrigin = '';
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => mockWindow);
    vi.mocked(Browser.open).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    environment.serverOrigin = originalServerOrigin;
  });

  it('1. web passthrough and returned value with default target and without features', () => {
    const result = openExternal('https://example.com/report');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/report', '_blank');
    expect(openSpy.mock.calls[0].length).toBe(2);
    expect(result).toBe(mockWindow);
  });

  it('2. web passthrough with custom target and window features', () => {
    const features = 'width=800,height=600,menubar=no';
    const result = openExternal('https://example.com/form', '_self', features);
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/form', '_self', features);
    expect(openSpy.mock.calls[0].length).toBe(3);
    expect(result).toBe(mockWindow);
  });

  it('3. about:blank popup unchanged with OAuth popup dimensions', () => {
    const popupFeatures = 'width=600,height=700,top=100,left=200,status=no,toolbar=no,menubar=no';
    const result = openExternal('about:blank', 'GoogleDriveAuth', popupFeatures);
    expect(openSpy).toHaveBeenCalledWith('about:blank', 'GoogleDriveAuth', popupFeatures);
    expect(result).toBe(mockWindow);
  });

  it('4. native branch opens resolved URL via Browser.open and returns null', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    environment.serverOrigin = 'https://app.farsalish.ir';

    const result = openExternal('/media/reports/export.xlsx');
    expect(Browser.open).toHaveBeenCalledWith({
      url: 'https://app.farsalish.ir/media/reports/export.xlsx',
    });
    expect(openSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('5. native branch returns null for about:blank popups without opening browser', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    const result = openExternal('about:blank', 'GoogleDriveAuth');
    expect(Browser.open).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
