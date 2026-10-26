import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { ExpenseHead } from '../../../models/personnel.model';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';

/** شناسهٔ تب در `module.ts` و بخش مجوز شرکت */
export const EXPENSE_HEADS_TAB_ID = 'expense_heads';

/** گروه سرفصل با سرفصل‌های زیرش (فعال و غیرفعال) */
export interface ExpenseHeadTreeGroup {
  group: ExpenseHead;
  heads: ExpenseHead[];
}

type HeadField = 'code' | 'title' | 'parent' | 'order';

const byOrder = (a: ExpenseHead, b: ExpenseHead): number =>
  (a.order ?? 0) - (b.order ?? 0) || String(a.code).localeCompare(String(b.code));

/**
 * تب «سرفصل‌های هزینه» استودیوی شرکت (۳.۴ ص۶): گروه‌ها و سرفصل‌های زیرشان.
 * نوشتن فقط با بخش مجوز `expense_heads`/نوشتن و فقط برخط (رد سرور در صف دیده نمی‌شود).
 */
@Component({
  selector: 'app-company-expense-heads-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSkeletonComponent, SvgIconDirective, ActionButtonComponent],
  host: { class: 'block' },
  templateUrl: './company-expense-heads-tab.html'
})
export class CompanyExpenseHeadsTabComponent implements OnInit, OnChanges, OnDestroy {
  /** شناسهٔ شرکت ذخیره‌شده؛ برای شرکت تازه null */
  @Input() companyId: number | null = null;

  private api = inject(TreasuryOrgApiService);
  private studioContext = inject(CompanyStudioContextService);
  private ws = inject(WebSocketService, { optional: true });
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private network = NetworkStatusService.getInstance();
  private destroy$ = new Subject<void>();
  private unregisterDirty: () => void;
  private static readonly FA_NUMBER = new Intl.NumberFormat('fa-IR');

  isOnline = this.network.isOnline;
  heads: ExpenseHead[] = [];
  tree: ExpenseHeadTreeGroup[] = [];
  isLoading = false;
  loadError = false;
  isSaving = false;
  isSeeding = false;
  /** شناسهٔ ردیفی که کار فعال/غیرفعال یا حذفش در جریان است */
  busyId: number | null = null;

  /** فرم درجا: ساخت گروه، ساخت سرفصل یا ویرایش */
  showForm = false;
  editingId: number | null = null;
  form = this.emptyForm();
  fieldErrors: Partial<Record<HeadField, string>> = {};

  constructor() {
    // فرم باز در هشدار خروج استودیو حساب می‌شود
    this.unregisterDirty = this.studioContext.registerDirty('expense_heads', () => this.showForm);
  }

  get canWrite(): boolean {
    return this.studioContext.canWrite(EXPENSE_HEADS_TAB_ID);
  }

  /** گروه‌هایی که می‌توانند والد سرفصل باشند */
  get groupOptions(): ExpenseHead[] {
    return this.tree.map(t => t.group);
  }

  get isGroupForm(): boolean {
    return this.form.parent === null;
  }

  get formTitle(): string {
    if (this.editingId) return this.isGroupForm ? 'ویرایش گروه سرفصل' : 'ویرایش سرفصل هزینه';
    return this.isGroupForm ? 'گروه سرفصل تازه' : 'سرفصل هزینهٔ تازه';
  }

  fa(n: number): string {
    return CompanyExpenseHeadsTabComponent.FA_NUMBER.format(n);
  }

