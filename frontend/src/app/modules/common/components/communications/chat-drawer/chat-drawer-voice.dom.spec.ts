// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { signal } from '@angular/core';

import { ChatDrawerComponent } from './chat-drawer.component';
import {
  CommunicationService,
  Conversation,
  ChatMessage,
  MessageAttachment
} from '../../../../../core/services/communication.service';
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

let lastRecorder: FakeMediaRecorder | null = null;
let fakeTrack: { stop: ReturnType<typeof vi.fn> };
let fakeGetUserMedia: ReturnType<typeof vi.fn>;

class FakeMediaRecorder {
  static isTypeSupported(mime: string): boolean {
    return mime === 'audio/webm;codecs=opus';
  }

  stream: any;
  options: any;
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((ev: any) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn((_timeslice?: number) => {});

  constructor(stream: any, options?: any) {
    this.stream = stream;
    this.options = options;
    lastRecorder = this;
  }

  stop(): void {
    this.onstop?.();
  }

  emit(bytes: number): void {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
}

describe('ChatDrawerComponent - Voice Messages (DOM Specs)', () => {
  let fixture: ComponentFixture<ChatDrawerComponent>;
  let component: ChatDrawerComponent;
  let comm: any;
  let toast: any;
  let publicConfig$: BehaviorSubject<any>;

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

  beforeEach(async () => {
    lastRecorder = null;
    fakeTrack = { stop: vi.fn() };
    fakeGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [fakeTrack]
    });

    (globalThis as any).MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: { getUserMedia: fakeGetUserMedia }
    });

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
      sendTypingStatus: vi.fn(),
      openConversation: vi.fn().mockImplementation(async (c: Conversation) => active.next(c)),
      leaveConversation: vi.fn(),
      stashComposerDraft: vi.fn((id: string, files: File[], text: string) => drafts.set(id, { files, text })),
      takeComposerDraft: vi.fn((id: string) => {
        const d = drafts.get(id) || null;
        drafts.delete(id);
        return d;
      }),
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
    vi.useRealTimers();
    delete (globalThis as any).MediaRecorder;
    delete (navigator as any).mediaDevices;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('a) without MediaRecorder (jsdom default) record-start is absent and the send action button is shown', async () => {
    delete (globalThis as any).MediaRecorder;
    component.messageInputText = '';
    component.pickedFiles.set([]);
    fixture.detectChanges();

    expect(q('[data-testid="record-start"]')).toBeNull();
    expect(q('button[appAction="send"]')).not.toBeNull();
  });

  it('b) with fake recorder and mic, empty composer: record-start is shown; typing text hides it (send button back); a picked file also hides it', async () => {
    component.messageInputText = '';
    component.pickedFiles.set([]);
    fixture.detectChanges();
    expect(q('[data-testid="record-start"]')).not.toBeNull();
    expect(q('button[appAction="send"]')).toBeNull();

    const composer = q('[data-testid="composer"]') as HTMLTextAreaElement;
    expect(composer).not.toBeNull();
    composer.value = 'سلام';
    composer.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(q('[data-testid="record-start"]')).toBeNull();
    expect(q('button[appAction="send"]')).not.toBeNull();

    composer.value = '';
    composer.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(q('[data-testid="record-start"]')).not.toBeNull();
    expect(q('button[appAction="send"]')).toBeNull();

    component.pickedFiles.set([
      { key: 'pick-1', file: new File(['x'], 'test.txt', { type: 'text/plain' }), kind: 'file', previewUrl: null }
    ]);
    fixture.detectChanges();
    expect(q('[data-testid="record-start"]')).toBeNull();
    expect(q('button[appAction="send"]')).not.toBeNull();
  });

  it('c) click record-start -> getUserMedia called with { audio: true }; recording-bar shown; the textarea composer is gone; recorder start called with 1000 and audioBitsPerSecond 32000', async () => {
    const startBtn = q('[data-testid="record-start"]');
    expect(startBtn).not.toBeNull();
    startBtn?.click();
    await flush(fixture);

    expect(fakeGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(q('[data-testid="recording-bar"]')).not.toBeNull();
    expect(q('[data-testid="composer"]')).toBeNull();
    expect(lastRecorder).not.toBeNull();
    expect(lastRecorder?.options?.audioBitsPerSecond).toBe(32000);
    expect(lastRecorder?.start).toHaveBeenCalledWith(1000);
  });

  it('d) getUserMedia rejects -> no recording-bar, an error toast', async () => {
    fakeGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    const startBtn = q('[data-testid="record-start"]');
    startBtn?.click();
    await flush(fixture);

    expect(q('[data-testid="recording-bar"]')).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it('e) timer: after 75 seconds of fake time record-time shows ۱:۱۵', async () => {
    vi.useFakeTimers();
    try {
      q('[data-testid="record-start"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(75000);
      fixture.detectChanges();

      const recordTime = q('[data-testid="record-time"]');
      expect(recordTime?.textContent?.trim()).toBe('۱:۱۵');
    } finally {
      component.stopRecording(false);
      vi.useRealTimers();
    }
  });

  it('f) send: emit 2000 bytes, advance 5 s, click record-send -> commService.sendMessage called once with a files array of one File whose name matches /^voice_\\d{8}-\\d{6}_5s\\.webm$/ and type audio/webm; the mic track stop called; recording-bar gone', async () => {
    vi.useFakeTimers();
    try {
      q('[data-testid="record-start"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      lastRecorder?.emit(2000);

      await vi.advanceTimersByTimeAsync(5000);
      fixture.detectChanges();

      q('[data-testid="record-send"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(comm.sendMessage).toHaveBeenCalledTimes(1);
      const sentFiles = (comm.sendMessage as any).mock.calls[0][3] as File[];
      expect(sentFiles).toHaveLength(1);
      expect(sentFiles[0].name).toMatch(/^voice_\d{8}-\d{6}_5s\.webm$/);
      expect(sentFiles[0].type).toBe('audio/webm');
      expect(fakeTrack.stop).toHaveBeenCalled();
      expect(q('[data-testid="recording-bar"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('g) cancel: emit data, click record-cancel -> sendMessage not called, track stopped, no picked files', async () => {
    vi.useFakeTimers();
    try {
      q('[data-testid="record-start"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      lastRecorder?.emit(2000);

      q('[data-testid="record-cancel"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(comm.sendMessage).not.toHaveBeenCalled();
      expect(fakeTrack.stop).toHaveBeenCalled();
      expect(component.pickedFiles()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('h) shorter than 1 second (emit data, click record-send at once) -> sendMessage not called (warning toast)', async () => {
    vi.useFakeTimers();
    try {
      q('[data-testid="record-start"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      lastRecorder?.emit(500);

      q('[data-testid="record-send"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(comm.sendMessage).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith('warning', expect.stringContaining('کوتاه'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('i) switching away mid-recording: emit data, advance 3 s, then call component.backToList() (or select another conversation) -> stashComposerDraft called with the conversation id and a files array whose last item is the voice File (name ends with _3s.webm); sendMessage not called; track stopped', async () => {
    vi.useFakeTimers();
    try {
      q('[data-testid="record-start"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      lastRecorder?.emit(1000);

      await vi.advanceTimersByTimeAsync(3000);
      fixture.detectChanges();

      component.backToList();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(comm.stashComposerDraft).toHaveBeenCalled();
      const calls = (comm.stashComposerDraft as any).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe('c1');
      const stashedFiles = lastCall[1] as File[];
      expect(stashedFiles.length).toBeGreaterThanOrEqual(1);
      const voiceFile = stashedFiles[stashedFiles.length - 1];
      expect(voiceFile.name).toMatch(/_3s\.webm$/);
      expect(comm.sendMessage).not.toHaveBeenCalled();
      expect(fakeTrack.stop).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('j) size limit: set component.maxUploadMb.set(1); emitting chunks totalling more than 0.95 MB while recording -> sendMessage called once automatically', async () => {
    vi.useFakeTimers();
    try {
      component.maxUploadMb.set(1);

      q('[data-testid="record-start"]')?.click();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      await vi.advanceTimersByTimeAsync(2000);
      fixture.detectChanges();

      // limit is 1 * 1024 * 1024 * 0.95 = 996147.2 bytes. Emit 1000 * 1024 bytes > 0.95 MB
      lastRecorder?.emit(1000 * 1024);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      expect(comm.sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('k) bubble: a message with attachment renders att-audio (and not att-card-file), audio-time contains ۱:۰۵; attachmentKind returns audio for audio/ogg and a.m4a', async () => {
    const att: MessageAttachment = {
      id: '7',
      file_name: 'voice_x_65s.webm',
      file_size: 50000,
      content_type: 'audio/webm',
      duration: 65,
      download_url: '/api/communications/attachments/7/download/'
    };
    component.messages.set([makeMsg('m1', '', [att])]);
    await flush(fixture);

    expect(q('[data-testid="att-audio"]')).not.toBeNull();
    expect(q('[data-testid="audio-toggle"]')).not.toBeNull();
    expect(q('[data-testid="att-card-file"]')).toBeNull();
    const audioTime = q('[data-testid="audio-time"]');
    expect(audioTime?.textContent).toContain('۱:۰۵');

    expect(component.attachmentKind({ content_type: 'audio/ogg' })).toBe('audio');
    expect(component.attachmentKind({ file_name: 'a.m4a' })).toBe('audio');
  });

  it('l) durationFa: 0 -> ۰:۰۰, 75 -> ۱:۱۵, 3725 -> ۱:۰۲:۰۵', () => {
    expect(component.durationFa(0)).toBe('۰:۰۰');
    expect(component.durationFa(75)).toBe('۱:۱۵');
    expect(component.durationFa(3725)).toBe('۱:۰۲:۰۵');
  });
});
