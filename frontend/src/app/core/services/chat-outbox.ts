import Dexie, { Table } from 'dexie';

/**
 * صندوق خروجی چت: پیام‌های ارسال‌نشده (در انتظار یا ناموفق) و فایل‌هایشان در IndexedDB تا با بارگذاری دوباره
 * یا بستن برنامه گم نشوند. دیتابیس جداست تا طرح دیتابیس آفلاین اصلی دست نخورد.
 * ردیف فقط پس از پذیرش سرور (2xx پیام و همهٔ فایل‌ها) یا کنار گذاشتن عمدی کاربر پاک می‌شود.
 */
export interface ChatOutboxFile {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

export interface ChatOutboxRow {
  /** client_temp_id پیام */
  tempId: string;
  userId: number;
  conversation: string;
  /** آخرین نسخهٔ پیام برای نمایش حباب (بدون فایل) */
  message: Record<string, unknown>;
  files: ChatOutboxFile[];
  /** چند فایل اول که آپلودشان با 2xx تأیید شده است */
  uploadedCount: number;
  /** ارسال خودکار پس از برگشت اتصال (برای رد قطعی سرور یا لغو کاربر false است) */
  autoRetry: boolean;
  createdAt: string;
}

class ChatOutboxDatabase extends Dexie {
  outbox!: Table<ChatOutboxRow, string>;

  constructor() {
    super('ChatOutboxDB');
    this.version(1).stores({ outbox: 'tempId, userId, createdAt' });
  }
}

let chatOutboxDb: ChatOutboxDatabase | null = null;

function getChatOutboxDb(): ChatOutboxDatabase | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!chatOutboxDb) chatOutboxDb = new ChatOutboxDatabase();
  return chatOutboxDb;
}

export function toOutboxFiles(files: File[]): ChatOutboxFile[] {
  return files.map(f => ({ blob: f, name: f.name, type: f.type, lastModified: f.lastModified }));
}

export function fromOutboxFiles(files: ChatOutboxFile[]): File[] {
  return (files || []).map(f => new File([f.blob], f.name, { type: f.type, lastModified: f.lastModified }));
}

/** ذخیرهٔ کامل ردیف (با فایل‌ها)؛ خطای IndexedDB به فراخوان می‌رسد */
export async function putChatOutbox(row: ChatOutboxRow): Promise<boolean> {
  const db = getChatOutboxDb();
  if (!db) return false;
  await db.outbox.put(row);
  return true;
}

/** به‌روزرسانی بخشی از ردیف بدون بازنویسی فایل‌ها؛ تعداد ردیف تغییرکرده (۰ یعنی ردیف نیست) */
export async function updateChatOutbox(tempId: string, changes: Partial<Omit<ChatOutboxRow, 'tempId' | 'files'>>): Promise<number> {
  const db = getChatOutboxDb();
  if (!db) return 1;
  return db.outbox.update(tempId, changes);
}

export async function deleteChatOutbox(tempId: string): Promise<void> {
  const db = getChatOutboxDb();
  if (!db) return;
  await db.outbox.delete(tempId);
}

/** ردیف‌های یک کاربر، قدیمی‌ترین اول؛ ردیف‌های کاربران دیگر هرگز برگردانده نمی‌شوند */
export async function listChatOutbox(userId: number): Promise<ChatOutboxRow[]> {
  const db = getChatOutboxDb();
  if (!db) return [];
  const rows = await db.outbox.where('userId').equals(userId).toArray();
  return rows.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function countChatOutbox(userId: number): Promise<number> {
  const db = getChatOutboxDb();
  if (!db) return 0;
  return db.outbox.where('userId').equals(userId).count();
}

/** پاک کردن ردیف‌های یک کاربر؛ فقط پس از تأیید خروج او */
export async function deleteChatOutboxForUser(userId: number): Promise<void> {
  const db = getChatOutboxDb();
  if (!db) return;
  await db.outbox.where('userId').equals(userId).delete();
}
