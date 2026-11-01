import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../../core/api/api.service';
import { saveBlob } from '../../../../../core/platform/file-output';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { PAYMENT_RECEIPT_LABEL } from '../../../payment-receipt';

export interface ReceiptItem {
  id: number;
  original_name: string;
  created_at: string;
  download_url: string;
}

@Component({
  selector: 'app-invoice-receipt-button',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative inline-block">
      <button
        type="button"
        class="inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-bold text-fg hover:bg-slate-50 min-h-[40px] min-w-[40px]"
        title="دانلود رسید پرداخت"
        aria-label="دانلود رسید پرداخت"
        [disabled]="busy"
        [attr.aria-busy]="busy"
        [attr.aria-expanded]="menuOpen"
        aria-haspopup="menu"
        (click)="onButtonClick($event)">
        <svg
          *ngIf="!busy"
          appIcon="download"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-4 h-4"
          aria-hidden="true"
        ></svg>
        <svg
          *ngIf="busy"
          appIcon="loader"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-4 h-4 animate-spin"
          aria-hidden="true"
        ></svg>
        <span class="hidden md:inline">دانلود رسید</span>
      </button>

      <div
        *ngIf="menuOpen && items.length > 1"
        role="menu"
        class="absolute start-0 top-full mt-1 rounded-xl border border-line bg-surface shadow-lg p-1 z-20 min-w-[12rem] flex flex-col gap-0.5">
        <button
          *ngFor="let item of items"
          type="button"
          role="menuitem"
          class="w-full text-start px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg hover:bg-slate-100 flex items-center justify-between gap-2"
          (click)="downloadItem(item, $event)">
          <span class="truncate">{{ item.original_name }}</span>
          <span class="text-[10px] text-fg-muted font-mono shrink-0">{{ formatDate(item.created_at) }}</span>
        </button>
      </div>
    </div>
  `,
})
export class InvoiceReceiptButtonComponent {
  @Input({ required: true }) invoiceId!: number | undefined;

  busy = false;
  items: ReceiptItem[] = [];
  menuOpen = false;

  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef);
  private readonly toast = inject(ToastService, { optional: true });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen) return;
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.menuOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.menuOpen) {
      this.menuOpen = false;
      this.cdr.markForCheck();
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fa-IR');
  }

  private apiPath(url: string): string {
    return url.replace(/^\/?api\//, '');
  }

  private messageOf(err: unknown, fallback: string): string {
    const e = (err as { error?: { detail?: string; file?: string[] } })?.error;
    if (e?.detail) return e.detail;
    if (Array.isArray(e?.file) && e.file[0]) return e.file[0];
    return fallback;
  }

  async onButtonClick(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.busy || this.invoiceId == null) return;
    if (this.menuOpen) {
      this.menuOpen = false;
      this.cdr.markForCheck();
      return;
    }

    this.busy = true;
    this.cdr.markForCheck();

    let list: ReceiptItem[] = [];
    try {
      const res = await firstValueFrom(
        this.api.get<ReceiptItem[]>('attachments', {
          kind: 'expense_invoice',
          id: this.invoiceId,
          label: PAYMENT_RECEIPT_LABEL,
        })
      );
      list = Array.isArray(res) ? res : [];
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        this.toast?.info('رسیدی برای این فاکتور ثبت نشده است');
      } else {
        this.toast?.error(this.messageOf(err, 'دریافت رسید انجام نشد'));
      }
      this.busy = false;
      this.cdr.markForCheck();
      return;
    }

    if (list.length === 0) {
      this.items = [];
      this.menuOpen = false;
      this.busy = false;
      this.cdr.markForCheck();
      this.toast?.info('رسیدی برای این فاکتور ثبت نشده است');
      return;
    }

    if (list.length === 1) {
      this.items = list;
      this.menuOpen = false;
      await this.downloadItem(list[0]);
      return;
    }

    this.items = list;
    this.menuOpen = true;
    this.busy = false;
    this.cdr.markForCheck();
  }

  async downloadItem(item: ReceiptItem, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    this.menuOpen = false;
    this.busy = true;
    this.cdr.markForCheck();

    try {
      const blob = await firstValueFrom(this.api.download(this.apiPath(item.download_url)));
      await saveBlob(blob, item.original_name || 'attachment');
    } catch (err) {
      this.toast?.error(this.messageOf(err, 'دانلود رسید انجام نشد'));
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
