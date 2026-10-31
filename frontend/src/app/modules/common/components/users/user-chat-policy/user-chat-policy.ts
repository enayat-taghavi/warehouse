import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../../core/api/api.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ToggleSwitchComponent } from '../../../../../shared/components/toggle-switch/toggle-switch.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

export type UserContactScope = '' | 'section' | 'project' | 'company' | 'all';

export interface UserChatPolicy {
  user_id: number;
  chat_allowed: boolean;
  contact_scope: UserContactScope;
  updated_by?: number | null;
  updated_at?: string | null;
}

@Component({
  selector: 'app-user-chat-policy',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ToggleSwitchComponent],
  templateUrl: './user-chat-policy.html'
})
export class UserChatPolicyComponent implements OnInit, OnChanges {
  @Input({ required: true }) userId!: number;

  private api = inject(ApiService);
  private permission = inject(PermissionService);
  private toast = inject(ToastService, { optional: true });
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  hidden = false;
  error = '';
  saving = false;

  chatAllowed = true;
  contactScope: UserContactScope = '';
  savedScope: UserContactScope = '';

  private loadSeq = 0;

  get isSuperuser(): boolean {
    return this.permission.isSuperuser();
  }

  get isScopeDisabled(): boolean {
    return this.saving || (this.savedScope === 'all' && !this.isSuperuser);
  }

  ngOnInit(): void {
    if (this.userId) void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && !changes['userId'].firstChange) {
      void this.load();
    }
  }

  async load(): Promise<void> {
    if (!this.userId) return;
    const seq = ++this.loadSeq;
    this.loading = true;
    this.hidden = false;
    this.error = '';
    this.cdr.markForCheck();

    try {
      const res = await firstValueFrom(
        this.api.get<UserChatPolicy>(`communications/policies/users/${this.userId}`)
      );
      if (seq !== this.loadSeq) return;
      this.chatAllowed = res.chat_allowed;
      this.contactScope = res.contact_scope ?? '';
      this.savedScope = res.contact_scope ?? '';
      this.loading = false;
    } catch (err: unknown) {
      if (seq !== this.loadSeq) return;
      this.loading = false;
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        this.hidden = true;
      } else {
        this.error = 'دریافت تنظیمات پیامرسان ممکن نشد.';
      }
    }
    this.cdr.markForCheck();
  }

  setAllowed(allowed: boolean): void {
    if (this.saving || allowed === this.chatAllowed) return;
    const prevAllowed = this.chatAllowed;
    const prevScope = this.contactScope;
    this.chatAllowed = allowed;
    void this.save(prevAllowed, prevScope);
  }

  setScope(scope: UserContactScope): void {
    if (this.saving || scope === this.contactScope) return;
    const prevAllowed = this.chatAllowed;
    const prevScope = this.contactScope;
    this.contactScope = scope;
    void this.save(prevAllowed, prevScope);
  }

  private async save(prevAllowed: boolean, prevScope: UserContactScope): Promise<void> {
    this.saving = true;
    this.cdr.markForCheck();

    try {
      const res = await firstValueFrom(
        this.api.put<UserChatPolicy>(`communications/policies/users/${this.userId}`, {
          chat_allowed: this.chatAllowed,
          contact_scope: this.contactScope
        })
      );
      this.chatAllowed = res.chat_allowed;
      this.contactScope = res.contact_scope ?? '';
      this.savedScope = res.contact_scope ?? '';
      this.toast?.success('تنظیمات پیامرسان ذخیره شد');
    } catch (err: unknown) {
      this.chatAllowed = prevAllowed;
      this.contactScope = prevScope;
      const msg = this.extractError(err, 'ذخیرهٔ تنظیمات پیامرسان ممکن نشد.');
      this.toast?.error(msg);
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  private extractError(err: unknown, fallback: string): string {
    const error = (err as { error?: unknown })?.error;
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      if (typeof errObj['detail'] === 'string' && errObj['detail']) {
        return errObj['detail'];
      }
      const values = Object.values(errObj);
      if (values.length > 0) {
        const first = values[0];
        if (typeof first === 'string' && first) return first;
        if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'string' && first[0]) {
          return first[0];
        }
      }
    }
    return fallback;
  }
}
