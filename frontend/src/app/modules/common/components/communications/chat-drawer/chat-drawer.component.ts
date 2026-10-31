import { Component, OnInit, OnDestroy, inject, signal, computed, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { CommunicationService, Conversation, ChatMessage, UserShort, ConversationMember, ReadStatus, MessageAttachment } from '../../../../../core/services/communication.service';
import { DocumentPreviewComponent, DocumentPreviewSource } from '../../../../../shared/components/document-preview/document-preview.component';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ApiService } from '../../../../../core/api/api.service';
import { saveBlob } from '../../../../../core/platform/file-output';
import { ConfigApiService } from '../../../../../core/api/config-api.service';
import { getChatThumb, putChatThumb } from './chat-thumb-cache';

/** بخشی از متن پیام: متن ساده یا نشانی http/https */
export interface TextSegment { url: boolean; text: string }

/** عنصر فهرست پیام‌ها: جداکنندهٔ روز یا پیام */
export type ChatItem =
  | { kind: 'sep'; key: string; label: string }
  | { kind: 'msg'; key: string; msg: ChatMessage };

/** نوع نمایشی پیوست */
export type AttachmentKind = 'image' | 'pdf' | 'word' | 'excel' | 'text' | 'audio' | 'file';

/** فایل انتخاب‌شده پیش از ارسال */
export interface PickedFile {
  key: string;
  file: File;
  kind: 'image' | 'pdf' | 'audio' | 'file';
  /** blob عکس یا data URL صفحهٔ اول PDF؛ null یعنی کارت فایل */
  previewUrl: string | null;
}

/** پیوست همراه پیام مبدأش (برای گالری و تب «رسانه و فایل‌ها») */
export interface MediaEntry { msg: ChatMessage; att: MessageAttachment }

/** پسوندهای مجاز؛ باید با accept ورودی فایل و ALLOWED_EXTENSIONS در backend/core/communications/previews.py یکی بماند */
export const CHAT_ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.xlsx', '.xls', '.doc', '.docx', '.txt', '.csv', '.webm', '.ogg', '.m4a'];
/** بیشترین تعداد فایل در یک پیام */
export const CHAT_MAX_FILES = 10;
/** سقف پیش‌فرض حجم هر فایل (مگابایت)؛ تا رسیدن تنظیم سرور (chat_max_upload_mb) یا در حالت آفلاین */
export const CHAT_DEFAULT_MAX_FILE_MB = 10;

@Component({
  selector: 'app-chat-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, TabBarComponent, ActionButtonComponent, DocumentPreviewComponent],
  templateUrl: './chat-drawer.component.html',
  styleUrls: ['./chat-drawer.component.css']
})
export class ChatDrawerComponent implements OnInit, OnDestroy, AfterViewChecked {
  readonly drawerTabs: TabDef[] = [
    { id: 'conversations', label: 'گفتگوها', shortLabel: 'گفتگوها', icon: 'message-square' },
    { id: 'contacts', label: 'همکاران و پرسنل', shortLabel: 'همکاران', icon: 'users' },
  ];

