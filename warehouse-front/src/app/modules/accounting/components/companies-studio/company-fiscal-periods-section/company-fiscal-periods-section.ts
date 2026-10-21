import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompaniesStudioFacade } from '../companies-studio.facade';
import { CompanyFiscalPeriod } from '../../../../../core/models/company.model';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService, ConfirmDialogConfig } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { OfflinePendingBadgeComponent } from '../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';

/**
 * بخش «دوره‌های مالی» در انتهای تب «سال مالی، بیمه و مودیان» استودیوی شرکت
 * (مشارکت ماژول حسابداری از راه `companies.studioSections`).
 */
@Component({
  selector: 'app-company-fiscal-periods-section',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, LoadingSkeletonComponent, SvgIconDirective, ActionButtonComponent, OfflinePendingBadgeComponent],
  providers: [CompaniesStudioFacade],
  host: { class: 'block' },
  templateUrl: './company-fiscal-periods-section.html'
})
export class CompanyFiscalPeriodsSectionComponent implements OnInit, OnChanges, OnDestroy {
  /** شناسهٔ شرکت ذخیره‌شده؛ برای شرکت تازه null */
  @Input() companyId: number | null = null;

  private facade = inject(CompaniesStudioFacade);
  private studioContext = inject(CompanyStudioContextService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private network = NetworkStatusService.getInstance();
  private destroy$ = new Subject<void>();
  private unregisterDirty: () => void;

  isOnline = this.network.isOnline;
  private static readonly FA_NUMBER = new Intl.NumberFormat('fa-IR');

  /** شمارنده با رقم فارسی (ت۷) */
  fa(n: number): string {
    return CompanyFiscalPeriodsSectionComponent.FA_NUMBER.format(n);
  }

  /** سال و تاریخ جلالی متنی با رقم فارسی (ت۷) */
  faDigits(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value).replace(/[0-9]/g, d => String.fromCharCode(0x06F0 + Number(d)));
  }

  /** دوره‌ای که در حالت آفلاین ساخته شده و هنوز شناسهٔ سرور ندارد (E2) */
  isPendingRecord(rec: any): boolean {
    return !!rec?._offlinePending || (typeof rec?.id === 'number' && rec.id < 0);
  }

  /** راهنمای دکمهٔ کار حساس دوره: علت غیرفعال بودن یا شرح کار */
  actionHint(period: CompanyFiscalPeriod, describe: string): string {
    if (this.isPendingRecord(period)) return 'پس از ارسال دوره به سرور در دسترس است';
    return this.isOnline ? describe : 'فقط در حالت برخط';
  }

  // مدیریت دوره‌های مالی رسمی شرکت (CompanyFiscalPeriod)
  companyFiscalPeriods: CompanyFiscalPeriod[] = [];
  isLoadingFiscalPeriods = false;
  /** دریافت دوره‌ها شکست خورد (حالت خطا با «تلاش دوباره») */
  loadError = false;
  isSavingFiscalPeriod = false;
  showFiscalPeriodForm = false;
  newFiscalPeriod = this.getEmptyFiscalPeriodData();

  isFiscalStartDatePickerOpen = false;
  isFiscalEndDatePickerOpen = false;
  fiscalStartControl = new FormControl('');
  fiscalEndControl = new FormControl('');

  constructor() {
    // فرم دورهٔ مالی باز در هشدار خروج استودیو حساب می‌شود (ت۳)
    this.unregisterDirty = this.studioContext.registerDirty('fiscal_periods', () => this.showFiscalPeriodForm);
  }

