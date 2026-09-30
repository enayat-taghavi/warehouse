import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-accountant-counterparties-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
  templateUrl: './accountant-counterparties.html',
  styleUrl: './accountant-counterparties.css'
})
export class AccountantCounterpartiesHubComponent implements OnInit, OnDestroy {
  activeSubTab: 'vendors' | 'contractors' | 'debtors_creditors' | 'all' = 'vendors';

  searchQuery = '';
  isLoading = false;
  items: any[] = [];

  statusCounters = {
    vendors: 0,
    contractors: 0,
    debtors_creditors: 0,
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
      if (params['tab'] && ['vendors', 'contractors', 'debtors_creditors', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.fetchCounterparties();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  switchSubTab(tab: 'vendors' | 'contractors' | 'debtors_creditors' | 'all'): void {
    this.activeSubTab = tab;
    this.syncUrlParams();
    this.fetchCounterparties();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  fetchCounterparties(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.statusCounters = {
        vendors: this.items.filter(x => x.type === 'vendor').length,
        contractors: this.items.filter(x => x.type === 'contractor').length,
        debtors_creditors: this.items.filter(x => x.balance !== 0).length,
        all: this.items.length
      };
      this.cdr.detectChanges();
    }, 200);
  }

  viewLedger(item: any): void {
    this.toast.info(`گردش معین حساب طرف‌حساب ${item.name || ''} آماده مشاهده است.`);
  }

  exportExcel(): void {
    this.toast.info('در حال تولید فایل اکسل طرف‌حساب‌ها...');
  }

  importExcel(): void {
    this.toast.info('قالب اکسل طرف‌حساب‌های مالی بارگیری شد.');
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
  }
}
