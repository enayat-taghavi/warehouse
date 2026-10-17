// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import {
  saveBlob,
  saveUrl,
  printWindow,
  FileOutputService,
} from './file-output';
import { SERVER_ORIGIN_STORAGE_KEY } from './server-origin';

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

describe('file-output', () => {
  const originalServerOrigin = environment.serverOrigin;

  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    environment.serverOrigin = '';
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    environment.serverOrigin = originalServerOrigin;
  });

  describe('saveBlob', () => {
    it('1. creates anchor with correct href, download, appends, clicks, and removes it', async () => {
      let createdAnchor: HTMLAnchorElement | null = null;
      let appendCalled = false;
      let removeCalled = false;
      let clickCalled = false;

      const dummyBlob = new Blob(['hello world'], { type: 'text/plain' });
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/test-uuid');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          createdAnchor = el as HTMLAnchorElement;
          vi.spyOn(el, 'click').mockImplementation(() => {
            clickCalled = true;
          });
          vi.spyOn(el, 'remove').mockImplementation(() => {
            removeCalled = true;
          });
        }
        return el;
      });

      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        appendCalled = true;
        return node;
      });

      await saveBlob(dummyBlob, 'sample.txt');
      vi.advanceTimersByTime(1000);

      expect(createdAnchor).not.toBeNull();
      expect(createdAnchor!.href).toBe('blob:http://localhost/test-uuid');
      expect(createdAnchor!.download).toBe('sample.txt');
      expect(appendCalled).toBe(true);
      expect(clickCalled).toBe(true);
      expect(removeCalled).toBe(true);
    });

    it('2. revokes the object URL after 1000ms using fake timers', async () => {
      vi.clearAllTimers();
      const dummyBlob = new Blob(['data'], { type: 'application/octet-stream' });
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/timed-uuid');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      revokeSpy.mockClear();

      await saveBlob(dummyBlob, 'test.bin');

      expect(revokeSpy).not.toHaveBeenCalledWith('blob:http://localhost/timed-uuid');

      vi.advanceTimersByTime(999);
      expect(revokeSpy).not.toHaveBeenCalledWith('blob:http://localhost/timed-uuid');

      vi.advanceTimersByTime(1);
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/timed-uuid');
    });
  });

  describe('saveUrl', () => {
    it('3. creates anchor with resolved URL, download attribute, clicks and removes it', async () => {
      let createdAnchor: HTMLAnchorElement | null = null;
      let clickCalled = false;
      let removeCalled = false;

      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          createdAnchor = el as HTMLAnchorElement;
          vi.spyOn(el, 'click').mockImplementation(() => {
            clickCalled = true;
          });
          vi.spyOn(el, 'remove').mockImplementation(() => {
            removeCalled = true;
          });
        }
        return el;
      });

      await saveUrl('/static/file.pdf', 'file.pdf');

      expect(createdAnchor).not.toBeNull();
      expect(createdAnchor!.getAttribute('href')).toBe('/static/file.pdf');
      expect(createdAnchor!.download).toBe('file.pdf');
      expect(clickCalled).toBe(true);
      expect(removeCalled).toBe(true);
    });

    it('4. uses empty download string if filename is omitted', async () => {
      let createdAnchor: HTMLAnchorElement | null = null;
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          createdAnchor = el as HTMLAnchorElement;
          vi.spyOn(el, 'click').mockImplementation(() => {});
          vi.spyOn(el, 'remove').mockImplementation(() => {});
        }
        return el;
      });

      await saveUrl('https://example.com/report.csv');
      expect(createdAnchor!.download).toBe('');
    });

    it('5. resolves server paths on a stubbed native runtime', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      environment.serverOrigin = 'https://app.farsalish.ir';

      let createdAnchor: HTMLAnchorElement | null = null;
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          createdAnchor = el as HTMLAnchorElement;
          vi.spyOn(el, 'click').mockImplementation(() => {});
          vi.spyOn(el, 'remove').mockImplementation(() => {});
        }
        return el;
      });

      await saveUrl('/api/export/warehouse_data', 'data.xlsx');

      expect(createdAnchor).not.toBeNull();
      expect(createdAnchor!.getAttribute('href')).toBe('https://app.farsalish.ir/api/export/warehouse_data');
      expect(createdAnchor!.download).toBe('data.xlsx');
    });
  });

  describe('printWindow', () => {
    it('6. calls print on the given target window', () => {
      const mockTarget = {
        print: vi.fn(),
      } as unknown as Window;

      printWindow(mockTarget);
      expect(mockTarget.print).toHaveBeenCalledTimes(1);
    });

    it('7. calls print on window by default when target is not provided', () => {
      const windowPrintSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      printWindow();
      expect(windowPrintSpy).toHaveBeenCalledTimes(1);

      printWindow(null);
      expect(windowPrintSpy).toHaveBeenCalledTimes(2);

      printWindow(undefined);
      expect(windowPrintSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('FileOutputService', () => {
    it('8. delegates saveBlob, saveUrl, and print to standalone functions', async () => {
      const service = new FileOutputService();

      const blob = new Blob(['abc']);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      let clickCount = 0;
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          vi.spyOn(el, 'click').mockImplementation(() => {
            clickCount++;
          });
          vi.spyOn(el, 'remove').mockImplementation(() => {});
        }
        return el;
      });

      await service.saveBlob(blob, 'delegated.txt');
      vi.advanceTimersByTime(1000);
      expect(clickCount).toBe(1);

      await service.saveUrl('/api/reports/1', 'delegated.pdf');
      expect(clickCount).toBe(2);

      const target = { print: vi.fn() } as unknown as Window;
      service.print(target);
      expect(target.print).toHaveBeenCalledTimes(1);
    });
  });
});
