import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { CommunicationService, Conversation, ChatMessage, UserShort, ConversationMember } from '../../../../../core/services/communication.service';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ApiService } from '../../../../../core/api/api.service';
import { saveBlob } from '../../../../../core/platform/file-output';

@Component({
  selector: 'app-chat-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, TabBarComponent, ActionButtonComponent],
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
  private api = inject(ApiService);
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
  public selectedFile: File | null = null;
  public filePreviewUrl: string | null = null;
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

  ngOnInit(): void {
    const whId = this.state.appState.activeWarehouseId === 'ALL' ? undefined : Number(this.state.appState.activeWarehouseId);
    this.commService.ensureConnected(whId);
    this.commService.refreshPresence();
    this.commService.loadConversations(whId);
    this.loadContacts(whId);
    this.commService.getCapabilities()
      .then(c => this.canCreateGroup.set(!!c?.can_create_group))
      .catch(() => this.canCreateGroup.set(false));

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
          this.shouldScrollBottom = true;
        }
      })
    );

    // اشتراک در پیام‌های پیام‌رسان
    this.sub.add(
      this.commService.activeMessages$.subscribe(msgs => {
        this.messages.set(msgs);
        if (!this.isLoadingOlder()) {
          this.shouldScrollBottom = true;
        }
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

  ngAfterViewChecked(): void {
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
    if (this.filePreviewUrl) {
      URL.revokeObjectURL(this.filePreviewUrl);
      this.filePreviewUrl = null;
    }
    this.attachmentPreviews.forEach((u) => { if (u) URL.revokeObjectURL(u); });
    this.attachmentPreviews.clear();
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    if (this.typingIndicatorClearTimer) clearTimeout(this.typingIndicatorClearTimer);
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

    this.isLoadingOlder.set(true);
    // پیام‌های محلیِ «در انتظار»/«ناموفق» روی سرور نیستند و نباید در offset شمرده شوند
    const offset = this.messages().filter(m => m.delivery_status !== 'pending' && m.delivery_status !== 'failed').length;
    const older = await this.commService.loadOlderMessages(conv.id, offset, 30);
    if (older.length < 30) {
      this.hasMoreMessages.set(false);
    }
    this.isLoadingOlder.set(false);
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
    const file = this.selectedFile;
    let conv = this.activeConv();

    if ((!text && !file) || !conv || this.isSending()) return;

    this.isSending.set(true);
    this.messageInputText = '';
    this.removeSelectedFile();
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
      await this.commService.sendMessage(conv.id, text, undefined, file || undefined);
    } catch (e) {
      console.error('Send error', e);
      // اگر ساخت گفتگو شکست خورد، متن و فایل کاربر به کادر ورود برمی‌گردند تا گم نشوند
      if (!handedToService) {
        if (!this.messageInputText) this.messageInputText = text;
        if (file && !this.selectedFile) {
          this.selectedFile = file;
          if (file.type.startsWith('image/')) {
            this.filePreviewUrl = URL.createObjectURL(file);
          }
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
    const file = event.target?.files?.[0];
    if (this.filePreviewUrl) {
      URL.revokeObjectURL(this.filePreviewUrl);
      this.filePreviewUrl = null;
    }
    if (!file) {
      this.selectedFile = null;
      return;
    }

    const fileName = file.name || '';
    const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : '';
    const disallowedExtensions = ['.svg', '.html', '.htm', '.exe', '.bat', '.sh', '.js', '.php', '.py', '.vbs', '.msi', '.cmd', '.scr', '.pif'];

    if (disallowedExtensions.includes(ext) || file.type === 'image/svg+xml') {
      this.toast.show('error', 'آپلود فایل‌های SVG یا اسکریپتی به دلایل امنیتی مجاز نیست.');
      if (event.target) {
        event.target.value = '';
      }
      this.selectedFile = null;
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.toast.show('error', 'حجم فایل نباید بیش از ۱۰ مگابایت باشد.');
      if (event.target) {
        event.target.value = '';
      }
      this.selectedFile = null;
      return;
    }

    this.selectedFile = file;
    if (file.type.startsWith('image/')) {
      this.filePreviewUrl = URL.createObjectURL(file);
    }
  }

  public removeSelectedFile(): void {
    if (this.filePreviewUrl) {
      URL.revokeObjectURL(this.filePreviewUrl);
      this.filePreviewUrl = null;
    }
    this.selectedFile = null;
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

  /** نشانی blob پیش‌نمایش عکس؛ بار اول دریافت را شروع می‌کند و تا آماده شدن null می‌دهد */
  public attachmentPreview(att: { id?: string; download_url?: string; thumbnail_url?: string | null }): string | null {
    const url = att?.thumbnail_url || att?.download_url;
    if (!att?.id || !url) return null;
    if (this.attachmentPreviews.has(att.id)) return this.attachmentPreviews.get(att.id) ?? null;
    this.attachmentPreviews.set(att.id, null);
    const id = att.id;
    firstValueFrom(this.api.download(this.apiPath(url)))
      .then((blob) => this.attachmentPreviews.set(id, URL.createObjectURL(blob)))
      .catch(() => { /* پیش‌نمایش اختیاری است */ });
    return null;
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

  public onDialogKey(ev: KeyboardEvent, close: () => void): void {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    }
  }
}
