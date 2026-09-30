import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  ProjectSection,
  Counterparty,
  ExpenseInvoice,
  AttendanceMatrixRow,
  VehicleMatrixRow,
  PersonnelProfile,
  VehicleDriverProfile
} from '../../../core/models/personnel.model';
import { PersonnelApiService } from '../../../core/api/personnel-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../services/toast.service';
import { cleanShebaInput, validateSheba } from '../../../core/utils/sheba-utils';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';

export type PortalTab = 'attendance' | 'fleet' | 'invoices' | 'petty_cash' | 'new_vehicle' | 'new_personnel';

@Component({
  selector: 'app-employee-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './employee-portal.html',
  styleUrls: ['./employee-portal.css']
})
export class EmployeePortalComponent implements OnInit, OnDestroy {
  // Navigation & Tabs
  activeTab: PortalTab = 'attendance';
  isLoading: boolean = false;
  isSaving: boolean = false;

  // Sections & Active Scope
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;

  // Global Date State (Shamsi)
  todayShamsi: string = '';
  selectedDateShamsi: string = '';

  // Tab 1: Attendance
  attendanceRows: AttendanceMatrixRow[] = [];
  attendanceSearch: string = '';

  // Tab 2: Fleet
  fleetRows: VehicleMatrixRow[] = [];
  fleetSearch: string = '';

  // Tab 3: Invoices & Counterparties
  invoices: ExpenseInvoice[] = [];
  counterparties: Counterparty[] = [];
  invoiceSearch: string = '';
  isNewInvoiceModalOpen: boolean = false;
  isQuickCounterpartyModalOpen: boolean = false;

  newInvoice: Partial<ExpenseInvoice> = {
    section: 0,
    counterparty: undefined,
    invoice_number: '',
    invoice_date_shamsi: '',
    amount: 0,
    category: 'تعمیرات و نگهداری',
    description: '',
    status: 'draft'
  };
  selectedInvoiceAttachment: File | null = null;

  newCounterparty: Partial<Counterparty> = {
    name: '',
    counterparty_type: 'repair_shop',
    phone: '',
    national_id: '',
    bank_name: '',
    sheba_number: '',
    is_active: true
  };
  counterpartyShebaValidation: any = null;

  // Tab 4: New Vehicle (Draft)
  recentVehicles: VehicleDriverProfile[] = [];
  newVehicle: Partial<VehicleDriverProfile> = {
    plate_number: '',
    vehicle_type: 'nissan',
    ownership_type: 'contract',
    driver_name: '',
    driver_national_code: '',
    driver_phone: '',
    default_service_rate: 0,
    bank_name: '',
    account_number: '',
    sheba_number: '',
    approval_status: 'draft'
  };
  vehicleShebaValidation: any = null;

  // Tab 5: New Personnel (Draft)
  recentPersonnel: PersonnelProfile[] = [];
  newPersonnel: Partial<PersonnelProfile> = {
    first_name: '',
    last_name: '',
    national_code: '',
    father_name: '',
    job_title: 'کارگر انبار',
    contract_type: 'daily',
    marital_status: 'single',
    phone_number: '',
    bank_name: '',
    account_number: '',
    sheba_number: '',
    approval_status: 'draft'
  };
  personnelShebaValidation: any = null;

  private subs: Subscription[] = [];

  constructor(
    public auth: AuthService,
    private personnelApi: PersonnelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() public activeCompanyService?: ActiveCompanyService
  ) {}

