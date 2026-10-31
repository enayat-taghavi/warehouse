import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient, HttpParams, HttpContext, HttpEvent, HttpEventType } from '@angular/common/http';
import { BehaviorSubject, Subject, Observable, firstValueFrom } from 'rxjs';
import { ImageCompressorService } from './image-compressor.service';
import { ConfigApiService } from '../api/config-api.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { wsUrl } from '../platform/server-origin';
import { isServerUnreachable } from './server-reachability';

/** لغو آپلود به دست کاربر */
export class UploadCancelledError extends Error {
  constructor() { super('attachment upload cancelled'); this.name = 'UploadCancelledError'; }
}

export interface UserShort {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
}

export interface MessageAttachment {
  id?: string;
  file?: string;
  file_name: string;
  file_size: number;
  content_type: string;
  /** مسیر دانلود که در هر درخواست عضویت را می‌سنجد (E27)؛ با توکن خوانده می‌شود */
  download_url?: string;
  thumbnail_url?: string | null;
  /** ابعاد عکس یا صفحهٔ اول PDF (برای جای درست حباب پیش از بارگذاری) */
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
  duration?: number | null;
  preview_status?: 'pending' | 'ready' | 'none' | 'failed';
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  client_temp_id?: string;
  conversation: string;
  sender: number;
  sender_details?: UserShort;
  text?: string;
  reply_to?: string | null;
  /** null، یا پیام اصلی حذف‌شده، یا خلاصهٔ پیام اصلی */
  reply_to_details?: { id: string | number; deleted: true } | { id: string | number; deleted: false; text: string; sender_name: string; has_attachment: boolean } | null;
  edited_at?: string | null;
  /** فرستنده تا این زمان می‌تواند متن را ویرایش کند */
  editable_until?: string | null;
  is_system?: boolean;
  created_at: string;
  updated_at?: string;
  attachments?: MessageAttachment[];
  is_me?: boolean;
  read_by_count?: number;
  is_pending?: boolean; // برای Optimistic UI
  delivery_status?: 'pending' | 'sent' | 'failed';
  /** نام فایلی که هنوز آپلود نشده (فقط سمت کاربر) */
  pending_file_name?: string;
  /** متن رد قطعی سرور برای پیام ناموفق (فقط سمت کاربر) */
  failure_reason?: string;
  /** پیشرفت آپلود فایل جاری، ۰ تا ۱۰۰ (فقط سمت کاربر) */
  upload_progress?: number | null;
  /** شمارهٔ فایل جاری (از ۱) و تعداد کل فایل‌های این پیام (فقط سمت کاربر) */
  upload_index?: number;
  upload_total?: number;
}

