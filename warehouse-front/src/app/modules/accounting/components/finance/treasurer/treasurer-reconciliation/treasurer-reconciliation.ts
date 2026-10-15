import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { PLATFORM_ENTITY_ICONS } from '../../../../../../shared/icons/semantic-icons';

export interface ReconciliationItem {
  id: number;
  bank_date: string;
  bank_name: string;
  description: string;
  reference_no: string;
  debit: number;
  credit: number;
  book_reference?: string;
  status: 'matched' | 'unmatched';
}

export interface CashFlowDay {
  day_label: string;
  inflow: number;
  outflow: number;
  net_change: number;
  projected_balance: number;
}

@Component({
  selector: 'app-treasurer-reconciliation-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent
  ],
  templateUrl: './treasurer-reconciliation.html',
  styleUrl: './treasurer-reconciliation.css'
})
export class TreasurerReconciliationComponent implements OnInit, OnDestroy {
  activeSubTab: 'bank_reconciliation' | 'cash_flow_forecast' = 'bank_reconciliation';

  private tabsKey = '';
  private tabsCache: TabDef[] = [];

  get tabs(): TabDef[] {
    const key = `${this.unmatchedCount}`;
    if (key === this.tabsKey) {
      return this.tabsCache;
    }
    this.tabsKey = key;
    this.tabsCache = [
      {
        id: 'bank_reconciliation',
        label: 'مغایرت‌گیری صورتحساب',
        shortLabel: 'مغایرت',
        icon: ACCOUNTING_ENTITY_ICONS.reconciliation,
        count: this.unmatchedCount
      },
      {
        id: 'cash_flow_forecast',
        label: 'تقویم جریان نقدینگی',
        shortLabel: 'نقدینگی',
        icon: PLATFORM_ENTITY_ICONS.reports
      }
    ];
    return this.tabsCache;
  }

  isLoading = false;
  selectedBank = 'ملت';

  reconciledCount = 18;
  unmatchedCount = 3;

  reconciliations: ReconciliationItem[] = [
    {
      id: 1,
      bank_date: '1405/04/28',
      bank_name: 'بانک ملت',
      description: 'انتقال وجه پایا - حقوق تیر پرسنل لجستیک',
      reference_no: 'TRK-9842105',
      debit: 21800000,
      credit: 0,
      book_reference: 'سند مالی ۱۸۴۲',
      status: 'matched'
    },
    {
      id: 2,
      bank_date: '1405/04/28',
      bank_name: 'بانک ملت',
      description: 'واریز نقدی کارفرما (صورت‌وضعیت شماره ۳)',
      reference_no: 'BNK-7712490',
      debit: 0,
      credit: 1200000000,
      book_reference: 'سند درآمدی ۴۰۲',
      status: 'matched'
    },
    {
      id: 3,
      bank_date: '1405/04/29',
      bank_name: 'بانک ملت',
      description: 'کارمزد انتقال ساتنا و پایا',
      reference_no: 'FEE-100234',
      debit: 150000,
      credit: 0,
      status: 'unmatched'
    },
    {
      id: 4,
      bank_date: '1405/04/29',
      bank_name: 'بانک ملت',
      description: 'واریز نامشخص از درگاه پرداخت شتاب',
      reference_no: 'POS-889123',
      debit: 0,
      credit: 4500000,
      status: 'unmatched'
    }
  ];

  cashFlowProjection: CashFlowDay[] = [
    { day_label: 'امروز (۲۹ تیر)', inflow: 45000000, outflow: 120000000, net_change: -75000000, projected_balance: 3375000000 },
    { day_label: 'فردا (۳۰ تیر - سررسید فاکتورها)', inflow: 300000000, outflow: 48500000, net_change: 251500000, projected_balance: 3626500000 },
    { day_label: 'پس‌فردا (۱ مرداد - تسویه ناوگان)', inflow: 0, outflow: 350000000, net_change: -350000000, projected_balance: 3276500000 },
    { day_label: '۵ مرداد (واریز پیش‌پرداخت کارفرما)', inflow: 800000000, outflow: 20000000, net_change: 780000000, projected_balance: 4056500000 }
  ];

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}
  ngOnDestroy(): void {}

  switchSubTab(tab: string): void {
    if (tab === 'bank_reconciliation' || tab === 'cash_flow_forecast') {
      this.activeSubTab = tab;
    }
  }

  autoMatch(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.reconciliations.forEach(item => {
        if (item.status === 'unmatched' && item.reference_no.startsWith('FEE')) {
          item.status = 'matched';
          item.book_reference = 'سند اتوماتیک کارمزد بانک';
        }
      });
      this.toast.success('مغایرت‌گیری اتوماتیک انجام شد. ۱ مورد کارمزد تطبیق داده شد.');
      this.cdr.detectChanges();
    }, 400);
  }

  exportExcel(): void {
    this.toast.success('فایل گزارش مغایرت‌گیری و جریان نقدینگی صادر شد.');
  }

  refreshData(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.toast.info('صورت‌حساب بانکی به‌روزرسانی شد.');
      this.cdr.detectChanges();
    }, 300);
  }
}
