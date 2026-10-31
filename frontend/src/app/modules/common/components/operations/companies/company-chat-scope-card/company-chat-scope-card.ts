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
import { ApiService } from '../../../../../../core/api/api.service';
import { HttpContext } from '@angular/common/http';
import { SKIP_OFFLINE } from '../../../../../../core/interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../../../../core/error/error.interceptor';
import { PermissionService } from '../../../../../../core/services/permission.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

export type CompanyContactScope = 'section' | 'project' | 'company' | 'all';

export interface CompanyChatPolicy {
  company_id: number;
  contact_scope: CompanyContactScope;
  updated_by?: number | null;
  updated_at?: string | null;
}

@Component({
  selector: 'app-company-chat-scope-card',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './company-chat-scope-card.html'
})
export class CompanyChatScopeCardComponent implements OnInit, OnChanges {
  @Input({ required: true }) companyId!: number;

  private api = inject(ApiService);
  private permission = inject(PermissionService);
  private toast = inject(ToastService, { optional: true });
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  hidden = false;
  error = '';
  saving = false;

  contactScope: CompanyContactScope = 'company';
  savedScope: CompanyContactScope = 'company';

  private loadSeq = 0;

  /** ۴۰۳ و خطاها را خود کارت نشان می‌دهد؛ تغییر سیاست هرگز در صف آفلاین نمی‌رود */
  private ctx(): HttpContext {
    return new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);
  }

  get isSuperuser(): boolean {
    return this.permission.isSuperuser();
  }

  get isScopeDisabled(): boolean {
    return this.saving || (this.savedScope === 'all' && !this.isSuperuser);
  }

  ngOnInit(): void {
    if (this.companyId) void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] && !changes['companyId'].firstChange) {
      void this.load();
    }
  }

  async load(): Promise<void> {
    if (!this.companyId) return;
    const seq = ++this.loadSeq;
    this.loading = true;
    this.hidden = false;
    this.error = '';
    this.cdr.markForCheck();

    try {
      const res = await firstValueFrom(
        this.api.get<CompanyChatPolicy>(`communications/policies/companies/${this.companyId}`, undefined, { context: this.ctx() })
      );
      if (seq !== this.loadSeq) return;
      this.contactScope = res.contact_scope ?? 'company';
      this.savedScope = res.contact_scope ?? 'company';
      this.loading = false;
    } catch (err: unknown) {
      if (seq !== this.loadSeq) return;
      this.loading = false;
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        this.hidden = true;
      } else {
        this.error = 'دریافت حوزهٔ مخاطبان چت ممکن نشد.';
      }
    }
    this.cdr.markForCheck();
  }

  setScope(scope: CompanyContactScope): void {
    if (this.saving || scope === this.contactScope) return;
    const prevScope = this.contactScope;
    this.contactScope = scope;
    void this.save(prevScope);
  }

  private async save(prevScope: CompanyContactScope): Promise<void> {
    this.saving = true;
    this.cdr.markForCheck();

    try {
      const res = await firstValueFrom(
        this.api.put<CompanyChatPolicy>(`communications/policies/companies/${this.companyId}`, {
          contact_scope: this.contactScope
        }, { context: this.ctx() })
      );
      this.contactScope = res.contact_scope ?? 'company';
      this.savedScope = res.contact_scope ?? 'company';
      this.toast?.success('حوزهٔ مخاطبان چت ذخیره شد');
    } catch (err: unknown) {
      this.contactScope = prevScope;
      const msg = this.extractError(err, 'ذخیرهٔ حوزهٔ مخاطبان چت ممکن نشد.');
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
