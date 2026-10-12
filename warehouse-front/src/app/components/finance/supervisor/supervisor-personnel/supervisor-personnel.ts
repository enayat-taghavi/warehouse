import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { ProjectSection, PersonnelProfile, PersonnelChangeRequest } from '../../../../core/models/personnel.model';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../shared/components/command-center/command-center.component';

export type SupervisorPersonnelSubTab = 'new' | 'attendance' | 'changes' | 'all';

@Component({
  selector: 'app-supervisor-personnel-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SvgIconDirective,
    CommandCenterComponent,
    TabBarComponent,
    ActionButtonComponent,
  ],
  templateUrl: './supervisor-personnel.html',
  styleUrl: './supervisor-personnel.css'
})
export class SupervisorPersonnelHubComponent implements OnInit, OnDestroy {
  activeSubTab: SupervisorPersonnelSubTab = 'new';

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  selectedDateShamsi = '';
  fiscalYear = '1405';
  isLoading = false;

  // لیست‌های داده
  newPersonnelList: PersonnelProfile[] = [];
  attendanceList: any[] = [];
  changeRequestsList: PersonnelChangeRequest[] = [];
  allPersonnelList: PersonnelProfile[] = [];

  // شمارنده‌های زنده کارتابل
  statusCounters = {
    newCount: 0,
    attendanceCount: 0,
    changesCount: 0,
    allCount: 0
  };

  // پنجره ثبت یادداشت تایید (Approval Modal)
  isApprovalModalOpen = false;
  approvalTarget: { type: 'new' | 'attendance' | 'changes'; item: any; title: string } | null = null;
  approvalNote = '';
  isApproving = false;

  // پنجره ثبت علت عودت یا رد (Reject / Revision Modal)
  isRejectModalOpen = false;
  rejectTarget: { type: 'new' | 'attendance' | 'changes'; item: any; action: 'reject' | 'revision'; title: string } | null = null;
  rejectReason = '';
  isRejecting = false;

