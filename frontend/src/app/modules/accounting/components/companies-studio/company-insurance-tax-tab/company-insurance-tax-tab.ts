import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompaniesStudioFacade, CompanyPayrollProfile, PAYROLL_PROFILE_FIELDS, PayrollProfileField } from '../companies-studio.facade';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';
import { normalizeDigits } from '../../../../../core/utils/date-utils';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';

/** شناسهٔ تب در استودیوی شرکت (`?tab=fiscal_insurance`)؛ همان `studio` حوزهٔ `insurance_tax` در سرور */
export const INSURANCE_TAX_TAB_ID = 'fiscal_insurance';
/** حوزهٔ اطلاعات شرکت که خواندن و نوشتن این تب را باز می‌کند */
export const INSURANCE_TAX_SECTION = 'insurance_tax';

type ProfileForm = Record<PayrollProfileField, string>;

/** فیلدهایی که فقط رقم می‌گیرند (رقم فارسی و عربی هنگام تایپ لاتین می‌شود) */
const DIGIT_FIELDS: PayrollProfileField[] = ['workshop_code', 'social_security_branch_code', 'contract_row', 'tax_economic_code'];

/**
 * تب «بیمه و مالیات» استودیوی شرکت (مشارکت ماژول حسابداری، ت۵ طرح ۲.۱): پروندهٔ کارگاه بیمه و سامانهٔ مودیان
 * برای دیسکت حقوق، از `/api/personnel/companies/{id}/payroll-profile/`. پیش از نخستین ذخیره همهٔ فیلدها خالی‌اند.
 * فقط با CompanyStudioContextService با هستهٔ استودیو حرف می‌زند.
 */
@Component({
  selector: 'app-company-insurance-tax-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent, LoadingSkeletonComponent],
  providers: [CompaniesStudioFacade],
  templateUrl: './company-insurance-tax-tab.html'
})
export class CompanyInsuranceTaxTabComponent implements OnInit, OnChanges, OnDestroy {
  /** شناسهٔ شرکت ذخیره‌شده؛ برای شرکت تازه null */
  @Input() companyId: number | null = null;

  private facade = inject(CompaniesStudioFacade);
  private studioContext = inject(CompanyStudioContextService);
  private ws = inject(WebSocketService, { optional: true });
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private network = NetworkStatusService.getInstance();
  private destroy$ = new Subject<void>();
  private readonly unregisterDirty: () => void;

  form: ProfileForm = CompanyInsuranceTaxTabComponent.emptyForm();
  /** آخرین دادهٔ سرور (برای تشخیص تغییر و بدنهٔ PATCH فقط با فیلدهای تغییرکرده) */
  private saved: ProfileForm = CompanyInsuranceTaxTabComponent.emptyForm();
  errors: Partial<Record<PayrollProfileField, string>> = {};
  isLoading = false;
  loadError = false;
  /** سرور خواندن این حوزه را رد کرده (۴۰۳)؛ تلاش دوباره بی‌فایده است */
  loadForbidden = false;
  isSaving = false;
  updatedAt: string | null = null;
  /** تغییر ذخیره‌شده هنوز در صف آفلاین است */
  pendingOffline = false;

  get isOnline(): boolean {
    return this.network.isOnline;
  }

  /** حالت محدود استودیو: ویرایش فقط با «نوشتن» حوزهٔ بیمه و مالیات (سرور هم می‌سنجد) */
  get canWrite(): boolean {
    return this.studioContext.canWrite(INSURANCE_TAX_SECTION);
  }

  get isDirty(): boolean {
    return PAYROLL_PROFILE_FIELDS.some(k => this.clean(k, this.form[k]) !== this.clean(k, this.saved[k]));
  }

  constructor() {
    this.unregisterDirty = this.studioContext.registerDirty(INSURANCE_TAX_TAB_ID, () => this.isDirty);
  }

