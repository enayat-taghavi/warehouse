// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CHAT_THUMB_CACHE_MAX, getChatThumb, putChatThumb } from './chat-thumb-cache';

/** Cache Storage ساده در حافظه (jsdom خودش caches ندارد) */
function installFakeCaches() {
  const store = new Map<string, Blob>();
  const cache = {
    put: vi.fn(async (key: string, res: Response) => { store.set(key, await res.blob()); }),
    match: vi.fn(async (key: string) => (store.has(key) ? new Response(store.get(key)!) : undefined)),
    delete: vi.fn(async (key: string) => store.delete(key)),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  return { store, cache };
}

describe('chat-thumb-cache', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is a no-op without Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(putChatThumb(1, 'a1', new Blob(['x']))).resolves.toBeUndefined();
    expect(await getChatThumb(1, 'a1')).toBeNull();
  });

  it('returns a stored thumbnail only for the same user', async () => {
    installFakeCaches();
    await putChatThumb(1, 'a1', new Blob(['x'], { type: 'image/webp' }));
    expect(await getChatThumb(1, 'a1')).not.toBeNull();
    expect(await getChatThumb(2, 'a1')).toBeNull();
    expect(await getChatThumb(1, 'zzz')).toBeNull();
  });

  it('evicts only the oldest inserted entry when over the cap', async () => {
    const { store } = installFakeCaches();
    for (let i = 0; i < CHAT_THUMB_CACHE_MAX + 1; i++) {
      await putChatThumb(1, `a${i}`, new Blob(['x']));
    }
    expect(store.size).toBe(CHAT_THUMB_CACHE_MAX);
    expect(await getChatThumb(1, 'a0')).toBeNull();
    expect(await getChatThumb(1, `a${CHAT_THUMB_CACHE_MAX}`)).not.toBeNull();
  });
});
