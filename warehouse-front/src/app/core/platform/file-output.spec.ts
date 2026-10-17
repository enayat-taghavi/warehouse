// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import {
  saveBlob,
  saveUrl,
  printWindow,
  FileOutputService,
  fileOutputNativeBridge,
  setFileOutputErrorNotifier,
} from './file-output';
import { SERVER_ORIGIN_STORAGE_KEY } from './server-origin';
import { Directory } from '@capacitor/filesystem';

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
  let writeFileSpy: ReturnType<typeof vi.spyOn>;
  let shareSpy: ReturnType<typeof vi.spyOn>;
  let printHtmlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    sessionStorage.clear();
    environment.serverOrigin = '';

    writeFileSpy = vi.spyOn(fileOutputNativeBridge, 'writeFile').mockResolvedValue({ uri: 'file:///documents/CoManage/default.bin' });
    shareSpy = vi.spyOn(fileOutputNativeBridge, 'share').mockResolvedValue({ activityType: undefined });
    printHtmlSpy = vi.spyOn(fileOutputNativeBridge, 'printHtml').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    sessionStorage.clear();
    environment.serverOrigin = originalServerOrigin;
    setFileOutputErrorNotifier(null);
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

      expect(createdAnchor).not.toBeNull();
      expect(createdAnchor!.href).toBe('blob:http://localhost/test-uuid');
      expect(createdAnchor!.download).toBe('sample.txt');
      expect(appendCalled).toBe(true);
      expect(clickCalled).toBe(true);
      expect(removeCalled).toBe(true);
      appendSpy.mockRestore();
    });

    it('2. web saveBlob revokes the object URL after 1000ms using fake timers', async () => {
      vi.useFakeTimers();
      try {
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
      } finally {
        vi.useRealTimers();
      }
    });

    it('3. native saveBlob writes file as base64 with Directory.Documents and path CoManage/<filename> and invokes Share.share', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/sample.pdf',
      });

      const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      await saveBlob(dummyBlob, 'sample.pdf');

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(writeFileSpy).toHaveBeenCalledWith({
        path: 'CoManage/sample.pdf',
        directory: Directory.Documents,
        recursive: true,
        data: expect.any(String),
      });
      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(shareSpy).toHaveBeenCalledWith({
        title: 'sample.pdf',
        url: 'file:///documents/CoManage/sample.pdf',
      });
    });

    it('4. native saveBlob falls back to Directory.Data when write to Directory.Documents throws', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy
        .mockRejectedValueOnce(new Error('Documents permission denied'))
        .mockResolvedValueOnce({
          uri: 'file:///data/CoManage/sample.pdf',
        });

      const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      await saveBlob(dummyBlob, 'sample.pdf');

      expect(writeFileSpy).toHaveBeenCalledTimes(2);
      expect(writeFileSpy).toHaveBeenNthCalledWith(1, {
        path: 'CoManage/sample.pdf',
        directory: Directory.Documents,
        recursive: true,
        data: expect.any(String),
      });
      expect(writeFileSpy).toHaveBeenNthCalledWith(2, {
        path: 'CoManage/sample.pdf',
        directory: Directory.Data,
        recursive: true,
        data: expect.any(String),
      });
      expect(shareSpy).toHaveBeenCalledWith({
        title: 'sample.pdf',
        url: 'file:///data/CoManage/sample.pdf',
      });
    });

    it('5. native saveBlob a share cancel error resolves without notifying', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/sample.pdf',
      });
      shareSpy.mockRejectedValue(new Error('User did cancel share'));

      const notifierSpy = vi.fn();
      setFileOutputErrorNotifier(notifierSpy);

      const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      await expect(saveBlob(dummyBlob, 'sample.pdf')).resolves.toBeUndefined();

      expect(notifierSpy).not.toHaveBeenCalled();
    });

    it('6. native saveBlob a write failure in both Directory.Documents and Directory.Data calls the notifier once and rejects', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockRejectedValue(new Error('Disk full error'));

      const notifierSpy = vi.fn();
      setFileOutputErrorNotifier(notifierSpy);

      const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      await expect(saveBlob(dummyBlob, 'sample.pdf')).rejects.toThrow('Disk full error');

      expect(notifierSpy).toHaveBeenCalledTimes(1);
      expect(notifierSpy).toHaveBeenCalledWith('ذخیره یا اشتراک فایل روی گوشی انجام نشد. دوباره تلاش کنید.');
    });
  });

  describe('saveUrl', () => {
    it('7. web saveUrl creates anchor with resolved URL, download attribute, clicks and removes it', async () => {
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

    it('8. web saveUrl uses empty download string if filename is omitted', async () => {
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

    it('9. native saveUrl downloads resolved URL with Authorization header and saves via native saveBlob', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      environment.serverOrigin = 'https://app.farsalish.ir';
      localStorage.setItem('wh_access_token', 'test_jwt_token_123');

      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/export.xlsx',
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
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'CoManage/export.xlsx',
          directory: Directory.Documents,
          recursive: true,
        })
      );
      expect(shareSpy).toHaveBeenCalledWith({
        title: 'export.xlsx',
        url: 'file:///documents/CoManage/export.xlsx',
      });
    });

    it('10. native saveUrl falls back to extracting filename from URL when filename is not provided', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      environment.serverOrigin = 'https://app.farsalish.ir';

      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/document.pdf',
      });

      const mockBlob = new Blob(['pdf data'], { type: 'application/pdf' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response);

      await saveUrl('/media/downloads/document.pdf?token=abc');

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'CoManage/document.pdf',
          directory: Directory.Documents,
          recursive: true,
        })
      );
      expect(shareSpy).toHaveBeenCalledWith({
        title: 'document.pdf',
        url: 'file:///documents/CoManage/document.pdf',
      });
    });

    it('11. native saveUrl with a 500 response calls the notifier once and rejects', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      environment.serverOrigin = 'https://app.farsalish.ir';

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      const notifierSpy = vi.fn();
      setFileOutputErrorNotifier(notifierSpy);

      await expect(saveUrl('/api/export/failed.xlsx', 'failed.xlsx')).rejects.toThrow('Failed to download file: 500 Internal Server Error');

      expect(notifierSpy).toHaveBeenCalledTimes(1);
      expect(notifierSpy).toHaveBeenCalledWith('ذخیره یا اشتراک فایل روی گوشی انجام نشد. دوباره تلاش کنید.');
    });

    it('12. native saveUrl calling saveBlob on write failure calls the notifier once and rejects', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      environment.serverOrigin = 'https://app.farsalish.ir';

      const mockBlob = new Blob(['pdf data'], { type: 'application/pdf' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response);

      writeFileSpy.mockRejectedValue(new Error('Storage unavailable'));

      const notifierSpy = vi.fn();
      setFileOutputErrorNotifier(notifierSpy);

      await expect(saveUrl('/media/downloads/file.pdf', 'file.pdf')).rejects.toThrow('Storage unavailable');

      expect(notifierSpy).toHaveBeenCalledTimes(1);
      expect(notifierSpy).toHaveBeenCalledWith('ذخیره یا اشتراک فایل روی گوشی انجام نشد. دوباره تلاش کنید.');
    });
  });

  describe('printWindow', () => {
    it('13. web printWindow calls print on the given target window', () => {
      const mockTarget = {
        print: vi.fn(),
      } as unknown as Window;

      printWindow(mockTarget);
      expect(mockTarget.print).toHaveBeenCalledTimes(1);
    });

    it('14. web printWindow calls print on window by default when target is not provided', () => {
      const windowPrintSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      printWindow();
      expect(windowPrintSpy).toHaveBeenCalledTimes(1);

      printWindow(null);
      expect(windowPrintSpy).toHaveBeenCalledTimes(2);

      printWindow(undefined);
      expect(windowPrintSpy).toHaveBeenCalledTimes(3);
    });

    it('15. native printWindow prints HTML of target document via Printer.printHtml', async () => {
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

      expect(printHtmlSpy).toHaveBeenCalledWith({
        html: '<html><head><title>Print</title></head><body><h1>Invoice #123</h1></body></html>',
      });
      expect(mockTarget.print).not.toHaveBeenCalled();
    });

    it('16. native printWindow prints current document when target is omitted', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };

      await printWindow();

      expect(printHtmlSpy).toHaveBeenCalledWith({
        html: expect.any(String),
      });
    });

    it('17. native printWindow failure calls the notifier and rejects', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      printHtmlSpy.mockRejectedValue(new Error('Printer service not available'));

      const notifierSpy = vi.fn();
      setFileOutputErrorNotifier(notifierSpy);

      await expect(printWindow()).rejects.toThrow('Printer service not available');

      expect(notifierSpy).toHaveBeenCalledTimes(1);
      expect(notifierSpy).toHaveBeenCalledWith('چاپ روی گوشی انجام نشد. دوباره تلاش کنید.');
    });
  });

  describe('FileOutputService', () => {
    it('18. web FileOutputService delegates saveBlob, saveUrl, and print to standalone functions', async () => {
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
      expect(clickCount).toBe(1);

      await service.saveUrl('/api/reports/1', 'delegated.pdf');
      expect(clickCount).toBe(2);

      const target = { print: vi.fn() } as unknown as Window;
      service.print(target);
      expect(target.print).toHaveBeenCalledTimes(1);
    });

    it('19. native FileOutputService delegates saveBlob, saveUrl, and print to native platform implementations', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/delegated_native.pdf',
      });

      const service = new FileOutputService();

      const blob = new Blob(['content']);
      await service.saveBlob(blob, 'delegated_native.pdf');
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'CoManage/delegated_native.pdf',
          directory: Directory.Documents,
          recursive: true,
        })
      );
      expect(shareSpy).toHaveBeenCalledTimes(1);

      const mockBlob = new Blob(['url content']);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response);

      await service.saveUrl('/api/download/file.pdf', 'file.pdf');
      expect(writeFileSpy).toHaveBeenCalledTimes(2);

      await service.print();
      expect(printHtmlSpy).toHaveBeenCalledTimes(1);
    });
  });
});
