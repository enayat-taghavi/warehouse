import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../../../core/api/personnel-api.service';
import { ProjectSection, PettyCashTransaction } from '../../../../../../core/models/personnel.model';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';

@Component({
  selector: 'app-accountant-petty-cash-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent
  ],
  templateUrl: './accountant-petty-cash.html',
  styleUrl: './accountant-petty-cash.css'
})
export class AccountantPettyCashHubComponent implements OnInit, OnDestroy {
  activeSubTab: 'pending_review' | 'settled' | 'all' = 'pending_review';

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

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['pending_review', 'settled', 'all'].includes(params['tab'])) {
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
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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
    if (tab !== 'pending_review' && tab !== 'settled' && tab !== 'all') {
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

  fetchPettyCash(): void {
    this.isLoading = true;
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
        this.toast.error('خطا در دریافت اسناد تنخواه حسابداری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  updateViewAndCounters(): void {
    const list = this.allTransactions;
    this.statusCounters = {
      pending_review: list.filter(x => x.status === 'pending_accountant').length,
      settled: list.filter(x => ['pending_manager', 'approved'].includes(x.status)).length,
      all: list.length
    };

    if (this.activeSubTab === 'pending_review') {
      this.items = list.filter(x => x.status === 'pending_accountant');
    } else if (this.activeSubTab === 'settled') {
      this.items = list.filter(x => ['pending_manager', 'approved'].includes(x.status));
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

  rejectReplenishment(item: PettyCashTransaction): void {
    if (!item.id) return;
    const reason = window.prompt(`علت عودت سند تن‌خواه «${item.title || ''}» را وارد کنید:`);
    if (reason === null) return;
    if (!reason.trim()) {
      this.toast.warning('ثبت علت عودت الزامی است.');
      return;
    }
    this.isLoading = true;
    this.personnelApi.rejectPettyCashTransaction(item.id, reason.trim()).subscribe({
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
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PettyCash_Audit_${this.selectedSectionId || 'all'}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
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
