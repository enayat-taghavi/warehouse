// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { signal } from '@angular/core';

import { ChatDrawerComponent } from './chat-drawer.component';
import { CommunicationService, Conversation, ChatMessage, ConversationMember } from '../../../../../core/services/communication.service';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ApiService } from '../../../../../core/api/api.service';
import { ConfigApiService } from '../../../../../core/api/config-api.service';

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

describe('ChatDrawerComponent (DOM specs - chat stage 3-b groups)', () => {
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let comm: any;
  let toast: any;
  let canCreate: boolean;

  const groupConv = (role: 'owner' | 'admin' | 'member' = 'member', extra: Partial<Conversation> = {}): Conversation => ({
    id: 'g1', conv_type: 'group', title: 'گروه تست', participants: [1, 2, 3], is_active: true,
    created_at: '', updated_at: '', my_role: role, member_count: 3, is_muted: false, ...extra
  });
  const directConv = (): Conversation => ({
    id: 'd1', conv_type: 'direct', title: 'x', participants: [1, 2], is_active: true, created_at: '', updated_at: '',
    participants_details: [
      { id: 1, username: 'me', full_name: 'من' },
      { id: 2, username: 'ali', full_name: 'علی' }
    ]
  });
  const members: ConversationMember[] = [
    { id: 1, username: 'me', full_name: 'من', role: 'member' },
    { id: 2, username: 'boss', full_name: 'مالک گروه', role: 'owner' },
    { id: 3, username: 'adm', full_name: 'ادمین گروه', role: 'admin' },
    { id: 4, username: 'plain', full_name: 'عضو ساده', role: 'member' }
  ];

  async function setup(opts: { canCreate?: boolean; role?: 'owner' | 'admin' | 'member'; conv?: Conversation } = {}) {
    canCreate = opts.canCreate ?? false;
    toast = { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    const convs = new BehaviorSubject<Conversation[]>([]);
    const active = new BehaviorSubject<Conversation | null>(null);
    const drafts = new Map<string, { files: File[]; text: string }>();
    comm = {
      isChatDrawerOpen: signal(true),
      isMuted: signal(false),
      conversations$: convs,
      activeConversation$: active,
      activeMessages$: new BehaviorSubject<ChatMessage[]>([]),
      typingUser$: new Subject<any>(),
      membershipEvents$: new Subject<any>(),
      ensureConnected: vi.fn(),
      refreshPresence: vi.fn(),
      loadConversations: vi.fn().mockResolvedValue(undefined),
      getContacts: vi.fn().mockResolvedValue([
        { id: 1, username: 'me', full_name: 'من' },
        { id: 10, username: 'sara', full_name: 'سارا' },
        { id: 11, username: 'reza', full_name: 'رضا' }
      ]),
      getCapabilities: vi.fn().mockImplementation(async () => ({ can_create_group: canCreate })),
      createGroup: vi.fn().mockResolvedValue(groupConv('owner', { title: 'جدید' })),
      getMembers: vi.fn().mockResolvedValue(members),
      removeMember: vi.fn().mockResolvedValue(undefined),
      addMembers: vi.fn().mockResolvedValue({ added: [] }),
      setMemberRole: vi.fn().mockResolvedValue({}),
      leaveGroup: vi.fn().mockResolvedValue({}),
      renameGroup: vi.fn(),
      muteConversation: vi.fn().mockResolvedValue({}),
      openConversation: vi.fn().mockImplementation(async (c: Conversation) => active.next(c)),
      leaveConversation: vi.fn(),
      stashComposerDraft: vi.fn((id: string, files: File[], text: string) => drafts.set(id, { files, text })),
      takeComposerDraft: vi.fn((id: string) => { const d = drafts.get(id) || null; drafts.delete(id); return d; }),
      getCurrentUserId: vi.fn().mockReturnValue(1),
      isUserOnline: vi.fn().mockReturnValue(false),
      toggleMute: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ChatDrawerComponent],
      providers: [
        { provide: CommunicationService, useValue: comm },
        { provide: StateService, useValue: { appState: { activeWarehouseId: 'ALL' } } },
        { provide: AuthService, useValue: { user: () => ({ id: 1, username: 'me', first_name: '', last_name: '' }) } },
        { provide: ToastService, useValue: toast },
        { provide: ApiService, useValue: { download: vi.fn() } },
        { provide: ConfigApiService, useValue: { getPublicConfig: () => new Subject<any>() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDrawerComponent);
    fixture.detectChanges();
    await flush(fixture);
    if (opts.conv) {
      active.next(opts.conv);
      await flush(fixture);
    }
  }

  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
  const qa = (sel: string) => Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[];

  beforeEach(() => TestBed.resetTestingModule());

  /** گروه جدید در صفحهٔ «همکاران» است که با دکمهٔ کنار صافی باز می‌شود */
  const openContacts = async () => {
    q('[data-testid="open-contacts-btn"]')!.click();
    await flush(fixture);
  };

  it('hides the new-group button when can_create_group is false', async () => {
    await setup({ canCreate: false });
    await openContacts();
    expect(q('[data-testid="new-group-btn"]')).toBeNull();
  });

  it('shows the new-group button when can_create_group is true', async () => {
    await setup({ canCreate: true });
    expect(q('[data-testid="new-group-btn"]')).toBeNull();
    await openContacts();
    expect(q('[data-testid="contacts-title"]')).not.toBeNull();
    expect(q('[data-testid="new-group-btn"]')).not.toBeNull();
  });

  it('create dialog submits the trimmed title and selected ids', async () => {
    await setup({ canCreate: true });
    await openContacts();
    q('[data-testid="new-group-btn"]')!.click();
    await flush(fixture);
    expect(q('[data-testid="create-dialog"]')).not.toBeNull();
    expect((q('[data-testid="create-submit"]') as HTMLButtonElement).disabled).toBe(true);

    const input = q('[data-testid="group-title-input"]') as HTMLInputElement;
    input.value = '  تیم انبار  ';
    input.dispatchEvent(new Event('input'));
    (q('[data-testid="pick-10"]') as HTMLInputElement).click();
    (q('[data-testid="pick-11"]') as HTMLInputElement).click();
    await flush(fixture);
    expect(q('[data-testid="picked-count"]')!.textContent).toContain('۲');

    (q('[data-testid="create-submit"]') as HTMLButtonElement).click();
    await flush(fixture);
    expect(comm.createGroup).toHaveBeenCalledWith('تیم انبار', [10, 11]);
    expect(comm.openConversation).toHaveBeenCalled();
    expect(q('[data-testid="create-dialog"]')).toBeNull();
  });

  it('keeps the dialog state and shows a Persian error when creation fails', async () => {
    await setup({ canCreate: true });
    comm.createGroup.mockRejectedValue({ status: 400, error: { user_ids: ['x'] } });
    await openContacts();
    q('[data-testid="new-group-btn"]')!.click();
    await flush(fixture);
    const input = q('[data-testid="group-title-input"]') as HTMLInputElement;
    input.value = 'گروه';
    input.dispatchEvent(new Event('input'));
    (q('[data-testid="pick-10"]') as HTMLInputElement).click();
    await flush(fixture);
    (q('[data-testid="create-submit"]') as HTMLButtonElement).click();
    await flush(fixture);
    expect(q('[data-testid="group-error"]')!.textContent).toContain('برخی کاربران انتخاب‌شده معتبر نیستند');
    expect((q('[data-testid="group-title-input"]') as HTMLInputElement).value).toBe('گروه');
    expect(fixture.componentInstance.pickedIds()).toEqual([10]);
  });

  it('info panel lists members with role labels', async () => {
    await setup({ conv: groupConv('member') });
    q('[data-testid="group-info-btn"]')!.click();
    await flush(fixture);
    const text = q('[data-testid="member-list"]')!.textContent!;
    expect(text).toContain('مالک');
    expect(text).toContain('مدیر گروه');
    expect(text).toContain('عضو');
    expect(qa('[data-testid="role-badge"]').length).toBe(4);
  });

  it('hides the remove button for a plain member and shows it for the owner', async () => {
    await setup({ conv: groupConv('member') });
    q('[data-testid="group-info-btn"]')!.click();
    await flush(fixture);
    expect(qa('[data-testid="remove-member"]').length).toBe(0);
    expect(q('[data-testid="add-member-btn"]')).toBeNull();

    fixture.componentInstance.closeInfo();
    fixture.componentInstance.activeConv.set(groupConv('owner'));
    await fixture.componentInstance.openInfo();
    await flush(fixture);
    // owner can remove admin and plain member, not self (member id 1) nor owner
    expect(qa('[data-testid="remove-member"]').length).toBe(2);
    expect(q('[data-testid="add-member-btn"]')).not.toBeNull();
  });

  it('asks for confirmation before removing a member', async () => {
    await setup({ conv: groupConv('owner') });
    q('[data-testid="group-info-btn"]')!.click();
    await flush(fixture);
    qa('[data-testid="remove-member"]')[1].click();
    await flush(fixture);
    expect(comm.removeMember).not.toHaveBeenCalled();
    (q('[data-testid="confirm-yes"]') as HTMLButtonElement).click();
    await flush(fixture);
    expect(comm.removeMember).toHaveBeenCalledWith('g1', 4);
    expect(comm.getMembers).toHaveBeenCalledTimes(2);
  });

  it('renders a system message without a bubble', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([
      { id: 'm1', conversation: 'g1', sender: 2, text: 'سارا به گروه اضافه شد', is_system: true, created_at: '' } as ChatMessage
    ]);
    await flush(fixture);
    const sys = q('[data-testid="system-message"]');
    expect(sys).not.toBeNull();
    expect(sys!.textContent).toContain('سارا به گروه اضافه شد');
    expect(sys!.className).not.toContain('rounded-2xl');
    expect(q('[data-testid="sender-name"]')).toBeNull();
  });

  it('shows the sender name in groups but not in direct chats', async () => {
    await setup({ conv: groupConv('member') });
    const msg = { id: 'm1', conversation: 'g1', sender: 2, text: 'سلام', is_me: false, created_at: '',
      sender_details: { id: 2, username: 'ali', full_name: 'علی' } } as ChatMessage;
    comm.activeMessages$.next([msg]);
    await flush(fixture);
    expect(q('[data-testid="sender-name"]')!.textContent).toContain('علی');

    comm.activeConversation$.next(directConv());
    await flush(fixture);
    expect(q('[data-testid="sender-name"]')).toBeNull();
  });

  it('closes the active conversation and toasts when removed from the group', async () => {
    await setup({ conv: groupConv('member') });
    expect(fixture.componentInstance.activeConv()).not.toBeNull();
    comm.membershipEvents$.next({ type: 'removed', conversationId: 'g1' });
    await flush(fixture);
    expect(fixture.componentInstance.activeConv()).toBeNull();
    expect(fixture.componentInstance.activeTab()).toBe('conversations');
    expect(toast.show).toHaveBeenCalledWith('warning', 'شما از گروه حذف شدید');
  });

  it('ignores removed events for other conversations', async () => {
    await setup({ conv: groupConv('member') });
    comm.membershipEvents$.next({ type: 'removed', conversationId: 'other' });
    await flush(fixture);
    expect(fixture.componentInstance.activeConv()).not.toBeNull();
    expect(toast.show).not.toHaveBeenCalled();
  });
  it('E14: hides the composer and shows a note when can_post is false', async () => {
    await setup({ conv: { ...groupConv('member'), conv_type: 'announcement', can_post: false } });
    expect(q('[data-testid="cannot-post-note"]')!.textContent).toContain('فقط مدیران');
    expect(q('[data-testid="composer"]')).toBeNull();
  });

  it('shows the composer when can_post is not false', async () => {
    await setup({ conv: groupConv('member', { can_post: true }) });
    expect(q('[data-testid="cannot-post-note"]')).toBeNull();
    expect(q('[data-testid="composer"]')).not.toBeNull();
  });

  it('U8: read-by panel lists members who read up to my message (and not me or earlier readers)', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([
      { id: '10', conversation: 'g1', sender: 1, is_me: true, text: 'سلام', created_at: '', read_by_count: 1 }
    ]);
    comm.getReadStatus = vi.fn().mockResolvedValue({
      conversation_id: 'g1', read_count: 2,
      members: [
        { user_id: 1, name: 'من', last_read_message_id: '10', last_read_at: null },
        { user_id: 2, name: 'علی', last_read_message_id: '12', last_read_at: null },
        { user_id: 3, name: 'سارا', last_read_message_id: '9', last_read_at: null },
        { user_id: 4, name: 'رضا', last_read_message_id: null, last_read_at: null }
      ]
    });
    await flush(fixture);
    q('[data-testid="read-by-btn"]')!.click();
    await flush(fixture);
    expect(comm.getReadStatus).toHaveBeenCalledWith('g1');
    expect(q('[data-testid="read-by-2"]')!.textContent).toContain('علی');
    expect(q('[data-testid="read-by-3"]')).toBeNull();
    expect(q('[data-testid="read-by-1"]')).toBeNull();
    expect(q('[data-testid="read-by-4"]')).toBeNull();
  });

  it('U8: read-by panel shows error with retry', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([{ id: '10', conversation: 'g1', sender: 1, is_me: true, text: 'x', created_at: '' }]);
    comm.getReadStatus = vi.fn().mockRejectedValue(new Error('x'));
    await flush(fixture);
    q('[data-testid="read-by-btn"]')!.click();
    await flush(fixture);
    expect(q('[data-testid="read-by-error"]')!.textContent).toContain('خطا در دریافت');
  });

  it('U8: no read-by button in direct chats', async () => {
    await setup({ conv: directConv() });
    comm.activeMessages$.next([{ id: '10', conversation: 'd1', sender: 1, is_me: true, text: 'x', created_at: '' }]);
    await flush(fixture);
    expect(q('[data-testid="read-by-btn"]')).toBeNull();
  });

  // ─── مرحلهٔ ۵ چت: منوی پیام، پاسخ، جداکنندهٔ روز، متن چندخطی، لینک ───
  const nowIso = () => new Date().toISOString();
  const mk = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id, conversation: 'g1', sender: 2, text: 'متن ' + id, created_at: nowIso(), ...extra
  } as ChatMessage);
  const openMenu = async (id: string) => {
    const el = q(`[data-msg-id="${id}"] [data-testid="msg-menu-btn"]`) as HTMLElement;
    el.click();
    await flush(fixture);
  };

  it('U2: menu opens for numeric server ids and Escape closes it', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([mk(77 as unknown as string, { sender: 1, is_me: true })]);
    await flush(fixture);
    await openMenu('77');
    expect(q('[data-testid="msg-menu"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush(fixture);
    expect(q('[data-testid="msg-menu"]')).toBeNull();
  });

  it('message menu opens upward and flips side when it would leave the messages box', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([mk('88', { sender: 1, is_me: true })]);
    await flush(fixture);
    await openMenu('88');
    const rect = (top: number, bottom: number, left: number, right: number) =>
      ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const scrollBox = (fixture.componentInstance as any).messagesScrollContainer.nativeElement as HTMLElement;
    vi.spyOn(scrollBox, 'getBoundingClientRect').mockReturnValue(rect(0, 500, 0, 300));
    const menu = q('[data-testid="msg-menu"]') as HTMLElement;
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(rect(460, 620, -40, 120));
    vi.spyOn(menu.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(420, 460, 120, 160));
    (fixture.componentInstance as any).fitMenu('88');
    fixture.detectChanges();
    const cls = (q('[data-testid="msg-menu"]') as HTMLElement).classList;
    expect(cls.contains('bottom-full')).toBe(true);
    expect(cls.contains('top-full')).toBe(false);
    expect(cls.contains('start-0')).toBe(true);
  });

  it('U2: edit is offered only for own message with text inside the edit window', async () => {
    await setup({ conv: groupConv('member') });
    const future = new Date(Date.now() + 5 * 60000).toISOString();
    const past = new Date(Date.now() - 60000).toISOString();
    comm.activeMessages$.next([
      mk('1', { sender: 1, is_me: true, editable_until: future }),
      mk('2', { sender: 1, is_me: true, editable_until: past }),
      mk('3', { sender: 2, is_me: false, editable_until: null })
    ]);
    await flush(fixture);
    await openMenu('1');
    expect(q('[data-testid="menu-edit"]')).not.toBeNull();
    await openMenu('2');
    expect(q('[data-testid="menu-edit"]')).toBeNull();
    await openMenu('3');
    expect(q('[data-testid="menu-edit"]')).toBeNull();
    expect(q('[data-testid="menu-reply"]')).not.toBeNull();
    expect(q('[data-testid="menu-copy"]')).not.toBeNull();
  });

  it('U2: delete shows for own messages, hides for others unless superuser in a non-direct chat', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([mk('1', { sender: 1, is_me: true }), mk('2')]);
    await flush(fixture);
    await openMenu('1');
    expect(q('[data-testid="menu-delete"]')).not.toBeNull();
    await openMenu('2');
    expect(q('[data-testid="menu-delete"]')).toBeNull();

    (fixture.componentInstance as any).auth.user = () => ({ id: 1, username: 'me', is_superuser: true });
    await openMenu('2'); // بستن
    await openMenu('2');
    expect(q('[data-testid="menu-delete"]')).not.toBeNull();
  });

  it('U2: superuser cannot delete others messages in a direct chat', async () => {
    await setup({ conv: directConv() });
    (fixture.componentInstance as any).auth.user = () => ({ id: 1, username: 'me', is_superuser: true });
    comm.activeMessages$.next([mk('2', { conversation: 'd1' })]);
    await flush(fixture);
    await openMenu('2');
    expect(q('[data-testid="menu-delete"]')).toBeNull();
  });

  it('U2: delete asks for confirmation then calls the service', async () => {
    await setup({ conv: groupConv('member') });
    comm.deleteMessage = vi.fn().mockResolvedValue(undefined);
    comm.activeMessages$.next([mk('1', { sender: 1, is_me: true })]);
    await flush(fixture);
    await openMenu('1');
    q('[data-testid="menu-delete"]')!.click();
    await flush(fixture);
    expect(comm.deleteMessage).not.toHaveBeenCalled();
    expect(q('[data-testid="delete-dialog"]')).not.toBeNull();
    q('[data-testid="delete-confirm"]')!.click();
    await flush(fixture);
    expect(comm.deleteMessage).toHaveBeenCalledWith('1');
    expect(q('[data-testid="delete-dialog"]')).toBeNull();
  });

  it('U2: reply strip appears, is sent as reply_to, and clears', async () => {
    await setup({ conv: groupConv('member') });
    comm.sendMessage = vi.fn().mockResolvedValue(undefined);
    comm.activeMessages$.next([mk('5', { sender_details: { id: 2, username: 'ali', full_name: 'علی' } as any })]);
    await flush(fixture);
    expect(q('[data-testid="reply-strip"]')).toBeNull();
    await openMenu('5');
    q('[data-testid="menu-reply"]')!.click();
    await flush(fixture);
    expect(q('[data-testid="reply-strip"]')!.textContent).toContain('علی');
    fixture.componentInstance.messageInputText = 'جواب';
    await fixture.componentInstance.sendMessage();
    await flush(fixture);
    expect(comm.sendMessage).toHaveBeenCalledWith('g1', 'جواب', '5', undefined);
    expect(q('[data-testid="reply-strip"]')).toBeNull();
  });

  it('U2: reply strip can be cancelled', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([mk('5')]);
    await flush(fixture);
    await openMenu('5');
    q('[data-testid="menu-reply"]')!.click();
    await flush(fixture);
    q('[data-testid="reply-cancel"]')!.click();
    await flush(fixture);
    expect(q('[data-testid="reply-strip"]')).toBeNull();
  });

  it('U2: edit mode submits PATCH through the service', async () => {
    await setup({ conv: groupConv('member') });
    comm.editMessage = vi.fn().mockResolvedValue({});
    comm.sendMessage = vi.fn();
    comm.activeMessages$.next([mk('1', { sender: 1, is_me: true, editable_until: new Date(Date.now() + 60000).toISOString() })]);
    await flush(fixture);
    await openMenu('1');
    q('[data-testid="menu-edit"]')!.click();
    await flush(fixture);
    expect(q('[data-testid="edit-strip"]')).not.toBeNull();
    fixture.componentInstance.messageInputText = 'اصلاح';
    await fixture.componentInstance.sendMessage();
    await flush(fixture);
    expect(comm.editMessage).toHaveBeenCalledWith('1', 'اصلاح');
    expect(comm.sendMessage).not.toHaveBeenCalled();
    expect(q('[data-testid="edit-strip"]')).toBeNull();
  });

  it('quoted reply shows the original, or the deleted note', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([
      mk('7', { reply_to: '5', reply_to_details: { id: '5', deleted: false, text: 'اصل پیام', sender_name: 'سارا', has_attachment: false } }),
      mk('8', { reply_to: '6', reply_to_details: { id: '6', deleted: true } })
    ]);
    await flush(fixture);
    const quotes = qa('[data-testid="reply-quote"]');
    expect(quotes[0].textContent).toContain('اصل پیام');
    expect(quotes[1].textContent).toContain('پیام حذف شد');
  });

  it('E21: date separators say today and yesterday', async () => {
    await setup({ conv: groupConv('member') });
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    comm.activeMessages$.next([mk('1', { created_at: yesterday }), mk('2', { created_at: nowIso() })]);
    await flush(fixture);
    const seps = qa('[data-testid="date-sep"]').map(e => e.textContent!.trim());
    expect(seps).toEqual(['دیروز', 'امروز']);
  });

  it('E21: Enter sends and Shift+Enter does not', async () => {
    await setup({ conv: groupConv('member') });
    comm.sendMessage = vi.fn().mockResolvedValue(undefined);
    const ta = q('[data-testid="composer"]') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    fixture.componentInstance.messageInputText = 'سلام';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    await flush(fixture);
    expect(comm.sendMessage).not.toHaveBeenCalled();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flush(fixture);
    expect(comm.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('E21: http links become anchors with rel=noopener noreferrer; other schemes stay text', async () => {
    await setup({ conv: groupConv('member') });
    comm.activeMessages$.next([mk('1', { text: 'ببین https://example.com/a?b=1. و javascript:alert(1)' })]);
    await flush(fixture);
    const a = q('[data-msg-id="1"] a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://example.com/a?b=1');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(qa('[data-msg-id="1"] a').length).toBe(1);
  });

  it('E21: a file-only last message shows the file label in the conversation list', async () => {
    await setup({});
    comm.conversations$.next([{ ...directConv(), last_message: { id: '1', text: '', sender_name: 'x', created_at: nowIso(), has_attachment: true } }]);
    await flush(fixture);
    expect(q('[data-testid="last-file"]')!.textContent).toContain('فایل');
  });
});