  ngOnInit(): void {
    this.initTodayShamsi();
    this.loadMySections();

    if (this.activeCompanyService?.activeCompany$) {
      this.subs.push(
        this.activeCompanyService.activeCompany$.subscribe(() => {
          this.loadMySections();
        })
      );
    }

    // Query params sync
    this.subs.push(
      this.route.queryParams.subscribe(params => {
        if (params['tab'] && ['attendance', 'fleet', 'invoices', 'new_vehicle', 'new_personnel'].includes(params['tab'])) {
          this.activeTab = params['tab'] as PortalTab;
        }
        if (params['date']) {
          this.selectedDateShamsi = params['date'];
        }
        if (params['section_id']) {
          const sId = Number(params['section_id']);
          if (!isNaN(sId) && sId !== this.selectedSectionId) {
            this.selectedSectionId = sId;
            if (this.mySections.length > 0) {
              this.selectedSection = this.mySections.find(s => s.id === sId) || null;
              this.refreshCurrentTab();
            }
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private initTodayShamsi(): void {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(now);

      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      this.todayShamsi = `${y}/${m}/${d}`;
      this.selectedDateShamsi = this.todayShamsi;
    } catch {
      this.todayShamsi = '1405/01/01';
      this.selectedDateShamsi = this.todayShamsi;
    }
  }

  loadMySections(): void {
    this.isLoading = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          // If no assigned sections, fallback to all project sections for superuser/admin
          const isSuper = this.auth.user()?.is_superuser || (this.auth.userPermissions() || []).includes('admin_all');
          if (isSuper) {
            this.personnelApi.getProjectSections({ is_active: true }).subscribe({
              next: (allSecs: ProjectSection[]) => {
                this.mySections = allSecs || [];
                this.pickDefaultSection();
              },
              error: () => {
                this.isLoading = false;
                this.cdr.detectChanges();
              }
            });
            return;
          }
        }
        this.pickDefaultSection();
      },
      error: (err: any) => {
        console.error('Error loading sections', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
      this.refreshCurrentTab();
    } else {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section_id: this.selectedSectionId },
      queryParamsHandling: 'merge'
    });
    this.refreshCurrentTab();
  }

  switchTab(tab: PortalTab): void {
    if (tab === 'petty_cash') {
      this.router.navigate(['/app/accounting/employee-petty-cash'], {
        queryParams: { section_id: this.selectedSectionId },
        queryParamsHandling: 'merge'
      });
      return;
    }
    this.activeTab = tab;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge'
    });
    this.refreshCurrentTab();
  }

