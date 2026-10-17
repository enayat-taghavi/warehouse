import { Injectable } from '@angular/core';
import { resolveServerUrl } from './server-origin';
import { isNativePlatform } from './platform';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Printer } from '@capgo/capacitor-printer';

export interface FileOutputNativeBridge {
  writeFile(options: { path: string; data: string; directory: Directory; recursive?: boolean }): Promise<{ uri: string }>;
  share(options: { title?: string; text?: string; url?: string }): Promise<any>;
  printHtml(options: { html: string }): Promise<any>;
}

export const fileOutputNativeBridge: FileOutputNativeBridge = {
  writeFile: (opts) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.Filesystem ?? Filesystem;
    return plugin.writeFile(opts);
  },
  share: (opts) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.Share ?? Share;
    return plugin.share(opts);
  },
  printHtml: (opts) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.Printer ?? Printer;
    return plugin.printHtml(opts);
  },
};

let fileOutputErrorNotifier: ((message: string) => void) | null = null;

export function setFileOutputErrorNotifier(fn: ((message: string) => void) | null): void {
  fileOutputErrorNotifier = fn;
}

const notifiedErrors = new WeakSet<object>();

function notifyError(message: string, err?: unknown): void {
  if (err && typeof err === 'object') {
    if (notifiedErrors.has(err)) {
      return;
    }
    notifiedErrors.add(err);
  }
  fileOutputErrorNotifier?.(message);
}

function isCancelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.toLowerCase().includes('cancel');
}

/**
 * Converts a Blob to a base64-encoded string (without data URL prefix).
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res ? res.substring(res.indexOf(',') + 1) : '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads/saves a Blob as a file with the specified filename.
 * - On web: creates an object URL, clicks an anchor element, and revokes the URL after 1000ms.
 * - On native: writes the blob as base64 with Filesystem.writeFile to Directory.Documents under CoManage/<filename> (recursive: true),
 *   falling back to Directory.Data if the first write fails,
 *   then invokes Share.share({ title: filename, url: fileUri }).
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);
      const filePath = `CoManage/${filename}`;
      let writeResult: { uri: string };
      try {
        writeResult = await fileOutputNativeBridge.writeFile({
          path: filePath,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        writeResult = await fileOutputNativeBridge.writeFile({
          path: filePath,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
        });
      }

      try {
        await fileOutputNativeBridge.share({
          title: filename,
          url: writeResult.uri,
        });
      } catch (shareErr) {
        if (isCancelError(shareErr)) {
          return;
        }
        throw shareErr;
      }
    } catch (err) {
      notifyError('ذخیره یا اشتراک فایل روی گوشی انجام نشد. دوباره تلاش کنید.', err);
      throw err;
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Downloads/saves a file from a URL.
 * Resolves server paths via resolveServerUrl before triggering download.
 * - On web: triggers anchor download.
 * - On native: downloads the resolved URL with fetch using the Authorization header,
 *   then forwards the downloaded blob to saveBlob.
 */
export async function saveUrl(url: string, filename?: string): Promise<void> {
  const resolved = resolveServerUrl(url);

  if (isNativePlatform()) {
    try {
      const headers: Record<string, string> = {};
      const token =
        (typeof sessionStorage !== 'undefined' && (
          sessionStorage.getItem('wh_access_token_warehouse') ||
          sessionStorage.getItem('wh_access_token_finance') ||
          sessionStorage.getItem('wh_access_token')
        )) ||
        (typeof localStorage !== 'undefined' && (
          localStorage.getItem('wh_access_token_warehouse') ||
          localStorage.getItem('wh_access_token_finance') ||
          localStorage.getItem('wh_access_token')
        ));

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(resolved, { headers });
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const effectiveFilename = filename || url.split('/').pop()?.split('?')[0] || 'download';
      return await saveBlob(blob, effectiveFilename);
    } catch (err) {
      notifyError('ذخیره یا اشتراک فایل روی گوشی انجام نشد. دوباره تلاش کنید.', err);
      throw err;
    }
  }

  const a = document.createElement('a');
  a.href = resolved;
  a.download = filename ?? '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Prints the target window (or the current window by default).
 * - On web: calls target.print() (or window.print()).
 * - On native: prints the HTML of the target document via Printer.printHtml.
 */
export async function printWindow(target?: Window | null): Promise<void> {
  if (isNativePlatform()) {
    try {
      const doc = (target ?? (typeof window !== 'undefined' ? window : null))?.document;
      const html = doc?.documentElement?.outerHTML || '';
      await fileOutputNativeBridge.printHtml({ html });
      return;
    } catch (err) {
      notifyError('چاپ روی گوشی انجام نشد. دوباره تلاش کنید.', err);
      throw err;
    }
  }
  (target ?? window).print();
}

@Injectable({ providedIn: 'root' })
export class FileOutputService {
  saveBlob(blob: Blob, filename: string): Promise<void> {
    return saveBlob(blob, filename);
  }

  saveUrl(url: string, filename?: string): Promise<void> {
    return saveUrl(url, filename);
  }

  print(target?: Window | null): Promise<void> | void {
    return printWindow(target);
  }
}
