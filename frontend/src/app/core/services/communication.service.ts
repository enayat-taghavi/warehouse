import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient, HttpParams, HttpContext } from '@angular/common/http';
import { BehaviorSubject, Subject, Observable, firstValueFrom } from 'rxjs';
import { ImageCompressorService } from './image-compressor.service';
import { ConfigApiService } from '../api/config-api.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { wsUrl } from '../platform/server-origin';

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
  thumbnail?: string;
  file_url?: string;
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  client_temp_id?: string;
  conversation: string;
  sender: number;
  sender_details?: UserShort;
  text?: string;
  reply_to?: string;
  is_system?: boolean;
  created_at: string;
  updated_at?: string;
  attachments?: MessageAttachment[];
  is_me?: boolean;
  read_by_count?: number;
  is_pending?: boolean; // برای Optimistic UI
  delivery_status?: 'pending' | 'sent' | 'failed';
}

export interface Conversation {
  id: string;
  title?: string;
  conv_type: 'direct' | 'warehouse_group' | 'announcement';
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

    if (isChatAlive && isCommentAlive && this.currentWarehouseId === warehouseId) {
      return;
    }

    this.connectSockets(warehouseId);
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

    // بستن سوکت‌های قبلی پیش از ایجاد کانکشن جدید
    if (this.chatWs) {
      try { this.chatWs.close(); } catch {}
      this.chatWs = null;
    }
    if (this.commentWs) {
      try { this.commentWs.close(); } catch {}
      this.commentWs = null;
    }

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
      this.chatWs = new WebSocket(url);

      this.chatWs.onopen = () => {
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        // ارسال توکن در پیام اول جهت ارتقای امنیت و عدم نشت توکن در لاگ سرورها و پروکسی‌ها
        if (this.chatWs && this.chatWs.readyState === WebSocket.OPEN) {
          this.chatWs.send(JSON.stringify({
            type: 'authenticate',
            token: token
          }));
        }
      };

