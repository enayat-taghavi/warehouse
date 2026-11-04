// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { signal } from '@angular/core';
import { Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { ChatDrawerComponent, formatLastSeen } from './chat-drawer.component';
import { CommunicationService, Conversation, ChatMessage } from '../../../../../core/services/communication.service';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ApiService } from '../../../../../core/api/api.service';
import { ConfigApiService } from '../../../../../core/api/config-api.service';
import { FileOutputService } from '../../../../../core/platform/file-output';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const flush = async (fixture: ComponentFixture<any>) => {
  for (let i = 0; i < 4; i++) {
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 0));
    fixture.detectChanges();
  }
};

describe('ChatDrawerComponent - Phase 1 (Page mode, expand button, URL sync)', () => {
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let comp: ChatDrawerComponent;
  let comm: any;
  let mockRouter: any;
  let paramMap$: BehaviorSubject<any>;
  let convs$: BehaviorSubject<Conversation[]>;
  let active$: BehaviorSubject<Conversation | null>;

  const sampleConv: Conversation = {
    id: 'c101',
    conv_type: 'direct',
    title: 'علی رضایی',
    participants: [1, 2],
    is_active: true,
    created_at: '',
    updated_at: '',
    participants_details: [
      { id: 1, username: 'me', full_name: 'من' },
      { id: 2, username: 'ali', full_name: 'علی رضایی' }
    ]
  };

  async function createComponent(mode: 'drawer' | 'page' = 'drawer', initialUrl: string = '/app/launcher') {
    convs$ = new BehaviorSubject<Conversation[]>([sampleConv]);
    active$ = new BehaviorSubject<Conversation | null>(null);
    paramMap$ = new BehaviorSubject(convertToParamMap({}));

    comm = {
      isChatDrawerOpen: signal(true),
      chatReturnUrl: signal<string | null>(null),
      hasActiveConversation: signal(false),
      isMuted: signal(false),
      conversations$: convs$,
      activeConversation$: active$,
      activeMessages$: new BehaviorSubject<ChatMessage[]>([]),
      typingUser$: new Subject<any>(),
      membershipEvents$: new Subject<any>(),
      ensureConnected: vi.fn(),
      refreshPresence: vi.fn(),
      loadConversations: vi.fn().mockResolvedValue(undefined),
      getContacts: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockResolvedValue({ can_create_group: true }),
      getMembers: vi.fn().mockResolvedValue([]),
      openConversation: vi.fn().mockImplementation(async (c: Conversation) => active$.next(c)),
      leaveConversation: vi.fn(),
      closeDrawer: vi.fn(() => comm.isChatDrawerOpen.set(false)),
      stashComposerDraft: vi.fn(),
      takeComposerDraft: vi.fn().mockReturnValue(null),
      getCurrentUserId: vi.fn().mockReturnValue(1),
      isUserOnline: vi.fn().mockReturnValue(false),
      getLastSeen: vi.fn().mockReturnValue(null),
      setLastSeen: vi.fn(),
      toggleMute: vi.fn(),
      reactToMessage: vi.fn().mockReturnValue(of({ message_id: 1, conversation_id: 'c101', reactions: [{ emoji: '❤️', count: 1, mine: true }] })),
      getMessageReactions: vi.fn().mockReturnValue(of([{ user_id: 1, full_name: 'من', emoji: '❤️', created_at: new Date().toISOString() }])),
      forwardMessages: vi.fn().mockReturnValue(of({ status: 'forwarded', count: 1, conversation_ids: ['c101'] })),
      togglePinConversation: vi.fn().mockReturnValue(of({ is_pinned: true, pinned_at: new Date().toISOString() })),
      togglePinMessage: vi.fn().mockReturnValue(of({ is_pinned: true, pinned_at: new Date().toISOString() }))
    };

    mockRouter = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn(),
      url: initialUrl,
      events: of()
    };

    const mockFileOutput = {
      canShareFiles: vi.fn().mockReturnValue(false),
      shareBlob: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ChatDrawerComponent],
      providers: [
        { provide: CommunicationService, useValue: comm },
        { provide: StateService, useValue: { appState: { activeWarehouseId: 'ALL' } } },
        { provide: AuthService, useValue: { user: () => ({ id: 1, username: 'me' }) } },
        { provide: ToastService, useValue: { show: vi.fn(), success: vi.fn(), error: vi.fn() } },
        { provide: ApiService, useValue: { download: vi.fn() } },
        { provide: ConfigApiService, useValue: { getPublicConfig: () => new Subject<any>() } },
        { provide: FileOutputService, useValue: mockFileOutput },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$ } },
        { provide: HttpClient, useValue: { get: vi.fn(), post: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDrawerComponent);
    if (mode === 'page') {
      fixture.componentRef.setInput('mode', 'page');
    }
    comp = fixture.componentInstance;
    fixture.detectChanges();
    await flush(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('defaults to mode="drawer"', async () => {
    await createComponent('drawer');
    expect(comp.mode()).toBe('drawer');
    const drawerPanel = fixture.nativeElement.querySelector('[data-testid="drawer-expand-btn"]');
    expect(drawerPanel).not.toBeNull();
  });

  it('renders expand button in drawer mode and navigates to /app/chat', async () => {
    await createComponent('drawer');
    const expandBtn = fixture.nativeElement.querySelector('[data-testid="drawer-expand-btn"]') as HTMLButtonElement;
    expect(expandBtn).not.toBeNull();

    expandBtn.click();
    await flush(fixture);

    expect(comm.isChatDrawerOpen()).toBe(false);
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/chat');
  });

  it('clicking expand button with active conversation navigates to /app/chat/:id', async () => {
    await createComponent('drawer');
    comp.activeConv.set(sampleConv);
    comp.activeTab.set('chat');
    fixture.detectChanges();
    await flush(fixture);

    comp.expandToPage();
    expect(comm.isChatDrawerOpen()).toBe(false);
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/chat/c101');
  });

  it('renders two-column page container in mode="page"', async () => {
    await createComponent('page', '/app/chat');
    const pageContainer = fixture.nativeElement.querySelector('[data-testid="chat-page-container"]');
    expect(pageContainer).not.toBeNull();

    const sidebar = fixture.nativeElement.querySelector('[data-testid="chat-page-sidebar"]');
    expect(sidebar).not.toBeNull();

    // When no conversation is selected, empty state is displayed on desktop column
    const emptyState = fixture.nativeElement.querySelector('[data-testid="chat-empty-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState.textContent).toContain('گفتگو');
  });

  it('in mode="page", selecting conversation updates router to /app/chat/:id', async () => {
    await createComponent('page', '/app/chat');
    comp.selectConversation(sampleConv);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/chat', 'c101']);
    expect(comp.activeConv()?.id).toBe('c101');
  });

  it('in mode="page", route param changes automatically select the conversation', async () => {
    await createComponent('page', '/app/chat');
    comp.conversations.set([sampleConv]);

    // Simulate route navigation to /app/chat/c101
    paramMap$.next(convertToParamMap({ id: 'c101' }));
    await flush(fixture);

    expect(comp.activeConv()?.id).toBe('c101');
    expect(comp.activeTab()).toBe('chat');
  });

  it('suppresses drawer panel rendering when URL is on /app/chat', async () => {
    await createComponent('drawer', '/app/chat');
    expect(comp.isOnChatPage()).toBe(true);

    // In drawer mode, backdrop and panel are suppressed while on /app/chat
    const expandBtn = fixture.nativeElement.querySelector('[data-testid="drawer-expand-btn"]');
    expect(expandBtn).toBeNull();
  });
});

describe('ChatDrawerComponent - Phase 2 (Telegram-Style Visual Shell & Grouping)', () => {
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let comp: ChatDrawerComponent;
  let comm: any;
  let convs$: BehaviorSubject<Conversation[]>;
  let active$: BehaviorSubject<Conversation | null>;
  let activeMsgs$: BehaviorSubject<ChatMessage[]>;

  const baseDate = '2026-11-04T10:00:00.000Z';
  const threeMinLater = '2026-11-04T10:03:00.000Z';
  const tenMinLater = '2026-11-04T10:13:00.000Z';
  const nextDay = '2026-11-05T10:00:00.000Z';

  const sampleConv: Conversation = {
    id: 'c200',
    conv_type: 'group',
    title: 'تیم انبار و لجستیک',
    participants: [1, 2, 3],
    is_active: true,
    created_at: baseDate,
    updated_at: baseDate,
    participants_details: [
      { id: 1, username: 'me', full_name: 'من' },
      { id: 2, username: 'ali', full_name: 'علی رضایی' }
    ]
  };

  async function setupPhase2Component() {
    convs$ = new BehaviorSubject<Conversation[]>([sampleConv]);
    active$ = new BehaviorSubject<Conversation | null>(sampleConv);
    activeMsgs$ = new BehaviorSubject<ChatMessage[]>([]);

    comm = {
      isChatDrawerOpen: signal(true),
      hasActiveConversation: signal(true),
      isMuted: signal(false),
      conversations$: convs$,
      activeConversation$: active$,
      activeMessages$: activeMsgs$,
      typingUser$: new Subject<any>(),
      membershipEvents$: new Subject<any>(),
      ensureConnected: vi.fn(),
      refreshPresence: vi.fn(),
      loadConversations: vi.fn().mockResolvedValue(undefined),
      getContacts: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockResolvedValue({ can_create_group: true }),
      getMembers: vi.fn().mockResolvedValue([]),
      openConversation: vi.fn().mockImplementation(async (c: Conversation) => active$.next(c)),
      leaveConversation: vi.fn(),
      closeDrawer: vi.fn(() => comm.isChatDrawerOpen.set(false)),
      stashComposerDraft: vi.fn(),
      takeComposerDraft: vi.fn().mockReturnValue(null),
      getCurrentUserId: vi.fn().mockReturnValue(1),
      isUserOnline: vi.fn().mockReturnValue(false),
      toggleMute: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ChatDrawerComponent],
      providers: [
        { provide: CommunicationService, useValue: comm },
        { provide: StateService, useValue: { appState: { activeWarehouseId: 'ALL' } } },
        { provide: AuthService, useValue: { user: () => ({ id: 1, username: 'me', first_name: 'من', last_name: '' }) } },
        { provide: ToastService, useValue: { show: vi.fn(), success: vi.fn(), error: vi.fn() } },
        { provide: ApiService, useValue: { download: vi.fn() } },
        { provide: ConfigApiService, useValue: { getPublicConfig: () => new Subject<any>() } },
        { provide: FileOutputService, useValue: { canShareFiles: () => false, shareBlob: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn(), url: '/app/launcher', events: of() } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: HttpClient, useValue: { get: vi.fn(), post: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDrawerComponent);
    comp = fixture.componentInstance;
    comp.activeConv.set(sampleConv);
    comp.activeTab.set('chat');
    fixture.detectChanges();
    await flush(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('correctly calculates isFirstInGroup and isLastInGroup for consecutive messages', async () => {
    await setupPhase2Component();

    const m1: ChatMessage = { id: 'm1', conversation: 'c200', sender: 2, text: 'سلام', created_at: baseDate, is_me: false };
    const m2: ChatMessage = { id: 'm2', conversation: 'c200', sender: 2, text: 'خوبی؟', created_at: threeMinLater, is_me: false };
    const m3: ChatMessage = { id: 'm3', conversation: 'c200', sender: 2, text: 'پیام دیرتر', created_at: tenMinLater, is_me: false };
    const m4: ChatMessage = { id: 'm4', conversation: 'c200', sender: 1, text: 'ممنون', created_at: tenMinLater, is_me: true };

    const msgs = [m1, m2, m3, m4];

    // m1 & m2 are from same sender within 3 min -> group 1
    expect(comp.isFirstInGroup(msgs, 0)).toBe(true);
    expect(comp.isLastInGroup(msgs, 0)).toBe(false);

    expect(comp.isFirstInGroup(msgs, 1)).toBe(false);
    expect(comp.isLastInGroup(msgs, 1)).toBe(true);

    // m3 is 7 min after m2 -> separate 1-message group
    expect(comp.isFirstInGroup(msgs, 2)).toBe(true);
    expect(comp.isLastInGroup(msgs, 2)).toBe(true);

    // m4 is from sender 1 (different sender) -> separate group
    expect(comp.isFirstInGroup(msgs, 3)).toBe(true);
    expect(comp.isLastInGroup(msgs, 3)).toBe(true);
  });

  it('groups separate across different calendar days or system messages', async () => {
    await setupPhase2Component();

    const m1: ChatMessage = { id: 'm1', conversation: 'c200', sender: 2, text: 'روز اول', created_at: baseDate, is_me: false };
    const m2: ChatMessage = { id: 'm2', conversation: 'c200', sender: 2, text: 'روز دوم', created_at: nextDay, is_me: false };

    expect(comp.isFirstInGroup([m1, m2], 0)).toBe(true);
    expect(comp.isLastInGroup([m1, m2], 0)).toBe(true);
    expect(comp.isFirstInGroup([m1, m2], 1)).toBe(true);
    expect(comp.isLastInGroup([m1, m2], 1)).toBe(true);
  });

  it('renders my message on the RIGHT (items-start in RTL) with light indigo background', async () => {
    await setupPhase2Component();

    const myMsg: ChatMessage = {
      id: 'my-1',
      conversation: 'c200',
      sender: 1,
      text: 'پیام من در سمت راست',
      created_at: baseDate,
      is_me: true
    };

    comp.messages.set([myMsg]);
    fixture.detectChanges();
    await flush(fixture);

    const msgRow = fixture.nativeElement.querySelector('[data-msg-id="my-1"]');
    expect(msgRow).not.toBeNull();
    // In RTL, items-start aligns to the right side
    expect(msgRow.classList.contains('items-start')).toBe(true);

    const bubble = msgRow.querySelector('.rounded-2xl');
    expect(bubble).not.toBeNull();
    expect(bubble.classList.contains('bg-indigo-50/95')).toBe(true);
    expect(bubble.classList.contains('rounded-br-xs')).toBe(true);
  });

  it('renders other party message on the LEFT (items-end in RTL) with white background', async () => {
    await setupPhase2Component();

    const otherMsg: ChatMessage = {
      id: 'oth-1',
      conversation: 'c200',
      sender: 2,
      sender_details: { id: 2, username: 'ali', full_name: 'علی رضایی' },
      text: 'پیام همکار در سمت چپ',
      created_at: baseDate,
      is_me: false
    };

    comp.messages.set([otherMsg]);
    fixture.detectChanges();
    await flush(fixture);

    const msgRow = fixture.nativeElement.querySelector('[data-msg-id="oth-1"]');
    expect(msgRow).not.toBeNull();
    // In RTL, items-end aligns to the left side
    expect(msgRow.classList.contains('items-end')).toBe(true);

    const bubble = msgRow.querySelector('.rounded-2xl');
    expect(bubble).not.toBeNull();
    expect(bubble.classList.contains('bg-white')).toBe(true);
    expect(bubble.classList.contains('rounded-bl-xs')).toBe(true);

    // In group chat, sender name is visible on the first message
    const senderName = msgRow.querySelector('[data-testid="sender-name"]');
    expect(senderName).not.toBeNull();
    expect(senderName.textContent).toContain('علی رضایی');
  });

  it('renders sticky date chip between different days with correct styles', async () => {
    await setupPhase2Component();

    const m1: ChatMessage = { id: 'd1', conversation: 'c200', sender: 1, text: 'روز اول', created_at: baseDate, is_me: true };
    const m2: ChatMessage = { id: 'd2', conversation: 'c200', sender: 1, text: 'روز دوم', created_at: nextDay, is_me: true };

    comp.messages.set([m1, m2]);
    fixture.detectChanges();
    await flush(fixture);

    const dateChips = fixture.nativeElement.querySelectorAll('[data-testid="date-sep"]');
    expect(dateChips.length).toBeGreaterThanOrEqual(1);

    const firstChip = dateChips[0];
    expect(firstChip.classList.contains('sticky')).toBe(true);
    expect(firstChip.classList.contains('top-2')).toBe(true);
    expect(firstChip.classList.contains('rounded-full')).toBe(true);
  });

  it('recognizes whether the last message of a conversation was sent by current user', async () => {
    await setupPhase2Component();

    const convMine: Conversation = {
      ...sampleConv,
      last_message: { id: 'lm1', text: 'ارسال شد', sender_name: 'شما', created_at: baseDate, has_attachment: false }
    };
    expect(comp.isLastMessageMine(convMine)).toBe(true);

    const convOther: Conversation = {
      ...sampleConv,
      last_message: { id: 'lm2', text: 'سلام', sender_name: 'علی رضایی', created_at: baseDate, has_attachment: false }
    };
    expect(comp.isLastMessageMine(convOther)).toBe(false);
  });
});

describe('ChatDrawerComponent - Phase 3 (Telegram Interactions, Emoji Picker, Drafts, Multi-Select, Shortcuts)', () => {
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let comp: ChatDrawerComponent;
  let comm: any;
  let convs$: BehaviorSubject<Conversation[]>;
  let active$: BehaviorSubject<Conversation | null>;
  let activeMsgs$: BehaviorSubject<ChatMessage[]>;
  let mockToast: any;
  let mockRouter: any;

  const baseDate = '2026-11-04T10:00:00.000Z';
  const sampleConv: Conversation = {
    id: 'c300',
    conv_type: 'group',
    title: 'تیم پشتیبانی',
    participants: [1, 2],
    is_active: true,
    created_at: baseDate,
    updated_at: baseDate,
    participants_details: [
      { id: 1, username: 'me', full_name: 'من' },
      { id: 2, username: 'ali', full_name: 'علی رضایی' }
    ]
  };

  const myMsg: ChatMessage = {
    id: '301',
    conversation: 'c300',
    sender: 1,
    text: 'سلام به همگی',
    created_at: baseDate,
    is_me: true,
    editable_until: new Date(Date.now() + 86400000).toISOString()
  };

  const otherMsg: ChatMessage = {
    id: '302',
    conversation: 'c300',
    sender: 2,
    sender_details: { id: 2, username: 'ali', full_name: 'علی رضایی' },
    text: 'درود، من رسیدم',
    created_at: baseDate,
    is_me: false
  };

  async function setupPhase3Component(mode: 'drawer' | 'page' = 'drawer', initialUrl = '/app/launcher') {
    convs$ = new BehaviorSubject<Conversation[]>([sampleConv]);
    active$ = new BehaviorSubject<Conversation | null>(sampleConv);
    activeMsgs$ = new BehaviorSubject<ChatMessage[]>([myMsg, otherMsg]);

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn(),
      url: initialUrl,
      events: of()
    };

    comm = {
      isChatDrawerOpen: signal(true),
      chatReturnUrl: signal<string | null>(null),
      hasActiveConversation: signal(true),
      isMuted: signal(false),
      conversations$: convs$,
      activeConversation$: active$,
      activeMessages$: activeMsgs$,
      typingUser$: new Subject<any>(),
      membershipEvents$: new Subject<any>(),
      ensureConnected: vi.fn(),
      refreshPresence: vi.fn(),
      loadConversations: vi.fn().mockResolvedValue(undefined),
      getContacts: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockResolvedValue({ can_create_group: true }),
      getMembers: vi.fn().mockResolvedValue([]),
      openConversation: vi.fn().mockImplementation(async (c: Conversation) => active$.next(c)),
      leaveConversation: vi.fn(),
      closeDrawer: vi.fn(() => comm.isChatDrawerOpen.set(false)),
      stashComposerDraft: vi.fn(),
      takeComposerDraft: vi.fn().mockReturnValue(null),
      getCurrentUserId: vi.fn().mockReturnValue(1),
      isUserOnline: vi.fn().mockReturnValue(true),
      getLastSeen: vi.fn().mockReturnValue(null),
      setLastSeen: vi.fn(),
      toggleMute: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      editMessage: vi.fn().mockResolvedValue(undefined),
      reactToMessage: vi.fn().mockReturnValue(of({ message_id: 301, conversation_id: 'c101', reactions: [{ emoji: '❤️', count: 1, mine: true }] })),
      getMessageReactions: vi.fn().mockReturnValue(of([{ user_id: 1, full_name: 'من', emoji: '❤️', created_at: new Date().toISOString() }])),
      forwardMessages: vi.fn().mockReturnValue(of({ status: 'forwarded', count: 1, conversation_ids: ['c101'] })),
      togglePinConversation: vi.fn().mockReturnValue(of({ is_pinned: true, pinned_at: new Date().toISOString() })),
      togglePinMessage: vi.fn().mockReturnValue(of({ is_pinned: true, pinned_at: new Date().toISOString() }))
    };

    await TestBed.configureTestingModule({
      imports: [ChatDrawerComponent],
      providers: [
        { provide: CommunicationService, useValue: comm },
        { provide: StateService, useValue: { appState: { activeWarehouseId: 'ALL' } } },
        { provide: AuthService, useValue: { user: () => ({ id: 1, username: 'me', first_name: 'من', last_name: '' }) } },
        { provide: ToastService, useValue: mockToast },
        { provide: ApiService, useValue: { download: vi.fn() } },
        { provide: ConfigApiService, useValue: { getPublicConfig: () => new Subject<any>() } },
        { provide: FileOutputService, useValue: { canShareFiles: () => false, shareBlob: vi.fn() } },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: HttpClient, useValue: { get: vi.fn(), post: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDrawerComponent);
    if (mode === 'page') {
      fixture.componentRef.setInput('mode', 'page');
    }
    comp = fixture.componentInstance;
    comp.activeConv.set(sampleConv);
    comp.activeTab.set('chat');
    comp.messages.set([myMsg, otherMsg]);
    fixture.detectChanges();
    await flush(fixture);
  }

  const mockStorage: Record<string, string> = {};
  const fakeLocalStorage = {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    for (const k in mockStorage) delete mockStorage[k];
    try {
      Object.defineProperty(window, 'localStorage', { value: fakeLocalStorage, writable: true, configurable: true });
    } catch {}
  });

  // ─── 1. Message Context Menu & Reactions ───
  it('opens context menu on desktop right-click with reaction emojis and action buttons', async () => {
    await setupPhase3Component();

    const ev = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
    comp.onBubbleContextMenu(ev, myMsg);
    fixture.detectChanges();
    await flush(fixture);

    expect(ev.preventDefault).toHaveBeenCalled();
    expect(comp.isMenuOpen(myMsg)).toBe(true);

    const menuEl = fixture.nativeElement.querySelector('[data-testid="msg-menu"]');
    expect(menuEl).not.toBeNull();

    // Verify 6 reaction emojis are present
    const reactionButtons = menuEl.querySelectorAll('[data-testid="menu-reactions"] button');
    expect(reactionButtons.length).toBe(6);

    // Verify action buttons
    expect(menuEl.querySelector('[data-testid="menu-reply"]')).not.toBeNull();
    expect(menuEl.querySelector('[data-testid="menu-copy"]')).not.toBeNull();
    expect(menuEl.querySelector('[data-testid="menu-edit"]')).not.toBeNull();
    expect(menuEl.querySelector('[data-testid="menu-select"]')).not.toBeNull();
    expect(menuEl.querySelector('[data-testid="menu-read-receipts"]')).not.toBeNull();
    expect(menuEl.querySelector('[data-testid="menu-delete"]')).not.toBeNull();
  });

  it('mobile long-press (450ms) triggers context menu', async () => {
    await setupPhase3Component();
    vi.useFakeTimers();

    const evDown = { clientX: 100, clientY: 200, target: { closest: () => null } } as any;
    comp.onBubblePointerDown(evDown, otherMsg);

    expect(comp.isMenuOpen(otherMsg)).toBe(false);

    // Advance timer past 450ms
    vi.advanceTimersByTime(450);

    expect(comp.isMenuOpen(otherMsg)).toBe(true);
    vi.useRealTimers();
  });

  it('clicking a reaction emoji invokes reactToMessage API, updates reactions in place and closes menu', async () => {
    await setupPhase3Component();

    comp.menuFor.set(String(myMsg.id));
    fixture.detectChanges();

    comp.onReaction('❤️', myMsg);
    expect(comm.reactToMessage).toHaveBeenCalledWith(myMsg.id, '❤️');
    expect(comp.menuFor()).toBeNull();
  });

  // ─── 2. Swipe-to-Reply with Pointer Events ───
  it('swipe direction locking cancels horizontal swipe if initial 10px is mostly vertical', async () => {
    await setupPhase3Component();

    const evDown = { clientX: 100, clientY: 100, target: { closest: () => null } } as any;
    comp.onBubblePointerDown(evDown, otherMsg);

    // Movement: dx = +3, dy = +12 (|dy| > |dx|, dist >= 10)
    const evMoveVertical = { clientX: 103, clientY: 112 } as any;
    comp.onBubblePointerMove(evMoveVertical, otherMsg);

    expect(comp.swipingMsgId()).toBeNull();
    expect(comp.swipeDelta()).toBe(0);

    // Further move does nothing because swipe was cancelled
    comp.onBubblePointerMove({ clientX: 180, clientY: 112 } as any, otherMsg);
    expect(comp.swipingMsgId()).toBeNull();
  });

  it('swiping right (dx > 0) locks horizontal swipe, caps at 72px, and triggers reply at 60px threshold', async () => {
    await setupPhase3Component();

    const evDown = { clientX: 100, clientY: 100, target: { closest: () => null } } as any;
    comp.onBubblePointerDown(evDown, otherMsg);

    // 1. Move dx = +20, dy = +2 -> horizontal swipe locked
    comp.onBubblePointerMove({ clientX: 120, clientY: 102 } as any, otherMsg);
    expect(comp.swipingMsgId()).toBe(String(otherMsg.id));
    expect(comp.swipeDelta()).toBe(20);
    expect(comp.getBubbleTransform(otherMsg)).toBe('translateX(20px)');

    // 2. Below threshold (dx = 40px) on release does NOT activate reply
    comp.onBubblePointerMove({ clientX: 140, clientY: 102 } as any, otherMsg);
    comp.onBubblePointerUp({} as any, otherMsg);
    expect(comp.replyTo()).toBeNull();
    expect(comp.swipingMsgId()).toBeNull();

    // 3. New swipe above threshold (dx = 65px) on release triggers startReply
    comp.onBubblePointerDown(evDown, otherMsg);
    comp.onBubblePointerMove({ clientX: 165, clientY: 102 } as any, otherMsg);
    expect(comp.swipeDelta()).toBe(65);

    comp.onBubblePointerUp({} as any, otherMsg);
    expect(comp.replyTo()?.id).toBe(otherMsg.id);
    expect(comp.swipingMsgId()).toBeNull();
  });

  // ─── 3. Local Emoji Picker ───
  it('toggles emoji picker and inserts clicked emoji into composer', async () => {
    await setupPhase3Component();

    expect(comp.emojiPickerOpen()).toBe(false);
    comp.toggleEmojiPicker();
    expect(comp.emojiPickerOpen()).toBe(true);

    comp.messageInputText = 'سلام ';
    comp.onEmojiSelected('😊');

    expect(comp.messageInputText).toBe('سلام 😊');
    expect(comp.getDraft('c300')).toBe('سلام 😊');
  });

  // ─── 4. Per-Conversation Draft Persistence & Badge ───
  it('persists unsent draft in localStorage and shows red "پیش‌نویس:" in sidebar', async () => {
    await setupPhase3Component();

    comp.saveDraft('c300', 'پیش‌نویس مهم انبار');
    expect(fakeLocalStorage.getItem('chat_draft_1_c300')).toBe('پیش‌نویس مهم انبار');
    expect(comp.getDraft('c300')).toBe('پیش‌نویس مهم انبار');

    // Switch to conversations tab to check sidebar preview
    comp.activeTab.set('conversations');
    fixture.detectChanges();
    await flush(fixture);

    const draftPrefix = fixture.nativeElement.querySelector('[data-testid="draft-prefix"]');
    expect(draftPrefix).not.toBeNull();
    expect(draftPrefix.textContent).toContain('پیش‌نویس:');

    const draftPreview = fixture.nativeElement.querySelector('[data-testid="draft-preview"]');
    expect(draftPreview).not.toBeNull();
    expect(draftPreview.textContent).toContain('پیش‌نویس مهم انبار');

    // Opening/restoring draft in conversation
    comp.messageInputText = '';
    (comp as any).restoreDraft('c300');
    expect(comp.messageInputText).toBe('پیش‌نویس مهم انبار');

    // Sending message clears draft
    await comp.sendMessage();
    expect(comp.getDraft('c300')).toBeNull();
  });

  // ─── 5. Multi-Select Messages ───
  it('enters multi-select mode from context menu, toggles selections, and copies selected messages', async () => {
    await setupPhase3Component();

    // Start selection with myMsg
    comp.startSelection(myMsg);
    expect(comp.isSelectionMode()).toBe(true);
    expect(comp.selectedMessageCount()).toBe(1);
    expect(comp.isMessageSelected(myMsg)).toBe(true);

    fixture.detectChanges();
    await flush(fixture);

    // Selection bar is visible
    const selectionBar = fixture.nativeElement.querySelector('[data-testid="selection-bar"]');
    expect(selectionBar).not.toBeNull();
    expect(selectionBar.querySelector('[data-testid="selection-count"]')?.textContent).toContain('۱ پیام انتخاب شده');

    // Toggle otherMsg into selection
    comp.toggleMessageSelection(otherMsg);
    expect(comp.selectedMessageCount()).toBe(2);
    expect(comp.isMessageSelected(otherMsg)).toBe(true);

    // Copy selected messages
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    await comp.copySelectedMessages();
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('سلام به همگی'));
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('درود، من رسیدم'));
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('۲ پیام کپی شد'));
    expect(comp.isSelectionMode()).toBe(false);
  });

  // ─── 6. Keyboard Shortcuts ───
  it('Escape key cancels selection mode, closes menu, closes emoji picker, or cancels compose', async () => {
    await setupPhase3Component();

    // 1. In selection mode: Escape exits selection mode
    comp.startSelection(myMsg);
    expect(comp.isSelectionMode()).toBe(true);
    comp.onEscapeKey();
    expect(comp.isSelectionMode()).toBe(false);

    // 2. Menu open: Escape closes menu
    comp.menuFor.set('301');
    comp.onEscapeKey();
    expect(comp.menuFor()).toBeNull();

    // 3. Emoji picker open: Escape closes emoji picker
    comp.emojiPickerOpen.set(true);
    comp.onEscapeKey();
    expect(comp.emojiPickerOpen()).toBe(false);

    // 4. Replying: Escape cancels reply
    comp.replyTo.set(myMsg);
    comp.onEscapeKey();
    expect(comp.replyTo()).toBeNull();
  });

  it('ArrowUp on empty composer opens last own editable message for editing', async () => {
    await setupPhase3Component();

    comp.messageInputText = '';
    const ev = { preventDefault: vi.fn() } as any;

    comp.onComposerArrowUp(ev);

    expect(ev.preventDefault).toHaveBeenCalled();
    expect(comp.editing()?.id).toBe(myMsg.id);
    expect(comp.messageInputText).toBe('سلام به همگی');
  });

  // ─── Phase 4: Message Reactions & Reactors List ───
  it('offline reaction is rejected with toast and does not call API', async () => {
    await setupPhase3Component();
    // Simulate offline
    vi.spyOn(comp, 'isOnline').mockReturnValue(false);

    comp.onReaction('👍', myMsg);
    expect(mockToast.show).toHaveBeenCalledWith('info', 'ثبت واکنش نیاز به اتصال به اینترنت دارد');
    expect(comm.reactToMessage).not.toHaveBeenCalled();
  });

  it('renders reaction pills with active/inactive styles and toggles on click', async () => {
    await setupPhase3Component();

    const msgWithReactions: ChatMessage = {
      ...myMsg,
      id: '501',
      reactions: [
        { emoji: '👍', count: 2, mine: true },
        { emoji: '❤️', count: 1, mine: false }
      ]
    };
    comp.messages.set([msgWithReactions]);
    fixture.detectChanges();

    const pillBtns = fixture.nativeElement.querySelectorAll('[data-testid="reaction-pill"]');
    expect(pillBtns.length).toBe(2);

    // First pill (mine=true) has active styling
    expect(pillBtns[0].textContent).toContain('👍');
    expect(pillBtns[0].textContent).toContain('2');
    expect(pillBtns[0].classList.contains('text-indigo-800')).toBe(true);

    // Second pill (mine=false) has inactive styling
    expect(pillBtns[1].textContent).toContain('❤️');
    expect(pillBtns[1].textContent).toContain('1');
    expect(pillBtns[1].classList.contains('text-slate-700')).toBe(true);

    // Clicking existing pill triggers onReactionPillClick
    pillBtns[0].click();
    expect(comm.reactToMessage).toHaveBeenCalledWith('501', '👍');
  });

  it('opens reactors modal, fetches reactions and displays filtered list, then closes', async () => {
    await setupPhase3Component();

    const msgWithReactions: ChatMessage = {
      ...myMsg,
      id: '502',
      reactions: [
        { emoji: '👍', count: 1, mine: true }
      ]
    };
    comp.messages.set([msgWithReactions]);
    fixture.detectChanges();

    expect(comp.reactorsModalMsg()).toBeNull();

    // Open reactors modal
    comp.openReactorsModal(msgWithReactions);
    expect(comp.reactorsModalMsg()?.id).toBe('502');
    expect(comm.getMessageReactions).toHaveBeenCalledWith('502');

    fixture.detectChanges();
    const modalEl = fixture.nativeElement.querySelector('[data-testid="reactors-modal"]');
    expect(modalEl).toBeTruthy();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="reactor-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('من');

    // Close modal
    comp.closeReactorsModal();
    fixture.detectChanges();
    expect(comp.reactorsModalMsg()).toBeNull();
  });

  // ─── 4. Full-Page Chat Exit & Navigation (Bug Fix) ───
  it('saves returnUrl when expanding to page and navigates to chat', async () => {
    await setupPhase3Component('drawer', '/app/warehouse/items');
    comp.activeConv.set(null);
    comp.expandToPage();
    expect(comm.chatReturnUrl()).toBe('/app/warehouse/items');
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/chat');
  });

  it('renders back button in page mode and exits full page to returnUrl', async () => {
    await setupPhase3Component('page', '/app/chat');
    comp.activeTab.set('conversations');
    comp.activeConv.set(null);
    comm.chatReturnUrl.set('/app/operations/users');
    fixture.detectChanges();

    const backBtn = fixture.nativeElement.querySelector('[data-testid="chat-page-back-btn"]') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();

    backBtn.click();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/operations/users');
  });

  it('renders collapse button in page mode and exits full page reopening drawer', async () => {
    await setupPhase3Component('page', '/app/chat');
    comp.activeTab.set('conversations');
    comp.activeConv.set(null);
    comm.chatReturnUrl.set('/app/warehouse/stock');
    fixture.detectChanges();

    const collapseBtn = fixture.nativeElement.querySelector('[data-testid="chat-page-collapse-btn"]') as HTMLButtonElement;
    expect(collapseBtn).not.toBeNull();

    collapseBtn.click();
    expect(comm.isChatDrawerOpen()).toBe(true);
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/stock');
  });

  // ─── Phase 5: Message Forwarding, Badges, and Multi-Destination Modal ───
  it('renders forwarded badge with original sender name when message is forwarded', async () => {
    await setupPhase3Component();

    const fwdMsg: ChatMessage = {
      ...otherMsg,
      id: '601',
      forwarded_from_name: 'مدیر انبار ۱',
      forwarded_from_message: 101,
      text: 'پیام بازارسال‌شده از انبار مرکزی'
    };
    comp.messages.set([fwdMsg]);
    fixture.detectChanges();
    await flush(fixture);

    const fwdBadge = fixture.nativeElement.querySelector('[data-testid="forwarded-label"]');
    expect(fwdBadge).not.toBeNull();
    expect(fwdBadge.textContent).toContain('بازارسال از مدیر انبار ۱');
  });

  it('opens forward modal from context menu and single message', async () => {
    await setupPhase3Component();

    expect(comp.isForwardModalOpen()).toBe(false);
    comp.openForwardModal([otherMsg]);
    expect(comp.isForwardModalOpen()).toBe(true);
    expect(comp.messagesToForward().length).toBe(1);
    expect(comp.messagesToForward()[0].id).toBe(otherMsg.id);

    fixture.detectChanges();
    await flush(fixture);

    const modal = fixture.nativeElement.querySelector('[data-testid="forward-modal"]');
    expect(modal).not.toBeNull();
  });

  it('opens forward modal from selection bar with multi-selected messages', async () => {
    await setupPhase3Component();

    // Select both messages
    comp.startSelection(myMsg);
    comp.toggleMessageSelection(otherMsg);
    expect(comp.selectedMessageCount()).toBe(2);

    fixture.detectChanges();
    await flush(fixture);

    const fwdBtn = fixture.nativeElement.querySelector('[data-testid="selection-forward-btn"]') as HTMLButtonElement;
    expect(fwdBtn).not.toBeNull();
    expect(fwdBtn.disabled).toBe(false);

    fwdBtn.click();
    expect(comp.isForwardModalOpen()).toBe(true);
    expect(comp.messagesToForward().length).toBe(2);
  });

  it('selects destination conversations up to 5, submits forward, shows toast, and clears selection', async () => {
    await setupPhase3Component();

    const extraConv: Conversation = {
      id: 'c302',
      title: 'گفتگوی فنی انبار',
      conv_type: 'group',
      participants: [1, 2],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    comp.conversations.set([sampleConv, extraConv]);

    comp.startSelection(myMsg);
    comp.openForwardModalForSelected();
    expect(comp.isForwardModalOpen()).toBe(true);

    fixture.detectChanges();
    await flush(fixture);

    // Call onMessagesForwarded directly simulating modal confirmation
    comp.onMessagesForwarded({ count: 1, conversationIds: ['c302'] });

    expect(comp.isSelectionMode()).toBe(false);
    expect(comp.activeConv()?.id).toBe('c302');
  });

  it('rejects forward action when offline with toast', async () => {
    await setupPhase3Component();
    vi.spyOn(comp, 'isOnline').mockReturnValue(false);

    comp.openForwardModal([myMsg]);
    expect(mockToast.show).toHaveBeenCalledWith('info', 'بازارسال پیام نیاز به اتصال به اینترنت دارد');
    expect(comp.isForwardModalOpen()).toBe(false);
  });

  // ─── Phase 6: Conversation Pinning & Telegram Pinned Bar ───
  it('sorts pinned conversations to the top in filteredConversations()', async () => {
    await setupPhase3Component();

    const c1: Conversation = {
      id: 'c1',
      title: 'گفتگو ۱ (عادی قدیمی)',
      conv_type: 'direct',
      participants: [1, 2],
      is_active: true,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:00:00Z',
      is_pinned: false
    };
    const c2: Conversation = {
      id: 'c2',
      title: 'گفتگو ۲ (عادی جدیدتر)',
      conv_type: 'direct',
      participants: [1, 3],
      is_active: true,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-02T10:00:00Z',
      is_pinned: false
    };
    const c3: Conversation = {
      id: 'c3',
      title: 'گفتگو ۳ (سنجاق‌شده قدیمی)',
      conv_type: 'direct',
      participants: [1, 4],
      is_active: true,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:00:00Z',
      is_pinned: true,
      pinned_at: '2026-01-01T12:00:00Z'
    };
    const c4: Conversation = {
      id: 'c4',
      title: 'گفتگو ۴ (سنجاق‌شده جدید)',
      conv_type: 'direct',
      participants: [1, 5],
      is_active: true,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:00:00Z',
      is_pinned: true,
      pinned_at: '2026-01-02T12:00:00Z'
    };

    comp.conversations.set([c1, c2, c3, c4]);
    const filtered = comp.filteredConversations();

    // Pinned ones come first, ordered by -pinned_at, then unpinned by -updated_at
    expect(filtered.map(c => c.id)).toEqual(['c4', 'c3', 'c2', 'c1']);
  });

  it('toggles conversation pin with success toast', async () => {
    await setupPhase3Component();

    comp.toggleConversationPin(sampleConv);
    expect(comm.togglePinConversation).toHaveBeenCalledWith('c300', true);
    expect(mockToast.success).toHaveBeenCalledWith('گفتگو سنجاق شد');
  });

  it('renders pin icon inside message bubble when is_pinned is true', async () => {
    await setupPhase3Component();

    const pinnedMsg: ChatMessage = {
      ...myMsg,
      id: '305',
      text: 'پیام سنجاق شده در گفتگو',
      is_pinned: true
    };
    comp.messages.set([pinnedMsg]);
    fixture.detectChanges();
    await flush(fixture);

    const pinIcon = fixture.nativeElement.querySelector('[data-testid="msg-pinned-icon"]');
    expect(pinIcon).not.toBeNull();
  });

  it('renders telegram pinned bar when active conversation has pinned_messages', async () => {
    await setupPhase3Component();

    const convWithPins: Conversation = {
      ...sampleConv,
      pinned_messages: [
        { id: 301, text: 'دستورالعمل مهم ۱', sender_name: 'مدیر', pinned_at: '2026-01-01T10:00:00Z' },
        { id: 302, text: 'دستورالعمل مهم ۲', sender_name: 'معاون', pinned_at: '2026-01-01T11:00:00Z' }
      ]
    };
    comp.activeConv.set(convWithPins);
    fixture.detectChanges();
    await flush(fixture);

    const pinnedBar = fixture.nativeElement.querySelector('[data-testid="chat-pinned-bar"]');
    expect(pinnedBar).not.toBeNull();
    expect(pinnedBar.textContent).toContain('دستورالعمل مهم ۱');
  });

  it('clicking telegram pinned bar scrolls to message and cycles index', async () => {
    await setupPhase3Component();

    const convWithPins: Conversation = {
      ...sampleConv,
      pinned_messages: [
        { id: 301, text: 'دستورالعمل اول', sender_name: 'مدیر', pinned_at: '2026-01-01T10:00:00Z' },
        { id: 302, text: 'دستورالعمل دوم', sender_name: 'معاون', pinned_at: '2026-01-01T11:00:00Z' }
      ]
    };
    comp.activeConv.set(convWithPins);
    const scrollSpy = vi.spyOn(comp, 'scrollToMessage');
    fixture.detectChanges();
    await flush(fixture);

    const pinnedBar = fixture.nativeElement.querySelector('[data-testid="chat-pinned-bar"]') as HTMLElement;
    expect(pinnedBar).not.toBeNull();

    // Click 1: emits message 301, cycles index to 1
    pinnedBar.click();
    expect(scrollSpy).toHaveBeenCalledWith('301');

    fixture.detectChanges();
    await flush(fixture);
    expect(pinnedBar.textContent).toContain('دستورالعمل دوم');

    // Click 2: emits message 302, cycles back to 0
    pinnedBar.click();
    expect(scrollSpy).toHaveBeenCalledWith('302');
  });

  it('unpin button inside telegram pinned bar calls togglePinMessage with explicit unpin', async () => {
    await setupPhase3Component();

    const convWithPins: Conversation = {
      ...sampleConv,
      my_role: 'owner',
      pinned_messages: [
        { id: 301, text: 'دستورالعمل اول', sender_name: 'مدیر', pinned_at: '2026-01-01T10:00:00Z' }
      ]
    };
    comp.activeConv.set(convWithPins);
    fixture.detectChanges();
    await flush(fixture);

    const unpinBtn = fixture.nativeElement.querySelector('[data-testid="unpin-button"]') as HTMLButtonElement;
    expect(unpinBtn).not.toBeNull();

    unpinBtn.click();
    expect(comm.togglePinMessage).toHaveBeenCalledWith(301, false);
  });
});

describe('ChatDrawerComponent - Phase 7 (Approximate Last Seen & Presence)', () => {
  const baseNow = new Date('2026-11-04T12:00:00Z').getTime();
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let comp: ChatDrawerComponent;
  let comm: any;

  async function setupComponent() {
    TestBed.resetTestingModule();
    const convs$ = new BehaviorSubject<Conversation[]>([]);
    const active$ = new BehaviorSubject<Conversation | null>(null);

    comm = {
      isChatDrawerOpen: signal(true),
      chatReturnUrl: signal<string | null>(null),
      hasActiveConversation: signal(true),
      isMuted: signal(false),
      conversations$: convs$,
      activeConversation$: active$,
      activeMessages$: new BehaviorSubject<ChatMessage[]>([]),
      typingUser$: new Subject<any>(),
      membershipEvents$: new Subject<any>(),
      ensureConnected: vi.fn(),
      refreshPresence: vi.fn(),
      loadConversations: vi.fn().mockResolvedValue(undefined),
      getContacts: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockResolvedValue({ can_create_group: true }),
      getMembers: vi.fn().mockResolvedValue([]),
      openConversation: vi.fn(),
      leaveConversation: vi.fn(),
      closeDrawer: vi.fn(),
      stashComposerDraft: vi.fn(),
      takeComposerDraft: vi.fn().mockReturnValue(null),
      getCurrentUserId: vi.fn().mockReturnValue(1),
      isUserOnline: vi.fn().mockReturnValue(false),
      getLastSeen: vi.fn().mockReturnValue(null),
      setLastSeen: vi.fn(),
      toggleMute: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ChatDrawerComponent],
      providers: [
        { provide: CommunicationService, useValue: comm },
        { provide: StateService, useValue: { appState: { activeWarehouseId: 'ALL' } } },
        { provide: AuthService, useValue: { user: () => ({ id: 1, username: 'me', first_name: 'من', last_name: '' }) } },
        { provide: ToastService, useValue: { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
        { provide: ApiService, useValue: { download: vi.fn() } },
        { provide: ConfigApiService, useValue: { getPublicConfig: () => new Subject<any>() } },
        { provide: FileOutputService, useValue: { canShareFiles: () => false, shareBlob: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn(), url: '/app/launcher', events: of() } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({})) } },
        { provide: HttpClient, useValue: { get: vi.fn(), post: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDrawerComponent);
    comp = fixture.componentInstance;
    comp.activeTab.set('chat');
    fixture.detectChanges();
    await flush(fixture);
  }

  it('State 1: formatLastSeen returns "آنلاین" when isOnline is true', () => {
    expect(formatLastSeen(true, null, baseNow)).toBe('آنلاین');
    expect(formatLastSeen(true, new Date(baseNow - 3600000).toISOString(), baseNow)).toBe('آنلاین');
  });

  it('State 2: formatLastSeen returns "آخرین بازدید اخیراً" when null or within 2 minutes', () => {
    // null or invalid date
    expect(formatLastSeen(false, null, baseNow)).toBe('آخرین بازدید اخیراً');
    expect(formatLastSeen(false, undefined, baseNow)).toBe('آخرین بازدید اخیراً');
    expect(formatLastSeen(false, 'invalid-date', baseNow)).toBe('آخرین بازدید اخیراً');

    // 60 seconds ago (< 120s)
    const sixtySecAgo = new Date(baseNow - 60 * 1000).toISOString();
    expect(formatLastSeen(false, sixtySecAgo, baseNow)).toBe('آخرین بازدید اخیراً');
  });

  it('State 3: formatLastSeen returns "آخرین بازدید امروز ساعت ..." for earlier same calendar day', () => {
    // 3 hours ago on same calendar day
    const threeHoursAgo = new Date(baseNow - 3 * 3600 * 1000);
    const res = formatLastSeen(false, threeHoursAgo.toISOString(), baseNow);
    expect(res).toContain('آخرین بازدید امروز ساعت');
  });

  it('State 4: formatLastSeen returns "آخرین بازدید دیروز" for yesterday calendar day', () => {
    const nowDate = new Date(baseNow);
    const yesterday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, 14, 0, 0);
    expect(formatLastSeen(false, yesterday.toISOString(), baseNow)).toBe('آخرین بازدید دیروز');
  });

  it('State 5: formatLastSeen returns "آخرین بازدید این هفته" for 2 to 6 days ago', () => {
    const fourDaysAgo = new Date(baseNow - 4 * 86400 * 1000);
    expect(formatLastSeen(false, fourDaysAgo.toISOString(), baseNow)).toBe('آخرین بازدید این هفته');
  });

  it('State 6: formatLastSeen returns "آخرین بازدید مدتی پیش" for 7+ days ago', () => {
    const tenDaysAgo = new Date(baseNow - 10 * 86400 * 1000);
    expect(formatLastSeen(false, tenDaysAgo.toISOString(), baseNow)).toBe('آخرین بازدید مدتی پیش');
  });

  it('component getDirectPresenceText and DOM render approximate last seen in direct chat header', async () => {
    const sampleConv: Conversation = {
      id: 'c101',
      conv_type: 'direct',
      title: 'علی رضایی',
      participants: [1, 2],
      is_active: true,
      created_at: '',
      updated_at: '',
      participants_details: [
        { id: 1, username: 'me', full_name: 'من' },
        { id: 2, username: 'ali', full_name: 'علی رضایی' }
      ]
    };
    await setupComponent();

    // Direct conversation with other user offline, last seen yesterday
    const nowDate = new Date();
    const yesterday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1, 15, 30, 0);
    const directConv: Conversation = {
      ...sampleConv,
      conv_type: 'direct',
      participants_details: [
        { id: 1, username: 'me', full_name: 'من' },
        { id: 2, username: 'ali', full_name: 'علی رضایی', last_seen_at: yesterday.toISOString() }
      ]
    };

    comp.activeConv.set(directConv);
    comm.isUserOnline.mockReturnValue(false);
    fixture.detectChanges();
    await flush(fixture);

    expect(comp.getDirectPresenceText()).toBe('آخرین بازدید دیروز');

    const headerTextEl = fixture.nativeElement.querySelector('.text-\\[10px\\].text-slate-400') as HTMLElement;
    expect(headerTextEl).not.toBeNull();
    expect(headerTextEl.textContent?.trim()).toBe('آخرین بازدید دیروز');

    // Switch other user to online
    comm.isUserOnline.mockReturnValue(true);
    comp.activeConv.set({ ...directConv });
    fixture.detectChanges();
    await flush(fixture);

    expect(comp.getDirectPresenceText()).toBe('آنلاین');
    const onlineEl = fixture.nativeElement.querySelector('.text-\\[10px\\].text-emerald-500') as HTMLElement;
    expect(onlineEl).not.toBeNull();
    expect(onlineEl.textContent).toContain('آنلاین');
  });
});