  // پنجره مقایسه تغییرات (Diff Viewer Modal)
  isDiffModalOpen = false;
  selectedDiffCR: PersonnelChangeRequest | null = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];
  diffAuditLogs: any[] = [];
  isLoadingDiffLogs = false;

  // پنجره مشاهده کامل پرونده (Profile Viewer Modal)
  isViewProfileModalOpen = false;
  selectedViewProfile: PersonnelProfile | null = null;

  // وضعیت و پیام حذف دائم (Purge) در مودال رد
  isLoadingImpact = false;
  isPurgeCandidate = false;
  deleteImpactResult: any = null;

  // تایید گروهی پرونده‌ها (Batch Approval)
  selectedPersonnelIds = new Set<number>();
  isBatchApproveModalOpen = false;
  batchApprovalNote = '';
  isBatchApproving = false;

  copiedId: number | null = null;
  copiedKey: string | null = null;

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
      if (params['tab'] && ['new', 'attendance', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as SupervisorPersonnelSubTab;
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
        if (!this.selectedSectionId || msg.section_id === this.selectedSectionId) {
          this.fetchData();
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
              this.fetchData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchData();
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
    this.fetchData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchData();
  }

  get personnelSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    return [
      {
        id: 'new',
        label: 'پرونده‌های جدید',
        shortLabel: 'جدید',
        icon: 'user-plus',
        count: sc.newCount,
        tone: 'amber',
        indicator: sc.newCount > 0 ? { tone: 'amber', label: 'پرونده جدید نیازمند بررسی', pulse: true } : undefined,
      },
      {
        id: 'attendance',
        label: 'کارکرد و حضورغیاب',
        shortLabel: 'کارکرد',
        icon: 'clock',
        count: sc.attendanceCount,
        tone: 'indigo',
      },
      {
        id: 'changes',
        label: 'درخواست‌های تغییرات',
        shortLabel: 'تغییرات',
        icon: 'refresh-cw',
        count: sc.changesCount,
        tone: 'amber',
        indicator: sc.changesCount > 0 ? { tone: 'amber', label: 'درخواست تغییرات جدید', pulse: true } : undefined,
      },
      {
        id: 'all',
        label: 'همه پرسنل',
        shortLabel: 'همه',
        icon: 'users',
        count: sc.allCount,
        tone: 'slate',
      },
    ];
  }

  switchSubTab(tab: string): void {
    if (tab === 'new' || tab === 'attendance' || tab === 'changes' || tab === 'all') {
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
    if (this.selectedSectionId) {
      baseParams.section_id = this.selectedSectionId;
    }
    if (this.searchQuery.trim()) {
      baseParams.search = this.searchQuery.trim();
    }

    // ۱. پرونده‌های جدید پرسنل در انتظار تایید سرپرست
    this.personnelApi.getPersonnelProfiles({ ...baseParams, approval_status: 'pending_supervisor' }).subscribe({
      next: (pList: any[]) => {
        this.newPersonnelList = pList || [];
        this.statusCounters.newCount = this.newPersonnelList.length;
        const currentIds = new Set(this.newPersonnelList.map(p => p.id));
        for (const id of Array.from(this.selectedPersonnelIds)) {
          if (!currentIds.has(id)) {
            this.selectedPersonnelIds.delete(id);
          }
        }
      },
      error: () => {
        this.newPersonnelList = [];
        this.selectedPersonnelIds.clear();
      }
    });

    // ۲. کارکرد روزانه پرسنل
    const attParams: any = { ...baseParams };
    if (this.selectedDateShamsi) {
      attParams.date_shamsi = this.selectedDateShamsi;
    }
    this.personnelApi.getDailyAttendance(attParams).subscribe({
      next: (attList: any[]) => {
        this.attendanceList = attList || [];
        this.statusCounters.attendanceCount = this.attendanceList.filter(a => a.supervisor_approved === false || a.status === 'pending').length;
      },
      error: () => {
        this.attendanceList = [];
      }
    });

    // ۳. درخواست‌های تغییرات پرسنل
    this.personnelApi.getPersonnelChangeRequests(baseParams).subscribe({
      next: (crList: any[]) => {
        this.changeRequestsList = crList || [];
        this.statusCounters.changesCount = this.changeRequestsList.filter(c => c.status === 'pending_supervisor').length;
      },
      error: () => {
        this.changeRequestsList = [];
      }
    });

    // ۴. تمام پرسنل بخش
    this.personnelApi.getPersonnelProfiles(baseParams).subscribe({
      next: (allList: any[]) => {
        this.allPersonnelList = allList || [];
        this.statusCounters.allCount = this.allPersonnelList.length;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.allPersonnelList = [];
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ─── اکشن‌های تایید ───
  openApproveModal(type: 'new' | 'attendance' | 'changes', item: any): void {
    const title = type === 'new' 
      ? `تایید اولیه پرسنل: ${item.first_name || ''} ${item.last_name || ''}`
      : type === 'attendance'
      ? `تایید کارکرد روزانه: ${item.personnel_name || ''} (${item.date_shamsi || ''})`
      : `تایید درخواست تغییرات: ${item.personnel_name || ''}`;
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
      this.personnelApi.approvePersonnelSupervisor(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess(`پرونده ${item.first_name || ''} ${item.last_name || ''} تایید و به حسابداری ارسال شد.`);
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || 'خطا در ثبت تایید سرپرست');
        }
      });
    } else if (type === 'attendance') {
      this.personnelApi.patchDailyAttendance(item.id, { notes: this.approvalNote ? `${item.notes || ''} | تایید سرپرست: ${this.approvalNote}` : 'تایید سرپرست' }).subscribe({
        next: () => {
          this.toast.showSuccess('کارکرد روزانه با موفقیت تایید شد.');
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || 'خطا در تایید کارکرد');
        }
      });
    } else if (type === 'changes') {
      this.personnelApi.approvePersonnelChangeRequestSupervisor(item.id, this.approvalNote).subscribe({
        next: () => {
          this.toast.showSuccess('درخواست تغییرات با موفقیت تایید شد.');
          this.isApproving = false;
          this.closeApproveModal();
          this.fetchData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.showError(err?.error?.detail || 'خطا در تایید تغییرات');
        }
      });
    }
  }

  // ─── اکشن‌های عودت و رد ───
  openRejectModal(type: 'new' | 'attendance' | 'changes', item: any, action: 'reject' | 'revision'): void {
    const actionTitle = action === 'revision' ? 'عودت به بازنگری' : 'رد قطعی پرونده';
    const title = `${actionTitle}: ${item.first_name || item.personnel_name || ''} ${item.last_name || ''}`;
    this.rejectTarget = { type, item, action, title };
    this.rejectReason = '';
    this.isPurgeCandidate = false;
    this.deleteImpactResult = null;
    this.isLoadingImpact = false;
    this.isRejectModalOpen = true;

    // استعلام اثرات حذف و بررسی شرط Purge دائم برای پرونده‌های پرسنل
    if (action === 'reject' && type === 'new' && item.id && typeof this.personnelApi.getPersonnelDeleteImpact === 'function') {
      this.isLoadingImpact = true;
      this.personnelApi.getPersonnelDeleteImpact(item.id).subscribe({
        next: (res) => {
          this.isLoadingImpact = false;
          this.deleteImpactResult = res;
          // اگر طبق استعلام سرور سابقه کارکرد/مالی نداشته باشد و بتواند حذف شود، هشدار Purge نمایش می‌یابد
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

    if (action === 'revision') {
      this.personnelApi.requestPersonnelRevision(item.id, this.rejectReason.trim()).subscribe({
        next: () => {
          this.toast.showSuccess('پرونده جهت بازنگری و اصلاح مدارک عودت داده شد.');
          this.isRejecting = false;
          this.closeRejectModal();
          this.fetchData();
        },
        error: (err: any) => {
          this.isRejecting = false;
          this.toast.showError(err?.error?.detail || err?.error?.error || 'خطا در عودت پرونده');
        }
      });
    } else {
      this.personnelApi.rejectPersonnel(item.id, this.rejectReason.trim()).subscribe({
        next: () => {
          if (this.isPurgeCandidate) {
            this.toast.showSuccess('پرونده با توجه به عدم سابقه، به صورت دائم از سیستم پاک‌سازی (Purge) شد.');
          } else {
            this.toast.showSuccess('پرونده با موفقیت رد و در سوابق بایگانی شد.');
          }
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
  }

  // ─── پنجره مقایسه تغییرات (Diff Viewer) ───
  openDiffModal(cr: PersonnelChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];
    this.diffAuditLogs = [];
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

    if (cr.id && typeof this.personnelApi.getWorkflowAuditLogs === 'function') {
      this.isLoadingDiffLogs = true;
      this.personnelApi.getWorkflowAuditLogs({ content_type: 'personnelchangerequest', object_id: cr.id }).subscribe({
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
    this.isLoadingDiffLogs = false;
  }

  // ─── پنجره مشاهده کامل پرونده (Profile Viewer Modal) ───
  openViewProfileModal(p: PersonnelProfile): void {
    this.selectedViewProfile = p;
    this.isViewProfileModalOpen = true;
  }

  closeViewProfileModal(): void {
    this.isViewProfileModalOpen = false;
    this.selectedViewProfile = null;
  }

  // ─── تایید گروهی (Batch Approval) ───
  toggleSelectAllPersonnel(event: any): void {
    const isChecked = event?.target?.checked;
    if (isChecked) {
      this.newPersonnelList.forEach(p => {
        if (p.id) this.selectedPersonnelIds.add(p.id);
      });
    } else {
      this.selectedPersonnelIds.clear();
    }
  }

  togglePersonnelSelection(id: number | undefined): void {
    if (id === undefined) return;
    if (this.selectedPersonnelIds.has(id)) {
      this.selectedPersonnelIds.delete(id);
    } else {
      this.selectedPersonnelIds.add(id);
    }
  }

  isPersonnelSelected(id: number | undefined): boolean {
    return id !== undefined && this.selectedPersonnelIds.has(id);
  }

  isAllPersonnelSelected(): boolean {
    return this.newPersonnelList.length > 0 && this.newPersonnelList.every(p => p.id && this.selectedPersonnelIds.has(p.id));
  }

  getSelectedCount(): number {
    return this.selectedPersonnelIds.size;
  }

  openBatchApproveModal(): void {
    if (this.selectedPersonnelIds.size === 0) {
      this.toast.showWarning('هیچ پرونده‌ای برای تایید گروهی انتخاب نشده است.');
      return;
    }
    this.batchApprovalNote = '';
    this.isBatchApproveModalOpen = true;
  }

  closeBatchApproveModal(): void {
    this.isBatchApproveModalOpen = false;
    this.batchApprovalNote = '';
  }

  submitBatchApproval(): void {
    const ids = Array.from(this.selectedPersonnelIds);
    if (ids.length === 0) return;

    this.isBatchApproving = true;
    this.personnelApi.batchApprovePersonnel(ids, 'supervisor', this.batchApprovalNote).subscribe({
      next: (res) => {
        this.isBatchApproving = false;
        this.closeBatchApproveModal();
        const results = res?.results || [];
        const successCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;

        if (failedCount === 0) {
          this.toast.showSuccess(`تمام ${successCount} پرونده با موفقیت تایید و به مرحله حسابداری ارسال شدند.`);
        } else if (successCount > 0) {
          this.toast.showWarning(`${successCount} پرونده تایید شد، اما ${failedCount} مورد با خطا مواجه شد.`);
        } else {
          this.toast.showError('عملیات تایید گروهی با خطا مواجه شد.');
        }

        this.selectedPersonnelIds.clear();
        this.fetchData();
      },
      error: (err) => {
        this.isBatchApproving = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در اجرای تایید گروهی پرسنل');
      }
    });
  }

  // ─── ابزارهای کپی سریع ───
  copyField(val: string | undefined | null, key: string): void {
    if (!val) return;
    navigator.clipboard.writeText(String(val)).then(() => {
      this.copiedKey = key;
      this.toast.showSuccess(`کپی شد: ${val}`);
      setTimeout(() => {
        if (this.copiedKey === key) {
          this.copiedKey = null;
          this.cdr.markForCheck();
        }
      }, 2000);
    });
  }

  isFieldCopied(key: string): boolean {
    return this.copiedKey === key;
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
      insurance_number: 'شماره بیمه'
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
        this.cdr.markForCheck();
      }, 2000);
    });
  }
}
