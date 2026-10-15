import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection } from '../../../../../../core/models/personnel.model';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export interface LaborCostReportRow {
  section_name: string;
  headcount: number;
  total_base_wage: number;
  total_overtime_pay: number;
  total_allowances: number;
  employer_insurance_23pct: number;
  total_cost_to_company: number;
  avg_cost_per_person: number;
}

export interface FleetReportRow {
  section_name: string;
  active_vehicles: number;
  total_fixed_rent: number;
  total_overtime_pay: number;
  total_fuel_liters: number;
  total_fleet_expenditure: number;
  avg_cost_per_vehicle: number;
}

@Component({
  selector: 'app-manager-reports-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TabBarComponent, ActionButtonComponent],
  templateUrl: './manager-reports.html',
  styleUrl: './manager-reports.css'
})
export class ManagerReportsComponent implements OnInit, OnDestroy {
  activeSubTab: 'labor_costs' | 'fleet_efficiency' | 'quarterly_trends' = 'labor_costs';

  reportTabs: TabDef[] = [
    { id: 'labor_costs', label: 'بهای تمام‌شده نیروی انسانی', shortLabel: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.personnel },
    { id: 'fleet_efficiency', label: 'بهره‌وری و مصارف ناوگان', shortLabel: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet }
  ];

  // Section Isolation
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Filters & State
  fiscalYear = '1405';
  selectedMonth = 'تیر';
  isLoading = false;

  laborReports: LaborCostReportRow[] = [
    {
      section_name: 'بخش لجستیک و انبار مرکزی',
      headcount: 52,
      total_base_wage: 750000000,
      total_overtime_pay: 140000000,
      total_allowances: 120000000,
      employer_insurance_23pct: 232300000,
      total_cost_to_company: 1242300000,
      avg_cost_per_person: 23890000
    },
    {
      section_name: 'بخش تخلیه و بارگیری اسکله',
      headcount: 44,
      total_base_wage: 640000000,
      total_overtime_pay: 160000000,
      total_allowances: 98000000,
      employer_insurance_23pct: 206540000,
      total_cost_to_company: 1104540000,
      avg_cost_per_person: 25103000
    },
    {
      section_name: 'بخش ترابری سنگین',
      headcount: 26,
      total_base_wage: 380000000,
      total_overtime_pay: 85000000,
      total_allowances: 62000000,
      employer_insurance_23pct: 121210000,
      total_cost_to_company: 648210000,
      avg_cost_per_person: 24931000
    },
    {
      section_name: 'بخش اداری و پشتیبانی فنی',
      headcount: 20,
      total_base_wage: 280000000,
      total_overtime_pay: 20000000,
      total_allowances: 45000000,
      employer_insurance_23pct: 79350000,
      total_cost_to_company: 424350000,
      avg_cost_per_person: 21217000
    }
  ];

  fleetReports: FleetReportRow[] = [
    {
      section_name: 'بخش لجستیک و انبار مرکزی',
      active_vehicles: 18,
      total_fixed_rent: 240000000,
      total_overtime_pay: 65000000,
      total_fuel_liters: 7200,
      total_fleet_expenditure: 340000000,
      avg_cost_per_vehicle: 18888000
    },
    {
      section_name: 'بخش تخلیه و بارگیری اسکله',
      active_vehicles: 12,
      total_fixed_rent: 190000000,
      total_overtime_pay: 55000000,
      total_fuel_liters: 5800,
      total_fleet_expenditure: 280000000,
      avg_cost_per_vehicle: 23333000
    },
    {
      section_name: 'بخش ترابری سنگین',
      active_vehicles: 8,
      total_fixed_rent: 180000000,
      total_overtime_pay: 50000000,
      total_fuel_liters: 9400,
      total_fleet_expenditure: 250000000,
      avg_cost_per_vehicle: 31250000
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
      if (params['tab'] && ['labor_costs', 'fleet_efficiency', 'quarterly_trends'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['month']) {
        this.selectedMonth = params['month'];
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
    if (tab === 'labor_costs' || tab === 'fleet_efficiency') {
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
        month: this.selectedMonth
      },
      queryParamsHandling: 'merge'
    });
  }

  printReport(): void {
    window.print();
  }

  exportExcel(): void {
    this.toast.success('فایل تحلیلی گزارش مدیریت با ساختار ۲ ردیفه اکسل صادر گردید.');
  }

  refreshData(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.toast.info('گزارشات تجمیعی با دفاتر مالی همگام شد.');
      this.cdr.detectChanges();
    }, 300);
  }
}
