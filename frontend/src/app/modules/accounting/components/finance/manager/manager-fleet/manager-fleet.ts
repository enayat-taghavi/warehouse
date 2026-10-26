import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, VehicleDriverProfile, VehicleChangeRequest } from '../../../../models/personnel.model';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { SmartDeleteModalComponent } from '../../../../../../shared/components/smart-delete-modal/smart-delete-modal';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { getPermissionAliases } from '../../../../../../core/modules/permission-aliases';

export type ManagerFleetSubTab = 'new' | 'settlement' | 'changes' | 'all';

@Component({
  selector: 'app-manager-fleet-hub',
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
  templateUrl: './manager-fleet.html',
  styleUrl: './manager-fleet.css'
})
export class ManagerFleetHubComponent implements OnInit, OnDestroy {
  activeSubTab: ManagerFleetSubTab = 'new';

  private fleetSubTabsKey = '';
  private fleetSubTabsCache: TabDef[] = [];
  get fleetSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.newPending}:${sc.settlementPending}:${sc.changesPending}:${sc.allTotal}`;
    if (key !== this.fleetSubTabsKey) {
      this.fleetSubTabsKey = key;
      this.fleetSubTabsCache = [
        {
          id: 'new',
          label: 'ناوگان در انتظار تایید',
          shortLabel: 'جدید',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: sc.newPending,
          tone: 'amber',
          indicator: sc.newPending > 0 ? { tone: 'amber', label: 'ناوگان در انتظار تایید', pulse: true } : undefined
        },
        {
          id: 'settlement',
          label: 'تسویه‌حساب و کارکرد',
          shortLabel: 'تسویه',
          icon: ACCOUNTING_ENTITY_ICONS.payroll,
          count: sc.settlementPending,
          tone: 'indigo'
        },
        {
          id: 'changes',
          label: 'درخواست‌های تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.changesPending,
          tone: 'amber',
          indicator: sc.changesPending > 0 ? { tone: 'amber', label: 'درخواست‌های تغییرات', pulse: true } : undefined
        },
        {
          id: 'all',
          label: 'همه ناوگان فعال',
          shortLabel: 'همه',
          icon: 'status-all',
          count: sc.allTotal,
          tone: 'slate'
        }
      ];
    }
    return this.fleetSubTabsCache;
  }

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  fiscalYear = '1405';
  selectedMonth = 'تیر';
  isLoading = false;

  readonly monthsList = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];

  readonly monthMap: Record<string, string> = {
    'فروردین': '01', 'اردیبهشت': '02', 'خرداد': '03', 'تیر': '04',
    'مرداد': '05', 'شهریور': '06', 'مهر': '07', 'آبان': '08',
    'آذر': '09', 'دی': '10', 'بهمن': '11', 'اسفند': '12'
  };

  // لیست‌های داده
  newVehiclesList: VehicleDriverProfile[] = [];
  settlementItems: any[] = [];
  changeRequests: VehicleChangeRequest[] = [];
  allVehiclesList: VehicleDriverProfile[] = [];

  statusCounters = {
    newPending: 0,
    settlementPending: 0,
    changesPending: 0,
    allTotal: 0
  };

  // مودال تایید و تصویب مدیر
  isApprovalModalOpen = false;
  approvalTarget: { type: 'vehicle' | 'changes'; item: any; title: string } | null = null;
  approvalNote = '';
  isApproving = false;

  // مودال رد پرونده یا درخواست اصلاح (تسک ۱۰.۲)
  isRejectModalOpen = false;
  rejectTarget: { id: number; title: string; type: 'vehicle' | 'vehicle_cr'; action: 'reject' | 'revision' } | null = null;
  rejectActionType: 'return_to_accountant' | 'reject_final' = 'return_to_accountant';
  rejectReason = '';
  isSubmittingReject = false;

  // ویجت برآورد بار مالی سروری ناوگان (تسک ۱۰.۱)
  approvalCostEstimate: any | null = null;
  isLoadingCostAnalysis = false;

  // مودال حذف خودروهای فاقد سابقه (تسک ۱۰.۳)
  isDeleteModalOpen = false;
  deleteTargetVehicle: VehicleDriverProfile | null = null;
  deleteImpactUrl = '';
  deleteImpactLoading = false;
  deleteImpactHistory: any = null;
  isDeletingVehicle = false;

  // مودال قطع همکاری ناوگان (تسک ۱۰.۳)
  isEndCollaborationModalOpen = false;
  endCollaborationTarget: VehicleDriverProfile | null = null;
  endCollaborationDate = '';
  endCollaborationReason = '';
  isEndingCollaboration = false;

  /** کاربر دارای مجوز اختصاصی حذف خودروی فاقد تردد (تسک ۱۰.۳، ب-۲۴) */
  get canDeleteVehicle(): boolean {
    const u = this.auth.user();
    if (u?.is_superuser) return true;
    return this.auth.userPermissions().includes('perm_delete_vehicle_nomovement');
  }

  /** قطع همکاری خودرو با مجوز مدیر (تسک ۱۰.۳، DEF-18) */
  get canEndCollaboration(): boolean {
    const u = this.auth.user();
    if (u?.is_superuser) return true;
    const perms = this.auth.userPermissions();
    return ['perm_approve_fleet_manager', ...getPermissionAliases('manager_approver')].some(c => perms.includes(c));
  }

  // مودال مقایسه تفاوت‌ها (Diff Viewer)
  isDiffModalOpen = false;
  selectedDiffCR: VehicleChangeRequest | null = null;
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
      if (params['tab'] && ['new', 'settlement', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as ManagerFleetSubTab;
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
      if (params['month'] && this.monthsList.includes(params['month'])) {
        this.selectedMonth = params['month'];
      }
    });

    this.wsSub = this.ws.notifications$.subscribe((msg: any) => {
      // ق۴: رویداد همین زبانه یا شرکت دیگر نادیده گرفته می‌شود
      if (this.ws.skipLiveEvent?.(msg)) return;
      if (msg && (msg.type_str === 'vehicle_updated' || msg.type === 'vehicle_updated' || msg.type === 'vehicle_cr_updated')) {
        this.fetchFleetData();
      }
    });

    this.loadSections();
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
        this.fetchFleetData();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchFleetData();
      }
    });
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchFleetData();
  }

  switchSubTab(tab: string): void {
    if (tab === 'new' || tab === 'settlement' || tab === 'changes' || tab === 'all') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.fetchFleetData();
    }
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        month: this.selectedMonth,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  fetchFleetData(): void {
    this.isLoading = true;
    const baseParams: any = {};
    if (this.selectedSectionId) baseParams.section_id = this.selectedSectionId;
    if (this.searchQuery.trim()) baseParams.search = this.searchQuery.trim();

    // ۱. ناوگان جدید در انتظار تصویب مدیر
    this.personnelApi.getVehicleProfiles(baseParams).subscribe({
      next: (res: VehicleDriverProfile[]) => {
        const allList = res || [];
        this.allVehiclesList = allList;
        this.statusCounters.allTotal = allList.length;
        this.newVehiclesList = allList.filter(v => v.approval_status === 'pending_manager' || v.approval_status === 'accountant_approved');
        this.statusCounters.newPending = this.newVehiclesList.length;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });

    // ۲. تسویه‌حساب و کارکرد ماهانه ناوگان
    const m = this.monthMap[this.selectedMonth] || '04';
    const yearMonth = `${this.fiscalYear}/${m}`;
    this.personnelApi.calculateFleetSettlement(null, yearMonth).subscribe({
      next: (res: any) => {
        // پاسخ بک‌اند `{ summary, records }` است؛ خودروی شرکتی مبلغ تسویه ندارد (is_payable=false)
        const rows = Array.isArray(res?.records) ? res.records : [];
        this.settlementItems = rows;
        this.statusCounters.settlementPending = rows.filter((x: any) => x.is_payable && Number(x.payable_amount || 0) > 0).length;
        this.cdr.detectChanges();
      },
      error: () => {
        this.settlementItems = [];
      }
    });

    // ۳. درخواست‌های تغییرات ناوگان در انتظار تایید مدیر
    this.personnelApi.getVehicleChangeRequests(baseParams).subscribe({
      next: (crList: VehicleChangeRequest[]) => {
        this.changeRequests = (crList || []).filter(cr => cr.status === 'pending_manager');
        this.statusCounters.changesPending = this.changeRequests.length;
        this.cdr.detectChanges();
      },
      error: () => {
        this.changeRequests = [];
      }
    });
  }

  // ─── تصویب نهایی توسط مدیر ───
  openApproveModal(type: 'vehicle' | 'changes', item: any): void {
    const title = type === 'vehicle'
      ? `تصویب پرونده خودرو: ${item.plate_number || ''} (${item.driver_name || ''})`
      : `تصویب تغییرات خودرو: ${item.vehicle_plate || ''}`;
    this.approvalTarget = { type, item, title };
    this.approvalNote = '';
    this.isApprovalModalOpen = true;
    if (type === 'vehicle' && item?.id) {
      this.loadCostEstimate(item.id);
    }
  }

  closeApproveModal(): void {
    this.isApprovalModalOpen = false;
    this.approvalTarget = null;
    this.approvalNote = '';
    this.approvalCostEstimate = null;
    this.isLoadingCostAnalysis = false;
  }

  private loadCostEstimate(vehicleId: number): void {
    this.approvalCostEstimate = null;
    this.isLoadingCostAnalysis = true;
    this.personnelApi.getVehicleCostEstimate(vehicleId).subscribe({
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
  }

  submitApproval(): void {
    if (!this.approvalTarget) return;
    this.isApproving = true;
    const { type, item } = this.approvalTarget;

    if (type === 'vehicle') {
      this.personnelApi.approveVehicleManager(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess(`پرونده خودرو «${item.plate_number}» با موفقیت به تایید و تصویب نهایی رسید.`);
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || err?.error?.error || 'خطا در تصویب نهایی خودرو');
        }
      });
    } else {
      this.personnelApi.approveVehicleChangeRequestManager(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess('تغییرات مشخصات خودرو با موفقیت تصویب و اعمال شد.');
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || 'خطا در تصویب تغییرات');
        }
      });
    }
  }

  // ─── رد یا درخواست اصلاح (تسک ۱۰.۲) ───
  openRejectModal(id: number, title: string, type: 'vehicle' | 'vehicle_cr', action: 'reject' | 'revision'): void {
    this.rejectTarget = { id, title, type, action };
    this.rejectActionType = action === 'revision' ? 'return_to_accountant' : 'reject_final';
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
      this.toast.showWarning('لطفاً دلیل مستند را وارد فرمایید.');
      return;
    }

    this.isSubmittingReject = true;
    const { id, type } = this.rejectTarget;

    if (type === 'vehicle') {
      if (this.rejectActionType === 'return_to_accountant') {
        this.personnelApi.requestVehicleRevision(id, this.rejectReason.trim()).subscribe({
          next: () => {
            this.toast.showSuccess('پرونده جهت بازنگری نرخ و مدارک به کارتابل حسابدار عودت داده شد.');
            this.isSubmittingReject = false;
            this.closeRejectModal();
            this.fetchFleetData();
          },
          error: (err) => {
            this.isSubmittingReject = false;
            this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در عودت پرونده به حسابدار');
          }
        });
      } else {
        this.personnelApi.rejectVehicle(id, this.rejectReason.trim()).subscribe({
          next: () => {
            this.toast.showSuccess('پرونده خودرو رد شد.');
            this.isSubmittingReject = false;
            this.closeRejectModal();
            this.fetchFleetData();
          },
          error: (err) => {
            this.isSubmittingReject = false;
            this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در رد پرونده خودرو');
          }
        });
      }
    } else {
      this.personnelApi.rejectVehicleChangeRequest(id, this.rejectReason.trim()).subscribe({
        next: () => {
          this.toast.showSuccess('درخواست تغییرات رد گردید.');
          this.isSubmittingReject = false;
          this.closeRejectModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isSubmittingReject = false;
          this.toast.showError(err?.error?.detail || 'خطا در رد درخواست');
        }
      });
    }
  }

  // ─── ابزار حذف ناوگان فاقد سابقه با SmartDeleteModal (تسک ۱۰.۳) ───
  openDeleteModal(v: VehicleDriverProfile): void {
    if (!v?.id) return;
    this.deleteTargetVehicle = v;
    this.deleteImpactUrl = `/api/personnel/vehicles/${v.id}/delete_impact/`;
    this.deleteImpactLoading = true;
    this.deleteImpactHistory = null;
    this.isDeleteModalOpen = true;

    this.personnelApi.getVehicleDeleteImpact(v.id).subscribe({
      next: (res) => {
        this.deleteImpactHistory = res;
        this.deleteImpactLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.deleteImpactHistory = { can_delete: false, reasons: ['خطا در استعلام سوابق تردد خودرو از سرور'] };
        this.deleteImpactLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen = false;
    this.deleteTargetVehicle = null;
    this.deleteImpactHistory = null;
    this.isDeletingVehicle = false;
    this.cdr.detectChanges();
  }

  confirmDeleteVehicle(): void {
    if (!this.deleteTargetVehicle?.id || !this.deleteImpactHistory?.can_delete || this.isDeletingVehicle) return;
    this.isDeletingVehicle = true;
    const id = this.deleteTargetVehicle.id;
    const plate = this.deleteTargetVehicle.plate_number;

    this.personnelApi.deleteVehicleProfile(id).subscribe({
      next: () => {
        this.toast.showSuccess(`پرونده خودرو «${plate}» به علت عدم سابقه با موفقیت حذف گردید.`);
        this.isDeletingVehicle = false;
        this.closeDeleteModal();
        this.fetchFleetData();
      },
      error: (err) => {
        this.isDeletingVehicle = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در حذف پرونده خودرو');
        this.cdr.detectChanges();
      }
    });
  }

  // ─── قطع همکاری ناوگان دارای سابقه (تسک ۱۰.۳) ───
  openEndCollaborationModal(v: VehicleDriverProfile): void {
    this.endCollaborationTarget = v;
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
    this.personnelApi.endVehicleCollaboration(target.id, this.endCollaborationDate.trim(), this.endCollaborationReason.trim()).subscribe({
      next: (res: any) => {
        this.isEndingCollaboration = false;
        this.toast.showSuccess(res?.message || `همکاری خودرو «${target.plate_number}» پایان یافت و غیرفعال شد.`);
        this.closeEndCollaborationModal();
        this.fetchFleetData();
      },
      error: (err: any) => {
        this.isEndingCollaboration = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در ثبت قطع همکاری ناوگان');
        this.cdr.detectChanges();
      }
    });
  }

  // ─── مقایسه تفاوت‌ها (Diff Viewer) ───
  openDiffModal(cr: VehicleChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];

    const fieldLabels: Record<string, string> = {
      plate_number: 'شماره پلاک',
      vehicle_type: 'نوع خودرو / تجهیز',
      driver_name: 'نام راننده',
      driver_national_code: 'کد ملی راننده',
      driver_mobile: 'موبایل راننده',
      owner_name: 'نام مالک',
      owner_national_code: 'کد ملی مالک',
      daily_rate: 'نرخ کرایه روزانه',
      hourly_rate: 'نرخ ساعت اضافه / اضافه بار',
      bank_name: 'بانک عامل',
      account_number: 'شماره حساب',
      sheba_number: 'شماره شبا (IR)'
    };

    const proposed = cr.proposed_changes || {};
    const previous = cr.previous_values || {};
    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(previous)]));

    for (const key of allKeys) {
      this.diffFieldRows.push({
        field_name: key,
        field_label: fieldLabels[key] || key,
        old_value: previous[key] !== undefined ? previous[key] : '—',
        new_value: proposed[key] !== undefined ? proposed[key] : '—',
        is_changed: JSON.stringify(previous[key]) !== JSON.stringify(proposed[key])
      });
    }

    this.isDiffModalOpen = true;
  }

  closeDiffModal(): void {
    this.isDiffModalOpen = false;
    this.selectedDiffCR = null;
    this.diffFieldRows = [];
  }

  formatPrice(val: number | null | undefined): string {
    if (!val && val !== 0) return '—';
    return Number(val).toLocaleString('fa-IR') + ' ریال';
  }

  // ─── توابع کمکی ویجت بار مالی ماهانه سروری (تسک ۱۰.۱) ───
  getCostDeviationPercentage(): number | null {
    if (!this.approvalCostEstimate || !this.approvalCostEstimate.is_payable) return null;
    return this.approvalCostEstimate.deviation_percentage;
  }

  getVehicleDailyRate(): number | null {
    return this.approvalCostEstimate?.daily_rate ?? null;
  }

  getVehicleMonthlyStandardCost(): number | null {
    return this.approvalCostEstimate?.monthly_cost_standard ?? null;
  }

  getVehicleYearlyStandardCost(): number | null {
    return this.approvalCostEstimate?.yearly_cost_standard ?? null;
  }

  getVehicleAvgMonthlyCost(): number | null {
    return this.approvalCostEstimate?.avg_monthly_cost ?? null;
  }

  getVehicleAvgDailyRate(): number | null {
    return this.approvalCostEstimate?.avg_daily_rate ?? null;
  }

  isVehiclePayable(): boolean {
    return this.approvalCostEstimate?.is_payable ?? false;
  }
}
