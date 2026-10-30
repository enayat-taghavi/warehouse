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
        { provide: ApiService, useValue: { download: vi.fn() } }
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

  it('hides the new-group button when can_create_group is false', async () => {
    await setup({ canCreate: false });
    expect(q('[data-testid="new-group-btn"]')).toBeNull();
  });

  it('shows the new-group button when can_create_group is true', async () => {
    await setup({ canCreate: true });
    expect(q('[data-testid="new-group-btn"]')).not.toBeNull();
  });

  it('create dialog submits the trimmed title and selected ids', async () => {
    await setup({ canCreate: true });
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
});