  onTabSelect(tabId: string): void {
    if (tabId === 'conversations' || tabId === 'contacts') {
      this.activeTab.set(tabId);
    }
  }
  public commService = inject(CommunicationService);
  private state = inject(StateService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private api = inject(ApiService);
  private configApi = inject(ConfigApiService);
  /** سقف مؤثر حجم هر فایل به مگابایت (تنظیم سرور، پیش‌فرض ۱۰) */
  public maxUploadMb = signal<number>(CHAT_DEFAULT_MAX_FILE_MB);
  private sub = new Subscription();
  /** پیش‌نمایش عکس پیوست‌ها (blob با توکن، چون <img> هدر Authorization نمی‌فرستد) */
  private attachmentPreviews = new Map<string, string | null>();

  @ViewChild('messagesScrollContainer') private messagesScrollContainer!: ElementRef;

  public activeTab = signal<'conversations' | 'contacts' | 'chat'>('conversations');
  public conversations = signal<Conversation[]>([]);
  public activeConv = signal<Conversation | null>(null);
  public messages = signal<ChatMessage[]>([]);
  public contacts = signal<UserShort[]>([]);
  
  public searchQuery = signal<string>('');
  public messageInputText: string = '';
  public isSending = signal<boolean>(false);
  public isTyping = signal<boolean>(false);
  public typingUserText = signal<string>('');
  /** فایل‌های انتخاب‌شده پیش از ارسال، با پیش‌نمایش (عکس واقعی یا صفحهٔ اول PDF) */
  public pickedFiles = signal<PickedFile[]>([]);
  /** فایلی روی کشو کشیده شده و هنوز رها نشده است */
  public dragOver = signal<boolean>(false);
  private pickSeq = 0;
  /** نشانی blob فایل کامل پیوست‌ها برای لایت‌باکس (با توکن دریافت می‌شود) */
  private attachmentFull = new Map<string, Promise<string>>();
  private fullBlobUrls: string[] = [];

  @ViewChild('docPreview') private docPreview?: DocumentPreviewComponent;
  public isLoadingOlder = signal<boolean>(false);
  public hasMoreMessages = signal<boolean>(true);

  // ─── گروه‌ها ───
  public canCreateGroup = signal<boolean>(false);
  public createOpen = signal<boolean>(false);
  public groupTitle = signal<string>('');
  public pickerSearch = signal<string>('');
  public pickedIds = signal<number[]>([]);
  public groupBusy = signal<boolean>(false);
  public groupError = signal<string>('');
  public infoOpen = signal<boolean>(false);
  public members = signal<ConversationMember[]>([]);
  public membersLoading = signal<boolean>(false);
  public membersError = signal<boolean>(false);
  public renaming = signal<boolean>(false);
  public renameText = signal<string>('');
  public addOpen = signal<boolean>(false);
  /** تأیید دومرحله‌ای: حذف عضو یا ترک گروه */
  public confirmAction = signal<{ kind: 'remove'; member: ConversationMember } | { kind: 'leave' } | null>(null);

  private infoReturnFocus: HTMLElement | null = null;

  private static readonly SENDER_COLORS = [
    'text-rose-600',
    'text-emerald-700',
    'text-amber-700',
    'text-sky-700',
    'text-violet-600',
    'text-teal-600',
  ];

  private shouldScrollBottom = false;
  private typingTimeout: any = null;
  private typingIndicatorClearTimer: any = null;

  // ─── منوی پیام، پاسخ، ویرایش، حذف ───
  /** شناسهٔ پیامی که منویش باز است */
  public menuFor = signal<string | null>(null);
  public replyTo = signal<ChatMessage | null>(null);
  public editing = signal<ChatMessage | null>(null);
  public deleteTarget = signal<ChatMessage | null>(null);
  public deleteBusy = signal<boolean>(false);

  // ─── اسکرول ───
  /** نمایش دکمهٔ شناور «پیام جدید» وقتی کاربر بالاتر است */
  public showNewBtn = signal<boolean>(false);
  /** تا رسیدن اولین پیام‌های گفتگوی تازه باز شده، به پایین می‌رود */
  private openedFresh = false;
  private lastMsgKey = '';
  private restoreScroll: { height: number; top: number } | null = null;

  /** فهرست نمایشی: پیام‌ها همراه جداکنندهٔ روز */
  public items = computed<ChatItem[]>(() => {
    const out: ChatItem[] = [];
    let lastDay = '';
    for (const m of this.messages()) {
      const day = this.dayKey(m.created_at);
      if (day && day !== lastDay) {
        out.push({ kind: 'sep', key: 'sep-' + day, label: this.dayLabel(m.created_at) });
        lastDay = day;
      }
      out.push({ kind: 'msg', key: m.id || m.client_temp_id || '', msg: m });
    }
    return out;
  });

  private linkCache = new Map<string, TextSegment[]>();

  ngOnInit(): void {
    const whId = this.state.appState.activeWarehouseId === 'ALL' ? undefined : Number(this.state.appState.activeWarehouseId);
    this.commService.ensureConnected(whId);
    this.commService.refreshPresence();
    this.commService.loadConversations(whId);
    this.loadContacts(whId);
    this.commService.getCapabilities()
      .then(c => this.canCreateGroup.set(!!c?.can_create_group))
      .catch(() => this.canCreateGroup.set(false));
    // سقف حجم فایل از تنظیم سرور؛ بدون پاسخ (آفلاین) همان ۱۰ مگابایت می‌ماند
    this.sub.add(this.configApi.getPublicConfig().subscribe({
      next: (cfg) => {
        const mb = Number(cfg?.chat_max_upload_mb);
        if (Number.isFinite(mb) && mb >= 1 && mb <= 100) this.maxUploadMb.set(Math.floor(mb));
      },
      error: () => { /* سقف پیش‌فرض می‌ماند */ }
    }));

    // رویدادهای عضویت گروه
    this.sub.add(
      this.commService.membershipEvents$.subscribe(ev => {
        const active = this.activeConv();
        if (!active || String(active.id) !== String(ev.conversationId)) return;
        if (ev.type === 'removed') {
          this.infoOpen.set(false);
          this.confirmAction.set(null);
          this.activeConv.set(null);
          this.activeTab.set('conversations');
          this.toast.show('warning', 'شما از گروه حذف شدید');
        } else if (this.infoOpen()) {
          void this.loadMembers();
        }
      })
    );

    // اشتراک در مکالمات
    this.sub.add(
      this.commService.conversations$.subscribe(convs => {
        this.conversations.set(convs);
      })
    );

    // اشتراک در مکالمه فعال
    this.sub.add(
      this.commService.activeConversation$.subscribe(conv => {
        this.activeConv.set(conv);
        if (conv) {
          this.activeTab.set('chat');
          if (!this.lastConvId || this.lastConvId !== String(conv.id)) {
            this.stashDraft();
            this.openedFresh = true;
            this.lastMsgKey = '';
            this.showNewBtn.set(false);
            this.replyTo.set(null);
            this.editing.set(null);
            this.menuFor.set(null);
            this.messageInputText = '';
            this.restoreDraft(String(conv.id));
          }
          this.lastConvId = String(conv.id);
        } else {
          this.stashDraft();
          this.lastConvId = '';
        }
      })
    );

    // اشتراک در پیام‌های پیام‌رسان
    this.sub.add(
      this.commService.activeMessages$.subscribe(msgs => {
        this.onMessagesChanged(msgs);
      })
    );

    // اشتراک در وضعیت در حال تایپ با تایم‌اوت خودکار ۳ ثانیه‌ای
    this.sub.add(
      this.commService.typingUser$.subscribe(data => {
        const active = this.activeConv();
        if (active && String(active.id) === String(data.conversation_id)) {
          if (data.is_typing) {
            this.typingUserText.set(`${data.username} در حال نوشتن...`);
            if (this.typingIndicatorClearTimer) clearTimeout(this.typingIndicatorClearTimer);
            this.typingIndicatorClearTimer = setTimeout(() => {
              this.typingUserText.set('');
            }, 3000);
          } else {
            if (this.typingIndicatorClearTimer) clearTimeout(this.typingIndicatorClearTimer);
            this.typingUserText.set('');
          }
        }
      })
    );
  }

  private lastConvId = '';

  /** تغییر فهرست پیام‌ها: فقط وقتی کاربر پایین است (یا پیام از خودش است) به پایین می‌رود */
  private onMessagesChanged(msgs: ChatMessage[]): void {
    this.messages.set(msgs);
    if (this.isLoadingOlder()) return; // بعد از افزودن پیام‌های قدیمی، جای اسکرول حفظ می‌شود
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    const key = last ? String(last.id || last.client_temp_id || '') : '';
    const changedTail = key !== this.lastMsgKey;
    this.lastMsgKey = key;
    if (this.openedFresh && msgs.length > 0) {
      this.openedFresh = false;
      this.shouldScrollBottom = true;
      return;
    }
    if (!changedTail || !last) return;
    if (last.is_me || this.isNearBottom()) {
      this.shouldScrollBottom = true;
    } else if (!last.is_system) {
      this.showNewBtn.set(true);
    }
  }

  private isNearBottom(): boolean {
    const el = this.messagesScrollContainer?.nativeElement as HTMLElement | undefined;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  }

  public onThreadScroll(): void {
    const el = this.messagesScrollContainer?.nativeElement as HTMLElement | undefined;
    if (!el || this.activeTab() !== 'chat') return;
    if (this.isNearBottom()) this.showNewBtn.set(false);
    if (el.scrollTop < 40 && this.hasMoreMessages() && !this.isLoadingOlder() && this.messages().length >= 30) {
      void this.loadOlder();
    }
  }

  public jumpToNew(): void {
    this.showNewBtn.set(false);
    this.scrollToBottom();
  }

  ngAfterViewChecked(): void {
    if (this.restoreScroll) {
      const el = this.messagesScrollContainer?.nativeElement as HTMLElement | undefined;
      if (el) el.scrollTop = this.restoreScroll.top + (el.scrollHeight - this.restoreScroll.height);
      this.restoreScroll = null;
    }
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  ngOnDestroy(): void {
    const cur = this.activeConv();
    if (cur) {
      this.commService.leaveConversation(cur.id);
      this.commService.activeConversation$.next(null);
    }
    this.sub.unsubscribe();
    this.stashDraft();
    this.attachmentPreviews.forEach((u) => { if (u) URL.revokeObjectURL(u); });
    this.attachmentPreviews.clear();
    this.fullBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    this.fullBlobUrls = [];
    this.attachmentFull.clear();
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.typingIndicatorClearTimer) clearTimeout(this.typingIndicatorClearTimer);
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.removeAttribute('src'); this.audioEl = null; }
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesScrollContainer) {
        const el = this.messagesScrollContainer.nativeElement;
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth'
        });
      }
    } catch (err) {}
  }

  private async loadContacts(warehouseId?: number): Promise<void> {
    try {
      const users = await this.commService.getContacts(warehouseId);
      this.contacts.set(users);
    } catch (e) {}
  }

  public selectConversation(conv: Conversation): void {
    this.hasMoreMessages.set(true);
    this.commService.openConversation(conv);
  }

  public async loadOlder(): Promise<void> {
    const conv = this.activeConv();
    if (!conv || this.isLoadingOlder() || !this.hasMoreMessages()) return;

    // پیام‌های محلیِ «در انتظار»/«ناموفق» روی سرور نیستند؛ قدیمی‌ترین پیام واقعی مرجع است
    const beforeId = this.commService.oldestServerMessageId();
    if (beforeId === null) return;
    this.isLoadingOlder.set(true);
    const el = this.messagesScrollContainer?.nativeElement as HTMLElement | undefined;
    if (el) this.restoreScroll = { height: el.scrollHeight, top: el.scrollTop };
    try {
      const older = await this.commService.loadOlderMessages(conv.id, beforeId, 30);
      if (older.length < 30) {
        this.hasMoreMessages.set(false);
      }
    } finally {
      this.isLoadingOlder.set(false);
      // اگر چیزی اضافه نشد، جای اسکرول بدون تغییر می‌ماند
      if (this.restoreScroll && el && el.scrollHeight === this.restoreScroll.height) this.restoreScroll = null;
    }
  }

  // ─── متن پیام: لینک‌ها بدون innerHTML ───
  public segments(text?: string | null): TextSegment[] {
    const t = text || '';
    const hit = this.linkCache.get(t);
    if (hit) return hit;
    const out: TextSegment[] = [];
    const re = /https?:\/\/[^\s<>"']+/gi;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      let url = m[0];
      // نشانه‌گذاری انتهای جمله جزو نشانی نیست
      const trimmed = url.replace(/[.,;:!?)\]}،؛؟]+$/u, '');
      url = trimmed;
      let ok = false;
      try { const u = new URL(url); ok = u.protocol === 'http:' || u.protocol === 'https:'; } catch { ok = false; }
      if (!ok) continue;
      if (m.index > last) out.push({ url: false, text: t.slice(last, m.index) });
      out.push({ url: true, text: url });
      last = m.index + url.length;
      re.lastIndex = last;
    }
    if (last < t.length) out.push({ url: false, text: t.slice(last) });
    if (this.linkCache.size > 300) this.linkCache.clear();
    this.linkCache.set(t, out);
    return out;
  }

  // ─── جداکنندهٔ روز ───
  private dayKey(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  public dayLabel(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (this.dayKey(iso) === this.dayKey(now.toISOString())) return 'امروز';
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (this.dayKey(iso) === this.dayKey(y.toISOString())) return 'دیروز';
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  }

  // ─── منوی پیام ───
  public isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  /** فقط پیام‌های واقعی (نه موقت/ناموفق/سیستمی) منو دارند */
  public hasMenu(msg: ChatMessage): boolean {
    return !msg.is_system && !msg.is_pending && msg.delivery_status !== 'failed' && Number.isFinite(Number(msg.id)) && !String(msg.id).startsWith('temp-');
  }

  public canReply(): boolean {
    return this.activeConv()?.can_post !== false;
  }

  public canEdit(msg: ChatMessage): boolean {
    if (!msg.is_me || !msg.text || !msg.editable_until) return false;
    const until = Date.parse(msg.editable_until);
    return Number.isFinite(until) && Date.now() < until;
  }

  public canDelete(msg: ChatMessage): boolean {
    if (msg.is_me) return true;
    return this.auth.user()?.is_superuser === true && this.activeConv()?.conv_type !== 'direct';
  }

  public toggleMenu(msg: ChatMessage, ev?: Event): void {
    ev?.stopPropagation();
    this.menuFor.set(this.menuFor() === String(msg.id) ? null : String(msg.id));
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: Event): void {
    if (this.menuFor() === null) return;
    const t = ev.target as HTMLElement | null;
    const root = t?.closest?.('[data-msg-menu-root]');
    if (root && root.getAttribute('data-msg-menu-root') === this.menuFor()) return;
    this.menuFor.set(null);
  }

  public isMenuOpen(msg: ChatMessage): boolean {
    return this.menuFor() === String(msg.id);
  }

  /** Escape منوی پیام را می‌بندد و تمرکز را به دکمهٔ همان منو برمی‌گرداند */
  @HostListener('document:keydown.escape')
  onMenuEscape(): void {
    const open = this.menuFor();
    if (open === null) return;
    this.menuFor.set(null);
    const sel = `[data-msg-menu-root="${open.replace(/"/g, '')}"] [data-testid="msg-menu-btn"]`;
    (this.host.nativeElement.querySelector(sel) as HTMLElement | null)?.focus();
  }

  public startReply(msg: ChatMessage): void {
    this.menuFor.set(null);
    this.editing.set(null);
    this.replyTo.set(msg);
    setTimeout(() => this.composer?.nativeElement?.focus(), 0);
  }

  public startEdit(msg: ChatMessage): void {
    this.menuFor.set(null);
    if (!this.isOnline()) { this.toast.error('ویرایش پیام نیاز به اتصال به اینترنت دارد'); return; }
    this.replyTo.set(null);
    this.editing.set(msg);
    this.messageInputText = msg.text || '';
    setTimeout(() => { this.autoGrow(); this.composer?.nativeElement?.focus(); }, 0);
  }

  public cancelCompose(): void {
    if (this.editing()) this.messageInputText = '';
    this.editing.set(null);
    this.replyTo.set(null);
    setTimeout(() => this.autoGrow(), 0);
  }

  public async copyText(msg: ChatMessage): Promise<void> {
    this.menuFor.set(null);
    const text = msg.text || '';
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.toast.success('متن کپی شد');
      } else {
        this.toast.error('کپی در این دستگاه پشتیبانی نمی‌شود');
      }
    } catch {
      this.toast.error('کپی انجام نشد');
    }
  }

  public askRemoveMsg(msg: ChatMessage): void {
    this.menuFor.set(null);
    if (!this.isOnline()) { this.toast.error('حذف پیام نیاز به اتصال به اینترنت دارد'); return; }
    this.deleteTarget.set(msg);
    setTimeout(() => document.getElementById('msg-delete-cancel')?.focus(), 0);
  }

  public cancelRemoveMsg(): void {
    this.deleteTarget.set(null);
  }

  public async runRemoveMsg(): Promise<void> {
    const msg = this.deleteTarget();
    if (!msg || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    try {
      await this.commService.deleteMessage(msg.id);
      if (this.replyTo()?.id === msg.id) this.replyTo.set(null);
      if (this.editing()?.id === msg.id) this.cancelCompose();
      this.deleteTarget.set(null);
    } catch (e: any) {
      this.deleteTarget.set(null);
      this.toast.error(e?.status === 403 ? 'اجازهٔ حذف این پیام را ندارید' : 'حذف پیام انجام نشد');
    } finally {
      this.deleteBusy.set(false);
    }
  }

  /** خلاصهٔ پیام اصلی برای پاسخ: از جزئیات سرور، وگرنه از پیام‌های بارگذاری‌شده */
  public replyInfo(msg: ChatMessage): { deleted: boolean; id: string; sender: string; text: string; hasAttachment: boolean } | null {
    if (!msg.reply_to && !msg.reply_to_details) return null;
    const d = msg.reply_to_details;
    const id = String(d?.id ?? msg.reply_to);
    if (d && d.deleted) return { deleted: true, id, sender: '', text: '', hasAttachment: false };
    if (d && !d.deleted) return { deleted: false, id, sender: d.sender_name, text: d.text, hasAttachment: d.has_attachment };
    const orig = this.messages().find(m => String(m.id) === id);
    if (orig) return { deleted: false, id, sender: orig.sender_details?.full_name || '', text: orig.text || '', hasAttachment: !!orig.attachments?.length };
    return { deleted: false, id, sender: '', text: '', hasAttachment: false };
  }

  public goToQuoted(ri: { deleted: boolean; id: string }): void {
    if (!ri.deleted) this.scrollToMessage(ri.id);
  }

  public scrollToMessage(id: string): void {
    const root = this.messagesScrollContainer?.nativeElement as HTMLElement | undefined;
    const el = root?.querySelector(`[data-msg-id="${String(id).replace(/[^0-9a-zA-Z_-]/g, '')}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  // ─── کادر نوشتن ───
  @ViewChild('composer') private composer?: ElementRef<HTMLTextAreaElement>;

  public onComposerKey(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
    ev.preventDefault();
    void this.sendMessage();
  }

  public autoGrow(): void {
    const el = this.composer?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  public startDirectChat(user: UserShort): void {
    const list = Array.isArray(this.conversations()) ? this.conversations() : [];
    const targetUserIdStr = String(user.id);
    // جستجوی گفتگوی موجود با این کاربر
    const existing = list.find(c => 
      c.conv_type === 'direct' && (
        (c.participants && c.participants.map(String).includes(targetUserIdStr)) ||
        (c.participants_details && c.participants_details.some(p => String(p.id) === targetUserIdStr))
      )
    );

    if (existing) {
      this.selectConversation(existing);
      return;
    }

    // حالت گفتگوی موقت (Draft Mode): باز کردن پنجره چت بدون ایجاد رکورد در دیتابیس تا زمان ارسال اولین پیام
    const currentUserId = this.commService.getCurrentUserId() ?? this.auth.user()?.id ?? 0;
    const currentUserProfile = this.auth.user();
    const draftConv: Conversation = {
      id: `draft_${user.id}`,
      conv_type: 'direct',
      title: user.full_name || user.username,
      is_active: true,
      participants: [Number(currentUserId), user.id],
      participants_details: [
        {
          id: Number(currentUserId),
          username: currentUserProfile?.username || '',
          full_name: `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || currentUserProfile?.username || ''
        },
        user
      ],
      unread_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.activeConv.set(draftConv);
    this.commService.activeConversation$.next(draftConv);
    this.commService.activeMessages$.next([]);
    this.activeTab.set('chat');
    this.hasMoreMessages.set(false);
  }

  public onInputTyping(): void {
    const conv = this.activeConv();
    if (!conv || String(conv.id).startsWith('draft_')) return;

    this.commService.sendTypingStatus(conv.id, true);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.commService.sendTypingStatus(conv.id, false);
    }, 2000);
  }

  public async sendMessage(): Promise<void> {
    const text = this.messageInputText.trim();
    const files = this.pickedFiles().map(p => p.file);
    let conv = this.activeConv();

    if ((!text && files.length === 0) || !conv || this.isSending()) return;

    // حالت ویرایش: PATCH متن؛ نیازمند اتصال، و هرگز وارد صف آفلاین نمی‌شود
    const editTarget = this.editing();
    if (editTarget) {
      if (!text) { this.toast.error('متن پیام نمی‌تواند خالی باشد'); return; }
      if (!this.isOnline()) { this.toast.error('ویرایش پیام نیاز به اتصال به اینترنت دارد'); return; }
      this.isSending.set(true);
      try {
        await this.commService.editMessage(editTarget.id, text);
        this.editing.set(null);
        this.messageInputText = '';
        setTimeout(() => this.autoGrow(), 0);
      } catch (e: any) {
        this.toast.error(e?.status === 403 ? 'زمان ویرایش این پیام گذشته است' : 'ویرایش پیام انجام نشد');
      } finally {
        this.isSending.set(false);
      }
      return;
    }

    const replyId = this.replyTo()?.id;
    this.isSending.set(true);
    this.messageInputText = '';
    this.replyTo.set(null);
    setTimeout(() => this.autoGrow(), 0);
    this.clearPicked();
    let handedToService = false;

    try {
      // در صورتی که چت در حالت پیش‌نویس (Draft) باشد، ابتدا آن را در سرور ذخیره می‌کنیم
      if (conv.id.toString().startsWith('draft_')) {
        const whId = this.state.appState.activeWarehouseId === 'ALL' ? undefined : Number(this.state.appState.activeWarehouseId);
        const currentUserId = this.commService.getCurrentUserId() ?? this.auth.user()?.id;
        const curStr = String(currentUserId);
        const targetParticipant = conv.participants_details?.find(p => String(p.id) !== curStr) || conv.participants_details?.[0];
        const targetUserId = targetParticipant ? targetParticipant.id : Number(conv.id.toString().replace('draft_', ''));

        const realConv = await this.commService.createConversation({
          conv_type: 'direct',
          warehouse: whId,
          target_user_id: targetUserId
        });

        conv = realConv;
        this.activeConv.set(realConv);
        await this.commService.openConversation(realConv);
        await this.commService.loadConversations(whId);
      }

      handedToService = true;
      await this.commService.sendMessage(conv.id, text, replyId, files.length ? files : undefined);
    } catch (e) {
      console.error('Send error', e);
      // اگر ساخت گفتگو شکست خورد، متن و فایل کاربر به کادر ورود برمی‌گردند تا گم نشوند
      if (!handedToService) {
        if (!this.messageInputText) this.messageInputText = text;
        if (replyId && !this.replyTo()) this.replyTo.set(this.messages().find(m => String(m.id) === String(replyId)) ?? null);
        if (files.length && this.pickedFiles().length === 0) {
          this.restorePicked(files);
        }
        this.toast.show('error', 'ارسال پیام انجام نشد. متن و فایل شما حفظ شد؛ دوباره تلاش کنید.');
      }
    } finally {
      this.isSending.set(false);
      this.shouldScrollBottom = true;
      setTimeout(() => this.scrollToBottom(), 60);
    }
  }

  public async retryMessage(msg: ChatMessage): Promise<void> {
    const tempId = msg.client_temp_id || msg.id;
    await this.commService.retryMessage(tempId);
  }

  /** کنار گذاشتن پیام ارسال‌نشده، فقط پس از تأیید صریح کاربر */
  public discardMessage(msg: ChatMessage): void {
    const tempId = msg.client_temp_id || msg.id;
    const hasFile = !!msg.pending_file_name;
    const question = hasFile
      ? 'این پیام ارسال‌نشده و فایل پیوستش حذف شود؟ این کار برگشت‌پذیر نیست.'
      : 'این پیام ارسال‌نشده حذف شود؟ این کار برگشت‌پذیر نیست.';
    if (typeof window !== 'undefined' && !window.confirm(question)) return;
    this.commService.discardOutgoing(tempId);
  }

  public onFileSelected(event: any): void {
    const input = event?.target as HTMLInputElement | null;
    const files: File[] = Array.from((input?.files ?? []) as ArrayLike<File>);
    this.addFiles(files);
    // تا انتخاب دوبارهٔ همان فایل هم رویداد change بدهد
    if (input) input.value = '';
  }

  /** افزودن فایل‌ها به نوار پیش از ارسال؛ فایل نامجاز یا بزرگ با پیام فارسی کنار گذاشته می‌شود */
  public addFiles(files: File[]): void {
    const accepted: File[] = [];
    for (const file of files) {
      if (!file) continue;
      const name = file.name || '';
      const ext = name.includes('.') ? name.substring(name.lastIndexOf('.')).toLowerCase() : '';
      if (!CHAT_ALLOWED_EXTENSIONS.includes(ext) || file.type === 'image/svg+xml') {
        this.toast.show('error', `نوع فایل «${name || 'بی‌نام'}» مجاز نیست. فقط عکس، PDF، Word، Excel، متن، CSV و صوت.`);
        continue;
      }
      if (file.size > this.maxUploadMb() * 1024 * 1024) {
        this.toast.show('error', `حجم فایل «${name}» نباید بیش از ${this.maxUploadMb().toLocaleString('fa-IR')} مگابایت باشد.`);
        continue;
      }
      accepted.push(file);
    }
    const room = CHAT_MAX_FILES - this.pickedFiles().length;
    if (accepted.length > room) {
      this.toast.show('warning', `در هر پیام حداکثر ${CHAT_MAX_FILES.toLocaleString('fa-IR')} فایل می‌شود فرستاد.`);
    }
    const take = accepted.slice(0, Math.max(0, room));
    if (take.length === 0) return;
    const added: PickedFile[] = take.map(file => {
      const kind = this.pickKind(file);
      return { key: `pick-${++this.pickSeq}`, file, kind, previewUrl: kind === 'image' ? URL.createObjectURL(file) : null };
    });
    this.pickedFiles.set([...this.pickedFiles(), ...added]);
    for (const p of added) {
      if (p.kind === 'pdf') void this.renderPdfThumb(p);
    }
  }

  public trackPick(_: number, p: PickedFile): string {
    return p.key;
  }

  public removePicked(key: string): void {
    const hit = this.pickedFiles().find(p => p.key === key);
    if (!hit) return;
    this.revokePick(hit);
    this.pickedFiles.set(this.pickedFiles().filter(p => p.key !== key));
  }

  /** همهٔ فایل‌های نوار پیش از ارسال (فقط پیش‌نمایش‌ها آزاد می‌شوند؛ خود فایل‌ها اگر ارسال شده باشند در سرویس می‌مانند) */
  public clearPicked(): void {
    this.pickedFiles().forEach(p => this.revokePick(p));
    this.pickedFiles.set([]);
  }

  /** پیش‌نویس گفتگوی فعلی (فایل‌های نوار و متن) در سرویس می‌ماند تا با بستن کشو یا عوض کردن گفتگو گم نشود یا به گفتگوی دیگری نرود */
  private stashDraft(): void {
    // ضبطِ در حال اجرا فرستاده نمی‌شود و گم هم نمی‌شود: به پیش‌نویس همان گفتگو می‌رود
    const voice = this.recording() ? this.takeRecordingNow() : null;
    if (this.lastConvId) {
      const files = this.pickedFiles().map(p => p.file);
      if (voice) files.push(voice);
      this.commService.stashComposerDraft(this.lastConvId, files, this.messageInputText || '');
    }
    this.clearPicked();
  }

  // ─── پیام صوتی (U9) ───
  /** در حال ضبط پیام صوتی */
  public recording = signal<boolean>(false);
  /** مدت ضبط تا این لحظه (ثانیه) */
  public recordSeconds = signal<number>(0);
  private recorder: MediaRecorder | null = null;
  private recordStream: MediaStream | null = null;
  private recordChunks: Blob[] = [];
  private recordBytes = 0;
  private recordMime = '';
  private recordStartedAt = 0;
  private recordEndedAt = 0;
  private recordTimer: ReturnType<typeof setInterval> | null = null;
  /** پس از stop: فرستادن، رفتن به نوار پیش از ارسال برای گوش دادن، یا دور ریختن */
  private recordOnStop: 'send' | 'review' | 'discard' = 'discard';

  /** مرورگر ضبط صدا را پشتیبانی می‌کند (در jsdom و مرورگرهای قدیمی دکمه نشان داده نمی‌شود) */
  public canRecord(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private pickRecordMime(): string {
    const options = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
    for (const m of options) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ادامه */ }
    }
    return '';
  }

  public async startRecording(): Promise<void> {
    if (this.recording() || this.editing() || !this.canRecord()) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.toast.error('دسترسی به میکروفون داده نشد. اجازهٔ میکروفون را در تنظیمات مرورگر یا برنامه روشن کنید.');
      return;
    }
    const mime = this.pickRecordMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
    } catch {
      stream.getTracks().forEach(t => t.stop());
      this.toast.error('ضبط صدا در این دستگاه پشتیبانی نمی‌شود');
      return;
    }
    this.recorder = rec;
    this.recordStream = stream;
    this.recordChunks = [];
    this.recordBytes = 0;
    this.recordMime = (rec.mimeType || mime || 'audio/webm').split(';')[0];
    this.recordOnStop = 'discard';
    this.recordStartedAt = Date.now();
    this.recordEndedAt = 0;
    this.recordSeconds.set(0);
    // سقف مدت نداریم (کاربر)؛ فقط سقف حجم فایل چت که پیش از رسیدن به آن ضبط خودکار فرستاده می‌شود
    const limit = this.maxUploadMb() * 1024 * 1024 * 0.95;
    rec.ondataavailable = (ev: BlobEvent) => {
      if (!ev.data || ev.data.size === 0) return;
      this.recordChunks.push(ev.data);
      this.recordBytes += ev.data.size;
      if (this.recordBytes >= limit && this.recording()) {
        this.toast.show('warning', 'پیام صوتی به سقف حجم فایل رسید و فرستاده شد.');
        this.stopRecording(true);
      }
    };
    rec.onstop = () => this.onRecorderStopped();
    rec.start(1000);
    this.recording.set(true);
    // فوکوس به دکمهٔ فرستادن نوار ضبط (کادر نوشتن تا پایان ضبط برداشته می‌شود)
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[data-testid="record-send"]')?.focus(), 0);
    this.recordTimer = setInterval(() => this.recordSeconds.set(Math.floor((Date.now() - this.recordStartedAt) / 1000)), 500);
  }

  /** پایان ضبط؛ true یعنی فرستادن، false یعنی لغو، 'review' یعنی رفتن به نوار پیش از ارسال تا کاربر پیش از فرستادن گوش دهد */
  public stopRecording(send: boolean | 'review'): void {
    if (!this.recorder || !this.recording()) return;
    this.recordOnStop = send === 'review' ? 'review' : send ? 'send' : 'discard';
    this.recordEndedAt = Date.now();
    this.recording.set(false);
    if (this.recordTimer) { clearInterval(this.recordTimer); this.recordTimer = null; }
    setTimeout(() => this.composer?.nativeElement?.focus(), 0);
    try { this.recorder.stop(); } catch { this.onRecorderStopped(); }
  }

  private onRecorderStopped(): void {
    const action = this.recordOnStop;
    const file = action !== 'discard' ? this.buildVoiceFile() : null;
    this.releaseRecorder();
    if (!file) return;
    if (file.size === 0 || this.voiceSeconds() < 1) {
      this.toast.show('warning', 'پیام صوتی خیلی کوتاه بود و فرستاده نشد.');
      return;
    }
    this.addFiles([file]);
    if (action === 'send' && this.pickedFiles().some(p => p.file === file)) void this.sendMessage();
  }

  private voiceSeconds(): number {
    return Math.max(0, Math.round(((this.recordEndedAt || Date.now()) - this.recordStartedAt) / 1000));
  }

  private buildVoiceFile(): File | null {
    if (this.recordChunks.length === 0) return null;
    const ext = this.recordMime.includes('ogg') ? 'ogg' : this.recordMime.includes('mp4') ? 'm4a' : 'webm';
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    // نام قراردادی: سرور مدت را از آن می‌خواند (backend/core/communications/previews.py VOICE_NAME_RE)
    const name = `voice_${stamp}_${Math.max(1, this.voiceSeconds())}s.${ext}`;
    return new File(this.recordChunks, name, { type: ext === 'm4a' ? 'audio/mp4' : `audio/${ext}` });
  }

  /** ضبط را همین حالا (هم‌زمان) به فایل تبدیل می‌کند؛ برای عوض شدن گفتگو یا بسته شدن کشو */
  private takeRecordingNow(): File | null {
    this.recordEndedAt = Date.now();
    const file = this.buildVoiceFile();
    this.recordOnStop = 'discard';
    this.recording.set(false);
    if (this.recordTimer) { clearInterval(this.recordTimer); this.recordTimer = null; }
    try { this.recorder?.stop(); } catch { /* آزادسازی در releaseRecorder */ }
    this.releaseRecorder();
    return file;
  }

  private releaseRecorder(): void {
    this.recordStream?.getTracks().forEach(t => t.stop());
    if (this.recorder) { this.recorder.ondataavailable = null; this.recorder.onstop = null; }
    this.recorder = null;
    this.recordStream = null;
    this.recordChunks = [];
    this.recordBytes = 0;
  }

  /** ۷۵ ثانیه → «۱:۱۵» با رقم فارسی */
  public durationFa(seconds?: number | null): string {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const two = (n: number) => n.toLocaleString('fa-IR', { minimumIntegerDigits: 2, useGrouping: false });
    return h > 0 ? `${h.toLocaleString('fa-IR')}:${two(m)}:${two(r)}` : `${m.toLocaleString('fa-IR')}:${two(r)}`;
  }

  // پخش: یک پخش‌کنندهٔ مشترک؛ فایل با توکن گرفته می‌شود (مثل لایت‌باکس)
  private audioEl: HTMLAudioElement | null = null;
  public playingAudioId = signal<string | null>(null);
  public audioLoadingId = signal<string | null>(null);
  public audioPos = signal<number>(0);
  public audioDur = signal<number>(0);
  private audioPaused = signal<boolean>(true);

  public isPlaying(att: MessageAttachment): boolean {
    return this.playingAudioId() === String(att.id) && !this.audioPaused();
  }

  public async toggleAudio(att: MessageAttachment): Promise<void> {
    const id = String(att.id);
    if (this.playingAudioId() === id && this.audioEl) {
      if (this.audioEl.paused) { void this.audioEl.play().catch(() => undefined); } else { this.audioEl.pause(); }
      return;
    }
    if (!att.download_url) { this.toast.error('فایل هنوز آماده نیست؛ گفتگو را دوباره باز کنید'); return; }
    this.audioLoadingId.set(id);
    try {
      const url = await this.fullAttachmentUrl(att);
      await this.playUrl(id, url, att.duration || 0);
    } catch {
      this.playingAudioId.set(null);
      this.toast.error('پخش پیام صوتی انجام نشد');
    } finally {
      this.audioLoadingId.set(null);
    }
  }

  /** پیام صوتیِ نوار پیش از ارسال: پخش و توقف از خودِ فایل محلی (بی شبکه) */
  public isPickPlaying(p: PickedFile): boolean {
    return this.playingAudioId() === `pick:${p.key}` && !this.audioPaused();
  }

  public async togglePickedAudio(p: PickedFile): Promise<void> {
    const id = `pick:${p.key}`;
    if (this.playingAudioId() === id && this.audioEl) {
      if (this.audioEl.paused) { void this.audioEl.play().catch(() => undefined); } else { this.audioEl.pause(); }
      return;
    }
    let url = this.pickAudioUrls.get(p.key);
    if (!url) { url = URL.createObjectURL(p.file); this.pickAudioUrls.set(p.key, url); }
    try {
      await this.playUrl(id, url, this.voiceNameSeconds(p.file.name));
    } catch {
      this.playingAudioId.set(null);
      this.toast.error('پخش پیام صوتی انجام نشد');
    }
  }

  /** مدت از نام قراردادی voice_<زمان>_<ثانیه>s.<پسوند> */
  public voiceNameSeconds(name?: string): number {
    const m = /_(\d+)s\.[a-z0-9]+$/i.exec(name || '');
    return m ? Number(m[1]) : 0;
  }

  private pickAudioUrls = new Map<string, string>();

  private ensureAudioEl(): HTMLAudioElement {
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.ontimeupdate = () => this.audioPos.set(this.audioEl?.currentTime || 0);
      this.audioEl.onloadedmetadata = () => {
        const d = this.audioEl?.duration;
        if (d && Number.isFinite(d)) this.audioDur.set(d);
      };
      this.audioEl.onended = () => { this.audioPos.set(0); this.playingAudioId.set(null); this.audioPaused.set(true); };
      this.audioEl.onpause = () => this.audioPaused.set(true);
      this.audioEl.onplay = () => this.audioPaused.set(false);
    }
    return this.audioEl;
  }

  private async playUrl(id: string, url: string, duration: number): Promise<void> {
    const el = this.ensureAudioEl();
    el.pause();
    el.src = url;
    this.audioPos.set(0);
    this.audioDur.set(duration || 0);
    this.playingAudioId.set(id);
    await el.play();
  }

  public seekAudio(att: MessageAttachment, value: number): void {
    if (this.playingAudioId() !== String(att.id) || !this.audioEl || !Number.isFinite(value)) return;
    this.audioEl.currentTime = value;
    this.audioPos.set(value);
  }

  private restoreDraft(convId: string): void {
    const draft = this.commService.takeComposerDraft(convId);
    if (!draft) return;
    this.messageInputText = draft.text;
    if (draft.files.length) this.restorePicked(draft.files);
  }

  /** بازگرداندن فایل‌ها به نوار، وقتی ارسال پیش از تحویل به سرویس شکست خورد */
  private restorePicked(files: File[]): void {
    const added: PickedFile[] = files.map(file => {
      const kind = this.pickKind(file);
      return { key: `pick-${++this.pickSeq}`, file, kind, previewUrl: kind === 'image' ? URL.createObjectURL(file) : null };
    });
    this.pickedFiles.set(added);
    for (const p of added) {
      if (p.kind === 'pdf') void this.renderPdfThumb(p);
    }
  }

  private revokePick(p: PickedFile): void {
    if (p.previewUrl && p.previewUrl.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl);
    const audioUrl = this.pickAudioUrls.get(p.key);
    if (audioUrl) {
      if (this.playingAudioId() === `pick:${p.key}` && this.audioEl) { this.audioEl.pause(); this.playingAudioId.set(null); }
      URL.revokeObjectURL(audioUrl);
      this.pickAudioUrls.delete(p.key);
    }
  }

  private pickKind(file: File): PickedFile['kind'] {
    if (file.type.startsWith('image/')) return 'image';
    if (this.isPdfName(file.name, file.type)) return 'pdf';
    return this.attachmentKind({ content_type: file.type, file_name: file.name }) === 'audio' ? 'audio' : 'file';
  }

  private isPdfName(name?: string, type?: string): boolean {
    return type === 'application/pdf' || /\.pdf$/i.test(name || '');
  }

  /** صفحهٔ اول PDF با همان pdf.js در مرورگر؛ شکست یعنی کارت فایل */
  private async renderPdfThumb(p: PickedFile): Promise<void> {
    try {
      const buffer = await p.file.arrayBuffer();
      const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.js');
      if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 240 / Math.max(1, base.width)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL('image/png');
      try { doc.destroy?.(); } catch { /* اختیاری */ }
      // اگر کاربر در این فاصله فایل را برداشته باشد، چیزی تغییر نمی‌کند
      this.pickedFiles.set(this.pickedFiles().map(x => x.key === p.key ? { ...x, previewUrl: url } : x));
    } catch {
      /* پیش‌نمایش اختیاری است؛ کارت فایل نشان داده می‌شود */
    }
  }

  /** چسباندن عکس با Ctrl+V در کادر پیام */
  public onComposerPaste(event: ClipboardEvent): void {
    const items = Array.from(event.clipboardData?.items ?? []);
    const files = items
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter((f): f is File => !!f)
      .map(f => f.name && f.name.includes('.') ? f : new File([f], `image-${Date.now()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
    if (files.length === 0) return;
    event.preventDefault();
    this.addFiles(files);
  }

  /** کشیدن و رها کردن فایل روی کشو (فقط وقتی گفتگو باز است و نوشتن مجاز است) */
  public canDropFiles(): boolean {
    return this.activeTab() === 'chat' && this.activeConv()?.can_post !== false && !this.editing();
  }

  public onDragOver(event: DragEvent): void {
    if (!this.canDropFiles() || !Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragOver.set(true);
  }

  public onDragLeave(event: DragEvent): void {
    const to = event.relatedTarget as Node | null;
    if (to && this.host.nativeElement.contains(to)) return;
    this.dragOver.set(false);
  }

  public onDrop(event: DragEvent): void {
    this.dragOver.set(false);
    if (!this.canDropFiles()) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    this.addFiles(files);
  }

  /** لغو آپلود در حال اجرا؛ پیام «ناموفق» با فایل‌هایش برای تلاش مجدد می‌ماند */
  public cancelUpload(msg: ChatMessage): void {
    this.commService.cancelUpload(msg.client_temp_id || msg.id);
  }

  public backToList(): void {
    const cur = this.activeConv();
    if (cur) {
      this.commService.leaveConversation(cur.id);
      this.commService.activeConversation$.next(null);
    }
    this.activeConv.set(null);
    this.activeTab.set('conversations');
  }

  public closeDrawer(): void {
    const cur = this.activeConv();
    if (cur) {
      this.commService.leaveConversation(cur.id);
      this.commService.activeConversation$.next(null);
    }
    this.activeConv.set(null);
    this.activeTab.set('conversations');
    this.commService.isChatDrawerOpen.set(false);
  }

  public filteredConversations(): Conversation[] {
    const list = Array.isArray(this.conversations()) ? this.conversations() : [];
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return list;
    return list.filter(c => {
      const title = c.title?.toLowerCase() || '';
      const otherNames = c.participants_details?.map(p => p.full_name?.toLowerCase() || '').join(' ') || '';
      return title.includes(q) || otherNames.includes(q);
    });
  }

  public filteredContacts(): UserShort[] {
    const list = Array.isArray(this.contacts()) ? this.contacts() : [];
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return list;
    return list.filter(c => 
      (c.full_name && c.full_name.toLowerCase().includes(q)) || 
      (c.username && c.username.toLowerCase().includes(q))
    );
  }

  public getConversationTitle(conv: Conversation): string {
    if (conv.conv_type === 'group') return conv.title || 'گروه';
    if (conv.conv_type === 'announcement') return conv.title || 'کانال اطلاعیه‌های عمومی';

    // در چت‌های دونفره (direct): همواره نام طرف مقابل (مخاطب غیر از کاربر جاری) را برمی‌گردانیم
    const currentUserId = this.commService.getCurrentUserId() ?? this.auth.user()?.id;
    if (conv.participants_details && conv.participants_details.length > 0) {
      if (currentUserId !== null && currentUserId !== undefined) {
        const curStr = String(currentUserId);
        const other = conv.participants_details.find(p => String(p.id) !== curStr);
        if (other) return other.full_name || other.username;
      }
      return conv.participants_details[0].full_name || conv.participants_details[0].username;
    }

    if (conv.title) return conv.title;
    return 'گفتگوی دو‌نفره';
  }

  public getOtherParticipant(conv?: Conversation | null): UserShort | null {
    const c = conv || this.activeConv();
    if (!c || c.conv_type !== 'direct' || !c.participants_details || c.participants_details.length === 0) {
      return null;
    }
    const currentUserId = this.commService.getCurrentUserId() ?? this.auth.user()?.id;
    if (currentUserId !== null && currentUserId !== undefined) {
      const curStr = String(currentUserId);
      const other = c.participants_details.find(p => String(p.id) !== curStr);
      if (other) return other;
    }
    return c.participants_details[0];
  }

  public isOtherUserOnline(conv?: Conversation | null): boolean {
    const other = this.getOtherParticipant(conv);
    if (!other) return false;
    return this.commService.isUserOnline(other.id);
  }

  public trackByMessageId(index: number, msg: ChatMessage): string {
    return msg.id || msg.client_temp_id || String(index);
  }

  public trackItem(index: number, it: ChatItem): string {
    return it.key || String(index);
  }

  public asMsg(it: ChatItem): ChatMessage | null {
    return it.kind === 'msg' ? it.msg : null;
  }

  public trackByConvId(index: number, conv: Conversation): string {
    return conv.id;
  }

  public formatTime(isoStr?: string): string {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  private apiPath(url: string): string {
    return url.replace(/^\/?api\//, '');
  }

  /**
   * نشانی blob پیش‌نمایش پیوست در حباب؛ بار اول دریافت را شروع می‌کند و تا آماده شدن null می‌دهد.
   * بندانگشتی سرور اولویت دارد؛ تا ساخته شدنش (pending) چیزی دریافت نمی‌شود و حباب اسکلت نشان می‌دهد.
   * فقط عکسی که بندانگشتی ندارد (قدیمی یا ناموفق) فایل کامل را نشان می‌دهد.
   */
  public attachmentPreview(att: { id?: string; download_url?: string; thumbnail_url?: string | null; content_type?: string; preview_status?: string }): string | null {
    if (!att?.id) return null;
    const fallback = att.preview_status === 'pending' || !(att.content_type || '').startsWith('image/') ? null : att.download_url;
    const url = att.thumbnail_url || fallback;
    if (!url) return null;
    const key = `${att.id}|${url}`;
    if (this.attachmentPreviews.has(key)) return this.attachmentPreviews.get(key) ?? null;
    this.attachmentPreviews.set(key, null);
    const isThumb = !!att.thumbnail_url && url === att.thumbnail_url;
    const attId = String(att.id);
    const uid = this.currentUserId();
    firstValueFrom(this.api.download(this.apiPath(url)))
      .then((blob) => {
        this.attachmentPreviews.set(key, URL.createObjectURL(blob));
        if (isThumb) void putChatThumb(uid, attId, blob);
      })
      .catch(async () => {
        // آفلاین یا خطای شبکه: بندانگشتی دیده‌شدهٔ قبلی از کش نشان داده می‌شود
        if (!isThumb) return;
        const cached = await getChatThumb(uid, attId);
        if (cached) this.attachmentPreviews.set(key, URL.createObjectURL(cached));
      });
    return null;
  }

  /** نوع نمایشی پیوست از نوع تشخیص‌داده‌شده در سرور و پسوند */
  public attachmentKind(att: { content_type?: string; file_name?: string }): AttachmentKind {
    const type = (att?.content_type || '').toLowerCase();
    const ext = this.fileExt(att?.file_name);
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('audio/') || ext === 'webm' || ext === 'ogg' || ext === 'm4a') return 'audio';
    if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (ext === 'doc' || ext === 'docx' || type.includes('word')) return 'word';
    if (ext === 'xls' || ext === 'xlsx' || type.includes('sheet') || type.includes('excel')) return 'excel';
    if (ext === 'txt' || ext === 'csv' || type.startsWith('text/')) return 'text';
    return 'file';
  }

  /** پسوند فایل با حروف کوچک و بدون نقطه */
  public fileExt(name?: string): string {
    const n = name || '';
    return n.includes('.') ? n.substring(n.lastIndexOf('.') + 1).toLowerCase() : '';
  }

  /** حجم فایل به فارسی، مثل «۱٫۲ مگابایت» */
  public fileSizeFa(bytes?: number | null): string {
    const b = Number(bytes);
    if (!Number.isFinite(b) || b < 0) return '';
    const fmt = (v: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(v);
    if (b < 1024) return `${fmt(b)} بایت`;
    if (b < 1024 * 1024) return `${fmt(b / 1024)} کیلوبایت`;
    return `${fmt(b / (1024 * 1024))} مگابایت`;
  }

  /** خط توضیح کارت فایل، مثل «۳ صفحه · ۱٫۲ مگابایت» */
  public fileMetaFa(att: { page_count?: number | null; file_size?: number }): string {
    const parts: string[] = [];
    if (att?.page_count) parts.push(`${att.page_count.toLocaleString('fa-IR')} صفحه`);
    const size = this.fileSizeFa(att?.file_size);
    if (size) parts.push(size);
    return parts.join(' · ');
  }

  /** همهٔ پیوست‌های پیام‌های بارگذاری‌شدهٔ این گفتگو، به ترتیب پیام‌ها */
  public mediaEntries = computed<MediaEntry[]>(() => {
    const out: MediaEntry[] = [];
    for (const msg of this.messages()) {
      if (msg.is_system || !Array.isArray(msg.attachments)) continue;
      for (const att of msg.attachments) {
        if (att?.id) out.push({ msg, att });
      }
    }
    return out;
  });
  /** تب «عکس‌ها» */
  public mediaImages = computed<MediaEntry[]>(() => this.mediaEntries().filter(e => this.attachmentKind(e.att) === 'image'));
  /** تب «فایل‌ها» */
  public mediaFiles = computed<MediaEntry[]>(() => this.mediaEntries().filter(e => this.attachmentKind(e.att) !== 'image'));

  /** کلیک روی عکس یا PDF: لایت‌باکس با همهٔ عکس‌ها و PDFهای گفتگو؛ فایل‌های دیگر دانلود می‌شوند */
  public openAttachment(msg: ChatMessage, att: MessageAttachment): void {
    const kind = this.attachmentKind(att);
    if (kind === 'audio') {
      void this.toggleAudio(att);
      return;
    }
    if (kind !== 'image' && kind !== 'pdf') {
      void this.downloadAttachment(att);
      return;
    }
    if (!att.download_url || !this.docPreview) {
      void this.downloadAttachment(att);
      return;
    }
    const list = this.mediaEntries().filter(e => {
      const k = this.attachmentKind(e.att);
      return (k === 'image' || k === 'pdf') && !!e.att.download_url;
    });
    let index = list.findIndex(e => e.att.id === att.id);
    if (index === -1) {
      list.push({ msg, att });
      index = list.length - 1;
    }
    this.docPreview.openGallery(list.map(e => this.toPreviewSource(e)), index);
  }

  private toPreviewSource(e: MediaEntry): DocumentPreviewSource {
    const kind = this.attachmentKind(e.att);
    const sender = e.msg.is_me ? 'شما' : (e.msg.sender_details?.full_name || 'کاربر');
    const when = this.shamsiDateTime(e.msg.created_at);
    return {
      title: e.att.file_name || 'فایل',
      url: '',
      kind: kind === 'pdf' ? 'pdf' : 'image',
      subtitle: when ? `${sender} · ${when}` : sender,
      messageId: String(e.msg.id),
      downloadName: e.att.file_name || 'attachment',
      load: () => this.fullAttachmentUrl(e.att)
    };
  }

  /** فایل کامل پیوست با توکن (هرگز نشانی خام media)؛ نتیجه برای باز کردن دوباره نگه داشته می‌شود */
  private fullAttachmentUrl(att: MessageAttachment): Promise<string> {
    const id = String(att.id);
    const cached = this.attachmentFull.get(id);
    if (cached) return cached;
    const p = firstValueFrom(this.api.download(this.apiPath(att.download_url || '')))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        this.fullBlobUrls.push(url);
        return url;
      });
    p.catch(() => this.attachmentFull.delete(id));
    this.attachmentFull.set(id, p);
    return p;
  }

  private shamsiDateTime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  }

  /** «برو به پیام» از لایت‌باکس */
  public onGalleryGoTo(doc: DocumentPreviewSource): void {
    if (!doc?.messageId) return;
    if (this.infoOpen()) this.closeInfo();
    setTimeout(() => this.scrollToMessage(doc.messageId!), 0);
  }

  public async downloadAttachment(att: { download_url?: string; file_name?: string }): Promise<void> {
    if (!att?.download_url) {
      // پیام کش‌شدهٔ قدیمی که هنوز نشانی دانلود تازه ندارد؛ با تازه شدن فهرست درست می‌شود
      this.toast.error('فایل هنوز آماده نیست؛ گفتگو را دوباره باز کنید');
      return;
    }
    try {
      const blob = await firstValueFrom(this.api.download(this.apiPath(att.download_url)));
      await saveBlob(blob, att.file_name || 'attachment');
    } catch {
      this.toast.error('دانلود فایل انجام نشد');
    }
  }

  // ─── گروه‌ها: ساخت ───
  private currentUserId(): number | null {
    const id = this.commService.getCurrentUserId() ?? this.auth.user()?.id;
    return id === null || id === undefined ? null : Number(id);
  }

  public openCreate(): void {
    this.groupTitle.set('');
    this.pickerSearch.set('');
    this.pickedIds.set([]);
    this.groupError.set('');
    this.addOpen.set(false);
    this.createOpen.set(true);
    setTimeout(() => (document.getElementById('group-title-input') as HTMLInputElement | null)?.focus(), 0);
  }

  public closeCreate(): void {
    this.createOpen.set(false);
  }

  public pickerCandidates(): UserShort[] {
    const q = this.pickerSearch().toLowerCase().trim();
    const me = this.currentUserId();
    const exclude = this.addOpen() ? new Set(this.members().map(m => m.id)) : new Set<number>();
    return (Array.isArray(this.contacts()) ? this.contacts() : []).filter(u =>
      u.id !== me && !exclude.has(u.id) &&
      (!q || (u.full_name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q)));
  }

  public isPicked(id: number): boolean {
    return this.pickedIds().includes(id);
  }

  public togglePick(id: number): void {
    const cur = this.pickedIds();
    this.pickedIds.set(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  public canSubmitGroup(): boolean {
    const t = this.groupTitle().trim();
    return t.length > 0 && t.length <= 120 && !this.groupBusy();
  }

  private groupErrorText(e: any, fallback: string): string {
    const body = e?.error;
    if (e?.status === 400 && body && (body.user_ids || body.invalid_ids)) {
      return 'برخی کاربران انتخاب‌شده معتبر نیستند';
    }
    return fallback;
  }

  public async submitCreateGroup(): Promise<void> {
    if (!this.canSubmitGroup()) return;
    this.groupBusy.set(true);
    this.groupError.set('');
    try {
      const conv = await this.commService.createGroup(this.groupTitle().trim(), this.pickedIds());
      this.createOpen.set(false);
      this.selectConversation(conv);
    } catch (e) {
      this.groupError.set(this.groupErrorText(e, 'ساخت گروه انجام نشد'));
    } finally {
      this.groupBusy.set(false);
    }
  }

  // ─── گروه‌ها: اطلاعات و اعضا ───
  public isGroup(): boolean {
    return this.activeConv()?.conv_type === 'group';
  }

  public canManage(): boolean {
    const r = this.activeConv()?.my_role;
    return r === 'owner' || r === 'admin';
  }

  public isOwner(): boolean {
    return this.activeConv()?.my_role === 'owner';
  }

  public roleLabel(role: string): string {
    return role === 'owner' ? 'مالک' : role === 'admin' ? 'مدیر گروه' : 'عضو';
  }

  public canRemove(m: ConversationMember): boolean {
    if (m.id === this.currentUserId()) return false;
    if (this.isOwner()) return m.role !== 'owner';
    return this.canManage() && m.role === 'member';
  }

  public async openInfo(): Promise<void> {
    if (!this.isGroup()) return;
    this.renaming.set(false);
    this.addOpen.set(false);
    this.confirmAction.set(null);
    this.infoReturnFocus = document.activeElement as HTMLElement | null;
    this.infoOpen.set(true);
    setTimeout(() => document.getElementById('group-info-title')?.focus(), 0);
    await this.loadMembers();
  }

  public closeInfo(): void {
    this.infoOpen.set(false);
    this.addOpen.set(false);
    this.renaming.set(false);
    this.confirmAction.set(null);
    const back = this.infoReturnFocus;
    this.infoReturnFocus = null;
    if (back?.isConnected) setTimeout(() => back.focus(), 0);
  }

  public async loadMembers(): Promise<void> {
    const conv = this.activeConv();
    if (!conv) return;
    this.membersLoading.set(true);
    this.membersError.set(false);
    try {
      this.members.set(await this.commService.getMembers(conv.id));
    } catch {
      this.membersError.set(true);
    } finally {
      this.membersLoading.set(false);
    }
  }

  public startRename(): void {
    this.renameText.set(this.activeConv()?.title || '');
    this.renaming.set(true);
  }

  public async saveRename(): Promise<void> {
    const conv = this.activeConv();
    const t = this.renameText().trim();
    if (!conv || !t || t.length > 120) return;
    try {
      const updated = await this.commService.renameGroup(conv.id, t);
      this.activeConv.set({ ...conv, ...updated, title: updated?.title ?? t });
      this.renaming.set(false);
    } catch {
      this.toast.error('تغییر نام گروه انجام نشد');
    }
  }

  public openAdd(): void {
    this.pickerSearch.set('');
    this.pickedIds.set([]);
    this.groupError.set('');
    this.addOpen.set(true);
  }

  public async submitAddMembers(): Promise<void> {
    const conv = this.activeConv();
    if (!conv || this.pickedIds().length === 0 || this.groupBusy()) return;
    this.groupBusy.set(true);
    this.groupError.set('');
    try {
      await this.commService.addMembers(conv.id, this.pickedIds());
      this.addOpen.set(false);
      this.pickedIds.set([]);
      await this.loadMembers();
    } catch (e) {
      this.groupError.set(this.groupErrorText(e, 'افزودن عضو انجام نشد'));
    } finally {
      this.groupBusy.set(false);
    }
  }

  public askRemove(m: ConversationMember): void {
    this.confirmAction.set({ kind: 'remove', member: m });
    setTimeout(() => document.getElementById('confirm-cancel')?.focus(), 0);
  }

  public askLeave(): void {
    this.confirmAction.set({ kind: 'leave' });
    setTimeout(() => document.getElementById('confirm-cancel')?.focus(), 0);
  }

  public cancelConfirm(): void {
    this.confirmAction.set(null);
  }

  public async runConfirm(): Promise<void> {
    const conv = this.activeConv();
    const action = this.confirmAction();
    if (!conv || !action) return;
    this.confirmAction.set(null);
    try {
      if (action.kind === 'remove') {
        await this.commService.removeMember(conv.id, action.member.id);
        await this.loadMembers();
      } else {
        await this.commService.leaveGroup(conv.id);
        this.closeInfo();
        this.activeConv.set(null);
        this.activeTab.set('conversations');
      }
    } catch {
      this.toast.error(action.kind === 'remove' ? 'حذف عضو انجام نشد' : 'ترک گروه انجام نشد');
    }
  }

  public async toggleRole(m: ConversationMember): Promise<void> {
    const conv = this.activeConv();
    if (!conv || !this.isOwner() || m.role === 'owner') return;
    try {
      await this.commService.setMemberRole(conv.id, m.id, m.role === 'admin' ? 'member' : 'admin');
      await this.loadMembers();
    } catch {
      this.toast.error('تغییر نقش انجام نشد');
    }
  }

  public async toggleGroupMute(): Promise<void> {
    const conv = this.activeConv();
    if (!conv) return;
    const next = !conv.is_muted;
    try {
      await this.commService.muteConversation(conv.id, next);
      this.activeConv.set({ ...conv, is_muted: next });
    } catch {
      this.toast.error('تغییر وضعیت صدا انجام نشد');
    }
  }

  // ─── پیام‌های گروه ───
  public senderColor(msg: ChatMessage): string {
    const id = Math.abs(Number(msg.sender) || 0);
    return ChatDrawerComponent.SENDER_COLORS[id % ChatDrawerComponent.SENDER_COLORS.length];
  }

  // ─── «خوانده‌شده توسط» (فقط گروه) ───
  public readByMsg = signal<ChatMessage | null>(null);
  public readByLoading = signal<boolean>(false);
  public readByError = signal<boolean>(false);
  public readByStatus = signal<ReadStatus | null>(null);
  private readByReturnFocus: HTMLElement | null = null;
  /** شمارهٔ آخرین درخواست؛ پاسخ دیرِ درخواست قبلی نادیده گرفته می‌شود */
  private readBySeq = 0;

  /** کاربر فقط وقتی گروه را می‌بیند و پیام ارسال‌شده و واقعی (نه موقت) باشد */
  public canShowReadBy(msg: ChatMessage): boolean {
    return this.isGroup() && !!msg.is_me && !msg.is_pending && msg.delivery_status !== 'failed' && Number.isFinite(Number(msg.id));
  }

  public readByReaders(): { user_id: number; name: string }[] {
    const msg = this.readByMsg();
    const st = this.readByStatus();
    if (!msg || !st) return [];
    const mid = Number(msg.id);
    const me = this.currentUserId();
    return st.members
      .filter(m => m.user_id !== me && m.last_read_message_id != null && Number(m.last_read_message_id) >= mid)
      .map(m => ({ user_id: m.user_id, name: m.name }));
  }

  public async openReadBy(msg: ChatMessage): Promise<void> {
    if (!this.canShowReadBy(msg)) return;
    this.readByReturnFocus = document.activeElement as HTMLElement | null;
    this.readByMsg.set(msg);
    this.readByStatus.set(null);
    setTimeout(() => document.getElementById('read-by-title')?.focus(), 0);
    await this.loadReadBy();
  }

  public async loadReadBy(): Promise<void> {
    const conv = this.activeConv();
    if (!conv) return;
    const seq = ++this.readBySeq;
    this.readByLoading.set(true);
    this.readByError.set(false);
    try {
      const status = await this.commService.getReadStatus(conv.id);
      if (seq === this.readBySeq) this.readByStatus.set(status);
    } catch {
      if (seq === this.readBySeq) this.readByError.set(true);
    } finally {
      if (seq === this.readBySeq) this.readByLoading.set(false);
    }
  }

  public closeReadBy(): void {
    this.readBySeq++;
    this.readByLoading.set(false);
    this.readByMsg.set(null);
    this.readByStatus.set(null);
    this.readByError.set(false);
    const back = this.readByReturnFocus;
    this.readByReturnFocus = null;
    if (back?.isConnected) setTimeout(() => back.focus(), 0);
  }

  public onDialogKey(ev: KeyboardEvent, close: () => void): void {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    }
  }
}
