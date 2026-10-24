import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { WorkflowTasksService } from '../../../core/services/workflow-tasks.service';
import { WorkflowHistory, WorkflowHistoryInstance, WorkflowHistoryStep } from '../../../core/models/workflow.model';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

@Component({
  selector: 'app-workflow-history',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    <div class="workflow-history-container flex flex-col gap-3" dir="rtl">
      <!-- حالت در حال بارگذاری -->
      <div *ngIf="loading" class="flex items-center justify-center py-8 text-slate-400 gap-2 text-xs font-semibold">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="refresh-cw" class="animate-spin text-indigo-500"></svg>
        <span>در حال بارگذاری سابقهٔ گردش کار...</span>
      </div>

      <!-- حالت خطای ۴۰۴ یا نبود سابقه -->
      <div
        *ngIf="!loading && notFound"
        class="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center text-xs font-bold text-slate-500 flex flex-col items-center gap-2"
      >
        <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="file-text"></svg>
        </div>
        <span>سابقه‌ای برای این سند ثبت نشده است</span>
      </div>

      <!-- حالت خطای غیر ۴۰۴ با دکمه تلاش مجدد -->
      <div
        *ngIf="!loading && hasError && !notFound"
        class="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 text-center text-xs flex flex-col items-center gap-2"
      >
        <span class="font-bold text-rose-700">{{ errorMessage || 'خطا در دریافت سابقهٔ گردش کار' }}</span>
        <button
          type="button"
          (click)="loadHistory()"
          class="px-3 py-1.5 min-h-[40px] text-xs font-bold text-rose-700 bg-white border border-rose-200 rounded-xl hover:bg-rose-100/50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          title="تلاش مجدد"
          aria-label="تلاش مجدد"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="refresh-cw"></svg>
          <span>تلاش مجدد</span>
        </button>
      </div>

      <!-- نمایش موارد سابقه -->
      <div *ngIf="!loading && !hasError && history && history.instances.length > 0" class="flex flex-col gap-4">
        <div
          *ngFor="let instance of history.instances"
          class="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col gap-3"
        >
          <!-- سربرگ هر نمونه گردش -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-black text-slate-800">{{ instance.workflow_title_fa }}</span>
              <span
                class="text-[10px] font-bold px-2 py-0.5 rounded-md"
                [ngClass]="statusBadgeClass(instance.status)"
              >
                {{ instance.status_fa }}
              </span>
              <span *ngIf="instance.current_step_title_fa" class="text-[11px] font-medium text-slate-500">
                مرحلهٔ جاری: <strong class="text-slate-700 font-bold">{{ instance.current_step_title_fa }}</strong>
              </span>
            </div>

            <div class="flex items-center gap-2 self-end sm:self-auto">
              <div class="text-[11px] text-slate-400">
                <span *ngIf="instance.created_by">ثبت: {{ instance.created_by.name }} • </span>
                <span>{{ instance.submitted_at_shamsi }}</span>
              </div>
              <!-- دکمه لغو تنها زمانی که can_cancel فعال است -->
              <button
                *ngIf="instance.can_cancel"
                type="button"
                (click)="onCancelInstance(instance.instance_id)"
                class="px-2.5 py-1 min-h-[40px] text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                title="لغو گردش کار"
                aria-label="لغو گردش کار"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
                <span>لغو</span>
              </button>
            </div>
          </div>

          <!-- خط زمان عمودی مراحل (Vertical Timeline) -->
          <div class="relative pr-4 mr-1 border-r-2 border-indigo-100 flex flex-col gap-3.5 my-1">
            <div *ngFor="let step of instance.steps" class="relative flex flex-col gap-1 text-xs">
              <!-- نقطه اتصال خط زمان -->
              <div class="absolute -right-[23px] top-1 w-3 h-3 rounded-full bg-white border-2 border-indigo-500 shadow-sm"></div>

              <!-- ردیف اقدام‌کننده و عمل -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-black text-slate-800">{{ step.actor_name }}</span>
                <span *ngIf="step.on_behalf_of" class="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200/60">
                  به جانشینی از {{ step.on_behalf_of.name }}
                </span>
                <span *ngIf="step.as_superuser" class="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200/60">
                  (مدیر کل سامانه)
                </span>
                <span class="font-bold text-indigo-600 bg-indigo-50/80 px-2 py-0.5 rounded-md text-[11px]">
                  {{ step.action_fa }}
                </span>
                <span class="text-[11px] text-slate-400 font-medium mr-auto">
                  {{ step.at_shamsi }}
                </span>
              </div>

              <!-- از مرحله به مرحله -->
              <div *ngIf="step.from_step_title_fa || step.to_step_title_fa" class="text-[11px] text-slate-500">
                <span *ngIf="step.from_step_title_fa">از «{{ step.from_step_title_fa }}» </span>
                <span *ngIf="step.to_step_title_fa">به «{{ step.to_step_title_fa }}»</span>
              </div>

              <!-- دلیل اقدام -->
              <div *ngIf="step.reason" class="text-[11px] text-slate-700 bg-slate-50 border border-slate-200/70 p-2 rounded-xl mt-0.5">
                <span class="font-bold text-slate-500">دلیل: </span>
                <span>{{ step.reason }}</span>
              </div>

              <!-- مراحل ردشده (skipped) -->
              <div *ngIf="step.skipped && step.skipped.length > 0" class="flex flex-col gap-1 mt-1">
                <div
                  *ngFor="let s of step.skipped"
                  class="text-[11px] font-medium text-amber-800 bg-amber-50/90 border border-amber-200/70 px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="alert-triangle" class="shrink-0 text-amber-600"></svg>
                  <span>مرحلهٔ ردشده: {{ s.step_title_fa }} — {{ s.reason_fa }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class WorkflowHistoryComponent implements OnInit, OnChanges, OnDestroy {
  @Input() kind = '';
  @Input() entityId = 0;

  @Output() cancelRequested = new EventEmitter<number>();

  private readonly api = inject(WorkflowApiService);
  private readonly tasksService = inject(WorkflowTasksService, { optional: true });

  history: WorkflowHistory | null = null;
  loading = false;
  notFound = false;
  hasError = false;
  errorMessage = '';

  private eventSub?: Subscription;

  ngOnInit(): void {
    if (this.tasksService) {
      this.eventSub = this.tasksService.events$.subscribe((event) => {
        if (event.entity_kind === this.kind && event.entity_id === this.entityId) {
          this.loadHistory();
        }
      });
    }
    this.loadHistory();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['kind'] && !changes['kind'].firstChange) || (changes['entityId'] && !changes['entityId'].firstChange)) {
      this.loadHistory();
    }
  }

  ngOnDestroy(): void {
    this.eventSub?.unsubscribe();
  }

  loadHistory(): void {
    if (!this.kind || !this.entityId) {
      this.history = null;
      this.loading = false;
      this.notFound = false;
      this.hasError = false;
      return;
    }

    this.loading = true;
    this.notFound = false;
    this.hasError = false;
    this.errorMessage = '';

    this.api.getHistory(this.kind, this.entityId).subscribe({
      next: (res) => {
        this.loading = false;
        this.history = res;
        this.notFound = !res || !res.instances || res.instances.length === 0;
      },
      error: (err) => {
        this.loading = false;
        if (err?.status === 404) {
          this.notFound = true;
          this.history = null;
        } else {
          this.hasError = true;
          this.errorMessage = err?.error?.detail || err?.message || 'خطا در بارگذاری سابقه';
        }
      }
    });
  }

  onCancelInstance(instanceId: number): void {
    this.cancelRequested.emit(instanceId);
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'approved':
      case 'done':
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200/80';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border border-rose-200/80';
      case 'cancelled':
        return 'bg-slate-100 text-slate-600 border border-slate-200/80';
      case 'returned':
        return 'bg-amber-50 text-amber-700 border border-amber-200/80';
      default:
        return 'bg-indigo-50 text-indigo-700 border border-indigo-200/80';
    }
  }
}
