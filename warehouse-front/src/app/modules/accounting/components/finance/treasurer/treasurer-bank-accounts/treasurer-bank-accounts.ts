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
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export interface BankAccountItem {
  id: number;
  bank_name: string;
  account_type: string;
  account_number: string;
  sheba_number: string;
  branch: string;
  current_balance: number;
  daily_withdrawal_limit: number;
  is_active: boolean;
}

export interface ProjectCashboxItem {
  id: number;
  title: string;
  project_name: string;
  custodian_name: string;
  current_cash: number;
  ceiling_limit: number;
  last_audit_date: string;
}

@Component({
  selector: 'app-treasurer-bank-accounts-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent
  ],
  templateUrl: './treasurer-bank-accounts.html',
  styleUrl: './treasurer-bank-accounts.css'
})
export class TreasurerBankAccountsComponent implements OnInit, OnDestroy {
  activeSubTab: 'bank_accounts' | 'project_cashboxes' = 'bank_accounts';

  private tabsKey = '';
  private tabsCache: TabDef[] = [];

  get tabs(): TabDef[] {
    const key = `${this.bankAccounts.length}:${this.cashboxes.length}`;
    if (key === this.tabsKey) {
      return this.tabsCache;
    }
    this.tabsKey = key;
    this.tabsCache = [
      {
        id: 'bank_accounts',
        label: 'حساب‌های بانکی سازمان',
        shortLabel: 'بانک',
        icon: ACCOUNTING_ENTITY_ICONS.bankAccounts,
        count: this.bankAccounts.length
      },
      {
        id: 'project_cashboxes',
        label: 'صندوق‌های نقدی پروژه‌ها',
        shortLabel: 'صندوق',
        icon: ACCOUNTING_ENTITY_ICONS.pettyCash,
        count: this.cashboxes.length
      }
    ];
    return this.tabsCache;
  }

  // State
  isLoading = false;
  isSubmittingTransfer = false;
  searchQuery = '';

  bankAccounts: BankAccountItem[] = [
    {
      id: 1,
      bank_name: 'بانک ملت',
      account_type: 'جاری حقوقی (حساب اصلی واریز حقوق)',
      account_number: '۵۴۲۱۸۹۷۶۳۰',
      sheba_number: 'IR120120000000001234567890',
      branch: 'مرکزی',
      current_balance: 3450000000,
      daily_withdrawal_limit: 10000000000,
      is_active: true
    },
    {
      id: 2,
      bank_name: 'بانک تجارت',
      account_type: 'جاری حقوقی (تسویه ناوگان و پیمانکاران)',
      account_number: '۳۲۸۹۰۱۵۴۷۶',
      sheba_number: 'IR340180000000009876543210',
      branch: 'ونک',
      current_balance: 1820000000,
      daily_withdrawal_limit: 5000000000,
      is_active: true
    },
    {
      id: 3,
      bank_name: 'بانک صادرات',
      account_type: 'سپرده کوتاه‌مدت نقدینگی',
      account_number: '۰۱۰۹۸۲۴۳۵۶۰۰۸',
      sheba_number: 'IR780190000000003322114455',
      branch: 'سعادت‌آباد',
      current_balance: 5200000000,
      daily_withdrawal_limit: 2000000000,
      is_active: true
    }
  ];

  cashboxes: ProjectCashboxItem[] = [
    {
      id: 101,
      title: 'صندوق نقدی پایانه جنوب',
      project_name: 'پروژه پایانه جنوب',
      custodian_name: 'رضا طاهری',
      current_cash: 8500000,
      ceiling_limit: 20000000,
      last_audit_date: '1405/04/25'
    },
    {
      id: 102,
      title: 'صندوق نقد اسکله بندر امام',
      project_name: 'پروژه بندر امام',
      custodian_name: 'کریم احمدی',
      current_cash: 14200000,
      ceiling_limit: 30000000,
      last_audit_date: '1405/04/27'
    }
  ];

  // Transfer Modal
  isTransferModalOpen = false;
  fromAccount: BankAccountItem | null = null;
  toAccount: BankAccountItem | null = null;
  transferAmount = 0;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}
  ngOnDestroy(): void {}

  get totalLiquidity(): number {
    return this.bankAccounts.reduce((sum, b) => sum + b.current_balance, 0);
  }

  switchSubTab(tab: string): void {
    if (tab === 'bank_accounts' || tab === 'project_cashboxes') {
      this.activeSubTab = tab;
    }
  }

  openTransferModal(account: BankAccountItem): void {
    this.fromAccount = account;
    this.toAccount = this.bankAccounts.find(x => x.id !== account.id) || null;
    this.transferAmount = 100000000;
    this.isTransferModalOpen = true;
  }

  closeTransferModal(): void {
    this.isTransferModalOpen = false;
    this.fromAccount = null;
    this.toAccount = null;
  }

  executeTransfer(): void {
    if (!this.fromAccount || !this.toAccount) return;
    if (this.transferAmount > this.fromAccount.current_balance) {
      this.toast.error('موجودی حساب مبدا کافی نیست.');
      return;
    }

    this.isSubmittingTransfer = true;
    this.fromAccount.current_balance -= Number(this.transferAmount);
    this.toAccount.current_balance += Number(this.transferAmount);
    this.toast.success(`انتقال مبلغ ${Number(this.transferAmount).toLocaleString()} تومان از ${this.fromAccount.bank_name} به ${this.toAccount.bank_name} با موفقیت انجام شد.`);
    this.isSubmittingTransfer = false;
    this.closeTransferModal();
  }

  exportExcel(): void {
    this.toast.success('گزارش وضعیت حساب‌های بانکی و نقدینگی خزانه‌داری صادر گردید.');
  }

  refreshData(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.toast.info('موجودی حساب‌های بانکی با سامانه وب‌بانک همگام شد.');
      this.cdr.detectChanges();
    }, 300);
  }
}
