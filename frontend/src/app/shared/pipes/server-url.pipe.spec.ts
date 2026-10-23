// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServerUrlPipe } from './server-url.pipe';
import { SERVER_ORIGIN_STORAGE_KEY } from '../../core/platform/server-origin';
import { environment } from '../../../environments/environment';

describe('ServerUrlPipe', () => {
  let pipe: ServerUrlPipe;
  const originalServerOrigin = environment.serverOrigin;

  beforeEach(() => {
    pipe = new ServerUrlPipe();
    delete (globalThis as any).Capacitor;
    try {
      localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
      localStorage.clear();
    } catch {}
    environment.serverOrigin = '';
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
    try {
      localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
      localStorage.clear();
    } catch {}
    environment.serverOrigin = originalServerOrigin;
  });

  it('1. should return relative URLs unchanged on web', () => {
    expect(pipe.transform('/media/photos/avatar.png')).toBe('/media/photos/avatar.png');
    expect(pipe.transform('/api/v1/data')).toBe('/api/v1/data');
  });

  it('2. should prefix /media/ paths with server origin on native mobile', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    environment.serverOrigin = 'https://app.farsalish.ir';
    expect(pipe.transform('/media/photos/avatar.png')).toBe('https://app.farsalish.ir/media/photos/avatar.png');
  });

  it('3. should pass through null and undefined unchanged', () => {
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeUndefined();
    expect(pipe.transform('')).toBe('');
  });

  it('4. should leave blob: and absolute URLs untouched on native mobile', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    environment.serverOrigin = 'https://app.farsalish.ir';
    expect(pipe.transform('blob:https://app.farsalish.ir/123-abc')).toBe('blob:https://app.farsalish.ir/123-abc');
    expect(pipe.transform('https://cdn.example.com/image.jpg')).toBe('https://cdn.example.com/image.jpg');
    expect(pipe.transform('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});
