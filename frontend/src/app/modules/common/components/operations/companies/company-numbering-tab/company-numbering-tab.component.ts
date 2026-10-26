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
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';

export interface NumberingSeries {
  key: string;
  title_fa: string;
  template: string;
  prefix: string;
  seq_padding: number;
  start_number: number;
  default_template: string;
  period_key: string;
  next_preview: string;
  last_seq: number;
  can_edit: boolean;
}

export interface IssuedNumber {
  id: number;
  series_key: string;
  display: string;
  period_key: string;
  seq: number;
  entity_kind: string;
  entity_id: string | number | null;
  status: 'active' | 'void';
  issued_at: string;
  issued_by: string | null;
  void_reason: string;
  voided_at: string | null;
  voided_by: string | null;
}

interface IssuedPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: IssuedNumber[];
}

interface SeriesCard extends NumberingSeries {
  editing: boolean;
  saving: boolean;
  error: string;
  draft: { template: string; prefix: string; seq_padding: string | number; start_number: string | number };
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const OFFLINE_MESSAGE = 'برای شماره‌گذاری اسناد باید به اینترنت وصل باشید.';
const PAGE_SIZE = 50;

/** تب «شماره‌گذاری اسناد»: تنظیم قالب سری‌های شماره و دفتر شماره‌های صادرشده (فقط نمایش؛ صدور شماره فقط با سرور است) */
@Component({
  selector: 'app-company-numbering-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, PersianDatePipe],
  templateUrl: './company-numbering-tab.component.html'
})
export class CompanyNumberingTabComponent implements OnInit, OnChanges {
  @Input({ required: true }) companyId!: number;

  private api = inject(ApiService);
  private toast = inject(ToastService, { optional: true });
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  error = '';
  cards: SeriesCard[] = [];
  private loadSeq = 0;

  ledgerLoading = false;
  ledgerError = '';
  ledger: IssuedNumber[] = [];
  ledgerCount = 0;
  ledgerPage = 1;
  hasNext = false;
  hasPrevious = false;
  filterSeries = '';
  filterStatus: '' | 'active' | 'void' = '';
  private ledgerSeq = 0;

