// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { signal } from '@angular/core';
import { Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { ChatDrawerComponent } from './chat-drawer.component';
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
      toggleMute: vi.fn()
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