  onDateChanged(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: this.selectedDateShamsi },
      queryParamsHandling: 'merge'
    });
    if (this.activeTab === 'attendance') {
      this.loadAttendanceMatrix();
    } else if (this.activeTab === 'fleet') {
      this.loadFleetMatrix();
    }
  }

  refreshCurrentTab(): void {
    if (!this.selectedSectionId) return;

    if (this.activeTab === 'attendance') {
      this.loadAttendanceMatrix();
    } else if (this.activeTab === 'fleet') {
      this.loadFleetMatrix();
    } else if (this.activeTab === 'invoices') {
      this.loadInvoices();
      this.loadCounterparties();
    } else if (this.activeTab === 'new_vehicle') {
      this.loadRecentVehicles();
    } else if (this.activeTab === 'new_personnel') {
      this.loadRecentPersonnel();
    }
  }

  // ─── Tab 1: Attendance Operations ───
  loadAttendanceMatrix(): void {
    if (!this.selectedSectionId) return;
    this.isLoading = true;
    this.personnelApi
      .getAttendanceMatrix(null, this.selectedDateShamsi, {
        section_id: this.selectedSectionId
      })
      .subscribe({
        next: res => {
          this.attendanceRows = res.rows || [];
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.toast.show('error', 'خطا در بارگذاری کارکرد پرسنل: ' + (err.error?.error || err.message));
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  get filteredAttendanceRows(): AttendanceMatrixRow[] {
    if (!this.attendanceSearch.trim()) return this.attendanceRows;
    const q = this.attendanceSearch.trim().toLowerCase();
    return this.attendanceRows.filter(
      r =>
        (r.full_name && r.full_name.toLowerCase().includes(q)) ||
        (r.national_code && r.national_code.includes(q)) ||
        (r.job_title && r.job_title.toLowerCase().includes(q))
    );
  }

  toggleAttendanceStatus(row: AttendanceMatrixRow, status: string): void {
    if (row.status === status) {
      // Toggle off to null/empty
      row.status = '' as any;
      row.effective_hours = 0;
      row.overtime_hours = 0;
      row.is_friday_work = false;
    } else {
      row.status = status as any;
      if (status === 'PRESENT_10H') {
        row.effective_hours = 10;
        row.overtime_hours = 0;
        row.is_friday_work = false;
      } else if (status === 'HALF_5H') {
        row.effective_hours = 5;
        row.overtime_hours = 0;
        row.is_friday_work = false;
      } else if (status === 'FRIDAY_WORK') {
        row.effective_hours = 10;
        row.is_friday_work = true;
      } else if (status === 'ABSENT' || status === 'LEAVE') {
        row.effective_hours = 0;
        row.overtime_hours = 0;
        row.is_friday_work = false;
      }
    }
    this.cdr.detectChanges();
  }

  setAttendanceStatus(row: AttendanceMatrixRow, status: any): void {
    this.toggleAttendanceStatus(row, status);
  }

  saveAttendanceMatrix(): void {
    if (!this.selectedSectionId) return;
    this.isSaving = true;

    const payload = {
      warehouse_id: null,
      section_id: this.selectedSectionId,
      date_shamsi: this.selectedDateShamsi,
      items: this.attendanceRows.map(r => ({
        personnel_id: r.personnel_id,
        status: r.status || 'present',
        effective_hours: Number(r.effective_hours) || 0,
        overtime_hours: Number(r.overtime_hours) || 0,
        is_friday_work: Boolean(r.is_friday_work),
        is_mission: Boolean(r.is_mission),
        advance_payment: Number(r.advance_payment) || 0,
        notes: r.notes || ''
      }))
    };

    this.personnelApi.saveAttendanceBulk(payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', `کارکرد روز ${this.selectedDateShamsi} با موفقیت ذخیره شد.`);
        this.loadAttendanceMatrix();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ذخیره کارکرد: ' + (err.error?.error || err.message));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── Tab 2: Fleet Trips Operations ───
  loadFleetMatrix(): void {
    if (!this.selectedSectionId) return;
    this.isLoading = true;
    this.personnelApi
      .getVehicleMatrix(null, this.selectedDateShamsi, {
        section_id: this.selectedSectionId
      })
      .subscribe({
        next: (res: any) => {
          this.fleetRows = res.rows || [];
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.toast.show('error', 'خطا در بارگذاری ناوگان: ' + (err.error?.error || err.message));
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  get filteredFleetRows(): VehicleMatrixRow[] {
    if (!this.fleetSearch.trim()) return this.fleetRows;
    const q = this.fleetSearch.trim().toLowerCase();
    return this.fleetRows.filter(
      r =>
        (r.driver_name && r.driver_name.toLowerCase().includes(q)) ||
        (r.plate_number && r.plate_number.toLowerCase().includes(q))
    );
  }

  saveFleetMatrix(): void {
    if (!this.selectedSectionId) return;
    this.isSaving = true;

    const payload = {
      warehouse_id: null,
      section_id: this.selectedSectionId,
      date_shamsi: this.selectedDateShamsi,
      items: this.fleetRows.map(r => ({
        vehicle_id: r.vehicle_id,
        trip_count: Number(r.trip_count) || 0,
        unit_rate: Number(r.unit_rate) || 0,
        dispatch_reference: r.dispatch_reference || '',
        origin_destination: r.origin_destination || '',
        notes: r.notes || ''
      }))
    };

    this.personnelApi.saveVehicleTripsBulk(payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', `سرویس‌های ناوگان برای تاریخ ${this.selectedDateShamsi} ذخیره شد.`);
        this.loadFleetMatrix();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت سرویس‌ها: ' + (err.error?.error || err.message));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── Tab 3: Invoices & Counterparties ───
  loadInvoices(): void {
    if (!this.selectedSectionId) return;
    this.isLoading = true;
    this.personnelApi.getExpenseInvoices({ section_id: this.selectedSectionId }).subscribe({
      next: (res: ExpenseInvoice[]) => {
        this.invoices = res || [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadCounterparties(): void {
    this.personnelApi.getCounterparties().subscribe({
      next: (res: Counterparty[]) => {
        this.counterparties = res || [];
        this.cdr.detectChanges();
      }
    });
  }

  get filteredInvoices(): ExpenseInvoice[] {
    if (!this.invoiceSearch.trim()) return this.invoices;
    const q = this.invoiceSearch.trim().toLowerCase();
    return this.invoices.filter(
      inv =>
        (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
        (inv.counterparty_name && inv.counterparty_name.toLowerCase().includes(q)) ||
        (inv.description && inv.description.toLowerCase().includes(q))
    );
  }

  openNewInvoiceModal(): void {
    this.newInvoice = {
      section: this.selectedSectionId!,
      invoice_number: '',
      invoice_date_shamsi: this.todayShamsi,
      amount: 0,
      category: 'تعمیرات و نگهداری',
      description: '',
      status: 'draft'
    };
    this.selectedInvoiceAttachment = null;
    this.isNewInvoiceModalOpen = true;
    this.cdr.detectChanges();
  }

  closeNewInvoiceModal(): void {
    this.isNewInvoiceModalOpen = false;
    this.cdr.detectChanges();
  }

  onInvoiceFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.selectedInvoiceAttachment = file;
    }
  }

  saveInvoice(): void {
    if (!this.selectedSectionId) return;
    if (!this.newInvoice.counterparty) {
      this.toast.show('warning', 'لطفاً طرف‌حساب فاکتور را انتخاب کنید.');
      return;
    }
    if (!this.newInvoice.invoice_number?.trim()) {
      this.toast.show('warning', 'شماره فاکتور / رسید الزامی است.');
      return;
    }
    if (!this.newInvoice.amount || this.newInvoice.amount <= 0) {
      this.toast.show('warning', 'مبلغ فاکتور باید بزرگتر از صفر باشد.');
      return;
    }

    this.isSaving = true;
    const payload: Partial<ExpenseInvoice> = {
      ...this.newInvoice,
      section: this.selectedSectionId,
      status: 'draft'
    };

    this.personnelApi.createExpenseInvoice(payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', 'فاکتور هزینه با موفقیت در وضعیت پیش‌نویس ثبت شد.');
        this.closeNewInvoiceModal();
        this.loadInvoices();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت فاکتور: ' + (err.error?.error || err.message));
        this.cdr.detectChanges();
      }
    });
  }

  openQuickCounterpartyModal(): void {
    this.newCounterparty = {
      name: '',
      counterparty_type: 'repair_shop',
      phone: '',
      national_id: '',
      bank_name: '',
      sheba_number: '',
      section: this.selectedSectionId || undefined,
      is_active: true
    };
    this.isQuickCounterpartyModalOpen = true;
    this.cdr.detectChanges();
  }

  closeQuickCounterpartyModal(): void {
    this.isQuickCounterpartyModalOpen = false;
    this.cdr.detectChanges();
  }

  saveQuickCounterparty(): void {
    if (!this.newCounterparty.name?.trim()) {
      this.toast.show('warning', 'نام طرف‌حساب الزامی است.');
      return;
    }

    this.isSaving = true;
    const payload = {
      ...this.newCounterparty,
      section: this.selectedSectionId || undefined
    };

    this.personnelApi.createCounterparty(payload).subscribe({
      next: (created: Counterparty) => {
        this.isSaving = false;
        this.toast.show('success', `طرف‌حساب «${created.name}» با موفقیت افزوده شد.`);
        this.closeQuickCounterpartyModal();
        this.loadCounterparties();
        this.newInvoice.counterparty = created.id;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در تعریف طرف‌حساب: ' + (err.error?.error || err.message));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── Tab 4: New Vehicle (Draft) ───
  loadRecentVehicles(): void {
    if (!this.selectedSectionId) return;
    this.personnelApi.getVehicleProfiles({ section_id: this.selectedSectionId }).subscribe({
      next: (res: VehicleDriverProfile[]) => {
        this.recentVehicles = res || [];
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading vehicles', err);
      }
    });
  }

  onVehicleShebaChange(): void {
    const raw = this.newVehicle.sheba_number || '';
    if (!raw.trim()) {
      this.vehicleShebaValidation = null;
      return;
    }
    const clean = cleanShebaInput(raw);
    const validResult = validateSheba(clean);
    this.vehicleShebaValidation = validResult;
    if (validResult.isValid && validResult.bank) {
      this.newVehicle.bank_name = validResult.bank.name;
    }
  }

  saveVehicleDraft(): void {
    if (!this.selectedSectionId) return;
    if (!this.newVehicle.plate_number?.trim()) {
      this.toast.show('warning', 'شماره پلاک خودرو الزامی است.');
      return;
    }
    if (!this.newVehicle.driver_name?.trim()) {
      this.toast.show('warning', 'نام راننده الزامی است.');
      return;
    }

    this.isSaving = true;
    const payload: Partial<VehicleDriverProfile> = {
      ...this.newVehicle,
      section: this.selectedSectionId,
      approval_status: 'draft'
    };

    this.personnelApi.createVehicleProfile(payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', 'خودرو جدید با موفقیت در وضعیت پیش‌نویس ثبت شد و به کارتابل سرپرست ارسال گردید.');
        this.newVehicle = {
          plate_number: '',
          vehicle_type: 'nissan',
          ownership_type: 'contract',
          driver_name: '',
          driver_national_code: '',
          driver_phone: '',
          default_service_rate: 0,
          bank_name: '',
          account_number: '',
          sheba_number: '',
          approval_status: 'draft'
        };
        this.vehicleShebaValidation = null;
        this.loadRecentVehicles();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت خودرو: ' + (err.error?.error || err.message));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── Tab 5: New Personnel (Draft) ───
  loadRecentPersonnel(): void {
    if (!this.selectedSectionId) return;
    this.personnelApi.getPersonnelProfiles({ section_id: this.selectedSectionId }).subscribe({
      next: (res: PersonnelProfile[]) => {
        this.recentPersonnel = res || [];
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading personnel', err);
      }
    });
  }

  onPersonnelShebaChange(): void {
    const raw = this.newPersonnel.sheba_number || '';
    if (!raw.trim()) {
      this.personnelShebaValidation = null;
      return;
    }
    const clean = cleanShebaInput(raw);
    const validResult = validateSheba(clean);
    this.personnelShebaValidation = validResult;
    if (validResult.isValid && validResult.bank) {
      this.newPersonnel.bank_name = validResult.bank.name;
    }
  }

  savePersonnelDraft(): void {
    if (!this.selectedSectionId) return;
    if (!this.newPersonnel.first_name?.trim() || !this.newPersonnel.last_name?.trim()) {
      this.toast.show('warning', 'نام و نام خانوادگی پرسنل الزامی است.');
      return;
    }
    if (!this.newPersonnel.national_code?.trim() || this.newPersonnel.national_code.length !== 10) {
      this.toast.show('warning', 'کد ملی ۱۰ رقمی الزامی است.');
      return;
    }

    this.isSaving = true;
    const payload: Partial<PersonnelProfile> = {
      ...this.newPersonnel,
      section: this.selectedSectionId,
      approval_status: 'draft'
    };

    this.personnelApi.createPersonnelProfile(payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', 'پرونده پرسنل در وضعیت پیش‌نویس ثبت شد و به کارتابل سرپرست ارسال گردید.');
        this.newPersonnel = {
          first_name: '',
          last_name: '',
          national_code: '',
          father_name: '',
          job_title: 'کارگر انبار',
          contract_type: 'daily',
          marital_status: 'single',
          phone_number: '',
          bank_name: '',
          account_number: '',
          sheba_number: '',
          approval_status: 'draft'
        };
        this.personnelShebaValidation = null;
        this.loadRecentPersonnel();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت پرسنل: ' + (err.error?.error || err.message));
        this.cdr.detectChanges();
      }
    });
  }
}
