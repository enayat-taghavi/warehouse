import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../../services/state.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PersonnelApiService } from '../../../core/api/personnel-api.service';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-treasury-cartable',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './treasury-cartable.html',
  styleUrl: './treasury-cartable.css'
})
export class TreasuryCartable implements OnInit, OnDestroy {
  activeTab: 'ready_periods' | 'single_payrolls' | 'fleet_settlements' = 'ready_periods';

  isLoading = false;
  treasuryData: any = {
    ready_periods_count: 0,
    ready_payrolls_count: 0,
    ready_trips_count: 0,
    total_payroll_amount: 0,
    total_fleet_amount: 0,
    total_disbursement_queue: 0,
    periods: [],
    payrolls: [],
    trips: []
  };

  // Disbursal Modal State
  isDisburseModalOpen = false;
  disburseActionType: 'disburse_period' | 'disburse_single_payroll' | 'disburse_fleet' = 'disburse_period';
  disburseTargetId: number | null = null;
  disburseTargetTitle = '';
  disburseAmount = 0;
  trackingCode = '';
  batchId = '';
  paymentMethod = 'PAYA';
  isDisbursing = false;

  constructor(
    public state: StateService,
    public auth: AuthService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private personnelApi: PersonnelApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTreasuryCartable();
  }

  ngOnDestroy(): void {}

  loadTreasuryCartable(): void {
    this.isLoading = true;
    this.personnelApi.getTreasuryCartable().subscribe({
      next: (data) => {
        this.treasuryData = data;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.toast.error(err?.error?.detail || 'خطا در بارگذاری اطلاعات کارتابل خزانه‌داری.');
        this.cdr.detectChanges();
      }
    });
  }

  openPeriodDisburseModal(period: any): void {
    this.disburseActionType = 'disburse_period';
    this.disburseTargetId = period.id;
    this.disburseTargetTitle = `تسویه کل حقوق دوره ماهانه ${period.year_month}`;
    this.disburseAmount = this.treasuryData.total_payroll_amount;
    this.trackingCode = `PAYA-${period.year_month.replace('/', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    this.batchId = `BATCH-${period.year_month.replace('/', '')}-01`;
    this.paymentMethod = 'PAYA';
    this.isDisburseModalOpen = true;
  }

  openSinglePayrollDisburseModal(payroll: any): void {
    this.disburseActionType = 'disburse_single_payroll';
    this.disburseTargetId = payroll.id;
    this.disburseTargetTitle = `تسویه انفرادی حقوق: ${payroll.personnel_name}`;
    this.disburseAmount = payroll.payable_amount || 0;
    this.trackingCode = `PAYA-SINGLE-${Math.floor(100000 + Math.random() * 900000)}`;
    this.batchId = `BATCH-SINGLE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    this.paymentMethod = 'PAYA';
    this.isDisburseModalOpen = true;
  }

  openFleetDisburseModal(): void {
    if (!this.treasuryData.trips || this.treasuryData.trips.length === 0) {
      this.toast.info('سرویس ناوگان معلقی جهت تسویه وجود ندارد.');
      return;
    }
    this.disburseActionType = 'disburse_fleet';
    this.disburseTargetId = null;
    this.disburseTargetTitle = `تسویه گروهی کلیه سفرهای ناوگان (${this.treasuryData.trips.length} سفر)`;
    this.disburseAmount = this.treasuryData.total_fleet_amount;
    this.trackingCode = `FLEET-PAYA-${Math.floor(100000 + Math.random() * 900000)}`;
    this.batchId = `BATCH-FLEET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    this.paymentMethod = 'PAYA';
    this.isDisburseModalOpen = true;
  }

  closeDisburseModal(): void {
    this.isDisburseModalOpen = false;
    this.trackingCode = '';
    this.batchId = '';
  }

  submitDisbursement(): void {
    if (!this.trackingCode || !this.trackingCode.trim()) {
      this.toast.error('وارد کردن شماره پیگیری / کد رهگیری بانکی الزامی است.');
      return;
    }

    const payload: any = {
      action: this.disburseActionType,
      tracking_code: this.trackingCode.trim(),
      batch_id: this.batchId.trim()
    };

    if (this.disburseActionType === 'disburse_period') {
      payload.period_id = this.disburseTargetId;
    } else if (this.disburseActionType === 'disburse_single_payroll') {
      payload.payroll_id = this.disburseTargetId;
    } else if (this.disburseActionType === 'disburse_fleet') {
      payload.trip_ids = this.treasuryData.trips.map((t: any) => t.id);
    }

    this.isDisbursing = true;
    this.personnelApi.disburseTreasury(payload).subscribe({
      next: (res) => {
        this.isDisbursing = false;
        this.toast.success(res?.message || 'عملیات پرداخت و تسویه خزانه‌داری با موفقیت انجام شد.');
        this.closeDisburseModal();
        this.loadTreasuryCartable();
      },
      error: (err) => {
        this.isDisbursing = false;
        this.toast.error(err?.error?.detail || err?.error?.error || 'خطا در ثبت پرداخت خزانه‌داری.');
      }
    });
  }

  downloadDiskette(periodId: number, type: 'paya' | 'satna'): void {
    const url = this.personnelApi.getTreasuryDisketteDownloadUrl(periodId, type);
    window.open(url, '_blank');
  }
}
