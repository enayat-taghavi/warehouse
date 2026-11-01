import { Injectable } from '@angular/core';
import { resolveServerUrl } from './server-origin';
import { isNativePlatform } from './platform';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Printer } from '@capgo/capacitor-printer';

export interface SaveOptions {
  offerShare?: boolean;
}

export interface ShareOffer {
  blob: Blob;
  filename: string;
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded' | 'offered';

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
let fileShareOfferNotifier: ((offer: ShareOffer) => void) | null = null;
let fileOutputInfoNotifier: ((message: string) => void) | null = null;

export function setFileOutputErrorNotifier(fn: ((message: string) => void) | null): void {
  fileOutputErrorNotifier = fn;
}

export function setFileShareOfferNotifier(fn: ((offer: ShareOffer) => void) | null): void {
  fileShareOfferNotifier = fn;
}

export function setFileOutputInfoNotifier(fn: ((message: string) => void) | null): void {
  fileOutputInfoNotifier = fn;
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

function mimeFromFilename(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'csv':
      return 'text/csv';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    case 'zip':
      return 'application/zip';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
}

function toShareFile(blob: Blob, filename: string): File {
  const type = blob.type && blob.type.length > 0 ? blob.type : mimeFromFilename(filename);
  return new File([blob], filename, { type });
}

export function canShareFiles(): boolean {
  if (isNativePlatform()) {
    return true;
  }
  try {
    if (typeof navigator === 'undefined') {
      return false;
    }
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      return false;
    }
    return navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }) === true;
  } catch {
    return false;
  }
}

async function writeNativeFile(blob: Blob, filename: string): Promise<{ uri: string; usedFallback: boolean }> {
  const base64Data = await blobToBase64(blob);
  const filePath = `CoManage/${filename}`;
  let writeResult: { uri: string };
  let usedFallback = false;
  try {
    writeResult = await fileOutputNativeBridge.writeFile({
      path: filePath,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch {
    usedFallback = true;
    writeResult = await fileOutputNativeBridge.writeFile({
      path: filePath,
      data: base64Data,
      directory: Directory.Data,
      recursive: true,
    });
  }
  return { uri: writeResult.uri, usedFallback };
}

function authHeaders(): Record<string, string> {
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
  return headers;
}

/**
 * Downloads/saves a Blob as a file with the specified filename.
 * - On web: creates an object URL, clicks an anchor element, and revokes the URL after 1000ms.
 *   If offerShare !== false and sharing is supported and an offer notifier is set, offers share.
 * - On native: writes the blob as base64 with Filesystem.writeFile to Directory.Documents under CoManage/<filename> (recursive: true),
 *   falling back to Directory.Data if the first write fails,
 *   then invokes Share.share({ title: filename, url: fileUri }).
 */
export async function saveBlob(blob: Blob, filename: string, options?: SaveOptions): Promise<void> {
  if (isNativePlatform()) {
    try {
      const { uri, usedFallback } = await writeNativeFile(blob, filename);

      try {
        await fileOutputNativeBridge.share({
          title: filename,
          url: uri,
        });
      } catch (shareErr) {
        if (isCancelError(shareErr)) {
          if (usedFallback) {
            throw shareErr;
          }
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

  if (options?.offerShare !== false && canShareFiles() && fileShareOfferNotifier) {
    fileShareOfferNotifier({ blob, filename });
  }
}

/**
 * Shares a Blob directly or falls back to download.
 * - On native: writes file to storage, then opens native share sheet.
 * - On web: checks canShareFiles & canShare({ files: [file] }), calls navigator.share({ files: [file], title }).
 *   Handles AbortError (cancelled), NotAllowedError (offers share or falls back),
 *   or falls back to saveBlob({ offerShare: false }) with an info notification.
 */
export async function shareBlob(blob: Blob, filename: string): Promise<ShareResult> {
  if (isNativePlatform()) {
    try {
      const { uri } = await writeNativeFile(blob, filename);
      try {
        await fileOutputNativeBridge.share({
          title: filename,
          url: uri,
        });
        return 'shared';
      } catch (shareErr) {
        if (isCancelError(shareErr)) {
          return 'cancelled';
        }
        throw shareErr;
      }
    } catch (err) {
      notifyError('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.', err);
      throw err;
    }
  }

  const file = toShareFile(blob, filename);
  let canShareThis = false;
  try {
    canShareThis = canShareFiles() && (navigator?.canShare?.({ files: [file] }) === true);
  } catch {
    canShareThis = false;
  }

  if (canShareThis) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'cancelled';
      }
      if (err?.name === 'NotAllowedError') {
        if (fileShareOfferNotifier) {
          fileShareOfferNotifier({ blob, filename });
          return 'offered';
        }
        // Fall through to download fallback below
      } else {
        notifyError('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.', err);
        throw err;
      }
    }
  }

  await saveBlob(blob, filename, { offerShare: false });
  fileOutputInfoNotifier?.('مرورگر شما اشتراک‌گذاری این فایل را پشتیبانی نمی‌کند؛ فایل دانلود شد.');
  return 'downloaded';
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
      const headers = authHeaders();

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
 * Downloads a file from a URL and shares it via shareBlob.
 * Resolves server paths via resolveServerUrl.
 * - For data: and blob: URLs fetches without headers.
 * - For server URLs fetches with Authorization header.
 */
export async function shareUrl(url: string, filename?: string): Promise<ShareResult> {
  const resolved = resolveServerUrl(url);
  let blob: Blob;
  try {
    const isDataOrBlob = resolved.startsWith('data:') || resolved.startsWith('blob:');
    const response = await fetch(resolved, isDataOrBlob ? {} : { headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }
    blob = await response.blob();
  } catch (err) {
    notifyError('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.', err);
    throw err;
  }

  const effectiveFilename = filename || url.split('/').pop()?.split('?')[0] || 'file';
  return shareBlob(blob, effectiveFilename);
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
  saveBlob(blob: Blob, filename: string, options?: SaveOptions): Promise<void> {
    return saveBlob(blob, filename, options);
  }

  saveUrl(url: string, filename?: string): Promise<void> {
    return saveUrl(url, filename);
  }

  canShareFiles(): boolean {
    return canShareFiles();
  }

  shareBlob(blob: Blob, filename: string): Promise<ShareResult> {
    return shareBlob(blob, filename);
  }

  shareUrl(url: string, filename?: string): Promise<ShareResult> {
    return shareUrl(url, filename);
  }

  print(target?: Window | null): Promise<void> | void {
    return printWindow(target);
  }
}
