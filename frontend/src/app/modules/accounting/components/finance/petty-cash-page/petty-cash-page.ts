import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PermissionService } from '../../../../../core/services/permission.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { ProjectSection, PettyCashTransaction } from '../../../models/personnel.model';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../shared/components/command-center/command-center.component';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { saveBlob } from '../../../../../core/platform/file-output';
import { WorkflowReasonDialogComponent } from '../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { PettyAccountManagerComponent } from '../accountant/accountant-petty-cash/petty-account-manager/petty-account-manager';
import { WebSocketService, patchDocumentRow } from '../../../../../core/http/websocket.service';
import { attendanceActionErrorMessage } from '../../../attendance-period-error';
import { PettyPageConfig, PettyTabId, pettyPageConfig } from './petty-cash-page.config';

/**
 * صفحهٔ مشترک تن‌خواه حسابدار، مدیر و خزانه‌دار (طرح بازطراحی تن‌خواه ت۱/ت۲).
 * نقش از data.pettyRole مسیر می‌آید؛ تفاوت‌های نقش فقط در petty-cash-page.config.ts است.
 */
@Component({
  selector: 'app-petty-cash-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent,
    ModalComponent,
    WorkflowReasonDialogComponent,
    PettyAccountManagerComponent,
    SvgIconDirective
  ],
  templateUrl: './petty-cash-page.html'
})
export class PettyCashPageComponent implements OnInit, OnDestroy {
  @ViewChild(PettyAccountManagerComponent) accountManager?: PettyAccountManagerComponent;

  readonly config: PettyPageConfig;
  loadError = '';
  activeSubTab: PettyTabId = 'all';

  // Memoized tabs for app-tab-bar (NG0100 prevention)
  private tabsKey = '';
  private tabsCache: TabDef[] = [];
  get tabs(): TabDef[] {
    const key = this.config.tabs.map(t => this.counts[t.id] ?? '').join(':');
    if (key !== this.tabsKey) {
      this.tabsKey = key;
      // فقط زبانهٔ «بررسی/واریز» عدد منتظرها را دارد
      this.tabsCache = this.config.tabs.map(({ statuses: _s, ...tab }) =>
        tab.id === 'pending_review' ? { ...tab, count: this.counts.pending_review } : tab
      );
    }
    return this.tabsCache;
  }

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';

  isLoading = false;
  allTransactions: PettyCashTransaction[] = [];
  items: PettyCashTransaction[] = [];
  counts: Partial<Record<PettyTabId, number>> = {};

  private routeSub?: Subscription;
  private docSub?: Subscription;

  constructor(
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    protected perm: PermissionService,
    @Optional() private ws?: WebSocketService
  ) {
    this.config = pettyPageConfig(this.route.snapshot?.data?.['pettyRole']);
  }

  get isAccountsTab(): boolean {
    return this.activeSubTab === 'accounts';
  }

  private hasTab(id: unknown): id is PettyTabId {
    return this.config.tabs.some(t => t.id === id);
  }

  private tabStatuses(id: PettyTabId): string[] | undefined {
    return this.config.tabs.find(t => t.id === id)?.statuses;
  }

