// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { signal } from '@angular/core';

import { ChatDrawerComponent } from './chat-drawer.component';
import { CommunicationService, Conversation, ChatMessage, MessageAttachment } from '../../../../../core/services/communication.service';
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
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }
};

let publicConfig$ = new BehaviorSubject<any>({});

describe('ChatDrawerComponent - Attachments & Media (chat stage 5-c)', () => {
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let component: ChatDrawerComponent;
  let comm: any;
  let toast: any;

  const defaultConv: Conversation = {
    id: 'c1',
    conv_type: 'direct',
    title: 'گفتگوی تستی',
    participants: [1, 2],
    is_active: true,
    created_at: '',
    updated_at: ''
  };

  const makeMsg = (id: string, text: string, attachments: MessageAttachment[] = []): ChatMessage => ({
    id,
    conversation: 'c1',
    sender: 1,
    text,
    attachments,
    created_at: new Date().toISOString(),
    is_me: true
  });

  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
  const qa = (sel: string) => Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[];

  beforeEach(async () => {
    publicConfig$ = new BehaviorSubject<any>({});
    const showFn = vi.fn();
    toast = {
      show: showFn,
      success: vi.fn((msg: string) => showFn('success', msg)),
      error: vi.fn((msg: string) => showFn('error', msg)),
      warning: vi.fn((msg: string) => showFn('warning', msg)),
      info: vi.fn((msg: string) => showFn('info', msg))
    };

    const convs = new BehaviorSubject<Conversation[]>([defaultConv]);
    const active = new BehaviorSubject<Conversation | null>(defaultConv);

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
      getContacts: vi.fn().mockResolvedValue([]),
      getCapabilities: vi.fn().mockResolvedValue({ can_create_group: true }),
      getMembers: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue({}),
      openConversation: vi.fn().mockImplementation(async (c: Conversation) => active.next(c)),
      leaveConversation: vi.fn(),
      stashComposerDraft: vi.fn((id: string, files: File[], text: string) => drafts.set(id, { files, text })),
      takeComposerDraft: vi.fn((id: string) => { const d = drafts.get(id) || null; drafts.delete(id); return d; }),
      getCurrentUserId: vi.fn().mockReturnValue(1),
      isUserOnline: vi.fn().mockReturnValue(false)
    };

    await TestBed.configureTestingModule({
      imports: [ChatDrawerComponent],
      providers: [
        { provide: CommunicationService, useValue: comm },
        { provide: StateService, useValue: { appState: { activeWarehouseId: 'ALL' } } },
        { provide: AuthService, useValue: { user: () => ({ id: 1, username: 'me', first_name: '', last_name: '' }) } },
        { provide: ToastService, useValue: toast },
        { provide: ApiService, useValue: { download: vi.fn() } },
        { provide: ConfigApiService, useValue: { getPublicConfig: () => publicConfig$ } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatDrawerComponent);
    component = fixture.componentInstance;
    component.activeConv.set(defaultConv);
    component.activeTab.set('chat');
    fixture.detectChanges();
    await flush(fixture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('1. one image attachment with width: 800, height: 400 renders att-image whose ratio box has aspect-ratio 800 / 400, and a skeleton while attachmentPreview returns null', async () => {
    vi.spyOn(component, 'attachmentPreview').mockReturnValue(null);
    const att: MessageAttachment = {
      id: 'att-1',
      file_name: 'photo.jpg',
      file_size: 1024,
      content_type: 'image/jpeg',
      width: 800,
      height: 400
    };
    component.messages.set([makeMsg('m1', 'یک عکس', [att])]);
    await flush(fixture);

    const attImg = q('[data-testid="att-image"]');
    expect(attImg).not.toBeNull();
    const ratioBox = attImg?.querySelector('[style*="aspect-ratio"]') as HTMLElement;
    expect(ratioBox).not.toBeNull();
    expect(ratioBox.style.aspectRatio).toBe('800 / 400');
    expect(attImg?.querySelector('.animate-pulse')).not.toBeNull();
    expect(attImg?.querySelector('img')).toBeNull();
  });

  it('2. with the spy returning "blob:x" an <img loading="lazy"> with that src is rendered', async () => {
    vi.spyOn(component, 'attachmentPreview').mockReturnValue('blob:x');
    const att: MessageAttachment = {
      id: 'att-1',
      file_name: 'photo.jpg',
      file_size: 1024,
      content_type: 'image/jpeg',
      width: 800,
      height: 400
    };
    component.messages.set([makeMsg('m1', 'یک عکس', [att])]);
    await flush(fixture);

    const img = q('[data-testid="att-image"] img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.src).toContain('blob:x');
  });

  it('3. five images in one message render att-grid with exactly 4 att-image tiles and att-more text containing «+۲»', async () => {
    const images: MessageAttachment[] = [1, 2, 3, 4, 5].map((i) => ({
      id: `img-${i}`,
      file_name: `img-${i}.png`,
      file_size: 500,
      content_type: 'image/png'
    }));
    component.messages.set([makeMsg('m2', 'چند عکس', images)]);
    await flush(fixture);

    const grid = q('[data-testid="att-grid"]');
    expect(grid).not.toBeNull();
    const tiles = qa('[data-testid="att-grid"] [data-testid="att-image"]');
    expect(tiles.length).toBe(4);
    const more = q('[data-testid="att-more"]');
    expect(more).not.toBeNull();
    expect(more?.textContent).toContain('+۲');
  });

  it('4. a PDF attachment with page_count: 3, file_size: 1258291 renders att-card-pdf containing «۳ صفحه» and «مگابایت»', async () => {
    const pdfAtt: MessageAttachment = {
      id: 'pdf-1',
      file_name: 'contract.pdf',
      file_size: 1258291,
      content_type: 'application/pdf',
      page_count: 3
    };
    component.messages.set([makeMsg('m3', 'فایل پی‌دی‌اف', [pdfAtt])]);
    await flush(fixture);

    const pdfCard = q('[data-testid="att-card-pdf"]');
    expect(pdfCard).not.toBeNull();
    expect(pdfCard?.textContent).toContain('۳ صفحه');
    expect(pdfCard?.textContent).toContain('مگابایت');
  });

  it('5. a .docx attachment renders att-card-file containing «DOCX» (case-insensitive check) and uses appIcon file-word', async () => {
    const docxAtt: MessageAttachment = {
      id: 'doc-1',
      file_name: 'letter.docx',
      file_size: 50000,
      content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    component.messages.set([makeMsg('m4', 'نامه اداری', [docxAtt])]);
    await flush(fixture);

    const card = q('[data-testid="att-card-file"]');
    expect(card).not.toBeNull();
    expect(card?.textContent?.toUpperCase()).toContain('DOCX');
    const icon = card?.querySelector('[appIcon="file-word"]');
    expect(icon).not.toBeNull();
  });

  it('6. clicking att-image calls openAttachment with the message and the attachment; clicking the PDF download button calls downloadAttachment and NOT openAttachment', async () => {
    const openSpy = vi.spyOn(component, 'openAttachment').mockImplementation(() => {});
    const dlSpy = vi.spyOn(component, 'downloadAttachment').mockImplementation(async () => {});

    const imgAtt: MessageAttachment = {
      id: 'img-1',
      file_name: 'pic.png',
      file_size: 1000,
      content_type: 'image/png'
    };
    const pdfAtt: MessageAttachment = {
      id: 'pdf-1',
      file_name: 'doc.pdf',
      file_size: 2000,
      content_type: 'application/pdf'
    };
    const msg = makeMsg('m5', 'پیوست‌ها', [imgAtt, pdfAtt]);
    component.messages.set([msg]);
    await flush(fixture);

    const attImg = q('[data-testid="att-image"]') as HTMLElement;
    attImg.click();
    expect(openSpy).toHaveBeenCalledWith(msg, imgAtt);

    openSpy.mockClear();
    const pdfDlBtn = q('[data-testid="att-card-pdf"] button[aria-label^="دانلود"]') as HTMLElement;
    expect(pdfDlBtn).not.toBeNull();
    pdfDlBtn.click();
    expect(dlSpy).toHaveBeenCalledWith(pdfAtt);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('7. component.addFiles([png, pdf]) shows picked-strip with two items; clicking the first picked-remove leaves one item', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:p'),
      revokeObjectURL: vi.fn()
    });
    const png = new File(['a'], 'a.png', { type: 'image/png' });
    const pdf = new File(['b'], 'b.pdf', { type: 'application/pdf' });

    component.addFiles([png, pdf]);
    fixture.detectChanges();

    const strip = q('[data-testid="picked-strip"]');
    expect(strip).not.toBeNull();
    let removes = qa('[data-testid="picked-remove"]');
    expect(removes.length).toBe(2);

    removes[0].click();
    fixture.detectChanges();

    removes = qa('[data-testid="picked-remove"]');
    expect(removes.length).toBe(1);
  });

  it('7b. file above the default 100 MB limit is refused with a Persian message; same for a server-configured 2 MB limit', async () => {
    expect(component.maxUploadMb()).toBe(100);
    const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 101 * 1024 * 1024 });
    component.addFiles([big]);
    expect(component.pickedFiles().length).toBe(0);
    expect(toast.show).toHaveBeenCalledWith('error', expect.stringContaining('مگابایت'));

    publicConfig$.next({ chat_max_upload_mb: 2 });
    expect(component.maxUploadMb()).toBe(2);
    const three = new File([new Uint8Array(3 * 1024 * 1024)], 'three.pdf', { type: 'application/pdf' });
    component.addFiles([three]);
    expect(component.pickedFiles().length).toBe(0);
    expect(toast.show).toHaveBeenLastCalledWith('error', expect.stringContaining('۲'));
  });

  it('7c. conversation filter: «همه» lists every conversation, «شخصی» only direct ones, «گروه» groups and the announcement channel', async () => {
    component.activeConv.set(null);
    component.activeTab.set('conversations');
    component.conversations.set([
      { id: 'd1', conv_type: 'direct', title: '', participants_details: [] },
      { id: 'g1', conv_type: 'group', title: 'گروه یک', participants_details: [] },
      { id: 'a1', conv_type: 'announcement', title: 'اطلاعیه', participants_details: [] },
    ] as any);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="conv-filter"]')).toBeTruthy();
    expect(component.filteredConversations().map(c => c.id)).toEqual(['d1', 'g1', 'a1']);

    (el.querySelector('[data-testid="conv-filter-direct"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.filteredConversations().map(c => c.id)).toEqual(['d1']);
    expect(el.querySelector('[data-testid="conv-filter-direct"]')!.getAttribute('aria-checked')).toBe('true');

    (el.querySelector('[data-testid="conv-filter-group"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.filteredConversations().map(c => c.id)).toEqual(['g1', 'a1']);
    expect(component.convKindCount('group')).toBe(2);
    expect(component.convKindCount('all')).toBe(3);

    // بالای فهرست یک ردیف است: جستجو تا زدن دکمهٔ جستجو پنهان است و «همکاران» کنار صافی است
    expect(el.querySelector('[data-testid="drawer-search-input"]')).toBeNull();
    (el.querySelector('[data-testid="conv-search-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="drawer-search-input"]')).toBeTruthy();
    (el.querySelector('[data-testid="open-contacts-btn"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.activeTab()).toBe('contacts');
    expect(el.querySelector('[data-testid="conv-filter"]')).toBeNull();
  });

  it('8. a file named x.svg passed to addFiles is refused (strip stays empty) and ToastService.show was called with "error"', async () => {
    const toastSpy = vi.spyOn(toast, 'show');
    const svg = new File(['<svg></svg>'], 'x.svg', { type: 'image/svg+xml' });

    component.addFiles([svg]);
    fixture.detectChanges();

    expect(q('[data-testid="picked-strip"]')).toBeNull();
    expect(toastSpy).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('9. offline with two picked files there is no refusal note; sendMessage hands both files to the service (the chat outbox keeps them until the network returns)', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:p'),
      revokeObjectURL: vi.fn()
    });
    const png = new File(['1'], 'a.png', { type: 'image/png' });
    const pdf = new File(['2'], 'b.pdf', { type: 'application/pdf' });
    component.addFiles([png, pdf]);
    vi.spyOn(component, 'isOnline').mockReturnValue(false);
    fixture.detectChanges();

    const note = q('[data-testid="offline-multi-note"]');
    expect(note).toBeNull();

    await component.sendMessage();
    expect(comm.sendMessage).toHaveBeenCalledTimes(1);
    const sentFiles = (comm.sendMessage as any).mock.calls[0][3] as File[];
    expect(sentFiles.map(f => f.name)).toEqual(['a.png', 'b.pdf']);
  });

  it('9b. picked files and text stay with their conversation: switching to another conversation empties the strip, switching back restores them; closing the drawer keeps them for the next open', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:p'), revokeObjectURL: vi.fn() });
    const pdf = new File(['2'], 'b.pdf', { type: 'application/pdf' });
    component.addFiles([pdf]);
    component.messageInputText = 'پیش‌نویس';
    comm.activeConversation$.next({ ...defaultConv, id: 'c2' });
    fixture.detectChanges();
    expect(component.pickedFiles().length).toBe(0);
    expect(component.messageInputText).toBe('');
    comm.activeConversation$.next(defaultConv);
    fixture.detectChanges();
    expect(component.pickedFiles().map(p => p.file)).toEqual([pdf]);
    expect(component.messageInputText).toBe('پیش‌نویس');
    fixture.destroy();
    expect(comm.stashComposerDraft).toHaveBeenLastCalledWith('c1', [pdf], 'پیش‌نویس');
  });

  it('10. opening the info panel (component.infoOpen.set(true), members signal empty) with one image and one PDF message shows media-tab with one media-image and one media-file; with no attachments both media-empty texts appear', async () => {
    const imgAtt: MessageAttachment = { id: 'img-1', file_name: 'pic.png', file_size: 100, content_type: 'image/png' };
    const pdfAtt: MessageAttachment = { id: 'pdf-1', file_name: 'doc.pdf', file_size: 200, content_type: 'application/pdf' };
    component.messages.set([
      makeMsg('m1', '', [imgAtt]),
      makeMsg('m2', '', [pdfAtt])
    ]);
    component.members.set([]);
    component.infoOpen.set(true);
    await flush(fixture);

    const mediaTab = q('[data-testid="media-tab"]');
    expect(mediaTab).not.toBeNull();
    expect(qa('[data-testid="media-image"]').length).toBe(1);
    expect(qa('[data-testid="media-file"]').length).toBe(1);

    // Empty state with no attachments
    component.messages.set([makeMsg('m3', 'بدون پیوست', [])]);
    await flush(fixture);

    const emptyStates = qa('[data-testid="media-empty"]');
    expect(emptyStates.length).toBe(2);
    expect(emptyStates[0].textContent).toContain('عکسی در این گفتگو نیست');
    expect(emptyStates[1].textContent).toContain('فایلی در این گفتگو نیست');
  });
});