  ngOnInit(): void {
    // تغییر پرونده در تب یا دستگاه دیگر؛ فرم نیمه‌کاره بازنویسی نمی‌شود
    this.ws?.notifications$.pipe(takeUntil(this.destroy$)).subscribe(msg => {
      if (msg?.type_str !== 'org_structure_updated' || msg.entity_type !== 'company_payroll_profile') return;
      if (msg.client_tab_id && msg.client_tab_id === this.ws?.tabId) return;
      if (!this.companyId || Number(msg.company_id) !== Number(this.companyId) || this.isDirty) return;
      this.load();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      this.applyProfile(null);
      if (this.companyId) this.load();
    }
  }

  ngOnDestroy(): void {
    this.unregisterDirty();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private static emptyForm(): ProfileForm {
    return Object.fromEntries(PAYROLL_PROFILE_FIELDS.map(k => [k, ''])) as ProfileForm;
  }

  private clean(field: PayrollProfileField, value: string | null | undefined): string {
    const v = normalizeDigits(value ?? '').trim();
    return field === 'tax_memory_id' ? v.toUpperCase() : v;
  }

  private applyProfile(profile: CompanyPayrollProfile | null): void {
    const next = CompanyInsuranceTaxTabComponent.emptyForm();
    for (const k of PAYROLL_PROFILE_FIELDS) next[k] = profile?.[k] ?? '';
    this.form = { ...next };
    this.saved = next;
    this.errors = {};
    this.updatedAt = profile?.updated_at ?? null;
    this.pendingOffline = false;
  }

  load(): void {
    const companyId = this.companyId;
    if (!companyId) return;
    this.isLoading = true;
    this.loadError = false;
    this.loadForbidden = false;
    this.cdr.markForCheck();
    this.facade.getPayrollProfile(companyId).subscribe({
      next: profile => {
        // پاسخ دیررسِ شرکت پیشین در فرم شرکت دیگر نمی‌نشیند
        if (companyId !== this.companyId) return;
        this.applyProfile(profile);
        this.isLoading = false;
        this.studioContext.reportError(INSURANCE_TAX_TAB_ID, false);
        this.cdr.markForCheck();
      },
      error: err => {
        if (companyId !== this.companyId) return;
        this.isLoading = false;
        this.loadError = true;
        this.loadForbidden = err?.status === 403;
        this.studioContext.reportError(INSURANCE_TAX_TAB_ID);
        if (!isServerUnreachable(err?.status) && err?.status !== 403) {
          this.toast.error(err?.error?.detail || 'خطا در دریافت اطلاعات بیمه و مالیات');
        }
        this.cdr.markForCheck();
      }
    });
  }

  onFieldInput(field: PayrollProfileField, value: string): void {
    const v = value ?? '';
    this.form[field] = DIGIT_FIELDS.includes(field)
      ? normalizeDigits(v)
      : field === 'tax_memory_id' ? normalizeDigits(v).toUpperCase() : v;
    if (this.errors[field]) {
      const errors = { ...this.errors };
      delete errors[field];
      this.errors = errors;
    }
  }

  /** همان قاعده‌های فرم پیشین هسته؛ سرور هم می‌سنجد */
  validate(): boolean {
    const errors: Partial<Record<PayrollProfileField, string>> = {};
    const exact: [PayrollProfileField, number, string][] = [
      ['workshop_code', 10, 'کد کارگاه بیمه باید ۱۰ رقم باشد.'],
      ['tax_economic_code', 16, 'کد اقتصادی جدید باید ۱۶ رقم باشد.'],
    ];
    for (const [field, len, msg] of exact) {
      const v = this.clean(field, this.form[field]);
      if (v && !new RegExp(`^\\d{${len}}$`).test(v)) errors[field] = msg;
    }
    for (const field of ['social_security_branch_code', 'contract_row'] as const) {
      const v = this.clean(field, this.form[field]);
      if (v && !/^\d+$/.test(v)) errors[field] = 'فقط رقم وارد کنید.';
    }
    const memoryId = this.clean('tax_memory_id', this.form.tax_memory_id);
    if (memoryId && !/^[A-Z0-9]{6}$/.test(memoryId)) {
      errors['tax_memory_id'] = 'شناسهٔ حافظهٔ مالیاتی باید ۶ حرف یا رقم لاتین باشد.';
    }
    this.errors = errors;
    return Object.keys(errors).length === 0;
  }

  save(): void {
    const companyId = this.companyId;
    if (!companyId || !this.canWrite || this.isSaving) return;
    if (!this.validate()) {
      this.toast.error('برخی فیلدها خطا دارند؛ موارد مشخص‌شده را اصلاح کنید.');
      this.cdr.markForCheck();
      // فوکوس به نخستین فیلد نامعتبر پس از رندر پیام‌ها
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const changed = PAYROLL_PROFILE_FIELDS.filter(k => this.clean(k, this.form[k]) !== this.clean(k, this.saved[k]));
    if (changed.length === 0) {
      this.toast.info('تغییری برای ذخیره وجود ندارد.');
      return;
    }
    const payload: Partial<CompanyPayrollProfile> = Object.fromEntries(
      changed.map(k => [k, this.clean(k, this.form[k]) || null])
    );
    this.isSaving = true;
    this.facade.updatePayrollProfile(companyId, payload).subscribe({
      next: res => {
        this.isSaving = false;
        if (companyId !== this.companyId) return;
        if (res?._offlinePending) {
          // در صف آفلاین: فرم همان مقدار کاربر را نگه می‌دارد و پس از اتصال فرستاده می‌شود
          const kept = { ...this.form };
          this.saved = kept;
          this.pendingOffline = true;
          this.toast.info('اتصال برقرار نیست؛ تغییر در صف ارسال ماند و پس از اتصال فرستاده می‌شود.');
        } else {
          this.applyProfile(res);
          this.toast.success('اطلاعات بیمه و مالیات ذخیره شد.');
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.isSaving = false;
        const body = err?.error;
        if (body && typeof body === 'object') {
          const fieldErrors: Partial<Record<PayrollProfileField, string>> = {};
          for (const k of PAYROLL_PROFILE_FIELDS) {
            const v = body[k];
            if (v) fieldErrors[k] = Array.isArray(v) ? v.join('، ') : String(v);
          }
          this.errors = { ...this.errors, ...fieldErrors };
        }
        this.toast.error(isServerUnreachable(err?.status)
          ? 'ذخیره انجام نشد: سرور در دسترس نیست.'
          : (typeof body?.detail === 'string' ? body.detail : 'خطا در ذخیرهٔ اطلاعات بیمه و مالیات'));
        this.cdr.markForCheck();
      }
    });
  }

  /** بازگرداندن فرم به آخرین دادهٔ سرور */
  reset(): void {
    this.form = { ...this.saved };
    this.errors = {};
    this.cdr.markForCheck();
  }
}
