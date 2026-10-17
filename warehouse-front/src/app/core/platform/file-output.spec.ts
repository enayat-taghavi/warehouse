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
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Printer } from '@capgo/capacitor-printer';

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: 'file:///cache/default.bin' }),
  },
  Directory: {
    Documents: 'DOCUMENTS',
    Data: 'DATA',
    Library: 'LIBRARY',
    Cache: 'CACHE',
    External: 'EXTERNAL',
    ExternalStorage: 'EXTERNAL_STORAGE',
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn().mockResolvedValue({ activityType: undefined }),
  },
}));

vi.mock('@capgo/capacitor-printer', () => ({
  Printer: {
    printHtml: vi.fn().mockResolvedValue(undefined),
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
(globalThis as any).sessionStorage = createStorageMock();

describe('file-output', () => {
  const originalServerOrigin = environment.serverOrigin;

  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    sessionStorage.clear();
    environment.serverOrigin = '';

    vi.mocked(Filesystem.writeFile).mockReset().mockResolvedValue({ uri: 'file:///cache/default.bin' });
    vi.mocked(Share.share).mockReset().mockResolvedValue({ activityType: undefined });
    vi.mocked(Printer.printHtml).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    sessionStorage.clear();
    environment.serverOrigin = originalServerOrigin;
  });

  describe('saveBlob', () => {
    it('1. web saveBlob creates anchor with correct href, download, appends, clicks, and removes it', async () => {
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
      appendSpy.mockRestore();
    });

    it('2. web saveBlob revokes the object URL after 1000ms using fake timers', async () => {
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

    it('3. native saveBlob writes file as base64 to Directory.Cache and invokes Share.share', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      vi.mocked(Filesystem.writeFile).mockResolvedValue({
        uri: 'file:///cache/sample.pdf',
      });

      const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      await saveBlob(dummyBlob, 'sample.pdf');

      expect(Filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(Filesystem.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'sample.pdf',
          directory: Directory.Cache,
          data: expect.any(String),
        })
      );
      expect(Share.share).toHaveBeenCalledTimes(1);
      expect(Share.share).toHaveBeenCalledWith({
        title: 'sample.pdf',
        url: 'file:///cache/sample.pdf',
      });
    });
  });

  describe('saveUrl', () => {
    it('4. web saveUrl creates anchor with resolved URL, download attribute, clicks and removes it', async () => {
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

    it('5. web saveUrl uses empty download string if filename is omitted', async () => {
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

    it('6. native saveUrl downloads resolved URL with Authorization header and saves via native saveBlob', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      environment.serverOrigin = 'https://app.farsalish.ir';
      localStorage.setItem('wh_access_token', 'test_jwt_token_123');

      vi.mocked(Filesystem.writeFile).mockResolvedValue({
        uri: 'file:///cache/export.xlsx',
      });

      const mockBlob = new Blob(['xlsx binary data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response);

      await saveUrl('/api/export/warehouse_data', 'export.xlsx');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://app.farsalish.ir/api/export/warehouse_data',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test_jwt_token_123',
          }),
        })
      );
      expect(Filesystem.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'export.xlsx',
          directory: Directory.Cache,
        })
      );
      expect(Share.share).toHaveBeenCalledWith({
        title: 'export.xlsx',
        url: 'file:///cache/export.xlsx',
      });
    });

    it('7. native saveUrl falls back to extracting filename from URL when filename is not provided', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      environment.serverOrigin = 'https://app.farsalish.ir';

      vi.mocked(Filesystem.writeFile).mockResolvedValue({
        uri: 'file:///cache/document.pdf',
      });

      const mockBlob = new Blob(['pdf data'], { type: 'application/pdf' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response);

      await saveUrl('/media/downloads/document.pdf?token=abc');

      expect(Filesystem.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'document.pdf',
          directory: Directory.Cache,
        })
      );
      expect(Share.share).toHaveBeenCalledWith({
        title: 'document.pdf',
        url: 'file:///cache/document.pdf',
      });
    });
  });

  describe('printWindow', () => {
    it('8. web printWindow calls print on the given target window', () => {
      const mockTarget = {
        print: vi.fn(),
      } as unknown as Window;

      printWindow(mockTarget);
      expect(mockTarget.print).toHaveBeenCalledTimes(1);
    });

    it('9. web printWindow calls print on window by default when target is not provided', () => {
      const windowPrintSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      printWindow();
      expect(windowPrintSpy).toHaveBeenCalledTimes(1);

      printWindow(null);
      expect(windowPrintSpy).toHaveBeenCalledTimes(2);

      printWindow(undefined);
      expect(windowPrintSpy).toHaveBeenCalledTimes(3);
    });

    it('10. native printWindow prints HTML of target document via Printer.printHtml', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };

      const mockDoc = {
        documentElement: {
          outerHTML: '<html><head><title>Print</title></head><body><h1>Invoice #123</h1></body></html>',
        },
      };
      const mockTarget = {
        document: mockDoc,
        print: vi.fn(),
      } as unknown as Window;

      await printWindow(mockTarget);

      expect(Printer.printHtml).toHaveBeenCalledWith({
        html: '<html><head><title>Print</title></head><body><h1>Invoice #123</h1></body></html>',
      });
      expect(mockTarget.print).not.toHaveBeenCalled();
    });

    it('11. native printWindow prints current document when target is omitted', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };

      await printWindow();

      expect(Printer.printHtml).toHaveBeenCalledWith({
        html: expect.any(String),
      });
    });
  });

  describe('FileOutputService', () => {
    it('12. web FileOutputService delegates saveBlob, saveUrl, and print to standalone functions', async () => {
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

    it('13. native FileOutputService delegates saveBlob, saveUrl, and print to native platform implementations', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      vi.mocked(Filesystem.writeFile).mockResolvedValue({
        uri: 'file:///cache/delegated_native.pdf',
      });

      const service = new FileOutputService();

      const blob = new Blob(['content']);
      await service.saveBlob(blob, 'delegated_native.pdf');
      expect(Filesystem.writeFile).toHaveBeenCalledTimes(1);
      expect(Share.share).toHaveBeenCalledTimes(1);

      const mockBlob = new Blob(['url content']);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response);

      await service.saveUrl('/api/download/file.pdf', 'file.pdf');
      expect(Filesystem.writeFile).toHaveBeenCalledTimes(2);

      service.print();
      expect(Printer.printHtml).toHaveBeenCalledTimes(1);
    });
  });
});
