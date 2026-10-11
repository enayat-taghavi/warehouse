import { Component, Input, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CommunicationService, GenericComment, UserShort } from '../../../core/services/communication.service';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-contextual-comments',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './contextual-comments.component.html',
  styleUrls: ['./contextual-comments.component.css']
})
export class ContextualCommentsComponent implements OnInit, OnDestroy {
  @Input() modelName: string = 'item';
  @Input() appLabel: string = 'inventory';
  @Input() objectId!: string | number;
  @Input() warehouseId?: number;
  @Input() title: string = 'یادداشت‌ها و نظرات تعاملی';

  private commService = inject(CommunicationService);
  private sub = new Subscription();

  public comments = signal<GenericComment[]>([]);
  public isLoading = signal<boolean>(false);
  public isSubmitting = signal<boolean>(false);

  public newCommentText: string = '';
  public replyToComment: GenericComment | null = null;

  // مدیریت لیست منشن (@mention)
  public contacts = signal<UserShort[]>([]);
  public showMentionDropdown = signal<boolean>(false);
  public mentionSearchQuery = signal<string>('');
  public selectedMentionIndex = signal<number>(0);
  private mentionStartIndex: number = -1;

  ngOnInit(): void {
    if (this.objectId) {
      this.commService.subscribeComments(this.modelName, this.objectId.toString());
      this.loadComments();
      this.loadContacts();
      this.subscribeLiveComments();
    }
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.objectId) {
      this.commService.unsubscribeComments(this.modelName, this.objectId.toString());
    }
  }

  public async loadComments(): Promise<void> {
    if (!this.objectId) return;
    this.isLoading.set(true);
    try {
      const data = await this.commService.getComments(this.modelName, this.objectId.toString());
      this.comments.set(data);
    } catch (e) {
      console.debug('[ContextualComments] load error', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadContacts(): Promise<void> {
    try {
      const users = await this.commService.getContacts(this.warehouseId);
      this.contacts.set(users);
    } catch (e) {}
  }

  private subscribeLiveComments(): void {
    this.sub.add(
      this.commService.incomingComment$.subscribe((comment) => {
        if (String(comment.object_id) === String(this.objectId)) {
          const current = this.comments();
          if (!current.some(c => String(c.id) === String(comment.id) || (c.client_temp_id && c.client_temp_id === comment.client_temp_id))) {
            this.comments.set([...current, comment]);
          }
        }
      })
    );
  }

  public async submitComment(): Promise<void> {
    const text = this.newCommentText.trim();
    if (!text || this.isSubmitting() || !this.objectId) return;

    this.isSubmitting.set(true);

    // استخراج شناسه‌های کاربران منشن‌شده با توکن استاندارد @[id:نام] و @username
    const mentionedIds: number[] = [];

    // استخراج از توکن @[id:نام]
    const tokenRegex = /@\[(\d+)(?::[^\]]*)?\]/g;
    let match;
    while ((match = tokenRegex.exec(text)) !== null) {
      const id = parseInt(match[1], 10);
      if (!isNaN(id) && !mentionedIds.includes(id)) {
        mentionedIds.push(id);
      }
    }

    // استخراج سنتی از @username
    const words = text.split(/\s+/);
    for (const w of words) {
      if (w.startsWith('@') && !w.startsWith('@[') && !w.startsWith('@{')) {
        const uname = w.substring(1).trim();
        const found = this.contacts().find(u => u.username === uname || u.full_name === uname);
        if (found && !mentionedIds.includes(found.id)) {
          mentionedIds.push(found.id);
        }
      }
    }

    const tempId = `temp-cmt-${Date.now()}`;
    const optimistic: GenericComment = {
      id: tempId,
      client_temp_id: tempId,
      object_id: this.objectId.toString(),
      author: 0,
      text: text,
      parent: this.replyToComment?.id,
      created_at: new Date().toISOString(),
      is_pending: true
    };

    this.comments.set([...this.comments(), optimistic]);
    this.newCommentText = '';
    const parentId = this.replyToComment?.id;
    this.replyToComment = null;

    try {
      const saved: any = await this.commService.postComment(
        this.modelName,
        this.objectId.toString(),
        text,
        mentionedIds,
        parentId,
        this.appLabel,
        tempId
      );
      if (saved && saved._offlinePending) {
        // در حالت آفلاین، کامنت به صورت خوش‌بینانه و با وضعیت در انتظار در لیست باقی می‌ماند
        return;
      }
      // جایگزینی با رکورد نهایی سرور
      this.comments.set(this.comments().map(c => c.client_temp_id === tempId ? saved : c));
    } catch (e) {
      console.error('[ContextualComments] submit error', e);
      // کامنت خوش‌بینانه جهت جلوگیری از هدررفت داده کاربر در استیت حفظ می‌شود
    } finally {
      this.isSubmitting.set(false);
    }
  }

  public setReplyTo(comment: GenericComment): void {
    this.replyToComment = comment;
  }

  public cancelReply(): void {
    this.replyToComment = null;
  }

  // ─── هندلینگ منشن هوشمند با کیبورد (@mention) ───
  public onTextInput(event: any): void {
    const text = this.newCommentText;
    const cursorPos = event.target?.selectionStart || text.length;
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const query = textBeforeCursor.substring(lastAtIndex + 1);
      if (!query.includes(' ') && query.length <= 20) {
        this.mentionStartIndex = lastAtIndex;
        this.mentionSearchQuery.set(query.toLowerCase());
        this.showMentionDropdown.set(true);
        this.selectedMentionIndex.set(0);
        return;
      }
    }

    this.showMentionDropdown.set(false);
  }

  public filteredContacts(): UserShort[] {
    const q = this.mentionSearchQuery();
    if (!q) return this.contacts().slice(0, 5);
    return this.contacts().filter(c =>
      c.username.toLowerCase().includes(q) ||
      (c.full_name && c.full_name.toLowerCase().includes(q))
    ).slice(0, 5);
  }

  public selectMention(user: UserShort): void {
    if (this.mentionStartIndex === -1) return;
    const before = this.newCommentText.substring(0, this.mentionStartIndex);
    const after = this.newCommentText.substring(this.mentionStartIndex + 1 + this.mentionSearchQuery().length);
    // درج توکن استاندارد بدون ابهام و سازگار با نام‌های چند کلمه‌ای فارسی
    const mentionToken = `@[${user.id}:${user.full_name || user.username}] `;
    this.newCommentText = `${before}${mentionToken}${after}`;
    this.showMentionDropdown.set(false);
  }

  public onKeyDown(event: KeyboardEvent): void {
    if (this.showMentionDropdown()) {
      const list = this.filteredContacts();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.selectedMentionIndex.set((this.selectedMentionIndex() + 1) % Math.max(list.length, 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.selectedMentionIndex.set((this.selectedMentionIndex() - 1 + list.length) % Math.max(list.length, 1));
      } else if (event.key === 'Enter') {
        if (list.length > 0) {
          event.preventDefault();
          this.selectMention(list[this.selectedMentionIndex()]);
        }
      } else if (event.key === 'Escape') {
        this.showMentionDropdown.set(false);
      }
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submitComment();
    }
  }

  public trackByCommentId(index: number, comment: GenericComment): string {
    return comment.id || comment.client_temp_id || String(index);
  }

  public formatTime(isoStr: string): string {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('fa-IR');
    } catch {
      return isoStr;
    }
  }
}