  /** کد با رقم فارسی */
  faDigits(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value).replace(/[0-9]/g, d => String.fromCharCode(0x06F0 + Number(d)));
  }

  ngOnInit(): void {
    this.network.state$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isOnline = this.network.isOnline;
      this.cdr.markForCheck();
    });
    // تغییر فهرست در تب یا دستگاه دیگر؛ فرم نیمه‌کاره بازنویسی نمی‌شود
    this.ws?.notifications$.pipe(takeUntil(this.destroy$)).subscribe(msg => {
      if (msg?.type_str !== 'org_structure_updated' || msg.entity_type !== 'expense_head') return;
      if (msg.client_tab_id && msg.client_tab_id === this.ws?.tabId) return;
      if (!this.companyId || Number(msg.company_id) !== Number(this.companyId) || this.showForm) return;
      this.load(this.companyId);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      this.cancelForm();
      this.setHeads([]);
      this.loadError = false;
      if (this.companyId) this.load(this.companyId);
    }
  }

  ngOnDestroy(): void {
    this.unregisterDirty();
    this.destroy$.next();
    this.destroy$.complete();
  }

  retry(): void {
    if (this.companyId) this.load(this.companyId);
  }

  load(companyId: number): void {
    this.isLoading = true;
    this.loadError = false;
    this.api.getExpenseHeads(companyId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        // پاسخ دیررس شرکت پیشین در تب شرکت تازه نمی‌نشیند
        if (companyId !== this.companyId) return;
        this.isLoading = false;
        this.setHeads(Array.isArray(res) ? res : []);
        this.studioContext.reportError(EXPENSE_HEADS_TAB_ID, false);
        this.cdr.markForCheck();
      },
      error: () => {
        if (companyId !== this.companyId) return;
        this.isLoading = false;
        this.loadError = true;
        this.studioContext.reportError(EXPENSE_HEADS_TAB_ID);
        this.cdr.markForCheck();
      }
    });
  }

  private setHeads(heads: ExpenseHead[]): void {
    this.heads = heads;
    const groups = heads.filter(h => h.parent == null).sort(byOrder);
    this.tree = groups.map(group => ({
      group,
      heads: heads.filter(h => h.parent === group.id).sort(byOrder)
    }));
    this.studioContext.setCount(EXPENSE_HEADS_TAB_ID, heads.filter(h => h.parent != null).length);
  }

  private requireOnline(actionFa: string): boolean {
    if (this.network.isOnline) return true;
    this.toast.warning(`${actionFa} فقط در حالت برخط ممکن است.`);
    return false;
  }

  // ─── فرم ساخت و ویرایش ───
  openCreateGroup(): void {
    this.openForm(null, { parent: null, code: '', title: '', order: 0, is_active: true });
  }

  openCreateHead(group: ExpenseHead): void {
    this.openForm(null, { parent: group.id, code: '', title: '', order: 0, is_active: true });
  }

  openEdit(head: ExpenseHead): void {
    this.openForm(head.id, {
      parent: head.parent ?? null,
      code: head.code,
      title: head.title,
      order: head.order ?? 0,
      is_active: head.is_active
    });
  }

  private openForm(id: number | null, values: ReturnType<CompanyExpenseHeadsTabComponent['emptyForm']>): void {
    this.editingId = id;
    this.form = values;
    this.fieldErrors = {};
    this.showForm = true;
    this.cdr.markForCheck();
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.form = this.emptyForm();
    this.fieldErrors = {};
    this.cdr.markForCheck();
  }

  save(): void {
    if (!this.companyId || !this.requireOnline('ثبت سرفصل')) return;
    this.fieldErrors = {};
    const code = this.normalizeDigits(this.form.code).trim();
    const title = this.form.title.trim();
    if (!code) this.fieldErrors.code = 'کد الزامی است.';
    else if (!/^\d+$/.test(code)) this.fieldErrors.code = 'کد فقط از رقم تشکیل می‌شود.';
    if (!title) this.fieldErrors.title = 'عنوان الزامی است.';
    if (Object.keys(this.fieldErrors).length) {
      this.cdr.markForCheck();
      return;
    }

    const payload: Partial<ExpenseHead> = {
      parent: this.form.parent,
      code,
      title,
      order: Number(this.form.order) || 0,
      is_active: this.form.is_active
    };
    const companyId = this.companyId;
    const request$ = this.editingId
      ? this.api.updateExpenseHead(this.editingId, payload)
      : this.api.createExpenseHead({ ...payload, company: companyId });
    this.isSaving = true;
    request$.subscribe({
      next: (saved) => {
        this.isSaving = false;
        this.toast.success(`«${saved.title}» ذخیره شد.`);
        if (companyId !== this.companyId) return;
        this.cancelForm();
        this.load(companyId);
      },
      error: (err) => {
        this.isSaving = false;
        this.fieldErrors = this.extractFieldErrors(err?.error);
        if (Object.keys(this.fieldErrors).length) {
          this.toast.error('لطفاً خطای کنار فیلدها را برطرف فرمایید.');
        } else {
          this.toast.error(this.serverMessage(err) || 'خطا در ذخیرهٔ سرفصل');
        }
        this.cdr.markForCheck();
      }
    });
  }

  /** فعال و غیرفعال کردن؛ سرفصل به‌کاررفته به‌جای حذف غیرفعال می‌شود */
  toggleActive(head: ExpenseHead): void {
    if (!this.requireOnline('تغییر وضعیت سرفصل')) return;
    const next = !head.is_active;
    this.busyId = head.id;
    this.api.updateExpenseHead(head.id, { is_active: next }).subscribe({
      next: (saved) => {
        this.busyId = null;
        this.toast.success(next ? `«${head.title}» فعال شد.` : `«${head.title}» غیرفعال شد.`);
        this.setHeads(this.heads.map(h => (h.id === head.id ? { ...h, ...saved } : h)));
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.busyId = null;
        this.toast.error(this.serverMessage(err) || 'خطا در تغییر وضعیت سرفصل');
        this.cdr.markForCheck();
      }
    });
  }

  async remove(head: ExpenseHead): Promise<void> {
    if (!this.requireOnline('حذف سرفصل')) return;
    const isGroup = head.parent == null;
    const ok = this.confirmDialog
      ? (await this.confirmDialog.open({
          title: isGroup ? 'حذف گروه سرفصل' : 'حذف سرفصل هزینه',
          message: `«${head.code} — ${head.title}» حذف شود؟ سرفصلی که در اسناد به کار رفته حذف نمی‌شود و فقط می‌توان آن را غیرفعال کرد.`,
          type: 'danger',
          confirmText: 'حذف',
          cancelText: 'انصراف'
        })) === true
      : false;
    if (!ok) return;
    this.busyId = head.id;
    this.api.deleteExpenseHead(head.id).subscribe({
      next: () => {
        this.busyId = null;
        this.toast.success(`«${head.title}» حذف شد.`);
        this.setHeads(this.heads.filter(h => h.id !== head.id));
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.busyId = null;
        this.toast.error(this.serverMessage(err) || 'خطا در حذف سرفصل');
        this.cdr.markForCheck();
      }
    });
  }

  /** ساخت فهرست پیش‌فرض برای شرکتی که سرفصلی ندارد */
  seedDefaults(): void {
    if (!this.companyId || !this.requireOnline('ساخت فهرست پیش‌فرض')) return;
    const companyId = this.companyId;
    this.isSeeding = true;
    this.api.seedDefaultExpenseHeads(companyId).subscribe({
      next: (res) => {
        this.isSeeding = false;
        this.toast.success(res?.created ? `${this.fa(res.created)} ردیف پیش‌فرض ساخته شد.` : 'فهرست این شرکت خالی نبود؛ ردیفی ساخته نشد.');
        if (companyId === this.companyId) this.load(companyId);
      },
      error: (err) => {
        this.isSeeding = false;
        this.toast.error(this.serverMessage(err) || 'خطا در ساخت فهرست پیش‌فرض');
        this.cdr.markForCheck();
      }
    });
  }

  private serverMessage(err: any): string {
    const body = err?.error;
    if (!body) return '';
    if (typeof body === 'string') return '';
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body) && typeof body[0] === 'string') return body[0];
    const nonField = body.non_field_errors ?? body.company;
    if (Array.isArray(nonField) && nonField[0]) return String(nonField[0]);
    return '';
  }

  /** پاسخ 400 سرور به شکل { فیلد: [پیام] } را به پیام کنار فیلد تبدیل می‌کند */
  private extractFieldErrors(body: any): Partial<Record<HeadField, string>> {
    const out: Partial<Record<HeadField, string>> = {};
    if (!body || typeof body !== 'object') return out;
    for (const key of ['code', 'title', 'parent', 'order'] as const) {
      const v = body[key];
      const msg = Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : '');
      if (msg) out[key] = String(msg);
    }
    return out;
  }

  private normalizeDigits(value: string): string {
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
  }

  private emptyForm(): { parent: number | null; code: string; title: string; order: number; is_active: boolean } {
    return { parent: null, code: '', title: '', order: 0, is_active: true };
  }
}
