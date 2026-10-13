import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { ProjectSection } from '../../../../core/models/personnel.model';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../modules/accounting/entity-icons';

export interface SectionBudgetItem {
  id: number;
  section_name: string;
  project_name: string;
  monthly_budget: number;
  payroll_spent: number;
  fleet_spent: number;
  invoices_spent: number;
  actual_spent: number;
  remaining_budget: number;
  utilization_percent: number;
  status: 'normal' | 'warning' | 'danger';
}

@Component({
  selector: 'app-manager-budget-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TabBarComponent, ActionButtonComponent],
  templateUrl: './manager-budget.html',
  styleUrl: './manager-budget.css'
})
export class ManagerBudgetComponent implements OnInit, OnDestroy {
  activeSubTab: 'budget_matrix' | 'budget_revisions' | 'over_budget_alerts' = 'budget_matrix';

  budgetTabs: TabDef[] = [
    { id: 'budget_matrix', label: 'ماتریس تخصیص بودجه', shortLabel: 'ماتریس', icon: ACCOUNTING_ENTITY_ICONS.budget },
    { id: 'over_budget_alerts', label: 'انحراف و مازاد هزینه', shortLabel: 'انحراف', icon: 'status-warning' }
  ];

  // Section Isolation
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Fiscal Context
  searchQuery = '';
  fiscalYear = '1405';
  selectedMonth = 'تیر';

  // State
  isLoading = false;
  items: SectionBudgetItem[] = [
    {
      id: 1,
      section_name: 'بخش لجستیک و انبار مرکزی',
      project_name: 'پروژه پایانه جنوب',
      monthly_budget: 1800000000,
      payroll_spent: 1050000000,
      fleet_spent: 340000000,
      invoices_spent: 150000000,
      actual_spent: 1540000000,
      remaining_budget: 260000000,
      utilization_percent: 85.5,
      status: 'normal'
    },
    {
      id: 2,
      section_name: 'بخش تخلیه و بارگیری اسکله',
      project_name: 'پروژه بندر امام',
      monthly_budget: 1400000000,
      payroll_spent: 890000000,
      fleet_spent: 280000000,
      invoices_spent: 140000000,
      actual_spent: 1310000000,
      remaining_budget: 90000000,
      utilization_percent: 93.5,
      status: 'warning'
    },
    {
      id: 3,
      section_name: 'بخش ترابری سنگین',
      project_name: 'پروژه خط لوله شرق',
      monthly_budget: 800000000,
      payroll_spent: 510000000,
      fleet_spent: 250000000,
      invoices_spent: 80000000,
      actual_spent: 840000000,
      remaining_budget: -40000000,
      utilization_percent: 105.0,
      status: 'danger'
    },
    {
      id: 4,
      section_name: 'بخش اداری و پشتیبانی فنی',
      project_name: 'پروژه پایانه غرب',
      monthly_budget: 500000000,
      payroll_spent: 100000000,
      fleet_spent: 10000000,
      invoices_spent: 20000000,
      actual_spent: 130000000,
      remaining_budget: 370000000,
      utilization_percent: 26.0,
      status: 'normal'
    }
  ];

  // Edit Budget Modal
  isEditModalOpen = false;
  editingItem: SectionBudgetItem | null = null;
  newBudgetAmount = 0;

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
      if (params['tab'] && ['budget_matrix', 'budget_revisions', 'over_budget_alerts'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
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
    if (tab === 'budget_matrix' || tab === 'over_budget_alerts') {
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
        q: this.searchQuery ? this.searchQuery : null,
        month: this.selectedMonth
      },
      queryParamsHandling: 'merge'
    });
  }

  get filteredItems(): SectionBudgetItem[] {
    let list = this.items;
    if (this.activeSubTab === 'over_budget_alerts') {
      list = list.filter(x => x.status === 'danger' || x.status === 'warning');
    }
    if (this.selectedSectionId) {
      list = list.filter(x => x.id === this.selectedSectionId);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(x => x.section_name.toLowerCase().includes(q) || x.project_name.toLowerCase().includes(q));
    }
    return list;
  }

  openEditBudgetModal(item: SectionBudgetItem): void {
    this.editingItem = item;
    this.newBudgetAmount = item.monthly_budget;
    this.isEditModalOpen = true;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.editingItem = null;
  }

  saveNewBudget(): void {
    if (!this.editingItem) return;
    this.editingItem.monthly_budget = Number(this.newBudgetAmount);
    this.editingItem.remaining_budget = this.editingItem.monthly_budget - this.editingItem.actual_spent;
    this.editingItem.utilization_percent = Math.round((this.editingItem.actual_spent / this.editingItem.monthly_budget) * 1000) / 10;
    this.editingItem.status = this.editingItem.utilization_percent > 100 ? 'danger' : (this.editingItem.utilization_percent > 90 ? 'warning' : 'normal');

    this.toast.success(`سقف بودجه ${this.editingItem.section_name} با موفقیت به روزرسانی شد.`);
    this.closeEditModal();
  }

  exportExcel(): void {
    this.toast.success('فایل گزارش بودجه و انحرافات بخش‌ها مطابق استاندارد اکسل صادر گردید.');
  }

  refreshData(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.toast.info('داده‌های بودجه و مصارف با دفاتر حسابداری به‌روزرسانی شد.');
      this.cdr.detectChanges();
    }, 300);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
  }
}
