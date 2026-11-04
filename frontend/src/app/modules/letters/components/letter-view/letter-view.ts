import { Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../shared/components/command-center/command-center.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { AttachmentsComponent } from '../../../../shared/components/attachments/attachments.component';
import { PersianDatePipe } from '../../../../shared/pipes/persian-date.pipe';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { PrintPaperSize, PrintService } from '../../../../core/services/print.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import {
  LETTER_CONFIDENTIALITY_LABELS, LETTER_DOC_TYPE, LETTER_KIND_LABELS, LETTER_STATUS_LABELS, LetterAction,
  LetterDraftCopy, LetterRecipientRow, LetterRun, LetterStatus, LetterViewDetail, errorText, runsText,
} from '../../letters.models';
import { LetterLifecycleAction, LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { ReferralTreeComponent } from '../referral-tree/referral-tree';
import { ReferDialogComponent } from '../refer-dialog/refer-dialog';

export const LETTER_SEND_METHODS: { id: string; label: string }[] = [
  { id: 'in_person', label: 'حضوری' },
  { id: 'post', label: 'پست' },
  { id: 'courier', label: 'پیک' },
  { id: 'email', label: 'ایمیل دستی' },
];

const STATUS_COLOR: Record<LetterStatus, 'green' | 'blue' | 'amber' | 'rose' | 'slate' | 'indigo'> = {
  draft: 'slate', signing: 'amber', registered: 'blue', sent: 'indigo', archived: 'slate', received: 'blue', void: 'rose',
};

const SIGNER_STATUS: Record<string, string> = { pending: 'در انتظار', signed: 'امضا شد', returned: 'عودت شد', skipped: 'رد شد' };

/** کنش‌هایی که پیش از اجرا دلیل یا روش می‌خواهند (فرم کوچک زیر نوار کنش) */
type FormAction = 'return' | 'void' | 'send';

/** نمایش نامه (`/app/letters/:id`، ن۱۶): برگ نامه، امضاها، کنش‌های مجاز سرور، نسخهٔ ناهمگام و درخت ارجاع. */
@Component({
  selector: 'app-letter-view',
  standalone: true,
  imports: [
    RouterLink, ReactiveFormsModule, ActionButtonComponent, CommandCenterComponent, LoadingSkeletonComponent,
    StatusBadgeComponent, PersianDatePipe, SvgIconDirective, ReferralTreeComponent, ReferDialogComponent,
    AttachmentsComponent,
  ],
  templateUrl: './letter-view.html',
})
export class LetterViewPage implements OnInit {
  readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(LettersApiService);
  private readonly offline = inject(LettersOfflineService);
  private readonly ws = inject(WebSocketService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly printService = inject(PrintService);
  private readonly attachmentsComp = viewChild(AttachmentsComponent);
  readonly docType = LETTER_DOC_TYPE;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly actionField = viewChild<ElementRef<HTMLElement>>('actionField');

  readonly kindLabels = LETTER_KIND_LABELS;
  readonly statusLabels = LETTER_STATUS_LABELS;
  readonly confLabels = LETTER_CONFIDENTIALITY_LABELS;
  readonly sendMethods = LETTER_SEND_METHODS;
  readonly online = this.offline.online;

  readonly letter = signal<LetterViewDetail | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<'offline' | 'gone' | 'error' | null>(null);
  readonly acting = signal(false);
  readonly actionError = signal('');
  readonly paperSize = signal<PrintPaperSize>('A4');
  readonly printing = signal(false);
  readonly uploadingScan = signal(false);
  readonly scanSuccess = signal('');
  readonly formAction = signal<FormAction | null>(null);
  readonly referOpen = signal(false);
  readonly referParent = signal<number | null>(null);
  readonly treeVersion = signal(0);
  readonly viewers = signal<{ name: string; at: string; times: number }[] | null>(null);
  readonly reason = new FormControl('', { nonNullable: true });
  readonly method = new FormControl('in_person', { nonNullable: true });

  readonly actions = computed(() => new Set<LetterAction>(this.letter()?.actions || []));
  readonly statusColor = computed(() => STATUS_COLOR[this.letter()?.status || 'draft']);
  readonly toRecipients = computed(() => (this.letter()?.recipients || []).filter(r => r.role === 'to'));
  readonly ccRecipients = computed(() => (this.letter()?.recipients || []).filter(r => r.role === 'cc'));
  private id = 0;
  private loadSeq = 0;

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = Number(params.get('id')) || 0;
      if (this.id && id !== this.id) {
        // رفتن از نامه‌ای به نامهٔ دیگر: وضعیت نامهٔ پیشین را نگه ندار
        this.letter.set(null);
        this.viewers.set(null);
        this.formAction.set(null);
        this.referOpen.set(false);
        this.scanSuccess.set('');
      }
      this.id = id;
      this.load();
    });
    // زنده: فقط همین نامه؛ رویداد زبانهٔ خود را سرویس هسته کنار می‌گذارد (client_tab_id)
    this.ws.documentChanges$([LETTER_DOC_TYPE]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ev => {
      if (Number(ev.doc_id) === this.id) this.load(true);
    });
  }

  load(silent = false): void {
    if (!this.id) {
      this.loadError.set('gone');
      this.loading.set(false);
      return;
    }
    const seq = ++this.loadSeq;
    if (!silent) this.loading.set(true);
    this.api.get(this.id).subscribe({
      next: letter => {
        if (seq !== this.loadSeq) return;
        this.letter.set(letter);
        this.loadError.set(null);
        this.loading.set(false);
        this.treeVersion.update(v => v + 1);
        this.loadViewers();
      },
      error: err => {
        if (seq !== this.loadSeq) return;
        const status = err?.status ?? 0;
        // بازخوانی بی‌صدا در قطعی، نامهٔ بازشده را پاک نمی‌کند
        if (silent && this.letter() && isServerUnreachable(status)) return;
        this.loadError.set(isServerUnreachable(status) ? 'offline' : status === 404 ? 'gone' : 'error');
        this.loading.set(false);
      },
    });
  }

  /** «چه کسی دید» فقط برای نویسنده و دبیرخانه؛ سرور برای دیگران 403 می‌دهد و بخش پنهان می‌ماند. */
  private loadViewers(): void {
    this.api.viewers(this.id).subscribe({
      next: res => this.viewers.set((res.viewers || []).map(v => ({ name: v.user?.name || '—', at: v.first_viewed_at, times: v.times }))),
      // فقط 403 بخش را پنهان می‌کند؛ در قطعی یا خطای دیگر دادهٔ قبلی می‌ماند
      error: err => { if (err?.status === 403) this.viewers.set(null); },
    });
  }

  can(action: LetterAction): boolean {
    return this.actions().has(action);
  }

  runs(runs: LetterRun[]): LetterRun[] {
    return runs || [];
  }

  text(runs: LetterRun[]): string {
    return runsText(runs);
  }

  recipientName(r: LetterRecipientRow): string {
    if (r.target_type === 'user') return r.user_name || `کاربر ${r.user}`;
    if (r.target_type === 'party') return r.party_name || '—';
    if (r.target_type === 'section') return `بخش ${r.section_id}`;
    return r.name_text || '—';
  }

  signerStatus(status: string): string {
    return SIGNER_STATUS[status] || status;
  }

  edit(copy?: LetterDraftCopy): void {
    void this.router.navigate(['/app/letters', this.id, 'edit'], copy ? { queryParams: { copy: copy.id } } : {});
  }

  async sign(): Promise<void> {
    const ok = await this.confirm.open({
      title: 'امضای نامه', message: 'این نامه را امضا می‌کنید؟', type: 'info', confirmText: 'امضا', cancelText: 'انصراف',
    });
    if (ok === true) this.run('sign');
  }

  async simple(action: 'submit' | 'register' | 'archive' | 'unarchive'): Promise<void> {
    const titles = { submit: 'ارسال برای امضا', register: 'ثبت وارده', archive: 'بایگانی', unarchive: 'بازگردانی از بایگانی' };
    const ok = await this.confirm.open({
      title: titles[action], message: `«${titles[action]}» انجام شود؟`, type: 'info', confirmText: titles[action], cancelText: 'انصراف',
    });
    if (ok === true) this.run(action);
  }

  openForm(action: FormAction): void {
    this.reason.setValue('');
    this.actionError.set('');
    this.formAction.set(this.formAction() === action ? null : action);
    if (this.formAction()) {
      afterNextRender(() => this.actionField()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  /** نگاشت تراز ذخیره‌شده (right/center/justify) به تراز منطقی تا در RTL و LTR درست بماند */
  align(a: string | undefined): string | null {
    return a === 'right' ? 'start' : a === 'left' ? 'end' : a || null;
  }

  submitForm(): void {
    const action = this.formAction();
    if (!action) return;
    if (action === 'send') {
      this.run('send', { method: this.method.value });
      return;
    }
    const reason = this.reason.value.trim();
    if (!reason) {
      this.actionError.set('دلیل را بنویسید.');
      return;
    }
    this.run(action, { reason });
  }

  private run(action: LetterLifecycleAction, body: Record<string, unknown> = {}): void {
    if (!this.online() || this.acting()) return;
    this.acting.set(true);
    this.actionError.set('');
    this.api.lifecycle(this.id, action, body).subscribe({
      next: letter => {
        this.letter.set(letter);
        this.acting.set(false);
        this.formAction.set(null);
        this.treeVersion.update(v => v + 1);
      },
      error: err => {
        this.acting.set(false);
        const status = err?.status ?? 0;
        this.actionError.set(isServerUnreachable(status)
          ? 'اتصال برقرار نیست؛ کنش انجام نشد.'
          : errorText(err?.error) || 'کنش انجام نشد.');
        if (status === 409 || status === 403) this.load(true);
      },
    });
  }

  async print(): Promise<void> {
    const l = this.letter();
    if (!l || !this.online() || this.printing() || this.acting()) return;
    this.printing.set(true);
    this.actionError.set('');
    try {
      const ok = await this.printService.printPdf(this.docType, l.id, this.paperSize());
      if (!ok) {
        this.actionError.set('چاپ انجام نشد؛ دوباره تلاش کنید.');
      }
    } catch {
      this.actionError.set('چاپ انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      this.printing.set(false);
    }
  }

  onPaperSizeChange(ev: Event): void {
    const val = (ev.target as HTMLSelectElement).value;
    if (val === 'A4' || val === 'A5') {
      this.paperSize.set(val);
    }
  }

  onScanFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.id || !this.online() || this.uploadingScan()) return;
    this.uploadingScan.set(true);
    this.actionError.set('');
    this.scanSuccess.set('');
    this.api.uploadSignedScan(this.id, file, 'signed_scan').subscribe({
      next: () => {
        this.uploadingScan.set(false);
        input.value = '';
        this.scanSuccess.set('نسخهٔ امضاشده بارگذاری شد.');
        void this.attachmentsComp()?.load();
      },
      error: err => {
        this.uploadingScan.set(false);
        input.value = '';
        const data = err?.error;
        let msg = 'بارگذاری انجام نشد.';
        if (data) {
          if (typeof data.detail === 'string' && data.detail.trim()) msg = data.detail;
          else if (Array.isArray(data.file) && data.file[0]) msg = String(data.file[0]);
          else if (typeof data.file === 'string' && data.file.trim()) msg = data.file;
          else if (Array.isArray(data.label) && data.label[0]) msg = String(data.label[0]);
          else if (typeof data.label === 'string' && data.label.trim()) msg = data.label;
        }
        this.actionError.set(msg);
      },
    });
  }

  openRefer(parent: number | null = null): void {
    this.referParent.set(parent);
    this.referOpen.set(true);
  }

  onReferred(): void {
    this.referOpen.set(false);
    this.treeVersion.update(v => v + 1);
  }
}
