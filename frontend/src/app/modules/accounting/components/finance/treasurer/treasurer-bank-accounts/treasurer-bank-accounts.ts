import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { CompanyBankAccount } from '../../../../../../core/models/company.model';

@Component({
  selector: 'app-treasurer-bank-accounts-hub',
  standalone: true,
  imports: [
    CommonModule,
    CommandCenterComponent,
    ActionButtonComponent,
    SvgIconDirective
  ],
  templateUrl: './treasurer-bank-accounts.html',
  styleUrl: './treasurer-bank-accounts.css'
})
export class TreasurerBankAccountsComponent implements OnInit {
  accounts: CompanyBankAccount[] = [];
  isLoading = false;
  loadError = '';

  constructor(
    private companyApi: CompanyApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.loadError = '';
    this.companyApi.getBankAccounts().subscribe({
      next: (res) => {
        this.accounts = Array.isArray(res) ? res : (res?.results ?? []);
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadError = 'دریافت حساب‌های بانکی انجام نشد.';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  refreshData(): void {
    this.load();
  }

  trackById(_index: number, item: CompanyBankAccount): number | undefined {
    return item.id;
  }
}
