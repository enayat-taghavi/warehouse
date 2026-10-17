import { resolveServerUrl } from './server-origin';
import { isNativePlatform } from './platform';
import { Browser } from '@capacitor/browser';

export interface ExternalLinkNativeBridge {
  open(options: { url: string }): Promise<void>;
}

export const externalLinkNativeBridge: ExternalLinkNativeBridge = {
  open: (opts) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.Browser ?? Browser;
    return plugin.open(opts);
  },
};

/**
 * Opens an external URL or popup window.
 * - On web: resolves relative server URLs via resolveServerUrl and delegates to window.open.
 * - On native mobile (phase B-2): delegates to Browser plugin; popups to about:blank are not supported and return null.
 */
export function openExternal(url: string, target: string = '_blank', features?: string): Window | null {
  if (isNativePlatform()) {
    if (url === 'about:blank') {
      return null;
    }
    const resolved = resolveServerUrl(url);
    externalLinkNativeBridge.open({ url: resolved }).catch((err) => {
      console.warn('[ExternalLink] Failed to open URL via Browser plugin:', err);
    });
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(resolved, target);
    }
    return null;
  }

  const resolved = resolveServerUrl(url);

  if (typeof window === 'undefined') {
    return null;
  }

  if (features !== undefined) {
    return window.open(resolved, target, features);
  }
  return window.open(resolved, target);
}
