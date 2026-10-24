import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { WorkflowTasksService } from '../../../../core/services/workflow-tasks.service';
import { WorkflowApiService } from '../../../../core/api/workflow-api.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import {
  WorkflowTaskAction,
  WorkflowTaskCard,
  WorkflowTaskNotice
} from '../../../../core/models/workflow.model';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { WorkflowReasonDialogComponent } from '../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';

// برچسب فارسی کلیدهای عمومی خلاصهٔ کارت (قرارداد summary در workflow/registry.py)
const SUMMARY_LABELS: Record<string, string> = {
  category: 'دسته',
  date_shamsi: 'تاریخ',
  description: 'شرح',
  item_count: 'تعداد اقلام',
};
const SUMMARY_HIDDEN_KEYS = new Set(['title', 'amount']);

function formatPersianDigits(n: number | string): string {
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/\d/g, (w) => faDigits[+w]);
}

function formatAmount(amount: string | number | null | undefined): string {
  if (amount == null || amount === '') return '';
  const num = Number(amount);
  if (isNaN(num)) return `${formatPersianDigits(amount)} ریال`;
  const formatted = num.toLocaleString('en-US');
  return `${formatPersianDigits(formatted)} ریال`;
}

function formatWaitingTime(hours: number): string {
  if (hours < 24) {
    return `${formatPersianDigits(hours)} ساعت`;
  }
  const days = Math.floor(hours / 24);
  return `${formatPersianDigits(days)} روز`;
}

