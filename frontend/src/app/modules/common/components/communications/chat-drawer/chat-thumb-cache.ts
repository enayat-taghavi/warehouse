/**
 * کش بندانگشتی پیوست‌های چت در Cache Storage تا پیام‌های دیده‌شده آفلاین هم عکس داشته باشند (ق۳).
 * - کلید شامل شناسهٔ کاربر است تا کاربر دیگرِ همان دستگاه هرگز آن را نخواند.
 * - فقط بندانگشتی؛ فایل کامل اینجا نمی‌آید.
 * - هیچ ردیفی بر اساس عمر یا انقضا پاک نمی‌شود؛ فقط وقتی تعداد از سقف گذشت، قدیمی‌ترین ردیفِ واردشده کنار می‌رود.
 * - بدون `caches` (jsdom، مرورگر قدیمی) هیچ کاری نمی‌کند.
 */
export const CHAT_THUMB_CACHE_NAME = 'chat-thumbs-v1';
export const CHAT_THUMB_CACHE_MAX = 300;
const INDEX_KEY = 'chat_thumb_cache_index_v1';

interface IndexEntry { k: string; t: number }

function cacheApi(): CacheStorage | null {
  try {
    return typeof caches !== 'undefined' && caches ? caches : null;
  } catch {
    return null;
  }
}

/** نشانی ساختگی و یکتا برای هر کاربر و پیوست (فقط کلید کش است، درخواست شبکه نمی‌شود) */
function cacheKey(userId: number | string, attachmentId: string): string {
  return `/__chat-thumb__/${encodeURIComponent(String(userId))}/${encodeURIComponent(attachmentId)}`;
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

/** ذخیرهٔ بندانگشتی دریافت‌شده؛ شکست در ذخیره هرگز نمایش را خراب نمی‌کند */
export async function putChatThumb(userId: number | string | null | undefined, attachmentId: string, blob: Blob): Promise<void> {
  const store = cacheApi();
  if (!store || userId === null || userId === undefined || !attachmentId) return;
  try {
    const cache = await store.open(CHAT_THUMB_CACHE_NAME);
    const key = cacheKey(userId, attachmentId);
    await cache.put(key, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/webp' } }));
    const index = readIndex().filter((e) => e.k !== key);
    index.push({ k: key, t: Date.now() });
    while (index.length > CHAT_THUMB_CACHE_MAX) {
      const oldest = index.shift();
      if (oldest) await cache.delete(oldest.k);
    }
    writeIndex(index);
  } catch { /* کش اختیاری است */ }
}

/** خواندن بندانگشتی کش‌شده؛ نبودن یا خطا = null */
export async function getChatThumb(userId: number | string | null | undefined, attachmentId: string): Promise<Blob | null> {
  const store = cacheApi();
  if (!store || userId === null || userId === undefined || !attachmentId) return null;
  try {
    const cache = await store.open(CHAT_THUMB_CACHE_NAME);
    const hit = await cache.match(cacheKey(userId, attachmentId));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}