  /** ردیفی که اقدام نقش (تایید/عودت یا واریز) روی آن ممکن است */
  isActionable(item: PettyCashTransaction): boolean {
    return !!this.config.rowAction && (this.tabStatuses('pending_review') || []).includes(item.status);
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (this.hasTab(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.loadSections();

    // ص۶ طرح ۲.۵: سند تنخواهی که جای دیگری عوض شد درجا به‌روز می‌شود، وگرنه فهرست بی‌صدا دوباره خوانده می‌شود
    this.docSub = this.ws?.documentChanges$?.(['petty_cash']).subscribe(ev => {
      if (patchDocumentRow(this.allTransactions, ev)) {
        this.updateViewAndCounters();
        this.cdr.detectChanges();
      } else if (!this.selectedSectionId || !ev.section_id || Number(ev.section_id) === Number(this.selectedSectionId)) {
        this.fetchPettyCash(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.docSub?.unsubscribe();
  }

  loadSections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          this.personnelApi.getProjectSections({ is_active: true }).subscribe({
            next: (allSecs: ProjectSection[]) => {
              this.mySections = allSecs || [];
              this.pickDefaultSection();
            },
            error: () => {
              this.isLoadingSections = false;
              this.fetchPettyCash();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchPettyCash();
      }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    }
    this.isLoadingSections = false;
    this.fetchPettyCash();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchPettyCash();
  }

  switchSubTab(tab: string): void {
    if (!this.hasTab(tab)) return;
    this.activeSubTab = tab;
    this.syncUrlParams();
    this.updateViewAndCounters();
  }

  syncUrlParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  /** تازه‌سازی یگانهٔ کادر بالا: در زبانهٔ «حساب‌ها» فهرست حساب‌ها، وگرنه اسناد */
  refresh(): void {
    if (this.isAccountsTab) {
      this.accountManager?.load();
      return;
    }
    this.fetchPettyCash();
  }

  /** «حساب جدید» کادر بالا: به زبانهٔ «حساب‌ها» می‌رود و فرم ساخت حساب را باز می‌کند */
  newAccount(): void {
    if (!this.config.canManageAccounts) return;
    if (!this.isAccountsTab) {
      this.switchSubTab('accounts');
      this.cdr.detectChanges();
    }
    this.accountManager?.openCreate();
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  fetchPettyCash(silent = false): void {
    if (!silent) {
      this.isLoading = true;
      this.loadError = '';
    }
    const params: { section_id?: number; search?: string; transaction_type?: string } = {};
    if (this.selectedSectionId) params.section_id = this.selectedSectionId;
    if (this.searchQuery?.trim()) params.search = this.searchQuery.trim();
    if (this.config.transactionType) params.transaction_type = this.config.transactionType;

    this.personnelApi.getPettyCashTransactions(params).subscribe({
      next: (data: PettyCashTransaction[]) => {
        this.isLoading = false;
        this.loadError = '';
        this.allTransactions = data || [];
        this.updateViewAndCounters();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (silent) return;
        this.loadError = 'دریافت اطلاعات انجام نشد.';
        this.toast.error(attendanceActionErrorMessage(err, 'خطا در دریافت اسناد تن‌خواه.'));
        this.cdr.detectChanges();
      }
    });
  }

  updateViewAndCounters(): void {
    // legacy rows only; documents of the new workflows (statements, charges) go through the shared cartable
    const list = this.allTransactions.filter(x => this.config.listStatuses.includes(x.status));
    const counts: Partial<Record<PettyTabId, number>> = {};
    for (const tab of this.config.tabs) {
      if (tab.id === 'accounts') continue;
      counts[tab.id] = tab.statuses ? list.filter(x => tab.statuses!.includes(x.status)).length : list.length;
    }
    this.counts = counts;
    const statuses = this.tabStatuses(this.activeSubTab);
    this.items = statuses ? list.filter(x => statuses.includes(x.status)) : list;
  }

  // ─── تایید و عودت حسابدار ───
  approveReplenishment(item: PettyCashTransaction): void {
    if (!item.id) return;
    this.isLoading = true;
    this.personnelApi.approvePettyCashTransaction(item.id).subscribe({
      next: () => {
        this.isLoading = false;
        this.toast.success(`اسناد تن‌خواه ${item.title || ''} ممیزی و تایید گردید.`);
        this.fetchPettyCash();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در ممیزی تن‌خواه: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  isReasonDialogOpen = false;
  reasonDialogTitle = '';
  reasonDialogServerError = '';
  private pendingRejectItem: PettyCashTransaction | null = null;

  rejectReplenishment(item: PettyCashTransaction): void {
    if (!item.id) return;
    this.pendingRejectItem = item;
    this.reasonDialogTitle = `علت عودت سند تن‌خواه «${item.title || ''}»`;
    this.reasonDialogServerError = '';
    this.isReasonDialogOpen = true;
  }

  onReasonCancelled(): void {
    this.isReasonDialogOpen = false;
    this.pendingRejectItem = null;
    this.reasonDialogServerError = '';
  }

  onReasonConfirmed(reason: string): void {
    const item = this.pendingRejectItem;
    if (!item?.id) return;
    this.isReasonDialogOpen = false;
    this.pendingRejectItem = null;
    this.isLoading = true;
    this.personnelApi.rejectPettyCashTransaction(item.id, reason).subscribe({
      next: () => {
        this.isLoading = false;
        this.toast.warning(`سند تن‌خواه «${item.title || ''}» جهت بازنگری عودت شد.`);
        this.fetchPettyCash();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در عودت تن‌خواه: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── واریز شارژ خزانه‌دار ───
  refillModalOpen = false;
  refillItem: PettyCashTransaction | null = null;
  refillTrackingCode = '';
  refillError = '';

  /** خالص واریز (د۴): مبلغ منهای کسر بدهی؛ در شارژهای قدیمی همان مبلغ */
  netAmount(item: PettyCashTransaction): number {
    return item.net_amount !== null && item.net_amount !== undefined
      ? Number(item.net_amount)
      : Number(item.amount || 0) - this.offsetTotal(item);
  }

  offsetTotal(item: PettyCashTransaction): number {
    return Number(item.offset_total || 0);
  }

  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  refillPettyCash(item: PettyCashTransaction): void {
    this.refillItem = item;
    this.refillTrackingCode = '';
    this.refillError = '';
    this.refillModalOpen = true;
  }

  closeRefillModal(): void {
    this.refillModalOpen = false;
    this.refillItem = null;
    this.refillError = '';
  }

  confirmRefill(): void {
    const item = this.refillItem;
    if (!item?.id) return;
    const code = this.refillTrackingCode.trim();
    if (!code) {
      this.refillError = 'ورود شماره پیگیری الزامی است.';
      return;
    }
    this.refillModalOpen = false;
    this.refillError = '';
    this.isLoading = true;
    this.personnelApi.approvePettyCashTransaction(item.id, code).subscribe({
      next: () => {
        this.isLoading = false;
        this.refillItem = null;
        this.toast.success(`شارژ تن‌خواه به حساب ${item.custodian_name || ''} با موفقیت ثبت شد.`);
        this.fetchPettyCash();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (err?.status === 409 && err?.error?.code === 'ceiling_exceeded_at_pay') {
          this.toast.error('مبلغ این شارژ از سقف تنخواه بیشتر شده است. شارژ باید برگردانده شود و دوباره برای مدیر ارسال شود.');
        } else {
          this.toast.error(attendanceActionErrorMessage(err, 'خطا در ثبت شارژ تن‌خواه.'));
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ─── اکسل ───
  exportExcel(): void {
    this.toast.info('در حال صدور فایل اکسل صورت‌ریز تن‌خواه‌گردان...');
    const reviewStatuses = this.tabStatuses('pending_review');
    this.personnelApi.exportPettyCashTransactionsExcel({
      section_id: this.selectedSectionId || undefined,
      status: this.activeSubTab === 'pending_review' && reviewStatuses?.length === 1 ? reviewStatuses[0] : undefined
    }).subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, `PettyCash_Audit_${this.selectedSectionId || 'all'}.xlsx`);
        this.toast.success('فایل اکسل دفاتر تنخواه با موفقیت دریافت شد.');
      },
      error: () => {
        this.toast.error('خطا در دانلود فایل اکسل دفاتر تنخواه.');
      }
    });
  }

  importExcel(): void {
    this.toast.info('قالب اکسل دفاتر تنخواه آماده بارگیری است.');
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.fetchPettyCash();
  }
}
