import { Injectable } from '@angular/core';
import { resolveServerUrl } from './server-origin';

/**
 * Downloads/saves a Blob as a file with the specified filename.
 * Web implementation creates an object URL, clicks an anchor element, and revokes the URL after 1000ms.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  // Native branch (Filesystem + Share) will be added in step ب-۲
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
 */
export async function saveUrl(url: string, filename?: string): Promise<void> {
  // Native branch (Filesystem + Share) will be added in step ب-۲
  const resolved = resolveServerUrl(url);
  const a = document.createElement('a');
  a.href = resolved;
  a.download = filename ?? '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Prints the target window (or the current window by default).
 */
export function printWindow(target?: Window | null): void {
  // Native branch (Printer plugin) will be added in step ب-۲
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

  print(target?: Window | null): void {
    printWindow(target);
  }
}