      this.chatWs.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'authenticated') {
            this.refreshPresence();
            const active = this.activeConversation$.value;
            if (active && this.chatWs && this.chatWs.readyState === WebSocket.OPEN) {
              this.chatWs.send(JSON.stringify({
                type: 'join_conversation',
                conversation_id: active.id
              }));
            }
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

      this.chatWs.onclose = () => {
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
      this.commentWs = new WebSocket(url);

      this.commentWs.onopen = () => {
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        // ارسال توکن در پیام اول جهت امنیت و عدم نشت توکن در لاگ‌ها
        if (this.commentWs && this.commentWs.readyState === WebSocket.OPEN) {
          this.commentWs.send(JSON.stringify({
            type: 'authenticate',
            token: token
          }));
        }
      };

      this.commentWs.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'authenticated') {
            // اشتراک مجدد در تمام روم‌های فعال کامنت پس از تایید احراز هویت
            if (this.commentWs && this.commentWs.readyState === WebSocket.OPEN) {
              for (const sub of this.activeCommentSubscriptions) {
                const [modelName, objectId] = sub.split(':');
                if (modelName && objectId) {
                  this.commentWs.send(JSON.stringify({
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

      this.commentWs.onclose = () => {
        if (!this.isDestroyed && this.isChatEnabled()) {
          this.scheduleReconnect();
        }
      };
    } catch (e) {
      console.warn('[CommentSocket] connection error', e);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    if (this.chatWs) {
      try { this.chatWs.close(); } catch {}
      this.chatWs = null;
    }
    if (this.commentWs) {
      try { this.commentWs.close(); } catch {}
      this.commentWs = null;
    }
    this.onlineUsers.set(new Set());
  }

  private startHeartbeat(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.lastPongTime = Date.now();

    this.pingInterval = setInterval(() => {
      // تشخیص سوکت مرده: اگر بیش از ۷۵ ثانیه پونگ دریافت نشده باشد
      if (Date.now() - this.lastPongTime > 75000) {
        console.warn('[CommunicationService] Dead socket detected (missed pong), reconnecting...');
        if (this.chatWs) try { this.chatWs.close(); } catch {}
        if (this.commentWs) try { this.commentWs.close(); } catch {}
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
      this.activeMessages$.next(messages.reverse());
    } catch (err) {
      console.debug('[CommunicationService] Failed to load messages', err);
    }
  }

  /**
   * بارگذاری پیام‌های قدیمی‌تر (Infinite Scroll)
   */
  public async loadOlderMessages(conversationId: string, offset: number, limit = 30): Promise<ChatMessage[]> {
    try {
      const params = new HttpParams()
        .set('conversation_id', conversationId)
        .set('limit', limit.toString())
        .set('offset', offset.toString());

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

  public async sendMessage(conversationId: string, text: string, replyTo?: string, file?: File): Promise<void> {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
      delivery_status: 'pending'
    };

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
          text: text || (file ? '📎 فایل پیوست' : ''),
          sender_name: 'شما',
          created_at: new Date().toISOString(),
          has_attachment: !!file
        }
      };
      this.conversations$.next([updatedConv, ...otherConvs]);
    }

    try {
      const payload: any = {
        conversation: conversationId,
        text: text,
        client_temp_id: tempId,
        reply_to: replyTo
      };

      const response: any = await firstValueFrom(
        this.http.post<ChatMessage>('/api/communications/messages/', payload)
      );

      // اگر آفلاین است و اینترسپتور پاسخ _offlinePending برگردانده باشد
      if (response && response._offlinePending) {
        const updated = this.activeMessages$.value.map(m =>
          m.client_temp_id === tempId ? { ...m, is_pending: true, delivery_status: 'pending' as const } : m
        );
        this.activeMessages$.next(updated);
        return;
      }

      const savedMsg: ChatMessage = response;

      // اگر فایلی وجود دارد، آن را فشرده کرده و آپلود می‌کنیم
      if (file && savedMsg && savedMsg.id) {
        try {
          const att = await this.uploadAttachment(file, savedMsg.id);
          savedMsg.attachments = [att];
        } catch (e) {
          console.warn('[CommunicationService] Attachment upload failed, will be retried', e);
        }
      }

      // جایگزینی پیام خوش‌بینانه با پیام نهایی
      const updated = this.activeMessages$.value.map(m =>
        m.client_temp_id === tempId ? { ...savedMsg, is_me: true, is_pending: false, delivery_status: 'sent' as const } : m
      );
      this.activeMessages$.next(updated);
    } catch (err) {
      console.error('[CommunicationService] Failed to send message', err);
      // متن کاربر هرگز دور ریخته نمی‌شود؛ وضعیت به failed تغییر می‌کند
      const updated = this.activeMessages$.value.map(m =>
        m.client_temp_id === tempId ? { ...m, is_pending: false, delivery_status: 'failed' as const } : m
      );
      this.activeMessages$.next(updated);
    }
  }

  public async retryMessage(tempId: string, file?: File): Promise<void> {
    const msg = this.activeMessages$.value.find(m => m.client_temp_id === tempId || m.id === tempId);
    if (!msg) return;

    // تغییر وضعیت به pending
    const pendingMsgs = this.activeMessages$.value.map(m =>
      (m.client_temp_id === tempId || m.id === tempId) ? { ...m, is_pending: true, delivery_status: 'pending' as const } : m
    );
    this.activeMessages$.next(pendingMsgs);

    try {
      const payload: any = {
        conversation: msg.conversation,
        text: msg.text || '',
        client_temp_id: msg.client_temp_id || tempId,
        reply_to: msg.reply_to
      };

      const response: any = await firstValueFrom(
        this.http.post<ChatMessage>('/api/communications/messages/', payload)
      );

      if (response && response._offlinePending) {
        return;
      }

      const savedMsg: ChatMessage = response;
      if (file && savedMsg && savedMsg.id) {
        try {
          const att = await this.uploadAttachment(file, savedMsg.id);
          savedMsg.attachments = [att];
        } catch (e) {
          console.warn('[CommunicationService] Retry attachment upload failed', e);
        }
      }

      const updated = this.activeMessages$.value.map(m =>
        (m.client_temp_id === tempId || m.id === tempId) ? { ...savedMsg, is_me: true, is_pending: false, delivery_status: 'sent' as const } : m
      );
      this.activeMessages$.next(updated);
    } catch (err) {
      console.error('[CommunicationService] Retry failed', err);
      const updated = this.activeMessages$.value.map(m =>
        (m.client_temp_id === tempId || m.id === tempId) ? { ...m, is_pending: false, delivery_status: 'failed' as const } : m
      );
      this.activeMessages$.next(updated);
    }
  }

  public async uploadAttachment(file: File, messageId: string): Promise<MessageAttachment> {
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

    return await firstValueFrom(
      this.http.post<MessageAttachment>('/api/communications/messages/upload/', formData)
    );
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

  public sendTypingStatus(conversationId: string, isTyping: boolean): void {
    if (!conversationId || String(conversationId).startsWith('draft_')) return;
    if (this.chatWs && this.chatWs.readyState === WebSocket.OPEN) {
      this.chatWs.send(JSON.stringify({
        type: 'typing',
        conversation_id: conversationId,
        is_typing: isTyping
      }));
    }
  }

  private handleReadReceipt(data: { conversation_id: string; reader_id: number; reader_name?: string }): void {
    const currentUserId = this.getCurrentUserId();
    // اگر خواننده پیام خودِ کاربر جاری باشد، وضعیت تیک پیام‌های من نباید تغییر کند (تنها وقتی طرف مقابل می‌خواند ۲ تیک می‌شود)
    if (currentUserId !== null && Number(data.reader_id) === currentUserId) {
      return;
    }

    const active = this.activeConversation$.value;
    if (active && String(active.id) === String(data.conversation_id)) {
      const currentMsgs = this.activeMessages$.value;
      const updated = currentMsgs.map(m => {
        if (m.is_me) {
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
    const isCurrentlyViewing = this.isChatDrawerOpen() && active && String(active.id) === msgConvId;

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
            text: msg.text || (msg.attachments && msg.attachments.length > 0 ? '📎 فایل پیوست' : ''),
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
        updated[index] = { ...updated[index], ...msg, is_me: updated[index].is_me ?? msg.is_me, is_pending: false, delivery_status: 'sent' };
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
            text: msg.text || (msg.attachments && msg.attachments.length > 0 ? '📎 فایل پیوست' : ''),
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