  ngOnInit(): void {
    if (this.companyId) void this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] && !changes['companyId'].firstChange) void this.load();
  }

  /** ارقام لاتین را فارسی می‌کند (فقط برای نمایش) */
  fa(value: string | number | null | undefined): string {
    return String(value ?? '').replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
  }

  private latin(value: string | number | null | undefined): string {
    return String(value ?? '').trim().replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  }

  private get offline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  private detailOf(err: unknown, fallback: string): string {
    if (this.offline) return OFFLINE_MESSAGE;
    const detail = (err as { error?: { detail?: string } })?.error?.detail;
    return detail || fallback;
  }

  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    if (this.offline) {
      this.loading = false;
      this.error = OFFLINE_MESSAGE;
      this.cdr.markForCheck();
      return;
    }
    try {
      const res = await firstValueFrom(
        this.api.get<{ company_id: number; results: NumberingSeries[] }>(`numbering/${this.companyId}/series`)
      );
      if (seq !== this.loadSeq) return;
      this.cards = (res?.results ?? []).map((s) => this.toCard(s));
      this.loading = false;
      this.cdr.markForCheck();
      if (this.cards.length > 0) await this.loadLedger(1);
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.loading = false;
      this.error = this.detailOf(err, 'خطا در بارگذاری سری‌های شماره‌گذاری');
      this.cdr.markForCheck();
    }
  }

  private toCard(s: NumberingSeries): SeriesCard {
    return {
      ...s,
      editing: false,
      saving: false,
      error: '',
      draft: { template: s.template, prefix: s.prefix, seq_padding: s.seq_padding, start_number: s.start_number }
    };
  }

  startEdit(card: SeriesCard): void {
    if (!card.can_edit) return;
    card.draft = {
      template: card.template, prefix: card.prefix, seq_padding: card.seq_padding, start_number: card.start_number
    };
    card.error = '';
    card.editing = true;
    this.cdr.markForCheck();
  }

  cancelEdit(card: SeriesCard): void {
    card.editing = false;
    card.error = '';
    this.cdr.markForCheck();
  }

  /**
   * پیش‌نمایش محلی (فقط نمایشی، کپی format_display سرور). صادرکنندهٔ شماره فقط سرور است
   * و هیچ شماره‌ای در فرانت ساخته یا رزرو نمی‌شود.
   */
  preview(card: SeriesCard): string {
    const padding = Math.max(0, Math.min(12, Number(this.latin(card.draft.seq_padding)) || 0));
    const start = Number(this.latin(card.draft.start_number)) || 1;
    const seq = String(Math.max(card.last_seq + 1, start)).padStart(padding, '0');
    return this.fa(
      String(card.draft.template ?? '')
        .split('{period}').join(card.period_key)
        .split('{prefix}').join(String(card.draft.prefix ?? ''))
        .split('{seq}').join(seq)
    );
  }

  /** اعتبارسنجی هم‌قاعده با سرور؛ پیام فارسی یا رشتهٔ خالی */
  validate(card: SeriesCard): string {
    const d = card.draft;
    const template = String(d.template ?? '');
    if (!template.includes('{seq}') || !template.includes('{period}')) {
      return 'قالب باید هم {seq} و هم {period} را داشته باشد.';
    }
    if (template.length > 100) return 'قالب نباید بیشتر از ۱۰۰ نویسه باشد.';
    if (String(d.prefix ?? '').length > 20) return 'پیشوند نباید بیشتر از ۲۰ نویسه باشد.';
    const padding = Number(this.latin(d.seq_padding));
    if (this.latin(d.seq_padding) === '' || !Number.isInteger(padding) || padding < 0 || padding > 12) {
      return 'تعداد ارقام شماره باید عددی صحیح بین ۰ تا ۱۲ باشد.';
    }
    const start = Number(this.latin(d.start_number));
    if (this.latin(d.start_number) === '' || !Number.isInteger(start) || start < 1) {
      return 'شمارهٔ شروع باید عددی صحیح و حداقل ۱ باشد.';
    }
    return '';
  }

  async save(card: SeriesCard): Promise<void> {
    if (!card.can_edit || card.saving) return;
    const invalid = this.validate(card);
    if (invalid) {
      card.error = invalid;
      this.cdr.markForCheck();
      return;
    }
    if (this.offline) {
      card.error = OFFLINE_MESSAGE;
      this.cdr.markForCheck();
      return;
    }
    card.error = '';
    card.saving = true;
    this.cdr.markForCheck();
    try {
      const updated = await firstValueFrom(
        this.api.patch<NumberingSeries>(`numbering/${this.companyId}/series/${card.key}`, {
          template: card.draft.template,
          prefix: card.draft.prefix,
          seq_padding: Number(this.latin(card.draft.seq_padding)),
          start_number: Number(this.latin(card.draft.start_number))
        })
      );
      Object.assign(card, this.toCard(updated));
      this.toast?.success('تنظیمات شماره‌گذاری ذخیره شد');
    } catch (err) {
      card.error = this.detailOf(err, 'ذخیرهٔ تنظیمات شماره‌گذاری انجام نشد');
    } finally {
      card.saving = false;
      this.cdr.markForCheck();
    }
  }

  seriesTitle(key: string): string {
    return this.cards.find((c) => c.key === key)?.title_fa || key;
  }

  async onFilterChange(): Promise<void> {
    await this.loadLedger(1);
  }

  async loadLedger(page: number): Promise<void> {
    const seq = ++this.ledgerSeq;
    this.ledgerLoading = true;
    this.ledgerError = '';
    this.cdr.markForCheck();
    if (this.offline) {
      this.ledgerLoading = false;
      this.ledgerError = OFFLINE_MESSAGE;
      this.cdr.markForCheck();
      return;
    }
    const params: Record<string, unknown> = { page };
    if (this.filterSeries) params['series'] = this.filterSeries;
    if (this.filterStatus) params['status'] = this.filterStatus;
    try {
      const res = await firstValueFrom(this.api.get<IssuedPage>(`numbering/${this.companyId}/issued`, params));
      if (seq !== this.ledgerSeq) return;
      this.ledger = res?.results ?? [];
      this.ledgerCount = res?.count ?? this.ledger.length;
      this.ledgerPage = page;
      this.hasNext = !!res?.next;
      this.hasPrevious = !!res?.previous;
    } catch (err) {
      if (seq !== this.ledgerSeq) return;
      this.ledgerError = this.detailOf(err, 'خطا در بارگذاری دفتر شماره‌ها');
    }
    this.ledgerLoading = false;
    this.cdr.markForCheck();
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.ledgerCount / PAGE_SIZE));
  }
}
