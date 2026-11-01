import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../../core/api/api.service';
import { saveBlob } from '../../../../../core/platform/file-output';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ActionDisplay } from '../../../../../shared/components/action-button/action-catalog';
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
  imports: [CommonModule, ActionButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative inline-block">
      <button
        #trigger
        type="button"
        appAction="download"
        label="دانلود رسید"
        hint="دانلود رسید پرداخت"
        size="sm"
        [display]="display"
        [busy]="busy"
        [attr.aria-expanded]="items.length > 1 ? menuOpen : null"
        [attr.aria-haspopup]="items.length > 1 ? 'menu' : null"
        (click)="onButtonClick($event)"></button>

      <div
        *ngIf="menuOpen && items.length > 1"
        role="menu"
        aria-label="رسیدهای پرداخت"
        class="fixed rounded-xl border border-line bg-surface shadow-lg p-1 z-50 min-w-[12rem] max-w-[calc(100vw-2rem)] flex flex-col gap-0.5"
        [style.top.px]="menuTop"
        [style.bottom.px]="menuBottom"
        [style.right.px]="menuRight"
        (keydown)="onMenuKeydown($event)">
        <button
          *ngFor="let item of items"
          type="button"
          role="menuitem"
          class="w-full text-start px-2.5 py-1.5 rounded-lg text-xs font-medium text-fg hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none flex items-center justify-between gap-2"
          (click)="downloadItem(item, $event)">
          <span class="truncate min-w-0"><bdi>{{ item.original_name }}</bdi></span>
          <span class="text-[10px] text-fg-muted font-mono shrink-0">{{ formatDate(item.created_at) }}</span>
        </button>
      </div>
    </div>
  `,
})
export class InvoiceReceiptButtonComponent implements OnDestroy {
  @Input({ required: true }) invoiceId!: number | undefined;
  /** same display as the neighbouring row buttons (e.g. icon in the mobile card) */
  @Input() display: ActionDisplay = 'auto';

  busy = false;
  items: ReceiptItem[] = [];
  menuOpen = false;
  menuTop: number | null = null;
  menuBottom: number | null = null;
  menuRight: number | null = null;

  @ViewChild('trigger', { read: ElementRef }) private trigger?: ElementRef<HTMLButtonElement>;

  private readonly closeOnViewportChange = (): void => this.closeMenu(false);

  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef);
  private readonly toast = inject(ToastService, { optional: true });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen) return;
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.closeMenu(false);
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (this.menuOpen) this.closeMenu(true);
  }

  ngOnDestroy(): void {
    this.removeViewportListeners();
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems();
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (idx + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    items[next].focus();
  }

  private menuItems(): HTMLButtonElement[] {
    return Array.from(
      (this.elementRef.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    );
  }

  private openMenu(): void {
    // Fixed position so table wrappers with overflow-x-auto do not clip the menu.
    const rect = this.trigger?.nativeElement.getBoundingClientRect();
    if (rect) {
      const estHeight = this.items.length * 36 + 12;
      this.menuRight = Math.max(8, window.innerWidth - rect.right);
      if (rect.bottom + 4 + estHeight > window.innerHeight && rect.top > estHeight) {
        this.menuTop = null;
        this.menuBottom = window.innerHeight - rect.top + 4;
      } else {
        this.menuTop = rect.bottom + 4;
        this.menuBottom = null;
      }
    }
    this.menuOpen = true;
    window.addEventListener('scroll', this.closeOnViewportChange, true);
    window.addEventListener('resize', this.closeOnViewportChange);
    this.cdr.detectChanges();
    this.menuItems()[0]?.focus();
  }

  private closeMenu(returnFocus: boolean): void {
    this.menuOpen = false;
    this.removeViewportListeners();
    this.cdr.markForCheck();
    if (returnFocus) this.trigger?.nativeElement.focus();
  }

  private removeViewportListeners(): void {
    window.removeEventListener('scroll', this.closeOnViewportChange, true);
    window.removeEventListener('resize', this.closeOnViewportChange);
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
      this.closeMenu(true);
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
    this.busy = false;
    this.openMenu();
  }

  async downloadItem(item: ReceiptItem, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    const fromMenu = this.menuOpen;
    if (fromMenu) this.closeMenu(true);
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
