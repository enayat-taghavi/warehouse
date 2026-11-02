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
  setFileShareOfferNotifier,
  setFileOutputInfoNotifier,
  canShareFiles,
  shareBlob,
  shareUrl,
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
  const origShare = (globalThis.navigator as any).share;
  const origCanShare = (globalThis.navigator as any).canShare;

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
    setFileShareOfferNotifier(null);
    setFileOutputInfoNotifier(null);

    if (origShare !== undefined) {
      Object.defineProperty(globalThis.navigator, 'share', {
        value: origShare,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis.navigator as any).share;
    }

    if (origCanShare !== undefined) {
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: origCanShare,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis.navigator as any).canShare;
    }
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

    it('5b. native saveBlob a share cancel after Directory.Data fallback notifies once and rejects', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy
        .mockRejectedValueOnce(new Error('Documents permission denied'))
        .mockResolvedValueOnce({
          uri: 'file:///data/CoManage/sample.pdf',
        });
      shareSpy.mockRejectedValue(new Error('User did cancel share'));

      const notifierSpy = vi.fn();
      setFileOutputErrorNotifier(notifierSpy);

      const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      await expect(saveBlob(dummyBlob, 'sample.pdf')).rejects.toThrow('User did cancel share');

      expect(notifierSpy).toHaveBeenCalledTimes(1);
      expect(notifierSpy).toHaveBeenCalledWith('ذخیره یا اشتراک فایل روی گوشی انجام نشد. دوباره تلاش کنید.');
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

  describe('canShareFiles', () => {
    it('20. canShareFiles returns true on native platform regardless of navigator', () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      delete (globalThis.navigator as any).share;
      delete (globalThis.navigator as any).canShare;

      expect(canShareFiles()).toBe(true);
    });

    it('21. canShareFiles on web returns true when navigator.share and canShare are functions and canShare returns true', () => {
      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
      const canShareMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: canShareMock,
        configurable: true,
        writable: true,
      });

      expect(canShareFiles()).toBe(true);
      expect(canShareMock).toHaveBeenCalledWith({
        files: [expect.any(File)],
      });
      const passedFile = canShareMock.mock.calls[0][0].files[0];
      expect(passedFile.name).toBe('x.txt');
      expect(passedFile.type).toBe('text/plain');
    });

    it('22. canShareFiles on web returns false when navigator.share or canShare is missing, canShare returns false, or canShare throws', () => {
      // Missing share
      delete (globalThis.navigator as any).share;
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });
      expect(canShareFiles()).toBe(false);

      // Missing canShare
      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
      delete (globalThis.navigator as any).canShare;
      expect(canShareFiles()).toBe(false);

      // canShare returns false
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(false),
        configurable: true,
        writable: true,
      });
      expect(canShareFiles()).toBe(false);

      // canShare throws
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockImplementation(() => {
          throw new Error('Not supported');
        }),
        configurable: true,
        writable: true,
      });
      expect(canShareFiles()).toBe(false);
    });
  });

  describe('shareBlob', () => {
    it('23. web shareBlob success passes a File with the right name and MIME type from extension when blob.type is empty', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      const canShareMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis.navigator, 'share', {
        value: shareMock,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: canShareMock,
        configurable: true,
        writable: true,
      });

      const blobWithoutType = new Blob(['sample pdf content'], { type: '' });
      const result = await shareBlob(blobWithoutType, 'report.pdf');

      expect(result).toBe('shared');
      expect(shareMock).toHaveBeenCalledTimes(1);
      const shareArg = shareMock.mock.calls[0][0];
      expect(shareArg.title).toBe('report.pdf');
      expect(shareArg.files).toHaveLength(1);
      const sharedFile = shareArg.files[0];
      expect(sharedFile).toBeInstanceOf(File);
      expect(sharedFile.name).toBe('report.pdf');
      expect(sharedFile.type).toBe('application/pdf');

      // Test xlsx MIME deduction
      shareMock.mockClear();
      const xlsxBlob = new Blob(['xlsx data'], { type: '' });
      await shareBlob(xlsxBlob, 'sheet.xlsx');
      expect(shareMock.mock.calls[0][0].files[0].type).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      // Test preserving existing blob.type
      shareMock.mockClear();
      const customBlob = new Blob(['custom data'], { type: 'custom/special-format' });
      await shareBlob(customBlob, 'data.bin');
      expect(shareMock.mock.calls[0][0].files[0].type).toBe('custom/special-format');
    });

    it('24. web shareBlob handles AbortError by returning cancelled with no notifier call', async () => {
      const abortError = new Error('The user aborted the share operation.');
      abortError.name = 'AbortError';

      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn().mockRejectedValue(abortError),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      const errorNotifier = vi.fn();
      setFileOutputErrorNotifier(errorNotifier);

      const result = await shareBlob(new Blob(['hello']), 'doc.pdf');
      expect(result).toBe('cancelled');
      expect(errorNotifier).not.toHaveBeenCalled();
    });

    it('25. web shareBlob handles NotAllowedError: with offer notifier calls it and returns offered', async () => {
      const notAllowedError = new Error('Permission denied or gesture expired');
      notAllowedError.name = 'NotAllowedError';

      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn().mockRejectedValue(notAllowedError),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      const offerNotifier = vi.fn();
      setFileShareOfferNotifier(offerNotifier);

      const dummyBlob = new Blob(['test']);
      const result = await shareBlob(dummyBlob, 'statement.pdf');

      expect(result).toBe('offered');
      expect(offerNotifier).toHaveBeenCalledTimes(1);
      expect(offerNotifier).toHaveBeenCalledWith({
        blob: dummyBlob,
        filename: 'statement.pdf',
      });
    });

    it('26. web shareBlob handles NotAllowedError: without offer notifier falls through to download fallback', async () => {
      const notAllowedError = new Error('Permission denied or gesture expired');
      notAllowedError.name = 'NotAllowedError';

      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn().mockRejectedValue(notAllowedError),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      setFileShareOfferNotifier(null);
      const infoNotifier = vi.fn();
      setFileOutputInfoNotifier(infoNotifier);

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

      const dummyBlob = new Blob(['test']);
      const result = await shareBlob(dummyBlob, 'statement.pdf');

      expect(result).toBe('downloaded');
      expect(clickCount).toBe(1);
      expect(infoNotifier).toHaveBeenCalledTimes(1);
      expect(infoNotifier).toHaveBeenCalledWith('مرورگر شما اشتراک‌گذاری این فایل را پشتیبانی نمی‌کند؛ فایل دانلود شد.');
    });

    it('27. web shareBlob falls back to download when file sharing is unsupported or canShare is false', async () => {
      // canShare is false
      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(false),
        configurable: true,
        writable: true,
      });

      const infoNotifier = vi.fn();
      setFileOutputInfoNotifier(infoNotifier);

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

      const dummyBlob = new Blob(['unsupported file content']);
      const result = await shareBlob(dummyBlob, 'archive.zip');

      expect(result).toBe('downloaded');
      expect(clickCount).toBe(1);
      expect(infoNotifier).toHaveBeenCalledWith('مرورگر شما اشتراک‌گذاری این فایل را پشتیبانی نمی‌کند؛ فایل دانلود شد.');
    });

    it('28. web shareBlob on unexpected error calls notifyError and rethrows', async () => {
      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn().mockRejectedValue(new Error('Unexpected share crash')),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      const errorNotifier = vi.fn();
      setFileOutputErrorNotifier(errorNotifier);

      await expect(shareBlob(new Blob(['hello']), 'doc.pdf')).rejects.toThrow('Unexpected share crash');
      expect(errorNotifier).toHaveBeenCalledTimes(1);
      expect(errorNotifier).toHaveBeenCalledWith('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.');
    });

    it('29. native shareBlob writes file as base64 with Directory.Documents and invokes bridge share returning shared', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/native_export.pdf',
      });

      const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      const result = await shareBlob(dummyBlob, 'native_export.pdf');

      expect(result).toBe('shared');
      expect(writeFileSpy).toHaveBeenCalledWith({
        path: 'CoManage/native_export.pdf',
        directory: Directory.Documents,
        recursive: true,
        data: expect.any(String),
      });
      expect(shareSpy).toHaveBeenCalledWith({
        title: 'native_export.pdf',
        url: 'file:///documents/CoManage/native_export.pdf',
      });
    });

    it('30. native shareBlob handles cancel error by returning cancelled without error notification', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/cancelled.pdf',
      });
      shareSpy.mockRejectedValue(new Error('User did cancel share'));

      const errorNotifier = vi.fn();
      setFileOutputErrorNotifier(errorNotifier);

      const result = await shareBlob(new Blob(['sample']), 'cancelled.pdf');
      expect(result).toBe('cancelled');
      expect(errorNotifier).not.toHaveBeenCalled();
    });

    it('31. native shareBlob write failure calls notifyError and rejects', async () => {
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockRejectedValue(new Error('Disk I/O error'));

      const errorNotifier = vi.fn();
      setFileOutputErrorNotifier(errorNotifier);

      await expect(shareBlob(new Blob(['data']), 'fail.pdf')).rejects.toThrow('Disk I/O error');
      expect(errorNotifier).toHaveBeenCalledTimes(1);
      expect(errorNotifier).toHaveBeenCalledWith('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.');
    });
  });

  describe('saveBlob offer hook', () => {
    it('32. saveBlob on web calls the offer notifier when supported, not when offerShare is false, and not on native', async () => {
      const offerNotifier = vi.fn();
      setFileShareOfferNotifier(offerNotifier);

      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          vi.spyOn(el, 'click').mockImplementation(() => {});
          vi.spyOn(el, 'remove').mockImplementation(() => {});
        }
        return el;
      });

      const blob = new Blob(['test']);

      // 1. Web, supported: calls offer notifier
      await saveBlob(blob, 'report.xlsx');
      expect(offerNotifier).toHaveBeenCalledTimes(1);
      expect(offerNotifier).toHaveBeenCalledWith({ blob, filename: 'report.xlsx' });

      // 2. Web, offerShare: false: does not call offer notifier
      offerNotifier.mockClear();
      await saveBlob(blob, 'report.xlsx', { offerShare: false });
      expect(offerNotifier).not.toHaveBeenCalled();

      // 3. Native: does not call offer notifier
      offerNotifier.mockClear();
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/report.xlsx',
      });
      await saveBlob(blob, 'report.xlsx');
      expect(offerNotifier).not.toHaveBeenCalled();
    });
  });

  describe('shareUrl', () => {
    it('33. shareUrl sends Authorization header for server URL and no header for data URL, and rejects on 404 response', async () => {
      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn().mockResolvedValue(undefined),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      environment.serverOrigin = 'https://app.farsalish.ir';
      localStorage.setItem('wh_access_token', 'test_auth_token_789');

      const mockPdfBlob = new Blob(['pdf data'], { type: 'application/pdf' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockPdfBlob),
      } as unknown as Response);

      // Server URL with Authorization header
      const res1 = await shareUrl('https://app.farsalish.ir/api/export/financial-summary.pdf');
      expect(res1).toBe('shared');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://app.farsalish.ir/api/export/financial-summary.pdf',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test_auth_token_789',
          }),
        })
      );

      // data: URL without headers
      fetchSpy.mockClear();
      const mockTextBlob = new Blob(['hello world'], { type: 'text/plain' });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockTextBlob),
      } as unknown as Response);

      const res2 = await shareUrl('data:text/plain;base64,aGVsbG8=', 'hello.txt');
      expect(res2).toBe('shared');
      expect(fetchSpy).toHaveBeenCalledWith('data:text/plain;base64,aGVsbG8=', {});

      // 404 response rejects and calls error notifier
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response);

      const errorNotifier = vi.fn();
      setFileOutputErrorNotifier(errorNotifier);

      await expect(shareUrl('/api/missing.pdf')).rejects.toThrow('Failed to download file: 404 Not Found');
      expect(errorNotifier).toHaveBeenCalledTimes(1);
      expect(errorNotifier).toHaveBeenCalledWith('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.');
    });
  });

  describe('FileOutputService share delegations', () => {
    it('34. FileOutputService delegates canShareFiles, shareBlob, shareUrl, and passes options to saveBlob', async () => {
      const service = new FileOutputService();

      // canShareFiles delegation
      (globalThis as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
      expect(service.canShareFiles()).toBe(true);

      // shareBlob delegation
      writeFileSpy.mockResolvedValue({
        uri: 'file:///documents/CoManage/service_share.pdf',
      });
      const blob = new Blob(['test']);
      const shareRes = await service.shareBlob(blob, 'service_share.pdf');
      expect(shareRes).toBe('shared');
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'CoManage/service_share.pdf',
        })
      );

      // shareUrl delegation
      const mockBlob = new Blob(['url data']);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response);

      const urlRes = await service.shareUrl('/media/file.pdf', 'file.pdf');
      expect(urlRes).toBe('shared');

      // saveBlob options passthrough
      delete (globalThis as any).Capacitor;
      const offerNotifier = vi.fn();
      setFileShareOfferNotifier(offerNotifier);
      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          vi.spyOn(el, 'click').mockImplementation(() => {});
          vi.spyOn(el, 'remove').mockImplementation(() => {});
        }
        return el;
      });

      await service.saveBlob(blob, 'test.pdf', { offerShare: false });
      expect(offerNotifier).not.toHaveBeenCalled();

      await service.saveBlob(blob, 'test.pdf', { offerShare: true });
      expect(offerNotifier).toHaveBeenCalledWith({ blob, filename: 'test.pdf' });
    });

    it('35. FileOutputService registers the offer notifier and a following web saveBlob with sharing supported calls it', async () => {
      const service = new FileOutputService();
      const offerNotifier = vi.fn();
      service.setShareOfferNotifier(offerNotifier);

      Object.defineProperty(globalThis.navigator, 'share', {
        value: vi.fn(),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis.navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
        writable: true,
      });

      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag.toLowerCase() === 'a') {
          vi.spyOn(el, 'click').mockImplementation(() => {});
          vi.spyOn(el, 'remove').mockImplementation(() => {});
        }
        return el;
      });

      const blob = new Blob(['offer test']);
      await saveBlob(blob, 'offer-service.pdf');
      expect(offerNotifier).toHaveBeenCalledTimes(1);
      expect(offerNotifier).toHaveBeenCalledWith({ blob, filename: 'offer-service.pdf' });

      service.setShareOfferNotifier(null);
      offerNotifier.mockClear();
      await saveBlob(blob, 'offer-service-cleared.pdf');
      expect(offerNotifier).not.toHaveBeenCalled();
    });
  });
});
