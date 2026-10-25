import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { saveBlob } from '../../../core/platform/file-output';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { ToastService } from '../toast/toast.component';

export interface AttachmentItem {
  id: number;
  entity_kind: string;
  entity_id: string;
  label: string;
  order: number;
  description: string;
  original_name: string;
  size: number;
  content_type: string;
  status: string;
  uploaded_by_name?: string;
  created_at: string;
  download_url: string;
}

/**
 * پیوست‌های یک موجودیت (فهرست، آپلود، جایگزینی، حذف، دانلود).
 * دانلود و پیش‌نمایش همیشه با توکن و از راه HttpClient انجام می‌شود، نه پیوند ساده.
 */
@Component({
  selector: 'app-attachments',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  templateUrl: './attachments.component.html'
})
export class AttachmentsComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) kind!: string;
  @Input({ required: true }) entityId!: string | number;
  @Input() canEdit = false;
  @Input() label?: string;
  @Input() accept?: string;
  @Input() single = false;
  @Input() imagePreview = false;
  @Output() changed = new EventEmitter<void>();

  private api = inject(ApiService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private toast = inject(ToastService, { optional: true });
  private cdr = inject(ChangeDetectorRef);

  items: AttachmentItem[] = [];
  loading = false;
  error = '';
  busy = false;
  previews: Record<number, string> = {};
  private replaceTargetId: number | null = null;
  private loadSeq = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['kind'] || changes['entityId'] || changes['label']) {
      void this.load();
    }
  }

  ngOnDestroy(): void {
    this.revokePreviews();
  }

  get uploadLabel(): string {
    return this.single && this.items.length > 0 ? 'جایگزینی' : 'بارگذاری';
  }

  formatSize(bytes: number): string {
    const n = Number(bytes) || 0;
    if (n >= 1048576) {
      return `${(n / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`;
    }
    return `${Math.max(1, Math.round(n / 1024)).toLocaleString('fa-IR')} کیلوبایت`;
  }

  isImage(item: AttachmentItem): boolean {
    return (item.content_type || '').startsWith('image/');
  }

  async load(): Promise<void> {
    if (this.kind == null || this.entityId == null || this.entityId === '') return;
    const seq = ++this.loadSeq;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    const params: Record<string, unknown> = { kind: this.kind, id: this.entityId };
    if (this.label) params['label'] = this.label;
    try {
      const res = await firstValueFrom(this.api.get<AttachmentItem[]>('attachments', params));
      if (seq !== this.loadSeq) return;
      this.items = Array.isArray(res) ? res : [];
      this.loading = false;
      this.cdr.markForCheck();
      if (this.imagePreview) void this.loadPreviews(seq);
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.loading = false;
      this.error = this.messageOf(err, 'خطا در بارگذاری پیوست‌ها');
      this.cdr.markForCheck();
    }
  }

  private apiPath(url: string): string {
    return url.replace(/^\/?api\//, '');
  }

  private async loadPreviews(seq: number): Promise<void> {
    this.revokePreviews();
    for (const item of this.items) {
      if (!this.isImage(item)) continue;
      try {
        const blob = await firstValueFrom(this.api.download(this.apiPath(item.download_url)));
        if (seq !== this.loadSeq) return;
        this.previews[item.id] = URL.createObjectURL(blob);
        this.cdr.markForCheck();
      } catch {
        /* پیش‌نمایش اختیاری است */
      }
    }
  }

  private revokePreviews(): void {
    Object.values(this.previews).forEach((u) => URL.revokeObjectURL(u));
    this.previews = {};
  }

  private messageOf(err: unknown, fallback: string): string {
    const e = (err as { error?: { detail?: string; file?: string[] } })?.error;
    if (e?.detail) return e.detail;
    if (Array.isArray(e?.file) && e.file[0]) return e.file[0];
    return fallback;
  }

  async download(item: AttachmentItem): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const blob = await firstValueFrom(this.api.download(this.apiPath(item.download_url)));
      await saveBlob(blob, item.original_name || 'attachment');
    } catch (err) {
      this.toast?.error(this.messageOf(err, 'دانلود پیوست انجام نشد'));
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  pickFile(input: HTMLInputElement, replaceId: number | null = null): void {
    this.replaceTargetId = replaceId;
    input.value = '';
    input.click();
  }

  async onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy) return;
    const replaceId = this.replaceTargetId ?? (this.single && this.items.length > 0 ? this.items[0].id : null);
    this.replaceTargetId = null;
    const form = new FormData();
    form.append('file', file);
    this.busy = true;
    this.cdr.markForCheck();
    try {
      if (replaceId != null) {
        await firstValueFrom(this.api.upload(`attachments/${replaceId}/replace`, form));
        this.toast?.success('پیوست جایگزین شد');
      } else {
        form.append('kind', this.kind);
        form.append('id', String(this.entityId));
        if (this.label) form.append('label', this.label);
        await firstValueFrom(this.api.upload('attachments', form));
        this.toast?.success('پیوست بارگذاری شد');
      }
      this.changed.emit();
      await this.load();
    } catch (err) {
      this.toast?.error(this.messageOf(err, 'بارگذاری پیوست انجام نشد'));
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async remove(item: AttachmentItem): Promise<void> {
    if (this.busy) return;
    const ok = await this.confirmDialog?.open({
      title: 'حذف پیوست',
      message: `پیوست «${item.original_name}» حذف شود؟`,
      confirmText: 'حذف',
      type: 'danger'
    });
    if (ok !== true) return;
    this.busy = true;
    this.cdr.markForCheck();
    try {
      await firstValueFrom(this.api.delete(`attachments/${item.id}`));
      this.toast?.success('پیوست حذف شد');
      this.changed.emit();
      await this.load();
    } catch (err) {
      this.toast?.error(this.messageOf(err, 'حذف پیوست انجام نشد'));
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
