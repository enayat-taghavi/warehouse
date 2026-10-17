import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, VehicleDriverProfile, VehicleChangeRequest, VehicleBankAccount, VehicleDocument } from '../../../../models/personnel.model';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ExternalLinkDirective } from '../../../../../../shared/directives/external-link.directive';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { saveBlob } from '../../../../../../core/platform/file-output';

export type SupervisorFleetSubTab = 'new' | 'work_logs' | 'changes' | 'all';

@Component({
  selector: 'app-supervisor-fleet-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SvgIconDirective,
    ActionButtonComponent,
    TabBarComponent,
    CommandCenterComponent,
    ExternalLinkDirective,
  ],
  templateUrl: './supervisor-fleet.html',
  styleUrl: './supervisor-fleet.css',
  host: { '(document:keydown.escape)': 'onEscapeKey()' }
})
export class SupervisorFleetHubComponent implements OnInit, OnDestroy {
  activeSubTab: SupervisorFleetSubTab = 'new';

  private fleetSubTabsKey = '';
  private fleetSubTabsCache: TabDef[] = [];
  get fleetSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.newCount}:${sc.workLogsCount}:${sc.changesCount}:${sc.allCount}`;
    if (key !== this.fleetSubTabsKey) {
      this.fleetSubTabsKey = key;
      this.fleetSubTabsCache = [
        {
          id: 'new',
          label: 'خودروهای جدید',
          shortLabel: 'جدید',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: sc.newCount,
          tone: 'amber',
          indicator: sc.newCount > 0 ? { tone: 'amber', label: 'خودروی جدید نیازمند بررسی', pulse: true } : undefined
        },
        {
          id: 'work_logs',
          label: 'کارکرد ماشین‌آلات',
          shortLabel: 'کارکرد',
          icon: ACCOUNTING_ENTITY_ICONS.attendance,
          count: sc.workLogsCount,
          tone: 'indigo'
        },
        {
          id: 'changes',
          label: 'درخواست‌های تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.changesCount,
          tone: 'amber',
          indicator: sc.changesCount > 0 ? { tone: 'amber', label: 'درخواست تغییرات جدید', pulse: true } : undefined
        },
        {
          id: 'all',
          label: 'همه ناوگان',
          shortLabel: 'همه',
          icon: 'status-all',
          count: sc.allCount,
          tone: 'slate'
        },
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
  selectedDateShamsi = '';
  isLoading = false;
  isExportingExcel = false;

  // لیست‌های داده
  newVehiclesList: VehicleDriverProfile[] = [];
  workLogsList: any[] = [];
  changeRequestsList: VehicleChangeRequest[] = [];
  allVehiclesList: VehicleDriverProfile[] = [];

  // شمارنده‌ها
  statusCounters = {
    newCount: 0,
    workLogsCount: 0,
    changesCount: 0,
    allCount: 0
  };

  // تایید گروهی (Batch Approval)
  selectedVehicleIds = new Set<number>();
  isBatchApproveModalOpen = false;
  batchApprovalNote = '';
  isBatchApproving = false;

  // پنجره تایید با یادداشت
  isApprovalModalOpen = false;
  approvalTarget: { type: 'new' | 'work_logs' | 'changes'; item: any; title: string } | null = null;
  approvalNote = '';
  isApproving = false;

  // پنجره ثبت علت عودت یا رد
  isRejectModalOpen = false;
  rejectTarget: { type: 'new' | 'work_logs' | 'changes'; item: any; action: 'reject' | 'revision'; title: string } | null = null;
  rejectReason = '';
  isRejecting = false;

  // هشدار Purge مشروط بر اساس delete_impact
  isPurgeCandidate = false;
  deleteImpactResult: any = null;
  isLoadingImpact = false;

  // پنجره مشاهده کامل پرونده (Vehicle Profile Viewer)
  isViewVehicleModalOpen = false;
  selectedViewVehicle: VehicleDriverProfile | null = null;
  vehicleBankAccounts: VehicleBankAccount[] = [];
  vehicleDocuments: VehicleDocument[] = [];
  isLoadingVehicleDetails = false;

  // پنجره مقایسه تغییرات (Diff Viewer)
  isDiffModalOpen = false;
  selectedDiffCR: VehicleChangeRequest | null = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];
  diffAuditLogs: any[] = [];
  isLoadingDiffLogs = false;

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
      if (params['tab'] && ['new', 'work_logs', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as SupervisorFleetSubTab;
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.wsSub = this.ws.notifications$.subscribe((msg: any) => {
      if (msg && (msg.type_str === 'fleet_updated' || msg.type === 'fleet_updated' || msg.type_str === 'vehicle_updated')) {
        if (!this.selectedSectionId || msg.section_id === this.selectedSectionId) {
          this.fetchFleetData();
        }
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
              this.fetchFleetData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchFleetData();
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
    this.fetchFleetData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchFleetData();
  }

  switchSubTab(tab: string): void {
    if (tab === 'new' || tab === 'work_logs' || tab === 'changes' || tab === 'all') {
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

    // ۱. تسک ۸.۱: خودروهای جدید در انتظار تایید سرپرست (حذف draft؛ فقط pending_supervisor)
    this.personnelApi.getVehicleProfiles({ ...baseParams, approval_status: 'pending_supervisor' }).subscribe({
      next: (vList: any[]) => {
        this.newVehiclesList = vList || [];
        this.statusCounters.newCount = this.newVehiclesList.length;
        const currentIds = new Set(this.newVehiclesList.map(v => v.id));
        for (const id of Array.from(this.selectedVehicleIds)) {
          if (!currentIds.has(id)) {
            this.selectedVehicleIds.delete(id);
          }
        }
      },
      error: () => {
        this.newVehiclesList = [];
        this.selectedVehicleIds.clear();
      }
    });

    // ۲. کارکرد روزانه ماشین‌آلات
    const dateStr = this.selectedDateShamsi || '';
    this.personnelApi.getVehicleMatrix(null, dateStr, baseParams).subscribe({
      next: (res: any) => {
        this.workLogsList = (res?.vehicles || res?.items || []).map((v: any) => ({
          ...v,
          work_hours: v.work_hours || 0,
          trips_count: v.trips_count || v.total_trips || 0,
          status: v.status || 'pending_supervisor'
        }));
        this.statusCounters.workLogsCount = this.workLogsList.filter(x => x.status === 'pending_supervisor' || !x.status).length;
      },
      error: () => {
        this.workLogsList = [];
      }
    });

    // ۳. درخواست‌های تغییرات ناوگان
    this.personnelApi.getVehicleChangeRequests(baseParams).subscribe({
      next: (crList: any[]) => {
        this.changeRequestsList = crList || [];
        this.statusCounters.changesCount = this.changeRequestsList.filter(c => c.status === 'pending_supervisor').length;
      },
      error: () => {
        this.changeRequestsList = [];
      }
    });

    // ۴. تمام ناوگان بخش
    this.personnelApi.getVehicleProfiles(baseParams).subscribe({
      next: (allList: any[]) => {
        this.allVehiclesList = allList || [];
        this.statusCounters.allCount = this.allVehiclesList.length;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.allVehiclesList = [];
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ─── تسک ۸.۴: تایید گروهی سرپرست (Batch Approval) ───
  toggleSelectAllVehicles(event: any): void {
    const isChecked = event?.target?.checked;
    if (isChecked) {
      this.newVehiclesList.forEach(v => {
        if (v.id) this.selectedVehicleIds.add(v.id);
      });
    } else {
      this.selectedVehicleIds.clear();
    }
  }

  toggleVehicleSelection(id: number | undefined): void {
    if (id === undefined) return;
    if (this.selectedVehicleIds.has(id)) {
      this.selectedVehicleIds.delete(id);
    } else {
      this.selectedVehicleIds.add(id);
    }
  }

  isVehicleSelected(id: number | undefined): boolean {
    return id !== undefined && this.selectedVehicleIds.has(id);
  }

  isAllVehiclesSelected(): boolean {
    return this.newVehiclesList.length > 0 && this.newVehiclesList.every(v => v.id && this.selectedVehicleIds.has(v.id));
  }

  openBatchApproveModal(): void {
    if (this.selectedVehicleIds.size === 0) return;
    this.batchApprovalNote = '';
    this.isBatchApproveModalOpen = true;
  }

  closeBatchApproveModal(): void {
    this.isBatchApproveModalOpen = false;
    this.batchApprovalNote = '';
  }

  submitBatchApprove(): void {
    if (this.selectedVehicleIds.size === 0) return;
    this.isBatchApproving = true;
    const ids = Array.from(this.selectedVehicleIds);
    this.personnelApi.batchApproveVehicles(ids, 'supervisor', this.batchApprovalNote).subscribe({
      next: (res: any) => {
        this.isBatchApproving = false;
        const succCount = (res?.results || []).filter((r: any) => r.success).length;
        this.toast.showSuccess(`تایید گروهی سرپرست برای ${succCount} خودرو با موفقیت ثبت شد.`);
        this.selectedVehicleIds.clear();
        this.closeBatchApproveModal();
        this.fetchFleetData();
      },
      error: (err: any) => {
        this.isBatchApproving = false;
        this.toast.showError(err?.error?.error || 'خطا در ثبت تایید گروهی سرپرست');
      }
    });
  }

  // ─── تسک ۸.۲: مودال پرونده و جزئیات ───
  openViewVehicleModal(v: VehicleDriverProfile): void {
    this.selectedViewVehicle = v;
    this.vehicleBankAccounts = [];
    this.vehicleDocuments = [];
    this.isViewVehicleModalOpen = true;

    if (v.id) {
      this.isLoadingVehicleDetails = true;
      this.personnelApi.getVehicleBankAccounts(v.id).subscribe({
        next: (accs) => {
          this.vehicleBankAccounts = accs || [];
          this.cdr.markForCheck();
        },
        error: () => {}
      });
      this.personnelApi.getVehicleDocuments(v.id).subscribe({
        next: (docs) => {
          this.vehicleDocuments = docs || [];
          this.isLoadingVehicleDetails = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingVehicleDetails = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  closeViewVehicleModal(): void {
    this.isViewVehicleModalOpen = false;
    this.selectedViewVehicle = null;
    this.vehicleBankAccounts = [];
    this.vehicleDocuments = [];
  }

  // ─── اکشن‌های تایید ───
  openApproveModal(type: 'new' | 'work_logs' | 'changes', item: any): void {
    const title = type === 'new'
      ? `تایید اولیه خودرو: ${item.plate_number || item.model_name || ''}`
      : type === 'work_logs'
      ? `تایید کارکرد خودرو: ${item.plate_number || ''}`
      : `تایید درخواست تغییرات خودرو: ${item.plate_number || ''}`;
    this.approvalTarget = { type, item, title };
    this.approvalNote = '';
    this.isApprovalModalOpen = true;
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
      this.personnelApi.approveVehicleSupervisor(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess(`خودرو «${item.plate_number || ''}» تایید و به حسابداری ارسال شد.`);
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || err?.error?.error || 'خطا در ثبت تایید سرپرست');
        }
      });
    } else if (type === 'work_logs') {
      const targetId = item.id || item.trip_id;
      this.personnelApi.patchVehicleTrip(targetId, { notes: this.approvalNote || 'تایید سرپرست' }).subscribe({
        next: () => {
          this.toast.showSuccess(`کارکرد خودرو «${item.plate_number || ''}» با موفقیت تایید شد.`);
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || 'خطا در تایید کارکرد');
        }
      });
    } else if (type === 'changes') {
      this.personnelApi.approveVehicleChangeRequestSupervisor(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess('درخواست تغییرات خودرو با موفقیت تایید شد.');
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchFleetData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || 'خطا در تایید تغییرات');
        }
      });
    }
  }

  // ─── تسک ۸.۳: اکشن‌های عودت و رد با هشدار Purge بر مبنای delete_impact ───
  openRejectModal(type: 'new' | 'work_logs' | 'changes', item: any, action: 'reject' | 'revision'): void {
    const actionTitle = action === 'revision' ? 'عودت به بازنگری' : 'رد قطعی پرونده خودرو';
    const title = `${actionTitle}: ${item.plate_number || item.model_name || ''}`;
    this.rejectTarget = { type, item, action, title };
    this.rejectReason = '';
    this.isPurgeCandidate = false;
    this.deleteImpactResult = null;
    this.isLoadingImpact = false;
    this.isRejectModalOpen = true;

    // استعلام اثرات حذف و بررسی سابقه برای هشدار Purge
    if (action === 'reject' && type === 'new' && item.id) {
      this.isLoadingImpact = true;
      this.personnelApi.getVehicleDeleteImpact(item.id).subscribe({
        next: (res) => {
          this.isLoadingImpact = false;
          this.deleteImpactResult = res;
          if (res?.can_delete || !res?.has_history) {
            this.isPurgeCandidate = true;
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingImpact = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  closeRejectModal(): void {
    this.isRejectModalOpen = false;
    this.rejectTarget = null;
    this.rejectReason = '';
    this.isPurgeCandidate = false;
    this.deleteImpactResult = null;
    this.isLoadingImpact = false;
  }

  submitReject(): void {
    if (!this.rejectTarget || !this.rejectReason.trim()) {
      this.toast.showWarning('لطفاً دلیل مستند عودت یا رد را وارد فرمایید.');
      return;
    }
    this.isRejecting = true;
    const { type, item, action } = this.rejectTarget;

    if (type === 'new') {
      if (action === 'revision') {
        this.personnelApi.requestVehicleRevision(item.id, this.rejectReason.trim()).subscribe({
          next: () => {
            this.toast.showSuccess('پرونده خودرو جهت بازنگری و اصلاح مدارک به کارمند عودت داده شد.');
            this.isRejecting = false;
            this.closeRejectModal();
            this.fetchFleetData();
          },
          error: (err: any) => {
            this.isRejecting = false;
            this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در عودت پرونده خودرو');
          }
        });
      } else {
        this.personnelApi.rejectVehicle(item.id, this.rejectReason.trim()).subscribe({
          next: () => {
            if (this.isPurgeCandidate) {
              this.toast.showSuccess('پرونده خودرو با توجه به عدم سابقه، به صورت دائم از سیستم پاک‌سازی (Purge) شد.');
            } else {
              this.toast.showSuccess('پرونده خودرو با موفقیت رد و در سوابق بایگانی شد.');
            }
            this.isRejecting = false;
            this.closeRejectModal();
            this.fetchFleetData();
          },
          error: (err: any) => {
            this.isRejecting = false;
            this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در رد پرونده خودرو');
          }
        });
      }
    } else if (type === 'work_logs') {
      const targetId = item.id || item.trip_id;
      this.personnelApi.patchVehicleTrip(targetId, { notes: `عودت سرپرست: ${this.rejectReason}` }).subscribe({
        next: () => {
          this.toast.showWarning('کارکرد خودرو جهت اصلاح عودت داده شد.');
          this.isRejecting = false;
          this.closeRejectModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isRejecting = false;
          this.toast.showError(err?.error?.detail || 'خطا در ثبت عودت کارکرد');
        }
      });
    } else if (type === 'changes') {
      this.personnelApi.cancelVehicleChangeRequest(item.id, this.rejectReason.trim()).subscribe({
        next: () => {
          this.toast.showSuccess('درخواست تغییرات با موفقیت رد شد.');
          this.isRejecting = false;
          this.closeRejectModal();
          this.fetchFleetData();
        },
        error: (err: any) => {
          this.isRejecting = false;
          this.toast.showError(err?.error?.error || 'خطا در رد درخواست تغییرات');
        }
      });
    }
  }

  // ─── مقایسه تغییرات (Diff Viewer) ───
  openDiffModal(cr: VehicleChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];
    this.diffAuditLogs = [];
    const proposed = (cr.proposed_changes || {}) as Record<string, any>;
    const current = (cr.previous_values || {}) as Record<string, any>;

    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(current)]));
    for (const key of allKeys) {
      if (['id', 'created_at', 'updated_at', 'vehicle'].includes(key)) continue;
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

    if (cr.id && typeof this.personnelApi.getWorkflowAuditLogs === 'function') {
      this.isLoadingDiffLogs = true;
      this.personnelApi.getWorkflowAuditLogs({ content_type: 'vehiclechangerequest', object_id: cr.id }).subscribe({
        next: (logs: any) => {
          this.diffAuditLogs = Array.isArray(logs) ? logs : (logs?.results || []);
          this.isLoadingDiffLogs = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingDiffLogs = false;
          this.cdr.markForCheck();
        }
      });
    }

    this.isDiffModalOpen = true;
  }

  closeDiffModal(): void {
    this.isDiffModalOpen = false;
    this.selectedDiffCR = null;
    this.diffFieldRows = [];
    this.diffAuditLogs = [];
  }

  exportExcel(): void {
    this.isExportingExcel = true;
    const params: any = {};
    if (this.selectedSectionId) params.section_id = this.selectedSectionId;
    this.personnelApi.exportVehiclesExcel(params).subscribe({
      next: (blob: Blob) => {
        this.isExportingExcel = false;
        void saveBlob(blob, `Fleet_Vehicles_${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.toast.showSuccess('خروجی اکسل ناوگان با موفقیت صادر گردید.');
      },
      error: () => {
        this.isExportingExcel = false;
        this.toast.showError('خطا در دریافت خروجی اکسل ناوگان.');
      }
    });
  }

  copyToClipboard(text: string, id?: number): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (id !== undefined) {
        this.copiedId = id;
      }
      this.toast.showSuccess('در حافظه کپی شد: ' + text);
      setTimeout(() => {
        if (id !== undefined && this.copiedId === id) this.copiedId = null;
        this.cdr.markForCheck();
      }, 2000);
    });
  }

  getFieldLabel(field: string): string {
    const dict: Record<string, string> = {
      plate_number: 'شماره پلاک',
      model_name: 'مدل / برند',
      driver_name: 'نام راننده',
      driver_phone: 'موبایل راننده',
      owner_name: 'مالک خودرو',
      sheba_number: 'شماره شبا',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      vehicle_type: 'نوع خودرو',
      insurance_expiry_date: 'انقضای بیمه',
      inspection_expiry_date: 'انقضای معاینه فنی',
      license_expiry_date: 'انقضای گواهینامه',
      valid_until_date: 'پایان قرارداد'
    };
    return dict[field] || field;
  }

  onEscapeKey(): void {
    if (this.isApprovalModalOpen && !this.isApproving) this.closeApproveModal();
    if (this.isBatchApproveModalOpen && !this.isBatchApproving) this.closeBatchApproveModal();
    if (this.isRejectModalOpen && !this.isRejecting) this.closeRejectModal();
    if (this.isViewVehicleModalOpen) this.closeViewVehicleModal();
    if (this.isDiffModalOpen) this.closeDiffModal();
  }
}
