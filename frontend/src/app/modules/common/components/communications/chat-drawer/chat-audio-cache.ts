/**
 * کش پیام‌های صوتی چت در Cache Storage برای گوش دادن کاملاً آفلاین در انبار و اندروید (ق۳).
 * - کلید شامل شناسهٔ کاربر است تا حریم خصوصی کاربران همان دستگاه حفظ شود.
 * - پیام‌های صوتی حجم کمی دارند (Opus 32kbps، حدود ۲۰ تا ۱۰۰ کیلوبایت) و در کش محلی ذخیره می‌شوند.
 * - سقف کش: ۲۰۰ فایل صوتی (CHAT_AUDIO_CACHE_MAX). قدیمی‌ترین فایل با گذر از سقف پاک می‌شود (FIFO).
 * - در مرورگرها یا محیط‌های بدون `caches` (مانند jsdom) به صورت ایمن و بدون خطا (no-op) عمل می‌کند.
 */
export const CHAT_AUDIO_CACHE_NAME = 'chat-audio-v1';
export const CHAT_AUDIO_CACHE_MAX = 200;
const INDEX_KEY = 'chat_audio_cache_index_v1';

interface IndexEntry { k: string; t: number }

function cacheApi(): CacheStorage | null {
  try {
    return typeof caches !== 'undefined' && caches ? caches : null;
  } catch {
    return null;
  }
}

/** نشانی یکتای کش محلی برای هر کاربر و پیوست صوتی (درخواست شبکه نمی‌شود) */
function cacheKey(userId: number | string, attachmentId: string): string {
  return `/__chat-audio__/${encodeURIComponent(String(userId))}/${encodeURIComponent(attachmentId)}`;
}

function readIndex(): IndexEntry[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(INDEX_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.k === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(index: IndexEntry[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch { /* فهرست اختیاری است */ }
}

/** ذخیرهٔ فایل صوتی در Cache Storage */
export async function putChatAudio(
  userId: number | string | null | undefined,
  attachmentId: string,
  blob: Blob,
): Promise<void> {
  const store = cacheApi();
  if (!store || userId === null || userId === undefined || !attachmentId) return;
  try {
    const cache = await store.open(CHAT_AUDIO_CACHE_NAME);
    const key = cacheKey(userId, attachmentId);
    await cache.put(
      key,
      new Response(blob, {
        headers: { 'Content-Type': blob.type || 'audio/webm' },
      }),
    );
    const index = readIndex().filter((e) => e.k !== key);
    index.push({ k: key, t: Date.now() });
    while (index.length > CHAT_AUDIO_CACHE_MAX) {
      const oldest = index.shift();
      if (oldest) await cache.delete(oldest.k);
    }
    writeIndex(index);
  } catch { /* خطا در کش نباید مانع کار شود */ }
}

/** خواندن فایل صوتی کش‌شده؛ در صورت نبودن یا خطا = null */
export async function getChatAudio(
  userId: number | string | null | undefined,
  attachmentId: string,
): Promise<Blob | null> {
  const store = cacheApi();
  if (!store || userId === null || userId === undefined || !attachmentId) return null;
  try {
    const cache = await store.open(CHAT_AUDIO_CACHE_NAME);
    const hit = await cache.match(cacheKey(userId, attachmentId));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

/** بررسی موجود بودن فایل صوتی در کش بدون خواندن کامل Blob */
export async function hasChatAudio(
  userId: number | string | null | undefined,
  attachmentId: string,
): Promise<boolean> {
  const store = cacheApi();
  if (!store || userId === null || userId === undefined || !attachmentId) return false;
  try {
    const cache = await store.open(CHAT_AUDIO_CACHE_NAME);
    const hit = await cache.match(cacheKey(userId, attachmentId));
    return Boolean(hit);
  } catch {
    return false;
  }
}
