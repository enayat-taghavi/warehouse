import { resolveServerUrl } from './server-origin';

/**
 * Opens an external URL or popup window.
 * - On web: resolves relative server URLs via resolveServerUrl and delegates to window.open.
 * - On native mobile (phase B-2): delegates to system browser / InAppBrowser / AppLauncher plugin.
 */
export function openExternal(url: string, target: string = '_blank', features?: string): Window | null {
  const resolved = resolveServerUrl(url);

  // Native mobile branch (system browser / AppLauncher / InAppBrowser) goes here in phase B-2.

  if (typeof window === 'undefined') {
    return null;
  }

  if (features !== undefined) {
    return window.open(resolved, target, features);
  }
  return window.open(resolved, target);
}
