import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { WorkflowTasksService } from '../../../../../../core/services/workflow-tasks.service';
import { formatToStandardShamsi } from '../../../../../../core/utils/date-utils';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { DashboardSummary } from '../../../../models/accounting-reports.model';

@Component({
  selector: 'app-manager-dashboard-hub',
  standalone: true,
  imports: [CommonModule, LoadingSkeletonComponent, ActionButtonComponent],
  templateUrl: './manager-dashboard.html',
  styleUrl: './manager-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerDashboardComponent implements OnInit {
  private readonly api = inject(PersonnelApiService);
  private readonly network = inject(NetworkStatusService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly tasks = inject(WorkflowTasksService);

  readonly offlineMessage = 'گزارش فقط با اتصال به سرور ساخته می‌شود';
  private readonly money = new Intl.NumberFormat('fa-IR');

  readonly online = signal(this.network.isOnline);
  readonly loading = signal(false);
  readonly error = signal('');
  /** آخرین نتیجه فقط در حافظهٔ صفحه می‌ماند (د۱۰)؛ در IndexedDB ذخیره نمی‌شود */
  readonly summary = signal<DashboardSummary | null>(null);
  readonly updatedAt = signal('');

  readonly rows = computed(() => this.summary()?.rows ?? []);

  ngOnInit(): void {
    this.network.state$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.online.set(this.network.isOnline));
    void this.tasks.refresh();
    this.refreshData();
  }

  refreshData(): void {
    if (!this.online()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.getAccountingReport<DashboardSummary>('dashboard-summary')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.summary.set(data);
          this.updatedAt.set(formatToStandardShamsi(new Date(), true));
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(this.errorMessage(err));
        },
      });
  }

  private errorMessage(err: HttpErrorResponse): string {
    if (isServerUnreachable(err.status)) return 'ارتباط با سرور برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.';
    if (err.status === 403) return 'دسترسی به این گزارش ندارید';
    if (err.status === 404) return 'بخش یا شرکت انتخاب‌شده در دامنهٔ شما نیست';
    if (err.status === 400) return String(err.error?.error || 'پارامترهای گزارش نامعتبر است.');
    return 'خلاصهٔ داشبورد دریافت نشد. دوباره تلاش کنید.';
  }

  fmt(value: number | null | undefined): string {
    return this.money.format(Number(value ?? 0));
  }

  goToMyTasks(): void {
    void this.router.navigate(['/app/my-tasks']);
  }

  goToReports(): void {
    void this.router.navigate(['/app/finance/manager-reports']);
  }
}
