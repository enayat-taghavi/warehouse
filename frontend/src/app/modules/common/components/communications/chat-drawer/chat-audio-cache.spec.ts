// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CHAT_AUDIO_CACHE_MAX, getChatAudio, putChatAudio, hasChatAudio } from './chat-audio-cache';

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

describe('chat-audio-cache', () => {
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
    await expect(putChatAudio(1, 'att1', new Blob(['audio-data']))).resolves.toBeUndefined();
    expect(await getChatAudio(1, 'att1')).toBeNull();
    expect(await hasChatAudio(1, 'att1')).toBe(false);
  });

  it('returns a stored audio blob only for the same user', async () => {
    installFakeCaches();
    await putChatAudio(1, 'att1', new Blob(['audio-data'], { type: 'audio/webm' }));
    expect(await hasChatAudio(1, 'att1')).toBe(true);
    expect(await getChatAudio(1, 'att1')).not.toBeNull();
    expect(await getChatAudio(2, 'att1')).toBeNull();
    expect(await hasChatAudio(2, 'att1')).toBe(false);
    expect(await getChatAudio(1, 'unknown')).toBeNull();
  });

  it('evicts only the oldest inserted entry when over the cap', async () => {
    const { store } = installFakeCaches();
    for (let i = 0; i < CHAT_AUDIO_CACHE_MAX + 1; i++) {
      await putChatAudio(1, `att_${i}`, new Blob(['audio-data']));
    }
    expect(store.size).toBe(CHAT_AUDIO_CACHE_MAX);
    expect(await getChatAudio(1, 'att_0')).toBeNull();
    expect(await getChatAudio(1, `att_${CHAT_AUDIO_CACHE_MAX}`)).not.toBeNull();
  });
});
