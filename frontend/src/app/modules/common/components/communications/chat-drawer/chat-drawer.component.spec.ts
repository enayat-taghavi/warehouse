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
