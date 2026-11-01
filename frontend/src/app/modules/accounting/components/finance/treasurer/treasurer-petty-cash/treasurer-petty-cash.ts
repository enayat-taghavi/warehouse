import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection } from '../../../../models/personnel.model';
import { ModalComponent } from '../../../../../../shared/components/modal/modal.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { attendanceActionErrorMessage } from '../../../../attendance-period-error';

export interface PettyCashRefillItem {
  id: number;
  custodian_name: string;
  section_name: string;
  requested_refill_amount: number;
  status: 'pending_refill' | 'refilled';
  tracking_code?: string;
  /** کسر بدهی و خالص واریز (د۴)؛ در شارژهای قدیمی خالی است */
  offset_total?: number;
  net_amount?: number;
}

/**
 * تن‌خواه خزانه‌دار (شارژ دفاتر تن‌خواه)؛ از صفحهٔ «تسویه فاکتور و تن‌خواه» جدا شد
 * تا تب «فاکتورها» هیچ بخشی از تن‌خواه نداشته باشد.
 */
@Component({
  selector: 'app-treasurer-petty-cash',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ActionButtonComponent, CommandCenterComponent],
  templateUrl: './treasurer-petty-cash.html',
})
export class TreasurerPettyCashComponent implements OnInit, OnDestroy {
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;

  isLoading = false;
  refills: PettyCashRefillItem[] = [];

  refillModalOpen = false;
  refillItem: PettyCashRefillItem | null = null;
  refillTrackingCode = '';
  refillError = '';

  private routeSub?: Subscription;
  private docSub?: Subscription;

  constructor(
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private ws?: WebSocketService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
    });
    this.loadSections();
    this.docSub = this.ws?.documentChanges$?.(['petty_cash']).subscribe(() => this.loadRefills(true));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.docSub?.unsubscribe();
  }

  loadSections(): void {
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          this.personnelApi.getProjectSections({ is_active: true }).subscribe({
            next: (allSecs: ProjectSection[]) => {
              this.mySections = allSecs || [];
              this.pickDefaultSection();
            },
            error: () => this.loadRefills()
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => this.loadRefills()
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0 && (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId))) {
      this.selectedSectionId = this.mySections[0]?.id ?? null;
    }
    this.loadRefills();
  }

  onSectionChanged(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section_id: this.selectedSectionId || null },
      queryParamsHandling: 'merge'
    });
    this.loadRefills();
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  loadRefills(silent = false): void {
    if (!silent) this.isLoading = true;
    this.personnelApi.getPettyCashTransactions({
      section_id: this.selectedSectionId || undefined,
      transaction_type: 'allocation'
    }).subscribe({
      next: (txs: any[]) => {
        this.isLoading = false;
        // فقط ردیف‌های قدیمی در انتظار؛ شارژهای تازه از «کارهای من» و واریز pay-charge می‌گذرند
        const legacyPending = ['pending_supervisor', 'pending_accountant'];
        this.refills = (txs || []).filter((t: any) => legacyPending.includes(t.status)).map((t: any) => ({
          id: t.id,
          custodian_name: t.custodian_name || 'مسئول تنخواه',
          section_name: t.section_name || '',
          requested_refill_amount: t.amount,
          status: t.status === 'approved' ? 'refilled' : 'pending_refill',
          tracking_code: t.receipt_number,
          offset_total: Number(t.offset_total || 0),
          net_amount: t.net_amount !== null && t.net_amount !== undefined ? Number(t.net_amount) : Number(t.amount || 0) - Number(t.offset_total || 0)
        }));
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (!silent) this.toast.error(attendanceActionErrorMessage(err, 'خطا در دریافت شارژهای تن‌خواه.'));
        this.cdr.detectChanges();
      }
    });
  }

  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  refillPettyCash(item: PettyCashRefillItem): void {
    this.refillItem = item;
    this.refillTrackingCode = '';
    this.refillError = '';
    this.refillModalOpen = true;
  }

  closeRefillModal(): void {
    this.refillModalOpen = false;
    this.refillItem = null;
    this.refillError = '';
  }

  confirmRefill(): void {
    const item = this.refillItem;
    if (!item) return;
    const code = this.refillTrackingCode.trim();
    if (!code) {
      this.refillError = 'ورود شماره پیگیری الزامی است.';
      return;
    }
    this.refillModalOpen = false;
    this.refillError = '';
    this.isLoading = true;
    this.personnelApi.approvePettyCashTransaction(item.id, code).subscribe({
      next: () => {
        this.isLoading = false;
        item.status = 'refilled';
        item.tracking_code = code;
        this.refillItem = null;
        this.toast.success(`شارژ تن‌خواه به حساب ${item.custodian_name} با موفقیت ثبت شد.`);
        this.loadRefills();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (err?.status === 409 && err?.error?.code === 'ceiling_exceeded_at_pay') {
          this.toast.error('مبلغ این شارژ از سقف تنخواه بیشتر شده است. شارژ باید برگردانده شود و دوباره برای مدیر ارسال شود.');
        } else {
          this.toast.error(attendanceActionErrorMessage(err, 'خطا در ثبت شارژ تن‌خواه.'));
        }
        this.cdr.detectChanges();
      }
    });
  }
}
