import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { ReportChart } from '../../../../core/models/report.model';

Chart.register(...registerables);
Chart.defaults.font.family = "'Vazirmatn', Tahoma, system-ui, sans-serif";

/** سقف خوانایی — بیش از این تعداد گروه، نمودار ناخواناست */
const MAX_CHART_GROUPS = 50;

/** پالت ثابت از رنگ‌های Tailwind برنامه */
const PALETTE = [
  '#4f46e5', // indigo-600
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#0ea5e9', // sky-500
  '#8b5cf6', // violet-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#64748b', // slate-500
  '#d946ef', // fuchsia-500
];

/**
 * نمودار نتایج گروه‌بندی‌شده گزارش — chart.js v4 مستقیم (بدون wrapper)
 *
 * الگوی امن chart.js با تغییر داده: destroy نمونه قبلی + ساخت مجدد.
 * داده همان ردیف‌های صفحه جاری store است (هشدار صفحه‌بندی با والد).
 */
@Component({
  selector: 'app-report-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full" style="height: 320px">
      <canvas #canvas></canvas>
    </div>
    @if (truncated) {
      <p class="text-xs text-amber-700 font-medium mt-2 text-center bg-amber-50 py-1.5 px-3 rounded-xl border border-amber-200">
        جهت خوانایی، نمودار {{ maxGroups }} گروه اول را نمایش می‌دهد؛ برای جزئیات بیشتر فیلتر دقیق‌تری بگذارید.
      </p>
    }
  `,
})
export class ReportChartComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) rows: Record<string, unknown>[] = [];
  @Input({ required: true }) config!: ReportChart;
  @Input() xLabel = '';
  @Input() yLabel = '';

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  truncated = false;
  readonly maxGroups = MAX_CHART_GROUPS;

  private chart: Chart | null = null;
  private readonly nf = new Intl.NumberFormat('fa-IR');

  ngOnChanges(): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private render(): void {
    this.chart?.destroy();
    this.chart = null;
    if (!this.config?.type || !this.config.x || !this.config.y) return;

    let data = this.rows ?? [];
    this.truncated = data.length > MAX_CHART_GROUPS;
    if (this.truncated) data = data.slice(0, MAX_CHART_GROUPS);

    const labels = data.map((r) => this.labelOf(r[this.config.x]));
    const values = data.map((r) => this.numOf(r[this.config.y]));

    const type = this.config.type;
    const isPie = type === 'pie';
    const nf = this.nf;

    // نوع پویا (bar|pie|line) → config یکجا تایپ می‌شود تا union چارت‌جی‌اس خطا ندهد
    const cfg = {
      type,
      data: {
        labels,
        datasets: [
          {
            label: this.yLabel || this.config.y,
            data: values,
            backgroundColor: isPie
              ? labels.map((_, i) => PALETTE[i % PALETTE.length])
              : PALETTE[0] + 'cc',
            borderColor: isPie ? '#ffffff' : PALETTE[0],
            borderWidth: isPie ? 1 : 1.5,
            tension: 0.3, // فقط برای line
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isPie,
            position: 'bottom',
            rtl: true,
            textDirection: 'rtl',
          },
          tooltip: {
            rtl: true,
            callbacks: {
              label: (ctx) => {
                const v = typeof ctx.parsed === 'number' ? ctx.parsed : (ctx.parsed as any)?.y;
                return ` ${nf.format(Number(v ?? 0))}`;
              },
            },
          },
        },
        scales: isPie
          ? undefined
          : {
              y: {
                beginAtZero: true,
                ticks: { callback: (v) => nf.format(Number(v)) },
              },
              x: {
                ticks: { autoSkip: true, maxRotation: 60 },
              },
            },
      },
    } as ChartConfiguration;

    this.chart = new Chart(this.canvasRef.nativeElement, cfg);
  }

  private labelOf(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'بله' : 'خیر';
    return String(v);
  }

  private numOf(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
}
