import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../../../core/api/personnel-api.service';
import { ProjectSection, PersonnelProfile, PersonnelChangeRequest, PayrollYearlySettings, PersonnelCostEstimate } from '../../../../../../core/models/personnel.model';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { SmartDeleteModalComponent } from '../../../../../../shared/components/smart-delete-modal/smart-delete-modal';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export type ManagerPersonnelSubTab = 'new' | 'contracts' | 'changes' | 'all';

@Component({
  selector: 'app-manager-personnel-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SmartDeleteModalComponent,
    SvgIconDirective,
    ActionButtonComponent,
    TabBarComponent
  ],
  templateUrl: './manager-personnel.html',
  styleUrl: './manager-personnel.css'
})
export class ManagerPersonnelHubComponent implements OnInit, OnDestroy {
  activeSubTab: ManagerPersonnelSubTab = 'new';

  private personnelSubTabsKey = '';
  private personnelSubTabsCache: TabDef[] = [];
  get personnelSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.newPending}:${sc.contractsPending}:${sc.changesPending}:${sc.allTotal}`;
    if (key !== this.personnelSubTabsKey) {
      this.personnelSubTabsKey = key;
      this.personnelSubTabsCache = [
        {
          id: 'new',
          label: 'تصویب پرونده‌های جدید',
          shortLabel: 'جدید',
          icon: ACCOUNTING_ENTITY_ICONS.newPersonnel,
          count: sc.newPending,
          tone: 'amber',
          indicator: sc.newPending > 0 ? { tone: 'amber', label: 'پرونده‌های جدید معلق', pulse: true } : undefined
        },
        {
          id: 'contracts',
          label: 'احکام و قراردادها',
          shortLabel: 'احکام',
          icon: ACCOUNTING_ENTITY_ICONS.jobGrades,
          count: sc.contractsPending,
          tone: 'slate'
        },
        {
          id: 'changes',
          label: 'تصویب تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.changesPending,
          tone: 'amber',
          indicator: sc.changesPending > 0 ? { tone: 'amber', label: 'درخواست‌های تغییرات', pulse: true } : undefined
        },
        {
          id: 'all',
          label: 'پرسنل فعال',
          shortLabel: 'همه',
          icon: 'status-all',
          count: sc.allTotal,
          tone: 'slate'
        }
      ];
    }
    return this.personnelSubTabsCache;
  }

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  fiscalYear = '1405';
  isLoading = false;
  yearlySettings: PayrollYearlySettings | null = null;

  // لیست‌های داده
  pendingManagerList: PersonnelProfile[] = [];
  contractsList: any[] = [];
  changeRequests: PersonnelChangeRequest[] = [];
  allPersonnelList: PersonnelProfile[] = [];

  statusCounters = {
    newPending: 0,
    contractsPending: 0,
    changesPending: 0,
    allTotal: 0
  };

  // مودال یادداشت و شروط تصویب مدیر
  isApprovalModalOpen = false;
  approvalTarget: { type: 'new' | 'contracts' | 'changes'; item: any; title: string } | null = null;
  approvalNote = '';
  isApproving = false;

  // مودال عودت / رد پرونده توسط مدیر (تسک ۱۰.۲)
  isRejectModalOpen = false;
  rejectTarget: { id: number; title: string; type: 'personnel' | 'changes' } | null = null;
  rejectActionType: 'return_to_accountant' | 'reject_final' = 'return_to_accountant';
  rejectReason = '';
  isRejecting = false;

  // مودال حذف پرسنل بدون سابقه (تسک ۱۰.۳)
  isDeleteModalOpen = false;
  deleteTargetPersonnel: PersonnelProfile | null = null;
  deleteImpactUrl = '';
  deleteImpactLoading = false;
  deleteImpactHistory: any = null;
  isDeletingPersonnel = false;

  // مودال مقایسه تفاوت‌ها (Diff Viewer)
  isDiffModalOpen = false;
  selectedDiffCR: PersonnelChangeRequest | null = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];

  copiedId: number | null = null;

  private routeSub?: Subscription;
  private wsSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private ws: WebSocketService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['new', 'contracts', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as ManagerPersonnelSubTab;
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.wsSub = this.ws.notifications$.subscribe((msg: any) => {
      if (msg && (msg.type_str === 'personnel_updated' || msg.type === 'personnel_updated')) {
        this.fetchData();
      }
    });

    this.loadSections();
    this.loadYearlySettings();
  }

  loadYearlySettings(): void {
    this.personnelApi.getYearlySettings(this.fiscalYear).subscribe({
      next: (res: any) => {
        this.yearlySettings = res;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  /** سرور فقط مجوز اختصاصی حذف پرسنل فاقد سابقه را می‌پذیرد (تصمیم ۶.۸، DEF-27) */
  get canDeletePersonnel(): boolean {
    const u = this.auth.user();
    if (u?.is_superuser) return true;
    return this.auth.userPermissions().includes('perm_delete_personnel_nomovement');
  }

  /** قطع همکاری با مجوز مدیر (DEF-18) */
  get canEndCollaboration(): boolean {
    const u = this.auth.user();
    if (u?.is_superuser) return true;
    const perms = this.auth.userPermissions();
    return ['perm_approve_personnel_manager', 'can_act_as_manager', 'can_act_as_company_manager'].some(c => perms.includes(c));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.wsSub?.unsubscribe();
  }

  loadSections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getProjectSections({ is_active: true }).subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length > 0 && !this.selectedSectionId) {
          this.selectedSectionId = this.mySections[0]?.id ?? null;
        }
        this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
        this.isLoadingSections = false;
        this.fetchData();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchData();
      }
    });
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchData();
  }

  switchSubTab(tab: string): void {
    if (tab === 'new' || tab === 'contracts' || tab === 'changes' || tab === 'all') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.fetchData();
    }
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

  fetchData(): void {
    this.isLoading = true;
    const baseParams: any = {};
    if (this.selectedSectionId) baseParams.section_id = this.selectedSectionId;
    if (this.searchQuery.trim()) baseParams.search = this.searchQuery.trim();

    // ۱. پرونده‌های در انتظار تصویب نهایی مدیر
    this.personnelApi.getPersonnelProfiles({ ...baseParams, approval_status: 'pending_manager' }).subscribe({
      next: (pList: PersonnelProfile[]) => {
        this.pendingManagerList = pList || [];
        this.statusCounters.newPending = this.pendingManagerList.length;
      },
      error: () => {
        this.pendingManagerList = [];
      }
    });

    // ۲. قراردادها و احکام
    this.personnelApi.getPersonnelProfiles({ ...baseParams, is_active: true }).subscribe({
      next: (cList: PersonnelProfile[]) => {
        this.contractsList = (cList || []).map(p => ({
          personnel_name: `${p.first_name || ''} ${p.last_name || ''}`,
          contract_type: p.contract_type || 'قرارداد کاری',
          start_date_shamsi: p.start_date || '-',
          end_date_shamsi: p.end_date || '-',
          status: p.approval_status
        }));
        this.statusCounters.contractsPending = this.contractsList.length;
      },
      error: () => {
        this.contractsList = [];
      }
    });

    // ۳. تغییرات پرسنل در انتظار مدیر
    this.personnelApi.getPersonnelChangeRequests(baseParams).subscribe({
      next: (crList: PersonnelChangeRequest[]) => {
        this.changeRequests = (crList || []).filter(cr => cr.status === 'pending_manager');
        this.statusCounters.changesPending = this.changeRequests.length;
      },
      error: () => {
        this.changeRequests = [];
      }
    });

    // ۴. تمام پرسنل فعال و مصوب
    this.personnelApi.getPersonnelProfiles(baseParams).subscribe({
      next: (allList: PersonnelProfile[]) => {
        this.allPersonnelList = allList || [];
        this.statusCounters.allTotal = this.allPersonnelList.length;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.allPersonnelList = [];
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── تصویب نهایی توسط مدیر ───
  openApproveModal(type: 'new' | 'contracts' | 'changes', item: any): void {
    const title = type === 'new'
      ? `تصویب نهایی استخدام: ${item.first_name || ''} ${item.last_name || ''}`
      : type === 'contracts'
      ? `تصویب حکم و قرارداد: ${item.personnel_name || ''}`
      : `تصویب تغییرات پرونده: ${item.personnel_name || ''}`;
    this.approvalTarget = { type, item, title };
    this.approvalNote = '';
    this.isApprovalModalOpen = true;
    if (type === 'new' && item?.id) {
      this.loadCostAnalysis(item.id);
    }
  }

  // ─── ویجت تحلیل بار مالی با برآورد سروری همان موتور حقوق (تسک ۱۰.۱، DEF-04 و DEF-05) ───
  approvalCostEstimate: PersonnelCostEstimate | null = null;
  companyCostSummary: { personnel_count: number; average_employer_monthly_cost: number } | null = null;
  isLoadingCostAnalysis = false;

  private loadCostAnalysis(personnelId: number): void {
    this.approvalCostEstimate = null;
    this.isLoadingCostAnalysis = true;
    this.personnelApi.getPersonnelCostEstimate(personnelId).subscribe({
      next: (est) => {
        this.approvalCostEstimate = est;
        this.isLoadingCostAnalysis = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingCostAnalysis = false;
        this.cdr.detectChanges();
      }
    });
    // میانگین شرکت فقط از پرونده‌های مصوب و فعال، مستقل از فیلتر بخش و جستجوی صفحه
    this.personnelApi.getCompanyPersonnelCostSummary().subscribe({
      next: (summary) => {
        this.companyCostSummary = summary;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // ─── قطع همکاری پرسنل دارای سابقه (DEF-18) ───
  isEndCollaborationModalOpen = false;
  endCollaborationTarget: PersonnelProfile | null = null;
  endCollaborationDate = '';
  endCollaborationReason = '';
  isEndingCollaboration = false;

  openEndCollaborationModal(p: PersonnelProfile): void {
    this.endCollaborationTarget = p;
    this.endCollaborationDate = '';
    this.endCollaborationReason = '';
    this.isEndCollaborationModalOpen = true;
  }

  closeEndCollaborationModal(): void {
    this.isEndCollaborationModalOpen = false;
    this.endCollaborationTarget = null;
    this.isEndingCollaboration = false;
  }

  submitEndCollaboration(): void {
    const target = this.endCollaborationTarget;
    if (!target?.id || this.isEndingCollaboration) return;
    if (!this.endCollaborationDate.trim() || !this.endCollaborationReason.trim()) {
      this.toast.showWarning('تاریخ پایان همکاری (شمسی) و دلیل آن الزامی است.');
      return;
    }
    this.isEndingCollaboration = true;
    this.personnelApi.endPersonnelCollaboration(target.id, this.endCollaborationDate.trim(), this.endCollaborationReason.trim()).subscribe({
      next: (res: any) => {
        this.isEndingCollaboration = false;
        this.toast.showSuccess(res?.message || `همکاری «${target.first_name} ${target.last_name}» پایان یافت.`);
        this.closeEndCollaborationModal();
        this.fetchData();
      },
      error: (err: any) => {
        this.isEndingCollaboration = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در ثبت قطع همکاری');
        this.cdr.detectChanges();
      }
    });
  }

  closeApproveModal(): void {
    this.isApprovalModalOpen = false;
    this.approvalTarget = null;
    this.approvalNote = '';
  }

  submitApproval(): void {
    if (!this.approvalTarget) return;
    this.isApproving = true;
    const { type, item } = this.approvalTarget;

    if (type === 'new') {
      this.personnelApi.approvePersonnelManager(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess(`پرونده پرسنل «${item.first_name} ${item.last_name}» با موفقیت به تصویب نهایی رسید.`);
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || err?.error?.error || 'خطا در تصویب نهایی مدیر');
        }
      });
    } else if (type === 'changes') {
      this.personnelApi.approvePersonnelChangeRequestManager(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess('تغییرات با موفقیت تصویب و در پرونده اعمال شد.');
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || 'خطا در تصویب تغییرات');
        }
      });
    } else {
      this.isApproving = false;
      this.closeApproveModal();
    }
  }

  // ─── رد پرونده توسط مدیر ───
  openRejectModal(id: number, title: string, type: 'personnel' | 'changes'): void {
    this.rejectTarget = { id, title, type };
    this.rejectReason = '';
    this.isRejectModalOpen = true;
  }

  closeRejectModal(): void {
    this.isRejectModalOpen = false;
    this.rejectTarget = null;
    this.rejectReason = '';
  }

  submitReject(): void {
    if (!this.rejectTarget || !this.rejectReason.trim()) {
      this.toast.showWarning('لطفاً دلیل مستند عدم تصویب یا رد را وارد فرمایید.');
      return;
    }
    this.isRejecting = true;
    const { id, type } = this.rejectTarget;

    if (type === 'personnel') {
      if (this.rejectActionType === 'return_to_accountant') {
        this.personnelApi.requestPersonnelRevision(id, this.rejectReason.trim(), 'pending_accountant').subscribe({
          next: () => {
            this.toast.showSuccess('پرونده جهت بازنگری احکام و مدارک مالی به کارتابل حسابدار عودت داده شد.');
            this.isRejecting = false;
            this.closeRejectModal();
            this.fetchData();
          },
          error: (err: any) => {
            this.isRejecting = false;
            this.toast.showError(err?.error?.detail || err?.error?.error || 'خطا در عودت پرونده به حسابدار');
          }
        });
      } else {
        this.personnelApi.rejectPersonnel(id, this.rejectReason.trim()).subscribe({
          next: () => {
            this.toast.showSuccess('پرونده پرسنل رد قطعی شد.');
            this.isRejecting = false;
            this.closeRejectModal();
            this.fetchData();
          },
          error: (err: any) => {
            this.isRejecting = false;
            this.toast.showError(err?.error?.detail || err?.error?.error || 'خطا در رد پرونده');
          }
        });
      }
    } else {
      this.personnelApi.rejectPersonnelChangeRequest(id, this.rejectReason.trim()).subscribe({
        next: () => {
          this.toast.showSuccess('درخواست تغییرات رد شد.');
          this.isRejecting = false;
          this.closeRejectModal();
          this.fetchData();
        },
        error: (err: any) => {
          this.isRejecting = false;
          this.toast.showError(err?.error?.detail || 'خطا در رد درخواست');
        }
      });
    }
  }

  // ─── مقایسه تفاوت‌ها (Diff Viewer) ───
  openDiffModal(cr: PersonnelChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];
    const proposed = (cr.proposed_changes || {}) as Record<string, any>;
    const current = (cr.previous_values || {}) as Record<string, any>;

    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(current)]));
    for (const key of allKeys) {
      if (['id', 'created_at', 'updated_at', 'personnel'].includes(key)) continue;
      const oldVal = current[key];
      const newVal = proposed[key];
      const isChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);
      this.diffFieldRows.push({
        field_name: key,
        field_label: this.getFieldLabel(key),
        old_value: oldVal ?? '—',
        new_value: newVal ?? '—',
        is_changed: isChanged
      });
    }
    this.isDiffModalOpen = true;
  }

  closeDiffModal(): void {
    this.isDiffModalOpen = false;
    this.selectedDiffCR = null;
    this.diffFieldRows = [];
  }

  getFieldLabel(field: string): string {
    const dict: Record<string, string> = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      mobile: 'شماره موبایل',
      sheba_number: 'شماره شبا',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      contract_type: 'نوع قرارداد',
      job_title: 'عنوان شغلی',
      insurance_number: 'شماره بیمه',
      daily_base_wage: 'مزد مبنای روزانه',
      job_grade: 'گروه شغلی'
    };
    return dict[field] || field;
  }

  copyToClipboard(text: string, id: number): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copiedId = id;
      this.toast.showSuccess('در حافظه کپی شد: ' + text);
      setTimeout(() => {
        if (this.copiedId === id) this.copiedId = null;
        this.cdr.detectChanges();
      }, 2000);
    });
  }

  // ─── ویجت تحلیل بار مالی پرسنل (تسک ۱۰.۱) ───
  // همهٔ اعداد از برآورد سروری PayrollCalculationEngine می‌آیند تا با کارتابل حسابدار و حقوق یکی باشند (DEF-05)
  private estimateFor(p: any): PersonnelCostEstimate | null {
    const est = this.approvalCostEstimate;
    return est && p?.id && this.approvalTarget?.item?.id === p.id ? est : null;
  }

  getPersonnelGrossMonthly(p: any): number | null {
    return this.estimateFor(p)?.gross_salary ?? null;
  }

  getEmployerInsuranceShare(p: any): { employerRate: number; unempRate: number; totalRate: number; cost: number | null } {
    const est = this.estimateFor(p);
    const employerRate = (est?.employer_insurance_rate ?? 20) / 100;
    const unempRate = (est?.unemployment_insurance_rate ?? 3) / 100;
    return {
      employerRate,
      unempRate,
      totalRate: employerRate + unempRate,
      cost: est ? est.employer_insurance + est.unemployment_insurance : null
    };
  }

  getTotalEmployerMonthlyCost(p: any): number | null {
    return this.estimateFor(p)?.employer_monthly_cost ?? null;
  }

  getTotalEmployerYearlyCost(p: any): number | null {
    const monthly = this.getTotalEmployerMonthlyCost(p);
    return monthly === null ? null : monthly * 12;
  }

  /** میانگین هزینهٔ ماهانهٔ پرسنل مصوب و فعال شرکت، از اندپوینت تجمیعی سرور (DEF-04) */
  getCompanyAverageMonthlyCost(): number {
    return this.companyCostSummary?.average_employer_monthly_cost || 0;
  }

  getCostDeviationPercentage(p: any): number | null {
    const avg = this.getCompanyAverageMonthlyCost();
    const cost = this.getTotalEmployerMonthlyCost(p);
    if (!avg || cost === null) return null;
    return Math.round(((cost - avg) / avg) * 100);
  }

  // ─── ابزار حذف پرسنل بدون سابقه (تسک ۱۰.۳) ───
  openDeleteModal(p: PersonnelProfile): void {
    if (!p?.id) return;
    this.deleteTargetPersonnel = p;
    this.deleteImpactUrl = `/api/personnel/profiles/${p.id}/delete_impact/`;
    this.deleteImpactLoading = true;
    this.deleteImpactHistory = null;
    this.isDeleteModalOpen = true;

    this.personnelApi.getPersonnelDeleteImpact(p.id).subscribe({
      next: (res) => {
        this.deleteImpactHistory = res;
        this.deleteImpactLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.deleteImpactHistory = { can_delete: false, reasons: ['خطا در استعلام سوابق از سرور'] };
        this.deleteImpactLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen = false;
    this.deleteTargetPersonnel = null;
    this.deleteImpactHistory = null;
    this.isDeletingPersonnel = false;
    this.cdr.detectChanges();
  }

  confirmDeletePersonnel(): void {
    if (!this.deleteTargetPersonnel?.id || !this.deleteImpactHistory?.can_delete || this.isDeletingPersonnel) return;
    this.isDeletingPersonnel = true;
    const id = this.deleteTargetPersonnel.id;
    const fullName = `${this.deleteTargetPersonnel.first_name} ${this.deleteTargetPersonnel.last_name}`;

    this.personnelApi.deletePersonnelProfile(id).subscribe({
      next: () => {
        this.toast.showSuccess(`پرونده پرسنل «${fullName}» به علت عدم سابقه با موفقیت حذف گردید.`);
        this.isDeletingPersonnel = false;
        this.closeDeleteModal();
        this.fetchData();
      },
      error: (err) => {
        this.isDeletingPersonnel = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در حذف پرونده پرسنل');
        this.cdr.detectChanges();
      }
    });
  }
}
