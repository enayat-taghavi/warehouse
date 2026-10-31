// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { CommunicationService, ChatMessage } from './communication.service';
import { ImageCompressorService } from './image-compressor.service';
import { ConfigApiService } from '../api/config-api.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CommunicationService', () => {
  let service: CommunicationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CommunicationService,
        ImageCompressorService,
        {
          provide: ConfigApiService,
          useValue: {
            getPublicConfig: () => of({ system_version: '1.0.0', system_name: 'Warehouse', chat_enabled: true })
          }
        },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(CommunicationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.disconnect();
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with default states', () => {
    expect(service.isChatDrawerOpen()).toBe(false);
    expect(service.isChatEnabled()).toBe(true);
    expect(service.totalUnreadCount()).toBe(0);
  });

  it('should toggle mute state correctly', () => {
    const initialMute = service.isMuted();
    service.toggleMute();
    expect(service.isMuted()).toBe(!initialMute);
    service.toggleMute();
    expect(service.isMuted()).toBe(initialMute);
  });

  it('should handle getComments API request', async () => {
    const promise = service.getComments('item', '101');
    const req = httpMock.expectOne(req => req.url === '/api/communications/comments/' && req.params.get('model_name') === 'item');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: '1', text: 'تست کامنت', object_id: '101', author: 1, created_at: new Date().toISOString() }]);

    const comments = await promise;
    expect(comments.length).toBe(1);
    expect(comments[0].text).toBe('تست کامنت');
  });

  it('should handle getContacts API request with scoping', async () => {
    const promise = service.getContacts(1);
    const req = httpMock.expectOne(req => req.url === '/api/communications/contacts/' && req.params.get('warehouse_id') === '1');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 2, username: 'manager_wh1', full_name: 'مدیر انبار ۱' },
      { id: 3, username: 'staff_wh1', full_name: 'کارمند انبار ۱' }
    ]);

    const contacts = await promise;
    expect(contacts.length).toBe(2);
    expect(contacts[0].username).toBe('manager_wh1');
  });

  it('should set optimistic pending message with client_temp_id and transition to sent on HTTP 201', async () => {
    const promise = service.sendMessage('conv-1', 'سلام تست');
    
    // ۱. بررسی پیام خوش‌بینانه در استیت اولیه
    const initialMsgs = service.activeMessages$.value;
    expect(initialMsgs.length).toBe(1);
    expect(initialMsgs[0].text).toBe('سلام تست');
    expect(initialMsgs[0].delivery_status).toBe('pending');
    expect(initialMsgs[0].is_pending).toBe(true);
    expect(initialMsgs[0].client_temp_id).toBeDefined();

    const tempId = initialMsgs[0].client_temp_id!;

    // ۲. پاسخ سرور با پیام ثبت‌شده
    const req = httpMock.expectOne('/api/communications/messages/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.client_temp_id).toBe(tempId);
    
    req.flush({
      id: '100',
      client_temp_id: tempId,
      conversation: 'conv-1',
      sender: 1,
      text: 'سلام تست',
      created_at: new Date().toISOString()
    });

    await promise;

    // ۳. بررسی ارتقای استیت به sent
    const finalMsgs = service.activeMessages$.value;
    expect(finalMsgs.length).toBe(1);
    expect(finalMsgs[0].id).toBe('100');
    expect(finalMsgs[0].delivery_status).toBe('sent');
    expect(finalMsgs[0].is_pending).toBe(false);
  });

  it('should preserve pending state without discarding message when offline response contains _offlinePending', async () => {
    const promise = service.sendMessage('conv-1', 'پیام در حالت آفلاین');

    const req = httpMock.expectOne('/api/communications/messages/');
    expect(req.request.method).toBe('POST');
    req.flush({ _offlinePending: true });

    await promise;

    const msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toBe('پیام در حالت آفلاین');
    expect(msgs[0].delivery_status).toBe('pending');
    expect(msgs[0].is_pending).toBe(true);
  });

  it('should mark delivery_status as failed without losing user text when request fails', async () => {
    const promise = service.sendMessage('conv-1', 'پیام با خطای ۵۰۰');

    const req = httpMock.expectOne('/api/communications/messages/');
    expect(req.request.method).toBe('POST');
    req.flush({ error: 'خطای سرور' }, { status: 500, statusText: 'Internal Server Error' });

    await promise;

    const msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toBe('پیام با خطای ۵۰۰');
    expect(msgs[0].delivery_status).toBe('failed');
    expect(msgs[0].is_pending).toBe(false);
  });

  it('should re-attempt failed message via retryMessage and transition to sent upon success', async () => {
    // ۱. مقداردهی اولیه پیام در حالت failed
    const failedMsg: ChatMessage = {
      id: 'temp-failed-123',
      client_temp_id: 'temp-failed-123',
      conversation: 'conv-1',
      sender: 1,
      text: 'پیام نیازمند تلاش مجدد',
      created_at: new Date().toISOString(),
      is_me: true,
      is_pending: false,
      delivery_status: 'failed'
    };
    service.activeMessages$.next([failedMsg]);

    // ۲. فراخوانی retryMessage
    const retryPromise = service.retryMessage('temp-failed-123');

    // ۳. بررسی بازگشت موقت به pending
    expect(service.activeMessages$.value[0].delivery_status).toBe('pending');
    expect(service.activeMessages$.value[0].is_pending).toBe(true);

    // ۴. دریافت و تایید پاسخ موفق
    const req = httpMock.expectOne('/api/communications/messages/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.client_temp_id).toBe('temp-failed-123');

    req.flush({
      id: '200',
      client_temp_id: 'temp-failed-123',
      conversation: 'conv-1',
      sender: 1,
      text: 'پیام نیازمند تلاش مجدد',
      created_at: new Date().toISOString()
    });

    await retryPromise;

    // ۵. بررسی وضعیت نهایی
    const resultMsgs = service.activeMessages$.value;
    expect(resultMsgs[0].id).toBe('200');
    expect(resultMsgs[0].delivery_status).toBe('sent');
    expect(resultMsgs[0].is_pending).toBe(false);
  });

  it('should update existing message in-place upon receiving chat.message.updated event', () => {
    // ۱. قرار دادن پیام اولیه در استیت
    const existingMsg: ChatMessage = {
      id: 'msg-50',
      conversation: 'conv-1',
      sender: 1,
      text: 'متن قبل از آپدیت',
      created_at: new Date().toISOString(),
      is_me: true,
      delivery_status: 'sent'
    };
    service.activeConversation$.next({
      id: 'conv-1',
      conv_type: 'direct',
      participants: [1, 2],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    service.activeMessages$.next([existingMsg]);

    // ۲. شبیه‌سازی دریافت رویداد chat.message.updated
    (service as any).handleUpdatedMessage({
      id: 'msg-50',
      conversation: 'conv-1',
      sender: 1,
      text: 'متن ویرایش‌شده جدید',
      created_at: existingMsg.created_at,
      updated_at: new Date().toISOString()
    });

    // ۳. بررسی به‌روزرسانی درجا بدون تکرار
    const msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(1);
    expect(msgs[0].text).toBe('متن ویرایش‌شده جدید');
  });

  it('should support loadOlderMessages and prepend them to activeMessages$ without duplicate', async () => {
    const initialMsg: ChatMessage = {
      id: 'msg-current-1',
      conversation: 'conv-1',
      sender: 1,
      text: 'پیام فعلی',
      created_at: new Date().toISOString()
    };
    service.activeMessages$.next([initialMsg]);

    const promise = service.loadOlderMessages('conv-1', 'msg-current-1', 30);
    const req = httpMock.expectOne(req => req.url === '/api/communications/messages/' && req.params.get('before_id') === 'msg-current-1');
    expect(req.request.method).toBe('GET');

    const olderMsg: ChatMessage = {
      id: 'msg-older-1',
      conversation: 'conv-1',
      sender: 2,
      text: 'پیام قدیمی‌تر',
      created_at: new Date(Date.now() - 60000).toISOString()
    };
    req.flush({ results: [olderMsg] });

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('msg-older-1');

    const combined = service.activeMessages$.value;
    expect(combined.length).toBe(2);
    expect(combined[0].id).toBe('msg-older-1');
    expect(combined[1].id).toBe('msg-current-1');
  });

  it('should manage comment subscriptions and support dynamic appLabel in postComment', async () => {
    service.subscribeComments('doctask', '55');
    expect((service as any).activeCommentSubscriptions.has('doctask:55')).toBe(true);

    service.unsubscribeComments('doctask', '55');
    expect((service as any).activeCommentSubscriptions.has('doctask:55')).toBe(false);

    const promise = service.postComment('item', '99', 'کامنت آزمایشی', [10], undefined, 'inventory');
    const req = httpMock.expectOne('/api/communications/comments/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.content_type_str).toBe('inventory.item');
    expect(req.request.body.mentioned_user_ids).toEqual([10]);
    req.flush({ id: 'cmt-1', text: 'کامنت آزمایشی', object_id: '99', author: 1, created_at: new Date().toISOString() });

    const saved = await promise;
    expect(saved.id).toBe('cmt-1');
  });

  it('should suppress audio playback for own messages (!msg.is_me)', () => {
    let playSoundCalled = false;
    service.playNotificationSound = () => { playSoundCalled = true; };
    service.getCurrentUserId = () => 1;

    // ارسال پیام خود کاربر (sender = 1)
    (service as any).handleNewMessage({
      id: 'my-msg-1',
      conversation: 'conv-1',
      sender: 1,
      text: 'پیام خودم',
      created_at: new Date().toISOString()
    });
    expect(playSoundCalled).toBe(false);

    // دریافت پیام کاربر دیگر (sender = 2)
    (service as any).handleNewMessage({
      id: 'other-msg-1',
      conversation: 'conv-1',
      sender: 2,
      text: 'پیام همکار',
      created_at: new Date().toISOString()
    });
    expect(playSoundCalled).toBe(true);
  });

  it('should handle read_receipt event and update read_by_count on own messages', () => {
    service.getCurrentUserId = () => 1;
    service.activeConversation$.next({ id: 'conv-1', conv_type: 'direct', is_active: true, participants: [1, 2], created_at: '', updated_at: '' });
    service.activeMessages$.next([
      { id: '1', conversation: 'conv-1', sender: 1, text: 'پیام اول من', is_me: true, read_by_count: 0, created_at: '' },
      { id: '2', conversation: 'conv-1', sender: 2, text: 'پیام مخاطب', is_me: false, read_by_count: 0, created_at: '' }
    ]);

    // ۱. رسید خوانده شدن توسط خودِ من نباید پیام‌های ارسالی من را ۲ تیک کند
    (service as any).handleReadReceipt({ conversation_id: 'conv-1', reader_id: 1 });
    expect(service.activeMessages$.value[0].read_by_count).toBe(0);

    // ۲. رسید خوانده شدن توسط مخاطب (کاربر ۲) باید پیام ارسالی من را ۲ تیک کند
    (service as any).handleReadReceipt({ conversation_id: 'conv-1', reader_id: 2, last_read_message_id: '1' });
    const updated = service.activeMessages$.value;
    expect(updated[0].read_by_count).toBe(1);
    expect(updated[1].read_by_count).toBe(0);
  });

  it('read_receipt marks only my messages up to last_read_message_id; null does nothing', () => {
    service.getCurrentUserId = () => 1;
    service.activeConversation$.next({ id: 'conv-1', conv_type: 'group', is_active: true, participants: [1, 2], created_at: '', updated_at: '' });
    service.activeMessages$.next([
      { id: '5', conversation: 'conv-1', sender: 1, is_me: true, read_by_count: 0, created_at: '' },
      { id: '9', conversation: 'conv-1', sender: 1, is_me: true, read_by_count: 0, created_at: '' },
      { id: '12', conversation: 'conv-1', sender: 1, is_me: true, read_by_count: 0, created_at: '' }
    ]);
    (service as any).handleReadReceipt({ conversation_id: 'conv-1', reader_id: 2, last_read_message_id: null });
    expect(service.activeMessages$.value.map(m => m.read_by_count)).toEqual([0, 0, 0]);
    // مقایسهٔ عددی: ۹ < ۱۰ (نه مقایسهٔ رشته‌ای)
    (service as any).handleReadReceipt({ conversation_id: 'conv-1', reader_id: 2, last_read_message_id: '10' });
    expect(service.activeMessages$.value.map(m => m.read_by_count)).toEqual([1, 1, 0]);
  });

  it('read_receipt from myself (other device) zeroes that conversation unread and does not mark messages', () => {
    service.getCurrentUserId = () => 1;
    service.conversations$.next([
      { id: 'conv-1', conv_type: 'direct', is_active: true, participants: [1, 2], unread_count: 3, created_at: '', updated_at: '' },
      { id: 'conv-2', conv_type: 'direct', is_active: true, participants: [1, 3], unread_count: 2, created_at: '', updated_at: '' }
    ]);
    service.activeConversation$.next(service.conversations$.value[0]);
    service.activeMessages$.next([{ id: '1', conversation: 'conv-1', sender: 1, is_me: true, read_by_count: 0, created_at: '' }]);
    (service as any).handleReadReceipt({ conversation_id: 'conv-1', reader_id: 1, last_read_message_id: '1' });
    expect(service.conversations$.value[0].unread_count).toBe(0);
    expect(service.conversations$.value[1].unread_count).toBe(2);
    expect(service.totalUnreadCount()).toBe(2);
    expect(service.activeMessages$.value[0].read_by_count).toBe(0);
  });

  it('own message from another device is appended once, silently, without unread', () => {
    let played = false;
    service.playNotificationSound = () => { played = true; };
    service.getCurrentUserId = () => 1;
    service.isChatDrawerOpen.set(false);
    service.conversations$.next([
      { id: 'conv-1', conv_type: 'direct', is_active: true, participants: [1, 2], unread_count: 0, created_at: '', updated_at: '' }
    ]);
    service.activeConversation$.next(service.conversations$.value[0]);
    service.activeMessages$.next([]);
    const raw = { id: '77', conversation: 'conv-1', sender: 1, is_me: true, text: 'از موبایل', created_at: new Date().toISOString() };
    (service as any).handleNewMessage(raw);
    (service as any).handleNewMessage(raw);
    expect(service.activeMessages$.value.length).toBe(1);
    expect(played).toBe(false);
    expect(service.conversations$.value[0].unread_count).toBe(0);
  });

  it('should activate hasNewIncomingPulse when incoming message arrives while drawer is closed', () => {
    service.isChatDrawerOpen.set(false);
    service.getCurrentUserId = () => 1;
    service.totalUnreadCount.set(0);
    service.hasNewIncomingPulse.set(false);

    (service as any).handleNewMessage({
      id: 'msg-99',
      conversation: 'conv-1',
      sender: 2,
      text: 'سلام پیام جدید',
      created_at: new Date().toISOString()
    });

    expect(service.totalUnreadCount()).toBe(1);
    expect(service.hasNewIncomingPulse()).toBe(true);
  });

  it('should handle chat.presence events to track online/offline status', () => {
    service.onlineUsers.set(new Set());
    expect(service.isUserOnline(10)).toBe(false);

    const wsMock: any = { send: () => {}, close: () => {} };
    (service as any).chatWs = wsMock;

    // شبیه‌سازی دریافت پیام آنلاین شدن کاربر 10
    const onlineMsg = {
      event: 'chat.presence',
      data: { user_id: 10, status: 'online' }
    };
    (service as any).initChatSocket('ws://mock');
    (service as any).chatWs.onmessage({ data: JSON.stringify(onlineMsg) });

    expect(service.isUserOnline(10)).toBe(true);
    expect(service.isUserOnline('10')).toBe(true);

    // شبیه‌سازی دریافت پیام آفلاین شدن کاربر 10
    const offlineMsg = {
      event: 'chat.presence',
      data: { user_id: 10, status: 'offline' }
    };
    (service as any).chatWs.onmessage({ data: JSON.stringify(offlineMsg) });

    expect(service.isUserOnline(10)).toBe(false);
  });

  it('should process chat.online_users snapshot and refreshPresence correctly', () => {
    let sentPayload: any = null;
    const wsMock: any = {
      send: (data: string) => { sentPayload = JSON.parse(data); },
      close: () => {},
      readyState: WebSocket.OPEN
    };
    (service as any).chatWs = wsMock;

    // استعلام وضعیت با refreshPresence
    service.refreshPresence();
    expect(sentPayload).toEqual({ type: 'get_online_users' });

    // دریافت اسنپ‌شات آنلاین‌ها
    const snapshotMsg = {
      event: 'chat.online_users',
      data: { user_ids: [1, 2, 6] }
    };
    (service as any).initChatSocket('ws://mock');
    (service as any).chatWs.onmessage({ data: JSON.stringify(snapshotMsg) });

    expect(service.isUserOnline(1)).toBe(true);
    expect(service.isUserOnline(2)).toBe(true);
    expect(service.isUserOnline(6)).toBe(true);
    expect(service.isUserOnline(99)).toBe(false);
  });

  it('should send leave_conversation when leaving or switching conversations', async () => {
    const sentPayloads: any[] = [];
    const wsMock: any = {
      send: (data: string) => { sentPayloads.push(JSON.parse(data)); },
      close: () => {},
      readyState: WebSocket.OPEN
    };
    (service as any).chatWs = wsMock;

    service.leaveConversation('conv-old');
    expect(sentPayloads).toContainEqual({
      type: 'leave_conversation',
      conversation_id: 'conv-old'
    });

    service.activeConversation$.next({ id: 'conv-1', conv_type: 'direct', is_active: true, participants: [1, 2], created_at: '', updated_at: '' });
    const openPromise = service.openConversation({ id: 'conv-2', conv_type: 'direct', is_active: true, participants: [1, 2], created_at: '', updated_at: '' });
    const req = httpMock.expectOne('/api/communications/messages/?conversation_id=conv-2&limit=50');
    req.flush({ count: 0, results: [] });
    await openPromise;

    expect(sentPayloads).toContainEqual({
      type: 'leave_conversation',
      conversation_id: 'conv-1'
    });
    expect(sentPayloads).toContainEqual({
      type: 'join_conversation',
      conversation_id: 'conv-2'
    });
  });

  it('should dedup duplicate message frames and increment unread count only once', () => {
    service.isChatDrawerOpen.set(false);
    service.getCurrentUserId = () => 1;
    service.conversations$.next([
      { id: 'conv-1', conv_type: 'direct', is_active: true, participants: [1, 2], unread_count: 0, created_at: '', updated_at: '' }
    ]);
    service.totalUnreadCount.set(0);

    const rawMsg = {
      id: 'msg-dup-100',
      conversation: 'conv-1',
      sender: 2,
      text: 'پیام تستی',
      created_at: new Date().toISOString()
    };

    // دریافت فریم اول
    (service as any).handleNewMessage(rawMsg);
    expect(service.totalUnreadCount()).toBe(1);
    expect(service.conversations$.value[0].unread_count).toBe(1);

    // دریافت فریم دوم (تکراری با همان شناسه)
    (service as any).handleNewMessage(rawMsg);
    // باید همچنان ۱ باشد و ۲ نشود
    expect(service.totalUnreadCount()).toBe(1);
    expect(service.conversations$.value[0].unread_count).toBe(1);
  });

  it('should move conversation to top of list upon incoming message', () => {
    service.isChatDrawerOpen.set(false);
    service.getCurrentUserId = () => 1;
    service.conversations$.next([
      { id: 'conv-1', conv_type: 'direct', is_active: true, participants: [1, 2], unread_count: 0, created_at: '', updated_at: '' },
      { id: 'conv-2', conv_type: 'direct', is_active: true, participants: [1, 3], unread_count: 0, created_at: '', updated_at: '' },
      { id: 'conv-3', conv_type: 'direct', is_active: true, participants: [1, 4], unread_count: 0, created_at: '', updated_at: '' }
    ]);

    // دریافت پیام در گفتگوی ردیف سوم (conv-3)
    (service as any).handleNewMessage({
      id: 'msg-new-3',
      conversation: 'conv-3',
      sender: 4,
      text: 'پیام فوری',
      created_at: new Date().toISOString()
    });

    const convs = service.conversations$.value;
    expect(convs[0].id).toBe('conv-3');
    expect(convs[0].last_message?.text).toBe('پیام فوری');
    expect(convs[1].id).toBe('conv-1');
    expect(convs[2].id).toBe('conv-2');
  });

  it('should move conversation to top of list when sending message', async () => {
    service.getCurrentUserId = () => 1;
    service.conversations$.next([
      { id: 'conv-1', conv_type: 'direct', is_active: true, participants: [1, 2], unread_count: 0, created_at: '', updated_at: '' },
      { id: 'conv-2', conv_type: 'direct', is_active: true, participants: [1, 3], unread_count: 0, created_at: '', updated_at: '' }
    ]);

    const sendPromise = service.sendMessage('conv-2', 'پیام جدید من');
    // بررسی انتقال فوری به بالای لیست حتی قبل از پاسخ سرور (Optimistic)
    expect(service.conversations$.value[0].id).toBe('conv-2');
    expect(service.conversations$.value[0].last_message?.text).toBe('پیام جدید من');

    const req = httpMock.expectOne('/api/communications/messages/');
    req.flush({ id: 'msg-real-2', conversation: 'conv-2', text: 'پیام جدید من', sender: 1, created_at: new Date().toISOString() });
    await sendPromise;

    expect(service.conversations$.value[0].id).toBe('conv-2');
  });

  // ─── مرحلهٔ ۱ سخت‌سازی چت: E1، E2، E7، E8، E16، E24 ───

  const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0));

  class FakeWS {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: FakeWS[] = [];
    readyState = 1;
    sent: any[] = [];
    onopen: any = null;
    onmessage: any = null;
    onerror: any = null;
    onclose: any = null;
    constructor(public url: string) { FakeWS.instances.push(this); }
    send(data: any) { this.sent.push(data); }
    close() {
      this.readyState = 3;
      // مثل مرورگر: اگر onclose هنوز وصل باشد، صدا زده می‌شود
      if (this.onclose) this.onclose({});
    }
  }

  const withFakeSockets = (fn: () => Promise<void> | void) => async () => {
    const original = (globalThis as any).WebSocket;
    (globalThis as any).WebSocket = FakeWS as any;
    FakeWS.instances = [];
    sessionStorage.setItem('wh_access_token', 'test-token');
    try {
      await fn();
    } finally {
      service.disconnect();
      sessionStorage.removeItem('wh_access_token');
      (globalThis as any).WebSocket = original;
    }
  };

  const conv = (id: string) => ({
    id, conv_type: 'direct' as const, participants: [1, 2], is_active: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });

  it('E1: keeps the file and marks failed when attachment upload fails; retry re-posts and uploads the kept file', async () => {
    service.getCurrentUserId = () => 1;
    const file = new File(['abc'], 'factor.txt', { type: 'text/plain' });
    const p = service.sendMessage('conv-1', 'فاکتور', undefined, file);
    const tempId = service.activeMessages$.value[0].client_temp_id!;
    expect(service.activeMessages$.value[0].pending_file_name).toBe('factor.txt');

    const post = httpMock.expectOne('/api/communications/messages/');
    // پیام دارای فایل نباید وارد صف آفلاین شود
    expect(post.request.context.get(SKIP_OFFLINE)).toBe(true);
    post.flush({ id: '300', client_temp_id: tempId, conversation: 'conv-1', sender: 1, text: 'فاکتور', created_at: new Date().toISOString() });
    await flushAsync();

    const upload = httpMock.expectOne('/api/communications/messages/upload/');
    upload.flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
    await p;

    let msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(1);
    expect(msgs[0].delivery_status).toBe('failed');
    expect(msgs[0].text).toBe('فاکتور');
    expect(msgs[0].client_temp_id).toBe(tempId);
    expect((service as any).pendingFiles.get(tempId)).toEqual([file]);

    const retry = service.retryMessage(tempId);
    expect(service.activeMessages$.value[0].delivery_status).toBe('pending');
    const post2 = httpMock.expectOne('/api/communications/messages/');
    expect(post2.request.body.client_temp_id).toBe(tempId);
    post2.flush({ id: '300', client_temp_id: tempId, conversation: 'conv-1', sender: 1, text: 'فاکتور', created_at: new Date().toISOString() });
    await flushAsync();

    const upload2 = httpMock.expectOne('/api/communications/messages/upload/');
    const body = upload2.request.body as FormData;
    expect((body.get('file') as File).name).toBe('factor.txt');
    expect(body.get('message_id')).toBe('300');
    upload2.flush({ id: 'att-1', file_name: 'factor.txt', file_size: 3, content_type: 'text/plain' });
    await retry;

    msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(1);
    expect(msgs[0].delivery_status).toBe('sent');
    expect(msgs[0].attachments?.length).toBe(1);
    expect((service as any).pendingFiles.has(tempId)).toBe(false);
  });

  it('E1: keeps text and file as failed when the message POST itself fails (server unreachable)', async () => {
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
    const p = service.sendMessage('conv-1', 'متن', undefined, file);
    const tempId = service.activeMessages$.value[0].client_temp_id!;
    httpMock.expectOne('/api/communications/messages/').flush(null, { status: 503, statusText: 'Unavailable' });
    await p;
    const m = service.activeMessages$.value[0];
    expect(m.delivery_status).toBe('failed');
    expect(m.text).toBe('متن');
    expect((service as any).pendingFiles.get(tempId)).toEqual([file]);
  });

  it('U11: several files upload one by one; a failed file keeps the rest and retry skips the confirmed ones', async () => {
    service.getCurrentUserId = () => 1;
    const f1 = new File(['1'], 'a.txt', { type: 'text/plain' });
    const f2 = new File(['2'], 'b.txt', { type: 'text/plain' });
    const f3 = new File(['3'], 'c.txt', { type: 'text/plain' });
    const p = service.sendMessage('conv-1', '', undefined, [f1, f2, f3]);
    const tempId = service.activeMessages$.value[0].client_temp_id!;
    expect(service.activeMessages$.value[0].upload_total).toBe(3);
    const saved = { id: '400', client_temp_id: tempId, conversation: 'conv-1', sender: 1, text: '', created_at: new Date().toISOString() };
    httpMock.expectOne('/api/communications/messages/').flush(saved);
    await flushAsync();

    const up1 = httpMock.expectOne('/api/communications/messages/upload/');
    expect(((up1.request.body as FormData).get('file') as File).name).toBe('a.txt');
    up1.flush({ id: 'att-a', file_name: 'a.txt', file_size: 1, content_type: 'text/plain' });
    await flushAsync();
    const up2 = httpMock.expectOne('/api/communications/messages/upload/');
    expect(((up2.request.body as FormData).get('file') as File).name).toBe('b.txt');
    up2.flush(null, { status: 503, statusText: 'Unavailable' });
    await p;

    let m = service.activeMessages$.value[0];
    expect(m.delivery_status).toBe('failed');
    expect(m.attachments?.length).toBe(1);
    expect(m.pending_file_name).toContain('b.txt');
    expect(m.pending_file_name).toContain('c.txt');
    expect(m.pending_file_name).not.toContain('a.txt');
    expect((service as any).pendingFiles.get(tempId)).toEqual([f1, f2, f3]);

    // تلاش مجدد: سرور همان پیام را با پیوست اول برمی‌گرداند؛ فقط b و c فرستاده می‌شوند
    const retry = service.retryMessage(tempId);
    httpMock.expectOne('/api/communications/messages/').flush({ ...saved, attachments: [{ id: 'att-a', file_name: 'a.txt', file_size: 1, content_type: 'text/plain' }] });
    await flushAsync();
    const up3 = httpMock.expectOne('/api/communications/messages/upload/');
    expect(((up3.request.body as FormData).get('file') as File).name).toBe('b.txt');
    up3.flush({ id: 'att-b', file_name: 'b.txt', file_size: 1, content_type: 'text/plain' });
    await flushAsync();
    const up4 = httpMock.expectOne('/api/communications/messages/upload/');
    expect(((up4.request.body as FormData).get('file') as File).name).toBe('c.txt');
    up4.flush({ id: 'att-c', file_name: 'c.txt', file_size: 1, content_type: 'text/plain' });
    await retry;

    m = service.activeMessages$.value[0];
    expect(m.delivery_status).toBe('sent');
    expect(m.attachments?.map(a => a.id)).toEqual(['att-a', 'att-b', 'att-c']);
    expect(m.upload_progress).toBeUndefined();
    expect((service as any).pendingFiles.has(tempId)).toBe(false);
    httpMock.expectNone('/api/communications/messages/upload/');
  });

  it('U11: retry does not re-upload files the server already has (lost upload response)', async () => {
    service.getCurrentUserId = () => 1;
    const f1 = new File(['1'], 'a.txt', { type: 'text/plain' });
    const f2 = new File(['2'], 'b.txt', { type: 'text/plain' });
    const p = service.sendMessage('conv-1', 'x', undefined, [f1, f2]);
    const tempId = service.activeMessages$.value[0].client_temp_id!;
    const saved = { id: '401', client_temp_id: tempId, conversation: 'conv-1', sender: 1, text: 'x', created_at: new Date().toISOString() };
    httpMock.expectOne('/api/communications/messages/').flush(saved);
    await flushAsync();
    httpMock.expectOne('/api/communications/messages/upload/').flush(null, { status: 502, statusText: 'Bad Gateway' });
    await p;
    expect(service.activeMessages$.value[0].delivery_status).toBe('failed');

    const retry = service.retryMessage(tempId);
    const both = [
      { id: 'att-a', file_name: 'a.txt', file_size: 1, content_type: 'text/plain' },
      { id: 'att-b', file_name: 'b.txt', file_size: 1, content_type: 'text/plain' }
    ];
    httpMock.expectOne('/api/communications/messages/').flush({ ...saved, attachments: both });
    await retry;
    httpMock.expectNone('/api/communications/messages/upload/');
    const m = service.activeMessages$.value[0];
    expect(m.delivery_status).toBe('sent');
    expect(m.attachments?.length).toBe(2);
    expect((service as any).pendingFiles.has(tempId)).toBe(false);
  });

  it('U11: cancelling an upload keeps the message failed with all its files for retry', async () => {
    service.getCurrentUserId = () => 1;
    const f1 = new File(['1'], 'a.txt', { type: 'text/plain' });
    const p = service.sendMessage('conv-1', 'x', undefined, [f1]);
    const tempId = service.activeMessages$.value[0].client_temp_id!;
    httpMock.expectOne('/api/communications/messages/').flush({ id: '402', client_temp_id: tempId, conversation: 'conv-1', sender: 1, text: 'x', created_at: new Date().toISOString() });
    await flushAsync();
    const up = httpMock.expectOne('/api/communications/messages/upload/');
    expect(service.activeMessages$.value[0].upload_progress).toBe(0);
    service.cancelUpload(tempId);
    await p;
    expect(up.cancelled).toBe(true);
    const m = service.activeMessages$.value[0];
    expect(m.delivery_status).toBe('failed');
    expect(m.failure_reason).toBeTruthy();
    expect(m.pending_file_name).toBe('a.txt');
    expect((service as any).pendingFiles.get(tempId)).toEqual([f1]);
  });

  it('E2: loadMessages merges server list with local failed/pending messages and restores them after switching conversation', async () => {
    service.getCurrentUserId = () => 1;
    service.activeConversation$.next(conv('conv-1'));
    const p = service.sendMessage('conv-1', 'پیام ناموفق');
    httpMock.expectOne('/api/communications/messages/').flush({}, { status: 400, statusText: 'Bad Request' });
    await p;
    expect(service.activeMessages$.value[0].delivery_status).toBe('failed');

    const serverMsg = { id: '1', conversation: 'conv-1', sender: 2, text: 'سلام', created_at: new Date().toISOString() };
    let load = service.loadMessages('conv-1');
    httpMock.expectOne(r => r.url === '/api/communications/messages/' && r.params.get('conversation_id') === 'conv-1').flush([serverMsg]);
    await load;
    let msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(2);
    expect(msgs[0].id).toBe('1');
    expect(msgs[1].text).toBe('پیام ناموفق');
    expect(msgs[1].delivery_status).toBe('failed');

    // رفتن به گفتگوی دیگر و برگشتن
    service.activeConversation$.next(conv('conv-2'));
    load = service.loadMessages('conv-2');
    httpMock.expectOne(r => r.params.get('conversation_id') === 'conv-2').flush([]);
    await load;
    expect(service.activeMessages$.value.length).toBe(0);

    service.activeConversation$.next(conv('conv-1'));
    load = service.loadMessages('conv-1');
    httpMock.expectOne(r => r.params.get('conversation_id') === 'conv-1').flush([serverMsg]);
    await load;
    msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(2);
    expect(msgs[1].delivery_status).toBe('failed');
  });

  it('E2: a pending message already accepted by the server (same client_temp_id) is not duplicated', async () => {
    service.getCurrentUserId = () => 1;
    service.activeConversation$.next(conv('conv-1'));
    const p = service.sendMessage('conv-1', 'آفلاین');
    const tempId = service.activeMessages$.value[0].client_temp_id!;
    httpMock.expectOne('/api/communications/messages/').flush({ _offlinePending: true });
    await p;
    expect(service.activeMessages$.value[0].delivery_status).toBe('pending');

    const load = service.loadMessages('conv-1');
    httpMock.expectOne(r => r.params.get('conversation_id') === 'conv-1')
      .flush([{ id: '9', client_temp_id: tempId, conversation: 'conv-1', sender: 1, text: 'آفلاین', created_at: new Date().toISOString() }]);
    await load;
    const msgs = service.activeMessages$.value;
    expect(msgs.length).toBe(1);
    expect(msgs[0].id).toBe('9');
    expect((service as any).outgoingMessages.has(tempId)).toBe(false);
  });

  it('E7: closing an old socket (reconnect or disconnect) never schedules a reconnect', withFakeSockets(() => {
    service.connectSockets();
    const firstChat = FakeWS.instances[0];
    const firstComment = FakeWS.instances[1];
    service.connectSockets();
    expect(firstChat.readyState).toBe(3);
    expect(firstComment.readyState).toBe(3);
    expect(firstChat.onclose).toBeNull();
    expect((service as any).reconnectTimer).toBeNull();
    expect((service as any).chatWs).toBe(FakeWS.instances[2]);

    service.disconnect();
    expect((service as any).reconnectTimer).toBeNull();
    expect((service as any).chatWs).toBeNull();
    expect((service as any).commentWs).toBeNull();
    expect(FakeWS.instances[2].readyState).toBe(3);
  }));

  it('E7: an unexpected close of the current socket still schedules a reconnect', withFakeSockets(() => {
    service.connectSockets();
    FakeWS.instances[0].close();
    expect((service as any).reconnectTimer).not.toBeNull();
  }));

  it('E8: after a RE-connect the active conversation is synced with since_id and merged without duplicates', withFakeSockets(async () => {
    service.getCurrentUserId = () => 1;
    service.connectSockets();
    FakeWS.instances[0].onmessage({ data: JSON.stringify({ type: 'authenticated' }) });
    httpMock.expectNone(r => r.params.has('since_id'));

    service.activeConversation$.next(conv('conv-1'));
    const m10 = { id: '10', conversation: 'conv-1', sender: 2, text: 'قبلی', created_at: new Date().toISOString() };
    service.activeMessages$.next([m10]);

    service.connectSockets();
    FakeWS.instances[2].onmessage({ data: JSON.stringify({ type: 'authenticated' }) });
    const req = httpMock.expectOne(r => r.url === '/api/communications/messages/' && r.params.get('since_id') === '10');
    expect(req.request.params.get('conversation_id')).toBe('conv-1');
    req.flush([{ id: '11', conversation: 'conv-1', sender: 2, text: 'جاافتاده', created_at: new Date().toISOString() }, m10]);
    await flushAsync();
    httpMock.expectOne(r => r.url === '/api/communications/conversations/').flush([]);
    await flushAsync();

    expect(service.activeMessages$.value.map(m => m.id)).toEqual(['10', '11']);
  }));

  it('E24: resetForLogout closes both sockets without reconnect and clears in-memory state', withFakeSockets(() => {
    service.connectSockets();
    const chat = FakeWS.instances[0];
    const comment = FakeWS.instances[1];
    service.conversations$.next([conv('conv-1')]);
    service.activeConversation$.next(conv('conv-1'));
    service.activeMessages$.next([{ id: '1', conversation: 'conv-1', sender: 2, created_at: '' }]);
    service.onlineUsers.set(new Set([2, 3]));
    service.isChatDrawerOpen.set(true);
    (service as any).processedIncomingMessageIds.add('1');
    (service as any).playedMessageIds.add('1');
    (service as any).pendingFiles.set('t1', [new File(['a'], 'a.txt')]);

    expect(() => service.resetForLogout()).not.toThrow();

    expect(chat.readyState).toBe(3);
    expect(comment.readyState).toBe(3);
    expect((service as any).chatWs).toBeNull();
    expect((service as any).commentWs).toBeNull();
    expect((service as any).reconnectTimer).toBeNull();
    expect(service.conversations$.value).toEqual([]);
    expect(service.activeConversation$.value).toBeNull();
    expect(service.activeMessages$.value).toEqual([]);
    expect(service.onlineUsers().size).toBe(0);
    expect(service.isChatDrawerOpen()).toBe(false);
    expect((service as any).processedIncomingMessageIds.size).toBe(0);
    expect((service as any).playedMessageIds.size).toBe(0);
    expect((service as any).pendingFiles.size).toBe(0);
  }));

  it('E24: ensureConnected opens a fresh connection and drops old state when the logged-in user changed', withFakeSockets(() => {
    service.getCurrentUserId = () => 1;
    service.ensureConnected();
    const firstChat = FakeWS.instances[0];
    service.conversations$.next([conv('conv-1')]);

    service.ensureConnected();
    expect((service as any).chatWs).toBe(firstChat);

    service.getCurrentUserId = () => 2;
    service.ensureConnected();
    expect((service as any).chatWs).not.toBe(firstChat);
    expect(firstChat.readyState).toBe(3);
    expect(service.conversations$.value).toEqual([]);
    expect((service as any).reconnectTimer).toBeNull();
  }));

  it('E16: does not mark as read while the page is hidden, even with the drawer open', () => {
    service.getCurrentUserId = () => 1;
    service.isChatDrawerOpen.set(true);
    service.activeConversation$.next(conv('conv-1'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      (service as any).handleNewMessage({ id: 'm1', conversation: 'conv-1', sender: 2, text: 'سلام', created_at: new Date().toISOString() });
      expect((service as any).markReadDebounceTimers.size).toBe(0);
      expect(service.activeMessages$.value.some(m => m.id === 'm1')).toBe(true);
    } finally {
      delete (document as any).visibilityState;
    }

    (service as any).handleNewMessage({ id: 'm2', conversation: 'conv-1', sender: 2, text: 'دوباره', created_at: new Date().toISOString() });
    expect((service as any).markReadDebounceTimers.size).toBe(1);
    service.resetForLogout();
  });

  // ─── اصلاحات بازبینی داده (data-loss review) ───

  const failUploadOnce = async (tempIdHolder: { id?: string }, file: File) => {
    service.activeConversation$.next(conv('conv-1'));
    const p = service.sendMessage('conv-1', 'با فایل', undefined, file);
    tempIdHolder.id = service.activeMessages$.value[service.activeMessages$.value.length - 1].client_temp_id!;
    httpMock.expectOne('/api/communications/messages/')
      .flush({ id: '500', client_temp_id: tempIdHolder.id, conversation: 'conv-1', sender: 1, text: 'با فایل', created_at: new Date().toISOString() });
    await flushAsync();
    httpMock.expectOne('/api/communications/messages/upload/').flush(null, { status: 503, statusText: 'Unavailable' });
    await p;
  };

  it('R1: chat.message.updated keeps the failed state while the file is still waiting for upload', async () => {
    service.getCurrentUserId = () => 1;
    const holder: { id?: string } = {};
    await failUploadOnce(holder, new File(['x'], 'f.txt', { type: 'text/plain' }));
    expect(service.activeMessages$.value[0].delivery_status).toBe('failed');

    (service as any).handleUpdatedMessage({ id: '500', client_temp_id: holder.id, conversation: 'conv-1', sender: 1, text: 'ویرایش‌شده', created_at: new Date().toISOString() });
    const m = service.activeMessages$.value[0];
    expect(m.text).toBe('ویرایش‌شده');
    expect(m.delivery_status).toBe('failed');
    expect((service as any).pendingFiles.has(holder.id)).toBe(true);
  });

  it('R2: retry does not upload again when the re-POST shows the attachment already reached the server', async () => {
    service.getCurrentUserId = () => 1;
    const holder: { id?: string } = {};
    await failUploadOnce(holder, new File(['x'], 'f.txt', { type: 'text/plain' }));

    const retry = service.retryMessage(holder.id!);
    httpMock.expectOne('/api/communications/messages/').flush({
      id: '500', client_temp_id: holder.id, conversation: 'conv-1', sender: 1, text: 'با فایل', created_at: new Date().toISOString(),
      attachments: [{ id: 'att-9', file_name: 'f.txt', file_size: 1, content_type: 'text/plain' }]
    });
    await retry;
    await flushAsync();
    httpMock.expectNone('/api/communications/messages/upload/');
    const m = service.activeMessages$.value[0];
    expect(m.delivery_status).toBe('sent');
    expect(m.attachments?.length).toBe(1);
    expect((service as any).pendingFiles.has(holder.id)).toBe(false);
  });

  it('R3: forced logout keeps unsent messages/files for the same user; a different user drops them', withFakeSockets(async () => {
    service.getCurrentUserId = () => 1;
    const holder: { id?: string } = {};
    const file = new File(['x'], 'f.txt', { type: 'text/plain' });
    await failUploadOnce(holder, file);

    service.resetForForcedLogout();
    expect(service.activeMessages$.value).toEqual([]);
    expect(service.conversations$.value).toEqual([]);
    expect((service as any).pendingFiles.get(holder.id)).toEqual([file]);
    expect((service as any).outgoingMessages.has(holder.id)).toBe(true);

    // ورود دوبارهٔ همان کاربر: پیام ناموفق با بازکردن گفتگو برمی‌گردد
    service.activeConversation$.next(conv('conv-1'));
    const load = service.loadMessages('conv-1');
    httpMock.expectOne(r => r.params.get('conversation_id') === 'conv-1').flush([]);
    await load;
    expect(service.activeMessages$.value.some(m => m.client_temp_id === holder.id && m.delivery_status === 'failed')).toBe(true);

    // ورود کاربر دیگر روی همان دستگاه
    service.resetForForcedLogout();
    service.getCurrentUserId = () => 2;
    service.ensureConnected();
    expect((service as any).pendingFiles.size).toBe(0);
    expect((service as any).outgoingMessages.size).toBe(0);
  }));

  it('R4: a stale loadMessages response is ignored', async () => {
    service.activeConversation$.next(conv('conv-1'));
    const first = service.loadMessages('conv-1');
    const second = service.loadMessages('conv-1');
    const reqs = httpMock.match(r => r.params.get('conversation_id') === 'conv-1');
    expect(reqs.length).toBe(2);
    reqs[1].flush([{ id: 'new', conversation: 'conv-1', sender: 2, text: 'تازه', created_at: '2026-10-30T10:00:00Z' }]);
    await second;
    reqs[0].flush([{ id: 'old', conversation: 'conv-1', sender: 2, text: 'کهنه', created_at: '2026-10-30T09:00:00Z' }]);
    await first;
    expect(service.activeMessages$.value.map(m => m.id)).toEqual(['new']);
  });

  it('R4: a message sent while loadMessages is in flight is not dropped by its response', async () => {
    service.getCurrentUserId = () => 1;
    service.activeConversation$.next(conv('conv-1'));
    const load = service.loadMessages('conv-1');
    const getReq = httpMock.expectOne(r => r.method === 'GET' && r.params.get('conversation_id') === 'conv-1');

    const send = service.sendMessage('conv-1', 'همین حالا');
    httpMock.expectOne(r => r.method === 'POST' && r.url === '/api/communications/messages/')
      .flush({ id: 'sent-1', conversation: 'conv-1', sender: 1, text: 'همین حالا', created_at: '2026-10-30T10:05:00Z' });
    await send;
    expect((service as any).outgoingMessages.size).toBe(0);

    getReq.flush([{ id: 'srv-1', conversation: 'conv-1', sender: 2, text: 'قبلی', created_at: '2026-10-30T10:00:00Z' }]);
    await load;
    expect(service.activeMessages$.value.map(m => m.id)).toEqual(['srv-1', 'sent-1']);
  });

  it('R5: a permanent 4xx shows the server text and the user can discard the local message and file', async () => {
    service.getCurrentUserId = () => 1;
    const file = new File(['x'], 'f.txt', { type: 'text/plain' });
    const p = service.sendMessage('conv-1', 'رد می‌شود', undefined, file);
    const tempId = service.activeMessages$.value[0].client_temp_id!;
    httpMock.expectOne('/api/communications/messages/').flush({ detail: 'شما اجازهٔ ارسال در این گفتگو را ندارید.' }, { status: 403, statusText: 'Forbidden' });
    await p;
    const m = service.activeMessages$.value[0];
    expect(m.delivery_status).toBe('failed');
    expect(m.failure_reason).toBe('شما اجازهٔ ارسال در این گفتگو را ندارید.');

    service.discardOutgoing(tempId);
    expect(service.activeMessages$.value.length).toBe(0);
    expect((service as any).pendingFiles.has(tempId)).toBe(false);
    expect((service as any).outgoingMessages.has(tempId)).toBe(false);
  });
  // ─── گروه‌ها (مرحلهٔ ۳-ب) ───
  const grp = (id: string, extra: any = {}) => ({ id, conv_type: 'group', title: 'گروه', participants: [], is_active: true, created_at: '', updated_at: '', ...extra });

  it('getCapabilities calls capabilities endpoint', async () => {
    const p = service.getCapabilities();
    const req = httpMock.expectOne('/api/communications/capabilities/');
    expect(req.request.method).toBe('GET');
    req.flush({ can_create_group: true });
    expect((await p).can_create_group).toBe(true);
  });

  it('createGroup posts body and inserts the conversation into the list', async () => {
    const p = service.createGroup('تیم', [2, 3]);
    const req = httpMock.expectOne('/api/communications/conversations/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ conv_type: 'group', title: 'تیم', member_ids: [2, 3] });
    req.flush(grp('g1', { title: 'تیم', my_role: 'owner', member_count: 3 }));
    await p;
    expect(service.conversations$.value.map(c => c.id)).toEqual(['g1']);
    expect(service.conversations$.value[0].my_role).toBe('owner');
  });

  it('getMembers, removeMember, setMemberRole use the right URLs', async () => {
    const p1 = service.getMembers('g1');
    const r1 = httpMock.expectOne('/api/communications/conversations/g1/members/');
    expect(r1.request.method).toBe('GET');
    r1.flush([{ id: 2, username: 'a', role: 'member' }]);
    expect((await p1)[0].username).toBe('a');

    const p2 = service.removeMember('g1', 2);
    const r2 = httpMock.expectOne('/api/communications/conversations/g1/members/2/');
    expect(r2.request.method).toBe('DELETE');
    r2.flush(null, { status: 204, statusText: 'No Content' });
    await p2;

    const p3 = service.setMemberRole('g1', 2, 'admin');
    const r3 = httpMock.expectOne('/api/communications/conversations/g1/members/2/');
    expect(r3.request.method).toBe('PATCH');
    expect(r3.request.body).toEqual({ role: 'admin' });
    r3.flush({});
    await p3;
  });

  it('leaveGroup removes the conversation from the list and clears it if active', async () => {
    service.conversations$.next([grp('g1') as any, grp('g2') as any]);
    service.activeConversation$.next(grp('g1') as any);
    const p = service.leaveGroup('g1');
    const req = httpMock.expectOne('/api/communications/conversations/g1/leave/');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'left', conversation_id: 'g1', new_owner_id: null });
    await p;
    expect(service.conversations$.value.map(c => c.id)).toEqual(['g2']);
    expect(service.activeConversation$.value).toBeNull();
  });

  it('muteConversation posts muted flag and merges it into the list', async () => {
    service.conversations$.next([grp('g1') as any]);
    const p = service.muteConversation('g1', true);
    const req = httpMock.expectOne('/api/communications/conversations/g1/mute/');
    expect(req.request.body).toEqual({ muted: true });
    req.flush({ muted: true });
    await p;
    expect(service.conversations$.value[0].is_muted).toBe(true);
  });

  it('WS chat.conversation.removed removes the conversation and emits a removed event', () => {
    service.conversations$.next([grp('g1') as any, grp('g2') as any]);
    service.activeConversation$.next(grp('g1') as any);
    const events: any[] = [];
    service.membershipEvents$.subscribe(e => events.push(e));
    (service as any).chatWs = { send: () => {}, close: () => {} };
    (service as any).initChatSocket('ws://mock');
    (service as any).chatWs.onmessage({ data: JSON.stringify({ event: 'chat.conversation.removed', data: { conversation_id: 'g1' } }) });
    expect(service.conversations$.value.map(c => c.id)).toEqual(['g2']);
    expect(service.activeConversation$.value).toBeNull();
    expect(events).toEqual([{ type: 'removed', conversationId: 'g1' }]);
  });

  it('WS chat.conversation.updated refetches the conversation and merges it', async () => {
    service.conversations$.next([grp('g1', { title: 'قدیمی' }) as any]);
    const events: any[] = [];
    service.membershipEvents$.subscribe(e => events.push(e));
    (service as any).chatWs = { send: () => {}, close: () => {} };
    (service as any).initChatSocket('ws://mock');
    (service as any).chatWs.onmessage({ data: JSON.stringify({ event: 'chat.conversation.updated', data: { conversation_id: 'g1' } }) });
    const req = httpMock.expectOne('/api/communications/conversations/g1/');
    expect(req.request.method).toBe('GET');
    req.flush(grp('g1', { title: 'جدید', my_role: 'admin' }));
    await new Promise(r => setTimeout(r, 0));
    expect(service.conversations$.value[0].title).toBe('جدید');
    expect(events).toEqual([{ type: 'updated', conversationId: 'g1' }]);
  });

  it('WS chat.conversation.updated treats 403 as removal', async () => {
    service.conversations$.next([grp('g1') as any]);
    (service as any).chatWs = { send: () => {}, close: () => {} };
    (service as any).initChatSocket('ws://mock');
    (service as any).chatWs.onmessage({ data: JSON.stringify({ event: 'chat.conversation.updated', data: { conversation_id: 'g1' } }) });
    httpMock.expectOne('/api/communications/conversations/g1/').flush({}, { status: 403, statusText: 'Forbidden' });
    await new Promise(r => setTimeout(r, 0));
    expect(service.conversations$.value.length).toBe(0);
  });

  // ─── مرحلهٔ ۵ چت: منوی پیام، حذف/ویرایش، before_id، throttle تایپ ───
  const wsMsg = (event: string, data: any) => {
    (service as any).chatWs = { send: () => {}, close: () => {} };
    (service as any).initChatSocket('ws://mock');
    (service as any).chatWs.onmessage({ data: JSON.stringify({ event, data }) });
  };
  const openConv = (id = 'conv-1') => service.activeConversation$.next({
    id, conv_type: 'direct', participants: [1, 2], is_active: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  } as any);
  const m = (id: any, extra: any = {}): ChatMessage => ({
    id, conversation: 'conv-1', sender: 2, text: 't' + id, created_at: new Date().toISOString(), ...extra
  } as ChatMessage);

  it('WS chat.message.deleted removes the message from the open conversation', () => {
    service.getCurrentUserId = () => 1;
    openConv();
    service.activeMessages$.next([m(10), m(11), m(12)]);
    wsMsg('chat.message.deleted', { id: 11, conversation: 'conv-1' });
    expect(service.activeMessages$.value.map(x => String(x.id))).toEqual(['10', '12']);
  });

  it('WS chat.message.deleted of the last message refreshes the conversation preview from the new last message', () => {
    service.getCurrentUserId = () => 1;
    openConv();
    service.activeMessages$.next([m(10, { text: 'قبلی' }), m(11, { text: 'آخر' })]);
    service.conversations$.next([{
      id: 'conv-1', conv_type: 'direct', participants: [1, 2], is_active: true, created_at: '', updated_at: '',
      last_message: { id: '11', text: 'آخر', sender_name: 'x', created_at: '', has_attachment: false }
    } as any]);
    wsMsg('chat.message.deleted', { id: 11, conversation: 'conv-1' });
    expect(service.conversations$.value[0].last_message?.id).toBe(10);
    expect(service.conversations$.value[0].last_message?.text).toBe('قبلی');
  });

  it('WS chat.message.updated updates text and edited_at in place', () => {
    service.getCurrentUserId = () => 1;
    openConv();
    service.activeMessages$.next([m(20, { sender: 1, is_me: true, text: 'اول', delivery_status: 'sent' })]);
    wsMsg('chat.message.updated', { id: 20, conversation: 'conv-1', sender: 1, text: 'دوم', edited_at: '2026-10-31T10:00:00Z', created_at: new Date().toISOString() });
    const cur = service.activeMessages$.value;
    expect(cur.length).toBe(1);
    expect(cur[0].text).toBe('دوم');
    expect(cur[0].edited_at).toBe('2026-10-31T10:00:00Z');
  });

  it('loadOlderMessages uses before_id of the oldest server message and skips pending/failed ones', async () => {
    service.activeMessages$.next([
      m('temp-1', { is_pending: true, delivery_status: 'pending' }),
      m(30), m(25), m(40),
      m('temp-2', { delivery_status: 'failed' })
    ]);
    expect(service.oldestServerMessageId()).toBe('25');
    const p = service.loadOlderMessages('conv-1', service.oldestServerMessageId()!, 30);
    const req = httpMock.expectOne(r => r.url === '/api/communications/messages/' && r.params.get('before_id') === '25');
    expect(req.request.params.get('offset')).toBeNull();
    req.flush({ results: [] });
    await p;
  });

  it('sendMessage with a reply puts reply_to in the create body', async () => {
    service.getCurrentUserId = () => 1;
    const p = service.sendMessage('conv-1', 'پاسخ', '77');
    const req = httpMock.expectOne('/api/communications/messages/');
    expect(req.request.body.reply_to).toBe('77');
    req.flush({ id: 90, conversation: 'conv-1', sender: 1, text: 'پاسخ', reply_to: 77, created_at: new Date().toISOString() });
    await p;
  });

  it('editMessage PATCHes the text and updates the message in place', async () => {
    service.getCurrentUserId = () => 1;
    openConv();
    service.activeMessages$.next([m(50, { sender: 1, is_me: true, text: 'قدیم', delivery_status: 'sent' })]);
    const p = service.editMessage('50', 'جدید');
    const req = httpMock.expectOne('/api/communications/messages/50/');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ text: 'جدید' });
    expect(req.request.context.get(SKIP_OFFLINE)).toBe(true);
    req.flush({ id: 50, conversation: 'conv-1', sender: 1, text: 'جدید', edited_at: '2026-10-31T10:00:00Z', created_at: new Date().toISOString() });
    await p;
    expect(service.activeMessages$.value[0].text).toBe('جدید');
    expect(service.activeMessages$.value[0].edited_at).toBeTruthy();
  });

  it('deleteMessage sends DELETE (not queued offline) and removes the message', async () => {
    service.getCurrentUserId = () => 1;
    openConv();
    service.activeMessages$.next([m(60, { sender: 1, is_me: true }), m(61)]);
    const p = service.deleteMessage('60');
    const req = httpMock.expectOne('/api/communications/messages/60/');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(SKIP_OFFLINE)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await p;
    expect(service.activeMessages$.value.map(x => String(x.id))).toEqual(['61']);
  });

  it('typing events are throttled to once per 3 seconds', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-31T10:00:00Z'));
      const sent: any[] = [];
      (service as any).chatWs = { readyState: WebSocket.OPEN, send: (d: string) => sent.push(JSON.parse(d)), close: () => {} };
      service.sendTypingStatus('conv-1', true);
      service.sendTypingStatus('conv-1', true);
      vi.advanceTimersByTime(2900);
      service.sendTypingStatus('conv-1', true);
      expect(sent.length).toBe(1);
      vi.advanceTimersByTime(200);
      service.sendTypingStatus('conv-1', true);
      expect(sent.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('composer draft (picked files and text) is kept per conversation and taken once', () => {
    const f = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    service.stashComposerDraft('c1', [f], 'سلام');
    service.stashComposerDraft('c2', [], '  ');
    expect(service.takeComposerDraft('c2')).toBeNull();
    const d = service.takeComposerDraft('c1');
    expect(d?.files).toEqual([f]);
    expect(d?.text).toBe('سلام');
    expect(service.takeComposerDraft('c1')).toBeNull();
  });

  it('a second retry while the first is still running does not start another delivery', async () => {
    const msg: any = { id: 't1', client_temp_id: 't1', conversation: 'c1', text: 'x', delivery_status: 'failed', is_me: true };
    (service as any).outgoingMessages.set('t1', msg);
    let release!: () => void;
    const deliver = vi.spyOn(service as any, 'deliverOutgoing').mockImplementation(() => new Promise<void>(r => { release = r; }));
    const first = service.retryMessage('t1');
    await service.retryMessage('t1');
    expect(deliver).toHaveBeenCalledTimes(1);
    release();
    await first;
    const third = service.retryMessage('t1');
    release();
    await third;
    expect(deliver).toHaveBeenCalledTimes(2);
  });
});