export interface Conversation {
  id: string;
  title?: string;
  conv_type: 'direct' | 'group' | 'announcement';
  warehouse?: number;
  participants: number[];
  participants_details?: UserShort[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_message?: {
    id: string;
    text: string;
    sender_name: string;
    created_at: string;
    has_attachment: boolean;
  };
  unread_count?: number;
  my_role?: 'owner' | 'admin' | 'member' | null;
  member_count?: number;
  is_muted?: boolean;
  /** false = فقط مدیران می‌توانند پیام بفرستند (کانال اعلان) */
  can_post?: boolean;
}

export interface ReadStatusMember {
  user_id: number;
  name: string;
  last_read_message_id: string | null;
  last_read_at: string | null;
}

export interface ReadStatus {
  conversation_id: string;
  read_count: number;
  members: ReadStatusMember[];
}

export interface ConversationMember {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  role: 'owner' | 'admin' | 'member';
  joined_at?: string;
}

export interface MembershipEvent {
  type: 'removed' | 'updated';
  conversationId: string;
}

export interface GenericComment {
  id: string;
  client_temp_id?: string;
  content_type_str?: string;
  object_id: string;
  warehouse?: number;
  author: number;
  author_details?: UserShort;
  parent?: string;
  text: string;
  mentioned_users?: number[];
  mentioned_users_details?: UserShort[];
  attachment?: string;
  replies_count?: number;
  created_at: string;
  is_pending?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CommunicationService implements OnDestroy {
  private http = inject(HttpClient);
  private imageCompressor = inject(ImageCompressorService);
  private configApi = inject(ConfigApiService);

  private chatWs: WebSocket | null = null;
  private commentWs: WebSocket | null = null;

  // وضعیت‌ها و سیگنال‌ها
  public isChatDrawerOpen = signal<boolean>(false);
  public isMuted = signal<boolean>(typeof localStorage !== 'undefined' ? localStorage.getItem('wh_chat_muted') === 'true' : false);
  public isChatEnabled = signal<boolean>(true);
  public totalUnreadCount = signal<number>(0);
  public hasNewIncomingPulse = signal<boolean>(false);
  public onlineUsers = signal<Set<number>>(new Set<number>());

  public conversations$ = new BehaviorSubject<Conversation[]>([]);
  public activeConversation$ = new BehaviorSubject<Conversation | null>(null);
  public activeMessages$ = new BehaviorSubject<ChatMessage[]>([]);
  public totalUnreadCount$ = new BehaviorSubject<number>(0);

  // رویدادهای زنده
  public incomingMessage$ = new Subject<ChatMessage>();
  public incomingComment$ = new Subject<GenericComment>();
  public typingUser$ = new Subject<{ conversation_id: string; username: string; is_typing: boolean }>();
  /** رویدادهای عضویت گروه (حذف شدن از گفتگو یا تغییر آن) برای واکنش رابط کاربری */
  public membershipEvents$ = new Subject<MembershipEvent>();

  private pingInterval: any = null;
  private isDestroyed = false;

  // مدیریت اتصال و Reconnect هوشمند
  private currentWarehouseId: number | undefined = undefined;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private lastPongTime = Date.now();
  private activeCommentSubscriptions = new Set<string>();
  private playedMessageIds = new Set<string>();
  private processedIncomingMessageIds = new Set<string>();
  private markReadDebounceTimers = new Map<string, any>();

  /** فایل‌های پیوست هر پیام ارسالی (کلید: client_temp_id) تا وقتی آپلود همه‌شان با 2xx تأیید نشده، اینجا می‌مانند */
  private pendingFiles = new Map<string, File[]>();
  /** چند فایل اولِ هر پیام که آپلودشان با 2xx تأیید شده است (آپلود به ترتیب است) */
  private uploadedCounts = new Map<string, number>();
  /** لغو آپلود در حال اجرا (کلید: client_temp_id) */
  private uploadAborts = new Map<string, () => void>();
  /** تلاش مجددهای در حال اجرا (جلوی دو آپلود هم‌زمان با دو بار زدن «تلاش مجدد» را می‌گیرد) */
  private retrying = new Set<string>();
  /** پیش‌نویس هر گفتگو (فایل‌های انتخاب‌شدهٔ هنوز ارسال‌نشده و متن)، تا با بستن کشو یا عوض کردن گفتگو گم نشود */
  private composerDrafts = new Map<string, { files: File[]; text: string }>();
  /** پیام‌های ارسالی «در انتظار» یا «ناموفق» (کلید: client_temp_id) تا با جابه‌جایی گفتگو یا بارگذاری دوباره گم نشوند */
  private outgoingMessages = new Map<string, ChatMessage>();
  /** کاربری که سوکت‌ها برای او باز شده‌اند */
  private connectedUserId: number | null = null;
  /** آیا سوکت چت دست‌کم یک بار احراز هویت شده است (برای تشخیص اتصال دوباره) */
  private chatAuthenticatedOnce = false;
  /** کاربری که پیام‌ها/فایل‌های ارسال‌نشده را نوشته است */
  private outgoingOwnerId: number | null = null;
  /** شمارهٔ ترتیبی درخواست‌های loadMessages برای نادیده گرفتن پاسخ‌های کهنه */
  private loadMessagesSeq = 0;

  constructor() {
    this.initAudio();
    this.configApi.getPublicConfig().subscribe({
      next: (config) => {
        if (config && config.chat_enabled !== undefined) {
          this.isChatEnabled.set(config.chat_enabled);
          if (!config.chat_enabled) {
            this.disconnect();
          }
        }
      },
      error: () => {}
    });

    // شنود بازگشت فوکوس به تب مرورگر یا روشن شدن صفحه گوشی (Screen Wakeup / Mobile PWA)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          const isChatAlive = this.chatWs && this.chatWs.readyState === WebSocket.OPEN;
          if (!isChatAlive && this.isChatEnabled()) {
            this.ensureConnected(this.currentWarehouseId);
          }
          const active = this.activeConversation$.value;
          if (active) {
            this.loadMessages(active.id);
            // کاربر دوباره صفحه را می‌بیند؛ اگر کشوی چت همین گفتگو را نشان می‌دهد، خوانده‌شده ثبت شود
            if (this.isChatDrawerOpen()) {
              this.markAsRead(active.id);
            }
          }
          this.loadConversations(this.currentWarehouseId);
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.isChatEnabled()) {
          this.connectSockets(this.currentWarehouseId);
          const active = this.activeConversation$.value;
          if (active) {
            this.loadMessages(active.id);
          }
          this.loadConversations(this.currentWarehouseId);
        }
      });
    }
  }

  /**
   * استخراج دقیق شناسه کاربر لاگین‌شده از پروفایل ذخیره‌شده یا توکن JWT (پشتیبانی کامل از شناسه عددی و رشته‌ای در موبایل)
   */
  public getCurrentUserId(): number | null {
    try {
      const raw = sessionStorage.getItem('wh_user_profile') || localStorage.getItem('wh_user_profile');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          const rawId = parsed.id ?? parsed.user_id;
          if (rawId !== undefined && rawId !== null && !isNaN(Number(rawId))) {
            return Number(rawId);
          }
        }
      }
    } catch {}

    try {
      const token = sessionStorage.getItem('wh_access_token') || localStorage.getItem('wh_access_token');
      if (token) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload) {
            const rawId = payload.user_id ?? payload.id;
            if (rawId !== undefined && rawId !== null && !isNaN(Number(rawId))) {
              return Number(rawId);
            }
          }
        }
      }
    } catch {}

    return null;
  }

  /**
   * بررسی آنلاین بودن کاربر بر اساس شناسه
   */
  public isUserOnline(userId?: number | string | null): boolean {
    if (userId === undefined || userId === null) return false;
    const idNum = Number(userId);
    if (isNaN(idNum)) return false;
    return this.onlineUsers().has(idNum);
  }

  /**
   * ارسال درخواست استعلام حضور برای همگام‌سازی لیست کاربران آنلاین
   */
  public refreshPresence(): void {
    if (this.chatWs && this.chatWs.readyState === WebSocket.OPEN) {
      try {
        this.chatWs.send(JSON.stringify({ type: 'get_online_users' }));
      } catch {}
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.disconnect();
  }

  // ─── مدیریت اتصال سوکت و Reconnect هوشمند ───

  /**
   * اتصال تک‌نقطه‌ای و Idempotent به وب‌سوکت‌ها
   */
  public ensureConnected(warehouseId?: number): void {
    if (!this.isChatEnabled()) return;

    // اگر سوکت‌ها از قبل باز یا در حال اتصال باشند و شناسه انبار تغییری نکرده باشد، نیازی به اتصال مجدد نیست
    const isChatAlive = this.chatWs && (this.chatWs.readyState === WebSocket.OPEN || this.chatWs.readyState === WebSocket.CONNECTING);
    const isCommentAlive = this.commentWs && (this.commentWs.readyState === WebSocket.OPEN || this.commentWs.readyState === WebSocket.CONNECTING);

    // اگر کاربر لاگین‌شده با کاربری که سوکت برایش باز شده فرق دارد (دستگاه مشترک)، حالت قبلی پاک و اتصال تازه ساخته می‌شود
    const currentUserId = this.getCurrentUserId();
    const userChanged = this.connectedUserId !== null && currentUserId !== this.connectedUserId;
    if (userChanged) {
      this.disconnect();
      this.resetInMemoryState(false, false);
    }
    // پیام‌های ارسال‌نشدهٔ کاربر دیگر (مثلاً پس از خروج اجباری) فقط در صورت تغییر کاربر پاک می‌شوند
    this.guardOutgoingOwner();

    if (!userChanged && isChatAlive && isCommentAlive && this.currentWarehouseId === warehouseId) {
      return;
    }

    this.connectSockets(warehouseId);
  }

  /**
   * بستن امن یک سوکت: پیش از بستن، رویدادهایش جدا می‌شوند تا onclose آن اتصال دوباره زمان‌بندی نکند
   */
  private closeSocketSilently(ws: WebSocket | null): void {
    if (!ws) return;
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
    } catch {}
    try { ws.close(); } catch {}
  }

  public connectSockets(warehouseId?: number): void {
    if (!this.isChatEnabled()) return;

    const token = sessionStorage.getItem('wh_access_token') || localStorage.getItem('wh_access_token');
    if (!token) return;

    this.currentWarehouseId = warehouseId;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // بستن سوکت‌های قبلی پیش از ایجاد کانکشن جدید (بدون فعال شدن onclose و حلقهٔ اتصال دوباره)
    this.closeSocketSilently(this.chatWs);
    this.chatWs = null;
    this.closeSocketSilently(this.commentWs);
    this.commentWs = null;
    this.connectedUserId = this.getCurrentUserId();

    let chatPath = '/ws/chat/';
    if (warehouseId) {
      chatPath += `?warehouse_id=${warehouseId}`;
    }
    const chatUrl = wsUrl(chatPath);
    const commentUrl = wsUrl('/ws/comments/');

    this.initChatSocket(chatUrl, token);
    this.initCommentSocket(commentUrl, token);
    this.startHeartbeat();
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || !this.isChatEnabled()) return;
    if (this.reconnectTimer) return;

    // الگوریتم Exponential Backoff با Jitter تصادفی (1s, 2s, 4s, 8s, ... max 30s)
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSockets(this.currentWarehouseId);
    }, delay);
  }

  private initChatSocket(url: string, token: string): void {
    try {
      const ws = new WebSocket(url);
      this.chatWs = ws;

      ws.onopen = () => {
        if (this.chatWs !== ws) return; // رویداد سوکت کهنه نادیده گرفته می‌شود
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        // ارسال توکن در پیام اول جهت ارتقای امنیت و عدم نشت توکن در لاگ سرورها و پروکسی‌ها
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'authenticate',
            token: token
          }));
        }
      };

      ws.onmessage = (event) => {
        if (this.chatWs !== ws) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'authenticated') {
            this.refreshPresence();
            const active = this.activeConversation$.value;
            if (active && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'join_conversation',
                conversation_id: active.id
              }));
            }
            // در اتصال دوباره (نه اولین اتصال)، پیام‌های جاافتادهٔ زمان قطع گرفته می‌شوند
            if (this.chatAuthenticatedOnce) {
              void this.syncMissedMessages();
            }
            this.chatAuthenticatedOnce = true;
            return;
          }

          if (payload.type === 'pong') {
            this.lastPongTime = Date.now();
            return;
          }

          if (payload.event === 'chat.message.new') {
            const msg: ChatMessage = payload.data;
            this.handleNewMessage(msg);
          } else if (payload.event === 'chat.message.updated') {
            const msg: ChatMessage = payload.data;
            this.handleUpdatedMessage(msg);
          } else if (payload.event === 'chat.message.deleted') {
            const mid = payload.data?.id;
            const cid = payload.data?.conversation;
            if (mid !== undefined && mid !== null) this.handleDeletedMessage(String(mid), cid !== undefined && cid !== null ? String(cid) : null);
          } else if (payload.event === 'chat.conversation.removed') {
            const cid = payload.data?.conversation_id;
            if (cid !== undefined && cid !== null) this.handleConversationRemoved(String(cid));
          } else if (payload.event === 'chat.conversation.updated') {
            const cid = payload.data?.conversation_id;
            if (cid !== undefined && cid !== null) void this.handleConversationUpdated(String(cid));
          } else if (payload.event === 'chat.read_receipt') {
            this.handleReadReceipt(payload.data);
          } else if (payload.event === 'chat.typing') {
            this.typingUser$.next(payload.data);
          } else if (payload.event === 'chat.presence') {
            const { user_id, status } = payload.data || {};
            if (user_id !== undefined && user_id !== null) {
              const current = new Set(this.onlineUsers());
              const idNum = Number(user_id);
              if (status === 'online') {
                current.add(idNum);
              } else if (status === 'offline') {
                current.delete(idNum);
              }
              this.onlineUsers.set(current);
            }
          } else if (payload.event === 'chat.online_users') {
            const userIds: any[] = payload.data?.user_ids || [];
            const set = new Set<number>(userIds.map(id => Number(id)).filter(id => !isNaN(id)));
            this.onlineUsers.set(set);
          }
        } catch (e) {
          console.debug('[ChatSocket] parse error', e);
        }
      };

      ws.onclose = () => {
        if (this.chatWs !== ws) return; // سوکت قدیمی که عمداً بسته شده، اتصال دوباره نمی‌سازد
        if (!this.isDestroyed && this.isChatEnabled()) {
          this.scheduleReconnect();
        }
      };
    } catch (e) {
      console.warn('[ChatSocket] connection error', e);
      this.scheduleReconnect();
    }
  }

  private initCommentSocket(url: string, token: string): void {
    try {
      const ws = new WebSocket(url);
      this.commentWs = ws;

      ws.onopen = () => {
        if (this.commentWs !== ws) return;
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        // ارسال توکن در پیام اول جهت امنیت و عدم نشت توکن در لاگ‌ها
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'authenticate',
            token: token
          }));
        }
      };

      ws.onmessage = (event) => {
        if (this.commentWs !== ws) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'authenticated') {
            // اشتراک مجدد در تمام روم‌های فعال کامنت پس از تایید احراز هویت
            if (ws.readyState === WebSocket.OPEN) {
              for (const sub of this.activeCommentSubscriptions) {
                const [modelName, objectId] = sub.split(':');
                if (modelName && objectId) {
                  ws.send(JSON.stringify({
                    type: 'subscribe_comments',
                    content_type: modelName,
                    model: modelName,
                    object_id: objectId
                  }));
                }
              }
            }
            return;
          }

          if (payload.type === 'pong') {
            this.lastPongTime = Date.now();
            return;
          }

          if (payload.event === 'comment.new') {
            this.incomingComment$.next(payload.data);
          } else if (payload.event === 'comment.mention') {
            this.playNotificationSound();
            this.showBrowserNotification('شما منشن شدید!', payload.data.text || '');
          }
        } catch (e) {
          console.debug('[CommentSocket] parse error', e);
        }
      };

      ws.onclose = () => {
        if (this.commentWs !== ws) return;
        if (!this.isDestroyed && this.isChatEnabled()) {
          this.scheduleReconnect();
        }
      };
    } catch (e) {
      console.warn('[CommentSocket] connection error', e);
      this.scheduleReconnect();
    }
  }

  /**
   * قطع عمدی اتصال: هیچ اتصال دوباره‌ای زمان‌بندی نمی‌شود
   */
  public disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    this.closeSocketSilently(this.chatWs);
    this.chatWs = null;
    this.closeSocketSilently(this.commentWs);
    this.commentWs = null;
    this.chatAuthenticatedOnce = false;
    this.onlineUsers.set(new Set());
  }

  /**
   * خروج از حساب: بستن هر دو سوکت بدون اتصال دوباره، پاک کردن زمان‌سنج‌ها و همهٔ حالت حافظهٔ کاربر قبلی.
   * هرگز خطا پرتاب نمی‌کند.
   */
  public resetForLogout(): void {
    try { this.disconnect(); } catch {}
    try { this.resetInMemoryState(true, true); } catch {}
  }

  /**
   * خروج اجباری (مثلاً رد شدن رفرش توکن): سوکت‌ها بسته و حالت گرفته‌شده از سرور پاک می‌شود،
   * ولی پیام‌ها و فایل‌های ارسال‌نشدهٔ کاربر نگه داشته می‌شوند تا پس از ورود دوبارهٔ همان کاربر قابل ارسال باشند.
   * اگر کاربر دیگری وارد شود، guardOutgoingOwner آن‌ها را پاک می‌کند. هرگز خطا پرتاب نمی‌کند.
   */
  public resetForForcedLogout(): void {
    try { this.disconnect(); } catch {}
    try { this.resetInMemoryState(true, false); } catch {}
  }

  private resetInMemoryState(closeDrawer: boolean, dropOutgoing: boolean): void {
    for (const t of this.markReadDebounceTimers.values()) {
      try { clearTimeout(t); } catch {}
    }
    this.markReadDebounceTimers.clear();
    this.connectedUserId = null;
    this.currentWarehouseId = undefined;
    this.chatAuthenticatedOnce = false;
    this.conversations$.next([]);
    this.activeConversation$.next(null);
    this.activeMessages$.next([]);
    this.onlineUsers.set(new Set());
    this.totalUnreadCount.set(0);
    this.totalUnreadCount$.next(0);
    this.hasNewIncomingPulse.set(false);
    this.processedIncomingMessageIds.clear();
    this.playedMessageIds.clear();
    this.activeCommentSubscriptions.clear();
    // پیام‌ها و فایل‌های ارسال‌نشده متعلق به کاربر قبلی‌اند و نباید به کاربر بعدی روی همین دستگاه برسند
    if (dropOutgoing) {
      this.clearOutgoingFiles();
      this.outgoingMessages.clear();
      this.outgoingOwnerId = null;
    }
    if (closeDrawer) {
      this.isChatDrawerOpen.set(false);
    }
  }

  private startHeartbeat(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.lastPongTime = Date.now();

    this.pingInterval = setInterval(() => {
      // تشخیص سوکت مرده: اگر بیش از ۷۵ ثانیه پونگ دریافت نشده باشد
      if (Date.now() - this.lastPongTime > 75000) {
        console.warn('[CommunicationService] Dead socket detected (missed pong), reconnecting...');
        this.closeSocketSilently(this.chatWs);
        this.closeSocketSilently(this.commentWs);
        this.scheduleReconnect();
        return;
      }

      if (this.chatWs && this.chatWs.readyState === WebSocket.OPEN) {
        this.chatWs.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
      if (this.commentWs && this.commentWs.readyState === WebSocket.OPEN) {
        this.commentWs.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 30000);
  }

  // ─── عملیات پیام‌رسان (Chat API) ───
  public async loadConversations(warehouseId?: number): Promise<void> {
    if (!this.isChatEnabled()) return;
    let token: string | null = null;
    try {
      token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('wh_access_token')) ||
              (typeof localStorage !== 'undefined' && localStorage.getItem('wh_access_token')) || null;
    } catch {}
    if (!token) return;

    let params = new HttpParams();
    if (warehouseId) params = params.set('warehouse_id', warehouseId.toString());

    try {
      const res: any = await firstValueFrom(
        this.http.get<any>('/api/communications/conversations/', {
          params,
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
        })
      );
      const convs: Conversation[] = Array.isArray(res) ? res : (res?.results || []);
      this.conversations$.next(convs);
      
      const totalUnread = convs.reduce((acc, curr) => acc + (curr.unread_count || 0), 0);
      this.totalUnreadCount.set(totalUnread);
      this.totalUnreadCount$.next(totalUnread);
    } catch (err) {
      console.debug('[CommunicationService] Failed to load conversations', err);
    }
  }

  public async createConversation(payload: { conv_type: string; warehouse?: number; target_user_id?: number; title?: string }): Promise<Conversation> {
    return await firstValueFrom(
      this.http.post<Conversation>('/api/communications/conversations/', payload, {
        context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
      })
    );
  }

  private chatCtx(): HttpContext {
    return new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);
  }

  private recomputeUnread(convs: Conversation[]): void {
    const total = convs.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    this.totalUnreadCount.set(total);
    this.totalUnreadCount$.next(total);
  }

  /** گفتگو را از فهرست برمی‌دارد و اگر باز بود می‌بندد؛ پیام‌های در صف ارسال حفظ می‌شوند */
  private removeConversationFromState(conversationId: string): void {
    const convs = this.conversations$.value.filter(c => String(c.id) !== conversationId);
    this.conversations$.next(convs);
    this.recomputeUnread(convs);
    const active = this.activeConversation$.value;
    if (active && String(active.id) === conversationId) {
      this.leaveConversation(active.id);
      this.activeConversation$.next(null);
      this.activeMessages$.next([]);
    }
  }

  private mergeConversationIntoState(conv: Conversation): void {
    const id = String(conv.id);
    const list = this.conversations$.value;
    const exists = list.some(c => String(c.id) === id);
    const convs = exists
      ? list.map(c => (String(c.id) === id ? { ...c, ...conv } : c))
      : [conv, ...list];
    this.conversations$.next(convs);
    this.recomputeUnread(convs);
    const active = this.activeConversation$.value;
    if (active && String(active.id) === id) {
      this.activeConversation$.next({ ...active, ...conv });
    }
  }

  private handleConversationRemoved(conversationId: string): void {
    this.removeConversationFromState(conversationId);
    this.membershipEvents$.next({ type: 'removed', conversationId });
  }

  private async handleConversationUpdated(conversationId: string): Promise<void> {
    try {
      const conv = await firstValueFrom(
        this.http.get<Conversation>(`/api/communications/conversations/${conversationId}/`, { context: this.chatCtx() })
      );
      this.mergeConversationIntoState(conv);
      this.membershipEvents$.next({ type: 'updated', conversationId });
    } catch (err: any) {
      if (err?.status === 403 || err?.status === 404) {
        this.handleConversationRemoved(conversationId);
      } else {
        console.debug('[CommunicationService] Failed to refetch conversation', err);
      }
    }
  }

  // ─── گروه‌ها ───
  public async getCapabilities(): Promise<{ can_create_group: boolean }> {
    return await firstValueFrom(
      this.http.get<{ can_create_group: boolean }>('/api/communications/capabilities/', { context: this.chatCtx() })
    );
  }

  public async createGroup(title: string, memberIds: number[]): Promise<Conversation> {
    const conv = await firstValueFrom(
      this.http.post<Conversation>('/api/communications/conversations/',
        { conv_type: 'group', title, member_ids: memberIds }, { context: this.chatCtx() })
    );
    this.mergeConversationIntoState(conv);
    return conv;
  }

  public async getMembers(conversationId: string): Promise<ConversationMember[]> {
    return await firstValueFrom(
      this.http.get<ConversationMember[]>(`/api/communications/conversations/${conversationId}/members/`, { context: this.chatCtx() })
    );
  }

  public async addMembers(conversationId: string, userIds: number[]): Promise<{ added: any[] }> {
    const res = await firstValueFrom(
      this.http.post<{ added: any[] }>(`/api/communications/conversations/${conversationId}/members/`,
        { user_ids: userIds }, { context: this.chatCtx() })
    );
    void this.handleConversationUpdated(String(conversationId));
    return res;
  }

  public async removeMember(conversationId: string, userId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/communications/conversations/${conversationId}/members/${userId}/`, { context: this.chatCtx() })
    );
  }

  public async setMemberRole(conversationId: string, userId: number, role: 'admin' | 'member'): Promise<any> {
    return await firstValueFrom(
      this.http.patch<any>(`/api/communications/conversations/${conversationId}/members/${userId}/`,
        { role }, { context: this.chatCtx() })
    );
  }

  public async leaveGroup(conversationId: string): Promise<{ status: string; conversation_id: string; new_owner_id: number | null }> {
    const res = await firstValueFrom(
      this.http.post<{ status: string; conversation_id: string; new_owner_id: number | null }>(
        `/api/communications/conversations/${conversationId}/leave/`, {}, { context: this.chatCtx() })
    );
    this.removeConversationFromState(String(conversationId));
    return res;
  }

  public async renameGroup(conversationId: string, title: string): Promise<Conversation> {
    const conv = await firstValueFrom(
      this.http.patch<Conversation>(`/api/communications/conversations/${conversationId}/`, { title }, { context: this.chatCtx() })
    );
    this.mergeConversationIntoState({ ...conv, id: conv?.id ?? conversationId, title: conv?.title ?? title } as Conversation);
    return conv;
  }

  public async muteConversation(conversationId: string, muted: boolean): Promise<any> {
    const res = await firstValueFrom(
      this.http.post<any>(`/api/communications/conversations/${conversationId}/mute/`, { muted }, { context: this.chatCtx() })
    );
    const existing = this.conversations$.value.find(c => String(c.id) === String(conversationId));
    if (existing) this.mergeConversationIntoState({ ...existing, is_muted: muted } as Conversation);
    return res;
  }

  public leaveConversation(conversationId: string): void {
    if (this.chatWs && this.chatWs.readyState === WebSocket.OPEN && conversationId) {
      this.chatWs.send(JSON.stringify({
        type: 'leave_conversation',
        conversation_id: conversationId
      }));
    }
  }

  public closeActiveConversation(): void {
    const active = this.activeConversation$.value;
    if (active) {
      this.leaveConversation(active.id);
      this.activeConversation$.next(null);
    }
  }

  public async openConversation(conv: Conversation): Promise<void> {
    const prev = this.activeConversation$.value;
    if (prev && String(prev.id) !== String(conv.id)) {
      this.leaveConversation(prev.id);
    }
    this.activeConversation$.next(conv);
    this.loadMessages(conv.id);
    this.markAsRead(conv.id);

    if (this.chatWs && this.chatWs.readyState === WebSocket.OPEN) {
      this.chatWs.send(JSON.stringify({
        type: 'join_conversation',
        conversation_id: conv.id
      }));
    }
  }

  public async loadMessages(conversationId: string): Promise<void> {
    const seq = ++this.loadMessagesSeq;
    try {
      const params = new HttpParams()
        .set('conversation_id', conversationId)
        .set('limit', '50');

      const res: any = await firstValueFrom(
        this.http.get<any>('/api/communications/messages/', {
          params,
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
        })
      );
      const rawMessages: ChatMessage[] = res.results || res || [];
      const currentUserId = this.getCurrentUserId();
      const messages = rawMessages.map(m => ({
        ...m,
        is_me: currentUserId !== null ? Number(m.sender) === currentUserId : !!m.is_me
      }));
      // پاسخ کهنه (درخواست جدیدتری فرستاده شده، یا گفتگوی دیگری باز است) نادیده گرفته می‌شود
      if (seq !== this.loadMessagesSeq) return;
      const active = this.activeConversation$.value;
      if (active && String(active.id) !== String(conversationId)) return;
      // ادغام، نه جایگزینی: پیام‌های «در انتظار»/«ناموفق» محلی و پیام‌های تازه‌تر از این پاسخ حفظ می‌شوند
      this.activeMessages$.next(this.mergeWithLocalOutgoing(conversationId, messages.reverse()));
    } catch (err) {
      console.debug('[CommunicationService] Failed to load messages', err);
    }
  }

  private isLocalOutgoing(m: ChatMessage): boolean {
    return m.delivery_status === 'pending' || m.delivery_status === 'failed';
  }

  /**
   * ادغام فهرست سرور (به ترتیب زمانی) با پیام‌های ارسالی محلی که هنوز «در انتظار» یا «ناموفق»اند.
   * - اگر پیام محلی روی سرور هست (با client_temp_id) ولی فایلش هنوز آپلود نشده، نسخهٔ سرور با وضعیت محلی نشان داده می‌شود.
   * - اگر پیام محلی روی سرور هست و فایلی در انتظار ندارد، سرور آن را پذیرفته و نسخهٔ سرور جایگزین می‌شود.
   * - بقیهٔ پیام‌های محلی بعد از پیام‌های سرور می‌آیند.
   */
  private mergeWithLocalOutgoing(conversationId: string, serverMessages: ChatMessage[]): ChatMessage[] {
    this.guardOutgoingOwner();
    const local = new Map<string, ChatMessage>();
    for (const m of this.outgoingMessages.values()) {
      if (String(m.conversation) === String(conversationId) && m.client_temp_id) local.set(m.client_temp_id, m);
    }
    for (const m of this.activeMessages$.value) {
      if (String(m.conversation) === String(conversationId) && m.client_temp_id && this.isLocalOutgoing(m) && !local.has(m.client_temp_id)) {
        local.set(m.client_temp_id, m);
      }
    }

    const result: ChatMessage[] = [];
    const seenIds = new Set<string>();
    for (const s of serverMessages) {
      const sid = String(s.id);
      if (seenIds.has(sid)) continue;
      seenIds.add(sid);
      const tid = s.client_temp_id;
      const l = tid ? local.get(tid) : undefined;
      if (tid && l) {
        local.delete(tid);
        if (this.pendingFiles.has(tid)) {
          result.push({ ...s, client_temp_id: tid, is_me: true, is_pending: l.is_pending, delivery_status: l.delivery_status });
          continue;
        }
        this.outgoingMessages.delete(tid);
      }
      result.push(s);
    }

    // پیام‌هایی که همین حالا روی صفحه‌اند و تازه‌تر از جدیدترین پیام این پاسخ‌اند (مثلاً پیامی که در حین درخواست
    // ارسال شد یا زنده رسید) حفظ می‌شوند تا پاسخ دیرتر رسیده آن‌ها را حذف نکند
    const serverTempIds = new Set(serverMessages.map(s => s.client_temp_id).filter((t): t is string => !!t));
    const newestServerTime = serverMessages.reduce((acc, s) => {
      const t = Date.parse(s.created_at);
      return isNaN(t) ? acc : Math.max(acc, t);
    }, -Infinity);
    for (const m of this.activeMessages$.value) {
      if (String(m.conversation) !== String(conversationId) || this.isLocalOutgoing(m)) continue;
      if (seenIds.has(String(m.id)) || (m.client_temp_id && serverTempIds.has(m.client_temp_id))) continue;
      if (String(m.id).startsWith('temp-')) continue;
      const t = Date.parse(m.created_at);
      if (!isNaN(t) && t > newestServerTime) {
        seenIds.add(String(m.id));
        result.push(m);
      }
    }

    for (const l of local.values()) {
      result.push(l);
    }
    return result;
  }

  /**
   * پیام‌ها و فایل‌های ارسال‌نشده فقط به کاربری تعلق دارند که آن‌ها را نوشته است؛
   * اگر کاربر دیگری روی همین دستگاه وارد شده باشد، پاک می‌شوند (حریم خصوصی دستگاه مشترک).
   */
  private guardOutgoingOwner(): void {
    const uid = this.getCurrentUserId();
    if (this.outgoingOwnerId !== null && uid !== null && uid !== this.outgoingOwnerId) {
      this.clearOutgoingFiles();
      this.outgoingMessages.clear();
      this.outgoingOwnerId = null;
    }
  }

  /**
   * حذف عمدی یک پیام ارسال‌نشده توسط خود کاربر (پس از تأیید او): متن و فایل محلی آن کنار گذاشته می‌شود
   */
  public discardOutgoing(tempId: string): void {
    const msg = this.activeMessages$.value.find(m => m.client_temp_id === tempId || m.id === tempId)
      || this.outgoingMessages.get(tempId);
    if (!msg || !this.isLocalOutgoing(msg)) return;
    const tid = msg.client_temp_id || tempId;
    this.uploadAborts.get(tid)?.();
    this.forgetFiles(tid);
    this.outgoingMessages.delete(tid);
    this.activeMessages$.next(this.activeMessages$.value.filter(m => m.client_temp_id !== tid && m.id !== tid));
  }

  /** لغو آپلود در حال اجرای یک پیام؛ پیام «ناموفق» می‌ماند و فایل‌هایش برای تلاش مجدد نگه داشته می‌شوند */
  public cancelUpload(tempId: string): void {
    this.uploadAborts.get(tempId)?.();
  }

  private forgetFiles(tempId: string): void {
    this.pendingFiles.delete(tempId);
    this.uploadedCounts.delete(tempId);
    this.uploadAborts.delete(tempId);
  }

  /** نگه داشتن پیش‌نویس گفتگو (فایل‌ها و متن)؛ پیش‌نویس خالی، پیش‌نویس قبلی را پاک می‌کند */
  public stashComposerDraft(conversationId: string, files: File[], text: string): void {
    if (!conversationId) return;
    if (files.length || text.trim()) this.composerDrafts.set(conversationId, { files: [...files], text });
    else this.composerDrafts.delete(conversationId);
  }

  /** برداشتن پیش‌نویس گفتگو (یک بار؛ بعد از برداشتن در سرویس نمی‌ماند) */
  public takeComposerDraft(conversationId: string): { files: File[]; text: string } | null {
    const d = this.composerDrafts.get(conversationId) || null;
    this.composerDrafts.delete(conversationId);
    return d;
  }

  private clearOutgoingFiles(): void {
    this.uploadAborts.forEach(abort => abort());
    this.pendingFiles.clear();
    this.composerDrafts.clear();
    this.retrying.clear();
    this.uploadedCounts.clear();
    this.uploadAborts.clear();
  }

  /** متن خطای سرور برای رد قطعی (4xx به‌جز 401/408/429)؛ برای خطای موقت null */
  private permanentRejectionText(err: any): string | null {
    const status = typeof err?.status === 'number' ? err.status : 0;
    const isClientError = status >= 400 && status <= 499;
    if (!isClientError || isServerUnreachable(status) || status === 401 || status === 408 || status === 429) return null;
    const body = err?.error;
    let text = '';
    if (typeof body === 'string') {
      text = body;
    } else if (body && typeof body === 'object') {
      const first = body.detail ?? body.error ?? body.message ?? Object.values(body)[0];
      text = Array.isArray(first) ? String(first[0] ?? '') : (typeof first === 'string' ? first : '');
    }
    text = (text || '').trim();
    if (!text || text.length > 200 || /<[a-z!]/i.test(text)) {
      text = 'سرور این پیام را نپذیرفت.';
    }
    return text;
  }

  /**
   * تغییر وضعیت یک پیام ارسالی در فهرست نمایش و در نگه‌دارندهٔ پیام‌های ارسال‌نشده
   */
  private applyOutgoingUpdate(tempId: string, next: (m: ChatMessage) => ChatMessage): void {
    const stored = this.outgoingMessages.get(tempId);
    let latest: ChatMessage | null = stored ? next(stored) : null;
    let changed = false;
    const updated = this.activeMessages$.value.map(m => {
      if (m.client_temp_id === tempId || m.id === tempId) {
        changed = true;
        const n = next(m);
        if (!latest) latest = n;
        return n;
      }
      return m;
    });
    if (changed) this.activeMessages$.next(updated);
    const finalMsg = latest as ChatMessage | null;
    if (finalMsg) {
      if (this.isLocalOutgoing(finalMsg)) {
        this.outgoingMessages.set(tempId, { ...finalMsg, client_temp_id: tempId });
      } else {
        this.outgoingMessages.delete(tempId);
      }
    }
  }

  /**
   * پس از اتصال دوباره: پیام‌های جاافتادهٔ گفتگوی فعال با since_id گرفته و بدون تکرار ادغام می‌شوند؛ فهرست گفتگوها هم تازه می‌شود
   */
  private async syncMissedMessages(): Promise<void> {
    const active = this.activeConversation$.value;
    const conversationId = active ? String(active.id) : '';
    if (conversationId && !conversationId.startsWith('draft_')) {
      const lastServer = [...this.activeMessages$.value].reverse().find(m =>
        String(m.conversation) === conversationId && !this.isLocalOutgoing(m) && m.id && !String(m.id).startsWith('temp-')
      );
      if (!lastServer) {
        await this.loadMessages(conversationId);
      } else {
        try {
          const params = new HttpParams()
            .set('conversation_id', conversationId)
            .set('since_id', String(lastServer.id))
            .set('limit', '100');
          const res: any = await firstValueFrom(
            this.http.get<any>('/api/communications/messages/', {
              params,
              context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
            })
          );
          const raw: ChatMessage[] = res?.results || res || [];
          const currentUserId = this.getCurrentUserId();
          const newer = raw.map(m => ({
            ...m,
            is_me: currentUserId !== null ? Number(m.sender) === currentUserId : !!m.is_me
          })).reverse();
          const stillActive = this.activeConversation$.value;
          if (newer.length > 0 && stillActive && String(stillActive.id) === conversationId) {
            const current = this.activeMessages$.value;
            const ids = new Set(current.map(m => String(m.id)));
            const tempIds = new Set(current.map(m => m.client_temp_id).filter((t): t is string => !!t));
            const fresh = newer.filter(m => !ids.has(String(m.id)) && !(m.client_temp_id && tempIds.has(m.client_temp_id)));
            if (fresh.length > 0) {
              for (const m of fresh) this.processedIncomingMessageIds.add(String(m.id));
              // پیام‌های سرور پیش از پیام‌های محلیِ ارسال‌نشده قرار می‌گیرند
              const serverPart = current.filter(m => !this.isLocalOutgoing(m));
              const localPart = current.filter(m => this.isLocalOutgoing(m));
              this.activeMessages$.next([...serverPart, ...fresh, ...localPart]);
              if (this.isChatDrawerOpen() && this.isPageVisible()) {
                this.markAsRead(conversationId);
              }
            }
          }
        } catch (err) {
          console.debug('[CommunicationService] Failed to sync missed messages', err);
        }
      }
    }
    await this.loadConversations(this.currentWarehouseId);
  }

  private isPageVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  /**
   * بارگذاری پیام‌های قدیمی‌تر (Infinite Scroll)
   */
  public async loadOlderMessages(conversationId: string, beforeId: string | number, limit = 30): Promise<ChatMessage[]> {
    try {
      const params = new HttpParams()
        .set('conversation_id', conversationId)
        .set('limit', limit.toString())
        .set('before_id', String(beforeId));

      const res: any = await firstValueFrom(
        this.http.get<any>('/api/communications/messages/', {
          params,
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
        })
      );
      const rawOlder: ChatMessage[] = res.results || res || [];
      const currentUserId = this.getCurrentUserId();
      const older = rawOlder.map(m => ({
        ...m,
        is_me: currentUserId !== null ? Number(m.sender) === currentUserId : !!m.is_me
      })).reverse();

      if (older.length > 0) {
        const current = this.activeMessages$.value;
        const currentIds = new Set(current.map(m => m.id));
        const filteredOlder = older.filter((m: ChatMessage) => !currentIds.has(m.id));
        this.activeMessages$.next([...filteredOlder, ...current]);
      }
      return older;
    } catch (err) {
      console.debug('[CommunicationService] Failed to load older messages', err);
      return [];
    }
  }

  /** شناسهٔ قدیمی‌ترین پیام واقعی (سرور) در فهرست؛ پیام‌های محلی «در انتظار/ناموفق» نادیده گرفته می‌شوند */
  public oldestServerMessageId(): string | null {
    const real = this.activeMessages$.value.filter(m =>
      m.delivery_status !== 'pending' && m.delivery_status !== 'failed' && !m.is_pending
      && !String(m.id).startsWith('temp-') && Number.isFinite(Number(m.id)));
    if (real.length === 0) return null;
    return String(real.reduce((a, b) => (Number(b.id) < Number(a.id) ? b : a)).id);
  }

  /** ویرایش متن پیام خودم؛ نیازمند اتصال است و وارد صف آفلاین نمی‌شود */
  public async editMessage(messageId: string, text: string): Promise<ChatMessage> {
    const res = await firstValueFrom(
      this.http.patch<ChatMessage>(`/api/communications/messages/${messageId}/`, { text }, {
        context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
      })
    );
    this.handleUpdatedMessage(res);
    return res;
  }

  /** حذف پیام؛ نیازمند اتصال است و وارد صف آفلاین نمی‌شود */
  public async deleteMessage(messageId: string): Promise<void> {
    const conv = this.activeMessages$.value.find(m => String(m.id) === String(messageId))?.conversation ?? null;
    await firstValueFrom(
      this.http.delete(`/api/communications/messages/${messageId}/`, {
        context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
      })
    );
    this.handleDeletedMessage(String(messageId), conv !== null ? String(conv) : null);
  }

  /** حذف پیام از فهرست باز و تازه‌سازی پیش‌نمایش آخرین پیام گفتگو */
  private handleDeletedMessage(messageId: string, conversationId: string | null): void {
    const current = this.activeMessages$.value;
    const target = current.find(m => String(m.id) === messageId);
    const convId = conversationId ?? (target ? String(target.conversation) : null);
    const active = this.activeConversation$.value;
    let remaining = current;
    if (target && (!convId || !active || String(active.id) === convId)) {
      remaining = current.filter(m => String(m.id) !== messageId);
      this.activeMessages$.next(remaining);
    }
    if (!convId) return;
    const convs = this.conversations$.value;
    const hit = convs.find(c => String(c.id) === convId);
    if (!hit || !hit.last_message || String(hit.last_message.id) !== messageId) return;
    const inConv = remaining.filter(m => String(m.conversation) === convId && !m.is_system && !m.is_pending);
    const last = inConv[inConv.length - 1];
    if (last) {
      const has = !!(last.attachments && last.attachments.length > 0);
      this.conversations$.next(convs.map(c => String(c.id) === convId ? {
        ...c,
        last_message: { id: last.id, text: last.text || '', sender_name: last.sender_details?.full_name || '', created_at: last.created_at, has_attachment: has }
      } : c));
    } else {
      // پیام قبلی در حافظه نیست؛ فهرست از سرور تازه می‌شود
      void this.loadConversations(this.currentWarehouseId);
    }
  }

  public async sendMessage(conversationId: string, text: string, replyTo?: string, fileOrFiles?: File | File[]): Promise<void> {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const files = (Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : []).filter(Boolean);
    const file = files[0];

    // Optimistic UI Message
    const optimisticMsg: ChatMessage = {
      id: tempId,
      client_temp_id: tempId,
      conversation: conversationId,
      sender: 0,
      text: text,
      reply_to: replyTo,
      created_at: new Date().toISOString(),
      is_me: true,
      is_pending: true,
      delivery_status: 'pending',
      pending_file_name: files.length ? this.pendingNames(files) : undefined,
      upload_total: files.length || undefined
    };

    // فایل‌ها تا تأیید 2xx آپلود در حافظه می‌مانند تا «تلاش مجدد» بتواند دوباره بفرستد
    this.guardOutgoingOwner();
    this.outgoingOwnerId = this.getCurrentUserId();
    if (files.length) {
      this.pendingFiles.set(tempId, files);
    }
    this.outgoingMessages.set(tempId, optimisticMsg);

    const currentMsgs = this.activeMessages$.value;
    this.activeMessages$.next([...currentMsgs, optimisticMsg]);

    // انتقال فوری گفتگو به صدر لیست با متن آخرین پیام ارسالی
    const convs = this.conversations$.value;
    const currentConv = convs.find(c => String(c.id) === String(conversationId));
    if (currentConv) {
      const otherConvs = convs.filter(c => String(c.id) !== String(conversationId));
      const updatedConv: Conversation = {
        ...currentConv,
        last_message: {
          id: tempId,
          text: text || '',
          sender_name: 'شما',
          created_at: new Date().toISOString(),
          has_attachment: !!file
        }
      };
      this.conversations$.next([updatedConv, ...otherConvs]);
    }

    await this.deliverOutgoing(tempId, {
      conversation: conversationId,
      text: text,
      client_temp_id: tempId,
      reply_to: replyTo
    });
  }

  /**
   * تلاش مجدد برای پیام ناموفق؛ فایل پیوست (اگر بوده) از حافظهٔ سرویس برداشته می‌شود.
   * ارسال دوباره با همان client_temp_id است و سرور برای شناسهٔ تکراری همان پیام قبلی را برمی‌گرداند (idempotent).
   */
  public async retryMessage(tempId: string): Promise<void> {
    const msg = this.activeMessages$.value.find(m => m.client_temp_id === tempId || m.id === tempId)
      || this.outgoingMessages.get(tempId);
    if (!msg) return;
    const clientTempId = msg.client_temp_id || tempId;
    if (this.retrying.has(clientTempId)) return;
    this.retrying.add(clientTempId);

    this.applyOutgoingUpdate(clientTempId, m => ({ ...m, is_pending: true, delivery_status: 'pending' as const, failure_reason: undefined }));

    try {
      await this.deliverOutgoing(clientTempId, {
        conversation: msg.conversation,
        text: msg.text || '',
        client_temp_id: clientTempId,
        reply_to: msg.reply_to
      });
    } finally {
      this.retrying.delete(clientTempId);
    }
  }

  /**
   * ارسال متن و سپس فایل‌های پیوست یک پیام، یکی‌یکی و به ترتیب. هیچ متن یا فایلی بی‌صدا دور ریخته نمی‌شود:
   * - شکست ارسال متن یا آپلود هر فایل ⇒ وضعیت «ناموفق» با دکمهٔ تلاش مجدد؛ فایل‌های آپلودنشده در حافظه می‌مانند.
   * - لغو آپلود به دست کاربر هم همین‌طور: پیام «ناموفق» می‌ماند و فایل‌ها نگه داشته می‌شوند.
   * - پیام دارای فایل از صف آفلاین عبور نمی‌کند (SKIP_OFFLINE) تا نسخهٔ بی‌فایل در صف نرود.
   * - پیام فقط‌متنی مثل قبل در صورت قطع شبکه به صف آفلاین می‌رود و «در انتظار» می‌ماند.
   */
  private async deliverOutgoing(tempId: string, payload: any): Promise<void> {
    const files = this.pendingFiles.get(tempId);
    let savedMsg: ChatMessage | null = null;

    try {
      const options = files
        ? { context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true) }
        : {};
      const response: any = await firstValueFrom(
        this.http.post<ChatMessage>('/api/communications/messages/', payload, options)
      );

      // اگر آفلاین است و اینترسپتور پاسخ _offlinePending برگردانده باشد (فقط پیام بی‌فایل)
      if (response && response._offlinePending) {
        this.applyOutgoingUpdate(tempId, m => ({ ...m, is_pending: true, delivery_status: 'pending' as const }));
        return;
      }
      savedMsg = response as ChatMessage;
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 0;
      if (isServerUnreachable(status)) {
        console.warn('[CommunicationService] Server unreachable; message kept as failed for retry', status);
      } else {
        console.error('[CommunicationService] Failed to send message', err);
      }
      // متن (و فایل) کاربر هرگز دور ریخته نمی‌شود؛ وضعیت به failed تغییر می‌کند
      const reason = this.permanentRejectionText(err) ?? undefined;
      this.applyOutgoingUpdate(tempId, m => ({ ...m, is_pending: false, delivery_status: 'failed' as const, failure_reason: reason }));
      return;
    }

    if (files) {
      if (!savedMsg || !savedMsg.id) {
        this.applyOutgoingUpdate(tempId, m => ({ ...m, is_pending: false, delivery_status: 'failed' as const }));
        return;
      }
      const base = savedMsg;
      // سرور پیوست‌ها را به ترتیب آپلود دارد؛ اگر پاسخ آپلودی به سرور رسیده ولی گم شده بود، آن فایل دوباره فرستاده نمی‌شود
      const atts: MessageAttachment[] = Array.isArray(base.attachments) ? [...base.attachments] : [];
      const start = Math.max(this.uploadedCounts.get(tempId) ?? 0, atts.length);
      for (let i = start; i < files.length; i++) {
        this.applyOutgoingUpdate(tempId, m => ({ ...m, upload_index: i + 1, upload_total: files.length, upload_progress: 0 }));
        try {
          const att = await this.uploadAttachment(files[i], base.id, {
            onProgress: pct => this.applyOutgoingUpdate(tempId, m => ({ ...m, upload_progress: pct })),
            register: abort => this.uploadAborts.set(tempId, abort)
          });
          this.uploadAborts.delete(tempId);
          atts.push(att);
          // فقط پس از پاسخ 2xx، این فایل آپلودشده حساب می‌شود
          this.uploadedCounts.set(tempId, i + 1);
        } catch (e) {
          this.uploadAborts.delete(tempId);
          // کاربر پیام را پس از تأیید کنار گذاشته است
          if (!this.pendingFiles.has(tempId)) return;
          const cancelled = e instanceof UploadCancelledError;
          if (!cancelled) console.warn('[CommunicationService] Attachment upload failed; message kept as failed for retry', e);
          const rest = files.slice(i);
          this.applyOutgoingUpdate(tempId, () => ({
            ...base, attachments: [...atts], client_temp_id: tempId, is_me: true, is_pending: false, delivery_status: 'failed' as const,
            pending_file_name: this.pendingNames(rest),
            upload_progress: null, upload_index: undefined, upload_total: files.length,
            failure_reason: cancelled ? 'ارسال فایل لغو شد؛ برای ارسال دوباره «تلاش مجدد» را بزنید.' : (this.permanentRejectionText(e) ?? undefined)
          }));
          return;
        }
      }
      // فقط پس از تأیید همهٔ فایل‌ها، فایل‌ها از حافظه برداشته می‌شوند
      this.forgetFiles(tempId);
      const sent: ChatMessage = { ...base, attachments: atts };
      this.applyOutgoingUpdate(tempId, () => ({
        ...sent, client_temp_id: tempId, is_me: true, is_pending: false, delivery_status: 'sent' as const,
        pending_file_name: undefined, failure_reason: undefined,
        upload_progress: undefined, upload_index: undefined, upload_total: undefined
      }));
      return;
    }

    const finalMsg = savedMsg;
    this.applyOutgoingUpdate(tempId, m => ({
      ...m, ...(finalMsg || {}), client_temp_id: tempId, is_me: true, is_pending: false, delivery_status: 'sent' as const,
      failure_reason: undefined
    }));
  }

  /** نام فایل‌های آپلودنشده برای نمایش در حباب */
  private pendingNames(files: File[]): string {
    return files.map(f => f.name || 'فایل پیوست').join('، ');
  }

  /**
   * آپلود یک فایل برای پیام. `onProgress` درصد پیشرفت را می‌گیرد و `register` تابع لغو را؛
   * لغو، وعده را با UploadCancelledError رد می‌کند.
   */
  public async uploadAttachment(
    file: File,
    messageId: string,
    opts?: { onProgress?: (percent: number) => void; register?: (abort: () => void) => void }
  ): Promise<MessageAttachment> {
    let uploadFile = file;

    // اگر تصویر است، فشرده‌سازی در کلاینت به فرمت WebP
    if (file.type.startsWith('image/')) {
      try {
        const compressed = await this.imageCompressor.compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.85,
          mimeType: 'image/webp'
        });
        uploadFile = compressed.file;
      } catch (e) {
        console.warn('[ImageCompressor] Fallback to original image', e);
      }
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('message_id', messageId);

    // فایل از صف آفلاین عبور نمی‌کند؛ شکست آپلود به فراخواننده برمی‌گردد تا پیام «ناموفق» و فایل نگه داشته شود
    return new Promise<MessageAttachment>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
      const sub = this.http.post<MessageAttachment>('/api/communications/messages/upload/', formData, {
        context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true),
        reportProgress: true,
        observe: 'events'
      }).subscribe({
        next: (ev: HttpEvent<MessageAttachment>) => {
          if (ev.type === HttpEventType.UploadProgress) {
            if (ev.total) opts?.onProgress?.(Math.min(100, Math.round((100 * ev.loaded) / ev.total)));
          } else if (ev.type === HttpEventType.Response) {
            const body: any = ev.body;
            finish(() => (!body || body._offlinePending)
              ? reject(new Error('attachment upload not confirmed by server'))
              : resolve(body as MessageAttachment));
          }
        },
        error: (e) => finish(() => reject(e)),
        complete: () => finish(() => reject(new Error('attachment upload not confirmed by server')))
      });
      opts?.register?.(() => finish(() => { sub.unsubscribe(); reject(new UploadCancelledError()); }));
    });
  }

  /**
   * علامت‌گذاری خوانده‌شدن پیام‌ها با اعمال مکانیزم Debounce جهت کاهش بار سرور
   */
  public async markAsRead(conversationId: string, untilMessageId?: string): Promise<void> {
    if (!conversationId || String(conversationId).startsWith('draft_')) return;
    if (this.markReadDebounceTimers.has(conversationId)) {
      clearTimeout(this.markReadDebounceTimers.get(conversationId));
    }

    const timer = setTimeout(async () => {
      this.markReadDebounceTimers.delete(conversationId);
      try {
        const payload = untilMessageId ? { until_message_id: untilMessageId } : {};
        await firstValueFrom(
          this.http.post(`/api/communications/conversations/${conversationId}/mark-read/`, payload, {
            context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
          })
        );
        // آپدیت تعداد خوانده‌نشده
        const convs = this.conversations$.value.map(c => {
          if (c.id === conversationId) return { ...c, unread_count: 0 };
          return c;
        });
        this.conversations$.next(convs);
        const totalUnread = convs.reduce((acc, curr) => acc + (curr.unread_count || 0), 0);
        this.totalUnreadCount.set(totalUnread);
        this.totalUnreadCount$.next(totalUnread);
        if (totalUnread === 0) {
          this.hasNewIncomingPulse.set(false);
        }
      } catch (e) {}
    }, 300);

    this.markReadDebounceTimers.set(conversationId, timer);
  }

  private lastTypingSentAt = 0;

  public sendTypingStatus(conversationId: string, isTyping: boolean): void {
    if (!conversationId || String(conversationId).startsWith('draft_')) return;
    if (isTyping) {
      // رویداد «در حال نوشتن» حداکثر هر ۳ ثانیه یک بار
      const now = Date.now();
      if (now - this.lastTypingSentAt < 3000) return;
      this.lastTypingSentAt = now;
    }
    if (this.chatWs && this.chatWs.readyState === WebSocket.OPEN) {
      this.chatWs.send(JSON.stringify({
        type: 'typing',
        conversation_id: conversationId,
        is_typing: isTyping
      }));
    }
  }

  /** وضعیت خواندن اعضای یک گفتگو (برای پنل «خوانده‌شده توسط») */
  public getReadStatus(conversationId: string): Promise<ReadStatus> {
    return firstValueFrom(
      this.http.get<ReadStatus>(`/api/communications/conversations/${conversationId}/read_status/`, {
        context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true)
      })
    );
  }

  private handleReadReceipt(data: { conversation_id: string; reader_id: number; reader_name?: string; last_read_message_id?: string | null }): void {
    const currentUserId = this.getCurrentUserId();
    // خواندنِ خودِ من (از دستگاه دیگر): فقط شمارندهٔ خوانده‌نشدهٔ آن گفتگو صفر می‌شود، پیامی علامت نمی‌خورد
    if (currentUserId !== null && Number(data.reader_id) === currentUserId) {
      const convs = this.conversations$.value.map(c =>
        String(c.id) === String(data.conversation_id) ? { ...c, unread_count: 0 } : c
      );
      this.conversations$.next(convs);
      const totalUnread = convs.reduce((acc, curr) => acc + (curr.unread_count || 0), 0);
      this.totalUnreadCount.set(totalUnread);
      this.totalUnreadCount$.next(totalUnread);
      if (totalUnread === 0) {
        this.hasNewIncomingPulse.set(false);
      }
      return;
    }

    const lastRead = data.last_read_message_id;
    if (lastRead === null || lastRead === undefined || lastRead === '') return;
    const limit = Number(lastRead);
    if (!Number.isFinite(limit)) return;

    const active = this.activeConversation$.value;
    if (active && String(active.id) === String(data.conversation_id)) {
      const currentMsgs = this.activeMessages$.value;
      const updated = currentMsgs.map(m => {
        const mid = Number(m.id);
        if (m.is_me && Number.isFinite(mid) && mid <= limit) {
          return {
            ...m,
            read_by_count: Math.max(m.read_by_count || 0, 1)
          };
        }
        return m;
      });
      this.activeMessages$.next(updated);
    }
  }

  private handleNewMessage(rawMsg: ChatMessage): void {
    const msgId = String(rawMsg.id || rawMsg.client_temp_id || '');
    const isDuplicate = msgId ? this.processedIncomingMessageIds.has(msgId) : false;
    if (msgId) {
      this.processedIncomingMessageIds.add(msgId);
      if (this.processedIncomingMessageIds.size > 500) {
        const first = this.processedIncomingMessageIds.values().next().value;
        if (first) this.processedIncomingMessageIds.delete(first);
      }
    }

    const active = this.activeConversation$.value;
    const currentUserId = this.getCurrentUserId();
    const isMe = currentUserId !== null ? Number(rawMsg.sender) === currentUserId : !!rawMsg.is_me;
    const msg: ChatMessage = {
      ...rawMsg,
      is_me: isMe
    };

    const msgConvId = String(msg.conversation);
    // فقط وقتی کشو باز است و صفحه واقعاً دیده می‌شود (تب پنهان یا گوشی قفل نیست) پیام خوانده‌شده حساب می‌شود
    const isCurrentlyViewing = this.isChatDrawerOpen() && this.isPageVisible() && active && String(active.id) === msgConvId;

    if (isCurrentlyViewing) {
      const current = this.activeMessages$.value;
      if (!current.some(m => String(m.id) === msgId || (m.client_temp_id && m.client_temp_id === msg.client_temp_id))) {
        this.activeMessages$.next([...current, msg]);
        this.markAsRead(active!.id);
      }
    } else {
      if (active && String(active.id) === msgConvId) {
        const current = this.activeMessages$.value;
        if (!current.some(m => String(m.id) === msgId || (m.client_temp_id && m.client_temp_id === msg.client_temp_id))) {
          this.activeMessages$.next([...current, msg]);
        }
      }
    }

    // به‌روزرسانی زنده آخرین پیام در لیست مکالمات، انتقال گفتگو به صدر لیست و محاسبه دقیق شمارنده خوانده‌نشده
    let convFound = false;
    const shouldIncrementUnread = !isCurrentlyViewing && !isMe && !isDuplicate;
    const currentConvs = this.conversations$.value;

    let targetConv: Conversation | null = null;
    const remainingConvs: Conversation[] = [];

    for (const c of currentConvs) {
      if (String(c.id) === msgConvId) {
        convFound = true;
        targetConv = {
          ...c,
          last_message: {
            id: msg.id,
            text: msg.text || '',
            sender_name: msg.sender_details?.full_name || '',
            created_at: msg.created_at,
            has_attachment: (msg.attachments && msg.attachments.length > 0) || false
          },
          unread_count: isCurrentlyViewing ? 0 : ((c.unread_count || 0) + (shouldIncrementUnread ? 1 : 0))
        };
      } else {
        remainingConvs.push(c);
      }
    }

    if (convFound && targetConv) {
      // قرار دادن گفتگوی به‌روزشده در صدر لیست (اندیس ۰)
      const updatedConvs = [targetConv, ...remainingConvs];
      this.conversations$.next(updatedConvs);
      const totalUnread = updatedConvs.reduce((acc, curr) => acc + (curr.unread_count || 0), 0);
      this.totalUnreadCount.set(totalUnread);
      this.totalUnreadCount$.next(totalUnread);
      if (shouldIncrementUnread) {
        this.hasNewIncomingPulse.set(true);
      }
    } else {
      // در صورتی که گفتگو هنوز در لیست محلی نباشد، لیست از سرور بازخوانی می‌شود
      this.loadConversations(this.currentWarehouseId);
      if (shouldIncrementUnread) {
        const newTotal = this.totalUnreadCount() + 1;
        this.totalUnreadCount.set(newTotal);
        this.totalUnreadCount$.next(newTotal);
        this.hasNewIncomingPulse.set(true);
      }
    }

    this.incomingMessage$.next(msg);

    // مشروط‌سازی پخش صدا تنها برای پیام دیگران و در صورت عدم تکرار (با سقف ۵۰۰ تایی حافظه)
    if (!msg.is_me && !this.playedMessageIds.has(msgId) && !isDuplicate) {
      if (this.playedMessageIds.size >= 500) {
        const oldest = this.playedMessageIds.values().next().value;
        if (oldest) this.playedMessageIds.delete(oldest);
      }
      this.playedMessageIds.add(msgId);
      this.playNotificationSound();
    }
  }

  private handleUpdatedMessage(rawMsg: ChatMessage): void {
    const active = this.activeConversation$.value;
    const currentUserId = this.getCurrentUserId();
    const isMe = currentUserId !== null ? Number(rawMsg.sender) === currentUserId : !!rawMsg.is_me;
    const msg: ChatMessage = {
      ...rawMsg,
      is_me: isMe
    };

    const msgConvId = String(msg.conversation);

    if (active && String(active.id) === msgConvId) {
      const current = this.activeMessages$.value;
      const index = current.findIndex(m => String(m.id) === String(msg.id) || (m.client_temp_id && m.client_temp_id === msg.client_temp_id));
      if (index !== -1) {
        const updated = [...current];
        const existing = updated[index];
        const tid = existing.client_temp_id || msg.client_temp_id;
        if (tid && this.pendingFiles.has(tid)) {
          // فایل این پیام هنوز آپلود نشده: وضعیت «ناموفق/در انتظار» و دکمهٔ تلاش مجدد حفظ می‌شود
          const kept: ChatMessage = {
            ...existing, ...msg, client_temp_id: tid, is_me: existing.is_me ?? msg.is_me,
            is_pending: existing.is_pending, delivery_status: existing.delivery_status,
            pending_file_name: existing.pending_file_name, failure_reason: existing.failure_reason
          };
          updated[index] = kept;
          if (this.outgoingMessages.has(tid) && this.isLocalOutgoing(kept)) {
            this.outgoingMessages.set(tid, kept);
          }
        } else {
          updated[index] = { ...existing, ...msg, is_me: existing.is_me ?? msg.is_me, is_pending: false, delivery_status: 'sent' };
          if (tid) this.outgoingMessages.delete(tid);
        }
        this.activeMessages$.next(updated);
      }
    }

    // به‌روزرسانی زنده آخرین پیام در لیست مکالمات
    const updatedConvs = this.conversations$.value.map(c => {
      if (String(c.id) === msgConvId && c.last_message && String(c.last_message.id) === String(msg.id)) {
        return {
          ...c,
          last_message: {
            ...c.last_message,
            text: msg.text || '',
            has_attachment: (msg.attachments && msg.attachments.length > 0) || false
          }
        };
      }
      return c;
    });
    this.conversations$.next(updatedConvs);
  }

  // ─── عملیات کامنت‌های تعاملی اسناد و کالاها (Contextual Comments) ───

  public subscribeComments(modelName: string, objectId: string): void {
    const key = `${modelName}:${objectId}`;
    this.activeCommentSubscriptions.add(key);

    if (this.commentWs && this.commentWs.readyState === WebSocket.OPEN) {
      this.commentWs.send(JSON.stringify({
        type: 'subscribe_comments',
        content_type: modelName,
        model: modelName,
        object_id: objectId
      }));
    }
  }

  public unsubscribeComments(modelName: string, objectId: string): void {
    const key = `${modelName}:${objectId}`;
    this.activeCommentSubscriptions.delete(key);

    if (this.commentWs && this.commentWs.readyState === WebSocket.OPEN) {
      this.commentWs.send(JSON.stringify({
        type: 'unsubscribe_comments',
        content_type: modelName,
        model: modelName,
        object_id: objectId
      }));
    }
  }

  public async getComments(modelName: string, objectId: string): Promise<GenericComment[]> {
    const params = new HttpParams()
      .set('model_name', modelName)
      .set('object_id', objectId);

    try {
      const res: any = await firstValueFrom(
        this.http.get<any>('/api/communications/comments/', {
          params,
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
        })
      );
      return res.results || res || [];
    } catch {
      return [];
    }
  }

  public async postComment(
    modelName: string,
    objectId: string,
    text: string,
    mentionedUserIds: number[] = [],
    parent?: string,
    appLabel: string = 'inventory',
    clientTempId?: string
  ): Promise<GenericComment> {
    const payload = {
      content_type_str: `${appLabel}.${modelName}`,
      object_id: objectId,
      text: text,
      mentioned_user_ids: mentionedUserIds,
      parent: parent,
      client_temp_id: clientTempId
    };

    return await firstValueFrom(
      this.http.post<GenericComment>('/api/communications/comments/', payload)
    );
  }

  public async getContacts(warehouseId?: number): Promise<UserShort[]> {
    let params = new HttpParams();
    if (warehouseId) params = params.set('warehouse_id', warehouseId.toString());

    try {
      return await firstValueFrom(
        this.http.get<UserShort[]>('/api/communications/contacts/', {
          params,
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
        })
      );
    } catch {
      return [];
    }
  }

  // ─── امکانات اعلان‌ها و صوت ───
  public toggleMute(): void {
    const newMuted = !this.isMuted();
    this.isMuted.set(newMuted);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('wh_chat_muted', String(newMuted));
    }
  }

  private audioCtx: AudioContext | null = null;
  private initAudio(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }

      // باز کردن قفل ساسپند مرورگر با اولین کلیک یا لمس صفحه
      const unlockAudio = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('click', unlockAudio, { passive: true, once: true });
        window.addEventListener('keydown', unlockAudio, { passive: true, once: true });
        window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
      }
    } catch (e) {}
  }

  public playNotificationSound(): void {
    if (this.isMuted()) return;

    // روش ۱: استفاده از Web Audio API با ملودی سه‌گانه واضح
    try {
      if (!this.audioCtx) this.initAudio();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.audioCtx && this.audioCtx.state === 'running') {
        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5
        osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.22); // C6

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
        return;
      }
    } catch (e) {}

    // روش ۲ (Fallback): پخش با آبجکت صوتی مرورگر
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbqWE1MV2U2/DCiFcxK12c5vfVpFw0LVmN4PLm1Lp9UDcsV3/b8evhwG09MEl73fLz7OG4akEvUGrV8vj17NmwYDYtT23M7/n8+Pfy361kPS9McsPt+Pn69+/er2E4LlVywOz3+fv58NmsZDsuTHG/6/X1+Pn0469bNCxSbb/m7/b19fLYqF8yKlBt");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  public async requestNotificationPermission(): Promise<void> {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }
  }

  private showBrowserNotification(title: string, body: string): void {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: '/favicon.ico'
        });
      } catch (e) {}
    }
  }
}
