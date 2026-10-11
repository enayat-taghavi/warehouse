import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { ReportApiService } from '../../core/api/report-api.service';
import { ReportExportJob } from '../../core/models/report.model';
import { ToastService } from '../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../shared/components/action-button/action-button.component';

/**
 * نوار پیشرفت خروجی Excel بزرگ — poll هر ۲ ثانیه از /exports/<id>/
 * در پایان دکمه دانلود نشان می‌دهد (streaming از سرور).
 */
@Component({
  selector: 'app-export-progress',
  standalone: true,
  imports: [CommonModule, SvgIconDirective, ActionButtonComponent],
  template: `
    <div class="bg-white rounded-xl border border-slate-200 p-3 space-y-2 shadow-sm">
      <div class="flex items-center justify-between gap-2">
        <div class="text-xs font-bold text-slate-800">
          خروجی Excel ({{ job?.total_rows ?? totalRows }} ردیف)
        </div>
        <button
          type="button"
          appAction="cancel"
          display="icon"
          tone="slate"
          [label]="'بستن'"
          (click)="close.emit()"
          class="min-w-[40px] min-h-[40px] sm:min-w-[32px] sm:min-h-[32px]"
        ></button>
      </div>

      @if (job?.status === 'failed') {
        <div class="text-xs text-rose-600 font-bold">{{ job?.error_message || 'تولید فایل ناموفق بود.' }}</div>
      } @else if (job?.status === 'done') {
        <div class="flex items-center gap-2">
          <span class="text-xs text-emerald-600 font-bold">فایل آماده است ✓</span>
          <button
            type="button"
            appAction="download"
            size="sm"
            display="label"
            tone="emerald"
            [label]="'دانلود فایل'"
            [busy]="downloading"
            [disabled]="downloading"
            (click)="download()"
          ></button>
        </div>
      } @else {
        <div class="w-full bg-slate-50 rounded-full h-2 overflow-hidden">
          <div class="bg-indigo-500 h-2 rounded-full transition-all duration-500"
               [style.width.%]="job?.progress ?? 0"></div>
        </div>
        <div class="text-[10px] text-slate-500">
          در حال تولید فایل در سرور… {{ job?.progress ?? 0 }}٪
        </div>
      }
    </div>
  `,
})
export class ExportProgressComponent implements OnInit, OnChanges, OnDestroy {
  private api = inject(ReportApiService);
  private toast = inject(ToastService);

  @Input({ required: true }) jobId!: number;
  @Input() totalRows = 0;
  @Input() fileName = 'report.xlsx';
  @Output() close = new EventEmitter<void>();

  job: ReportExportJob | null = null;
  downloading = false;
  private sub: Subscription | null = null;
  private consecutiveErrors = 0;
  private pollCount = 0;
  private readonly MAX_POLL_COUNT = 300; // سقف ۱۰ دقیقه بررسی وضعیت (۳۰۰ × ۲ ثانیه)

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobId'] && !changes['jobId'].firstChange) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    this.stopPolling();
    this.job = null;
    this.downloading = false;
    this.consecutiveErrors = 0;
    this.pollCount = 0;
    this.poll();
    this.sub = interval(2000).subscribe(() => {
      if (this.job?.status === 'done' || this.job?.status === 'failed') {
        this.stopPolling();
        return;
      }
      this.poll();
    });
  }

  private stopPolling(): void {
    this.sub?.unsubscribe();
    this.sub = null;
  }

  private poll(): void {
    this.pollCount++;
    if (this.pollCount > this.MAX_POLL_COUNT) {
      this.stopPolling();
      if (!this.job || (this.job.status !== 'done' && this.job.status !== 'failed')) {
        this.job = {
          id: this.jobId,
          status: 'failed',
          error_message: 'زمان انتظار برای ایجاد فایل به پایان رسید (بیش از ۱۰ دقیقه). لطفاً مجدداً خروجی بگیرید.',
          progress: this.job?.progress ?? 0,
          report_name: this.job?.report_name ?? '',
          created_at: this.job?.created_at ?? '',
          total_rows: this.job?.total_rows ?? this.totalRows,
        } as any;
      }
      return;
    }

    this.api.getExportJob(this.jobId).subscribe({
      next: (j) => {
        this.consecutiveErrors = 0;
        this.job = j;
        if (j.status === 'done' || j.status === 'failed') {
          this.stopPolling();
        }
      },
      error: (err) => {
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= 3 || err?.status === 404) {
          this.stopPolling();
          if (!this.job) {
            this.job = {
              id: this.jobId,
              status: 'failed',
              error_message: 'ارتباط با سرور برای دریافت وضعیت خروجی قطع شد.',
              progress: 0,
              report_name: '',
              created_at: '',
              total_rows: this.totalRows,
            } as any;
          }
        }
      },
    });
  }

  download(): void {
    if (this.downloading) return; // جلوگیری از کلیک چندباره (#14)
    this.downloading = true;
    this.api.downloadExportFile(this.jobId).subscribe({
      next: (blob) => {
        this.downloading = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.downloading = false;
        this.toast.error('دانلود فایل ناموفق بود — فایل ممکن است منقضی شده باشد. دوباره خروجی بگیرید.');
      },
    });
  }
}
