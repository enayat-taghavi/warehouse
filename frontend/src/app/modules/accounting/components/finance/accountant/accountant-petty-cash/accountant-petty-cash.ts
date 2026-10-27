import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, PettyCashTransaction } from '../../../../models/personnel.model';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { WorkflowReasonDialogComponent } from '../../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { PettyAccountManagerComponent } from './petty-account-manager/petty-account-manager';
import { WebSocketService, patchDocumentRow } from '../../../../../../core/http/websocket.service';

@Component({
  selector: 'app-accountant-petty-cash-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent,
    WorkflowReasonDialogComponent,
    PettyAccountManagerComponent
  ],
  templateUrl: './accountant-petty-cash.html',
  styleUrl: './accountant-petty-cash.css'
})
export class AccountantPettyCashHubComponent implements OnInit, OnDestroy {
  activeSubTab: 'pending_review' | 'settled' | 'all' | 'accounts' = 'pending_review';

  // Memoized tabs for app-tab-bar (NG0100 prevention)
  private tabsKey = '';
  private tabsCache: TabDef[] = [];
  get tabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.pending_review}:${sc.settled}:${sc.all}`;
    if (key !== this.tabsKey) {
      this.tabsKey = key;
      this.tabsCache = [
        {
          id: 'pending_review',
          label: 'نیازمند ممیزی',
          shortLabel: 'ممیزی',
          icon: STATUS_ICONS.pending,
          count: sc.pending_review,
          tone: 'amber'
        },
        {
          id: 'settled',
          label: 'شارژ و تسویه شده',
          shortLabel: 'تسویه',
          icon: STATUS_ICONS.approved,
          count: sc.settled,
          tone: 'emerald'
        },
        {
          id: 'all',
          label: 'کل دفاتر تنخواه',
          shortLabel: 'همه',
          icon: STATUS_ICONS.all,
          count: sc.all,
          tone: 'slate'
        },
        {
          id: 'accounts',
          label: 'حساب‌های تنخواه',
          shortLabel: 'حساب‌ها',
          icon: ACCOUNTING_ENTITY_ICONS.pettyCash,
          tone: 'indigo'
        }
      ];
    }
    return this.tabsCache;
  }

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  fiscalYear = '1405';

  isLoading = false;
  allTransactions: PettyCashTransaction[] = [];
  items: PettyCashTransaction[] = [];

  statusCounters = {
    pending_review: 0,
    settled: 0,
    all: 0
  };

  private routeSub?: Subscription;
  private docSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private ws?: WebSocketService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['pending_review', 'settled', 'all', 'accounts'].includes(params['tab'])) {
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
    if (tab !== 'pending_review' && tab !== 'settled' && tab !== 'all' && tab !== 'accounts') {
      return;
    }
    this.activeSubTab = tab;
    this.syncUrlParams();
    this.updateViewAndCounters();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  fetchPettyCash(silent = false): void {
    if (!silent) this.isLoading = true;
    const params: { section_id?: number; search?: string } = {};
    if (this.selectedSectionId) params.section_id = this.selectedSectionId;
    if (this.searchQuery?.trim()) params.search = this.searchQuery.trim();

    this.personnelApi.getPettyCashTransactions(params).subscribe({
      next: (data: PettyCashTransaction[]) => {
        this.isLoading = false;
        this.allTransactions = data || [];
        this.updateViewAndCounters();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (silent) return;
        this.toast.error('خطا در دریافت اسناد تنخواه حسابداری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  updateViewAndCounters(): void {
    // legacy rows only; documents of the new workflows (statements, charges) go through the shared cartable
    const list = this.allTransactions.filter(x => ['pending_supervisor', 'pending_accountant', 'pending_manager'].includes(x.status));
    this.statusCounters = {
      pending_review: list.filter(x => x.status === 'pending_accountant').length,
      settled: list.filter(x => ['pending_manager'].includes(x.status)).length,
      all: list.length
    };

    if (this.activeSubTab === 'pending_review') {
      this.items = list.filter(x => x.status === 'pending_accountant');
    } else if (this.activeSubTab === 'settled') {
      this.items = list.filter(x => ['pending_manager'].includes(x.status));
    } else {
      this.items = list;
    }
  }

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

  exportExcel(): void {
    this.toast.info('در حال صدور فایل اکسل صورت‌ریز تن‌خواه‌گردان...');
    this.personnelApi.exportPettyCashTransactionsExcel({
      section_id: this.selectedSectionId || undefined,
      status: this.activeSubTab === 'pending_review' ? 'pending_accountant' : undefined
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