  ngOnInit(): void {
    this.network.state$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isOnline = this.network.isOnline;
      this.cdr.markForCheck();
    });
    this.fiscalStartControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newFiscalPeriod.start_date = val || '';
    });
    this.fiscalEndControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newFiscalPeriod.end_date = val || '';
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      this.cancelCreateFiscalPeriod();
      this.companyFiscalPeriods = [];
      this.loadError = false;
      if (this.companyId) {
        this.loadCompanyFiscalPeriods(this.companyId);
      }
    }
  }

  ngOnDestroy(): void {
    this.unregisterDirty();
    this.destroy$.next();
    this.destroy$.complete();
  }

  retry(): void {
    if (this.companyId) this.loadCompanyFiscalPeriods(this.companyId);
  }

  private requireOnline(actionFa: string): boolean {
    if (this.network.isOnline) return true;
    this.toast.warning(`${actionFa} فقط در حالت برخط ممکن است.`);
    return false;
  }

  private async confirmAction(config: ConfirmDialogConfig): Promise<boolean> {
    if (this.confirmDialog) {
      return (await this.confirmDialog.open({ cancelText: 'انصراف', ...config })) === true;
    }
    return window.confirm(config.message);
  }

  // ═════════════════════════════════════════════════════════════════════
  // مدیریت دوره‌های مالی رسمی شرکت (CompanyFiscalPeriod)
  // ═════════════════════════════════════════════════════════════════════
  loadCompanyFiscalPeriods(companyId: number): void {
    this.isLoadingFiscalPeriods = true;
    this.loadError = false;
    this.facade.getFiscalPeriods(companyId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        // پاسخ دیررسِ شرکت پیشین در بخش شرکت تازه نمی‌نشیند
        if (companyId !== this.companyId) return;
        this.isLoadingFiscalPeriods = false;
        if (Array.isArray(res)) {
          this.companyFiscalPeriods = res;
        } else if (res && Array.isArray((res as any).results)) {
          this.companyFiscalPeriods = (res as any).results;
        } else {
          this.companyFiscalPeriods = [];
        }
        this.cdr.markForCheck();
      },
      error: () => {
        if (companyId !== this.companyId) return;
        this.isLoadingFiscalPeriods = false;
        this.loadError = true;
        this.cdr.markForCheck();
      }
    });
  }

  openCreateFiscalPeriod(): void {
    this.newFiscalPeriod = this.getEmptyFiscalPeriodData();
    this.fiscalStartControl.setValue('', { emitEvent: false });
    this.fiscalEndControl.setValue('', { emitEvent: false });
    this.showFiscalPeriodForm = true;
    this.cdr.markForCheck();
  }

  cancelCreateFiscalPeriod(): void {
    this.showFiscalPeriodForm = false;
    this.isFiscalStartDatePickerOpen = false;
    this.isFiscalEndDatePickerOpen = false;
    this.newFiscalPeriod = this.getEmptyFiscalPeriodData();
    this.fiscalStartControl.setValue('', { emitEvent: false });
    this.fiscalEndControl.setValue('', { emitEvent: false });
    this.cdr.markForCheck();
  }

  onFiscalStartSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newFiscalPeriod.start_date = val;
    this.fiscalStartControl.setValue(val, { emitEvent: false });
    this.isFiscalStartDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onFiscalEndSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newFiscalPeriod.end_date = val;
    this.fiscalEndControl.setValue(val, { emitEvent: false });
    this.isFiscalEndDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  saveFiscalPeriod(): void {
    if (!this.companyId) return;
    if (!this.newFiscalPeriod.fiscal_year.trim()) {
      this.toast.warning('لطفاً سال مالی (مثال: ۱۴۰۳) را وارد فرمایید.');
      return;
    }
    if (!this.newFiscalPeriod.title.trim()) {
      this.toast.warning('لطفاً عنوان دوره مالی را وارد فرمایید.');
      return;
    }
    if (!this.newFiscalPeriod.start_date || !this.newFiscalPeriod.end_date) {
      this.toast.warning('لطفاً تاریخ شروع و پایان دوره مالی را تعیین فرمایید.');
      return;
    }
    if (this.newFiscalPeriod.start_date > this.newFiscalPeriod.end_date) {
      this.toast.warning('تاریخ پایان دوره مالی نمی‌تواند قبل از تاریخ آغاز آن باشد.');
      return;
    }

    this.isSavingFiscalPeriod = true;
    const payload: Partial<CompanyFiscalPeriod> = {
      company: this.companyId,
      fiscal_year: this.newFiscalPeriod.fiscal_year.trim(),
      title: this.newFiscalPeriod.title.trim(),
      start_date: this.newFiscalPeriod.start_date,
      end_date: this.newFiscalPeriod.end_date,
      notes: this.newFiscalPeriod.notes.trim() || null
    };

    const companyId = this.companyId;
    this.facade.createFiscalPeriod(payload).subscribe({
      next: (created) => {
        this.isSavingFiscalPeriod = false;
        if (this.isPendingRecord(created)) {
          this.toast.info('دوره مالی در صف ارسال است و پس از اتصال ثبت می‌شود.');
        } else {
          this.toast.success(`دوره مالی «${created.title}» با موفقیت تعریف شد.`);
        }
        // پاسخ دیررس پس از رفتن به شرکت دیگر، فرم و فهرست آن شرکت را دست نمی‌زند
        if (companyId !== this.companyId) return;
        this.cancelCreateFiscalPeriod();
        this.companyFiscalPeriods = [created, ...this.companyFiscalPeriods.filter(p => p.id !== created.id)];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSavingFiscalPeriod = false;
        const msg = err.error?.detail || err.error?.fiscal_year?.[0] || 'خطا در تعریف دوره مالی جدید';
        this.toast.error(msg);
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * بستن، انجماد و بازگشایی دوره‌های مالی کارهای حساس‌اند: فقط برخط (رد سرور در صف دیده نمی‌شود)
   * و با پرسش تأیید که پیامد هر کار را می‌گوید.
   */
  async closeFiscalPeriod(period: CompanyFiscalPeriod): Promise<void> {
    if (!period.id || !this.requireOnline('بستن دورهٔ مالی')) return;
    const ok = await this.confirmAction({
      title: 'بستن قطعی دورهٔ مالی',
      message: `با بستن «${period.title}»، ثبت و ویرایش سند در این دوره متوقف می‌شود تا وقتی که دوباره بازگشایی شود.`,
      type: 'danger',
      confirmText: 'بستن قطعی'
    });
    if (!ok) return;
    this.facade.closeFiscalPeriod(period.id).subscribe({
      next: () => {
        this.toast.success(`دوره مالی «${period.title}» با موفقیت بسته شد.`);
        period.status = 'closed';
        period.status_display = 'بسته شده رسمی';
        this.companyFiscalPeriods = [...this.companyFiscalPeriods];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.error(err.error?.detail || 'خطا در بستن دوره مالی');
      }
    });
  }

  async freezeFiscalPeriod(period: CompanyFiscalPeriod): Promise<void> {
    if (!period.id || !this.requireOnline('انجماد دورهٔ مالی')) return;
    const ok = await this.confirmAction({
      title: 'انجماد دورهٔ مالی',
      message: `با انجماد «${period.title}»، ثبت سند تازه در این دوره تا بازگشایی متوقف می‌شود.`,
      type: 'warning',
      confirmText: 'انجماد دوره'
    });
    if (!ok) return;
    this.facade.freezeFiscalPeriod(period.id).subscribe({
      next: () => {
        this.toast.success(`دوره مالی «${period.title}» منجمد شد.`);
        period.status = 'frozen';
        period.status_display = 'منجمد شده';
        this.companyFiscalPeriods = [...this.companyFiscalPeriods];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.error(err.error?.detail || 'خطا در انجماد دوره مالی');
      }
    });
  }

  async reopenFiscalPeriod(period: CompanyFiscalPeriod): Promise<void> {
    if (!period.id || !this.requireOnline('بازگشایی دورهٔ مالی')) return;
    const ok = await this.confirmAction({
      title: 'بازگشایی دورهٔ مالی',
      message: `با بازگشایی «${period.title}»، ثبت و ویرایش سند در این دوره دوباره ممکن می‌شود.`,
      type: 'warning',
      confirmText: 'بازگشایی دوره'
    });
    if (!ok) return;
    this.facade.reopenFiscalPeriod(period.id).subscribe({
      next: () => {
        this.toast.success(`دوره مالی «${period.title}» مجدداً بازگشایی شد.`);
        period.status = 'open';
        period.status_display = 'جاری و باز';
        this.companyFiscalPeriods = [...this.companyFiscalPeriods];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.error(err.error?.detail || 'خطا در بازگشایی دوره مالی');
      }
    });
  }

  getFiscalPeriodStatusBadge(status?: string): string {
    switch (status) {
      case 'open':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'frozen':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'closed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }

  getFiscalPeriodStatusLabel(status?: string): string {
    switch (status) {
      case 'open':
        return 'جاری و باز';
      case 'frozen':
        return 'منجمد شده';
      case 'closed':
        return 'بسته شده رسمی';
      default:
        return status || '—';
    }
  }

  private getEmptyFiscalPeriodData() {
    return {
      fiscal_year: '',
      title: '',
      start_date: '',
      end_date: '',
      notes: ''
    };
  }
}
