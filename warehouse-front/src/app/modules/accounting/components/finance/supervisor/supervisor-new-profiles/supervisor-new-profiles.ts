import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, PersonnelChangeRequest, VehicleChangeRequest } from '../../../../../../core/models/personnel.model';

import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export type SupervisorNewProfilesSubTab = 'personnel' | 'vehicles' | 'change_requests' | 'all';

@Component({
  selector: 'app-supervisor-new-profiles-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CommandCenterComponent,
    TabBarComponent,
    ActionButtonComponent,
  ],
  templateUrl: './supervisor-new-profiles.html',
  styleUrl: './supervisor-new-profiles.css'
})
export class SupervisorNewProfilesHubComponent implements OnInit, OnDestroy {
  activeSubTab: SupervisorNewProfilesSubTab = 'personnel';

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  isLoading = false;
  personnelItems: any[] = [];
  vehicleItems: any[] = [];
  personnelChangeRequests: PersonnelChangeRequest[] = [];
  vehicleChangeRequests: VehicleChangeRequest[] = [];

  // ─── پنجره مقایسه تغییرات (Diff Modal) ───
  isDiffModalOpen = false;
  diffTargetType: 'personnel' | 'vehicle' = 'personnel';
  selectedDiffCR: any = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];
  diffAuditLogs: any[] = [];
  isLoadingDiffLogs = false;

  statusCounters = {
    personnel: 0,
    vehicles: 0,
    change_requests: 0,
    all: 0
  };

  // ─── مودال ثبت توضیحات و تایید (Approval Note Modal) ───
  isApprovalModalOpen = false;
  approvalTarget: { type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr'; item: any; title: string } | null = null;
  approvalNote = '';
  isApproving = false;

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
      if (params['tab'] && ['personnel', 'vehicles', 'change_requests', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
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
          this.fetchProfiles();
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
              this.fetchProfiles();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchProfiles();
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
    this.fetchProfiles();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchProfiles();
  }

  // Memoized tabs for app-tab-bar (getter با آرایه تازه در هر چرخه، در dev mode خطای NG0100 می‌دهد)
  private profileSubTabsKey = '';
  private profileSubTabsCache: TabDef[] = [];
  get profileSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.personnel}:${sc.vehicles}:${sc.change_requests}:${sc.all}`;
    if (key !== this.profileSubTabsKey) {
      this.profileSubTabsKey = key;
      this.profileSubTabsCache = [
        { id: 'personnel', label: 'پرسنل جدید', shortLabel: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.newPersonnel, count: sc.personnel },
        { id: 'vehicles', label: 'خودروهای جدید', shortLabel: 'خودرو', icon: ACCOUNTING_ENTITY_ICONS.fleet, count: sc.vehicles },
        {
          id: 'change_requests',
          label: 'درخواست‌های تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.change_requests,
          tone: 'amber',
          // مثل پیش از کوچ فقط این تب نشانه چشمک‌زن دارد
          indicator: sc.change_requests > 0 ? { tone: 'amber', label: 'درخواست تغییرات در انتظار تایید', pulse: true } : undefined,
        },
        { id: 'all', label: 'کل پیش‌نویس‌ها', shortLabel: 'همه', icon: 'status-all', count: sc.all, tone: 'slate' },
      ];
    }
    return this.profileSubTabsCache;
  }

  switchSubTab(tab: string): void {
    if (tab === 'personnel' || tab === 'vehicles' || tab === 'change_requests' || tab === 'all') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.fetchProfiles();
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

  fetchProfiles(): void {
    this.isLoading = true;
    const params: any = { approval_status: 'pending_supervisor,draft' };
    if (this.selectedSectionId) {
      params.section_id = this.selectedSectionId;
    }
    if (this.searchQuery.trim()) {
      params.search = this.searchQuery.trim();
    }

    this.personnelApi.getPersonnelProfiles(params).subscribe({
      next: (pList: any[]) => {
        this.personnelItems = pList || [];
        this.updateCounters();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در دریافت لیست پرسنل: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });

    this.personnelApi.getVehicleProfiles(params).subscribe({
      next: (vList: any[]) => {
        this.vehicleItems = vList || [];
        this.updateCounters();
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      }
    });

    // دریافت درخواست‌های تغییرات پرسنل جهت تایید مرحله اول سرپرست
    this.personnelApi.getPersonnelChangeRequests({ status: 'pending_supervisor' }).subscribe({
      next: (crList: any) => {
        const all: PersonnelChangeRequest[] = Array.isArray(crList) ? crList : ((crList as any)?.results || []);
        this.personnelChangeRequests = all.filter((cr: any) => cr.status === 'pending_supervisor' || cr.status === 'draft');
        this.updateCounters();
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      }
    });

    // دریافت درخواست‌های تغییرات ناوگان جهت تایید مرحله اول سرپرست
    this.personnelApi.getVehicleChangeRequests({ status: 'pending_supervisor' }).subscribe({
      next: (vcrList: any) => {
        const all: VehicleChangeRequest[] = Array.isArray(vcrList) ? vcrList : ((vcrList as any)?.results || []);
        this.vehicleChangeRequests = all.filter((cr: any) => cr.status === 'pending_supervisor' || cr.status === 'draft');
        this.updateCounters();
        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      }
    });
  }

  private updateCounters(): void {
    this.statusCounters.personnel = this.personnelItems.length;
    this.statusCounters.vehicles = this.vehicleItems.length;
    this.statusCounters.change_requests = this.personnelChangeRequests.length + this.vehicleChangeRequests.length;
    this.statusCounters.all = this.personnelItems.length + this.vehicleItems.length + this.statusCounters.change_requests;

    // رفع نقطه کور بصری (Blindspot): اگر پرسنل جدید صفر باشد ولی درخواست تغییرات وجود داشته باشد و کاربر تب خاصی انتخاب نکرده باشد
    if (!this.route?.snapshot?.queryParams?.['tab'] && this.activeSubTab === 'personnel' && this.personnelItems.length === 0 && this.statusCounters.change_requests > 0) {
      this.activeSubTab = 'change_requests';
    }
  }

  openApprovalModal(type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr', item: any): void {
    const title = type === 'personnel'
      ? `تایید پرونده پرسنل: ${item.first_name || ''} ${item.last_name || ''}`
      : type === 'vehicle'
      ? `تایید پرونده خودرو: ${item.plate_number || ''}`
      : type === 'personnel_cr'
      ? `تایید تغییرات پرسنل: ${item.personnel_name || ''}`
      : `تایید تغییرات خودرو: ${item.plate_number || ''}`;
    this.approvalTarget = { type, item, title };
    this.approvalNote = '';
    this.isApprovalModalOpen = true;
    this.cdr.detectChanges();
  }

  closeApprovalModal(): void {
    this.isApprovalModalOpen = false;
    this.approvalTarget = null;
    this.approvalNote = '';
    this.cdr.detectChanges();
  }

  confirmApproval(): void {
    if (!this.approvalTarget) return;
    const { type, item } = this.approvalTarget;
    const note = this.approvalNote.trim() || undefined;
    this.isApproving = true;

    if (type === 'personnel') {
      this.approvePersonnel(item, note);
    } else if (type === 'vehicle') {
      this.approveVehicle(item, note);
    } else if (type === 'personnel_cr') {
      this.approvePersonnelChange(item, note);
    } else if (type === 'vehicle_cr') {
      this.approveVehicleChange(item, note);
    }
  }

  approvePersonnel(item: any, note?: string): void {
    const req$ = note
      ? this.personnelApi.approvePersonnelSupervisor(item.id, note)
      : this.personnelApi.approvePersonnelSupervisor(item.id);
    req$.subscribe({
      next: () => {
        this.isApproving = false;
        this.closeApprovalModal();
        this.toast.success(`پرونده پرسنل ${item.first_name} ${item.last_name} تایید و جهت بررسی به حسابداری ارجاع شد.`);
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.isApproving = false;
        this.toast.error('خطا در تایید پرونده پرسنل: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  rejectPersonnel(item: any): void {
    this.personnelApi.requestPersonnelRevision(item.id, 'نیازمند بازنگری مدارک توسط اپراتور').subscribe({
      next: () => {
        this.toast.warning(`پرونده پرسنل ${item.first_name} ${item.last_name} جهت اصلاح مدارک عودت شد.`);
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.toast.error('خطا در عودت پرونده پرسنل: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  approveVehicle(item: any, note?: string): void {
    const req$ = note
      ? this.personnelApi.approveVehicleSupervisor(item.id, note)
      : this.personnelApi.approveVehicleSupervisor(item.id);
    req$.subscribe({
      next: () => {
        this.isApproving = false;
        this.closeApprovalModal();
        this.toast.success(`خودرو ${item.plate_number} تایید و به مرحله مالی ارسال گردید.`);
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.isApproving = false;
        this.toast.error('خطا در تایید خودرو: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  rejectVehicle(item: any): void {
    this.personnelApi.requestVehicleRevision(item.id, 'نیازمند اصلاح مدارک ناوگان توسط اپراتور').subscribe({
      next: () => {
        this.toast.warning(`پرونده خودرو ${item.plate_number} عودت گردید.`);
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.toast.error('خطا در عودت خودرو: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  approvePersonnelChange(cr: PersonnelChangeRequest, note?: string): void {
    const req$ = note
      ? this.personnelApi.approvePersonnelChangeRequestSupervisor(cr.id, note)
      : this.personnelApi.approvePersonnelChangeRequestSupervisor(cr.id);
    req$.subscribe({
      next: (res: any) => {
        this.isApproving = false;
        this.closeApprovalModal();
        this.toast.success(res?.message || `تغییرات پرسنل «${cr.personnel_name || ''}» تایید و به کارتابل حسابداری ارسال شد.`);
        this.isDiffModalOpen = false;
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.isApproving = false;
        this.toast.error('خطا در تایید تغییرات پرسنل: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  rejectPersonnelChange(cr: PersonnelChangeRequest): void {
    const reason = prompt('لطفاً دلیل عودت/رد درخواست تغییرات را وارد نمایید:', 'عدم تایید تغییرات توسط سرپرست');
    if (reason === null) return;
    this.personnelApi.rejectPersonnelChangeRequest(cr.id, reason.trim() || 'عدم تایید تغییرات توسط سرپرست').subscribe({
      next: () => {
        this.toast.warning(`درخواست تغییرات «${cr.personnel_name || ''}» عودت داده شد.`);
        this.isDiffModalOpen = false;
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.toast.error('خطا در رد درخواست تغییرات: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  approveVehicleChange(cr: VehicleChangeRequest, note?: string): void {
    const req$ = note
      ? this.personnelApi.approveVehicleChangeRequestSupervisor(cr.id, note)
      : this.personnelApi.approveVehicleChangeRequestSupervisor(cr.id);
    req$.subscribe({
      next: (res: any) => {
        this.isApproving = false;
        this.closeApprovalModal();
        this.toast.success(res?.message || `تغییرات خودرو «${cr.plate_number || ''}» تایید و به کارتابل حسابداری ارسال شد.`);
        this.isDiffModalOpen = false;
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.isApproving = false;
        this.toast.error('خطا در تایید تغییرات ناوگان: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  rejectVehicleChange(cr: VehicleChangeRequest): void {
    const reason = prompt('لطفاً دلیل عودت/رد تغییرات خودرو را وارد نمایید:', 'عدم تایید تغییرات توسط سرپرست');
    if (reason === null) return;
    this.personnelApi.rejectVehicleChangeRequest(cr.id, reason.trim() || 'عدم تایید تغییرات توسط سرپرست').subscribe({
      next: () => {
        this.toast.warning(`درخواست تغییرات خودرو «${cr.plate_number || ''}» عودت داده شد.`);
        this.isDiffModalOpen = false;
        this.fetchProfiles();
      },
      error: (err: any) => {
        this.toast.error('خطا در رد تغییرات ناوگان: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  openDiffModal(cr: any, type: 'personnel' | 'vehicle'): void {
    this.diffTargetType = type;
    this.selectedDiffCR = cr;
    this.isDiffModalOpen = true;
    this.diffFieldRows = [];

    const proposed = cr.proposed_changes || {};
    const previous = cr.previous_values || {};
    const payload = cr.changes_payload || {};
    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(previous), ...Object.keys(payload)]));

    const labels: Record<string, string> = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      father_name: 'نام پدر',
      daily_base_wage: 'مزد روزانه پایه',
      daily_seniority_bonus: 'پایه سنواتی روزانه',
      base_daily_rate: 'مزد مبنا روزانه',
      job_title: 'سمت شغلی',
      job_grade: 'گروه شغلی',
      contract_type: 'نوع قرارداد',
      phone_number: 'شماره تماس',
      marital_status: 'وضعیت تاهل',
      children_count: 'تعداد فرزندان',
      sheba_number: 'شماره شبا',
      account_number: 'شماره حساب',
      bank_name: 'نام بانک',
      driver_name: 'نام راننده',
      plate_number: 'شماره پلاک',
      model_name: 'مدل خودرو',
      vehicle_type: 'نوع خودرو',
      default_service_rate: 'نرخ پایه هر سرویس',
      driver_phone: 'شماره تماس راننده',
      ownership_type: 'نوع مالکیت'
    };

    for (const key of allKeys) {
      let oldVal = previous[key];
      let newVal = proposed[key];

      if (oldVal === undefined && payload[key]?.old !== undefined) {
        oldVal = payload[key].old;
      }
      if (newVal === undefined && payload[key]?.new !== undefined) {
        newVal = payload[key].new;
      }
      if (newVal === undefined && payload[key] !== undefined && typeof payload[key] !== 'object') {
        newVal = payload[key];
      }

      this.diffFieldRows.push({
        field_name: key,
        field_label: labels[key] || this.getFieldNameLabel(key),
        old_value: this.formatChangeValue(key, oldVal),
        new_value: this.formatChangeValue(key, newVal),
        is_changed: String(oldVal ?? '') !== String(newVal ?? '')
      });
    }

    this.diffAuditLogs = [];
    this.isLoadingDiffLogs = true;
    const modelName = type === 'personnel' ? 'personnelchangerequest' : 'vehiclechangerequest';
    this.personnelApi.getWorkflowAuditLogs({ content_type: modelName, object_id: cr.id }).subscribe({
      next: (logs: any) => {
        this.diffAuditLogs = Array.isArray(logs) ? logs : (logs?.results || []);
        this.isLoadingDiffLogs = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingDiffLogs = false;
        this.cdr.detectChanges();
      }
    });
  }

  getFieldNameLabel(field: string): string {
    const fieldMap: Record<string, string> = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      father_name: 'نام پدر',
      job_title: 'سمت شغلی',
      daily_base_wage: 'مزد پایه روزانه',
      contract_type: 'نوع قرارداد',
      phone_number: 'شماره همراه',
      marital_status: 'وضعیت تاهل',
      children_count: 'تعداد فرزندان',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      sheba_number: 'شماره شبا',
      plate_number: 'پلاک انتظامی',
      driver_name: 'نام راننده',
      model_name: 'مدل خودرو'
    };
    return fieldMap[field] || field;
  }

  getProposedChangeKeys(changes: Record<string, any> | undefined | null): string[] {
    return Object.keys(changes || {});
  }

  formatChangeValue(key: string, val: any): string {
    if (val === null || val === undefined || val === '') return 'خالی';
    if (key === 'daily_base_wage') {
      const n = Number(val);
      return !isNaN(n) ? `${n.toLocaleString('fa-IR')} ریال` : String(val);
    }
    return String(val);
  }

  exportExcel(): void {
    const params: any = { approval_status: 'draft' };
    if (this.selectedSectionId) params.section_id = this.selectedSectionId;
    if (this.searchQuery.trim()) params.search = this.searchQuery.trim();

    this.personnelApi.exportPersonnelExcel(params).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'draft_personnel.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.success('فایل اکسل پیش‌نویس‌ها با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل اکسل پیش‌نویس‌ها.');
      }
    });
  }

  importExcel(): void {
    this.personnelApi.downloadPersonnelTemplate().subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'personnel_template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.success('قالب اکسل پرسنل آماده بارگیری است.');
      },
      error: () => {
        this.toast.error('خطا در دریافت قالب اکسل.');
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
  }
}
