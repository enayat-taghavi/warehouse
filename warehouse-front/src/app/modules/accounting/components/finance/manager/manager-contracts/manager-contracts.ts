import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../../../core/api/personnel-api.service';
import { ProjectSection } from '../../../../../../core/models/personnel.model';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export interface PersonnelContractItem {
  id: number;
  personnel_name: string;
  national_id: string;
  role_title: string;
  section_name: string;
  daily_wage_base: number; // 10 hours base
  monthly_base: number;
  housing_allowance: number;
  food_allowance: number;
  contract_type: string;
  effective_date: string;
  approval_status: 'pending' | 'manager_approved' | 'rejected';
}

export interface FleetContractItem {
  id: number;
  driver_name: string;
  vehicle_title: string;
  plate_number: string;
  section_name: string;
  monthly_rent: number;
  overtime_hourly_rate: number;
  fuel_quota: number;
  contract_period: string;
  approval_status: 'pending' | 'manager_approved' | 'rejected';
}

@Component({
  selector: 'app-manager-contracts-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TabBarComponent, ActionButtonComponent],
  templateUrl: './manager-contracts.html',
  styleUrl: './manager-contracts.css'
})
export class ManagerContractsComponent implements OnInit, OnDestroy {
  activeSubTab: 'personnel_decrees' | 'fleet_contracts' | 'bonus_penalties' = 'personnel_decrees';

  contractTabs: TabDef[] = [
    { id: 'personnel_decrees', label: 'احکام حقوقی پرسنل', shortLabel: 'احکام', icon: ACCOUNTING_ENTITY_ICONS.personnel },
    { id: 'fleet_contracts', label: 'قراردادهای ناوگان و ماشین‌آلات', shortLabel: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet }
  ];

  // Section Isolation
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Search & Filters
  searchQuery = '';
  fiscalYear = '1405';

  // State
  isLoading = false;

  // Mock Personnel Decrees
  personnelDecrees: PersonnelContractItem[] = [
    {
      id: 1,
      personnel_name: 'علیرضا شمس',
      national_id: '0012345678',
      role_title: 'سرپرست انبار قطعات',
      section_name: 'بخش لجستیک و انبار مرکزی',
      daily_wage_base: 850000,
      monthly_base: 25500000,
      housing_allowance: 9000000,
      food_allowance: 14000000,
      contract_type: 'قرارداد کار معین',
      effective_date: '1405/01/01',
      approval_status: 'pending'
    },
    {
      id: 2,
      personnel_name: 'محمد مرادی',
      national_id: '0029876543',
      role_title: 'اپراتور لیفتراک سنگین',
      section_name: 'بخش تخلیه و بارگیری اسکله',
      daily_wage_base: 720000,
      monthly_base: 21600000,
      housing_allowance: 9000000,
      food_allowance: 14000000,
      contract_type: 'قرارداد موقت یکساله',
      effective_date: '1405/01/01',
      approval_status: 'pending'
    },
    {
      id: 3,
      personnel_name: 'سعید رضایی',
      national_id: '0034567890',
      role_title: 'کارشناس آمار و اسناد',
      section_name: 'بخش اداری و پشتیبانی فنی',
      daily_wage_base: 680000,
      monthly_base: 20400000,
      housing_allowance: 9000000,
      food_allowance: 14000000,
      contract_type: 'قرارداد کار معین',
      effective_date: '1405/01/01',
      approval_status: 'manager_approved'
    }
  ];

  // Mock Fleet Contracts
  fleetContracts: FleetContractItem[] = [
    {
      id: 101,
      driver_name: 'حسین اسماعیلی',
      vehicle_title: 'کشنده اسکانیا R450',
      plate_number: '۷۲ ع ۴۱۵ ایران ۶۸',
      section_name: 'بخش ترابری سنگین',
      monthly_rent: 95000000,
      overtime_hourly_rate: 350000,
      fuel_quota: 2500,
      contract_period: '۱۴۰۵/۰۱ تا ۱۴۰۵/۱۲',
      approval_status: 'pending'
    },
    {
      id: 102,
      driver_name: 'رضا کمالی',
      vehicle_title: 'خاور ۶۰۸ مسقف',
      plate_number: '۳۱ ب ۷۲۸ ایران ۲۱',
      section_name: 'بخش لجستیک و انبار مرکزی',
      monthly_rent: 42000000,
      overtime_hourly_rate: 180000,
      fuel_quota: 1200,
      contract_period: '۱۴۰۵/۰۱ تا ۱۴۰۵/۰۶',
      approval_status: 'manager_approved'
    }
  ];

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
      if (params['tab'] && ['personnel_decrees', 'fleet_contracts', 'bonus_penalties'].includes(params['tab'])) {
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
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
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
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
  }

  switchSubTab(tab: string): void {
    if (tab === 'personnel_decrees' || tab === 'fleet_contracts') {
      this.activeSubTab = tab;
      this.syncUrlParams();
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

  approvePersonnelDecree(item: PersonnelContractItem): void {
    item.approval_status = 'manager_approved';
    this.toast.success(`حکم کارگزینی ${item.personnel_name} توسط مدیر تایید و نافذ گردید.`);
  }

  rejectPersonnelDecree(item: PersonnelContractItem): void {
    item.approval_status = 'rejected';
    this.toast.warning(`حکم کارگزینی ${item.personnel_name} رد و جهت بازنگری ارجاع شد.`);
  }

  approveFleetContract(item: FleetContractItem): void {
    item.approval_status = 'manager_approved';
    this.toast.success(`قرارداد خودرو و راننده ${item.driver_name} تصویب گردید.`);
  }

  rejectFleetContract(item: FleetContractItem): void {
    item.approval_status = 'rejected';
    this.toast.warning(`قرارداد ناوگان ${item.vehicle_title} رد شد.`);
  }

  exportExcel(): void {
    this.toast.success('فایل گزارش احکام کارگزینی و قراردادهای مصوب اکسل صادر گردید.');
  }

  refreshData(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.toast.info('لیست احکام و قراردادها همگام‌سازی شد.');
      this.cdr.detectChanges();
    }, 300);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
  }
}
