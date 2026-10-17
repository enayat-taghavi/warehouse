import { environment } from '../../../environments/environment';
import { isNativePlatform } from './platform';

export const SERVER_ORIGIN_STORAGE_KEY = 'wh_server_origin';

const SERVER_ORIGIN_REGEX = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Checks whether an origin string is a valid HTTPS server origin without path or trailing slash.
 */
export function isValidServerOrigin(origin: string): boolean {
  if (!origin || typeof origin !== 'string') {
    return false;
  }
  return SERVER_ORIGIN_REGEX.test(origin);
}

function getStoredOrigin(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(SERVER_ORIGIN_STORAGE_KEY);
    }
  } catch {
    // localStorage not accessible
  }
  return null;
}

/**
 * Resolves the active server origin:
 * - On web (non-native): always empty string `''`.
 * - On native mobile: stored override if valid, else environment.serverOrigin (without trailing slash) if valid, else `''`.
 */
export function getServerOrigin(): string {
  if (!isNativePlatform()) {
    return '';
  }

  const stored = getStoredOrigin();
  if (stored && isValidServerOrigin(stored)) {
    return stored;
  }

  const envOrigin = (environment.serverOrigin || '').replace(/\/+$/, '');
  if (isValidServerOrigin(envOrigin)) {
    return envOrigin;
  }

  return '';
}

/**
 * Sets a server origin override in localStorage.
 * Only permitted in native platform mode with a valid origin.
 */
export function setServerOriginOverride(origin: string): boolean {
  if (!isNativePlatform() || !isValidServerOrigin(origin)) {
    return false;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SERVER_ORIGIN_STORAGE_KEY, origin);
      return true;
    }
  } catch {
    // storage write failed
  }

  return false;
}

function isServerPath(url: string): boolean {
  return url.startsWith('/api/') || url === '/api' || url.startsWith('/api?') || url.startsWith('/media/');
}

function isAbsoluteUrl(url: string): boolean {
  return /^(https?:|blob:|data:|wss?:)/i.test(url);
}

/**
 * Prepends the server origin to relative server paths (/api, /media) in native mobile mode.
 * Returns url unchanged if:
 * - origin is empty
 * - url is not a server path
 * - url is already an absolute URL (http:, https:, blob:, data:, ws:, wss:)
 */
export function resolveServerUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url;
  }

  const origin = getServerOrigin();
  if (!origin) {
    return url;
  }

  if (isAbsoluteUrl(url)) {
    return url;
  }

  if (!isServerPath(url)) {
    return url;
  }

  return `${origin}${url}`;
}

/**
 * Generates the full WebSocket URL:
 * - When server origin is empty: exactly `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`
 * - Otherwise: server origin with https: replaced by wss: (and http: by ws:) + path.
 */
export function wsUrl(path: string): string {
  const origin = getServerOrigin();
  if (!origin) {
    const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof location !== 'undefined' ? location.host : 'localhost';
    return `${protocol}//${host}${path}`;
  }

  const wsOrigin = origin.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  return `${wsOrigin}${path}`;
}

/**
 * Returns the active server origin when not empty, otherwise window.location.origin.
 */
export function publicOrigin(): string {
  const origin = getServerOrigin();
  if (origin) {
    return origin;
  }
  return typeof window !== 'undefined' && window.location ? window.location.origin : '';
}
