import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../../../core/api/personnel-api.service';
import { ProjectSection } from '../../../../../../core/models/personnel.model';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';

export interface ChequeItem {
  id: number;
  sayad_id: string;
  cheque_serial: string;
  bank_name: string;
  payee_name: string;
  section_name: string;
  amount: number;
  due_date: string;
  issue_date: string;
  description: string;
  status: 'pending' | 'cleared' | 'bounced';
}

@Component({
  selector: 'app-treasurer-cheques-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent
  ],
  templateUrl: './treasurer-cheques.html',
  styleUrl: './treasurer-cheques.css'
})
export class TreasurerChequesComponent implements OnInit, OnDestroy {
  activeSubTab: 'issued_cheques' | 'cleared_archive' = 'issued_cheques';

  readonly tabs: TabDef[] = [
    { id: 'issued_cheques', label: 'چک‌های صادره و سررسیدها', shortLabel: 'صادره', icon: ACCOUNTING_ENTITY_ICONS.cheques },
    { id: 'cleared_archive', label: 'آرشیو پاس‌شده و وصولی', shortLabel: 'آرشیو', icon: STATUS_ICONS.archived }
  ];

  // State
  isLoading = false;
  searchQuery = '';

  cheques: ChequeItem[] = [
    {
      id: 1,
      sayad_id: '1234567890123456',
      cheque_serial: '۷۸۹۵۲۱/۰۱',
      bank_name: 'بانک ملت',
      payee_name: 'شرکت پترو تجهیز خاورمیانه',
      section_name: 'بخش لجستیک و انبار مرکزی',
      amount: 145000000,
      due_date: '1405/05/10',
      issue_date: '1405/04/10',
      description: 'خرید قطعات هیدرولیک جک‌های تخلیه',
      status: 'pending'
    },
    {
      id: 2,
      sayad_id: '9876543210987654',
      cheque_serial: '۷۸۹۵۲۲/۰۱',
      bank_name: 'بانک تجارت',
      payee_name: 'تعمیرگاه مجاز بنز دیزل کاران',
      section_name: 'بخش ترابری سنگین',
      amount: 82000000,
      due_date: '1405/05/15',
      issue_date: '1405/04/15',
      description: 'اورهال اساسی موتور کشنده‌های ولوو',
      status: 'pending'
    },
    {
      id: 3,
      sayad_id: '4567890123456789',
      cheque_serial: '۷۸۹۵۱۹/۰۱',
      bank_name: 'بانک ملت',
      payee_name: 'بیمه ایران (نمایندگی اسماعیلی)',
      section_name: 'بخش اداری و پشتیبانی فنی',
      amount: 64000000,
      due_date: '1405/04/20',
      issue_date: '1405/03/20',
      description: 'بیمه بدنه و شخص ثالث ناوگان سنگین',
      status: 'cleared'
    }
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
    if (tab === 'issued_cheques' || tab === 'cleared_archive') {
      this.activeSubTab = tab;
    }
  }

  get filteredCheques(): ChequeItem[] {
    let list = this.cheques;
    if (this.activeSubTab === 'issued_cheques') {
      list = list.filter(x => x.status === 'pending');
    } else {
      list = list.filter(x => x.status === 'cleared' || x.status === 'bounced');
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(x =>
        x.payee_name.toLowerCase().includes(q) ||
        x.sayad_id.toLowerCase().includes(q) ||
        x.cheque_serial.toLowerCase().includes(q)
      );
    }
    return list;
  }

  markCleared(item: ChequeItem): void {
    item.status = 'cleared';
    this.toast.success(`چک به شماره صیادی ${item.sayad_id} به مبلغ ${item.amount.toLocaleString()} تومان با موفقیت پاس و وصول گردید.`);
  }

  markBounced(item: ChequeItem): void {
    item.status = 'bounced';
    this.toast.error(`چک صیادی به شماره ${item.sayad_id} به عنوان برگشتی علامت‌گذاری شد.`);
  }

  exportExcel(): void {
    this.toast.success('فایل اکسل مدیریت چک‌ها و تقویم سررسید صادر گردید.');
  }

  refreshData(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.toast.info('اطلاعات چک‌های صیادی به‌روز شد.');
      this.cdr.detectChanges();
    }, 300);
  }
}