@Component({
  selector: 'app-my-tasks',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TabBarComponent,
    SvgIconDirective,
    WorkflowReasonDialogComponent
  ],
  templateUrl: './my-tasks.html'
})
export class MyTasksComponent implements OnInit, OnDestroy {
  public readonly workflowTasks = inject(WorkflowTasksService);
  private readonly workflowApi = inject(WorkflowApiService);
  public readonly permissions = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });

  activeTab = 'my-tasks';
  selectedCompany = '';
  selectedWorkflow = '';

  // کارهای بی‌دریافت‌کننده (فقط مدیر کل)
  unassignedTasks: WorkflowTaskCard[] = [];
  unassignedLoading = false;
  unassignedError = '';

  // پنجره ثبت دلیل
  reasonDialogOpen = false;
  reasonDialogTitle = '';
  reasonDialogConfirmLabel = '';
  reasonDialogAction: WorkflowTaskAction | null = null;
  targetCard: WorkflowTaskCard | null = null;
  reasonServerError = '';

  private sub?: Subscription;

  readonly isSuperuser = computed(() => this.permissions.isSuperuser());

  // تب‌ها با کش کلیدی برای جلوگیری از NG0100
  private tabsKey = '';
  private tabsCache: TabDef[] = [];
  get tabs(): TabDef[] {
    const isSuper = this.isSuperuser();
    const myCount = this.workflowTasks.count();
    const unassignedCount = this.unassignedTasks.length;
    const key = `${isSuper}:${myCount}:${unassignedCount}`;

    if (key !== this.tabsKey) {
      this.tabsKey = key;
      const list: TabDef[] = [
        {
          id: 'my-tasks',
          label: 'کارهای من',
          shortLabel: 'من',
          icon: 'clipboard-check',
          count: myCount
        }
      ];
      if (isSuper) {
        list.push({
          id: 'unassigned',
          label: 'کارهای بی‌دریافت‌کننده',
          shortLabel: 'بیگیرنده',
          icon: 'users',
          count: unassignedCount
        });
      }
      this.tabsCache = list;
    }
    return this.tabsCache;
  }

  // فهرست‌های فیلتر فقط وقتی آرایهٔ کارت‌ها عوض شود از نو ساخته می‌شوند: آرایهٔ تازه در هر دور، گزینه‌های
  // ngFor را دوباره می‌سازد و حلقهٔ بی‌پایان تشخیص تغییر (NG0103) می‌دهد.
  private filterSource: readonly WorkflowTaskCard[] | null = null;
  private companiesCache: { id: string; name: string }[] = [];
  private workflowsCache: { key: string; title: string }[] = [];

  private refreshFilterLists(): void {
    const cards = this.activeTab === 'unassigned' ? this.unassignedTasks : this.workflowTasks.tasks();
    if (cards === this.filterSource) return;
    this.filterSource = cards;
    const companies = new Map<string, string>();
    const workflows = new Map<string, string>();
    for (const c of cards) {
      if (c.company) companies.set(String(c.company.id), c.company.name);
      if (c.workflow_key && c.workflow_title_fa) workflows.set(c.workflow_key, c.workflow_title_fa);
    }
    this.companiesCache = Array.from(companies.entries()).map(([id, name]) => ({ id, name }));
    this.workflowsCache = Array.from(workflows.entries()).map(([key, title]) => ({ key, title }));
  }

  // فهرست شرکت‌های موجود در کارت‌ها برای فیلتر کلاینت
  get availableCompanies(): { id: string; name: string }[] {
    this.refreshFilterLists();
    return this.companiesCache;
  }

  // فهرست گردش‌های موجود برای فیلتر کلاینت
  get availableWorkflows(): { key: string; title: string }[] {
    this.refreshFilterLists();
    return this.workflowsCache;
  }

  // کارت‌های فیلترشده
  get filteredCards(): WorkflowTaskCard[] {
    const cards = this.activeTab === 'unassigned' ? this.unassignedTasks : this.workflowTasks.tasks();
    return cards.filter((card) => {
      if (this.selectedCompany && (!card.company || String(card.company.id) !== this.selectedCompany)) {
        return false;
      }
      if (this.selectedWorkflow && card.workflow_key !== this.selectedWorkflow) {
        return false;
      }
      return true;
    });
  }

  get showOffline(): boolean {
    return !this.workflowTasks.loaded() && !this.workflowTasks.loading() && this.workflowTasks.isStale() && this.workflowTasks.tasks().length === 0;
  }

  get showLoading(): boolean {
    if (this.activeTab === 'unassigned') {
      return this.unassignedLoading && this.unassignedTasks.length === 0;
    }
    return this.workflowTasks.loading() && !this.workflowTasks.loaded();
  }

  get showEmpty(): boolean {
    if (this.showLoading) return false;
    if (this.activeTab === 'unassigned') {
      return !this.unassignedError && this.filteredCards.length === 0;
    }
    return this.workflowTasks.loaded() && this.filteredCards.length === 0;
  }

  get staleBannerText(): string {
    const cachedAt = this.workflowTasks.cachedAt();
    if (!cachedAt) return 'نمایش از حافظهٔ دستگاه';
    const d = new Date(cachedAt);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `نمایش از حافظهٔ دستگاه؛ آخرین به‌روزرسانی در ساعت ${formatPersianDigits(timeStr)}`;
  }

  ngOnInit(): void {
    this.workflowTasks.start();

    this.sub = this.route.queryParams.subscribe((params) => {
      const tabParam = params['tab'];
      if (tabParam === 'unassigned' && this.isSuperuser()) {
        this.activeTab = 'unassigned';
      } else {
        this.activeTab = 'my-tasks';
      }

      this.selectedCompany = params['company'] || '';
      this.selectedWorkflow = params['workflow'] || '';

      if (this.activeTab === 'unassigned') {
        this.loadUnassigned();
      }
      this.cdr?.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onTabChange(tabId: string): void {
    this.activeTab = tabId;
    this.updateQueryParams();
    if (this.activeTab === 'unassigned') {
      this.loadUnassigned();
    }
  }

  onFilterChange(): void {
    this.updateQueryParams();
  }

  private updateQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeTab !== 'my-tasks' ? this.activeTab : null,
        company: this.selectedCompany || null,
        workflow: this.selectedWorkflow || null
      },
      queryParamsHandling: 'merge'
    });
  }

  refresh(): void {
    if (this.activeTab === 'unassigned') {
      this.loadUnassigned();
    } else {
      void this.workflowTasks.refresh();
    }
  }

  loadUnassigned(): void {
    if (!this.isSuperuser()) return;
    this.unassignedLoading = true;
    this.unassignedError = '';

    this.workflowApi.getUnassignedTasks().subscribe({
      next: (page) => {
        this.unassignedTasks = page?.results || [];
        this.unassignedLoading = false;
        this.cdr?.markForCheck();
      },
      error: (err) => {
        this.unassignedLoading = false;
        this.unassignedError = err?.error?.detail || err?.message || 'خطا در بارگذاری کارهای بی‌دریافت‌کننده';
        this.cdr?.markForCheck();
      }
    });
  }

  isPending(card: WorkflowTaskCard): boolean {
    return this.workflowTasks.pendingTaskIds().has(card.task_id);
  }

  dismissNotice(notice: WorkflowTaskNotice): void {
    this.workflowTasks.dismissNotice(notice.task_id);
  }

  goBack(): void {
    this.router.navigateByUrl('/app/launcher');
  }

  openDocument(card: WorkflowTaskCard): void {
    if (card.route) {
      void this.router.navigateByUrl(card.route);
    }
  }

  getActionLabel(action: WorkflowTaskAction, stepKind: string): string {
    if (action === 'act') {
      if (stepKind === 'approve') return 'تأیید';
      if (stepKind === 'review') return 'بررسی';
      if (stepKind === 'execute') return 'اجرا';
      return 'تأیید';
    }
    if (action === 'return') return 'عودت برای اصلاح';
    if (action === 'reject') return 'رد قطعی';
    return action;
  }

  getActionButtonClass(action: WorkflowTaskAction): string {
    if (action === 'act') {
      return 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm';
    }
    if (action === 'return') {
      return 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200';
    }
    if (action === 'reject') {
      return 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200';
    }
    return 'bg-indigo-600 hover:bg-indigo-700 text-white';
  }

  onActionClick(card: WorkflowTaskCard, action: WorkflowTaskAction): void {
    if (this.isPending(card)) return;

    if (action === 'act') {
      void this.executeAct(card, 'act');
    } else {
      this.targetCard = card;
      this.reasonDialogAction = action;
      this.reasonServerError = '';
      if (action === 'return') {
        this.reasonDialogTitle = `عودت برای اصلاح: ${card.workflow_title_fa}`;
        this.reasonDialogConfirmLabel = 'عودت برای اصلاح';
      } else {
        this.reasonDialogTitle = `رد قطعی: ${card.workflow_title_fa}`;
        this.reasonDialogConfirmLabel = 'رد قطعی';
      }
      this.reasonDialogOpen = true;
    }
  }

  async executeAct(card: WorkflowTaskCard, action: WorkflowTaskAction, reason?: string): Promise<void> {
    const outcome = await this.workflowTasks.act(card, action, reason);

    if (outcome.status === 'done') {
      this.toast.success('اقدام با موفقیت انجام شد');
      this.reasonDialogOpen = false;
    } else if (outcome.status === 'queued') {
      this.toast.info('اقدام ذخیره شد و پس از اتصال ارسال می‌شود');
      this.reasonDialogOpen = false;
    } else if (outcome.status === 'already-done') {
      this.toast.warning(outcome.message);
      this.reasonDialogOpen = false;
    } else if (outcome.status === 'rejected') {
      // دیالوگ دلیل باز می‌ماند تا متن نوشته‌شده از دست نرود
      if (outcome.code === 'reason_required' || this.reasonDialogOpen) {
        this.reasonServerError = outcome.message;
      } else {
        this.toast.error(outcome.message);
        this.reasonDialogOpen = false;
      }
    }
    this.cdr?.markForCheck();
  }

  onReasonConfirmed(reason: string): void {
    if (this.targetCard && this.reasonDialogAction) {
      void this.executeAct(this.targetCard, this.reasonDialogAction, reason);
    }
  }

  onReasonCancelled(): void {
    this.reasonDialogOpen = false;
    this.targetCard = null;
    this.reasonDialogAction = null;
    this.reasonServerError = '';
  }

  formatCardAmount(amount: string | null): string {
    return formatAmount(amount);
  }

  formatHours(hours: number): string {
    return formatWaitingTime(hours);
  }

  // عنوان خلاصه جدا نشان داده می‌شود و مبلغ در ردیف کارت آمده است
  getSummaryTitle(summary: Record<string, unknown> | null | undefined): string {
    const t = summary?.['title'];
    return t != null && typeof t !== 'object' ? String(t) : '';
  }

  // برای هر شیء خلاصه یک بار ساخته می‌شود (آرایهٔ تازه در هر دور، ngFor را بی‌پایان دوباره می‌سازد)
  private readonly summaryCache = new WeakMap<object, { key: string; label: string; value: string }[]>();
  getSummaryEntries(summary: Record<string, unknown> | null | undefined): { key: string; label: string; value: string }[] {
    if (!summary || typeof summary !== 'object') return [];
    let entries = this.summaryCache.get(summary);
    if (!entries) {
      entries = Object.entries(summary)
        .filter(([k, v]) => !SUMMARY_HIDDEN_KEYS.has(k) && v != null && v !== '' && typeof v !== 'object')
        .map(([key, value]) => ({ key, label: SUMMARY_LABELS[key] ?? key, value: formatPersianDigits(String(value)) }));
      this.summaryCache.set(summary, entries);
    }
    return entries;
  }
}
