// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { CommunicationService, ChatMessage } from './communication.service';
import { ImageCompressorService } from './image-compressor.service';
import { ConfigApiService } from '../api/config-api.service';

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

    const promise = service.loadOlderMessages('conv-1', 1, 30);
    const req = httpMock.expectOne(req => req.url === '/api/communications/messages/' && req.params.get('offset') === '1');
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
    (service as any).handleReadReceipt({ conversation_id: 'conv-1', reader_id: 2 });
    const updated = service.activeMessages$.value;
    expect(updated[0].read_by_count).toBe(1);
    expect(updated[1].read_by_count).toBe(0);
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
});
