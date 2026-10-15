import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CommunicationService, Conversation, ChatMessage, UserShort } from '../../../../../core/services/communication.service';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';

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
  private sub = new Subscription();

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

  private shouldScrollBottom = false;
  private typingTimeout: any = null;
  private typingIndicatorClearTimer: any = null;

  ngOnInit(): void {
    const whId = this.state.appState.activeWarehouseId === 'ALL' ? undefined : Number(this.state.appState.activeWarehouseId);
    this.commService.ensureConnected(whId);
    this.commService.refreshPresence();
    this.commService.loadConversations(whId);
    this.loadContacts(whId);

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
    const offset = this.messages().length;
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

      await this.commService.sendMessage(conv.id, text, undefined, file || undefined);
    } catch (e) {
      console.error('Send error', e);
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
    if (conv.conv_type === 'warehouse_group') return conv.title || 'گروه عمومی انبار';
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
}
